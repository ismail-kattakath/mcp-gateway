# MCP Gateway

**Zero-setup aggregator for Model Context Protocol servers** — Just paste config and go.

Universal aggregator for [Model Context Protocol](https://modelcontextprotocol.io/) servers. Point every AI coding tool (Claude Code, Claude Desktop, Cline, Cursor, …) at **one** gateway instead of maintaining N parallel `mcpServers` blocks.

[![Release](https://img.shields.io/github/v/release/ismail-kattakath/mcp-gateway?sort=semver)](https://github.com/ismail-kattakath/mcp-gateway/releases)
[![Docker Image](https://img.shields.io/badge/ghcr.io-mcp--gateway-blue)](https://github.com/ismail-kattakath/mcp-gateway/pkgs/container/mcp-gateway)
[![CI](https://github.com/ismail-kattakath/mcp-gateway/actions/workflows/ci.yml/badge.svg)](https://github.com/ismail-kattakath/mcp-gateway/actions/workflows/ci.yml)
[![CodeQL](https://github.com/ismail-kattakath/mcp-gateway/actions/workflows/codeql.yml/badge.svg)](https://github.com/ismail-kattakath/mcp-gateway/actions/workflows/codeql.yml)
[![codecov](https://codecov.io/gh/ismail-kattakath/mcp-gateway/branch/main/graph/badge.svg?token=5571ca48-e22c-4875-bfad-25ae8068ce2e)](https://codecov.io/gh/ismail-kattakath/mcp-gateway)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Quick Start

<<<<<<< HEAD
| Without a gateway | With this gateway |
|---|---|
| N copies of the same `mcpServers` block in N tool configs | One `registry.json` |
| Every tool loads every server upfront → context spam | Servers spawn on-demand and idle out after 5 min |
| Secrets duplicated across tool configs | One `.env` |
| Same servers re-configured on every machine | Deploy once (local or remote), all machines connect |
| Restart every client whenever an MCP server is added, removed, or reconfigured | Edit `registry.json` — the gateway hot-reloads in place; no gateway restart, and the next tool listing from each client reflects the change |
| Each client spawns its own server instance — open sessions, caches, and stateful connections don't cross tools | One server process shared by every connected client — state and history are visible from anywhere |
| MCP servers cold-start on every reboot and every client restart | Gateway runs as a service (Docker / launchd / systemd); persistent servers stay up across reboots |

## Quick start (Docker)

```bash
docker pull ghcr.io/ismail-kattakath/mcp-gateway:latest

# Get a starter registry
curl -O https://raw.githubusercontent.com/ismail-kattakath/mcp-gateway/main/registry.example.json
mv registry.example.json registry.json

docker run -d --name mcp-gateway \
  -p 127.0.0.1:3000:3000 \
  -v $(pwd)/registry.json:/app/registry.json:ro \
  -v $HOME/.mcp:/root/.mcp \
  ghcr.io/ismail-kattakath/mcp-gateway:latest
```

The gateway auto-generates a secure API key on first run using industry-standard storage:
- **Primary**: System keychain (macOS Keychain, Linux libsecret, Windows Credential Manager)
- **Fallback**: AES-256-GCM encrypted file with machine-derived key (for headless servers)

Old cleartext keys are automatically migrated to secure storage on first run.

### Option 1: Auto-spawn (zero setup)

The gateway spawns automatically when your MCP client starts. Just paste this config:

```json
{
  "mcpServers": {
    "gateway": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "-v", "${HOME}/.mcp:/root/.mcp",
        "-v", "${HOME}/.mcp-gateway/registry.json:/app/registry.json:ro",
        "ghcr.io/ismail-kattakath/mcp-gateway:latest"
      ],
      "transport": "stdio"
    }
  }
}
```

- First client spawns the container
- Uses stdio transport (no auth needed - pipe is trusted)
- HTTP/SSE endpoints also available on `:3000` (with auth)

### Option 2: Persistent daemon

For shared access or remote deployment, run once as a daemon:
=======
**Zero setup required** — Just paste this config into your MCP client:
>>>>>>> a4895a8 (chore: remove internal and meta-documentation)

**For Claude Code** (`~/.claude/.mcp.json`):
```json
{
  "mcpServers": {
    "gateway": {
<<<<<<< HEAD
      "url": "http://localhost:3000/sse",
      "transport": "sse",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
=======
      "command": "docker",
      "args": ["run", "-i", "--rm", "ghcr.io/ismail-kattakath/mcp-gateway"]
>>>>>>> a4895a8 (chore: remove internal and meta-documentation)
    }
  }
}
```

<<<<<<< HEAD
Get `YOUR_API_KEY` with `PRINT_API_KEY=true` (see [Authentication](#authentication) section).

For HTTPS or a custom domain, put **Caddy** in front. Templates ship with the repo (`Caddyfile.local`, `Caddyfile.prod`) and the steps are in [`CLAUDE.md`](CLAUDE.md#https--custom-domain).
=======
**For Claude Desktop:**
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

That's it! The gateway auto-downloads and starts with example servers.

### Customize (Optional)

**To use your own servers**, add volume mount for custom registry:
```json
{
  "mcpServers": {
    "gateway": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "-v", "${HOME}/.mcp-gateway/registry.json:/app/registry.json:ro",
        "ghcr.io/ismail-kattakath/mcp-gateway:latest"
      ],
      "transport": "stdio"
    }
  }
}
```

See [schema/registry-v2.schema.json](schema/registry-v2.schema.json) for full registry schema.

## Why Use MCP Gateway?

**Problem:** Managing MCP servers across multiple AI tools is tedious.
- Same config duplicated in Claude Code, Claude Desktop, Cline, Cursor...
- Every tool loads all servers upfront → slow, cluttered
- Secrets duplicated everywhere
- Server updates require reconfiguring every tool

**Solution:** One gateway, many clients.
- ✅ **Zero setup** - Just paste config, it works
- ✅ **One config** - Manage all servers in one place
- ✅ **Auto-starts** - No manual docker commands
- ✅ **Secure by default** - Auto-generated keys
- ✅ **Hot-reload** - Edit servers without restart
- ✅ **Shared state** - Servers accessible from any client

## Features

**For Users:**
- 🚀 Zero-setup auto-start mode
- 🔐 Auto-generated secure keys
- 🔄 Hot-reload configuration changes
- 📦 5 server sources (npm, git, docker, remote, local)
- 🌍 Multi-transport (stdio, SSE, HTTP)

**For Developers:**
- 📊 React dashboard for monitoring
- 🧪 96 tests with 77% coverage
- 📝 TypeScript with strict types
- 🔍 CodeQL security scanning
- 🐳 Multi-arch Docker images

See [docs](#documentation) for details.

## Advanced Setup

### Option 1: Auto-Spawn (Recommended)

See [Quick Start](#quick-start) above.

**Pros:**
- Zero manual setup
- Gateway starts/stops with Claude
- No docker commands needed
- Secure by default

**Cons:**
- Tied to one client process
- Restarts on every Claude restart

### Option 2: Persistent Daemon

For shared access or always-on operation:

**1. Start gateway once:**
```bash
docker run -d --name mcp-gateway \
  -p 127.0.0.1:3000:3000 \
  -v ~/.mcp-gateway/registry.json:/app/registry.json:ro \
  -v ~/.mcp:/root/.mcp \
  ghcr.io/ismail-kattakath/mcp-gateway:latest
```

**2. Get API key:**
```bash
docker exec mcp-gateway sh -c 'PRINT_API_KEY=true node dist/index.js'
```

**3. Configure clients:**
```json
{
  "mcpServers": {
    "gateway": {
      "url": "http://localhost:3000/sse",
      "transport": "sse",
      "headers": {
        "Authorization": "Bearer <paste-key-here>"
      }
    }
  }
}
```

**Pros:**
- Shared across multiple clients
- Always running (survives client restarts)
- Remote access possible (with HTTPS)

**Cons:**
- Manual docker commands
- Need to retrieve API key
- More configuration

For HTTPS or remote access, use your preferred reverse proxy (nginx, Apache, Traefik, Cloudflare Tunnel, etc.).

### Option 3: From Source

For development:

```bash
git clone https://github.com/ismail-kattakath/mcp-gateway.git
cd mcp-gateway

# Server
cd server && npm install && npm run dev       # gateway on :3000

# UI (optional)
cd ../ui && npm install && npm run dev        # dashboard on :5173
```
>>>>>>> a4895a8 (chore: remove internal and meta-documentation)

## Image tags

| Tag | Source | Use |
|---|---|---|
| `latest` | latest tagged release | most users |
| `1.0.0`, `1.0`, `1` | specific release | version pinning |
| `edge` | every push to `main` | bleeding edge |
| `sha-<short>` | every build | fully reproducible pin |

Multi-arch: `linux/amd64`, `linux/arm64`. SLSA provenance + SBOM attached.

## The registry

`registry.json` is the single source of truth. Each entry is keyed by a **server name** (the namespace prefix used in tool calls: `obs/start_recording`) and declares a `source` — one of five values.

| `source` | Use case | Example |
|---|---|---|
| **`pkg`** | Package-manager-installed servers (npx, uvx, pipx, …) | `{"source": "pkg", "command": "npx", "args": ["-y", "obs-mcp"]}` |
| **`git`** | Clone a repo, auto-detect install/build | `{"source": "git", "repo": "https://...", "command": "node", "args": ["${REPO_DIR}/dist/index.js"]}` |
| **`container`** | Docker container (pull image **or** build locally) | `{"source": "container", "image": "ghcr.io/.../img:tag"}` |
| **`remote`** | Connect to an already-running MCP server (SSE or HTTP) | `{"source": "remote", "transport": "sse", "url": "https://..."}` |
| **`local`** | Run an existing script/binary on disk | `{"source": "local", "command": "python3", "args": ["${HOME}/scripts/mcp.py"]}` |

Optional fields on every server (all default to sensible values):

```jsonc
{
  "lifecycle": "on-demand",  // or "persistent"
  "enabled":   true,
  "timeout":   30000,
  "env": { "MY_TOKEN": "${MY_TOKEN}" }   // ${VAR} resolves from system env
}
```

Full schema: [`schema/registry-v2.schema.json`](schema/registry-v2.schema.json). Typed mirror: [`types/registry.d.ts`](types/registry.d.ts).

## Authentication

<<<<<<< HEAD
**Secure by default**: The gateway auto-generates a cryptographic API key on first run (stored in `~/.mcp/gateway-api-key`) and requires it for all SSE/HTTP access. stdio transport (spawned by clients) bypasses auth.

### Get your API key

```bash
docker run --rm -v $HOME/.mcp:/root/.mcp \
  -e PRINT_API_KEY=true \
  ghcr.io/ismail-kattakath/mcp-gateway:latest
```

Use it in client configs:

```json
{
  "headers": {
    "Authorization": "Bearer YOUR_API_KEY"
  }
}
```

Or for browsers (query param): `http://localhost:3000/sse?access_token=YOUR_API_KEY`

### Rotate the key

```bash
docker run --rm -v $HOME/.mcp:/root/.mcp \
  -e ROTATE_API_KEY=true \
  ghcr.io/ismail-kattakath/mcp-gateway:latest
```

### Disable auth (local dev only)

```bash
docker run -e GATEWAY_ENABLE_AUTH=false ...
```

Or in `registry.json`:

```json
"gateway": {
  ...
  "enableAuth": false
}
```

### IP allowlist (optional)

```json
"gateway": {
  ...
  "allowedIPs": ["10.0.0.0/8", "192.168.1.0/24"]
=======
The gateway is **secure by default** with auto-generated API keys:

- **Auto-generated keys**: Stored securely in system keychain (macOS Keychain, Linux libsecret, Windows Credential Manager)
- **Retrieve key**: `docker run --rm ghcr.io/ismail-kattakath/mcp-gateway env PRINT_API_KEY=true node dist/index.js`
- **Rotate key**: `docker run --rm ghcr.io/ismail-kattakath/mcp-gateway env ROTATE_API_KEY=true node dist/index.js`
- **Disable auth**: Set `"enableAuth": false` in `registry.json` (not recommended for remote access)

### Configuration

```json
"gateway": {
  "enableAuth": true,
  "allowedIPs": ["10.0.0.0/8"]
>>>>>>> a4895a8 (chore: remove internal and meta-documentation)
}
```

- `enableAuth` defaults to **true** (secure by default)
- `allowedIPs` is optional (CIDR notation, empty = all IPs allowed)
- Constant-time token compare, `/health` always exempt
- **stdio transport bypasses auth** (pipe = inherent authentication)

## `source: "container"` and the host Docker socket

The `container` source needs to talk to a Docker daemon. By default, the gateway container **does not** mount `/var/run/docker.sock` — so `pkg`/`git`/`remote`/`local` work out of the box and `container` is opt-in. There are three trust tiers:

1. **No socket** *(default)* — `container` returns errors, everything else works
2. **Filtered socket proxy** (run a socket proxy container and set `DOCKER_HOST`) — `container` works, attacker can't escape the container
3. **Rootless Docker on the host** — additional belt-and-suspenders

<<<<<<< HEAD
Full discussion of trade-offs in [`CLAUDE.md`](CLAUDE.md#three-trust-tiers-for-source-container).

## Build from source

```bash
git clone https://github.com/ismail-kattakath/mcp-gateway.git
cd mcp-gateway

# Dev (hot-reload)
cd server && npm install && npm run dev       # gateway on :3000
cd ../ui && npm install && npm run dev        # dashboard on :5173, proxies /api → 3000

# Or via Docker
docker-compose up --build
```
=======
See [docs/architecture/decisions.md](docs/architecture/decisions.md) for security trade-offs.
>>>>>>> a4895a8 (chore: remove internal and meta-documentation)

## Project structure

```
.
├── server/src/
│   ├── index.js              # HTTP + SSE entrypoint
│   ├── mcp/
│   │   ├── protocol.js       # MCP JSON-RPC handler
│   │   ├── registry.js       # Load/validate/watch registry.json
│   │   ├── router.js         # Parse <server>/<tool>, route to manager
│   │   └── backends/         # ServerManager + 5 source adapters (pkg/git/container/remote/local)
│   ├── middleware/auth.js    # Bearer + IP allowlist
│   ├── validation/           # AJV schema validator + semantic checks
│   └── logging/
├── ui/src/                   # React dashboard (Dashboard / Servers / Logs)
├── schema/                   # JSON Schema for registry.json
├── types/                    # TypeScript definitions
└── .github/workflows/        # release-please + multi-arch ghcr publish
```

## Releases

Releases are fully automated:

1. Open a PR with a [Conventional Commits](https://www.conventionalcommits.org/) title (`feat:`, `fix:`, `chore:`, `feat!:`, …) — a linter blocks PRs with malformed titles.
2. Squash-merge to `main`. [release-please](https://github.com/googleapis/release-please) opens (or updates) a release PR.
3. Merge the release PR → a `vX.Y.Z` tag is pushed → the Docker workflow publishes the multi-arch image.

No manual versioning, no manual tagging, no manual changelog. Setup details in [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Documentation

- [**docs/**](docs/) — full documentation (setup guides, API reference, architecture)
- [**CONTRIBUTING.md**](CONTRIBUTING.md) — Conventional Commits + release flow + one-time setup
- [**CHANGELOG.md**](CHANGELOG.md) — auto-generated release notes
- [`schema/registry-v2.schema.json`](schema/registry-v2.schema.json) — registry JSON Schema (the source of truth)

## License

MIT
