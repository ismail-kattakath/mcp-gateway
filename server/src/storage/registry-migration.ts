/**
 * Registry Migration Utility
 *
 * Migrates registry.json and .mcp-gateway.json to SQLite database.
 * Supports auto-migration on first startup and manual import via CLI.
 *
 * Related: Epic #13 (Storage Layer)
 */

import fs from 'fs/promises';
import path from 'path';
import { ServerModel } from './models/servers.js';
import { SettingsModel } from './models/settings.js';
import logger from '../logging/logger.js';
import { sanitizePath, sanitizeString } from '../logging/sanitizer.js';
import type { Registry, Server } from '../types/registry.js';

export interface MigrationResult {
  success: boolean;
  serversCount: number;
  settingsCount: number;
  errors: string[];
  backupPath?: string;
}

/**
 * Check if migration is needed
 * Returns true if database is empty and registry.json exists
 */
export async function needsMigration(registryPath: string): Promise<boolean> {
  try {
    const serverModel = new ServerModel();
    const servers = await serverModel.list();

    // If DB has servers, no migration needed
    if (servers.length > 0) {
      logger.debug('Database already has servers, skipping migration');
      return false;
    }

    // Check if registry.json exists
    try {
      await fs.access(registryPath);
      logger.info('Database empty and registry.json exists, migration needed');
      return true;
    } catch {
      // registry.json doesn't exist, no migration possible
      logger.debug('No registry.json found, skipping migration');
      return false;
    }
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to check migration status', {
      error: sanitizeString(err.message),
    });
    return false;
  }
}

/**
 * Migrate registry.json to database
 */
export async function migrateFromRegistryJson(
  registryPath: string,
  authConfigPath?: string,
  options: { dryRun?: boolean; merge?: boolean } = {}
): Promise<MigrationResult> {
  const result: MigrationResult = {
    success: false,
    serversCount: 0,
    settingsCount: 0,
    errors: [],
  };

  try {
    logger.info(`Starting migration from ${sanitizePath(registryPath)}`);

    // Read and parse registry.json
    const content = await fs.readFile(registryPath, 'utf-8');
    const registry = JSON.parse(content) as Registry;

    if (options.dryRun) {
      logger.info('DRY RUN: Would migrate the following:');
      logger.info(`  - ${Object.keys(registry.servers || {}).length} servers`);
      logger.info(`  - Gateway config: ${registry.gateway ? 'present' : 'absent'}`);
      result.success = true;
      return result;
    }

    // Create backup
    const backupPath = `${registryPath}.backup.${Date.now()}`;
    await fs.copyFile(registryPath, backupPath);
    result.backupPath = backupPath;
    logger.info(`Created backup at ${sanitizePath(backupPath)}`);

    const serverModel = new ServerModel();
    const settingsModel = new SettingsModel();

    // Migrate servers
    if (registry.servers) {
      for (const [name, config] of Object.entries(registry.servers)) {
        try {
          // Check if server already exists
          const existing = await serverModel.getByName(name);

          if (existing && !options.merge) {
            logger.warn(`Server ${name} already exists, skipping`);
            continue;
          }

          if (existing && options.merge) {
            // Update existing server
            await serverModel.update(name, {
              source: config.source,
              config,
              lifecycle: config.lifecycle,
              enabled: config.enabled,
            });
            logger.info(`Updated existing server: ${name}`);
          } else {
            // Create new server
            await serverModel.create({
              name,
              source: config.source,
              config,
              lifecycle: config.lifecycle || 'on-demand',
              enabled: config.enabled !== false,
            });
            logger.info(`Migrated server: ${name}`);
          }

          result.serversCount++;
        } catch (error) {
          const err = error as Error;
          const errorMsg = `Failed to migrate server ${name}: ${err.message}`;
          logger.error(errorMsg);
          result.errors.push(errorMsg);
        }
      }
    }

    // Migrate gateway config to settings
    if (registry.gateway) {
      try {
        const gw = registry.gateway as any;

        // Server settings
        if (gw.server) {
          await settingsModel.set('server.port', {
            value: gw.server.port?.toString() || '3000',
            category: 'server',
          });
          await settingsModel.set('server.host', {
            value: gw.server.host || '0.0.0.0',
            category: 'server',
          });
          await settingsModel.set('server.transport', {
            value: gw.server.transport || 'sse',
            category: 'server',
          });

          if (gw.server.cors) {
            await settingsModel.set('server.cors.enabled', {
              value: gw.server.cors.enabled?.toString() || 'true',
              category: 'server',
            });
            await settingsModel.set('server.cors.origins', {
              value: JSON.stringify(gw.server.cors.origins || ['*']),
              category: 'server',
            });
            await settingsModel.set('server.cors.credentials', {
              value: gw.server.cors.credentials?.toString() || 'true',
              category: 'server',
            });
          }

          result.settingsCount += 6;
        }

        // Storage settings
        if (gw.storage) {
          await settingsModel.set('storage.repos', {
            value: gw.storage.repos,
            category: 'storage',
          });
          await settingsModel.set('storage.cache', {
            value: gw.storage.cache,
            category: 'storage',
          });
          await settingsModel.set('storage.logs', { value: gw.storage.logs, category: 'storage' });
          result.settingsCount += 3;
        }

        // Logging settings
        if (gw.logging) {
          await settingsModel.set('logging.level', {
            value: gw.logging.level,
            category: 'logging',
          });
          await settingsModel.set('logging.format', {
            value: gw.logging.format,
            category: 'logging',
          });
          await settingsModel.set('logging.outputs', {
            value: JSON.stringify(gw.logging.outputs),
            category: 'logging',
          });
          result.settingsCount += 3;
        }

        logger.info('Migrated gateway config to settings');
      } catch (error) {
        const err = error as Error;
        const errorMsg = `Failed to migrate gateway config: ${err.message}`;
        logger.error(errorMsg);
        result.errors.push(errorMsg);
      }
    }

    // Migrate auth config if provided
    if (authConfigPath) {
      try {
        // No fs.access check — let readFile throw ENOENT to avoid a TOCTOU
        // race between the existence check and the subsequent read.
        const authContent = await fs.readFile(authConfigPath, 'utf-8');
        const authConfig = JSON.parse(authContent) as any;

        if (authConfig.disableAuth !== undefined) {
          await settingsModel.set('auth.enabled', {
            value: (!authConfig.disableAuth).toString(),
            category: 'auth',
          });
          result.settingsCount++;
        }

        if (authConfig.allowedIPs && Array.isArray(authConfig.allowedIPs)) {
          await settingsModel.set('auth.ip_allowlist', {
            value: JSON.stringify(authConfig.allowedIPs),
            category: 'auth',
          });
          result.settingsCount++;
        }

        logger.info('Migrated auth config to settings');
      } catch (error) {
        // Auth config is optional, don't fail migration
        logger.debug('No auth config found or failed to migrate', {
          error: sanitizeString((error as Error).message),
        });
      }
    }

    // Rename original files to .migrated
    if (result.serversCount > 0 || result.settingsCount > 0) {
      const migratedPath = `${registryPath}.migrated`;
      await fs.rename(registryPath, migratedPath);
      logger.info(`Renamed original registry to ${sanitizePath(migratedPath)}`);
    }

    result.success = result.errors.length === 0;

    logger.info('Migration completed', {
      success: result.success,
      serversCount: result.serversCount,
      settingsCount: result.settingsCount,
      errorsCount: result.errors.length,
    });

    return result;
  } catch (error) {
    const err = error as Error;
    const errorMsg = `Migration failed: ${err.message}`;
    logger.error(errorMsg, { error: sanitizeString(err.message) });
    result.errors.push(errorMsg);
    result.success = false;
    return result;
  }
}

/**
 * Export database to registry.json format
 */
export async function exportToRegistryJson(outputPath: string): Promise<MigrationResult> {
  const result: MigrationResult = {
    success: false,
    serversCount: 0,
    settingsCount: 0,
    errors: [],
  };

  try {
    logger.info(`Exporting database to ${sanitizePath(outputPath)}`);

    const serverModel = new ServerModel();
    const settingsModel = new SettingsModel();

    // Load all servers
    const servers = await serverModel.list();
    const serversObj: Record<string, Server> = {};

    for (const server of servers) {
      serversObj[server.name] = server.config;
      result.serversCount++;
    }

    // Load gateway settings
    const serverSettings = await settingsModel.getByCategory('server');
    const storageSettings = await settingsModel.getByCategory('storage');
    const loggingSettings = await settingsModel.getByCategory('logging');

    const registry: Registry = {
      version: '2.0',
      servers: serversObj,
      gateway: {
        server: {
          port: parseInt(serverSettings.find((s) => s.key === 'server.port')?.value || '3000'),
          host: serverSettings.find((s) => s.key === 'server.host')?.value || '0.0.0.0',
          transport:
            (serverSettings.find((s) => s.key === 'server.transport')?.value as
              | 'sse'
              | 'http'
              | 'both') || 'sse',
          cors: {
            enabled: serverSettings.find((s) => s.key === 'server.cors.enabled')?.value === 'true',
            origins: JSON.parse(
              serverSettings.find((s) => s.key === 'server.cors.origins')?.value || '["*"]'
            ),
            credentials:
              serverSettings.find((s) => s.key === 'server.cors.credentials')?.value === 'true',
          },
        },
        storage: {
          repos:
            storageSettings.find((s) => s.key === 'storage.repos')?.value ||
            path.resolve(process.env.HOME || '/tmp', '.mcp/repos'),
          cache:
            storageSettings.find((s) => s.key === 'storage.cache')?.value ||
            path.resolve(process.env.HOME || '/tmp', '.mcp/cache'),
          logs:
            storageSettings.find((s) => s.key === 'storage.logs')?.value ||
            path.resolve(process.env.HOME || '/tmp', '.mcp/logs'),
        },
        logging: {
          level:
            (loggingSettings.find((s) => s.key === 'logging.level')?.value as
              | 'debug'
              | 'info'
              | 'warn'
              | 'error') || 'info',
          format:
            (loggingSettings.find((s) => s.key === 'logging.format')?.value as 'json' | 'text') ||
            'json',
          outputs: JSON.parse(
            loggingSettings.find((s) => s.key === 'logging.outputs')?.value || '["console","file"]'
          ),
        },
      },
    };

    result.settingsCount = serverSettings.length + storageSettings.length + loggingSettings.length;

    // Write to file
    await fs.writeFile(outputPath, JSON.stringify(registry, null, 2), 'utf-8');

    result.success = true;
    logger.info('Export completed', {
      serversCount: result.serversCount,
      settingsCount: result.settingsCount,
      outputPath: sanitizePath(outputPath),
    });

    return result;
  } catch (error) {
    const err = error as Error;
    const errorMsg = `Export failed: ${err.message}`;
    logger.error(errorMsg);
    result.errors.push(errorMsg);
    result.success = false;
    return result;
  }
}
