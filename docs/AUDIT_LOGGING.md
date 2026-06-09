# Audit Logging

**Epic #22 - Comprehensive Audit Trail for Security Events and Administrative Actions**

## Overview

MCP Gateway includes a comprehensive audit logging system that captures all security-relevant events and administrative actions. The audit trail provides:

- **Tamper-proof logging** with cryptographic hash chain integrity
- **Complete event capture** for authentication, authorization, and resource management
- **Compliance-ready exports** in CSV and JSON formats
- **Flexible querying** with filters, pagination, and search
- **Retention policies** with automatic log purging
- **Admin-only access** via RBAC enforcement

## Architecture

### Hash Chain Integrity

Each audit log entry includes a cryptographic hash that links it to the previous entry, creating an immutable chain:

```
Entry 1: hash(id + timestamp + action + resource + "")
Entry 2: hash(id + timestamp + action + resource + Entry1.hash)
Entry 3: hash(id + timestamp + action + resource + Entry2.hash)
```

**Properties:**

- **Tamper detection**: Any modification to an entry breaks the hash chain
- **Deletion detection**: Removing entries breaks the chain
- **Insertion detection**: Out-of-order insertions are detected during verification

### Database Schema

```sql
CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,              -- UUID v4
  timestamp INTEGER NOT NULL,       -- Unix timestamp (ms)

  -- Actor
  user_id TEXT,                     -- Foreign key to users
  username TEXT,                    -- Cached username

  -- Action
  action_type TEXT NOT NULL,        -- Enum: auth.login, server.created, etc.
  action_result TEXT NOT NULL,      -- success | failure

  -- Target
  resource_type TEXT,               -- server, user, role, etc.
  resource_id TEXT,                 -- ID of affected resource
  resource_name TEXT,               -- Cached name

  -- Context
  ip_address TEXT,                  -- Client IP
  user_agent TEXT,                  -- User agent string
  request_id TEXT,                  -- Trace ID
  session_id TEXT,                  -- Session identifier

  -- Details
  details TEXT,                     -- JSON: additional context

  -- Integrity
  previous_hash TEXT,               -- Hash of previous entry
  entry_hash TEXT NOT NULL          -- SHA256 hash chain
);
```

## Action Types

Audit events are categorized by action type using a hierarchical namespace:

### Authentication Events

- `auth.login` - Successful login
- `auth.logout` - User logout
- `auth.login.failed` - Failed login attempt
- `auth.token.refresh` - Access token refreshed
- `auth.password.change` - Password changed
- `auth.password.reset` - Password reset

### Authorization Events

- `authz.permission.granted` - Permission check passed
- `authz.permission.denied` - Permission check failed
- `authz.role.assigned` - Role assigned to user
- `authz.role.removed` - Role removed from user

### Server Management Events

- `server.created` - MCP server created
- `server.updated` - Server configuration updated
- `server.deleted` - Server deleted
- `server.started` - Server started
- `server.stopped` - Server stopped
- `server.restarted` - Server restarted
- `server.enabled` - Server enabled
- `server.disabled` - Server disabled

### User Management Events

- `user.created` - User account created
- `user.updated` - User account updated
- `user.deleted` - User account deleted
- `user.locked` - User account locked
- `user.unlocked` - User account unlocked

### Configuration Events

- `config.updated` - Gateway configuration updated
- `config.exported` - Configuration exported
- `config.imported` - Configuration imported

### API Key Events

- `apikey.created` - API key generated
- `apikey.rotated` - API key rotated
- `apikey.deleted` - API key deleted

### System Events

- `system.started` - Gateway started
- `system.stopped` - Gateway stopped
- `system.error` - System error occurred

## REST API

All audit log endpoints require **admin role** (enforced via CASL).

### List Audit Logs

```http
GET /api/audit-logs
```

**Query Parameters:**

- `user_id` - Filter by user ID
- `username` - Filter by username (partial match)
- `action_type` - Filter by action type (supports wildcards: `auth.*`)
- `action_result` - Filter by result (`success`, `failure`)
- `resource_type` - Filter by resource type
- `resource_id` - Filter by resource ID
- `ip_address` - Filter by IP address
- `start_date` - Filter by start date (ISO 8601)
- `end_date` - Filter by end date (ISO 8601)
- `limit` - Results per page (default: 100, max: 1000)
- `offset` - Pagination offset (default: 0)
- `sort_by` - Sort field (`timestamp`, `action_type`, `user_id`)
- `sort_order` - Sort order (`asc`, `desc`)

**Example:**

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/audit-logs?action_type=auth.*&limit=50"
```

**Response:**

```json
{
  "logs": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "timestamp": 1704067200000,
      "userId": "user-123",
      "username": "alice",
      "actionType": "auth.login",
      "actionResult": "success",
      "ipAddress": "192.168.1.100",
      "userAgent": "Mozilla/5.0...",
      "entryHash": "abc123..."
    }
  ],
  "pagination": {
    "total": 1234,
    "limit": 50,
    "offset": 0,
    "hasMore": true
  }
}
```

### Export Audit Logs

```http
GET /api/audit-logs/export
```

**Query Parameters:**

- `format` - Export format (`csv`, `json`) **[required]**
- All filter parameters from list endpoint

**Example:**

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/audit-logs/export?format=csv&start_date=2024-01-01" \
  -o audit-logs.csv
```

### Verify Integrity

```http
GET /api/audit-logs/verify
```

Walks all logs in chronological order and verifies hash chain integrity.

**Response:**

```json
{
  "valid": true,
  "totalEntries": 5432,
  "errorCount": 0,
  "errors": []
}
```

**If tampering is detected:**

```json
{
  "valid": false,
  "totalEntries": 5432,
  "errorCount": 3,
  "errors": [
    {
      "entryId": "550e8400-e29b-41d4-a716-446655440000",
      "timestamp": 1704067200000,
      "error": "Entry hash mismatch (expected: abc123..., got: def456...)"
    }
  ]
}
```

### Get Statistics

```http
GET /api/audit-logs/stats
```

Returns aggregated statistics and recent activity.

**Response:**

```json
{
  "totalEntries": 5432,
  "entriesByAction": {
    "auth.login": 1234,
    "server.created": 567,
    "user.updated": 321
  },
  "entriesByResult": {
    "success": 5100,
    "failure": 332
  },
  "entriesByUser": [
    { "userId": "user-1", "username": "alice", "count": 456 },
    { "userId": "user-2", "username": "bob", "count": 234 }
  ],
  "failedLogins": 42,
  "recentActivity": [
    /* last 20 log entries */
  ]
}
```

## CLI Commands

All CLI commands require admin credentials (configured via `mcp auth`).

### List Logs

```bash
# List all audit logs
mcp audit list

# Filter by user
mcp audit list --user alice --limit 50

# Filter by action type (wildcard support)
mcp audit list --action "auth.*"

# Filter by date range
mcp audit list --start "2024-01-01" --end "2024-12-31"

# Filter by resource
mcp audit list --resource-type server --result failure

# Output as JSON
mcp audit list --json
```

### Export Logs

```bash
# Export to CSV
mcp audit export --format csv --output logs.csv

# Export to JSON
mcp audit export --format json --output logs.json

# Export with filters
mcp audit export --format csv --action "server.*" --start "2024-01-01"
```

### Verify Integrity

```bash
# Check hash chain integrity
mcp audit verify

# Output as JSON
mcp audit verify --json
```

### Statistics

```bash
# Show statistics dashboard
mcp audit stats

# Output as JSON
mcp audit stats --json
```

## Programmatic Usage

### Creating Audit Logs

```typescript
import { createAuditLog } from "./audit/service.js";
import { AuditActionType } from "./types/audit.js";

// Log authentication event
await createAuditLog({
  userId: "user-123",
  username: "alice",
  actionType: AuditActionType.AUTH_LOGIN,
  actionResult: "success",
  ipAddress: req.ip,
  userAgent: req.get("user-agent"),
});

// Log resource creation
await createAuditLog({
  userId: "user-123",
  username: "alice",
  actionType: AuditActionType.SERVER_CREATED,
  actionResult: "success",
  resourceType: "server",
  resourceId: "server-1",
  resourceName: "my-mcp-server",
  details: {
    source: "pkg",
    package: "@modelcontextprotocol/server-filesystem",
  },
});

// Log authorization denial
await createAuditLog({
  userId: "user-123",
  username: "alice",
  actionType: AuditActionType.AUTHZ_PERMISSION_DENIED,
  actionResult: "failure",
  details: {
    action: "delete",
    resource: "server/server-2",
    reason: "insufficient_permissions",
  },
});
```

### Using Audit Middleware

The audit middleware automatically captures context from Express requests:

```typescript
import { auditLog, setAuditContext } from "./audit/middleware.js";
import { AuditActionType } from "./types/audit.js";

// In route handler
app.post("/api/servers", authenticate(), async (req, res) => {
  // Set audit context (logged after response)
  setAuditContext(
    req,
    AuditActionType.SERVER_CREATED,
    "server",
    serverId,
    serverName,
  );

  // ... handle request

  res.json({ id: serverId });
});

// Or log immediately
app.delete("/api/servers/:id", authenticate(), async (req, res) => {
  await auditLog(
    req,
    AuditActionType.SERVER_DELETED,
    "success",
    "server",
    req.params.id,
  );

  res.status(204).send();
});
```

## Retention Policies

Audit logs are automatically purged based on retention policies.

### Default Policy

- **Retention period**: 90 days
- **Global scope**: Applies to all tenants
- **Configurable**: Can be updated per-tenant

### Configuration

Retention policies are stored in the `audit_retention_policies` table:

```sql
CREATE TABLE audit_retention_policies (
  id TEXT PRIMARY KEY,
  tenant_id TEXT UNIQUE,            -- NULL for global default
  retention_days INTEGER NOT NULL,  -- 0 = keep forever
  enabled INTEGER NOT NULL,         -- 1=enabled
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### Purging Logs

Logs are purged automatically via a scheduled job (cron). Manual purge:

```typescript
import { purgeExpiredLogs } from "./audit/service.js";

// Purge expired logs for global tenant
const purgedCount = await purgeExpiredLogs(null);
console.log(`Purged ${purgedCount} expired logs`);

// Purge for specific tenant
await purgeExpiredLogs("tenant-1");
```

## Security Considerations

### Immutability

Audit logs are **write-only** after creation:

- No `UPDATE` operations after insertion
- No `DELETE` operations (except retention-based purge)
- Foreign key `ON DELETE SET NULL` preserves logs when users are deleted

### Access Control

- **Read access**: Admin role only (enforced via CASL)
- **Write access**: Automatic via middleware (no direct API)
- **API endpoints**: All require `admin` role

### Tamper Detection

Hash chain verification detects:

1. **Modified entries**: Entry hash mismatch
2. **Deleted entries**: Broken chain (missing previous_hash)
3. **Inserted entries**: Out-of-order previous_hash values

Run verification regularly:

```bash
mcp audit verify
```

If tampering is detected:

1. Investigate recent database access logs
2. Review user permissions and credentials
3. Check for unauthorized database modifications
4. Consider forensic analysis of database backups

### Data Protection

- **Sensitive data**: Sanitized before logging (prevents log injection)
- **PII**: Minimal personally identifiable information stored
- **Encryption**: Database can be encrypted at rest (SQLite extension)
- **Backups**: Audit logs included in database backups

## Compliance

### GDPR

- **Right to access**: Export logs for specific user via `user_id` filter
- **Right to deletion**: User deletion sets `user_id` to NULL (preserves audit trail)
- **Data minimization**: Only essential fields stored
- **Retention**: Configurable retention policy (default 90 days)

### SOC 2

- **Access logs**: All authentication and authorization events captured
- **Change logs**: All resource modifications logged
- **Integrity**: Cryptographic hash chain prevents tampering
- **Retention**: Configurable per-tenant policies

### HIPAA

- **Audit controls**: Complete audit trail of all system access
- **Access monitoring**: Failed login attempts tracked
- **Data integrity**: Hash chain verifies log integrity
- **Retention**: Supports 6-year retention requirement (set `retention_days=2190`)

## Query Examples

### Failed Login Attempts

```sql
SELECT * FROM audit_logs
WHERE action_type = 'auth.login.failed'
  AND timestamp > (strftime('%s', 'now') - 86400) * 1000
ORDER BY timestamp DESC;
```

### User Activity Timeline

```sql
SELECT
  datetime(timestamp/1000, 'unixepoch') as date,
  action_type,
  resource_type,
  resource_name,
  action_result
FROM audit_logs
WHERE user_id = 'user-123'
ORDER BY timestamp DESC
LIMIT 100;
```

### Administrative Actions

```sql
SELECT * FROM audit_logs
WHERE action_type LIKE 'server.%'
   OR action_type LIKE 'user.%'
   OR action_type LIKE 'config.%'
ORDER BY timestamp DESC;
```

### Failed Authorization Events

```sql
SELECT
  username,
  action_type,
  details,
  timestamp
FROM audit_logs
WHERE action_type = 'authz.permission.denied'
ORDER BY timestamp DESC;
```

## Performance

### Indexing

The following indexes optimize common queries:

- `idx_audit_logs_timestamp` - Date range queries
- `idx_audit_logs_user_id` - User-specific queries
- `idx_audit_logs_username` - Username search
- `idx_audit_logs_action_type` - Action filtering
- `idx_audit_logs_resource` - Resource-specific queries
- `idx_audit_logs_ip_address` - IP-based filtering

### Scalability

- **SQLite**: Suitable for up to 1M entries (typical small-to-medium deployments)
- **Partitioning**: For high-volume deployments, consider:
  - Daily/weekly log rotation
  - Archive old logs to separate databases
  - PostgreSQL migration for >10M entries

### Caching

Audit log queries are **not cached** (always fresh data for compliance).

## Troubleshooting

### Integrity Check Fails

**Symptoms**: `mcp audit verify` reports hash mismatches

**Causes**:

1. Direct database modification (e.g., SQLite CLI)
2. Database corruption
3. Concurrent writes without transactions

**Resolution**:

1. Review recent database access (check OS logs)
2. Restore from last known-good backup
3. Investigate unauthorized access

### Missing Logs

**Symptoms**: Expected events not in audit trail

**Causes**:

1. Middleware not applied to route
2. Database write failure (disk full)
3. Retention policy purged logs

**Resolution**:

1. Check route has `auditMiddleware()` applied
2. Verify disk space: `df -h`
3. Review retention policy: `SELECT * FROM audit_retention_policies`

### Performance Degradation

**Symptoms**: Slow audit log queries

**Causes**:

1. Large number of entries (>1M)
2. Missing indexes
3. Full table scans (no filters)

**Resolution**:

1. Add date range filters: `--start "2024-01-01"`
2. Verify indexes exist: `PRAGMA index_list('audit_logs')`
3. Archive old logs to separate database

## Best Practices

1. **Regular verification**: Run `mcp audit verify` daily (automate via cron)
2. **Export for compliance**: Regular exports for long-term retention
3. **Monitor failed logins**: Alert on >10 failed attempts in 1 hour
4. **Review admin actions**: Weekly review of `server.*`, `user.*`, `config.*` events
5. **Retention policies**: Set appropriate retention (90 days default, 6 years for HIPAA)
6. **Backup**: Include audit logs in database backups
7. **Access control**: Restrict admin role to trusted users only

## Migration from v2.x

If migrating from MCP Gateway v2.x (no audit logging):

1. **Database migration**: Runs automatically on first v3.0 startup
2. **Backfill logs**: No backfill (audit trail starts from v3.0 migration)
3. **API compatibility**: New endpoints (no breaking changes)

## References

- [Epic #22 Implementation Plan](../IMPLEMENTATION_PLAN.md#epic-22-audit-logging-32-sp)
- [Database Schema](../server/src/storage/migrations/005_add_audit_logs.sql)
- [REST API Reference](./API.md#audit-logs)
- [CLI Reference](../cli/README.md#audit-commands)
