-- Migration 005: Add Audit Logging
-- Related: Epic #22 (Audit Logging)
-- Created: 2026-06-09

-- ============================================================
-- 1. Audit Logs Table
-- ============================================================
-- Stores comprehensive audit trail for security events and admin actions

CREATE TABLE IF NOT EXISTS audit_logs (
  -- Identity
  id TEXT PRIMARY KEY,                                -- UUID v4
  timestamp INTEGER NOT NULL,                         -- Unix timestamp (ms)

  -- Actor (who did it)
  user_id TEXT,                                       -- Foreign key to users table (NULL for system/anonymous)
  username TEXT,                                      -- Cached username for query performance

  -- Action (what was done)
  action_type TEXT NOT NULL,                          -- Enum: auth.login, server.created, etc.
  action_result TEXT NOT NULL CHECK(action_result IN ('success', 'failure')),

  -- Target (what was affected)
  resource_type TEXT,                                 -- server, user, role, setting, etc.
  resource_id TEXT,                                   -- ID of affected resource
  resource_name TEXT,                                 -- Cached name for query performance

  -- Context
  ip_address TEXT,                                    -- Client IP address
  user_agent TEXT,                                    -- User agent string
  request_id TEXT,                                    -- Trace ID from OpenTelemetry/request
  session_id TEXT,                                    -- Session identifier

  -- Details
  details TEXT,                                       -- JSON: additional context (changes, errors, etc.)

  -- Integrity (for tamper detection)
  previous_hash TEXT,                                 -- SHA256 of previous log entry
  entry_hash TEXT NOT NULL,                           -- SHA256(id + timestamp + action + resource + previous_hash)

  -- Audit metadata
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_username ON audit_logs(username);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_type ON audit_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_result ON audit_logs(action_result);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_ip_address ON audit_logs(ip_address);
CREATE INDEX IF NOT EXISTS idx_audit_logs_request_id ON audit_logs(request_id);

-- ============================================================
-- 2. Audit Log Retention Configuration
-- ============================================================
-- Stores per-tenant retention policies for compliance

CREATE TABLE IF NOT EXISTS audit_retention_policies (
  -- Identity
  id TEXT PRIMARY KEY,                                -- UUID v4
  tenant_id TEXT UNIQUE,                              -- NULL for global default policy

  -- Retention settings
  retention_days INTEGER NOT NULL DEFAULT 90,         -- Days to keep audit logs (0 = forever)
  enabled INTEGER NOT NULL DEFAULT 1,                 -- Boolean (1=enabled)

  -- Audit
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Insert default global retention policy (90 days)
INSERT OR IGNORE INTO audit_retention_policies (id, tenant_id, retention_days, enabled)
VALUES ('00000000-0000-0000-0000-000000000000', NULL, 90, 1);

-- ============================================================
-- 3. Audit Log Exports
-- ============================================================
-- Tracks audit log export requests for compliance reporting

CREATE TABLE IF NOT EXISTS audit_exports (
  -- Identity
  id TEXT PRIMARY KEY,                                -- UUID v4

  -- Requester
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  username TEXT NOT NULL,

  -- Export parameters
  format TEXT NOT NULL CHECK(format IN ('csv', 'json')),
  start_date TEXT,                                    -- ISO 8601 (NULL = no filter)
  end_date TEXT,                                      -- ISO 8601 (NULL = no filter)
  filters TEXT,                                       -- JSON: {user_id, action_type, resource_type, etc.}

  -- Export metadata
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'completed', 'failed')),
  file_path TEXT,                                     -- Path to exported file (NULL if failed)
  file_size INTEGER,                                  -- File size in bytes
  record_count INTEGER,                               -- Number of records exported
  error TEXT,                                         -- Error message if failed

  -- Audit
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

-- Indexes for audit export tracking
CREATE INDEX IF NOT EXISTS idx_audit_exports_user_id ON audit_exports(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_exports_status ON audit_exports(status);
CREATE INDEX IF NOT EXISTS idx_audit_exports_created_at ON audit_exports(created_at);

-- ============================================================
-- DESIGN NOTES
-- ============================================================
-- 1. Immutable logs:
--    - No UPDATE or DELETE operations after creation
--    - Use foreign key ON DELETE SET NULL to preserve logs when users are deleted
--
-- 2. Hash chain integrity:
--    - Each entry includes SHA256(id + timestamp + action + resource + previous_hash)
--    - Verification walks logs chronologically and recomputes hashes
--    - Detects tampering, out-of-order insertion, or deleted entries
--
-- 3. Denormalized fields (username, resource_name):
--    - Cache values for query performance and resilience to deletions
--    - Even if user/resource is deleted, we retain who/what for audit trail
--
-- 4. Retention policies:
--    - Default 90 days (configurable per-tenant)
--    - Auto-purge via scheduled job (DELETE WHERE timestamp < now - retention)
--    - retention_days=0 means "keep forever" (for compliance requirements)
--
-- 5. Action types enum:
--    - Format: <category>.<action>[.<detail>]
--    - Examples: auth.login, auth.login.failed, server.created, user.deleted
--    - Allows wildcard filtering: "auth.*", "server.*"
--
-- 6. Details JSON field:
--    - Stores action-specific context: changed fields, error messages, etc.
--    - Sanitized to prevent log injection and PII leakage
--    - Example: {"changes": {"role": "user->admin"}, "reason": "promotion"}
--
-- ============================================================
-- QUERY EXAMPLES
-- ============================================================
-- 1. Get all failed login attempts in last 24h:
--    SELECT * FROM audit_logs
--    WHERE action_type = 'auth.login.failed'
--      AND timestamp > (strftime('%s', 'now') - 86400) * 1000
--    ORDER BY timestamp DESC;
--
-- 2. Get all actions by user in date range:
--    SELECT * FROM audit_logs
--    WHERE user_id = ?
--      AND timestamp BETWEEN ? AND ?
--    ORDER BY timestamp DESC;
--
-- 3. Get all admin actions (server/user management):
--    SELECT * FROM audit_logs
--    WHERE action_type LIKE 'server.%'
--       OR action_type LIKE 'user.%'
--    ORDER BY timestamp DESC;
--
-- 4. Verify log chain integrity:
--    SELECT id, entry_hash, previous_hash FROM audit_logs
--    ORDER BY timestamp ASC;
--    -- Compute hash for each and compare with stored entry_hash
--
-- ============================================================
