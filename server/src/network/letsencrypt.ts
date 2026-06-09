/**
 * Let's Encrypt Integration Module
 *
 * Automatic SSL/TLS certificate acquisition and renewal using ACME protocol.
 * Uses greenlock-express for HTTP-01 challenge handling.
 *
 * Features:
 * - Automatic certificate acquisition
 * - Auto-renewal (30 days before expiry)
 * - Staging mode for testing
 * - Certificate storage in ~/.mcp-gateway/certs/
 */

import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import type { Express } from 'express';
import logger from '../logging/logger.js';
import { sanitizePath, sanitizeString } from '../logging/sanitizer.js';

export interface LetsEncryptConfig {
  enabled: boolean;
  staging: boolean;
  email: string;
  domains: string[];
  renewWithin: number; // Days before expiry to renew
  agreeTos?: boolean;
}

export interface CertificateStatus {
  domains: string[];
  issuedAt?: Date;
  expiresAt?: Date;
  daysUntilExpiry?: number;
  renewalPending: boolean;
  lastRenewalAttempt?: Date;
  lastError?: string;
}

// Greenlock is dynamically imported to avoid breaking if not installed
let greenlockExpress: any = null;

/**
 * Initialize Let's Encrypt with greenlock-express
 *
 * Sets up ACME client and challenge handling.
 *
 * @param app Express application
 * @param config Let's Encrypt configuration
 * @returns Greenlock instance (for HTTPS server creation)
 */
export async function initGreenlock(app: Express, config: LetsEncryptConfig) {
  if (!config.enabled) {
    logger.info("Let's Encrypt is disabled");
    return null;
  }

  try {
    // Dynamic import of greenlock-express
    if (!greenlockExpress) {
      // @ts-expect-error - dynamic import of greenlock-express
      const greenlockModule = await import('greenlock-express');
      greenlockExpress = greenlockModule.default || greenlockModule;
    }

    // Validate configuration
    if (!config.email) {
      throw new Error("Let's Encrypt requires an email address");
    }

    if (!config.domains || config.domains.length === 0) {
      throw new Error("Let's Encrypt requires at least one domain");
    }

    // Storage directory for certificates
    const configDir = path.join(os.homedir(), '.mcp-gateway', 'greenlock.d');
    await fs.mkdir(configDir, { recursive: true });

    logger.info("Initializing Let's Encrypt", {
      email: sanitizeString(config.email),
      domains: config.domains.map(sanitizeString),
      staging: config.staging,
      configDir: sanitizePath(configDir),
    });

    // Initialize Greenlock
    const greenlock = greenlockExpress.init({
      packageRoot: process.cwd(),
      configDir,
      maintainerEmail: config.email,

      // Use staging for testing to avoid rate limits
      staging: config.staging,

      // Notify on renewal
      notify: (event: string, details: any) => {
        if (event === 'cert_issue') {
          logger.info("Let's Encrypt certificate issued", {
            domains: details.subject,
            altnames: details.altnames,
          });
        } else if (event === 'cert_renewal') {
          logger.info("Let's Encrypt certificate renewed", {
            domains: details.subject,
            altnames: details.altnames,
          });
        } else if (event === 'error') {
          logger.error("Let's Encrypt error", {
            error: details.message,
            context: details.context,
          });
        }
      },

      // Certificate manager
      manager: {
        module: 'greenlock-manager-fs',
      },

      // ACME challenge handling
      challenges: {
        'http-01': {
          module: 'acme-http-01-standalone',
        },
      },

      // Renewal settings
      renewOffset: `-${config.renewWithin || 30}d`,
      renewStagger: '3d',

      // Agree to terms of service
      agreeToTerms: config.agreeTos !== false,

      // Subscribers for notifications
      subscribers: [
        {
          module: 'greenlock-subscriber',
          onChange: (event: string, details: any) => {
            logger.info("Let's Encrypt certificate change", {
              event,
              details,
            });
          },
        },
      ],
    });

    // Add domains to Greenlock
    await greenlock.manager.defaults({
      subscriberEmail: config.email,
      agreeToTerms: config.agreeTos !== false,
    });

    for (const domain of config.domains) {
      logger.info("Adding domain to Let's Encrypt", {
        domain: sanitizeString(domain),
      });

      await greenlock.sites.add({
        subject: domain,
        altnames: [domain],
      });
    }

    logger.info("Let's Encrypt initialized successfully");

    return greenlock;
  } catch (error) {
    const err = error as Error;
    logger.error("Failed to initialize Let's Encrypt", {
      error: err.message,
      stack: err.stack,
    });
    throw new Error(`Let's Encrypt initialization failed: ${err.message}`);
  }
}

/**
 * Get certificate for domain
 *
 * Retrieves the current certificate or triggers acquisition.
 *
 * @param greenlock Greenlock instance
 * @param domain Domain name
 * @returns Certificate info
 */
export async function getCertificate(greenlock: any, domain: string): Promise<any> {
  if (!greenlock) {
    throw new Error('Greenlock not initialized');
  }

  try {
    logger.debug('Fetching certificate', { domain: sanitizeString(domain) });

    const site = await greenlock.sites.get({ subject: domain });

    if (!site) {
      throw new Error(`No site configured for domain: ${domain}`);
    }

    // Get certificate
    const cert = await greenlock.get({ servername: domain });

    if (!cert) {
      logger.warn('No certificate found, triggering acquisition', {
        domain: sanitizeString(domain),
      });

      // Trigger certificate acquisition
      return await greenlock.renew({ servername: domain });
    }

    return cert;
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to get certificate', {
      domain: sanitizeString(domain),
      error: err.message,
    });
    throw error;
  }
}

/**
 * Manually trigger certificate renewal
 *
 * Forces renewal even if not yet due.
 *
 * @param greenlock Greenlock instance
 * @param domain Domain to renew
 * @returns Renewed certificate info
 */
export async function renewCertificate(greenlock: any, domain: string): Promise<any> {
  if (!greenlock) {
    throw new Error('Greenlock not initialized');
  }

  try {
    logger.info('Manually triggering certificate renewal', {
      domain: sanitizeString(domain),
    });

    const result = await greenlock.renew({
      servername: domain,
      force: true, // Force renewal even if not due
    });

    logger.info('Certificate renewal completed', {
      domain: sanitizeString(domain),
    });

    return result;
  } catch (error) {
    const err = error as Error;
    logger.error('Certificate renewal failed', {
      domain: sanitizeString(domain),
      error: err.message,
    });
    throw error;
  }
}

/**
 * Get certificate status
 *
 * Returns information about current certificates.
 *
 * @param greenlock Greenlock instance
 * @param domains Domains to check
 * @returns Certificate status for each domain
 */
export async function getCertificateStatus(
  greenlock: any,
  domains: string[]
): Promise<Record<string, CertificateStatus>> {
  const status: Record<string, CertificateStatus> = {};

  if (!greenlock) {
    return status;
  }

  for (const domain of domains) {
    try {
      const cert = await greenlock.get({ servername: domain });

      if (cert && cert.cert) {
        const expiresAt = new Date(cert.expiresAt);
        const now = new Date();
        const daysUntilExpiry = Math.floor(
          (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        );

        status[domain] = {
          domains: cert.altnames || [domain],
          issuedAt: cert.issuedAt ? new Date(cert.issuedAt) : undefined,
          expiresAt,
          daysUntilExpiry,
          renewalPending: daysUntilExpiry <= 30,
        };
      } else {
        status[domain] = {
          domains: [domain],
          renewalPending: true,
          lastError: 'No certificate found',
        };
      }
    } catch (error) {
      const err = error as Error;
      status[domain] = {
        domains: [domain],
        renewalPending: true,
        lastError: err.message,
      };
    }
  }

  return status;
}

/**
 * Validate Let's Encrypt configuration
 *
 * Checks for common configuration errors.
 *
 * @param config Let's Encrypt configuration
 * @returns Validation result
 */
export function validateConfig(config: LetsEncryptConfig): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!config.email) {
    errors.push('Email address is required');
  } else if (!isValidEmail(config.email)) {
    errors.push('Invalid email address format');
  }

  if (!config.domains || config.domains.length === 0) {
    errors.push('At least one domain is required');
  } else {
    for (const domain of config.domains) {
      if (!isValidDomain(domain)) {
        errors.push(`Invalid domain format: ${domain}`);
      }

      // Warn about localhost/local domains
      if (
        domain.includes('localhost') ||
        domain.endsWith('.local') ||
        domain.includes('127.0.0.1')
      ) {
        warnings.push(
          `Let's Encrypt does not support local domains: ${domain} (use custom certificates instead)`
        );
      }
    }
  }

  if (config.staging) {
    warnings.push(
      "Staging mode enabled - certificates won't be trusted by browsers (use for testing only)"
    );
  }

  if (!config.agreeTos) {
    errors.push("You must agree to Let's Encrypt Terms of Service");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Simple email validation
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Simple domain validation
 */
function isValidDomain(domain: string): boolean {
  const domainRegex =
    /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i;
  return domainRegex.test(domain);
}

/**
 * Setup ACME HTTP-01 challenge handler
 *
 * HTTP-01 challenges require serving a file at:
 * http://<domain>/.well-known/acme-challenge/<token>
 *
 * This is automatically handled by greenlock-express.
 *
 * @param app Express application
 */
export function setupACMEChallengeHandler(_app: Express): void {
  // Greenlock-express automatically adds the challenge handler
  // We just need to ensure it's called before other middleware
  logger.info('ACME HTTP-01 challenge handler enabled');
}

/**
 * Get Let's Encrypt rate limit info
 *
 * Returns information about rate limits to help users avoid hitting them.
 *
 * @returns Rate limit information
 */
export function getRateLimitInfo(): {
  certificatesPerDomain: string;
  duplicateCertificates: string;
  renewalExemption: string;
  staging: string;
} {
  return {
    certificatesPerDomain: '50 per week per domain',
    duplicateCertificates: '5 per week (same set of domains)',
    renewalExemption: 'Renewals are exempt from duplicate limit',
    staging: 'Use staging mode for testing to avoid rate limits',
  };
}

export default {
  initGreenlock,
  getCertificate,
  renewCertificate,
  getCertificateStatus,
  validateConfig,
  setupACMEChallengeHandler,
  getRateLimitInfo,
};
