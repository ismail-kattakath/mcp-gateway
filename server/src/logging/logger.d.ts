/**
 * Winston Logger Configuration
 *
 * Provides structured logging with console and file transports
 * Automatically sanitizes user-provided values to prevent log injection
 * and information disclosure.
 */
import winston from 'winston';
interface CustomLogger extends winston.Logger {
    logDir: string;
}
declare const logger: CustomLogger;
export { sanitizeString, sanitizeServerName, sanitizeUrl, sanitizeArgs, sanitizeEnv, sanitizeError, sanitizeIp, sanitizePath, sanitizeObject, } from './sanitizer.js';
export default logger;
//# sourceMappingURL=logger.d.ts.map