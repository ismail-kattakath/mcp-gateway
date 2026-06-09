/**
 * MCP Registry Loader and Watcher
 *
 * Loads and validates registry.json with hot-reload support.
 * Applies defaults from the schema at load time so consumers
 * can rely on lifecycle/enabled/timeout being present.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import chokidar, { FSWatcher } from 'chokidar';
import { validateRegistry } from '../validation/index.js';
import logger from '../logging/logger.js';
import type { Registry, Server, GatewayConfig } from '../types/registry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface Defaults {
  readonly lifecycle: 'on-demand';
  readonly enabled: true;
  readonly timeout: 30000;
}

const DEFAULTS: Defaults = Object.freeze({
  lifecycle: 'on-demand',
  enabled: true,
  timeout: 30000,
});

let currentRegistry: Registry | null = null;
let registryPath: string | null = null;
let watcher: FSWatcher | null = null;

export type RegistryWatchCallback = (
  newRegistry: Registry,
  oldRegistry: Registry
) => void | Promise<void>;

const watchCallbacks = new Set<RegistryWatchCallback>();

/**
 * Resolve ${VAR} substitutions in a string.
 * Looks up vars in: provided context, process.env, special built-ins (HOME, GATEWAY_DIR).
 */
function resolveEnvVars(value: unknown, context: Record<string, string> = {}): unknown {
  if (typeof value !== 'string') return value;

  return value.replace(/\$\{([^}]+)\}/g, (full, varName: string) => {
    if (context[varName] !== undefined) return context[varName];
    if (process.env[varName] !== undefined) return process.env[varName];

    switch (varName) {
      case 'HOME':
        return process.env.HOME || process.env.USERPROFILE || '/tmp';
      case 'GATEWAY_DIR':
        return path.resolve(__dirname, '../../..');
      default:
        logger.warn(`Unresolved environment variable: ${varName}`);
        return full;
    }
  });
}

function resolveEnvVarsRecursive(obj: unknown, context: Record<string, string> = {}): unknown {
  if (obj === null || typeof obj !== 'object') return resolveEnvVars(obj, context);
  if (Array.isArray(obj)) return obj.map((item) => resolveEnvVarsRecursive(item, context));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = resolveEnvVarsRecursive(v, context);
  }
  return out;
}

/**
 * Apply BaseServer defaults to each server entry.
 * Also applies gateway config defaults for v2.1+ simplified format.
 */
function applyDefaults(registry: Registry): Registry {
  // Apply server defaults
  for (const server of Object.values(registry.servers || {})) {
    const s = server as unknown as Record<string, unknown>;
    if (s.lifecycle === undefined) s.lifecycle = DEFAULTS.lifecycle;
    if (s.enabled === undefined) s.enabled = DEFAULTS.enabled;
    if (s.timeout === undefined) s.timeout = DEFAULTS.timeout;
  }

  // Apply gateway defaults for v2.1+ simplified format or missing gateway object
  if (!registry.gateway) {
    // No gateway object - use hardcoded defaults (v2.1+)
    (registry as unknown as Record<string, unknown>).gateway = {
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
  } else {
    // Gateway object exists - check if it's simplified format or full format
    const gw = registry.gateway as unknown as Record<string, unknown>;

    // If no server/storage/logging keys, it's simplified format - expand it
    if (!gw.server && !gw.storage && !gw.logging) {
      const simplified = registry.gateway as unknown as Record<string, unknown>;
      (registry as unknown as Record<string, unknown>).gateway = {
        server: {
          port: (simplified.port as number) ?? 3000,
          host: (simplified.host as string) ?? '0.0.0.0',
          transport: (simplified.transport as string) ?? 'sse',
          cors: simplified.cors ?? {
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

    // Ensure full format has defaults
    const fullGw = gw as { server?: unknown; storage?: unknown; logging?: unknown };
    if (!fullGw.server) {
      fullGw.server = {
        port: 3000,
        host: '0.0.0.0',
        transport: 'sse',
        cors: { enabled: true, origins: ['*'], credentials: true },
      };
    }
    if (!fullGw.storage) {
      fullGw.storage = {
        repos: path.resolve(process.env.HOME || '/tmp', '.mcp/repos'),
        cache: path.resolve(process.env.HOME || '/tmp', '.mcp/cache'),
        logs: path.resolve(process.env.HOME || '/tmp', '.mcp/logs'),
      };
    }
    if (!fullGw.logging) {
      fullGw.logging = {
        level: (process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error') || 'info',
        format: 'json',
        outputs: ['console', 'file'],
      };
    }
  }

  return registry;
}

async function loadRegistry(filePath: string): Promise<Registry> {
  logger.info(`Loading registry from: ${filePath}`);

  const content = await fs.readFile(filePath, 'utf-8');
  const registry = JSON.parse(content) as Registry;

  validateRegistry(registry);

  applyDefaults(registry);
  const resolved = resolveEnvVarsRecursive(registry) as Registry;

  logger.info('Registry loaded successfully', {
    version: registry.version,
    serverCount: Object.keys(resolved.servers).length,
    enabledCount: Object.values(resolved.servers).filter((s) => s.enabled).length,
  });

  return resolved;
}

export async function initRegistry(filePath: string): Promise<Registry> {
  registryPath = path.resolve(filePath);
  logger.info(`Initializing registry from: ${registryPath}`);
  currentRegistry = await loadRegistry(registryPath);
  return currentRegistry;
}

export function getRegistry(): Registry {
  if (!currentRegistry) throw new Error('Registry not initialized. Call initRegistry() first.');
  return currentRegistry;
}

export function getServer(name: string): Server {
  const registry = getRegistry();
  const server = registry.servers[name];
  if (!server) throw new Error(`Server not found: ${name}`);
  return server;
}

export function getEnabledServers(): Record<string, Server> {
  const registry = getRegistry();
  const enabled: Record<string, Server> = {};
  for (const [name, server] of Object.entries(registry.servers)) {
    if (server.enabled) enabled[name] = server;
  }
  return enabled;
}

export function getGatewayConfig(): GatewayConfig {
  const gateway = getRegistry().gateway;
  if (!gateway) {
    throw new Error('Gateway config not available. Registry may not be loaded.');
  }
  return gateway as GatewayConfig; // After applyDefaults, it's always fully populated
}

export function watchRegistry(callback: RegistryWatchCallback): void {
  if (!registryPath) throw new Error('Registry not initialized. Call initRegistry() first.');
  if (callback) watchCallbacks.add(callback);

  if (watcher) {
    logger.debug('Registry watcher already active');
    return;
  }

  logger.info('Starting registry file watcher', { path: registryPath });

  watcher = chokidar.watch(registryPath, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
  });

  watcher.on('change', async (changedPath: string) => {
    logger.info('Registry file changed, reloading...', { path: changedPath });
    try {
      const newRegistry = await loadRegistry(registryPath!);
      const oldRegistry = currentRegistry!;
      currentRegistry = newRegistry;
      logger.info('Registry reloaded successfully');
      for (const cb of watchCallbacks) {
        try {
          await cb(newRegistry, oldRegistry);
        } catch (error) {
          const err = error as Error;
          logger.error('Registry watch callback failed', { error: err.message });
        }
      }
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to reload registry, keeping old version', { error: err.message });
    }
  });

  watcher.on('error', (error: unknown) => {
    const err = error as Error;
    logger.error('Registry watcher error', { error: err.message });
  });
}

export async function stopWatching(): Promise<void> {
  if (watcher) {
    logger.info('Stopping registry file watcher');
    await watcher.close();
    watcher = null;
    watchCallbacks.clear();
  }
}

export async function reloadRegistry(): Promise<Registry> {
  if (!registryPath) throw new Error('Registry not initialized. Call initRegistry() first.');
  logger.info('Manually reloading registry');
  const newRegistry = await loadRegistry(registryPath);
  const oldRegistry = currentRegistry!;
  currentRegistry = newRegistry;
  for (const cb of watchCallbacks) {
    try {
      await cb(newRegistry, oldRegistry);
    } catch (error) {
      const err = error as Error;
      logger.error('Registry watch callback failed', { error: err.message });
    }
  }
  return newRegistry;
}

export default {
  initRegistry,
  getRegistry,
  getServer,
  getEnabledServers,
  getGatewayConfig,
  watchRegistry,
  stopWatching,
  reloadRegistry,
};
