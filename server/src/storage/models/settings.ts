/**
 * Settings Model - CRUD operations for settings table
 *
 * Type-safe query wrapper for settings management.
 * Related: Epic #13
 */

import { getDatabase } from '../database.js';
import {
  getEncryptionKey,
  FieldEncryption,
  shouldEncryptSettingKey,
} from '../encryption.js';
import logger from '../../logging/logger.js';
import { sanitizeString } from '../../logging/sanitizer.js';

/**
 * Setting record in database
 */
export interface SettingRecord {
  key: string;
  value: string;
  encrypted: number; // 0 or 1
  category: string | null;
  description: string | null;
  tenant: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

/**
 * Setting with decrypted value
 */
export interface Setting {
  key: string;
  value: string;
  encrypted: boolean;
  category: string | null;
  description: string | null;
  tenant: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

/**
 * Create/update setting options
 */
export interface SetSettingOptions {
  value: string;
  category?: string;
  description?: string;
  tenant?: string | null;
  updated_by?: string | null;
}

/**
 * Settings model class
 */
export class SettingsModel {
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
   * Get a setting by key
   */
  async get(key: string, tenant?: string | null): Promise<Setting | null> {
    await this.initEncryption();

    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT * FROM settings WHERE key = ? AND (tenant = ? OR (tenant IS NULL AND ? IS NULL))
    `);

    const record = stmt.get(key, tenant || null, tenant || null) as SettingRecord | undefined;

    if (!record) {
      return null;
    }

    return this.decryptRecord(record);
  }

  /**
   * Get all settings in a category
   */
  async getByCategory(category: string, tenant?: string | null): Promise<Setting[]> {
    await this.initEncryption();

    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT * FROM settings
      WHERE category = ? AND (tenant = ? OR (tenant IS NULL AND ? IS NULL))
      ORDER BY key
    `);

    const records = stmt.all(category, tenant || null, tenant || null) as SettingRecord[];

    return Promise.all(records.map(record => this.decryptRecord(record)));
  }

  /**
   * List all settings
   */
  async list(tenant?: string | null): Promise<Setting[]> {
    await this.initEncryption();

    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT * FROM settings
      WHERE tenant = ? OR (tenant IS NULL AND ? IS NULL)
      ORDER BY category, key
    `);

    const records = stmt.all(tenant || null, tenant || null) as SettingRecord[];

    return Promise.all(records.map(record => this.decryptRecord(record)));
  }

  /**
   * Set a setting (create or update)
   */
  async set(key: string, options: SetSettingOptions): Promise<Setting> {
    await this.initEncryption();

    const db = getDatabase();
    const now = new Date().toISOString();

    // Determine if this key should be encrypted
    const shouldEncrypt = shouldEncryptSettingKey(key);
    const finalValue = shouldEncrypt ? this.encryptor!.encrypt(options.value) : options.value;

    logger.info(`Setting value for: ${key}`, {
      encrypted: shouldEncrypt,
      category: options.category,
    });

    // Check if setting exists
    const existing = await this.get(key, options.tenant);

    if (existing) {
      // Update existing setting
      const stmt = db.prepare(`
        UPDATE settings
        SET value = ?, encrypted = ?, category = ?, description = ?, updated_at = ?, updated_by = ?
        WHERE key = ? AND (tenant = ? OR (tenant IS NULL AND ? IS NULL))
      `);

      stmt.run(
        finalValue,
        shouldEncrypt ? 1 : 0,
        options.category || existing.category,
        options.description || existing.description,
        now,
        options.updated_by || null,
        key,
        options.tenant || null,
        options.tenant || null
      );

      logger.info(`Setting updated: ${key}`);
    } else {
      // Insert new setting
      const stmt = db.prepare(`
        INSERT INTO settings (key, value, encrypted, category, description, tenant, created_at, updated_at, updated_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        key,
        finalValue,
        shouldEncrypt ? 1 : 0,
        options.category || null,
        options.description || null,
        options.tenant || null,
        now,
        now,
        options.updated_by || null
      );

      logger.info(`Setting created: ${key}`);
    }

    // Return updated setting
    const updated = await this.get(key, options.tenant);
    if (!updated) {
      throw new Error(`Failed to retrieve updated setting: ${key}`);
    }

    return updated;
  }

  /**
   * Delete a setting
   */
  async delete(key: string, tenant?: string | null): Promise<void> {
    const db = getDatabase();

    logger.info(`Deleting setting: ${key}`);

    const stmt = db.prepare(`
      DELETE FROM settings WHERE key = ? AND (tenant = ? OR (tenant IS NULL AND ? IS NULL))
    `);

    const result = stmt.run(key, tenant || null, tenant || null);

    if (result.changes === 0) {
      throw new Error(`Setting not found: ${key}`);
    }

    logger.info(`Setting deleted: ${key}`);
  }

  /**
   * Check if setting exists
   */
  async exists(key: string, tenant?: string | null): Promise<boolean> {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT COUNT(*) as count FROM settings WHERE key = ? AND (tenant = ? OR (tenant IS NULL AND ? IS NULL))
    `);

    const result = stmt.get(key, tenant || null, tenant || null) as { count: number };
    return result.count > 0;
  }

  /**
   * Decrypt setting record
   */
  private async decryptRecord(record: SettingRecord): Promise<Setting> {
    try {
      let value = record.value;

      // Decrypt if encrypted
      if (record.encrypted === 1) {
        value = this.encryptor!.decrypt(record.value);
      }

      return {
        key: record.key,
        value,
        encrypted: record.encrypted === 1,
        category: record.category,
        description: record.description,
        tenant: record.tenant,
        created_at: record.created_at,
        updated_at: record.updated_at,
        updated_by: record.updated_by,
      };
    } catch (error) {
      const err = error as Error;
      logger.error(`Failed to decrypt setting: ${record.key}`, {
        error: sanitizeString(err.message),
      });
      throw new Error(`Failed to decrypt setting: ${err.message}`);
    }
  }
}

// Export singleton instance
export const settingsModel = new SettingsModel();

export default settingsModel;
