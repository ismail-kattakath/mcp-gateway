/**
 * Enhanced Log Sanitization for Pino
 *
 * Extends existing sanitizer.ts with additional patterns:
 * - Credit cards (PCI-DSS compliance)
 * - Email addresses (PII protection)
 * - Phone numbers
 * - More token patterns (Stripe, Azure, etc.)
 * - Enhanced CRLF and control character prevention
 *
 * Works with Pino's serializers API for automatic sanitization.
 */

// Import and re-export all existing sanitizers
export * from '../logging/sanitizer.js';

const MAX_LOG_LENGTH = 200;
const TRUNCATION_SUFFIX = '...[truncated]';

/**
 * Base sensitive patterns from existing sanitizer (duplicated for enhanced sanitizer)
 */
const BASE_PATTERNS = [
  // API keys, tokens, secrets
  { pattern: /api[_-]?key/i, replacement: '[REDACTED_API_KEY]' },
  { pattern: /auth[_-]?token/i, replacement: '[REDACTED_AUTH_TOKEN]' },
  { pattern: /bearer\s+\S+/gi, replacement: 'Bearer [REDACTED]' },
  { pattern: /password/i, replacement: '[REDACTED_PASSWORD]' },
  { pattern: /secret/i, replacement: '[REDACTED_SECRET]' },
  // AWS keys
  {
    pattern: /(?:AKIA|ASIA)[0-9A-Z]{16}/g,
    replacement: '[REDACTED_AWS_KEY]',
  },
  // GitHub tokens
  { pattern: /ghp_[a-zA-Z0-9]{20,}/g, replacement: '[REDACTED_GITHUB_TOKEN]' },
  { pattern: /gho_[a-zA-Z0-9]{20,}/g, replacement: '[REDACTED_GITHUB_TOKEN]' },
  // JWTs
  {
    pattern: /eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g,
    replacement: '[REDACTED_JWT]',
  },
];

/**
 * Additional sensitive patterns for enhanced security
 */
const ADDITIONAL_PATTERNS = [
  // Credit cards (major card types)
  {
    pattern: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
    replacement: '[REDACTED_CREDIT_CARD]',
  },
  // Email addresses
  {
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    replacement: '[REDACTED_EMAIL]',
  },
  // Phone numbers (various formats)
  {
    pattern: /\b(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    replacement: '[REDACTED_PHONE]',
  },
  // Stripe keys
  {
    pattern: /sk_live_[a-zA-Z0-9]{24,}/g,
    replacement: '[REDACTED_STRIPE_SECRET]',
  },
  {
    pattern: /sk_test_[a-zA-Z0-9]{24,}/g,
    replacement: '[REDACTED_STRIPE_TEST]',
  },
  // Azure tokens
  {
    pattern: /[a-zA-Z0-9/+]{86}==/g,
    replacement: '[REDACTED_AZURE_TOKEN]',
  },
  // Private keys (PEM format)
  {
    pattern: /-----BEGIN (RSA |EC )?PRIVATE KEY-----[\s\S]*?-----END (RSA |EC )?PRIVATE KEY-----/g,
    replacement: '[REDACTED_PRIVATE_KEY]',
  },
  // SSH private keys
  {
    pattern: /-----BEGIN OPENSSH PRIVATE KEY-----[\s\S]*?-----END OPENSSH PRIVATE KEY-----/g,
    replacement: '[REDACTED_SSH_PRIVATE_KEY]',
  },
];

// Combine all patterns
const ENHANCED_PATTERNS = [...BASE_PATTERNS, ...ADDITIONAL_PATTERNS];

/**
 * Enhanced string sanitization with additional patterns
 */
export function sanitizeStringEnhanced(value: string, maxLength = MAX_LOG_LENGTH): string {
  if (typeof value !== 'string') {
    value = String(value);
  }

  // Remove dangerous control characters (same as base)
  // eslint-disable-next-line no-control-regex
  let sanitized = value.replace(/[\x00-\x1F\x7F-\x9F]/g, '');

  // Apply enhanced patterns
  for (const { pattern, replacement } of ENHANCED_PATTERNS) {
    sanitized = sanitized.replace(pattern, replacement);
  }

  // Truncate if too long
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength) + TRUNCATION_SUFFIX;
  }

  return sanitized;
}

/**
 * Pino serializer for request objects
 * Sanitizes headers, query params, and body
 */
export function sanitizeRequest(req: any): Record<string, unknown> {
  if (!req) return {};

  const sanitized: Record<string, unknown> = {
    id: req.id,
    method: req.method,
    url: sanitizeUrl(req.url || req.originalUrl),
    remoteAddress: sanitizeIp(req.ip || req.connection?.remoteAddress),
  };

  // Sanitize headers
  if (req.headers) {
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (/authorization|cookie|x-api-key|x-auth-token/i.test(key) && typeof value === 'string') {
        headers[key] = '[REDACTED]';
      } else {
        headers[key] = sanitizeStringEnhanced(String(value), 100);
      }
    }
    sanitized.headers = headers;
  }

  // Sanitize query parameters
  if (req.query && typeof req.query === 'object') {
    sanitized.query = sanitizeObject(req.query, 0, 2);
  }

  // Sanitize body (limited)
  if (req.body && typeof req.body === 'object') {
    sanitized.body = sanitizeObject(req.body, 0, 2);
  }

  return sanitized;
}

/**
 * Pino serializer for response objects
 */
export function sanitizeResponse(res: any): Record<string, unknown> {
  if (!res) return {};

  return {
    statusCode: res.statusCode,
    headers: res.getHeaders?.() || {},
  };
}

/**
 * Pino serializer for error objects with enhanced sanitization
 */
export function sanitizeErrorEnhanced(err: unknown): Record<string, unknown> {
  if (!err) return {};

  if (err instanceof Error) {
    const sanitized: Record<string, unknown> = {
      type: err.name,
      message: sanitizeStringEnhanced(err.message, 500),
    };

    // Add code if present
    if ('code' in err && err.code) {
      sanitized.code = String(err.code);
    }

    // Add stack in non-production
    if (process.env.NODE_ENV !== 'production' && err.stack) {
      sanitized.stack = sanitizeStringEnhanced(err.stack, 2000)
        .split('\n')
        .map((line) => line.trim());
    }

    // Add any additional properties with enhanced sanitization
    for (const [key, value] of Object.entries(err)) {
      if (!['name', 'message', 'stack', 'code'].includes(key)) {
        // Check if key looks sensitive
        if (/password|secret|token|key|auth/i.test(key)) {
          sanitized[key] = '[REDACTED]';
        } else if (typeof value === 'string') {
          sanitized[key] = sanitizeStringEnhanced(value);
        } else {
          sanitized[key] = sanitizeObject(value, 0, 2);
        }
      }
    }

    return sanitized;
  }

  return {
    type: 'Unknown',
    message: sanitizeStringEnhanced(String(err), 500),
  };
}

/**
 * Detect if a string contains sensitive data patterns
 */
export function containsSensitiveData(value: string): boolean {
  if (typeof value !== 'string') return false;

  // Check all enhanced patterns
  for (const { pattern } of ENHANCED_PATTERNS) {
    if (pattern.test(value)) {
      return true;
    }
  }

  // Check common sensitive keywords
  const sensitiveKeywords = /password|secret|token|key|credit|ssn|credential/i;
  return sensitiveKeywords.test(value);
}

/**
 * Create Pino serializers object for automatic sanitization
 */
export function createPinoSerializers() {
  return {
    req: sanitizeRequest,
    res: sanitizeResponse,
    err: sanitizeErrorEnhanced,
  };
}

// Re-export base sanitizers with 'Base' prefix for clarity
import {
  sanitizeString,
  sanitizeServerName,
  sanitizeUrl,
  sanitizeArgs,
  sanitizeEnv,
  sanitizeError,
  sanitizeIp,
  sanitizePath,
  sanitizeObject,
} from '../logging/sanitizer.js';

export {
  sanitizeString,
  sanitizeString as sanitizeStringBase,
  sanitizeServerName,
  sanitizeUrl,
  sanitizeArgs,
  sanitizeEnv,
  sanitizeError,
  sanitizeError as sanitizeErrorBase,
  sanitizeIp,
  sanitizePath,
  sanitizeObject,
};
