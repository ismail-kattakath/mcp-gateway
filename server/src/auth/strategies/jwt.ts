/**
 * JWT Authentication Strategy
 *
 * Passport.js strategy for JWT Bearer token authentication.
 * Validates JWT access tokens in the Authorization header.
 *
 * Related: Epic #4 (Authentication Framework), Issue #49
 */

import { Strategy as JwtStrategy, ExtractJwt, StrategyOptions } from 'passport-jwt';
import { usersModel } from '../../storage/models/users.js';
import logger from '../../logging/logger.js';
import { sanitizeString } from '../../logging/sanitizer.js';
import type { JWTPayload } from '../tokens.js';

/**
 * User object attached to Express Request
 */
export interface AuthenticatedUser {
  id: string;
  username: string;
  role: string;
  tenant: string | null;
}

/**
 * Get JWT secret from environment
 */
function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      'JWT_SECRET environment variable is required and must be at least 32 characters'
    );
  }
  return secret;
}

/**
 * JWT strategy options
 */
const jwtOptions: StrategyOptions = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: getJwtSecret(),
  issuer: 'mcp-gateway',
  audience: 'mcp-gateway-api',
  algorithms: ['HS256'],
};

/**
 * JWT strategy for Passport.js
 *
 * Validates JWT tokens and loads user from database.
 */
export const jwtStrategy = new JwtStrategy(jwtOptions, async (payload: JWTPayload, done) => {
  try {
    // Validate payload structure
    if (!payload.sub || !payload.username || !payload.role) {
      logger.warn('JWT payload missing required fields');
      return done(null, false);
    }

    // Load user from database to ensure they still exist and are active
    const user = usersModel.findById(payload.sub);

    if (!user) {
      logger.debug('JWT user not found', {
        userId: sanitizeString(payload.sub),
      });
      return done(null, false);
    }

    if (user.status !== 'active') {
      logger.warn('JWT user not active', {
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

    logger.debug('JWT authentication successful', {
      userId: sanitizeString(user.id),
      username: sanitizeString(user.username),
    });

    return done(null, authenticatedUser);
  } catch (error) {
    const err = error as Error;
    logger.error('JWT strategy error', {
      error: sanitizeString(err.message),
    });
    return done(err, false);
  }
});

export default jwtStrategy;
