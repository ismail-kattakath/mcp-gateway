/**
 * Users Model
 *
 * Handles CRUD operations for users table.
 * Supports authentication, password management, and user lifecycle.
 *
 * Related: Epic #4 (Authentication Framework), Epic #13 (Storage Layer)
 */

import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';
import { getDatabase } from '../database.js';
import logger from '../../logging/logger.js';
import { sanitizeString } from '../../logging/sanitizer.js';
import type Database from 'better-sqlite3';

// bcrypt cost factor (OWASP recommended: 12)
const BCRYPT_ROUNDS = 12;

/**
 * User record from database
 */
export interface UserRecord {
  id: string;
  username: string;
  email: string | null;
  password_hash: string;
  role: 'admin' | 'user' | 'readonly';
  tenant: string | null;
  status: 'active' | 'disabled' | 'locked';
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
  // OAuth fields (Epic #18)
  github_id: string | null;
  google_id: string | null;
  oauth_provider: string | null;
  oauth_id: string | null;
}

/**
 * User data without sensitive fields (for API responses)
 */
export interface UserPublic {
  id: string;
  username: string;
  email: string | null;
  role: 'admin' | 'user' | 'readonly';
  tenant: string | null;
  status: 'active' | 'disabled' | 'locked';
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
}

/**
 * Options for creating a user
 */
export interface CreateUserOptions {
  username: string;
  password: string;
  email?: string;
  role?: 'admin' | 'user' | 'readonly';
  tenant?: string | null;
  status?: 'active' | 'disabled' | 'locked';
}

/**
 * Options for updating a user
 */
export interface UpdateUserOptions {
  password?: string;
  email?: string;
  role?: 'admin' | 'user' | 'readonly';
  status?: 'active' | 'disabled' | 'locked';
}

/**
 * Filter for listing users
 */
export interface ListUsersFilter {
  tenant?: string | null;
  role?: 'admin' | 'user' | 'readonly';
  status?: 'active' | 'disabled' | 'locked';
}

/**
 * Users Model
 */
export class UsersModel {
  private db: Database.Database;

  constructor(database?: Database.Database) {
    this.db = database || getDatabase();
  }

  /**
   * Hash a password using bcrypt
   */
  private async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_ROUNDS);
  }

  /**
   * Verify a password against a hash using constant-time comparison
   */
  private async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Remove password_hash from user record
   */
  private toPublic(user: UserRecord): UserPublic {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password_hash, ...publicUser } = user;
    return publicUser;
  }

  /**
   * Create a new user
   *
   * @param options - User creation options
   * @returns Created user (without password hash)
   * @throws {Error} If username already exists or validation fails
   */
  async create(options: CreateUserOptions): Promise<UserPublic> {
    const { username, password, email, role = 'user', tenant = null, status = 'active' } = options;

    try {
      // Validate password requirements
      if (password.length < 12) {
        throw new Error('Password must be at least 12 characters');
      }

      // Check if username already exists
      const existing = this.db.prepare('SELECT id FROM users WHERE username = ?').get(username) as
        | UserRecord
        | undefined;

      if (existing) {
        throw new Error('Username already exists');
      }

      // Hash password
      const passwordHash = await this.hashPassword(password);

      // Generate user ID
      const id = uuidv4();

      // Insert user
      const now = new Date().toISOString();
      this.db
        .prepare(
          `INSERT INTO users (id, username, email, password_hash, role, tenant, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(id, username, email || null, passwordHash, role, tenant, status, now, now);

      logger.info('User created', {
        userId: sanitizeString(id),
        username: sanitizeString(username),
        role: sanitizeString(role),
      });

      // Fetch and return created user
      const user = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRecord;

      return this.toPublic(user);
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to create user', {
        username: sanitizeString(username),
        error: sanitizeString(err.message),
      });
      throw err;
    }
  }

  /**
   * Find a user by ID
   *
   * @param id - User ID
   * @returns User or null if not found
   */
  findById(id: string): UserPublic | null {
    try {
      const user = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as
        | UserRecord
        | undefined;

      if (!user) {
        return null;
      }

      return this.toPublic(user);
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to find user by ID', {
        userId: sanitizeString(id),
        error: sanitizeString(err.message),
      });
      throw err;
    }
  }

  /**
   * Find a user by username
   *
   * @param username - Username
   * @returns User or null if not found
   */
  findByUsername(username: string): UserPublic | null {
    try {
      const user = this.db.prepare('SELECT * FROM users WHERE username = ?').get(username) as
        | UserRecord
        | undefined;

      if (!user) {
        return null;
      }

      return this.toPublic(user);
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to find user by username', {
        username: sanitizeString(username),
        error: sanitizeString(err.message),
      });
      throw err;
    }
  }

  /**
   * Authenticate a user with username and password
   *
   * @param username - Username
   * @param password - Plain text password
   * @returns User if credentials valid, null otherwise
   */
  async authenticate(username: string, password: string): Promise<UserPublic | null> {
    try {
      // Fetch user with password hash (don't use findByUsername to get hash)
      const user = this.db.prepare('SELECT * FROM users WHERE username = ?').get(username) as
        | UserRecord
        | undefined;

      if (!user) {
        logger.debug('Authentication failed: user not found', {
          username: sanitizeString(username),
        });
        return null;
      }

      // Check if user is active
      if (user.status !== 'active') {
        logger.warn('Authentication failed: user not active', {
          username: sanitizeString(username),
          status: user.status,
        });
        return null;
      }

      // Verify password
      const valid = await this.verifyPassword(password, user.password_hash);

      if (!valid) {
        logger.debug('Authentication failed: invalid password', {
          username: sanitizeString(username),
        });
        return null;
      }

      // Update last login timestamp
      const now = new Date().toISOString();
      this.db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(now, user.id);

      logger.info('User authenticated', {
        userId: sanitizeString(user.id),
        username: sanitizeString(username),
      });

      return this.toPublic(user);
    } catch (error) {
      const err = error as Error;
      logger.error('Authentication error', {
        username: sanitizeString(username),
        error: sanitizeString(err.message),
      });
      return null;
    }
  }

  /**
   * Update a user
   *
   * @param id - User ID
   * @param options - Update options
   * @returns Updated user
   * @throws {Error} If user not found or update fails
   */
  async update(id: string, options: UpdateUserOptions): Promise<UserPublic> {
    const { password, email, role, status } = options;

    try {
      // Check user exists
      const user = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as
        | UserRecord
        | undefined;

      if (!user) {
        throw new Error('User not found');
      }

      // Build update fields
      const updates: string[] = [];
      const values: unknown[] = [];

      if (password !== undefined) {
        if (password.length < 12) {
          throw new Error('Password must be at least 12 characters');
        }
        const passwordHash = await this.hashPassword(password);
        updates.push('password_hash = ?');
        values.push(passwordHash);
      }

      if (email !== undefined) {
        updates.push('email = ?');
        values.push(email || null);
      }

      if (role !== undefined) {
        updates.push('role = ?');
        values.push(role);
      }

      if (status !== undefined) {
        updates.push('status = ?');
        values.push(status);
      }

      if (updates.length === 0) {
        throw new Error('No fields to update');
      }

      // Add updated_at timestamp
      updates.push('updated_at = ?');
      values.push(new Date().toISOString());

      // Add id to WHERE clause
      values.push(id);

      // Execute update
      const sql = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
      this.db.prepare(sql).run(...values);

      logger.info('User updated', {
        userId: sanitizeString(id),
        fields: updates.map((u) => u.split(' = ')[0]).join(', '),
      });

      // Fetch and return updated user
      const updated = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRecord;

      return this.toPublic(updated);
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to update user', {
        userId: sanitizeString(id),
        error: sanitizeString(err.message),
      });
      throw err;
    }
  }

  /**
   * Delete a user
   *
   * @param id - User ID
   * @throws {Error} If user not found or delete fails
   */
  delete(id: string): void {
    try {
      const result = this.db.prepare('DELETE FROM users WHERE id = ?').run(id);

      if (result.changes === 0) {
        throw new Error('User not found');
      }

      logger.info('User deleted', {
        userId: sanitizeString(id),
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to delete user', {
        userId: sanitizeString(id),
        error: sanitizeString(err.message),
      });
      throw err;
    }
  }

  /**
   * List all users with optional filtering
   *
   * @param filter - Optional filter criteria
   * @returns List of users
   */
  list(filter?: ListUsersFilter): UserPublic[] {
    try {
      let sql = 'SELECT * FROM users WHERE 1=1';
      const params: unknown[] = [];

      if (filter?.tenant !== undefined) {
        if (filter.tenant === null) {
          sql += ' AND tenant IS NULL';
        } else {
          sql += ' AND tenant = ?';
          params.push(filter.tenant);
        }
      }

      if (filter?.role) {
        sql += ' AND role = ?';
        params.push(filter.role);
      }

      if (filter?.status) {
        sql += ' AND status = ?';
        params.push(filter.status);
      }

      sql += ' ORDER BY created_at DESC';

      const users = this.db.prepare(sql).all(...params) as UserRecord[];

      return users.map((u) => this.toPublic(u));
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to list users', {
        error: sanitizeString(err.message),
      });
      throw err;
    }
  }

  /**
   * Count total users
   *
   * @returns Total user count
   */
  count(): number {
    try {
      const result = this.db.prepare('SELECT COUNT(*) as count FROM users').get() as {
        count: number;
      };
      return result.count;
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to count users', {
        error: sanitizeString(err.message),
      });
      throw err;
    }
  }

  /**
   * Find user by OAuth ID (GitHub)
   *
   * @param githubId - GitHub user ID
   * @returns User or null if not found
   */
  findByGitHubId(githubId: string): UserPublic | null {
    try {
      const user = this.db.prepare('SELECT * FROM users WHERE github_id = ?').get(githubId) as
        | UserRecord
        | undefined;

      if (!user) {
        return null;
      }

      return this.toPublic(user);
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to find user by GitHub ID', {
        githubId: sanitizeString(githubId),
        error: sanitizeString(err.message),
      });
      throw err;
    }
  }

  /**
   * Find user by OAuth ID (Google)
   *
   * @param googleId - Google user ID
   * @returns User or null if not found
   */
  findByGoogleId(googleId: string): UserPublic | null {
    try {
      const user = this.db.prepare('SELECT * FROM users WHERE google_id = ?').get(googleId) as
        | UserRecord
        | undefined;

      if (!user) {
        return null;
      }

      return this.toPublic(user);
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to find user by Google ID', {
        googleId: sanitizeString(googleId),
        error: sanitizeString(err.message),
      });
      throw err;
    }
  }

  /**
   * Find user by generic OAuth ID
   *
   * @param provider - OAuth provider name
   * @param oauthId - OAuth user ID
   * @returns User or null if not found
   */
  findByOAuthId(provider: string, oauthId: string): UserPublic | null {
    try {
      const user = this.db
        .prepare('SELECT * FROM users WHERE oauth_provider = ? AND oauth_id = ?')
        .get(provider, oauthId) as UserRecord | undefined;

      if (!user) {
        return null;
      }

      return this.toPublic(user);
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to find user by OAuth ID', {
        provider: sanitizeString(provider),
        oauthId: sanitizeString(oauthId),
        error: sanitizeString(err.message),
      });
      throw err;
    }
  }

  /**
   * Find user by email
   *
   * @param email - User email
   * @returns User or null if not found
   */
  findByEmail(email: string): UserPublic | null {
    try {
      const user = this.db.prepare('SELECT * FROM users WHERE email = ?').get(email) as
        | UserRecord
        | undefined;

      if (!user) {
        return null;
      }

      return this.toPublic(user);
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to find user by email', {
        email: sanitizeString(email),
        error: sanitizeString(err.message),
      });
      throw err;
    }
  }

  /**
   * Link GitHub account to existing user
   *
   * @param userId - User ID
   * @param githubId - GitHub user ID
   */
  linkGitHub(userId: string, githubId: string): void {
    try {
      const now = new Date().toISOString();
      this.db
        .prepare('UPDATE users SET github_id = ?, updated_at = ? WHERE id = ?')
        .run(githubId, now, userId);

      logger.info('Linked GitHub account to user', {
        userId: sanitizeString(userId),
        githubId: sanitizeString(githubId),
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to link GitHub account', {
        userId: sanitizeString(userId),
        error: sanitizeString(err.message),
      });
      throw err;
    }
  }

  /**
   * Link Google account to existing user
   *
   * @param userId - User ID
   * @param googleId - Google user ID
   */
  linkGoogle(userId: string, googleId: string): void {
    try {
      const now = new Date().toISOString();
      this.db
        .prepare('UPDATE users SET google_id = ?, updated_at = ? WHERE id = ?')
        .run(googleId, now, userId);

      logger.info('Linked Google account to user', {
        userId: sanitizeString(userId),
        googleId: sanitizeString(googleId),
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to link Google account', {
        userId: sanitizeString(userId),
        error: sanitizeString(err.message),
      });
      throw err;
    }
  }

  /**
   * Link generic OAuth account to existing user
   *
   * @param userId - User ID
   * @param provider - OAuth provider name
   * @param oauthId - OAuth user ID
   */
  linkOAuth(userId: string, provider: string, oauthId: string): void {
    try {
      const now = new Date().toISOString();
      this.db
        .prepare('UPDATE users SET oauth_provider = ?, oauth_id = ?, updated_at = ? WHERE id = ?')
        .run(provider, oauthId, now, userId);

      logger.info('Linked OAuth account to user', {
        userId: sanitizeString(userId),
        provider: sanitizeString(provider),
        oauthId: sanitizeString(oauthId),
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to link OAuth account', {
        userId: sanitizeString(userId),
        error: sanitizeString(err.message),
      });
      throw err;
    }
  }
}

// Lazy singleton instance (only created when accessed)
let _usersModelInstance: UsersModel | null = null;

export const usersModel = {
  get instance(): UsersModel {
    if (!_usersModelInstance) {
      _usersModelInstance = new UsersModel();
    }
    return _usersModelInstance;
  },
  // Proxy all methods
  create: (options: CreateUserOptions) => usersModel.instance.create(options),
  findById: (id: string) => usersModel.instance.findById(id),
  findByUsername: (username: string) => usersModel.instance.findByUsername(username),
  findByEmail: (email: string) => usersModel.instance.findByEmail(email),
  findByGitHubId: (githubId: string) => usersModel.instance.findByGitHubId(githubId),
  findByGoogleId: (googleId: string) => usersModel.instance.findByGoogleId(googleId),
  findByOAuthId: (provider: string, oauthId: string) =>
    usersModel.instance.findByOAuthId(provider, oauthId),
  authenticate: (username: string, password: string) =>
    usersModel.instance.authenticate(username, password),
  update: (id: string, options: UpdateUserOptions) => usersModel.instance.update(id, options),
  delete: (id: string) => usersModel.instance.delete(id),
  list: (filter?: ListUsersFilter) => usersModel.instance.list(filter),
  count: () => usersModel.instance.count(),
  linkGitHub: (userId: string, githubId: string) =>
    usersModel.instance.linkGitHub(userId, githubId),
  linkGoogle: (userId: string, googleId: string) =>
    usersModel.instance.linkGoogle(userId, googleId),
  linkOAuth: (userId: string, provider: string, oauthId: string) =>
    usersModel.instance.linkOAuth(userId, provider, oauthId),
};

export default usersModel;
