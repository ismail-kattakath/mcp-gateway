/**
 * Structured Logging v3 (Pino)
 *
 * Production-grade structured logging with:
 * - 3x performance vs Winston
 * - JSON structured output
 * - Enhanced sanitization
 * - Request context propagation
 * - Log rotation
 *
 * @example
 * ```typescript
 * import logger from './logging-v3';
 * logger.info({ serverName: 'obs' }, 'Server started');
 * ```
 */

// Main logger
export { default as logger, LOG_DIR } from './logger.js';

// Logger utilities
export {
  createComponentLogger,
  createServerLogger,
  logError,
  logFatal,
  logPerformance,
  logAudit,
} from './logger.js';

// Middleware
export {
  createLoggingMiddleware,
  createPinoHttpMiddleware,
  errorLoggingMiddleware,
  requestContextMiddleware,
} from './middleware.js';

// Context propagation
export {
  generateRequestId,
  getRequestContext,
  getRequestId,
  createChildLogger,
  runWithContext,
  withContext,
  asyncLocalStorage,
} from './context.js';
export type { RequestContext } from './context.js';

// Sanitization
export {
  // Base sanitizers
  sanitizeServerName,
  sanitizeUrl,
  sanitizeArgs,
  sanitizeEnv,
  sanitizeIp,
  sanitizePath,
  sanitizeObject,
  // Enhanced sanitizers
  sanitizeStringEnhanced,
  sanitizeRequest,
  sanitizeResponse,
  sanitizeErrorEnhanced,
  containsSensitiveData,
  createPinoSerializers,
} from './sanitizer.js';

// Re-export default
export { default } from './logger.js';
