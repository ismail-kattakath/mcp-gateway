/**
 * Server Model - CRUD operations for servers table
 *
 * Type-safe query wrapper for server management.
 * Related: Epic #13, Issue #44
 */

import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../database.js';
import {
  getEncryptionKey,
  FieldEncryption,
  encryptServerConfig,
  decryptServerConfig,
} from '../encryption.js';
import logger from '../../logging/logger.js';
import { sanitizeServerName, sanitizeString } from '../../logging/sanitizer.js';
import type { Server } from '../../types/registry.js';

/**
 * Server record in database
 */
export interface ServerRecord {
  id: string;
  name: string;
  source: 'pkg' | 'git' | 'container' | 'remote' | 'local';
  config: string; // JSON
  lifecycle: 'on-demand' | 'persistent';
  enabled: number; // 0 or 1
  tenant: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

/**
 * Server with decrypted config
 */
export interface ServerWithConfig extends Omit<ServerRecord, 'config'> {
  config: Server;
}

/**
 * Create server options
 */
export interface CreateServerOptions {
  name: string;
  source: 'pkg' | 'git' | 'container' | 'remote' | 'local';
  config: Server;
  lifecycle?: 'on-demand' | 'persistent';
  enabled?: boolean;
  tenant?: string | null;
  created_by?: string | null;
}

/**
 * Update server options
 */
export interface UpdateServerOptions {
  source?: 'pkg' | 'git' | 'container' | 'remote' | 'local';
  config?: Server;
  lifecycle?: 'on-demand' | 'persistent';
  enabled?: boolean;
  tenant?: string | null;
}

/**
 * List servers filter options
 */
export interface ListServersFilter {
  source?: 'pkg' | 'git' | 'container' | 'remote' | 'local';
  lifecycle?: 'on-demand' | 'persistent';
  enabled?: boolean;
  tenant?: string | null;
}

/**
 * Server model class
 */
export class ServerModel {
  private encryptor: FieldEncryption | null = null;

  /**
   * Initialize encryption
   */
  private async initEncryption(): Promise<void> {
    if (!this.encryptor) {
      const key = await getEncryptionKey();
      this.encryptor = new FieldEncryption(key);
    }
  }

  /**
   * Create a new server
   */
  async create(options: CreateServerOptions): Promise<ServerWithConfig> {
    await this.initEncryption();

    const id = uuidv4();
    const now = new Date().toISOString();

    logger.info(`Creating server: ${sanitizeServerName(options.name)}`);

    // Encrypt sensitive fields in config
    const encryptedConfig = encryptServerConfig(
      options.config as unknown as Record<string, unknown>,
      this.encryptor!
    );
    const configJson = JSON.stringify(encryptedConfig);

    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO servers (id, name, source, config, lifecycle, enabled, tenant, created_at, updated_at, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    try {
      stmt.run(
        id,
        options.name,
        options.source,
        configJson,
        options.lifecycle || 'on-demand',
        options.enabled !== false ? 1 : 0,
        options.tenant || null,
        now,
        now,
        options.created_by || null
      );

      logger.info(`Server created successfully: ${sanitizeServerName(options.name)}`, { id });

      return {
        id,
        name: options.name,
        source: options.source,
        config: options.config,
        lifecycle: options.lifecycle || 'on-demand',
        enabled: options.enabled !== false ? 1 : 0,
        tenant: options.tenant || null,
        created_at: now,
        updated_at: now,
        created_by: options.created_by || null,
      };
    } catch (error) {
      const err = error as Error;
      logger.error(`Failed to create server: ${sanitizeServerName(options.name)}`, {
        error: sanitizeString(err.message),
      });
      throw new Error(`Failed to create server: ${err.message}`);
    }
  }

  /**
   * Get server by name
   */
  async getByName(name: string, tenant?: string | null): Promise<ServerWithConfig | null> {
    await this.initEncryption();

    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT * FROM servers WHERE name = ? AND (tenant = ? OR (tenant IS NULL AND ? IS NULL))
    `);

    const record = stmt.get(name, tenant || null, tenant || null) as ServerRecord | undefined;

    if (!record) {
      return null;
    }

    return this.decryptRecord(record);
  }

  /**
   * Get server by ID
   */
  async getById(id: string): Promise<ServerWithConfig | null> {
    await this.initEncryption();

    const db = getDatabase();
    const stmt = db.prepare(`SELECT * FROM servers WHERE id = ?`);

    const record = stmt.get(id) as ServerRecord | undefined;

    if (!record) {
      return null;
    }

    return this.decryptRecord(record);
  }

  /**
   * List all servers with optional filters
   */
  async list(filter?: ListServersFilter): Promise<ServerWithConfig[]> {
    await this.initEncryption();

    const db = getDatabase();

    // Build query dynamically based on filters
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filter?.source) {
      conditions.push('source = ?');
      params.push(filter.source);
    }

    if (filter?.lifecycle) {
      conditions.push('lifecycle = ?');
      params.push(filter.lifecycle);
    }

    if (filter?.enabled !== undefined) {
      conditions.push('enabled = ?');
      params.push(filter.enabled ? 1 : 0);
    }

    if (filter?.tenant !== undefined) {
      if (filter.tenant === null) {
        conditions.push('tenant IS NULL');
      } else {
        conditions.push('tenant = ?');
        params.push(filter.tenant);
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const query = `SELECT * FROM servers ${whereClause} ORDER BY name`;

    const records = db.prepare(query).all(...params) as ServerRecord[];

    return Promise.all(records.map((record) => this.decryptRecord(record)));
  }

  /**
   * Update server by name
   */
  async update(
    name: string,
    options: UpdateServerOptions,
    tenant?: string | null
  ): Promise<ServerWithConfig> {
    await this.initEncryption();

    const db = getDatabase();

    // Get existing server
    const existing = await this.getByName(name, tenant);
    if (!existing) {
      throw new Error(`Server not found: ${name}`);
    }

    logger.info(`Updating server: ${sanitizeServerName(name)}`);

    // Build update fields
    const updates: string[] = [];
    const params: unknown[] = [];

    if (options.source) {
      updates.push('source = ?');
      params.push(options.source);
    }

    if (options.config) {
      const encryptedConfig = encryptServerConfig(
        options.config as unknown as Record<string, unknown>,
        this.encryptor!
      );
      updates.push('config = ?');
      params.push(JSON.stringify(encryptedConfig));
    }

    if (options.lifecycle) {
      updates.push('lifecycle = ?');
      params.push(options.lifecycle);
    }

    if (options.enabled !== undefined) {
      updates.push('enabled = ?');
      params.push(options.enabled ? 1 : 0);
    }

    if (options.tenant !== undefined) {
      updates.push('tenant = ?');
      params.push(options.tenant);
    }

    updates.push('updated_at = ?');
    params.push(new Date().toISOString());

    // Add WHERE clause params
    params.push(name);
    params.push(tenant || null);
    params.push(tenant || null);

    const query = `
      UPDATE servers
      SET ${updates.join(', ')}
      WHERE name = ? AND (tenant = ? OR (tenant IS NULL AND ? IS NULL))
    `;

    const stmt = db.prepare(query);

    try {
      const result = stmt.run(...params);

      if (result.changes === 0) {
        throw new Error(`Server not found: ${name}`);
      }

      logger.info(`Server updated successfully: ${sanitizeServerName(name)}`);

      // Return updated server
      const updated = await this.getByName(name, tenant);
      if (!updated) {
        throw new Error(`Failed to retrieve updated server: ${name}`);
      }

      return updated;
    } catch (error) {
      const err = error as Error;
      logger.error(`Failed to update server: ${sanitizeServerName(name)}`, {
        error: sanitizeString(err.message),
      });
      throw new Error(`Failed to update server: ${err.message}`);
    }
  }

  /**
   * Delete server by name
   */
  async delete(name: string, tenant?: string | null): Promise<void> {
    const db = getDatabase();

    logger.info(`Deleting server: ${sanitizeServerName(name)}`);

    const stmt = db.prepare(`
      DELETE FROM servers WHERE name = ? AND (tenant = ? OR (tenant IS NULL AND ? IS NULL))
    `);

    try {
      const result = stmt.run(name, tenant || null, tenant || null);

      if (result.changes === 0) {
        throw new Error(`Server not found: ${name}`);
      }

      logger.info(`Server deleted successfully: ${sanitizeServerName(name)}`);
    } catch (error) {
      const err = error as Error;
      logger.error(`Failed to delete server: ${sanitizeServerName(name)}`, {
        error: sanitizeString(err.message),
      });
      throw new Error(`Failed to delete server: ${err.message}`);
    }
  }

  /**
   * Check if server exists
   */
  async exists(name: string, tenant?: string | null): Promise<boolean> {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT COUNT(*) as count FROM servers WHERE name = ? AND (tenant = ? OR (tenant IS NULL AND ? IS NULL))
    `);

    const result = stmt.get(name, tenant || null, tenant || null) as { count: number };
    return result.count > 0;
  }

  /**
   * Decrypt server record
   */
  private async decryptRecord(record: ServerRecord): Promise<ServerWithConfig> {
    try {
      const configObj = JSON.parse(record.config) as Record<string, unknown>;
      const decryptedConfig = decryptServerConfig(configObj, this.encryptor!);

      return {
        ...record,
        config: decryptedConfig as unknown as Server,
      };
    } catch (error) {
      const err = error as Error;
      logger.error(`Failed to decrypt server config: ${sanitizeServerName(record.name)}`, {
        error: sanitizeString(err.message),
      });
      throw new Error(`Failed to decrypt server config: ${err.message}`);
    }
  }
}

// Export singleton instance
export const serverModel = new ServerModel();

export default serverModel;
