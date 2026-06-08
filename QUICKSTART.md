# MCP Gateway Quick Start Guide

Get the MCP Gateway running in 5 minutes.

## Prerequisites Check

```bash
node --version  # Must be >= 18.0.0
npm --version   # Any recent version
```

If Node.js is not installed, get it from [nodejs.org](https://nodejs.org/).

## Installation

### Step 1: Clone and Setup

```bash
git clone https://github.com/yourusername/mcp-gateway.git
cd mcp-gateway
./scripts/setup.sh
```

This will:
- Create directories in `~/.mcp/`
- Generate encryption keys
- Copy configuration templates
- Install dependencies

### Step 2: Configure Backends

Edit `registry.json` - The default configuration enables two backends:

```json
{
  "backends": {
    "obs": {
      "enabled": true  // OBS Studio control
    },
    "kapture": {
      "enabled": true  // Screenshot/recording
    }
  }
}
```

### Step 3: Set Secrets (Optional)

If using OBS, edit `.env`:

```bash
nano .env

# Find and set:
OBS_WEBSOCKET_PASSWORD=your-obs-password
```

If not using OBS, you can skip this step - Kapture works without configuration.

### Step 4: Start the Gateway

```bash
./scripts/start.sh
```

You should see:
```
[INFO] Starting MCP Gateway Server
[INFO] Server listening on http://0.0.0.0:3000
```

## Connect Your AI Tool

### Claude Code

Edit `~/.claude/.mcp.json`:

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

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

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

### Restart Your AI Tool

Restart Claude Code or Claude Desktop to load the new configuration.

## Test It

In your AI tool, try commands like:

- "Take a screenshot" (uses `kapture/screenshot`)
- "List available MCP tools" (should show tools from both backends)

If using OBS:
- "Start OBS recording" (uses `obs/start_recording`)

## Verify It's Working

### Check Health

```bash
curl http://localhost:3000/health
```

Should return: `{"status":"ok",...}`

### Check Backends

```bash
curl http://localhost:3000/api/status
```

Should show backend states.

### View Logs

```bash
tail -f ~/.mcp/logs/gateway.log
```

## Common Issues

### Port 3000 Already in Use

Edit `.env`:
```bash
GATEWAY_PORT=3001
```

Then update your AI tool config to use port 3001.

### Backend Won't Spawn

Check the logs:
```bash
cat ~/.mcp/logs/gateway.log
```

Common causes:
- Backend package not found (npx will auto-install)
- Missing environment variables (check `.env`)
- Backend is disabled (set `"enabled": true` in `registry.json`)

### AI Tool Can't Connect

1. Verify gateway is running:
   ```bash
   curl http://localhost:3000/health
   ```

2. Check AI tool logs for connection errors

3. Verify the SSE URL is correct: `http://localhost:3000/sse`

## Next Steps

### Add More Backends

Edit `registry.json` to enable additional backends:

```json
{
  "backends": {
    "github": {
      "enabled": true  // Enable GitHub API backend
      // Requires OAuth setup - see DEPLOYMENT.md
    }
  }
}
```

### Web Dashboard

Visit `http://localhost:3000` in your browser for the management UI (when UI is built).

### Remote Access

See [DEPLOYMENT.md](DEPLOYMENT.md) for:
- Running on a VPS
- Setting up HTTPS
- Enabling authentication
- Using from multiple machines

### Testing

Run tests to verify everything works:

```bash
./scripts/test.sh
```

## Quick Reference

### Commands

```bash
# Start development server
./scripts/start.sh

# Start production (Docker)
./scripts/start-prod.sh

# Run tests
./scripts/test.sh

# View logs
tail -f ~/.mcp/logs/gateway.log

# Check status
curl http://localhost:3000/api/status
```

### Important Files

- `registry.json` - Backend configuration
- `.env` - Secrets and environment variables
- `~/.mcp/logs/` - Log files
- `~/.mcp/tokens.enc` - OAuth tokens (encrypted)

### Ports

- `3000` - Gateway server (default)
- Can be changed via `GATEWAY_PORT` in `.env`

## Getting Help

- **Documentation:** [README.md](README.md) for overview
- **Technical Details:** [CLAUDE.md](CLAUDE.md)
- **Deployment:** [DEPLOYMENT.md](DEPLOYMENT.md)
- **Issues:** Report on GitHub

## Success!

You now have:
- ✅ MCP Gateway running locally
- ✅ Two backends enabled (obs, kapture)
- ✅ AI tool connected via SSE
- ✅ Unified MCP endpoint for all your tools

All your AI coding tools can now use the same MCP backends through a single gateway endpoint!
