# MCP Gateway Platform

Universal aggregator and manager for Model Context Protocol (MCP) servers. Connect all your AI coding tools (Claude Code, Claude Desktop, Cline, Cursor) to a single gateway endpoint.

## Why MCP Gateway?

**The Problem:** Managing MCP servers across multiple AI tools is painful:
- Duplicate configurations in every tool
- Loading all tools upfront (context spam)
- Complex secret management
- Can't use the same backend from different machines

**The Solution:** MCP Gateway provides:
- ✨ **Single Source of Truth** - One `registry.json` for all backends
- 🔄 **Universal Transport** - SSE/HTTPS compatible with all clients
- ⚡ **Lazy Loading** - Backends spawn on-demand
- 🐳 **11 Backend Types** - NPX, Docker, Git repos, Python, local scripts, remote servers
- 🔐 **OAuth Integration** - Auto-manage GitHub, Smithery tokens
- 📊 **Web Dashboard** - Visual config editor, logs, metrics
- 🌍 **Deploy Anywhere** - Local or remote, one URL for all machines

## Quick Start

### Prerequisites

- Node.js >= 18.0.0
- npm or yarn

Optional (depending on backend types):
- Docker (for Docker-based backends)
- Python 3.8+ with uv/pipx (for Python backends)

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/mcp-gateway.git
cd mcp-gateway

# Run automated setup
./scripts/setup.sh
```

The setup script will:
- Create required directories
- Copy configuration templates
- Generate encryption keys
- Install dependencies

### Configuration

1. **Edit `.env` file** with your secrets:

```bash
# Required for OBS backend (if using)
OBS_WEBSOCKET_PASSWORD=your-obs-password

# Optional: OAuth credentials (if using GitHub/Smithery backends)
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
```

2. **Edit `registry.json`** to enable/disable backends:

```json
{
  "backends": {
    "obs": {
      "enabled": true  // Set to true to enable
    },
    "kapture": {
      "enabled": true
    },
    "github": {
      "enabled": false  // Enable if you have OAuth configured
    }
  }
}
```

### Running Locally

```bash
# Development mode (with hot-reload)
./scripts/start.sh

# Production mode (with Docker)
./scripts/start-prod.sh
```

The gateway will start on `http://localhost:3000`

### Configure Your AI Tools

Point your AI tool to the gateway endpoint:

**Claude Code** (`~/.claude/.mcp.json`):
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

**Cline, Cursor, etc:** Use the same SSE URL in their MCP configuration.

## Features

### 11 Backend Types

The gateway supports diverse backend types:

| Type | Example | Use Case |
|------|---------|----------|
| **npx** | `obs-mcp`, `kapture-mcp` | NPM packages |
| **uvx/pipx** | `mcp-server-time` | Python packages |
| **docker** | `ghcr.io/user/mcp-server` | Docker Hub images |
| **git-npm** | Private GitHub repo | Custom npm-based MCP |
| **git-python** | Private GitHub repo | Custom Python MCP |
| **git-docker** | Repo with Dockerfile | Custom Docker MCP |
| **local** | `/path/to/script.js` | Local development |
| **remote-sse** | Smithery hosted | Remote SSE endpoints |
| **remote-http** | HTTP API | HTTP-based MCPs |
| **shell** | Wrapper script | Shell script MCP |

### Tool Namespacing

All tools are automatically namespaced to avoid conflicts:
- Backend `obs` exposes `start_recording` → Client sees `obs/start_recording`
- Backend `kapture` exposes `screenshot` → Client sees `kapture/screenshot`

### Lifecycle Management

**On-Demand Backends:**
- Spawn when first tool call arrives
- Idle for 5 minutes → auto-killed
- Good for: infrequently used tools

**Persistent Backends:**
- Spawn at gateway startup
- Auto-restart on crash
- Good for: frequently used tools, OAuth-authenticated backends

### OAuth Token Management

For backends requiring authentication:
1. User clicks "Connect GitHub" in web UI
2. Gateway handles OAuth flow
3. Tokens stored encrypted with AES-256-GCM
4. Auto-refresh before expiry
5. Backend receives token via environment variable

Supported providers: GitHub, Smithery (extensible)

## Architecture

```
┌─────────────────────────────────────────┐
│   AI Coding Tools                       │
│   (Claude Code, Desktop, Cline, Cursor) │
└──────────────┬──────────────────────────┘
               │ SSE/HTTPS
               ↓
┌─────────────────────────────────────────┐
│   MCP Gateway Server                    │
│   - Protocol translation                │
│   - Tool routing & namespacing          │
│   - OAuth token management              │
│   - Backend lifecycle management        │
└──────────────┬──────────────────────────┘
               │
      ┌────────┼────────┐
      ↓        ↓        ↓
   ┌─────┐ ┌──────┐ ┌────────┐
   │ NPX │ │Docker│ │Git Repo│
   │ MCP │ │ MCP  │ │  MCP   │
   └─────┘ └──────┘ └────────┘
```

## Testing

```bash
# Run all tests
./scripts/test.sh

# Run specific test suites
cd server && npm test                  # Unit tests
node tests/integration.test.js         # Integration tests
cd .. && ./scripts/e2e-test.sh        # E2E tests
```

## Deployment Options

### Local Development

```bash
./scripts/start.sh
```

Access at `http://localhost:3000`

### Docker (Local)

```bash
docker-compose up
```

### Remote VPS/Cloud

See [DEPLOYMENT.md](DEPLOYMENT.md) for complete instructions:
- Remote VPS deployment with systemd
- Nginx reverse proxy setup
- SSL/TLS configuration
- Security best practices
- Monitoring setup

### Quick Remote Setup

```bash
# On your server
git clone https://github.com/yourusername/mcp-gateway.git
cd mcp-gateway
./scripts/setup.sh

# Edit .env with your secrets
nano .env

# Set GATEWAY_HOST to accept external connections
# GATEWAY_HOST=0.0.0.0

# Start with systemd or Docker
# See DEPLOYMENT.md for full instructions
```

Then configure clients:

```json
{
  "mcpServers": {
    "gateway": {
      "url": "https://mcp-gateway.yourdomain.com/sse",
      "transport": "sse",
      "headers": {
        "Authorization": "Bearer your-gateway-api-key"
      }
    }
  }
}
```

## Project Structure

```
mcp-gateway/
├── server/              # Backend (Node.js)
│   ├── src/
│   │   ├── index.js    # Main entry point
│   │   ├── mcp/        # MCP protocol & backends
│   │   ├── oauth/      # OAuth flows
│   │   ├── api/        # REST API
│   │   └── logging/    # Winston logger
│   └── tests/          # Tests
├── ui/                  # Frontend (React)
│   └── src/
│       └── components/ # Dashboard, config editor, logs
├── scripts/            # Deployment scripts
│   ├── setup.sh       # Initial setup
│   ├── start.sh       # Start dev server
│   ├── start-prod.sh  # Start with Docker
│   ├── test.sh        # Run all tests
│   └── e2e-test.sh    # E2E tests
├── schema/             # JSON schemas
├── registry.json       # Backend definitions
├── .env               # Environment secrets (gitignored)
├── Dockerfile         # Docker image
├── docker-compose.yml # Docker Compose config
├── CLAUDE.md          # Technical documentation
├── DEPLOYMENT.md      # Deployment guide
└── README.md          # This file
```

## Configuration

### Registry Structure

Each backend in `registry.json` has:

```json
{
  "backend-id": {
    "name": "Human-readable name",
    "description": "What this backend does",
    "type": "npx|docker|git-npm|...",
    "install": {
      // Type-specific installation config
    },
    "runtime": {
      "command": "node|python|...",
      "args": [],
      "env": {
        "VAR_NAME": "${ENV_VAR}"  // References .env
      }
    },
    "lifecycle": "on-demand|persistent",
    "timeout": 30000,
    "enabled": true
  }
}
```

### Environment Variables

Variables use `${VAR_NAME}` syntax in `registry.json` and resolve from:
1. `.env` file (gitignored)
2. OAuth token store (auto-managed)
3. System environment

Special variables:
- `${HOME}` - User home directory
- `${REPO_DIR}` - Backend's git repo directory
- `${GATEWAY_DIR}` - Gateway installation directory
- `${GITHUB_ACCESS_TOKEN}` - Auto-managed by OAuth
- `${SMITHERY_ACCESS_TOKEN}` - Auto-managed by OAuth

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/sse` | GET | SSE connection for MCP |
| `/message` | POST | MCP JSON-RPC messages |
| `/api/status` | GET | Backend status |
| `/api/config` | GET | Registry config |
| `/api/logs` | GET | Log streaming |
| `/oauth/github/connect` | GET | Start GitHub OAuth |
| `/oauth/smithery/connect` | GET | Start Smithery OAuth |
| `/oauth/status` | GET | OAuth connection status |

## Web UI

Access the dashboard at `http://localhost:3000` (when running locally).

Features:
- **Dashboard:** Backend status, active connections, metrics
- **Backend Config:** Visual registry editor
- **Environment:** Manage `.env` variables
- **OAuth:** One-click connect for GitHub/Smithery
- **Logs:** Live streaming logs with filtering

## Security

### Local Development

Default configuration is secure for local-only use.

### Remote Deployment

**Enable authentication** for production:

In `registry.json`:
```json
{
  "gateway": {
    "security": {
      "enableAuth": true,
      "apiKey": "${GATEWAY_API_KEY}"
    }
  }
}
```

Clients must include API key:
```json
{
  "headers": {
    "Authorization": "Bearer your-gateway-api-key"
  }
}
```

### Security Checklist

- ✅ Generate strong `TOKEN_ENCRYPTION_KEY` (auto-generated by setup)
- ✅ Generate strong `GATEWAY_API_KEY` (auto-generated by setup)
- ✅ Never commit `.env` to Git (already in `.gitignore`)
- ✅ Use HTTPS for remote access (see DEPLOYMENT.md)
- ✅ Set `ENABLE_AUTH=true` for production
- ✅ Restrict CORS origins (not `*`)
- ✅ Keep Node.js and dependencies updated
- ✅ Back up `~/.mcp/tokens.enc` regularly

## Troubleshooting

### Server Won't Start

```bash
# Check Node.js version
node --version  # Must be >= 18.0.0

# Check for port conflicts
lsof -i :3000

# Validate registry
cd server && npm run validate

# View detailed logs
LOG_LEVEL=debug npm run dev
```

### Backend Won't Spawn

```bash
# Ensure backend is enabled in registry.json
cat registry.json | grep -A 5 '"backend-name"'

# Check environment variables
cat .env

# View backend logs
cat ~/.mcp/logs/gateway.log | grep backend-name
```

### SSE Connection Fails

```bash
# Test SSE endpoint
curl -N -H "Accept: text/event-stream" http://localhost:3000/sse

# Check CORS in registry.json
# "cors": { "enabled": true, "origins": ["*"] }
```

See [DEPLOYMENT.md](DEPLOYMENT.md) for complete troubleshooting guide.

## Documentation

- **[CLAUDE.md](CLAUDE.md)** - Complete technical documentation for Claude Code
- **[DEPLOYMENT.md](DEPLOYMENT.md)** - Deployment guide (local, Docker, VPS, cloud)
- **[OAUTH_IMPLEMENTATION.md](OAUTH_IMPLEMENTATION.md)** - OAuth flow details
- **[schema/registry-v2.schema.json](schema/registry-v2.schema.json)** - Registry JSON schema

## Examples

### NPX Package Backend

```json
"obs": {
  "type": "npx",
  "install": { "package": "obs-mcp", "version": "latest" },
  "runtime": { "env": { "OBS_WEBSOCKET_PASSWORD": "${OBS_WEBSOCKET_PASSWORD}" } },
  "lifecycle": "on-demand",
  "enabled": true
}
```

### Docker Image Backend

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
  "enabled": false
}
```

## Contributing

This is a personal project but contributions are welcome!

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## Roadmap

Potential future enhancements:
- [ ] Health check dashboard with uptime metrics
- [ ] Backend version management and auto-updates
- [ ] Prometheus metrics export
- [ ] Multi-user support with per-user registries
- [ ] Backend marketplace/discovery
- [ ] Backup/restore for registry + secrets
- [ ] Rate limiting per backend
- [ ] Request caching for idempotent operations

## License

MIT

## Support

- **Issues:** Report bugs on GitHub Issues
- **Documentation:** See `CLAUDE.md` for technical details
- **Deployment:** See `DEPLOYMENT.md` for deployment guides
- **Schemas:** See `schema/registry-v2.schema.json` for registry format

## Acknowledgments

Built with:
- [Express](https://expressjs.com/) - Web framework
- [Winston](https://github.com/winstonjs/winston) - Logging
- [Dockerode](https://github.com/apocas/dockerode) - Docker integration
- [Chokidar](https://github.com/paulmillr/chokidar) - File watching
- [Model Context Protocol](https://modelcontextprotocol.io/) - MCP specification

---

**Made with ❤️ for the AI coding community**

Get started now:
```bash
git clone https://github.com/yourusername/mcp-gateway.git
cd mcp-gateway
./scripts/setup.sh && ./scripts/start.sh
```
