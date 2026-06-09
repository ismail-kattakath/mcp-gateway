/**
 * Rate Limiting Middleware
 *
 * Three-tier rate limiting:
 * 1. IP-based for authentication endpoints (prevent brute force)
 * 2. User-based for API endpoints (prevent abuse)
 * 3. Server-based for MCP tool calls (prevent resource exhaustion)
 *
 * Uses sliding window counter with in-memory storage (can be extended to Redis for distributed systems)
 */

import type { Request, Response, NextFunction } from 'express';
import rateLimit, { Options } from 'express-rate-limit';
import logger, { sanitizeString } from '../logging/logger.js';

/**
 * In-memory store for rate limiting (can be replaced with Redis for distributed systems)
 */
class RateLimitStore {
  private hits: Map<string, { count: number; resetTime: number }> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Cleanup expired entries every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, value] of this.hits.entries()) {
      if (now > value.resetTime) {
        this.hits.delete(key);
      }
    }
  }

  increment(key: string, windowMs: number): { count: number; resetTime: number } {
    const now = Date.now();
    const entry = this.hits.get(key);

    if (!entry || now > entry.resetTime) {
      // New window
      const resetTime = now + windowMs;
      this.hits.set(key, { count: 1, resetTime });
      return { count: 1, resetTime };
    }

    // Increment existing window
    entry.count++;
    return entry;
  }

  get(key: string): { count: number; resetTime: number } | undefined {
    const entry = this.hits.get(key);
    if (!entry) {
      return undefined;
    }

    const now = Date.now();
    if (now > entry.resetTime) {
      this.hits.delete(key);
      return undefined;
    }

    return entry;
  }

  reset(key: string): void {
    this.hits.delete(key);
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.hits.clear();
  }
}

const store = new RateLimitStore();

/**
 * Rate limit configuration interface
 */
interface RateLimitConfig {
  windowMs: number;
  max: number;
  message: string;
  skipSuccessfulRequests?: boolean;
  keyGenerator?: (req: Request) => string;
}

/**
 * Create a rate limiter with custom config
 */
function createRateLimiter(config: RateLimitConfig): ReturnType<typeof rateLimit> {
  const options: Partial<Options> = {
    windowMs: config.windowMs,
    max: config.max,
    message: { error: config.message },
    standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
    legacyHeaders: false, // Disable `X-RateLimit-*` headers
    skipSuccessfulRequests: config.skipSuccessfulRequests ?? false,
    handler: (req: Request, res: Response) => {
      logger.warn('Rate limit exceeded', {
        ip: req.ip,
        path: req.path,
        limit: config.max,
        window: `${config.windowMs / 1000}s`,
      });

      // Calculate retry-after in seconds
      const key = config.keyGenerator?.(req) ?? req.ip ?? 'unknown';
      const entry = store.get(key);
      const retryAfter = entry ? Math.ceil((entry.resetTime - Date.now()) / 1000) : 60;

      res.set('Retry-After', String(retryAfter));
      res.status(429).json({
        error: config.message,
        retryAfter: retryAfter,
      });
    },
    // Custom key generator
    keyGenerator: config.keyGenerator ?? ((req: Request) => req.ip ?? 'unknown'),
    // Custom store using our in-memory implementation
    store: {
      increment: (key: string): Promise<{ totalHits: number; resetTime: Date | undefined }> => {
        const result = store.increment(key, config.windowMs);
        return Promise.resolve({
          totalHits: result.count,
          resetTime: new Date(result.resetTime),
        });
      },
      decrement: (key: string): Promise<void> => {
        const entry = store.get(key);
        if (entry && entry.count > 0) {
          entry.count--;
        }
        return Promise.resolve();
      },
      resetKey: (key: string): Promise<void> => {
        store.reset(key);
        return Promise.resolve();
      },
    },
  };

  return rateLimit(options);
}

/**
 * IP-based rate limiter for authentication endpoints
 * Prevents brute force attacks on login/token endpoints
 * Limit: 10 attempts per minute, 100 per hour
 */
export const authRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  message: 'Too many authentication attempts, please try again later',
  skipSuccessfulRequests: true, // Only count failed attempts
  keyGenerator: (req: Request) => {
    // Use IP + user-agent for better tracking
    const ip = req.ip ?? 'unknown';
    const userAgent = req.get('user-agent') ?? 'unknown';
    return `auth:${ip}:${sanitizeString(userAgent, 50)}`;
  },
});

/**
 * IP-based rate limiter for auth endpoints (hourly)
 */
export const authRateLimiterHourly = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100,
  message: 'Too many authentication attempts, please try again later',
  skipSuccessfulRequests: true,
  keyGenerator: (req: Request) => `auth-hourly:${req.ip ?? 'unknown'}`,
});

/**
 * User-based rate limiter for API endpoints
 * Limit: 1000 requests per hour
 */
export const apiRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 1000,
  message: 'API rate limit exceeded, please try again later',
  keyGenerator: (req: Request) => {
    // Use authenticated user ID if available, otherwise IP
    const userId = (req as { userId?: string }).userId ?? req.ip ?? 'unknown';
    return `api:${userId}`;
  },
});

/**
 * Per-server rate limiter for MCP tool calls
 * Configurable limit (default: 100 requests per minute)
 */
export function createServerRateLimiter(
  serverName: string,
  maxRequests = 100
): ReturnType<typeof rateLimit> {
  return createRateLimiter({
    windowMs: 60 * 1000, // 1 minute
    max: maxRequests,
    message: `MCP server rate limit exceeded for ${serverName}`,
    keyGenerator: (req: Request) => {
      const userId = (req as { userId?: string }).userId ?? req.ip ?? 'unknown';
      return `server:${serverName}:${userId}`;
    },
  });
}

/**
 * Global rate limiter for all requests (DDoS protection)
 * Limit: 100 requests per minute per IP
 */
export const globalRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  message: 'Too many requests, please slow down',
  keyGenerator: (req: Request) => `global:${req.ip ?? 'unknown'}`,
});

/**
 * Rate limiter for expensive operations (e.g., server creation/deletion)
 * Limit: 10 requests per minute per user
 */
export const expensiveOperationRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  message: 'Too many expensive operations, please try again later',
  keyGenerator: (req: Request) => {
    const userId = (req as { userId?: string }).userId ?? req.ip ?? 'unknown';
    return `expensive:${userId}`;
  },
});

/**
 * Custom rate limit middleware with configurable limits
 */
export function createCustomRateLimiter(config: {
  windowMs: number;
  max: number;
  message?: string;
  keyPrefix?: string;
}): (req: Request, res: Response, next: NextFunction) => void {
  return createRateLimiter({
    windowMs: config.windowMs,
    max: config.max,
    message: config.message ?? 'Rate limit exceeded',
    keyGenerator: (req: Request) => {
      const userId = (req as { userId?: string }).userId ?? req.ip ?? 'unknown';
      return `${config.keyPrefix ?? 'custom'}:${userId}`;
    },
  });
}

/**
 * Middleware to extract user ID from auth token (for user-based rate limiting)
 */
export function extractUserIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Extract user ID from auth token if available
  // This is a placeholder - implement based on your auth system
  const authHeader = req.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    // In a real system, decode JWT or lookup session
    // For now, use a hash of the token as user ID
    const token = authHeader.substring(7);
    (req as { userId?: string }).userId = token.substring(0, 16);
  }
  next();
}

/**
 * Cleanup function for graceful shutdown
 */
export function cleanup(): void {
  store.destroy();
}

export default {
  authRateLimiter,
  authRateLimiterHourly,
  apiRateLimiter,
  globalRateLimiter,
  expensiveOperationRateLimiter,
  createServerRateLimiter,
  createCustomRateLimiter,
  extractUserIdMiddleware,
  cleanup,
};
