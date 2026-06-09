/**
 * RBAC Middleware Tests
 *
 * Tests for permission checking and tenant isolation middleware.
 *
 * Related: Epic #17 (RBAC & Multi-Tenancy)
 */

import { describe, it, expect, vi } from 'vitest';
import type { Response, NextFunction } from 'express';
import {
  tenantIsolation,
  requirePermission,
  enforceTenantFilter,
  type AuthenticatedRequest,
} from '../middleware.js';
import type { UserPublic } from '../../storage/models/users.js';

describe('RBAC Middleware', () => {
  describe('tenantIsolation', () => {
    it('should add tenant context for authenticated user', () => {
      const user: UserPublic = {
        id: 'user-1',
        username: 'alice',
        email: 'alice@example.com',
        role: 'user',
        tenant: 'tenant-a',
        status: 'active',
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
        last_login_at: null,
      };

      const req = {
        user,
      } as AuthenticatedRequest;

      const res = {} as Response;
      const next = vi.fn() as NextFunction;

      tenantIsolation(req, res, next);

      expect(req.tenant).toBeDefined();
      expect(req.tenant?.id).toBe('tenant-a');
      expect(req.tenant?.canAccessAll).toBe(false);
      expect(next).toHaveBeenCalled();
    });

    it('should allow all tenant access for admin', () => {
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

      const req = {
        user: adminUser,
      } as AuthenticatedRequest;

      const res = {} as Response;
      const next = vi.fn() as NextFunction;

      tenantIsolation(req, res, next);

      expect(req.tenant?.canAccessAll).toBe(true);
      expect(next).toHaveBeenCalled();
    });

    it('should return 401 if not authenticated', () => {
      const req = {} as AuthenticatedRequest;

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;

      const next = vi.fn() as NextFunction;

      tenantIsolation(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('requirePermission', () => {
    it('should allow access when user has permission', () => {
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

      const req = {
        user: adminUser,
      } as AuthenticatedRequest;

      const res = {} as Response;
      const next = vi.fn() as NextFunction;

      const middleware = requirePermission('read', 'server');
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should deny access when user lacks permission', () => {
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

      const req = {
        user: readonlyUser,
      } as AuthenticatedRequest;

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;

      const next = vi.fn() as NextFunction;

      const middleware = requirePermission('create', 'server');
      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Forbidden',
        message: 'You do not have permission to create server',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 if not authenticated', () => {
      const req = {} as AuthenticatedRequest;

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;

      const next = vi.fn() as NextFunction;

      const middleware = requirePermission('read', 'server');
      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('enforceTenantFilter', () => {
    it('should add tenant filter for non-admin users', () => {
      const user: UserPublic = {
        id: 'user-1',
        username: 'alice',
        email: 'alice@example.com',
        role: 'user',
        tenant: 'tenant-a',
        status: 'active',
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
        last_login_at: null,
      };

      const req = {
        user,
        tenant: {
          id: 'tenant-a',
          canAccessAll: false,
        },
        query: {},
      } as unknown as AuthenticatedRequest;

      const res = {} as Response;
      const next = vi.fn() as NextFunction;

      enforceTenantFilter(req, res, next);

      expect(req.query.tenant).toBe('tenant-a');
      expect(next).toHaveBeenCalled();
    });

    it('should not add tenant filter for admin users', () => {
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

      const req = {
        user: adminUser,
        tenant: {
          id: null,
          canAccessAll: true,
        },
        query: {},
      } as unknown as AuthenticatedRequest;

      const res = {} as Response;
      const next = vi.fn() as NextFunction;

      enforceTenantFilter(req, res, next);

      expect(req.query.tenant).toBeUndefined();
      expect(next).toHaveBeenCalled();
    });

    it('should return 401 if not authenticated', () => {
      const req = {
        query: {},
      } as AuthenticatedRequest;

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;

      const next = vi.fn() as NextFunction;

      enforceTenantFilter(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
      expect(next).not.toHaveBeenCalled();
    });
  });
});
