/**
 * Audit Logging API Routes
 *
 * REST API endpoints for audit log management:
 * - GET /api/audit-logs - List audit logs (with filtering, pagination)
 * - GET /api/audit-logs/export - Export logs (CSV, JSON)
 * - GET /api/audit-logs/verify - Verify log chain integrity
 * - GET /api/audit-logs/stats - Get audit log statistics
 *
 * All endpoints require admin role (checked via CASL).
 *
 * Related: Epic #22 (Audit Logging)
 */

import express, { type Request, type Response, type Router } from 'express';
import { authenticate } from '../auth/index.js';
import { defineAbilitiesFor } from '../rbac/abilities.js';
import { getAuditLogs, verifyAuditLogIntegrity, exportAuditLogs } from '../audit/service.js';
import { getDatabase } from '../storage/database.js';
import logger from '../logging/logger.js';
import { sanitizeString } from '../logging/sanitizer.js';
import type { AuditLogFilters, PaginationParams } from '../types/audit.js';
import type { RequestWithAudit } from '../audit/middleware.js';

/**
 * Create audit API router
 */
export function createAuditRouter(): Router {
  const router = express.Router();

  /**
   * GET /api/audit-logs
   *
   * List audit logs with filtering and pagination.
   *
   * Query parameters:
   * - user_id: Filter by user ID
   * - username: Filter by username (partial match)
   * - action_type: Filter by action type (supports wildcards: "auth.*")
   * - action_result: Filter by result (success, failure)
   * - resource_type: Filter by resource type
   * - resource_id: Filter by resource ID
   * - ip_address: Filter by IP address
   * - start_date: Filter by start date (ISO 8601)
   * - end_date: Filter by end date (ISO 8601)
   * - limit: Number of results per page (default: 100, max: 1000)
   * - offset: Pagination offset (default: 0)
   * - sort_by: Sort field (timestamp, action_type, user_id)
   * - sort_order: Sort order (asc, desc)
   *
   * Requires: admin role
   */
  router.get('/', authenticate(), async (req: Request, res: Response) => {
    const authReq = req as RequestWithAudit;

    try {
      // Check permission (admin only)
      const ability = defineAbilitiesFor(authReq.user!);
      if (!ability.can('read', 'audit')) {
        logger.warn('Unauthorized audit log access attempt', {
          userId: authReq.user?.id,
          role: authReq.user?.role,
        });
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Insufficient permissions to view audit logs',
        });
      }

      // Build filters from query parameters
      const filters: AuditLogFilters = {
        userId: req.query.user_id as string | undefined,
        username: req.query.username as string | undefined,
        actionType: req.query.action_type as string | undefined,
        actionResult: req.query.action_result as 'success' | 'failure' | undefined,
        resourceType: req.query.resource_type as string | undefined,
        resourceId: req.query.resource_id as string | undefined,
        ipAddress: req.query.ip_address as string | undefined,
        startDate: req.query.start_date as string | undefined,
        endDate: req.query.end_date as string | undefined,
      };

      // Build pagination parameters
      const pagination: PaginationParams = {
        limit: Math.min(parseInt(req.query.limit as string) || 100, 1000),
        offset: parseInt(req.query.offset as string) || 0,
        sortBy: (req.query.sort_by as 'timestamp' | 'action_type' | 'user_id') || 'timestamp',
        sortOrder: (req.query.sort_order as 'asc' | 'desc') || 'desc',
      };

      // Query logs
      const result = await getAuditLogs(filters, pagination);

      return res.json({
        logs: result.logs,
        pagination: {
          total: result.total,
          limit: pagination.limit,
          offset: pagination.offset,
          hasMore: result.hasMore,
        },
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to query audit logs', {
        error: sanitizeString(err.message),
        userId: authReq.user?.id,
      });
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to query audit logs',
      });
    }
  });

  /**
   * GET /api/audit-logs/export
   *
   * Export audit logs to CSV or JSON.
   *
   * Query parameters:
   * - format: Export format (csv, json)
   * - All filter parameters from GET /api/audit-logs
   *
   * Requires: admin role
   */
  router.get('/export', authenticate(), async (req: Request, res: Response) => {
    const authReq = req as RequestWithAudit;

    try {
      // Check permission (admin only)
      const ability = defineAbilitiesFor(authReq.user!);
      if (!ability.can('read', 'audit')) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Insufficient permissions to export audit logs',
        });
      }

      // Validate format
      const format = req.query.format as string;
      if (!format || !['csv', 'json'].includes(format)) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Invalid format. Must be "csv" or "json"',
        });
      }

      // Build filters from query parameters
      const filters: AuditLogFilters = {
        userId: req.query.user_id as string | undefined,
        username: req.query.username as string | undefined,
        actionType: req.query.action_type as string | undefined,
        actionResult: req.query.action_result as 'success' | 'failure' | undefined,
        resourceType: req.query.resource_type as string | undefined,
        resourceId: req.query.resource_id as string | undefined,
        ipAddress: req.query.ip_address as string | undefined,
        startDate: req.query.start_date as string | undefined,
        endDate: req.query.end_date as string | undefined,
      };

      logger.info('Exporting audit logs', {
        format,
        userId: authReq.user?.id,
        filters,
      });

      // Export logs
      const exportData = await exportAuditLogs(format as 'csv' | 'json', filters);

      // Set appropriate content type and filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `audit-logs-${timestamp}.${format}`;

      if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
      } else {
        res.setHeader('Content-Type', 'application/json');
      }

      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(exportData);
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to export audit logs', {
        error: sanitizeString(err.message),
        userId: authReq.user?.id,
      });
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to export audit logs',
      });
    }
  });

  /**
   * GET /api/audit-logs/verify
   *
   * Verify audit log chain integrity.
   * Walks all logs and checks hash chain for tampering.
   *
   * Requires: admin role
   */
  router.get('/verify', authenticate(), async (req: Request, res: Response) => {
    const authReq = req as RequestWithAudit;

    try {
      // Check permission (admin only)
      const ability = defineAbilitiesFor(authReq.user!);
      if (!ability.can('read', 'audit')) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Insufficient permissions to verify audit logs',
        });
      }

      logger.info('Verifying audit log integrity', {
        userId: authReq.user?.id,
      });

      // Verify integrity
      const result = await verifyAuditLogIntegrity();

      return res.json({
        valid: result.valid,
        totalEntries: result.totalEntries,
        errorCount: result.errors.length,
        errors: result.errors.slice(0, 100), // Return first 100 errors
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to verify audit log integrity', {
        error: sanitizeString(err.message),
        userId: authReq.user?.id,
      });
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to verify audit log integrity',
      });
    }
  });

  /**
   * GET /api/audit-logs/stats
   *
   * Get audit log statistics and recent activity.
   *
   * Requires: admin role
   */
  router.get('/stats', authenticate(), async (req: Request, res: Response) => {
    const authReq = req as RequestWithAudit;

    try {
      // Check permission (admin only)
      const ability = defineAbilitiesFor(authReq.user!);
      if (!ability.can('read', 'audit')) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Insufficient permissions to view audit log statistics',
        });
      }

      const db = getDatabase();

      // Get total entry count
      const totalResult = db.prepare('SELECT COUNT(*) as count FROM audit_logs').get() as {
        count: number;
      };

      // Get entries by action type
      const actionTypeResults = db
        .prepare(
          `
        SELECT action_type, COUNT(*) as count
        FROM audit_logs
        GROUP BY action_type
        ORDER BY count DESC
        LIMIT 20
      `
        )
        .all() as Array<{ action_type: string; count: number }>;

      const entriesByAction = Object.fromEntries(
        actionTypeResults.map((r) => [r.action_type, r.count])
      );

      // Get entries by result
      const resultResults = db
        .prepare(
          `
        SELECT action_result, COUNT(*) as count
        FROM audit_logs
        GROUP BY action_result
      `
        )
        .all() as Array<{ action_result: string; count: number }>;

      const entriesByResult = Object.fromEntries(
        resultResults.map((r) => [r.action_result, r.count])
      );

      // Get entries by user (top 10)
      const userResults = db
        .prepare(
          `
        SELECT user_id, username, COUNT(*) as count
        FROM audit_logs
        WHERE user_id IS NOT NULL
        GROUP BY user_id
        ORDER BY count DESC
        LIMIT 10
      `
        )
        .all() as Array<{ user_id: string; username: string; count: number }>;

      const entriesByUser = userResults.map((r) => ({
        userId: r.user_id,
        username: r.username,
        count: r.count,
      }));

      // Get failed login count
      const failedLoginResult = db
        .prepare("SELECT COUNT(*) as count FROM audit_logs WHERE action_type = 'auth.login.failed'")
        .get() as { count: number };

      // Get recent activity (last 20 entries)
      const recentResult = await getAuditLogs({}, { limit: 20, offset: 0, sortOrder: 'desc' });

      return res.json({
        totalEntries: totalResult.count,
        entriesByAction,
        entriesByResult,
        entriesByUser,
        failedLogins: failedLoginResult.count,
        recentActivity: recentResult.logs,
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to get audit log statistics', {
        error: sanitizeString(err.message),
        userId: authReq.user?.id,
      });
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to get audit log statistics',
      });
    }
  });

  return router;
}

export default { createAuditRouter };
