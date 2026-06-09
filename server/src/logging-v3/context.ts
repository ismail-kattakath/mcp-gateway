/**
 * Request Context Propagation with AsyncLocalStorage
 *
 * Provides automatic request ID generation and propagation through
 * all async operations without manual prop drilling.
 *
 * Features:
 * - UUID v4 request IDs
 * - AsyncLocalStorage for context tracking
 * - Child logger creation with context
 * - Express middleware integration
 */

import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import type { Logger } from 'pino';

/**
 * Request context stored in AsyncLocalStorage
 */
export interface RequestContext {
  requestId: string;
  userId?: string;
  sessionId?: string;
  tenant?: string;
  startTime: number;
  method?: string;
  url?: string;
}

/**
 * AsyncLocalStorage instance for request context
 */
const asyncLocalStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Generate a new request ID (UUID v4)
 */
export function generateRequestId(): string {
  return randomUUID();
}

/**
 * Get the current request context from AsyncLocalStorage
 */
export function getRequestContext(): RequestContext | undefined {
  return asyncLocalStorage.getStore();
}

/**
 * Get the current request ID
 */
export function getRequestId(): string | undefined {
  return getRequestContext()?.requestId;
}

/**
 * Create a child logger with request context
 */
export function createChildLogger(logger: Logger): Logger {
  const context = getRequestContext();
  if (!context) {
    return logger;
  }

  return logger.child({
    requestId: context.requestId,
    userId: context.userId,
    sessionId: context.sessionId,
    tenant: context.tenant,
  });
}

/**
 * Express middleware for request ID injection and context propagation
 *
 * @param logger - Pino logger instance
 * @param options - Configuration options
 */
export function requestContextMiddleware(
  logger: Logger,
  options: {
    /** Custom request ID header name (default: 'x-request-id') */
    requestIdHeader?: string;
    /** Function to extract user ID from request */
    getUserId?: (req: Request) => string | undefined;
    /** Function to extract session ID from request */
    getSessionId?: (req: Request) => string | undefined;
    /** Function to extract tenant ID from request */
    getTenant?: (req: Request) => string | undefined;
  } = {}
) {
  const { requestIdHeader = 'x-request-id', getUserId, getSessionId, getTenant } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    // Get or generate request ID
    const requestId = (req.headers[requestIdHeader.toLowerCase()] as string) || generateRequestId();

    // Create context
    const context: RequestContext = {
      requestId,
      startTime: Date.now(),
      method: req.method,
      url: req.originalUrl || req.url,
    };

    // Add optional fields
    if (getUserId) {
      context.userId = getUserId(req);
    }
    if (getSessionId) {
      context.sessionId = getSessionId(req);
    }
    if (getTenant) {
      context.tenant = getTenant(req);
    }

    // Set response header
    res.setHeader(requestIdHeader, requestId);

    // Store context in AsyncLocalStorage
    asyncLocalStorage.run(context, () => {
      // Attach child logger to request for convenience
      (req as any).log = createChildLogger(logger);

      // Log request start
      (req as any).log.info(
        {
          event: 'request_start',
          method: req.method,
          url: req.originalUrl || req.url,
          userAgent: req.headers['user-agent'],
          ip: req.ip,
        },
        'Incoming request'
      );

      // Log response on finish
      res.on('finish', () => {
        const duration = Date.now() - context.startTime;
        (req as any).log.info(
          {
            event: 'request_end',
            statusCode: res.statusCode,
            duration,
          },
          'Request completed'
        );
      });

      next();
    });
  };
}

/**
 * Run a function with a custom request context
 * Useful for background jobs or CLI operations
 */
export function runWithContext<T>(context: Partial<RequestContext>, fn: () => T): T {
  const fullContext: RequestContext = {
    requestId: context.requestId || generateRequestId(),
    startTime: context.startTime || Date.now(),
    ...context,
  };

  return asyncLocalStorage.run(fullContext, fn);
}

/**
 * Wrap an async function with context propagation
 */
export function withContext<TArgs extends any[], TReturn>(
  fn: (...args: TArgs) => Promise<TReturn>
): (...args: TArgs) => Promise<TReturn> {
  return async (...args: TArgs): Promise<TReturn> => {
    const context = getRequestContext();
    if (!context) {
      return fn(...args);
    }
    return asyncLocalStorage.run(context, () => fn(...args));
  };
}

/**
 * Augment Express Request type with logger
 */
declare global {
  namespace Express {
    interface Request {
      log: Logger;
    }
  }
}

export { asyncLocalStorage };
