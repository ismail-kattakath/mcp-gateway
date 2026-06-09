/**
 * Permission Matrix Tests
 *
 * Tests for permission utilities and matrix.
 *
 * Related: Epic #17 (RBAC & Multi-Tenancy)
 */

import { describe, it, expect } from 'vitest';
import {
  PERMISSION_MATRIX,
  roleHasPermission,
  getRolePermissions,
  formatPermission,
  parsePermission,
  getPermissionDescription,
} from '../permissions.js';

describe('Permission Matrix', () => {
  describe('PERMISSION_MATRIX', () => {
    it('should define permissions for admin', () => {
      expect(PERMISSION_MATRIX.admin).toBeDefined();
      expect(PERMISSION_MATRIX.admin.server).toContain('manage');
      expect(PERMISSION_MATRIX.admin.user).toContain('manage');
    });

    it('should define permissions for user', () => {
      expect(PERMISSION_MATRIX.user).toBeDefined();
      expect(PERMISSION_MATRIX.user.server).toContain('read');
      expect(PERMISSION_MATRIX.user.tool).toContain('write');
    });

    it('should define permissions for readonly', () => {
      expect(PERMISSION_MATRIX.readonly).toBeDefined();
      expect(PERMISSION_MATRIX.readonly.server).toContain('read');
      expect(PERMISSION_MATRIX.readonly.tool).not.toContain('write');
    });
  });

  describe('roleHasPermission', () => {
    it('should return true when role has permission', () => {
      expect(roleHasPermission('admin', 'read', 'server')).toBe(true);
      expect(roleHasPermission('admin', 'delete', 'user')).toBe(true);
      expect(roleHasPermission('user', 'read', 'server')).toBe(true);
      expect(roleHasPermission('user', 'write', 'tool')).toBe(true);
      expect(roleHasPermission('readonly', 'read', 'server')).toBe(true);
    });

    it('should return false when role lacks permission', () => {
      expect(roleHasPermission('user', 'manage', 'user')).toBe(false);
      expect(roleHasPermission('readonly', 'write', 'tool')).toBe(false);
      expect(roleHasPermission('readonly', 'delete', 'server')).toBe(false);
    });

    it('should treat manage as all permissions', () => {
      expect(roleHasPermission('admin', 'read', 'server')).toBe(true);
      expect(roleHasPermission('admin', 'write', 'server')).toBe(true);
      expect(roleHasPermission('admin', 'delete', 'server')).toBe(true);
    });
  });

  describe('getRolePermissions', () => {
    it('should return all permissions for admin', () => {
      const permissions = getRolePermissions('admin');
      expect(permissions).toBeInstanceOf(Array);
      expect(permissions.length).toBeGreaterThan(0);
      expect(permissions).toContain('manage:server');
      expect(permissions).toContain('manage:user');
    });

    it('should return permissions for user', () => {
      const permissions = getRolePermissions('user');
      expect(permissions).toBeInstanceOf(Array);
      expect(permissions).toContain('read:server');
      expect(permissions).toContain('write:tool');
      expect(permissions).not.toContain('manage:user');
    });

    it('should return read-only permissions for readonly', () => {
      const permissions = getRolePermissions('readonly');
      expect(permissions).toBeInstanceOf(Array);
      expect(permissions.every((p) => p.startsWith('read:'))).toBe(true);
    });
  });

  describe('formatPermission', () => {
    it('should format permission as action:subject', () => {
      expect(formatPermission('read', 'server')).toBe('read:server');
      expect(formatPermission('write', 'tool')).toBe('write:tool');
      expect(formatPermission('manage', 'all')).toBe('manage:all');
    });
  });

  describe('parsePermission', () => {
    it('should parse valid permission strings', () => {
      const parsed = parsePermission('read:server');
      expect(parsed).toBeDefined();
      expect(parsed?.action).toBe('read');
      expect(parsed?.subject).toBe('server');
    });

    it('should parse complex permissions', () => {
      const parsed = parsePermission('manage:all');
      expect(parsed).toBeDefined();
      expect(parsed?.action).toBe('manage');
      expect(parsed?.subject).toBe('all');
    });

    it('should return null for invalid format', () => {
      expect(parsePermission('invalid')).toBeNull();
      expect(parsePermission('')).toBeNull();
      expect(parsePermission('read')).toBeNull();
    });
  });

  describe('getPermissionDescription', () => {
    it('should return human-readable description', () => {
      const desc = getPermissionDescription('read', 'server');
      expect(desc).toBeTruthy();
      expect(desc).toContain('View');
      expect(desc).toContain('MCP servers');
    });

    it('should describe different actions', () => {
      expect(getPermissionDescription('create', 'user')).toContain('Create new');
      expect(getPermissionDescription('update', 'setting')).toContain('Update existing');
      expect(getPermissionDescription('delete', 'apikey')).toContain('Delete');
      expect(getPermissionDescription('manage', 'all')).toContain('Full control');
    });
  });
});
