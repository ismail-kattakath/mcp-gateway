# Configuration Guide

## Overview

MCP Gateway v2.1+ uses a **simplified configuration approach**:

1. **Server definitions** → `registry.json` (minimal, just servers)
2. **Auth settings** → `.mcp-gateway.json` (managed via CLI)
3. **Gateway settings** → Environment variables or CLI flags

This eliminates nested config objects and makes settings manageable via CLI.

---

## Server Configuration (`registry.json`)

**Minimal format:**
```json
{
  "version": "2.0",
  "servers": {
    "obs-mcp": {
      "source": "pkg",
      "command": "npx",
      "args": ["-y", "obs-mcp@latest"]
    }
  }
}
```

**No `gateway` object needed!** Use environment variables or CLI instead.

See [REGISTRY-FORMAT.md](../REGISTRY-FORMAT.md) for server configuration details.

---

## Auth Configuration (`.mcp-gateway.json`)

**Managed exclusively via CLI:**

```bash
# Enable/disable authentication
mcp auth enable --registry /path/to/registry.json
mcp auth disable --registry /path/to/registry.json

# Manage IP allowlist
mcp auth allow list --registry /path/to/registry.json
mcp auth allow add 192.168.1.100 --registry /path/to/registry.json
mcp auth allow remove 192.168.1.100 --registry /path/to/registry.json
mcp auth allow clear --registry /path/to/registry.json

# Display API key
mcp auth token
```

**File format** (`.mcp-gateway.json`):
```json
{
  "disableAuth": false,
  "allowedIPs": ["192.168.1.0/24"]
}
```

**Location:** Same directory as `registry.json`

---

## Gateway Settings (Environment Variables)

**All gateway settings via environment variables:**

### Server Settings

```bash
# Port (default: 3000)
export GATEWAY_PORT=3000

# Host (default: 0.0.0.0)
export GATEWAY_HOST=0.0.0.0

# Transport: sse, http, or both (default: sse)
export GATEWAY_TRANSPORT=sse
```

### CORS Settings

```bash
# CORS origins (comma-separated, default: *)
export CORS_ORIGINS="http://localhost:5173,http://localhost:3000"

# CORS credentials (default: true)
export CORS_CREDENTIALS=true

# CORS enabled (default: true)
export CORS_ENABLED=true
```

### Logging

```bash
# Log level: debug, info, warn, error (default: info)
export LOG_LEVEL=info

# Or use --debug flag:
npm start -- --debug
```

### Development

```bash
# Force HTTP mode (disable stdio detection)
export DISABLE_STDIO=true

# Override auth config (dev only)
export GATEWAY_DISABLE_AUTH=true
```

---

## Using .env File

**Create `.env` file** in project root:

```bash
# Copy example
cp .env.example .env

# Edit values
vim .env
```

The gateway automatically loads `.env` via `dotenv`.

**Example `.env`:**
```bash
GATEWAY_PORT=3000
GATEWAY_HOST=0.0.0.0
LOG_LEVEL=info
CORS_ORIGINS=http://localhost:5173
OBS_WEBSOCKET_PASSWORD=secret
GITHUB_TOKEN=ghp_...
```

---

## CLI Management

### Server Management

```bash
# List servers
mcp servers list

# Create server
mcp servers create my-server \
  --source pkg \
  --command npx \
  --args "-y" "my-mcp@latest"

# Control lifecycle
mcp servers start|stop|restart my-server

# Enable/disable
mcp servers enable|disable my-server

# Delete
mcp servers delete my-server --force
```

### Auth Management

```bash
# Display API key
mcp auth token

# Enable authentication
mcp auth enable --registry ./registry.json

# Manage IP allowlist
mcp auth allow add 192.168.1.100 --registry ./registry.json
```

### Logs

```bash
# View logs
mcp logs my-server --tail 100

# All servers
mcp logs
```

### Health Check

```bash
mcp health
```

---

## Configuration Priority

**Settings are applied in this order (highest priority first):**

1. **Command-line flags** (`--debug`)
2. **Environment variables** (`GATEWAY_PORT`, `LOG_LEVEL`)
3. **Auth config file** (`.mcp-gateway.json`)
4. **Registry file** (`registry.json` - servers only)
5. **Hardcoded defaults**

---

## Defaults

**Gateway defaults (when not specified):**
- `port`: 3000
- `host`: "0.0.0.0"
- `transport`: "sse"
- `cors.enabled`: true
- `cors.origins`: ["*"]
- `cors.credentials`: true

**Storage defaults (hardcoded):**
- `repos`: `~/.mcp/repos`
- `cache`: `~/.mcp/cache`
- `logs`: `~/.mcp/logs`

**Logging defaults:**
- `level`: "info"
- `format`: "json"
- `outputs`: ["console", "file"]

---

## Migration from v2.0

**Old format (v2.0):**
```json
{
  "gateway": {
    "server": {
      "port": 3000,
      "host": "0.0.0.0",
      "transport": "sse"
    },
    "storage": {...},
    "logging": {...},
    "disableAuth": true
  }
}
```

**New format (v2.1):**

**registry.json:**
```json
{
  "servers": {...}
}
```

**.env:**
```bash
GATEWAY_PORT=3000
GATEWAY_HOST=0.0.0.0
GATEWAY_TRANSPORT=sse
```

**.mcp-gateway.json:**
```json
{
  "disableAuth": true
}
```

---

## Docker Configuration

**Environment variables:**
```bash
docker run -i --rm \
  -e GATEWAY_PORT=3000 \
  -e LOG_LEVEL=debug \
  -e CORS_ORIGINS="http://localhost:5173" \
  -v $(pwd)/registry.json:/app/registry.json:ro \
  -v $(pwd)/.mcp-gateway.json:/app/.mcp-gateway.json:ro \
  ghcr.io/ismail-kattakath/mcp-gateway:latest
```

**Or mount .env file:**
```bash
docker run -i --rm \
  -v $(pwd)/.env:/app/.env:ro \
  -v $(pwd)/registry.json:/app/registry.json:ro \
  ghcr.io/ismail-kattakath/mcp-gateway:latest
```

---

## Examples

### Development Setup

**.env:**
```bash
LOG_LEVEL=debug
DISABLE_STDIO=true
```

**.mcp-gateway.json:**
```bash
{
  "disableAuth": true
}
```

**registry.json:**
```json
{
  "version": "2.0",
  "servers": {
    "test-server": {
      "source": "pkg",
      "command": "npx",
      "args": ["-y", "test-mcp@latest"]
    }
  }
}
```

### Production Setup

**.env:**
```bash
GATEWAY_HOST=127.0.0.1
LOG_LEVEL=info
CORS_ORIGINS=https://myapp.com
```

**.mcp-gateway.json:**
```json
{
  "disableAuth": false,
  "allowedIPs": ["10.0.0.0/8"]
}
```

---

## Troubleshooting

### "Gateway not using my .env file"

Make sure `.env` is in the same directory where you run `npm start`.

### "Can't change port"

Set `GATEWAY_PORT` environment variable:
```bash
GATEWAY_PORT=4000 npm start
```

### "Auth settings not applying"

Check `.mcp-gateway.json` location (must be in same dir as `registry.json`).

Use CLI to verify:
```bash
mcp auth allow list --registry ./registry.json
```

---

## See Also

- [REGISTRY-FORMAT.md](../REGISTRY-FORMAT.md) — Server configuration format
- [MIGRATION-v2.1.md](MIGRATION-v2.1.md) — Migration guide from v2.0
- [API.md](API.md) — REST API documentation
- [../cli/README.md](../cli/README.md) — CLI usage guide
