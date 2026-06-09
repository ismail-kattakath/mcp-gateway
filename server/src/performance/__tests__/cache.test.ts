/**
 * Tests for response caching
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ResponseCache } from '../cache.js';
import type { PerformanceConfig } from '../config.js';

describe('ResponseCache', () => {
  let cache: ResponseCache;
  let config: PerformanceConfig['cache'];

  beforeEach(() => {
    config = {
      enabled: true,
      maxSize: 100,
      ttl: 5000,
      updateAgeOnGet: true,
    };
    cache = new ResponseCache(config);
  });

  describe('generateKey', () => {
    it('should generate consistent keys for same inputs', () => {
      const key1 = ResponseCache.generateKey('server1', 'tool1', { arg: 'value' });
      const key2 = ResponseCache.generateKey('server1', 'tool1', { arg: 'value' });
      expect(key1).toBe(key2);
    });

    it('should generate different keys for different servers', () => {
      const key1 = ResponseCache.generateKey('server1', 'tool1', { arg: 'value' });
      const key2 = ResponseCache.generateKey('server2', 'tool1', { arg: 'value' });
      expect(key1).not.toBe(key2);
    });

    it('should generate different keys for different tools', () => {
      const key1 = ResponseCache.generateKey('server1', 'tool1', { arg: 'value' });
      const key2 = ResponseCache.generateKey('server1', 'tool2', { arg: 'value' });
      expect(key1).not.toBe(key2);
    });

    it('should generate different keys for different arguments', () => {
      const key1 = ResponseCache.generateKey('server1', 'tool1', { arg: 'value1' });
      const key2 = ResponseCache.generateKey('server1', 'tool1', { arg: 'value2' });
      expect(key1).not.toBe(key2);
    });

    it('should generate same key regardless of argument order', () => {
      const key1 = ResponseCache.generateKey('server1', 'tool1', { a: '1', b: '2' });
      const key2 = ResponseCache.generateKey('server1', 'tool1', { b: '2', a: '1' });
      expect(key1).toBe(key2);
    });
  });

  describe('hashArgs', () => {
    it('should hash simple arguments', () => {
      const hash = ResponseCache.hashArgs({ key: 'value' });
      expect(hash).toBeTypeOf('string');
      expect(hash.length).toBe(16);
    });

    it('should hash complex arguments', () => {
      const hash = ResponseCache.hashArgs({
        string: 'value',
        number: 42,
        boolean: true,
        nested: { key: 'value' },
        array: [1, 2, 3],
      });
      expect(hash).toBeTypeOf('string');
      expect(hash.length).toBe(16);
    });

    it('should produce consistent hashes', () => {
      const args = { key: 'value', num: 123 };
      const hash1 = ResponseCache.hashArgs(args);
      const hash2 = ResponseCache.hashArgs(args);
      expect(hash1).toBe(hash2);
    });
  });

  describe('set and get', () => {
    it('should cache and retrieve values', () => {
      const value = { result: 'test' };
      cache.set('server1', 'tool1', {}, value);

      const retrieved = cache.get('server1', 'tool1', {});
      expect(retrieved).toEqual(value);
    });

    it('should return undefined for cache miss', () => {
      const retrieved = cache.get('server1', 'tool1', {});
      expect(retrieved).toBeUndefined();
    });

    it('should cache different values for different keys', () => {
      cache.set('server1', 'tool1', { arg: '1' }, { result: '1' });
      cache.set('server1', 'tool1', { arg: '2' }, { result: '2' });

      expect(cache.get('server1', 'tool1', { arg: '1' })).toEqual({ result: '1' });
      expect(cache.get('server1', 'tool1', { arg: '2' })).toEqual({ result: '2' });
    });

    it('should not cache when disabled', () => {
      const disabledCache = new ResponseCache({
        enabled: false,
        maxSize: 100,
        ttl: 5000,
        updateAgeOnGet: true,
      });

      disabledCache.set('server1', 'tool1', {}, { result: 'test' });
      const retrieved = disabledCache.get('server1', 'tool1', {});
      expect(retrieved).toBeUndefined();
    });
  });

  describe('invalidateServer', () => {
    beforeEach(() => {
      cache.set('server1', 'tool1', {}, { result: '1' });
      cache.set('server1', 'tool2', {}, { result: '2' });
      cache.set('server2', 'tool1', {}, { result: '3' });
    });

    it('should invalidate all entries for a server', () => {
      const count = cache.invalidateServer('server1');
      expect(count).toBe(2);

      expect(cache.get('server1', 'tool1', {})).toBeUndefined();
      expect(cache.get('server1', 'tool2', {})).toBeUndefined();
      expect(cache.get('server2', 'tool1', {})).toEqual({ result: '3' });
    });

    it('should return 0 when server has no cached entries', () => {
      const count = cache.invalidateServer('nonexistent');
      expect(count).toBe(0);
    });
  });

  describe('invalidateTool', () => {
    beforeEach(() => {
      cache.set('server1', 'tool1', {}, { result: '1' });
      cache.set('server1', 'tool2', {}, { result: '2' });
      cache.set('server2', 'tool1', {}, { result: '3' });
    });

    it('should invalidate specific tool entries', () => {
      const count = cache.invalidateTool('server1', 'tool1');
      expect(count).toBe(1);

      expect(cache.get('server1', 'tool1', {})).toBeUndefined();
      expect(cache.get('server1', 'tool2', {})).toEqual({ result: '2' });
      expect(cache.get('server2', 'tool1', {})).toEqual({ result: '3' });
    });

    it('should return 0 when tool has no cached entries', () => {
      const count = cache.invalidateTool('server1', 'nonexistent');
      expect(count).toBe(0);
    });
  });

  describe('clear', () => {
    it('should clear all cache entries', () => {
      cache.set('server1', 'tool1', {}, { result: '1' });
      cache.set('server2', 'tool2', {}, { result: '2' });

      const count = cache.clear();
      expect(count).toBe(2);

      expect(cache.get('server1', 'tool1', {})).toBeUndefined();
      expect(cache.get('server2', 'tool2', {})).toBeUndefined();
    });

    it('should return 0 when cache is empty', () => {
      const count = cache.clear();
      expect(count).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should track cache hits and misses', () => {
      cache.set('server1', 'tool1', {}, { result: 'test' });

      cache.get('server1', 'tool1', {}); // hit
      cache.get('server1', 'tool2', {}); // miss

      const stats = cache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBe(50);
    });

    it('should track cache size', () => {
      cache.set('server1', 'tool1', {}, { result: '1' });
      cache.set('server1', 'tool2', {}, { result: '2' });

      const stats = cache.getStats();
      expect(stats.size).toBe(2);
      expect(stats.maxSize).toBe(100);
    });

    it('should track sets and deletes', () => {
      cache.set('server1', 'tool1', {}, { result: '1' });
      cache.set('server1', 'tool2', {}, { result: '2' });
      cache.invalidateServer('server1');

      const stats = cache.getStats();
      expect(stats.sets).toBe(2);
      expect(stats.deletes).toBe(2);
    });
  });

  describe('enable and disable', () => {
    it('should enable cache', () => {
      const disabledCache = new ResponseCache({
        enabled: false,
        maxSize: 100,
        ttl: 5000,
        updateAgeOnGet: true,
      });

      expect(disabledCache.isEnabled()).toBe(false);
      disabledCache.enable();
      expect(disabledCache.isEnabled()).toBe(true);
    });

    it('should disable cache and clear entries', () => {
      cache.set('server1', 'tool1', {}, { result: 'test' });
      cache.disable();

      expect(cache.isEnabled()).toBe(false);
      expect(cache.getStats().size).toBe(0);
    });
  });

  describe('resetStats', () => {
    it('should reset cache statistics', () => {
      cache.set('server1', 'tool1', {}, { result: 'test' });
      cache.get('server1', 'tool1', {});
      cache.get('server1', 'tool2', {});

      cache.resetStats();

      const stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.sets).toBe(0);
      expect(stats.deletes).toBe(0);
    });
  });
});
