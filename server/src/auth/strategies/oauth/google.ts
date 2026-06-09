/**
 * Google OAuth 2.0 Strategy
 *
 * Implements Passport Google OAuth authentication.
 * Supports JIT user provisioning and role mapping.
 *
 * Related: Epic #18 (OAuth 2.0 Support)
 */

import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import type { Profile as GoogleProfile } from 'passport-google-oauth20';
import { oauthProvidersModel } from '../../../storage/models/oauth-providers.js';
import logger from '../../../logging/logger.js';
import { sanitizeString } from '../../../logging/sanitizer.js';
import { provisionOAuthUser } from './provisioning.js';
import type { UserPublic } from '../../../storage/models/users.js';

/**
 * Google OAuth profile _json field
 */
interface GoogleProfileJson {
  sub: string; // Google user ID
  email: string;
  email_verified: boolean;
  name: string;
  given_name: string;
  family_name: string;
  picture: string;
  locale: string;
  hd?: string; // Hosted domain (for Google Workspace)
}

/**
 * Initialize Google OAuth strategy
 *
 * @returns Google strategy instance or null if not configured
 */
export async function createGoogleStrategy(): Promise<GoogleStrategy | null> {
  try {
    // Get Google provider config from database
    const provider = await oauthProvidersModel.getWithSecret('google');

    if (!provider) {
      logger.debug('Google OAuth provider not configured');
      return null;
    }

    if (!provider.enabled) {
      logger.debug('Google OAuth provider is disabled');
      return null;
    }

    logger.info('Initializing Google OAuth strategy', {
      clientId: sanitizeString(provider.client_id),
      scopes: provider.scopes,
    });

    const strategy = new GoogleStrategy(
      {
        clientID: provider.client_id,
        clientSecret: provider.client_secret,
        callbackURL: provider.redirect_uri,
        scope: provider.scopes,
      },
      async (
        accessToken: string,
        refreshToken: string,
        profile: GoogleProfile,
        done: (error: Error | null, user?: UserPublic | false) => void
      ) => {
        try {
          const gProfile = profile;
          const profileJson = profile._json as GoogleProfileJson;

          logger.info('Google OAuth callback received', {
            googleId: gProfile.id,
            email: sanitizeString(profileJson.email),
            emailVerified: profileJson.email_verified,
            domain: sanitizeString(profileJson.hd || ''),
          });

          // Extract user info from Google profile
          const oauthUser = {
            provider: 'google',
            id: profileJson.sub,
            username: profileJson.email.split('@')[0], // Use email prefix as username
            email: profileJson.email,
            name: profileJson.name,
            avatar: profileJson.picture,
            // Google-specific: hosted domain for role mapping
            domain: profileJson.hd,
          };

          // Provision user (JIT)
          const user = await provisionOAuthUser(oauthUser, provider);

          logger.info('Google OAuth authentication successful', {
            userId: sanitizeString(user.id),
            username: sanitizeString(user.username),
          });

          done(null, user);
        } catch (error) {
          const err = error as Error;
          logger.error('Google OAuth callback error', {
            error: sanitizeString(err.message),
          });
          done(err);
        }
      }
    );

    return strategy;
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to create Google OAuth strategy', {
      error: sanitizeString(err.message),
    });
    return null;
  }
}

export default createGoogleStrategy;
