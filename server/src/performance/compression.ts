/**
 * Response Compression Middleware
 *
 * Provides gzip and Brotli compression for HTTP responses
 * Includes conditional compression based on content type and size
 */

import compression from 'compression';
import type { Request, Response, NextFunction } from 'express';
import logger from '../logging/logger.js';
import type { PerformanceConfig } from './config.js';

/**
 * Create compression middleware with custom configuration
 */
export function createCompressionMiddleware(config: PerformanceConfig['compression']) {
  if (!config.enabled) {
    logger.info('Response compression disabled');
    return (_req: Request, _res: Response, next: NextFunction) => next();
  }

  logger.info('Response compression enabled', {
    level: config.level,
    threshold: config.threshold,
    types: config.types,
  });

  return compression({
    level: config.level,
    threshold: config.threshold,
    filter: (req: Request, res: Response) => {
      // Don't compress if client doesn't support it
      if (req.headers['x-no-compression']) {
        return false;
      }

      // Check content type
      const contentType = res.getHeader('Content-Type');
      if (!contentType) {
        return false;
      }

      const type = String(contentType).split(';')[0].trim();
      const shouldCompress = config.types.some((allowedType) => type === allowedType);

      if (shouldCompress) {
        logger.debug('Compressing response', { contentType: type, path: req.path });
      }

      return shouldCompress;
    },
  });
}

/**
 * Get compression stats from response headers
 */
export function getCompressionStats(
  req: Request,
  res: Response
): {
  compressed: boolean;
  encoding?: string;
  originalSize?: number;
  compressedSize?: number;
  ratio?: number;
} {
  const encoding = res.getHeader('Content-Encoding');
  const compressed = encoding === 'gzip' || encoding === 'br';

  if (!compressed) {
    return { compressed: false };
  }

  const originalSize = req.headers['x-original-size']
    ? parseInt(req.headers['x-original-size'] as string, 10)
    : undefined;
  const compressedSize = res.getHeader('Content-Length')
    ? parseInt(res.getHeader('Content-Length') as string, 10)
    : undefined;

  const ratio =
    originalSize && compressedSize
      ? ((1 - compressedSize / originalSize) * 100).toFixed(2)
      : undefined;

  return {
    compressed: true,
    encoding: encoding as string,
    originalSize,
    compressedSize,
    ratio: ratio ? parseFloat(ratio) : undefined,
  };
}

/**
 * Check if content type should be compressed
 */
export function shouldCompressContentType(
  contentType: string | undefined,
  allowedTypes: string[]
): boolean {
  if (!contentType) {
    return false;
  }

  const type = contentType.split(';')[0].trim();
  return allowedTypes.some((allowedType) => type === allowedType);
}

export default {
  createCompressionMiddleware,
  getCompressionStats,
  shouldCompressContentType,
};
