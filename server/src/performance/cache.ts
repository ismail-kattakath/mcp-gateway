/**
 * Response Caching
 *
 * In-memory LRU cache for tool responses with TTL-based expiration
 * Includes cache key generation and invalidation strategies
 */

import { LRUCache } from 'lru-cache';
import crypto from 'crypto';
import logger from '../logging/logger.js';
import type { PerformanceConfig } from './config.js';

export interface CacheEntry<T = unknown> {
  value: T;
  timestamp: number;
  serverName: string;
  toolName: string;
  argsHash: string;
}

export interface CacheStats {
  size: number;
  maxSize: number;
  hits: number;
  misses: number;
  hitRate: number;
  sets: number;
  deletes: number;
}

/**
 * Response cache with LRU eviction and TTL expiration
 */
export class ResponseCache<T = unknown> {
  private cache: LRUCache<string, CacheEntry<T>>;
  private stats: {
    hits: number;
    misses: number;
    sets: number;
    deletes: number;
  };
  private enabled: boolean;

  constructor(config: PerformanceConfig['cache']) {
    this.enabled = config.enabled;
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
    };

    this.cache = new LRUCache<string, CacheEntry<T>>({
      max: config.maxSize,
      ttl: config.ttl,
      updateAgeOnGet: config.updateAgeOnGet,
      noDisposeOnSet: false,
      dispose: (value, key) => {
        logger.debug('Cache entry evicted', { key, serverName: value.serverName });
      },
    });

    if (this.enabled) {
      logger.info('Response cache initialized', {
        maxSize: config.maxSize,
        ttl: config.ttl,
        updateAgeOnGet: config.updateAgeOnGet,
      });
    } else {
      logger.info('Response cache disabled');
    }
  }

  /**
   * Generate cache key from server, tool, and arguments
   */
  static generateKey(serverName: string, toolName: string, args: Record<string, unknown>): string {
    const argsHash = ResponseCache.hashArgs(args);
    return `${serverName}:${toolName}:${argsHash}`;
  }

  /**
   * Hash arguments for cache key
   */
  static hashArgs(args: Record<string, unknown>): string {
    const sorted = Object.keys(args)
      .sort()
      .reduce(
        (acc, key) => {
          acc[key] = args[key];
          return acc;
        },
        {} as Record<string, unknown>
      );

    const json = JSON.stringify(sorted);
    return crypto.createHash('sha256').update(json).digest('hex').substring(0, 16);
  }

  /**
   * Get cached response
   */
  get(serverName: string, toolName: string, args: Record<string, unknown>): T | undefined {
    if (!this.enabled) {
      return undefined;
    }

    const key = ResponseCache.generateKey(serverName, toolName, args);
    const entry = this.cache.get(key);

    if (entry) {
      this.stats.hits++;
      logger.debug('Cache hit', { key, serverName, toolName, age: Date.now() - entry.timestamp });
      return entry.value;
    }

    this.stats.misses++;
    logger.debug('Cache miss', { key, serverName, toolName });
    return undefined;
  }

  /**
   * Set cached response
   */
  set(serverName: string, toolName: string, args: Record<string, unknown>, value: T): void {
    if (!this.enabled) {
      return;
    }

    const key = ResponseCache.generateKey(serverName, toolName, args);
    const argsHash = ResponseCache.hashArgs(args);

    const entry: CacheEntry<T> = {
      value,
      timestamp: Date.now(),
      serverName,
      toolName,
      argsHash,
    };

    this.cache.set(key, entry);
    this.stats.sets++;

    logger.debug('Cache set', { key, serverName, toolName, size: this.cache.size });
  }

  /**
   * Invalidate cache entries for a specific server
   */
  invalidateServer(serverName: string): number {
    if (!this.enabled) {
      return 0;
    }

    let count = 0;
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (entry.serverName === serverName) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
      count++;
      this.stats.deletes++;
    }

    if (count > 0) {
      logger.info('Cache invalidated for server', { serverName, count });
    }

    return count;
  }

  /**
   * Invalidate cache entries for a specific tool
   */
  invalidateTool(serverName: string, toolName: string): number {
    if (!this.enabled) {
      return 0;
    }

    let count = 0;
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (entry.serverName === serverName && entry.toolName === toolName) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
      count++;
      this.stats.deletes++;
    }

    if (count > 0) {
      logger.info('Cache invalidated for tool', { serverName, toolName, count });
    }

    return count;
  }

  /**
   * Clear all cache entries
   */
  clear(): number {
    if (!this.enabled) {
      return 0;
    }

    const size = this.cache.size;
    this.cache.clear();
    this.stats.deletes += size;

    logger.info('Cache cleared', { count: size });

    return size;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const size = this.enabled ? this.cache.size : 0;
    const maxSize = this.enabled ? this.cache.max : 0;
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? (this.stats.hits / total) * 100 : 0;

    return {
      size,
      maxSize,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: parseFloat(hitRate.toFixed(2)),
      sets: this.stats.sets,
      deletes: this.stats.deletes,
    };
  }

  /**
   * Reset cache statistics
   */
  resetStats(): void {
    this.stats.hits = 0;
    this.stats.misses = 0;
    this.stats.sets = 0;
    this.stats.deletes = 0;
  }

  /**
   * Check if cache is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Enable cache
   */
  enable(): void {
    this.enabled = true;
    logger.info('Response cache enabled');
  }

  /**
   * Disable cache
   */
  disable(): void {
    this.enabled = false;
    this.clear();
    logger.info('Response cache disabled');
  }
}

export default ResponseCache;
