/**
 * GitHub OAuth 2.0 Strategy
 *
 * Implements Passport GitHub OAuth authentication.
 * Supports JIT user provisioning and role mapping.
 *
 * Related: Epic #18 (OAuth 2.0 Support)
 */

import { Strategy as GitHubStrategy } from 'passport-github2';
import type { Profile as GitHubProfile } from 'passport-github2';
import { oauthProvidersModel } from '../../../storage/models/oauth-providers.js';
import logger from '../../../logging/logger.js';
import { sanitizeString } from '../../../logging/sanitizer.js';
import { provisionOAuthUser } from './provisioning.js';
import type { UserPublic } from '../../../storage/models/users.js';

/**
 * GitHub OAuth profile with additional fields
 */
interface ExtendedGitHubProfile extends GitHubProfile {
  _json: {
    id: number;
    login: string;
    email: string | null;
    name: string | null;
    avatar_url: string | null;
  };
}

/**
 * Initialize GitHub OAuth strategy
 *
 * @returns GitHub strategy instance or null if not configured
 */
export async function createGitHubStrategy(): Promise<GitHubStrategy | null> {
  try {
    // Get GitHub provider config from database
    const provider = await oauthProvidersModel.getWithSecret('github');

    if (!provider) {
      logger.debug('GitHub OAuth provider not configured');
      return null;
    }

    if (!provider.enabled) {
      logger.debug('GitHub OAuth provider is disabled');
      return null;
    }

    logger.info('Initializing GitHub OAuth strategy', {
      clientId: sanitizeString(provider.client_id),
      scopes: provider.scopes,
    });

    const strategy = new GitHubStrategy(
      {
        clientID: provider.client_id,
        clientSecret: provider.client_secret,
        callbackURL: provider.redirect_uri,
        scope: provider.scopes,
      },
      async (
        accessToken: string,
        refreshToken: string,
        profile: GitHubProfile,
        done: (error: Error | null, user?: UserPublic | false) => void
      ) => {
        try {
          const ghProfile = profile as ExtendedGitHubProfile;

          logger.info('GitHub OAuth callback received', {
            githubId: ghProfile.id,
            username: sanitizeString(ghProfile.username || ''),
            email: sanitizeString(ghProfile._json.email || ''),
          });

          // Extract user info from GitHub profile
          const oauthUser = {
            provider: 'github',
            id: String(ghProfile._json.id),
            username: ghProfile._json.login,
            email: ghProfile._json.email || undefined,
            name: ghProfile._json.name || undefined,
            avatar: ghProfile._json.avatar_url || undefined,
            // GitHub-specific: organization memberships for role mapping
            // Note: organizations requires additional scope (read:org)
            organizations: [],
          };

          // Provision user (JIT)
          const user = await provisionOAuthUser(oauthUser, provider);

          logger.info('GitHub OAuth authentication successful', {
            userId: sanitizeString(user.id),
            username: sanitizeString(user.username),
          });

          done(null, user);
        } catch (error) {
          const err = error as Error;
          logger.error('GitHub OAuth callback error', {
            error: sanitizeString(err.message),
          });
          done(err);
        }
      }
    );

    return strategy;
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to create GitHub OAuth strategy', {
      error: sanitizeString(err.message),
    });
    return null;
  }
}

export default createGitHubStrategy;
