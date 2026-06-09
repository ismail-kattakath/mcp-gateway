/**
 * Basic Authentication Strategy
 *
 * Passport.js strategy for HTTP Basic Auth (username/password).
 * Validates credentials and loads user from database.
 *
 * Related: Epic #4 (Authentication Framework), Issue #50
 */

import { BasicStrategy } from 'passport-http';
import { usersModel } from '../../storage/models/users.js';
import logger from '../../logging/logger.js';
import { sanitizeString } from '../../logging/sanitizer.js';
import type { AuthenticatedUser } from './jwt.js';

/**
 * Basic Auth strategy for Passport.js
 *
 * Validates username and password against database.
 */
export const basicStrategy = new BasicStrategy(async (username: string, password: string, done) => {
  try {
    // Authenticate user
    const user = await usersModel.authenticate(username, password);

    if (!user) {
      logger.debug('Basic auth failed', {
        username: sanitizeString(username),
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

    logger.debug('Basic auth successful', {
      userId: sanitizeString(user.id),
      username: sanitizeString(user.username),
    });

    return done(null, authenticatedUser);
  } catch (error) {
    const err = error as Error;
    logger.error('Basic auth strategy error', {
      error: sanitizeString(err.message),
    });
    return done(err, false);
  }
});

export default basicStrategy;
