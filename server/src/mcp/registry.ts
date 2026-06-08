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
  timeout: 30000
});

let currentRegistry: Registry | null = null;
let registryPath: string | null = null;
let watcher: FSWatcher | null = null;

export type RegistryWatchCallback = (newRegistry: Registry, oldRegistry: Registry) => void | Promise<void>;

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
  if (Array.isArray(obj)) return obj.map(item => resolveEnvVarsRecursive(item, context));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = resolveEnvVarsRecursive(v, context);
  }
  return out;
}

/**
 * Apply BaseServer defaults to each server entry.
 */
function applyDefaults(registry: Registry): Registry {
  for (const [name, server] of Object.entries(registry.servers || {})) {
    const s = server as Record<string, unknown>;
    if (s.lifecycle === undefined) s.lifecycle = DEFAULTS.lifecycle;
    if (s.enabled === undefined) s.enabled = DEFAULTS.enabled;
    if (s.timeout === undefined) s.timeout = DEFAULTS.timeout;
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
    enabledCount: Object.values(resolved.servers).filter(s => s.enabled).length
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
  return getRegistry().gateway;
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
    awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 }
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

  watcher.on('error', (error: Error) => logger.error('Registry watcher error', { error: error.message }));
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
  reloadRegistry
};
