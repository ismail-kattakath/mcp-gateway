# MCP Gateway REST API

**Base URL:** `http://localhost:3000`

The MCP Gateway provides a comprehensive REST API for managing MCP servers. All endpoints require Bearer token authentication (except `/health` and `/docs`), using the auto-generated API key stored in your system keychain.

## Authentication

**Method:** Bearer Token

```bash
# Retrieve your API key
PRINT_API_KEY=true npm start

# Use in requests
curl -H "Authorization: Bearer YOUR_API_KEY" http://localhost:3000/api/servers
```

**Disable auth (development only):**
```bash
GATEWAY_DISABLE_AUTH=true npm start
```

---

## Interactive Documentation

**Swagger UI:** [http://localhost:3000/docs](http://localhost:3000/docs)

**OpenAPI Spec:** [http://localhost:3000/docs/openapi.json](http://localhost:3000/docs/openapi.json)

The `/docs` endpoint provides an interactive API explorer powered by Swagger UI, where you can:
- View all available endpoints
- See request/response schemas
- Test API calls directly from the browser
- Authenticate with your API key

---

## Endpoints

### Server Management

#### List All Servers
```http
GET /api/servers
```

**Response:**
```json
{
  "servers": {
    "obs-mcp": {
      "name": "obs-mcp",
      "state": "running",
      "pid": 12345,
      "uptime": 60000,
      "retryCount": 0,
      "lastError": null
    }
  },
  "count": 1
}
```

---

#### Get Server Details
```http
GET /api/servers/{serverName}
```

**Response:**
```json
{
  "name": "obs-mcp",
  "config": {
    "source": "pkg",
    "command": "npx",
    "args": ["-y", "obs-mcp@latest"],
    "enabled": true,
    "lifecycle": "persistent"
  },
  "status": {
    "name": "obs-mcp",
    "state": "running",
    "pid": 12345,
    "uptime": 60000
  }
}
```

---

#### Create New Server
```http
POST /api/servers
Content-Type: application/json

{
  "name": "my-new-server",
  "config": {
    "source": "pkg",
    "command": "npx",
    "args": ["-y", "my-mcp-server@latest"],
    "enabled": true,
    "lifecycle": "on-demand"
  }
}
```

**Response:** `201 Created`
```json
{
  "success": true,
  "name": "my-new-server",
  "status": { ... }
}
```

**Validation:**
- Server name must be lowercase alphanumeric + hyphens
- Config must include `source` field
- Name must be unique

---

#### Update Server Configuration
```http
PUT /api/servers/{serverName}
Content-Type: application/json

{
  "source": "pkg",
  "command": "npx",
  "args": ["-y", "updated-mcp@2.0.0"],
  "enabled": true
}
```

**Response:**
```json
{
  "success": true,
  "name": "my-server",
  "restarted": true,
  "status": { ... }
}
```

**Behavior:**
- If server is running, it will be stopped and restarted with new config
- If server is stopped, config is updated but server remains stopped
- Registry is updated in-memory (persists until restart)

---

#### Delete Server
```http
DELETE /api/servers/{serverName}
```

**Response:**
```json
{
  "success": true,
  "name": "my-server"
}
```

**Behavior:**
- Stops server if running
- Removes from registry (in-memory)

---

### Server Control

#### Start Server
```http
POST /api/servers/{serverName}/start
```

**Response:**
```json
{
  "success": true,
  "serverName": "obs-mcp",
  "status": { ... }
}
```

**Requirements:**
- Server must exist in registry
- Server must be enabled (`enabled: true`)

---

#### Stop Server
```http
POST /api/servers/{serverName}/stop
```

**Response:**
```json
{
  "success": true,
  "serverName": "obs-mcp",
  "status": { ... }
}
```

---

#### Restart Server
```http
POST /api/servers/{serverName}/restart
```

**Equivalent to:** `stop` → `start`

**Response:**
```json
{
  "success": true,
  "serverName": "obs-mcp",
  "status": { ... }
}
```

---

#### Enable Server
```http
POST /api/servers/{serverName}/enable
```

Sets `enabled: true` in config. Does **not** auto-start the server.

**Response:**
```json
{
  "success": true,
  "serverName": "obs-mcp",
  "enabled": true
}
```

---

#### Disable Server
```http
POST /api/servers/{serverName}/disable
```

Sets `enabled: false` and stops the server.

**Response:**
```json
{
  "success": true,
  "serverName": "obs-mcp",
  "enabled": false
}
```

---

### Logs

#### Get Logs (All Servers)
```http
GET /api/logs?limit=100
```

**Query Parameters:**
- `limit` (optional): Max entries per server (default: 100, max: 1000)

**Response:**
```json
{
  "servers": {
    "obs-mcp": [
      {
        "timestamp": "2024-01-01T12:00:00.000Z",
        "level": "info",
        "stream": "stdout",
        "message": "Server started"
      }
    ]
  },
  "count": 1
}
```

---

#### Get Logs (Single Server)
```http
GET /api/logs/{serverName}?limit=200
```

**Response:**
```json
{
  "serverName": "obs-mcp",
  "logs": [ ... ],
  "count": 150
}
```

---

### System

#### Health Check
```http
GET /health
```

**Authentication:** None (public endpoint)

**Response:**
```json
{
  "status": "ok",
  "uptime": 3600,
  "version": "2.0",
  "servers": {
    "total": 5,
    "enabled": 4,
    "running": 3,
    "list": ["obs-mcp", "kapture", "filesystem"]
  },
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

---

#### Gateway Status
```http
GET /api/status
```

**Response:**
```json
{
  "servers": { ... },
  "gateway": {
    "uptime": 3600,
    "version": "2.0",
    "pid": 12345,
    "memory": { ... },
    "nodeVersion": "v20.11.0",
    "authEnabled": true
  },
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

---

#### Gateway Config
```http
GET /api/config
```

**Response:**
```json
{
  "version": "2.0",
  "servers": { ... },
  "gateway": { ... }
}
```

---

#### Version Info
```http
GET /api/version
```

**Response:**
```json
{
  "version": "2.0.1",
  "revision": "abc123",
  "created": "2024-01-01T00:00:00.000Z",
  "source": "https://github.com/ismail-kattakath/mcp-gateway",
  "nodeVersion": "v20.11.0",
  "platform": "darwin",
  "arch": "arm64"
}
```

---

## Error Responses

### 400 Bad Request
```json
{
  "error": "Invalid server name: must be lowercase alphanumeric + hyphens"
}
```

### 401 Unauthorized
```json
{
  "error": "Unauthorized"
}
```

**Header:** `WWW-Authenticate: Bearer realm="mcp-gateway"`

### 403 Forbidden
```json
{
  "error": "Forbidden"
}
```

Returned when client IP is not in allowlist (if configured).

### 404 Not Found
```json
{
  "error": "Server not found: unknown-server"
}
```

### 409 Conflict
```json
{
  "error": "Server already exists: my-server"
}
```

### 500 Internal Server Error
```json
{
  "error": "Failed to start server: timeout"
}
```

---

## Rate Limiting

**Current:** No rate limiting (planned for future releases)

**Recommendation:** Use a reverse proxy (nginx, Caddy) for production deployments with rate limiting enabled.

---

## CORS

CORS is **enabled by default** with credentials support.

**Default origins:** `*` (all origins)

**Configure in `registry.json`:**
```json
{
  "gateway": {
    "server": {
      "cors": {
        "enabled": true,
        "origins": ["https://my-app.com", "http://localhost:3000"],
        "credentials": true
      }
    }
  }
}
```

---

## CLI Usage Examples

### Using cURL

```bash
# Set API key
export API_KEY="your-api-key-here"

# List servers
curl -H "Authorization: Bearer $API_KEY" http://localhost:3000/api/servers

# Create server
curl -X POST \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "test-server",
    "config": {
      "source": "pkg",
      "command": "npx",
      "args": ["-y", "test-mcp@latest"],
      "enabled": true
    }
  }' \
  http://localhost:3000/api/servers

# Start server
curl -X POST \
  -H "Authorization: Bearer $API_KEY" \
  http://localhost:3000/api/servers/test-server/start

# Get logs
curl -H "Authorization: Bearer $API_KEY" \
  http://localhost:3000/api/logs/test-server?limit=50

# Stop server
curl -X POST \
  -H "Authorization: Bearer $API_KEY" \
  http://localhost:3000/api/servers/test-server/stop

# Delete server
curl -X DELETE \
  -H "Authorization: Bearer $API_KEY" \
  http://localhost:3000/api/servers/test-server
```

### Using HTTPie

```bash
# List servers
http GET localhost:3000/api/servers Authorization:"Bearer $API_KEY"

# Create server
http POST localhost:3000/api/servers \
  Authorization:"Bearer $API_KEY" \
  name=test-server \
  config:='{"source":"pkg","command":"npx","args":["-y","test-mcp@latest"],"enabled":true}'

# Start server
http POST localhost:3000/api/servers/test-server/start \
  Authorization:"Bearer $API_KEY"
```

### Using JavaScript (fetch)

```javascript
const API_BASE = 'http://localhost:3000';
const API_KEY = 'your-api-key-here';

const headers = {
  'Authorization': `Bearer ${API_KEY}`,
  'Content-Type': 'application/json',
};

// List servers
const servers = await fetch(`${API_BASE}/api/servers`, { headers })
  .then(r => r.json());

// Create server
const newServer = await fetch(`${API_BASE}/api/servers`, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    name: 'test-server',
    config: {
      source: 'pkg',
      command: 'npx',
      args: ['-y', 'test-mcp@latest'],
      enabled: true,
    },
  }),
}).then(r => r.json());

// Start server
await fetch(`${API_BASE}/api/servers/test-server/start`, {
  method: 'POST',
  headers,
});
```

---

## Future CLI Tool

A dedicated CLI tool (`mcp-gateway-cli`) is planned for easier command-line management:

```bash
# List servers
mcp servers list

# Create server
mcp servers create obs-mcp --source pkg --command "npx -y obs-mcp@latest"

# Start server
mcp servers start obs-mcp

# View logs
mcp logs obs-mcp --tail 100
```

**Status:** Planned for v3.0 (tracked in GitHub Issues)

---

## OpenAPI Specification

**Full spec:** [http://localhost:3000/docs/openapi.json](http://localhost:3000/docs/openapi.json)

**Version:** OpenAPI 3.0.0

**Schema generation:** Auto-generated from JSDoc annotations in `server/src/api/routes.ts`

**To update spec:**
1. Edit JSDoc comments in routes file
2. Rebuild: `npm run build`
3. Spec regenerates automatically on server start

---

## Security Best Practices

1. **Never disable auth in production**
   - `disableAuth: true` is for local development only
   - Use API key authentication for all deployments

2. **Use HTTPS in production**
   - Deploy behind a reverse proxy (nginx, Caddy, Traefik)
   - Terminate TLS at the proxy level

3. **Restrict CORS origins**
   - Don't use `origins: "*"` in production
   - Whitelist specific domains

4. **Enable IP allowlist**
   - Use `gateway.allowedIPs` for network-level security
   - Supports CIDR notation

5. **Rotate API keys regularly**
   - `ROTATE_API_KEY=true npm start`
   - Update clients with new key

6. **Monitor logs**
   - Check `/api/logs` regularly
   - Set up log aggregation (ELK, Datadog, etc.)

---

## Troubleshooting

### "Unauthorized" on every request

**Cause:** Missing or invalid API key

**Fix:**
```bash
# Get your API key
PRINT_API_KEY=true npm start

# Copy the printed key and use in Authorization header
curl -H "Authorization: Bearer YOUR_KEY" http://localhost:3000/api/servers
```

---

### "Server not found" but server exists

**Cause:** Server might be in registry but not loaded

**Fix:**
```bash
# Restart gateway to reload registry
npm start
```

---

### CORS errors in browser

**Cause:** Origin not in allowlist

**Fix:** Add your origin to `gateway.server.cors.origins` in `registry.json`

---

### Rate limiting (future)

**Current:** No rate limiting implemented

**Workaround:** Use reverse proxy (nginx limit_req_zone)

---

## Support

- **Documentation:** [https://github.com/ismail-kattakath/mcp-gateway](https://github.com/ismail-kattakath/mcp-gateway)
- **Issues:** [https://github.com/ismail-kattakath/mcp-gateway/issues](https://github.com/ismail-kattakath/mcp-gateway/issues)
- **API Reference:** `/docs` (interactive Swagger UI)
