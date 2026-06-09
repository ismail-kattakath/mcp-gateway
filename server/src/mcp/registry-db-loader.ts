/**
 * Database-First Registry Loader
 *
 * Loads MCP server registry from SQLite database instead of registry.json.
 * Falls back to file-based loading for backward compatibility.
 *
 * Related: Epic #13 (Storage Layer)
 */

import path from 'path';
import { ServerModel } from '../storage/models/servers.js';
import { SettingsModel } from '../storage/models/settings.js';
import logger from '../logging/logger.js';
import type { Registry, Server, GatewayConfig } from '../types/registry.js';

/**
 * Load servers from database
 */
export async function loadServersFromDatabase(
  tenant?: string | null
): Promise<Record<string, Server>> {
  try {
    const serverModel = new ServerModel();
    const servers = await serverModel.list({ tenant });

    const serversObj: Record<string, Server> = {};

    for (const server of servers) {
      serversObj[server.name] = server.config;
    }

    logger.info('Loaded servers from database', {
      count: servers.length,
      enabled: servers.filter((s) => s.enabled === 1).length,
    });

    return serversObj;
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to load servers from database', { error: err.message });
    throw new Error(`Failed to load servers from database: ${err.message}`);
  }
}

/**
 * Load gateway config from settings table
 */
export async function loadGatewayConfigFromDatabase(): Promise<GatewayConfig> {
  try {
    const settingsModel = new SettingsModel();

    const serverSettings = await settingsModel.getByCategory('server');
    const storageSettings = await settingsModel.getByCategory('storage');
    const loggingSettings = await settingsModel.getByCategory('logging');

    // Helper to get setting value with default
    const getSetting = (settings: any[], key: string, defaultValue: string): string => {
      const setting = settings.find((s) => s.key === key);
      return setting?.value || defaultValue;
    };

    const config: GatewayConfig = {
      server: {
        port: parseInt(getSetting(serverSettings, 'server.port', '3000')),
        host: getSetting(serverSettings, 'server.host', '0.0.0.0'),
        transport: getSetting(serverSettings, 'server.transport', 'sse') as 'sse' | 'http' | 'both',
        cors: {
          enabled: getSetting(serverSettings, 'server.cors.enabled', 'true') === 'true',
          origins: JSON.parse(getSetting(serverSettings, 'server.cors.origins', '["*"]')),
          credentials: getSetting(serverSettings, 'server.cors.credentials', 'true') === 'true',
        },
      },
      storage: {
        repos: getSetting(
          storageSettings,
          'storage.repos',
          path.resolve(process.env.HOME || '/tmp', '.mcp/repos')
        ),
        cache: getSetting(
          storageSettings,
          'storage.cache',
          path.resolve(process.env.HOME || '/tmp', '.mcp/cache')
        ),
        logs: getSetting(
          storageSettings,
          'storage.logs',
          path.resolve(process.env.HOME || '/tmp', '.mcp/logs')
        ),
      },
      logging: {
        level: getSetting(loggingSettings, 'logging.level', 'info') as
          | 'debug'
          | 'info'
          | 'warn'
          | 'error',
        format: getSetting(loggingSettings, 'logging.format', 'json') as 'json' | 'text',
        outputs: JSON.parse(getSetting(loggingSettings, 'logging.outputs', '["console","file"]')),
      },
    };

    logger.info('Loaded gateway config from database');
    return config;
  } catch (error) {
    const err = error as Error;
    logger.warn('Failed to load gateway config from database, using defaults', {
      error: err.message,
    });

    // Return defaults
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        transport: 'sse',
        cors: {
          enabled: true,
          origins: ['*'],
          credentials: true,
        },
      },
      storage: {
        repos: path.resolve(process.env.HOME || '/tmp', '.mcp/repos'),
        cache: path.resolve(process.env.HOME || '/tmp', '.mcp/cache'),
        logs: path.resolve(process.env.HOME || '/tmp', '.mcp/logs'),
      },
      logging: {
        level: (process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error') || 'info',
        format: 'json',
        outputs: ['console', 'file'],
      },
    };
  }
}

/**
 * Load full registry from database
 */
export async function loadRegistryFromDatabase(tenant?: string | null): Promise<Registry> {
  const servers = await loadServersFromDatabase(tenant);
  const gateway = await loadGatewayConfigFromDatabase();

  return {
    version: '2.0',
    servers,
    gateway,
  };
}
