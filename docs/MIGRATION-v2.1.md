# Migration Guide: v2.0 to v2.1

## Overview

MCP Gateway v2.1 introduces a CLI tool and simplifies registry configuration by:

1. **Moving auth settings to separate config file** (`.mcp-gateway.json`)
2. **Making gateway object optional** in `registry.json`
3. **Hardcoding sensible defaults** for storage and logging
4. **Adding CLI for server and auth management**

These changes are **fully backward compatible** — existing `registry.json` files continue to work unchanged.

---

## What Changed

### 1. Auth Settings Moved to `.mcp-gateway.json`

**Before (v2.0):**
```json
{
  "version": "2.0",
  "servers": { ... },
  "gateway": {
    "disableAuth": true,
    "allowedIPs": ["192.168.1.0/24"],
    "server": { ... },
    "storage": { ... },
    "logging": { ... }
  }
}
```

**After (v2.1):**

**`registry.json`:**
```json
{
  "version": "2.0",
  "servers": { ... },
  "gateway": {
    "port": 3000,
    "host": "0.0.0.0",
    "transport": "sse",
    "cors": {
      "enabled": true,
      "origins": ["*"],
      "credentials": true
    }
  }
}
```

**`.mcp-gateway.json`** (new file in same directory as `registry.json`):
```json
{
  "disableAuth": false,
  "allowedIPs": ["192.168.1.0/24"]
}
```

### 2. Minimal Registry (v2.1+)

You can now omit the `gateway` object entirely:

```json
{
  "version": "2.0",
  "servers": {
    "obs-mcp": {
      "source": "pkg",
      "command": "npx",
      "args": ["-y", "obs-mcp@latest"],
      "enabled": true
    }
  }
}
```

Defaults applied:
- `port`: 3000
- `host`: "0.0.0.0"
- `transport`: "sse"
- `cors.enabled`: true
- `cors.origins`: ["*"]
- `cors.credentials`: true
- `storage.repos`: `~/.mcp/repos`
- `storage.cache`: `~/.mcp/cache`
- `storage.logs`: `~/.mcp/logs`
- `logging.level`: "info" (or `LOG_LEVEL` env var)
- `logging.format`: "json"
- `logging.outputs`: ["console", "file"]

---

## Migration Steps

### Option 1: Keep Existing Format (No Changes Needed)

Your v2.0 `registry.json` continues to work. No migration required.

**Note:** `disableAuth` and `allowedIPs` in `gateway` object are deprecated but still functional. The CLI auth commands will create `.mcp-gateway.json` and take precedence.

### Option 2: Migrate to Simplified Format

**Step 1: Create `.mcp-gateway.json`**

If you have auth settings in `registry.json`, extract them:

```bash
cd /path/to/mcp-gateway
cat > .mcp-gateway.json <<EOF
{
  "disableAuth": false,
  "allowedIPs": []
}
EOF
```

**Step 2: Simplify `registry.json`**

Remove `disableAuth`, `allowedIPs`, `storage`, and `logging` from gateway object:

```json
{
  "version": "2.0",
  "servers": { ... },
  "gateway": {
    "port": 3000,
    "host": "0.0.0.0",
    "transport": "sse"
  }
}
```

**Step 3: (Optional) Remove gateway object entirely**

If you're happy with defaults, you can remove the entire `gateway` object:

```json
{
  "version": "2.0",
  "servers": { ... }
}
```

**Step 4: Restart Gateway**

```bash
cd server
npm start
```

---

## CLI Tool

v2.1 introduces the `mcp` CLI for managing servers and auth settings.

### Installation

```bash
cd cli
npm install
npm run build
npm link  # Optional: make 'mcp' available globally
```

### Usage

**Server Management:**
```bash
mcp servers list
mcp servers create my-server --source pkg --command npx --args "-y" "my-mcp@latest"
mcp servers start my-server
mcp servers stop my-server
mcp logs my-server --tail 100
```

**Auth Management:**
```bash
mcp auth token                                     # Display API key
mcp auth enable --registry /path/to/registry.json  # Enable auth
mcp auth disable --registry /path/to/registry.json # Disable auth (insecure)
mcp auth allow list --registry /path/to/registry.json
mcp auth allow add 192.168.1.100 --registry /path/to/registry.json
```

**Health Check:**
```bash
mcp health
```

---

## Breaking Changes

**None.** v2.1 is fully backward compatible with v2.0.

**Deprecations:**
- `gateway.disableAuth` — Use `.mcp-gateway.json` and CLI commands instead
- `gateway.allowedIPs` — Use `.mcp-gateway.json` and CLI commands instead
- `gateway.storage` — Now hardcoded with sensible defaults
- `gateway.logging` — Now hardcoded (use `--debug` flag for verbose logging)

These fields still work in v2.1 but will be removed in v3.0.

---

## Environment Variables

**New in v2.1:**

- `--debug` flag — Enable debug logging (alternative to `LOG_LEVEL=debug`)
- `DISABLE_STDIO=true` — Force HTTP mode (useful when stdin is a pipe)

**Unchanged:**

- `GATEWAY_DISABLE_AUTH=true` — Override auth config file (dev only)
- `GATEWAY_PORT` — Override port
- `PRINT_API_KEY=true` — Print API key and exit
- `ROTATE_API_KEY=true` — Generate new API key and exit

---

## REST API

v2.1 adds a comprehensive REST API for server management. See `docs/API.md` for full documentation.

**New endpoints:**
- `GET /api/servers` — List all servers
- `POST /api/servers` — Create new server
- `PUT /api/servers/:name` — Update server config
- `DELETE /api/servers/:name` — Delete server
- `POST /api/servers/:name/(start|stop|restart|enable|disable)` — Control server
- `GET /api/logs[/:name]` — Get server logs

**Interactive docs:** http://localhost:3000/docs (Swagger UI)

---

## Docker

**No changes required.** Existing Docker deployments continue to work.

**To use CLI inside container:**
```bash
docker exec -it mcp-gateway sh
cd /app/cli
node dist/index.js --no-auth servers list
```

---

## Troubleshooting

### "Auth is disabled but I didn't change anything"

Check for `.mcp-gateway.json` in your project root. The CLI may have created it.

```bash
cat .mcp-gateway.json
# If you see {"disableAuth": true}, fix it:
mcp auth enable --registry /path/to/registry.json
```

### "CLI can't connect to gateway"

Ensure gateway is running:
```bash
mcp health
# If it fails, start the gateway:
cd server && npm start
```

### "No API key found in keychain"

The gateway generates the key on first start:
```bash
cd server && npm start
# Then check:
mcp auth token
```

---

## Support

- **Issues:** https://github.com/ismail-kattakath/mcp-gateway/issues
- **Documentation:** `/docs` endpoint (Swagger UI)
- **API Reference:** `docs/API.md`
