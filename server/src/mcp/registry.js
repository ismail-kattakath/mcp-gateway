/**
 * MCP Registry Loader and Watcher
 *
 * Loads and validates registry.json with hot-reload support
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import chokidar from 'chokidar';
import { validateRegistry } from '../validation/index.js';
import logger from '../logging/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Registry state
let currentRegistry = null;
let registryPath = null;
let watcher = null;
const watchCallbacks = new Set();

/**
 * Resolve environment variables in a string
 * Supports ${VAR_NAME} syntax
 */
async function resolveEnvVars(value, context = {}) {
  if (typeof value !== 'string') {
    return value;
  }

  // Handle async token resolution for OAuth tokens
  const matches = [...value.matchAll(/\$\{([^}]+)\}/g)];
  let resolvedValue = value;

  for (const match of matches) {
    const fullMatch = match[0];
    const varName = match[1];

    let replacement;

    // Check context first (for special vars like REPO_DIR)
    if (context[varName] !== undefined) {
      replacement = context[varName];
    }
    // Check for OAuth tokens
    else if (varName === 'GITHUB_ACCESS_TOKEN' || varName === 'SMITHERY_ACCESS_TOKEN') {
      const provider = varName === 'GITHUB_ACCESS_TOKEN' ? 'github' : 'smithery';
      try {
        const { getToken } = await import('../oauth/tokenStore.js');
        const token = await getToken(provider);
        replacement = token?.access_token || '';
        if (!replacement) {
          logger.warn(`OAuth token not found for: ${provider}`);
        }
      } catch (error) {
        logger.error(`Failed to get OAuth token for ${provider}`, { error: error.message });
        replacement = '';
      }
    }
    // Check process.env
    else if (process.env[varName] !== undefined) {
      replacement = process.env[varName];
    }
    // Special built-in variables
    else {
      switch (varName) {
        case 'HOME':
          replacement = process.env.HOME || process.env.USERPROFILE || '/tmp';
          break;
        case 'GATEWAY_DIR':
          replacement = path.resolve(__dirname, '../../..');
          break;
        default:
          logger.warn(`Unresolved environment variable: ${varName}`);
          replacement = fullMatch; // Keep original if not found
      }
    }

    resolvedValue = resolvedValue.replace(fullMatch, replacement);
  }

  return resolvedValue;
}

/**
 * Recursively resolve environment variables in an object
 */
async function resolveEnvVarsRecursive(obj, context = {}) {
  if (obj === null || typeof obj !== 'object') {
    return await resolveEnvVars(obj, context);
  }

  if (Array.isArray(obj)) {
    return await Promise.all(obj.map(item => resolveEnvVarsRecursive(item, context)));
  }

  const resolved = {};
  for (const [key, value] of Object.entries(obj)) {
    resolved[key] = await resolveEnvVarsRecursive(value, context);
  }
  return resolved;
}

/**
 * Load and parse registry.json
 */
async function loadRegistry(filePath) {
  try {
    logger.info(`Loading registry from: ${filePath}`);

    // Read file
    const content = await fs.readFile(filePath, 'utf-8');
    const registry = JSON.parse(content);

    // Validate against schema
    validateRegistry(registry);

    // Resolve environment variables (including OAuth tokens)
    const resolvedRegistry = await resolveEnvVarsRecursive(registry);

    logger.info('Registry loaded successfully', {
      version: registry.version,
      backendCount: Object.keys(registry.backends).length,
      enabledCount: Object.values(registry.backends).filter(b => b.enabled).length
    });

    return resolvedRegistry;
  } catch (error) {
    if (error.validationErrors || error.semanticErrors) {
      logger.error('Registry validation failed', {
        validationErrors: error.validationErrors,
        semanticErrors: error.semanticErrors
      });
      throw error;
    }

    if (error instanceof SyntaxError) {
      logger.error('Registry JSON parsing failed', { error: error.message });
      throw new Error(`Invalid JSON syntax in registry: ${error.message}`);
    }

    logger.error('Failed to load registry', { error: error.message, stack: error.stack });
    throw error;
  }
}

/**
 * Initialize registry loader
 */
export async function initRegistry(filePath) {
  registryPath = path.resolve(filePath);
  logger.info(`Initializing registry from: ${registryPath}`);

  try {
    currentRegistry = await loadRegistry(registryPath);
    return currentRegistry;
  } catch (error) {
    logger.error('Failed to initialize registry', { error: error.message });
    throw error;
  }
}

/**
 * Get current registry
 */
export function getRegistry() {
  if (!currentRegistry) {
    throw new Error('Registry not initialized. Call initRegistry() first.');
  }
  return currentRegistry;
}

/**
 * Get specific backend by ID
 */
export function getBackend(backendId) {
  const registry = getRegistry();
  const backend = registry.backends[backendId];

  if (!backend) {
    throw new Error(`Backend not found: ${backendId}`);
  }

  return backend;
}

/**
 * Get all enabled backends
 */
export function getEnabledBackends() {
  const registry = getRegistry();
  const enabled = {};

  for (const [id, backend] of Object.entries(registry.backends)) {
    if (backend.enabled) {
      enabled[id] = backend;
    }
  }

  return enabled;
}

/**
 * Get gateway configuration
 */
export function getGatewayConfig() {
  const registry = getRegistry();
  return registry.gateway;
}

/**
 * Watch registry file for changes and hot-reload
 */
export function watchRegistry(callback) {
  if (!registryPath) {
    throw new Error('Registry not initialized. Call initRegistry() first.');
  }

  // Add callback to set
  if (callback) {
    watchCallbacks.add(callback);
  }

  // Don't create watcher if already watching
  if (watcher) {
    logger.debug('Registry watcher already active');
    return;
  }

  logger.info('Starting registry file watcher', { path: registryPath });

  watcher = chokidar.watch(registryPath, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 500,
      pollInterval: 100
    }
  });

  watcher.on('change', async (path) => {
    logger.info('Registry file changed, reloading...', { path });

    try {
      const newRegistry = await loadRegistry(registryPath);
      const oldRegistry = currentRegistry;
      currentRegistry = newRegistry;

      logger.info('Registry reloaded successfully');

      // Notify all callbacks
      for (const cb of watchCallbacks) {
        try {
          await cb(newRegistry, oldRegistry);
        } catch (error) {
          logger.error('Registry watch callback failed', {
            error: error.message,
            stack: error.stack
          });
        }
      }
    } catch (error) {
      logger.error('Failed to reload registry, keeping old version', {
        error: error.message
      });
      // Keep old registry on error
    }
  });

  watcher.on('error', (error) => {
    logger.error('Registry watcher error', { error: error.message });
  });
}

/**
 * Stop watching registry file
 */
export async function stopWatching() {
  if (watcher) {
    logger.info('Stopping registry file watcher');
    await watcher.close();
    watcher = null;
    watchCallbacks.clear();
  }
}

/**
 * Reload registry manually
 */
export async function reloadRegistry() {
  if (!registryPath) {
    throw new Error('Registry not initialized. Call initRegistry() first.');
  }

  logger.info('Manually reloading registry');
  const newRegistry = await loadRegistry(registryPath);
  const oldRegistry = currentRegistry;
  currentRegistry = newRegistry;

  // Notify all callbacks
  for (const cb of watchCallbacks) {
    try {
      await cb(newRegistry, oldRegistry);
    } catch (error) {
      logger.error('Registry watch callback failed', {
        error: error.message,
        stack: error.stack
      });
    }
  }

  return newRegistry;
}

export default {
  initRegistry,
  getRegistry,
  getBackend,
  getEnabledBackends,
  getGatewayConfig,
  watchRegistry,
  stopWatching,
  reloadRegistry
};
