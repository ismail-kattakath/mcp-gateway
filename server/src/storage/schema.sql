-- MCP Gateway v3.0 Database Schema
-- Created: 2026-06-08
-- Related: Epic #13 (Storage Layer Migration), Issue #34

-- ============================================================
-- 1. SERVERS TABLE
-- ============================================================
-- Replaces the `servers` object in registry.json
-- Stores MCP server configurations with field-level encryption

CREATE TABLE IF NOT EXISTS servers (
  -- Identity
  id TEXT PRIMARY KEY,                      -- UUID v4
  name TEXT NOT NULL,                       -- Server name (lowercase, hyphens)

  -- Configuration
  source TEXT NOT NULL CHECK(source IN ('pkg', 'git', 'container', 'remote', 'local')),
  config TEXT NOT NULL,                     -- JSON-serialized Server config
  lifecycle TEXT DEFAULT 'on-demand' CHECK(lifecycle IN ('on-demand', 'persistent')),
  enabled INTEGER DEFAULT 1,                -- Boolean (1=enabled, 0=disabled)

  -- Multi-tenancy
  tenant TEXT,                              -- Multi-tenancy support (NULL = default tenant)

  -- Audit
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT,                          -- User ID (for RBAC)

  -- Constraints
  UNIQUE(name, tenant)                      -- Unique name per tenant
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_servers_source ON servers(source);
CREATE INDEX IF NOT EXISTS idx_servers_enabled ON servers(enabled);
CREATE INDEX IF NOT EXISTS idx_servers_tenant ON servers(tenant);
CREATE INDEX IF NOT EXISTS idx_servers_lifecycle ON servers(lifecycle);
CREATE INDEX IF NOT EXISTS idx_servers_name ON servers(name);

-- ============================================================
-- 2. USERS TABLE
-- ============================================================
-- Authentication and user management (Epic #16)

CREATE TABLE IF NOT EXISTS users (
  -- Identity
  id TEXT PRIMARY KEY,                      -- UUID v4
  username TEXT UNIQUE NOT NULL,            -- Login username
  email TEXT UNIQUE,                        -- Optional email

  -- Authentication
  password_hash TEXT NOT NULL,              -- bcrypt hash (rounds=12)

  -- Authorization
  role TEXT DEFAULT 'user' CHECK(role IN ('admin', 'user', 'readonly')),

  -- Multi-tenancy
  tenant TEXT,                              -- Multi-tenancy support

  -- Status
  status TEXT DEFAULT 'active' CHECK(status IN ('active', 'disabled', 'locked')),

  -- Audit
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- ============================================================
-- 3. API_KEYS TABLE
-- ============================================================
-- API key management with revocation support (Epic #16)

CREATE TABLE IF NOT EXISTS api_keys (
  -- Identity
  id TEXT PRIMARY KEY,                      -- UUID v4
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Key data
  key_hash TEXT UNIQUE NOT NULL,            -- bcrypt hash of API key
  key_prefix TEXT NOT NULL,                 -- First 8 chars (for display: "mcp_1234...")
  name TEXT,                                -- Human-readable key name (e.g., "CI/CD Key")

  -- Authorization
  permissions TEXT,                         -- JSON array of permissions (Epic #17)

  -- Multi-tenancy
  tenant TEXT,                              -- Multi-tenancy support

  -- Lifecycle
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT,                        -- Updated on each successful auth
  expires_at TEXT,                          -- NULL = never expires
  revoked INTEGER DEFAULT 0                 -- Boolean (1=revoked)
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_prefix ON api_keys(key_prefix);
CREATE INDEX IF NOT EXISTS idx_api_keys_tenant ON api_keys(tenant);
CREATE INDEX IF NOT EXISTS idx_api_keys_revoked ON api_keys(revoked);
CREATE INDEX IF NOT EXISTS idx_api_keys_expires_at ON api_keys(expires_at);

-- ============================================================
-- 4. SETTINGS TABLE
-- ============================================================
-- Replaces `gateway` object in registry.json + auth config from .mcp-gateway.json

CREATE TABLE IF NOT EXISTS settings (
  -- Identity
  key TEXT NOT NULL,                        -- Setting key (e.g., "server.port")

  -- Value
  value TEXT NOT NULL,                      -- Setting value (JSON for complex types)
  encrypted INTEGER DEFAULT 0,              -- Boolean (1=value is encrypted)

  -- Metadata
  category TEXT,                            -- Grouping (e.g., "server", "auth", "logging")
  description TEXT,                         -- Human-readable description

  -- Multi-tenancy
  tenant TEXT,                              -- Multi-tenancy support

  -- Audit
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by TEXT,                          -- User ID who last updated

  -- Constraints
  PRIMARY KEY(key, tenant)                  -- Unique key per tenant
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_settings_category ON settings(category);
CREATE INDEX IF NOT EXISTS idx_settings_tenant ON settings(tenant);
CREATE INDEX IF NOT EXISTS idx_settings_encrypted ON settings(encrypted);

-- ============================================================
-- 5. AUDIT_LOG TABLE
-- ============================================================
-- Compliance and security auditing (Epic #10)

CREATE TABLE IF NOT EXISTS audit_log (
  -- Identity
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Event
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  action TEXT NOT NULL,                     -- CREATE, UPDATE, DELETE, LOGIN, LOGOUT, START, STOP
  status TEXT CHECK(status IN ('success', 'failure')),

  -- Actor
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,

  -- Target
  resource_type TEXT NOT NULL,              -- server, user, api_key, setting
  resource_id TEXT,                         -- ID of affected resource

  -- Details
  changes TEXT,                             -- JSON diff (before/after)

  -- Context
  ip_address TEXT,                          -- Client IP
  user_agent TEXT,                          -- HTTP User-Agent

  -- Multi-tenancy
  tenant TEXT
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_resource_type ON audit_log(resource_type);
CREATE INDEX IF NOT EXISTS idx_audit_log_resource_id ON audit_log(resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_tenant ON audit_log(tenant);
CREATE INDEX IF NOT EXISTS idx_audit_log_status ON audit_log(status);

-- ============================================================
-- 6. REFRESH_TOKENS TABLE
-- ============================================================
-- JWT refresh token management (Epic #16)

CREATE TABLE IF NOT EXISTS refresh_tokens (
  -- Identity
  id TEXT PRIMARY KEY,                      -- UUID v4
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Token data
  token_hash TEXT UNIQUE NOT NULL,          -- SHA-256 hash of refresh token

  -- Context
  device_info TEXT,                         -- User-Agent or device name
  ip_address TEXT,                          -- IP where token was issued

  -- Lifecycle
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,                 -- 30 days from creation
  revoked INTEGER DEFAULT 0,                -- Boolean (1=revoked)

  -- Multi-tenancy
  tenant TEXT
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_revoked ON refresh_tokens(revoked);

-- ============================================================
-- DESIGN DECISIONS
-- ============================================================
-- 1. Field-level encryption: config.env, config.headers, config.build.args
--    Format: iv:authTag:ciphertext (AES-256-GCM)
--
-- 2. Multi-tenancy: NULL tenant = default/global
--    All tables support tenant isolation for future RBAC (Epic #17)
--
-- 3. Soft deletes: enabled=0 for servers, revoked=1 for api_keys/refresh_tokens
--    Audit trail preserved, resources can be restored
--
-- 4. Timestamps: TEXT format (ISO 8601) for portability
--    SQLite doesn't have native DATE type, TEXT is more portable
--
-- 5. Indexes: Optimized for common queries
--    - Lookup by name/username/key_hash (unique lookups)
--    - Filter by status/enabled/revoked (state queries)
--    - Range queries on timestamp/expires_at (cleanup queries)
--
-- 6. Foreign keys: ON DELETE CASCADE for api_keys/refresh_tokens
--    ON DELETE SET NULL for audit_log.user_id (preserve audit trail)
--
-- 7. CHECK constraints: Enforce valid enum values at DB level
--    Prevents invalid data from being inserted
--
-- ============================================================
-- ENCRYPTION STRATEGY
-- ============================================================
-- Encrypted fields (selective encryption within JSON):
--
-- servers.config:
--   - env: { "KEY": "encrypted:value" }
--   - headers: { "Authorization": "encrypted:Bearer ..." }
--   - build.args: ["--secret", "encrypted:value"]
--
-- settings.value (when encrypted=1):
--   - Any key matching: *_secret, *_key, *_token
--   - Examples: auth.jwt_secret, github_token
--
-- Format: iv:authTag:ciphertext
--   - iv: 16 bytes (hex)
--   - authTag: 16 bytes (hex)
--   - ciphertext: encrypted data (hex)
--
-- Algorithm: AES-256-GCM (authenticated encryption)
-- Key storage: Environment variable STORAGE_ENCRYPTION_KEY or system keychain
--
-- ============================================================
-- MIGRATION NOTES
-- ============================================================
-- 1. registry.json -> servers table
--    - Each servers[name] -> INSERT INTO servers
--    - Encrypt sensitive fields in config JSON
--    - Preserve lifecycle, enabled, timeout
--
-- 2. gateway config -> settings table
--    - server.port -> INSERT INTO settings (key='server.port')
--    - server.host -> INSERT INTO settings (key='server.host')
--    - etc.
--
-- 3. .mcp-gateway.json -> settings table
--    - auth.enabled -> INSERT INTO settings (key='auth.enabled')
--    - auth.ip_allowlist -> INSERT INTO settings (key='auth.ip_allowlist')
--
-- 4. Default admin user creation
--    - username: admin
--    - password: changeme (bcrypt)
--    - role: admin
--    - MUST prompt user to change on first login
--
-- ============================================================
-- RETENTION POLICY
-- ============================================================
-- audit_log: Keep 90 days by default (configurable via settings table)
-- Cleanup query:
--   DELETE FROM audit_log WHERE timestamp < datetime('now', '-90 days');
--
-- refresh_tokens: Auto-expire based on expires_at
-- Cleanup query:
--   DELETE FROM refresh_tokens WHERE expires_at < datetime('now') OR revoked = 1;
--
-- ============================================================
-- PERFORMANCE ESTIMATES
-- ============================================================
-- Typical deployment (50 servers, 10 users, 20 API keys):
--   - servers: 50 rows × 2 KB = 100 KB
--   - users: 10 rows × 0.5 KB = 5 KB
--   - api_keys: 20 rows × 0.5 KB = 10 KB
--   - settings: 50 rows × 0.3 KB = 15 KB
--   - audit_log: 10,000 rows × 0.5 KB = 5 MB (90 days)
--   - refresh_tokens: 20 rows × 0.5 KB = 10 KB
-- Total: ~5.14 MB (negligible)
--
-- Indexes add ~20% overhead: ~6.2 MB total
--
-- ============================================================
-- SECURITY CONSIDERATIONS
-- ============================================================
-- 1. SQL Injection: All queries use parameterized statements
--    Never construct SQL strings with user input
--
-- 2. Encryption keys: NEVER log encryption keys or plaintext secrets
--    Use sanitization in logging layer
--
-- 3. Password hashing: bcrypt with 12 rounds (OWASP recommended)
--    Use constant-time comparison for password verification
--
-- 4. API keys: bcrypt hash + constant-time comparison
--    Display only key_prefix to users (first 8 chars)
--
-- 5. Audit logging: Log ALL mutations (CREATE, UPDATE, DELETE)
--    Include user_id, IP, changes (before/after JSON diff)
--
-- 6. Token revocation: Check revoked flag on EVERY auth request
--    Don't cache token validity beyond 1 minute
--
-- ============================================================
-- 7. FIREWALL_RULES TABLE
-- ============================================================
-- IP filtering rules for network security (Epic #23)

CREATE TABLE IF NOT EXISTS firewall_rules (
  -- Identity
  id TEXT PRIMARY KEY,                      -- UUID v4

  -- Rule configuration
  ip_range TEXT NOT NULL,                   -- IP or CIDR (192.168.1.0/24, 10.0.0.1)
  rule_type TEXT NOT NULL CHECK(rule_type IN ('allow', 'deny')),
  description TEXT,                         -- Human-readable description

  -- Status
  enabled INTEGER DEFAULT 1,                -- Boolean (1=enabled, 0=disabled)

  -- Multi-tenancy
  tenant TEXT,                              -- Multi-tenancy support

  -- Audit
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT                           -- User ID
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_firewall_rules_rule_type ON firewall_rules(rule_type);
CREATE INDEX IF NOT EXISTS idx_firewall_rules_enabled ON firewall_rules(enabled);
CREATE INDEX IF NOT EXISTS idx_firewall_rules_tenant ON firewall_rules(tenant);
CREATE INDEX IF NOT EXISTS idx_firewall_rules_ip_range ON firewall_rules(ip_range);

-- ============================================================
-- END OF SCHEMA
-- ============================================================
