# Architecture

This document explains the system design, architectural decisions, and key implementation patterns of the MCP Gateway.

## System Overview

MCP Gateway is a **universal aggregator** for Model Context Protocol servers. It acts as a transparent proxy between MCP clients (Claude Code, Claude Desktop, Cline, Cursor) and MCP servers, with lazy-loading, hot-reload, and shared state.

### Core Problems Solved

1. **Config duplication** - One `registry.json` instead of N tool-specific configs
2. **Context spam** - Servers spawn on-demand and idle out after 5 min
3. **Mixed runtimes** - Support npm, git, Docker, remote endpoints, local scripts from one schema
4. **Multi-machine access** - Deploy once, connect from anywhere
5. **Shared state** - One server process shared by all clients (persistent sessions)

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    MCP Clients (Claude Code, etc.)               │
└──────────────┬───────────────────┬──────────────────────────────┘
               │                   │
          stdio (pipe)        SSE/HTTP (network)
               │                   │
               ↓                   ↓
┌──────────────────────────────────────────────────────────────────┐
│                        MCP Gateway Server                         │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  Transport Layer (stdio, SSE, HTTP)                        │  │
│  │  - Auto-detect stdin pipe → enable stdio                   │  │
│  │  - SSE event stream → persistent connection                │  │
│  │  - HTTP POST → request/response                            │  │
│  └────────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  Auth Middleware (Bearer token + IP allowlist)             │  │
│  │  - Constant-time token comparison                          │  │
│  │  - CIDR-aware IP filtering                                 │  │
│  │  - stdio bypasses auth (pipe ownership = trust)            │  │
│  └────────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  MCP Protocol Handler                                       │  │
│  │  - JSON-RPC 2.0 message parsing                            │  │
│  │  - tools/list, tools/call routing                          │  │
│  │  - tools/list_changed notifications on hot-reload          │  │
│  └────────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  Router (Tool Namespacing)                                  │  │
│  │  - Parse <server-name>/<tool-name>                         │  │
│  │  - Route to ServerManager                                   │  │
│  └────────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  ServerManager (Lifecycle + Source Dispatch)               │  │
│  │  - On-demand spawning (first tool call)                    │  │
│  │  - Persistent spawning (at gateway startup)                │  │
│  │  - Idle timeout (5 min for on-demand)                      │  │
│  │  - Auto-restart on crash (persistent only)                 │  │
│  │  - Hot-reload on registry.json change                      │  │
│  └────────────────────────────────────────────────────────────┘  │
│         │              │              │         │         │        │
│         ↓              ↓              ↓         ↓         ↓        │
│     ┌─────┐       ┌─────┐       ┌─────────┐ ┌──────┐ ┌──────┐   │
│     │ pkg │       │ git │       │container│ │remote│ │local │   │
│     └─────┘       └─────┘       └─────────┘ └──────┘ └──────┘   │
│        │              │              │         │         │        │
└────────┼──────────────┼──────────────┼─────────┼─────────┼────────┘
         ↓              ↓              ↓         ↓         ↓
    ┌────────┐    ┌────────┐    ┌──────────┐ ┌───────┐ ┌───────┐
    │  npx   │    │  git   │    │  Docker  │ │  HTTP │ │script │
    │ uvx    │    │ clone  │    │ daemon   │ │  SSE  │ │ exec  │
    │ pipx   │    │ build  │    │          │ │       │ │       │
    └────────┘    └────────┘    └──────────┘ └───────┘ └───────┘
         ↓              ↓              ↓         ↓         ↓
    ┌────────────────────────────────────────────────────────────┐
    │              MCP Server Processes (stdio)                  │
    │  obs-mcp, github-mcp, custom-mcp, remote endpoint, etc.   │
    └────────────────────────────────────────────────────────────┘
```

---

## Key Design Decisions

### 1. Why 5 Source Types (Not 11)?

**Original schema had 11 types:**
- `npx`, `uvx`, `pipx` (3 package managers)
- `git-npm`, `git-python`, `git-docker` (3 git + runtime combos)
- `docker`, `local`, `remote-sse`, `remote-http`, `shell` (5 others)

**Refactored to 5 sources:**
- `pkg` - All package managers (npx/uvx/pipx) via `command` field
- `git` - Auto-detect runtime (npm/python/docker) from repo contents
- `container` - Docker (pull image **or** build locally)
- `remote` - HTTP/SSE (transport specified via `transport` field)
- `local` - Local scripts (subsumes `shell` — just use `command: "bash"`)

**Rationale:**
- **Reduces duplication** - Package managers share 95% of logic (spawn process, parse args)
- **Auto-detection** - Git repos can be analyzed once cloned (package.json → npm, pyproject.toml → uv)
- **Simpler schema** - Discriminated union on `source` instead of 11 flat types
- **Better UX** - User specifies *where the server comes from*, not implementation details

**See:** Memory note `registry-schema-redesign.md` for full rationale.

---

### 2. Why Three Transports Simultaneously (stdio + SSE + HTTP)?

**stdio** (standard input/output):
- **Use case:** Auto-spawn mode (client spawns gateway via `docker run -i`)
- **Auth:** None (pipe ownership is inherent trust — only the spawning process can write)
- **Detection:** Gateway checks `!process.stdin.isTTY` at startup
- **Lifecycle:** Gateway shuts down when stdin closes (client exits)
- **Benefit:** Zero manual setup for end users

**SSE** (Server-Sent Events):
- **Use case:** Persistent daemon, multiple clients, remote access
- **Auth:** Required (Bearer token + IP allowlist)
- **Protocol:** Long-lived HTTP connection, server pushes events
- **Benefit:** Standard web technology, firewall-friendly, bidirectional via `/mcp/message` POST

**HTTP** (request/response):
- **Use case:** Smithery-style remote MCP servers (single request/response per tool call)
- **Auth:** Required (Bearer token + IP allowlist)
- **Protocol:** One POST per tool call
- **Benefit:** Simpler for stateless remote servers

**Why all three?**
- **Flexibility** - Different clients have different constraints (stdio for CLI, SSE for web)
- **No mutual exclusion** - Running all three costs almost nothing (same JSON-RPC handler)
- **Future-proof** - MCP spec may evolve to prefer one transport; we support all

---

### 3. Why Auto-Generated API Keys (Not Manual)?

**Design:**
- Gateway generates a cryptographic key on first run (32-byte hex, 256-bit entropy)
- Key stored in OS keychain (macOS Keychain, Linux libsecret, Windows Credential Manager)
- Fallback: AES-256-GCM encrypted file with machine-derived key (PBKDF2, 100k iterations, SHA-512)
- Old cleartext keys auto-migrated to secure storage

**Rationale:**
- **Secure by default** - Users can't accidentally commit cleartext keys to git
- **Zero setup** - No need to run `openssl rand -hex 32` manually
- **Industry standard** - Keychain is how browsers, password managers, and SSH agents store secrets
- **Machine-bound** - Encrypted fallback uses machine ID + salt, so stolen file won't decrypt on another machine

**Why not just cleartext `.env` file?**
- `.env` files are easily committed to git (even with `.gitignore`, humans make mistakes)
- Keychain survives `.env` deletion, repo clones, and accidental `git clean`
- Encrypted fallback survives even if keychain is unavailable (headless servers)

**Trade-off accepted:**
- Complexity cost (keytar dependency, fallback logic)
- But: Users never see the key unless they explicitly print it (`PRINT_API_KEY=true`)

---

### 4. Why Keychain + Encrypted Fallback (Not Just Keychain)?

**Problem:** Keychain requires GUI session on some Linux distros (GNOME Keyring, KDE Wallet)
- Headless servers (no X11, no Wayland) → keytar fails
- Docker containers → no keychain daemon
- CI/CD runners → no keychain available

**Solution:** Two-tier storage
1. **Try keychain first** (keytar library)
2. **Fall back to encrypted file** if keychain unavailable
   - File: `~/.mcp/.gateway-api-key.enc`
   - Encryption: AES-256-GCM (authenticated)
   - Key derivation: `PBKDF2(machineId + salt, 100k iterations, SHA-512)`
   - Machine ID from `node-machine-id` (uses MAC address, disk serial, etc.)

**Security properties:**
- Encrypted file won't decrypt on another machine (different machineId)
- Attacker with file access but not machine access → can't read key
- Attacker with machine access → could derive key, but at that point they control the server anyway

**Trade-off accepted:**
- Machine-bound encryption is **not** defense against local root — it's defense against **stolen backup files** or **cloud storage leaks**
- If attacker has root on the machine, all bets are off (they can read process memory, hook syscalls, etc.)

---

### 5. Why `backends/` Directory Name (Inconsistent with "servers" Terminology)?

**Decision:** Preserve `server/src/mcp/backends/` filesystem path, even though code uses "server" terminology everywhere.

**Rationale:**
- **Filesystem stability** - Renaming a directory breaks git history, IDE search indexes, and import paths
- **Low user impact** - Internal directory structure, not user-facing
- **Documented exception** - CLAUDE.md explicitly notes this and says "treat backend and server as synonymous in legacy paths"

**Alternatives considered:**
- **Rename to `servers/`** → Breaks history, not worth it
- **Rename to `sources/`** → More accurate but even more churn

**Verdict:** Leave it. Comment in code and docs explains why.

---

## Sequence Diagrams

### stdio Transport Flow

```
┌──────────┐                  ┌─────────────┐                  ┌──────────┐
│  Client  │                  │   Gateway   │                  │   MCP    │
│ (Claude) │                  │   (Docker)  │                  │  Server  │
└────┬─────┘                  └──────┬──────┘                  └────┬─────┘
     │                               │                              │
     │  docker run -i gateway        │                              │
     ├──────────────────────────────>│                              │
     │                               │                              │
     │                               │  Detect !stdin.isTTY         │
     │                               │  → Enable stdio transport    │
     │                               │                              │
     │  {"method": "tools/list"}     │                              │
     ├──────────────────────────────>│                              │
     │                               │                              │
     │                               │  Parse request               │
     │                               │  Route to ServerManager      │
     │                               │                              │
     │                               │  Spawn MCP server (if needed)│
     │                               ├─────────────────────────────>│
     │                               │                              │
     │                               │  Forward tools/list          │
     │                               ├─────────────────────────────>│
     │                               │                              │
     │                               │  {"tools": [...]}            │
     │                               │<─────────────────────────────┤
     │                               │                              │
     │  {"result": {"tools": [...]}} │                              │
     │<──────────────────────────────┤                              │
     │                               │                              │
     │  [client exits]               │                              │
     ├──────────────────────────────>│                              │
     │                               │                              │
     │                               │  stdin.on('end')             │
     │                               │  → Shutdown gracefully       │
     │                               │                              │
     │                               │  Stop all servers            │
     │                               ├─────────────────────────────>│
     │                               │                              │
```

### SSE Transport Flow (Persistent Daemon)

```
┌──────────┐              ┌─────────────┐              ┌──────────┐
│  Client  │              │   Gateway   │              │   MCP    │
│ (Claude) │              │   (daemon)  │              │  Server  │
└────┬─────┘              └──────┬──────┘              └────┬─────┘
     │                           │                          │
     │  GET /sse                 │                          │
     │  Authorization: Bearer X  │                          │
     ├──────────────────────────>│                          │
     │                           │                          │
     │                           │  Check auth token        │
     │                           │  Check IP allowlist      │
     │                           │  → 200 OK                │
     │                           │                          │
     │  (SSE connection open)    │                          │
     │<──────────────────────────┤                          │
     │                           │                          │
     │  event: connected         │                          │
     │<──────────────────────────┤                          │
     │                           │                          │
     │  POST /mcp/message        │                          │
     │  {"method": "tools/call"} │                          │
     ├──────────────────────────>│                          │
     │                           │                          │
     │                           │  Parse <server>/<tool>   │
     │                           │  Route to ServerManager  │
     │                           │                          │
     │                           │  Forward tools/call      │
     │                           ├─────────────────────────>│
     │                           │                          │
     │                           │  {"result": {...}}       │
     │                           │<─────────────────────────┤
     │                           │                          │
     │  event: response          │                          │
     │  data: {"result": {...}}  │                          │
     │<──────────────────────────┤                          │
     │                           │                          │
     │  [registry.json changes]  │                          │
     │                           │                          │
     │                           │  Reload registry         │
     │                           │  Stop removed servers    │
     │                           │  Start new servers       │
     │                           │                          │
     │  event: notification      │                          │
     │  {"method":               │                          │
     │   "tools/list_changed"}   │                          │
     │<──────────────────────────┤                          │
     │                           │                          │
     │  POST /mcp/message        │                          │
     │  {"method": "tools/list"} │                          │
     ├──────────────────────────>│                          │
     │  (client refetches tools) │                          │
     │                           │                          │
```

### Tool Call Routing

```
┌──────────┐         ┌────────┐         ┌───────────────┐         ┌──────────┐
│  Client  │         │ Router │         │ ServerManager │         │   MCP    │
│          │         │        │         │               │         │  Server  │
└────┬─────┘         └────┬───┘         └───────┬───────┘         └────┬─────┘
     │                    │                     │                      │
     │  tools/call:       │                     │                      │
     │  "obs/screenshot"  │                     │                      │
     ├───────────────────>│                     │                      │
     │                    │                     │                      │
     │                    │  Parse namespace    │                      │
     │                    │  serverName = "obs" │                      │
     │                    │  toolName = "screenshot"                   │
     │                    │                     │                      │
     │                    │  Get server "obs"   │                      │
     │                    ├────────────────────>│                      │
     │                    │                     │                      │
     │                    │                     │  Server not running? │
     │                    │                     │  → Spawn it          │
     │                    │                     ├─────────────────────>│
     │                    │                     │                      │
     │                    │  Server ready       │                      │
     │                    │<────────────────────┤                      │
     │                    │                     │                      │
     │                    │  Forward            │                      │
     │                    │  tools/call:        │                      │
     │                    │  "screenshot"       │                      │
     │                    ├────────────────────────────────────────────>│
     │                    │                     │                      │
     │                    │                     │  {"result": "..."}   │
     │                    │<────────────────────────────────────────────┤
     │                    │                     │                      │
     │  {"result": "..."} │                     │                      │
     │<───────────────────┤                     │                      │
     │                    │                     │                      │
     │                    │                     │  [5 min idle]        │
     │                    │                     │  → Stop server       │
     │                    │                     ├─────────────────────>│
     │                    │                     │                      │
```

---

## Technology Choices

### Why Vitest (Not Jest)?

- **ESM native** - Jest's ESM support is still experimental (2024)
- **Faster** - Vite-powered, instant HMR
- **Modern API** - Compatible with Jest, but cleaner
- **TypeScript native** - No ts-jest wrapper needed
- **Industry momentum** - Vite is the new standard for modern web apps

### Why Playwright (Not Cypress)?

- **Multi-browser** - Chrome, Firefox, Safari, Edge
- **True headless** - No X server needed for CI
- **Faster** - No Electron wrapper overhead
- **Better API** - Auto-wait, better selectors
- **Microsoft-backed** - Long-term support

### Why Winston (Not Bunyan/Pino)?

- **Most popular** - Larger ecosystem
- **Flexible transports** - Console, file, HTTP, syslog, etc.
- **Good TypeScript types** - First-class support
- **Proven** - Used in production at scale

### Why Express (Not Fastify/Hono)?

- **Proven** - 10+ years in production
- **Middleware ecosystem** - Thousands of packages
- **TypeScript types** - Excellent
- **Good enough** - Not a bottleneck (gateway is IO-bound, not CPU-bound)

**Trade-off accepted:**
- Fastify is faster (benchmarks show 2-3x throughput)
- But: Gateway spends 99% of time waiting on MCP servers, not handling requests
- Express's ecosystem and maturity outweigh raw speed

---

## Security Architecture

### Threat Model

**In scope:**
- Attacker with network access to gateway (remote exploitation)
- Attacker with read access to backup files (stolen encrypted key file)
- Attacker with compromised MCP server (malicious tool calls)

**Out of scope:**
- Attacker with local root on gateway host (game over)
- Attacker with physical access to machine (keychain extraction)
- Supply chain attacks (malicious npm packages)

### Defense Layers

**Layer 1: Authentication**
- Auto-generated 256-bit API key (never user-chosen)
- Constant-time comparison (`crypto.timingSafeEqual`) — no timing oracle
- Failed attempts logged with IP address
- stdio transport bypasses auth (pipe ownership is trust)

**Layer 2: Storage Encryption**
- Primary: OS keychain (macOS Keychain, Linux libsecret, Windows Credential Manager)
- Fallback: AES-256-GCM with machine-derived key
- Old cleartext keys auto-migrated

**Layer 3: IP Allowlist**
- CIDR-aware (supports `10.0.0.0/8`, `192.168.1.0/24`, etc.)
- IPv4-mapped-IPv6 normalized (so `::ffff:127.0.0.1` matches `127.0.0.1/8`)
- Applied to all transports

**Layer 4: Docker Isolation**
- Gateway runs in container (no host filesystem access by default)
- `container` source requires explicit socket mount (tiered trust model)
- Socket proxy option for defense-in-depth (tecnativa/docker-socket-proxy)

**Layer 5: Reverse Proxy**
- TLS termination at edge
- Rate limiting (reverse proxy config)
- Bearer token check at edge (defense-in-depth with gateway's check)

### What We Don't Do (And Why)

**No 2FA / OAuth login for the gateway itself**
- Rationale: Gateway is infrastructure, not a user-facing app
- Bearer token is the "password" — rotate via `ROTATE_API_KEY=true`

**No request signing / HMAC**
- Rationale: TLS already provides integrity + confidentiality
- Bearer token over HTTPS is sufficient (same model as GitHub API, Stripe API)

**No rate limiting at gateway level**
- Rationale: Reverse proxy should handle this
- Gateway trusts stdio clients (they're local processes)

---

## Performance Characteristics

### Bottlenecks

1. **MCP server spawn time** (0.5-5 seconds depending on package manager)
2. **Docker container pull** (5-60 seconds for large images)
3. **Git clone + build** (10-120 seconds for large repos)

**Not bottlenecks:**
- Gateway JSON-RPC parsing (< 1ms)
- Tool routing (< 1ms)
- Registry validation (< 10ms)

### Optimization Strategies

**On-demand spawning:**
- Server process kept alive for 5 min after last use
- Subsequent tool calls reuse existing process (< 1ms overhead)

**Persistent spawning:**
- Server starts at gateway startup
- Zero spawn delay on tool calls
- Good for frequently-used servers (GitHub, filesystem, etc.)

**Registry hot-reload:**
- File watcher on `registry.json` (chokidar)
- Incremental update (only stop/start changed servers)
- No gateway restart needed

### Scalability Limits

**Concurrent clients:**
- Tested up to 10 simultaneous SSE connections
- No hard limit (depends on host resources)

**Concurrent servers:**
- Tested up to 20 persistent servers
- Memory scales linearly (each server ~50-200MB)

**Tool call throughput:**
- Bottlenecked by slowest MCP server
- Gateway adds < 5ms latency per call

---

## Future Architecture Considerations

### Potential Improvements

1. **Server pooling** - Spawn N instances of the same server for parallel tool calls
2. **Tool call queueing** - Rate-limit per-server to avoid overwhelming slow servers
3. **Prometheus metrics** - Export tool call latency, server uptime, error rates
4. **gRPC transport** - Faster than HTTP for high-throughput scenarios
5. **Multi-tenancy** - Isolate registry per API key (different users see different servers)

### Non-Goals

- **Web UI for editing registry.json** - Prefer text file + git workflow
- **Built-in OAuth for MCP servers** - Each server should handle its own auth
- **Plugin system** - 5 source types cover 99% of use cases

---

## Related Documentation

- [CLAUDE.md](CLAUDE.md) - Full technical reference (registry schema, deployment)
- [SECURITY.md](SECURITY.md) - Security hardening guide
- [TESTING.md](TESTING.md) - Testing strategy and coverage
- [CONTRIBUTING.md](CONTRIBUTING.md) - Release automation and PR workflow
