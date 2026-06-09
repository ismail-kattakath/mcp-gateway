/**
 * LDAP Strategy Tests
 *
 * Tests for LDAP authentication strategy.
 *
 * Related: Epic #20 (LDAP/AD Integration)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies
vi.mock('../../../../storage/models/ldap-providers.js', () => ({
  ldapProvidersModel: {
    findByName: vi.fn(),
    list: vi.fn(() => []),
  },
}));

vi.mock('../client.js', () => ({
  LDAPClient: vi.fn(() => ({
    initialize: vi.fn(),
    authenticate: vi.fn(),
    destroy: vi.fn(),
    healthCheck: vi.fn(() => Promise.resolve(true)),
  })),
}));

vi.mock('../provisioning.js', () => ({
  provisionLDAPUser: vi.fn(),
  logAuthenticationAttempt: vi.fn(),
}));

describe('LDAP Strategy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createLDAPStrategy', () => {
    it('should create strategy for valid provider', async () => {
      const { ldapProvidersModel } = await import('../../../../storage/models/ldap-providers.js');
      const { createLDAPStrategy } = await import('../strategy.js');

      (ldapProvidersModel.findByName as any).mockReturnValue({
        id: 'test-id',
        name: 'test-ldap',
        enabled: true,
        url: 'ldap://localhost:389',
        base_dn: 'dc=example,dc=com',
      });

      const strategy = createLDAPStrategy('test-ldap');
      expect(strategy).toBeDefined();
      expect(strategy.name).toBe('custom');
    });

    it('should fail if provider not found', async () => {
      const { ldapProvidersModel } = await import('../../../../storage/models/ldap-providers.js');
      const { createLDAPStrategy } = await import('../strategy.js');

      (ldapProvidersModel.findByName as any).mockReturnValue(null);

      const strategy = createLDAPStrategy('nonexistent');
      expect(strategy).toBeDefined();

      // Strategy should fail when called
      const req = {
        body: { username: 'test', password: 'test' },
        ip: '127.0.0.1',
        get: () => 'test-agent',
      };

      let errorCaught = false;
      await strategy.authenticate(req as any, {
        error: (err: any) => {
          errorCaught = true;
          expect(err.message).toContain('not found');
        },
        success: () => {},
        fail: () => {},
        redirect: () => {},
        pass: () => {},
      } as any);

      expect(errorCaught).toBe(true);
    });

    it('should fail if provider disabled', async () => {
      const { ldapProvidersModel } = await import('../../../../storage/models/ldap-providers.js');
      const { createLDAPStrategy } = await import('../strategy.js');

      (ldapProvidersModel.findByName as any).mockReturnValue({
        id: 'test-id',
        name: 'test-ldap',
        enabled: false,
        url: 'ldap://localhost:389',
        base_dn: 'dc=example,dc=com',
      });

      const strategy = createLDAPStrategy('test-ldap');
      expect(strategy).toBeDefined();

      const req = {
        body: { username: 'test', password: 'test' },
        ip: '127.0.0.1',
        get: () => 'test-agent',
      };

      let errorCaught = false;
      await strategy.authenticate(req as any, {
        error: (err: any) => {
          errorCaught = true;
          expect(err.message).toContain('disabled');
        },
        success: () => {},
        fail: () => {},
        redirect: () => {},
        pass: () => {},
      } as any);

      expect(errorCaught).toBe(true);
    });
  });

  describe('registerLDAPStrategies', () => {
    it('should register all enabled providers', async () => {
      const { ldapProvidersModel } = await import('../../../../storage/models/ldap-providers.js');
      const { registerLDAPStrategies } = await import('../strategy.js');

      (ldapProvidersModel.list as any).mockReturnValue([
        { id: '1', name: 'ldap1', enabled: true },
        { id: '2', name: 'ldap2', enabled: true },
      ]);

      const passport = {
        use: vi.fn(),
      };

      registerLDAPStrategies(passport);

      expect(passport.use).toHaveBeenCalledTimes(2);
      expect(passport.use).toHaveBeenCalledWith('ldap-ldap1', expect.anything());
      expect(passport.use).toHaveBeenCalledWith('ldap-ldap2', expect.anything());
    });

    it('should handle empty provider list', async () => {
      const { ldapProvidersModel } = await import('../../../../storage/models/ldap-providers.js');
      const { registerLDAPStrategies } = await import('../strategy.js');

      (ldapProvidersModel.list as any).mockReturnValue([]);

      const passport = {
        use: vi.fn(),
      };

      registerLDAPStrategies(passport);

      expect(passport.use).not.toHaveBeenCalled();
    });

    it('should handle registration errors', async () => {
      const { ldapProvidersModel } = await import('../../../../storage/models/ldap-providers.js');
      const { registerLDAPStrategies } = await import('../strategy.js');

      (ldapProvidersModel.list as any).mockImplementation(() => {
        throw new Error('Database error');
      });

      const passport = {
        use: vi.fn(),
      };

      // Should not throw
      expect(() => registerLDAPStrategies(passport)).not.toThrow();
    });
  });

  describe('destroyLDAPClient', () => {
    it('should destroy cached client', async () => {
      const { destroyLDAPClient } = await import('../strategy.js');

      // Should not throw for non-existent client
      await expect(destroyLDAPClient('nonexistent')).resolves.not.toThrow();
    });
  });

  describe('healthCheckLDAPProvider', () => {
    it('should return true for healthy provider', async () => {
      const { ldapProvidersModel } = await import('../../../../storage/models/ldap-providers.js');
      const { healthCheckLDAPProvider } = await import('../strategy.js');

      (ldapProvidersModel.findByName as any).mockReturnValue({
        id: 'test-id',
        name: 'test-ldap',
        enabled: true,
        url: 'ldap://localhost:389',
        base_dn: 'dc=example,dc=com',
        attribute_mapping: {},
        group_mapping: { default: 'user' },
        pool_size: 5,
        timeout: 10000,
        tls_enabled: false,
        tls_reject_unauthorized: true,
      });

      const result = await healthCheckLDAPProvider('test-ldap');
      expect(result).toBe(true);
    });

    it('should return false for disabled provider', async () => {
      const { ldapProvidersModel } = await import('../../../../storage/models/ldap-providers.js');
      const { healthCheckLDAPProvider } = await import('../strategy.js');

      (ldapProvidersModel.findByName as any).mockReturnValue({
        id: 'test-id',
        name: 'test-ldap',
        enabled: false,
      });

      const result = await healthCheckLDAPProvider('test-ldap');
      expect(result).toBe(false);
    });

    it('should return false for nonexistent provider', async () => {
      const { ldapProvidersModel } = await import('../../../../storage/models/ldap-providers.js');
      const { healthCheckLDAPProvider } = await import('../strategy.js');

      (ldapProvidersModel.findByName as any).mockReturnValue(null);

      const result = await healthCheckLDAPProvider('nonexistent');
      expect(result).toBe(false);
    });
  });
});
