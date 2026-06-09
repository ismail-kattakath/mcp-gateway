/**
 * Refresh Tokens Model
 *
 * Handles CRUD operations for refresh_tokens table.
 * Manages JWT refresh token lifecycle, revocation, and cleanup.
 *
 * Related: Epic #4 (Authentication Framework), Epic #13 (Storage Layer)
 */

import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../database.js';
import logger from '../../logging/logger.js';
import { sanitizeString } from '../../logging/sanitizer.js';
import type Database from 'better-sqlite3';

/**
 * Refresh token record from database
 */
export interface RefreshTokenRecord {
  id: string;
  user_id: string;
  token_hash: string;
  device_info: string | null;
  ip_address: string | null;
  created_at: string;
  expires_at: string;
  revoked: number; // SQLite boolean (0 or 1)
  tenant: string | null;
}

/**
 * Options for creating a refresh token
 */
export interface CreateRefreshTokenOptions {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  deviceInfo?: string;
  ipAddress?: string;
  tenant?: string | null;
}

/**
 * Refresh Tokens Model
 */
export class RefreshTokensModel {
  private db: Database.Database;

  constructor(database?: Database.Database) {
    this.db = database || getDatabase();
  }

  /**
   * Create a new refresh token
   *
   * @param options - Token creation options
   * @returns Created token record
   * @throws {Error} If creation fails
   */
  create(options: CreateRefreshTokenOptions): RefreshTokenRecord {
    const { userId, tokenHash, expiresAt, deviceInfo, ipAddress, tenant = null } = options;

    try {
      const id = uuidv4();
      const now = new Date().toISOString();

      this.db
        .prepare(
          `INSERT INTO refresh_tokens (id, user_id, token_hash, device_info, ip_address, created_at, expires_at, tenant)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          userId,
          tokenHash,
          deviceInfo || null,
          ipAddress || null,
          now,
          expiresAt.toISOString(),
          tenant
        );

      logger.debug('Refresh token created', {
        tokenId: sanitizeString(id),
        userId: sanitizeString(userId),
      });

      const token = this.db
        .prepare('SELECT * FROM refresh_tokens WHERE id = ?')
        .get(id) as RefreshTokenRecord;

      return token;
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to create refresh token', {
        userId: sanitizeString(userId),
        error: sanitizeString(err.message),
      });
      throw err;
    }
  }

  /**
   * Find a refresh token by its hash
   *
   * @param tokenHash - SHA-256 hash of the token
   * @returns Token record or null if not found
   */
  findByHash(tokenHash: string): RefreshTokenRecord | null {
    try {
      const token = this.db
        .prepare('SELECT * FROM refresh_tokens WHERE token_hash = ?')
        .get(tokenHash) as RefreshTokenRecord | undefined;

      if (!token) {
        return null;
      }

      return token;
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to find refresh token', {
        error: sanitizeString(err.message),
      });
      throw err;
    }
  }

  /**
   * Validate a refresh token
   *
   * Checks if token exists, is not revoked, and is not expired.
   *
   * @param tokenHash - SHA-256 hash of the token
   * @returns Token record if valid, null otherwise
   */
  validate(tokenHash: string): RefreshTokenRecord | null {
    try {
      const token = this.findByHash(tokenHash);

      if (!token) {
        logger.debug('Refresh token not found');
        return null;
      }

      if (token.revoked === 1) {
        logger.debug('Refresh token revoked', {
          tokenId: sanitizeString(token.id),
        });
        return null;
      }

      const now = new Date();
      const expiresAt = new Date(token.expires_at);

      if (now > expiresAt) {
        logger.debug('Refresh token expired', {
          tokenId: sanitizeString(token.id),
          expiresAt: token.expires_at,
        });
        return null;
      }

      return token;
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to validate refresh token', {
        error: sanitizeString(err.message),
      });
      throw err;
    }
  }

  /**
   * Revoke a refresh token by its hash
   *
   * @param tokenHash - SHA-256 hash of the token
   * @returns True if revoked, false if not found
   */
  revoke(tokenHash: string): boolean {
    try {
      const result = this.db
        .prepare('UPDATE refresh_tokens SET revoked = 1 WHERE token_hash = ?')
        .run(tokenHash);

      if (result.changes === 0) {
        logger.debug('Refresh token not found for revocation');
        return false;
      }

      logger.info('Refresh token revoked', {
        tokenHash: sanitizeString(tokenHash.substring(0, 16) + '...'),
      });

      return true;
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to revoke refresh token', {
        error: sanitizeString(err.message),
      });
      throw err;
    }
  }

  /**
   * Revoke all refresh tokens for a user
   *
   * @param userId - User ID
   * @returns Number of tokens revoked
   */
  revokeAllForUser(userId: string): number {
    try {
      const result = this.db
        .prepare('UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ? AND revoked = 0')
        .run(userId);

      logger.info('Revoked all refresh tokens for user', {
        userId: sanitizeString(userId),
        count: result.changes,
      });

      return result.changes;
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to revoke refresh tokens for user', {
        userId: sanitizeString(userId),
        error: sanitizeString(err.message),
      });
      throw err;
    }
  }

  /**
   * List all refresh tokens for a user
   *
   * @param userId - User ID
   * @param includeRevoked - Include revoked tokens
   * @returns List of tokens
   */
  listForUser(userId: string, includeRevoked = false): RefreshTokenRecord[] {
    try {
      let sql = 'SELECT * FROM refresh_tokens WHERE user_id = ?';
      if (!includeRevoked) {
        sql += ' AND revoked = 0';
      }
      sql += ' ORDER BY created_at DESC';

      const tokens = this.db.prepare(sql).all(userId) as RefreshTokenRecord[];

      return tokens;
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to list refresh tokens', {
        userId: sanitizeString(userId),
        error: sanitizeString(err.message),
      });
      throw err;
    }
  }

  /**
   * Clean up expired or revoked refresh tokens
   *
   * Deletes tokens that are expired or revoked (older than 30 days).
   *
   * @returns Number of tokens deleted
   */
  cleanup(): number {
    try {
      const now = new Date().toISOString();
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const result = this.db
        .prepare(
          `DELETE FROM refresh_tokens
           WHERE expires_at < ?
           OR (revoked = 1 AND created_at < ?)`
        )
        .run(now, thirtyDaysAgo.toISOString());

      logger.info('Cleaned up refresh tokens', {
        count: result.changes,
      });

      return result.changes;
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to cleanup refresh tokens', {
        error: sanitizeString(err.message),
      });
      throw err;
    }
  }

  /**
   * Count active refresh tokens for a user
   *
   * @param userId - User ID
   * @returns Count of active tokens
   */
  countActiveForUser(userId: string): number {
    try {
      const now = new Date().toISOString();
      const result = this.db
        .prepare(
          `SELECT COUNT(*) as count FROM refresh_tokens
           WHERE user_id = ? AND revoked = 0 AND expires_at > ?`
        )
        .get(userId, now) as { count: number };

      return result.count;
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to count active refresh tokens', {
        userId: sanitizeString(userId),
        error: sanitizeString(err.message),
      });
      throw err;
    }
  }
}

// Lazy singleton instance (only created when accessed)
let _refreshTokensModelInstance: RefreshTokensModel | null = null;

export const refreshTokensModel = {
  get instance(): RefreshTokensModel {
    if (!_refreshTokensModelInstance) {
      _refreshTokensModelInstance = new RefreshTokensModel();
    }
    return _refreshTokensModelInstance;
  },
  // Proxy all methods
  create: (options: CreateRefreshTokenOptions) => refreshTokensModel.instance.create(options),
  findByHash: (tokenHash: string) => refreshTokensModel.instance.findByHash(tokenHash),
  validate: (tokenHash: string) => refreshTokensModel.instance.validate(tokenHash),
  revoke: (tokenHash: string) => refreshTokensModel.instance.revoke(tokenHash),
  revokeAllForUser: (userId: string) => refreshTokensModel.instance.revokeAllForUser(userId),
  listForUser: (userId: string, includeRevoked?: boolean) =>
    refreshTokensModel.instance.listForUser(userId, includeRevoked),
  cleanup: () => refreshTokensModel.instance.cleanup(),
  countActiveForUser: (userId: string) => refreshTokensModel.instance.countActiveForUser(userId),
};

export default refreshTokensModel;
