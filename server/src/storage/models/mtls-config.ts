/**
 * mTLS Configuration Model
 *
 * Handles CRUD operations for mtls_config table.
 * Supports mutual TLS client certificate authentication configuration.
 *
 * Related: Epic #21 (Advanced Authentication - Kerberos/mTLS)
 */

import { getDatabase } from '../database.js';
import logger from '../../logging/logger.js';
import { sanitizeString } from '../../logging/sanitizer.js';
import type Database from 'better-sqlite3';

/**
 * mTLS configuration record from database
 */
export interface MtlsConfigRecord {
  id: string;
  requireClientCert: boolean;
  caCertPath: string;
  crlPath: string | null;
  ocspUrl: string | null;
  identityField: 'CN' | 'SAN' | 'OID';
  customOid: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Options for creating mTLS configuration
 */
export interface CreateMtlsConfigOptions {
  requireClientCert?: boolean;
  caCertPath: string;
  crlPath?: string;
  ocspUrl?: string;
  identityField?: 'CN' | 'SAN' | 'OID';
  customOid?: string;
  enabled?: boolean;
}

/**
 * Options for updating mTLS configuration
 */
export interface UpdateMtlsConfigOptions {
  requireClientCert?: boolean;
  caCertPath?: string;
  crlPath?: string | null;
  ocspUrl?: string | null;
  identityField?: 'CN' | 'SAN' | 'OID';
  customOid?: string | null;
  enabled?: boolean;
}

/**
 * mTLS Configuration Model
 */
export class MtlsConfigModel {
  private db: Database.Database;

  constructor(database?: Database.Database) {
    this.db = database || getDatabase();
  }

  /**
   * Create a new mTLS configuration
   */
  create(options: CreateMtlsConfigOptions): MtlsConfigRecord {
    const id = `mtls_${Math.random().toString(36).substring(2, 18)}`;

    const stmt = this.db.prepare(`
      INSERT INTO mtls_config (id, requireClientCert, caCertPath, crlPath, ocspUrl, identityField, customOid, enabled)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      (options.requireClientCert ?? true) ? 1 : 0,
      options.caCertPath,
      options.crlPath ?? null,
      options.ocspUrl ?? null,
      options.identityField ?? 'CN',
      options.customOid ?? null,
      (options.enabled ?? true) ? 1 : 0
    );

    logger.info('Created mTLS configuration', {
      id: sanitizeString(id),
      identityField: sanitizeString(options.identityField ?? 'CN'),
    });

    const record = this.findById(id);
    if (!record) {
      throw new Error('Failed to create mTLS configuration');
    }
    return record;
  }

  /**
   * Find mTLS configuration by ID
   */
  findById(id: string): MtlsConfigRecord | null {
    const stmt = this.db.prepare(`
      SELECT id, requireClientCert, caCertPath, crlPath, ocspUrl,
             identityField, customOid, enabled, createdAt, updatedAt
      FROM mtls_config
      WHERE id = ?
    `);

    const row = stmt.get(id) as
      | (Omit<MtlsConfigRecord, 'enabled' | 'requireClientCert'> & {
          enabled: number;
          requireClientCert: number;
        })
      | undefined;
    if (!row) {
      return null;
    }

    return {
      ...row,
      enabled: row.enabled === 1,
      requireClientCert: row.requireClientCert === 1,
      identityField: row.identityField as 'CN' | 'SAN' | 'OID',
    };
  }

  /**
   * List all mTLS configurations
   */
  list(): MtlsConfigRecord[] {
    const stmt = this.db.prepare(`
      SELECT id, requireClientCert, caCertPath, crlPath, ocspUrl,
             identityField, customOid, enabled, createdAt, updatedAt
      FROM mtls_config
      ORDER BY createdAt DESC
    `);

    const rows = stmt.all() as (Omit<MtlsConfigRecord, 'enabled' | 'requireClientCert'> & {
      enabled: number;
      requireClientCert: number;
    })[];

    return rows.map((row) => ({
      ...row,
      enabled: row.enabled === 1,
      requireClientCert: row.requireClientCert === 1,
      identityField: row.identityField as 'CN' | 'SAN' | 'OID',
    }));
  }

  /**
   * Get the first enabled mTLS configuration
   */
  getEnabled(): MtlsConfigRecord | null {
    const stmt = this.db.prepare(`
      SELECT id, requireClientCert, caCertPath, crlPath, ocspUrl,
             identityField, customOid, enabled, createdAt, updatedAt
      FROM mtls_config
      WHERE enabled = 1
      ORDER BY createdAt DESC
      LIMIT 1
    `);

    const row = stmt.get() as
      | (Omit<MtlsConfigRecord, 'enabled' | 'requireClientCert'> & {
          enabled: number;
          requireClientCert: number;
        })
      | undefined;
    if (!row) {
      return null;
    }

    return {
      ...row,
      enabled: row.enabled === 1,
      requireClientCert: row.requireClientCert === 1,
      identityField: row.identityField as 'CN' | 'SAN' | 'OID',
    };
  }

  /**
   * Update mTLS configuration
   */
  update(id: string, options: UpdateMtlsConfigOptions): MtlsConfigRecord {
    const existing = this.findById(id);
    if (!existing) {
      throw new Error(`mTLS configuration not found: ${id}`);
    }

    const updates: string[] = [];
    const values: unknown[] = [];

    if (options.requireClientCert !== undefined) {
      updates.push('requireClientCert = ?');
      values.push(options.requireClientCert ? 1 : 0);
    }
    if (options.caCertPath !== undefined) {
      updates.push('caCertPath = ?');
      values.push(options.caCertPath);
    }
    if (options.crlPath !== undefined) {
      updates.push('crlPath = ?');
      values.push(options.crlPath);
    }
    if (options.ocspUrl !== undefined) {
      updates.push('ocspUrl = ?');
      values.push(options.ocspUrl);
    }
    if (options.identityField !== undefined) {
      updates.push('identityField = ?');
      values.push(options.identityField);
    }
    if (options.customOid !== undefined) {
      updates.push('customOid = ?');
      values.push(options.customOid);
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
      UPDATE mtls_config
      SET ${updates.join(', ')}
      WHERE id = ?
    `);

    stmt.run(...values);

    logger.info('Updated mTLS configuration', {
      id: sanitizeString(id),
    });

    const record = this.findById(id);
    if (!record) {
      throw new Error('Failed to update mTLS configuration');
    }
    return record;
  }

  /**
   * Delete mTLS configuration
   */
  delete(id: string): void {
    const existing = this.findById(id);
    if (!existing) {
      throw new Error(`mTLS configuration not found: ${id}`);
    }

    const stmt = this.db.prepare('DELETE FROM mtls_config WHERE id = ?');
    stmt.run(id);

    logger.info('Deleted mTLS configuration', {
      id: sanitizeString(id),
    });
  }
}

// Singleton instance
let instance: MtlsConfigModel | null = null;

export function getMtlsConfigModel(): MtlsConfigModel {
  if (!instance) {
    instance = new MtlsConfigModel();
  }
  return instance;
}
