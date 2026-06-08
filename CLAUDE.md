# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**MCP Gateway Platform** is a universal aggregator and manager for Model Context Protocol (MCP) servers. It solves the problem of maintaining multiple MCP configurations across different AI coding tools (Claude Code, Claude Desktop, Cline, Cursor, etc.) by providing a single gateway that all clients connect to via SSE/HTTPS transport.

### Key Problems Solved
- **Config Duplication**: One registry instead of N tool-specific configs
- **Context Spam**: Lazy-load backends on-demand instead of loading all tools upfront
- **Mixed Transports**: Support npx, Docker, git repos, local scripts, and remote SSE servers
- **Secret Management**: Centralized environment variables and OAuth token management
- **Multi-Machine Access**: Deploy once (local or remote), use from anywhere

### Architecture

```
Client Tools (Claude Code/Desktop/Cline/Cursor)
              ↓ (SSE/HTTPS)
         MCP Gateway Server
              ↓
    Backend Registry Manager
              ↓
    ┌─────────┼─────────┐
    ↓         ↓         ↓
  NPX     Docker    Git Repo
 Backend  Backend   Backend
```

The gateway acts as a proxy/router:
1. Client connects via SSE and requests tools
2. Gateway queries registry for enabled backends
3. Backend spawned on-demand (lazy loading)
4. Tool calls namespaced (e.g., `obs/start_recording`) and routed to correct backend
5. All MCP communication proxied through gateway

## Registry Schema

The core of the system is `registry.json` which defines all backend MCP servers. The schema supports 11 backend types:

### Backend Types

| Type | Use Case | Installation Method |
|------|----------|---------------------|
| `npx` | NPM packages | `npx -y package@version` |
| `uvx`/`pipx` | Python packages | `uvx package` or `pipx run package` |
| `docker` | Docker Hub images | Pull from registry |
| `git-npm` | Git repo + npm build | Clone → `npm install` → `npm run build` |
| `git-python` | Git repo + Python | Clone → `uv venv` → `uv pip install` |
| `git-docker` | Git repo + Docker | Clone → `docker build` |
| `local` | Pre-built local path | Direct execution from path |
| `remote-sse` | SSE endpoints (Smithery) | HTTP SSE connection |
| `remote-http` | HTTP/HTTPS endpoints | HTTP requests |
| `shell` | Shell script wrappers | Execute bash/zsh script |

### Registry Structure

Each backend entry contains:

```json
{
  "backend-id": {
    "name": "Human-readable name",
    "description": "What this backend does",
    "type": "npx|uvx|docker|git-npm|git-python|git-docker|local|remote-sse|remote-http|shell",
    "install": {
      // Type-specific installation config
      // For npx: { "package": "name", "version": "1.0.0" }
      // For git-*: { "repository": "url", "branch": "main", "build": {...} }
      // For docker: { "image": "name", "tag": "latest" }
      // For remote: { "url": "https://..." }
    },
    "runtime": {
      "command": "node|python|uv|etc",  // for local execution
      "args": [],
      "env": {
        "VAR_NAME": "${ENV_VAR}"  // references .env file
      },
      "volumes": [],  // for docker
      "ports": {},    // for docker
      "headers": {}   // for remote
    },
    "auth": {
      "type": "oauth",  // optional OAuth config
      "provider": "github|smithery",
      "scopes": [],
      "tokenRefresh": true
    },
    "lifecycle": "on-demand|persistent",  // spawn behavior
    "timeout": 30000,
    "healthcheck": {  // optional for docker
      "endpoint": "http://...",
      "interval": 30
    },
    "enabled": true
  }
}
```

### Environment Variable Resolution

Variables use `${VAR_NAME}` syntax and are resolved from:
1. `.env` file (gitignored)
2. OAuth token store (for auto-managed tokens)
3. System environment

Special variables:
- `${HOME}` - User home directory
- `${REPO_DIR}` - Backend's git repo directory (for git-* types)
- `${GATEWAY_DIR}` - Gateway installation directory
- `${GITHUB_ACCESS_TOKEN}` - Auto-managed by OAuth flow
- `${SMITHERY_ACCESS_TOKEN}` - Auto-managed by OAuth flow

## Project Structure

```
/
├── server/                    # Backend (Node.js/Bun)
│   ├── src/
│   │   ├── index.js          # Main entry, HTTP + SSE server
│   │   ├── mcp/
│   │   │   ├── protocol.js   # MCP protocol implementation (SSE)
│   │   │   ├── registry.js   # Load/parse/watch registry.json
│   │   │   ├── router.js     # Route tool calls to backends
│   │   │   └── backends/
│   │   │       ├── npx.js    # Spawn npx processes
│   │   │       ├── docker.js # Manage Docker containers
│   │   │       ├── git.js    # Clone + build git repos
│   │   │       ├── local.js  # Execute local scripts
│   │   │       └── remote.js # Proxy to remote SSE/HTTP
│   │   ├── oauth/
│   │   │   ├── github.js     # GitHub OAuth flow
│   │   │   ├── smithery.js   # Smithery OAuth flow
│   │   │   └── tokenStore.js # Encrypted token storage
│   │   ├── api/
│   │   │   ├── status.js     # GET /api/status - backend health
│   │   │   ├── config.js     # GET/POST /api/config - registry CRUD
│   │   │   └── logs.js       # GET /api/logs - log streaming
│   │   └── logging/
│   │       └── logger.js     # Winston/Pino logger
│   ├── package.json
│   └── tests/
├── ui/                        # Frontend (React/Vue)
│   ├── src/
│   │   ├── App.jsx
│   │   ├── components/
│   │   │   ├── Dashboard.jsx      # Status overview
│   │   │   ├── BackendConfig.jsx  # Registry editor
│   │   │   ├── EnvEditor.jsx      # .env management
│   │   │   ├── OAuthPanel.jsx     # OAuth connect buttons
│   │   │   └── LogsViewer.jsx     # Live log viewer
│   │   └── api/client.js
│   ├── package.json
│   └── vite.config.js
├── registry.json              # Backend MCP definitions
├── .env.example               # Template for secrets
├── Dockerfile                 # Multi-stage build
├── docker-compose.yml         # Local + remote deployment
└── schema/
    └── registry-v2.schema.json  # JSON schema for validation
```

## Key Implementation Details

### Backend Lifecycle Management

**On-Demand Backends** (`lifecycle: "on-demand"`):
- Spawned when first tool call arrives
- Kept alive for 5 minutes after last use
- Process killed if idle too long
- Good for: infrequently used tools, resource-heavy backends

**Persistent Backends** (`lifecycle: "persistent"`):
- Spawned at gateway startup
- Restarted on crash
- Kept alive until gateway shutdown
- Good for: frequently used tools, OAuth-authenticated backends

### Tool Namespacing

To avoid conflicts, all tools are namespaced by backend ID:
- Backend `obs` exposes tool `start_recording` → client sees `obs/start_recording`
- Backend `kapture` exposes tool `screenshot` → client sees `kapture/screenshot`

The router parses the namespace and routes to the correct backend process.

### Git Backend Build Flow

For `git-npm`, `git-python`, `git-docker` types:

1. **Clone**: `git clone <repo> ~/.mcp/repos/<backend-id>`
2. **Build**: Execute steps from `install.build.steps` array
3. **Cache**: Mark as built, skip rebuild unless registry changes
4. **Execute**: Spawn using `runtime.command` + `install.build.entrypoint`

Build steps run in the repo directory. Use `&&` for sequential commands.

### OAuth Token Management

For backends with `auth.type: "oauth"`:

1. User clicks "Connect GitHub" in UI
2. Gateway redirects to OAuth provider
3. Callback receives auth code
4. Gateway exchanges for access + refresh tokens
5. Tokens stored encrypted in `~/.mcp/tokens.enc`
6. Gateway auto-refreshes tokens before expiry
7. Backend receives token via `${GITHUB_ACCESS_TOKEN}` env var

Supported providers: GitHub, Smithery (extensible)

### SSE Transport Protocol

Gateway implements MCP over SSE (Server-Sent Events):

**Client → Server** (HTTP POST):
```
POST /mcp/call
Content-Type: application/json

{
  "method": "tools/call",
  "params": {
    "name": "obs/start_recording",
    "arguments": {}
  }
}
```

**Server → Client** (SSE stream):
```
GET /mcp/stream
Accept: text/event-stream

event: message
data: {"type":"tool_result","content":"..."}

event: message
data: {"type":"log","level":"info","message":"..."}
```

This matches Smithery's transport pattern for compatibility.

## Development Workflow

### Initial Setup

```bash
# Install dependencies
cd server && npm install
cd ui && npm install

# Copy environment template
cp .env.example .env
# Edit .env with your secrets

# Start development servers
cd server && npm run dev  # Port 3000
cd ui && npm run dev      # Port 5173 (proxies to 3000)
```

### Testing a Backend

```bash
# Add to registry.json
# Set enabled: true

# Restart gateway
npm run dev

# Test in Claude Code
# Add to ~/.claude/.mcp.json:
{
  "gateway": {
    "url": "http://localhost:3000/sse",
    "transport": "sse"
  }
}
```

### Adding a New Backend Type

1. Create backend manager in `server/src/mcp/backends/<type>.js`
2. Implement `spawn(config)` and `kill()` methods
3. Register in `server/src/mcp/backends/index.js`
4. Add type to JSON schema in `schema/registry-v2.schema.json`
5. Update UI form in `ui/src/components/BackendConfig.jsx`

### Docker Deployment

**Local**:
```bash
docker-compose up
```

**Remote** (e.g., VPS):
```bash
# Set GATEWAY_HOST in .env
GATEWAY_HOST=0.0.0.0

docker-compose -f docker-compose.prod.yml up -d
```

Access at `http://<server-ip>:3000`

**Client config for remote**:
```json
{
  "gateway": {
    "url": "https://mcp-gateway.yourdomain.com/sse",
    "transport": "sse",
    "headers": {
      "Authorization": "Bearer ${GATEWAY_API_KEY}"
    }
  }
}
```

## Security Considerations

### .env File
Never commit `.env` to git. It contains:
- OAuth client secrets
- API keys for backend MCPs
- Gateway API key for remote auth

### Token Storage
OAuth tokens stored in `~/.mcp/tokens.enc` with AES-256-GCM encryption. Encryption key derived from gateway secret in `.env`.

### Remote Deployment
For production remote deployment:
1. Enable auth: `gateway.security.enableAuth: true` in registry.json
2. Set `GATEWAY_API_KEY` in .env
3. Use HTTPS (add nginx/caddy reverse proxy)
4. Restrict `gateway.security.allowedIPs` if needed

## Client Configuration

All AI coding tools point to single gateway endpoint:

**Claude Code** (`~/.claude/.mcp.json`):
```json
{
  "gateway": {
    "url": "http://localhost:3000/sse",
    "transport": "sse"
  }
}
```

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "gateway": {
      "url": "http://localhost:3000/sse",
      "transport": "sse"
    }
  }
}
```

**Cline/Cursor**: Same SSE URL in their MCP config

## Example Registry Entries

### NPX Package
```json
"obs": {
  "type": "npx",
  "install": { "package": "obs-mcp", "version": "latest" },
  "runtime": { "env": { "OBS_WEBSOCKET_PASSWORD": "${OBS_WEBSOCKET_PASSWORD}" } },
  "lifecycle": "on-demand",
  "enabled": true
}
```

### Git Repo with NPM Build
```json
"custom-mcp": {
  "type": "git-npm",
  "install": {
    "repository": "https://github.com/user/custom-mcp.git",
    "branch": "main",
    "build": {
      "steps": ["npm install", "npm run build"],
      "entrypoint": "dist/index.js"
    }
  },
  "runtime": { "command": "node" },
  "lifecycle": "persistent",
  "enabled": true
}
```

### Docker Image
```json
"comfyui": {
  "type": "docker",
  "install": { "image": "ghcr.io/user/comfyui-mcp", "tag": "latest" },
  "runtime": {
    "volumes": ["${HOME}/.mcp/comfyui:/data"],
    "env": { "COMFYUI_URL": "${COMFYUI_URL}" }
  },
  "lifecycle": "persistent",
  "enabled": true
}
```

### Remote SSE with OAuth
```json
"github": {
  "type": "npx",
  "install": { "package": "@modelcontextprotocol/server-github" },
  "runtime": { "env": { "GITHUB_TOKEN": "${GITHUB_ACCESS_TOKEN}" } },
  "auth": {
    "type": "oauth",
    "provider": "github",
    "scopes": ["repo", "read:org"],
    "tokenRefresh": true
  },
  "lifecycle": "persistent",
  "enabled": true
}
```

## Web UI Features

- **Dashboard**: Backend status, active connections, tool call metrics
- **Backend Config**: Visual registry editor with "Add Backend" wizard
- **Environment**: Manage .env variables with validation
- **OAuth**: One-click connect for GitHub/Smithery with token status
- **Logs**: Live streaming logs with filtering and search

## Future Enhancements

Potential additions (not yet implemented):
- Health check dashboard with uptime monitoring
- Backend version management and auto-updates
- Metrics export (Prometheus format)
- Multi-user support with per-user registries
- Backend marketplace/discovery
- Backup/restore for registry + secrets
