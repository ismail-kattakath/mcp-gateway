# Domain Management Module

This module provides domain management capabilities for MCP Gateway with automatic TLS via Caddy reverse proxy.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Domain Manager                          │
│  - Add/remove domains                                       │
│  - Manage TLS settings                                      │
│  - Sync with Caddyfile                                      │
└──────────────┬──────────────────────────────┬───────────────┘
               │                              │
               ↓                              ↓
     ┌──────────────────┐           ┌──────────────────┐
     │  Caddy Client    │           │   Validation     │
     │  - Admin API     │           │   - Domain check │
     │  - Reload config │           │   - TLS check    │
     └──────────────────┘           └──────────────────┘
               ↓
     ┌──────────────────┐
     │  Caddy Proxy     │
     │  - TLS term.     │
     │  - Let's Encrypt │
     └──────────────────┘
```

## Components

### 1. `validation.ts`

Domain and TLS validation utilities:

- `isValidDomain(domain)` - RFC 1035 domain validation
- `isValidWildcardDomain(domain)` - Wildcard domain validation
- `isValidIpAddress(ip)` - IPv4/IPv6 validation
- `normalizeDomain(domain)` - Lowercase, trim, remove protocol/port
- `isLocalDomain(domain)` - Detect localhost/private IPs
- `getRootDomain(domain)` - Extract root from subdomain
- `validateTLSConfig(config)` - TLS protocol/cipher validation

### 2. `caddy.ts`

Caddy Admin API client:

- `CaddyClient` class - HTTP client for Caddy admin API
- `ping()` - Health check
- `reload(caddyfile)` - Reload configuration
- `getConfig()` - Get current config
- `getCertificates()` - List TLS certificates
- `validateCaddyfile(content)` - Client-side syntax check
- `generateDomainBlock(domain, options)` - Generate Caddyfile block
- `generateHttpRedirect()` - Generate HTTP→HTTPS redirect

### 3. `manager.ts`

Domain CRUD operations:

- `DomainManager` class - Main orchestrator
- `addDomain(domain, options)` - Add domain with TLS
- `removeDomain(domain)` - Remove domain
- `getDomain(domain)` - Get domain details
- `listDomains()` - List all domains
- `updateDomain(domain, options)` - Update settings
- `toggleDomain(domain, enabled)` - Enable/disable
- `checkCaddyHealth()` - Check Caddy status
- `getCertificates()` - List certificates

### 4. `api-routes.ts`

REST API endpoints:

- `POST /api/domains` - Add domain
- `GET /api/domains` - List domains
- `GET /api/domains/:name` - Get domain
- `PUT /api/domains/:name` - Update domain
- `DELETE /api/domains/:name` - Remove domain
- `POST /api/domains/:name/enable` - Enable domain
- `POST /api/domains/:name/disable` - Disable domain
- `GET /api/domains/certificates` - List certificates

## Usage

### Add a Domain

```typescript
import { getDomainManager } from './domains/manager.js';

const manager = getDomainManager();

// Add with automatic TLS (Let's Encrypt)
const domain = await manager.addDomain('example.com', {
  tlsEnabled: true, // default
  tlsProtocols: ['tls1.3'],
  tlsCiphers: ['TLS_AES_128_GCM_SHA256', 'TLS_AES_256_GCM_SHA384', 'TLS_CHACHA20_POLY1305_SHA256'],
});

console.log('Domain added:', domain);
```

### List Domains

```typescript
const domains = manager.listDomains();

console.log(
  'Active domains:',
  domains.filter((d) => d.enabled)
);
```

### Remove a Domain

```typescript
await manager.removeDomain('example.com');
```

### Via API

```bash
# Add domain
curl -X POST http://localhost:3000/api/domains \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"domain": "example.com", "tlsEnabled": true}'

# List domains
curl http://localhost:3000/api/domains \
  -H "Authorization: Bearer YOUR_API_KEY"

# Remove domain
curl -X DELETE http://localhost:3000/api/domains/example.com \
  -H "Authorization: Bearer YOUR_API_KEY"
```

## TLS Configuration

### Let's Encrypt (Automatic)

By default, domains use automatic TLS via Let's Encrypt:

```typescript
await manager.addDomain('example.com'); // TLS enabled by default
```

**Requirements**:

- Domain points to server (A/AAAA record)
- Port 80 open (ACME HTTP-01 challenge)
- Valid email configured (`ADMIN_EMAIL` env var)

### Custom Certificate

For custom/self-signed certificates:

```typescript
await manager.addDomain('internal.example.com', {
  tlsEnabled: true,
  customCert: {
    cert: '/path/to/cert.pem',
    key: '/path/to/key.pem',
  },
});
```

### TLS 1.3 Only (Recommended)

```typescript
await manager.addDomain('secure.example.com', {
  tlsEnabled: true,
  tlsProtocols: ['tls1.3'], // No TLS 1.2
  tlsCiphers: ['TLS_AES_128_GCM_SHA256', 'TLS_AES_256_GCM_SHA384', 'TLS_CHACHA20_POLY1305_SHA256'],
});
```

## Validation

### Domain Validation

```typescript
import { isValidDomain, normalizeDomain } from './validation.js';

// Validate format
if (!isValidDomain('example.com')) {
  throw new Error('Invalid domain');
}

// Normalize
const normalized = normalizeDomain('HTTPS://EXAMPLE.COM:443');
// Result: "example.com"
```

### TLS Configuration Validation

```typescript
import { validateTLSConfig } from './validation.js';

const result = validateTLSConfig({
  protocols: ['tls1.3'],
  ciphers: ['TLS_AES_128_GCM_SHA256'],
});

if (!result.valid) {
  console.error('TLS config errors:', result.errors);
}
```

## Caddy Integration

### Caddyfile Structure

The domain manager generates Caddyfile blocks:

```caddyfile
# example.com
example.com {
    reverse_proxy gateway:3000 {
        health_uri /health
        health_interval 30s
        health_timeout 10s

        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
    }

    tls {
        protocols tls1.3
        ciphers TLS_AES_128_GCM_SHA256 TLS_AES_256_GCM_SHA384 TLS_CHACHA20_POLY1305_SHA256
    }

    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        X-Frame-Options "DENY"
        X-Content-Type-Options "nosniff"
        X-XSS-Protection "1; mode=block"
        Referrer-Policy "strict-origin-when-cross-origin"
        -Server
    }

    log {
        output file /var/log/caddy/example.com.log {
            roll_size 100mb
            roll_keep 5
        }
        format json
    }
}
```

### Zero-Downtime Reload

When domains change, the manager:

1. Reads Caddyfile template
2. Generates domain blocks
3. Validates syntax
4. Writes to file
5. Reloads Caddy via admin API (no restart)

```typescript
// Automatic reload on domain changes
await manager.addDomain('new.example.com');
// Caddy reloaded with zero downtime
```

## Security Features

### Enforced by Default

- **TLS 1.3**: Modern encryption only
- **Strong ciphers**: AES-GCM, ChaCha20-Poly1305
- **HSTS**: Strict-Transport-Security with preload
- **Security headers**: X-Frame-Options, X-Content-Type-Options, etc.
- **No server header**: Hide Caddy version

### Local Domain Warnings

Local domains (`.local`, `localhost`, private IPs) trigger warnings:

```typescript
await manager.addDomain('test.local');
// Warning: Adding local domain (TLS may not work)
```

### Input Sanitization

All user-controlled values sanitized before logging:

```typescript
logger.info(`Domain added: ${sanitizeString(domain)}`);
// Prevents log injection attacks
```

## Environment Variables

```bash
# Caddy Admin API URL
CADDY_ADMIN_URL=http://localhost:2019

# Caddyfile paths
CADDYFILE_PATH=/app/caddy/Caddyfile
CADDYFILE_TEMPLATE_PATH=/app/caddy/Caddyfile.template

# Let's Encrypt email
ADMIN_EMAIL=admin@example.com
```

## Testing

### Run Tests

```bash
cd server
npm test src/domains/__tests__/

# With coverage
npm run test:coverage -- src/domains/
```

### Test Coverage

- `validation.test.ts`: 32 tests (domain/TLS validation)
- `manager.test.ts`: 15 tests (CRUD operations)
- **Total**: 47 tests, 85%+ coverage

## Future Enhancements

### SQLite Persistence (v3.0)

Currently, domains stored in-memory. Future:

```typescript
// domains table
CREATE TABLE domains (
  id TEXT PRIMARY KEY,
  domain TEXT UNIQUE NOT NULL,
  enabled INTEGER DEFAULT 1,
  tls_enabled INTEGER DEFAULT 1,
  certificate_issued TIMESTAMP,
  certificate_expiry TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Certificate Monitoring

```typescript
// Auto-renewal alerts
if (domain.certificateExpiry < Date.now() + 7 days) {
  logger.warn('Certificate expiring soon', { domain });
  // Trigger renewal
}
```

### DNS-01 Challenge (Wildcard)

```typescript
await manager.addDomain('*.example.com', {
  tlsEnabled: true,
  acmeChallenge: 'dns-01',
  dnsProvider: 'cloudflare',
  dnsApiToken: process.env.CLOUDFLARE_API_TOKEN,
});
```

## Troubleshooting

### Certificate Not Issued

**Check DNS**:

```bash
dig +short example.com
```

**Check Caddy logs**:

```bash
docker logs mcp-caddy
```

**Common issues**:

- DNS not propagated (wait 5-10 min)
- Port 80 blocked (needed for ACME)
- Let's Encrypt rate limit (5 failures/hour)

### Caddy Reload Failed

**Validate Caddyfile**:

```bash
docker exec mcp-caddy caddy validate --config /etc/caddy/Caddyfile
```

**Check admin API**:

```bash
curl http://localhost:2019/config/
```

### Domain Not Accessible

**Check domain status**:

```bash
curl http://localhost:3000/api/domains/example.com \
  -H "Authorization: Bearer YOUR_API_KEY"
```

**Test TLS**:

```bash
openssl s_client -connect example.com:443 -servername example.com
```

## References

- [Caddy Documentation](https://caddyserver.com/docs/)
- [Let's Encrypt Documentation](https://letsencrypt.org/docs/)
- [Mozilla SSL Configuration](https://ssl-config.mozilla.org/)
- [RFC 1035 - Domain Names](https://www.rfc-editor.org/rfc/rfc1035)
