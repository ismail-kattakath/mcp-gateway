# Security Features

This document outlines the security features and best practices implemented in the MCP Gateway.

## Log Sanitization

All logs are automatically sanitized to prevent:

- **Log Injection Attacks**: CRLF characters and control characters are removed
- **Information Disclosure**: Sensitive patterns (API keys, tokens, passwords) are redacted
- **Log Flooding**: Long values are truncated to prevent log bloat

### Automatic Sanitization

The logger automatically sanitizes all user-provided values using the `sanitizationFormat` in `logger.ts`. This applies to:

- All log metadata (anything beyond `level`, `message`, `timestamp`, `stack`)
- User-provided values in log messages
- Error messages and stack traces

### Redaction Patterns

The following patterns are automatically redacted:

- **API Keys**: `api_key`, `apiKey` → `[REDACTED_API_KEY]`
- **Auth Tokens**: `auth_token`, `bearer <token>` → `[REDACTED_AUTH_TOKEN]`
- **Passwords**: `password` → `[REDACTED_PASSWORD]`
- **Secrets**: `secret` → `[REDACTED_SECRET]`
- **AWS Keys**: `AKIA...`, `ASIA...` → `[REDACTED_AWS_KEY]`
- **GitHub Tokens**: `ghp_...`, `gho_...` → `[REDACTED_GITHUB_TOKEN]`
- **JWT Tokens**: `eyJ...` → `[REDACTED_JWT]`

### Manual Sanitization

For cases where you need to sanitize values before logging, import sanitization utilities:

```typescript
import logger, { 
  sanitizeString, 
  sanitizeUrl, 
  sanitizeServerName,
  sanitizeIp 
} from '../logging/logger.js';

// Sanitize a user-provided string
logger.info('Processing request', { 
  url: sanitizeUrl(userInput.url),
  server: sanitizeServerName(userInput.serverName)
});
```

### Available Sanitization Functions

- `sanitizeString(value, maxLength?)` - General string sanitization
- `sanitizeServerName(name)` - Validates and sanitizes server names
- `sanitizeUrl(url)` - Removes credentials and query params from URLs
- `sanitizeArgs(args)` - Sanitizes command-line arguments
- `sanitizeEnv(env)` - Redacts sensitive environment variables
- `sanitizeError(error)` - Sanitizes error objects
- `sanitizeIp(ip)` - Masks IP addresses for privacy
- `sanitizePath(path)` - Removes system-specific paths
- `sanitizeObject(obj)` - Recursively sanitizes objects

## Path Traversal Prevention

All file path operations validate that paths don't escape their intended directories:

```typescript
// git.ts and container.ts
const resolved = path.resolve(repoDir, userInput);
if (!resolved.startsWith(path.resolve(repoDir))) {
  throw new Error('Path traversal attempt detected');
}
```

## Command Injection Prevention

All subprocess spawning uses:

- Non-shell execution (`shell: false`)
- URL validation for git operations
- The `--` separator for git commands to prevent flag injection

```typescript
// Validate URL protocol
const repoUrl = new URL(build.repo);
if (!['http:', 'https:', 'git:', 'ssh:'].includes(repoUrl.protocol)) {
  throw new Error(`Invalid repo URL protocol: ${repoUrl.protocol}`);
}

// Use -- separator to prevent flag injection
await runShell('git', ['clone', '--', build.repo, repoDir], parentDir);
```

## ReDoS Prevention

Regular expressions are designed to avoid backtracking:

```typescript
// Before (vulnerable to ReDoS):
header.match(/^Bearer\s+(.+)$/i)

// After (non-backtracking):
header.match(/^Bearer\s+(\S+)$/i)
```

## Cryptographically Secure Random

Session IDs and API keys use `crypto.randomBytes()` instead of `Math.random()`:

```typescript
import crypto from 'crypto';

const sessionId = `session_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
```

## API Key Security

API keys are:

- Generated using `crypto.randomBytes(32)` (256-bit entropy)
- Stored encrypted at rest using AES-256-GCM
- Machine-bound using hardware identifiers
- Never logged in cleartext
- Compared using constant-time comparison to prevent timing attacks

## TOCTOU Prevention

File operations that check then use are replaced with try-catch patterns:

```typescript
// Before (TOCTOU vulnerability):
if (await fileExists(path)) {
  const data = await fs.readFile(path);
}

// After (no race condition):
try {
  const data = await fs.readFile(path);
} catch {
  // Handle file not found
}
```

## CodeQL Security Analysis

This project uses GitHub's CodeQL security analysis to identify:

- High severity vulnerabilities (blocking)
- Medium severity warnings (reviewed)
- Code quality issues

All high severity issues are resolved before merging. Medium severity warnings are evaluated on a case-by-case basis.

## Security Audit

Run the security audit to check for vulnerable dependencies:

```bash
npm audit
npm audit fix
```

## Responsible Disclosure Program

Security researchers are encouraged to report MCP Gateway vulnerabilities through responsible disclosure. Reports should focus on supported project components and include enough detail for maintainers to reproduce and assess impact.

### Scope

In scope:

- MCP Gateway server, REST API, SSE/HTTP transports, and authentication middleware
- Official Docker images and deployment defaults documented in this repository
- Web UI surfaces that interact with authenticated gateway APIs
- Registry validation, server lifecycle handling, and logging/sanitization paths

Out of scope:

- Third-party MCP servers, packages, or container images not maintained by this project
- Social engineering, physical attacks, spam, phishing, or denial-of-service testing
- Dependency-only reports without an exploitable MCP Gateway impact
- Issues that require already having local administrator or root access

### Report Requirements

A useful report should include:

- Affected component, version, commit, or container image tag
- Reproduction steps with commands, requests, or a minimal proof of concept
- Expected and actual behavior, including security impact
- Any relevant logs, screenshots, or sanitized payloads
- Suggested remediation, if known

Do not include secrets, customer data, or destructive payloads. If a proof of concept requires a token, use a dummy value and clearly mark it as test-only.

### Severity Guide

- **Critical**: unauthenticated remote code execution, authentication bypass, or arbitrary secret disclosure
- **High**: privilege escalation, access to another user's configured servers, or sensitive data exposure
- **Medium**: limited information disclosure, security control bypass with prerequisites, or unsafe defaults
- **Low**: hardening gaps, missing documentation, or low-impact behavior that does not expose data

Maintainers may adjust severity based on exploitability, affected deployment mode, and whether the issue affects default configuration.

### Coordinated Disclosure

Please report security vulnerabilities privately to the maintainers rather than opening a public issue. Maintainers will acknowledge valid reports, investigate the impact, prepare a fix when appropriate, and coordinate disclosure timing with the reporter. Public discussion is welcome after a fix or mitigation is available.

## Reporting Security Issues

Please report security vulnerabilities privately to the maintainers. Do not open public issues for security vulnerabilities.
