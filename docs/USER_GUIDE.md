# MCP Gateway User Guide

Complete reference for MCP Gateway features and functionality.

## Table of Contents

- [Overview](#overview)
- [Server Sources](#server-sources)
- [Lifecycle Management](#lifecycle-management)
- [Authentication & Authorization](#authentication--authorization)
- [Role-Based Access Control](#role-based-access-control)
- [Multi-Tenancy](#multi-tenancy)
- [Monitoring & Observability](#monitoring--observability)
- [Security Best Practices](#security-best-practices)
- [Performance Tuning](#performance-tuning)
- [CLI Reference](#cli-reference)
- [REST API](#rest-api)
- [Migration Tools](#migration-tools)

## Overview

MCP Gateway aggregates multiple Model Context Protocol servers into a single endpoint. This guide covers all features available in v3.0.

**Architecture:**

```
┌────────────────────────────────────────────────────────────────┐
│                        MCP Gateway                              │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │     Auth     │  │     RBAC     │  │   Audit Log  │        │
│  │ Middleware   │  │   Enforcer   │  │   Recorder   │        │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘        │
│         │                  │                  │                 │
│  ┌──────┴──────────────────┴──────────────────┴───────┐        │
│  │              MCP Protocol Handler                   │        │
│  └──────┬──────────────────────────────────────────────┘        │
│         │                                                        │
│  ┌──────┴──────────────────────────────────────────────┐        │
│  │              Server Manager                          │        │
│  │  (Routing, Lifecycle, Hot Reload)                   │        │
│  └──────┬──────────────────────────────────────────────┘        │
│         │                                                        │
│  ┌──────┴─────┬──────┬──────┬──────┬──────┐                   │
│  │    pkg     │ git  │ cont │remote│local │                   │
│  │  Backend   │ Back │ Back │ Back │ Back │                   │
│  └──────┬─────┴──┬───┴──┬───┴──┬───┴──┬───┘                   │
└─────────┼────────┼──────┼──────┼──────┼─────────────────────────┘
          │        │      │      │      │
    ┌─────┴─┐  ┌───┴─┐ ┌──┴──┐ ┌─┴───┐ ┌┴────┐
    │  npm  │  │ git │ │Docker│ │HTTP │ │local│
    │server │  │repo │ │ img  │ │ SSE │ │scr│
    └───────┘  └─────┘ └──────┘ └─────┘ └─────┘
```

**Key Concepts:**

- **Server**: An MCP server configured in the registry
- **Tool**: A function exposed by an MCP server
- **Namespace**: Server name prefix for tool calls (e.g., `filesystem/read_file`)
- **Source**: How the server is provided (pkg, git, container, remote, local)
- **Lifecycle**: When the server runs (persistent or on-demand)
- **Transport**: Communication protocol (stdio, SSE, HTTP)

## Server Sources

MCP Gateway supports five server sources, each optimized for different use cases.

### Package Manager (`pkg`)

Run servers distributed via package managers.

**Configuration:**

```json
{
  "obs": {
    "source": "pkg",
    "command": "npx",
    "args": ["-y", "obs-mcp@latest"],
    "enabled": true,
    "lifecycle": "on-demand"
  }
}
```

**Supported Package Managers:**

| Manager       | Command | Example                              |
| ------------- | ------- | ------------------------------------ |
| npm (npx)     | `npx`   | `["npx", ["-y", "package@version"]]` |
| Python (uv)   | `uvx`   | `["uvx", ["package@version"]]`       |
| Python (pipx) | `pipx`  | `["pipx", ["run", "package"]]`       |
| Homebrew      | `brew`  | `["brew", ["run", "formula"]]`       |
| Custom        | Any     | `["command", ["args"]]`              |

**Best Practices:**

- Pin versions for reproducibility: `package@1.2.3`
- Use `-y` flag for npx to skip prompts
- Set `lifecycle: "on-demand"` for rarely-used servers
- Use environment variables for configuration

**Example - Python MCP Server:**

```json
{
  "python-server": {
    "source": "pkg",
    "command": "uvx",
    "args": ["mcp-server-python@2.1.0"],
    "env": {
      "PYTHONPATH": "${HOME}/.local/lib/python3.11/site-packages"
    }
  }
}
```

### Git Repository (`git`)

Clone and build servers from Git repositories.

**Configuration:**

```json
{
  "custom-mcp": {
    "source": "git",
    "repo": "https://github.com/user/mcp-server.git",
    "branch": "main",
    "commit": "abc123",
    "command": "node",
    "args": ["${REPO_DIR}/dist/index.js"],
    "build": {
      "steps": ["npm install", "npm run build"],
      "cwd": "${REPO_DIR}"
    }
  }
}
```

**Fields:**

- `repo` (required): Git repository URL (https or ssh)
- `branch` (optional): Branch name (default: `main`)
- `commit` (optional): Pin to specific commit hash
- `tag` (optional): Pin to git tag
- `command` (required): Executable to run
- `args` (optional): Arguments array
- `build` (optional): Build configuration
  - `steps`: Array of shell commands
  - `cwd`: Working directory (default: `${REPO_DIR}`)
  - `env`: Build-time environment variables

**Variable Substitution:**

- `${REPO_DIR}`: Absolute path to cloned repository
- `${HOME}`: User home directory
- `${PWD}`: Gateway working directory

**Build Process:**

1. Clone repository to `~/.mcp-gateway/repos/<hash>`
2. Checkout branch/commit/tag
3. Run build steps in sequence
4. Execute command with args

**Best Practices:**

- Use commit hash or tag for reproducibility
- Keep build steps idempotent
- Use `git+ssh://` for private repositories (configure SSH keys)
- Set `lifecycle: "persistent"` if build is expensive

**Example - Private Repository with SSH:**

```json
{
  "internal-mcp": {
    "source": "git",
    "repo": "git@github.com:company/internal-mcp.git",
    "commit": "abc123def",
    "command": "node",
    "args": ["${REPO_DIR}/dist/index.js"],
    "build": {
      "steps": ["npm ci", "npm run build"]
    },
    "env": {
      "SSH_KEY_PATH": "${HOME}/.ssh/id_ed25519"
    }
  }
}
```

### Docker Container (`container`)

Run servers in Docker containers.

**Pull Image:**

```json
{
  "containerized": {
    "source": "container",
    "image": "ghcr.io/user/mcp-server:latest",
    "pull": true,
    "pullPolicy": "always",
    "env": {
      "API_KEY": "${API_KEY}"
    },
    "volumes": ["${HOME}/data:/data:ro"],
    "network": "bridge"
  }
}
```

**Build from Dockerfile:**

```json
{
  "custom-build": {
    "source": "container",
    "build": {
      "context": "./docker",
      "dockerfile": "Dockerfile",
      "args": {
        "NODE_VERSION": "20"
      },
      "target": "production"
    }
  }
}
```

**Fields:**

- `image` (required if not building): Docker image name
- `pull` (optional): Pull image before starting (default: true)
- `pullPolicy` (optional): `always`, `never`, `if-not-present`
- `build` (optional): Build configuration
  - `context`: Build context directory
  - `dockerfile`: Dockerfile path (relative to context)
  - `args`: Build arguments
  - `target`: Multi-stage build target
- `env`: Environment variables
- `volumes`: Volume mounts (`host:container:mode`)
- `network`: Docker network (default: `bridge`)
- `ports`: Port mappings (rarely needed for MCP)

**Security Considerations:**

- Container source requires Docker socket access
- Mount socket with `-v /var/run/docker.sock:/var/run/docker.sock`
- **Security risk**: Containers can escape to host
- **Recommended**: Use Docker socket proxy (see below)

**Docker Socket Proxy:**

```bash
# Start socket proxy
docker run -d --name docker-proxy \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -p 2375:2375 \
  tecnativa/docker-socket-proxy

# Configure gateway
export DOCKER_HOST=tcp://localhost:2375
```

**Best Practices:**

- Use specific image tags, not `latest`
- Enable `pull: true` for auto-updates
- Use read-only volumes when possible (`:ro`)
- Limit container resources (see Performance Tuning)
- Prefer `pkg` or `git` sources when possible

**Example - Security-Hardened Container:**

```json
{
  "secure-mcp": {
    "source": "container",
    "image": "ghcr.io/user/secure-mcp:1.2.3",
    "pull": true,
    "pullPolicy": "always",
    "securityOpt": ["no-new-privileges", "seccomp=default"],
    "readOnly": true,
    "user": "1000:1000",
    "capDrop": ["ALL"],
    "resources": {
      "memory": "256m",
      "cpus": "0.5"
    }
  }
}
```

### Remote Server (`remote`)

Connect to already-running MCP servers.

**SSE Transport:**

```json
{
  "remote-sse": {
    "source": "remote",
    "transport": "sse",
    "url": "https://mcp-server.example.com/sse",
    "headers": {
      "Authorization": "Bearer ${TOKEN}",
      "X-API-Version": "v1"
    },
    "timeout": 30000,
    "reconnect": true,
    "reconnectDelay": 1000,
    "maxReconnectAttempts": 5
  }
}
```

**HTTP Transport:**

```json
{
  "remote-http": {
    "source": "remote",
    "transport": "http",
    "url": "https://mcp-server.example.com/rpc",
    "headers": {
      "Authorization": "Bearer ${TOKEN}"
    },
    "timeout": 30000
  }
}
```

**Fields:**

- `transport` (required): `sse` or `http`
- `url` (required): Server endpoint URL
- `headers` (optional): HTTP headers object
- `timeout` (optional): Request timeout in ms (default: 30000)
- `reconnect` (optional, SSE only): Auto-reconnect on disconnect
- `reconnectDelay` (optional): Delay between reconnect attempts (default: 1000)
- `maxReconnectAttempts` (optional): Max reconnect tries (default: 5)

**Use Cases:**

- Connect to MCP servers behind firewall
- Distribute load across multiple gateways
- Use managed MCP services
- Share servers across teams/organizations

**Best Practices:**

- Use HTTPS in production
- Store tokens in secrets manager
- Set reasonable timeouts
- Enable reconnection for SSE
- Monitor connection health

**Example - Load Balancing:**

```json
{
  "mcp-primary": {
    "source": "remote",
    "transport": "sse",
    "url": "https://mcp-1.example.com/sse",
    "headers": { "Authorization": "Bearer ${TOKEN}" }
  },
  "mcp-fallback": {
    "source": "remote",
    "transport": "sse",
    "url": "https://mcp-2.example.com/sse",
    "headers": { "Authorization": "Bearer ${TOKEN}" },
    "enabled": false
  }
}
```

### Local Script (`local`)

Run existing scripts or binaries on the filesystem.

**Configuration:**

```json
{
  "my-script": {
    "source": "local",
    "command": "python3",
    "args": ["${HOME}/scripts/mcp-server.py", "--port", "8080"],
    "cwd": "${HOME}/scripts",
    "env": {
      "PYTHONPATH": "${HOME}/scripts/lib"
    }
  }
}
```

**Fields:**

- `command` (required): Executable path or name
- `args` (optional): Arguments array
- `cwd` (optional): Working directory (default: gateway cwd)
- `env` (optional): Environment variables

**Variable Substitution:**

- `${HOME}`: User home directory
- `${PWD}`: Gateway working directory
- `${USER}`: Current username

**Best Practices:**

- Use absolute paths for scripts
- Make scripts executable (`chmod +x`)
- Include shebang in scripts (`#!/usr/bin/env python3`)
- Set `cwd` to script directory for relative imports
- Use environment variables for configuration

**Example - Shell Script MCP Server:**

```bash
#!/bin/bash
# ~/scripts/mcp-server.sh

while IFS= read -r line; do
  # Parse JSON-RPC request
  echo "$line" | jq '.method'

  # Send JSON-RPC response
  echo '{"jsonrpc":"2.0","id":1,"result":{"tools":[]}}'
done
```

```json
{
  "shell-mcp": {
    "source": "local",
    "command": "bash",
    "args": ["${HOME}/scripts/mcp-server.sh"],
    "cwd": "${HOME}/scripts"
  }
}
```

## Lifecycle Management

Control when and how servers start.

### Persistent Servers

Always running, started on gateway boot.

**Configuration:**

```json
{
  "always-on": {
    "source": "pkg",
    "command": "npx",
    "args": ["-y", "critical-server"],
    "lifecycle": "persistent",
    "autoRestart": true,
    "restartDelay": 5000,
    "maxRestarts": 10
  }
}
```

**Behavior:**

- Starts immediately when gateway starts
- Auto-restarts on crash (if `autoRestart: true`)
- Always in memory
- Lowest latency for tool calls

**Use Cases:**

- Frequently-used servers
- Mission-critical tools
- Low-latency requirements
- Expensive startup cost

**Resource Usage:**

- Higher memory footprint
- Persistent CPU usage
- Better for high-traffic scenarios

### On-Demand Servers

Lazy-loaded, started when first tool is called.

**Configuration:**

```json
{
  "lazy": {
    "source": "pkg",
    "command": "npx",
    "args": ["-y", "rarely-used-server"],
    "lifecycle": "on-demand",
    "idleTimeout": 300000,
    "startupTimeout": 30000
  }
}
```

**Behavior:**

- Not started on gateway boot
- Starts on first tool call
- Stops after `idleTimeout` ms of inactivity (default: 300000 = 5 minutes)
- First call has startup latency

**Use Cases:**

- Rarely-used servers
- Development/testing
- Resource-constrained environments
- Many servers, few active

**Resource Usage:**

- Lower memory footprint
- No CPU when idle
- Better for low-traffic scenarios

### Lifecycle Events

Monitor server lifecycle:

```bash
# Watch server state changes
mcp servers watch <server-name>

# View lifecycle logs
mcp logs <server-name> --filter lifecycle
```

**States:**

- `stopped`: Not running
- `starting`: Initializing
- `running`: Active and ready
- `stopping`: Shutting down
- `failed`: Crashed or error
- `idle`: Running but no recent activity (on-demand only)

**State Transitions:**

```
stopped → starting → running → idle → stopping → stopped
                     ↓
                   failed → starting (if autoRestart)
```

### Manual Control

**Start server:**

```bash
mcp servers start <server-name>
```

**Stop server:**

```bash
mcp servers stop <server-name>
```

**Restart server:**

```bash
mcp servers restart <server-name>
```

**Enable/Disable:**

```bash
# Disable (stop and prevent auto-start)
mcp servers disable <server-name>

# Enable (allow start, but don't start immediately)
mcp servers enable <server-name>
```

## Authentication & Authorization

MCP Gateway v3.0 includes comprehensive authentication and authorization.

### Authentication Strategies

#### 1. API Key (Default)

Auto-generated secure keys stored in system keychain.

**Configuration:**

```json
{
  "authentication": {
    "strategies": ["api-key"],
    "apiKey": {
      "enabled": true,
      "keyLength": 32,
      "rotation": {
        "enabled": true,
        "interval": "90d"
      }
    }
  }
}
```

**Usage:**

```bash
# Get key
PRINT_API_KEY=true npm start

# Use in requests
curl -H "Authorization: Bearer YOUR_KEY" http://localhost:3000/api/servers
```

**CLI commands:**

```bash
# Display current key
mcp auth token

# Rotate key (generate new)
mcp auth rotate

# Revoke key
mcp auth revoke <key-id>
```

#### 2. JWT Tokens

JSON Web Tokens for stateless authentication.

**Configuration:**

```json
{
  "authentication": {
    "strategies": ["jwt"],
    "jwt": {
      "enabled": true,
      "secret": "${JWT_SECRET}",
      "algorithm": "HS256",
      "expiresIn": "24h",
      "issuer": "mcp-gateway",
      "audience": "mcp-clients"
    }
  }
}
```

**Generate token:**

```bash
mcp auth jwt create \
  --user alice \
  --role admin \
  --expires 24h
```

**Usage:**

```bash
export TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/servers
```

#### 3. OAuth 2.0

Delegate authentication to OAuth providers.

**Configuration:**

```json
{
  "authentication": {
    "strategies": ["oauth"],
    "oauth": {
      "enabled": true,
      "provider": "github",
      "clientId": "${GITHUB_CLIENT_ID}",
      "clientSecret": "${GITHUB_CLIENT_SECRET}",
      "callbackUrl": "http://localhost:3000/auth/callback",
      "scopes": ["read:user", "user:email"]
    }
  }
}
```

**Supported Providers:**

- GitHub
- Google
- Microsoft Azure AD
- Okta
- Auth0
- GitLab
- Bitbucket

**See tutorial**: [OAuth 2.0 with GitHub](tutorials/oauth-github.md)

#### 4. SAML SSO

Enterprise single sign-on via SAML 2.0.

**Configuration:**

```json
{
  "authentication": {
    "strategies": ["saml"],
    "saml": {
      "enabled": true,
      "entryPoint": "https://idp.example.com/sso",
      "issuer": "mcp-gateway",
      "cert": "${IDP_CERT}",
      "callbackUrl": "http://localhost:3000/auth/saml/callback",
      "identifierFormat": "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress"
    }
  }
}
```

**Supported IDPs:**

- Okta
- Auth0
- OneLogin
- Azure AD
- Google Workspace
- Custom SAML 2.0

**See tutorial**: [SAML SSO with Okta](tutorials/saml-sso.md)

#### 5. LDAP/Active Directory

Authenticate against corporate directory.

**Configuration:**

```json
{
  "authentication": {
    "strategies": ["ldap"],
    "ldap": {
      "enabled": true,
      "url": "ldap://ldap.example.com:389",
      "bindDN": "cn=admin,dc=example,dc=com",
      "bindCredentials": "${LDAP_PASSWORD}",
      "searchBase": "ou=users,dc=example,dc=com",
      "searchFilter": "(uid={{username}})",
      "tlsOptions": {
        "rejectUnauthorized": true
      }
    }
  }
}
```

**Active Directory:**

```json
{
  "authentication": {
    "strategies": ["ldap"],
    "ldap": {
      "enabled": true,
      "url": "ldap://dc.corp.example.com:389",
      "bindDN": "cn=Gateway Service,ou=ServiceAccounts,dc=corp,dc=example,dc=com",
      "bindCredentials": "${AD_PASSWORD}",
      "searchBase": "ou=Users,dc=corp,dc=example,dc=com",
      "searchFilter": "(&(objectClass=user)(sAMAccountName={{username}}))",
      "searchAttributes": ["displayName", "mail", "memberOf"]
    }
  }
}
```

**See tutorial**: [LDAP/AD Integration](tutorials/ldap-integration.md)

#### 6. Kerberos/SPNEGO

Enterprise authentication via Kerberos.

**Configuration:**

```json
{
  "authentication": {
    "strategies": ["kerberos"],
    "kerberos": {
      "enabled": true,
      "servicePrincipal": "HTTP/gateway.example.com@EXAMPLE.COM",
      "keytab": "/etc/krb5.keytab",
      "realm": "EXAMPLE.COM"
    }
  }
}
```

**See docs**: [KERBEROS_SPNEGO.md](KERBEROS_SPNEGO.md)

#### 7. mTLS Client Certificates

Mutual TLS for machine-to-machine auth.

**Configuration:**

```json
{
  "authentication": {
    "strategies": ["mtls"],
    "mtls": {
      "enabled": true,
      "ca": "/etc/ssl/ca.crt",
      "requestCert": true,
      "rejectUnauthorized": true,
      "crl": "/etc/ssl/crl.pem"
    }
  }
}
```

**See docs**: [MTLS_CLIENT_CERTIFICATES.md](MTLS_CLIENT_CERTIFICATES.md)

### Multi-Strategy Authentication

Combine multiple strategies:

```json
{
  "authentication": {
    "strategies": ["api-key", "jwt", "oauth"],
    "priority": ["oauth", "jwt", "api-key"],
    "fallback": true
  }
}
```

**Priority**: Try strategies in order
**Fallback**: If all fail, deny access

## Role-Based Access Control

Fine-grained permissions for users and teams.

### Roles

**Built-in Roles:**

| Role       | Permissions                      |
| ---------- | -------------------------------- |
| `admin`    | Full access to all resources     |
| `user`     | Access to assigned servers/tools |
| `readonly` | Read-only access (view only)     |
| `operator` | Start/stop servers, view logs    |

**Custom Roles:**

```bash
# Create role
mcp roles create developer \
  --permissions server:read,server:write,tool:call \
  --description "Development team role"

# List roles
mcp roles list

# Update role
mcp roles update developer --add-permission log:read

# Delete role
mcp roles delete developer
```

### Users

**Create user:**

```bash
mcp users create alice \
  --email alice@example.com \
  --role admin \
  --password <secure-password>
```

**Assign roles:**

```bash
# Add role
mcp users add-role alice developer

# Remove role
mcp users remove-role alice developer

# List user roles
mcp users get alice
```

### Permissions

**Permission Format:** `resource:action`

**Resources:**

- `server`: MCP servers
- `tool`: MCP tools
- `user`: User management
- `role`: Role management
- `log`: Audit logs
- `config`: Gateway configuration

**Actions:**

- `read`: View resource
- `write`: Modify resource
- `call`: Execute (tools only)
- `start`: Start server
- `stop`: Stop server
- `delete`: Remove resource

**Examples:**

```bash
# Grant filesystem server access
mcp permissions grant alice --server filesystem --tools read_file,write_file

# Grant all servers read access
mcp permissions grant alice --server * --action read

# Grant admin access
mcp permissions grant alice --resource * --action *

# Revoke permission
mcp permissions revoke alice --server filesystem
```

**Configuration file:**

```json
{
  "rbac": {
    "enabled": true,
    "roles": {
      "developer": {
        "permissions": [
          "server:read",
          "server:start",
          "server:stop",
          "tool:call",
          "log:read"
        ],
        "servers": ["filesystem", "git", "obs"],
        "tools": {
          "filesystem": ["read_file", "list_directory"],
          "git": "*"
        }
      }
    },
    "users": {
      "alice": {
        "email": "alice@example.com",
        "roles": ["developer", "readonly"]
      }
    }
  }
}
```

## Multi-Tenancy

Isolate resources between organizations or teams.

### Tenant Configuration

**Enable multi-tenancy:**

```json
{
  "multiTenancy": {
    "enabled": true,
    "isolation": "strict",
    "defaultTenant": "default"
  }
}
```

**Isolation Modes:**

- `strict`: Complete isolation, no cross-tenant access
- `soft`: Isolation with opt-in sharing
- `none`: No isolation (single-tenant mode)

### Creating Tenants

```bash
# Create tenant
mcp tenants create acme-corp \
  --name "Acme Corporation" \
  --contact admin@acme.com \
  --quota-servers 10 \
  --quota-users 50

# List tenants
mcp tenants list

# Get tenant details
mcp tenants get acme-corp

# Update tenant
mcp tenants update acme-corp --quota-servers 20

# Delete tenant
mcp tenants delete acme-corp
```

### Tenant-Scoped Resources

**Servers:**

```json
{
  "version": "3.0",
  "tenant": "acme-corp",
  "servers": {
    "filesystem": {
      "source": "pkg",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/data/acme"]
    }
  }
}
```

**Users:**

```bash
# Create tenant user
mcp users create alice \
  --tenant acme-corp \
  --role user

# List tenant users
mcp users list --tenant acme-corp
```

**API Keys:**

```bash
# Create tenant API key
mcp auth create-key \
  --tenant acme-corp \
  --name "Production Key" \
  --expires 90d
```

### Tenant Isolation

**Network Isolation:**

```json
{
  "multiTenancy": {
    "networkIsolation": {
      "enabled": true,
      "vlan": true,
      "firewallRules": [
        {
          "tenant": "acme-corp",
          "allowedIPs": ["192.168.1.0/24"]
        }
      ]
    }
  }
}
```

**Storage Isolation:**

```json
{
  "multiTenancy": {
    "storage": {
      "type": "sqlite",
      "perTenant": true,
      "path": "/data/tenants/${TENANT_ID}/database.db"
    }
  }
}
```

**Resource Quotas:**

```json
{
  "multiTenancy": {
    "quotas": {
      "acme-corp": {
        "servers": 10,
        "users": 50,
        "toolCalls": 10000,
        "storage": "10GB",
        "bandwidth": "100GB"
      }
    }
  }
}
```

**See tutorial**: [Multi-Tenancy Setup](tutorials/multi-tenancy.md)

## Monitoring & Observability

Comprehensive monitoring, metrics, and tracing.

### Metrics

**Prometheus Metrics:**

```bash
# Metrics endpoint
curl http://localhost:3000/metrics
```

**Key Metrics:**

- `mcp_gateway_requests_total`: Total requests
- `mcp_gateway_requests_duration_seconds`: Request latency
- `mcp_gateway_tool_calls_total`: Total tool calls
- `mcp_gateway_server_state`: Server state (0=stopped, 1=running, 2=failed)
- `mcp_gateway_errors_total`: Error count by type
- `process_cpu_seconds_total`: CPU usage
- `process_resident_memory_bytes`: Memory usage

**Configure Prometheus:**

```yaml
# prometheus.yml
scrape_configs:
  - job_name: "mcp-gateway"
    static_configs:
      - targets: ["localhost:3000"]
    metrics_path: "/metrics"
    scrape_interval: 15s
```

### Logging

**Log Levels:**

- `error`: Critical errors
- `warn`: Warnings
- `info`: General information
- `debug`: Detailed debugging

**Configure logging:**

```json
{
  "logging": {
    "level": "info",
    "format": "json",
    "outputs": [
      {
        "type": "console",
        "level": "info"
      },
      {
        "type": "file",
        "level": "debug",
        "path": "/var/log/mcp-gateway/gateway.log",
        "maxSize": "100MB",
        "maxFiles": 10
      }
    ]
  }
}
```

**View logs:**

```bash
# All servers
mcp logs

# Specific server
mcp logs <server-name>

# Tail logs
mcp logs <server-name> --tail 100 --follow

# Filter by level
mcp logs --level error

# Filter by time range
mcp logs --since "2024-01-01" --until "2024-01-31"
```

**Log aggregation:**

See [docs/PRODUCTION_DEPLOYMENT.md](PRODUCTION_DEPLOYMENT.md) for ELK, Datadog, Splunk integration.

### Tracing

**OpenTelemetry Integration:**

```json
{
  "tracing": {
    "enabled": true,
    "provider": "jaeger",
    "endpoint": "http://jaeger:14268/api/traces",
    "serviceName": "mcp-gateway",
    "samplingRate": 1.0
  }
}
```

**Supported Providers:**

- Jaeger
- Zipkin
- OpenTelemetry Collector
- Datadog
- New Relic

**See docs**: [TRACING.md](TRACING.md)

### Health Checks

**Endpoints:**

```bash
# Basic health
curl http://localhost:3000/health

# Detailed status
curl http://localhost:3000/api/status

# Readiness probe (K8s)
curl http://localhost:3000/health/ready

# Liveness probe (K8s)
curl http://localhost:3000/health/live
```

**Response:**

```json
{
  "status": "ok",
  "uptime": 3600,
  "version": "3.0.0",
  "servers": {
    "total": 5,
    "enabled": 5,
    "running": 3,
    "failed": 0
  },
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

### Alerting

**Prometheus Alerts:**

```yaml
# alerts.yml
groups:
  - name: mcp-gateway
    rules:
      - alert: HighErrorRate
        expr: rate(mcp_gateway_errors_total[5m]) > 0.05
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High error rate detected"

      - alert: ServerDown
        expr: mcp_gateway_server_state == 0
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Server {{ $labels.server }} is down"
```

**See tutorial**: [Monitoring with Prometheus + Grafana](tutorials/monitoring-setup.md)

## Security Best Practices

### 1. Authentication

- **Never disable auth in production**
- Use strong API keys (32+ bytes, cryptographically random)
- Rotate keys regularly (90 days recommended)
- Use OAuth/SAML for user authentication
- Implement mTLS for machine-to-machine

### 2. Network Security

- **Use HTTPS in production** (terminate TLS at reverse proxy)
- Restrict CORS origins (no wildcards)
- Enable IP allowlist for sensitive deployments
- Use VPN or private networks for remote access
- Implement rate limiting (see below)

### 3. Container Security

- **Don't mount Docker socket** unless necessary
- Use Docker socket proxy if needed
- Run containers as non-root user
- Use read-only filesystems
- Drop all capabilities
- Apply seccomp profiles

### 4. Secrets Management

- **Never commit secrets** to git
- Use environment variables for secrets
- Store secrets in secrets manager (Vault, AWS Secrets Manager, Azure Key Vault)
- Use `${SECRET:KEY}` syntax in registry
- Rotate secrets regularly

### 5. Audit Logging

- **Enable audit logging** for compliance
- Log all authentication attempts
- Log all authorization decisions
- Log all administrative actions
- Export logs for compliance

### 6. Input Validation

- **Validate all user inputs** (server names, URLs, paths, args)
- Sanitize log messages (prevent log injection)
- Use allowlists for commands
- Validate environment variable names
- Check file paths for traversal

### 7. Dependency Management

- **Keep dependencies updated** (Dependabot enabled)
- Run npm audit regularly
- Scan container images (Trivy)
- Monitor CVE databases
- Pin dependency versions

### 8. Least Privilege

- **Grant minimum required permissions**
- Use RBAC for users
- Separate admin and user roles
- Restrict filesystem access
- Use dedicated service accounts

**See docs**: [SECURITY_HARDENING.md](SECURITY_HARDENING.md)

## Performance Tuning

### Server Lifecycle

**High-traffic servers**: Use `persistent` lifecycle
**Low-traffic servers**: Use `on-demand` lifecycle

```json
{
  "high-traffic": {
    "lifecycle": "persistent"
  },
  "low-traffic": {
    "lifecycle": "on-demand",
    "idleTimeout": 600000
  }
}
```

### Resource Limits

**Container resources:**

```json
{
  "server": {
    "source": "container",
    "image": "mcp-server",
    "resources": {
      "memory": "512m",
      "cpus": "1.0"
    }
  }
}
```

**Process limits:**

```bash
# ulimit (Linux)
ulimit -n 65536  # File descriptors
ulimit -u 4096   # Processes
```

### Caching

**Enable response caching:**

```json
{
  "cache": {
    "enabled": true,
    "ttl": 300,
    "maxSize": "100MB",
    "strategy": "lru"
  }
}
```

### Connection Pooling

**Database connections:**

```json
{
  "database": {
    "pool": {
      "min": 2,
      "max": 10,
      "idleTimeoutMillis": 30000
    }
  }
}
```

### Horizontal Scaling

**Load balancing multiple gateways:**

```nginx
# nginx.conf
upstream mcp_gateway {
  server gateway-1:3000;
  server gateway-2:3000;
  server gateway-3:3000;
}

server {
  listen 443 ssl;
  server_name gateway.example.com;

  location / {
    proxy_pass http://mcp_gateway;
  }
}
```

**See docs**: [PERFORMANCE_TUNING.md](PERFORMANCE_TUNING.md)

## CLI Reference

Complete command reference for the MCP Gateway CLI.

### Installation

```bash
cd cli
npm install
npm run build
npm link
```

### Global Options

```
--debug              Enable debug output
--url <url>          Gateway URL (default: http://localhost:3000)
--no-auth            Disable authentication
--format <format>    Output format: json, yaml, table (default: table)
--tenant <tenant>    Tenant ID (multi-tenancy mode)
```

### Commands

#### Health Check

```bash
mcp health
mcp health --format json
```

#### Server Management

```bash
# List servers
mcp servers list
mcp servers ls

# Get server details
mcp servers get <name>
mcp servers get <name> --format json

# Create server
mcp servers create <name> \
  --source pkg \
  --command npx \
  --args "-y" "package@version" \
  --enabled \
  --lifecycle on-demand

# Update server
mcp servers update <name> \
  --lifecycle persistent \
  --timeout 60000

# Delete server
mcp servers delete <name> --force
mcp servers rm <name> -f

# Start/stop/restart
mcp servers start <name>
mcp servers stop <name>
mcp servers restart <name>

# Enable/disable
mcp servers enable <name>
mcp servers disable <name>

# Watch server state
mcp servers watch <name>
```

#### Tool Management

```bash
# List all tools
mcp tools list

# List tools for server
mcp tools list <server-name>

# Get tool details
mcp tools get <server>/<tool>

# Call tool
mcp tools call <server>/<tool> \
  --args '{"path": "/tmp/file.txt"}'
```

#### Logs

```bash
# All servers
mcp logs

# Specific server
mcp logs <server-name>

# Tail logs
mcp logs <server-name> --tail 100 --follow

# Filter by level
mcp logs --level error

# Time range
mcp logs --since "2024-01-01" --until "2024-01-31"

# Export logs
mcp logs <server-name> --format json > logs.json
```

#### Authentication

```bash
# Display API key
mcp auth token

# Rotate key
mcp auth rotate

# Revoke key
mcp auth revoke <key-id>

# Enable/disable auth
mcp auth enable
mcp auth disable

# IP allowlist
mcp auth allow list
mcp auth allow add <ip-or-cidr>
mcp auth allow remove <ip-or-cidr>
mcp auth allow clear

# JWT
mcp auth jwt create --user <name> --role <role> --expires <duration>
mcp auth jwt verify <token>
mcp auth jwt revoke <token>
```

#### Users (RBAC)

```bash
# Create user
mcp users create <username> \
  --email <email> \
  --role <role> \
  --password <password>

# List users
mcp users list

# Get user details
mcp users get <username>

# Update user
mcp users update <username> --role admin

# Delete user
mcp users delete <username>

# Roles
mcp users add-role <username> <role>
mcp users remove-role <username> <role>
```

#### Roles (RBAC)

```bash
# Create role
mcp roles create <name> \
  --permissions <perm1>,<perm2> \
  --description <desc>

# List roles
mcp roles list

# Get role details
mcp roles get <name>

# Update role
mcp roles update <name> --add-permission <perm>

# Delete role
mcp roles delete <name>
```

#### Permissions (RBAC)

```bash
# Grant permission
mcp permissions grant <user> \
  --server <server> \
  --tools <tool1>,<tool2>

# Revoke permission
mcp permissions revoke <user> --server <server>

# List permissions
mcp permissions list <user>
```

#### Tenants (Multi-Tenancy)

```bash
# Create tenant
mcp tenants create <id> \
  --name <name> \
  --contact <email> \
  --quota-servers <n> \
  --quota-users <n>

# List tenants
mcp tenants list

# Get tenant details
mcp tenants get <id>

# Update tenant
mcp tenants update <id> --quota-servers <n>

# Delete tenant
mcp tenants delete <id>
```

#### Secrets Management

```bash
# Set secret
mcp secrets set <key> <value>

# Get secret
mcp secrets get <key>

# List secrets
mcp secrets list

# Delete secret
mcp secrets delete <key>
```

#### Audit Logs

```bash
# List audit logs
mcp audit list

# Filter by user
mcp audit list --user alice

# Filter by action
mcp audit list --action server:start

# Export audit logs
mcp audit export --format csv --since "2024-01-01"

# Verify integrity
mcp audit verify

# Statistics
mcp audit stats
```

#### Configuration

```bash
# Get config
mcp config get

# Set config value
mcp config set <key> <value>

# Validate registry
mcp config validate

# Export config
mcp config export > config.json
```

**See**: [cli/README.md](../cli/README.md) for more examples

## REST API

Complete REST API reference.

**Base URL**: `http://localhost:3000`

**Authentication**: Bearer token (except `/health` and `/docs`)

**Interactive Docs**: http://localhost:3000/docs

**OpenAPI Spec**: http://localhost:3000/docs/openapi.json

### Endpoints

**See**: [API.md](API.md) for complete reference

**Quick Reference:**

| Method | Endpoint                     | Description        |
| ------ | ---------------------------- | ------------------ |
| GET    | `/health`                    | Health check       |
| GET    | `/api/servers`               | List servers       |
| POST   | `/api/servers`               | Create server      |
| GET    | `/api/servers/:name`         | Get server         |
| PUT    | `/api/servers/:name`         | Update server      |
| DELETE | `/api/servers/:name`         | Delete server      |
| POST   | `/api/servers/:name/start`   | Start server       |
| POST   | `/api/servers/:name/stop`    | Stop server        |
| POST   | `/api/servers/:name/restart` | Restart server     |
| GET    | `/api/logs`                  | Get all logs       |
| GET    | `/api/logs/:name`            | Get server logs    |
| GET    | `/api/status`                | Gateway status     |
| GET    | `/metrics`                   | Prometheus metrics |

## Migration Tools

### Migrating from v2.x to v3.0

```bash
# Migrate registry
mcp migrate registry \
  --from v2 \
  --to v3 \
  --input registry-v2.json \
  --output registry-v3.json

# Migrate auth config
mcp migrate auth \
  --from registry.json \
  --to .mcp-gateway.json

# Migrate database
mcp migrate database \
  --from sqlite \
  --to postgres \
  --connection-string "postgresql://..."
```

**See**: [MIGRATION_V2_TO_V3.md](MIGRATION_V2_TO_V3.md)

### Migrating from Other MCP Solutions

```bash
# Import from Claude Desktop config
mcp import claude-desktop \
  --input claude_desktop_config.json \
  --output registry.json

# Import from Continue config
mcp import continue \
  --input config.json \
  --output registry.json
```

### Backup and Restore

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

---

**For more information:**

- [Getting Started](GETTING_STARTED.md)
- [FAQ](FAQ.md)
- [Architecture](ARCHITECTURE.md)
- [Tutorials](tutorials/)
- [GitHub Issues](https://github.com/ismail-kattakath/mcp-gateway/issues)
