/**
 * API Key Authentication Strategy
 *
 * Passport.js strategy for API key authentication via Authorization header.
 * Supports both v3.0 JWT-based API keys and legacy v2.x API keys.
 *
 * Related: Epic #4 (Authentication Framework), Issue #51
 */

import HeaderAPIKeyStrategy from 'passport-headerapikey';
import { verifyAccessToken, isLegacyApiKey } from '../tokens.js';
import { usersModel } from '../../storage/models/users.js';
import { getOrCreateApiKey } from '../../security/apikey.js';
import crypto from 'crypto';
import logger from '../../logging/logger.js';
import { sanitizeString } from '../../logging/sanitizer.js';
import type { AuthenticatedUser } from './jwt.js';

/**
 * Legacy v2.x API key validation
 *
 * Validates the old 64-character hex format API key using constant-time comparison.
 *
 * @param apiKey - API key from request
 * @returns User if valid, null otherwise
 */
async function validateLegacyApiKey(apiKey: string): Promise<AuthenticatedUser | null> {
  try {
    // Get the stored v2.x API key
    const storedKey = await getOrCreateApiKey(false);

    // Constant-time comparison
    if (!constantTimeEqual(apiKey, storedKey)) {
      logger.debug('Legacy API key validation failed');
      return null;
    }

    // Log deprecation warning
    logger.warn('⚠️  DEPRECATED: v2.x API key format is deprecated', {
      message: 'Please migrate to v3.0 JWT-based API keys',
      deprecation: 'v2.x API keys will be sunset on 2026-12-01',
      migration: 'Run: mcp auth migrate-apikey',
    });

    // Legacy keys don't have user context - use default admin user
    // In production, you should migrate to proper user-based keys
    const defaultUser = usersModel.findByUsername('admin');

    if (!defaultUser) {
      logger.error('Legacy API key validation: default admin user not found');
      return null;
    }

    return {
      id: defaultUser.id,
      username: defaultUser.username,
      role: defaultUser.role,
      tenant: defaultUser.tenant,
    };
  } catch (error) {
    const err = error as Error;
    logger.error('Legacy API key validation error', {
      error: sanitizeString(err.message),
    });
    return null;
  }
}

/**
 * Constant-time string comparison
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) {
    return false;
  }
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * API Key strategy for Passport.js
 *
 * Validates JWT-based API keys or legacy v2.x API keys.
 */
export const apikeyStrategy = new HeaderAPIKeyStrategy(
  { header: 'Authorization', prefix: 'Bearer ' },
  false,
  async (apikey: string, done) => {
    try {
      // Check if this is a legacy v2.x API key
      if (isLegacyApiKey(apikey)) {
        const user = await validateLegacyApiKey(apikey);
        if (user) {
          return done(null, user);
        }
        return done(null, false);
      }

      // Try to verify as JWT token
      try {
        const payload = verifyAccessToken(apikey);

        // Load user from database
        const user = usersModel.findById(payload.sub);

        if (!user) {
          logger.debug('API key user not found', {
            userId: sanitizeString(payload.sub),
          });
          return done(null, false);
        }

        if (user.status !== 'active') {
          logger.warn('API key user not active', {
            userId: sanitizeString(user.id),
            status: user.status,
          });
          return done(null, false);
        }

        // Attach user to request
        const authenticatedUser: AuthenticatedUser = {
          id: user.id,
          username: user.username,
          role: user.role,
          tenant: user.tenant,
        };

        logger.debug('API key authentication successful', {
          userId: sanitizeString(user.id),
          username: sanitizeString(user.username),
        });

        return done(null, authenticatedUser);
      } catch (error) {
        // JWT verification failed - invalid API key
        logger.debug('API key verification failed');
        return done(null, false);
      }
    } catch (error) {
      const err = error as Error;
      logger.error('API key strategy error', {
        error: sanitizeString(err.message),
      });
      return done(err, false);
    }
  }
);

export default apikeyStrategy;
