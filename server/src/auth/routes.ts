/**
 * Authentication Routes
 *
 * Express routes for authentication endpoints:
 * - POST /auth/login - Username/password login
 * - POST /auth/token - Refresh access token
 * - POST /auth/logout - Invalidate refresh token
 * - POST /auth/apikey - Create API key
 * - GET /auth/me - Get current user info
 * - POST /auth/users - Create user (admin only)
 * - GET /auth/users - List users (admin only)
 *
 * Related: Epic #4 (Authentication Framework), Issue #52
 */

import { Router, Request, Response } from 'express';
import { usersModel } from '../storage/models/users.js';
import { refreshTokensModel } from '../storage/models/refresh-tokens.js';
import {
  generateAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  generateApiKey,
} from './tokens.js';
import { authenticate } from './index.js';
import logger from '../logging/logger.js';
import passport from 'passport';
import { sanitizeString } from '../logging/sanitizer.js';
import type { AuthenticatedUser } from './strategies/jwt.js';
// RBAC Middleware (Epic #17)
import {
  requirePermission,
  tenantIsolation,
  type AuthenticatedRequest,
} from '../rbac/middleware.js';
// Audit Logging (Epic #22)
import { createAuditLog } from '../audit/service.js';
import { AuditActionType } from '../types/audit.js';

const router = Router();

// Extend Express Request to include user
// eslint-disable-next-line @typescript-eslint/no-namespace
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface User extends AuthenticatedUser {}
  }
}

/**
 * POST /auth/login
 *
 * Authenticate with username and password, returns JWT tokens.
 *
 * Request body:
 * {
 *   "username": "alice",
 *   "password": "secret123456"
 * }
 *
 * Response:
 * {
 *   "accessToken": "eyJhbGc...",
 *   "refreshToken": "abc123...",
 *   "expiresIn": 900,
 *   "user": { "id": "...", "username": "alice", "role": "user" }
 * }
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        error: 'Missing username or password',
      });
    }

    // Authenticate user
    const user = await usersModel.authenticate(username, password);

    if (!user) {
      logger.warn('Login failed: invalid credentials', {
        username: sanitizeString(username),
        ip: req.ip,
      });

      // Audit failed login
      await createAuditLog({
        username: sanitizeString(username),
        actionType: AuditActionType.AUTH_LOGIN_FAILED,
        actionResult: 'failure',
        ipAddress: req.ip || req.socket.remoteAddress,
        userAgent: req.get('user-agent'),
        details: { reason: 'invalid_credentials' },
      });

      return res.status(401).json({
        error: 'Invalid credentials',
      });
    }

    // Generate tokens
    const accessToken = generateAccessToken({
      sub: user.id,
      username: user.username,
      role: user.role,
      tenant: user.tenant,
    });

    const refreshTokenData = generateRefreshToken();

    // Store refresh token in database
    refreshTokensModel.create({
      userId: user.id,
      tokenHash: refreshTokenData.tokenHash,
      expiresAt: refreshTokenData.expiresAt,
      deviceInfo: req.get('User-Agent'),
      ipAddress: req.ip,
      tenant: user.tenant,
    });

    logger.info('User logged in', {
      userId: sanitizeString(user.id),
      username: sanitizeString(user.username),
      ip: req.ip,
    });

    // Audit successful login
    await createAuditLog({
      userId: user.id,
      username: user.username,
      actionType: AuditActionType.AUTH_LOGIN,
      actionResult: 'success',
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.get('user-agent'),
    });

    return res.json({
      accessToken,
      refreshToken: refreshTokenData.token,
      expiresIn: 900, // 15 minutes in seconds
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        tenant: user.tenant,
      },
    });
  } catch (error) {
    const err = error as Error;
    logger.error('Login error', {
      error: sanitizeString(err.message),
      ip: req.ip,
    });
    return res.status(500).json({
      error: 'Internal server error',
    });
  }
});

/**
 * POST /auth/token
 *
 * Refresh access token using refresh token.
 *
 * Request body:
 * {
 *   "refreshToken": "abc123..."
 * }
 *
 * Response:
 * {
 *   "accessToken": "eyJhbGc...",
 *   "expiresIn": 900
 * }
 */
router.post('/token', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        error: 'Missing refresh token',
      });
    }

    // Hash and validate refresh token
    const tokenHash = hashRefreshToken(refreshToken);
    const tokenRecord = refreshTokensModel.validate(tokenHash);

    if (!tokenRecord) {
      logger.warn('Token refresh failed: invalid token', {
        ip: req.ip,
      });
      return res.status(401).json({
        error: 'Invalid or expired refresh token',
      });
    }

    // Load user
    const user = usersModel.findById(tokenRecord.user_id);

    if (!user) {
      logger.error('Token refresh failed: user not found', {
        userId: sanitizeString(tokenRecord.user_id),
      });
      return res.status(401).json({
        error: 'User not found',
      });
    }

    // Generate new access token
    const accessToken = generateAccessToken({
      sub: user.id,
      username: user.username,
      role: user.role,
      tenant: user.tenant,
    });

    logger.debug('Access token refreshed', {
      userId: sanitizeString(user.id),
      username: sanitizeString(user.username),
    });

    return res.json({
      accessToken,
      expiresIn: 900,
    });
  } catch (error) {
    const err = error as Error;
    logger.error('Token refresh error', {
      error: sanitizeString(err.message),
      ip: req.ip,
    });
    return res.status(500).json({
      error: 'Internal server error',
    });
  }
});

/**
 * POST /auth/logout
 *
 * Revoke refresh token (logout).
 *
 * Request body:
 * {
 *   "refreshToken": "abc123..."
 * }
 *
 * Response:
 * {
 *   "message": "Logged out successfully"
 * }
 */
router.post('/logout', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        error: 'Missing refresh token',
      });
    }

    // Revoke refresh token
    const tokenHash = hashRefreshToken(refreshToken);
    const revoked = refreshTokensModel.revoke(tokenHash);

    if (!revoked) {
      logger.debug('Logout: token not found', {
        ip: req.ip,
      });
    }

    logger.info('User logged out', {
      ip: req.ip,
    });

    return res.json({
      message: 'Logged out successfully',
    });
  } catch (error) {
    const err = error as Error;
    logger.error('Logout error', {
      error: sanitizeString(err.message),
      ip: req.ip,
    });
    return res.status(500).json({
      error: 'Internal server error',
    });
  }
});

/**
 * GET /auth/me
 *
 * Get current authenticated user info.
 * Requires authentication.
 *
 * Response:
 * {
 *   "id": "...",
 *   "username": "alice",
 *   "role": "user",
 *   "tenant": null
 * }
 */
router.get('/me', authenticate(), (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({
      error: 'Not authenticated',
    });
  }

  return res.json(req.user);
});

/**
 * POST /auth/apikey
 *
 * Create a new JWT-based API key.
 * Requires authentication.
 *
 * Request body:
 * {
 *   "name": "CI/CD Key" (optional)
 * }
 *
 * Response:
 * {
 *   "apiKey": "eyJhbGc...",
 *   "name": "CI/CD Key"
 * }
 */
router.post(
  '/apikey',
  authenticate(),
  tenantIsolation,
  requirePermission('create', 'apikey'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: 'Not authenticated',
        });
      }

      const { name } = req.body;

      // Generate JWT-based API key
      const apiKey = generateApiKey({
        sub: req.user.id,
        username: req.user.username,
        role: req.user.role,
        tenant: req.user.tenant,
      });

      logger.info('API key created', {
        userId: sanitizeString(req.user.id),
        username: sanitizeString(req.user.username),
        keyName: name ? sanitizeString(name) : 'unnamed',
      });

      return res.json({
        apiKey,
        name: name || 'Unnamed API Key',
        expiresIn: 315360000, // 10 years in seconds
      });
    } catch (error) {
      const err = error as Error;
      logger.error('API key creation error', {
        error: sanitizeString(err.message),
        ip: req.ip,
      });
      return res.status(500).json({
        error: 'Internal server error',
      });
    }
  }
);

/**
 * POST /auth/users
 *
 * Create a new user (admin only).
 *
 * Request body:
 * {
 *   "username": "bob",
 *   "password": "secret123456",
 *   "email": "bob@example.com",
 *   "role": "user"
 * }
 *
 * Response:
 * {
 *   "id": "...",
 *   "username": "bob",
 *   "email": "bob@example.com",
 *   "role": "user",
 *   "status": "active"
 * }
 */
router.post(
  '/users',
  authenticate(),
  tenantIsolation,
  requirePermission('create', 'user'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: 'Not authenticated',
        });
      }

      const { username, password, email, role = 'user' } = req.body;

      if (!username || !password) {
        return res.status(400).json({
          error: 'Missing username or password',
        });
      }

      // Create user in same tenant as creator
      const user = await usersModel.create({
        username,
        password,
        email,
        role,
        tenant: req.user.tenant,
      });

      logger.info('User created by admin', {
        adminId: sanitizeString(req.user.id),
        newUserId: sanitizeString(user.id),
        newUsername: sanitizeString(user.username),
      });

      return res.status(201).json(user);
    } catch (error) {
      const err = error as Error;
      logger.error('User creation error', {
        error: sanitizeString(err.message),
        ip: req.ip,
      });

      if (err.message.includes('already exists')) {
        return res.status(409).json({
          error: err.message,
        });
      }

      return res.status(500).json({
        error: 'Internal server error',
      });
    }
  }
);

/**
 * GET /auth/users
 *
 * List all users (admin only).
 *
 * Query params:
 * - role: filter by role
 * - status: filter by status
 *
 * Response:
 * [
 *   {
 *     "id": "...",
 *     "username": "alice",
 *     "email": "alice@example.com",
 *     "role": "admin",
 *     "status": "active"
 *   }
 * ]
 */
router.get(
  '/users',
  authenticate(),
  tenantIsolation,
  requirePermission('read', 'user'),
  (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: 'Not authenticated',
        });
      }

      // Parse filters
      const filter: any = {};

      // For non-admin users, enforce tenant filter
      if (req.user.role !== 'admin') {
        filter.tenant = req.user.tenant;
      } else if (req.query.tenant) {
        // Admins can optionally filter by tenant
        filter.tenant = req.query.tenant as string;
      }

      if (req.query.role) {
        filter.role = req.query.role as string;
      }

      if (req.query.status) {
        filter.status = req.query.status as string;
      }

      const users = usersModel.list(filter);

      return res.json(users);
    } catch (error) {
      const err = error as Error;
      logger.error('User list error', {
        error: sanitizeString(err.message),
        ip: req.ip,
      });
      return res.status(500).json({
        error: 'Internal server error',
      });
    }
  }
);

/**
 * OAuth 2.0 Routes (Epic #18)
 */

// Import OAuth handlers
import {
  createOAuthInitiateHandler,
  createOAuthCallbackHandler,
  oauthSuccessHandler,
  oauthFailureHandler,
} from './strategies/oauth/callback.js';
import { isOAuthProviderAvailable } from './strategies/oauth/index.js';

/**
 * GET /auth/oauth/github
 *
 * Initiate GitHub OAuth flow.
 * Redirects to GitHub authorization page.
 */
router.get('/oauth/github', (req: Request, res: Response, next) => {
  if (!isOAuthProviderAvailable('github')) {
    res.status(404).json({
      error: 'GitHub OAuth provider not configured',
    });
    return;
  }
  createOAuthInitiateHandler('github')(req, res, next);
});

/**
 * GET /auth/oauth/github/callback
 *
 * GitHub OAuth callback endpoint.
 * Handles authorization code exchange and user provisioning.
 */
router.get('/oauth/github/callback', createOAuthCallbackHandler('github'));

/**
 * GET /auth/oauth/google
 *
 * Initiate Google OAuth flow.
 * Redirects to Google authorization page.
 */
router.get('/oauth/google', (req: Request, res: Response, next) => {
  if (!isOAuthProviderAvailable('google')) {
    res.status(404).json({
      error: 'Google OAuth provider not configured',
    });
    return;
  }
  createOAuthInitiateHandler('google')(req, res, next);
});

/**
 * GET /auth/oauth/google/callback
 *
 * Google OAuth callback endpoint.
 * Handles authorization code exchange and user provisioning.
 */
router.get('/oauth/google/callback', createOAuthCallbackHandler('google'));

/**
 * GET /auth/oauth/:provider
 *
 * Initiate generic OAuth flow for custom providers.
 * Redirects to provider's authorization page.
 */
router.get('/oauth/:provider', (req: Request, res: Response, next) => {
  const provider = req.params.provider;

  // Prevent conflict with built-in providers
  if (
    provider === 'github' ||
    provider === 'google' ||
    provider === 'success' ||
    provider === 'failure'
  ) {
    res.status(400).json({
      error: 'Invalid provider name',
    });
    return;
  }

  if (!isOAuthProviderAvailable(provider)) {
    res.status(400).json({
      error: `OAuth provider '${provider}' not configured`,
    });
    return;
  }

  createOAuthInitiateHandler(`oauth-${provider}`)(req, res, next);
});

/**
 * GET /auth/oauth/:provider/callback
 *
 * Generic OAuth callback endpoint.
 * Handles authorization code exchange and user provisioning.
 */
router.get('/oauth/:provider/callback', (req: Request, res: Response, next) => {
  const provider = req.params.provider;

  // Prevent conflict with built-in providers
  if (provider === 'github' || provider === 'google') {
    next(); // Let built-in routes handle it
    return;
  }

  if (!isOAuthProviderAvailable(provider)) {
    res.status(404).json({
      error: `OAuth provider '${provider}' not configured`,
    });
    return;
  }

  createOAuthCallbackHandler(`oauth-${provider}`)(req, res, next);
});

/**
 * GET /auth/oauth/success
 *
 * OAuth success page.
 * Displayed after successful OAuth authentication.
 */
router.get('/oauth/success', oauthSuccessHandler);

/**
 * GET /auth/oauth/failure
 *
 * OAuth failure page.
 * Displayed after failed OAuth authentication.
 */
router.get('/oauth/failure', oauthFailureHandler);

/**
 * GET /auth/oauth/providers
 *
 * List available OAuth providers.
 * Public endpoint (no auth required).
 */
router.get('/oauth/providers', async (req: Request, res: Response) => {
  try {
    const { oauthProvidersModel } = await import('../storage/models/oauth-providers.js');
    const providers = oauthProvidersModel.list(true); // enabled only

    const publicProviders = providers.map((p) => ({
      name: p.name,
      type: p.type,
      enabled: p.enabled,
    }));

    return res.json(publicProviders);
  } catch (error) {
    const err = error as Error;
    logger.error('OAuth providers list error', {
      error: sanitizeString(err.message),
    });
    return res.status(500).json({
      error: 'Internal server error',
    });
  }
});

/**
 * SAML 2.0 Routes (Epic #19)
 */

import { samlProvidersModel } from '../storage/models/saml-providers.js';

/**
 * GET /auth/saml/:provider/login
 *
 * Initiate SAML login flow.
 * Redirects to IdP SSO page.
 */
router.get('/saml/:provider/login', (req: Request, res: Response, next) => {
  const provider = req.params.provider;

  // Check if provider exists and is enabled
  const samlProvider = samlProvidersModel.findByName(provider);

  if (!samlProvider) {
    return res.status(404).json({
      error: `SAML provider '${provider}' not configured`,
    });
  }

  if (!samlProvider.enabled) {
    return res.status(403).json({
      error: `SAML provider '${provider}' is disabled`,
    });
  }

  // Authenticate using passport SAML strategy
  return passport.authenticate(`saml-${provider}`, { session: false })(req, res, next);
});

/**
 * POST /auth/saml/:provider/callback
 *
 * SAML Assertion Consumer Service (ACS).
 * Receives SAML assertion from IdP, validates, and provisions user.
 */
router.post('/saml/:provider/callback', (req: Request, res: Response, next) => {
  const provider = req.params.provider;

  passport.authenticate(
    `saml-${provider}`,
    { session: false },
    async (err: Error | null, user: any) => {
      if (err) {
        logger.error('SAML callback error', {
          provider: sanitizeString(provider),
          error: sanitizeString(err.message),
          ip: req.ip,
        });
        return res.redirect('/auth/saml/failure?error=' + encodeURIComponent(err.message));
      }

      if (!user) {
        logger.warn('SAML callback failed: no user', {
          provider: sanitizeString(provider),
          ip: req.ip,
        });
        return res.redirect('/auth/saml/failure?error=Authentication failed');
      }

      try {
        // Generate tokens
        const accessToken = generateAccessToken({
          sub: user.id,
          username: user.username,
          role: user.role,
          tenant: user.tenant,
        });

        const refreshTokenData = generateRefreshToken();

        // Store refresh token in database
        await refreshTokensModel.create({
          userId: user.id,
          tokenHash: refreshTokenData.tokenHash,
          deviceInfo: req.get('User-Agent') || 'Unknown',
          ipAddress: req.ip || 'Unknown',
          expiresAt: refreshTokenData.expiresAt,
          tenant: user.tenant,
        });

        logger.info('SAML login successful', {
          provider: sanitizeString(provider),
          userId: sanitizeString(user.id),
          username: sanitizeString(user.username),
          ip: req.ip,
        });

        // Redirect to success page with tokens
        const redirectUrl = `/auth/saml/success?accessToken=${encodeURIComponent(accessToken)}&refreshToken=${encodeURIComponent(refreshTokenData.token)}&expiresIn=900`;
        return res.redirect(redirectUrl);
      } catch (error) {
        const tokenErr = error as Error;
        logger.error('SAML token generation error', {
          provider: sanitizeString(provider),
          error: sanitizeString(tokenErr.message),
        });
        return res.redirect('/auth/saml/failure?error=Token generation failed');
      }
    }
  )(req, res, next);
});

/**
 * GET /auth/saml/:provider/metadata
 *
 * Service Provider metadata endpoint.
 * Returns SAML metadata XML for IdP configuration.
 */
router.get('/saml/:provider/metadata', (req: Request, res: Response) => {
  const provider = req.params.provider;

  // Check if provider exists
  const samlProvider = samlProvidersModel.findByName(provider);

  if (!samlProvider) {
    return res.status(404).json({
      error: `SAML provider '${provider}' not configured`,
    });
  }

  // Generate SP metadata XML
  const metadata = `<?xml version="1.0" encoding="UTF-8"?>
<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata"
                  entityID="${samlProvider.sp_entity_id}">
  <SPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol"
                   WantAssertionsSigned="${samlProvider.want_assertions_signed}">
    <AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
                             Location="${samlProvider.acs_url}"
                             index="1"/>
  </SPSSODescriptor>
</EntityDescriptor>`;

  res.set('Content-Type', 'application/samlmetadata+xml');
  return res.send(metadata);
});

/**
 * GET /auth/saml/success
 *
 * SAML success page.
 * Displayed after successful SAML authentication.
 */
router.get('/saml/success', (req: Request, res: Response) => {
  const { accessToken, refreshToken, expiresIn } = req.query;

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>SAML Login Successful</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
        .success { color: green; }
        .token { background: #f5f5f5; padding: 10px; margin: 10px 0; word-break: break-all; }
        .copy-btn { margin-left: 10px; }
      </style>
    </head>
    <body>
      <h1 class="success">✓ SAML Login Successful</h1>
      <p>You have successfully authenticated via SAML.</p>

      <h3>Access Token (expires in ${expiresIn || '900'}s):</h3>
      <div class="token" id="accessToken">${accessToken || 'N/A'}</div>
      <button class="copy-btn" onclick="copyToClipboard('accessToken')">Copy</button>

      <h3>Refresh Token:</h3>
      <div class="token" id="refreshToken">${refreshToken || 'N/A'}</div>
      <button class="copy-btn" onclick="copyToClipboard('refreshToken')">Copy</button>

      <p><a href="/">Go to Dashboard</a></p>

      <script>
        function copyToClipboard(elementId) {
          const el = document.getElementById(elementId);
          navigator.clipboard.writeText(el.textContent);
          alert('Copied to clipboard!');
        }
      </script>
    </body>
    </html>
  `);
});

/**
 * GET /auth/saml/failure
 *
 * SAML failure page.
 * Displayed after failed SAML authentication.
 */
router.get('/saml/failure', (req: Request, res: Response) => {
  const { error } = req.query;

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>SAML Login Failed</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
        .error { color: red; }
      </style>
    </head>
    <body>
      <h1 class="error">✗ SAML Login Failed</h1>
      <p>Authentication failed: ${error || 'Unknown error'}</p>
      <p><a href="/auth/login">Try again</a></p>
    </body>
    </html>
  `);
});

/**
 * GET /auth/saml/providers
 *
 * List available SAML providers.
 * Public endpoint (no auth required).
 */
router.get('/saml/providers', async (req: Request, res: Response) => {
  try {
    const providers = samlProvidersModel.list({ enabled: true });

    const publicProviders = providers.map((p) => ({
      name: p.name,
      type: p.type,
      enabled: p.enabled,
    }));

    return res.json(publicProviders);
  } catch (error) {
    const err = error as Error;
    logger.error('SAML providers list error', {
      error: sanitizeString(err.message),
    });
    return res.status(500).json({
      error: 'Internal server error',
    });
  }
});

/**
 * POST /auth/saml/providers
 *
 * Create SAML provider (admin only).
 * Requires admin authentication.
 */
router.post(
  '/saml/providers',
  authenticate(),
  requirePermission('create', 'setting'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({
          error: 'Admin access required',
        });
      }

      const provider = await samlProvidersModel.create(req.body);

      logger.info('SAML provider created', {
        adminId: sanitizeString(req.user.id),
        providerId: sanitizeString(provider.id),
        providerName: sanitizeString(provider.name),
      });

      return res.status(201).json(provider);
    } catch (error) {
      const err = error as Error;
      logger.error('SAML provider creation error', {
        error: sanitizeString(err.message),
      });

      if (err.message.includes('already exists')) {
        return res.status(409).json({
          error: err.message,
        });
      }

      return res.status(500).json({
        error: 'Internal server error',
      });
    }
  }
);

/**
 * LDAP/Active Directory Routes (Epic #20)
 */

import { ldapProvidersModel } from '../storage/models/ldap-providers.js';

/**
 * POST /auth/ldap/:provider/login
 *
 * Authenticate with LDAP/Active Directory.
 *
 * Request body:
 * {
 *   "username": "jdoe",
 *   "password": "secret123"
 * }
 *
 * Response:
 * {
 *   "accessToken": "eyJhbGc...",
 *   "refreshToken": "abc123...",
 *   "expiresIn": 900,
 *   "user": { "id": "...", "username": "jdoe", "role": "user" }
 * }
 */
router.post('/ldap/:provider/login', (req: Request, res: Response, next) => {
  const provider = req.params.provider;

  // Check if provider exists and is enabled
  const ldapProvider = ldapProvidersModel.findByName(provider);

  if (!ldapProvider) {
    return res.status(404).json({
      error: `LDAP provider '${provider}' not configured`,
    });
  }

  if (!ldapProvider.enabled) {
    return res.status(403).json({
      error: `LDAP provider '${provider}' is disabled`,
    });
  }

  // Authenticate using passport LDAP strategy
  return passport.authenticate(
    `ldap-${provider}`,
    { session: false },
    async (err: Error | null, user: any) => {
      if (err) {
        logger.error('LDAP authentication error', {
          provider: sanitizeString(provider),
          error: sanitizeString(err.message),
          ip: req.ip,
        });
        return res.status(401).json({
          error: err.message || 'Authentication failed',
        });
      }

      if (!user) {
        logger.warn('LDAP authentication failed: no user', {
          provider: sanitizeString(provider),
          ip: req.ip,
        });
        return res.status(401).json({
          error: 'Authentication failed',
        });
      }

      try {
        // Generate tokens
        const accessToken = generateAccessToken({
          sub: user.id,
          username: user.username,
          role: user.role,
          tenant: user.tenant,
        });

        const refreshTokenData = generateRefreshToken();

        // Store refresh token in database
        await refreshTokensModel.create({
          userId: user.id,
          tokenHash: refreshTokenData.tokenHash,
          deviceInfo: req.get('User-Agent') || 'Unknown',
          ipAddress: req.ip || 'Unknown',
          expiresAt: refreshTokenData.expiresAt,
          tenant: user.tenant,
        });

        logger.info('LDAP login successful', {
          provider: sanitizeString(provider),
          userId: sanitizeString(user.id),
          username: sanitizeString(user.username),
          ip: req.ip,
        });

        return res.status(200).json({
          accessToken,
          refreshToken: refreshTokenData.token,
          expiresIn: 900, // 15 minutes
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            tenant: user.tenant,
          },
        });
      } catch (error) {
        const tokenErr = error as Error;
        logger.error('LDAP token generation error', {
          provider: sanitizeString(provider),
          error: sanitizeString(tokenErr.message),
        });
        return res.status(500).json({
          error: 'Token generation failed',
        });
      }
    }
  )(req, res, next);
});

/**
 * POST /auth/kerberos/login
 *
 * Authenticate with Kerberos/SPNEGO token.
 * Client must send Authorization: Negotiate <base64-token> header.
 *
 * Response:
 * {
 *   "accessToken": "eyJhbGc...",
 *   "refreshToken": "abc123...",
 *   "expiresIn": 900,
 *   "user": { "id": "...", "username": "alice", "role": "user" }
 * }
 */
router.post('/kerberos/login', (req: Request, res: Response, next) => {
  passport.authenticate(
    'kerberos',
    { session: false },
    async (err: Error | null, user: AuthenticatedUser | false, info: { message?: string }) => {
      if (err) {
        logger.error('Kerberos authentication error', {
          error: sanitizeString(err.message),
        });
        return res.status(500).json({
          error: 'Authentication failed',
        });
      }

      if (!user) {
        logger.warn('Kerberos authentication failed', {
          reason: sanitizeString(info?.message || 'Unknown'),
        });
        return res.status(401).json({
          error: info?.message || 'Authentication failed',
        });
      }

      try {
        // Generate tokens
        const accessToken = generateAccessToken({
          sub: user.id,
          username: user.username,
          role: user.role,
          tenant: user.tenant,
        });

        const refreshTokenData = generateRefreshToken();

        // Store refresh token
        refreshTokensModel.create({
          userId: user.id,
          tokenHash: hashRefreshToken(refreshTokenData.token),
          expiresAt: refreshTokenData.expiresAt,
        });

        logger.info('Kerberos authentication successful', {
          userId: sanitizeString(user.id),
          username: sanitizeString(user.username),
        });

        return res.json({
          accessToken,
          refreshToken: refreshTokenData.token,
          expiresIn: 900, // 15 minutes
          user: {
            id: user.id,
            username: user.username,
            role: user.role,
            tenant: user.tenant,
          },
        });
      } catch (error) {
        const tokenErr = error as Error;
        logger.error('Kerberos token generation error', {
          error: sanitizeString(tokenErr.message),
        });
        return res.status(500).json({
          error: 'Token generation failed',
        });
      }
    }
  )(req, res, next);
});

export default router;
