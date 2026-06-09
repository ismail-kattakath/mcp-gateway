/**
 * Audit Logging Types
 *
 * Type definitions for audit trail system.
 *
 * Related: Epic #22 (Audit Logging)
 */

/**
 * Audit action types (enum-like constants)
 */
export enum AuditActionType {
  // Authentication events
  AUTH_LOGIN = 'auth.login',
  AUTH_LOGOUT = 'auth.logout',
  AUTH_LOGIN_FAILED = 'auth.login.failed',
  AUTH_TOKEN_REFRESH = 'auth.token.refresh',
  AUTH_PASSWORD_CHANGE = 'auth.password.change',
  AUTH_PASSWORD_RESET = 'auth.password.reset',

  // Authorization events
  AUTHZ_PERMISSION_GRANTED = 'authz.permission.granted',
  AUTHZ_PERMISSION_DENIED = 'authz.permission.denied',
  AUTHZ_ROLE_ASSIGNED = 'authz.role.assigned',
  AUTHZ_ROLE_REMOVED = 'authz.role.removed',

  // Server management events
  SERVER_CREATED = 'server.created',
  SERVER_UPDATED = 'server.updated',
  SERVER_DELETED = 'server.deleted',
  SERVER_STARTED = 'server.started',
  SERVER_STOPPED = 'server.stopped',
  SERVER_RESTARTED = 'server.restarted',
  SERVER_ENABLED = 'server.enabled',
  SERVER_DISABLED = 'server.disabled',

  // User management events
  USER_CREATED = 'user.created',
  USER_UPDATED = 'user.updated',
  USER_DELETED = 'user.deleted',
  USER_LOCKED = 'user.locked',
  USER_UNLOCKED = 'user.unlocked',

  // Configuration events
  CONFIG_UPDATED = 'config.updated',
  CONFIG_EXPORTED = 'config.exported',
  CONFIG_IMPORTED = 'config.imported',

  // API key events
  APIKEY_CREATED = 'apikey.created',
  APIKEY_ROTATED = 'apikey.rotated',
  APIKEY_DELETED = 'apikey.deleted',

  // OAuth provider events
  OAUTH_PROVIDER_CREATED = 'oauth.provider.created',
  OAUTH_PROVIDER_UPDATED = 'oauth.provider.updated',
  OAUTH_PROVIDER_DELETED = 'oauth.provider.deleted',

  // SAML provider events
  SAML_PROVIDER_CREATED = 'saml.provider.created',
  SAML_PROVIDER_UPDATED = 'saml.provider.updated',
  SAML_PROVIDER_DELETED = 'saml.provider.deleted',

  // LDAP provider events
  LDAP_PROVIDER_CREATED = 'ldap.provider.created',
  LDAP_PROVIDER_UPDATED = 'ldap.provider.updated',
  LDAP_PROVIDER_DELETED = 'ldap.provider.deleted',

  // Firewall events
  FIREWALL_RULE_CREATED = 'firewall.rule.created',
  FIREWALL_RULE_UPDATED = 'firewall.rule.updated',
  FIREWALL_RULE_DELETED = 'firewall.rule.deleted',
  FIREWALL_RULE_TRIGGERED = 'firewall.rule.triggered',

  // System events
  SYSTEM_STARTED = 'system.started',
  SYSTEM_STOPPED = 'system.stopped',
  SYSTEM_ERROR = 'system.error',
}

/**
 * Audit action result
 */
export type AuditActionResult = 'success' | 'failure';

/**
 * Audit log entry (internal representation)
 */
export interface AuditLogEntry {
  id: string;
  timestamp: number; // Unix timestamp in milliseconds

  // Actor
  userId?: string;
  username?: string;

  // Action
  actionType: AuditActionType | string;
  actionResult: AuditActionResult;

  // Target
  resourceType?: string;
  resourceId?: string;
  resourceName?: string;

  // Context
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  sessionId?: string;

  // Details
  details?: Record<string, unknown>;

  // Integrity
  previousHash?: string;
  entryHash?: string;
}

/**
 * Audit log filter parameters
 */
export interface AuditLogFilters {
  userId?: string;
  username?: string;
  actionType?: string | string[];
  actionResult?: AuditActionResult;
  resourceType?: string;
  resourceId?: string;
  ipAddress?: string;
  startDate?: string; // ISO 8601
  endDate?: string; // ISO 8601
}

/**
 * Pagination parameters
 */
export interface PaginationParams {
  limit?: number;
  offset?: number;
  sortBy?: 'timestamp' | 'action_type' | 'user_id';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Audit log query result
 */
export interface AuditLogQueryResult {
  logs: AuditLogEntry[];
  total: number;
  hasMore: boolean;
}

/**
 * Audit log integrity check result
 */
export interface AuditIntegrityResult {
  valid: boolean;
  totalEntries: number;
  errors: Array<{
    entryId: string;
    timestamp: number;
    error: string;
  }>;
}

/**
 * Audit retention policy
 */
export interface AuditRetentionPolicy {
  id: string;
  tenantId: string | null; // NULL = global default
  retentionDays: number; // 0 = forever
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Audit export request
 */
export interface AuditExportRequest {
  format: 'csv' | 'json';
  filters?: AuditLogFilters;
}

/**
 * Audit export record (database)
 */
export interface AuditExportRecord {
  id: string;
  userId: string;
  username: string;
  format: 'csv' | 'json';
  startDate?: string;
  endDate?: string;
  filters?: string; // JSON string
  status: 'pending' | 'completed' | 'failed';
  filePath?: string;
  fileSize?: number;
  recordCount?: number;
  error?: string;
  createdAt: string;
  completedAt?: string;
}

/**
 * Audit log statistics
 */
export interface AuditLogStats {
  totalEntries: number;
  entriesByAction: Record<string, number>;
  entriesByResult: Record<AuditActionResult, number>;
  entriesByUser: Array<{ userId: string; username: string; count: number }>;
  failedLogins: number;
  recentActivity: AuditLogEntry[];
}
