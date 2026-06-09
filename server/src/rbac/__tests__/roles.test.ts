/**
 * Role Definitions Tests
 *
 * Tests for role definitions and role utilities.
 *
 * Related: Epic #17 (RBAC & Multi-Tenancy)
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_ROLES,
  isValidRole,
  getRoleDefinition,
  getAllRoles,
  getRoleByName,
  DEFAULT_USER_ROLE,
} from '../roles.js';

describe('Role Definitions', () => {
  describe('DEFAULT_ROLES', () => {
    it('should have admin role', () => {
      expect(DEFAULT_ROLES.admin).toBeDefined();
      expect(DEFAULT_ROLES.admin.name).toBe('admin');
      expect(DEFAULT_ROLES.admin.permissions).toContain('manage:all');
    });

    it('should have user role', () => {
      expect(DEFAULT_ROLES.user).toBeDefined();
      expect(DEFAULT_ROLES.user.name).toBe('user');
      expect(DEFAULT_ROLES.user.permissions).toContain('read:server');
      expect(DEFAULT_ROLES.user.permissions).toContain('write:tool');
    });

    it('should have readonly role', () => {
      expect(DEFAULT_ROLES.readonly).toBeDefined();
      expect(DEFAULT_ROLES.readonly.name).toBe('readonly');
      expect(DEFAULT_ROLES.readonly.permissions).toContain('read:server');
      expect(DEFAULT_ROLES.readonly.permissions).not.toContain('write:tool');
    });
  });

  describe('isValidRole', () => {
    it('should return true for valid roles', () => {
      expect(isValidRole('admin')).toBe(true);
      expect(isValidRole('user')).toBe(true);
      expect(isValidRole('readonly')).toBe(true);
    });

    it('should return false for invalid roles', () => {
      expect(isValidRole('superadmin')).toBe(false);
      expect(isValidRole('guest')).toBe(false);
      expect(isValidRole('')).toBe(false);
    });
  });

  describe('getRoleDefinition', () => {
    it('should return role definition for valid role', () => {
      const adminDef = getRoleDefinition('admin');
      expect(adminDef).toBeDefined();
      expect(adminDef.name).toBe('admin');
      expect(adminDef.description).toBeTruthy();
      expect(adminDef.permissions).toBeInstanceOf(Array);
    });

    it('should return role definition for user role', () => {
      const userDef = getRoleDefinition('user');
      expect(userDef).toBeDefined();
      expect(userDef.name).toBe('user');
    });

    it('should return role definition for readonly role', () => {
      const readonlyDef = getRoleDefinition('readonly');
      expect(readonlyDef).toBeDefined();
      expect(readonlyDef.name).toBe('readonly');
    });
  });

  describe('getAllRoles', () => {
    it('should return all role definitions', () => {
      const roles = getAllRoles();
      expect(roles).toBeInstanceOf(Array);
      expect(roles).toHaveLength(3);
      expect(roles.map((r) => r.name)).toEqual(['admin', 'user', 'readonly']);
    });
  });

  describe('getRoleByName', () => {
    it('should return role definition for valid name', () => {
      const role = getRoleByName('admin');
      expect(role).toBeDefined();
      expect(role?.name).toBe('admin');
    });

    it('should return undefined for invalid name', () => {
      const role = getRoleByName('invalid');
      expect(role).toBeUndefined();
    });
  });

  describe('DEFAULT_USER_ROLE', () => {
    it('should be user', () => {
      expect(DEFAULT_USER_ROLE).toBe('user');
    });
  });
});
