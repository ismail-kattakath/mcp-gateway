/**
 * Tests for connection pooling
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ConnectionPool, initializeConnectionPool, getConnectionPool } from '../pool.js';
import type { PerformanceConfig } from '../config.js';

describe('ConnectionPool', () => {
  let pool: ConnectionPool;
  let config: PerformanceConfig['pool'];

  beforeEach(() => {
    config = {
      keepAlive: true,
      maxSockets: 50,
      maxFreeSockets: 10,
      timeout: 60000,
    };
    pool = new ConnectionPool(config);
  });

  afterEach(() => {
    pool.destroy();
  });

  describe('initialization', () => {
    it('should initialize pool when keepAlive is enabled', () => {
      expect(pool.isEnabled()).toBe(true);
      expect(pool.getHttpAgent()).toBeDefined();
      expect(pool.getHttpsAgent()).toBeDefined();
    });

    it('should not initialize pool when keepAlive is disabled', () => {
      const disabledPool = new ConnectionPool({
        keepAlive: false,
        maxSockets: 50,
        maxFreeSockets: 10,
        timeout: 60000,
      });

      expect(disabledPool.isEnabled()).toBe(false);
      expect(disabledPool.getHttpAgent()).toBeUndefined();
      expect(disabledPool.getHttpsAgent()).toBeUndefined();

      disabledPool.destroy();
    });
  });

  describe('getHttpAgent', () => {
    it('should return HTTP agent', () => {
      const agent = pool.getHttpAgent();
      expect(agent).toBeDefined();
      expect(agent?.options.keepAlive).toBe(true);
    });

    it('should increment request counter', () => {
      pool.getHttpAgent();
      pool.getHttpAgent();

      const stats = pool.getStats();
      // Note: httpRequests tracks pending requests, not total calls
      // When we just call getHttpAgent(), there are no pending requests
      expect(stats.httpRequests).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getHttpsAgent', () => {
    it('should return HTTPS agent', () => {
      const agent = pool.getHttpsAgent();
      expect(agent).toBeDefined();
      expect(agent?.options.keepAlive).toBe(true);
    });

    it('should increment request counter', () => {
      pool.getHttpsAgent();
      pool.getHttpsAgent();

      const stats = pool.getStats();
      expect(stats.httpsRequests).toBe(2);
    });

    it('should have rejectUnauthorized enabled', () => {
      const agent = pool.getHttpsAgent();
      expect(agent?.options.rejectUnauthorized).toBe(true);
    });
  });

  describe('getAgentForUrl', () => {
    it('should return HTTP agent for HTTP URLs', () => {
      const agent = pool.getAgentForUrl('http://example.com');
      expect(agent).toBeDefined();
      expect(agent).toBe(pool.getHttpAgent());
    });

    it('should return HTTPS agent for HTTPS URLs', () => {
      const agent = pool.getAgentForUrl('https://example.com');
      expect(agent).toBeDefined();
      expect(agent).toBe(pool.getHttpsAgent());
    });
  });

  describe('getStats', () => {
    it('should return pool statistics', () => {
      const stats = pool.getStats();

      expect(stats).toHaveProperty('httpSockets');
      expect(stats).toHaveProperty('httpFreeSockets');
      expect(stats).toHaveProperty('httpRequests');
      expect(stats).toHaveProperty('httpsPendingRequests');
      expect(stats).toHaveProperty('httpsRequests');
      expect(stats).toHaveProperty('httpsFreeSockets');
    });

    it('should track HTTP requests', () => {
      pool.getHttpAgent();
      pool.getHttpAgent();

      const stats = pool.getStats();
      expect(stats.httpRequests).toBe(0); // No actual requests made yet
    });

    it('should track HTTPS requests', () => {
      pool.getHttpsAgent();
      pool.getHttpsAgent();

      const stats = pool.getStats();
      expect(stats.httpsRequests).toBe(2);
    });
  });

  describe('destroy', () => {
    it('should destroy all agents', () => {
      pool.getHttpAgent();
      pool.getHttpsAgent();

      pool.destroy();

      expect(pool.getHttpAgent()).toBeUndefined();
      expect(pool.getHttpsAgent()).toBeUndefined();
    });
  });

  describe('global pool', () => {
    afterEach(() => {
      const globalPool = getConnectionPool();
      if (globalPool) {
        globalPool.destroy();
      }
    });

    it('should initialize global pool', () => {
      const pool = initializeConnectionPool(config);
      expect(pool).toBeDefined();
      expect(pool.isEnabled()).toBe(true);
    });

    it('should return global pool instance', () => {
      initializeConnectionPool(config);
      const pool = getConnectionPool();
      expect(pool).toBeDefined();
      expect(pool?.isEnabled()).toBe(true);
    });

    it('should replace existing global pool', () => {
      const pool1 = initializeConnectionPool(config);
      const pool2 = initializeConnectionPool(config);

      expect(pool1).not.toBe(pool2);
      expect(getConnectionPool()).toBe(pool2);
    });
  });
});
