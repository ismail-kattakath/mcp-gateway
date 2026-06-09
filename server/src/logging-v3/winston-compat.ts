/**
 * Winston Compatibility Layer
 *
 * Simple pass-through that exports Pino logger as-is.
 * For true Winston compatibility, manually update log statements to Pino format:
 * - Change from: logger.info({ meta }, 'message')
 * - Change to:   logger.info({ meta }, 'message')
 *
 * @example
 * ```typescript
 * import logger from './logging-v3/winston-compat.js';
 *
 * // Pino style (preferred):
 * logger.info({ port: 3000 }, 'Server started');
 *
 * // String-only also works:
 * logger.info('Server started');
 * ```
 */

import type { Logger as PinoLogger } from 'pino';
import logger, { LOG_DIR } from './logger.js';

/**
 * Re-export Pino logger directly
 * This provides full type safety and Pino's performance benefits
 */
export default logger;
export { logger, LOG_DIR };

// Type alias for compatibility
export type WinstonCompatLogger = PinoLogger;
