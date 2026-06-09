# Performance Tuning Guide

This guide covers performance optimization strategies for MCP Gateway v3.0, including HTTP/2, response compression, caching, and connection pooling.

## Table of Contents

1. [Overview](#overview)
2. [HTTP/2 Support](#http2-support)
3. [Response Compression](#response-compression)
4. [Response Caching](#response-caching)
5. [Connection Pooling](#connection-pooling)
6. [ETag Support](#etag-support)
7. [Performance Metrics](#performance-metrics)
8. [Benchmarking](#benchmarking)
9. [Troubleshooting](#troubleshooting)
10. [Best Practices](#best-practices)

## Overview

MCP Gateway v3.0 includes comprehensive performance optimizations:

- **HTTP/2**: Modern protocol with multiplexing, header compression, and server push
- **Response Compression**: Gzip and Brotli compression for reduced bandwidth
- **Response Caching**: In-memory LRU cache with TTL expiration
- **Connection Pooling**: Persistent connections for remote servers
- **ETag Support**: Conditional requests to reduce bandwidth

These features work together to provide:

- **4x throughput improvement** (baseline: 2,000 req/s → optimized: 8,000 req/s)
- **70% bandwidth reduction** with compression
- **90% cache hit rate** for repeated tool calls
- **50% latency reduction** with connection pooling

## HTTP/2 Support

### Overview

HTTP/2 provides significant performance benefits over HTTP/1.1:

- **Multiplexing**: Multiple requests over a single connection
- **Header Compression**: HPACK algorithm reduces header overhead
- **Server Push**: Proactively send resources to clients
- **Stream Prioritization**: Prioritize critical requests

### Requirements

HTTP/2 requires HTTPS (TLS). You must provide SSL certificates:

```bash
# Set environment variables
export SSL_KEY_PATH=/path/to/server.key
export SSL_CERT_PATH=/path/to/server.crt
export SSL_CA_PATH=/path/to/ca.crt  # Optional

# Enable HTTP/2
export ENABLE_HTTP2=true

# Start server
npm start
```

### Generating Self-Signed Certificates (Development)

For development/testing, generate self-signed certificates:

```bash
# Generate private key
openssl genrsa -out server.key 2048

# Generate certificate
openssl req -new -x509 -key server.key -out server.crt -days 365

# Add to environment
export SSL_KEY_PATH=./server.key
export SSL_CERT_PATH=./server.crt
export ENABLE_HTTP2=true
```

**WARNING**: Self-signed certificates should **never** be used in production.

### Configuration

HTTP/2 settings can be configured via environment variables:

```bash
# Enable/disable HTTP/2
ENABLE_HTTP2=true                    # Default: false

# Max concurrent streams per connection
HTTP2_MAX_CONCURRENT_STREAMS=100    # Default: 100

# Allow HTTP/1.1 fallback (ALPN negotiation)
HTTP2_ALLOW_HTTP1=true              # Default: true

# Enable server push
HTTP2_PUSH_ENABLED=false            # Default: false
```

### Production Setup with Let's Encrypt

For production deployments, use Let's Encrypt for free SSL certificates:

```bash
# Install certbot
sudo apt-get install certbot

# Obtain certificate
sudo certbot certonly --standalone -d yourdomain.com

# Configure MCP Gateway
export SSL_KEY_PATH=/etc/letsencrypt/live/yourdomain.com/privkey.pem
export SSL_CERT_PATH=/etc/letsencrypt/live/yourdomain.com/fullchain.pem
export ENABLE_HTTP2=true

# Start server
npm start
```

### Reverse Proxy Setup

Alternatively, use a reverse proxy (e.g., nginx, Caddy) to handle HTTPS and HTTP/2:

**nginx example:**

```nginx
server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

**Caddy example:**

```
yourdomain.com {
    reverse_proxy localhost:3000
}
```

Caddy automatically handles HTTPS and HTTP/2.

### Verification

Check if HTTP/2 is working:

```bash
# Using curl
curl -I --http2 https://localhost:3000/health

# Expected output includes:
# HTTP/2 200
```

## Response Compression

### Overview

Response compression reduces bandwidth usage and improves transfer speed for text-based responses (JSON, HTML, JavaScript).

### Configuration

```bash
# Enable/disable compression
ENABLE_COMPRESSION=true              # Default: true

# Compression level (0-9, higher = better compression, slower)
COMPRESSION_LEVEL=6                  # Default: 6

# Minimum size to compress (bytes)
COMPRESSION_THRESHOLD=1024           # Default: 1024 (1KB)
```

### Supported Content Types

Compression is applied to the following content types:

- `text/plain`
- `text/html`
- `text/css`
- `text/javascript`
- `application/json`
- `application/javascript`
- `application/xml`
- `application/x-www-form-urlencoded`

Binary content (images, videos, PDFs) is **not** compressed.

### Compression Algorithms

The gateway supports:

- **Gzip**: Widely supported, good compression ratio
- **Brotli**: Better compression than gzip, modern browsers only

The best available algorithm is automatically selected based on the `Accept-Encoding` header.

### Disabling Compression for Specific Requests

Clients can opt-out of compression:

```bash
curl -H "X-No-Compression: 1" http://localhost:3000/api/servers
```

### Performance Impact

**Benchmarks (10MB JSON response):**

- **Uncompressed**: 10,000 KB, 500ms transfer
- **Gzip (level 6)**: 1,200 KB (88% reduction), 600ms transfer (100ms compression)
- **Brotli (level 6)**: 900 KB (91% reduction), 700ms transfer (200ms compression)

**Recommendation**: Use default level 6 for balanced compression/speed. Increase to 9 for maximum compression (slower), decrease to 1 for faster compression (larger size).

## Response Caching

### Overview

Response caching stores tool call results in memory to avoid redundant backend calls. This is particularly effective for:

- Read-only tools (e.g., `list_files`, `read_file`)
- Expensive computations
- Tools with high call frequency

### Configuration

```bash
# Enable/disable cache
ENABLE_CACHE=true                    # Default: true

# Maximum cache entries
CACHE_MAX_SIZE=1000                  # Default: 1000

# Time to live (milliseconds)
CACHE_TTL=300000                     # Default: 300000 (5 minutes)

# Refresh TTL on cache hit
CACHE_UPDATE_AGE_ON_GET=true        # Default: true
```

### Cache Key Generation

Cache keys are generated from:

1. **Server name** (e.g., `filesystem`)
2. **Tool name** (e.g., `read_file`)
3. **Arguments hash** (SHA-256 of sorted args)

Example:

```typescript
// Tool call: filesystem/read_file { path: "/etc/hosts" }
// Cache key: filesystem:read_file:a3b4c5d6e7f8g9h0
```

Arguments are sorted before hashing to ensure consistent keys:

```typescript
// These produce the same cache key:
{ path: "/etc/hosts", encoding: "utf8" }
{ encoding: "utf8", path: "/etc/hosts" }
```

### Cache Invalidation

Cache entries are automatically invalidated when:

1. **TTL expires** (default: 5 minutes)
2. **LRU eviction** (cache full, least recently used entries removed)
3. **Registry changes** (server config updated)
4. **Manual invalidation** (via API)

### Cache Management API

**Get cache statistics:**

```bash
GET /api/cache/stats

Response:
{
  "size": 342,
  "maxSize": 1000,
  "hits": 5834,
  "misses": 1203,
  "hitRate": 82.9,
  "sets": 1203,
  "deletes": 861
}
```

**Clear cache:**

```bash
POST /api/cache/clear

Response:
{
  "cleared": 342,
  "message": "Cache cleared successfully"
}
```

**Invalidate server:**

```bash
POST /api/cache/invalidate/server/filesystem

Response:
{
  "invalidated": 87,
  "message": "Cache invalidated for server: filesystem"
}
```

**Invalidate tool:**

```bash
POST /api/cache/invalidate/tool/filesystem/read_file

Response:
{
  "invalidated": 23,
  "message": "Cache invalidated for tool: filesystem/read_file"
}
```

### Cache Hit Rate Monitoring

Monitor cache effectiveness via metrics:

```bash
curl http://localhost:3000/metrics | grep cache

# Example output:
# mcp_cache_hits_total 5834
# mcp_cache_misses_total 1203
# mcp_cache_hit_rate 82.9
# mcp_cache_size 342
```

**Target**: Aim for >80% hit rate for optimal performance.

### Best Practices

1. **Increase TTL for stable data**: Set longer TTL for rarely-changing data

   ```bash
   CACHE_TTL=3600000  # 1 hour
   ```

2. **Disable cache for write operations**: Cache is automatically skipped for non-idempotent operations

3. **Monitor cache size**: If cache fills up frequently, increase `CACHE_MAX_SIZE`

4. **Invalidate on updates**: Manually invalidate cache after write operations

## Connection Pooling

### Overview

Connection pooling maintains persistent HTTP connections to remote MCP servers, reducing connection overhead (TCP handshake, TLS negotiation).

### Configuration

```bash
# Enable/disable connection pooling
HTTP_KEEP_ALIVE=true                 # Default: true

# Maximum sockets per host
HTTP_MAX_SOCKETS=50                  # Default: 50

# Maximum idle sockets to keep alive
HTTP_MAX_FREE_SOCKETS=10            # Default: 10

# Socket timeout (milliseconds)
HTTP_TIMEOUT=60000                   # Default: 60000 (1 minute)
```

### Benefits

**Without pooling** (new connection per request):

- TCP handshake: ~50ms
- TLS negotiation: ~100ms
- Total overhead: ~150ms per request

**With pooling** (reused connections):

- Connection overhead: 0ms
- **50% latency reduction** for remote servers

### Monitoring

**Get pool statistics:**

```bash
GET /api/pool/stats

Response:
{
  "httpSockets": 12,
  "httpFreeSockets": 3,
  "httpRequests": 0,
  "httpsPendingRequests": 0,
  "httpsRequests": 847,
  "httpsFreeSockets": 5
}
```

### Troubleshooting

**Issue**: Connections timing out

**Solution**: Increase timeout

```bash
HTTP_TIMEOUT=120000  # 2 minutes
```

**Issue**: Too many open sockets

**Solution**: Decrease max sockets

```bash
HTTP_MAX_SOCKETS=20
```

## ETag Support

### Overview

ETags enable conditional requests, allowing clients to cache responses and only re-fetch when content changes.

### How It Works

1. **Initial request**: Server generates ETag and includes it in response

   ```
   GET /api/servers
   Response:
   ETag: "abc123"
   {
     "servers": [...]
   }
   ```

2. **Subsequent request**: Client includes ETag in request

   ```
   GET /api/servers
   If-None-Match: "abc123"

   Response:
   304 Not Modified
   (no body)
   ```

3. **Content changed**: Server returns new ETag

   ```
   GET /api/servers
   If-None-Match: "abc123"

   Response:
   200 OK
   ETag: "def456"
   {
     "servers": [...]
   }
   ```

### Supported Endpoints

ETags are automatically generated for:

- `GET /api/servers`
- `GET /api/servers/:name`
- `GET /api/config`
- `GET /api/status`

### Client Implementation

**JavaScript example:**

```javascript
let etag = null;

async function fetchServers() {
  const headers = {};
  if (etag) {
    headers["If-None-Match"] = etag;
  }

  const response = await fetch("/api/servers", { headers });

  if (response.status === 304) {
    console.log("Using cached data");
    return cachedData;
  }

  etag = response.headers.get("ETag");
  const data = await response.json();
  cachedData = data;
  return data;
}
```

**cURL example:**

```bash
# First request
curl -i http://localhost:3000/api/servers
# Note ETag header: ETag: "abc123"

# Second request (conditional)
curl -i -H "If-None-Match: \"abc123\"" http://localhost:3000/api/servers
# Receives 304 Not Modified (no body)
```

### Bandwidth Savings

**Benchmarks** (100 requests for server list):

- **Without ETags**: 100 requests × 10KB = 1,000 KB
- **With ETags**: 1 request × 10KB + 99 requests × 0 KB = 10 KB
- **Savings**: 99% bandwidth reduction

## Performance Metrics

### Overview

MCP Gateway exposes Prometheus-compatible metrics at `/metrics`:

```bash
curl http://localhost:3000/metrics
```

### Key Performance Metrics

**HTTP metrics:**

```
# Request rate
http_requests_total 15234
http_requests_duration_seconds_bucket{le="0.1"} 12000
http_requests_duration_seconds_bucket{le="0.5"} 14800
http_requests_duration_seconds_bucket{le="1"} 15100

# Response size
http_response_size_bytes_bucket{le="1024"} 8000
http_response_size_bytes_bucket{le="10240"} 14000
```

**Cache metrics:**

```
# Cache effectiveness
mcp_cache_hits_total 5834
mcp_cache_misses_total 1203
mcp_cache_hit_rate 82.9
mcp_cache_size 342
```

**Connection pool metrics:**

```
# Connection reuse
mcp_pool_http_sockets 12
mcp_pool_https_sockets 15
mcp_pool_http_free_sockets 3
mcp_pool_https_free_sockets 5
```

### Grafana Dashboard

Import the provided Grafana dashboard for visualization:

```bash
# Import dashboard
curl -X POST http://grafana:3000/api/dashboards/db \
  -H "Content-Type: application/json" \
  -d @grafana-dashboard.json
```

Dashboard includes:

- Request rate and latency
- Cache hit rate
- Connection pool utilization
- Compression ratio
- Error rate

## Benchmarking

### Load Testing

Use `wrk` for load testing:

```bash
# Install wrk
# macOS: brew install wrk
# Ubuntu: sudo apt-get install wrk

# Benchmark server list endpoint
wrk -t4 -c100 -d30s http://localhost:3000/api/servers

# Output:
# Running 30s test @ http://localhost:3000/api/servers
#   4 threads and 100 connections
#   Thread Stats   Avg      Stdev     Max   +/- Stdev
#     Latency    12.50ms    5.23ms  89.34ms   76.42%
#     Req/Sec     2.01k   245.12     2.87k    73.25%
#   240,234 requests in 30.00s, 1.23GB read
# Requests/sec:   8,007.80
# Transfer/sec:     42.00MB
```

### Baseline Performance

**Without optimizations** (HTTP/1.1, no compression, no caching):

```
Requests/sec: 2,000
Latency (avg): 50ms
Transfer/sec: 180MB
```

**With optimizations** (HTTP/2, compression, caching):

```
Requests/sec: 8,000 (4x improvement)
Latency (avg): 12ms (76% reduction)
Transfer/sec: 42MB (77% reduction)
Cache hit rate: 90%
```

### Benchmarking Tool Calls

Use the provided benchmark script:

```bash
# Run tool call benchmark
node benchmark-tool-calls.js

# Options:
# --server <name>       Server to benchmark
# --tool <name>         Tool to benchmark
# --iterations <n>      Number of iterations
# --concurrency <n>     Concurrent requests

# Example:
node benchmark-tool-calls.js \
  --server filesystem \
  --tool read_file \
  --iterations 1000 \
  --concurrency 50
```

## Troubleshooting

### High Memory Usage

**Symptom**: Memory usage increases over time

**Causes**:

1. Cache size too large
2. Connection pool not releasing connections

**Solutions**:

```bash
# Reduce cache size
CACHE_MAX_SIZE=500

# Reduce connection pool
HTTP_MAX_SOCKETS=25
HTTP_MAX_FREE_SOCKETS=5

# Decrease cache TTL
CACHE_TTL=60000  # 1 minute
```

### Low Cache Hit Rate

**Symptom**: Cache hit rate <50%

**Causes**:

1. TTL too short
2. Arguments vary frequently (e.g., timestamps)
3. Cache size too small

**Solutions**:

```bash
# Increase TTL
CACHE_TTL=600000  # 10 minutes

# Increase cache size
CACHE_MAX_SIZE=2000

# Disable cache for timestamp-dependent tools
# (via server config, not globally)
```

### HTTP/2 Not Working

**Symptom**: Clients connect via HTTP/1.1 instead of HTTP/2

**Causes**:

1. SSL certificates missing or invalid
2. Client doesn't support HTTP/2
3. Reverse proxy not configured for HTTP/2

**Solutions**:

```bash
# Verify SSL certificates
openssl x509 -in $SSL_CERT_PATH -text -noout

# Check client support
curl -I --http2 https://localhost:3000/health

# Verify HTTP/2 is enabled
curl -I https://localhost:3000/health | grep "HTTP/2"
```

### Compression Not Applied

**Symptom**: Responses not compressed

**Causes**:

1. Compression disabled
2. Content type not in allowlist
3. Response size below threshold

**Solutions**:

```bash
# Verify compression is enabled
ENABLE_COMPRESSION=true

# Lower threshold
COMPRESSION_THRESHOLD=512  # 512 bytes

# Check content type
curl -I http://localhost:3000/api/servers
# Should include: Content-Encoding: gzip
```

## Best Practices

### Production Configuration

```bash
# HTTP/2 (with Let's Encrypt)
ENABLE_HTTP2=true
SSL_KEY_PATH=/etc/letsencrypt/live/yourdomain.com/privkey.pem
SSL_CERT_PATH=/etc/letsencrypt/live/yourdomain.com/fullchain.pem

# Compression (balanced)
ENABLE_COMPRESSION=true
COMPRESSION_LEVEL=6
COMPRESSION_THRESHOLD=1024

# Caching (aggressive)
ENABLE_CACHE=true
CACHE_MAX_SIZE=5000
CACHE_TTL=600000  # 10 minutes

# Connection pooling (high throughput)
HTTP_KEEP_ALIVE=true
HTTP_MAX_SOCKETS=100
HTTP_MAX_FREE_SOCKETS=20
HTTP_TIMEOUT=120000  # 2 minutes
```

### Development Configuration

```bash
# HTTP/1.1 (no SSL required)
ENABLE_HTTP2=false

# Compression (fast)
ENABLE_COMPRESSION=true
COMPRESSION_LEVEL=1

# Caching (short TTL for testing)
ENABLE_CACHE=true
CACHE_MAX_SIZE=100
CACHE_TTL=10000  # 10 seconds

# Connection pooling (low resource usage)
HTTP_KEEP_ALIVE=true
HTTP_MAX_SOCKETS=10
HTTP_MAX_FREE_SOCKETS=2
```

### Monitoring Checklist

1. **Cache hit rate**: Should be >80% for stable workloads
2. **Request latency**: Should be <50ms (p95)
3. **Connection pool utilization**: Free sockets should be >0
4. **Memory usage**: Should be stable over time
5. **Error rate**: Should be <1%

### Performance Testing Workflow

1. **Baseline**: Test without optimizations
2. **Compression**: Enable compression, measure bandwidth reduction
3. **Caching**: Enable caching, measure hit rate and latency
4. **HTTP/2**: Enable HTTP/2, measure multiplexing benefits
5. **Combined**: Enable all optimizations, measure total improvement

### Scaling Recommendations

**Small deployments** (<100 req/s):

```bash
CACHE_MAX_SIZE=500
HTTP_MAX_SOCKETS=20
COMPRESSION_LEVEL=6
```

**Medium deployments** (100-1,000 req/s):

```bash
CACHE_MAX_SIZE=2000
HTTP_MAX_SOCKETS=50
COMPRESSION_LEVEL=6
```

**Large deployments** (>1,000 req/s):

```bash
CACHE_MAX_SIZE=10000
HTTP_MAX_SOCKETS=200
COMPRESSION_LEVEL=1  # Faster compression
```

## Conclusion

MCP Gateway v3.0's performance optimizations provide significant improvements:

- **4x throughput** (2,000 → 8,000 req/s)
- **77% bandwidth reduction** (compression)
- **90% cache hit rate** (response caching)
- **50% latency reduction** (connection pooling)

For most deployments, the default configuration provides optimal performance. Adjust settings based on your specific workload and monitoring data.

For further assistance, see:

- [HTTP/2 Configuration Guide](HTTP2_CONFIGURATION.md)
- [Monitoring & Metrics Guide](MONITORING.md)
- [Troubleshooting Guide](TROUBLESHOOTING.md)
