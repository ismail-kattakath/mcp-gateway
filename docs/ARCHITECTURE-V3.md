# Architecture v3.0: Migration to Industry Standards

**Status**: Planning  
**Target Release**: v3.0  
**Goal**: Replace custom implementations with battle-tested industry standards

---

## Executive Summary

Current v2.x uses custom implementations for auth, logging, storage, and networking. This creates:
- ❌ Security risks (unknown vulnerabilities in custom auth)
- ❌ Integration friction (no OAuth, SAML, AD, Kerberos support)
- ❌ Maintenance burden (reinventing the wheel)
- ❌ Scaling limitations (no observability, metrics, tracing)
- ❌ Adoption barriers (non-standard patterns)

**v3.0 Goal**: Enterprise-grade gateway using proven solutions.

---

## 1. Authentication & Authorization

### Current State (v2.x)
```typescript
// Custom bearer token (crypto.randomBytes)
// Custom IP allowlist middleware
// No role-based access control
// No multi-tenancy
```

**Problems**:
- Single auth method (API key only)
- No integration with enterprise identity providers
- No fine-grained permissions
- Security audit burden (custom crypto code)

### Proposed Solution: **Passport.js + JWT + RBAC**

#### **Core Stack**:
- **Passport.js** - Multi-strategy authentication framework
- **jsonwebtoken** - JWT signing/verification (industry standard)
- **@casl/ability** or **casbin** - RBAC/ABAC for fine-grained access
- **express-rate-limit** - Rate limiting (prevent brute force)

#### **Supported Auth Strategies** (v3.0):

**Tier 1 (Launch)**:
- ✅ **API Keys** - Machine-to-machine (current, but JWT-based)
- ✅ **Basic Auth** - Simple username/password
- ✅ **JWT Bearer Tokens** - Short-lived access tokens

**Tier 2 (v3.1)**:
- ✅ **OAuth 2.0** - `passport-oauth2` (generic provider)
- ✅ **GitHub OAuth** - `passport-github2`
- ✅ **Google OAuth** - `passport-google-oauth20`
- ✅ **SAML** - `passport-saml` (enterprise SSO)

**Tier 3 (v3.2)**:
- ✅ **LDAP/AD** - `passport-ldapauth` (Active Directory)
- ✅ **Kerberos** - `passport-kerberos`
- ✅ **SSH Certificates** - Custom strategy for machine auth
- ✅ **mTLS** - Client certificate authentication

#### **JWT Token Structure**:

```typescript
// Access Token (short-lived: 15min)
{
  "sub": "user-id",
  "iss": "mcp-gateway",
  "aud": "mcp-gateway-api",
  "exp": 1234567890,
  "iat": 1234567000,
  "roles": ["admin", "server:read", "server:write"],
  "tenant": "team-alpha"  // Multi-tenancy support
}

// Refresh Token (long-lived: 30 days, stored in DB)
{
  "sub": "user-id",
  "jti": "unique-token-id",  // Revocable
  "exp": 1234567890,
  "type": "refresh"
}
```

#### **RBAC Permissions**:

```typescript
// Fine-grained permissions (CASL-style)
const permissions = [
  { action: 'read', subject: 'Server' },
  { action: 'create', subject: 'Server' },
  { action: 'update', subject: 'Server', conditions: { owner: true } },
  { action: 'delete', subject: 'Server', conditions: { owner: true } },
  { action: 'read', subject: 'Logs' },
  { action: 'manage', subject: 'Auth' },  // Admin only
];

// Usage in routes
if (ability.can('delete', server)) {
  // Allow
}
```

#### **Migration Path**:

```typescript
// v2.x compatibility layer
app.use('/api', (req, res, next) => {
  // Try new auth first
  passport.authenticate(['jwt', 'bearer'], { session: false })(req, res, (err) => {
    if (err || !req.user) {
      // Fallback to legacy API key
      return legacyAuthMiddleware(req, res, next);
    }
    next();
  });
});
```

**New CLI Commands**:
```bash
# API Key management (backward compatible)
mcp auth create-api-key --name "ci-bot" --expires 90d
mcp auth revoke-api-key <key-id>
mcp auth list-api-keys

# OAuth setup (new)
mcp auth setup-oauth --provider github --client-id <id> --client-secret <secret>
mcp auth setup-saml --metadata-url <url>

# RBAC (new)
mcp auth create-role admin --permissions "manage:all"
mcp auth create-role developer --permissions "read:servers,create:servers"
mcp auth assign-role user@example.com developer
```

---

## 2. Network Security & Firewall

### Current State (v2.x)
```typescript
// Custom IP allowlist in middleware/auth.ts
// No integration with OS-level firewall
// Application-level filtering only
```

**Problems**:
- No defense-in-depth (single layer)
- Can't leverage OS/container security
- Manual IP management via JSON file

### Proposed Solution: **Multi-Layer Security**

#### **Layer 1: OS Firewall** (iptables/nftables)

**Linux/Docker**:
```bash
# iptables rule generation via CLI
mcp firewall allow --ip 192.168.1.0/24
mcp firewall deny --ip 10.0.0.0/8
mcp firewall list
mcp firewall flush

# Generates iptables rules
iptables -A INPUT -s 192.168.1.0/24 -p tcp --dport 3000 -j ACCEPT
iptables -A INPUT -p tcp --dport 3000 -j DROP
```

**Implementation**:
- `node-iptables` library for rule management
- Requires `CAP_NET_ADMIN` capability (Docker: `--cap-add=NET_ADMIN`)
- Graceful fallback to app-level filtering if no permissions

#### **Layer 2: Reverse Proxy** (Traefik/nginx)

**Recommended for production**:

```yaml
# docker-compose.yml with Traefik
services:
  traefik:
    image: traefik:v2.10
    command:
      - "--providers.docker=true"
      - "--entrypoints.web.address=:80"
    ports:
      - "80:80"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock

  mcp-gateway:
    image: mcp-gateway:latest
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.mcp.rule=Host(`mcp.example.com`)"
      - "traefik.http.middlewares.mcp-ipwhitelist.ipwhitelist.sourcerange=192.168.1.0/24"
      - "traefik.http.routers.mcp.middlewares=mcp-ipwhitelist"
```

**Benefits**:
- Industry-standard patterns
- TLS termination
- Rate limiting
- Load balancing (future)

#### **Layer 3: Docker Network Policies**

```yaml
# Isolate MCP gateway network
networks:
  mcp-internal:
    driver: bridge
    ipam:
      config:
        - subnet: 172.28.0.0/16

services:
  mcp-gateway:
    networks:
      - mcp-internal
    # Only accessible via Traefik
```

#### **Layer 4: Application-Level** (Fallback)

Keep existing IP allowlist as fallback for stdio/dev mode.

```typescript
// New: IP filtering via express-ipfilter
import { IpFilter } from 'express-ipfilter';

app.use('/api', IpFilter(allowedIPs, { 
  mode: 'allow',
  logLevel: 'deny',
  detectIp: (req) => req.headers['x-forwarded-for'] || req.connection.remoteAddress
}));
```

---

## 3. Observability Stack

### Current State (v2.x)
```typescript
// Winston logging (console + file)
// No metrics
// No distributed tracing
// No health checks beyond /health endpoint
```

**Problems**:
- Can't diagnose issues in production
- No performance metrics
- No correlation across MCP servers
- Limited debugging

### Proposed Solution: **OpenTelemetry + Prometheus + Grafana**

#### **Core Stack**:
- **OpenTelemetry** - Unified observability (traces, metrics, logs)
- **Pino** - Structured logging (3x faster than Winston)
- **Prometheus** - Metrics collection
- **Grafana** - Visualization + dashboards
- **Jaeger** - Distributed tracing (optional)

#### **Implementation**:

**Structured Logging (Pino)**:
```typescript
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',  // Dev only
    options: { colorize: true }
  },
  serializers: {
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
    err: pino.stdSerializers.err,
  }
});

// Automatic request logging
app.use(require('pino-http')({ logger }));

// Usage
logger.info({ serverName: 'obs', status: 'starting' }, 'Starting MCP server');
```

**Metrics (Prometheus)**:
```typescript
import promClient from 'prom-client';

// Default metrics (CPU, memory, event loop)
promClient.collectDefaultMetrics();

// Custom metrics
const mcpRequestDuration = new promClient.Histogram({
  name: 'mcp_request_duration_seconds',
  help: 'Duration of MCP requests',
  labelNames: ['server', 'method', 'status'],
  buckets: [0.1, 0.5, 1, 2, 5, 10]
});

const mcpServersActive = new promClient.Gauge({
  name: 'mcp_servers_active',
  help: 'Number of active MCP servers',
  labelNames: ['source', 'lifecycle']
});

// Endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', promClient.register.contentType);
  res.end(await promClient.register.metrics());
});
```

**Distributed Tracing (OpenTelemetry)**:
```typescript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';

const sdk = new NodeSDK({
  serviceName: 'mcp-gateway',
  instrumentations: [
    new HttpInstrumentation(),
    new ExpressInstrumentation(),
  ],
  traceExporter: new JaegerExporter({
    endpoint: process.env.JAEGER_ENDPOINT || 'http://localhost:14268/api/traces'
  })
});

sdk.start();

// Traces automatically generated for HTTP requests
// Custom spans
tracer.startActiveSpan('mcp-server-spawn', (span) => {
  span.setAttribute('server.name', serverName);
  span.setAttribute('server.source', source);
  // ... spawn logic
  span.end();
});
```

**Health Checks (Enhanced)**:
```typescript
// Current: Simple /health
// New: Detailed health checks

import healthcheck from 'express-healthcheck';

app.get('/health', (req, res) => {
  const health = {
    status: 'ok',
    timestamp: Date.now(),
    uptime: process.uptime(),
    checks: {
      database: await db.ping(),
      keychain: await keytar.findCredentials('mcp-gateway').then(() => true).catch(() => false),
      servers: {
        total: servers.length,
        running: servers.filter(s => s.status === 'running').length,
        failed: servers.filter(s => s.status === 'failed').length
      }
    }
  };
  
  const status = health.checks.database && health.checks.keychain ? 200 : 503;
  res.status(status).json(health);
});

// Kubernetes-style probes
app.get('/healthz', (req, res) => res.sendStatus(200));  // Liveness
app.get('/readyz', (req, res) => {
  // Readiness: Can accept traffic?
  const ready = servers.filter(s => s.lifecycle === 'persistent' && s.enabled)
    .every(s => s.status === 'running');
  res.sendStatus(ready ? 200 : 503);
});
```

**Grafana Dashboards** (Pre-built):
- MCP Gateway Overview (requests/sec, latency, errors)
- Server Health (active servers, spawn/stop events)
- Resource Usage (CPU, memory, file descriptors)
- Error Tracking (error rates by endpoint/server)

---

## 4. Storage: SQLite Migration

### Schema

```sql
-- Servers
CREATE TABLE servers (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('pkg', 'git', 'container', 'remote', 'local')),
  config TEXT NOT NULL,  -- JSON, encrypted sensitive fields
  lifecycle TEXT DEFAULT 'on-demand' CHECK(lifecycle IN ('on-demand', 'persistent')),
  enabled INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT,  -- User ID (for RBAC)
  tenant TEXT  -- Multi-tenancy
);

-- Auth: Users
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE,
  password_hash TEXT,  -- bcrypt, nullable for OAuth users
  tenant TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Auth: API Keys (JWT refresh tokens)
CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  key_hash TEXT NOT NULL,  -- SHA-256 of actual key
  name TEXT,
  expires_at TIMESTAMP,
  last_used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  revoked INTEGER DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Auth: Roles
CREATE TABLE roles (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  permissions TEXT NOT NULL,  -- JSON array
  tenant TEXT
);

-- Auth: User-Role mapping
CREATE TABLE user_roles (
  user_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  PRIMARY KEY (user_id, role_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
);

-- Settings (replaces .mcp-gateway.json)
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  encrypted INTEGER DEFAULT 0,
  description TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_by TEXT
);

-- Audit Log
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  action TEXT NOT NULL,  -- 'create', 'update', 'delete', 'start', 'stop'
  resource_type TEXT NOT NULL,  -- 'server', 'user', 'role'
  resource_id TEXT,
  details TEXT,  -- JSON
  ip_address TEXT,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_servers_tenant ON servers(tenant);
CREATE INDEX idx_servers_enabled ON servers(enabled);
CREATE INDEX idx_api_keys_user ON api_keys(user_id);
CREATE INDEX idx_api_keys_expires ON api_keys(expires_at);
CREATE INDEX idx_audit_log_user ON audit_log(user_id);
CREATE INDEX idx_audit_log_timestamp ON audit_log(timestamp);
```

### Encryption

```typescript
import crypto from 'crypto';

class FieldEncryption {
  private key: Buffer;
  private algorithm = 'aes-256-gcm';
  
  constructor(key: Buffer) {
    this.key = key;
  }
  
  encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
    
    let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
    ciphertext += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    // Format: iv:authTag:ciphertext (all hex)
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext}`;
  }
  
  decrypt(encrypted: string): string {
    const [ivHex, authTagHex, ciphertext] = encrypted.split(':');
    
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    
    const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
    decipher.setAuthTag(authTag);
    
    let plaintext = decipher.update(ciphertext, 'hex', 'utf8');
    plaintext += decipher.final('utf8');
    
    return plaintext;
  }
}

// Usage
const encryptor = new FieldEncryption(await getEncryptionKey());

const server = {
  name: 'github',
  config: JSON.stringify({
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    env: encryptor.encrypt(JSON.stringify({ GITHUB_TOKEN: 'ghp_xxx' }))
  })
};
```

---

## 5. Single Instance Management

### Current State (v2.x)
- Multiple instances can run simultaneously
- Port conflicts crash the server
- No coordination between instances

### Proposed Solution: **Process Lock + Port Management**

**Implementation**:

```typescript
import portfinder from 'portfinder';
import lockfile from 'proper-lockfile';
import fs from 'fs';
import path from 'path';

class InstanceManager {
  private lockFile: string;
  private pidFile: string;
  
  constructor(dataDir: string) {
    this.lockFile = path.join(dataDir, '.mcp-gateway.lock');
    this.pidFile = path.join(dataDir, '.mcp-gateway.pid');
  }
  
  async acquireLock(): Promise<boolean> {
    try {
      // Check if another instance is running
      if (fs.existsSync(this.pidFile)) {
        const oldPid = parseInt(fs.readFileSync(this.pidFile, 'utf8'));
        
        // Check if process is still alive
        try {
          process.kill(oldPid, 0);  // Signal 0 = check existence
          logger.error(`Another instance is running (PID ${oldPid})`);
          return false;
        } catch {
          // Process dead, clean up stale lock
          logger.warn('Removing stale lock file');
          fs.unlinkSync(this.pidFile);
        }
      }
      
      // Create lock file
      fs.writeFileSync(this.pidFile, process.pid.toString());
      
      // File-based lock (prevents race conditions)
      await lockfile.lock(this.lockFile, {
        retries: 0,
        stale: 60000  // 60s stale threshold
      });
      
      logger.info(`Acquired instance lock (PID ${process.pid})`);
      return true;
      
    } catch (err) {
      logger.error('Failed to acquire instance lock', err);
      return false;
    }
  }
  
  async releaseLock(): Promise<void> {
    try {
      await lockfile.unlock(this.lockFile);
      if (fs.existsSync(this.pidFile)) {
        fs.unlinkSync(this.pidFile);
      }
    } catch (err) {
      logger.error('Failed to release lock', err);
    }
  }
}

// Usage in server startup
const instanceManager = new InstanceManager(dataDir);

if (!await instanceManager.acquireLock()) {
  console.error('Another instance is already running. Exiting.');
  process.exit(1);
}

// Graceful shutdown
process.on('SIGINT', async () => {
  await instanceManager.releaseLock();
  process.exit(0);
});
```

**Port Conflict Resolution**:

```typescript
async function findAvailablePort(preferred: number = 3000): Promise<number> {
  try {
    // Try preferred port first
    const isAvailable = await portfinder.getPortPromise({ port: preferred });
    if (isAvailable === preferred) {
      return preferred;
    }
    
    // Find next available in range
    const port = await portfinder.getPortPromise({ 
      port: preferred,
      stopPort: preferred + 100  // Try 3000-3100
    });
    
    logger.warn(`Port ${preferred} unavailable, using ${port} instead`);
    return port;
    
  } catch (err) {
    throw new Error(`No available ports in range ${preferred}-${preferred+100}`);
  }
}

// Write actual port to file for CLI discovery
fs.writeFileSync(
  path.join(dataDir, '.mcp-gateway.port'),
  port.toString()
);
```

**CLI Port Discovery**:

```typescript
// CLI reads actual port
function getGatewayUrl(): string {
  const portFile = path.join(dataDir, '.mcp-gateway.port');
  
  if (fs.existsSync(portFile)) {
    const port = fs.readFileSync(portFile, 'utf8').trim();
    return `http://localhost:${port}`;
  }
  
  return 'http://localhost:3000';  // Default
}
```

---

## 6. CLI Framework: Migration to oclif

### Current State (v2.x)
- Commander.js (good, but basic)
- Manual help formatting
- No plugin system
- No auto-generated docs

### Proposed Solution: **oclif** (Heroku's CLI framework)

**Why oclif?**
- ✅ Plugin architecture (extensibility)
- ✅ Auto-generated help + man pages
- ✅ Testing framework built-in
- ✅ TypeScript-native
- ✅ Auto-updates
- ✅ Industry standard (Heroku, Salesforce, Twilio use it)

**Migration Example**:

```typescript
// Before (Commander.js)
program
  .command('servers list')
  .description('List all servers')
  .action(async () => { ... });

// After (oclif)
import { Command, Flags } from '@oclif/core';

export default class ServersList extends Command {
  static description = 'List all MCP servers';
  
  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --format json',
  ];
  
  static flags = {
    format: Flags.string({
      char: 'f',
      description: 'Output format',
      options: ['table', 'json', 'yaml'],
      default: 'table'
    })
  };
  
  async run(): Promise<void> {
    const { flags } = await this.parse(ServersList);
    
    const servers = await apiClient.listServers();
    
    if (flags.format === 'json') {
      this.log(JSON.stringify(servers, null, 2));
    } else {
      // Table output
      this.log(formatTable(servers));
    }
  }
}
```

**Plugin System**:

```bash
# Install community plugins
mcp plugins:install @mcp-gateway/plugin-backup
mcp plugins:install @mcp-gateway/plugin-migration

# Use plugin commands
mcp backup create --compress
mcp migrate from-coder-mcp --config ~/.config/mcp/config.json
```

---

## 7. Domain Names & TLS

### Current State (v2.x)
- localhost only
- No TLS support
- No custom domains

### Proposed Solution: **mDNS + Let's Encrypt**

**Local Development (mDNS)**:

```typescript
import bonjour from 'bonjour-service';

const mdns = bonjour();

mdns.publish({
  name: 'MCP Gateway',
  type: 'http',
  port: 3000,
  txt: {
    version: '3.0.0',
    transport: 'sse'
  }
});

// Now accessible at: http://mcp-gateway.local:3000
```

**Production (Let's Encrypt)**:

```typescript
import greenlock from 'greenlock-express';

const app = greenlock.init({
  packageRoot: __dirname,
  configDir: './greenlock.d',
  maintainerEmail: process.env.ADMIN_EMAIL,
  cluster: false
}).ready((glx) => {
  const server = glx.httpsServer(null, app);
  server.listen(443);
});

// Automatic TLS cert renewal
// Works with: mcp-gateway.example.com
```

---

## 8. HTTP/2 & Keepalive

### Implementation

```typescript
import http2 from 'http2';
import express from 'express';
import spdy from 'spdy';

// HTTP/2 support
const server = spdy.createServer({
  key: fs.readFileSync('./certs/key.pem'),
  cert: fs.readFileSync('./certs/cert.pem')
}, app);

// Keepalive tuning
server.keepAliveTimeout = 65000;  // 65s (nginx default: 75s)
server.headersTimeout = 66000;    // Slightly higher

// Graceful shutdown
import { createHttpTerminator } from 'http-terminator';

const httpTerminator = createHttpTerminator({ server });

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  
  // Stop accepting new connections
  await httpTerminator.terminate();
  
  // Stop MCP servers
  await serverManager.stopAll();
  
  process.exit(0);
});
```

---

## Migration Timeline

### **Phase 1: v2.2 (Storage & Observability)** - 2 weeks
- [ ] SQLite storage layer
- [ ] Pino structured logging
- [ ] Prometheus metrics endpoint
- [ ] Enhanced health checks
- [ ] Auto-migration from registry.json

### **Phase 2: v2.3 (Auth & Security)** - 3 weeks
- [ ] Passport.js integration
- [ ] JWT access/refresh tokens
- [ ] Basic RBAC (roles: admin, user, readonly)
- [ ] API key rotation
- [ ] Audit logging

### **Phase 3: v3.0 (Enterprise Features)** - 4 weeks
- [ ] OAuth 2.0 support (GitHub, Google)
- [ ] SAML SSO
- [ ] Multi-tenancy
- [ ] Firewall integration (iptables)
- [ ] oclif CLI migration
- [ ] OpenTelemetry tracing
- [ ] Instance management (single instance lock)
- [ ] Port conflict resolution

### **Phase 4: v3.1 (Advanced Auth)** - 2 weeks
- [ ] LDAP/Active Directory
- [ ] Kerberos
- [ ] SSH certificate auth
- [ ] mTLS

### **Phase 5: v3.2 (Production Hardening)** - 2 weeks
- [ ] mDNS/Bonjour
- [ ] Let's Encrypt integration
- [ ] HTTP/2 support
- [ ] Pre-built Grafana dashboards
- [ ] Kubernetes Helm chart

---

## Breaking Changes (v2.x → v3.0)

1. **Storage**: registry.json → SQLite (auto-migrated)
2. **Auth**: API keys format changes (JWT-based)
3. **Logs**: Winston → Pino (different log format)
4. **CLI**: Commander → oclif (command structure mostly compatible)
5. **Endpoints**: New auth endpoints (`/auth/login`, `/auth/token`)

**Backward Compatibility**:
- v2.x API keys work during transition period (6 months)
- registry.json auto-detected and migrated
- Legacy endpoints deprecated but functional

---

## Dependencies Added

```json
{
  "dependencies": {
    "passport": "^0.7.0",
    "passport-jwt": "^4.0.1",
    "passport-oauth2": "^1.8.0",
    "passport-github2": "^0.1.12",
    "passport-google-oauth20": "^2.0.0",
    "passport-saml": "^4.0.4",
    "passport-ldapauth": "^3.0.1",
    "jsonwebtoken": "^9.0.2",
    "bcrypt": "^5.1.1",
    "@casl/ability": "^6.5.0",
    "express-rate-limit": "^7.1.5",
    "express-ipfilter": "^1.3.1",
    "pino": "^8.17.2",
    "pino-http": "^9.0.0",
    "pino-pretty": "^10.3.1",
    "prom-client": "^15.1.0",
    "@opentelemetry/sdk-node": "^0.45.1",
    "@opentelemetry/instrumentation-http": "^0.45.1",
    "@opentelemetry/instrumentation-express": "^0.34.0",
    "@opentelemetry/exporter-jaeger": "^1.19.0",
    "better-sqlite3": "^9.2.2",
    "proper-lockfile": "^4.1.2",
    "portfinder": "^1.0.32",
    "bonjour-service": "^1.2.1",
    "http-terminator": "^3.2.0",
    "@oclif/core": "^3.15.1",
    "@oclif/plugin-help": "^6.0.9",
    "@oclif/plugin-plugins": "^4.1.10"
  }
}
```

---

## Security Audit Checklist

Before v3.0 release:
- [ ] Third-party security audit (auth layer)
- [ ] Penetration testing
- [ ] OWASP Top 10 compliance check
- [ ] Dependency audit (npm audit, Snyk)
- [ ] CodeQL scanning (already in place)
- [ ] TLS configuration audit (Mozilla SSL Config Generator)
- [ ] Secrets management review
- [ ] Rate limiting effectiveness test
- [ ] JWT token security review
- [ ] SQL injection testing (even with SQLite)

---

## Documentation Updates

- [ ] New architecture diagram
- [ ] Auth setup guide (OAuth, SAML, LDAP)
- [ ] Multi-tenancy guide
- [ ] Observability setup (Prometheus + Grafana)
- [ ] Migration guide (v2.x → v3.0)
- [ ] Security best practices
- [ ] Kubernetes deployment guide
- [ ] Firewall configuration examples
- [ ] CLI plugin development guide

---

## Open Questions

1. **Multi-tenancy**: Database-per-tenant or shared schema with tenant column?
2. **Metrics storage**: Prometheus push gateway or pull-based?
3. **CLI distribution**: NPM only or also brew/apt/snap?
4. **TLS certs**: Let's Encrypt only or support custom CA?
5. **Backup strategy**: Automated backups to S3/GCS?

---

**Next Steps**: Review this architecture plan and approve phases to begin implementation.
