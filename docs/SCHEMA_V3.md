# SQLite Schema Design v3.0

**Created**: 2026-06-08  
**Status**: Draft (for review - Issue #34)  
**Related**: Epic #13 (Storage Layer Migration)

---

## Overview

This document defines the SQLite database schema for MCP Gateway v3.0, replacing the JSON-based `registry.json` storage.

**Key Features**:
- Field-level AES-256-GCM encryption for sensitive data
- Multi-tenancy support via `tenant` column
- Audit logging for compliance
- Backward-compatible migration from v2.x
- Performance-optimized indexes

---

## Schema Tables

### 1. `servers` Table

Replaces the `servers` object in registry.json.

```sql
CREATE TABLE IF NOT EXISTS servers (
  id TEXT PRIMARY KEY,                    -- UUID v4
  name TEXT UNIQUE NOT NULL,              -- Server name (lowercase, hyphens)
  source TEXT NOT NULL CHECK(source IN ('pkg', 'git', 'container', 'remote', 'local')),
  config TEXT NOT NULL,                   -- JSON-serialized Server config
  lifecycle TEXT DEFAULT 'on-demand' CHECK(lifecycle IN ('on-demand', 'persistent')),
  enabled INTEGER DEFAULT 1,              -- Boolean (1=enabled, 0=disabled)
  tenant TEXT,                            -- Multi-tenancy support (NULL = default tenant)
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  
  -- Indexes
  UNIQUE(name, tenant)                    -- Unique name per tenant
);

CREATE INDEX idx_servers_source ON servers(source);
CREATE INDEX idx_servers_enabled ON servers(enabled);
CREATE INDEX idx_servers_tenant ON servers(tenant);
CREATE INDEX idx_servers_lifecycle ON servers(lifecycle);
```

**Field Descriptions**:
- `id`: UUID v4 primary key (immutable)
- `name`: Server name from registry.json keys
- `source`: One of 5 server types (pkg, git, container, remote, local)
- `config`: Full server configuration as JSON (encrypted sensitive fields like env vars)
- `lifecycle`: on-demand (lazy-loaded) or persistent (always running)
- `enabled`: Soft-delete flag (disabled servers remain in DB but don't start)
- `tenant`: For multi-tenancy (Epic #17 RBAC & Multi-Tenancy)

**Encryption Strategy**:
- `config` field contains JSON with sensitive data
- Encrypt specific nested fields within JSON:
  - `env` values (API keys, secrets)
  - `headers` values (for RemoteServer)
  - Container `build.args` values

---

### 2. `users` Table

For authentication (Epic #16).

```sql
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,                    -- UUID v4
  username TEXT UNIQUE NOT NULL,          -- Login username
  email TEXT UNIQUE,                      -- Optional email
  password_hash TEXT NOT NULL,            -- bcrypt hash (rounds=12)
  role TEXT DEFAULT 'user' CHECK(role IN ('admin', 'user', 'readonly')),
  tenant TEXT,                            -- Multi-tenancy support
  status TEXT DEFAULT 'active' CHECK(status IN ('active', 'disabled', 'locked')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT
);

CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_tenant ON users(tenant);
CREATE INDEX idx_users_status ON users(status);
```

**Field Descriptions**:
- `password_hash`: bcrypt with 12 rounds (OWASP recommended)
- `role`: For basic RBAC (Epic #17 extends with fine-grained permissions)
- `status`: active (can login), disabled (soft-delete), locked (too many failed attempts)

---

### 3. `api_keys` Table

For API key management (Epic #16).

```sql
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,                    -- UUID v4
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT,                              -- Human-readable key name (e.g., "CI/CD Key")
  key_hash TEXT UNIQUE NOT NULL,          -- One-way hash of API key
  key_prefix TEXT NOT NULL,               -- First 8 chars (for display: "mcp_1234...")
  permissions TEXT,                       -- JSON array of permissions (Epic #17)
  tenant TEXT,                            -- Multi-tenancy support
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT,                      -- Updated on each successful auth
  expires_at TEXT,                        -- NULL = never expires
  revoked INTEGER DEFAULT 0               -- Boolean (1=revoked)
);

CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_tenant ON api_keys(tenant);
CREATE INDEX idx_api_keys_revoked ON api_keys(revoked);
```

**Field Descriptions**:
- `key_hash`: bcrypt hash of full API key (constant-time comparison)
- `key_prefix`: Display prefix (e.g., "mcp_12345678...")
- `permissions`: JSON array for fine-grained access (Epic #17 RBAC)
- `last_used_at`: For key rotation policies (warn if unused >90 days)

---

### 4. `settings` Table

Replaces `gateway` object in registry.json plus auth config from `.mcp-gateway.json`.

```sql
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,                   -- Setting key (e.g., "server.port")
  value TEXT NOT NULL,                    -- Setting value (JSON for complex types)
  encrypted INTEGER DEFAULT 0,            -- Boolean (1=value is encrypted)
  category TEXT,                          -- Grouping (e.g., "server", "auth", "logging")
  description TEXT,                       -- Human-readable description
  tenant TEXT,                            -- Multi-tenancy support
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  
  UNIQUE(key, tenant)                     -- Unique key per tenant
);

CREATE INDEX idx_settings_category ON settings(category);
CREATE INDEX idx_settings_tenant ON settings(tenant);
```

**Example Settings**:
```sql
-- Server settings
INSERT INTO settings (key, value, category) VALUES 
  ('server.port', '3000', 'server'),
  ('server.host', '0.0.0.0', 'server'),
  ('server.transport', 'sse', 'server');

-- Auth settings (from .mcp-gateway.json)
INSERT INTO settings (key, value, category, encrypted) VALUES
  ('auth.enabled', 'true', 'auth', 0),
  ('auth.jwt_secret', '<encrypted>', 'auth', 1),
  ('auth.ip_allowlist', '["192.168.1.0/24"]', 'auth', 0);
```

**Encryption Strategy**:
- Encrypt sensitive settings:
  - `auth.jwt_secret`
  - `auth.jwt_refresh_secret`
  - Any setting ending in `_secret`, `_key`, `_token`

---

### 5. `audit_log` Table

For compliance and security auditing (Epic #10).

```sql
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,                   -- CREATE, UPDATE, DELETE, LOGIN, LOGOUT
  resource_type TEXT NOT NULL,            -- server, user, api_key, setting
  resource_id TEXT,                       -- ID of affected resource
  changes TEXT,                           -- JSON diff (before/after)
  ip_address TEXT,                        -- Client IP
  user_agent TEXT,                        -- HTTP User-Agent
  status TEXT CHECK(status IN ('success', 'failure')),
  tenant TEXT
);

CREATE INDEX idx_audit_log_timestamp ON audit_log(timestamp);
CREATE INDEX idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX idx_audit_log_action ON audit_log(action);
CREATE INDEX idx_audit_log_resource_type ON audit_log(resource_type);
CREATE INDEX idx_audit_log_tenant ON audit_log(tenant);
```

**Retention Policy**:
- Keep 90 days by default (configurable)
- Archival via backup/restore (Issue #88)

---

### 6. `refresh_tokens` Table

For JWT refresh token management (Epic #16).

```sql
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id TEXT PRIMARY KEY,                    -- UUID v4
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,        -- One-way hash of refresh token
  device_info TEXT,                       -- User-Agent or device name
  ip_address TEXT,                        -- IP where token was issued
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,               -- 30 days from creation
  revoked INTEGER DEFAULT 0,              -- Boolean (1=revoked)
  tenant TEXT
);

CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);
CREATE INDEX idx_refresh_tokens_revoked ON refresh_tokens(revoked);
```

---

## Migration from v2.x

### Phase 1: Servers Migration

```typescript
// Pseudo-code for Issue #61
for (const [name, server] of Object.entries(registry.servers)) {
  const id = uuidv4();
  const config = JSON.stringify(server);
  
  // Encrypt sensitive fields in config
  const encryptedConfig = encryptSensitiveFields(config);
  
  await db.run(`
    INSERT INTO servers (id, name, source, config, lifecycle, enabled)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [id, name, server.source, encryptedConfig, server.lifecycle || 'on-demand', server.enabled ? 1 : 0]);
}
```

### Phase 2: Settings Migration

```typescript
// Migrate gateway config
if (registry.gateway) {
  const { server, storage, logging } = registry.gateway;
  
  await db.run(`INSERT INTO settings (key, value, category) VALUES 
    ('server.port', ?, 'server'),
    ('server.host', ?, 'server'),
    ('server.transport', ?, 'server')
  `, [server.port, server.host, server.transport]);
}

// Migrate auth config from .mcp-gateway.json
const authConfig = await loadAuthConfig();
if (authConfig) {
  await db.run(`INSERT INTO settings (key, value, category, encrypted) VALUES
    ('auth.enabled', ?, 'auth', 0),
    ('auth.ip_allowlist', ?, 'auth', 0)
  `, [authConfig.enabled, JSON.stringify(authConfig.allowedIPs)]);
}
```

### Phase 3: Create Default Admin User

```typescript
const defaultUser = {
  id: uuidv4(),
  username: 'admin',
  password_hash: await bcrypt.hash('changeme', 12),
  role: 'admin',
  status: 'active'
};

await db.run(`
  INSERT INTO users (id, username, password_hash, role, status)
  VALUES (?, ?, ?, ?, ?)
`, [defaultUser.id, defaultUser.username, defaultUser.password_hash, defaultUser.role, defaultUser.status]);

console.log('Default admin user created: admin / changeme (CHANGE THIS!)');
```

---

## Encryption Implementation

### Encrypted Fields

**`servers.config`** (selective field encryption):
- `env` values
- `headers` values (RemoteServer)
- `build.args` values (ContainerServer)

**`settings.value`** (when `encrypted=1`):
- Any setting with key matching `*_secret`, `*_key`, `*_token`

### Encryption Format

```
iv:authTag:ciphertext
```

Where:
- `iv`: 16-byte initialization vector (hex)
- `authTag`: 16-byte authentication tag (hex)
- `ciphertext`: Encrypted data (hex)

**Algorithm**: AES-256-GCM

**Key Storage**: See Issue #37 (Field-Level Encryption Helper)

---

## Performance Considerations

### Indexes

All indexes designed for common query patterns:
- `servers`: Lookup by name, filter by source/enabled/tenant
- `users`: Lookup by username, filter by tenant/status
- `api_keys`: Lookup by hash, filter by user/tenant/revoked
- `audit_log`: Range queries by timestamp, filter by user/action/resource

### Query Examples

**Get enabled servers for tenant**:
```sql
SELECT * FROM servers 
WHERE enabled = 1 AND (tenant = ? OR tenant IS NULL)
ORDER BY name;
```

**Audit trail for user**:
```sql
SELECT * FROM audit_log 
WHERE user_id = ? 
ORDER BY timestamp DESC 
LIMIT 100;
```

**Find stale API keys (unused >90 days)**:
```sql
SELECT * FROM api_keys 
WHERE revoked = 0 
  AND last_used_at < datetime('now', '-90 days')
ORDER BY last_used_at;
```

---

## Database Size Estimates

**Typical deployment** (50 servers, 10 users, 20 API keys):
- `servers`: ~50 rows × 2 KB = 100 KB
- `users`: ~10 rows × 0.5 KB = 5 KB
- `api_keys`: ~20 rows × 0.5 KB = 10 KB
- `settings`: ~50 rows × 0.3 KB = 15 KB
- `audit_log`: ~10,000 rows × 0.5 KB = 5 MB (90 days)

**Total**: ~5.13 MB (negligible)

---

## Next Steps

1. **Review schema** with security team (encryption strategy)
2. **Validate indexes** with DBA (performance)
3. **Implement** in Issue #46 (SQLite Integration)
4. **Test migration** in Issue #61 (Auto-Migration)

---

**Status**: Draft - Awaiting review  
**Related Issues**: #34, #37, #44, #46, #61
