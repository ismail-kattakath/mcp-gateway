# Traefik Reverse Proxy Configuration

This guide shows how to deploy MCP Gateway behind Traefik for production-grade network security, TLS termination, and rate limiting.

Related: Epic #23 (Network Security)

---

## Why Traefik?

Traefik provides enterprise-grade features:

- **Automatic HTTPS** with Let's Encrypt
- **IP whitelisting** at proxy level (defense-in-depth)
- **Rate limiting** to prevent abuse
- **Load balancing** for high availability
- **Zero-downtime deployments**
- **Automatic service discovery** (Docker labels)

---

## Basic Setup

### docker-compose.yml

```yaml
version: "3.8"

services:
  traefik:
    image: traefik:v2.10
    container_name: traefik
    restart: unless-stopped
    command:
      # Enable Docker provider
      - "--providers.docker=true"
      - "--providers.docker.exposedbydefault=false"

      # HTTP entrypoint
      - "--entrypoints.web.address=:80"

      # HTTPS entrypoint
      - "--entrypoints.websecure.address=:443"

      # Let's Encrypt ACME
      - "--certificatesresolvers.letsencrypt.acme.email=admin@example.com"
      - "--certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json"
      - "--certificatesresolvers.letsencrypt.acme.tlschallenge=true"

      # Dashboard (optional)
      - "--api.dashboard=true"

      # Logging
      - "--log.level=INFO"
      - "--accesslog=true"

    ports:
      - "80:80"
      - "443:443"
      - "8080:8080" # Dashboard (secure in production!)

    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./letsencrypt:/letsencrypt

    networks:
      - proxy

  mcp-gateway:
    image: ghcr.io/ismail-kattakath/mcp-gateway:latest
    container_name: mcp-gateway
    restart: unless-stopped
    volumes:
      - ./registry.json:/app/registry.json
      - gateway-data:/data

    networks:
      - proxy

    labels:
      # Enable Traefik
      - "traefik.enable=true"

      # Router configuration
      - "traefik.http.routers.mcp.rule=Host(`mcp.example.com`)"
      - "traefik.http.routers.mcp.entrypoints=websecure"
      - "traefik.http.routers.mcp.tls.certresolver=letsencrypt"
      - "traefik.http.routers.mcp.service=mcp-service"

      # Service configuration
      - "traefik.http.services.mcp-service.loadbalancer.server.port=3000"

      # IP whitelist middleware
      - "traefik.http.middlewares.mcp-ipwhitelist.ipwhitelist.sourcerange=192.168.1.0/24,10.0.0.0/8"

      # Rate limiting middleware
      - "traefik.http.middlewares.mcp-ratelimit.ratelimit.average=100"
      - "traefik.http.middlewares.mcp-ratelimit.ratelimit.burst=50"
      - "traefik.http.middlewares.mcp-ratelimit.ratelimit.period=1m"

      # Apply middlewares
      - "traefik.http.routers.mcp.middlewares=mcp-ipwhitelist@docker,mcp-ratelimit@docker"

      # HTTP to HTTPS redirect
      - "traefik.http.routers.mcp-http.rule=Host(`mcp.example.com`)"
      - "traefik.http.routers.mcp-http.entrypoints=web"
      - "traefik.http.routers.mcp-http.middlewares=redirect-to-https"
      - "traefik.http.middlewares.redirect-to-https.redirectscheme.scheme=https"

networks:
  proxy:
    driver: bridge

volumes:
  gateway-data:
```

---

## Advanced Configuration

### IP Whitelisting

```yaml
# Allow specific IPs and CIDR ranges
labels:
  - "traefik.http.middlewares.mcp-ipwhitelist.ipwhitelist.sourcerange=192.168.1.0/24,10.0.0.0/8,203.0.113.42"

  # Allow CloudFlare IPs (if using CloudFlare)
  - "traefik.http.middlewares.mcp-cf-whitelist.ipwhitelist.sourcerange=173.245.48.0/20,103.21.244.0/22,103.22.200.0/22"
```

### Rate Limiting

```yaml
labels:
  # Basic rate limit: 100 requests/minute, burst 50
  - "traefik.http.middlewares.mcp-ratelimit.ratelimit.average=100"
  - "traefik.http.middlewares.mcp-ratelimit.ratelimit.burst=50"
  - "traefik.http.middlewares.mcp-ratelimit.ratelimit.period=1m"

  # Stricter rate limit for production
  - "traefik.http.middlewares.mcp-ratelimit-strict.ratelimit.average=50"
  - "traefik.http.middlewares.mcp-ratelimit-strict.ratelimit.burst=20"
  - "traefik.http.middlewares.mcp-ratelimit-strict.ratelimit.period=1m"
```

### Custom Headers

```yaml
labels:
  # Security headers
  - "traefik.http.middlewares.mcp-headers.headers.customresponseheaders.X-Frame-Options=DENY"
  - "traefik.http.middlewares.mcp-headers.headers.customresponseheaders.X-Content-Type-Options=nosniff"
  - "traefik.http.middlewares.mcp-headers.headers.customresponseheaders.X-XSS-Protection=1; mode=block"
  - "traefik.http.middlewares.mcp-headers.headers.sslredirect=true"
  - "traefik.http.middlewares.mcp-headers.headers.stsincludesubdomains=true"
  - "traefik.http.middlewares.mcp-headers.headers.stspreload=true"
  - "traefik.http.middlewares.mcp-headers.headers.stsseconds=31536000"

  # Apply headers middleware
  - "traefik.http.routers.mcp.middlewares=mcp-headers@docker"
```

### Load Balancing (Multiple Gateway Instances)

```yaml
services:
  mcp-gateway-1:
    image: ghcr.io/ismail-kattakath/mcp-gateway:latest
    labels:
      - "traefik.http.services.mcp-service.loadbalancer.server.port=3000"
      - "traefik.http.services.mcp-service.loadbalancer.healthcheck.path=/health"
      - "traefik.http.services.mcp-service.loadbalancer.healthcheck.interval=10s"

  mcp-gateway-2:
    image: ghcr.io/ismail-kattakath/mcp-gateway:latest
    labels:
      - "traefik.http.services.mcp-service.loadbalancer.server.port=3000"
```

---

## Monitoring & Observability

### Traefik Dashboard

Access the dashboard at `http://your-server:8080/dashboard/`

**Production warning:** Secure the dashboard with auth or IP whitelist!

```yaml
labels:
  # Dashboard with basic auth
  - "traefik.http.routers.dashboard.rule=Host(`traefik.example.com`)"
  - "traefik.http.routers.dashboard.service=api@internal"
  - "traefik.http.routers.dashboard.middlewares=dashboard-auth"
  - "traefik.http.middlewares.dashboard-auth.basicauth.users=admin:$$apr1$$..."
```

### Access Logs

Enable access logs for audit trail:

```yaml
command:
  - "--accesslog=true"
  - "--accesslog.filepath=/var/log/traefik/access.log"
  - "--accesslog.format=json"

volumes:
  - ./logs:/var/log/traefik
```

### Prometheus Metrics

```yaml
command:
  - "--metrics.prometheus=true"
  - "--metrics.prometheus.entrypoint=metrics"
  - "--entrypoints.metrics.address=:8082"

ports:
  - "8082:8082" # Metrics endpoint
```

---

## Security Best Practices

### 1. IP Whitelisting (Defense-in-Depth)

Use **both** Traefik IP whitelist AND MCP Gateway firewall:

```bash
# Traefik: Allow corporate network
traefik.http.middlewares.mcp-ipwhitelist.ipwhitelist.sourcerange=10.0.0.0/8

# MCP Gateway firewall: Allow specific dev IPs
mcp firewall allow 10.0.1.100
mcp firewall allow 10.0.2.0/24
```

### 2. TLS Configuration

Use strong TLS settings:

```yaml
command:
  # TLS 1.2+ only
  - "--entrypoints.websecure.http.tls.options=default"

# traefik.yml (static config)
tls:
  options:
    default:
      minVersion: VersionTLS12
      cipherSuites:
        - TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256
        - TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384
        - TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256
        - TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384
```

### 3. Rate Limiting

Implement graduated rate limits:

- **Health endpoints**: No limit (monitoring)
- **Public endpoints**: 100 req/min
- **Admin endpoints**: 20 req/min

```yaml
labels:
  - "traefik.http.routers.mcp-admin.rule=Host(`mcp.example.com`) && PathPrefix(`/api/servers`)"
  - "traefik.http.routers.mcp-admin.middlewares=admin-ratelimit"
  - "traefik.http.middlewares.admin-ratelimit.ratelimit.average=20"
```

### 4. Fail2Ban Integration

Ban IPs that trigger too many rate limits:

```bash
# /etc/fail2ban/filter.d/traefik-ratelimit.conf
[Definition]
failregex = ^.*"ClientAddr":"<HOST>.*level=error.*ratelimit.*$

# /etc/fail2ban/jail.local
[traefik-ratelimit]
enabled = true
port = http,https
filter = traefik-ratelimit
logpath = /var/log/traefik/access.log
maxretry = 5
bantime = 3600
```

---

## Troubleshooting

### Issue: 502 Bad Gateway

**Cause:** Traefik can't reach MCP Gateway

**Solution:**

1. Check networks: `docker network inspect proxy`
2. Verify gateway is running: `docker ps | grep mcp-gateway`
3. Check gateway logs: `docker logs mcp-gateway`
4. Verify port: `traefik.http.services.mcp-service.loadbalancer.server.port=3000`

### Issue: TLS Certificate Not Working

**Cause:** Let's Encrypt rate limit or DNS issues

**Solution:**

1. Check DNS: `nslookup mcp.example.com`
2. Check port 80 is accessible (ACME challenge)
3. Check Traefik logs: `docker logs traefik | grep acme`
4. Use staging: `--certificatesresolvers.letsencrypt.acme.caserver=https://acme-staging-v02.api.letsencrypt.org/directory`

### Issue: Rate Limit Not Working

**Cause:** IP detection behind CloudFlare

**Solution:**

1. Trust CloudFlare IPs in Traefik:

   ```yaml
   command:
     - "--entrypoints.websecure.forwardedHeaders.trustedIPs=173.245.48.0/20,103.21.244.0/22"
   ```

2. Or use CloudFlare rate limiting instead

---

## Production Deployment Checklist

- [ ] Custom domain configured
- [ ] DNS pointing to server
- [ ] Let's Encrypt email set
- [ ] IP whitelist configured
- [ ] Rate limiting enabled
- [ ] Security headers applied
- [ ] Dashboard secured or disabled
- [ ] Access logs enabled
- [ ] Monitoring configured
- [ ] Health checks configured
- [ ] Backup strategy for `acme.json`

---

## Example: Full Production Setup

```yaml
version: "3.8"

services:
  traefik:
    image: traefik:v2.10
    restart: unless-stopped
    command:
      - "--providers.docker=true"
      - "--providers.docker.exposedbydefault=false"
      - "--entrypoints.web.address=:80"
      - "--entrypoints.websecure.address=:443"
      - "--certificatesresolvers.letsencrypt.acme.email=admin@example.com"
      - "--certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json"
      - "--certificatesresolvers.letsencrypt.acme.tlschallenge=true"
      - "--accesslog=true"
      - "--accesslog.filepath=/logs/access.log"
      - "--accesslog.format=json"
      - "--log.level=INFO"
      - "--metrics.prometheus=true"
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./letsencrypt:/letsencrypt
      - ./logs:/logs
    networks:
      - proxy

  mcp-gateway:
    image: ghcr.io/ismail-kattakath/mcp-gateway:latest
    restart: unless-stopped
    environment:
      - LOG_LEVEL=info
      - GATEWAY_PORT=3000
    volumes:
      - ./registry.json:/app/registry.json
      - gateway-data:/data
    networks:
      - proxy
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.mcp.rule=Host(`mcp.example.com`)"
      - "traefik.http.routers.mcp.entrypoints=websecure"
      - "traefik.http.routers.mcp.tls.certresolver=letsencrypt"
      - "traefik.http.services.mcp-service.loadbalancer.server.port=3000"
      - "traefik.http.services.mcp-service.loadbalancer.healthcheck.path=/health"
      - "traefik.http.middlewares.mcp-ipwhitelist.ipwhitelist.sourcerange=10.0.0.0/8"
      - "traefik.http.middlewares.mcp-ratelimit.ratelimit.average=100"
      - "traefik.http.middlewares.mcp-ratelimit.ratelimit.burst=50"
      - "traefik.http.middlewares.mcp-headers.headers.sslredirect=true"
      - "traefik.http.routers.mcp.middlewares=mcp-ipwhitelist,mcp-ratelimit,mcp-headers"

networks:
  proxy:
    driver: bridge

volumes:
  gateway-data:
```

---

## See Also

- [Nginx Reverse Proxy Guide](./REVERSE_PROXY_NGINX.md)
- [MCP Gateway Firewall Documentation](./FIREWALL.md)
- [Traefik Documentation](https://doc.traefik.io/traefik/)
