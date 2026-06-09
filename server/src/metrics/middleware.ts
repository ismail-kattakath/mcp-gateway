/**
 * HTTP Metrics Middleware
 *
 * Express middleware for tracking HTTP request metrics:
 * - Request duration
 * - Request/response sizes
 * - Status codes
 * - Active requests
 */

import { Request, Response, NextFunction } from 'express';
import { Histogram, Counter, Gauge } from 'prom-client';
import { register } from './index.js';
import logger from '../logging/logger.js';

// ===== HTTP Request Metrics =====

/**
 * HTTP request duration in seconds
 * Labels: method, route, status_code
 */
const httpRequestDuration = new Histogram({
  name: 'mcp_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5, 10], // 10ms to 10s
  registers: [register],
});

/**
 * HTTP request size in bytes
 * Labels: method, route
 */
const httpRequestSize = new Histogram({
  name: 'mcp_http_request_size_bytes',
  help: 'HTTP request size in bytes',
  labelNames: ['method', 'route'],
  buckets: [100, 1000, 10000, 100000, 1000000], // 100B to 1MB
  registers: [register],
});

/**
 * HTTP response size in bytes
 * Labels: method, route
 */
const httpResponseSize = new Histogram({
  name: 'mcp_http_response_size_bytes',
  help: 'HTTP response size in bytes',
  labelNames: ['method', 'route'],
  buckets: [100, 1000, 10000, 100000, 1000000], // 100B to 1MB
  registers: [register],
});

/**
 * Total HTTP requests
 * Labels: method, route, status_code
 */
const httpRequestsTotal = new Counter({
  name: 'mcp_http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

/**
 * Number of active HTTP requests
 */
const httpActiveRequests = new Gauge({
  name: 'mcp_http_active_requests',
  help: 'Number of active HTTP requests',
  registers: [register],
});

/**
 * Normalize route path for metrics
 * Replaces dynamic segments with placeholders to prevent cardinality explosion
 */
function normalizeRoute(path: string): string {
  // Replace common dynamic segments
  const normalized = path
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:uuid') // UUIDs
    .replace(/\/session_[0-9]+_[a-f0-9]+/g, '/:sessionId') // Session IDs
    .replace(/\/[0-9]+/g, '/:id') // Numeric IDs
    .replace(/\/[a-zA-Z0-9-]+\/(start|stop|restart|enable|disable)/g, '/:serverName/$1'); // Server actions

  // Limit to known route patterns to prevent unbounded cardinality
  const knownRoutes = [
    '/health',
    '/healthz',
    '/readyz',
    '/metrics',
    '/sse',
    '/mcp/message',
    '/api/status',
    '/api/config',
    '/api/version',
    '/api/servers',
    '/api/servers/:serverName',
    '/api/servers/:serverName/start',
    '/api/servers/:serverName/stop',
    '/api/servers/:serverName/restart',
    '/api/servers/:serverName/enable',
    '/api/servers/:serverName/disable',
    '/api/logs',
    '/api/logs/:serverName',
    '/api/domains',
    '/docs',
    '/docs/openapi.json',
  ];

  // If normalized route matches a known pattern, use it; otherwise use "other"
  if (knownRoutes.includes(normalized) || normalized.startsWith('/docs')) {
    return normalized;
  }

  return '/other';
}

/**
 * HTTP metrics middleware
 */
export function httpMetricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  httpActiveRequests.inc();

  // Calculate request size
  const requestSize = parseInt(req.headers['content-length'] || '0', 10);

  // Track original end to intercept response
  const originalEnd = res.end;
  let responseSize = 0;

  // Override res.end to capture response size
  res.end = function (this: Response, chunk?: any, encoding?: any, callback?: any): Response {
    if (chunk) {
      if (Buffer.isBuffer(chunk)) {
        responseSize = chunk.length;
      } else if (typeof chunk === 'string') {
        responseSize = Buffer.byteLength(chunk, encoding || 'utf8');
      }
    }

    // Call original end
    originalEnd.call(this, chunk, encoding, callback);
    return this;
  } as any;

  // Record metrics when response finishes
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000; // Convert to seconds
    const route = normalizeRoute(req.path);
    const method = req.method;
    const statusCode = res.statusCode.toString();

    // Record metrics
    httpRequestDuration.observe({ method, route, status_code: statusCode }, duration);
    httpRequestSize.observe({ method, route }, requestSize);
    httpResponseSize.observe({ method, route }, responseSize);
    httpRequestsTotal.inc({ method, route, status_code: statusCode });
    httpActiveRequests.dec();

    logger.debug('HTTP metrics recorded', {
      method,
      route,
      statusCode,
      duration: `${(duration * 1000).toFixed(2)}ms`,
      requestSize: `${requestSize}B`,
      responseSize: `${responseSize}B`,
    });
  });

  // Handle aborted requests
  req.on('close', () => {
    if (!res.writableEnded) {
      httpActiveRequests.dec();
      logger.debug('HTTP request aborted', { method: req.method, path: req.path });
    }
  });

  next();
}

logger.info('HTTP metrics middleware initialized');
