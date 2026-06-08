# Docker Deployment Guide

> **⚠️ Out of date.** Registry/config examples here use the legacy 11-type schema. Current schema: 5 sources — see `CLAUDE.md` and `schema/registry-v2.schema.json`. Docker mechanics are still correct.

This guide covers deploying MCP Gateway using Docker and Docker Compose.

## Quick Start

### Prerequisites
- Docker Engine 20.10+
- Docker Compose 2.0+
- Git (for git-* backend types)

### Local Development

1. **Copy environment template**
   ```bash
   cp .env.example .env
   # Edit .env with your secrets
   ```

2. **Copy registry template**
   ```bash
   cp registry.example.json registry.json
   # Edit registry.json to enable backends
   ```

3. **Start the gateway**
   ```bash
   docker-compose up
   ```

   Gateway will be available at `http://localhost:3000`

4. **View logs**
   ```bash
   docker-compose logs -f gateway
   ```

5. **Stop the gateway**
   ```bash
   docker-compose down
   ```

### Hot Reload Development

The development compose file (`docker-compose.yml`) mounts source code as volumes, enabling hot reload:

- Changes to `./server/*` → Server auto-restarts (nodemon)
- Changes to `./ui/*` → UI auto-rebuilds (Vite HMR)
- Changes to `registry.json` → Gateway reloads backends
- Changes to `.env` → Requires container restart

## Production Deployment

### On a VPS or Cloud Instance

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/mcp-gateway.git
   cd mcp-gateway
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   nano .env
   ```

   Set production values:
   ```env
   GATEWAY_HOST=0.0.0.0
   GATEWAY_API_KEY=your-strong-random-key
   ENABLE_AUTH=true
   LOG_LEVEL=info
   TOKEN_ENCRYPTION_KEY=$(openssl rand -hex 32)
   ```

3. **Configure registry**
   ```bash
   cp registry.example.json registry.json
   nano registry.json
   ```

   Enable only the backends you need.

4. **Create MCP directories**
   ```bash
   mkdir -p ~/.mcp/{repos,cache,logs,tokens}
   ```

5. **Start in production mode**
   ```bash
   docker-compose -f docker-compose.prod.yml up -d
   ```

6. **Check status**
   ```bash
   docker-compose -f docker-compose.prod.yml ps
   docker-compose -f docker-compose.prod.yml logs -f
   ```

7. **Health check**
   ```bash
   curl http://localhost:3000/health
   ```

### HTTPS with Reverse Proxy

For production, use a reverse proxy (nginx/Caddy) for HTTPS:

#### Option 1: Nginx + Certbot

**nginx.conf**:
```nginx
server {
    listen 80;
    server_name mcp-gateway.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name mcp-gateway.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/mcp-gateway.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mcp-gateway.yourdomain.com/privkey.pem;

    # SSE-specific settings
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 86400s;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # SSE endpoint
    location /sse {
        proxy_pass http://localhost:3000/sse;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header Connection '';
        chunked_transfer_encoding off;
    }
}
```

**Get SSL certificate**:
```bash
sudo certbot --nginx -d mcp-gateway.yourdomain.com
```

#### Option 2: Caddy (Auto HTTPS)

**Caddyfile**:
```caddy
mcp-gateway.yourdomain.com {
    reverse_proxy localhost:3000 {
        # SSE support
        flush_interval -1
    }
}
```

**Run Caddy**:
```bash
caddy run
```

### Client Configuration

Once deployed, configure clients to connect to your gateway:

**Claude Code** (`~/.claude/.mcp.json`):
```json
{
  "mcpServers": {
    "gateway": {
      "url": "https://mcp-gateway.yourdomain.com/sse",
      "transport": "sse",
      "headers": {
        "Authorization": "Bearer YOUR_GATEWAY_API_KEY"
      }
    }
  }
}
```

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "gateway": {
      "url": "https://mcp-gateway.yourdomain.com/sse",
      "transport": "sse",
      "headers": {
        "Authorization": "Bearer YOUR_GATEWAY_API_KEY"
      }
    }
  }
}
```

## Docker Architecture

### Multi-Stage Build

The Dockerfile uses a 3-stage build for optimization:

1. **server-builder**: Builds Node.js server
   - Installs dependencies with `npm ci`
   - Compiles TypeScript to JavaScript
   - Output: `server/dist/`

2. **ui-builder**: Builds React/Vue UI
   - Installs dependencies with `npm ci`
   - Builds with Vite
   - Output: `ui/dist/`

3. **production**: Runtime image
   - Based on `node:20-alpine` (minimal size)
   - Installs: git, docker-cli, python3, uv
   - Copies built artifacts from stages 1 & 2
   - Exposes port 3000
   - Health check on `/health`

### Layer Caching Optimization

The Dockerfile is optimized for Docker layer caching:

```dockerfile
# Copy package.json first (changes less frequently)
COPY server/package*.json ./
RUN npm ci

# Copy source code last (changes most frequently)
COPY server/ ./
RUN npm run build
```

This means rebuilds only re-execute layers after the first change, speeding up iteration.

### Storage Volumes

The gateway uses persistent volumes for data:

| Volume | Purpose | Production Path |
|--------|---------|-----------------|
| `mcp-repos` | Git clones for git-* backends | `~/.mcp/repos` |
| `mcp-cache` | Build artifacts cache | `~/.mcp/cache` |
| `mcp-logs` | Application logs | `~/.mcp/logs` |
| `mcp-tokens` | Encrypted OAuth tokens | `~/.mcp/tokens` |

**Backup volumes**:
```bash
# Backup tokens (critical!)
docker run --rm \
  -v mcp-tokens:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/tokens-backup.tar.gz -C /data .

# Restore tokens
docker run --rm \
  -v mcp-tokens:/data \
  -v $(pwd):/backup \
  alpine tar xzf /backup/tokens-backup.tar.gz -C /data
```

### Docker Socket Access

The gateway mounts `/var/run/docker.sock` to manage Docker containers for the `docker` backend type. This is required for:
- Pulling Docker images from registries
- Starting/stopping containers for Docker-based MCPs
- Health checking container status

**Security considerations**:
- Docker socket access grants root-equivalent permissions
- For production, consider:
  - [Rootless Docker](https://docs.docker.com/engine/security/rootless/)
  - [Docker Socket Proxy](https://github.com/Tecnativa/docker-socket-proxy)
  - Separate Docker host with TLS auth

## Monitoring & Maintenance

### View Logs
```bash
# All logs
docker-compose -f docker-compose.prod.yml logs -f

# Last 100 lines
docker-compose -f docker-compose.prod.yml logs --tail=100

# Specific time range
docker-compose -f docker-compose.prod.yml logs --since 2h
```

### Resource Usage
```bash
# Real-time stats
docker stats mcp-gateway-prod

# Disk usage
docker system df
```

### Updates
```bash
# Pull latest image
docker-compose -f docker-compose.prod.yml pull

# Recreate container with new image
docker-compose -f docker-compose.prod.yml up -d

# Remove old images
docker image prune -a
```

### Health Check
```bash
# Check container health
docker inspect --format='{{.State.Health.Status}}' mcp-gateway-prod

# Manual health endpoint check
curl -f http://localhost:3000/health || echo "Gateway unhealthy"
```

### Restart Gateway
```bash
# Graceful restart
docker-compose -f docker-compose.prod.yml restart

# Force recreate
docker-compose -f docker-compose.prod.yml up -d --force-recreate
```

## Troubleshooting

### Container won't start

**Check logs**:
```bash
docker-compose logs gateway
```

**Common issues**:
- Port 3000 already in use: Change `GATEWAY_PORT` in `.env`
- Missing `.env` file: Copy from `.env.example`
- Missing registry.json: Copy from `registry.example.json`

### Permission denied for Docker socket

**Symptom**: `Cannot connect to Docker daemon`

**Solution**: Add user to docker group
```bash
sudo usermod -aG docker $USER
# Log out and back in
```

Or use rootless Docker:
```bash
dockerd-rootless-setuptool.sh install
```

### Backend fails to spawn

**Check backend logs**:
```bash
docker-compose logs gateway | grep "backend-id"
```

**Common issues**:
- Missing environment variables in `.env`
- Invalid package/image name in registry.json
- Network issues (cannot reach npm/PyPI/Docker Hub)

### SSE connection drops

**Symptom**: Client loses connection after 60s

**Cause**: Reverse proxy timeout too short

**Solution**: Increase proxy timeout
```nginx
# nginx
proxy_read_timeout 86400s;

# Caddy
flush_interval -1
```

### High memory usage

**Check**:
```bash
docker stats mcp-gateway-prod
```

**Causes**:
- Too many persistent backends running
- Memory leak in backend MCP
- Large git repos in `mcp-repos` volume

**Solutions**:
- Set backends to `lifecycle: "on-demand"`
- Restart gateway periodically
- Clean up old repos: `rm -rf ~/.mcp/repos/*`

## Security Best Practices

1. **API Key Authentication**
   ```env
   ENABLE_AUTH=true
   GATEWAY_API_KEY=$(openssl rand -base64 32)
   ```

2. **Token Encryption**
   ```env
   TOKEN_ENCRYPTION_KEY=$(openssl rand -hex 32)
   ```

3. **Firewall Rules**
   ```bash
   # Allow only localhost on port 3000
   sudo ufw allow from 127.0.0.1 to any port 3000
   sudo ufw deny 3000
   ```

4. **IP Allowlist**
   ```env
   ALLOWED_IPS=1.2.3.4,5.6.7.8
   ```

5. **Regular Updates**
   ```bash
   # Update base image
   docker-compose -f docker-compose.prod.yml pull
   docker-compose -f docker-compose.prod.yml up -d
   ```

6. **Audit Logs**
   ```bash
   # Review access logs
   tail -f ~/.mcp/logs/access.log
   ```

7. **Secrets Management**
   - Never commit `.env` to git
   - Use Docker secrets for Swarm deployments
   - Consider HashiCorp Vault for production

## Cloud Deployment

### AWS ECS

Use the Dockerfile with ECS task definition:

```json
{
  "family": "mcp-gateway",
  "containerDefinitions": [{
    "name": "gateway",
    "image": "your-registry/mcp-gateway:latest",
    "portMappings": [{"containerPort": 3000}],
    "environment": [
      {"name": "GATEWAY_HOST", "value": "0.0.0.0"}
    ],
    "secrets": [
      {"name": "GATEWAY_API_KEY", "valueFrom": "arn:aws:secretsmanager:..."}
    ],
    "mountPoints": [{
      "sourceVolume": "mcp-data",
      "containerPath": "/root/.mcp"
    }]
  }],
  "volumes": [{
    "name": "mcp-data",
    "efsVolumeConfiguration": {
      "fileSystemId": "fs-12345678"
    }
  }]
}
```

### DigitalOcean App Platform

Use Dockerfile with App Spec:

```yaml
name: mcp-gateway
services:
  - name: gateway
    dockerfile_path: Dockerfile
    github:
      repo: yourusername/mcp-gateway
      branch: main
    envs:
      - key: GATEWAY_HOST
        value: "0.0.0.0"
    http_port: 3000
```

### Kubernetes

See `k8s/` directory for manifests (future addition).

## Performance Tuning

### Resource Limits

Adjust in `docker-compose.prod.yml`:

```yaml
deploy:
  resources:
    limits:
      cpus: '4'      # Increase for high load
      memory: 4G
    reservations:
      cpus: '1'
      memory: 1G
```

### Concurrent Backends

Set in `.env`:
```env
MAX_CONCURRENT_BACKENDS=10
```

### Log Rotation

Already configured in `docker-compose.prod.yml`:
```yaml
logging:
  options:
    max-size: "10m"
    max-file: "3"
```

### Health Check Frequency

Adjust in `docker-compose.prod.yml`:
```yaml
healthcheck:
  interval: 60s  # Reduce for less overhead
```

## Support

For issues and questions:
- GitHub Issues: https://github.com/yourusername/mcp-gateway/issues
- Documentation: https://github.com/yourusername/mcp-gateway/wiki
- MCP Specification: https://spec.modelcontextprotocol.io
