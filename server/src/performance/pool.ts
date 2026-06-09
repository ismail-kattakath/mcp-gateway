/**
 * Connection Pooling
 *
 * HTTP/HTTPS agent with keepAlive for connection reuse
 * Reduces connection overhead for remote MCP servers
 */

import http from 'http';
import https from 'https';
import logger from '../logging/logger.js';
import type { PerformanceConfig } from './config.js';

export interface PoolStats {
  httpSockets: number;
  httpFreeSockets: number;
  httpRequests: number;
  httpsPendingRequests: number;
  httpsRequests: number;
  httpsFreeSockets: number;
}

/**
 * Connection pool manager
 */
export class ConnectionPool {
  private httpAgent: http.Agent | null = null;
  private httpsAgent: https.Agent | null = null;
  private config: PerformanceConfig['pool'];
  private stats: {
    httpRequests: number;
    httpsRequests: number;
  };

  constructor(config: PerformanceConfig['pool']) {
    this.config = config;
    this.stats = {
      httpRequests: 0,
      httpsRequests: 0,
    };

    if (config.keepAlive) {
      this.initialize();
      logger.info('Connection pool initialized', {
        maxSockets: config.maxSockets,
        maxFreeSockets: config.maxFreeSockets,
        timeout: config.timeout,
      });
    } else {
      logger.info('Connection pooling disabled');
    }
  }

  /**
   * Initialize HTTP and HTTPS agents
   */
  private initialize(): void {
    this.httpAgent = new http.Agent({
      keepAlive: true,
      keepAliveMsecs: 1000,
      maxSockets: this.config.maxSockets,
      maxFreeSockets: this.config.maxFreeSockets,
      timeout: this.config.timeout,
      scheduling: 'fifo',
    });

    this.httpsAgent = new https.Agent({
      keepAlive: true,
      keepAliveMsecs: 1000,
      maxSockets: this.config.maxSockets,
      maxFreeSockets: this.config.maxFreeSockets,
      timeout: this.config.timeout,
      scheduling: 'fifo',
      rejectUnauthorized: true,
    });
  }

  /**
   * Get HTTP agent
   */
  getHttpAgent(): http.Agent | undefined {
    if (this.httpAgent) {
      this.stats.httpRequests++;
    }
    return this.httpAgent || undefined;
  }

  /**
   * Get HTTPS agent
   */
  getHttpsAgent(): https.Agent | undefined {
    if (this.httpsAgent) {
      this.stats.httpsRequests++;
    }
    return this.httpsAgent || undefined;
  }

  /**
   * Get agent for URL
   */
  getAgentForUrl(url: string): http.Agent | https.Agent | undefined {
    const isHttps = url.startsWith('https://');
    return isHttps ? this.getHttpsAgent() : this.getHttpAgent();
  }

  /**
   * Get connection pool statistics
   */
  getStats(): PoolStats {
    const httpSockets = this.httpAgent?.sockets
      ? Object.keys(this.httpAgent.sockets).reduce((sum, key) => {
          return sum + (this.httpAgent!.sockets[key]?.length || 0);
        }, 0)
      : 0;

    const httpFreeSockets = this.httpAgent?.freeSockets
      ? Object.keys(this.httpAgent.freeSockets).reduce((sum, key) => {
          return sum + (this.httpAgent!.freeSockets[key]?.length || 0);
        }, 0)
      : 0;

    const httpRequests = this.httpAgent?.requests
      ? Object.keys(this.httpAgent.requests).reduce((sum, key) => {
          return sum + (this.httpAgent!.requests[key]?.length || 0);
        }, 0)
      : 0;

    const httpsPendingRequests = this.httpsAgent?.requests
      ? Object.keys(this.httpsAgent.requests).reduce((sum, key) => {
          return sum + (this.httpsAgent!.requests[key]?.length || 0);
        }, 0)
      : 0;

    const httpsFreeSockets = this.httpsAgent?.freeSockets
      ? Object.keys(this.httpsAgent.freeSockets).reduce((sum, key) => {
          return sum + (this.httpsAgent!.freeSockets[key]?.length || 0);
        }, 0)
      : 0;

    return {
      httpSockets,
      httpFreeSockets,
      httpRequests,
      httpsPendingRequests,
      httpsRequests: this.stats.httpsRequests,
      httpsFreeSockets,
    };
  }

  /**
   * Destroy all connections
   */
  destroy(): void {
    if (this.httpAgent) {
      this.httpAgent.destroy();
      this.httpAgent = null;
    }

    if (this.httpsAgent) {
      this.httpsAgent.destroy();
      this.httpsAgent = null;
    }

    logger.info('Connection pool destroyed');
  }

  /**
   * Check if pooling is enabled
   */
  isEnabled(): boolean {
    return this.config.keepAlive;
  }
}

// Global connection pool instance
let globalPool: ConnectionPool | null = null;

/**
 * Initialize global connection pool
 */
export function initializeConnectionPool(config: PerformanceConfig['pool']): ConnectionPool {
  if (globalPool) {
    globalPool.destroy();
  }

  globalPool = new ConnectionPool(config);
  return globalPool;
}

/**
 * Get global connection pool
 */
export function getConnectionPool(): ConnectionPool | null {
  return globalPool;
}

export default {
  ConnectionPool,
  initializeConnectionPool,
  getConnectionPool,
};
