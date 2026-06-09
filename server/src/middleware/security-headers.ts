/**
 * Security Headers Middleware
 *
 * Configures HTTP security headers using Helmet.js:
 * - Content Security Policy (CSP)
 * - HTTP Strict Transport Security (HSTS)
 * - X-Frame-Options (prevent clickjacking)
 * - X-Content-Type-Options (prevent MIME sniffing)
 * - Referrer-Policy
 * - Permissions-Policy
 */

import helmet from 'helmet';
import type { Request, Response, NextFunction } from 'express';
import logger from '../logging/logger.js';

/**
 * Validate CORS origin configuration
 * Rejects wildcard origins in production
 */
export function validateCorsOrigin(origin: string | string[]): void {
  if (process.env.NODE_ENV === 'production') {
    const origins = Array.isArray(origin) ? origin : [origin];

    for (const o of origins) {
      if (o === '*') {
        throw new Error(
          'CORS wildcard origin (*) is not allowed in production. Specify allowed origins explicitly.'
        );
      }
    }
  }
}

/**
 * Security headers middleware using Helmet.js
 * Configures all recommended security headers
 */
export const securityHeaders = helmet({
  // Content Security Policy
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      // Allow inline scripts and styles for Swagger UI
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", 'data:'],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
      // Upgrade insecure requests in production
      ...(process.env.NODE_ENV === 'production' ? { upgradeInsecureRequests: [] } : {}),
    },
  },

  // HTTP Strict Transport Security (HSTS)
  // Forces HTTPS for 1 year, including subdomains
  hsts: {
    maxAge: 31536000, // 1 year in seconds
    includeSubDomains: true,
    preload: true,
  },

  // X-Frame-Options: Prevent clickjacking
  frameguard: {
    action: 'deny',
  },

  // X-Content-Type-Options: Prevent MIME sniffing
  noSniff: true,

  // X-DNS-Prefetch-Control: Control DNS prefetching
  dnsPrefetchControl: {
    allow: false,
  },

  // X-Download-Options: Prevent IE from executing downloads
  ieNoOpen: true,

  // Referrer-Policy: Control referrer information
  referrerPolicy: {
    policy: 'strict-origin-when-cross-origin',
  },

  // Hide X-Powered-By header
  hidePoweredBy: true,

  // Cross-Origin-Embedder-Policy
  crossOriginEmbedderPolicy: false, // Disabled for compatibility with Swagger UI

  // Cross-Origin-Opener-Policy
  crossOriginOpenerPolicy: {
    policy: 'same-origin',
  },

  // Cross-Origin-Resource-Policy
  crossOriginResourcePolicy: {
    policy: 'same-origin',
  },

  // Origin-Agent-Cluster
  originAgentCluster: true,
});

/**
 * Additional security headers not covered by Helmet
 */
export function additionalSecurityHeaders(req: Request, res: Response, next: NextFunction): void {
  // Permissions-Policy (formerly Feature-Policy)
  // Restrict browser features
  res.setHeader(
    'Permissions-Policy',
    [
      'geolocation=()',
      'microphone=()',
      'camera=()',
      'payment=()',
      'usb=()',
      'magnetometer=()',
      'gyroscope=()',
      'accelerometer=()',
    ].join(', ')
  );

  // X-Permitted-Cross-Domain-Policies
  // Control Adobe Flash and PDF cross-domain policies
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');

  // Clear-Site-Data (for logout endpoints)
  if (req.path.includes('/logout')) {
    res.setHeader('Clear-Site-Data', '"cache", "cookies", "storage"');
  }

  next();
}

/**
 * CORS validation middleware
 * Validates CORS configuration in production
 */
export function validateCorsMiddleware(
  allowedOrigins: string | string[]
): (req: Request, res: Response, next: NextFunction) => void {
  try {
    validateCorsOrigin(allowedOrigins);
  } catch (error) {
    logger.error('Invalid CORS configuration', { error: (error as Error).message });
    throw error;
  }

  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.get('origin');

    if (!origin) {
      return next();
    }

    const origins = Array.isArray(allowedOrigins) ? allowedOrigins : [allowedOrigins];

    // Check if origin is allowed
    const isAllowed = origins.includes('*') || origins.includes(origin);

    if (!isAllowed && process.env.NODE_ENV === 'production') {
      logger.warn('Rejected request from disallowed origin', {
        origin,
        path: req.path,
        ip: req.ip,
      });
      return res.status(403).json({ error: 'Forbidden: Origin not allowed' });
    }

    next();
  };
}

/**
 * Security audit middleware
 * Logs security-relevant events for audit trail
 */
export function securityAuditMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Log sensitive operations
  const sensitivePaths = ['/api/auth', '/api/servers', '/api/users', '/api/config'];
  const isSensitive = sensitivePaths.some((path) => req.path.startsWith(path));

  if (isSensitive && req.method !== 'GET') {
    logger.info('Security audit', {
      method: req.method,
      path: req.path,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      timestamp: new Date().toISOString(),
    });
  }

  next();
}

/**
 * Request size limiter
 * Prevents large payload attacks
 */
export function requestSizeLimiter(maxSizeBytes: number) {
  return (req: Request, res: Response, next: NextFunction): void | Response => {
    const contentLength = parseInt(req.get('content-length') ?? '0', 10);

    if (contentLength > maxSizeBytes) {
      logger.warn('Request payload too large', {
        size: contentLength,
        limit: maxSizeBytes,
        path: req.path,
        ip: req.ip,
      });

      return res.status(413).json({
        error: 'Payload too large',
        limit: maxSizeBytes,
        received: contentLength,
      });
    }

    next();
  };
}

/**
 * HTTP method validation
 * Only allow specified HTTP methods
 */
export function allowedMethodsMiddleware(allowedMethods: string[]) {
  return (req: Request, res: Response, next: NextFunction): void | Response => {
    if (!allowedMethods.includes(req.method)) {
      logger.warn('Disallowed HTTP method', {
        method: req.method,
        path: req.path,
        ip: req.ip,
      });

      return res.status(405).json({
        error: 'Method not allowed',
        allowed: allowedMethods,
      });
    }

    next();
  };
}

/**
 * Strict Content-Type validation
 * Requires Content-Type header for POST/PUT/PATCH requests
 */
export function strictContentTypeMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void | Response {
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    const contentType = req.get('content-type');

    if (!contentType) {
      return res.status(400).json({
        error: 'Content-Type header required',
      });
    }

    // Require JSON for API endpoints
    if (req.path.startsWith('/api/') && !contentType.includes('application/json')) {
      return res.status(415).json({
        error: 'Unsupported Media Type: application/json required',
      });
    }
  }

  next();
}

export default {
  securityHeaders,
  additionalSecurityHeaders,
  validateCorsMiddleware,
  securityAuditMiddleware,
  requestSizeLimiter,
  allowedMethodsMiddleware,
  strictContentTypeMiddleware,
  validateCorsOrigin,
};
