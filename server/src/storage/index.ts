/**
 * Storage Layer Public API
 *
 * Exports all storage-related functionality for MCP Gateway v3.0.
 * This is the main entry point for the storage layer.
 *
 * Related: Epic #13 (Storage Layer Migration)
 */

// Database
export {
  initDatabase,
  getDatabase,
  closeDatabase,
  isDatabaseInitialized,
  getDatabasePath,
  transaction,
  backupDatabase,
  getDatabaseStats,
  optimizeDatabase,
  checkDatabaseHealth,
} from './database.js';

// Encryption
export {
  FieldEncryption,
  getEncryptionKey,
  generateEncryptionKey,
  shouldEncryptSettingKey,
  encryptServerConfig,
  decryptServerConfig,
  EncryptionError,
} from './encryption.js';

// Migration
export {
  needsMigration,
  migrateFromRegistryJson,
  getMigrationStatus,
} from './migration.js';
export type { MigrationResult } from './migration.js';

// Models
export {
  serverModel,
  ServerModel,
} from './models/servers.js';
export type {
  ServerRecord,
  ServerWithConfig,
  CreateServerOptions,
  UpdateServerOptions,
  ListServersFilter,
} from './models/servers.js';

export {
  settingsModel,
  SettingsModel,
} from './models/settings.js';
export type {
  SettingRecord,
  Setting,
  SetSettingOptions,
} from './models/settings.js';

// Re-export types from registry.d.ts for convenience
export type { Server, Registry, GatewayConfig } from '../types/registry.js';
