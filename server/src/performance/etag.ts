/**
 * ETag Support
 *
 * Generate and validate ETags for conditional requests
 * Supports If-None-Match and If-Match headers
 */

import etag from 'etag';
import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import logger from '../logging/logger.js';

/**
 * Generate ETag from content
 */
export function generateETag(content: string | Buffer | object): string {
  let data: string | Buffer;

  if (typeof content === 'string') {
    data = content;
  } else if (Buffer.isBuffer(content)) {
    data = content;
  } else {
    data = JSON.stringify(content);
  }

  return etag(data);
}

/**
 * Generate weak ETag (for frequently changing content)
 */
export function generateWeakETag(content: string | Buffer | object): string {
  const strongTag = generateETag(content);
  return `W/${strongTag}`;
}

/**
 * Generate ETag from object hash
 */
export function generateHashETag(obj: object): string {
  const json = JSON.stringify(obj);
  const hash = crypto.createHash('sha256').update(json).digest('hex').substring(0, 16);
  return `"${hash}"`;
}

/**
 * Check if ETag matches request
 */
export function matchesETag(req: Request, tag: string): boolean {
  const ifNoneMatch = req.headers['if-none-match'];

  if (!ifNoneMatch) {
    return false;
  }

  // Handle multiple ETags in If-None-Match
  const requestTags = ifNoneMatch.split(',').map((t) => t.trim());

  // Check for wildcard
  if (requestTags.includes('*')) {
    return true;
  }

  // Check for exact match (including weak ETags)
  return requestTags.some((requestTag) => {
    // Weak comparison: compare both strong and weak ETags
    const strongTag = tag.startsWith('W/') ? tag.substring(2) : tag;
    const strongRequestTag = requestTag.startsWith('W/') ? requestTag.substring(2) : requestTag;

    return strongTag === strongRequestTag;
  });
}

/**
 * Validate ETag precondition
 */
export function validateETagPrecondition(
  req: Request,
  tag: string
): {
  valid: boolean;
  status?: number;
  error?: string;
} {
  const ifMatch = req.headers['if-match'];

  if (!ifMatch) {
    return { valid: true };
  }

  // Handle wildcard
  if (ifMatch === '*') {
    return { valid: true };
  }

  // Check for match
  const requestTags = ifMatch.split(',').map((t) => t.trim());
  const matches = requestTags.includes(tag);

  if (!matches) {
    return {
      valid: false,
      status: 412,
      error: 'Precondition Failed: ETag does not match',
    };
  }

  return { valid: true };
}

/**
 * Middleware to add ETag support to responses
 */
export function createETagMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const originalJson = res.json.bind(res);

    res.json = function (body: unknown) {
      // Generate ETag from response body
      const tag = generateETag(body as object);

      // Set ETag header
      res.setHeader('ETag', tag);

      // Check If-None-Match
      if (matchesETag(req, tag)) {
        logger.debug('ETag matched, returning 304', { path: req.path, etag: tag });
        res.status(304);
        return res.end();
      }

      // Check If-Match precondition
      const precondition = validateETagPrecondition(req, tag);
      if (!precondition.valid) {
        logger.debug('ETag precondition failed', {
          path: req.path,
          etag: tag,
          error: precondition.error,
        });
        res.status(precondition.status || 412);
        return res.json({ error: precondition.error });
      }

      // Send response with ETag
      return originalJson(body);
    };

    next();
  };
}

/**
 * Manually set ETag header and handle conditional request
 */
export function handleConditionalRequest(
  req: Request,
  res: Response,
  content: string | Buffer | object
): boolean {
  const tag = generateETag(content);

  // Set ETag header
  res.setHeader('ETag', tag);

  // Check If-None-Match
  if (matchesETag(req, tag)) {
    logger.debug('ETag matched, returning 304', { path: req.path, etag: tag });
    res.status(304).send();
    return true;
  }

  // Check If-Match precondition
  const precondition = validateETagPrecondition(req, tag);
  if (!precondition.valid) {
    logger.debug('ETag precondition failed', {
      path: req.path,
      etag: tag,
      error: precondition.error,
    });
    res.status(precondition.status || 412).json({ error: precondition.error });
    return true;
  }

  return false;
}

export default {
  generateETag,
  generateWeakETag,
  generateHashETag,
  matchesETag,
  validateETagPrecondition,
  createETagMiddleware,
  handleConditionalRequest,
};
