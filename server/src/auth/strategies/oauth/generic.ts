/**
 * Generic OAuth 2.0 Strategy
 *
 * Implements configurable OAuth 2.0 authentication for custom providers.
 * Supports dynamic configuration of authorization/token/userinfo URLs.
 *
 * Related: Epic #18 (OAuth 2.0 Support)
 */

import { Strategy as OAuth2Strategy } from 'passport-oauth2';
import axios from 'axios';
import { oauthProvidersModel } from '../../../storage/models/oauth-providers.js';
import logger from '../../../logging/logger.js';
import { sanitizeString } from '../../../logging/sanitizer.js';
import { provisionOAuthUser } from './provisioning.js';
import type { UserPublic } from '../../../storage/models/users.js';

/**
 * Generic OAuth user profile
 */
interface GenericOAuthProfile {
  id: string;
  provider: string;
  _raw?: string;
  _json?: Record<string, unknown>;
}

/**
 * Extract field from nested object using dot notation
 * Example: getField({ user: { id: '123' } }, 'user.id') => '123'
 */
function getField(obj: Record<string, unknown>, path: string): string | undefined {
  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (typeof current === 'object' && current !== null && part in current) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return typeof current === 'string' ? current : String(current);
}

/**
 * Create generic OAuth 2.0 strategy for a custom provider
 *
 * @param providerName - Provider name from database
 * @returns OAuth2 strategy instance or null if not configured
 */
export async function createGenericOAuthStrategy(
  providerName: string
): Promise<OAuth2Strategy | null> {
  try {
    // Get provider config from database
    const provider = await oauthProvidersModel.getWithSecret(providerName);

    if (!provider) {
      logger.debug('Generic OAuth provider not configured', {
        provider: sanitizeString(providerName),
      });
      return null;
    }

    if (!provider.enabled) {
      logger.debug('Generic OAuth provider is disabled', {
        provider: sanitizeString(providerName),
      });
      return null;
    }

    // Validate required config
    if (
      !provider.config.authorizationURL ||
      !provider.config.tokenURL ||
      !provider.config.userInfoURL
    ) {
      throw new Error(
        'Generic OAuth provider requires authorizationURL, tokenURL, and userInfoURL in config'
      );
    }

    logger.info('Initializing generic OAuth strategy', {
      provider: sanitizeString(providerName),
      clientId: sanitizeString(provider.client_id),
      scopes: provider.scopes,
    });

    const strategy = new OAuth2Strategy(
      {
        authorizationURL: provider.config.authorizationURL,
        tokenURL: provider.config.tokenURL,
        clientID: provider.client_id,
        clientSecret: provider.client_secret,
        callbackURL: provider.redirect_uri,
        scope: provider.scopes,
        // State parameter for CSRF protection
        state: true,
      },
      async (
        accessToken: string,
        refreshToken: string,
        profile: GenericOAuthProfile,
        done: (error: Error | null, user?: UserPublic | false) => void
      ) => {
        try {
          // Fetch user info from userInfoURL
          const userInfoResponse = await axios.get(provider.config.userInfoURL!, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          });

          const userInfo = userInfoResponse.data as Record<string, unknown>;

          logger.info('Generic OAuth callback received', {
            provider: sanitizeString(providerName),
            userInfo: Object.keys(userInfo).join(', '),
          });

          // Extract fields using field mappings
          const fieldMappings = provider.config.fieldMappings || {};
          const userId = getField(userInfo, fieldMappings.id || 'id');
          const email = getField(userInfo, fieldMappings.email || 'email');
          const username =
            getField(userInfo, fieldMappings.username || 'username') ||
            email?.split('@')[0] ||
            userId;
          const avatar = getField(userInfo, fieldMappings.avatar || 'avatar_url');

          if (!userId) {
            throw new Error('Could not extract user ID from OAuth response');
          }

          if (!username) {
            throw new Error('Could not extract username from OAuth response');
          }

          // Extract groups for role mapping
          const groups = (userInfo.groups as string[]) || [];

          // Normalize profile
          const oauthUser = {
            provider: `generic:${providerName}`,
            id: userId,
            username,
            email,
            avatar,
            groups,
          };

          // Provision user (JIT)
          const user = await provisionOAuthUser(oauthUser, provider);

          logger.info('Generic OAuth authentication successful', {
            provider: sanitizeString(providerName),
            userId: sanitizeString(user.id),
            username: sanitizeString(user.username),
          });

          done(null, user);
        } catch (error) {
          const err = error as Error;
          logger.error('Generic OAuth callback error', {
            provider: sanitizeString(providerName),
            error: sanitizeString(err.message),
          });
          done(err);
        }
      }
    );

    // Override userProfile method to fetch user info
    strategy.userProfile = async (
      accessToken: string,
      done: (err: Error | null, profile?: GenericOAuthProfile) => void
    ) => {
      try {
        const response = await axios.get(provider.config.userInfoURL!, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        const profile: GenericOAuthProfile = {
          id: String(response.data.id || response.data.sub),
          provider: providerName,
          _json: response.data,
        };

        done(null, profile);
      } catch (error) {
        const err = error as Error;
        done(err);
      }
    };

    return strategy;
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to create generic OAuth strategy', {
      provider: sanitizeString(providerName),
      error: sanitizeString(err.message),
    });
    return null;
  }
}

/**
 * Create all generic OAuth strategies from database
 *
 * @returns Map of provider name to strategy
 */
export async function createAllGenericStrategies(): Promise<Map<string, OAuth2Strategy>> {
  const strategies = new Map<string, OAuth2Strategy>();

  try {
    // Get all enabled generic providers from database
    const providers = oauthProvidersModel.list(true); // enabled only

    const genericProviders = providers.filter((p) => p.type === 'generic');

    logger.info('Creating generic OAuth strategies', {
      count: genericProviders.length,
      providers: genericProviders.map((p) => p.name),
    });

    for (const provider of genericProviders) {
      const strategy = await createGenericOAuthStrategy(provider.name);

      if (strategy) {
        strategies.set(provider.name, strategy);
        logger.info('Generic OAuth strategy created', {
          provider: sanitizeString(provider.name),
        });
      }
    }

    return strategies;
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to create generic OAuth strategies', {
      error: sanitizeString(err.message),
    });
    return strategies;
  }
}

export default {
  createGenericOAuthStrategy,
  createAllGenericStrategies,
};
