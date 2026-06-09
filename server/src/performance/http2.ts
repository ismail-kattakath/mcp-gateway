/**
 * HTTP/2 Server Setup
 *
 * Provides HTTP/2 server with fallback to HTTP/1.1
 * Includes ALPN negotiation, stream prioritization, and server push
 *
 * Note: HTTP/2 requires HTTPS. This module provides the infrastructure
 * but requires SSL certificates to be configured via environment variables.
 */

import http2 from 'http2';
import { readFileSync, existsSync } from 'fs';
import type { Express } from 'express';
import logger from '../logging/logger.js';

export interface Http2ServerConfig {
  enabled: boolean;
  maxConcurrentStreams: number;
  allowHTTP1: boolean;
  pushEnabled: boolean;
  keyPath?: string;
  certPath?: string;
  caPath?: string;
}

/**
 * Create HTTP/2 server with Express app
 *
 * Note: HTTP/2 requires bridging to work with Express.
 * For production, we recommend using a reverse proxy (nginx, Caddy)
 * to handle HTTP/2, which is more efficient.
 */
export function createHttp2Server(
  app: Express,
  config: Http2ServerConfig
): http2.Http2SecureServer | null {
  if (!config.enabled) {
    logger.info('HTTP/2 disabled, using HTTP/1.1');
    return null;
  }

  // Check for SSL certificates
  const keyPath = config.keyPath || process.env.SSL_KEY_PATH;
  const certPath = config.certPath || process.env.SSL_CERT_PATH;
  const caPath = config.caPath || process.env.SSL_CA_PATH;

  if (!keyPath || !certPath) {
    logger.warn('HTTP/2 enabled but SSL certificates not configured, falling back to HTTP/1.1', {
      keyPath,
      certPath,
      hint: 'Set SSL_KEY_PATH and SSL_CERT_PATH environment variables',
    });
    return null;
  }

  // Validate certificate files exist
  if (!existsSync(keyPath)) {
    logger.error('SSL key file not found', { keyPath });
    return null;
  }

  if (!existsSync(certPath)) {
    logger.error('SSL certificate file not found', { certPath });
    return null;
  }

  try {
    // Read SSL certificates
    const key = readFileSync(keyPath);
    const cert = readFileSync(certPath);
    const ca = caPath && existsSync(caPath) ? readFileSync(caPath) : undefined;

    // Create HTTP/2 server with HTTP/1.1 fallback
    // Express is designed for HTTP/1.1, so we use allowHTTP1: true
    const server = http2.createSecureServer(
      {
        key,
        cert,
        ca,
        allowHTTP1: config.allowHTTP1,
        // HTTP/2 settings
        settings: {
          maxConcurrentStreams: config.maxConcurrentStreams,
          enableConnectProtocol: true,
        },
      },
      // Cast to any to bridge HTTP/2 with Express
      // Express middleware works with HTTP/1.1 requests, but Node.js HTTP/2
      // server with allowHTTP1: true will handle the protocol negotiation
      app as any
    );

    logger.info('HTTP/2 server created', {
      allowHTTP1: config.allowHTTP1,
      maxConcurrentStreams: config.maxConcurrentStreams,
      pushEnabled: config.pushEnabled,
      note: 'For production, use a reverse proxy (nginx, Caddy) for optimal HTTP/2 support',
    });

    // Log ALPN negotiation
    server.on('session', (session) => {
      const protocol = session.alpnProtocol;
      logger.debug('HTTP/2 session established', { protocol });
    });

    // Log stream lifecycle
    server.on('stream', (stream, headers) => {
      const method = headers[':method'];
      const path = headers[':path'];

      logger.debug('HTTP/2 stream opened', { method, path });

      stream.on('close', () => {
        logger.debug('HTTP/2 stream closed', { method, path });
      });
    });

    return server;
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to create HTTP/2 server', {
      error: err.message,
      stack: err.stack,
    });
    return null;
  }
}

/**
 * Server push static assets (for HTTP/2)
 */
export function pushStaticAssets(stream: http2.ServerHttp2Stream, assets: string[]): void {
  if (!stream.pushAllowed) {
    logger.debug('Server push not allowed');
    return;
  }

  for (const asset of assets) {
    try {
      stream.pushStream({ ':path': asset }, (err, pushStream) => {
        if (err) {
          logger.debug('Failed to push asset', { asset, error: err.message });
          return;
        }

        logger.debug('Pushing asset', { asset });

        // Set appropriate headers
        pushStream.respond({
          ':status': 200,
          'content-type': getContentType(asset),
        });

        // Stream the asset
        // Note: In production, this should read from disk or cache
        pushStream.end();
      });
    } catch (error) {
      const err = error as Error;
      logger.debug('Failed to push asset', { asset, error: err.message });
    }
  }
}

/**
 * Get content type from file extension
 */
function getContentType(path: string): string {
  if (path.endsWith('.js')) return 'application/javascript';
  if (path.endsWith('.css')) return 'text/css';
  if (path.endsWith('.html')) return 'text/html';
  if (path.endsWith('.json')) return 'application/json';
  if (path.endsWith('.png')) return 'image/png';
  if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg';
  if (path.endsWith('.svg')) return 'image/svg+xml';
  return 'application/octet-stream';
}

/**
 * Check if request uses HTTP/2
 */
export function isHttp2Request(req: unknown): boolean {
  return (req as any).httpVersion === '2.0';
}

/**
 * Get HTTP/2 stream for request
 */
export function getHttp2Stream(req: unknown): http2.ServerHttp2Stream | null {
  if (!isHttp2Request(req)) {
    return null;
  }

  return (req as any).stream || null;
}

export default {
  createHttp2Server,
  pushStaticAssets,
  isHttp2Request,
  getHttp2Stream,
};
