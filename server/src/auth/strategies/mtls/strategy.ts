/**
 * mTLS (Mutual TLS) Passport Strategy
 *
 * Implements client certificate authentication with comprehensive validation.
 * Supports JIT user provisioning and flexible identity extraction.
 *
 * Related: Epic #21 (Advanced Authentication - Kerberos/mTLS)
 */

import { Strategy as CustomStrategy } from 'passport-custom';
import type { Request } from 'express';
import type { TLSSocket } from 'tls';
import { getMtlsConfigModel } from '../../../storage/models/mtls-config.js';
import { parseCertificate, extractIdentity, validateCertificateDates } from './identity.js';
import { validateCertificate } from './validation.js';
import { createMtlsUserInfo, provisionMtlsUser, validateUserAccess } from './provisioning.js';
import logger from '../../../logging/logger.js';
import { sanitizeString } from '../../../logging/sanitizer.js';
import type { AuthenticatedUser } from '../jwt.js';

/**
 * Extract client certificate from TLS socket
 */
function getClientCertificate(req: Request): string | null {
  const socket = req.socket as TLSSocket;

  // Check if connection is using TLS
  if (!socket.encrypted) {
    return null;
  }

  // Get peer certificate
  const cert = socket.getPeerCertificate(true);

  if (!cert || Object.keys(cert).length === 0) {
    return null;
  }

  // Convert to PEM format
  if ('raw' in cert && Buffer.isBuffer(cert.raw)) {
    const pemCert =
      '-----BEGIN CERTIFICATE-----\n' +
      cert.raw
        .toString('base64')
        .match(/.{1,64}/g)
        ?.join('\n') +
      '\n-----END CERTIFICATE-----';
    return pemCert;
  }

  return null;
}

/**
 * Create mTLS passport strategy
 */
export async function createMtlsStrategy(): Promise<CustomStrategy> {
  const model = getMtlsConfigModel();
  const config = model.getEnabled();

  if (!config) {
    logger.warn('mTLS strategy not configured');
    // Return a strategy that always fails
    return new CustomStrategy(async (_req, done) => {
      done(new Error('mTLS authentication not configured'), false);
    });
  }

  return new CustomStrategy(async (req: Request, done) => {
    try {
      // Extract client certificate from TLS socket
      const clientCertPem = getClientCertificate(req);

      if (!clientCertPem) {
        logger.debug('No client certificate presented');
        return done(null, false);
      }

      // Parse certificate
      const identity = parseCertificate(clientCertPem);

      // Validate certificate dates
      validateCertificateDates(identity);

      // Validate certificate chain and revocation status
      const validationResult = await validateCertificate(clientCertPem, {
        caCertPath: config.caCertPath,
        crlPath: config.crlPath,
        ocspUrl: config.ocspUrl,
      });

      if (!validationResult.valid) {
        logger.warn('Certificate validation failed', {
          error: sanitizeString(validationResult.error || 'Unknown error'),
          subjectDN: sanitizeString(identity.subjectDN),
        });
        return done(null, false);
      }

      // Extract identity from certificate
      const identityValue = extractIdentity(
        identity,
        config.identityField,
        config.customOid || undefined
      );

      logger.debug('Certificate validated', {
        subjectDN: sanitizeString(identity.subjectDN),
        identityValue: sanitizeString(identityValue),
      });

      // Create user info
      const userInfo = createMtlsUserInfo(identity, identityValue);

      // Provision or update user
      const user = await provisionMtlsUser(userInfo);

      // Validate user access
      validateUserAccess(user);

      // Return authenticated user
      const authenticatedUser: AuthenticatedUser = {
        id: user.id,
        username: user.username,
        role: user.role,
        tenant: user.tenant,
      };

      done(null, authenticatedUser);
    } catch (error) {
      const err = error as Error;
      logger.warn('mTLS authentication failed', {
        error: sanitizeString(err.message),
      });
      done(err);
    }
  });
}

/**
 * Register mTLS strategy with Passport
 */
export async function registerMtlsStrategy(passport: typeof import('passport')): Promise<void> {
  try {
    const strategy = await createMtlsStrategy();
    passport.use('mtls', strategy);
    logger.info('mTLS (client certificate) strategy registered');
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to register mTLS strategy', {
      error: sanitizeString(err.message),
    });
    throw error;
  }
}
