/**
 * CASL Abilities Tests
 *
 * Tests for RBAC permission checking using CASL.
 *
 * Related: Epic #17 (RBAC & Multi-Tenancy)
 */

import { describe, it, expect } from 'vitest';
import { subject } from '@casl/ability';
import { defineAbilitiesFor, checkPermission, getUserPermissions } from '../abilities.js';
import type { UserPublic } from '../../storage/models/users.js';

describe('RBAC Abilities', () => {
  describe('Admin Role', () => {
    const adminUser: UserPublic = {
      id: 'admin-1',
      username: 'admin',
      email: 'admin@example.com',
      role: 'admin',
      tenant: null,
      status: 'active',
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
      last_login_at: null,
    };

    it('should grant manage permission on all resources', () => {
      const ability = defineAbilitiesFor(adminUser);

      expect(ability.can('manage', 'all')).toBe(true);
      expect(ability.can('manage', 'server')).toBe(true);
      expect(ability.can('manage', 'tool')).toBe(true);
      expect(ability.can('manage', 'user')).toBe(true);
      expect(ability.can('manage', 'role')).toBe(true);
      expect(ability.can('manage', 'setting')).toBe(true);
      expect(ability.can('manage', 'apikey')).toBe(true);
      expect(ability.can('manage', 'audit')).toBe(true);
    });

    it('should grant all CRUD permissions', () => {
      const ability = defineAbilitiesFor(adminUser);

      expect(ability.can('read', 'server')).toBe(true);
      expect(ability.can('create', 'server')).toBe(true);
      expect(ability.can('update', 'server')).toBe(true);
      expect(ability.can('delete', 'server')).toBe(true);
      expect(ability.can('write', 'tool')).toBe(true);
    });

    it('should access all tenants', () => {
      const tenantAdmin: UserPublic = {
        ...adminUser,
        tenant: 'tenant-a',
      };

      const ability = defineAbilitiesFor(tenantAdmin);

      // Admin can access any tenant
      expect(ability.can('read', subject('server', { tenantId: 'tenant-b' }))).toBe(true);
      expect(ability.can('read', subject('server', { tenantId: 'tenant-c' }))).toBe(true);
    });
  });

  describe('User Role', () => {
    const regularUser: UserPublic = {
      id: 'user-1',
      username: 'alice',
      email: 'alice@example.com',
      role: 'user',
      tenant: null,
      status: 'active',
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
      last_login_at: null,
    };

    it('should allow reading servers', () => {
      const ability = defineAbilitiesFor(regularUser);
      expect(ability.can('read', 'server')).toBe(true);
    });

    it('should allow creating servers', () => {
      const ability = defineAbilitiesFor(regularUser);
      expect(ability.can('create', 'server')).toBe(true);
    });

    it('should allow updating own servers', () => {
      const ability = defineAbilitiesFor(regularUser);
      expect(ability.can('update', subject('server', { owner: 'user-1' }))).toBe(true);
    });

    it('should deny updating others servers', () => {
      const ability = defineAbilitiesFor(regularUser);
      expect(ability.can('update', subject('server', { owner: 'user-2' }))).toBe(false);
    });

    it('should allow reading and executing tools', () => {
      const ability = defineAbilitiesFor(regularUser);
      expect(ability.can('read', 'tool')).toBe(true);
      expect(ability.can('write', 'tool')).toBe(true);
    });

    it('should allow reading own user info', () => {
      const ability = defineAbilitiesFor(regularUser);
      expect(ability.can('read', subject('user', { id: 'user-1' }))).toBe(true);
    });

    it('should deny reading other users', () => {
      const ability = defineAbilitiesFor(regularUser);
      expect(ability.can('read', subject('user', { id: 'user-2' }))).toBe(false);
    });

    it('should allow managing own API keys', () => {
      const ability = defineAbilitiesFor(regularUser);
      expect(ability.can('read', subject('apikey', { userId: 'user-1' }))).toBe(true);
      expect(ability.can('create', subject('apikey', { userId: 'user-1' }))).toBe(true);
      expect(ability.can('delete', subject('apikey', { userId: 'user-1' }))).toBe(true);
    });

    it('should deny managing other users API keys', () => {
      const ability = defineAbilitiesFor(regularUser);
      expect(ability.can('delete', subject('apikey', { userId: 'user-2' }))).toBe(false);
    });

    it('should deny managing users', () => {
      const ability = defineAbilitiesFor(regularUser);
      expect(ability.can('create', 'user')).toBe(false);
      expect(ability.can('delete', 'user')).toBe(false);
      expect(ability.can('manage', 'user')).toBe(false);
    });

    it('should deny managing roles', () => {
      const ability = defineAbilitiesFor(regularUser);
      expect(ability.can('create', 'role')).toBe(false);
      expect(ability.can('update', 'role')).toBe(false);
      expect(ability.can('manage', 'role')).toBe(false);
    });
  });

  describe('Readonly Role', () => {
    const readonlyUser: UserPublic = {
      id: 'readonly-1',
      username: 'observer',
      email: 'observer@example.com',
      role: 'readonly',
      tenant: null,
      status: 'active',
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
      last_login_at: null,
    };

    it('should allow reading servers', () => {
      const ability = defineAbilitiesFor(readonlyUser);
      expect(ability.can('read', 'server')).toBe(true);
    });

    it('should allow reading tools', () => {
      const ability = defineAbilitiesFor(readonlyUser);
      expect(ability.can('read', 'tool')).toBe(true);
    });

    it('should deny creating servers', () => {
      const ability = defineAbilitiesFor(readonlyUser);
      expect(ability.can('create', 'server')).toBe(false);
    });

    it('should deny updating servers', () => {
      const ability = defineAbilitiesFor(readonlyUser);
      expect(ability.can('update', 'server')).toBe(false);
    });

    it('should deny deleting servers', () => {
      const ability = defineAbilitiesFor(readonlyUser);
      expect(ability.can('delete', 'server')).toBe(false);
    });

    it('should deny executing tools', () => {
      const ability = defineAbilitiesFor(readonlyUser);
      expect(ability.can('write', 'tool')).toBe(false);
    });

    it('should allow reading own user info', () => {
      const ability = defineAbilitiesFor(readonlyUser);
      expect(ability.can('read', subject('user', { id: 'readonly-1' }))).toBe(true);
    });

    it('should deny updating own user info', () => {
      const ability = defineAbilitiesFor(readonlyUser);
      expect(ability.can('update', subject('user', { id: 'readonly-1' }))).toBe(false);
    });
  });

  describe('Tenant Isolation', () => {
    const tenantAUser: UserPublic = {
      id: 'user-a1',
      username: 'alice',
      email: 'alice@tenant-a.com',
      role: 'user',
      tenant: 'tenant-a',
      status: 'active',
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
      last_login_at: null,
    };

    const tenantBUser: UserPublic = {
      id: 'user-b1',
      username: 'bob',
      email: 'bob@tenant-b.com',
      role: 'user',
      tenant: 'tenant-b',
      status: 'active',
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
      last_login_at: null,
    };

    it('should deny cross-tenant access for users', () => {
      const ability = defineAbilitiesFor(tenantAUser);

      // Tenant A user cannot access Tenant B resources
      expect(ability.can('read', subject('server', { tenantId: 'tenant-b' }))).toBe(false);
      expect(ability.can('read', subject('user', { tenantId: 'tenant-b' }))).toBe(false);
    });

    it('should allow same-tenant access', () => {
      const ability = defineAbilitiesFor(tenantAUser);

      // Tenant A user can access Tenant A resources
      expect(ability.can('read', subject('server', { tenantId: 'tenant-a' }))).toBe(true);
    });

    it('should enforce tenant isolation bidirectionally', () => {
      const abilityA = defineAbilitiesFor(tenantAUser);
      const abilityB = defineAbilitiesFor(tenantBUser);

      // A cannot access B
      expect(abilityA.can('read', subject('server', { tenantId: 'tenant-b' }))).toBe(false);

      // B cannot access A
      expect(abilityB.can('read', subject('server', { tenantId: 'tenant-a' }))).toBe(false);
    });
  });

  describe('Helper Functions', () => {
    it('should check permissions correctly', () => {
      const user: UserPublic = {
        id: 'user-1',
        username: 'alice',
        email: 'alice@example.com',
        role: 'user',
        tenant: null,
        status: 'active',
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
        last_login_at: null,
      };

      expect(checkPermission(user, 'read', 'server')).toBe(true);
      expect(checkPermission(user, 'create', 'user')).toBe(false);
    });

    it('should get user permissions', () => {
      const user: UserPublic = {
        id: 'user-1',
        username: 'alice',
        email: 'alice@example.com',
        role: 'admin',
        tenant: null,
        status: 'active',
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
        last_login_at: null,
      };

      const permissions = getUserPermissions(user);

      expect(permissions).toBeInstanceOf(Array);
      expect(permissions.length).toBeGreaterThan(0);
      expect(permissions[0]).toHaveProperty('action');
      expect(permissions[0]).toHaveProperty('subject');
    });
  });
});
