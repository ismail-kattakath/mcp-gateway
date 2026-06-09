# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**MCP Gateway** is a universal aggregator for Model Context Protocol (MCP) servers. It allows AI coding tools to connect to a single gateway instead of managing multiple MCP server configurations. The gateway routes namespaced tool calls (`<server-name>/<tool-name>`) to the appropriate backend server.

**Key Architecture:**

- **Monorepo**: `server/` (Node.js TypeScript gateway) + `ui/` (React dashboard)
- **Transport modes**: stdio (spawned clients), SSE, HTTP
- **Five server sources**: `pkg` (npm/uvx/pipx), `git` (clone+build), `container` (Docker), `remote` (HTTP/SSE), `local` (existing scripts)
- **Lifecycle modes**: `persistent` (always running) or `on-demand` (lazy-loaded, reaped after 5min idle)
- **Security**: Auto-generated API keys stored in system keychain, optional IP allowlist, comprehensive security hardening (OWASP Top 10, CWE Top 25)
- **REST API**: Full CRUD operations for server management, OpenAPI 3.0 spec, Swagger UI docs
- **Security Hardening**: Input validation, rate limiting, security headers, secrets management, container security
- **Production Deployment**: Kubernetes manifests, Helm chart, Docker Compose, standalone server configurations with HA, autoscaling, and monitoring

## REST API

**MCP Gateway provides a comprehensive REST API for server management.**

**Interactive Docs:** [http://localhost:3000/docs](http://localhost:3000/docs) (Swagger UI)  
**OpenAPI Spec:** [http://localhost:3000/docs/openapi.json](http://localhost:3000/docs/openapi.json)

**Key endpoints:**

- `GET /api/servers` — List all servers
- `POST /api/servers` — Create new server
- `GET /api/servers/{name}` — Get server details
- `PUT /api/servers/{name}` — Update server config
- `DELETE /api/servers/{name}` — Delete server
- `POST /api/servers/{name}/(start|stop|restart|enable|disable)` — Control server lifecycle
- `GET /api/logs[/{name}]` — Get server logs
- `GET /health` — Health check (no auth required)

**Authentication:** Bearer token (auto-generated API key stored in system keychain)

```bash
# Get API key
PRINT_API_KEY=true npm start

# Use in requests
curl -H "Authorization: Bearer YOUR_KEY" http://localhost:3000/api/servers

# Disable auth (use CLI instead)
mcp auth disable --registry /path/to/registry.json
```

**Full documentation:** See `docs/API.md` for detailed examples, error codes, and best practices.

---

## Development Commands

### Server (Node.js/TypeScript)

```bash
cd server

# Development (with hot reload)
npm run dev                  # Start on :3000

# Build & Production
npm run build                # Compile TypeScript → dist/
npm start                    # Run compiled dist/index.js

# Testing
npm test                     # Run all tests (Vitest)
npm run test:watch           # Watch mode
npm run test:coverage        # Generate coverage report

# Code Quality
npm run lint                 # ESLint check
npm run lint:fix             # Auto-fix ESLint issues
npm run format               # Prettier format
npm run format:check         # Prettier check (CI)
npm run type-check           # TypeScript type check without emit

# Validation
npm run validate             # Validate registry.json schema
```

### UI (React/Vite)

```bash
cd ui

# Development
npm run dev                  # Start on :5173

# Build & Production
npm run build                # Compile TypeScript + Vite build
npm run preview              # Preview production build

# Testing
npm test                     # Run all tests (Vitest)
npm run test:watch           # Watch mode
npm run test:coverage        # Generate coverage report

# Code Quality
npm run lint                 # ESLint check
npm run lint:fix             # Auto-fix ESLint issues
npm run format               # Prettier format
npm run format:check         # Prettier check (CI)
npm run type-check           # TypeScript type check without emit
```

### CLI (Command-Line Interface)

```bash
cd cli

# Development
npm run dev -- servers list  # Run without building

# Build & Production
npm run build                # Compile TypeScript → dist/
npm link                     # Make 'mcp' globally available (optional)

# Code Quality
npm run lint                 # ESLint check
npm run lint:fix             # Auto-fix ESLint issues
npm run format               # Prettier format
npm run format:check         # Prettier check (CI)
npm run type-check           # TypeScript type check without emit
```

### Root (Monorepo)

```bash
# Git hooks
npm run prepare              # Install husky git hooks

# Pre-commit hook runs automatically via lint-staged:
# - ESLint fix
# - Prettier format
# - TypeScript type-check
```

## Architecture

### Core Request Flow

```
Client (Claude Code, etc.)
  ↓ MCP JSON-RPC request
server/src/index.ts (HTTP/SSE entrypoint)
  ↓
server/src/mcp/protocol.ts (MCP handler)
  ↓ tools/list or tools/call
server/src/mcp/router.ts (parse <server>/<tool>)
  ↓
server/src/mcp/backends/index.ts (ServerManager)
  ↓ dispatch on config.source
server/src/mcp/backends/{pkg,git,container,remote,local}.ts
  ↓ spawn/connect to actual MCP server
MCP Server (obs-mcp, filesystem, etc.)
  ↓ result
← response bubbles back up
```

### Key Components

**`server/src/mcp/backends/`** — Server lifecycle management

- `index.ts` — `ServerManager` class: initializes persistent servers, lazy-loads on-demand servers, handles auto-restart and idle reaping
- `base.ts` — `BaseServer` abstract class: state machine (stopped/starting/running/stopping/failed), retry logic, stdio parsing, event emitter for logs/exit/error
- `{pkg,git,container,local}.ts` — Concrete adapters extending `BaseServer`, each implements `prepare()` (setup work) and `getSpawnArgs()` (command/args/env)
- `remote.ts` — `RemoteServer` class: non-spawn adapter for SSE/HTTP remotes, implements same surface (isRunning, write, events) for uniform router interface
- `stdio-handler.ts` — JSON-RPC message parser for stdout/stderr streams

**`server/src/mcp/`** — MCP protocol layer

- `protocol.ts` — JSON-RPC 2.0 handlers: `tools/list`, `tools/call`, SSE streaming (`streamMessage`, `sendNotification`)
- `router.ts` — Parse `<server>/<tool>`, validate server exists/enabled, dispatch to `ServerManager.getServer()`
- `registry.ts` — Load/validate/watch `registry.json`, hot-reload on file change, apply defaults, validate schema + semantic checks

**`server/src/validation/`** — Registry validation

- `registry-validator.ts` — AJV schema validator + semantic checks (e.g., detect duplicate env keys, validate git repo URLs)
- `validate-registry.ts` — CLI tool for standalone validation

**`server/src/middleware/auth.ts`** — Bearer token + IP allowlist middleware (skips stdio transport, always allows `/health`)

**`server/src/security/`** — API key management

- `apikey.ts` — Generate/retrieve/rotate keys using crypto.randomBytes(32)
- `secure-storage.ts` — Wrapper for `keytar` (system keychain: macOS Keychain, Linux libsecret, Windows Credential Manager)

**`server/src/logging/`** — Winston-based logging

- `logger.ts` — Console + file transport, custom format with automatic sanitization
- `sanitizer.ts` — Sanitize user-controlled values (serverName, URL, path, args) before logging to prevent log injection (CRLF, control chars, credential leakage)

**`schema/registry-v2.schema.json`** — Source of truth for registry.json structure. TypeScript mirror at `server/src/types/registry.d.ts`.

## Registry Configuration

The `registry.json` file is the single source of truth for server configuration. Each server is keyed by a **server name** (lowercase, alphanumeric + hyphens) and declares a `source` field:

| Source      | Use Case                                     |
| ----------- | -------------------------------------------- |
| `pkg`       | Package manager (npx, uvx, pipx)             |
| `git`       | Clone repo, auto-detect install/build, spawn |
| `container` | Docker image (pull or build)                 |
| `remote`    | Already-running MCP server over SSE/HTTP     |
| `local`     | Existing script/binary on disk               |

**Common fields** (all optional with defaults):

- `lifecycle`: `"on-demand"` (lazy-loaded) or `"persistent"` (always running)
- `enabled`: `true` | `false`
- `timeout`: milliseconds (default 30000)
- `env`: Object with `${VAR}` substitution from system env

**Gateway config (v2.1+):**
The `gateway` object is now **optional**. Omit it to use sensible defaults:

```json
{
  "version": "2.0",
  "servers": { ... }
}
```

Defaults: `port=3000`, `host="0.0.0.0"`, `transport="sse"`, CORS enabled.

**Auth config (.mcp-gateway.json):**
Auth settings moved to separate file in v2.1. Use CLI to manage:

```bash
mcp auth enable --registry /path/to/registry.json
mcp auth allow add 192.168.1.100 --registry /path/to/registry.json
```

**Schema validation:**

- Run `cd server && npm run validate` to validate registry.json
- AJV validates against `schema/registry-v2.schema.json`
- Semantic checks enforce server name format, env key format, etc.

**See `docs/MIGRATION-v2.1.md` for migration guide from v2.0 to v2.1.**
**See `docs/MIGRATION_V2_TO_V3.md` for migration guide from v2.x to v3.0.**

## Security Requirements

**This project is enterprise-ready and must maintain production-grade security.**

### Core Security Principles

1. **Log Injection Prevention**
   - All user-controlled values MUST be sanitized before logging
   - Use `sanitizeServerName()`, `sanitizeUrl()`, `sanitizePath()`, `sanitizeString()`, `sanitizeArgs()` from `server/src/logging/sanitizer.ts`
   - Even though Winston format pipeline auto-sanitizes, CodeQL requires explicit call-site sanitization for static analysis
   - Pattern: `logger.info(\`Starting ${sanitizeServerName(name)}\`)`not`logger.info(\`Starting ${name}\`)`

2. **Path Traversal Prevention**
   - Validate all user-controlled paths with `path.resolve()` and check they don't escape intended parent directory
   - Example: `if (!repoDir.startsWith(path.resolve(reposRoot))) throw new Error(...)`

3. **Command Injection Prevention**
   - Always use `spawn(command, args, {shell: false})` — never construct command strings
   - Validate URL protocols before passing to `git clone` or similar

4. **Cryptographic Security**
   - Use `crypto.randomBytes()` for API key generation, never `Math.random()`
   - API keys are 32-byte base64url-encoded strings stored in system keychain

5. **Authentication**
   - Bearer token required for SSE/HTTP transports (default enabled)
   - Auth settings stored in `.mcp-gateway.json` (v2.1+)
   - stdio transport bypasses auth (pipe = inherent authentication)
   - `/health` endpoint always exempt from auth
   - Constant-time token comparison

### Security Hardening (Epic #31)

**Comprehensive protection against OWASP Top 10 and CWE Top 25 threats:**

1. **Input Validation** (`server/src/validation/input-validator.ts`)
   - Centralized validator for all user inputs
   - Prevents: SQL injection, command injection, XSS, path traversal, LDAP injection
   - Validates: server names, URLs, paths, args, env vars, Docker images, Git repos

2. **Rate Limiting** (`server/src/middleware/rate-limit.ts`)
   - IP-based: 10/minute, 100/hour on auth endpoints
   - User-based: 1000/hour on API endpoints
   - Server-based: 100/minute on MCP tool calls (configurable)
   - Returns 429 with Retry-After header

3. **Security Headers** (`server/src/middleware/security-headers.ts`)
   - Helmet.js: CSP, HSTS, X-Frame-Options, X-Content-Type-Options
   - Permissions-Policy, Referrer-Policy
   - CORS validation (reject wildcards in production)

4. **Secrets Management** (`server/src/security/secrets-manager.ts`)
   - Multi-provider: System keychain, Vault, AWS Secrets Manager, Azure Key Vault
   - CLI commands: `mcp secrets set/get/delete/list`
   - Environment variable substitution: `${SECRET:KEY}`
   - Secret detection on startup (warns about plaintext secrets)

5. **Container Security** (`Dockerfile`, `docker-compose.security.yml`)
   - Non-root user (UID 1000)
   - Read-only root filesystem
   - Seccomp profile (restrict syscalls)
   - Drop all capabilities
   - Resource limits (CPU, memory)

6. **Dependency Scanning** (`.github/workflows/security.yml`)
   - NPM audit on every PR
   - Trivy container scanning
   - Dependabot auto-PRs
   - Secret scanning (TruffleHog)

**Full documentation:** See `docs/SECURITY_HARDENING.md`

**CodeQL scanning runs on every PR.** All high-severity findings must be resolved before merge.

## Testing

**Server:** 166+ tests with Vitest, including:

- Unit tests for sanitizers (32 tests)
- Auth middleware tests (Bearer token, IP allowlist)
- Registry validation tests (42 tests)
- Security tests (API key generation, secure storage)
- **REST API endpoint tests (26 tests)** — Full CRUD operations for servers
- **OpenAPI spec validation (10 tests)** — Schema generation and documentation

**Coverage target:** 77%+ (current: ~80%)

**Running tests:**

```bash
cd server && npm test                # Run once
cd server && npm run test:watch      # Watch mode
cd server && npm run test:coverage   # With coverage report
```

## Release Process

**Fully automated via GitHub Actions + release-please:**

1. **Open a PR with Conventional Commits title:**
   - `feat:` → minor bump (0.1.0 → 0.2.0)
   - `fix:` → patch bump (0.1.0 → 0.1.1)
   - `feat!:` or `fix!:` → major bump (0.1.0 → 1.0.0)
   - `docs:`, `chore:`, `refactor:`, `test:` → no bump

2. **Title validation:** `.github/workflows/pr-title.yml` blocks PRs with malformed titles

3. **Squash-merge to main:** PR title becomes commit message, triggers release-please

4. **Release PR auto-created:** `chore(main): release X.Y.Z` updates `CHANGELOG.md`, `package.json`, `.release-please-manifest.json`

5. **Merge release PR:** Creates GitHub Release + git tag `vX.Y.Z`, triggers Docker build

6. **Docker workflow:** Builds multi-arch image (`linux/amd64`, `linux/arm64`), pushes to `ghcr.io/ismail-kattakath/mcp-gateway` with tags `:latest`, `:X.Y.Z`, `:X.Y`, `:X`, `:edge`, `:sha-<short>`

**Never manually:**

- Bump versions in package.json
- Edit CHANGELOG.md
- Create git tags
- Build/push Docker images

See `CONTRIBUTING.md` for full release-please setup details.

## Commit Hygiene

**Use Conventional Commits for all PR titles:**

✅ Good:

- `feat: add support for container build.repo`
- `fix: prevent on-demand server reaping during active tool call`
- `chore: bump express to 4.21.3`
- `feat!: rename backends to servers`

❌ Bad:

- `Add new feature` — missing type prefix
- `feat: Add new feature` — subject must start lowercase
- `Feat: add new feature` — type must be lowercase

**Git hooks:**

- Pre-commit: runs lint-staged (ESLint fix, Prettier format, TypeScript check on staged files)
- Commit message validation happens in CI via `pr-title.yml`, not locally

## Docker

**Container sources** (`source: "container"`) require Docker socket access. By default, the gateway container **does not** mount `/var/run/docker.sock` for security. To enable:

```bash
docker run -i --rm \
  -v /var/run/docker.sock:/var/run/docker.sock \
  ghcr.io/ismail-kattakath/mcp-gateway
```

**Alternative:** Use a Docker socket proxy (e.g., `tecnativa/docker-socket-proxy`) and set `DOCKER_HOST` env var.

## Environment Variables

**Gateway behavior:**

- `GATEWAY_DISABLE_AUTH` — Override auth config file (set to `true` to disable auth, dev only)
- `GATEWAY_PORT` — Override HTTP port (default 3000)
- `PRINT_API_KEY=true` — Print API key and exit (for daemon mode setup)
- `ROTATE_API_KEY=true` — Generate new API key and exit
- `DISABLE_STDIO=true` — Force HTTP mode (useful when stdin is detected as pipe)
- `--debug` flag — Enable debug logging (alternative to `LOG_LEVEL=debug`)

**Server env substitution:**

- Registry `env` fields support `${VAR}` substitution from system env
- Example: `"env": {"API_KEY": "${MY_API_KEY}"}` resolves `MY_API_KEY` from process.env

## Common Pitfalls

1. **Don't sanitize-then-validate-then-return-original:** CodeQL's sanitizer.ts refactor (June 2026) moved from "validate-then-use" to "sanitize-then-validate-then-return-sanitized". Always return the sanitized value, even if validation fails.

2. **Don't skip CodeQL warnings:** All high-severity findings are blocking. If CodeQL flags log injection, add explicit sanitization even if Winston format pipeline already sanitizes at runtime.

3. **Don't use `shell: true` in spawn():** Always pass args array to `spawn(command, args, {shell: false})` to prevent command injection.

4. **Don't commit without Conventional Commits title:** CI will fail. Prefix PR titles with `feat:`, `fix:`, `chore:`, etc.

5. **Don't manually version:** Let release-please handle version bumps and changelogs.

## Validation Skills

This project includes custom validation skills in `.claude/skills/`:

- **`/validate-all`** — Master orchestrator that runs all validations in parallel (tests, Docker, pre-commit hooks) and provides consolidated report. Use before pushing changes.
- **`/validate-tests`** — Run full test suite (server + UI) 3 times to detect flaky tests. Validates 124+ tests pass with 77%+ coverage.
- **`/validate-docker`** — Build Docker image and test runtime in both stdio and HTTP modes. Validates health endpoint and checks logs.
- **`/validate-precommit`** — Test git hooks with clean and broken code to ensure ESLint, Prettier, and TypeScript checks work correctly.

**Recommended workflow before pushing:**

```
/validate-all
```

This spawns 3 parallel validation agents and reports consolidated results in ~2-3 minutes.

## Audit Logging

**Epic #22 - Comprehensive audit trail for security events and administrative actions.**

- **Tamper-proof logging** with SHA256 hash chain integrity
- **Complete event capture**: auth, authz, server management, user management
- **Compliance exports** (CSV, JSON) with filtering and pagination
- **Admin-only access** via RBAC (require `admin` role to view logs)
- **Retention policies** with auto-purge (default: 90 days)

**Key endpoints:**

- `GET /api/audit-logs` — List logs (with filters)
- `GET /api/audit-logs/export?format=csv` — Export logs
- `GET /api/audit-logs/verify` — Verify hash chain integrity
- `GET /api/audit-logs/stats` — Statistics dashboard

**CLI commands:**

- `mcp audit list [--filters]` — View audit logs
- `mcp audit export --format csv|json` — Export logs
- `mcp audit verify` — Check integrity (tamper detection)
- `mcp audit stats` — Statistics summary

**Database:** `audit_logs` table with hash chain integrity (migration 005)

See `docs/AUDIT_LOGGING.md` for complete documentation.

## Production Deployment

**MCP Gateway is production-ready with comprehensive deployment configurations:**

- **Kubernetes**: Full manifests with HA, autoscaling, security hardening (`deploy/kubernetes/`)
  - Deployment with readiness/liveness probes, resource limits, pod disruption budget
  - Service (ClusterIP), Ingress with TLS, ConfigMap, Secret, PVC
  - HorizontalPodAutoscaler (CPU/memory-based scaling)
  - NetworkPolicy for egress/ingress restrictions
  - RBAC (ServiceAccount, Role, RoleBinding)

- **Helm Chart**: Parameterized templates with values schema validation (`deploy/helm/mcp-gateway/`)
  - Sensible defaults for production (replicas, resources, ingress, TLS, database)
  - Support for multiple deployment modes (standalone, clustered, high-availability)
  - Values schema validation (values.schema.json)
  - Post-install notes with access instructions

- **Docker Compose**: Production setup with monitoring stack (`deploy/docker-compose/`)
  - Multi-container: gateway + Caddy reverse proxy + Prometheus + Grafana + Node Exporter
  - Health checks, restart policies, logging drivers
  - Volume persistence, secrets management via Docker secrets
  - Production-ready environment variables

- **Monitoring**: Prometheus ServiceMonitor, PrometheusRule alerts, Grafana dashboard (`deploy/monitoring/`)
  - Pre-configured alerts: high error rate, memory pressure, slow response time
  - Grafana dashboard with request rate, latency percentiles, resource usage
  - Jaeger tracing integration (optional)

**Deployment guides:**

- `docs/PRODUCTION_DEPLOYMENT.md` — Comprehensive guide for Kubernetes (GKE/EKS/AKS), Docker Swarm, Docker Compose, standalone
- `deploy/kubernetes/README.md` — Quick start for Kubernetes
- `deploy/docker-compose/README.md` — Quick start for Docker Compose

**Key features:**

- Horizontal autoscaling (min 3, max 10 replicas)
- High availability (PodDisruptionBudget, anti-affinity rules)
- Database migration strategies (SQLite → PostgreSQL)
- Backup and restore procedures
- Disaster recovery playbook (multi-region failover)
- Scaling best practices (horizontal vs vertical)

## Migration & Compatibility

**MCP Gateway v3.0 includes comprehensive migration tools for seamless upgrades from v2.x:**

### CLI Migration Commands

```bash
# Detect registry version
mcp registry version

# Migrate v2.x to v3.0 (with automatic backup)
mcp migrate from-v2 --registry registry.json

# Preview migration changes (dry-run)
mcp migrate from-v2 --registry registry.json --dry-run

# Migrate database schema
mcp db migrate --to-version 3

# Rollback database (if needed)
mcp db rollback --to-version 2 --force
```

### Backward Compatibility

Enable v2.x compatibility mode for zero-downtime migration:

```bash
export ENABLE_V2_COMPAT=true
npm start
```

**Compatibility layer features**:

- Auto-upgrades v2.0 `mcpServers` → v3.0 `servers` in-memory
- Maps deprecated API paths and tool names
- Logs deprecation warnings for legacy features
- Allows gradual migration without downtime

**See `docs/MIGRATION_V2_TO_V3.md` for comprehensive migration guide.**

## Documentation

- **`README.md`** — User-facing quick start, features, setup modes
- **`CONTRIBUTING.md`** — Release-please workflow, Conventional Commits guide
- **`schema/registry-v2.schema.json`** — Canonical registry schema (v2.0 + v2.1 formats)
- **`docs/API.md`** — Complete REST API reference
- **`docs/AUDIT_LOGGING.md`** — Audit logging guide (Epic #22)
- **`docs/PRODUCTION_DEPLOYMENT.md`** — Production deployment guide (Epic #29)
- **`docs/MIGRATION-v2.1.md`** — Migration guide from v2.0 to v2.1
- **`docs/MIGRATION_V2_TO_V3.md`** — Migration guide from v2.x to v3.0 (comprehensive)
- **`cli/README.md`** — CLI usage guide
- **`.claude/skills/`** — Validation skills for pre-push verification
