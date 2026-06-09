# Getting Started with MCP Gateway

Welcome to MCP Gateway - the universal aggregator for Model Context Protocol (MCP) servers. This guide will help you get up and running in just 5 minutes.

## Table of Contents

- [What is MCP Gateway?](#what-is-mcp-gateway)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
  - [Option 1: Docker (Recommended)](#option-1-docker-recommended)
  - [Option 2: npm/npx](#option-2-npmnpx)
  - [Option 3: Kubernetes](#option-3-kubernetes)
  - [Option 4: From Source](#option-4-from-source)
- [Quick Start (5 minutes)](#quick-start-5-minutes)
- [Configuration Basics](#configuration-basics)
- [Authentication Setup](#authentication-setup)
- [Connecting AI Tools](#connecting-ai-tools)
- [Troubleshooting](#troubleshooting)
- [Next Steps](#next-steps)

## What is MCP Gateway?

MCP Gateway is a universal aggregator for [Model Context Protocol](https://modelcontextprotocol.io/) servers. Instead of configuring multiple MCP servers in every AI coding tool (Claude Code, Claude Desktop, Cline, Cursor), you configure them once in the gateway and point all your tools to it.

**Key Benefits:**

- **Single Configuration**: Manage all MCP servers in one place
- **Zero Setup**: Auto-starts with sensible defaults
- **Secure by Default**: Auto-generated API keys stored in system keychain
- **Hot Reload**: Update server configs without restarting
- **Multi-Transport**: Supports stdio, SSE, and HTTP
- **Production Ready**: Kubernetes, Helm, Docker Compose support

**Architecture Overview:**

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

## Prerequisites

Choose one of the following:

**For Docker (Recommended):**

- Docker 20.10+ or Podman 3.0+
- 512MB RAM minimum
- Linux, macOS, or Windows (WSL2)

**For npm/npx:**

- Node.js 18+ (LTS recommended)
- npm 9+
- 256MB RAM minimum

**For Kubernetes:**

- Kubernetes 1.24+ cluster
- kubectl configured
- Helm 3+ (optional, for Helm chart)

**For Source:**

- Node.js 18+
- Git
- npm 9+

## Installation

### Option 1: Docker (Recommended)

**Zero setup - just paste this config:**

For Claude Code (`~/.claude/.mcp.json`):

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

For Claude Desktop:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

That's it! The gateway auto-downloads and starts with example servers.

**Persistent daemon mode** (for always-on access):

```bash
# Start gateway
docker run -d --name mcp-gateway \
  -p 127.0.0.1:3000:3000 \
  -v ~/.mcp-gateway/registry.json:/app/registry.json:ro \
  -v ~/.mcp:/root/.mcp \
  ghcr.io/ismail-kattakath/mcp-gateway:latest

# Get API key
docker exec mcp-gateway sh -c 'PRINT_API_KEY=true node dist/index.js'

# View logs
docker logs -f mcp-gateway

# Stop gateway
docker stop mcp-gateway && docker rm mcp-gateway
```

### Option 2: npm/npx

**Quick test** (no installation):

```bash
npx mcp-gateway-server
```

**Global installation:**

```bash
npm install -g mcp-gateway-server
mcp-gateway
```

**Local installation** (in your project):

```bash
npm install mcp-gateway-server
npx mcp-gateway
```

### Option 3: Kubernetes

**Quick deploy with kubectl:**

```bash
# Clone repository
git clone https://github.com/ismail-kattakath/mcp-gateway.git
cd mcp-gateway

# Apply manifests
kubectl apply -f deploy/kubernetes/

# Wait for deployment
kubectl wait --for=condition=available deployment/mcp-gateway -n mcp-gateway --timeout=120s

# Get service URL
kubectl get svc mcp-gateway -n mcp-gateway
```

**Using Helm chart:**

```bash
helm repo add mcp-gateway https://ismail-kattakath.github.io/mcp-gateway
helm repo update

helm install mcp-gateway mcp-gateway/mcp-gateway \
  --namespace mcp-gateway \
  --create-namespace \
  --set ingress.enabled=true \
  --set ingress.hosts[0].host=gateway.example.com

# Check status
helm status mcp-gateway -n mcp-gateway
```

See [docs/tutorials/kubernetes-deployment.md](tutorials/kubernetes-deployment.md) for production setup.

### Option 4: From Source

**For development or customization:**

```bash
# Clone repository
git clone https://github.com/ismail-kattakath/mcp-gateway.git
cd mcp-gateway

# Install dependencies
npm install

# Build server
cd server
npm install
npm run build

# Start gateway
npm start
```

**Development mode with hot reload:**

```bash
cd server
npm run dev
```

**Start UI dashboard (optional):**

```bash
cd ui
npm install
npm run dev
```

Dashboard will be available at http://localhost:5173

## Quick Start (5 minutes)

Let's set up your first MCP server and make a tool call.

### Step 1: Create Registry Configuration

Create `~/.mcp-gateway/registry.json`:

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

**What this does:**

- Defines a server named `filesystem`
- Uses npm package `@modelcontextprotocol/server-filesystem`
- Grants access to `/tmp` directory
- Starts on-demand (lazy loading)

### Step 2: Start the Gateway

**If using Docker:**

```bash
docker run -i --rm \
  -v ~/.mcp-gateway/registry.json:/app/registry.json:ro \
  ghcr.io/ismail-kattakath/mcp-gateway:latest
```

**If using npm:**

```bash
# Set registry path
export REGISTRY_PATH=~/.mcp-gateway/registry.json
npx mcp-gateway-server
```

**Verify it's running:**

```bash
curl http://localhost:3000/health
```

Expected output:

```json
{
  "status": "ok",
  "uptime": 5,
  "version": "3.0",
  "servers": {
    "total": 1,
    "enabled": 1,
    "running": 0,
    "list": ["filesystem"]
  }
}
```

### Step 3: Install CLI (Optional)

The CLI makes server management easier:

```bash
cd cli
npm install
npm run build
npm link  # Makes 'mcp' command globally available
```

**Test CLI:**

```bash
mcp health
mcp servers list
```

### Step 4: List Available Tools

**Using CLI:**

```bash
mcp tools list filesystem
```

**Using curl:**

```bash
curl http://localhost:3000/api/servers/filesystem
```

**Using MCP client** (Claude Code, etc.):

The gateway automatically exposes all tools with namespaced names:

- `filesystem/read_file`
- `filesystem/write_file`
- `filesystem/list_directory`
- etc.

### Step 5: Call a Tool

**Using MCP client:**

In Claude Code or Claude Desktop, you can now use tools like:

```
filesystem/list_directory /tmp
```

**Using REST API:**

```bash
curl -X POST http://localhost:3000/api/tools/call \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "filesystem/list_directory",
    "arguments": {
      "path": "/tmp"
    }
  }'
```

**Congratulations!** You've successfully set up MCP Gateway and made your first tool call.

## Configuration Basics

### Server Sources

MCP Gateway supports 5 server sources:

#### 1. Package Manager (`pkg`)

Run servers from npm, pip, or other package managers:

```json
{
  "obs": {
    "source": "pkg",
    "command": "npx",
    "args": ["-y", "obs-mcp@latest"],
    "enabled": true
  }
}
```

Supported package managers:

- **npm**: `npx -y package@version`
- **Python**: `uvx package` or `pipx run package`
- **Any**: Custom command + args

#### 2. Git Repository (`git`)

Clone and build servers from Git:

```json
{
  "custom-server": {
    "source": "git",
    "repo": "https://github.com/user/mcp-server.git",
    "branch": "main",
    "command": "node",
    "args": ["${REPO_DIR}/dist/index.js"],
    "build": {
      "steps": ["npm install", "npm run build"]
    }
  }
}
```

The gateway will:

1. Clone the repository
2. Run build steps
3. Execute the command with `${REPO_DIR}` substitution

#### 3. Docker Container (`container`)

Run servers in Docker containers:

```json
{
  "containerized": {
    "source": "container",
    "image": "ghcr.io/user/mcp-server:latest",
    "pull": true,
    "env": {
      "API_KEY": "${API_KEY}"
    }
  }
}
```

Or build from Dockerfile:

```json
{
  "custom": {
    "source": "container",
    "build": {
      "context": "./docker",
      "dockerfile": "Dockerfile"
    }
  }
}
```

**Note**: Requires Docker socket access (see [Security](#security-considerations))

#### 4. Remote Server (`remote`)

Connect to already-running MCP servers:

```json
{
  "remote-server": {
    "source": "remote",
    "transport": "sse",
    "url": "https://mcp-server.example.com/sse",
    "headers": {
      "Authorization": "Bearer ${TOKEN}"
    }
  }
}
```

Supports both SSE and HTTP transports.

#### 5. Local Script (`local`)

Run existing scripts or binaries:

```json
{
  "my-script": {
    "source": "local",
    "command": "python3",
    "args": ["${HOME}/scripts/mcp-server.py"],
    "cwd": "${HOME}/scripts"
  }
}
```

### Lifecycle Modes

Control when servers start:

**Persistent** (always running):

```json
{
  "always-on": {
    "source": "pkg",
    "command": "npx",
    "args": ["-y", "my-server"],
    "lifecycle": "persistent"
  }
}
```

**On-Demand** (lazy loading):

```json
{
  "lazy": {
    "source": "pkg",
    "command": "npx",
    "args": ["-y", "my-server"],
    "lifecycle": "on-demand"
  }
}
```

On-demand servers:

- Start when first tool is called
- Idle timeout: 5 minutes (configurable)
- Lower memory footprint

### Environment Variables

Use `${VAR}` substitution from system environment:

```json
{
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
```

**Secrets management** (v3.0+):

Use the secrets manager for sensitive values:

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

See [docs/SECURITY_HARDENING.md](SECURITY_HARDENING.md) for details.

### Timeouts and Retries

Configure server behavior:

```json
{
  "server": {
    "source": "pkg",
    "command": "npx",
    "args": ["-y", "my-server"],
    "timeout": 30000,
    "retries": 3,
    "retryDelay": 1000
  }
}
```

- `timeout`: Milliseconds to wait for server start (default: 30000)
- `retries`: Number of restart attempts on failure (default: 3)
- `retryDelay`: Milliseconds between retries (default: 1000)

### Hot Reload

The gateway watches `registry.json` for changes:

```bash
# Edit registry.json
vim ~/.mcp-gateway/registry.json

# Changes applied automatically (no restart needed)
```

Watch the logs to confirm reload:

```
[INFO] Registry file changed, reloading...
[INFO] Loaded 5 servers from registry
```

## Authentication Setup

MCP Gateway is **secure by default** with auto-generated API keys.

### Automatic Mode (Default)

On first start, the gateway:

1. Generates a 32-byte random API key
2. Stores it securely in system keychain
3. Requires Bearer authentication on all HTTP/SSE endpoints

**Retrieve your API key:**

```bash
# Docker
docker exec mcp-gateway sh -c 'PRINT_API_KEY=true node dist/index.js'

# npm
PRINT_API_KEY=true npm start
```

**Use in requests:**

```bash
export API_KEY="your-key-here"
curl -H "Authorization: Bearer $API_KEY" http://localhost:3000/api/servers
```

### Disable Authentication (Development Only)

**WARNING**: Only disable auth on trusted local networks.

**Create `.mcp-gateway.json`:**

```json
{
  "disableAuth": true
}
```

**Or use CLI:**

```bash
mcp auth disable --registry ~/.mcp-gateway/registry.json
```

**Or environment variable:**

```bash
GATEWAY_DISABLE_AUTH=true npm start
```

### IP Allowlist

Restrict access by IP address:

```bash
# Add allowed IPs
mcp auth allow add 192.168.1.100
mcp auth allow add 10.0.0.0/8

# List allowed IPs
mcp auth allow list

# Remove IP
mcp auth allow remove 192.168.1.100
```

**Or edit `.mcp-gateway.json`:**

```json
{
  "disableAuth": false,
  "allowedIPs": ["192.168.1.0/24", "10.0.0.0/8"]
}
```

### Advanced Authentication (v3.0+)

MCP Gateway v3.0 adds enterprise authentication:

- **OAuth 2.0** (GitHub, Google, Azure AD)
- **SAML SSO** (Okta, Auth0, OneLogin)
- **LDAP/Active Directory**
- **Kerberos/SPNEGO**
- **mTLS Client Certificates**

See tutorials:

- [OAuth 2.0 with GitHub](tutorials/oauth-github.md)
- [SAML SSO with Okta](tutorials/saml-sso.md)
- [LDAP/AD Integration](tutorials/ldap-integration.md)

### Role-Based Access Control (RBAC)

Assign roles and permissions:

```bash
# Create user with role
mcp users create alice --role admin

# Assign permissions
mcp permissions grant alice --server filesystem --tools read_file,write_file
```

See [docs/USER_GUIDE.md](USER_GUIDE.md) for complete RBAC documentation.

## Connecting AI Tools

### Claude Code

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

### Claude Desktop

Edit config file:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

Use the same JSON format as Claude Code above.

### Continue (VS Code Extension)

Edit `~/.continue/config.json`:

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

### Cursor

Edit settings (Command/Ctrl + Shift + P → "Preferences: Open Settings (JSON)"):

```json
{
  "mcp.servers": {
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

### Custom Integration

Use the MCP client library:

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// Stdio transport
const transport = new StdioClientTransport({
  command: "docker",
  args: ["run", "-i", "--rm", "ghcr.io/ismail-kattakath/mcp-gateway:latest"],
});

const client = new Client(
  {
    name: "my-client",
    version: "1.0.0",
  },
  {
    capabilities: {},
  },
);

await client.connect(transport);

// List tools
const tools = await client.listTools();
console.log(tools);

// Call tool
const result = await client.callTool({
  name: "filesystem/read_file",
  arguments: { path: "/tmp/test.txt" },
});
```

## Troubleshooting

### Gateway Won't Start

**Issue**: `Error: Cannot find module 'xyz'`

**Solution**: Rebuild the gateway:

```bash
cd server
npm install
npm run build
npm start
```

---

**Issue**: `EADDRINUSE: address already in use :::3000`

**Solution**: Port 3000 is taken. Use a different port:

```bash
GATEWAY_PORT=3001 npm start
```

Or find and stop the conflicting process:

```bash
# Linux/macOS
lsof -i :3000
kill -9 <PID>

# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

### Server Won't Start

**Issue**: Server shows `state: "failed"` in logs

**Solution**: Check server logs:

```bash
mcp logs <server-name>
```

Common causes:

- Missing environment variables
- Invalid command/args
- Package not found (wrong npm package name)
- Network issues (can't clone git repo)

---

**Issue**: `timeout waiting for server to start`

**Solution**: Increase timeout in registry:

```json
{
  "server": {
    "timeout": 60000
  }
}
```

### Authentication Issues

**Issue**: `401 Unauthorized` on every request

**Solution**: Get and use the API key:

```bash
# Get key
docker exec mcp-gateway sh -c 'PRINT_API_KEY=true node dist/index.js'

# Use in requests
curl -H "Authorization: Bearer YOUR_KEY" http://localhost:3000/api/servers
```

---

**Issue**: `No API key found in keychain`

**Solution**: The gateway needs to run once to generate the key:

```bash
npm start
# Wait for "Server listening on port 3000"
# Press Ctrl+C
# Now start with PRINT_API_KEY=true
PRINT_API_KEY=true npm start
```

### Tool Call Failures

**Issue**: `Server not found: xyz`

**Solution**: Check server name matches registry:

```bash
mcp servers list
```

Tool names are namespaced: `<server-name>/<tool-name>`

---

**Issue**: Tool call times out

**Solution**: Check server is running:

```bash
mcp servers get <server-name>
```

If state is `stopped`, start it:

```bash
mcp servers start <server-name>
```

### Docker Issues

**Issue**: `Cannot connect to Docker daemon`

**Solution**: Ensure Docker is running:

```bash
docker ps
```

If Docker is not installed, install from [docker.com](https://docs.docker.com/get-docker/)

---

**Issue**: `container` source fails with "permission denied"

**Solution**: The gateway needs Docker socket access:

```bash
docker run -i --rm \
  -v /var/run/docker.sock:/var/run/docker.sock \
  ghcr.io/ismail-kattakath/mcp-gateway:latest
```

**Security note**: Only mount the Docker socket if you trust all server configs. See [docs/architecture/decisions.md](architecture/decisions.md) for alternatives.

### Network Issues

**Issue**: Cannot connect to remote server

**Solution**: Check network and firewall:

```bash
# Test connectivity
curl -v https://remote-server.example.com/sse

# Check DNS resolution
nslookup remote-server.example.com

# Check firewall
# Linux: iptables -L
# macOS: /usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate
# Windows: netsh advfirewall show allprofiles
```

### Performance Issues

**Issue**: High memory usage

**Solution**: Use on-demand lifecycle for unused servers:

```json
{
  "lifecycle": "on-demand"
}
```

---

**Issue**: Slow tool calls

**Solution**: Use persistent lifecycle for frequently-used servers:

```json
{
  "lifecycle": "persistent"
}
```

Check [docs/PERFORMANCE_TUNING.md](PERFORMANCE_TUNING.md) for optimization tips.

## Next Steps

**Learn More:**

- [User Guide](USER_GUIDE.md) - Comprehensive feature documentation
- [API Reference](API.md) - REST API documentation
- [FAQ](FAQ.md) - Common questions and answers
- [Architecture Guide](ARCHITECTURE.md) - System design and internals

**Tutorials:**

- [OAuth 2.0 with GitHub](tutorials/oauth-github.md)
- [SAML SSO with Okta](tutorials/saml-sso.md)
- [LDAP/AD Integration](tutorials/ldap-integration.md)
- [Kubernetes Deployment](tutorials/kubernetes-deployment.md)
- [Multi-Tenancy Setup](tutorials/multi-tenancy.md)
- [Monitoring with Prometheus](tutorials/monitoring-setup.md)

**Production Deployment:**

- [Production Deployment Guide](PRODUCTION_DEPLOYMENT.md)
- [Security Hardening](SECURITY_HARDENING.md)
- [Audit Logging](AUDIT_LOGGING.md)

**Community & Support:**

- [GitHub Issues](https://github.com/ismail-kattakath/mcp-gateway/issues) - Bug reports and feature requests
- [GitHub Discussions](https://github.com/ismail-kattakath/mcp-gateway/discussions) - Questions and community support
- [Contributing Guide](../CONTRIBUTING.md) - How to contribute
- [Security Policy](../SECURITY.md) - Report security vulnerabilities

**Happy coding!**
