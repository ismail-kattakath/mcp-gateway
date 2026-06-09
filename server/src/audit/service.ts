/**
 * Audit Logging Service
 *
 * Core service for audit trail management:
 * - Create immutable audit log entries
 * - Query logs with filtering and pagination
 * - Export logs (CSV, JSON)
 * - Verify log chain integrity
 * - Auto-purge expired logs based on retention policies
 *
 * Related: Epic #22 (Audit Logging)
 */

import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../storage/database.js';
import logger from '../logging/logger.js';
import { sanitizeString } from '../logging/sanitizer.js';
import type {
  AuditLogEntry,
  AuditLogFilters,
  PaginationParams,
  AuditLogQueryResult,
  AuditIntegrityResult,
  AuditRetentionPolicy,
  AuditActionType,
  AuditActionResult,
} from '../types/audit.js';

/**
 * Create an audit log entry
 *
 * @param entry - Audit log entry to create
 * @returns Created entry with computed hash
 */
export async function createAuditLog(
  entry: Omit<AuditLogEntry, 'id' | 'timestamp' | 'entryHash'>
): Promise<AuditLogEntry> {
  const db = getDatabase();

  // Generate ID and timestamp
  const id = uuidv4();
  const timestamp = Date.now();

  // Get previous entry's hash for chain integrity
  const previousEntry = db
    .prepare('SELECT entry_hash FROM audit_logs ORDER BY timestamp DESC LIMIT 1')
    .get() as { entry_hash: string } | undefined;

  const previousHash = previousEntry?.entry_hash || '';

  // Compute entry hash: SHA256(id + timestamp + action + resource + previous_hash)
  const hashInput = [
    id,
    timestamp.toString(),
    entry.actionType,
    entry.resourceType || '',
    entry.resourceId || '',
    previousHash,
  ].join('|');

  const entryHash = crypto.createHash('sha256').update(hashInput).digest('hex');

  // Create full entry
  const fullEntry: AuditLogEntry = {
    id,
    timestamp,
    ...entry,
    previousHash: previousHash || undefined,
    entryHash,
  };

  // Insert into database
  try {
    const stmt = db.prepare(`
      INSERT INTO audit_logs (
        id, timestamp, user_id, username, action_type, action_result,
        resource_type, resource_id, resource_name, ip_address, user_agent,
        request_id, session_id, details, previous_hash, entry_hash
      ) VALUES (
        @id, @timestamp, @userId, @username, @actionType, @actionResult,
        @resourceType, @resourceId, @resourceName, @ipAddress, @userAgent,
        @requestId, @sessionId, @details, @previousHash, @entryHash
      )
    `);

    stmt.run({
      id: fullEntry.id,
      timestamp: fullEntry.timestamp,
      userId: fullEntry.userId || null,
      username: fullEntry.username || null,
      actionType: fullEntry.actionType,
      actionResult: fullEntry.actionResult,
      resourceType: fullEntry.resourceType || null,
      resourceId: fullEntry.resourceId || null,
      resourceName: fullEntry.resourceName || null,
      ipAddress: fullEntry.ipAddress || null,
      userAgent: fullEntry.userAgent || null,
      requestId: fullEntry.requestId || null,
      sessionId: fullEntry.sessionId || null,
      details: fullEntry.details ? JSON.stringify(fullEntry.details) : null,
      previousHash: fullEntry.previousHash || null,
      entryHash: fullEntry.entryHash,
    });

    logger.debug('Audit log created', {
      id: fullEntry.id,
      actionType: fullEntry.actionType,
      actionResult: fullEntry.actionResult,
      userId: fullEntry.userId,
      resourceType: fullEntry.resourceType,
      resourceId: fullEntry.resourceId,
    });

    return fullEntry;
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to create audit log', {
      error: sanitizeString(err.message),
      entry: {
        actionType: entry.actionType,
        actionResult: entry.actionResult,
        userId: entry.userId,
      },
    });
    throw new Error(`Failed to create audit log: ${err.message}`);
  }
}

/**
 * Query audit logs with filtering and pagination
 *
 * @param filters - Filter criteria
 * @param pagination - Pagination parameters
 * @returns Query result with logs and pagination info
 */
export async function getAuditLogs(
  filters: AuditLogFilters = {},
  pagination: PaginationParams = {}
): Promise<AuditLogQueryResult> {
  const db = getDatabase();

  // Build WHERE clause
  const conditions: string[] = [];
  const params: Record<string, unknown> = {};

  if (filters.userId) {
    conditions.push('user_id = @userId');
    params.userId = filters.userId;
  }

  if (filters.username) {
    conditions.push('username LIKE @username');
    params.username = `%${filters.username}%`;
  }

  if (filters.actionType) {
    if (Array.isArray(filters.actionType)) {
      const placeholders = filters.actionType.map((_, i) => `@actionType${i}`).join(', ');
      conditions.push(`action_type IN (${placeholders})`);
      filters.actionType.forEach((type, i) => {
        params[`actionType${i}`] = type;
      });
    } else if (filters.actionType.includes('*')) {
      // Wildcard support: "auth.*" -> "auth.%"
      conditions.push('action_type LIKE @actionType');
      params.actionType = filters.actionType.replace('*', '%');
    } else {
      conditions.push('action_type = @actionType');
      params.actionType = filters.actionType;
    }
  }

  if (filters.actionResult) {
    conditions.push('action_result = @actionResult');
    params.actionResult = filters.actionResult;
  }

  if (filters.resourceType) {
    conditions.push('resource_type = @resourceType');
    params.resourceType = filters.resourceType;
  }

  if (filters.resourceId) {
    conditions.push('resource_id = @resourceId');
    params.resourceId = filters.resourceId;
  }

  if (filters.ipAddress) {
    conditions.push('ip_address = @ipAddress');
    params.ipAddress = filters.ipAddress;
  }

  if (filters.startDate) {
    const startTimestamp = new Date(filters.startDate).getTime();
    conditions.push('timestamp >= @startTimestamp');
    params.startTimestamp = startTimestamp;
  }

  if (filters.endDate) {
    const endTimestamp = new Date(filters.endDate).getTime();
    conditions.push('timestamp <= @endTimestamp');
    params.endTimestamp = endTimestamp;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Count total matching entries
  const countStmt = db.prepare(`SELECT COUNT(*) as count FROM audit_logs ${whereClause}`);
  const countResult = countStmt.get(params) as { count: number };
  const total = countResult.count;

  // Build ORDER BY and LIMIT clauses
  const sortBy = pagination.sortBy || 'timestamp';
  const sortOrder = pagination.sortOrder || 'desc';
  const limit = pagination.limit || 100;
  const offset = pagination.offset || 0;

  const orderClause = `ORDER BY ${sortBy} ${sortOrder.toUpperCase()}`;
  const limitClause = `LIMIT ${limit} OFFSET ${offset}`;

  // Query logs
  const queryStmt = db.prepare(`
    SELECT
      id, timestamp, user_id, username, action_type, action_result,
      resource_type, resource_id, resource_name, ip_address, user_agent,
      request_id, session_id, details, previous_hash, entry_hash
    FROM audit_logs
    ${whereClause}
    ${orderClause}
    ${limitClause}
  `);

  const rows = queryStmt.all(params) as Array<{
    id: string;
    timestamp: number;
    user_id: string | null;
    username: string | null;
    action_type: string;
    action_result: string;
    resource_type: string | null;
    resource_id: string | null;
    resource_name: string | null;
    ip_address: string | null;
    user_agent: string | null;
    request_id: string | null;
    session_id: string | null;
    details: string | null;
    previous_hash: string | null;
    entry_hash: string;
  }>;

  const logs: AuditLogEntry[] = rows.map((row) => ({
    id: row.id,
    timestamp: row.timestamp,
    userId: row.user_id || undefined,
    username: row.username || undefined,
    actionType: row.action_type as AuditActionType,
    actionResult: row.action_result as AuditActionResult,
    resourceType: row.resource_type || undefined,
    resourceId: row.resource_id || undefined,
    resourceName: row.resource_name || undefined,
    ipAddress: row.ip_address || undefined,
    userAgent: row.user_agent || undefined,
    requestId: row.request_id || undefined,
    sessionId: row.session_id || undefined,
    details: row.details ? JSON.parse(row.details) : undefined,
    previousHash: row.previous_hash || undefined,
    entryHash: row.entry_hash,
  }));

  return {
    logs,
    total,
    hasMore: offset + limit < total,
  };
}

/**
 * Verify audit log chain integrity
 *
 * Walks all logs in chronological order and recomputes hashes.
 * Detects tampering, missing entries, or out-of-order insertions.
 *
 * @returns Integrity check result
 */
export async function verifyAuditLogIntegrity(): Promise<AuditIntegrityResult> {
  const db = getDatabase();

  logger.info('Starting audit log integrity verification');

  const errors: Array<{ entryId: string; timestamp: number; error: string }> = [];

  // Get all logs in chronological order
  const stmt = db.prepare(`
    SELECT
      id, timestamp, action_type, resource_type, resource_id,
      previous_hash, entry_hash
    FROM audit_logs
    ORDER BY timestamp ASC
  `);

  const rows = stmt.all() as Array<{
    id: string;
    timestamp: number;
    action_type: string;
    resource_type: string | null;
    resource_id: string | null;
    previous_hash: string | null;
    entry_hash: string;
  }>;

  let previousHash = '';

  for (const row of rows) {
    // Check that previous_hash matches expected value
    if (
      row.previous_hash !== previousHash &&
      !(row.previous_hash === null && previousHash === '')
    ) {
      errors.push({
        entryId: row.id,
        timestamp: row.timestamp,
        error: `Previous hash mismatch (expected: ${previousHash}, got: ${row.previous_hash || 'NULL'})`,
      });
    }

    // Recompute entry hash
    const hashInput = [
      row.id,
      row.timestamp.toString(),
      row.action_type,
      row.resource_type || '',
      row.resource_id || '',
      previousHash,
    ].join('|');

    const computedHash = crypto.createHash('sha256').update(hashInput).digest('hex');

    // Check that stored hash matches computed hash
    if (row.entry_hash !== computedHash) {
      errors.push({
        entryId: row.id,
        timestamp: row.timestamp,
        error: `Entry hash mismatch (expected: ${computedHash}, got: ${row.entry_hash})`,
      });
    }

    // Update previous hash for next iteration
    previousHash = row.entry_hash;
  }

  const valid = errors.length === 0;

  if (valid) {
    logger.info('Audit log integrity verification passed', {
      totalEntries: rows.length,
    });
  } else {
    logger.warn('Audit log integrity verification FAILED', {
      totalEntries: rows.length,
      errorCount: errors.length,
      errors: errors.slice(0, 10), // Log first 10 errors
    });
  }

  return {
    valid,
    totalEntries: rows.length,
    errors,
  };
}

/**
 * Export audit logs to CSV or JSON
 *
 * @param format - Export format (csv or json)
 * @param filters - Filter criteria
 * @returns Exported data as string
 */
export async function exportAuditLogs(
  format: 'csv' | 'json',
  filters: AuditLogFilters = {}
): Promise<string> {
  // Query all matching logs (no pagination limit for exports)
  const result = await getAuditLogs(filters, { limit: 1000000, offset: 0 });

  if (format === 'json') {
    return JSON.stringify(result.logs, null, 2);
  }

  // CSV export
  const headers = [
    'id',
    'timestamp',
    'date',
    'user_id',
    'username',
    'action_type',
    'action_result',
    'resource_type',
    'resource_id',
    'resource_name',
    'ip_address',
    'user_agent',
    'request_id',
    'session_id',
    'details',
  ];

  const rows = result.logs.map((log) => [
    log.id,
    log.timestamp.toString(),
    new Date(log.timestamp).toISOString(),
    log.userId || '',
    log.username || '',
    log.actionType,
    log.actionResult,
    log.resourceType || '',
    log.resourceId || '',
    log.resourceName || '',
    log.ipAddress || '',
    log.userAgent || '',
    log.requestId || '',
    log.sessionId || '',
    log.details ? JSON.stringify(log.details).replace(/"/g, '""') : '',
  ]);

  const csvLines = [
    headers.join(','),
    ...rows.map((row) =>
      row
        .map((cell) => {
          const str = String(cell);
          // Escape quotes and wrap in quotes if contains comma/newline
          if (str.includes(',') || str.includes('\n') || str.includes('"')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        })
        .join(',')
    ),
  ];

  return csvLines.join('\n');
}

/**
 * Get retention policy for tenant (or global default)
 *
 * @param tenantId - Tenant ID (null for global default)
 * @returns Retention policy
 */
export async function getRetentionPolicy(
  tenantId: string | null = null
): Promise<AuditRetentionPolicy | null> {
  const db = getDatabase();

  // Try tenant-specific policy first, then fall back to global default
  const stmt = db.prepare(`
    SELECT id, tenant_id, retention_days, enabled, created_at, updated_at
    FROM audit_retention_policies
    WHERE tenant_id = @tenantId OR (tenant_id IS NULL AND @tenantId IS NULL)
    ORDER BY tenant_id DESC
    LIMIT 1
  `);

  const row = stmt.get({ tenantId }) as
    | {
        id: string;
        tenant_id: string | null;
        retention_days: number;
        enabled: number;
        created_at: string;
        updated_at: string;
      }
    | undefined;

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    tenantId: row.tenant_id,
    retentionDays: row.retention_days,
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Purge expired audit logs based on retention policy
 *
 * @param tenantId - Tenant ID (null for global)
 * @returns Number of logs purged
 */
export async function purgeExpiredLogs(tenantId: string | null = null): Promise<number> {
  const db = getDatabase();

  // Get retention policy
  const policy = await getRetentionPolicy(tenantId);

  if (!policy || !policy.enabled || policy.retentionDays === 0) {
    logger.debug('Audit log purging skipped (disabled or infinite retention)', { tenantId });
    return 0;
  }

  // Calculate cutoff timestamp
  const cutoffTimestamp = Date.now() - policy.retentionDays * 24 * 60 * 60 * 1000;

  logger.info('Purging expired audit logs', {
    tenantId,
    retentionDays: policy.retentionDays,
    cutoffDate: new Date(cutoffTimestamp).toISOString(),
  });

  // Delete expired logs
  const stmt = db.prepare(`
    DELETE FROM audit_logs
    WHERE timestamp < @cutoffTimestamp
  `);

  const result = stmt.run({ cutoffTimestamp });

  logger.info('Audit log purge complete', {
    tenantId,
    purgedCount: result.changes,
  });

  return result.changes;
}
