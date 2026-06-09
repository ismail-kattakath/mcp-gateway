/**
 * Network Orchestration Module
 *
 * Central coordinator for HTTP/HTTPS servers, TLS, and mDNS.
 * Manages server lifecycle and mode switching.
 *
 * Modes:
 * - HTTP only (dev/testing)
 * - HTTPS with Let's Encrypt
 * - HTTPS with custom certificates
 * - HTTP + HTTPS (with redirect)
 */

import http from 'http';
import https from 'https';
import fs from 'fs/promises';
import type { Express } from 'express';
import logger from '../logging/logger.js';
import { sanitizePath } from '../logging/sanitizer.js';
import { getTLSOptions, securityHeadersMiddleware, validateTLSConfig } from './tls.js';
import { startMDNS, stopMDNS, type MDNSConfig } from './mdns.js';
import { initGreenlock, setupACMEChallengeHandler, type LetsEncryptConfig } from './letsencrypt.js';
import { httpsRedirect, hstsMiddleware } from './middleware/https-redirect.js';
import { loadCertificate, verifyCertificateKeyPair } from './certificates.js';
import type { TLSConfig } from './tls.js';

export interface NetworkConfig {
  http: {
    enabled: boolean;
    port: number;
    host: string;
  };
  https?: {
    enabled: boolean;
    port: number;
    host: string;
  };
  tls?: TLSConfig;
  mdns?: MDNSConfig;
}

export interface NetworkServers {
  http: http.Server | null;
  https: https.Server | null;
  greenlock: any | null;
}

const servers: NetworkServers = {
  http: null,
  https: null,
  greenlock: null,
};

/**
 * Start network servers
 *
 * Initializes HTTP and/or HTTPS servers based on configuration.
 * Handles TLS certificate loading and mDNS advertising.
 *
 * @param app Express application
 * @param config Network configuration
 * @returns Started servers
 */
export async function startNetworkServers(
  app: Express,
  config: NetworkConfig
): Promise<NetworkServers> {
  try {
    logger.info('Starting network servers', {
      http: config.http.enabled,
      https: config.https?.enabled || false,
      tls: config.tls?.mode || 'disabled',
    });

    // Validate TLS configuration if enabled
    if (config.tls?.enabled) {
      const validation = validateTLSConfig(config.tls);
      if (!validation.valid) {
        throw new Error(`Invalid TLS configuration: ${validation.errors.join(', ')}`);
      }
    }

    // Start mDNS if enabled
    if (config.mdns?.enabled) {
      const mdnsPort = config.https?.enabled ? config.https.port : config.http.port;
      startMDNS({
        ...config.mdns,
        port: mdnsPort,
      });
    }

    // Determine server mode
    const httpsEnabled = config.https?.enabled && config.tls?.enabled;

    if (httpsEnabled) {
      // Start HTTPS server
      await startHTTPSServer(app, config);

      // Optionally start HTTP server for redirect
      if (config.http.enabled && config.tls?.redirect) {
        await startHTTPRedirectServer(app, config);
      }
    } else {
      // Start HTTP-only server
      await startHTTPServer(app, config);
    }

    logger.info('Network servers started successfully');
    return servers;
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to start network servers', {
      error: err.message,
      stack: err.stack,
    });
    throw error;
  }
}

/**
 * Start HTTP server
 *
 * Creates and starts a basic HTTP server.
 *
 * @param app Express application
 * @param config Network configuration
 */
async function startHTTPServer(app: Express, config: NetworkConfig): Promise<void> {
  const { port, host } = config.http;

  return new Promise((resolve, reject) => {
    servers.http = http.createServer(app);

    servers.http.listen(port, host, () => {
      logger.info('HTTP server listening', {
        url: `http://${host}:${port}`,
        port,
        host,
      });
      resolve();
    });

    servers.http.on('error', (error: Error) => {
      logger.error('HTTP server error', { error: error.message });
      reject(error);
    });
  });
}

/**
 * Start HTTPS server
 *
 * Creates HTTPS server with TLS configuration.
 * Supports Let's Encrypt and custom certificates.
 *
 * @param app Express application
 * @param config Network configuration
 */
async function startHTTPSServer(app: Express, config: NetworkConfig): Promise<void> {
  if (!config.https || !config.tls) {
    throw new Error('HTTPS configuration is required');
  }

  const { port, host } = config.https;
  const { mode } = config.tls;

  // Add security headers middleware
  app.use(securityHeadersMiddleware());

  // Add HSTS middleware
  app.use(hstsMiddleware());

  if (mode === 'letsencrypt') {
    // Let's Encrypt mode
    await startLetsEncryptServer(app, config);
  } else if (mode === 'custom') {
    // Custom certificate mode
    await startCustomCertServer(app, config);
  } else {
    throw new Error(`Unsupported TLS mode: ${mode}`);
  }

  logger.info('HTTPS server listening', {
    url: `https://${host}:${port}`,
    port,
    host,
    mode,
  });
}

/**
 * Start HTTPS server with Let's Encrypt
 *
 * Uses greenlock-express for automatic certificate management.
 *
 * @param app Express application
 * @param config Network configuration
 */
async function startLetsEncryptServer(app: Express, config: NetworkConfig): Promise<void> {
  if (!config.tls?.letsencrypt || !config.tls.domains) {
    throw new Error("Let's Encrypt configuration is incomplete");
  }

  const letsencryptConfig: LetsEncryptConfig = {
    enabled: true,
    staging: config.tls.letsencrypt.staging,
    email: config.tls.letsencrypt.email,
    domains: config.tls.domains,
    renewWithin: config.tls.letsencrypt.renewWithin || 30,
    agreeTos: true,
  };

  // Setup ACME challenge handler
  setupACMEChallengeHandler(app);

  // Initialize Greenlock
  servers.greenlock = await initGreenlock(app, letsencryptConfig);

  if (!servers.greenlock) {
    throw new Error("Failed to initialize Let's Encrypt");
  }

  // Create HTTPS server using Greenlock
  return new Promise((resolve, reject) => {
    servers.https = servers.greenlock.httpsServer(null, app);

    servers.https!.listen(config.https!.port, config.https!.host, () => {
      logger.info("HTTPS server started with Let's Encrypt");
      resolve();
    });

    servers.https!.on('error', (error: Error) => {
      logger.error('HTTPS server error', { error: error.message });
      reject(error);
    });
  });
}

/**
 * Start HTTPS server with custom certificates
 *
 * Loads user-provided certificate and key files.
 *
 * @param app Express application
 * @param config Network configuration
 */
async function startCustomCertServer(app: Express, config: NetworkConfig): Promise<void> {
  if (!config.tls?.custom) {
    throw new Error('Custom certificate configuration is required');
  }

  const { cert: certPath, key: keyPath, ca: caPath } = config.tls.custom;

  logger.info('Loading custom certificates', {
    cert: sanitizePath(certPath),
    key: sanitizePath(keyPath),
    ca: caPath ? sanitizePath(caPath) : undefined,
  });

  // Load certificate files
  const [cert, key, ca] = await Promise.all([
    fs.readFile(certPath, 'utf8'),
    fs.readFile(keyPath, 'utf8'),
    caPath ? fs.readFile(caPath, 'utf8') : Promise.resolve(undefined),
  ]);

  // Verify certificate matches key
  const isValid = await verifyCertificateKeyPair(certPath, keyPath);
  if (!isValid) {
    throw new Error('Certificate and private key do not match');
  }

  // Parse and log certificate info
  const certInfo = await loadCertificate(certPath);
  logger.info('Custom certificate loaded', {
    subject: certInfo.subject.commonName,
    issuer: certInfo.issuer.commonName,
    validFrom: certInfo.validFrom,
    validTo: certInfo.validTo,
    daysUntilExpiry: certInfo.daysUntilExpiry,
  });

  // Warn if certificate is expiring soon
  if (certInfo.daysUntilExpiry <= 30) {
    logger.warn('Certificate expiring soon', {
      daysUntilExpiry: certInfo.daysUntilExpiry,
      validTo: certInfo.validTo,
    });
  }

  // Create TLS options
  const tlsOptions = getTLSOptions(config.tls);
  const httpsOptions = {
    ...tlsOptions,
    cert,
    key,
    ca,
  };

  // Create HTTPS server
  return new Promise((resolve, reject) => {
    servers.https = https.createServer(httpsOptions, app);

    servers.https.listen(config.https!.port, config.https!.host, () => {
      logger.info('HTTPS server started with custom certificates');
      resolve();
    });

    servers.https.on('error', (error: Error) => {
      logger.error('HTTPS server error', { error: error.message });
      reject(error);
    });
  });
}

/**
 * Start HTTP redirect server
 *
 * Minimal HTTP server that redirects all requests to HTTPS.
 *
 * @param app Express application
 * @param config Network configuration
 */
async function startHTTPRedirectServer(app: Express, config: NetworkConfig): Promise<void> {
  const { port, host } = config.http;
  const httpsPort = config.https!.port;

  // Create simple redirect middleware
  const redirectMiddleware = httpsRedirect({
    enabled: true,
    httpsPort,
    statusCode: 301,
    trustProxy: true,
  });

  // Create minimal Express app for redirect
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const redirectApp = require('express')();
  redirectApp.use(redirectMiddleware);

  return new Promise((resolve, reject) => {
    servers.http = http.createServer(redirectApp);

    servers.http.listen(port, host, () => {
      logger.info('HTTP redirect server listening', {
        url: `http://${host}:${port}`,
        redirectTo: `https://${host}:${httpsPort}`,
      });
      resolve();
    });

    servers.http.on('error', (error: Error) => {
      logger.error('HTTP redirect server error', { error: error.message });
      reject(error);
    });
  });
}

/**
 * Stop network servers
 *
 * Gracefully shuts down all running servers.
 */
export async function stopNetworkServers(): Promise<void> {
  logger.info('Stopping network servers');

  const promises: Promise<void>[] = [];

  // Stop HTTP server
  if (servers.http) {
    promises.push(
      new Promise((resolve) => {
        servers.http!.close(() => {
          logger.info('HTTP server stopped');
          servers.http = null;
          resolve();
        });
      })
    );
  }

  // Stop HTTPS server
  if (servers.https) {
    promises.push(
      new Promise((resolve) => {
        servers.https!.close(() => {
          logger.info('HTTPS server stopped');
          servers.https = null;
          resolve();
        });
      })
    );
  }

  // Stop mDNS
  stopMDNS();

  await Promise.all(promises);
  logger.info('Network servers stopped');
}

/**
 * Get server status
 *
 * Returns current status of all network servers.
 *
 * @returns Server status
 */
export function getServerStatus(): {
  http: { running: boolean; port?: number };
  https: { running: boolean; port?: number; mode?: string };
  mdns: { running: boolean };
} {
  return {
    http: {
      running: servers.http !== null,
      port: servers.http?.address() ? (servers.http.address() as any).port : undefined,
    },
    https: {
      running: servers.https !== null,
      port: servers.https?.address() ? (servers.https.address() as any).port : undefined,
      mode: servers.greenlock ? 'letsencrypt' : 'custom',
    },
    mdns: {
      running: false, // TODO: Get from mdns module
    },
  };
}

export default {
  startNetworkServers,
  stopNetworkServers,
  getServerStatus,
};
