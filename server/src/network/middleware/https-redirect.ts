/**
 * HTTPS Redirect Middleware
 *
 * Automatically redirects HTTP requests to HTTPS.
 * Preserves query parameters, paths, and request methods.
 */

import type { Request, Response, NextFunction } from 'express';
import logger from '../../logging/logger.js';

export interface HttpsRedirectOptions {
  /**
   * Enable HTTPS redirect
   * @default true
   */
  enabled?: boolean;

  /**
   * HTTPS port (default: 443)
   * @default 443
   */
  httpsPort?: number;

  /**
   * Status code for redirect
   * 301 = Permanent, 302 = Temporary
   * @default 301
   */
  statusCode?: 301 | 302 | 307 | 308;

  /**
   * Paths to exclude from redirect (e.g., health checks)
   * @default []
   */
  excludePaths?: string[];

  /**
   * Trust X-Forwarded-Proto header (for reverse proxies)
   * @default true
   */
  trustProxy?: boolean;
}

/**
 * Create HTTPS redirect middleware
 *
 * Redirects all HTTP requests to HTTPS, preserving:
 * - Path and query parameters
 * - Request method (via 307/308 status codes)
 *
 * @param options Redirect configuration
 * @returns Express middleware function
 */
export function httpsRedirect(options: HttpsRedirectOptions = {}) {
  const {
    enabled = true,
    httpsPort = 443,
    statusCode = 301,
    excludePaths = [],
    trustProxy = true,
  } = options;

  return function (req: Request, res: Response, next: NextFunction): void {
    // Skip if redirect is disabled
    if (!enabled) {
      return next();
    }

    // Skip excluded paths
    if (excludePaths.some((path) => req.path.startsWith(path))) {
      return next();
    }

    // Determine if request is secure
    const isSecure = trustProxy
      ? req.secure || req.headers['x-forwarded-proto'] === 'https'
      : req.secure;

    // If already HTTPS, continue
    if (isSecure) {
      return next();
    }

    // Build HTTPS URL
    const hostname = req.hostname;
    const port = httpsPort === 443 ? '' : `:${httpsPort}`;
    const httpsUrl = `https://${hostname}${port}${req.originalUrl}`;

    logger.debug('Redirecting HTTP to HTTPS', {
      from: `http://${req.hostname}${req.originalUrl}`,
      to: httpsUrl,
      statusCode,
    });

    // Redirect to HTTPS
    res.redirect(statusCode, httpsUrl);
  };
}

/**
 * HSTS middleware
 *
 * Adds HTTP Strict Transport Security header.
 * Should only be used on HTTPS connections.
 *
 * @param options HSTS configuration
 * @returns Express middleware function
 */
export function hstsMiddleware(
  options: {
    maxAge?: number;
    includeSubdomains?: boolean;
    preload?: boolean;
  } = {}
) {
  const { maxAge = 31536000, includeSubdomains = true, preload = false } = options;

  const hstsValue = [
    `max-age=${maxAge}`,
    includeSubdomains && 'includeSubDomains',
    preload && 'preload',
  ]
    .filter(Boolean)
    .join('; ');

  return function (req: Request, res: Response, next: NextFunction): void {
    // Only add HSTS on HTTPS
    if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
      res.setHeader('Strict-Transport-Security', hstsValue);
    }
    next();
  };
}

/**
 * Create conditional middleware
 *
 * Only applies middleware if condition is met.
 *
 * @param condition Function returning true to apply middleware
 * @param middleware Middleware to apply conditionally
 * @returns Conditional middleware function
 */
export function conditionalMiddleware(
  condition: (req: Request) => boolean,
  middleware: (req: Request, res: Response, next: NextFunction) => void
) {
  return function (req: Request, res: Response, next: NextFunction): void {
    if (condition(req)) {
      return middleware(req, res, next);
    }
    next();
  };
}

/**
 * Enforce HTTPS middleware
 *
 * More strict than redirect - returns 403 for HTTP requests.
 * Useful for API endpoints that should never use HTTP.
 *
 * @param options Enforcement options
 * @returns Express middleware function
 */
export function enforceHttps(
  options: {
    trustProxy?: boolean;
    excludePaths?: string[];
  } = {}
) {
  const { trustProxy = true, excludePaths = [] } = options;

  return function (req: Request, res: Response, next: NextFunction): void {
    // Skip excluded paths
    if (excludePaths.some((path) => req.path.startsWith(path))) {
      next();
      return;
    }

    // Determine if request is secure
    const isSecure = trustProxy
      ? req.secure || req.headers['x-forwarded-proto'] === 'https'
      : req.secure;

    if (!isSecure) {
      logger.warn('HTTP request rejected (HTTPS required)', {
        path: req.path,
        ip: req.ip,
      });

      res.status(403).json({
        error: 'HTTPS Required',
        message: 'This endpoint requires a secure HTTPS connection',
      });
      return;
    }

    next();
  };
}

export default {
  httpsRedirect,
  hstsMiddleware,
  conditionalMiddleware,
  enforceHttps,
};
