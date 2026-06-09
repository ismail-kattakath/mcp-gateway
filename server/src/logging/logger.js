/**
 * Winston Logger Configuration
 *
 * Provides structured logging with console and file transports
 * Automatically sanitizes user-provided values to prevent log injection
 * and information disclosure.
 */
import winston from 'winston';
import path from 'path';
import fs from 'fs';
import { sanitizeObject } from './sanitizer.js';
// Determine log directory from environment or default
const LOG_DIR = process.env.MCP_LOGS_DIR ?? path.join(process.env.HOME ?? '/tmp', '.mcp', 'logs');
// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}
// Log level from environment or default to 'info'
const LOG_LEVEL = process.env.LOG_LEVEL ?? 'info';
// Sanitization format - applies to all logs before other formatting
const sanitizationFormat = winston.format((info) => {
  // Sanitize the message
  if (typeof info.message === 'string') {
    // Basic CRLF injection prevention
    info.message = info.message.replace(/[\r\n]/g, ' ');
  }
  // Sanitize metadata (everything except standard winston fields)
  const standardFields = ['level', 'message', 'timestamp', 'stack'];
  for (const key of Object.keys(info)) {
    if (!standardFields.includes(key)) {
      info[key] = sanitizeObject(info[key]);
    }
  }
  return info;
})();
// Custom format for console output (human-readable)
const consoleFormat = winston.format.combine(
  sanitizationFormat,
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let metaStr = '';
    if (Object.keys(meta).length > 0) {
      metaStr = '\n' + JSON.stringify(meta, null, 2);
    }
    return `${timestamp} [${level}] ${message}${metaStr}`;
  })
);
// JSON format for file output (structured)
const fileFormat = winston.format.combine(
  sanitizationFormat,
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);
// Create transports
const transports = [];
// Always add console transport
transports.push(
  new winston.transports.Console({
    format: consoleFormat,
    level: LOG_LEVEL,
  })
);
// Add file transports if not disabled
if (process.env.DISABLE_FILE_LOGGING !== 'true') {
  // Combined log (all levels)
  transports.push(
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'gateway.log'),
      format: fileFormat,
      level: LOG_LEVEL,
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
      tailable: true,
    })
  );
  // Error log (errors only)
  transports.push(
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'gateway-error.log'),
      format: fileFormat,
      level: 'error',
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
      tailable: true,
    })
  );
}
// Create logger instance
const logger = winston.createLogger({
  level: LOG_LEVEL,
  transports,
  exitOnError: false,
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'exceptions.log'),
      format: fileFormat,
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 3,
    }),
  ],
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'rejections.log'),
      format: fileFormat,
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 3,
    }),
  ],
});
// Add helper property
logger.logDir = LOG_DIR;
// Log startup info
logger.info('Logger initialized', {
  logLevel: LOG_LEVEL,
  logDir: LOG_DIR,
  environment: process.env.NODE_ENV ?? 'development',
  fileLogging: process.env.DISABLE_FILE_LOGGING !== 'true',
});
// Re-export sanitization utilities for direct use
export {
  sanitizeString,
  sanitizeServerName,
  sanitizeUrl,
  sanitizeArgs,
  sanitizeEnv,
  sanitizeError,
  sanitizeIp,
  sanitizePath,
  sanitizeObject,
} from './sanitizer.js';
export default logger;
//# sourceMappingURL=logger.js.map
