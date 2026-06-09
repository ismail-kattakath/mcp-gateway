/**
 * LDAP Client Tests
 *
 * Tests for LDAP client connection pooling and authentication.
 *
 * Related: Epic #20 (LDAP/AD Integration)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { LDAPProviderPublic } from '../../../../storage/models/ldap-providers.js';

// Mock ldapjs
vi.mock('ldapjs', () => ({
  default: {
    createClient: vi.fn(() => ({
      on: vi.fn(),
      bind: vi.fn(),
      search: vi.fn(),
      unbind: vi.fn(),
      destroy: vi.fn(),
    })),
  },
}));

describe('LDAP Client', () => {
  let mockProvider: LDAPProviderPublic;

  beforeEach(() => {
    mockProvider = {
      id: 'test-id',
      name: 'test-ldap',
      url: 'ldap://localhost:389',
      bind_dn: 'cn=admin,dc=example,dc=com',
      bind_password: 'secret',
      base_dn: 'ou=users,dc=example,dc=com',
      search_filter: '(uid={{username}})',
      attribute_mapping: {
        username: 'uid',
        email: 'mail',
        fullName: 'cn',
      },
      group_mapping: {
        default: 'user',
      },
      tls_enabled: false,
      tls_reject_unauthorized: true,
      pool_size: 5,
      timeout: 10000,
      enabled: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('LDAPConnectionPool', () => {
    it('should initialize connection pool with correct pool size', async () => {
      const { LDAPConnectionPool } = await import('../client.js');
      const ldap = await import('ldapjs');

      const pool = new LDAPConnectionPool(mockProvider);
      await pool.initialize();

      // Should create pool_size connections
      expect(ldap.default.createClient).toHaveBeenCalledTimes(mockProvider.pool_size);

      await pool.destroy();
    });

    it('should create clients with correct configuration', async () => {
      const { LDAPConnectionPool } = await import('../client.js');
      const ldap = await import('ldapjs');

      const pool = new LDAPConnectionPool(mockProvider);
      await pool.initialize();

      expect(ldap.default.createClient).toHaveBeenCalledWith({
        url: mockProvider.url,
        timeout: mockProvider.timeout,
        connectTimeout: mockProvider.timeout,
        tlsOptions: undefined, // TLS disabled
      });

      await pool.destroy();
    });

    it('should create clients with TLS options when enabled', async () => {
      mockProvider.tls_enabled = true;
      mockProvider.tls_reject_unauthorized = true;

      const { LDAPConnectionPool } = await import('../client.js');
      const ldap = await import('ldapjs');

      const pool = new LDAPConnectionPool(mockProvider);
      await pool.initialize();

      expect(ldap.default.createClient).toHaveBeenCalledWith({
        url: mockProvider.url,
        timeout: mockProvider.timeout,
        connectTimeout: mockProvider.timeout,
        tlsOptions: {
          rejectUnauthorized: true,
        },
      });

      await pool.destroy();
    });

    it('should get connection from pool', async () => {
      const { LDAPConnectionPool } = await import('../client.js');

      const pool = new LDAPConnectionPool(mockProvider);
      await pool.initialize();

      const client = await pool.getConnection();
      expect(client).toBeDefined();

      pool.releaseConnection(client);
      await pool.destroy();
    });

    it('should release connection back to pool', async () => {
      const { LDAPConnectionPool } = await import('../client.js');

      const pool = new LDAPConnectionPool(mockProvider);
      await pool.initialize();

      const client = await pool.getConnection();
      pool.releaseConnection(client);

      // Should be able to get connection again
      const client2 = await pool.getConnection();
      expect(client2).toBe(client);

      pool.releaseConnection(client2);
      await pool.destroy();
    });

    it('should handle connection pool exhaustion', async () => {
      mockProvider.pool_size = 2;

      const { LDAPConnectionPool } = await import('../client.js');

      const pool = new LDAPConnectionPool(mockProvider);
      await pool.initialize();

      // Get all connections
      const client1 = await pool.getConnection();
      const client2 = await pool.getConnection();

      // Pool is exhausted - this should wait
      const getPromise = pool.getConnection();

      // Release one connection
      pool.releaseConnection(client1);

      // Should now get connection
      const client3 = await getPromise;
      expect(client3).toBe(client1);

      pool.releaseConnection(client2);
      pool.releaseConnection(client3);
      await pool.destroy();
    });
  });

  describe('Username sanitization', () => {
    it('should sanitize LDAP special characters in username', () => {
      const username = 'user*()\\';
      const sanitized = username.replace(/[*()\\]/g, (char) => {
        return '\\' + char.charCodeAt(0).toString(16).padStart(2, '0');
      });

      // Should escape special characters
      expect(sanitized).not.toContain('*');
      expect(sanitized).not.toContain('(');
      expect(sanitized).not.toContain(')');
      expect(sanitized).not.toContain('\\');
    });

    it('should not modify safe usernames', () => {
      const username = 'johndoe';
      const sanitized = username.replace(/[*()\\]/g, (char) => {
        return '\\' + char.charCodeAt(0).toString(16).padStart(2, '0');
      });

      expect(sanitized).toBe(username);
    });
  });
});
