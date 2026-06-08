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

## Reporting Security Issues

Please report security vulnerabilities privately to the maintainers. Do not open public issues for security vulnerabilities.
