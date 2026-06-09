/**
 * Kerberos (SPNEGO) Passport Strategy
 *
 * Implements Kerberos/SPNEGO authentication via Negotiate header.
 * Supports JIT user provisioning and Active Directory integration.
 *
 * Related: Epic #21 (Advanced Authentication - Kerberos/mTLS)
 */

import { Strategy as CustomStrategy } from 'passport-custom';
import kerberos from 'kerberos';
import type { Request } from 'express';
import { loadKerberosConfig } from './config.js';
import {
  parseKerberosPrincipal,
  provisionKerberosUser,
  validatePrincipalAccess,
} from './provisioning.js';
import logger from '../../../logging/logger.js';
import { sanitizeString } from '../../../logging/sanitizer.js';
import type { AuthenticatedUser } from '../jwt.js';

/**
 * Verify Kerberos token using keytab
 *
 * @param token - Base64-encoded SPNEGO token from Authorization: Negotiate header
 * @param config - Kerberos configuration
 * @returns Kerberos principal (e.g., user@REALM)
 */
async function verifyKerberosToken(
  token: string,
  config: { servicePrincipal: string; keytabPath: string }
): Promise<string> {
  try {
    // Decode base64 token
    const tokenBuffer = Buffer.from(token, 'base64');

    // Initialize Kerberos context
    // Note: kerberos.initializeServer returns a context object
    const context = await kerberos.initializeServer(config.servicePrincipal);

    // Verify the token (returns username on success)
    const username = await context.step(tokenBuffer.toString('base64'));

    if (!username || typeof username !== 'string') {
      throw new Error('Kerberos authentication failed: no username returned');
    }

    return username;
  } catch (error) {
    const err = error as Error;
    logger.warn('Kerberos token verification failed', {
      error: sanitizeString(err.message),
    });
    throw new Error('Invalid Kerberos token');
  }
}

/**
 * Create Kerberos passport strategy
 */
export async function createKerberosStrategy(): Promise<CustomStrategy> {
  const config = await loadKerberosConfig();

  if (!config) {
    logger.warn('Kerberos strategy not configured');
    // Return a strategy that always fails
    return new CustomStrategy(async (_req, done) => {
      done(new Error('Kerberos authentication not configured'), false);
    });
  }

  return new CustomStrategy(async (req: Request, done) => {
    try {
      // Extract Authorization: Negotiate header
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Negotiate ')) {
        logger.debug('Missing or invalid Negotiate header');
        return done(null, false);
      }

      const token = authHeader.substring('Negotiate '.length);

      // Verify Kerberos token
      const principal = await verifyKerberosToken(token, config);

      logger.debug('Kerberos token verified', {
        principal: sanitizeString(principal),
      });

      // Parse principal
      const userInfo = parseKerberosPrincipal(principal);

      // Provision or update user
      const user = await provisionKerberosUser(userInfo);

      // Validate user access
      validatePrincipalAccess(user);

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
      logger.warn('Kerberos authentication failed', {
        error: sanitizeString(err.message),
      });
      done(err);
    }
  });
}

/**
 * Register Kerberos strategy with Passport
 */
export async function registerKerberosStrategy(passport: typeof import('passport')): Promise<void> {
  try {
    const strategy = await createKerberosStrategy();
    passport.use('kerberos', strategy);
    logger.info('Kerberos (SPNEGO) strategy registered');
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to register Kerberos strategy', {
      error: sanitizeString(err.message),
    });
    throw error;
  }
}
