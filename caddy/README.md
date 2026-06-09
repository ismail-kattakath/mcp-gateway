# MCP Gateway - Caddy Reverse Proxy Setup

This directory contains the Caddy reverse proxy configuration for production deployments with automatic TLS.

## Features

- **Automatic HTTPS**: Let's Encrypt certificates automatically provisioned and renewed
- **TLS 1.3**: Modern encryption with strong cipher suites
- **Security Headers**: HSTS, CSP, X-Frame-Options, etc.
- **HTTP/2 & HTTP/3**: Modern protocol support
- **Dynamic Configuration**: Add/remove domains via API without restarts
- **Health Checks**: Automatic routing to healthy backend only

## Quick Start

### Development (No TLS)

```bash
cd caddy
docker-compose up -d
```

Gateway accessible at: http://localhost

### Production (With Custom Domain)

1. **Prerequisites**:
   - Domain name pointing to your server (A/AAAA record)
   - Port 80 and 443 open in firewall
   - Email for Let's Encrypt notifications

2. **Configure environment**:

```bash
# Create .env file
cat > .env <<EOF
ADMIN_EMAIL=your-email@example.com
LOG_LEVEL=info
EOF
```

3. **Start services**:

```bash
docker-compose up -d
```

4. **Add your domain** (via CLI or API):

```bash
# Using MCP Gateway CLI
mcp domains add example.com

# Or via API
curl -X POST http://localhost:2019/load \
  -H "Content-Type: text/caddyfile" \
  --data-binary @Caddyfile.template
```

5. **Verify TLS**:

```bash
# Check certificate
openssl s_client -connect example.com:443 -servername example.com

# Test HTTPS
curl -v https://example.com/health
```

## Architecture

```
┌─────────────────┐
│   Client        │
│ (Browser/CLI)   │
└────────┬────────┘
         │ HTTPS (443)
         ↓
┌─────────────────┐
│  Caddy Proxy    │
│  - TLS termination
│  - Load balancing
│  - Health checks
└────────┬────────┘
         │ HTTP (3000)
         ↓
┌─────────────────┐
│  MCP Gateway    │
│  (Node.js)      │
└─────────────────┘
```

## Caddy Admin API

Caddy exposes an admin API on port 2019 for dynamic configuration.

### Common Operations

**Get current config**:
```bash
curl http://localhost:2019/config/
```

**Reload configuration**:
```bash
curl -X POST http://localhost:2019/load \
  -H "Content-Type: text/caddyfile" \
  --data-binary @Caddyfile.template
```

**Check health**:
```bash
curl http://localhost:2019/reverse_proxy/upstreams
```

**View certificates**:
```bash
# List all certificates
docker exec mcp-caddy caddy list-certificates

# Certificate info
docker exec mcp-caddy ls -la /data/caddy/certificates/
```

## Configuration

### Caddyfile.template

The `Caddyfile.template` is the base configuration. Custom domains are appended dynamically.

**Default block** (localhost, no TLS):
```caddyfile
:3000 {
    reverse_proxy gateway:3000
}
```

**Custom domain block** (automatic TLS):
```caddyfile
example.com {
    reverse_proxy gateway:3000
    tls {
        protocols tls1.3
    }
}
```

### Security Headers

All responses include:
- `Strict-Transport-Security`: Force HTTPS for 1 year
- `X-Frame-Options: DENY`: Prevent clickjacking
- `X-Content-Type-Options: nosniff`: Prevent MIME sniffing
- `X-XSS-Protection`: Enable browser XSS filter
- `Referrer-Policy`: Control referrer information

### TLS Best Practices

**Enforced**:
- TLS 1.3 only (TLS 1.2 deprecated)
- Strong cipher suites: AES-GCM, ChaCha20-Poly1305
- HSTS with preload
- OCSP stapling (automatic)
- Perfect Forward Secrecy (PFS)

**Certificate Renewal**:
- Automatic renewal 30 days before expiration
- Zero-downtime certificate reloads
- Email notifications on renewal failures

## Troubleshooting

### Certificate Not Provisioned

**Check DNS**:
```bash
dig +short example.com
nslookup example.com
```

**Check Caddy logs**:
```bash
docker logs mcp-caddy
```

**Common issues**:
- DNS not propagated (wait 5-10 minutes)
- Port 80 blocked (needed for HTTP-01 ACME challenge)
- Rate limit hit (Let's Encrypt: 5 failures per account per hour)

### Port Already in Use

If port 80/443 already bound:

```bash
# Find process
sudo lsof -i :80
sudo lsof -i :443

# Kill if needed
sudo kill <PID>
```

### Caddy Not Starting

**Check Docker logs**:
```bash
docker logs mcp-caddy
docker logs mcp-gateway
```

**Validate Caddyfile**:
```bash
docker run --rm -v $(pwd)/Caddyfile.template:/etc/caddy/Caddyfile \
  caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile
```

### TLS Handshake Failures

**Test with OpenSSL**:
```bash
openssl s_client -connect example.com:443 -tls1_3
```

**Check cipher suites**:
```bash
nmap --script ssl-enum-ciphers -p 443 example.com
```

## Security Considerations

### Docker Socket Access

By default, `/var/run/docker.sock` is NOT mounted (security risk). Only enable if you use `source: "container"` in registry.

**To enable** (carefully):
```yaml
volumes:
  - /var/run/docker.sock:/var/run/docker.sock
```

**Alternative**: Use Docker socket proxy:
```bash
docker run -d \
  --name docker-socket-proxy \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -e CONTAINERS=1 \
  tecnativa/docker-socket-proxy

# Then set DOCKER_HOST in gateway container
environment:
  - DOCKER_HOST=tcp://docker-socket-proxy:2375
```

### Firewall Rules

**Required ports**:
- 80/tcp (HTTP, ACME challenges)
- 443/tcp (HTTPS)
- 443/udp (HTTP/3, optional)

**Recommended firewall** (ufw):
```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp
sudo ufw enable
```

### Rate Limiting

Caddy doesn't have built-in rate limiting. For production, add a WAF like Cloudflare or use Traefik with rate limiting.

**Example with Traefik**:
```yaml
labels:
  - "traefik.http.middlewares.ratelimit.ratelimit.average=100"
  - "traefik.http.middlewares.ratelimit.ratelimit.burst=50"
```

## Monitoring

### Health Checks

**Caddy health**:
```bash
curl http://localhost:2019/config/
```

**Gateway health**:
```bash
curl http://localhost/health
```

### Metrics

Caddy doesn't export Prometheus metrics by default. Use a plugin or external monitoring.

**Example with Prometheus plugin**:
```bash
docker run -d \
  --name caddy-with-metrics \
  caddy:2-builder \
  caddy build --with github.com/mholt/caddy-prometheus
```

Then add to Caddyfile:
```caddyfile
{
    servers {
        metrics
    }
}
```

## Backup & Restore

### Certificate Backup

Certificates stored in `/data/caddy/certificates/`:

```bash
# Backup
docker run --rm -v caddy-data:/data -v $(pwd):/backup alpine \
  tar czf /backup/caddy-certs-$(date +%Y%m%d).tar.gz /data/caddy/certificates

# Restore
docker run --rm -v caddy-data:/data -v $(pwd):/backup alpine \
  tar xzf /backup/caddy-certs-20260608.tar.gz -C /
```

### Configuration Backup

```bash
# Backup Caddyfile
cp Caddyfile.template Caddyfile.backup

# Export running config
curl http://localhost:2019/config/ > caddy-config-backup.json
```

## Advanced Configuration

### Custom CA (Self-Signed)

For internal/dev environments:

```bash
# Generate self-signed cert
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem \
  -days 365 -nodes -subj "/CN=mcp-gateway.local"

# Update Caddyfile
mcp-gateway.local {
    tls cert.pem key.pem
    reverse_proxy gateway:3000
}
```

### Wildcard Certificates

Requires DNS-01 ACME challenge:

```caddyfile
*.example.com {
    tls {
        dns cloudflare {env.CLOUDFLARE_API_TOKEN}
    }
    reverse_proxy gateway:3000
}
```

### Multiple Domains

Add multiple domain blocks:

```caddyfile
example.com, www.example.com {
    reverse_proxy gateway:3000
}

api.example.com {
    reverse_proxy gateway:3000
}
```

## Production Checklist

- [ ] DNS A/AAAA records configured
- [ ] Firewall ports 80, 443 open
- [ ] `ADMIN_EMAIL` set for Let's Encrypt notifications
- [ ] Health checks passing
- [ ] TLS certificate provisioned (check logs)
- [ ] HTTPS redirect enabled
- [ ] Security headers verified
- [ ] Monitoring configured
- [ ] Backup strategy in place
- [ ] Rate limiting configured (WAF or Traefik)

## References

- [Caddy Documentation](https://caddyserver.com/docs/)
- [Let's Encrypt Rate Limits](https://letsencrypt.org/docs/rate-limits/)
- [Mozilla SSL Configuration Generator](https://ssl-config.mozilla.org/)
- [MCP Gateway API Docs](../docs/API.md)
