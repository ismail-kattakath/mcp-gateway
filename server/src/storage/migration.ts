/**
 * Auto-Migration from registry.json to SQLite
 *
 * Migrates v2.x registry.json to v3.0 SQLite database.
 * - Detects registry.json existence
 * - Parses and validates
 * - Encrypts sensitive fields
 * - Inserts into SQLite
 * - Creates backup
 * - Renames original file
 *
 * Related: Epic #13, Issue #61
 */

import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';
import { getDatabase, transaction } from './database.js';
import {
  getEncryptionKey,
  FieldEncryption,
  encryptServerConfig,
  shouldEncryptSettingKey,
} from './encryption.js';
import logger from '../logging/logger.js';
import { sanitizePath, sanitizeString } from '../logging/sanitizer.js';
import type { Registry, Server } from '../types/registry.js';

/**
 * Migration result
 */
export interface MigrationResult {
  success: boolean;
  serversCount: number;
  settingsCount: number;
  backupPath?: string;
  errors: string[];
}

/**
 * Default admin credentials
 */
const DEFAULT_ADMIN_USERNAME = 'admin';
const DEFAULT_ADMIN_PASSWORD = 'changeme';
const BCRYPT_ROUNDS = 12;

/**
 * Check if migration is needed
 *
 * @param registryPath - Path to registry.json
 * @returns True if migration is needed
 */
export function needsMigration(registryPath: string): boolean {
  // Check if registry.json exists
  if (!fs.existsSync(registryPath)) {
    logger.debug('No registry.json found, migration not needed');
    return false;
  }

  // Check if database already has servers
  const db = getDatabase();
  const result = db.prepare('SELECT COUNT(*) as count FROM servers').get() as { count: number };

  if (result.count > 0) {
    logger.debug('Database already has servers, migration not needed');
    return false;
  }

  logger.info('registry.json exists and database is empty, migration needed');
  return true;
}

/**
 * Migrate registry.json to SQLite database
 *
 * @param registryPath - Path to registry.json
 * @param authConfigPath - Path to .mcp-gateway.json (optional)
 * @returns Migration result
 */
export async function migrateFromRegistryJson(
  registryPath: string,
  authConfigPath?: string
): Promise<MigrationResult> {
  const result: MigrationResult = {
    success: false,
    serversCount: 0,
    settingsCount: 0,
    errors: [],
  };

  logger.info('Starting migration from registry.json to SQLite', {
    registryPath: sanitizePath(registryPath),
  });

  try {
    // 1. Read and parse registry.json
    logger.info('Reading registry.json...');
    const registryContent = fs.readFileSync(registryPath, 'utf8');
    const registry = JSON.parse(registryContent) as Registry;

    logger.info('Registry loaded', {
      version: registry.version,
      serverCount: Object.keys(registry.servers || {}).length,
    });

    // 2. Get encryption key
    logger.info('Loading encryption key...');
    const encryptionKey = await getEncryptionKey();
    const encryptor = new FieldEncryption(encryptionKey);

    // 3. Backup registry.json
    logger.info('Creating backup of registry.json...');
    const backupPath = createBackup(registryPath);
    result.backupPath = backupPath;
    logger.info(`Backup created: ${sanitizePath(backupPath)}`);

    // 4. Migrate in a transaction
    transaction(() => {
      // 4a. Create default admin user
      logger.info('Creating default admin user...');
      createDefaultAdminUser();

      // 4b. Migrate servers
      logger.info('Migrating servers...');
      result.serversCount = migrateServers(registry.servers, encryptor);
      logger.info(`Migrated ${result.serversCount} servers`);

      // 4c. Migrate gateway settings
      if (registry.gateway) {
        logger.info('Migrating gateway settings...');
        result.settingsCount += migrateGatewaySettings(registry.gateway, encryptor);
      }

      // 4d. Migrate auth settings (if .mcp-gateway.json exists)
      if (authConfigPath && fs.existsSync(authConfigPath)) {
        logger.info('Migrating auth settings...');
        result.settingsCount += migrateAuthSettings(authConfigPath, encryptor);
      }

      logger.info(`Migrated ${result.settingsCount} settings`);
    });

    // 5. Rename original files (not delete, for safety)
    logger.info('Renaming original files...');
    const renamedPath = `${registryPath}.migrated`;
    fs.renameSync(registryPath, renamedPath);
    logger.info(`Renamed registry.json to: ${sanitizePath(renamedPath)}`);

    if (authConfigPath && fs.existsSync(authConfigPath)) {
      const renamedAuthPath = `${authConfigPath}.migrated`;
      fs.renameSync(authConfigPath, renamedAuthPath);
      logger.info(`Renamed .mcp-gateway.json to: ${sanitizePath(renamedAuthPath)}`);
    }

    result.success = true;
    logger.info('Migration completed successfully!');

    // Log warning about default admin credentials
    logger.warn('='.repeat(70));
    logger.warn('⚠️  DEFAULT ADMIN USER CREATED:');
    logger.warn(`   Username: ${DEFAULT_ADMIN_USERNAME}`);
    logger.warn(`   Password: ${DEFAULT_ADMIN_PASSWORD}`);
    logger.warn('   PLEASE CHANGE THIS PASSWORD IMMEDIATELY!');
    logger.warn('='.repeat(70));

    return result;
  } catch (error) {
    const err = error as Error;
    const errorMessage = `Migration failed: ${err.message}`;
    logger.error(errorMessage, {
      error: sanitizeString(err.message),
      stack: err.stack,
    });
    result.errors.push(errorMessage);
    return result;
  }
}

/**
 * Create backup of a file
 */
function createBackup(filePath: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${filePath}.backup.${timestamp}`;

  fs.copyFileSync(filePath, backupPath);

  return backupPath;
}

/**
 * Create default admin user
 */
function createDefaultAdminUser(): void {
  const db = getDatabase();
  const userId = uuidv4();

  // Hash password
  const passwordHash = bcrypt.hashSync(DEFAULT_ADMIN_PASSWORD, BCRYPT_ROUNDS);

  // Insert user
  const stmt = db.prepare(`
    INSERT INTO users (id, username, password_hash, role, status)
    VALUES (?, ?, ?, ?, ?)
  `);

  stmt.run(userId, DEFAULT_ADMIN_USERNAME, passwordHash, 'admin', 'active');

  logger.info('Default admin user created', { userId, username: DEFAULT_ADMIN_USERNAME });
}

/**
 * Migrate servers from registry.json
 */
function migrateServers(servers: Record<string, Server>, encryptor: FieldEncryption): number {
  if (!servers) {
    logger.warn('No servers to migrate');
    return 0;
  }

  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO servers (id, name, source, config, lifecycle, enabled, tenant, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let count = 0;

  for (const [name, server] of Object.entries(servers)) {
    try {
      const id = uuidv4();

      // Create config object
      const config: Record<string, unknown> = { ...server };

      // Encrypt sensitive fields
      const encryptedConfig = encryptServerConfig(config, encryptor);

      // Serialize config
      const configJson = JSON.stringify(encryptedConfig);

      // Insert server
      stmt.run(
        id,
        name,
        server.source,
        configJson,
        server.lifecycle || 'on-demand',
        server.enabled !== false ? 1 : 0,
        null, // tenant (NULL = default)
        null // created_by (NULL = system)
      );

      count++;

      logger.debug('Migrated server', {
        name,
        source: server.source,
        lifecycle: server.lifecycle,
        enabled: server.enabled !== false,
      });
    } catch (error) {
      const err = error as Error;
      logger.error(`Failed to migrate server: ${name}`, {
        error: sanitizeString(err.message),
      });
      throw err; // Fail entire transaction on error
    }
  }

  return count;
}

/**
 * Migrate gateway settings from registry.json
 */
function migrateGatewaySettings(gateway: Registry['gateway'], encryptor: FieldEncryption): number {
  if (!gateway) return 0;

  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO settings (key, value, encrypted, category, tenant)
    VALUES (?, ?, ?, ?, ?)
  `);

  let count = 0;

  // Helper to insert setting
  const insertSetting = (key: string, value: unknown, category: string) => {
    const shouldEncrypt = shouldEncryptSettingKey(key);
    let finalValue = typeof value === 'string' ? value : JSON.stringify(value);

    if (shouldEncrypt) {
      finalValue = encryptor.encrypt(finalValue);
    }

    stmt.run(key, finalValue, shouldEncrypt ? 1 : 0, category, null);
    count++;
  };

  // Check if gateway is in simplified format or full format
  const gw = gateway as unknown as Record<string, unknown>;

  if (gw.server && typeof gw.server === 'object') {
    // Full format: { server: {...}, storage: {...}, logging: {...} }
    const server = gw.server as Record<string, unknown>;
    if (server.port !== undefined) insertSetting('server.port', server.port, 'server');
    if (server.host !== undefined) insertSetting('server.host', server.host, 'server');
    if (server.transport !== undefined)
      insertSetting('server.transport', server.transport, 'server');
    if (server.cors !== undefined) insertSetting('server.cors', server.cors, 'server');

    if (gw.storage && typeof gw.storage === 'object') {
      const storage = gw.storage as Record<string, unknown>;
      if (storage.repos !== undefined) insertSetting('storage.repos', storage.repos, 'storage');
      if (storage.cache !== undefined) insertSetting('storage.cache', storage.cache, 'storage');
      if (storage.logs !== undefined) insertSetting('storage.logs', storage.logs, 'storage');
    }

    if (gw.logging && typeof gw.logging === 'object') {
      const logging = gw.logging as Record<string, unknown>;
      if (logging.level !== undefined) insertSetting('logging.level', logging.level, 'logging');
      if (logging.format !== undefined) insertSetting('logging.format', logging.format, 'logging');
      if (logging.outputs !== undefined)
        insertSetting('logging.outputs', logging.outputs, 'logging');
    }
  } else {
    // Simplified format: { port: 3000, host: "0.0.0.0", ... }
    if (gw.port !== undefined) insertSetting('server.port', gw.port, 'server');
    if (gw.host !== undefined) insertSetting('server.host', gw.host, 'server');
    if (gw.transport !== undefined) insertSetting('server.transport', gw.transport, 'server');
    if (gw.cors !== undefined) insertSetting('server.cors', gw.cors, 'server');
  }

  return count;
}

/**
 * Migrate auth settings from .mcp-gateway.json
 */
function migrateAuthSettings(authConfigPath: string, encryptor: FieldEncryption): number {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO settings (key, value, encrypted, category, tenant)
    VALUES (?, ?, ?, ?, ?)
  `);

  let count = 0;

  try {
    const authContent = fs.readFileSync(authConfigPath, 'utf8');
    const authConfig = JSON.parse(authContent) as Record<string, unknown>;

    // Helper to insert setting
    const insertSetting = (key: string, value: unknown) => {
      const shouldEncrypt = shouldEncryptSettingKey(key);
      let finalValue = typeof value === 'string' ? value : JSON.stringify(value);

      if (shouldEncrypt) {
        finalValue = encryptor.encrypt(finalValue);
      }

      stmt.run(key, finalValue, shouldEncrypt ? 1 : 0, 'auth', null);
      count++;
    };

    // Migrate common auth settings
    if (authConfig.enabled !== undefined) {
      insertSetting('auth.enabled', authConfig.enabled);
    }
    if (authConfig.allowedIPs !== undefined) {
      insertSetting('auth.ip_allowlist', authConfig.allowedIPs);
    }

    logger.info(`Migrated ${count} auth settings from ${sanitizePath(authConfigPath)}`);
  } catch (error) {
    const err = error as Error;
    logger.warn(`Failed to read auth config, skipping: ${sanitizeString(err.message)}`);
  }

  return count;
}

/**
 * Check migration status
 */
export function getMigrationStatus(registryPath: string): {
  needsMigration: boolean;
  registryExists: boolean;
  databaseHasData: boolean;
} {
  const registryExists = fs.existsSync(registryPath);

  let databaseHasData = false;
  try {
    const db = getDatabase();
    const result = db.prepare('SELECT COUNT(*) as count FROM servers').get() as { count: number };
    databaseHasData = result.count > 0;
  } catch {
    // Database not initialized yet
    databaseHasData = false;
  }

  return {
    needsMigration: registryExists && !databaseHasData,
    registryExists,
    databaseHasData,
  };
}

export default {
  needsMigration,
  migrateFromRegistryJson,
  getMigrationStatus,
};
