/**
 * Pino Logger Configuration
 *
 * Production-grade structured logging with:
 * - JSON output for production
 * - Pretty printing for development
 * - Automatic sanitization
 * - Log rotation
 * - Context propagation
 * - Standardized error logging
 */

import pino from 'pino';
import type { Logger, LoggerOptions } from 'pino';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { RotatingFileStream } from 'pino-rotating-file-stream';
import { createPinoSerializers, sanitizeServerName, sanitizeStringEnhanced } from './sanitizer.js';
import { getRequestContext } from './context.js';

// Determine log directory from environment or default
const LOG_DIR: string =
  process.env.MCP_LOGS_DIR ?? path.join(process.env.HOME ?? '/tmp', '.mcp', 'logs');

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// Log level from environment or default to 'info'
const LOG_LEVEL: string = process.env.LOG_LEVEL ?? 'info';

// Pretty print in development
const PRETTY_PRINT = process.env.NODE_ENV !== 'production' && !process.env.CI;

/**
 * Create rotating file stream for logs
 */
function createRotatingStream(filename: string): RotatingFileStream {
  return new RotatingFileStream({
    path: path.join(LOG_DIR, filename),
    size: '10M', // Rotate when file reaches 10MB
    interval: '1d', // Rotate daily
    maxFiles: 7, // Keep 7 days of logs
    compress: 'gzip', // Compress old logs
  });
}

/**
 * Pino logger options
 */
const loggerOptions: LoggerOptions = {
  level: LOG_LEVEL,

  // Serializers for automatic sanitization
  serializers: createPinoSerializers(),

  // Base fields to include in every log
  base: {
    pid: process.pid,
    hostname: process.env.HOSTNAME || os.hostname(),
    env: process.env.NODE_ENV || 'development',
  },

  // Timestamp format
  timestamp: pino.stdTimeFunctions.isoTime,

  // Format options
  formatters: {
    level: (label: string) => {
      return { level: label };
    },
    bindings: (bindings: any) => {
      return {
        pid: bindings.pid,
        hostname: bindings.hostname,
        env: bindings.env,
      };
    },
    log: (object: any) => {
      // Add request context if available
      const context = getRequestContext();
      if (context) {
        return {
          ...object,
          requestId: context.requestId,
          userId: context.userId,
          sessionId: context.sessionId,
          tenant: context.tenant,
        };
      }
      return object;
    },
  },

  // Custom error handler
  onChild: (child: Logger) => {
    // Ensure child loggers also have sanitization
    child.setBindings = new Proxy(child.setBindings, {
      apply: (target, thisArg, args) => {
        const [bindings] = args;
        // Sanitize bindings
        const sanitized: Record<string, any> = {};
        for (const [key, value] of Object.entries(bindings)) {
          if (typeof value === 'string') {
            sanitized[key] = sanitizeStringEnhanced(value);
          } else {
            sanitized[key] = value;
          }
        }
        return target.call(thisArg, sanitized);
      },
    });
  },
};

/**
 * Create the main logger instance
 */
let logger: Logger;

if (PRETTY_PRINT) {
  // Development: pretty print to console
  logger = pino(
    loggerOptions,
    pino.transport({
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'yyyy-mm-dd HH:MM:ss',
        ignore: 'pid,hostname,env',
        singleLine: false,
      },
    })
  );
} else if (process.env.DISABLE_FILE_LOGGING === 'true') {
  // Production: console only (for containerized environments)
  logger = pino(loggerOptions);
} else {
  // Production: multiple file transports
  const streams = [
    // Combined log (all levels)
    { stream: createRotatingStream('gateway.log') },
    // Error log (errors only)
    { level: 'error' as const, stream: createRotatingStream('gateway-error.log') },
  ];

  logger = pino(loggerOptions, pino.multistream(streams));
}

/**
 * Create child logger for specific component
 */
export function createComponentLogger(component: string): Logger {
  return logger.child({ component: sanitizeServerName(component) });
}

/**
 * Create child logger for specific server
 */
export function createServerLogger(serverName: string): Logger {
  return logger.child({
    component: 'mcp-server',
    serverName: sanitizeServerName(serverName),
  });
}

/**
 * Log structured error with context
 */
export function logError(
  logger: Logger,
  error: Error | unknown,
  message: string,
  context?: Record<string, unknown>
): void {
  logger.error(
    {
      err: error,
      ...context,
    },
    message
  );
}

/**
 * Log fatal error and exit process
 */
export function logFatal(
  logger: Logger,
  error: Error | unknown,
  message: string,
  exitCode = 1
): never {
  logger.fatal(
    {
      err: error,
      exitCode,
    },
    message
  );
  process.exit(exitCode);
}

/**
 * Log performance metrics
 */
export function logPerformance(
  logger: Logger,
  operation: string,
  durationMs: number,
  metadata?: Record<string, unknown>
): void {
  logger.info(
    {
      event: 'performance',
      operation,
      durationMs,
      ...metadata,
    },
    `Operation completed: ${operation}`
  );
}

/**
 * Log audit event
 */
export function logAudit(
  logger: Logger,
  action: string,
  resource: string,
  metadata?: Record<string, unknown>
): void {
  logger.info(
    {
      event: 'audit',
      action,
      resource,
      timestamp: new Date().toISOString(),
      ...metadata,
    },
    `Audit: ${action} on ${resource}`
  );
}

// Log startup info
logger.info(
  {
    event: 'logger_init',
    logLevel: LOG_LEVEL,
    logDir: LOG_DIR,
    prettyPrint: PRETTY_PRINT,
    fileLogging: process.env.DISABLE_FILE_LOGGING !== 'true',
  },
  'Logger initialized'
);

// Export logger and utilities
export { logger, LOG_DIR };
export default logger;
