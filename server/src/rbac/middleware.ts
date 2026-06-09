/**
 * RBAC Middleware
 *
 * Express middleware for permission checking and tenant isolation.
 *
 * Related: Epic #17 (RBAC & Multi-Tenancy)
 */

import type { Request, Response, NextFunction } from 'express';
import type { UserPublic } from '../storage/models/users.js';
import type { AuthenticatedUser } from '../auth/strategies/jwt.js';
import { usersModel } from '../storage/models/users.js';
import { checkPermission, type Action, type Subject } from './abilities.js';
import logger from '../logging/logger.js';
import { sanitizeString } from '../logging/sanitizer.js';

/**
 * Extended request with user and tenant
 */
export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
  userDetails?: UserPublic;
  tenant?: {
    id: string | null;
    canAccessAll: boolean;
  };
}

/**
 * Middleware to extract tenant from user and add to request
 *
 * Must be used after authentication middleware that sets req.user
 */
export function tenantIsolation(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const user = req.user;

  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // Load full user details if not already loaded
  if (!req.userDetails) {
    const userDetails = usersModel.findById(user.id);
    if (!userDetails) {
      res.status(401).json({ error: 'User not found' });
      return;
    }
    req.userDetails = userDetails;
  }

  // Add tenant context to request
  req.tenant = {
    id: user.tenant,
    canAccessAll: user.role === 'admin', // Admins can access all tenants
  };

  logger.debug('Tenant context added to request', {
    userId: sanitizeString(user.id),
    tenantId: sanitizeString(user.tenant || 'null'),
    canAccessAll: user.role === 'admin',
  });

  next();
}

/**
 * Middleware factory to check permissions for routes
 *
 * @param action - Action to check (read, write, create, update, delete, manage)
 * @param subject - Subject to check (server, tool, user, etc.)
 * @returns Express middleware
 */
export function requirePermission(action: Action, subject: Subject) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const user = req.user;
    const userDetails = req.userDetails;

    if (!user || !userDetails) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Check permission using full user details
    const hasPermission = checkPermission(userDetails, action, subject);

    if (!hasPermission) {
      logger.warn('Permission denied', {
        userId: sanitizeString(user.id),
        username: sanitizeString(user.username),
        role: user.role,
        action,
        subject,
      });

      res.status(403).json({
        error: 'Forbidden',
        message: `You do not have permission to ${action} ${subject}`,
      });
      return;
    }

    logger.debug('Permission granted', {
      userId: sanitizeString(user.id),
      action,
      subject,
    });

    next();
  };
}

/**
 * Middleware factory to check resource ownership
 *
 * @param resourceIdParam - Request parameter containing resource ID (default: 'id')
 * @param ownerField - Field in resource that contains owner ID (default: 'userId')
 * @returns Express middleware
 */
export function requireOwnership(resourceIdParam = 'id', ownerField = 'userId') {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const user = req.user;

    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Admins can access anything
    if (user.role === 'admin') {
      next();
      return;
    }

    // Get resource ID from params
    const resourceId = req.params[resourceIdParam];

    if (!resourceId) {
      res.status(400).json({
        error: 'Bad Request',
        message: `Missing ${resourceIdParam} parameter`,
      });
      return;
    }

    // Check if user owns the resource
    // Note: This is a simple check. In production, you'd fetch the resource
    // from the database and check the owner field.
    const ownerId = req.body?.[ownerField] || req.query?.[ownerField];

    if (ownerId && ownerId !== user.id) {
      logger.warn('Ownership check failed', {
        userId: sanitizeString(user.id),
        resourceId: sanitizeString(resourceId),
        ownerId: sanitizeString(ownerId),
      });

      res.status(403).json({
        error: 'Forbidden',
        message: 'You do not own this resource',
      });
      return;
    }

    next();
  };
}

/**
 * Middleware to enforce tenant isolation on queries
 *
 * Automatically adds tenant filter to queries for non-admin users
 */
export function enforceTenantFilter(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const user = req.user;
  const tenant = req.tenant;

  if (!user || !tenant) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // Admins can access all tenants
  if (tenant.canAccessAll) {
    next();
    return;
  }

  // Add tenant filter to query params
  if (!req.query) {
    req.query = {};
  }

  // Force tenant filter
  req.query.tenant = tenant.id || undefined;

  logger.debug('Tenant filter enforced', {
    userId: sanitizeString(user.id),
    tenantId: sanitizeString(tenant.id || 'null'),
  });

  next();
}
