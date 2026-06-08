# MCP Gateway

Universal aggregator for [Model Context Protocol](https://modelcontextprotocol.io/) servers. Point every AI coding tool (Claude Code, Claude Desktop, Cline, Cursor, …) at **one** gateway URL instead of maintaining N parallel `mcpServers` blocks.

[![Release](https://img.shields.io/github/v/release/ismail-kattakath/mcp-gateway?sort=semver)](https://github.com/ismail-kattakath/mcp-gateway/releases)
[![Image](https://img.shields.io/badge/ghcr.io-mcp--gateway-blue)](https://github.com/ismail-kattakath/mcp-gateway/pkgs/container/mcp-gateway)

## Why

| Without a gateway | With this gateway |
|---|---|
| N copies of the same `mcpServers` block in N tool configs | One `registry.json` |
| Every tool loads every server upfront → context spam | Servers spawn on-demand and idle out after 5 min |
| Secrets duplicated across tool configs | One `.env` |
| Same servers re-configured on every machine | Deploy once (local or remote), all machines connect |

## Quick start (Docker)

```bash
docker pull ghcr.io/ismail-kattakath/mcp-gateway:latest

# Get a starter registry
curl -O https://raw.githubusercontent.com/ismail-kattakath/mcp-gateway/main/registry.example.json
mv registry.example.json registry.json
echo "GATEWAY_API_KEY=$(openssl rand -hex 32)" > .env

docker run -d --name mcp-gateway \
  -p 127.0.0.1:3000:3000 \
  -v $(pwd)/registry.json:/app/registry.json:ro \
  -v $(pwd)/.env:/app/.env:ro \
  -v $HOME/.mcp:/root/.mcp \
  ghcr.io/ismail-kattakath/mcp-gateway:latest
```

Then point any MCP client at `http://localhost:3000/sse`:

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

For HTTPS or a custom domain, put **Caddy** in front. Templates ship with the repo (`Caddyfile.local`, `Caddyfile.prod`) and the steps are in [`CLAUDE.md`](CLAUDE.md#https--custom-domain).

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
  "env": { "MY_TOKEN": "${MY_TOKEN}" }   // ${VAR} resolves from .env or system env
}
```

Full schema: [`schema/registry-v2.schema.json`](schema/registry-v2.schema.json). Typed mirror: [`types/registry.d.ts`](types/registry.d.ts).

## Authenticated access

Defaults are safe for local use (no auth, loopback bind). For remote / shared deployments, the gateway has built-in Bearer token + IP allowlist enforcement:

```json
"security": {
  "apiKey":     "${GATEWAY_API_KEY}",
  "enableAuth": true,
  "allowedIPs": ["10.0.0.0/8"]
}
```

Constant-time token compare, CIDR-aware allowlist, `/health` always exempt. Pair with `Caddyfile.prod` for defense-in-depth at the edge. Details in [`CLAUDE.md`](CLAUDE.md#authenticated-access).

## `source: "container"` and the host Docker socket

The `container` source needs to talk to a Docker daemon. The default Docker Compose **does not** mount `/var/run/docker.sock` — so `pkg`/`git`/`remote`/`local` work out of the box and `container` is opt-in. There are three trust tiers:

1. **No socket** *(default)* — `container` returns errors, everything else works
2. **Filtered socket proxy** (uncomment `docker-proxy` in `docker-compose.yml`) — `container` works, attacker can't escape the container
3. **Rootless Docker on the host** — additional belt-and-suspenders

Full discussion of trade-offs in [`CLAUDE.md`](CLAUDE.md#three-trust-tiers-for-source-container).

## Build from source

```bash
git clone https://github.com/ismail-kattakath/mcp-gateway.git
cd mcp-gateway
cp .env.example .env                          # add your secrets

# Dev (hot-reload)
cd server && npm install && npm run dev       # gateway on :3000
cd ../ui && npm install && npm run dev        # dashboard on :5173, proxies /api → 3000

# Or via Docker
docker-compose up --build
```

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
├── Caddyfile.local           # HTTPS via mcp.local (Caddy internal CA)
├── Caddyfile.prod            # HTTPS via Let's Encrypt
└── .github/workflows/        # release-please + multi-arch ghcr publish
```

## Releases

Releases are fully automated:

1. Open a PR with a [Conventional Commits](https://www.conventionalcommits.org/) title (`feat:`, `fix:`, `chore:`, `feat!:`, …) — a linter blocks PRs with malformed titles.
2. Squash-merge to `main`. [release-please](https://github.com/googleapis/release-please) opens (or updates) a release PR.
3. Merge the release PR → a `vX.Y.Z` tag is pushed → the Docker workflow publishes the multi-arch image.

No manual versioning, no manual tagging, no manual changelog. Setup details in [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Documentation

- [**CLAUDE.md**](CLAUDE.md) — full technical reference (schema, HTTPS, Docker tiers, auth model, deployment checklist)
- [**CONTRIBUTING.md**](CONTRIBUTING.md) — Conventional Commits + release flow + one-time setup
- [**CHANGELOG.md**](CHANGELOG.md) — auto-generated release notes
- [`schema/registry-v2.schema.json`](schema/registry-v2.schema.json) — registry JSON Schema (the source of truth)

## License

MIT
