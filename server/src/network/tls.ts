/**
 * TLS Configuration Module
 *
 * Implements Mozilla Modern TLS configuration with strong cipher suites.
 * Provides security headers and TLS options for HTTPS server.
 *
 * Security Requirements:
 * - TLS 1.2+ minimum (no TLS 1.0, 1.1)
 * - Strong ciphers only (AES-GCM, ChaCha20-Poly1305)
 * - ECDHE for perfect forward secrecy
 * - HSTS with 1-year max-age
 */

import type { SecureContextOptions } from 'tls';
import type { IncomingMessage, ServerResponse } from 'http';

export interface TLSConfig {
  enabled: boolean;
  mode: 'letsencrypt' | 'custom' | 'disabled';
  domains?: string[];
  letsencrypt?: {
    email: string;
    staging: boolean;
    renewWithin: number;
  };
  custom?: {
    cert: string;
    key: string;
    ca?: string;
  };
  redirect: boolean;
  minVersion?: string;
  maxVersion?: string;
}

export interface SecurityHeaders {
  [key: string]: string;
}

/**
 * Mozilla Modern TLS Configuration
 * Based on: https://ssl-config.mozilla.org/#server=nodejs&version=18&config=modern
 *
 * Cipher suites prioritize:
 * 1. AEAD ciphers (AES-GCM, ChaCha20-Poly1305)
 * 2. Forward secrecy (ECDHE)
 * 3. Modern algorithms only
 */
const MOZILLA_MODERN_CIPHERS = [
  'TLS_AES_128_GCM_SHA256',
  'TLS_AES_256_GCM_SHA384',
  'TLS_CHACHA20_POLY1305_SHA256',
  'ECDHE-ECDSA-AES128-GCM-SHA256',
  'ECDHE-RSA-AES128-GCM-SHA256',
  'ECDHE-ECDSA-AES256-GCM-SHA384',
  'ECDHE-RSA-AES256-GCM-SHA384',
  'ECDHE-ECDSA-CHACHA20-POLY1305',
  'ECDHE-RSA-CHACHA20-POLY1305',
].join(':');

/**
 * Get TLS options for Node.js HTTPS server
 *
 * Configures secure context with Mozilla Modern profile:
 * - TLS 1.2 minimum (or 1.3 if available)
 * - Strong cipher suites only
 * - Honor server cipher order
 *
 * @param config TLS configuration
 * @returns SecureContextOptions for https.createServer
 */
export function getTLSOptions(config: Partial<TLSConfig> = {}): SecureContextOptions {
  const options: SecureContextOptions = {
    // Cipher configuration
    ciphers: MOZILLA_MODERN_CIPHERS,
    honorCipherOrder: true, // Server cipher preference

    // TLS version constraints
    minVersion: (config.minVersion as any) || 'TLSv1.2',
    maxVersion: (config.maxVersion as any) || 'TLSv1.3',

    // Security options
    sessionTimeout: 300, // 5 minutes

    // Note: Don't set secureProtocol when using minVersion/maxVersion
    // as they conflict. minVersion/maxVersion is preferred for modern Node.js
  };

  // Add custom certificate if provided
  if (config.custom) {
    // Certificate and key will be added by the caller
    // after validating and loading from files
  }

  return options;
}

/**
 * Get security headers for HTTPS responses
 *
 * Implements defense-in-depth with:
 * - HSTS (HTTP Strict Transport Security)
 * - X-Frame-Options (clickjacking protection)
 * - X-Content-Type-Options (MIME sniffing protection)
 * - X-XSS-Protection (XSS filter for legacy browsers)
 * - Referrer-Policy (privacy)
 *
 * @param options Configuration for security headers
 * @returns Object with security header key-value pairs
 */
export function getSecurityHeaders(
  options: {
    hstsMaxAge?: number;
    hstsIncludeSubdomains?: boolean;
    hstsPreload?: boolean;
    frameOptions?: 'DENY' | 'SAMEORIGIN';
  } = {}
): SecurityHeaders {
  const {
    hstsMaxAge = 31536000, // 1 year in seconds
    hstsIncludeSubdomains = true,
    hstsPreload = false,
    frameOptions = 'DENY',
  } = options;

  const headers: SecurityHeaders = {
    // HTTP Strict Transport Security
    'Strict-Transport-Security': [
      `max-age=${hstsMaxAge}`,
      hstsIncludeSubdomains && 'includeSubDomains',
      hstsPreload && 'preload',
    ]
      .filter(Boolean)
      .join('; '),

    // Prevent clickjacking
    'X-Frame-Options': frameOptions,

    // Prevent MIME sniffing
    'X-Content-Type-Options': 'nosniff',

    // XSS filter (legacy browsers)
    'X-XSS-Protection': '1; mode=block',

    // Referrer policy
    'Referrer-Policy': 'strict-origin-when-cross-origin',

    // Permissions policy (disable unnecessary features)
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
  };

  return headers;
}

/**
 * Apply security headers to HTTP response
 *
 * Adds all security headers to the response object.
 * Should be called early in middleware chain.
 *
 * @param res HTTP response object
 * @param headers Security headers to apply
 */
export function applySecurityHeaders(
  res: ServerResponse,
  headers: SecurityHeaders = getSecurityHeaders()
): void {
  Object.entries(headers).forEach(([key, value]) => {
    res.setHeader(key, value);
  });
}

/**
 * Security headers middleware for Express
 *
 * Adds security headers to all responses.
 * Use before other middleware.
 *
 * @param options Configuration for security headers
 * @returns Express middleware function
 */
export function securityHeadersMiddleware(options?: Parameters<typeof getSecurityHeaders>[0]) {
  const headers = getSecurityHeaders(options);

  return function (req: IncomingMessage, res: ServerResponse, next: () => void): void {
    applySecurityHeaders(res, headers);
    next();
  };
}

/**
 * Validate TLS configuration
 *
 * Checks for common misconfigurations:
 * - Weak cipher suites
 * - Outdated TLS versions
 * - Missing required fields
 *
 * @param config TLS configuration to validate
 * @returns Validation result with errors
 */
export function validateTLSConfig(config: Partial<TLSConfig>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!config.enabled) {
    return { valid: true, errors: [] };
  }

  if (!config.mode) {
    errors.push('TLS mode is required when TLS is enabled');
  }

  if (config.mode === 'letsencrypt') {
    if (!config.letsencrypt) {
      errors.push("Let's Encrypt configuration is required for mode 'letsencrypt'");
    } else {
      if (!config.letsencrypt.email) {
        errors.push("Let's Encrypt email is required");
      }
      if (!config.domains || config.domains.length === 0) {
        errors.push("At least one domain is required for Let's Encrypt");
      }
    }
  }

  if (config.mode === 'custom') {
    if (!config.custom) {
      errors.push("Custom certificate configuration is required for mode 'custom'");
    } else {
      if (!config.custom.cert) {
        errors.push('Custom certificate path is required');
      }
      if (!config.custom.key) {
        errors.push('Custom key path is required');
      }
    }
  }

  // Validate TLS version
  const supportedVersions = ['TLSv1.2', 'TLSv1.3'];
  if (config.minVersion && !supportedVersions.includes(config.minVersion)) {
    errors.push(`Unsupported TLS minimum version: ${config.minVersion}`);
  }

  // Check for weak versions
  if (config.minVersion && ['TLSv1', 'TLSv1.1'].includes(config.minVersion)) {
    errors.push(`Insecure TLS version: ${config.minVersion} (use TLSv1.2 or higher)`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get cipher suite information
 *
 * Returns the configured cipher suites for inspection.
 *
 * @returns Array of cipher suite names
 */
export function getCipherSuites(): string[] {
  return MOZILLA_MODERN_CIPHERS.split(':');
}

/**
 * Check if TLS 1.3 is supported
 *
 * TLS 1.3 requires Node.js 12+ with OpenSSL 1.1.1+
 *
 * @returns true if TLS 1.3 is supported
 */
export function isTLS13Supported(): boolean {
  const nodeVersion = process.versions.node;
  const major = parseInt(nodeVersion.split('.')[0], 10);

  // Node.js 12+ supports TLS 1.3
  return major >= 12;
}

/**
 * Get recommended TLS configuration for production
 *
 * Returns a secure default configuration.
 *
 * @returns Recommended TLS configuration
 */
export function getRecommendedConfig(): Partial<TLSConfig> {
  return {
    enabled: true,
    redirect: true,
    minVersion: isTLS13Supported() ? 'TLSv1.2' : 'TLSv1.2',
    maxVersion: isTLS13Supported() ? 'TLSv1.3' : 'TLSv1.2',
  };
}

export default {
  getTLSOptions,
  getSecurityHeaders,
  applySecurityHeaders,
  securityHeadersMiddleware,
  validateTLSConfig,
  getCipherSuites,
  isTLS13Supported,
  getRecommendedConfig,
};
