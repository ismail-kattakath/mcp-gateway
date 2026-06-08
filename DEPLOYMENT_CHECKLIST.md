# MCP Gateway Deployment Checklist

Use this checklist to ensure proper deployment and testing.

## Pre-Deployment Checklist

### Prerequisites

- [ ] Node.js >= 18.0.0 installed
- [ ] npm installed
- [ ] Git installed
- [ ] Docker installed (optional, for Docker backends)
- [ ] Python 3.8+ with uv/pipx (optional, for Python backends)
- [ ] OpenSSL available (for key generation)

Verify:
```bash
node --version
npm --version
git --version
docker --version  # Optional
python3 --version # Optional
openssl version
```

### Repository Setup

- [ ] Repository cloned
- [ ] All files present:
  - [ ] `registry.example.json`
  - [ ] `.env.example`
  - [ ] `scripts/setup.sh`
  - [ ] `scripts/start.sh`
  - [ ] `scripts/start-prod.sh`
  - [ ] `scripts/test.sh`
  - [ ] `scripts/e2e-test.sh`
  - [ ] `server/src/index.js`
  - [ ] `server/tests/integration.test.js`

Verify:
```bash
ls -la scripts/
ls -la server/src/
ls -la server/tests/
```

## Initial Setup

### Step 1: Run Setup Script

- [ ] Execute setup script
  ```bash
  ./scripts/setup.sh
  ```

- [ ] Setup script completed successfully
- [ ] Directories created in `~/.mcp/`
- [ ] `registry.json` created from example
- [ ] `.env` created from example
- [ ] `TOKEN_ENCRYPTION_KEY` generated
- [ ] `GATEWAY_API_KEY` generated
- [ ] Server dependencies installed
- [ ] UI dependencies installed (if applicable)

Verify:
```bash
ls -la ~/.mcp/
test -f registry.json && echo "registry.json exists"
test -f .env && echo ".env exists"
grep TOKEN_ENCRYPTION_KEY .env
```

### Step 2: Configure Environment

- [ ] Edit `.env` file
- [ ] Set `OBS_WEBSOCKET_PASSWORD` (if using OBS)
- [ ] Set OAuth credentials (if using GitHub/Smithery)
  - [ ] `GITHUB_CLIENT_ID`
  - [ ] `GITHUB_CLIENT_SECRET`
  - [ ] `SMITHERY_CLIENT_ID`
  - [ ] `SMITHERY_CLIENT_SECRET`
- [ ] Verify `TOKEN_ENCRYPTION_KEY` is set
- [ ] Verify `GATEWAY_API_KEY` is set
- [ ] Set `GATEWAY_PORT` if not using 3000
- [ ] Set `GATEWAY_HOST` (0.0.0.0 for all interfaces, localhost for local only)

Verify:
```bash
cat .env | grep -v "^#" | grep "="
```

### Step 3: Configure Registry

- [ ] Edit `registry.json`
- [ ] Enable desired backends:
  - [ ] `obs` - Set `enabled: true` if using
  - [ ] `kapture` - Set `enabled: true` (works without config)
  - [ ] `github` - Set `enabled: true` if OAuth configured
  - [ ] Other backends as needed
- [ ] Disable unused backends
- [ ] Verify environment variable references (e.g., `${OBS_WEBSOCKET_PASSWORD}`)

Verify:
```bash
cd server && npm run validate
```

## Testing Checklist

### Step 4: Run Tests

- [ ] Run all tests
  ```bash
  ./scripts/test.sh
  ```

- [ ] Unit tests pass
  ```bash
  cd server && npm test
  ```

- [ ] Integration tests pass
  ```bash
  cd server && node tests/integration.test.js
  ```

- [ ] E2E tests pass
  ```bash
  ./scripts/e2e-test.sh
  ```

- [ ] Registry validation passes
  ```bash
  cd server && npm run validate
  ```

### Step 5: Manual Verification

- [ ] Start gateway
  ```bash
  ./scripts/start.sh
  ```

- [ ] Server starts without errors
- [ ] Health endpoint responds
  ```bash
  curl http://localhost:3000/health
  ```

- [ ] Status API responds
  ```bash
  curl http://localhost:3000/api/status
  ```

- [ ] SSE endpoint accepts connections
  ```bash
  curl -N -H "Accept: text/event-stream" http://localhost:3000/sse
  ```

- [ ] MCP initialize works
  ```bash
  curl -X POST http://localhost:3000/message \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"0.1.0","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}'
  ```

- [ ] Tools list works
  ```bash
  curl -X POST http://localhost:3000/message \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
  ```

## AI Tool Integration

### Step 6: Configure AI Tools

#### Claude Code

- [ ] Edit `~/.claude/.mcp.json`
- [ ] Add gateway configuration:
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
- [ ] Restart Claude Code
- [ ] Test commands in Claude Code

#### Claude Desktop

- [ ] Edit Claude Desktop config file:
  - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
  - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- [ ] Add gateway configuration (same as above)
- [ ] Restart Claude Desktop
- [ ] Test commands in Claude Desktop

#### Other Tools (Cline, Cursor, etc.)

- [ ] Configure according to tool's documentation
- [ ] Use SSE URL: `http://localhost:3000/sse`
- [ ] Test connection

### Step 7: Test with AI Tool

- [ ] AI tool connects successfully
- [ ] Tools are listed in AI tool
- [ ] Tool namespaces are visible (e.g., `obs/start_recording`)
- [ ] Test a simple command (e.g., "List available MCP tools")
- [ ] Test a backend command:
  - [ ] Kapture: "Take a screenshot"
  - [ ] OBS: "Start OBS recording" (if enabled)
- [ ] Backend spawns correctly
- [ ] Tool call succeeds

Verify:
```bash
tail -f ~/.mcp/logs/gateway.log
```

## Production Deployment Checklist

### For Remote Deployment

- [ ] Server/VPS provisioned
- [ ] Node.js installed on server
- [ ] Repository cloned on server
- [ ] Setup script executed on server
- [ ] `.env` configured with production values
- [ ] `GATEWAY_HOST=0.0.0.0` set in `.env`
- [ ] Firewall rules configured:
  - [ ] Port 3000 allowed (or your chosen port)
  - [ ] Or ports 80/443 if using reverse proxy
- [ ] Systemd service created (optional)
- [ ] Systemd service enabled and started (optional)
- [ ] Nginx reverse proxy configured (optional)
- [ ] SSL certificate obtained (Let's Encrypt)
- [ ] HTTPS working

### Security for Production

- [ ] `ENABLE_AUTH=true` set in `.env`
- [ ] Strong `GATEWAY_API_KEY` generated
- [ ] `.env` file permissions restricted (chmod 600)
- [ ] CORS origins restricted (not `*`)
- [ ] `allowedIPs` configured if needed
- [ ] OAuth client secrets not exposed
- [ ] Registry doesn't contain hardcoded secrets
- [ ] Backup of `~/.mcp/tokens.enc` created
- [ ] Log rotation configured

### Docker Deployment

- [ ] Docker and Docker Compose installed
- [ ] `docker-compose.yml` or `docker-compose.prod.yml` configured
- [ ] `.env` file present
- [ ] `registry.json` configured
- [ ] Start with Docker Compose:
  ```bash
  ./scripts/start-prod.sh
  ```
- [ ] Container starts successfully
- [ ] Health check passes
- [ ] Logs visible:
  ```bash
  docker-compose logs -f gateway
  ```

### Remote Access Configuration

For clients connecting to remote gateway:

- [ ] Client MCP config updated with remote URL:
  ```json
  {
    "mcpServers": {
      "gateway": {
        "url": "https://mcp-gateway.yourdomain.com/sse",
        "transport": "sse",
        "headers": {
          "Authorization": "Bearer your-gateway-api-key"
        }
      }
    }
  }
  ```
- [ ] Client can connect to remote gateway
- [ ] Authentication works (if enabled)
- [ ] Tools are available remotely

## Post-Deployment Verification

### Step 8: Monitor and Verify

- [ ] Gateway is running
  ```bash
  # Systemd
  sudo systemctl status mcp-gateway
  
  # Docker
  docker-compose ps
  ```

- [ ] Health endpoint responds
  ```bash
  curl http://your-server:3000/health
  # or
  curl https://mcp-gateway.yourdomain.com/health
  ```

- [ ] Logs are being written
  ```bash
  tail -f ~/.mcp/logs/gateway.log
  # or
  docker-compose logs -f gateway
  ```

- [ ] Backends are spawning
  ```bash
  curl http://localhost:3000/api/status
  ```

- [ ] AI tool can connect remotely (if applicable)

### Step 9: Setup Monitoring

- [ ] Uptime monitoring configured (UptimeRobot, Pingdom, etc.)
- [ ] Health check URL monitored
- [ ] Alert notifications configured
- [ ] Log monitoring set up (optional)
- [ ] Backup schedule configured

## Troubleshooting

If issues occur, check:

- [ ] Node.js version is >= 18.0.0
- [ ] Port 3000 (or chosen port) is not in use
- [ ] Firewall allows connections
- [ ] `.env` file has all required variables
- [ ] Registry validation passes
- [ ] Backend dependencies are installed (npx, Docker, etc.)
- [ ] Logs show error details: `~/.mcp/logs/gateway.log`
- [ ] Server has sufficient resources (memory, CPU)

Common fixes:

```bash
# Restart gateway
sudo systemctl restart mcp-gateway  # Systemd
docker-compose restart              # Docker
./scripts/start.sh                  # Manual

# Check logs
tail -n 100 ~/.mcp/logs/gateway.log
sudo journalctl -u mcp-gateway -n 100
docker-compose logs --tail=100 gateway

# Validate configuration
cd server && npm run validate

# Test health
curl http://localhost:3000/health

# Check port availability
lsof -i :3000
```

## Maintenance Checklist

### Regular Maintenance

- [ ] Update gateway code:
  ```bash
  git pull origin main
  cd server && npm install
  ```

- [ ] Restart gateway after updates

- [ ] Check logs periodically:
  ```bash
  tail -f ~/.mcp/logs/gateway.log
  ```

- [ ] Monitor disk space for logs:
  ```bash
  du -sh ~/.mcp/logs/
  ```

- [ ] Rotate old logs if needed:
  ```bash
  rm ~/.mcp/logs/*.log.1
  ```

- [ ] Backup important files:
  - [ ] `registry.json`
  - [ ] `.env`
  - [ ] `~/.mcp/tokens.enc`

- [ ] Update backend package versions in registry

- [ ] Test after updates

### Monthly Maintenance

- [ ] Review and update Node.js
- [ ] Review and update npm packages
- [ ] Review OAuth token status
- [ ] Review logs for errors
- [ ] Test disaster recovery (restore from backup)
- [ ] Review security settings

## Success Criteria

Gateway is successfully deployed when:

- ✅ All tests pass
- ✅ Health endpoint responds
- ✅ SSE connections work
- ✅ MCP protocol works
- ✅ Backends spawn correctly
- ✅ AI tools can connect
- ✅ Tool calls succeed
- ✅ Logs are clean (no errors)
- ✅ Monitoring is set up
- ✅ Backups are configured

## Documentation Reference

- **Quick Start:** [QUICKSTART.md](QUICKSTART.md)
- **Full README:** [README.md](README.md)
- **Deployment Guide:** [DEPLOYMENT.md](DEPLOYMENT.md)
- **Testing Guide:** [TESTING.md](TESTING.md)
- **Technical Details:** [CLAUDE.md](CLAUDE.md)

## Support

If you encounter issues:

1. Check troubleshooting section in [DEPLOYMENT.md](DEPLOYMENT.md)
2. Review logs: `~/.mcp/logs/gateway.log`
3. Run validation: `cd server && npm run validate`
4. Check GitHub Issues
5. Review backend-specific documentation

## Deployment Complete! 🎉

When all items are checked, your MCP Gateway is production-ready!

Next steps:
- Add more backends to `registry.json`
- Configure OAuth for GitHub/Smithery
- Set up advanced monitoring
- Scale with Docker Swarm or Kubernetes (advanced)

Enjoy your unified MCP gateway!
