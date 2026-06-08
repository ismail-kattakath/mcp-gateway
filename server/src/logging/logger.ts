/**
 * Winston Logger Configuration
 *
 * Provides structured logging with console and file transports
 */

import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Determine log directory from environment or default
const LOG_DIR: string =
  process.env.MCP_LOGS_DIR ?? path.join(process.env.HOME ?? '/tmp', '.mcp', 'logs');

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// Log level from environment or default to 'info'
const LOG_LEVEL: string = process.env.LOG_LEVEL ?? 'info';

// Format configuration
const isProduction: boolean = process.env.NODE_ENV === 'production';

// Custom format for console output (human-readable)
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, ...meta }): string => {
    let metaStr = '';
    if (Object.keys(meta).length > 0) {
      metaStr = '\n' + JSON.stringify(meta, null, 2);
    }
    return `${timestamp} [${level}] ${message}${metaStr}`;
  })
);

// JSON format for file output (structured)
const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Create transports
const transports: winston.transport[] = [];

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

// Create logger instance with custom interface to include logDir
interface CustomLogger extends winston.Logger {
  logDir: string;
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
}) as CustomLogger;

// Add helper property
logger.logDir = LOG_DIR;

// Log startup info
logger.info('Logger initialized', {
  logLevel: LOG_LEVEL,
  logDir: LOG_DIR,
  environment: process.env.NODE_ENV ?? 'development',
  fileLogging: process.env.DISABLE_FILE_LOGGING !== 'true',
});

export default logger;
