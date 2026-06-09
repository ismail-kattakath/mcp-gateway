# MCP Gateway v3.0 Training Presentation

Training deck for MCP Gateway administrators and developers.

---

## Slide 1: Introduction

### MCP Gateway v3.0

**Universal Aggregator for Model Context Protocol Servers**

- Single configuration for all AI tools
- Enterprise-ready authentication & authorization
- Production deployment support
- Comprehensive monitoring & audit logging

**Instructor**: [Your Name]  
**Duration**: 2 hours  
**Date**: [Today's Date]

---

## Slide 2: Agenda

1. **Introduction & What's New** (15 min)
2. **Core Concepts** (20 min)
3. **Server Management** (25 min)
4. **Authentication & Authorization** (30 min)
5. **Production Deployment** (20 min)
6. **Monitoring & Troubleshooting** (10 min)

---

## Slide 3: What is MCP Gateway?

### Problem

- Managing MCP servers across multiple AI tools is tedious
- Duplicate configuration in Claude Code, Claude Desktop, Cline, Cursor
- No centralized auth, monitoring, or audit logs

### Solution

- **One gateway**, many clients
- **Single configuration** file
- **Enterprise authentication** (OAuth, SAML, LDAP)
- **RBAC & Multi-tenancy**
- **Production-ready** (Kubernetes, HA, autoscaling)

---

## Slide 4: Architecture Overview

```
┌─────────────┐   ┌─────────────┐   ┌─────────────┐
│ Claude Code │   │ Claude      │   │   Cursor    │
│             │   │  Desktop    │   │             │
└──────┬──────┘   └──────┬──────┘   └──────┬──────┘
       │                 │                 │
       └─────────────────┼─────────────────┘
                         │ MCP JSON-RPC
                    ┌────┴────┐
                    │   MCP   │
                    │ Gateway │
                    └────┬────┘
                         │
       ┌─────────────────┼─────────────────┐
       │                 │                 │
  ┌────┴────┐      ┌────┴────┐      ┌────┴────┐
  │   obs   │      │  file-  │      │   git   │
  │   mcp   │      │ system  │      │   mcp   │
  └─────────┘      └─────────┘      └─────────┘
```

---

## Slide 5: What's New in v3.0

### Major Features

✨ **Storage Layer** - SQLite with encryption, PostgreSQL support  
🔐 **Advanced Authentication** - OAuth, SAML, LDAP, Kerberos, mTLS  
👥 **RBAC & Multi-Tenancy** - Fine-grained permissions, tenant isolation  
📝 **Audit Logging** - Tamper-proof hash chain, compliance exports  
🛡️ **Security Hardening** - OWASP Top 10, input validation, rate limiting  
☸️ **Production Deployment** - Kubernetes, Helm, Docker Compose  
📊 **Monitoring** - Prometheus metrics, Grafana dashboards, Jaeger tracing  
🔄 **Migration Tools** - v2 → v3 automated migration

---

## Slide 6: Core Concepts - Servers

### What is a Server?

An MCP server configured in the registry.

### Five Server Sources

| Source      | Use Case        | Example                |
| ----------- | --------------- | ---------------------- |
| `pkg`       | Package manager | `npx obs-mcp`          |
| `git`       | Git repository  | Clone + build          |
| `container` | Docker image    | Pull or build          |
| `remote`    | HTTP/SSE        | Already-running server |
| `local`     | Local script    | Python/Node script     |

### Lifecycle Modes

- **Persistent**: Always running, auto-restart
- **On-Demand**: Lazy-loaded, auto-stop after 5min idle

---

## Slide 7: Core Concepts - Tools

### What is a Tool?

A function exposed by an MCP server.

### Namespacing

Tools are prefixed with server name:

- `filesystem/read_file`
- `filesystem/write_file`
- `git/commit`
- `obs/start_recording`

**Why?** Prevents name conflicts between servers.

### Tool Calls

```json
{
  "method": "tools/call",
  "params": {
    "name": "filesystem/read_file",
    "arguments": { "path": "/tmp/test.txt" }
  }
}
```

---

## Slide 8: Core Concepts - Registry

### registry.json Structure

```json
{
  "version": "3.0",
  "servers": {
    "filesystem": {
      "source": "pkg",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
      "enabled": true,
      "lifecycle": "on-demand"
    }
  }
}
```

**Key Features:**

- Hot-reload (no restart needed)
- Environment variable substitution (`${VAR}`)
- Schema validation

---

## Slide 9: Core Concepts - Transport

### Three Transport Modes

**stdio** (default)

- Stdin/stdout pipe
- Auto-starts with client
- No network configuration

**SSE** (Server-Sent Events)

- HTTP long-polling
- Persistent connection
- Requires API key

**HTTP**

- Request-response
- Simple integration
- Requires API key

---

## Slide 10: Quick Start Demo

### 5-Minute Setup

**Step 1:** Create registry

```json
{"version": "3.0", "servers": {"filesystem": {...}}}
```

**Step 2:** Start gateway

```bash
docker run -i ghcr.io/ismail-kattakath/mcp-gateway:latest
```

**Step 3:** Connect Claude Code

```json
{"mcpServers": {"gateway": {"command": "docker", "args": [...]}}}
```

**Step 4:** Use tools

```
filesystem/read_file /tmp/test.txt
```

---

## Slide 11: Authentication Strategies

### v3.0 Authentication Methods

1. **API Key** (default) - Auto-generated, stored in keychain
2. **JWT Tokens** - Short-lived access tokens
3. **OAuth 2.0** - GitHub, Google, Azure AD, Okta
4. **SAML SSO** - Enterprise single sign-on
5. **LDAP/Active Directory** - Corporate directory
6. **Kerberos/SPNEGO** - Windows authentication
7. **mTLS** - Client certificate authentication

**Multi-strategy**: Combine multiple methods with priority/fallback.

---

## Slide 12: API Key Authentication

### Default & Simplest

**Auto-generated on first start:**

```bash
PRINT_API_KEY=true npm start
```

**Store securely in system keychain:**

- macOS: Keychain Access
- Linux: libsecret
- Windows: Credential Manager

**Use in requests:**

```bash
curl -H "Authorization: Bearer YOUR_KEY" \
  http://localhost:3000/api/servers
```

**Rotate regularly:**

```bash
mcp auth rotate
```

---

## Slide 13: OAuth 2.0 Authentication

### Delegate to Identity Provider

**Supported Providers:**

- GitHub, Google, Microsoft Azure AD
- Okta, Auth0, GitLab, Bitbucket

**Flow:**

1. User clicks "Login with GitHub"
2. Redirect to GitHub authorization
3. User approves
4. Gateway receives access token
5. Creates/logs in user
6. Issues JWT access token

**Configuration:**

```json
{
  "oauth": {
    "provider": "github",
    "clientId": "${GITHUB_CLIENT_ID}",
    "clientSecret": "${GITHUB_CLIENT_SECRET}"
  }
}
```

---

## Slide 14: RBAC (Role-Based Access Control)

### Fine-Grained Permissions

**Built-in Roles:**

- `admin`: Full access
- `user`: Access to assigned servers/tools
- `readonly`: Read-only access
- `operator`: Start/stop servers, view logs

**Custom Roles:**

```bash
mcp roles create developer \
  --permissions server:read,server:write,tool:call
```

**Grant Permissions:**

```bash
mcp permissions grant alice \
  --server filesystem \
  --tools read_file,write_file
```

---

## Slide 15: Multi-Tenancy

### Isolated Resources for Multiple Organizations

**Key Features:**

- Tenant-scoped servers, users, API keys
- Network isolation (IP allowlist, VLAN)
- Storage isolation (per-tenant databases)
- Resource quotas (servers, users, storage)

**Use Cases:**

- SaaS deployments
- Enterprise multi-team environments
- Compliance requirements (GDPR, HIPAA)

**Create Tenant:**

```bash
mcp tenants create acme-corp \
  --name "Acme Corporation" \
  --quota-servers 10 \
  --quota-users 50
```

---

## Slide 16: Production Deployment - Kubernetes

### Enterprise-Ready Deployment

**Included:**

- Deployment (3+ replicas, rolling updates)
- Service (ClusterIP)
- Ingress (TLS with cert-manager)
- HorizontalPodAutoscaler (CPU/memory-based)
- PodDisruptionBudget (maintain availability)
- NetworkPolicy (egress/ingress restrictions)
- ServiceMonitor (Prometheus metrics)

**Quick Deploy:**

```bash
kubectl apply -f deploy/kubernetes/
```

**Or Helm:**

```bash
helm install mcp-gateway mcp-gateway/mcp-gateway
```

---

## Slide 17: High Availability Setup

### Ensure Zero Downtime

**Horizontal Scaling:**

- Min 3 replicas
- Max 10 replicas
- Auto-scale on CPU/memory

**Database:**

- PostgreSQL (not SQLite)
- Connection pooling
- Read replicas

**Load Balancing:**

- nginx, Traefik, or cloud LB
- Health checks
- Session affinity (if needed)

**Backup & Recovery:**

- Daily database backups
- 30-day retention
- Automated restore testing

---

## Slide 18: Monitoring Stack

### Comprehensive Observability

**Metrics (Prometheus):**

- Request rate, latency, errors
- Server health and uptime
- Resource usage (CPU, memory)
- Tool call metrics

**Visualization (Grafana):**

- Pre-built dashboard
- Custom panels
- Alerting rules

**Tracing (Jaeger):**

- Distributed request tracing
- Performance bottleneck identification

**Logging (Winston):**

- Structured JSON logs
- Log aggregation (ELK, Datadog)

---

## Slide 19: Audit Logging

### Tamper-Proof Compliance Logs

**What's Logged:**

- Authentication attempts (success/failure)
- Authorization decisions (access granted/denied)
- Server management (start, stop, create, delete)
- User management (create, update, delete, role changes)

**Hash Chain Integrity:**
Each log entry includes SHA256 hash of previous entry.

**Verify Integrity:**

```bash
mcp audit verify
```

**Export for Compliance:**

```bash
mcp audit export --format csv --since "2024-01-01"
```

---

## Slide 20: Security Best Practices

### Defense in Depth

1. **Authentication** - Enable auth, rotate keys every 90 days
2. **Network** - Use HTTPS, IP allowlist, rate limiting
3. **RBAC** - Least privilege principle
4. **Secrets** - Use secrets manager (Vault, AWS, Azure)
5. **Container** - Non-root user, read-only filesystem
6. **Input Validation** - Sanitize all user inputs
7. **Audit Logging** - Enable for compliance
8. **Dependency Scanning** - Run npm audit, Trivy

**Never:**

- Disable auth in production
- Use HTTP (always HTTPS)
- Mount Docker socket (unless necessary)

---

## Slide 21: Troubleshooting Common Issues

### Server Won't Start

**Symptoms:** `state: "failed"` in logs

**Solutions:**

- Check server logs: `mcp logs <server-name>`
- Verify environment variables
- Increase timeout: `"timeout": 60000`
- Check network connectivity (for git/remote sources)

### Authentication Errors

**Symptoms:** `401 Unauthorized`

**Solutions:**

- Get API key: `PRINT_API_KEY=true npm start`
- Check token expiration
- Verify Bearer token format

---

## Slide 22: Troubleshooting Tools

### Built-in Diagnostics

**Health Check:**

```bash
curl http://localhost:3000/health
```

**Server Status:**

```bash
mcp servers get <server-name>
```

**Logs:**

```bash
mcp logs <server-name> --tail 100 --follow
```

**Audit Trail:**

```bash
mcp audit list --since "1 hour ago"
```

**Validate Config:**

```bash
mcp config validate
```

---

## Slide 23: Performance Tuning

### Optimize for Scale

**Server Lifecycle:**

- Use `persistent` for high-traffic servers
- Use `on-demand` for rarely-used servers

**Resource Limits:**

```json
{ "resources": { "memory": "512m", "cpus": "1.0" } }
```

**Caching:**

```json
{ "cache": { "enabled": true, "ttl": 300 } }
```

**Horizontal Scaling:**

- Load balancer + multiple gateway instances
- Shared PostgreSQL database

---

## Slide 24: Migration from v2.x to v3.0

### Automated Migration Tools

**Registry Migration:**

```bash
mcp migrate registry \
  --from v2 \
  --to v3 \
  --input registry-v2.json \
  --output registry-v3.json
```

**Auth Config Migration:**

```bash
mcp migrate auth \
  --from registry.json \
  --to .mcp-gateway.json
```

**Database Migration:**

```bash
mcp migrate database \
  --from sqlite \
  --to postgres
```

**Breaking Changes:** See `docs/MIGRATION_V2_TO_V3.md`

---

## Slide 25: Resources & Next Steps

### Learn More

**Documentation:**

- [Getting Started](../GETTING_STARTED.md)
- [User Guide](../USER_GUIDE.md)
- [API Reference](../API.md)
- [Tutorials](../tutorials/)

**Tutorials:**

- OAuth 2.0 with GitHub
- SAML SSO with Okta
- LDAP/AD Integration
- Kubernetes Deployment
- Multi-Tenancy Setup
- Monitoring Setup

**Community:**

- GitHub: github.com/ismail-kattakath/mcp-gateway
- Issues: Report bugs and request features
- Discussions: Ask questions

---

## Thank You!

**Questions?**

**Lab Exercises:** See `lab-exercises.md` for hands-on practice.

**Contact:** [Your Email]
