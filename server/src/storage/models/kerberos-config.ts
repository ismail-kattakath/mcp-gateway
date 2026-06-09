/**
 * Kerberos Configuration Model
 *
 * Handles CRUD operations for kerberos_config table.
 * Supports Kerberos/SPNEGO authentication configuration.
 *
 * Related: Epic #21 (Advanced Authentication - Kerberos/mTLS)
 */

import { getDatabase } from '../database.js';
import logger from '../../logging/logger.js';
import { sanitizeString } from '../../logging/sanitizer.js';
import type Database from 'better-sqlite3';

/**
 * Kerberos configuration record from database
 */
export interface KerberosConfigRecord {
  id: string;
  servicePrincipal: string;
  keytabPath: string;
  realm: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Options for creating Kerberos configuration
 */
export interface CreateKerberosConfigOptions {
  servicePrincipal: string;
  keytabPath: string;
  realm: string;
  enabled?: boolean;
}

/**
 * Options for updating Kerberos configuration
 */
export interface UpdateKerberosConfigOptions {
  servicePrincipal?: string;
  keytabPath?: string;
  realm?: string;
  enabled?: boolean;
}

/**
 * Kerberos Configuration Model
 */
export class KerberosConfigModel {
  private db: Database.Database;

  constructor(database?: Database.Database) {
    this.db = database || getDatabase();
  }

  /**
   * Create a new Kerberos configuration
   */
  create(options: CreateKerberosConfigOptions): KerberosConfigRecord {
    const id = `krb_${Math.random().toString(36).substring(2, 18)}`;

    const stmt = this.db.prepare(`
      INSERT INTO kerberos_config (id, servicePrincipal, keytabPath, realm, enabled)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      options.servicePrincipal,
      options.keytabPath,
      options.realm,
      (options.enabled ?? true) ? 1 : 0
    );

    logger.info('Created Kerberos configuration', {
      id: sanitizeString(id),
      realm: sanitizeString(options.realm),
    });

    const record = this.findById(id);
    if (!record) {
      throw new Error('Failed to create Kerberos configuration');
    }
    return record;
  }

  /**
   * Find Kerberos configuration by ID
   */
  findById(id: string): KerberosConfigRecord | null {
    const stmt = this.db.prepare(`
      SELECT id, servicePrincipal, keytabPath, realm, enabled,
             createdAt, updatedAt
      FROM kerberos_config
      WHERE id = ?
    `);

    const row = stmt.get(id) as
      | (Omit<KerberosConfigRecord, 'enabled'> & { enabled: number })
      | undefined;
    if (!row) {
      return null;
    }

    return {
      ...row,
      enabled: row.enabled === 1,
    };
  }

  /**
   * List all Kerberos configurations
   */
  list(): KerberosConfigRecord[] {
    const stmt = this.db.prepare(`
      SELECT id, servicePrincipal, keytabPath, realm, enabled,
             createdAt, updatedAt
      FROM kerberos_config
      ORDER BY createdAt DESC
    `);

    const rows = stmt.all() as (Omit<KerberosConfigRecord, 'enabled'> & {
      enabled: number;
    })[];

    return rows.map((row) => ({
      ...row,
      enabled: row.enabled === 1,
    }));
  }

  /**
   * Get the first enabled Kerberos configuration
   */
  getEnabled(): KerberosConfigRecord | null {
    const stmt = this.db.prepare(`
      SELECT id, servicePrincipal, keytabPath, realm, enabled,
             createdAt, updatedAt
      FROM kerberos_config
      WHERE enabled = 1
      ORDER BY createdAt DESC
      LIMIT 1
    `);

    const row = stmt.get() as
      | (Omit<KerberosConfigRecord, 'enabled'> & { enabled: number })
      | undefined;
    if (!row) {
      return null;
    }

    return {
      ...row,
      enabled: row.enabled === 1,
    };
  }

  /**
   * Update Kerberos configuration
   */
  update(id: string, options: UpdateKerberosConfigOptions): KerberosConfigRecord {
    const existing = this.findById(id);
    if (!existing) {
      throw new Error(`Kerberos configuration not found: ${id}`);
    }

    const updates: string[] = [];
    const values: unknown[] = [];

    if (options.servicePrincipal !== undefined) {
      updates.push('servicePrincipal = ?');
      values.push(options.servicePrincipal);
    }
    if (options.keytabPath !== undefined) {
      updates.push('keytabPath = ?');
      values.push(options.keytabPath);
    }
    if (options.realm !== undefined) {
      updates.push('realm = ?');
      values.push(options.realm);
    }
    if (options.enabled !== undefined) {
      updates.push('enabled = ?');
      values.push(options.enabled ? 1 : 0);
    }

    if (updates.length === 0) {
      return existing;
    }

    updates.push('updatedAt = datetime("now")');
    values.push(id);

    const stmt = this.db.prepare(`
      UPDATE kerberos_config
      SET ${updates.join(', ')}
      WHERE id = ?
    `);

    stmt.run(...values);

    logger.info('Updated Kerberos configuration', {
      id: sanitizeString(id),
    });

    const record = this.findById(id);
    if (!record) {
      throw new Error('Failed to update Kerberos configuration');
    }
    return record;
  }

  /**
   * Delete Kerberos configuration
   */
  delete(id: string): void {
    const existing = this.findById(id);
    if (!existing) {
      throw new Error(`Kerberos configuration not found: ${id}`);
    }

    const stmt = this.db.prepare('DELETE FROM kerberos_config WHERE id = ?');
    stmt.run(id);

    logger.info('Deleted Kerberos configuration', {
      id: sanitizeString(id),
    });
  }
}

// Singleton instance
let instance: KerberosConfigModel | null = null;

export function getKerberosConfigModel(): KerberosConfigModel {
  if (!instance) {
    instance = new KerberosConfigModel();
  }
  return instance;
}
