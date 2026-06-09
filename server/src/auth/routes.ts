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
import { sanitizeString } from '../logging/sanitizer.js';
import type { AuthenticatedUser } from './strategies/jwt.js';
// RBAC Middleware (Epic #17)
import {
  requirePermission,
  tenantIsolation,
  type AuthenticatedRequest,
} from '../rbac/middleware.js';

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

export default router;
