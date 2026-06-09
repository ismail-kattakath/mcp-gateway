/**
 * LDAP Providers Model
 *
 * Manages LDAP/Active Directory provider configurations.
 * Supports dynamic provider registration.
 *
 * Related: Epic #20 (LDAP/AD Integration), Epic #13 (Storage Layer)
 */

import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../database.js';
import logger from '../../logging/logger.js';
import { sanitizeString } from '../../logging/sanitizer.js';
import type Database from 'better-sqlite3';

/**
 * LDAP attribute mapping (LDAP attributes -> user fields)
 */
export interface LDAPAttributeMapping {
  username?: string; // LDAP attribute for username
  email?: string; // LDAP attribute for email
  fullName?: string; // LDAP attribute for full name
  firstName?: string; // LDAP attribute for first name
  lastName?: string; // LDAP attribute for last name
  groups?: string; // LDAP attribute for groups
}

/**
 * Role mapping configuration (LDAP groups -> RBAC roles)
 */
export interface GroupMapping {
  [key: string]: string; // e.g., "CN=Admins,OU=Groups,DC=corp,DC=com" -> "admin"
  default: string; // Default role if no mappings match
}

/**
 * LDAP provider record from database
 */
export interface LDAPProviderRecord {
  id: string;
  name: string;
  url: string;
  bind_dn: string | null;
  bind_password: string | null;
  base_dn: string;
  search_filter: string;
  attribute_mapping: string; // JSON
  group_mapping: string; // JSON
  tls_enabled: number; // SQLite boolean
  tls_reject_unauthorized: number; // SQLite boolean
  pool_size: number;
  timeout: number;
  enabled: number; // SQLite boolean
  created_at: string;
  updated_at: string;
}

/**
 * LDAP provider (public, parsed JSON)
 */
export interface LDAPProviderPublic {
  id: string;
  name: string;
  url: string;
  bind_dn: string | null;
  bind_password: string | null;
  base_dn: string;
  search_filter: string;
  attribute_mapping: LDAPAttributeMapping;
  group_mapping: GroupMapping;
  tls_enabled: boolean;
  tls_reject_unauthorized: boolean;
  pool_size: number;
  timeout: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Options for creating an LDAP provider
 */
export interface CreateLDAPProviderOptions {
  name: string;
  url: string;
  bind_dn?: string | null;
  bind_password?: string | null;
  base_dn: string;
  search_filter?: string;
  attribute_mapping?: LDAPAttributeMapping;
  group_mapping?: GroupMapping;
  tls_enabled?: boolean;
  tls_reject_unauthorized?: boolean;
  pool_size?: number;
  timeout?: number;
  enabled?: boolean;
}

/**
 * Options for updating an LDAP provider
 */
export interface UpdateLDAPProviderOptions {
  url?: string;
  bind_dn?: string | null;
  bind_password?: string | null;
  base_dn?: string;
  search_filter?: string;
  attribute_mapping?: LDAPAttributeMapping;
  group_mapping?: GroupMapping;
  tls_enabled?: boolean;
  tls_reject_unauthorized?: boolean;
  pool_size?: number;
  timeout?: number;
  enabled?: boolean;
}

/**
 * LDAP Providers Model
 */
export class LDAPProvidersModel {
  private db: Database.Database;

  constructor(database?: Database.Database) {
    this.db = database || getDatabase();
  }

  /**
   * Convert database record to public format
   */
  private toPublic(provider: LDAPProviderRecord): LDAPProviderPublic {
    return {
      id: provider.id,
      name: provider.name,
      url: provider.url,
      bind_dn: provider.bind_dn,
      bind_password: provider.bind_password,
      base_dn: provider.base_dn,
      search_filter: provider.search_filter,
      attribute_mapping: JSON.parse(provider.attribute_mapping),
      group_mapping: JSON.parse(provider.group_mapping),
      tls_enabled: provider.tls_enabled === 1,
      tls_reject_unauthorized: provider.tls_reject_unauthorized === 1,
      pool_size: provider.pool_size,
      timeout: provider.timeout,
      enabled: provider.enabled === 1,
      created_at: provider.created_at,
      updated_at: provider.updated_at,
    };
  }

  /**
   * Create a new LDAP provider
   *
   * @param options - Provider creation options
   * @returns Created provider
   * @throws {Error} If name already exists or validation fails
   */
  async create(options: CreateLDAPProviderOptions): Promise<LDAPProviderPublic> {
    const {
      name,
      url,
      bind_dn = null,
      bind_password = null,
      base_dn,
      search_filter = '(uid={{username}})',
      attribute_mapping = {},
      group_mapping = { default: 'user' },
      tls_enabled = true,
      tls_reject_unauthorized = true,
      pool_size = 5,
      timeout = 10000,
      enabled = true,
    } = options;

    try {
      // Check if provider name already exists
      const existing = this.db.prepare('SELECT id FROM ldap_providers WHERE name = ?').get(name) as
        | LDAPProviderRecord
        | undefined;

      if (existing) {
        throw new Error('LDAP provider name already exists');
      }

      // Validate URL format
      if (!url.startsWith('ldap://') && !url.startsWith('ldaps://')) {
        throw new Error('Invalid LDAP URL format (must start with ldap:// or ldaps://)');
      }

      // Generate provider ID
      const id = uuidv4();
      const now = new Date().toISOString();

      // Insert provider
      this.db
        .prepare(
          `INSERT INTO ldap_providers
           (id, name, url, bind_dn, bind_password, base_dn, search_filter,
            attribute_mapping, group_mapping, tls_enabled, tls_reject_unauthorized,
            pool_size, timeout, enabled, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          name,
          url,
          bind_dn,
          bind_password,
          base_dn,
          search_filter,
          JSON.stringify(attribute_mapping),
          JSON.stringify(group_mapping),
          tls_enabled ? 1 : 0,
          tls_reject_unauthorized ? 1 : 0,
          pool_size,
          timeout,
          enabled ? 1 : 0,
          now,
          now
        );

      logger.info('LDAP provider created', {
        providerId: sanitizeString(id),
        providerName: sanitizeString(name),
        url: sanitizeString(url),
      });

      // Fetch created provider
      const provider = this.findById(id);

      if (!provider) {
        throw new Error('Failed to fetch created LDAP provider');
      }

      return provider;
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to create LDAP provider', {
        name: sanitizeString(name),
        error: sanitizeString(err.message),
      });
      throw new Error(`LDAP provider creation failed: ${err.message}`);
    }
  }

  /**
   * Find LDAP provider by ID
   */
  findById(id: string): LDAPProviderPublic | null {
    const provider = this.db.prepare('SELECT * FROM ldap_providers WHERE id = ?').get(id) as
      | LDAPProviderRecord
      | undefined;

    return provider ? this.toPublic(provider) : null;
  }

  /**
   * Find LDAP provider by name
   */
  findByName(name: string): LDAPProviderPublic | null {
    const provider = this.db.prepare('SELECT * FROM ldap_providers WHERE name = ?').get(name) as
      | LDAPProviderRecord
      | undefined;

    return provider ? this.toPublic(provider) : null;
  }

  /**
   * List all LDAP providers
   *
   * @param options - Filter options
   */
  list(options: { enabled?: boolean } = {}): LDAPProviderPublic[] {
    let query = 'SELECT * FROM ldap_providers WHERE 1=1';
    const params: (string | number)[] = [];

    if (options.enabled !== undefined) {
      query += ' AND enabled = ?';
      params.push(options.enabled ? 1 : 0);
    }

    query += ' ORDER BY name ASC';

    const providers = this.db.prepare(query).all(...params) as LDAPProviderRecord[];

    return providers.map((p) => this.toPublic(p));
  }

  /**
   * Update LDAP provider
   *
   * @param id - Provider ID
   * @param updates - Fields to update
   * @returns Updated provider
   * @throws {Error} If provider not found
   */
  async update(id: string, updates: UpdateLDAPProviderOptions): Promise<LDAPProviderPublic> {
    try {
      // Check if provider exists
      const existing = this.findById(id);

      if (!existing) {
        throw new Error('LDAP provider not found');
      }

      // Build update query dynamically
      const fields: string[] = [];
      const values: (string | number | null)[] = [];

      if (updates.url !== undefined) {
        if (!updates.url.startsWith('ldap://') && !updates.url.startsWith('ldaps://')) {
          throw new Error('Invalid LDAP URL format (must start with ldap:// or ldaps://)');
        }
        fields.push('url = ?');
        values.push(updates.url);
      }

      if (updates.bind_dn !== undefined) {
        fields.push('bind_dn = ?');
        values.push(updates.bind_dn);
      }

      if (updates.bind_password !== undefined) {
        fields.push('bind_password = ?');
        values.push(updates.bind_password);
      }

      if (updates.base_dn !== undefined) {
        fields.push('base_dn = ?');
        values.push(updates.base_dn);
      }

      if (updates.search_filter !== undefined) {
        fields.push('search_filter = ?');
        values.push(updates.search_filter);
      }

      if (updates.attribute_mapping !== undefined) {
        fields.push('attribute_mapping = ?');
        values.push(JSON.stringify(updates.attribute_mapping));
      }

      if (updates.group_mapping !== undefined) {
        fields.push('group_mapping = ?');
        values.push(JSON.stringify(updates.group_mapping));
      }

      if (updates.tls_enabled !== undefined) {
        fields.push('tls_enabled = ?');
        values.push(updates.tls_enabled ? 1 : 0);
      }

      if (updates.tls_reject_unauthorized !== undefined) {
        fields.push('tls_reject_unauthorized = ?');
        values.push(updates.tls_reject_unauthorized ? 1 : 0);
      }

      if (updates.pool_size !== undefined) {
        fields.push('pool_size = ?');
        values.push(updates.pool_size);
      }

      if (updates.timeout !== undefined) {
        fields.push('timeout = ?');
        values.push(updates.timeout);
      }

      if (updates.enabled !== undefined) {
        fields.push('enabled = ?');
        values.push(updates.enabled ? 1 : 0);
      }

      // Always update updated_at
      fields.push('updated_at = ?');
      values.push(new Date().toISOString());

      // Add ID to params
      values.push(id);

      // Execute update
      this.db.prepare(`UPDATE ldap_providers SET ${fields.join(', ')} WHERE id = ?`).run(...values);

      logger.info('LDAP provider updated', {
        providerId: sanitizeString(id),
        providerName: sanitizeString(existing.name),
      });

      // Fetch updated provider
      const updated = this.findById(id);

      if (!updated) {
        throw new Error('Failed to fetch updated LDAP provider');
      }

      return updated;
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to update LDAP provider', {
        providerId: sanitizeString(id),
        error: sanitizeString(err.message),
      });
      throw new Error(`LDAP provider update failed: ${err.message}`);
    }
  }

  /**
   * Delete LDAP provider
   *
   * @param id - Provider ID
   * @throws {Error} If provider not found
   */
  async delete(id: string): Promise<void> {
    try {
      // Check if provider exists
      const existing = this.findById(id);

      if (!existing) {
        throw new Error('LDAP provider not found');
      }

      // Delete provider
      const result = this.db.prepare('DELETE FROM ldap_providers WHERE id = ?').run(id);

      if (result.changes === 0) {
        throw new Error('No changes made');
      }

      logger.info('LDAP provider deleted', {
        providerId: sanitizeString(id),
        providerName: sanitizeString(existing.name),
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to delete LDAP provider', {
        providerId: sanitizeString(id),
        error: sanitizeString(err.message),
      });
      throw new Error(`LDAP provider deletion failed: ${err.message}`);
    }
  }
}

// Lazy singleton — instantiate on first access so module import does not
// require an initialized database (important for test isolation).
let _ldapProvidersModel: LDAPProvidersModel | null = null;

export const ldapProvidersModel = new Proxy({} as LDAPProvidersModel, {
  get(_target, prop) {
    if (!_ldapProvidersModel) {
      _ldapProvidersModel = new LDAPProvidersModel();
    }
    return (_ldapProvidersModel as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export default ldapProvidersModel;
