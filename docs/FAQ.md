# Frequently Asked Questions

Common questions and answers about MCP Gateway.

## Table of Contents

- [General Questions](#general-questions)
- [Installation & Setup](#installation--setup)
- [Configuration](#configuration)
- [Authentication & Security](#authentication--security)
- [Server Management](#server-management)
- [Tool Calls](#tool-calls)
- [Performance](#performance)
- [Troubleshooting](#troubleshooting)
- [Integration with AI Tools](#integration-with-ai-tools)
- [Production Deployment](#production-deployment)

## General Questions

### What is MCP Gateway?

MCP Gateway is a universal aggregator for Model Context Protocol (MCP) servers. Instead of configuring multiple MCP servers in every AI coding tool, you configure them once in the gateway and point all your tools to it.

### Why do I need MCP Gateway?

**Without gateway:**

- Duplicate configuration in Claude Code, Claude Desktop, Cline, Cursor
- All servers load upfront (slow, memory-intensive)
- Secrets duplicated in multiple configs
- Updates require reconfiguring every tool

**With gateway:**

- Single configuration file
- Lazy loading (on-demand servers)
- Centralized secrets management
- Update once, affects all tools
- RBAC and audit logging for enterprise

### Is MCP Gateway production-ready?

Yes! MCP Gateway v3.0 includes:

- Enterprise authentication (OAuth, SAML, LDAP, Kerberos, mTLS)
- Role-based access control (RBAC)
- Multi-tenancy support
- Audit logging with tamper-proof hash chains
- Security hardening (OWASP Top 10, CWE Top 25)
- Kubernetes deployment (Helm chart included)
- Horizontal scaling support
- Comprehensive monitoring (Prometheus, Grafana, Jaeger)

### What's the difference between MCP Gateway and the official MCP servers?

MCP Gateway is an **aggregator** that manages multiple MCP servers:

```
┌──────────────┐
│  AI Tool     │
│ (Claude)     │
└──────┬───────┘
       │
┌──────┴───────┐      ┌──────────────┐
│ MCP Gateway  │◄────►│ MCP Server 1 │
│ (Aggregator) │      ├──────────────┤
└──────┬───────┘      │ MCP Server 2 │
       │              ├──────────────┤
       └─────────────►│ MCP Server 3 │
                      └──────────────┘
```

The gateway adds:

- Namespaced routing (`server/tool`)
- Lifecycle management (persistent vs on-demand)
- Authentication and authorization
- Audit logging
- Hot reload of configs

### Is MCP Gateway open source?

Yes! MIT licensed. See [LICENSE](../LICENSE).

### What are the system requirements?

**Minimum:**

- 256MB RAM (on-demand servers)
- 1 CPU core
- 100MB disk space

**Recommended:**

- 512MB RAM (persistent servers)
- 2 CPU cores
- 1GB disk space

**Production:**

- 2GB+ RAM (depends on server count)
- 4+ CPU cores
- 10GB+ disk space

## Installation & Setup

### How do I install MCP Gateway?

**Quickest (Docker auto-spawn):**

```json
{
  "mcpServers": {
    "gateway": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "ghcr.io/ismail-kattakath/mcp-gateway:latest"
      ]
    }
  }
}
```

**Persistent daemon:**

```bash
docker run -d --name mcp-gateway \
  -p 127.0.0.1:3000:3000 \
  ghcr.io/ismail-kattakath/mcp-gateway:latest
```

**npm/npx:**

```bash
npx mcp-gateway-server
```

**From source:**

```bash
git clone https://github.com/ismail-kattakath/mcp-gateway.git
cd mcp-gateway/server
npm install && npm run build && npm start
```

See [GETTING_STARTED.md](GETTING_STARTED.md) for details.

### Do I need Docker?

No! You can use:

- npm/npx (Node.js only)
- Kubernetes (production)
- Build from source

Docker is recommended for simplicity, but not required.

### Can I use MCP Gateway with Podman?

Yes! Podman is a drop-in replacement for Docker:

```bash
podman run -i --rm ghcr.io/ismail-kattakath/mcp-gateway:latest
```

Or configure Podman socket:

```bash
export DOCKER_HOST=unix:///run/user/$UID/podman/podman.sock
```

### How do I upgrade to the latest version?

**Docker:**

```bash
docker pull ghcr.io/ismail-kattakath/mcp-gateway:latest
docker stop mcp-gateway
docker rm mcp-gateway
docker run -d --name mcp-gateway ... # Same run command
```

**npm:**

```bash
npm update -g mcp-gateway-server
```

**Kubernetes:**

```bash
helm upgrade mcp-gateway mcp-gateway/mcp-gateway
```

### How do I check which version I'm running?

```bash
curl http://localhost:3000/api/version
```

Or with CLI:

```bash
mcp version
```

## Configuration

### Where is the registry file located?

**Default locations:**

- Docker: `/app/registry.json`
- npm: `./registry.json` (current directory)
- Custom: Set `REGISTRY_PATH` environment variable

**Best practice:** Store in home directory:

```bash
~/.mcp-gateway/registry.json
```

### What is the registry format for v3.0?

```json
{
  "version": "3.0",
  "servers": {
    "server-name": {
      "source": "pkg|git|container|remote|local",
      "enabled": true,
      "lifecycle": "persistent|on-demand",
      ...
    }
  }
}
```

See [SCHEMA_V3.md](SCHEMA_V3.md) for complete schema.

### How do I add a new server?

**Using CLI:**

```bash
mcp servers create my-server \
  --source pkg \
  --command npx \
  --args "-y" "mcp-package@latest"
```

**Or edit registry.json:**

```json
{
  "servers": {
    "my-server": {
      "source": "pkg",
      "command": "npx",
      "args": ["-y", "mcp-package@latest"],
      "enabled": true
    }
  }
}
```

The gateway hot-reloads automatically.

### How do I use environment variables?

Use `${VAR}` syntax in registry:

```json
{
  "servers": {
    "authenticated": {
      "source": "pkg",
      "command": "npx",
      "args": ["-y", "secure-server"],
      "env": {
        "API_KEY": "${MY_API_KEY}",
        "DATABASE_URL": "${DB_URL}"
      }
    }
  }
}
```

Variables are resolved from system environment at runtime.

### How do I store secrets securely?

**v3.0 Secrets Manager:**

```bash
# Store secret
mcp secrets set MY_API_KEY "sk-12345..."

# Reference in registry
{
  "env": {
    "API_KEY": "${SECRET:MY_API_KEY}"
  }
}
```

Secrets are stored encrypted in:

- System keychain (macOS Keychain, Linux libsecret, Windows Credential Manager)
- HashiCorp Vault
- AWS Secrets Manager
- Azure Key Vault

See [SECURITY_HARDENING.md](SECURITY_HARDENING.md) for configuration.

### Can I use multiple registry files?

Not directly, but you can merge registries:

```bash
# Merge registries
jq -s '.[0] * .[1]' registry1.json registry2.json > registry.json
```

Or use tenant-specific registries (multi-tenancy mode).

### How do I validate my registry?

```bash
mcp config validate

# Or manually
cd server
npm run validate
```

This checks:

- JSON syntax
- Schema compliance
- Semantic rules (e.g., no duplicate env keys)

### What happens if I have a syntax error in registry.json?

The gateway will:

1. Log error message
2. Keep using previous valid registry
3. Wait for fix and hot-reload

Check logs:

```bash
mcp logs
```

## Authentication & Security

### Is authentication enabled by default?

**Yes!** MCP Gateway is secure by default.

On first start, it:

1. Generates a 32-byte random API key
2. Stores it in system keychain
3. Requires Bearer authentication on all HTTP/SSE endpoints

stdio transport bypasses auth (pipe ownership = authentication).

### How do I get my API key?

```bash
# Docker
docker exec mcp-gateway sh -c 'PRINT_API_KEY=true node dist/index.js'

# npm
PRINT_API_KEY=true npm start

# CLI
mcp auth token
```

### Can I disable authentication?

**Yes, but only for development!**

**Create `.mcp-gateway.json`:**

```json
{
  "disableAuth": true
}
```

**Or use CLI:**

```bash
mcp auth disable
```

**Or environment variable:**

```bash
GATEWAY_DISABLE_AUTH=true npm start
```

**Never disable auth in production.**

### How do I rotate API keys?

```bash
# Generate new key
mcp auth rotate

# Update clients with new key
export API_KEY="new-key-here"
```

Old key is invalidated immediately.

### What authentication methods are supported?

**v3.0 supports:**

1. **API Key** (default)
2. **JWT Tokens**
3. **OAuth 2.0** (GitHub, Google, Azure AD, Okta, Auth0)
4. **SAML SSO** (Okta, Auth0, OneLogin, Azure AD)
5. **LDAP/Active Directory**
6. **Kerberos/SPNEGO**
7. **mTLS Client Certificates**

See [USER_GUIDE.md](USER_GUIDE.md#authentication--authorization) for configuration.

### How do I restrict access by IP address?

```bash
# Add allowed IPs
mcp auth allow add 192.168.1.0/24
mcp auth allow add 10.0.0.0/8

# List allowed IPs
mcp auth allow list

# Remove IP
mcp auth allow remove 192.168.1.100
```

Or edit `.mcp-gateway.json`:

```json
{
  "allowedIPs": ["192.168.1.0/24", "10.0.0.0/8"]
}
```

### How do I set up HTTPS?

Use a reverse proxy (recommended):

**nginx:**

```nginx
server {
  listen 443 ssl;
  server_name gateway.example.com;

  ssl_certificate /etc/ssl/cert.pem;
  ssl_certificate_key /etc/ssl/key.pem;

  location / {
    proxy_pass http://localhost:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
  }
}
```

**Caddy:**

```
gateway.example.com {
  reverse_proxy localhost:3000
}
```

See [REVERSE_PROXY_NGINX.md](REVERSE_PROXY_NGINX.md) and [REVERSE_PROXY_TRAEFIK.md](REVERSE_PROXY_TRAEFIK.md).

### Is MCP Gateway GDPR/HIPAA compliant?

MCP Gateway provides tools for compliance:

- Audit logging (tamper-proof)
- Data encryption at rest and in transit
- RBAC for access control
- Secrets management
- Data retention policies

**However**, compliance depends on your deployment and configuration.

See [AUDIT_LOGGING.md](AUDIT_LOGGING.md) and [SECURITY_HARDENING.md](SECURITY_HARDENING.md).

## Server Management

### What's the difference between persistent and on-demand servers?

**Persistent:**

- Always running
- Started on gateway boot
- Auto-restarts on crash
- Lowest latency
- Higher memory usage

**On-Demand:**

- Lazy-loaded (starts on first tool call)
- Stops after 5 minutes idle (configurable)
- First call has startup latency
- Lower memory usage

**Recommendation:**

- Use `persistent` for frequently-used servers
- Use `on-demand` for rarely-used servers

### How do I change a server from on-demand to persistent?

**Using CLI:**

```bash
mcp servers update my-server --lifecycle persistent
```

**Or edit registry:**

```json
{
  "my-server": {
    "lifecycle": "persistent"
  }
}
```

The gateway hot-reloads automatically. Restart the server:

```bash
mcp servers restart my-server
```

### Can I start/stop servers manually?

Yes!

```bash
# Start
mcp servers start <server-name>

# Stop
mcp servers stop <server-name>

# Restart
mcp servers restart <server-name>
```

Or via REST API:

```bash
curl -X POST -H "Authorization: Bearer $API_KEY" \
  http://localhost:3000/api/servers/my-server/start
```

### How do I view server logs?

```bash
# All servers
mcp logs

# Specific server
mcp logs <server-name>

# Tail logs
mcp logs <server-name> --tail 100 --follow

# Filter by level
mcp logs --level error
```

### Can I disable a server without deleting it?

Yes!

```bash
mcp servers disable <server-name>
```

Or edit registry:

```json
{
  "my-server": {
    "enabled": false
  }
}
```

Disabled servers won't start and tool calls will return an error.

### How do I delete a server?

```bash
mcp servers delete <server-name> --force
```

Or remove from registry.json:

```json
{
  "servers": {
    // Remove the server entry
  }
}
```

### Can I run the same MCP server multiple times with different configs?

Yes! Use different server names:

```json
{
  "filesystem-tmp": {
    "source": "pkg",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
  },
  "filesystem-home": {
    "source": "pkg",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "/home"]
  }
}
```

Tools are namespaced:

- `filesystem-tmp/read_file`
- `filesystem-home/read_file`

## Tool Calls

### How do I list available tools?

```bash
# All tools
mcp tools list

# Tools for specific server
mcp tools list <server-name>
```

Or via REST API:

```bash
curl -H "Authorization: Bearer $API_KEY" \
  http://localhost:3000/api/tools/<server-name>
```

### What is tool namespacing?

Tools are prefixed with the server name:

**Registry:**

```json
{
  "servers": {
    "filesystem": { ... },
    "git": { ... }
  }
}
```

**Tool names:**

- `filesystem/read_file`
- `filesystem/write_file`
- `git/commit`
- `git/push`

This prevents name conflicts between servers.

### Can I use tools without the namespace prefix?

No, the namespace is required for routing. However, some AI tools may support aliases:

```json
{
  "aliases": {
    "read": "filesystem/read_file",
    "write": "filesystem/write_file"
  }
}
```

Check your AI tool's documentation.

### How do I call a tool?

**In AI tool (Claude Code, etc.):**

```
filesystem/read_file /tmp/test.txt
```

**Via REST API:**

```bash
curl -X POST http://localhost:3000/api/tools/call \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{
    "tool": "filesystem/read_file",
    "arguments": {
      "path": "/tmp/test.txt"
    }
  }'
```

**Via CLI:**

```bash
mcp tools call filesystem/read_file --args '{"path": "/tmp/test.txt"}'
```

### Why is my tool call failing?

**Common causes:**

1. **Server not running:**

   ```bash
   mcp servers get <server-name>
   ```

   Check `state` field. If `stopped`, start it:

   ```bash
   mcp servers start <server-name>
   ```

2. **Incorrect tool name:**

   ```bash
   mcp tools list <server-name>
   ```

   Verify tool exists and use exact name.

3. **Invalid arguments:**
   Check tool schema:

   ```bash
   mcp tools get <server>/<tool>
   ```

4. **Permissions (RBAC):**
   Verify user has permission:

   ```bash
   mcp permissions list <user>
   ```

5. **Server error:**
   Check server logs:
   ```bash
   mcp logs <server-name> --level error
   ```

### Can I rate-limit tool calls?

Yes! v3.0 includes rate limiting:

```json
{
  "rateLimit": {
    "enabled": true,
    "limits": {
      "toolCalls": {
        "server": 100,
        "interval": "1m"
      }
    }
  }
}
```

See [SECURITY_HARDENING.md](SECURITY_HARDENING.md).

## Performance

### How much memory does MCP Gateway use?

**Gateway process:**

- Idle: ~50MB
- Active: ~100-200MB

**Servers (depends on server):**

- Node.js MCP server: ~30-100MB each
- Python MCP server: ~20-80MB each
- Container MCP server: varies

**Total (5 persistent servers):** ~500MB-1GB

**Optimization:**

- Use on-demand lifecycle for rarely-used servers
- Implement resource limits for containers
- Enable server reaping (auto-stop idle servers)

### How do I reduce memory usage?

1. **Use on-demand servers:**

   ```json
   {
     "lifecycle": "on-demand",
     "idleTimeout": 300000
   }
   ```

2. **Limit container resources:**

   ```json
   {
     "source": "container",
     "resources": {
       "memory": "256m"
     }
   }
   ```

3. **Disable unused servers:**

   ```bash
   mcp servers disable <server-name>
   ```

4. **Use git source instead of container** (if possible)

### Why are tool calls slow?

**Possible causes:**

1. **On-demand server cold start:**
   - First call after idle timeout starts server
   - Solution: Use `persistent` lifecycle

2. **Network latency (remote servers):**
   - Check latency: `ping mcp-server.example.com`
   - Solution: Use CDN or edge deployment

3. **Server processing time:**
   - Check server logs
   - Solution: Optimize server code or upgrade resources

4. **Gateway overload:**
   - Check CPU/memory: `docker stats`
   - Solution: Horizontal scaling

5. **Large payloads:**
   - Check request/response size
   - Solution: Implement compression or pagination

### How do I benchmark performance?

```bash
# Gateway health endpoint (should be <10ms)
time curl http://localhost:3000/health

# Tool call latency
time mcp tools call filesystem/read_file --args '{"path": "/tmp/test.txt"}'

# Load testing (use Apache Bench)
ab -n 1000 -c 10 http://localhost:3000/health
```

See [PERFORMANCE_TUNING.md](PERFORMANCE_TUNING.md) for details.

### Can I run multiple gateway instances?

Yes! Use a load balancer:

**nginx:**

```nginx
upstream mcp_gateway {
  server gateway-1:3000;
  server gateway-2:3000;
  server gateway-3:3000;
}

server {
  location / {
    proxy_pass http://mcp_gateway;
  }
}
```

**Note:** Shared state (database) required for multi-instance deployment.

See [PRODUCTION_DEPLOYMENT.md](PRODUCTION_DEPLOYMENT.md) for Kubernetes setup.

## Troubleshooting

### Gateway won't start

**Error:** `EADDRINUSE: address already in use :::3000`

**Solution:** Port 3000 is taken. Use different port:

```bash
GATEWAY_PORT=3001 npm start
```

Or stop the conflicting process:

```bash
lsof -i :3000
kill -9 <PID>
```

---

**Error:** `Cannot find module 'xyz'`

**Solution:** Rebuild gateway:

```bash
cd server
npm install
npm run build
npm start
```

### Server won't start

**Error:** `timeout waiting for server to start`

**Solution:** Increase timeout:

```json
{
  "my-server": {
    "timeout": 60000
  }
}
```

---

**Error:** `Server exited with code 1`

**Solution:** Check server logs:

```bash
mcp logs <server-name>
```

Common causes:

- Missing environment variables
- Invalid command/args
- Package not found
- Network issues

### Authentication errors

**Error:** `401 Unauthorized`

**Solution:** Get and use API key:

```bash
PRINT_API_KEY=true npm start
export API_KEY="your-key-here"
curl -H "Authorization: Bearer $API_KEY" http://localhost:3000/api/servers
```

---

**Error:** `No API key found in keychain`

**Solution:** Start gateway once to generate key:

```bash
npm start
# Wait for "Server listening on port 3000"
# Press Ctrl+C
PRINT_API_KEY=true npm start
```

### Tool call errors

**Error:** `Server not found: xyz`

**Solution:** Check server name:

```bash
mcp servers list
```

Tool names are namespaced: `<server-name>/<tool-name>`

---

**Error:** `Tool call timeout`

**Solution:** Check server is running:

```bash
mcp servers get <server-name>
```

Start if stopped:

```bash
mcp servers start <server-name>
```

### Docker errors

**Error:** `Cannot connect to Docker daemon`

**Solution:** Ensure Docker is running:

```bash
docker ps
```

Install Docker if needed: https://docs.docker.com/get-docker/

---

**Error:** `container source fails with permission denied`

**Solution:** Mount Docker socket:

```bash
docker run -i --rm \
  -v /var/run/docker.sock:/var/run/docker.sock \
  ghcr.io/ismail-kattakath/mcp-gateway:latest
```

**Security note:** Only mount if you trust server configs.

### Hot reload not working

**Possible causes:**

1. **Registry file not watched:**
   - Check registry path: `mcp config get`
   - Verify file permissions (must be readable)

2. **Syntax error in registry:**
   - Validate: `mcp config validate`
   - Check logs: `mcp logs`

3. **Docker volume not mounted:**
   ```bash
   docker run -i --rm \
     -v ~/.mcp-gateway/registry.json:/app/registry.json:ro \
     ghcr.io/ismail-kattakath/mcp-gateway:latest
   ```

### Where can I get help?

- **Documentation:** [GitHub Docs](https://github.com/ismail-kattakath/mcp-gateway/tree/main/docs)
- **Issues:** [GitHub Issues](https://github.com/ismail-kattakath/mcp-gateway/issues)
- **Discussions:** [GitHub Discussions](https://github.com/ismail-kattakath/mcp-gateway/discussions)
- **Security:** [Security Policy](../SECURITY.md)

## Integration with AI Tools

### Which AI tools support MCP Gateway?

Any tool that supports the Model Context Protocol:

- **Claude Code** (stdio, SSE)
- **Claude Desktop** (stdio)
- **Continue** (VS Code extension, stdio)
- **Cursor** (stdio)
- **Custom integrations** (any MCP client)

### How do I connect Claude Code to the gateway?

Edit `~/.claude/.mcp.json`:

**Stdio mode (auto-spawn):**

```json
{
  "mcpServers": {
    "gateway": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "ghcr.io/ismail-kattakath/mcp-gateway:latest"
      ]
    }
  }
}
```

**SSE mode (persistent gateway):**

```json
{
  "mcpServers": {
    "gateway": {
      "url": "http://localhost:3000/sse",
      "transport": "sse",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}
```

### How do I connect Claude Desktop to the gateway?

Edit config file:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

Use the same JSON format as Claude Code.

### Can I use MCP Gateway with multiple AI tools at the same time?

**Yes!** That's the main benefit of the gateway.

**Option 1: Each tool auto-spawns (stdio):**

- Each tool starts its own gateway instance
- Separate processes, no shared state
- Simple but higher memory usage

**Option 2: Shared persistent gateway (SSE):**

- One gateway daemon
- All tools connect via SSE
- Shared state, lower memory usage
- Requires API key distribution

### How do I migrate from direct MCP servers to gateway?

**Before (Claude Code config):**

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
    },
    "git": {
      "command": "npx",
      "args": ["-y", "git-mcp"]
    }
  }
}
```

**After (gateway config):**

1. Create `~/.mcp-gateway/registry.json`:

   ```json
   {
     "version": "3.0",
     "servers": {
       "filesystem": {
         "source": "pkg",
         "command": "npx",
         "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
       },
       "git": {
         "source": "pkg",
         "command": "npx",
         "args": ["-y", "git-mcp"]
       }
     }
   }
   ```

2. Update Claude Code config:

   ```json
   {
     "mcpServers": {
       "gateway": {
         "command": "docker",
         "args": [
           "run",
           "-i",
           "--rm",
           "-v",
           "${HOME}/.mcp-gateway/registry.json:/app/registry.json:ro",
           "ghcr.io/ismail-kattakath/mcp-gateway:latest"
         ]
       }
     }
   }
   ```

3. Update tool calls:
   - Before: `read_file /tmp/test.txt`
   - After: `filesystem/read_file /tmp/test.txt`

**Or use migration tool:**

```bash
mcp import claude-desktop \
  --input claude_desktop_config.json \
  --output ~/.mcp-gateway/registry.json
```

## Production Deployment

### Is MCP Gateway suitable for production?

Yes! v3.0 includes:

- Enterprise authentication
- RBAC and multi-tenancy
- Audit logging
- Security hardening
- Kubernetes support
- Horizontal scaling
- Comprehensive monitoring

See [PRODUCTION_DEPLOYMENT.md](PRODUCTION_DEPLOYMENT.md).

### How do I deploy to Kubernetes?

**Quick deploy:**

```bash
kubectl apply -f deploy/kubernetes/
```

**Using Helm:**

```bash
helm install mcp-gateway mcp-gateway/mcp-gateway \
  --namespace mcp-gateway \
  --create-namespace
```

See [tutorials/kubernetes-deployment.md](tutorials/kubernetes-deployment.md).

### How do I set up high availability?

**Kubernetes (recommended):**

- Multiple replicas (min 3)
- HorizontalPodAutoscaler
- PodDisruptionBudget
- Anti-affinity rules

**Docker Swarm:**

```yaml
services:
  gateway:
    image: ghcr.io/ismail-kattakath/mcp-gateway:latest
    deploy:
      replicas: 3
      update_config:
        parallelism: 1
        delay: 10s
```

See [PRODUCTION_DEPLOYMENT.md](PRODUCTION_DEPLOYMENT.md).

### How do I monitor the gateway in production?

**Prometheus + Grafana:**

1. Enable metrics:

   ```json
   {
     "metrics": {
       "enabled": true,
       "port": 9090
     }
   }
   ```

2. Configure Prometheus:

   ```yaml
   scrape_configs:
     - job_name: "mcp-gateway"
       static_configs:
         - targets: ["gateway:3000"]
   ```

3. Import Grafana dashboard:
   - See `deploy/monitoring/grafana-dashboard.json`

See [tutorials/monitoring-setup.md](tutorials/monitoring-setup.md).

### How do I backup the gateway?

```bash
# Backup
mcp backup create \
  --output backup-$(date +%Y%m%d).tar.gz \
  --include-secrets \
  --include-database

# Restore
mcp backup restore \
  --input backup-20240101.tar.gz
```

**What's included:**

- Registry configuration
- Secrets (encrypted)
- Audit logs
- User database
- Server state

### What's the recommended database for production?

**Development:**

- SQLite (default)

**Production:**

- PostgreSQL (recommended)
- MySQL
- MariaDB

**Migration:**

```bash
mcp migrate database \
  --from sqlite \
  --to postgres \
  --connection-string "postgresql://user:pass@host:5432/db"
```

See [PRODUCTION_DEPLOYMENT.md](PRODUCTION_DEPLOYMENT.md).

### How do I handle secrets in production?

**Use secrets manager:**

**Kubernetes Secrets:**

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: mcp-gateway-secrets
data:
  api-key: <base64-encoded>
```

**HashiCorp Vault:**

```json
{
  "secrets": {
    "provider": "vault",
    "vault": {
      "address": "https://vault.example.com",
      "token": "${VAULT_TOKEN}",
      "path": "secret/mcp-gateway"
    }
  }
}
```

**AWS Secrets Manager:**

```json
{
  "secrets": {
    "provider": "aws",
    "aws": {
      "region": "us-east-1",
      "secretId": "mcp-gateway-secrets"
    }
  }
}
```

See [SECURITY_HARDENING.md](SECURITY_HARDENING.md).

### How do I set up disaster recovery?

**Multi-region deployment:**

1. Deploy to multiple regions (us-east, us-west, eu-west)
2. Use global load balancer (Cloudflare, AWS Global Accelerator)
3. Replicate database across regions
4. Implement automated failover

**Backup strategy:**

- Daily full backups
- Hourly incremental backups
- 30-day retention
- Off-site storage (S3, GCS, Azure Blob)

**Recovery procedure:**

1. Provision new infrastructure
2. Restore database from backup
3. Deploy latest gateway version
4. Verify health checks
5. Update DNS

See [PRODUCTION_DEPLOYMENT.md](PRODUCTION_DEPLOYMENT.md).

---

**More questions?**

- [GitHub Discussions](https://github.com/ismail-kattakath/mcp-gateway/discussions)
- [GitHub Issues](https://github.com/ismail-kattakath/mcp-gateway/issues)
- [Documentation](https://github.com/ismail-kattakath/mcp-gateway/tree/main/docs)
