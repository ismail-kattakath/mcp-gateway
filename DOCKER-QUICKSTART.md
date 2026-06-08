# Docker Quick Start

Quick reference for common Docker operations with MCP Gateway.

## Initial Setup

```bash
# 1. Copy configuration files
cp .env.example .env
cp registry.example.json registry.json

# 2. Edit configuration
nano .env              # Add your secrets
nano registry.json     # Enable backends

# 3. Create MCP directories (optional, auto-created)
mkdir -p ~/.mcp/{repos,cache,logs,tokens}
```

## Local Development

```bash
# Start gateway (with hot reload)
docker-compose up

# Start in background
docker-compose up -d

# View logs
docker-compose logs -f

# Stop gateway
docker-compose down

# Rebuild after code changes
docker-compose up --build
```

## Production Deployment

```bash
# Start production gateway
docker-compose -f docker-compose.prod.yml up -d

# View status
docker-compose -f docker-compose.prod.yml ps

# View logs
docker-compose -f docker-compose.prod.yml logs -f

# Stop gateway
docker-compose -f docker-compose.prod.yml down

# Update to latest version
docker-compose -f docker-compose.prod.yml pull
docker-compose -f docker-compose.prod.yml up -d
```

## Common Commands

```bash
# Restart gateway
docker-compose restart

# Execute command in container
docker-compose exec gateway sh

# View resource usage
docker stats mcp-gateway-dev

# Clean up unused images/volumes
docker system prune -a
```

## Troubleshooting

```bash
# Check gateway health
curl http://localhost:3000/health

# Inspect container
docker inspect mcp-gateway-dev

# View all logs (including errors)
docker-compose logs --tail=100 gateway

# Force rebuild
docker-compose build --no-cache
docker-compose up -d
```

## Client Configuration

Add to `~/.claude/.mcp.json`:

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

For remote deployment:
```json
{
  "mcpServers": {
    "gateway": {
      "url": "https://mcp-gateway.yourdomain.com/sse",
      "transport": "sse",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}
```

## Environment Variables

Key variables in `.env`:

```env
# Server
GATEWAY_PORT=3000
GATEWAY_HOST=0.0.0.0
GATEWAY_API_KEY=your-secret-key

# OAuth (optional)
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret

# Backend secrets
OBS_WEBSOCKET_PASSWORD=your-obs-password
COMFYUI_API_URL=http://localhost:8188

# Security
TOKEN_ENCRYPTION_KEY=$(openssl rand -hex 32)
ENABLE_AUTH=false
```

## Ports

- **3000**: Gateway HTTP/SSE server
- **5173**: UI development server (dev only)

## Volumes

Production volumes in `~/.mcp/`:
- `repos/` - Git clones for git-* backends
- `cache/` - Build artifacts
- `logs/` - Application logs
- `tokens/` - Encrypted OAuth tokens

## Backup & Restore

```bash
# Backup tokens (critical!)
docker run --rm \
  -v mcp-tokens:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/tokens.tar.gz -C /data .

# Restore tokens
docker run --rm \
  -v mcp-tokens:/data \
  -v $(pwd):/backup \
  alpine tar xzf /backup/tokens.tar.gz -C /data
```

## Security

For production:

1. **Enable authentication**
   ```env
   ENABLE_AUTH=true
   GATEWAY_API_KEY=$(openssl rand -base64 32)
   ```

2. **Use HTTPS** - Add nginx/Caddy reverse proxy

3. **Firewall rules**
   ```bash
   sudo ufw allow from 127.0.0.1 to any port 3000
   sudo ufw deny 3000
   ```

4. **IP allowlist**
   ```env
   ALLOWED_IPS=1.2.3.4,5.6.7.8
   ```

## Full Documentation

See **DOCKER.md** for comprehensive deployment guide.
