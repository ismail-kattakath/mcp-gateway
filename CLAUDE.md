# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**MCP Gateway Platform** is a universal aggregator and manager for Model Context Protocol (MCP) servers. It solves the problem of maintaining multiple MCP configurations across different AI coding tools (Claude Code, Claude Desktop, Cline, Cursor, etc.) by providing a single gateway that all clients connect to via SSE/HTTPS transport.

### Key Problems Solved
- **Config duplication**: one registry instead of N tool-specific configs
- **Context spam**: lazy-load servers on-demand instead of loading all tools upfront
- **Mixed runtimes**: support package managers, git repos, containers, local scripts, and remote endpoints from one schema
- **Multi-machine access**: deploy once (local or remote), use from anywhere

### Architecture

```
Client Tools (Claude Code/Desktop/Cline/Cursor)
              ↓ (SSE/HTTPS)
         MCP Gateway Server
              ↓
      Server Manager (registry.json)
              ↓
   ┌──────┬──────┬─────────┬────────┬───────┐
   ↓      ↓      ↓         ↓        ↓       ↓
  pkg    git  container  remote   local
```

The gateway acts as a proxy/router:
1. Client connects via SSE and requests tools.
2. Gateway reads `registry.json` for enabled servers.
3. Servers are spawned on-demand (lazy) or kept persistent.
4. Tool calls are namespaced (`<server-name>/<tool-name>`) and routed to the correct server.
5. All MCP communication is proxied through the gateway.

## Registry Schema

The system is configured by `registry.json`, validated against `schema/registry-v2.schema.json`. There are **5 server sources** — each one captures *where the server comes from*.

### The 5 sources

| `source` | Use case | Required fields |
|----------|----------|-----------------|
| `pkg`    | Package-manager-installed servers (npx, uvx, pipx, …) | `command`, `args` |
| `git`    | Cloned from a git repo, auto-detected install/build | `repo`, `command`, `args` |
| `container` | Docker container (pull image or build locally) | `image` **OR** `build` |
| `remote` | Already-running remote MCP server (HTTP/SSE) | `url`, `transport` |
| `local`  | Pre-existing script/binary on disk | `command` |

### Top-level structure

```json
{
  "version": "2.0",
  "servers": {
    "<server-name>": { "source": "...", ... }
  },
  "gateway": { ... }
}
```

- The **server name** is the object key (e.g. `"obs"`). Regex `^[a-z0-9][a-z0-9-]*[a-z0-9]$` (lowercase, hyphens, 2+ chars).
- The server name doubles as the **namespace prefix** for tool calls: `obs/start_recording`.
- There is no separate `name` or `description` field — keep entries minimal.

### BaseServer fields (all optional, defaults applied by loader)

| Field | Default | Notes |
|-------|---------|-------|
| `lifecycle` | `"on-demand"` | `"on-demand"` or `"persistent"` |
| `enabled` | `true` | Set `false` to keep an entry but skip it |
| `timeout` | `30000` (ms) | Spawn/request timeout, 1000–300000 |
| `env` | — | UPPER_SNAKE_CASE keys only; values support `${VAR}` |

### Per-source schemas

#### `pkg`
```json
"obs": {
  "source": "pkg",
  "command": "npx",
  "args": ["-y", "obs-mcp@latest"],
  "env": { "OBS_WEBSOCKET_PASSWORD": "${OBS_WEBSOCKET_PASSWORD}" }
}
```
- Version is embedded inline in args (`pkg@1.2.3`), matching standard MCP client config.
- `command` is the package manager binary; `args` is everything passed to it.

#### `git`
```json
"custom-mcp": {
  "source": "git",
  "repo": "https://github.com/user/custom-mcp.git",
  "branch": "main",
  "command": "node",
  "args": ["${REPO_DIR}/dist/index.js"],
  "env": { "NODE_ENV": "production" }
}
```
- Exactly **one** of `branch`, `tag`, or `commit` is allowed (mutually exclusive). Omitting all three clones at remote HEAD — `git clone` handles whatever the default branch is (main/master/etc.).
- Install/build are auto-detected from repo contents:
  - `package.json` → `npm install` (+ `npm run build` if scripts.build exists)
  - `pyproject.toml` → `uv pip install -e .`
  - `requirements.txt` → `uv pip install -r requirements.txt`
- Override with `install: ["..."]` and/or `build: ["..."]` arrays in config (escape hatch for pnpm, custom scripts, etc.).
- `${REPO_DIR}` in args resolves to the clone location.

#### `container`
Pull from a registry:
```json
"comfyui": {
  "source": "container",
  "image": "ghcr.io/user/comfyui-mcp:latest",
  "volumes": ["${HOME}/.mcp/comfyui:/data"],
  "ports": { "8188": 8189 },
  "env": { "COMFYUI_URL": "${COMFYUI_URL}" }
}
```
Or build locally (with or without cloning a git repo first):
```json
"built-locally": {
  "source": "container",
  "build": {
    "repo": "https://github.com/user/mcp.git",
    "dockerfile": "Dockerfile",
    "context": ".",
    "args": { "FOO": "bar" }
  },
  "ports": { "3000": 3001 }
}
```
- **Exactly one** of `image` or `build` must be provided.
- `pull` policy: `always` | `missing` | `never` (default `missing`, only meaningful with `image`).
- `ports` keys are container ports (strings of digits), values are host ports.

#### `remote`
```json
"smithery-tool": {
  "source": "remote",
  "transport": "sse",
  "url": "https://server.smithery.ai/some-tool/sse",
  "headers": { "Authorization": "Bearer ${SMITHERY_TOKEN}" }
}
```
- `transport: "sse"` opens an EventSource-style stream.
- `transport: "http"` POSTs each request and reads the JSON response. `method` defaults to `"POST"`.
- Nothing executes locally.

#### `local`
```json
"my-script": {
  "source": "local",
  "command": "python3",
  "args": ["${HOME}/scripts/my-mcp.py"]
}
```
- Subsumes the old `shell` type: just use `command: "bash"` and `args: ["script.sh"]`.

### Environment variable resolution

`${VAR}` substitutions are resolved at load time from:
1. The provided context (e.g. `${REPO_DIR}` is injected by the git source manager)
2. `.env` file (gitignored — loaded via dotenv)
3. System environment
4. Built-ins: `${HOME}`, `${GATEWAY_DIR}`

There are no auto-managed tokens. Users paste/rotate tokens manually in `.env` (uniform with how every other MCP client handles it).

### Gateway block

```json
"gateway": {
  "server":   { "port": 3000, "host": "0.0.0.0", "transport": "sse", "cors": { ... } },
  "storage":  { "repos": "${HOME}/.mcp/repos", "cache": "${HOME}/.mcp/cache", "logs": "${HOME}/.mcp/logs" },
  "logging":  { "level": "info", "format": "json", "outputs": ["console", "file"] },
  "security": { "apiKey": "${GATEWAY_API_KEY}", "enableAuth": false, "allowedIPs": [] }
}
```

- `gateway.server`, `gateway.storage`, and `gateway.logging` are required.
- `gateway.security` is optional and controls remote API access to the gateway itself (unrelated to per-server auth).

## Project Structure

```
/
├── server/
│   ├── src/
│   │   ├── index.js          # HTTP + SSE entrypoint
│   │   ├── mcp/
│   │   │   ├── protocol.js   # MCP JSON-RPC handler
│   │   │   ├── registry.js   # Load/validate/watch registry.json + apply defaults
│   │   │   ├── router.js     # Parse <server>/<tool>, route to manager
│   │   │   └── backends/
│   │   │       ├── base.js          # Shared spawn-process logic
│   │   │       ├── index.js         # ServerManager + source dispatch
│   │   │       ├── pkg.js           # source: "pkg"
│   │   │       ├── git.js           # source: "git" (clone + auto-detect install/build)
│   │   │       ├── container.js     # source: "container" (image OR build)
│   │   │       ├── remote.js        # source: "remote" (sse/http)
│   │   │       ├── local.js         # source: "local"
│   │   │       └── stdio-handler.js # JSON-RPC over stdio parser
│   │   ├── validation/       # AJV schema validator + semantic checks
│   │   └── logging/          # Logger
│   └── package.json
├── ui/                       # React dashboard (Dashboard, Servers, Logs)
├── registry.json             # Active server configuration
├── registry.example.json     # One example per source
├── schema/registry-v2.schema.json
├── types/registry.d.ts       # TypeScript types mirroring the schema
└── docker-compose*.yml
```

(The `backends/` directory name is preserved for filesystem stability; the code inside is source-based — `ServerManager`, source files named after the 5 sources. Treat "backend" and "server" as synonymous in legacy paths.)

## Tool Namespacing

To avoid conflicts, all tools are namespaced by server name:
- Server `obs` exposes a tool `start_recording` → clients see `obs/start_recording`
- Server `kapture` exposes `screenshot` → clients see `kapture/screenshot`

The router parses the namespace at `/` and routes to the correct server process.

## Server Lifecycle

- **`on-demand`** (default): spawned on first tool call, killed after 5 min idle. Good for infrequently-used or heavy servers.
- **`persistent`**: spawned at gateway startup, restarted on crash, killed at gateway shutdown. Good for frequently-used servers.

Restarts are exponentially backed off (2s, 4s, 6s) up to 3 retries before the server is marked failed.

## Adding a New Source

To add a brand-new source type beyond the 5:

1. Add the variant in `schema/registry-v2.schema.json` under `definitions/` and the top-level `servers` `oneOf`.
2. Create `server/src/mcp/backends/<name>.js` extending `BaseServer` (or implementing the same shape as `RemoteServer` for non-spawn sources). Implement `getSpawnArgs()` and optionally `prepare()`.
3. Register in `server/src/mcp/backends/index.js` `createServerForSource()`.
4. Add the TypeScript type to `types/registry.d.ts`.
5. Add an example to `registry.example.json`.

## Development Workflow

```bash
# install deps
cd server && npm install
cd ui && npm install

# copy env template
cp .env.example .env  # edit secrets

# run gateway (port 3000) and UI dev server (port 5173, proxies /api → 3000)
cd server && npm run dev
cd ui && npm run dev
```

### Pointing a client at the gateway

The gateway supports **three transports simultaneously**: stdio, SSE, and HTTP. Choose based on your use case.

#### Auto-spawn mode (stdio transport)

The client spawns the gateway automatically. Zero manual setup:

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

**How it works:**
- Client spawns `docker run -i` (interactive, attached to stdin/stdout)
- Gateway detects stdin is a pipe (`!process.stdin.isTTY`) → enables stdio transport
- JSON-RPC flows over stdin/stdout (one message per line)
- **No auth required** — pipe ownership is inherent authentication
- HTTP/SSE endpoints also start on `:3000` (with auth) for other clients

**When stdin closes** (client exits), the gateway shuts down gracefully.

#### Persistent daemon mode (SSE or HTTP transport)

Start the gateway once, all clients connect via network:

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

Get `YOUR_API_KEY` with `PRINT_API_KEY=true` (see [Authenticated Access](#authenticated-access)).

Works for Claude Code, Claude Desktop, Cline, Cursor, and any MCP client.

## HTTPS / Custom Domain

The gateway listens **plain HTTP on `127.0.0.1` by default** (loopback only) — never expose it directly. For HTTPS or remote access, put **Caddy** in front. Two Caddyfile templates ship in the repo:

### Local HTTPS (`Caddyfile.local`)

Serves `https://mcp.local/sse` (or `https://localhost/sse`) using Caddy's internal CA — no Let's Encrypt, no public DNS.

```bash
# one-time
echo "127.0.0.1   mcp.local" | sudo tee -a /etc/hosts
brew install caddy
caddy trust                                          # install Caddy's local root CA

# run
caddy run --config Caddyfile.local
```

For other devices on your LAN (phone, second laptop), copy Caddy's root cert from `~/Library/Application Support/Caddy/pki/authorities/local/root.crt` and trust it on each.

### Public domain (`Caddyfile.prod`)

Auto-provisions a Let's Encrypt cert for `${DOMAIN}` and gates `/api`, `/sse`, `/mcp` behind a `Bearer` token.

```bash
# .env or shell
export DOMAIN=mcp.yourdomain.com
export GATEWAY_API_KEY=$(openssl rand -hex 32)

caddy run --config Caddyfile.prod
```

Pair with `gateway.security.enableAuth: true` and `gateway.security.apiKey: "${GATEWAY_API_KEY}"` so the gateway itself also validates the token (defense in depth — Caddy's check + the gateway's check).

If the box isn't directly internet-routable, front it with **Cloudflare Tunnel** or **Tailscale Funnel** and point Caddy at the tunnel endpoint instead of binding to `0.0.0.0`.

### Why `trust proxy` is set

`server/src/index.js` calls `app.set('trust proxy', 'loopback')` so when Caddy forwards a request, Express's `req.ip` shows the real client IP (via `X-Forwarded-For`) and `req.protocol` shows `https`. This is essential for the access logs to be meaningful and for `gateway.security.allowedIPs` to match against the real client.

## Authenticated Access

**Secure by default**: The gateway auto-generates a cryptographic API key on first run and requires it for all SSE/HTTP access. stdio transport (spawned by clients) bypasses auth.

### API Key Storage (Industry Standard)

Keys are stored using OS-level secure storage, never cleartext:

**Primary method: System keychain**
- macOS: Keychain Services
- Linux: libsecret / GNOME Keyring / Secret Service API
- Windows: Credential Manager

**Fallback method: Encrypted file** (for headless servers)
- AES-256-GCM authenticated encryption
- Key derived from machine ID + salt via PBKDF2 (100k iterations, SHA-512)
- File: `~/.mcp/.gateway-api-key.enc`
- Stolen file won't decrypt on another machine

**Migration**: Old cleartext keys (`~/.mcp/gateway-api-key`) are auto-migrated to secure storage on first run.

### Retrieve the API Key

```bash
docker run --rm -v $HOME/.mcp:/root/.mcp \
  -e PRINT_API_KEY=true \
  ghcr.io/ismail-kattakath/mcp-gateway:latest
```

Output:
```
GATEWAY_API_KEY=abc123def456...

Copy this key to use in client configurations:
  "headers": {
    "Authorization": "Bearer abc123def456..."
  }
```

### Rotate the API Key

```bash
docker run --rm -v $HOME/.mcp:/root/.mcp \
  -e ROTATE_API_KEY=true \
  ghcr.io/ismail-kattakath/mcp-gateway:latest
```

⚠️ After rotation, update the key in all client configurations.

### Authentication Control

**Default: enabled** (`enableAuth: true`)

Disable for local-only development:

```bash
# Via environment variable (takes precedence)
GATEWAY_ENABLE_AUTH=false

# Or in registry.json
"gateway": {
  ...
  "enableAuth": false
}
```

### Transport-Specific Auth

| Transport | Auth Required | Reason |
|-----------|---------------|--------|
| **stdio** | No | Pipe ownership is inherent authentication |
| **SSE** | Yes (if enabled) | Network-accessible |
| **HTTP** | Yes (if enabled) | Network-accessible |

### IP Allowlist (Optional)

```json
"gateway": {
  ...
  "allowedIPs": ["127.0.0.0/8", "192.168.1.0/24", "10.0.0.5"]
}
```

- CIDR-aware (uses `ipaddr.js`)
- IPv4-mapped-in-IPv6 normalized
- Applies to all transports (including stdio)
- Works independently of `enableAuth`

### Bearer Token Details

When `enableAuth: true`, every request to `/sse`, `/mcp/*`, and `/api/*` must include:

```
Authorization: Bearer <apiKey>
```

- Constant-time comparison (`crypto.timingSafeEqual`) — no timing oracle
- Failed auth returns `401` with `WWW-Authenticate: Bearer realm="mcp-gateway"`
- `/health` always exempt (uptime monitors)

**Browser fallback**: `?access_token=<key>` on `/sse` only (EventSource can't set headers). Avoid for other endpoints — tokens in URLs leak to logs.

### Defense-in-Depth with Caddy

`Caddyfile.prod` gates at the edge + gateway also checks internally:

- Misconfigured reverse proxy? Gateway still refuses.
- Accidentally exposed port? Gateway still refuses.
- Leaked token must pass both layers.

Use the same auto-generated key for both (retrieve with `PRINT_API_KEY=true`).

## Release automation

The repo is wired for hands-off releases — write Conventional Commits, merge PRs, merge the release PR when ready, image appears on ghcr.

```
PR with Conventional title  →  release-please opens release PR
                            →  you merge release PR
                            →  release-please creates v* tag
                            →  release.yml builds + pushes ghcr image
```

Workflows:
- `pr-title.yml` — validates every PR title is a valid Conventional Commit
- `release-please.yml` — runs on every push to `main`; opens/updates release PR; creates v* tag on merge
- `release.yml` — listens for v* tags; pushes multi-arch image to ghcr

**One-time human setup:** create a fine-grained PAT and store it as `RELEASE_PLEASE_TOKEN`. Without it, the v* tag created by release-please won't trigger the Docker workflow (GitHub's loop-prevention rule). See `CONTRIBUTING.md` → "One-time setup" for the exact PAT permissions.

Config files: `release-please-config.json` (manifest mode, linked versions across server + ui) and `.release-please-manifest.json` (current version tracking).

Bootstrap version: `0.1.0`. Linked versions mean server and ui bump together as a single product.

## Run via Docker

Pre-built multi-arch images (amd64, arm64) are published on every push to `main` and on `v*.*.*` tags:

```bash
docker pull ghcr.io/ismail-kattakath/mcp-gateway:latest
```

Tags:

| Tag | Source | Use |
|---|---|---|
| `latest` | latest tagged release | recommended for most users |
| `v1.2.3` / `v1.2` / `v1` | tagged release | pin to a specific version |
| `edge` | every push to `main` | bleeding edge |
| `sha-abc1234` | every build | fully reproducible pin |

### Quick start

```bash
# 1. Get a starting registry + env
curl -O https://raw.githubusercontent.com/ismail-kattakath/mcp-gateway/main/registry.example.json
mv registry.example.json registry.json
echo "GATEWAY_API_KEY=$(openssl rand -hex 32)" > .env

# 2. Run
docker run -d --name mcp-gateway \
  -p 127.0.0.1:3000:3000 \
  -v $(pwd)/registry.json:/app/registry.json:ro \
  -v $(pwd)/.env:/app/.env:ro \
  -v $HOME/.mcp:/root/.mcp \
  ghcr.io/ismail-kattakath/mcp-gateway:latest
```

Or via compose: `docker-compose up -d` (uses the published image by default).

### Three trust tiers for `source: "container"`

The gateway's `container` server source needs to spawn Docker containers. The choice of how it talks to a Docker daemon determines your blast radius if a malicious server makes it into the registry.

| Tier | What you do | What works | Blast radius if compromised |
|---|---|---|---|
| **1 — no socket** *(default)* | Don't mount anything | `pkg`, `git`, `remote`, `local`. `container` returns errors. | Gateway is contained — no Docker access at all. |
| **2 — socket proxy** | Uncomment `docker-proxy` in compose; set `DOCKER_HOST=tcp://docker-proxy:2375` | All sources including `container` | Attacker can spawn containers and pull images, but cannot mount arbitrary host paths, use `--privileged`, or escape via volume tricks. The proxy (`tecnativa/docker-socket-proxy`) whitelists only `containers/*`, `images/*`, `build/*`. |
| **3 — rootless Docker on the host** | Set up [rootless Docker](https://docs.docker.com/engine/security/rootless/) on the host *before* running the gateway; combine with Tier 2 for belt-and-suspenders | All sources | Container root = your unprivileged user account, not host root. **Still has access to your home dir, SSH keys, dotfiles** — only worth the setup if you also keep secrets out of the user account that runs the daemon. |

#### Why mounting `/var/run/docker.sock` is not a casual decision

The Docker daemon socket is the daemon's control plane. Anything that can write to it can ask the daemon to:
- Start a new container that mounts host `/` → read `/etc/shadow`, install cron persistence
- Use `--privileged` → load kernel modules, escape into host PID namespace
- Mount a different volume into a different container → read that container's secrets

Inside our container the gateway is "just" running as root-in-container, which Docker isolates from the host. The socket bypasses that isolation by proxying through the host daemon. So **container root + raw Docker socket ≈ host root**.

If you write the registry yourself and trust everything in it, Tier 2 is overkill and you can mount the raw socket. If anyone else can edit the registry (multi-tenant, public deployment, automated CI adding entries), use Tier 2 at minimum.

### Production checklist

1. Front the gateway with `Caddyfile.prod` (HTTPS + Bearer gate at the edge).
2. Set `gateway.security.enableAuth: true` and `apiKey: "${GATEWAY_API_KEY}"` so the gateway *also* enforces auth (defense in depth).
3. Pick a trust tier for `container` source (above).
4. Keep the gateway bound to `127.0.0.1` — never `0.0.0.0` unless you've reviewed exactly who can reach it.
5. Pin to a `sha-*` or `v*.*.*` tag in production, not `latest`.

### Building from source

```bash
docker-compose up --build               # local
docker-compose -f docker-compose.prod.yml up -d
```

(In the compose files, comment out the `image:` line and uncomment `build:` to use a local build.)

## API Surface

The gateway exposes:

| Endpoint | Purpose |
|----------|---------|
| `GET /sse` | MCP transport (clients connect here) |
| `POST /mcp/message` | JSON-RPC request endpoint for SSE clients |
| `GET /health` | Health check + server counts |
| `GET /api/status` | Per-server status + gateway info |
| `GET /api/config` | Full registry |
| `GET /api/logs/:serverName?` | Server logs (omit serverName for all) |
| `POST /api/servers/:serverName/start` | Start a server |
| `POST /api/servers/:serverName/stop` | Stop a server |

## Web UI Features

- **Dashboard**: status counts and per-server state
- **Servers**: list of registry entries with start/stop controls
- **Logs**: live tail with per-server filter
