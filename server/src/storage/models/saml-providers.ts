/**
 * SAML Providers Model
 *
 * Manages SAML 2.0 provider configurations (Okta, Azure AD, generic IdPs).
 * Supports dynamic provider registration.
 *
 * Related: Epic #19 (SAML SSO), Epic #13 (Storage Layer)
 */

import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../database.js';
import logger from '../../logging/logger.js';
import { sanitizeString } from '../../logging/sanitizer.js';
import type Database from 'better-sqlite3';

/**
 * Supported SAML provider types
 */
export type SAMLProviderType = 'okta' | 'azure' | 'generic';

/**
 * SAML attribute mapping (SAML claims -> user fields)
 */
export interface SAMLAttributeMap {
  email?: string; // SAML attribute name for email
  firstName?: string; // SAML attribute name for first name
  lastName?: string; // SAML attribute name for last name
  username?: string; // SAML attribute name for username
  groups?: string; // SAML attribute name for groups
}

/**
 * Role mapping configuration (SAML groups -> RBAC roles)
 */
export interface RoleMappings {
  [key: string]: string; // e.g., "Administrators" -> "admin"
  default: string; // Default role if no mappings match
}

/**
 * SAML provider record from database
 */
export interface SAMLProviderRecord {
  id: string;
  name: string;
  type: SAMLProviderType;
  entity_id: string;
  sso_url: string;
  slo_url: string | null;
  certificate: string;
  sp_entity_id: string;
  acs_url: string;
  want_assertions_signed: number; // SQLite boolean
  want_response_signed: number; // SQLite boolean
  force_authn: number; // SQLite boolean
  attribute_map: string; // JSON
  role_mappings: string; // JSON
  metadata_url: string | null;
  metadata_updated_at: string | null;
  enabled: number; // SQLite boolean
  created_at: string;
  updated_at: string;
}

/**
 * SAML provider (public, parsed JSON)
 */
export interface SAMLProviderPublic {
  id: string;
  name: string;
  type: SAMLProviderType;
  entity_id: string;
  sso_url: string;
  slo_url: string | null;
  certificate: string;
  sp_entity_id: string;
  acs_url: string;
  want_assertions_signed: boolean;
  want_response_signed: boolean;
  force_authn: boolean;
  attribute_map: SAMLAttributeMap;
  role_mappings: RoleMappings;
  metadata_url: string | null;
  metadata_updated_at: string | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Options for creating a SAML provider
 */
export interface CreateSAMLProviderOptions {
  name: string;
  type: SAMLProviderType;
  entity_id: string;
  sso_url: string;
  slo_url?: string | null;
  certificate: string;
  sp_entity_id: string;
  acs_url: string;
  want_assertions_signed?: boolean;
  want_response_signed?: boolean;
  force_authn?: boolean;
  attribute_map?: SAMLAttributeMap;
  role_mappings?: RoleMappings;
  metadata_url?: string | null;
  enabled?: boolean;
}

/**
 * Options for updating a SAML provider
 */
export interface UpdateSAMLProviderOptions {
  entity_id?: string;
  sso_url?: string;
  slo_url?: string | null;
  certificate?: string;
  sp_entity_id?: string;
  acs_url?: string;
  want_assertions_signed?: boolean;
  want_response_signed?: boolean;
  force_authn?: boolean;
  attribute_map?: SAMLAttributeMap;
  role_mappings?: RoleMappings;
  metadata_url?: string | null;
  enabled?: boolean;
}

/**
 * SAML Providers Model
 */
export class SAMLProvidersModel {
  private db: Database.Database;

  constructor(database?: Database.Database) {
    this.db = database || getDatabase();
  }

  /**
   * Convert database record to public format
   */
  private toPublic(provider: SAMLProviderRecord): SAMLProviderPublic {
    return {
      id: provider.id,
      name: provider.name,
      type: provider.type,
      entity_id: provider.entity_id,
      sso_url: provider.sso_url,
      slo_url: provider.slo_url,
      certificate: provider.certificate,
      sp_entity_id: provider.sp_entity_id,
      acs_url: provider.acs_url,
      want_assertions_signed: provider.want_assertions_signed === 1,
      want_response_signed: provider.want_response_signed === 1,
      force_authn: provider.force_authn === 1,
      attribute_map: JSON.parse(provider.attribute_map),
      role_mappings: JSON.parse(provider.role_mappings),
      metadata_url: provider.metadata_url,
      metadata_updated_at: provider.metadata_updated_at,
      enabled: provider.enabled === 1,
      created_at: provider.created_at,
      updated_at: provider.updated_at,
    };
  }

  /**
   * Create a new SAML provider
   *
   * @param options - Provider creation options
   * @returns Created provider
   * @throws {Error} If name already exists or validation fails
   */
  async create(options: CreateSAMLProviderOptions): Promise<SAMLProviderPublic> {
    const {
      name,
      type,
      entity_id,
      sso_url,
      slo_url = null,
      certificate,
      sp_entity_id,
      acs_url,
      want_assertions_signed = true,
      want_response_signed = true,
      force_authn = false,
      attribute_map = {},
      role_mappings = { default: 'user' },
      metadata_url = null,
      enabled = true,
    } = options;

    try {
      // Check if provider name already exists
      const existing = this.db.prepare('SELECT id FROM saml_providers WHERE name = ?').get(name) as
        | SAMLProviderRecord
        | undefined;

      if (existing) {
        throw new Error('SAML provider name already exists');
      }

      // Validate provider type
      if (!['okta', 'azure', 'generic'].includes(type)) {
        throw new Error('Invalid SAML provider type');
      }

      // Generate provider ID
      const id = uuidv4();
      const now = new Date().toISOString();

      // Insert provider
      this.db
        .prepare(
          `INSERT INTO saml_providers
           (id, name, type, entity_id, sso_url, slo_url, certificate, sp_entity_id, acs_url,
            want_assertions_signed, want_response_signed, force_authn,
            attribute_map, role_mappings, metadata_url, enabled, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          name,
          type,
          entity_id,
          sso_url,
          slo_url,
          certificate,
          sp_entity_id,
          acs_url,
          want_assertions_signed ? 1 : 0,
          want_response_signed ? 1 : 0,
          force_authn ? 1 : 0,
          JSON.stringify(attribute_map),
          JSON.stringify(role_mappings),
          metadata_url,
          enabled ? 1 : 0,
          now,
          now
        );

      logger.info('SAML provider created', {
        providerId: sanitizeString(id),
        providerName: sanitizeString(name),
        type: sanitizeString(type),
      });

      // Fetch created provider
      const provider = this.findById(id);

      if (!provider) {
        throw new Error('Failed to fetch created SAML provider');
      }

      return provider;
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to create SAML provider', {
        name: sanitizeString(name),
        error: sanitizeString(err.message),
      });
      throw new Error(`SAML provider creation failed: ${err.message}`);
    }
  }

  /**
   * Find SAML provider by ID
   */
  findById(id: string): SAMLProviderPublic | null {
    const provider = this.db.prepare('SELECT * FROM saml_providers WHERE id = ?').get(id) as
      | SAMLProviderRecord
      | undefined;

    return provider ? this.toPublic(provider) : null;
  }

  /**
   * Find SAML provider by name
   */
  findByName(name: string): SAMLProviderPublic | null {
    const provider = this.db.prepare('SELECT * FROM saml_providers WHERE name = ?').get(name) as
      | SAMLProviderRecord
      | undefined;

    return provider ? this.toPublic(provider) : null;
  }

  /**
   * List all SAML providers
   *
   * @param options - Filter options
   */
  list(options: { enabled?: boolean } = {}): SAMLProviderPublic[] {
    let query = 'SELECT * FROM saml_providers WHERE 1=1';
    const params: (string | number)[] = [];

    if (options.enabled !== undefined) {
      query += ' AND enabled = ?';
      params.push(options.enabled ? 1 : 0);
    }

    query += ' ORDER BY name ASC';

    const providers = this.db.prepare(query).all(...params) as SAMLProviderRecord[];

    return providers.map((p) => this.toPublic(p));
  }

  /**
   * Update SAML provider
   *
   * @param id - Provider ID
   * @param updates - Fields to update
   * @returns Updated provider
   * @throws {Error} If provider not found
   */
  async update(id: string, updates: UpdateSAMLProviderOptions): Promise<SAMLProviderPublic> {
    try {
      // Check if provider exists
      const existing = this.findById(id);

      if (!existing) {
        throw new Error('SAML provider not found');
      }

      // Build update query dynamically
      const fields: string[] = [];
      const values: (string | number | null)[] = [];

      if (updates.entity_id !== undefined) {
        fields.push('entity_id = ?');
        values.push(updates.entity_id);
      }

      if (updates.sso_url !== undefined) {
        fields.push('sso_url = ?');
        values.push(updates.sso_url);
      }

      if (updates.slo_url !== undefined) {
        fields.push('slo_url = ?');
        values.push(updates.slo_url);
      }

      if (updates.certificate !== undefined) {
        fields.push('certificate = ?');
        values.push(updates.certificate);
      }

      if (updates.sp_entity_id !== undefined) {
        fields.push('sp_entity_id = ?');
        values.push(updates.sp_entity_id);
      }

      if (updates.acs_url !== undefined) {
        fields.push('acs_url = ?');
        values.push(updates.acs_url);
      }

      if (updates.want_assertions_signed !== undefined) {
        fields.push('want_assertions_signed = ?');
        values.push(updates.want_assertions_signed ? 1 : 0);
      }

      if (updates.want_response_signed !== undefined) {
        fields.push('want_response_signed = ?');
        values.push(updates.want_response_signed ? 1 : 0);
      }

      if (updates.force_authn !== undefined) {
        fields.push('force_authn = ?');
        values.push(updates.force_authn ? 1 : 0);
      }

      if (updates.attribute_map !== undefined) {
        fields.push('attribute_map = ?');
        values.push(JSON.stringify(updates.attribute_map));
      }

      if (updates.role_mappings !== undefined) {
        fields.push('role_mappings = ?');
        values.push(JSON.stringify(updates.role_mappings));
      }

      if (updates.metadata_url !== undefined) {
        fields.push('metadata_url = ?');
        values.push(updates.metadata_url);
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
      this.db.prepare(`UPDATE saml_providers SET ${fields.join(', ')} WHERE id = ?`).run(...values);

      logger.info('SAML provider updated', {
        providerId: sanitizeString(id),
        providerName: sanitizeString(existing.name),
      });

      // Fetch updated provider
      const updated = this.findById(id);

      if (!updated) {
        throw new Error('Failed to fetch updated SAML provider');
      }

      return updated;
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to update SAML provider', {
        providerId: sanitizeString(id),
        error: sanitizeString(err.message),
      });
      throw new Error(`SAML provider update failed: ${err.message}`);
    }
  }

  /**
   * Delete SAML provider
   *
   * @param id - Provider ID
   * @throws {Error} If provider not found
   */
  async delete(id: string): Promise<void> {
    try {
      // Check if provider exists
      const existing = this.findById(id);

      if (!existing) {
        throw new Error('SAML provider not found');
      }

      // Delete provider
      const result = this.db.prepare('DELETE FROM saml_providers WHERE id = ?').run(id);

      if (result.changes === 0) {
        throw new Error('No changes made');
      }

      logger.info('SAML provider deleted', {
        providerId: sanitizeString(id),
        providerName: sanitizeString(existing.name),
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to delete SAML provider', {
        providerId: sanitizeString(id),
        error: sanitizeString(err.message),
      });
      throw new Error(`SAML provider deletion failed: ${err.message}`);
    }
  }

  /**
   * Update metadata refresh timestamp
   */
  updateMetadataTimestamp(id: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare('UPDATE saml_providers SET metadata_updated_at = ?, updated_at = ? WHERE id = ?')
      .run(now, now, id);
  }
}

// Lazy singleton — instantiate on first access so module import does not
// require an initialized database (important for test isolation).
let _samlProvidersModel: SAMLProvidersModel | null = null;

export const samlProvidersModel = new Proxy({} as SAMLProvidersModel, {
  get(_target, prop) {
    if (!_samlProvidersModel) {
      _samlProvidersModel = new SAMLProvidersModel();
    }
    return (_samlProvidersModel as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export default samlProvidersModel;
