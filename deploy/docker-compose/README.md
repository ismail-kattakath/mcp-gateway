# Docker Compose Production Deployment

This directory contains production-ready Docker Compose configuration for MCP Gateway with monitoring stack.

## Prerequisites

- Docker Engine 20.10+ with Compose V2
- Domain name with DNS configured
- At least 2GB RAM available
- 20GB disk space for logs and metrics

## Quick Start

1. **Create secrets directory and files:**

```bash
mkdir -p secrets
# Generate secure API key (32 bytes)
openssl rand -base64 32 > secrets/api_key.txt
# Generate database encryption key (32 bytes)
openssl rand -base64 32 > secrets/db_encryption_key.txt
# Set Grafana admin password
echo "your-secure-password" > secrets/grafana_password.txt
```

2. **Configure environment:**

```bash
cp .env.example .env
# Edit .env and update GATEWAY_DOMAIN with your domain
```

3. **Update Caddyfile:**

```bash
# Replace gateway.example.com with your actual domain
sed -i 's/gateway.example.com/your-domain.com/g' Caddyfile
```

4. **Launch the stack:**

```bash
docker-compose -f docker-compose.prod.yml up -d
```

5. **Verify deployment:**

```bash
# Check health
curl https://your-domain.com/health

# View logs
docker-compose -f docker-compose.prod.yml logs -f gateway

# Check all services
docker-compose -f docker-compose.prod.yml ps
```

## Services

- **Gateway** (port 3000): MCP Gateway server (3 replicas)
- **Caddy** (ports 80, 443): Reverse proxy with automatic HTTPS
- **Prometheus** (port 9090): Metrics collection and alerting
- **Grafana** (port 3001): Metrics visualization and dashboards
- **Node Exporter** (port 9100): Host system metrics

## Accessing Services

- **Gateway**: https://your-domain.com
- **Grafana**: http://localhost:3001 (username: admin, password: from secrets/grafana_password.txt)
- **Prometheus**: http://localhost:9090
- **Health Check**: https://your-domain.com/health
- **Metrics**: https://your-domain.com/metrics (requires API key)

## Monitoring

### Grafana Dashboards

1. Access Grafana at http://localhost:3001
2. Log in with admin credentials
3. Navigate to Dashboards → MCP Gateway

Available metrics:
- Request rate and error rate
- Response time percentiles (p50, p95, p99)
- Memory and CPU usage
- Active connections
- MCP tool calls by server
- Database lock wait time

### Prometheus Alerts

Configured alerts:
- High error rate (>5% for 5 minutes)
- High memory usage (>90% for 5 minutes)
- Gateway down (>2 minutes)
- Slow response time (p95 >2s for 5 minutes)

Configure Alertmanager to receive notifications (Slack, PagerDuty, email, etc.).

## Scaling

### Horizontal Scaling

Adjust replica count in docker-compose.prod.yml:

```yaml
gateway:
  deploy:
    replicas: 5  # Increase from 3 to 5
```

Apply changes:
```bash
docker-compose -f docker-compose.prod.yml up -d --scale gateway=5
```

### Resource Limits

Adjust CPU and memory limits per service:

```yaml
gateway:
  deploy:
    resources:
      limits:
        cpus: '2'      # Increase from 1
        memory: 1024M  # Increase from 512M
```

## Backup and Restore

### Database Backup

```bash
# Backup SQLite database
docker exec mcp-gateway sqlite3 /data/gateway.db ".backup /data/backup-$(date +%Y%m%d).db"

# Copy backup to host
docker cp mcp-gateway:/data/backup-$(date +%Y%m%d).db ./backups/
```

### Automated Backups

Add a cron job:
```bash
# Daily backup at 2 AM
0 2 * * * /path/to/backup-script.sh
```

### Restore from Backup

```bash
# Stop gateway
docker-compose -f docker-compose.prod.yml stop gateway

# Restore database
docker cp ./backups/backup-20260609.db mcp-gateway:/data/gateway.db

# Start gateway
docker-compose -f docker-compose.prod.yml start gateway
```

## Logs

### View Logs

```bash
# All services
docker-compose -f docker-compose.prod.yml logs -f

# Specific service
docker-compose -f docker-compose.prod.yml logs -f gateway

# Last 100 lines
docker-compose -f docker-compose.prod.yml logs --tail=100 gateway
```

### Log Rotation

Logs are automatically rotated using Docker's json-file driver:
- Max size: 10MB per file
- Keep 3 files per container
- Older logs are compressed and deleted

## Troubleshooting

### Gateway won't start

```bash
# Check logs
docker-compose -f docker-compose.prod.yml logs gateway

# Verify secrets
ls -la secrets/
cat secrets/api_key.txt

# Check health
docker exec mcp-gateway wget -q -O- http://localhost:3000/health
```

### High memory usage

```bash
# Check metrics
docker stats mcp-gateway

# Reduce replicas
docker-compose -f docker-compose.prod.yml up -d --scale gateway=2
```

### Database locked errors

SQLite has limited concurrency. Consider:
1. Reducing replica count to 1
2. Migrating to PostgreSQL (see PRODUCTION_DEPLOYMENT.md)

### Caddy certificate issues

```bash
# Check Caddy logs
docker-compose -f docker-compose.prod.yml logs caddy

# Verify DNS
dig your-domain.com

# Force certificate renewal
docker exec caddy-proxy caddy reload --config /etc/caddy/Caddyfile
```

## Security

### Update Secrets

```bash
# Rotate API key
openssl rand -base64 32 > secrets/api_key.txt
docker-compose -f docker-compose.prod.yml restart gateway
```

### Firewall Rules

```bash
# Allow only HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp  # HTTP/3

# Block direct access to internal services
sudo ufw deny 3000/tcp
sudo ufw deny 9090/tcp
```

## Updating

```bash
# Pull latest image
docker pull ghcr.io/ismail-kattakath/mcp-gateway:latest

# Recreate containers (zero-downtime with rolling update)
docker-compose -f docker-compose.prod.yml up -d

# Verify version
docker exec mcp-gateway node -p "require('./package.json').version"
```

## Cleanup

```bash
# Stop and remove containers
docker-compose -f docker-compose.prod.yml down

# Remove volumes (WARNING: deletes all data)
docker-compose -f docker-compose.prod.yml down -v
```

## Support

For issues and questions:
- GitHub Issues: https://github.com/ismail-kattakath/mcp-gateway/issues
- Documentation: https://github.com/ismail-kattakath/mcp-gateway/tree/main/docs
