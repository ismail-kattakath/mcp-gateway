/**
 * OAuth Strategies Orchestration
 *
 * Initializes and registers all OAuth strategies with Passport.
 * Supports GitHub, Google, and custom generic OAuth 2.0 providers.
 *
 * Related: Epic #18 (OAuth 2.0 Support)
 */

import passport from 'passport';
import { createGitHubStrategy } from './github.js';
import { createGoogleStrategy } from './google.js';
import { createAllGenericStrategies } from './generic.js';
import logger from '../../../logging/logger.js';
import { sanitizeString } from '../../../logging/sanitizer.js';

/**
 * Initialize all OAuth strategies
 *
 * Loads provider configurations from database and registers strategies with Passport.
 * Called during server startup.
 */
export async function initOAuthStrategies(): Promise<void> {
  logger.info('Initializing OAuth strategies...');

  try {
    let count = 0;

    // Initialize GitHub strategy
    const githubStrategy = await createGitHubStrategy();
    if (githubStrategy) {
      passport.use('github', githubStrategy);
      logger.info('GitHub OAuth strategy registered');
      count++;
    }

    // Initialize Google strategy
    const googleStrategy = await createGoogleStrategy();
    if (googleStrategy) {
      passport.use('google', googleStrategy);
      logger.info('Google OAuth strategy registered');
      count++;
    }

    // Initialize generic strategies
    const genericStrategies = await createAllGenericStrategies();
    for (const [name, strategy] of genericStrategies.entries()) {
      passport.use(`oauth-${name}`, strategy);
      logger.info('Generic OAuth strategy registered', {
        provider: sanitizeString(name),
      });
      count++;
    }

    logger.info('OAuth strategies initialized', { count });
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to initialize OAuth strategies', {
      error: sanitizeString(err.message),
    });
    throw err;
  }
}

/**
 * Reload OAuth strategies (for dynamic provider registration)
 *
 * Useful when admin adds/updates/removes OAuth providers via API.
 */
export async function reloadOAuthStrategies(): Promise<void> {
  logger.info('Reloading OAuth strategies...');

  try {
    // Unregister existing OAuth strategies
    passport.unuse('github');
    passport.unuse('google');

    // Unregister generic strategies (need to track registered names)
    // This is a limitation of Passport.js - no easy way to list strategies
    // TODO: Maintain a registry of OAuth strategy names

    // Re-initialize all strategies
    await initOAuthStrategies();

    logger.info('OAuth strategies reloaded successfully');
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to reload OAuth strategies', {
      error: sanitizeString(err.message),
    });
    throw err;
  }
}

/**
 * Check if OAuth provider is available
 *
 * @param provider - Provider name ('github', 'google', or custom)
 * @returns True if provider strategy is registered
 */
export function isOAuthProviderAvailable(provider: string): boolean {
  try {
    // Try to get strategy (will throw if not registered)
    // Passport doesn't have a public API to check if strategy exists
    // We use a workaround by attempting to use it
    const strategyName =
      provider === 'github' || provider === 'google' ? provider : `oauth-${provider}`;

    // Check if strategy exists by attempting to access it
    // This is a hack - Passport doesn't expose a proper API for this
    const strategies = (passport as any)._strategies || {};
    return !!strategies[strategyName];
  } catch {
    return false;
  }
}

export default {
  initOAuthStrategies,
  reloadOAuthStrategies,
  isOAuthProviderAvailable,
};
