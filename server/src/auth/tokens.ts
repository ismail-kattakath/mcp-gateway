/**
 * JWT Token Management
 *
 * Handles generation and verification of JWT access tokens and refresh tokens.
 * Uses jsonwebtoken for JWT operations and crypto for refresh token generation.
 *
 * Related: Epic #4 (Authentication Framework), Issue #48
 */

import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import logger from '../logging/logger.js';
import { sanitizeString } from '../logging/sanitizer.js';

// Token configuration
const ACCESS_TOKEN_EXPIRY = '15m'; // 15 minutes
const REFRESH_TOKEN_EXPIRY_DAYS = 30; // 30 days
const JWT_ALGORITHM = 'HS256';

/**
 * JWT payload structure for access tokens
 */
export interface JWTPayload {
  sub: string; // User ID
  username: string;
  role: string;
  tenant?: string | null;
  iat?: number;
  exp?: number;
}

/**
 * Refresh token data
 */
export interface RefreshTokenData {
  token: string; // Raw token (to be hashed before storage)
  tokenHash: string; // SHA-256 hash for storage
  expiresAt: Date;
}

/**
 * Get JWT secret from environment
 * @throws {Error} If JWT_SECRET is not set
 */
function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      'JWT_SECRET environment variable is required and must be at least 32 characters. ' +
        'Generate with: openssl rand -base64 32'
    );
  }
  return secret;
}

/**
 * Generate a JWT access token
 *
 * @param payload - Token payload (user ID, username, role)
 * @returns Signed JWT access token
 */
export function generateAccessToken(payload: JWTPayload): string {
  try {
    const secret = getJwtSecret();

    // Sign token with 15min expiry
    const token = jwt.sign(
      {
        sub: payload.sub,
        username: payload.username,
        role: payload.role,
        tenant: payload.tenant,
      },
      secret,
      {
        algorithm: JWT_ALGORITHM,
        expiresIn: ACCESS_TOKEN_EXPIRY,
        issuer: 'mcp-gateway',
        audience: 'mcp-gateway-api',
      }
    );

    logger.debug('Generated access token', {
      userId: sanitizeString(payload.sub),
      username: sanitizeString(payload.username),
      role: sanitizeString(payload.role),
    });

    return token;
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to generate access token', {
      error: sanitizeString(err.message),
    });
    throw new Error('Token generation failed');
  }
}

/**
 * Verify and decode a JWT access token
 *
 * @param token - JWT token to verify
 * @returns Decoded token payload
 * @throws {Error} If token is invalid or expired
 */
export function verifyAccessToken(token: string): JWTPayload {
  try {
    const secret = getJwtSecret();

    const decoded = jwt.verify(token, secret, {
      algorithms: [JWT_ALGORITHM],
      issuer: 'mcp-gateway',
      audience: 'mcp-gateway-api',
    }) as JWTPayload;

    logger.debug('Verified access token', {
      userId: sanitizeString(decoded.sub),
      username: sanitizeString(decoded.username),
    });

    return decoded;
  } catch (error) {
    const err = error as Error;

    // Don't log token contents for security
    if (err.name === 'TokenExpiredError') {
      logger.debug('Access token expired');
      throw new Error('Token expired');
    } else if (err.name === 'JsonWebTokenError') {
      logger.warn('Invalid access token');
      throw new Error('Invalid token');
    } else {
      logger.error('Token verification failed', {
        error: sanitizeString(err.message),
      });
      throw new Error('Token verification failed');
    }
  }
}

/**
 * Generate a refresh token
 *
 * Creates a cryptographically secure random token and its SHA-256 hash.
 * The raw token is sent to the client, the hash is stored in the database.
 *
 * @returns Refresh token data (raw token, hash, expiry)
 */
export function generateRefreshToken(): RefreshTokenData {
  try {
    // Generate 32-byte random token
    const rawToken = crypto.randomBytes(32).toString('base64url');

    // Create SHA-256 hash for storage
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    // Calculate expiry (30 days from now)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

    logger.debug('Generated refresh token', {
      expiresAt: expiresAt.toISOString(),
    });

    return {
      token: rawToken,
      tokenHash,
      expiresAt,
    };
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to generate refresh token', {
      error: sanitizeString(err.message),
    });
    throw new Error('Refresh token generation failed');
  }
}

/**
 * Hash a refresh token for database lookup
 *
 * @param token - Raw refresh token
 * @returns SHA-256 hash
 */
export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Generate a JWT-based API key
 *
 * API keys are JWTs that don't expire (or have very long expiry).
 * They include a "legacy" flag for backward compatibility.
 *
 * @param payload - Token payload
 * @param legacy - Whether this is a migrated v2.x API key
 * @returns JWT API key
 */
export function generateApiKey(payload: JWTPayload, legacy = false): string {
  try {
    const secret = getJwtSecret();

    // API keys have 10-year expiry (effectively permanent)
    const token = jwt.sign(
      {
        sub: payload.sub,
        username: payload.username,
        role: payload.role,
        tenant: payload.tenant,
        legacy,
      },
      secret,
      {
        algorithm: JWT_ALGORITHM,
        expiresIn: '10y',
        issuer: 'mcp-gateway',
        audience: 'mcp-gateway-api',
      }
    );

    if (legacy) {
      logger.info('Generated legacy API key', {
        userId: sanitizeString(payload.sub),
        username: sanitizeString(payload.username),
      });
    } else {
      logger.debug('Generated API key', {
        userId: sanitizeString(payload.sub),
        username: sanitizeString(payload.username),
      });
    }

    return token;
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to generate API key', {
      error: sanitizeString(err.message),
    });
    throw new Error('API key generation failed');
  }
}

/**
 * Check if a token is a legacy v2.x API key
 *
 * v2.x keys are 32-byte base64url-encoded (43 chars) and not JWTs.
 *
 * @param token - Token to check
 * @returns True if legacy v2.x format
 */
export function isLegacyApiKey(token: string): boolean {
  // v2.x keys are 64 hex chars (32 bytes)
  return token.length === 64 && /^[0-9a-f]{64}$/i.test(token);
}

export default {
  generateAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  generateApiKey,
  isLegacyApiKey,
};
