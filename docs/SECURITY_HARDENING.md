# Security Hardening Guide

This document describes the comprehensive security hardening measures implemented in MCP Gateway to protect against common security threats (OWASP Top 10, CWE Top 25).

## Table of Contents

1. [Overview](#overview)
2. [Input Validation & Sanitization](#input-validation--sanitization)
3. [Rate Limiting & Throttling](#rate-limiting--throttling)
4. [Security Headers](#security-headers)
5. [Secrets Management](#secrets-management)
6. [Container Security](#container-security)
7. [Dependency Scanning](#dependency-scanning)
8. [Security Testing](#security-testing)
9. [Best Practices](#best-practices)

## Overview

MCP Gateway implements defense-in-depth security with multiple layers:

- **Input validation** - Prevent injection attacks (SQL, command, XSS, path traversal, LDAP)
- **Rate limiting** - Protect against brute force and DDoS attacks
- **Security headers** - Configure HTTP headers to prevent client-side attacks
- **Secrets management** - Secure storage and retrieval of sensitive data
- **Container security** - Non-root user, capabilities, read-only filesystem
- **Dependency scanning** - Automated vulnerability detection in npm packages
- **Security testing** - 40+ tests covering injection attacks, rate limits, secrets

## Input Validation & Sanitization

### Centralized Validator

All user inputs are validated through the `InputValidator` class (`server/src/validation/input-validator.ts`):

```typescript
import { inputValidator } from "./validation/input-validator.js";

// Validate server name
const serverName = inputValidator.validateServerName(userInput); // throws ValidationError if invalid

// Validate URL (http/https only)
const url = inputValidator.validateUrl(urlInput);

// Validate path (prevent traversal)
const path = inputValidator.validatePath(pathInput, "/allowed/parent");

// Validate command args (prevent injection)
const args = inputValidator.validateArgs(["arg1", "arg2"]);

// Validate environment variables
const envKey = inputValidator.validateEnvKey("API_KEY");
const envValue = inputValidator.validateEnvValue("secret-value");
```

### Supported Validations

| Validator               | Purpose                     | Example                            |
| ----------------------- | --------------------------- | ---------------------------------- |
| `validateServerName`    | Server identifiers          | `my-server`, `server-123`          |
| `validateUrl`           | HTTP/HTTPS URLs only        | `https://example.com`              |
| `validatePath`          | Prevent path traversal      | `/tmp/file.txt`                    |
| `validateArgs`          | Prevent command injection   | `['--flag', 'value']`              |
| `validateEnvKey`        | Environment variable names  | `API_KEY`, `DATABASE_URL`          |
| `validateEnvValue`      | Environment variable values | Any string without null bytes      |
| `validateLdapFilter`    | Prevent LDAP injection      | `user123` (no special chars)       |
| `validateSqlIdentifier` | Prevent SQL injection       | `users`, `user_id`                 |
| `validatePort`          | Port numbers                | `3000`, `8080`                     |
| `validateIpAddress`     | IPv4/IPv6 addresses         | `192.168.1.1`, `::1`               |
| `validateEmail`         | Email addresses             | `user@example.com`                 |
| `validateDockerImage`   | Docker image names          | `nginx:latest`                     |
| `validateGitRepo`       | Git repository URLs         | `https://github.com/user/repo.git` |

### Injection Attack Prevention

**Command Injection** - Blocked characters: `&&`, `||`, `;`, `|`, `` ` ``, `$`, `>`, `<`, `\n`, `\r`

```typescript
// ✗ REJECTED
validateArgs(["arg1", "arg2 && rm -rf /"]);
validateArgs(["arg1", "$(whoami)"]);

// ✓ ACCEPTED
validateArgs(["arg1", "arg2", "--flag"]);
```

**Path Traversal** - Blocked patterns: `../`, `..\\`, `%2e%2e`, `%252e%252e`, null bytes

```typescript
// ✗ REJECTED
validatePath("../../../etc/passwd");
validatePath("/tmp/../../../etc/passwd");

// ✓ ACCEPTED
validatePath("/tmp/file.txt", "/tmp");
```

**SQL Injection** - Identifiers must start with letter, alphanumeric + underscore only

```typescript
// ✗ REJECTED
validateSqlIdentifier("users; DROP TABLE users;");
validateSqlIdentifier("user-id");

// ✓ ACCEPTED
validateSqlIdentifier("users");
validateSqlIdentifier("user_id");
```

**LDAP Injection** - Block special characters: `(`, `)`, `\`, `*`, `\0`

```typescript
// ✗ REJECTED
validateLdapFilter("(cn=user)");
validateLdapFilter("cn=*");

// ✓ ACCEPTED
validateLdapFilter("user123");
```

### Log Sanitization

All log outputs are sanitized to prevent log injection attacks (see `server/src/logging/sanitizer.ts`):

```typescript
import {
  sanitizeString,
  sanitizeServerName,
  sanitizeUrl,
} from "./logging/sanitizer.js";

logger.info(`Starting server ${sanitizeServerName(name)}`);
logger.info(`Connecting to ${sanitizeUrl(url)}`);
logger.info(`User input: ${sanitizeString(input)}`);
```

## Rate Limiting & Throttling

### Three-Tier Rate Limiting

MCP Gateway implements three levels of rate limiting (`server/src/middleware/rate-limit.ts`):

#### 1. IP-based (Authentication Endpoints)

Prevents brute force attacks on login/token endpoints:

- **Per minute**: 10 attempts
- **Per hour**: 100 attempts
- **Strategy**: Skip successful requests (only count failed attempts)

```typescript
import {
  authRateLimiter,
  authRateLimiterHourly,
} from "./middleware/rate-limit.js";

app.post("/api/auth/login", authRateLimiter, authRateLimiterHourly, handler);
```

#### 2. User-based (API Endpoints)

Prevents API abuse:

- **Per hour**: 1000 requests per user
- **Strategy**: Track by authenticated user ID or IP

```typescript
import { apiRateLimiter } from "./middleware/rate-limit.js";

app.use("/api", apiRateLimiter);
```

#### 3. Server-based (MCP Tool Calls)

Prevents resource exhaustion on individual servers:

- **Per minute**: 100 requests (configurable)
- **Strategy**: Track by server name + user

```typescript
import { createServerRateLimiter } from "./middleware/rate-limit.js";

const limiter = createServerRateLimiter("my-server", 100);
app.post("/tools/my-server/call", limiter, handler);
```

### Rate Limit Response

When rate limit exceeded, returns `429 Too Many Requests`:

```json
{
  "error": "Rate limit exceeded, please try again later",
  "retryAfter": 60
}
```

Headers:

- `RateLimit-Limit` - Maximum requests allowed
- `RateLimit-Remaining` - Requests remaining in current window
- `RateLimit-Reset` - Timestamp when limit resets
- `Retry-After` - Seconds until retry allowed

### DDoS Protection

Global rate limiter for all requests:

```typescript
import { globalRateLimiter } from "./middleware/rate-limit.js";

app.use(globalRateLimiter); // 100 requests/minute per IP
```

## Security Headers

### Helmet.js Middleware

Comprehensive security headers configured via Helmet.js (`server/src/middleware/security-headers.ts`):

```typescript
import { securityHeaders } from "./middleware/security-headers.js";

app.use(securityHeaders);
```

#### Headers Configured

| Header                              | Value                                          | Purpose                        |
| ----------------------------------- | ---------------------------------------------- | ------------------------------ |
| `Content-Security-Policy`           | `default-src 'self'`                           | Prevent XSS attacks            |
| `Strict-Transport-Security`         | `max-age=31536000; includeSubDomains; preload` | Force HTTPS                    |
| `X-Frame-Options`                   | `DENY`                                         | Prevent clickjacking           |
| `X-Content-Type-Options`            | `nosniff`                                      | Prevent MIME sniffing          |
| `Referrer-Policy`                   | `strict-origin-when-cross-origin`              | Control referrer information   |
| `X-DNS-Prefetch-Control`            | `off`                                          | Disable DNS prefetching        |
| `Permissions-Policy`                | `geolocation=(), camera=(), microphone=()`     | Restrict browser features      |
| `X-Permitted-Cross-Domain-Policies` | `none`                                         | Prevent Flash/PDF cross-domain |

#### Content Security Policy

Default CSP directives:

```javascript
{
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // For Swagger UI
  styleSrc: ["'self'", "'unsafe-inline'"],
  imgSrc: ["'self'", "data:", "https:"],
  connectSrc: ["'self'"],
  fontSrc: ["'self'", "data:"],
  objectSrc: ["'none'"],
  mediaSrc: ["'self'"],
  frameSrc: ["'none'"],
}
```

**Production**: Includes `upgrade-insecure-requests` to upgrade HTTP to HTTPS.

### CORS Validation

Validates CORS origin configuration, rejects wildcards in production:

```typescript
import { validateCorsOrigin } from "./middleware/security-headers.js";

// ✗ REJECTED in production
validateCorsOrigin("*");

// ✓ ACCEPTED
validateCorsOrigin("https://example.com");
validateCorsOrigin(["https://example.com", "https://app.example.com"]);
```

### Additional Protections

#### Request Size Limiter

Prevents large payload attacks:

```typescript
import { requestSizeLimiter } from "./middleware/security-headers.js";

app.use(requestSizeLimiter(10 * 1024 * 1024)); // 10 MB limit
```

#### Strict Content-Type

Requires `Content-Type: application/json` for API endpoints:

```typescript
import { strictContentTypeMiddleware } from "./middleware/security-headers.js";

app.use(strictContentTypeMiddleware);
```

## Secrets Management

### Multi-Provider Support

Centralized secrets management with support for multiple providers (`server/src/security/secrets-manager.ts`):

1. **System Keychain** (default) - macOS Keychain, Linux libsecret, Windows Credential Manager
2. **HashiCorp Vault** - Enterprise secret storage
3. **AWS Secrets Manager** - AWS-native secrets
4. **Azure Key Vault** - Azure-native secrets

### Priority Order

Secrets are resolved in this order:

1. Vault
2. AWS Secrets Manager
3. Azure Key Vault
4. System Keychain
5. Environment Variables

### Usage

#### Initialize Secrets Manager

```typescript
import { secretsManager } from "./security/secrets-manager.js";

// Add Vault provider
secretsManager.addVaultProvider("https://vault.example.com", "token", "secret");

// Add AWS provider
secretsManager.addAWSProvider("us-east-1");

// Add Azure provider
secretsManager.addAzureProvider("https://vault.azure.net");
```

#### Store & Retrieve Secrets

```typescript
// Store a secret
await secretsManager.set("API_KEY", "sk_live_12345");

// Retrieve a secret
const apiKey = await secretsManager.get("API_KEY");

// Delete a secret
await secretsManager.delete("API_KEY");

// List all secrets
const keys = await secretsManager.list();
```

#### Environment Variable Substitution

Registry.json supports secret references:

```json
{
  "servers": {
    "stripe": {
      "source": "pkg",
      "package": "stripe-mcp",
      "env": {
        "STRIPE_SECRET_KEY": "${SECRET:STRIPE_SECRET_KEY}",
        "DATABASE_URL": "${DATABASE_URL}"
      }
    }
  }
}
```

- `${SECRET:KEY}` - Resolved from secrets manager
- `${KEY}` - Resolved from environment variables

```typescript
// Resolve environment variables
const resolved = await secretsManager.resolveEnv("${SECRET:API_KEY}");

// Resolve object of environment variables
const env = await secretsManager.resolveEnvObject({
  API_KEY: "${SECRET:API_KEY}",
  DATABASE_URL: "${DATABASE_URL}",
});
```

### CLI Commands

Manage secrets via CLI:

```bash
# Store a secret
mcp secrets set API_KEY sk_live_12345

# Retrieve a secret (masked)
mcp secrets get API_KEY

# Retrieve a secret (revealed)
mcp secrets get API_KEY --reveal

# Delete a secret
mcp secrets delete API_KEY

# List known keys
mcp secrets list
```

### Secret Detection

Automatically detect secrets in registry.json on startup (`server/src/security/secret-detector.ts`):

```typescript
import { secretDetector } from "./security/secret-detector.js";
import { registry } from "./mcp/registry.js";

// Scan registry for secrets
const detections = secretDetector.scanRegistry(registry);

// Generate report
const report = secretDetector.generateReport(detections);
console.log(`Found ${report.summary.high} high-severity secrets`);
```

#### Detected Patterns

- **API Keys**: `api_key`, `auth_token`, bearer tokens
- **AWS**: Access keys (AKIA...), secret keys
- **GitHub**: Personal access tokens (ghp*...), OAuth tokens (gho*...)
- **JWTs**: `eyJ...` format
- **Private Keys**: RSA, SSH, generic private keys
- **Database**: PostgreSQL, MySQL, MongoDB connection strings
- **Cloud**: Google Cloud, Stripe, Twilio API keys

#### Severity Levels

- **High**: API keys, tokens, private keys, database credentials
- **Medium**: Sensitive field names (password, secret, token)
- **Low**: Long base64/hex strings (potential secrets)

### Best Practices

**DO:**

- ✓ Use environment variables: `${MY_API_KEY}`
- ✓ Use secrets manager: `${SECRET:MY_API_KEY}`
- ✓ Store secrets in system keychain via CLI
- ✓ Rotate secrets regularly

**DON'T:**

- ✗ Hardcode secrets in registry.json
- ✗ Commit secrets to version control
- ✗ Share secrets in plain text
- ✗ Use weak secrets (< 16 chars)

## Container Security

### Non-Root User

Gateway runs as non-root user `gateway` (UID 1000):

```dockerfile
# Create non-root user
RUN addgroup -g 1000 gateway && \
    adduser -D -u 1000 -G gateway gateway

# Switch to non-root user
USER gateway
```

### Read-Only Root Filesystem

Container filesystem is read-only, with writable tmpfs mounts:

```yaml
# docker-compose.security.yml
services:
  gateway:
    read_only: true
    tmpfs:
      - /tmp:mode=1777,size=100m,uid=1000,gid=1000
      - /home/gateway/.npm:mode=755,size=50m,uid=1000,gid=1000
```

### Capabilities

Drop all capabilities, add back only what's needed:

```yaml
services:
  gateway:
    cap_drop:
      - ALL
    cap_add:
      # Only if binding to ports < 1024
      # - NET_BIND_SERVICE
```

### Security Options

```yaml
services:
  gateway:
    security_opt:
      # Prevent privilege escalation
      - no-new-privileges:true
      # AppArmor profile
      - apparmor:docker-default
      # Seccomp profile
      - seccomp:./seccomp-profile.json
```

### Seccomp Profile

Restricts syscalls to minimum required set (`seccomp-profile.json`):

- **Default action**: `SCMP_ACT_ERRNO` (deny)
- **Allowed syscalls**: ~200 common syscalls (read, write, open, close, etc.)
- **Blocked syscalls**: Dangerous operations (ptrace, kernel modules, reboot, etc.)

### Resource Limits

Prevent resource exhaustion:

```yaml
services:
  gateway:
    deploy:
      resources:
        limits:
          cpus: "2.0"
          memory: 2G
        reservations:
          cpus: "0.5"
          memory: 512M
```

### Healthcheck

Secure healthcheck with timeout:

```yaml
healthcheck:
  test:
    [
      "CMD",
      "curl",
      "-f",
      "-s",
      "-S",
      "--max-time",
      "5",
      "http://localhost:3000/health",
    ]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 40s
```

### Running Securely

**Option 1**: Use security-hardened compose file

```bash
docker-compose -f docker-compose.yml -f docker-compose.security.yml up
```

**Option 2**: Enable security options manually

```bash
docker run -d \
  --name mcp-gateway \
  --read-only \
  --tmpfs /tmp \
  --cap-drop ALL \
  --security-opt no-new-privileges:true \
  -p 3000:3000 \
  ghcr.io/ismail-kattakath/mcp-gateway
```

## Dependency Scanning

### Automated Scanning

GitHub Actions workflow (`.github/workflows/security.yml`) runs on every PR:

1. **NPM Audit** - Scans for known vulnerabilities in npm packages
2. **Secret Scanning** - Detects hardcoded secrets (TruffleHog)
3. **Dependency Review** - Reviews dependency changes in PRs
4. **Container Scan** - Scans Docker image for vulnerabilities (Trivy)
5. **SAST Analysis** - Static code analysis (ESLint security plugin)
6. **License Compliance** - Ensures compatible licenses

### NPM Audit

Runs on every PR, blocks merge if high/critical vulnerabilities found:

```bash
cd server && npm audit --audit-level=high
cd ui && npm audit --audit-level=high
cd cli && npm audit --audit-level=high
```

### Dependabot

Automatic PRs for security updates (configured in GitHub repo settings):

- **Daily** security updates
- **Weekly** dependency updates
- **Auto-merge** minor/patch versions after tests pass

### Manual Scanning

```bash
# Audit all packages
npm run audit

# Audit with JSON report
npm audit --json > audit-report.json

# Fix vulnerabilities automatically
npm audit fix

# Fix including breaking changes
npm audit fix --force
```

### Trivy Container Scanning

Scans Docker image for OS and library vulnerabilities:

```bash
# Scan latest image
docker pull ghcr.io/ismail-kattakath/mcp-gateway:latest
trivy image ghcr.io/ismail-kattakath/mcp-gateway:latest

# Scan for HIGH/CRITICAL only
trivy image --severity HIGH,CRITICAL ghcr.io/ismail-kattakath/mcp-gateway:latest
```

## Security Testing

### Test Coverage

40+ security-focused tests covering:

- **Input validation** (18 tests) - Server names, URLs, paths, args, env vars
- **Rate limiting** (8 tests) - IP-based, user-based, server-based limits
- **Security headers** (10 tests) - Helmet, CSP, HSTS, etc.
- **Secret detection** (14 tests) - API keys, tokens, private keys, etc.
- **Injection prevention** (12 tests) - SQL, command, XSS, path traversal

### Running Security Tests

```bash
cd server && npm test

# Run specific test suite
npm test -- input-validator.test.ts
npm test -- rate-limit.test.ts
npm test -- security-headers.test.ts
npm test -- secret-detector.test.ts

# Run with coverage
npm run test:coverage
```

### Integration Tests

Test against real injection attack vectors:

```typescript
// Command injection
expect(() => validateArgs(["arg1", "arg2 && rm -rf /"])).toThrow();

// Path traversal
expect(() => validatePath("../../../etc/passwd")).toThrow();

// SQL injection
expect(() => validateSqlIdentifier("users; DROP TABLE users;")).toThrow();

// XSS
expect(() => validateUrl("javascript:alert(1)")).toThrow();
```

### Security Audit Checklist

Before release:

- [ ] Run full test suite: `npm test`
- [ ] Run npm audit: `npm audit --audit-level=high`
- [ ] Scan Docker image: `trivy image ...`
- [ ] Check for secrets: `git secrets --scan`
- [ ] Review dependency changes
- [ ] Update dependencies: `npm update`
- [ ] Rotate API keys if compromised
- [ ] Review security logs

## Best Practices

### Development

1. **Never disable security features** in production
2. **Always validate user input** before processing
3. **Use parameterized queries** for databases
4. **Never log sensitive data** (use sanitizers)
5. **Keep dependencies updated** (run `npm update` weekly)
6. **Follow principle of least privilege** (minimal permissions)
7. **Use secrets manager** for all sensitive data
8. **Test security features** with real attack vectors

### Deployment

1. **Enable all security headers** via Helmet
2. **Use HTTPS** in production (enforce with HSTS)
3. **Configure rate limiting** based on traffic patterns
4. **Monitor rate limit violations** (indicates attacks)
5. **Rotate secrets regularly** (API keys, passwords)
6. **Run container as non-root** user
7. **Use read-only filesystem** with tmpfs mounts
8. **Enable Dependabot** for automatic security updates
9. **Review security logs** daily
10. **Have incident response plan** for breaches

### Security Incident Response

If a security issue is discovered:

1. **Assess severity** - Is it actively exploited?
2. **Contain** - Take affected systems offline if needed
3. **Notify** - Alert security team and stakeholders
4. **Patch** - Apply fix and test thoroughly
5. **Deploy** - Roll out patch to all environments
6. **Rotate secrets** - If credentials compromised
7. **Review logs** - Check for unauthorized access
8. **Document** - Write post-mortem and update procedures
9. **Notify users** - If their data was affected
10. **Update security measures** - Prevent future incidents

### Reporting Security Issues

**DO NOT** open public GitHub issues for security vulnerabilities.

Instead:

1. Email security contact (see SECURITY.md)
2. Include detailed description and reproduction steps
3. Wait for acknowledgment before public disclosure
4. Allow 90 days for patch before disclosure

### Security Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [CWE Top 25](https://cwe.mitre.org/top25/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [Docker Security](https://docs.docker.com/engine/security/)
- [Helmet.js](https://helmetjs.github.io/)
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework)

---

**Last Updated**: 2026-06-09  
**Version**: 1.0  
**Epic**: #31 - Security Hardening (50 SP)
