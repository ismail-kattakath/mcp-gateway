/**
 * Passport.js Configuration
 *
 * Configures Passport.js with multiple authentication strategies:
 * - JWT (Bearer tokens)
 * - API Key (JWT-based + legacy v2.x)
 * - Basic Auth (username/password)
 *
 * Related: Epic #4 (Authentication Framework), Issue #47
 */

import passport from 'passport';
import { jwtStrategy } from './strategies/jwt.js';
import { basicStrategy } from './strategies/basic.js';
import { apikeyStrategy } from './strategies/apikey.js';
import { initOAuthStrategies } from './strategies/oauth/index.js';
import logger from '../logging/logger.js';

/**
 * Initialize Passport.js with all authentication strategies
 */
export async function initializePassport(): Promise<typeof passport> {
  // Register basic strategies
  passport.use('jwt', jwtStrategy);
  passport.use('basic', basicStrategy);
  passport.use('apikey', apikeyStrategy);

  logger.info('Passport.js initialized', {
    strategies: ['jwt', 'basic', 'apikey'],
  });

  // Initialize OAuth strategies (async, loads from database)
  try {
    await initOAuthStrategies();
  } catch (error) {
    const err = error as Error;
    logger.warn('Failed to initialize OAuth strategies', {
      error: err.message,
    });
    // Don't fail server startup if OAuth init fails
  }

  return passport;
}

/**
 * Authenticate middleware with multiple strategies
 *
 * Tries strategies in order: JWT -> API Key -> Basic Auth
 * Returns 401 if all strategies fail.
 */
export function authenticate() {
  return passport.authenticate(['jwt', 'apikey', 'basic'], {
    session: false,
    failWithError: true,
  });
}

/**
 * Authenticate with specific strategy
 */
export function authenticateWith(strategy: 'jwt' | 'apikey' | 'basic') {
  return passport.authenticate(strategy, {
    session: false,
    failWithError: true,
  });
}

// Re-export types
export type { AuthenticatedUser } from './strategies/jwt.js';

export default {
  initializePassport,
  authenticate,
  authenticateWith,
};
