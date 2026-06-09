/**
 * LDAP Provisioning Tests
 *
 * Tests for JIT user provisioning from LDAP.
 *
 * Related: Epic #20 (LDAP/AD Integration)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LDAPProviderPublic } from '../../../../storage/models/ldap-providers.js';
import type { LDAPUserProfile } from '../provisioning.js';

// Mock dependencies
vi.mock('../../../../storage/models/users.js', () => ({
  usersModel: {
    findById: vi.fn(),
    findByEmail: vi.fn(),
  },
}));

vi.mock('../../../../storage/database.js', () => ({
  getDatabase: vi.fn(() => ({
    prepare: vi.fn(() => ({
      get: vi.fn(),
      run: vi.fn(),
    })),
  })),
}));

vi.mock('bcrypt', () => ({
  default: {
    hash: vi.fn(() => Promise.resolve('hashed-password')),
  },
}));

describe('LDAP Provisioning', () => {
  let mockProvider: LDAPProviderPublic;
  let mockProfile: LDAPUserProfile;

  beforeEach(() => {
    vi.clearAllMocks();

    mockProvider = {
      id: 'test-id',
      name: 'test-ldap',
      url: 'ldap://localhost:389',
      bind_dn: null,
      bind_password: null,
      base_dn: 'ou=users,dc=example,dc=com',
      search_filter: '(uid={{username}})',
      attribute_mapping: {
        username: 'uid',
        email: 'mail',
        fullName: 'cn',
        groups: 'memberOf',
      },
      group_mapping: {
        'CN=Admins,OU=Groups,DC=example,DC=com': 'admin',
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

    mockProfile = {
      provider: 'test-ldap',
      dn: 'uid=jdoe,ou=users,dc=example,dc=com',
      attributes: {
        username: 'jdoe',
        email: 'jdoe@example.com',
        fullName: 'John Doe',
        groups: ['CN=Users,OU=Groups,DC=example,DC=com'],
      },
    };
  });

  describe('provisionLDAPUser', () => {
    it('should create new user if not found', async () => {
      const { usersModel } = await import('../../../../storage/models/users.js');
      const { getDatabase } = await import('../../../../storage/database.js');
      const { provisionLDAPUser } = await import('../provisioning.js');

      // Mock user not found
      (getDatabase as any)().prepare().get.mockReturnValue(undefined);
      (usersModel.findByEmail as any).mockReturnValue(null);
      (usersModel.findById as any).mockReturnValue({
        id: 'new-user-id',
        username: 'jdoe',
        email: 'jdoe@example.com',
        role: 'user',
        status: 'active',
      });

      const user = await provisionLDAPUser(mockProfile, mockProvider);

      expect(user).toBeDefined();
      expect(user.username).toBe('jdoe');
      expect(user.role).toBe('user');

      // Should have called insert
      expect((getDatabase as any)().prepare().run).toHaveBeenCalled();
    });

    it('should link existing user by email', async () => {
      const { usersModel } = await import('../../../../storage/models/users.js');
      const { getDatabase } = await import('../../../../storage/database.js');
      const { provisionLDAPUser } = await import('../provisioning.js');

      // Mock user not found by DN but found by email
      (getDatabase as any)().prepare().get.mockReturnValue(undefined);
      (usersModel.findByEmail as any).mockReturnValue({
        id: 'existing-user-id',
        username: 'jdoe',
        email: 'jdoe@example.com',
        role: 'user',
      });
      (usersModel.findById as any).mockReturnValue({
        id: 'existing-user-id',
        username: 'jdoe',
        email: 'jdoe@example.com',
        role: 'user',
        status: 'active',
      });

      const user = await provisionLDAPUser(mockProfile, mockProvider);

      expect(user).toBeDefined();
      expect(user.id).toBe('existing-user-id');

      // Should have called update (link LDAP account)
      expect((getDatabase as any)().prepare().run).toHaveBeenCalled();
    });

    it('should update existing user found by DN', async () => {
      const { usersModel } = await import('../../../../storage/models/users.js');
      const { getDatabase } = await import('../../../../storage/database.js');
      const { provisionLDAPUser } = await import('../provisioning.js');

      // Mock user found by DN
      (getDatabase as any)()
        .prepare()
        .get.mockReturnValue({
          id: 'existing-user-id',
          username: 'jdoe',
          ldap_provider: 'test-ldap',
          ldap_dn: mockProfile.dn,
        });

      (usersModel.findById as any).mockReturnValue({
        id: 'existing-user-id',
        username: 'jdoe',
        email: 'jdoe@example.com',
        role: 'user',
        status: 'active',
      });

      const user = await provisionLDAPUser(mockProfile, mockProvider);

      expect(user).toBeDefined();
      expect(user.id).toBe('existing-user-id');

      // Should have called update (refresh role/timestamp)
      expect((getDatabase as any)().prepare().run).toHaveBeenCalled();
    });

    it('should assign admin role based on group mapping', async () => {
      const { usersModel } = await import('../../../../storage/models/users.js');
      const { getDatabase } = await import('../../../../storage/database.js');
      const { provisionLDAPUser } = await import('../provisioning.js');

      // Add admin group to profile
      mockProfile.attributes.groups = [
        'CN=Admins,OU=Groups,DC=example,DC=com',
        'CN=Users,OU=Groups,DC=example,DC=com',
      ];

      // Mock user not found
      (getDatabase as any)().prepare().get.mockReturnValue(undefined);
      (usersModel.findByEmail as any).mockReturnValue(null);
      (usersModel.findById as any).mockReturnValue({
        id: 'new-user-id',
        username: 'jdoe',
        email: 'jdoe@example.com',
        role: 'admin',
        status: 'active',
      });

      const user = await provisionLDAPUser(mockProfile, mockProvider);

      expect(user).toBeDefined();
      expect(user.role).toBe('admin');
    });

    it('should use default role if no groups match', async () => {
      const { usersModel } = await import('../../../../storage/models/users.js');
      const { getDatabase } = await import('../../../../storage/database.js');
      const { provisionLDAPUser } = await import('../provisioning.js');

      // No matching groups
      mockProfile.attributes.groups = ['CN=Unknown,OU=Groups,DC=example,DC=com'];

      // Mock user not found
      (getDatabase as any)().prepare().get.mockReturnValue(undefined);
      (usersModel.findByEmail as any).mockReturnValue(null);
      (usersModel.findById as any).mockReturnValue({
        id: 'new-user-id',
        username: 'jdoe',
        email: 'jdoe@example.com',
        role: 'user',
        status: 'active',
      });

      const user = await provisionLDAPUser(mockProfile, mockProvider);

      expect(user).toBeDefined();
      expect(user.role).toBe('user');
    });

    it('should handle missing email gracefully', async () => {
      const { usersModel } = await import('../../../../storage/models/users.js');
      const { getDatabase } = await import('../../../../storage/database.js');
      const { provisionLDAPUser } = await import('../provisioning.js');

      // Remove email from profile
      delete mockProfile.attributes.email;

      // Mock user not found
      (getDatabase as any)().prepare().get.mockReturnValue(undefined);
      (usersModel.findByEmail as any).mockReturnValue(null);
      (usersModel.findById as any).mockReturnValue({
        id: 'new-user-id',
        username: 'jdoe',
        email: null,
        role: 'user',
        status: 'active',
      });

      const user = await provisionLDAPUser(mockProfile, mockProvider);

      expect(user).toBeDefined();
      expect(user.email).toBeNull();
    });
  });

  describe('logAuthenticationAttempt', () => {
    it('should log successful authentication', async () => {
      const { getDatabase } = await import('../../../../storage/database.js');
      const { logAuthenticationAttempt } = await import('../provisioning.js');

      await logAuthenticationAttempt(
        'test-id',
        'test-ldap',
        'jdoe',
        true,
        'uid=jdoe,ou=users,dc=example,dc=com',
        ['CN=Users,OU=Groups,DC=example,DC=com'],
        undefined,
        '192.168.1.1',
        'Mozilla/5.0'
      );

      expect((getDatabase as any)().prepare().run).toHaveBeenCalled();
    });

    it('should log failed authentication', async () => {
      const { getDatabase } = await import('../../../../storage/database.js');
      const { logAuthenticationAttempt } = await import('../provisioning.js');

      await logAuthenticationAttempt(
        'test-id',
        'test-ldap',
        'jdoe',
        false,
        undefined,
        undefined,
        'Invalid credentials',
        '192.168.1.1',
        'Mozilla/5.0'
      );

      expect((getDatabase as any)().prepare().run).toHaveBeenCalled();
    });

    it('should not throw on logging errors', async () => {
      const { getDatabase } = await import('../../../../storage/database.js');
      const { logAuthenticationAttempt } = await import('../provisioning.js');

      // Mock database error
      (getDatabase as any)()
        .prepare()
        .run.mockImplementation(() => {
          throw new Error('Database error');
        });

      // Should not throw
      await expect(
        logAuthenticationAttempt('test-id', 'test-ldap', 'jdoe', true)
      ).resolves.not.toThrow();
    });
  });
});
