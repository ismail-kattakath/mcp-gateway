# MCP Gateway Deployment Guide

Complete guide for deploying the MCP Gateway in different environments.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Local Development Setup](#local-development-setup)
- [Docker Deployment (Local)](#docker-deployment-local)
- [Remote VPS Deployment](#remote-vps-deployment)
- [Cloud Deployment Options](#cloud-deployment-options)
- [Security Checklist](#security-checklist)
- [Monitoring Setup](#monitoring-setup)
- [Troubleshooting](#troubleshooting)

## Prerequisites

### Required

- **Node.js** >= 18.0.0
- **npm** or **yarn**
- **Git**

### Optional (depending on backend types)

- **Docker** (for Docker-based backends)
- **Python 3.8+** with `uv` or `pipx` (for Python backends)
- **OpenSSL** (for generating encryption keys)

### Verify Prerequisites

```bash
node --version    # Should be >= 18.0.0
npm --version
docker --version  # Optional
python3 --version # Optional
```

## Local Development Setup

### Step 1: Clone and Install

```bash
# Clone the repository
git clone https://github.com/yourusername/mcp-gateway.git
cd mcp-gateway

# Run automated setup
./scripts/setup.sh
```

The setup script will:
- Create required directories (`~/.mcp/repos`, `~/.mcp/cache`, `~/.mcp/logs`)
- Copy `registry.example.json` to `registry.json`
- Copy `.env.example` to `.env`
- Generate `TOKEN_ENCRYPTION_KEY` and `GATEWAY_API_KEY`
- Install server and UI dependencies
- Validate the registry

### Step 2: Configure Environment

Edit `.env` file with your secrets:

```bash
# Required for OBS backend
OBS_WEBSOCKET_PASSWORD=your-obs-password

# Optional: OAuth credentials (if using GitHub/Smithery backends)
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret

SMITHERY_CLIENT_ID=your-smithery-client-id
SMITHERY_CLIENT_SECRET=your-smithery-client-secret
```

**Note:** OAuth credentials are only needed if you enable backends that require authentication (e.g., GitHub API backend).

### Step 3: Configure Registry

Edit `registry.json` to enable/disable backends:

```json
{
  "backends": {
    "obs": {
      "enabled": true  // Set to true to enable
    },
    "kapture": {
      "enabled": true
    },
    "github": {
      "enabled": false  // Set to true if you have OAuth configured
    }
  }
}
```

### Step 4: Start the Gateway

```bash
# Development mode (with hot-reload)
./scripts/start.sh

# Or manually
cd server && npm run dev
```

The gateway will start on `http://localhost:3000`

### Step 5: Configure Your AI Tools

Add the gateway to your AI tool configuration:

**Claude Code** (`~/.claude/.mcp.json`):
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

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`):
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

### Step 6: Test the Installation

```bash
# Run all tests
./scripts/test.sh

# Or run individual test suites
cd server && npm test                      # Unit tests
node tests/integration.test.js             # Integration tests
cd .. && ./scripts/e2e-test.sh            # E2E tests
```

## Docker Deployment (Local)

Docker deployment is useful for:
- Production-like environment on your local machine
- Consistent runtime across different machines
- Easy backup and migration

### Step 1: Prepare Configuration

Follow steps 1-3 from Local Development Setup to create `.env` and `registry.json`.

### Step 2: Start with Docker Compose

```bash
# Development setup
docker-compose up

# Production setup (detached)
docker-compose -f docker-compose.prod.yml up -d

# Or use the script
./scripts/start-prod.sh
```

### Step 3: Verify Deployment

```bash
# Check container status
docker-compose ps

# View logs
docker-compose logs -f gateway

# Test health endpoint
curl http://localhost:3000/health
```

### Step 4: Stop the Gateway

```bash
# Stop containers
docker-compose down

# Stop and remove volumes
docker-compose down -v
```

### Docker Volume Management

The gateway uses volumes for persistence:

```yaml
volumes:
  - ./.env:/app/.env
  - ./registry.json:/app/registry.json
  - ~/.mcp:/root/.mcp
```

**Important:** Backend data, OAuth tokens, and logs are stored in `~/.mcp/`. Back up this directory regularly.

## Remote VPS Deployment

Deploy the gateway on a remote server for multi-machine access.

### Prerequisites

- Ubuntu 20.04+ or similar Linux distribution
- Root or sudo access
- Domain name (optional, for HTTPS)

### Step 1: Server Setup

```bash
# SSH into your server
ssh user@your-server.com

# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install Docker (if using Docker backends)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Install Git
sudo apt install -y git
```

### Step 2: Deploy Gateway

```bash
# Clone repository
cd /opt
sudo git clone https://github.com/yourusername/mcp-gateway.git
cd mcp-gateway

# Run setup
sudo ./scripts/setup.sh

# Edit .env (use nano or vim)
sudo nano .env

# Update GATEWAY_HOST to accept external connections
# In .env file: GATEWAY_HOST=0.0.0.0
```

### Step 3: Set Up Systemd Service

Create `/etc/systemd/system/mcp-gateway.service`:

```ini
[Unit]
Description=MCP Gateway Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/mcp-gateway/server
Environment=NODE_ENV=production
ExecStart=/usr/bin/node src/index.js
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

Enable and start the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable mcp-gateway
sudo systemctl start mcp-gateway

# Check status
sudo systemctl status mcp-gateway

# View logs
sudo journalctl -u mcp-gateway -f
```

### Step 4: Configure Firewall

```bash
# Allow HTTP
sudo ufw allow 3000/tcp

# Or use Nginx reverse proxy for HTTPS (recommended)
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### Step 5: Set Up Nginx Reverse Proxy (Optional but Recommended)

Install Nginx:

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

Create `/etc/nginx/sites-available/mcp-gateway`:

```nginx
server {
    listen 80;
    server_name mcp-gateway.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # SSE requires longer timeouts
    location /sse {
        proxy_pass http://localhost:3000/sse;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_set_header Cache-Control 'no-cache';
        proxy_set_header X-Accel-Buffering 'no';
        proxy_buffering off;
        chunked_transfer_encoding off;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/mcp-gateway /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# Get SSL certificate with Let's Encrypt
sudo certbot --nginx -d mcp-gateway.yourdomain.com
```

### Step 6: Configure Clients for Remote Access

Update client configuration to use remote URL:

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

**Security Note:** Enable authentication in production:

In `registry.json`:
```json
{
  "gateway": {
    "security": {
      "enableAuth": true,
      "apiKey": "${GATEWAY_API_KEY}"
    }
  }
}
```

## Cloud Deployment Options

### AWS EC2

1. Launch EC2 instance (t3.medium or larger recommended)
2. Configure Security Group to allow ports 80, 443, 22
3. Follow [Remote VPS Deployment](#remote-vps-deployment) steps
4. Consider using Elastic IP for stable address
5. Optional: Use RDS for database if adding persistence

### DigitalOcean Droplet

1. Create Droplet (Basic plan, 2GB RAM minimum)
2. Select Ubuntu 22.04
3. Follow [Remote VPS Deployment](#remote-vps-deployment) steps
4. Use DigitalOcean's free SSL certificates

### Google Cloud Platform

1. Create Compute Engine VM instance
2. Configure firewall rules
3. Follow [Remote VPS Deployment](#remote-vps-deployment) steps
4. Use Google Cloud Load Balancer for SSL termination

### Railway/Render/Heroku

These platforms can auto-deploy from Git:

1. Connect your Git repository
2. Set environment variables in platform UI
3. Configure build command: `cd server && npm install`
4. Configure start command: `cd server && npm start`
5. Add persistent storage for `~/.mcp` directory

## Security Checklist

### Before Production Deployment

- [ ] Generate strong `TOKEN_ENCRYPTION_KEY` (64 hex chars)
- [ ] Generate strong `GATEWAY_API_KEY` (64 hex chars)
- [ ] Set `ENABLE_AUTH=true` for remote access
- [ ] Never commit `.env` to Git
- [ ] Use HTTPS (SSL/TLS) for remote access
- [ ] Configure firewall to restrict access
- [ ] Set up OAuth only with your own client IDs/secrets
- [ ] Review and disable unused backends in `registry.json`
- [ ] Restrict `gateway.security.allowedIPs` if possible
- [ ] Use restrictive CORS origins (not `*`)
- [ ] Keep Node.js and dependencies updated
- [ ] Set up log rotation for `~/.mcp/logs/`
- [ ] Back up `~/.mcp/tokens.enc` regularly

### Environment Variables Security

Store sensitive values in `.env` (never in `registry.json`):

```bash
# Good: Use environment variable reference
"env": { "API_KEY": "${MY_API_KEY}" }

# Bad: Hardcode secrets
"env": { "API_KEY": "sk-1234567890abcdef" }
```

### OAuth Security

- Store OAuth client secrets in `.env`
- Use HTTPS for OAuth callbacks in production
- Set restrictive OAuth scopes (minimum required)
- Tokens are encrypted at rest with AES-256-GCM

## Monitoring Setup

### Log Files

Logs are written to:
- Console (stdout/stderr)
- `~/.mcp/logs/gateway.log` (rotating, 10MB max, 10 files)

### Log Levels

Configure in `.env`:

```bash
LOG_LEVEL=info  # error, warn, info, debug
```

### Health Monitoring

Set up health check endpoint monitoring:

```bash
# HTTP endpoint
curl http://localhost:3000/health

# Expected response
{"status":"ok","timestamp":"2024-01-01T00:00:00.000Z"}
```

### Uptime Monitoring Services

Use services like:
- **UptimeRobot** (free tier available)
- **Pingdom**
- **StatusCake**
- **HealthChecks.io**

Configure to check `https://your-gateway.com/health` every 5 minutes.

### Backend Status API

Monitor backend health:

```bash
curl http://localhost:3000/api/status

# Response includes:
# - Backend states (idle, starting, running, error)
# - Active connections
# - Tool call metrics
```

### Systemd Journal (Linux)

```bash
# View real-time logs
sudo journalctl -u mcp-gateway -f

# View logs from last hour
sudo journalctl -u mcp-gateway --since "1 hour ago"

# Export logs
sudo journalctl -u mcp-gateway > gateway-logs.txt
```

### Docker Logs

```bash
# View logs
docker-compose logs -f gateway

# Export logs
docker-compose logs gateway > gateway-logs.txt

# Limit to last 100 lines
docker-compose logs --tail=100 gateway
```

## Troubleshooting

### Server Won't Start

**Check Node.js version:**
```bash
node --version  # Must be >= 18.0.0
```

**Check for port conflicts:**
```bash
lsof -i :3000  # Check if port 3000 is already in use
```

**Check configuration:**
```bash
# Validate registry
cd server && npm run validate
```

**View detailed logs:**
```bash
LOG_LEVEL=debug npm run dev
```

### Backend Won't Spawn

**Check backend configuration:**
```bash
# Ensure backend is enabled
cat registry.json | grep -A 5 '"backend-name"'
```

**Check environment variables:**
```bash
# Verify .env has required variables
cat .env
```

**Check backend dependencies:**
```bash
# For npx backends
npx -y package-name --version

# For Docker backends
docker pull image-name
```

**View backend logs:**
```bash
cat ~/.mcp/logs/gateway.log | grep backend-name
```

### SSE Connection Fails

**Check CORS configuration:**
```json
// In registry.json
"gateway": {
  "server": {
    "cors": {
      "enabled": true,
      "origins": ["*"]
    }
  }
}
```

**Test SSE endpoint:**
```bash
curl -N -H "Accept: text/event-stream" http://localhost:3000/sse
```

**Check proxy configuration (if using Nginx):**
```nginx
# SSE needs special handling
proxy_set_header Connection '';
proxy_buffering off;
chunked_transfer_encoding off;
```

### OAuth Not Working

**Verify OAuth credentials:**
```bash
# Check .env has correct client ID and secret
grep GITHUB_CLIENT_ID .env
```

**Check callback URL:**
- Must match exactly in OAuth app settings
- Use `http://localhost:3000/oauth/github/callback` for local dev
- Use `https://your-domain.com/oauth/github/callback` for production

**Check OAuth provider settings:**
- GitHub: https://github.com/settings/developers
- Smithery: https://smithery.ai/settings/oauth

### High Memory Usage

**Limit concurrent backends:**
```json
// In registry.json, use on-demand lifecycle
"lifecycle": "on-demand"  // Spawns only when needed
```

**Configure backend timeouts:**
```json
"timeout": 30000  // Kill backend after 30s idle
```

**Monitor Docker memory:**
```bash
docker stats
```

### Permission Denied Errors

**Check directory permissions:**
```bash
ls -la ~/.mcp/
chmod -R 755 ~/.mcp/
```

**Check script permissions:**
```bash
chmod +x scripts/*.sh
```

### Can't Connect from Remote Machine

**Check firewall:**
```bash
# Linux
sudo ufw status
sudo ufw allow 3000/tcp

# Check if service is listening on 0.0.0.0
sudo netstat -tulpn | grep 3000
```

**Check GATEWAY_HOST in .env:**
```bash
GATEWAY_HOST=0.0.0.0  # Listen on all interfaces
```

**Test from remote machine:**
```bash
curl http://server-ip:3000/health
```

## Backup and Recovery

### What to Back Up

1. **Configuration files:**
   - `registry.json`
   - `.env`

2. **OAuth tokens:**
   - `~/.mcp/tokens.enc`

3. **Logs (optional):**
   - `~/.mcp/logs/`

### Backup Script

```bash
#!/bin/bash
BACKUP_DIR=~/mcp-gateway-backups/$(date +%Y%m%d-%H%M%S)
mkdir -p $BACKUP_DIR

cp registry.json $BACKUP_DIR/
cp .env $BACKUP_DIR/
cp -r ~/.mcp/tokens.enc $BACKUP_DIR/

tar -czf $BACKUP_DIR.tar.gz $BACKUP_DIR
rm -rf $BACKUP_DIR

echo "Backup created: $BACKUP_DIR.tar.gz"
```

### Recovery

```bash
# Extract backup
tar -xzf backup-file.tar.gz

# Restore files
cp backup-dir/registry.json .
cp backup-dir/.env .
cp backup-dir/tokens.enc ~/.mcp/

# Restart gateway
./scripts/start.sh
```

## Updates and Maintenance

### Update Gateway

```bash
# Pull latest code
git pull origin main

# Reinstall dependencies
cd server && npm install
cd ../ui && npm install

# Restart gateway
sudo systemctl restart mcp-gateway  # Systemd
# or
docker-compose restart             # Docker
```

### Update Backend Package Versions

Edit `registry.json` and change version numbers:

```json
"install": {
  "package": "obs-mcp",
  "version": "2.0.0"  // Update this
}
```

Backend will reinstall on next spawn.

### Rotate Logs

Logs auto-rotate at 10MB, but you can manually clean:

```bash
rm -f ~/.mcp/logs/*.log.1
```

## Support and Resources

- **Documentation:** See `CLAUDE.md` for technical details
- **Issues:** Report bugs on GitHub Issues
- **Schemas:** See `schema/registry-v2.schema.json` for registry format
- **Examples:** See `registry.example.json` for all backend types

## Summary

You now have everything needed to deploy the MCP Gateway in any environment:

- ✅ Local development with hot-reload
- ✅ Docker containerized deployment
- ✅ Remote VPS with systemd
- ✅ Cloud platform deployment
- ✅ Security best practices
- ✅ Monitoring and troubleshooting
- ✅ Backup and recovery

For quick starts:
- **Local dev:** `./scripts/setup.sh && ./scripts/start.sh`
- **Docker:** `./scripts/setup.sh && ./scripts/start-prod.sh`
- **Remote:** Follow VPS deployment section + Nginx setup

Enjoy your unified MCP gateway! 🚀
