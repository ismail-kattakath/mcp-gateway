# MCP Gateway Server

The backend Node.js server for the MCP Gateway Platform.

## Features

- **Express + SSE Server**: HTTP server with Server-Sent Events for MCP protocol communication
- **Registry Management**: Load, validate, and hot-reload registry.json with environment variable resolution
- **Backend Manager**: Manage lifecycle of MCP backend processes (on-demand and persistent)
- **NPX Backend Spawner**: Spawn and manage NPX-based MCP servers
- **Winston Logging**: Structured logging with console and file transports
- **API Endpoints**: Status, config, logs, and backend control endpoints

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment template
cp ../.env.example ../.env
# Edit .env with your configuration

# Start development server (with hot reload)
npm run dev

# Start production server
npm start
```

The server will start on `http://localhost:3000` (or the port specified in `.env` or `registry.json`).

## Available Endpoints

### SSE Endpoint
- **GET /sse** - Server-Sent Events stream for MCP protocol
  - Receives connection events, backend logs, and keep-alive pings
  - Used by MCP clients to connect to the gateway

### Health & Status
- **GET /health** - Health check endpoint
- **GET /api/status** - Detailed status of all backends and gateway
- **GET /api/config** - Current registry configuration

### Logs
- **GET /api/logs/:backendId?** - Get logs for specific backend or all backends
  - Query param: `limit` (default: 100)

### Backend Control
- **POST /api/backends/:backendId/start** - Start a backend
- **POST /api/backends/:backendId/stop** - Stop a backend

## Architecture

```
server/src/
├── index.js                    # Main entry point, Express server setup
├── logging/
│   └── logger.js              # Winston logger configuration
├── mcp/
│   ├── registry.js            # Registry loader with hot-reload
│   └── backends/
│       ├── index.js           # Backend manager (lifecycle, routing)
│       └── npx.js             # NPX backend spawner
└── validation/
    ├── index.js               # Validation exports
    └── registry-validator.js  # Registry schema validation
```

## Configuration

The server is configured via:

1. **Environment variables** (`.env` file)
2. **Registry configuration** (`registry.json`)

### Environment Variables

```bash
# Server
GATEWAY_PORT=3000
GATEWAY_HOST=0.0.0.0
LOG_LEVEL=info

# Storage paths
MCP_REPOS_DIR=${HOME}/.mcp/repos
MCP_CACHE_DIR=${HOME}/.mcp/cache
MCP_LOGS_DIR=${HOME}/.mcp/logs

# Backend secrets (referenced in registry.json)
OBS_WEBSOCKET_PASSWORD=your-password
GITHUB_ACCESS_TOKEN=your-token
```

### Registry Configuration

The `registry.json` file defines all backend MCP servers. See the main project README for full schema documentation.

## Backend Lifecycle

### On-Demand Backends
- Spawned when first tool call arrives
- Kept alive for 5 minutes after last use
- Process killed if idle too long
- Good for: infrequently used tools, resource-heavy backends

Example:
```json
{
  "obs": {
    "type": "npx",
    "lifecycle": "on-demand",
    "enabled": true
  }
}
```

### Persistent Backends
- Spawned at gateway startup
- Restarted on crash
- Kept alive until gateway shutdown
- Good for: frequently used tools, OAuth-authenticated backends

Example:
```json
{
  "kapture": {
    "type": "npx",
    "lifecycle": "persistent",
    "enabled": true
  }
}
```

## Logging

Logs are written to:
- **Console**: Human-readable format with colors
- **Files**: JSON format in `${MCP_LOGS_DIR}` (default: `~/.mcp/logs`)
  - `gateway.log` - All logs
  - `gateway-error.log` - Errors only
  - `exceptions.log` - Uncaught exceptions
  - `rejections.log` - Unhandled promise rejections

Configure log level via `LOG_LEVEL` environment variable:
- `error` - Errors only
- `warn` - Warnings and errors
- `info` - General information (default)
- `debug` - Detailed debug information

## Backend Manager

The backend manager handles:
- **Initialization**: Start persistent backends at startup
- **On-Demand Spawning**: Start backends when needed
- **Health Monitoring**: Track backend status and uptime
- **Idle Timeout**: Stop on-demand backends after 5 minutes idle
- **Auto-Restart**: Restart persistent backends on crash
- **Hot Reload**: Reload backends when registry changes

## NPX Backend

The NPX backend spawner manages NPX-based MCP servers:

```javascript
// Example usage
import { createNpxBackend } from './mcp/backends/npx.js';

const backend = createNpxBackend('obs', {
  install: {
    package: 'obs-mcp',
    version: 'latest'
  },
  runtime: {
    args: ['--port', '8080'],
    env: {
      OBS_WEBSOCKET_PASSWORD: 'secret'
    }
  },
  lifecycle: 'on-demand'
});

await backend.spawn();
```

Features:
- Process spawning with `child_process.spawn()`
- Environment variable injection
- stdout/stderr capture
- Automatic retry on failure (max 3 attempts)
- Graceful shutdown handling
- Log buffering (last 1000 lines)

## Registry Hot Reload

The server watches `registry.json` for changes and automatically:
1. Validates the new registry
2. Stops disabled/removed backends
3. Starts new/enabled backends
4. Restarts backends with changed configuration

No server restart required!

## Error Handling

- **Validation Errors**: Registry validation errors are logged with helpful suggestions
- **Backend Failures**: Failed backends are retried up to 3 times with exponential backoff
- **Process Errors**: All process errors are logged with full context
- **Graceful Shutdown**: SIGTERM/SIGINT handlers stop all backends cleanly

## Testing

```bash
# Test SSE endpoint
./test-sse-curl.sh

# Test health endpoint
curl http://localhost:3000/health

# Test status endpoint
curl http://localhost:3000/api/status

# Test logs endpoint
curl http://localhost:3000/api/logs/kapture

# Start a backend manually
curl -X POST http://localhost:3000/api/backends/obs/start

# Stop a backend
curl -X POST http://localhost:3000/api/backends/obs/stop
```

## Development

```bash
# Run with hot reload
npm run dev

# Run linter
npm run lint

# Validate registry
npm run validate

# Run tests (when implemented)
npm test
```

## Next Steps

The following backend types are planned but not yet implemented:
- `uvx` / `pipx` - Python package backends
- `docker` - Docker container backends
- `git-npm` / `git-python` / `git-docker` - Git repository backends
- `local` - Local script backends
- `remote-sse` / `remote-http` - Remote HTTP backends
- `shell` - Shell script wrappers

See `server/src/mcp/backends/index.js` for the backend manager architecture that will support these types.

## Troubleshooting

### Server won't start
- Check that port 3000 is not already in use: `lsof -i :3000`
- Verify registry.json is valid: `npm run validate`
- Check logs in `~/.mcp/logs/gateway-error.log`

### Backend won't start
- Check backend is enabled in registry.json
- Verify environment variables are set in .env
- Check backend logs: `curl http://localhost:3000/api/logs/backend-id`
- Verify package exists: `npx -y package-name --help`

### Environment variables not resolving
- Check .env file exists and contains the variables
- Verify variable names use `${UPPERCASE_WITH_UNDERSCORES}` syntax
- Check logs for "Unresolved environment variable" warnings

### Registry changes not reloading
- Check file watcher is active (logged at startup)
- Verify registry.json syntax is valid
- Check logs for validation errors after file change
