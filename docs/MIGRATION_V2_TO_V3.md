# Migration Guide: v2.x to v3.0

This guide provides comprehensive instructions for migrating MCP Gateway from v2.x to v3.0.

## Table of Contents

- [Overview](#overview)
- [What's New in v3.0](#whats-new-in-v30)
- [Breaking Changes](#breaking-changes)
- [Migration Options](#migration-options)
  - [Option 1: Automated Migration](#option-1-automated-migration-recommended)
  - [Option 2: Manual Migration](#option-2-manual-migration)
  - [Option 3: Fresh Installation](#option-3-fresh-installation)
- [Post-Migration Verification](#post-migration-verification)
- [Rollback Procedures](#rollback-procedures)
- [Compatibility Mode](#compatibility-mode)
- [FAQ](#faq)

---

## Overview

MCP Gateway v3.0 is a major release that introduces enhanced security, improved performance, and better developer experience. While most changes are backward compatible, this guide will help you migrate smoothly.

**Migration Time**: ~5-15 minutes depending on your configuration complexity.

**Downtime**: Zero downtime if using compatibility mode during migration.

---

## What's New in v3.0

### Major Features

1. **Enhanced Security Hardening**
   - Comprehensive input validation (OWASP Top 10, CWE Top 25)
   - Rate limiting with configurable thresholds
   - Security headers (CSP, HSTS, X-Frame-Options)
   - Secrets management with multi-provider support
   - Container security hardening (seccomp, non-root, read-only FS)

2. **Storage Layer & Persistence**
   - SQLite-based configuration and state persistence
   - Audit logging for all operations
   - Database migrations with version tracking

3. **Advanced Authentication**
   - RBAC (Role-Based Access Control)
   - OAuth 2.0 / OIDC integration
   - SAML 2.0 support
   - LDAP integration
   - Kerberos & mTLS authentication

4. **Network Security**
   - Firewall rules engine with CIDR support
   - Geographic IP filtering
   - DDoS protection with rate limiting
   - Network isolation for container servers

5. **Observability**
   - Distributed tracing (OpenTelemetry)
   - HTTP/2 with Server Push
   - Performance metrics and health checks

6. **CLI Improvements**
   - Migrated to oclif framework
   - Rich interactive commands
   - Built-in migration tools

### Schema Changes

- **Version field**: Now explicitly required (`"version": "3.0"`)
- **Registry structure**: Unchanged from v2.1 (backward compatible)
- **Auth configuration**: Remains in `.mcp-gateway.json` (v2.1 pattern)
- **Database schema**: New tables for audit logs, RBAC, auth providers

---

## Breaking Changes

### 1. Version Field Requirement

**v2.x**: Version field was optional (detected via heuristics)

```json
{
  "servers": { ... }
}
```

**v3.0**: Version field is required

```json
{
  "version": "3.0",
  "servers": { ... }
}
```

**Impact**: Low (auto-upgrade handles this)

**Workaround**: Run `mcp migrate from-v2` or add version field manually.

---

### 2. Database Schema

**v2.x**: No database (configuration only)

**v3.0**: SQLite database for persistence, audit logs, RBAC

**Impact**: Medium (new installations only)

**Workaround**: Database is auto-created on first run. Existing v2 users migrating from file-based config will have data migrated.

---

### 3. CLI Command Structure

**v2.x**: Commander-based CLI with flat command structure

**v3.0**: oclif-based CLI with nested commands and topics

**Impact**: Low (most commands remain the same)

**Examples**:

```bash
# v2.x
mcp servers list
mcp auth enable

# v3.0 (same)
mcp servers list
mcp auth enable

# New commands in v3.0
mcp migrate from-v2
mcp registry version
mcp db migrate
mcp secrets set
```

---

### 4. Environment Variables

**New in v3.0**:

- `ENABLE_V2_COMPAT`: Enable backward compatibility layer (default: `false`)
- `SECRETS_PROVIDER`: Secrets backend (`keychain`, `vault`, `aws`, `azure`) (default: `keychain`)

**Unchanged**: All v2.x environment variables are still supported.

---

### 5. API Endpoints

**No breaking changes**. All v2.x API endpoints remain functional in v3.0.

**New endpoints in v3.0**:

- `POST /api/auth/roles` - RBAC role management
- `POST /api/auth/oauth/providers` - OAuth provider configuration
- `GET /api/audit/logs` - Audit log retrieval
- `POST /api/firewall/rules` - Firewall rule management
- `GET /api/metrics` - OpenTelemetry metrics

---

## Migration Options

### Option 1: Automated Migration (Recommended)

Use the built-in migration tool for zero-downtime migration.

#### Step 1: Backup Your Data

```bash
# Backup registry
cp registry.json registry.json.backup

# Backup auth config (if exists)
cp .mcp-gateway.json .mcp-gateway.json.backup

# Backup database (if exists)
cp gateway.db gateway.db.backup
```

#### Step 2: Run Migration

```bash
# Preview changes (dry-run)
mcp migrate from-v2 --registry registry.json --dry-run

# Run actual migration
mcp migrate from-v2 --registry registry.json
```

**What this does**:

1. Detects your registry version (v2.0 or v2.1)
2. Converts `mcpServers` → `servers` (if v2.0)
3. Updates version field to `3.0`
4. Extracts auth config to `.mcp-gateway.json` (if embedded in v2.0)
5. Creates `.v2.backup` copies automatically

#### Step 3: Verify Migration

```bash
# Check registry version
mcp registry version

# Verify servers are listed
mcp servers list

# Check health
mcp health
```

#### Step 4: Migrate Database (if upgrading existing installation)

```bash
# Check current database version
mcp db migrate --to-version 3

# This will apply incremental migrations:
# - Create audit_log table
# - Create roles and permissions tables
# - Create oauth_providers table
# - etc.
```

#### Step 5: Restart Gateway

```bash
# Restart to load v3.0 configuration
mcp servers restart <server-name>

# Or restart entire gateway
npm start
```

---

### Option 2: Manual Migration

For users who prefer manual control.

#### Step 1: Update Version Field

Edit `registry.json`:

```diff
 {
-  "version": "2.1",
+  "version": "3.0",
   "servers": { ... }
 }
```

#### Step 2: Convert v2.0 Structure (if applicable)

If you're on v2.0 with `mcpServers`:

```diff
 {
-  "version": "2.0",
-  "mcpServers": {
+  "version": "3.0",
+  "servers": {
     "filesystem": { ... },
     "observatory": { ... }
   }
 }
```

#### Step 3: Extract Auth Config (if embedded)

If your v2.0 `gateway` object has `disableAuth` or `allowedIPs`, extract them:

**Before** (`registry.json`):

```json
{
  "gateway": {
    "disableAuth": false,
    "allowedIPs": ["192.168.1.0/24"]
  }
}
```

**After** (`.mcp-gateway.json`):

```json
{
  "version": "3.0",
  "auth": {
    "enabled": true,
    "strategies": {
      "apiKey": { "enabled": true }
    },
    "ipAllowlist": ["192.168.1.0/24"]
  }
}
```

Remove `disableAuth` and `allowedIPs` from `registry.json`.

#### Step 4: Update Database Schema

```bash
mcp db migrate --to-version 3
```

#### Step 5: Verify

```bash
mcp registry version
mcp servers list
```

---

### Option 3: Fresh Installation

For complex setups or major refactoring.

#### Step 1: Export v2 Configuration

```bash
# Document your servers
mcp servers list > v2-servers.txt

# Export environment variables
env | grep MCP_ > v2-env.txt
```

#### Step 2: Install v3.0

```bash
# Pull latest v3.0 image
docker pull ghcr.io/ismail-kattakath/mcp-gateway:3.0.0

# Or update npm packages
npm install -g @mcp-gateway/cli@3.0.0
```

#### Step 3: Initialize v3.0 Configuration

```bash
# Create new registry
cat > registry.json <<EOF
{
  "version": "3.0",
  "servers": {}
}
EOF
```

#### Step 4: Recreate Servers

```bash
# Use CLI to add servers (with validation)
mcp servers create filesystem \
  --source pkg \
  --command npx \
  --args "-y" "@modelcontextprotocol/server-filesystem" "/tmp"

mcp servers create observatory \
  --source pkg \
  --command npx \
  --args "-y" "obs-mcp@1.0.0" \
  --lifecycle persistent
```

#### Step 5: Configure Auth

```bash
mcp auth enable
mcp auth allow add 192.168.1.0/24
```

---

## Post-Migration Verification

### 1. Check Registry Version

```bash
$ mcp registry version
Registry Information:
──────────────────────────────────────────────────
Path:       /path/to/registry.json
Version:    3.0
Detection:  explicit version field
Servers:    5

✓ Registry is using the latest v3.0 format.
```

### 2. Verify All Servers Are Listed

```bash
$ mcp servers list
┌─────────────┬────────┬───────────┬─────────────┐
│ Name        │ Source │ Lifecycle │ Status      │
├─────────────┼────────┼───────────┼─────────────┤
│ filesystem  │ pkg    │ on-demand │ stopped     │
│ observatory │ pkg    │ persistent│ running     │
└─────────────┴────────┴───────────┴─────────────┘
```

### 3. Test MCP Tool Calls

```bash
# Start a server
mcp servers start filesystem

# Test tool invocation (via MCP protocol)
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "filesystem/read",
      "arguments": { "path": "/tmp/test.txt" }
    }
  }'
```

### 4. Check Health Endpoint

```bash
$ curl http://localhost:3000/health
{
  "status": "healthy",
  "version": "3.0.0",
  "uptime": 12345,
  "servers": {
    "total": 5,
    "running": 2,
    "stopped": 3
  }
}
```

### 5. Verify Database Migration

```bash
# Check migration status
$ mcp db migrate --to-version 3
Current database version: 3
✓ Database is already at target version.
```

### 6. Review Logs

```bash
$ mcp logs
[2026-06-09T10:00:00Z] INFO  Registry loaded successfully version=3.0 serverCount=5
[2026-06-09T10:00:01Z] INFO  Authentication enabled strategy=apiKey
[2026-06-09T10:00:02Z] INFO  Server started name=observatory lifecycle=persistent
```

---

## Rollback Procedures

If migration fails or issues arise, you can rollback to v2.x.

### Rollback Registry

```bash
# Restore v2 registry from backup
cp registry.json.backup registry.json

# Restore auth config
cp .mcp-gateway.json.backup .mcp-gateway.json
```

### Rollback Database

```bash
# Restore database from backup
cp gateway.db.backup gateway.db

# Or use CLI rollback (if migrations applied)
mcp db rollback --to-version 2 --force
```

### Rollback Gateway Version

```bash
# Docker: use v2.x tag
docker pull ghcr.io/ismail-kattakath/mcp-gateway:2.1.0

# NPM: reinstall v2.x
npm install -g @mcp-gateway/cli@2.1.0
```

### Restart Gateway

```bash
# Restart with v2 configuration
npm start
```

---

## Compatibility Mode

V3.0 includes a backward compatibility layer for gradual migration.

### Enable Compatibility Mode

```bash
export ENABLE_V2_COMPAT=true
npm start
```

**What it does**:

- Accepts v2.0 `mcpServers` key (auto-converts to `servers`)
- Maps deprecated API paths to new ones (if any)
- Logs deprecation warnings for legacy features
- Allows gradual migration without downtime

### Use Cases

1. **Zero-downtime migration**: Enable compat mode, deploy v3.0, migrate clients gradually
2. **Testing**: Run v3.0 in compat mode alongside v2.x to compare behavior
3. **Phased rollout**: Migrate internal systems first, then external APIs

### Deprecation Warnings

When compat mode is enabled, you'll see warnings like:

```
[WARN] Detected v2.0 registry.json. Auto-upgrading to v3.0 in-memory. Run "mcp migrate from-v2" to persist.
[WARN] Deprecated field "type" used in server config. Use "source" instead.
[WARN] DEPRECATION: disableAuth is deprecated and will be removed in v4.0
```

### Disable Compatibility Mode

Once migration is complete:

```bash
unset ENABLE_V2_COMPAT
npm start
```

---

## FAQ

### Can I run v2 and v3 side-by-side?

**Yes**. Use different ports:

```bash
# v2.x on port 3000
cd v2-gateway && npm start

# v3.0 on port 3001
cd v3-gateway && GATEWAY_PORT=3001 npm start
```

### Will my existing MCP servers still work?

**Yes**. MCP protocol is backward compatible. All v2.x servers work with v3.0 gateway.

### Do I need to update my clients?

**No**, unless you want to use new v3.0 features (RBAC, OAuth, etc.). All v2.x API endpoints remain functional.

### What if migration fails?

1. Check logs: `mcp logs`
2. Restore backups (see [Rollback Procedures](#rollback-procedures))
3. Open GitHub issue with error details

### How long is v2.x supported?

- **v2.1**: Supported until **December 2026** (security fixes only)
- **v2.0**: **End of life** (upgrade to v2.1 or v3.0)

### Can I skip v2.1 and go directly from v2.0 to v3.0?

**Yes**. The migration tool handles both v2.0 → v3.0 and v2.1 → v3.0.

### Will I lose data during migration?

**No**. Migration is non-destructive:

- Registry is updated in-place with automatic backups
- Database migrations are additive (new tables, no drops)
- Rollback is supported

### What about custom scripts that parse registry.json?

Update them to:

1. Check for `version` field
2. Use `servers` key (not `mcpServers`)
3. Read auth from `.mcp-gateway.json` (not `registry.json`)

Example:

```javascript
// v2.0
const servers = registry.mcpServers;

// v3.0 (backward compatible)
const servers = registry.servers || registry.mcpServers;
```

### How do I migrate environment variables?

All v2.x env vars are supported. New v3.0 vars are optional:

```bash
# v2.x (still works in v3.0)
export GATEWAY_PORT=3000
export GATEWAY_DISABLE_AUTH=false

# v3.0 additions
export ENABLE_V2_COMPAT=true
export SECRETS_PROVIDER=vault
export VAULT_ADDR=http://vault:8200
```

### What if I use Docker Compose?

Update `image` tag in `docker-compose.yml`:

```diff
 services:
   mcp-gateway:
-    image: ghcr.io/ismail-kattakath/mcp-gateway:2.1.0
+    image: ghcr.io/ismail-kattakath/mcp-gateway:3.0.0
     volumes:
       - ./registry.json:/app/registry.json
```

Then:

```bash
docker-compose down
docker-compose pull
docker-compose up -d
```

### What about Kubernetes deployments?

Update `deployment.yaml`:

```diff
 spec:
   containers:
   - name: mcp-gateway
-    image: ghcr.io/ismail-kattakath/mcp-gateway:2.1.0
+    image: ghcr.io/ismail-kattakath/mcp-gateway:3.0.0
```

Apply:

```bash
kubectl apply -f deployment.yaml
kubectl rollout status deployment/mcp-gateway
```

### How do I test migration without affecting production?

1. **Clone production registry**:

   ```bash
   cp /prod/registry.json /test/registry.json
   ```

2. **Run migration in dry-run mode**:

   ```bash
   mcp migrate from-v2 --registry /test/registry.json --dry-run
   ```

3. **Deploy to staging**:

   ```bash
   export GATEWAY_PORT=3001
   npm start
   ```

4. **Verify staging**, then deploy to production.

---

## Support

- **Documentation**: https://github.com/ismail-kattakath/mcp-gateway/tree/main/docs
- **Issues**: https://github.com/ismail-kattakath/mcp-gateway/issues
- **Discussions**: https://github.com/ismail-kattakath/mcp-gateway/discussions

---

**Last Updated**: June 2026  
**Applies To**: MCP Gateway v2.0, v2.1 → v3.0
