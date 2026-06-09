/**
 * OAuth Callback Handler
 *
 * Handles OAuth callback requests, state validation, and session creation.
 *
 * Related: Epic #18 (OAuth 2.0 Support)
 */

import type { Request, Response, NextFunction } from 'express';
import passport from 'passport';
import { generateAccessToken, generateRefreshToken } from '../../tokens.js';
import logger from '../../../logging/logger.js';
import { sanitizeString } from '../../../logging/sanitizer.js';
import type { UserPublic } from '../../../storage/models/users.js';

/**
 * OAuth callback handler middleware
 *
 * Handles:
 * 1. OAuth callback from provider
 * 2. State parameter validation (CSRF protection, handled by Passport)
 * 3. User authentication via Passport strategy
 * 4. JWT token generation
 * 5. Redirect to success/failure URL
 *
 * @param provider - OAuth provider name ('github', 'google', or custom)
 * @param successRedirect - URL to redirect on success
 * @param failureRedirect - URL to redirect on failure
 */
export function createOAuthCallbackHandler(
  provider: string,
  successRedirect: string = '/auth/oauth/success',
  failureRedirect: string = '/auth/oauth/failure'
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Authenticate using Passport
    passport.authenticate(provider, {
      session: false,
      failureRedirect,
    })(req, res, async (err: Error | null) => {
      if (err) {
        return next(err);
      }

      // Success handler
      try {
        const user = req.user as UserPublic;

        if (!user) {
          throw new Error('User not found after OAuth authentication');
        }

        logger.info('OAuth callback successful', {
          provider: sanitizeString(provider),
          userId: sanitizeString(user.id),
          username: sanitizeString(user.username),
        });

        // Generate JWT tokens
        const accessToken = generateAccessToken({
          sub: user.id,
          username: user.username,
          role: user.role,
          tenant: user.tenant,
        });
        const refreshTokenData = generateRefreshToken();

        // Send tokens in response
        // Options:
        // 1. Redirect with tokens in query params (insecure, for dev only)
        // 2. Set cookies (secure, recommended)
        // 3. Return JSON (for SPA)

        // Store refresh token in database
        const { refreshTokensModel } = await import('../../../storage/models/refresh-tokens.js');
        await refreshTokensModel.create({
          userId: user.id,
          tokenHash: refreshTokenData.tokenHash,
          expiresAt: refreshTokenData.expiresAt,
          deviceInfo: req.headers['user-agent'] || 'Unknown',
          ipAddress: req.ip || 'Unknown',
        });

        // Option 2: Set secure cookies
        res.cookie('access_token', accessToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 15 * 60 * 1000, // 15 minutes
        });

        res.cookie('refresh_token', refreshTokenData.token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        });

        // Redirect to success page
        res.redirect(successRedirect);
      } catch (error) {
        const err = error as Error;
        logger.error('OAuth callback handler error', {
          provider: sanitizeString(provider),
          error: sanitizeString(err.message),
        });
        next(error);
      }
    });
  };
}

/**
 * OAuth initiate handler
 *
 * Initiates OAuth flow by redirecting to provider's authorization URL.
 * Passport handles state parameter generation automatically.
 *
 * @param provider - OAuth provider name
 */
export function createOAuthInitiateHandler(provider: string) {
  return passport.authenticate(provider, {
    session: false,
  });
}

/**
 * OAuth success page handler
 *
 * Displays success message or returns tokens (for SPA)
 */
export function oauthSuccessHandler(req: Request, res: Response) {
  // For web apps: display success page
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Login Successful</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          }
          .container {
            background: white;
            padding: 2rem;
            border-radius: 8px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            text-align: center;
          }
          h1 {
            color: #333;
            margin-bottom: 1rem;
          }
          p {
            color: #666;
            margin-bottom: 1.5rem;
          }
          .button {
            display: inline-block;
            padding: 0.75rem 1.5rem;
            background: #667eea;
            color: white;
            text-decoration: none;
            border-radius: 4px;
            transition: background 0.2s;
          }
          .button:hover {
            background: #764ba2;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>✓ Login Successful</h1>
          <p>You have been successfully authenticated with OAuth.</p>
          <a href="/" class="button">Go to Dashboard</a>
        </div>
      </body>
    </html>
  `);
}

/**
 * OAuth failure page handler
 *
 * Displays error message
 */
export function oauthFailureHandler(req: Request, res: Response) {
  res.status(401).send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Login Failed</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
          }
          .container {
            background: white;
            padding: 2rem;
            border-radius: 8px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            text-align: center;
          }
          h1 {
            color: #333;
            margin-bottom: 1rem;
          }
          p {
            color: #666;
            margin-bottom: 1.5rem;
          }
          .button {
            display: inline-block;
            padding: 0.75rem 1.5rem;
            background: #f5576c;
            color: white;
            text-decoration: none;
            border-radius: 4px;
            transition: background 0.2s;
          }
          .button:hover {
            background: #f093fb;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>✗ Login Failed</h1>
          <p>OAuth authentication failed. Please try again.</p>
          <a href="/auth/login" class="button">Try Again</a>
        </div>
      </body>
    </html>
  `);
}

export default {
  createOAuthCallbackHandler,
  createOAuthInitiateHandler,
  oauthSuccessHandler,
  oauthFailureHandler,
};
