/**
 * OAuth Providers Model
 *
 * Manages OAuth 2.0 provider configurations (GitHub, Google, custom providers).
 * Supports dynamic provider registration and field-level encryption for secrets.
 *
 * Related: Epic #18 (OAuth 2.0 Support), Epic #13 (Storage Layer)
 */

import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../database.js';
import logger from '../../logging/logger.js';
import { sanitizeString } from '../../logging/sanitizer.js';
import { FieldEncryption } from '../encryption.js';
import type Database from 'better-sqlite3';

/**
 * Supported OAuth provider types
 */
export type OAuthProviderType = 'github' | 'google' | 'generic';

/**
 * OAuth provider configuration
 */
export interface OAuthProviderConfig {
  // Authorization endpoint (generic only)
  authorizationURL?: string;
  // Token endpoint (generic only)
  tokenURL?: string;
  // User info endpoint (generic only)
  userInfoURL?: string;
  // Field mappings for generic providers
  fieldMappings?: {
    id?: string; // Path to user ID field
    email?: string; // Path to email field
    username?: string; // Path to username field
    avatar?: string; // Path to avatar URL field
  };
}

/**
 * Role mapping configuration
 */
export interface RoleMappings {
  [key: string]: string; // e.g., "my-org:admin" -> "admin"
  default: string; // Default role if no mappings match
}

/**
 * OAuth provider record from database
 */
export interface OAuthProviderRecord {
  id: string;
  name: string;
  type: OAuthProviderType;
  client_id: string;
  client_secret: string; // Encrypted
  scopes: string; // JSON array
  redirect_uri: string;
  config: string; // JSON
  role_mappings: string; // JSON
  enabled: number; // SQLite boolean
  created_at: string;
  updated_at: string;
}

/**
 * OAuth provider (public, without secrets)
 */
export interface OAuthProviderPublic {
  id: string;
  name: string;
  type: OAuthProviderType;
  scopes: string[];
  redirect_uri: string;
  config: OAuthProviderConfig;
  role_mappings: RoleMappings;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Options for creating an OAuth provider
 */
export interface CreateOAuthProviderOptions {
  name: string;
  type: OAuthProviderType;
  client_id: string;
  client_secret: string;
  scopes: string[];
  redirect_uri: string;
  config?: OAuthProviderConfig;
  role_mappings?: RoleMappings;
  enabled?: boolean;
}

/**
 * Options for updating an OAuth provider
 */
export interface UpdateOAuthProviderOptions {
  client_id?: string;
  client_secret?: string;
  scopes?: string[];
  redirect_uri?: string;
  config?: OAuthProviderConfig;
  role_mappings?: RoleMappings;
  enabled?: boolean;
}

/**
 * OAuth Providers Model
 */
export class OAuthProvidersModel {
  private db: Database.Database;
  private encryption: FieldEncryption | null = null;

  constructor(database?: Database.Database) {
    this.db = database || getDatabase();
  }

  /**
   * Initialize encryption (lazy-load encryption key)
   */
  private async ensureEncryption(): Promise<FieldEncryption> {
    if (!this.encryption) {
      const { getEncryptionKey, FieldEncryption } = await import('../encryption.js');
      const key = await getEncryptionKey();
      this.encryption = new FieldEncryption(key);
    }
    return this.encryption;
  }

  /**
   * Remove client_secret from provider record
   */
  private toPublic(provider: OAuthProviderRecord): OAuthProviderPublic {
    return {
      id: provider.id,
      name: provider.name,
      type: provider.type,
      scopes: JSON.parse(provider.scopes),
      redirect_uri: provider.redirect_uri,
      config: JSON.parse(provider.config),
      role_mappings: JSON.parse(provider.role_mappings),
      enabled: provider.enabled === 1,
      created_at: provider.created_at,
      updated_at: provider.updated_at,
    };
  }

  /**
   * Create a new OAuth provider
   *
   * @param options - Provider creation options
   * @returns Created provider (without client secret)
   * @throws {Error} If name already exists or validation fails
   */
  async create(options: CreateOAuthProviderOptions): Promise<OAuthProviderPublic> {
    const {
      name,
      type,
      client_id,
      client_secret,
      scopes,
      redirect_uri,
      config = {},
      role_mappings = { default: 'user' },
      enabled = true,
    } = options;

    try {
      // Validate provider name (lowercase, alphanumeric + hyphens)
      if (!/^[a-z0-9-]+$/.test(name)) {
        throw new Error('Provider name must be lowercase alphanumeric with hyphens');
      }

      // Check if name already exists
      const existing = this.db
        .prepare('SELECT id FROM oauth_providers WHERE name = ?')
        .get(name) as OAuthProviderRecord | undefined;

      if (existing) {
        throw new Error('Provider name already exists');
      }

      // Encrypt client secret
      const encryption = await this.ensureEncryption();
      const encryptedSecret = encryption.encrypt(client_secret);

      // Generate provider ID
      const id = uuidv4();

      // Insert provider
      const now = new Date().toISOString();
      this.db
        .prepare(
          `INSERT INTO oauth_providers
           (id, name, type, client_id, client_secret, scopes, redirect_uri, config, role_mappings, enabled, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          name,
          type,
          client_id,
          encryptedSecret,
          JSON.stringify(scopes),
          redirect_uri,
          JSON.stringify(config),
          JSON.stringify(role_mappings),
          enabled ? 1 : 0,
          now,
          now
        );

      logger.info('OAuth provider created', {
        providerId: sanitizeString(id),
        providerName: sanitizeString(name),
        type: sanitizeString(type),
      });

      // Fetch and return created provider
      const provider = this.db
        .prepare('SELECT * FROM oauth_providers WHERE id = ?')
        .get(id) as OAuthProviderRecord;

      return this.toPublic(provider);
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to create OAuth provider', {
        providerName: sanitizeString(name),
        error: sanitizeString(err.message),
      });
      throw err;
    }
  }

  /**
   * Find a provider by ID
   *
   * @param id - Provider ID
   * @returns Provider or null if not found
   */
  findById(id: string): OAuthProviderPublic | null {
    try {
      const provider = this.db.prepare('SELECT * FROM oauth_providers WHERE id = ?').get(id) as
        | OAuthProviderRecord
        | undefined;

      if (!provider) {
        return null;
      }

      return this.toPublic(provider);
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to find OAuth provider by ID', {
        providerId: sanitizeString(id),
        error: sanitizeString(err.message),
      });
      throw err;
    }
  }

  /**
   * Find a provider by name
   *
   * @param name - Provider name
   * @returns Provider or null if not found
   */
  findByName(name: string): OAuthProviderPublic | null {
    try {
      const provider = this.db.prepare('SELECT * FROM oauth_providers WHERE name = ?').get(name) as
        | OAuthProviderRecord
        | undefined;

      if (!provider) {
        return null;
      }

      return this.toPublic(provider);
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to find OAuth provider by name', {
        providerName: sanitizeString(name),
        error: sanitizeString(err.message),
      });
      throw err;
    }
  }

  /**
   * Get provider with decrypted client secret (for strategy initialization)
   *
   * @param name - Provider name
   * @returns Provider with decrypted client secret or null if not found
   */
  async getWithSecret(name: string): Promise<
    | (OAuthProviderPublic & {
        client_id: string;
        client_secret: string;
      })
    | null
  > {
    try {
      const provider = this.db.prepare('SELECT * FROM oauth_providers WHERE name = ?').get(name) as
        | OAuthProviderRecord
        | undefined;

      if (!provider) {
        return null;
      }

      // Decrypt client secret
      const encryption = await this.ensureEncryption();
      const clientSecret = encryption.decrypt(provider.client_secret);

      return {
        ...this.toPublic(provider),
        client_id: provider.client_id,
        client_secret: clientSecret,
      };
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to get OAuth provider with secret', {
        providerName: sanitizeString(name),
        error: sanitizeString(err.message),
      });
      throw err;
    }
  }

  /**
   * Update a provider
   *
   * @param id - Provider ID
   * @param options - Update options
   * @returns Updated provider
   * @throws {Error} If provider not found or update fails
   */
  async update(id: string, options: UpdateOAuthProviderOptions): Promise<OAuthProviderPublic> {
    const { client_id, client_secret, scopes, redirect_uri, config, role_mappings, enabled } =
      options;

    try {
      // Check provider exists
      const provider = this.db.prepare('SELECT * FROM oauth_providers WHERE id = ?').get(id) as
        | OAuthProviderRecord
        | undefined;

      if (!provider) {
        throw new Error('OAuth provider not found');
      }

      // Build update fields
      const updates: string[] = [];
      const values: unknown[] = [];

      if (client_id !== undefined) {
        updates.push('client_id = ?');
        values.push(client_id);
      }

      if (client_secret !== undefined) {
        const encryption = await this.ensureEncryption();
        const encryptedSecret = encryption.encrypt(client_secret);
        updates.push('client_secret = ?');
        values.push(encryptedSecret);
      }

      if (scopes !== undefined) {
        updates.push('scopes = ?');
        values.push(JSON.stringify(scopes));
      }

      if (redirect_uri !== undefined) {
        updates.push('redirect_uri = ?');
        values.push(redirect_uri);
      }

      if (config !== undefined) {
        updates.push('config = ?');
        values.push(JSON.stringify(config));
      }

      if (role_mappings !== undefined) {
        updates.push('role_mappings = ?');
        values.push(JSON.stringify(role_mappings));
      }

      if (enabled !== undefined) {
        updates.push('enabled = ?');
        values.push(enabled ? 1 : 0);
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
      const sql = `UPDATE oauth_providers SET ${updates.join(', ')} WHERE id = ?`;
      this.db.prepare(sql).run(...values);

      logger.info('OAuth provider updated', {
        providerId: sanitizeString(id),
        fields: updates.map((u) => u.split(' = ')[0]).join(', '),
      });

      // Fetch and return updated provider
      const updated = this.db
        .prepare('SELECT * FROM oauth_providers WHERE id = ?')
        .get(id) as OAuthProviderRecord;

      return this.toPublic(updated);
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to update OAuth provider', {
        providerId: sanitizeString(id),
        error: sanitizeString(err.message),
      });
      throw err;
    }
  }

  /**
   * Delete a provider
   *
   * @param id - Provider ID
   * @throws {Error} If provider not found or delete fails
   */
  delete(id: string): void {
    try {
      const result = this.db.prepare('DELETE FROM oauth_providers WHERE id = ?').run(id);

      if (result.changes === 0) {
        throw new Error('OAuth provider not found');
      }

      logger.info('OAuth provider deleted', {
        providerId: sanitizeString(id),
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to delete OAuth provider', {
        providerId: sanitizeString(id),
        error: sanitizeString(err.message),
      });
      throw err;
    }
  }

  /**
   * List all providers
   *
   * @param enabledOnly - Only return enabled providers
   * @returns List of providers
   */
  list(enabledOnly = false): OAuthProviderPublic[] {
    try {
      let sql = 'SELECT * FROM oauth_providers WHERE 1=1';

      if (enabledOnly) {
        sql += ' AND enabled = 1';
      }

      sql += ' ORDER BY created_at DESC';

      const providers = this.db.prepare(sql).all() as OAuthProviderRecord[];

      return providers.map((p) => this.toPublic(p));
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to list OAuth providers', {
        error: sanitizeString(err.message),
      });
      throw err;
    }
  }

  /**
   * Count total providers
   *
   * @returns Total provider count
   */
  count(): number {
    try {
      const result = this.db.prepare('SELECT COUNT(*) as count FROM oauth_providers').get() as {
        count: number;
      };
      return result.count;
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to count OAuth providers', {
        error: sanitizeString(err.message),
      });
      throw err;
    }
  }
}

// Lazy singleton instance
let _oauthProvidersModelInstance: OAuthProvidersModel | null = null;

export const oauthProvidersModel = {
  get instance(): OAuthProvidersModel {
    if (!_oauthProvidersModelInstance) {
      _oauthProvidersModelInstance = new OAuthProvidersModel();
    }
    return _oauthProvidersModelInstance;
  },
  // Proxy all methods
  create: (options: CreateOAuthProviderOptions) => oauthProvidersModel.instance.create(options),
  findById: (id: string) => oauthProvidersModel.instance.findById(id),
  findByName: (name: string) => oauthProvidersModel.instance.findByName(name),
  getWithSecret: (name: string) => oauthProvidersModel.instance.getWithSecret(name),
  update: (id: string, options: UpdateOAuthProviderOptions) =>
    oauthProvidersModel.instance.update(id, options),
  delete: (id: string) => oauthProvidersModel.instance.delete(id),
  list: (enabledOnly = false) => oauthProvidersModel.instance.list(enabledOnly),
  count: () => oauthProvidersModel.instance.count(),
};

export default oauthProvidersModel;
