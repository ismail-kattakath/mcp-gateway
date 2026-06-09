# Nginx Reverse Proxy Configuration

This guide shows how to deploy MCP Gateway behind Nginx for production-grade network security, TLS termination, and rate limiting.

Related: Epic #23 (Network Security)

---

## Why Nginx?

Nginx provides battle-tested features:

- **High performance** (C10K problem solved)
- **IP whitelisting** with allow/deny directives
- **Rate limiting** with `limit_req` module
- **TLS/SSL termination**
- **Load balancing** for high availability
- **Widely used** (20+ years of production hardening)

---

## Basic Setup

### nginx.conf

```nginx
# /etc/nginx/nginx.conf

user nginx;
worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;

events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';

    access_log /var/log/nginx/access.log main;

    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;

    # Rate limiting zones
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=100r/m;
    limit_req_zone $binary_remote_addr zone=admin_limit:10m rate=20r/m;

    # Include site configs
    include /etc/nginx/conf.d/*.conf;
}
```

### Site Configuration

```nginx
# /etc/nginx/conf.d/mcp-gateway.conf

upstream mcp_backend {
    server localhost:3000;
    keepalive 32;
}

server {
    listen 80;
    server_name mcp.example.com;

    # HTTP to HTTPS redirect
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name mcp.example.com;

    # TLS configuration
    ssl_certificate /etc/ssl/certs/mcp.example.com.crt;
    ssl_certificate_key /etc/ssl/private/mcp.example.com.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security headers
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;

    # IP whitelist
    allow 192.168.1.0/24;
    allow 10.0.0.0/8;
    deny all;

    # Rate limiting
    limit_req zone=api_limit burst=50 nodelay;

    # Proxy configuration
    location / {
        proxy_pass http://mcp_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";

        # SSE configuration (required for /sse endpoint)
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    # Health check (no rate limit)
    location /health {
        proxy_pass http://mcp_backend;
        access_log off;
    }
}
```

---

## Advanced Configuration

### IP Whitelisting

```nginx
# Allow specific IPs and CIDR ranges
location / {
    allow 192.168.1.0/24;
    allow 10.0.0.0/8;
    allow 203.0.113.42;
    deny all;

    proxy_pass http://mcp_backend;
}

# Allow CloudFlare IPs (if using CloudFlare)
location / {
    allow 173.245.48.0/20;
    allow 103.21.244.0/22;
    allow 103.22.200.0/22;
    # ... (CloudFlare IP list: https://www.cloudflare.com/ips/)
    deny all;

    proxy_pass http://mcp_backend;
}

# Geo-based blocking
geo $blocked_country {
    default 0;
    CN 1;  # Block China
    RU 1;  # Block Russia
}

server {
    if ($blocked_country) {
        return 403;
    }
}
```

### Rate Limiting

```nginx
# Define rate limit zones in http block
http {
    # Basic API rate limit: 100 requests/minute
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=100r/m;

    # Strict admin rate limit: 20 requests/minute
    limit_req_zone $binary_remote_addr zone=admin_limit:10m rate=20r/m;

    # Per-IP connection limit
    limit_conn_zone $binary_remote_addr zone=addr:10m;
}

server {
    # Apply rate limit with burst
    location /api {
        limit_req zone=api_limit burst=50 nodelay;
        proxy_pass http://mcp_backend;
    }

    # Stricter limit for admin endpoints
    location /api/servers {
        limit_req zone=admin_limit burst=10 nodelay;
        proxy_pass http://mcp_backend;
    }

    # Connection limit per IP
    location / {
        limit_conn addr 10;
        proxy_pass http://mcp_backend;
    }
}
```

### Load Balancing

```nginx
upstream mcp_backend {
    least_conn;  # Load balancing method

    server gateway1.internal:3000 max_fails=3 fail_timeout=30s;
    server gateway2.internal:3000 max_fails=3 fail_timeout=30s;
    server gateway3.internal:3000 backup;  # Backup server

    keepalive 32;
}

server {
    location / {
        proxy_pass http://mcp_backend;
        proxy_next_upstream error timeout http_502 http_503;
    }

    # Health check endpoint
    location /upstream_health {
        access_log off;
        proxy_pass http://mcp_backend/health;
    }
}
```

### Let's Encrypt (Certbot)

```bash
# Install certbot
sudo apt-get install certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d mcp.example.com

# Auto-renewal (already configured by certbot)
sudo certbot renew --dry-run
```

---

## Security Best Practices

### 1. IP Whitelisting (Defense-in-Depth)

Use **both** Nginx IP whitelist AND MCP Gateway firewall:

```nginx
# Nginx: Allow corporate network
location / {
    allow 10.0.0.0/8;
    deny all;
}
```

```bash
# MCP Gateway firewall: Allow specific dev IPs
mcp firewall allow 10.0.1.100
mcp firewall allow 10.0.2.0/24
```

### 2. Strong TLS Configuration

```nginx
# /etc/nginx/snippets/ssl-params.conf

ssl_protocols TLSv1.2 TLSv1.3;
ssl_prefer_server_ciphers on;
ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-AES256-GCM-SHA384;
ssl_ecdh_curve secp384r1;
ssl_session_timeout 10m;
ssl_session_cache shared:SSL:10m;
ssl_session_tickets off;
ssl_stapling on;
ssl_stapling_verify on;

# HSTS
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;

# Include in server block
server {
    include snippets/ssl-params.conf;
}
```

### 3. Request Body Size Limiting

```nginx
server {
    # Limit request body size (prevent DoS)
    client_max_body_size 1M;

    # Limit headers size
    large_client_header_buffers 2 1k;
}
```

### 4. Fail2Ban Integration

```bash
# /etc/fail2ban/filter.d/nginx-ratelimit.conf
[Definition]
failregex = limiting requests, excess:.* by zone.*client: <HOST>

# /etc/fail2ban/jail.local
[nginx-ratelimit]
enabled = true
port = http,https
filter = nginx-ratelimit
logpath = /var/log/nginx/error.log
maxretry = 5
bantime = 3600
findtime = 600
```

---

## Docker Deployment

### docker-compose.yml

```yaml
version: "3.8"

services:
  nginx:
    image: nginx:alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./conf.d:/etc/nginx/conf.d:ro
      - ./ssl:/etc/ssl:ro
      - ./logs:/var/log/nginx
    networks:
      - proxy
    depends_on:
      - mcp-gateway

  mcp-gateway:
    image: ghcr.io/ismail-kattakath/mcp-gateway:latest
    restart: unless-stopped
    volumes:
      - ./registry.json:/app/registry.json
      - gateway-data:/data
    networks:
      - proxy
    expose:
      - "3000"

networks:
  proxy:
    driver: bridge

volumes:
  gateway-data:
```

---

## Monitoring & Observability

### Access Logs

```nginx
log_format detailed '$remote_addr - $remote_user [$time_local] '
                    '"$request" $status $body_bytes_sent '
                    '"$http_referer" "$http_user_agent" '
                    '$request_time $upstream_response_time '
                    '$upstream_addr';

access_log /var/log/nginx/access.log detailed;
```

### Prometheus Metrics (nginx-prometheus-exporter)

```yaml
services:
  nginx-exporter:
    image: nginx/nginx-prometheus-exporter:latest
    command:
      - "-nginx.scrape-uri=http://nginx/metrics"
    ports:
      - "9113:9113"
    networks:
      - proxy
```

```nginx
# Enable stub_status for metrics
server {
    listen 8080;
    server_name localhost;

    location /metrics {
        stub_status on;
        access_log off;
        allow 127.0.0.1;
        deny all;
    }
}
```

---

## Troubleshooting

### Issue: 502 Bad Gateway

**Cause:** Nginx can't reach MCP Gateway

**Solution:**

1. Check backend is running: `curl http://localhost:3000/health`
2. Check Nginx can reach backend: `docker exec -it nginx curl http://mcp-gateway:3000/health`
3. Check upstream configuration in `nginx.conf`
4. Check firewall rules: `sudo iptables -L -n`

### Issue: Rate Limit Not Working

**Cause:** Shared memory zone too small

**Solution:**

```nginx
# Increase zone size
limit_req_zone $binary_remote_addr zone=api_limit:20m rate=100r/m;
```

### Issue: SSE Connection Drops

**Cause:** Proxy buffering enabled

**Solution:**

```nginx
location /sse {
    proxy_pass http://mcp_backend;
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 86400s;
    proxy_send_timeout 86400s;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
}
```

---

## Production Deployment Checklist

- [ ] Custom domain configured
- [ ] DNS pointing to server
- [ ] TLS certificate obtained (Let's Encrypt)
- [ ] IP whitelist configured
- [ ] Rate limiting enabled
- [ ] Security headers applied
- [ ] Access logs enabled
- [ ] Monitoring configured
- [ ] Health checks configured
- [ ] Fail2Ban configured
- [ ] Firewall rules (ufw/iptables) set
- [ ] Regular log rotation configured

---

## Example: Full Production Setup

```nginx
# /etc/nginx/nginx.conf (excerpt)
http {
    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=100r/m;
    limit_conn_zone $binary_remote_addr zone=addr:10m;

    # Logging
    log_format detailed '$remote_addr - $remote_user [$time_local] '
                        '"$request" $status $body_bytes_sent '
                        '"$http_referer" "$http_user_agent" '
                        '$request_time $upstream_response_time';

    access_log /var/log/nginx/access.log detailed;

    # Upstream
    upstream mcp {
        least_conn;
        server gateway1:3000 max_fails=3 fail_timeout=30s;
        server gateway2:3000 max_fails=3 fail_timeout=30s;
        keepalive 32;
    }

    # HTTPS server
    server {
        listen 443 ssl http2;
        server_name mcp.example.com;

        # TLS
        ssl_certificate /etc/letsencrypt/live/mcp.example.com/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/mcp.example.com/privkey.pem;
        include /etc/nginx/snippets/ssl-params.conf;

        # IP whitelist
        allow 10.0.0.0/8;
        allow 192.168.0.0/16;
        deny all;

        # Rate limiting
        limit_req zone=api burst=50 nodelay;
        limit_conn addr 10;

        # Request size limits
        client_max_body_size 1M;

        # Security headers
        add_header X-Frame-Options "DENY" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-XSS-Protection "1; mode=block" always;
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;

        # Proxy to MCP Gateway
        location / {
            proxy_pass http://mcp;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_set_header Connection "";

            # SSE support
            proxy_buffering off;
            proxy_cache off;
            proxy_read_timeout 86400s;
        }

        # Health check (no rate limit)
        location /health {
            proxy_pass http://mcp;
            access_log off;
        }
    }

    # HTTP redirect
    server {
        listen 80;
        server_name mcp.example.com;
        return 301 https://$server_name$request_uri;
    }
}
```

---

## See Also

- [Traefik Reverse Proxy Guide](./REVERSE_PROXY_TRAEFIK.md)
- [MCP Gateway Firewall Documentation](./FIREWALL.md)
- [Nginx Documentation](https://nginx.org/en/docs/)
