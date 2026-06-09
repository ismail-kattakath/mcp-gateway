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
const API_BASE = "http://localhost:3000";
const API_KEY = "your-api-key-here";

const headers = {
  Authorization: `Bearer ${API_KEY}`,
  "Content-Type": "application/json",
};

// List servers
const servers = await fetch(`${API_BASE}/api/servers`, { headers }).then((r) =>
  r.json(),
);

// Create server
const newServer = await fetch(`${API_BASE}/api/servers`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    name: "test-server",
    config: {
      source: "pkg",
      command: "npx",
      args: ["-y", "test-mcp@latest"],
      enabled: true,
    },
  }),
}).then((r) => r.json());

// Start server
await fetch(`${API_BASE}/api/servers/test-server/start`, {
  method: "POST",
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

## Advanced Examples

### Example 1: Complete Server Lifecycle

```bash
# Create server
curl -X POST http://localhost:3000/api/servers \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-server",
    "config": {
      "source": "pkg",
      "command": "npx",
      "args": ["-y", "my-mcp-server@1.0.0"],
      "enabled": true,
      "lifecycle": "on-demand",
      "timeout": 30000
    }
  }'

# Start server
curl -X POST http://localhost:3000/api/servers/my-server/start \
  -H "Authorization: Bearer $API_KEY"

# Call tool
curl -X POST http://localhost:3000/api/tools/call \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "my-server/my_tool",
    "arguments": {"param": "value"}
  }'

# View logs
curl http://localhost:3000/api/logs/my-server?limit=50 \
  -H "Authorization: Bearer $API_KEY"

# Stop server
curl -X POST http://localhost:3000/api/servers/my-server/stop \
  -H "Authorization: Bearer $API_KEY"

# Delete server
curl -X DELETE http://localhost:3000/api/servers/my-server \
  -H "Authorization: Bearer $API_KEY"
```

### Example 2: Bulk Operations

```bash
# Create multiple servers from file
cat servers.json | jq -c '.[]' | while read server; do
  curl -X POST http://localhost:3000/api/servers \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d "$server"
done

# Start all servers
curl http://localhost:3000/api/servers \
  -H "Authorization: Bearer $API_KEY" | \
  jq -r '.servers | keys[]' | \
  xargs -I {} curl -X POST http://localhost:3000/api/servers/{}/start \
    -H "Authorization: Bearer $API_KEY"
```

### Example 3: Health Monitoring Script

```bash
#!/bin/bash
# health-check.sh - Monitor gateway health

API_KEY="your-api-key"
BASE_URL="http://localhost:3000"

while true; do
  # Check health
  health=$(curl -s "${BASE_URL}/health")
  status=$(echo "$health" | jq -r '.status')

  if [ "$status" != "ok" ]; then
    echo "ALERT: Gateway unhealthy: $health"
    # Send alert (e.g., Slack, PagerDuty)
  fi

  # Check server states
  servers=$(curl -s -H "Authorization: Bearer $API_KEY" \
    "${BASE_URL}/api/servers")

  failed=$(echo "$servers" | jq -r '.servers | to_entries[] | select(.value.state == "failed") | .key')

  if [ -n "$failed" ]; then
    echo "ALERT: Failed servers: $failed"
    # Restart failed servers
    for server in $failed; do
      curl -X POST -H "Authorization: Bearer $API_KEY" \
        "${BASE_URL}/api/servers/${server}/restart"
    done
  fi

  sleep 60
done
```

## Error Code Reference

### HTTP Status Codes

| Code | Meaning               | When Returned                      |
| ---- | --------------------- | ---------------------------------- |
| 200  | OK                    | Successful request                 |
| 201  | Created               | Server created successfully        |
| 400  | Bad Request           | Invalid request body or parameters |
| 401  | Unauthorized          | Missing or invalid authentication  |
| 403  | Forbidden             | Authenticated but not authorized   |
| 404  | Not Found             | Server or resource not found       |
| 409  | Conflict              | Server name already exists         |
| 422  | Unprocessable Entity  | Validation error                   |
| 429  | Too Many Requests     | Rate limit exceeded                |
| 500  | Internal Server Error | Server-side error                  |
| 502  | Bad Gateway           | Upstream server error              |
| 503  | Service Unavailable   | Gateway overloaded or restarting   |

### Error Response Format

```json
{
  "error": "Human-readable error message",
  "code": "ERROR_CODE",
  "details": {
    "field": "Additional context"
  },
  "requestId": "uuid-for-tracking"
}
```

### Common Error Codes

| Code               | HTTP | Description              | Solution            |
| ------------------ | ---- | ------------------------ | ------------------- |
| `AUTH_MISSING`     | 401  | No Authorization header  | Add Bearer token    |
| `AUTH_INVALID`     | 401  | Invalid or expired token | Get new token       |
| `AUTH_IP_BLOCKED`  | 403  | IP not in allowlist      | Add IP to allowlist |
| `SERVER_NOT_FOUND` | 404  | Server doesn't exist     | Check server name   |
| `SERVER_DISABLED`  | 403  | Server is disabled       | Enable server       |
| `SERVER_FAILED`    | 500  | Server crashed           | Check logs, restart |
| `SERVER_TIMEOUT`   | 500  | Server start timeout     | Increase timeout    |
| `SERVER_EXISTS`    | 409  | Name already taken       | Use different name  |
| `VALIDATION_ERROR` | 422  | Invalid config           | Check schema        |
| `RATE_LIMIT`       | 429  | Too many requests        | Wait and retry      |
| `TOOL_NOT_FOUND`   | 404  | Tool doesn't exist       | Check tool name     |
| `TOOL_ERROR`       | 500  | Tool execution failed    | Check tool args     |

## Rate Limiting Details

### Default Limits (v3.0)

| Endpoint Pattern       | Limit    | Window   | Scope  |
| ---------------------- | -------- | -------- | ------ |
| `/auth/*`              | 10       | 1 minute | IP     |
| `/api/servers` (write) | 100      | 1 hour   | User   |
| `/api/tools/call`      | 1000     | 1 hour   | Server |
| `/api/logs`            | 100      | 1 minute | User   |
| All others             | No limit | -        | -      |

### Rate Limit Headers

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640000000
Retry-After: 3600
```

### Rate Limit Response

```json
{
  "error": "Rate limit exceeded",
  "code": "RATE_LIMIT",
  "retryAfter": 3600,
  "limit": 100,
  "remaining": 0,
  "resetAt": "2024-01-01T13:00:00Z"
}
```

### Handling Rate Limits

```javascript
async function callAPIWithRetry(url, options) {
  const response = await fetch(url, options);

  if (response.status === 429) {
    const retryAfter = response.headers.get("Retry-After");
    await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
    return callAPIWithRetry(url, options);
  }

  return response;
}
```

## Authentication Flows

### Flow 1: API Key (Default)

```
1. Gateway starts → Generates API key → Stores in keychain
2. Admin retrieves key: PRINT_API_KEY=true npm start
3. Client includes in requests: Authorization: Bearer <key>
4. Gateway validates key → Grants access
```

**Example:**

```bash
# Get key
API_KEY=$(PRINT_API_KEY=true npm start | grep "API Key:" | cut -d' ' -f3)

# Use key
curl -H "Authorization: Bearer $API_KEY" http://localhost:3000/api/servers
```

### Flow 2: JWT Tokens

```
1. User logs in with credentials → Gateway validates
2. Gateway issues JWT access token (15min) + refresh token (7 days)
3. Client includes access token in requests
4. When access token expires, use refresh token to get new access token
```

**Example:**

```bash
# Login
LOGIN_RESPONSE=$(curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "alice", "password": "password"}')

ACCESS_TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.accessToken')
REFRESH_TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.refreshToken')

# Use access token
curl -H "Authorization: Bearer $ACCESS_TOKEN" \
  http://localhost:3000/api/servers

# Refresh when expired
NEW_TOKENS=$(curl -X POST http://localhost:3000/auth/refresh \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\": \"$REFRESH_TOKEN\"}")
```

### Flow 3: OAuth 2.0

```
1. Client redirects to: /auth/github
2. Gateway redirects to GitHub authorization
3. User approves on GitHub
4. GitHub redirects to: /auth/github/callback?code=...
5. Gateway exchanges code for GitHub access token
6. Gateway creates/logs in user
7. Gateway issues JWT tokens to client
```

**Example:**

```html
<!-- Login button -->
<a href="http://localhost:3000/auth/github">Login with GitHub</a>

<!-- Callback handler -->
<script>
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");
  if (token) {
    localStorage.setItem("accessToken", token);
    window.location.href = "/dashboard";
  }
</script>
```

### Flow 4: SAML SSO

```
1. Client accesses: /auth/saml
2. Gateway generates SAML request
3. Gateway redirects to IDP
4. User authenticates at IDP
5. IDP redirects to: /auth/saml/callback with SAML assertion
6. Gateway validates assertion
7. Gateway creates/logs in user
8. Gateway issues JWT tokens
```

### Flow 5: mTLS

```
1. Client connects with TLS client certificate
2. Gateway validates certificate against CA
3. Gateway extracts subject DN from certificate
4. Gateway looks up or creates user
5. Gateway proceeds with request
```

**Example nginx config:**

```nginx
server {
  listen 443 ssl;

  ssl_client_certificate /etc/ssl/ca.crt;
  ssl_verify_client on;

  location / {
    proxy_set_header X-Client-Cert $ssl_client_cert;
    proxy_set_header X-Client-DN $ssl_client_s_dn;
    proxy_pass http://gateway:3000;
  }
}
```

## Pagination

### List Endpoints with Pagination

```bash
# First page
curl http://localhost:3000/api/servers?limit=10&offset=0 \
  -H "Authorization: Bearer $API_KEY"

# Next page
curl http://localhost:3000/api/servers?limit=10&offset=10 \
  -H "Authorization: Bearer $API_KEY"
```

**Response:**

```json
{
  "servers": { ... },
  "pagination": {
    "limit": 10,
    "offset": 0,
    "total": 45,
    "hasMore": true
  }
}
```

## Filtering and Sorting

### Filter by Server State

```bash
curl "http://localhost:3000/api/servers?state=running" \
  -H "Authorization: Bearer $API_KEY"
```

### Filter by Lifecycle

```bash
curl "http://localhost:3000/api/servers?lifecycle=persistent" \
  -H "Authorization: Bearer $API_KEY"
```

### Sort Results

```bash
curl "http://localhost:3000/api/servers?sort=name&order=asc" \
  -H "Authorization: Bearer $API_KEY"
```

## Webhooks (v3.1+)

### Configure Webhooks

```json
{
  "webhooks": {
    "enabled": true,
    "endpoints": [
      {
        "url": "https://your-app.com/webhooks/mcp",
        "events": ["server.started", "server.failed", "tool.called"],
        "secret": "${WEBHOOK_SECRET}"
      }
    ]
  }
}
```

### Webhook Payload

```json
{
  "event": "server.failed",
  "timestamp": "2024-01-01T12:00:00Z",
  "data": {
    "server": "my-server",
    "error": "Server exited with code 1",
    "retryCount": 3
  },
  "signature": "sha256=..."
}
```

### Verify Webhook Signature

```javascript
const crypto = require("crypto");

function verifyWebhook(payload, signature, secret) {
  const hash = crypto
    .createHmac("sha256", secret)
    .update(JSON.stringify(payload))
    .digest("hex");

  return `sha256=${hash}` === signature;
}
```

## API Versioning

### Current Version: v1

All endpoints are prefixed with `/api/` (implied v1).

### Future Versions

When breaking changes are introduced, new version will be available at `/api/v2/`.

**Version negotiation via header:**

```bash
curl -H "Accept: application/vnd.mcp-gateway.v2+json" \
  http://localhost:3000/api/servers
```

---

## SDK Examples

### Node.js SDK (Future)

```javascript
const { MCPGatewayClient } = require("@mcp-gateway/client");

const client = new MCPGatewayClient({
  baseURL: "http://localhost:3000",
  apiKey: process.env.API_KEY,
});

// List servers
const servers = await client.servers.list();

// Create server
await client.servers.create({
  name: "my-server",
  config: {
    source: "pkg",
    command: "npx",
    args: ["-y", "my-mcp-server"],
  },
});

// Call tool
const result = await client.tools.call("my-server/my_tool", {
  param: "value",
});
```

### Python SDK (Future)

```python
from mcp_gateway import MCPGatewayClient

client = MCPGatewayClient(
    base_url='http://localhost:3000',
    api_key=os.environ['API_KEY']
)

# List servers
servers = client.servers.list()

# Create server
client.servers.create(
    name='my-server',
    config={
        'source': 'pkg',
        'command': 'npx',
        'args': ['-y', 'my-mcp-server']
    }
)

# Call tool
result = client.tools.call('my-server/my_tool', {
    'param': 'value'
})
```

---

## GraphQL API (Future)

```graphql
# Query
query {
  servers {
    name
    state
    uptime
    tools {
      name
      description
    }
  }
}

# Mutation
mutation {
  createServer(
    input: {
      name: "my-server"
      config: { source: PKG, command: "npx", args: ["-y", "my-mcp-server"] }
    }
  ) {
    server {
      name
      state
    }
  }
}

# Subscription
subscription {
  serverStateChanged {
    name
    oldState
    newState
  }
}
```

---

For complete API reference, see the interactive Swagger UI at http://localhost:3000/docs
