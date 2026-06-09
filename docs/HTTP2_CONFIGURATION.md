# HTTP/2 Configuration Guide

This guide covers HTTP/2 setup, configuration, and best practices for MCP Gateway v3.0.

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [SSL Certificate Setup](#ssl-certificate-setup)
4. [Basic Configuration](#basic-configuration)
5. [Advanced Configuration](#advanced-configuration)
6. [Reverse Proxy Setup](#reverse-proxy-setup)
7. [Verification](#verification)
8. [Troubleshooting](#troubleshooting)
9. [Performance Tuning](#performance-tuning)
10. [Security Considerations](#security-considerations)

## Overview

HTTP/2 provides significant performance improvements over HTTP/1.1:

- **Multiplexing**: Multiple requests over a single TCP connection
- **Header Compression**: HPACK algorithm reduces overhead by ~50%
- **Server Push**: Proactively send resources before requested
- **Stream Prioritization**: Prioritize critical requests
- **Binary Protocol**: More efficient parsing

**Performance gains:**

- **40% faster** page load times
- **50% reduction** in connection overhead
- **30% bandwidth** savings from header compression

## Prerequisites

### System Requirements

- Node.js 18+
- SSL certificates (required for HTTP/2)
- Modern client (browsers, curl, etc.) with HTTP/2 support

### Client Support

All modern browsers and tools support HTTP/2:

- Chrome 40+
- Firefox 36+
- Safari 9+
- Edge 12+
- curl 7.43+ (with `--http2` flag)

## SSL Certificate Setup

HTTP/2 requires HTTPS (TLS 1.2+). You have several options for obtaining SSL certificates.

### Option 1: Let's Encrypt (Production)

**Recommended for production deployments.**

Let's Encrypt provides free, automated SSL certificates.

```bash
# Install certbot
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install certbot

# macOS
brew install certbot

# Obtain certificate (standalone mode)
sudo certbot certonly --standalone -d yourdomain.com -d www.yourdomain.com

# Certificates are saved to:
# /etc/letsencrypt/live/yourdomain.com/privkey.pem
# /etc/letsencrypt/live/yourdomain.com/fullchain.pem
```

**Auto-renewal:**

```bash
# Test renewal
sudo certbot renew --dry-run

# Set up automatic renewal (cron)
echo "0 12 * * * /usr/bin/certbot renew --quiet" | sudo tee -a /etc/crontab > /dev/null
```

**Configure MCP Gateway:**

```bash
export SSL_KEY_PATH=/etc/letsencrypt/live/yourdomain.com/privkey.pem
export SSL_CERT_PATH=/etc/letsencrypt/live/yourdomain.com/fullchain.pem
export ENABLE_HTTP2=true

npm start
```

### Option 2: Self-Signed Certificates (Development)

**Only for development/testing. Never use in production.**

```bash
# Generate private key
openssl genrsa -out server.key 2048

# Generate certificate signing request
openssl req -new -key server.key -out server.csr

# Generate self-signed certificate (valid for 365 days)
openssl x509 -req -days 365 -in server.csr -signkey server.key -out server.crt

# Configure MCP Gateway
export SSL_KEY_PATH=./server.key
export SSL_CERT_PATH=./server.crt
export ENABLE_HTTP2=true

npm start
```

**Accept self-signed cert in curl:**

```bash
curl -k --http2 https://localhost:3000/health
```

**Accept self-signed cert in browser:**

Navigate to `https://localhost:3000`, click "Advanced", then "Proceed to localhost (unsafe)".

### Option 3: Certificate Authority (Enterprise)

For enterprise deployments, obtain certificates from your organization's CA.

```bash
# Typical file locations
export SSL_KEY_PATH=/etc/ssl/private/server.key
export SSL_CERT_PATH=/etc/ssl/certs/server.crt
export SSL_CA_PATH=/etc/ssl/certs/ca.crt  # Optional

export ENABLE_HTTP2=true
npm start
```

### Certificate Verification

Verify your certificate:

```bash
# Check certificate details
openssl x509 -in $SSL_CERT_PATH -text -noout

# Verify certificate matches private key
openssl x509 -noout -modulus -in $SSL_CERT_PATH | openssl md5
openssl rsa -noout -modulus -in $SSL_KEY_PATH | openssl md5
# (hashes should match)

# Check certificate expiration
openssl x509 -noout -dates -in $SSL_CERT_PATH
```

## Basic Configuration

### Environment Variables

HTTP/2 is configured via environment variables:

```bash
# Enable HTTP/2 (requires SSL certificates)
ENABLE_HTTP2=true

# SSL certificate paths
SSL_KEY_PATH=/path/to/server.key
SSL_CERT_PATH=/path/to/server.crt
SSL_CA_PATH=/path/to/ca.crt  # Optional

# Allow HTTP/1.1 fallback (ALPN negotiation)
HTTP2_ALLOW_HTTP1=true

# Max concurrent streams per connection
HTTP2_MAX_CONCURRENT_STREAMS=100

# Enable server push
HTTP2_PUSH_ENABLED=false
```

### Configuration File

Alternatively, create a `.env` file:

```bash
# .env
ENABLE_HTTP2=true
SSL_KEY_PATH=/etc/letsencrypt/live/yourdomain.com/privkey.pem
SSL_CERT_PATH=/etc/letsencrypt/live/yourdomain.com/fullchain.pem
HTTP2_ALLOW_HTTP1=true
HTTP2_MAX_CONCURRENT_STREAMS=100
HTTP2_PUSH_ENABLED=false
```

Load automatically:

```bash
npm start
```

### Docker Setup

**Dockerfile:**

```dockerfile
FROM node:18-alpine

# Install ca-certificates for HTTPS
RUN apk add --no-cache ca-certificates

WORKDIR /app
COPY . .
RUN npm install && npm run build

# Copy SSL certificates (mount as volume)
VOLUME /app/certs

# Configure HTTP/2
ENV ENABLE_HTTP2=true
ENV SSL_KEY_PATH=/app/certs/server.key
ENV SSL_CERT_PATH=/app/certs/server.crt

EXPOSE 3000
CMD ["npm", "start"]
```

**docker-compose.yml:**

```yaml
version: "3.8"

services:
  mcp-gateway:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ./certs:/app/certs:ro
      - ./registry.json:/app/registry.json
    environment:
      ENABLE_HTTP2: "true"
      SSL_KEY_PATH: /app/certs/server.key
      SSL_CERT_PATH: /app/certs/server.crt
      HTTP2_ALLOW_HTTP1: "true"
```

## Advanced Configuration

### ALPN Protocol Negotiation

HTTP/2 uses ALPN (Application-Layer Protocol Negotiation) to negotiate the protocol version.

**Server supports:**

- `h2` (HTTP/2 over TLS)
- `http/1.1` (HTTP/1.1 over TLS, fallback)

**Client advertises supported protocols:**

```bash
# Force HTTP/2
curl --http2 https://localhost:3000/health

# Allow fallback
curl --http2-prior-knowledge https://localhost:3000/health
```

### Stream Management

HTTP/2 allows multiple concurrent streams per connection.

**Configuration:**

```bash
# Max concurrent streams (default: 100)
HTTP2_MAX_CONCURRENT_STREAMS=100
```

**Recommendations:**

- **Low traffic**: 50 streams
- **Medium traffic**: 100 streams (default)
- **High traffic**: 200+ streams

**Monitoring:**

Check active streams via metrics:

```bash
curl http://localhost:3000/metrics | grep http2_streams
```

### Server Push (Experimental)

Server push proactively sends resources before the client requests them.

**Enable:**

```bash
HTTP2_PUSH_ENABLED=true
```

**Use cases:**

- Push critical CSS/JS with HTML page
- Push API responses with related data

**Example:**

```javascript
// Client requests /api/servers
// Server pushes /api/servers/server1, /api/servers/server2, etc.
```

**Note**: Server push is disabled by default. Most use cases are better served by HTTP/2 multiplexing.

### Header Compression (HPACK)

HTTP/2 automatically compresses headers using HPACK. No configuration needed.

**Benefits:**

- **50% reduction** in header size
- **Faster** request/response times
- **Less bandwidth** for repeated requests

**Monitoring:**

Check compression ratio via metrics:

```bash
curl http://localhost:3000/metrics | grep http2_header_compression_ratio
```

## Reverse Proxy Setup

For production deployments, use a reverse proxy (nginx, Caddy, HAProxy) to handle HTTPS and HTTP/2.

### nginx

**Configuration:**

```nginx
# /etc/nginx/sites-available/mcp-gateway

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    # SSL configuration
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # HTTP/2 settings
    http2_max_field_size 16k;
    http2_max_header_size 32k;
    http2_max_concurrent_streams 128;

    # Proxy to MCP Gateway
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # SSE support (for MCP transport)
    location /sse {
        proxy_pass http://localhost:3000/sse;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 86400s;
    }
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}
```

**Enable:**

```bash
sudo ln -s /etc/nginx/sites-available/mcp-gateway /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Caddy

**Configuration:**

```
# /etc/caddy/Caddyfile

yourdomain.com {
    # Automatic HTTPS (Let's Encrypt)
    reverse_proxy localhost:3000 {
        # HTTP/2 automatic
        header_up Host {host}
        header_up X-Real-IP {remote}
        header_up X-Forwarded-For {remote}
        header_up X-Forwarded-Proto {scheme}
    }

    # SSE support
    @sse path /sse*
    reverse_proxy @sse localhost:3000 {
        flush_interval -1
    }
}
```

**Enable:**

```bash
sudo systemctl reload caddy
```

**Caddy advantages:**

- Automatic HTTPS (Let's Encrypt)
- Automatic HTTP/2
- Simple configuration
- Automatic certificate renewal

### HAProxy

**Configuration:**

```
# /etc/haproxy/haproxy.cfg

frontend https-in
    bind *:443 ssl crt /etc/ssl/certs/yourdomain.pem alpn h2,http/1.1
    mode http
    option httplog
    use_backend mcp-gateway

backend mcp-gateway
    mode http
    balance roundrobin
    option forwardfor
    http-request set-header X-Forwarded-Proto https if { ssl_fc }
    server gateway1 localhost:3000 check
```

**Enable:**

```bash
sudo systemctl reload haproxy
```

## Verification

### Test HTTP/2 Support

**Using curl:**

```bash
# Test with verbose output
curl -v --http2 https://localhost:3000/health

# Check for "HTTP/2 200" in response
# Should see: < HTTP/2 200

# Check ALPN negotiation
curl -v --http2 https://localhost:3000/health 2>&1 | grep -i alpn
# Should see: ALPN, server accepted to use h2
```

**Using browser:**

1. Open Chrome DevTools (F12)
2. Navigate to Network tab
3. Load `https://localhost:3000`
4. Check Protocol column (should show "h2")

**Using openssl:**

```bash
# Test ALPN negotiation
openssl s_client -alpn h2,http/1.1 -connect localhost:3000 < /dev/null | grep "ALPN"
# Should see: ALPN protocol: h2
```

### Performance Comparison

**Benchmark HTTP/1.1:**

```bash
wrk -t4 -c100 -d30s http://localhost:3000/api/servers
# Note: Requests/sec
```

**Benchmark HTTP/2:**

```bash
wrk -t4 -c100 -d30s https://localhost:3000/api/servers
# Note: Requests/sec (should be 2-3x higher)
```

### Monitor Active Connections

**Check metrics:**

```bash
curl http://localhost:3000/metrics | grep http2

# Example output:
# http2_active_connections 45
# http2_active_streams 123
# http2_max_concurrent_streams 100
```

## Troubleshooting

### Issue: "HTTP/2 disabled, using HTTP/1.1"

**Cause**: SSL certificates not configured

**Solution**:

```bash
# Verify SSL_KEY_PATH and SSL_CERT_PATH are set
echo $SSL_KEY_PATH
echo $SSL_CERT_PATH

# Verify files exist
ls -la $SSL_KEY_PATH
ls -la $SSL_CERT_PATH

# Check file permissions
sudo chmod 600 $SSL_KEY_PATH
sudo chmod 644 $SSL_CERT_PATH
```

### Issue: "SSL key file not found"

**Cause**: Invalid SSL_KEY_PATH

**Solution**:

```bash
# Check path
export SSL_KEY_PATH=/etc/letsencrypt/live/yourdomain.com/privkey.pem

# Verify file exists
sudo ls -la /etc/letsencrypt/live/yourdomain.com/
```

### Issue: Client connects via HTTP/1.1 instead of HTTP/2

**Cause**: Client doesn't support HTTP/2 or ALPN negotiation failed

**Solution**:

```bash
# Test ALPN negotiation
openssl s_client -alpn h2,http/1.1 -connect localhost:3000

# If ALPN fails, check SSL configuration
openssl x509 -in $SSL_CERT_PATH -text -noout | grep "X509v3 Subject Alternative Name"
```

### Issue: "Too many concurrent streams"

**Cause**: HTTP2_MAX_CONCURRENT_STREAMS too low

**Solution**:

```bash
# Increase max concurrent streams
export HTTP2_MAX_CONCURRENT_STREAMS=200
```

## Performance Tuning

### Optimal Settings

**Low traffic** (<100 req/s):

```bash
HTTP2_MAX_CONCURRENT_STREAMS=50
```

**Medium traffic** (100-1,000 req/s):

```bash
HTTP2_MAX_CONCURRENT_STREAMS=100
```

**High traffic** (>1,000 req/s):

```bash
HTTP2_MAX_CONCURRENT_STREAMS=200
```

### TCP Optimization

**Linux kernel parameters** (for high traffic):

```bash
# /etc/sysctl.conf

# Increase max connections
net.core.somaxconn = 4096

# Increase backlog
net.ipv4.tcp_max_syn_backlog = 8192

# Enable TCP Fast Open
net.ipv4.tcp_fastopen = 3

# Increase buffer sizes
net.core.rmem_max = 16777216
net.core.wmem_max = 16777216
net.ipv4.tcp_rmem = 4096 87380 16777216
net.ipv4.tcp_wmem = 4096 65536 16777216

# Apply changes
sudo sysctl -p
```

## Security Considerations

### TLS Configuration

**Recommended settings:**

```bash
# /etc/nginx/sites-available/mcp-gateway

ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384';
ssl_prefer_server_ciphers on;
ssl_session_cache shared:SSL:10m;
ssl_session_timeout 10m;
ssl_stapling on;
ssl_stapling_verify on;
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
```

### Certificate Validation

**Reject self-signed certificates in production:**

```javascript
// Node.js client
const https = require("https");
const agent = new https.Agent({
  rejectUnauthorized: true, // Enforce certificate validation
});

fetch("https://yourdomain.com/api/servers", { agent });
```

### Rate Limiting

**Prevent abuse:**

```bash
# nginx rate limiting
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;

server {
    location /api/ {
        limit_req zone=api burst=20 nodelay;
        proxy_pass http://localhost:3000;
    }
}
```

## Conclusion

HTTP/2 provides significant performance improvements for MCP Gateway. Follow this guide to:

1. Obtain SSL certificates (Let's Encrypt recommended)
2. Configure HTTP/2 via environment variables
3. Verify HTTP/2 support with curl or browser
4. Tune settings based on traffic load
5. Monitor performance via metrics

For production deployments, use a reverse proxy (nginx or Caddy) to handle HTTPS and HTTP/2.

For further assistance, see:

- [Performance Tuning Guide](PERFORMANCE_TUNING.md)
- [SSL/TLS Best Practices](https://ssl-config.mozilla.org/)
- [Let's Encrypt Documentation](https://letsencrypt.org/docs/)
