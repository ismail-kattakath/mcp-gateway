/**
 * Audit Logging Middleware
 *
 * Express middleware to automatically capture audit events:
 * - Extracts user identity from req.user (Passport.js)
 * - Captures IP address, user agent, request ID
 * - Logs authentication and authorization events
 * - Async hook to write audit log after response completes
 *
 * Related: Epic #22 (Audit Logging)
 */

import type { Request, Response, NextFunction } from 'express';
import { createAuditLog } from './service.js';
import logger from '../logging/logger.js';
import { sanitizeString } from '../logging/sanitizer.js';
import { AuditActionType, type AuditActionResult } from '../types/audit.js';

/**
 * Extended Request type with audit context
 */
export interface RequestWithAudit extends Request {
  user?: {
    id: string;
    username: string;
    email: string | null;
    role: 'admin' | 'user' | 'readonly';
    tenant: string | null;
    status: 'active' | 'disabled' | 'locked';
    created_at: string;
    updated_at: string;
    last_login_at: string | null;
  };
  auditContext?: {
    actionType?: AuditActionType | string;
    resourceType?: string;
    resourceId?: string;
    resourceName?: string;
    details?: Record<string, unknown>;
  };
}

/**
 * Helper to create an audit log entry from request context
 *
 * @param req - Express request
 * @param actionType - Action type
 * @param actionResult - Success or failure
 * @param resourceType - Resource type
 * @param resourceId - Resource ID
 * @param resourceName - Resource name
 * @param details - Additional details
 */
export async function auditLog(
  req: RequestWithAudit,
  actionType: AuditActionType | string,
  actionResult: AuditActionResult,
  resourceType?: string,
  resourceId?: string,
  resourceName?: string,
  details?: Record<string, unknown>
): Promise<void> {
  try {
    await createAuditLog({
      userId: req.user?.id,
      username: req.user?.username,
      actionType,
      actionResult,
      resourceType,
      resourceId,
      resourceName,
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.get('user-agent'),
      requestId: req.get('x-request-id') || req.get('x-correlation-id'),
      sessionId: req.get('x-session-id'),
      details,
    });
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to create audit log', {
      error: sanitizeString(err.message),
      actionType,
      actionResult,
    });
    // Don't throw - audit logging failure should not break the request
  }
}

/**
 * Middleware to capture audit context from route handlers
 *
 * Route handlers can set req.auditContext to customize audit logging.
 * This middleware writes the audit log after the response completes.
 */
export function auditMiddleware() {
  return (req: RequestWithAudit, res: Response, next: NextFunction) => {
    // Skip audit logging for health check and static assets
    if (
      req.path === '/health' ||
      req.path === '/metrics' ||
      req.path.startsWith('/docs') ||
      req.path.startsWith('/static')
    ) {
      return next();
    }

    // Capture response status and write audit log after response completes
    const originalSend = res.send;
    res.send = function (data) {
      res.send = originalSend; // Restore original send

      // Write audit log asynchronously (don't block response)
      setImmediate(async () => {
        const context = req.auditContext;

        // Only log if audit context is set by route handler
        if (context && context.actionType) {
          const actionResult: AuditActionResult = res.statusCode < 400 ? 'success' : 'failure';

          await auditLog(
            req,
            context.actionType,
            actionResult,
            context.resourceType,
            context.resourceId,
            context.resourceName,
            context.details
          );
        }
      });

      return originalSend.call(this, data);
    };

    next();
  };
}

/**
 * Audit authentication events
 */
export async function auditAuthEvent(
  req: RequestWithAudit,
  actionType: AuditActionType,
  result: AuditActionResult,
  details?: Record<string, unknown>
): Promise<void> {
  await auditLog(req, actionType, result, 'user', req.user?.id, req.user?.username, details);
}

/**
 * Audit authorization events
 */
export async function auditAuthzEvent(
  req: RequestWithAudit,
  granted: boolean,
  action: string,
  resource: string,
  details?: Record<string, unknown>
): Promise<void> {
  await auditLog(
    req,
    granted ? AuditActionType.AUTHZ_PERMISSION_GRANTED : AuditActionType.AUTHZ_PERMISSION_DENIED,
    granted ? 'success' : 'failure',
    resource,
    undefined,
    undefined,
    { action, ...details }
  );
}

/**
 * Set audit context for current request (to be logged after response)
 */
export function setAuditContext(
  req: RequestWithAudit,
  actionType: AuditActionType | string,
  resourceType?: string,
  resourceId?: string,
  resourceName?: string,
  details?: Record<string, unknown>
): void {
  req.auditContext = {
    actionType,
    resourceType,
    resourceId,
    resourceName,
    details,
  };
}

/**
 * Update audit context details
 */
export function updateAuditDetails(req: RequestWithAudit, details: Record<string, unknown>): void {
  if (!req.auditContext) {
    req.auditContext = {};
  }
  req.auditContext.details = {
    ...req.auditContext.details,
    ...details,
  };
}

export default {
  auditMiddleware,
  auditLog,
  auditAuthEvent,
  auditAuthzEvent,
  setAuditContext,
  updateAuditDetails,
};
