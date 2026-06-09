/**
 * Log Sanitization Utilities
 *
 * Enterprise-grade input sanitization for logs to prevent:
 * - Log injection attacks (CRLF, null bytes)
 * - Information disclosure (secrets, tokens, PII)
 * - Log flooding (excessively long values)
 *
 * Addresses CodeQL security warnings about logging user-provided values.
 */

const MAX_LOG_LENGTH = 200;
const TRUNCATION_SUFFIX = '...[truncated]';

/**
 * Patterns for detecting sensitive data that should be redacted
 */
const SENSITIVE_PATTERNS = [
  // API keys, tokens, secrets
  { pattern: /api[_-]?key/i, replacement: '[REDACTED_API_KEY]' },
  { pattern: /auth[_-]?token/i, replacement: '[REDACTED_AUTH_TOKEN]' },
  { pattern: /bearer\s+\S+/gi, replacement: 'Bearer [REDACTED]' },
  { pattern: /password/i, replacement: '[REDACTED_PASSWORD]' },
  { pattern: /secret/i, replacement: '[REDACTED_SECRET]' },
  // Common secret patterns (AWS, GitHub tokens, etc.)
  {
    pattern: /(?:AKIA|ASIA)[0-9A-Z]{16}/g,
    replacement: '[REDACTED_AWS_KEY]',
  },
  { pattern: /ghp_[a-zA-Z0-9]{20,}/g, replacement: '[REDACTED_GITHUB_TOKEN]' },
  { pattern: /gho_[a-zA-Z0-9]{20,}/g, replacement: '[REDACTED_GITHUB_TOKEN]' },
  // JWTs
  {
    pattern: /eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g,
    replacement: '[REDACTED_JWT]',
  },
];

/**
 * Characters that can cause log injection attacks
 */
// eslint-disable-next-line no-control-regex
const DANGEROUS_CHARS = /[\x00-\x1F\x7F-\x9F]/g;

/**
 * Sanitizes a string for safe logging by:
 * 1. Removing control characters (CRLF, null bytes, etc.)
 * 2. Truncating to reasonable length
 * 3. Redacting sensitive patterns
 */
export function sanitizeString(value: string, maxLength = MAX_LOG_LENGTH): string {
  if (typeof value !== 'string') {
    value = String(value);
  }

  // Remove dangerous control characters
  let sanitized = value.replace(DANGEROUS_CHARS, '');

  // Truncate if too long
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength) + TRUNCATION_SUFFIX;
  }

  // Redact sensitive patterns
  for (const { pattern, replacement } of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, replacement);
  }

  return sanitized;
}

/**
 * Sanitizes server names for logging
 */
export function sanitizeServerName(serverName: unknown): string {
  if (typeof serverName !== 'string') {
    return '[INVALID_SERVER_NAME]';
  }
  // Sanitize first (remove control chars, truncate)
  const sanitized = serverName.replace(DANGEROUS_CHARS, '').substring(0, 50);

  // Only allow a strict safe identifier for logging; otherwise return constant marker
  if (!/^[a-zA-Z0-9_-]+$/.test(sanitized) || sanitized.length === 0) {
    return '[INVALID_SERVER_NAME]';
  }
  return sanitized;
}

/**
 * Sanitizes domain names for logging.
 * Returns a constant marker for invalid/unexpected input.
 */
export function sanitizeDomainForLog(domain: unknown): string {
  if (typeof domain !== 'string') {
    return '[INVALID_DOMAIN]';
  }

  const sanitized = domain.replace(DANGEROUS_CHARS, '').trim().toLowerCase().substring(0, 253);

  // Allow standard domain and wildcard domain characters only
  if (!/^(?:\*\.)?[a-z0-9.-]+$/.test(sanitized) || sanitized.length === 0) {
    return '[INVALID_DOMAIN]';
  }

  return sanitized;
}

/**
 * Sanitizes URLs by removing credentials and query parameters
 */
export function sanitizeUrl(url: unknown): string {
  if (typeof url !== 'string') {
    return '[INVALID_URL]';
  }

  try {
    const parsed = new URL(url);
    // Remove credentials
    parsed.username = '';
    parsed.password = '';
    // Keep only protocol, host, and pathname
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    // Not a valid URL, treat as potentially sensitive string
    return '[INVALID_URL]';
  }
}

/**
 * Sanitizes command arguments by redacting anything that looks sensitive
 */
export function sanitizeArgs(args: unknown): string[] {
  if (!Array.isArray(args)) {
    return ['[INVALID_ARGS]'];
  }

  return args.map((arg) => {
    const str = String(arg);
    // Redact anything after --password, --token, --key flags
    if (str.startsWith('--password=') || str.startsWith('--token=') || str.startsWith('--key=')) {
      return str.split('=')[0] + '=[REDACTED]';
    }
    return sanitizeString(str, 100);
  });
}

/**
 * Sanitizes environment variables by redacting sensitive keys
 */
export function sanitizeEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const sanitized: Record<string, string> = {};
  const sensitiveKeys = /^(.*KEY.*|.*TOKEN.*|.*SECRET.*|.*PASSWORD.*|AWS_.*)$/i;

  for (const [key, value] of Object.entries(env)) {
    if (sensitiveKeys.test(key)) {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = sanitizeString(value ?? '', 100);
    }
  }

  return sanitized;
}

/**
 * Sanitizes an error object for logging
 */
export function sanitizeError(error: unknown): {
  message: string;
  name?: string;
  code?: string;
  stack?: string;
} {
  if (error instanceof Error) {
    return {
      message: sanitizeString(error.message, 500),
      name: error.name,
      code: 'code' in error ? String(error.code) : undefined,
      stack:
        process.env.NODE_ENV !== 'production' && error.stack
          ? sanitizeString(error.stack, 1000)
          : undefined,
    };
  }

  return {
    message: sanitizeString(String(error), 500),
  };
}

/**
 * Sanitizes an IP address (preserves format but masks last octet for privacy)
 */
export function sanitizeIp(ip: unknown): string {
  if (typeof ip !== 'string') {
    return '[INVALID_IP]';
  }

  // IPv4: mask last octet
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) {
    return ip.replace(/\.\d{1,3}$/, '.xxx');
  }

  // IPv6: mask last segment
  if (ip.includes(':')) {
    return ip.replace(/:[^:]+$/, ':xxxx');
  }

  return '[INVALID_IP]';
}

/**
 * Sanitizes a path by ensuring it doesn't expose system details
 */
export function sanitizePath(filePath: unknown): string {
  if (typeof filePath !== 'string') {
    return '[INVALID_PATH]';
  }

  let sanitized = filePath;

  // Remove home directory paths
  if (process.env.HOME) {
    sanitized = sanitized.replace(new RegExp(process.env.HOME, 'g'), '~');
  }

  // Remove user directories
  sanitized = sanitized.replace(/\/Users\/[^/]+/g, '/Users/[USER]');
  sanitized = sanitized.replace(/\/home\/[^/]+/g, '/home/[USER]');

  return sanitizeString(sanitized, 150);
}

/**
 * Sanitizes an object for logging (recursively sanitizes all values)
 */
export function sanitizeObject(obj: unknown, depth = 0, maxDepth = 3): unknown {
  // Prevent infinite recursion
  if (depth > maxDepth) {
    return '[MAX_DEPTH_EXCEEDED]';
  }

  // Handle primitives
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return sanitizeString(obj);
  }

  if (typeof obj === 'number' || typeof obj === 'boolean') {
    return obj;
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    if (obj.length > 20) {
      return `[Array(${obj.length}) - truncated]`;
    }
    return obj.map((item) => sanitizeObject(item, depth + 1, maxDepth));
  }

  // Handle objects
  if (typeof obj === 'object') {
    const sanitized: Record<string, unknown> = {};
    const entries = Object.entries(obj);

    if (entries.length > 50) {
      return `[Object with ${entries.length} keys - truncated]`;
    }

    for (const [key, value] of entries) {
      // Filter dangerous keys to prevent prototype pollution
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        continue;
      }

      // Redact sensitive keys
      if (/password|secret|token|key|auth/i.test(key)) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = sanitizeObject(value, depth + 1, maxDepth);
      }
    }

    return sanitized;
  }

  // Fallback for functions, symbols, etc.
  return String(obj);
}
