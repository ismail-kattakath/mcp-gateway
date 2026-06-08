/**
 * Backend Manager
 *
 * Manages lifecycle of all MCP backends:
 * - Initialize enabled backends
 * - Handle on-demand vs persistent lifecycle
 * - Route tool calls to correct backend
 * - Health check monitoring
 */

import { EventEmitter } from 'events';
import { createNpxBackend } from './npx.js';
import { createUvxBackend } from './uvx.js';
import { createPipxBackend } from './pipx.js';
import { createDockerBackend } from './docker.js';
import { createGitBackend } from './git.js';
import { createLocalBackend } from './local.js';
import { createRemoteBackend } from './remote.js';
import { createShellBackend } from './shell.js';
import logger from '../../logging/logger.js';

export class BackendManager extends EventEmitter {
  constructor() {
    super();
    this.backends = new Map(); // backendId -> backend instance
    this.lastActivity = new Map(); // backendId -> timestamp
    this.onDemandTimeouts = new Map(); // backendId -> timeout handle
    this.onDemandIdleTime = 5 * 60 * 1000; // 5 minutes idle time
  }

  /**
   * Initialize backend manager with registry
   */
  async initialize(registry) {
    logger.info('Initializing backend manager');

    const enabledBackends = Object.entries(registry.backends)
      .filter(([_, config]) => config.enabled);

    logger.info(`Found ${enabledBackends.length} enabled backends`);

    // Start persistent backends immediately
    for (const [backendId, config] of enabledBackends) {
      if (config.lifecycle === 'persistent') {
        logger.info(`Starting persistent backend: ${backendId}`);
        try {
          await this.startBackend(backendId, config);
        } catch (error) {
          logger.error(`Failed to start persistent backend ${backendId}`, {
            error: error.message
          });
          // Continue with other backends
        }
      } else {
        logger.debug(`Backend ${backendId} is on-demand, will start when needed`);
      }
    }

    logger.info('Backend manager initialized', {
      running: this.getRunningBackends().length,
      total: enabledBackends.length
    });
  }

  /**
   * Start a backend
   */
  async startBackend(backendId, config) {
    // Check if already running
    if (this.backends.has(backendId)) {
      const backend = this.backends.get(backendId);
      if (backend.isRunning()) {
        logger.debug(`Backend ${backendId} is already running`);
        return backend;
      }
    }

    logger.info(`Starting backend: ${backendId}`, {
      type: config.type,
      lifecycle: config.lifecycle
    });

    try {
      // Create backend instance based on type
      let backend;
      switch (config.type) {
        case 'npx':
          backend = createNpxBackend(backendId, config);
          break;

        case 'uvx':
          backend = createUvxBackend(backendId, config);
          break;

        case 'pipx':
          backend = createPipxBackend(backendId, config);
          break;

        case 'docker':
          backend = createDockerBackend(backendId, config);
          break;

        case 'git-npm':
        case 'git-python':
        case 'git-docker':
          backend = createGitBackend(backendId, config);
          break;

        case 'local':
          backend = createLocalBackend(backendId, config);
          break;

        case 'remote-sse':
        case 'remote-http':
          backend = createRemoteBackend(backendId, config);
          break;

        case 'shell':
          backend = createShellBackend(backendId, config);
          break;

        default:
          throw new Error(`Unknown backend type: ${config.type}`);
      }

      // Set up event handlers
      backend.on('started', (pid) => {
        logger.info(`Backend ${backendId} started`, { pid });
        this.emit('backend:started', backendId, pid);
      });

      backend.on('exit', (code, signal) => {
        logger.info(`Backend ${backendId} exited`, { code, signal });
        this.emit('backend:exit', backendId, code, signal);

        // Restart persistent backends
        if (config.lifecycle === 'persistent') {
          logger.info(`Restarting persistent backend: ${backendId}`);
          setTimeout(() => {
            this.startBackend(backendId, config).catch(error => {
              logger.error(`Failed to restart backend ${backendId}`, {
                error: error.message
              });
            });
          }, 2000);
        }
      });

      backend.on('error', (error) => {
        logger.error(`Backend ${backendId} error`, { error: error.message });
        this.emit('backend:error', backendId, error);
      });

      backend.on('failed', (error) => {
        logger.error(`Backend ${backendId} failed`, { error });
        this.emit('backend:failed', backendId, error);
      });

      backend.on('log', (entry) => {
        this.emit('backend:log', backendId, entry);
      });

      // Store backend instance
      this.backends.set(backendId, backend);

      // Spawn the process
      await backend.spawn();

      // Track activity for on-demand backends
      if (config.lifecycle === 'on-demand') {
        this.updateActivity(backendId);
        this.scheduleIdleCheck(backendId, config);
      }

      return backend;
    } catch (error) {
      logger.error(`Failed to start backend ${backendId}`, {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Stop a backend
   */
  async stopBackend(backendId) {
    const backend = this.backends.get(backendId);
    if (!backend) {
      logger.warn(`Backend ${backendId} not found`);
      return;
    }

    logger.info(`Stopping backend: ${backendId}`);

    // Cancel idle timeout if exists
    const timeout = this.onDemandTimeouts.get(backendId);
    if (timeout) {
      clearTimeout(timeout);
      this.onDemandTimeouts.delete(backendId);
    }

    await backend.kill();
    this.backends.delete(backendId);
    this.lastActivity.delete(backendId);

    logger.info(`Backend ${backendId} stopped`);
  }

  /**
   * Get or start backend (for on-demand)
   */
  async getBackend(backendId, config) {
    let backend = this.backends.get(backendId);

    if (!backend || !backend.isRunning()) {
      logger.info(`Backend ${backendId} not running, starting on-demand`);
      backend = await this.startBackend(backendId, config);
    }

    // Update activity for on-demand backends
    if (config.lifecycle === 'on-demand') {
      this.updateActivity(backendId);
      this.scheduleIdleCheck(backendId, config);
    }

    return backend;
  }

  /**
   * Update last activity time
   */
  updateActivity(backendId) {
    this.lastActivity.set(backendId, Date.now());
  }

  /**
   * Schedule idle check for on-demand backend
   */
  scheduleIdleCheck(backendId, config) {
    // Cancel existing timeout
    const existingTimeout = this.onDemandTimeouts.get(backendId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Schedule new timeout
    const timeout = setTimeout(async () => {
      const lastActivity = this.lastActivity.get(backendId);
      const idleTime = Date.now() - lastActivity;

      if (idleTime >= this.onDemandIdleTime) {
        logger.info(`Backend ${backendId} idle for ${(idleTime / 1000).toFixed(0)}s, stopping`);
        await this.stopBackend(backendId);
      } else {
        // Reschedule check
        this.scheduleIdleCheck(backendId, config);
      }
    }, this.onDemandIdleTime);

    this.onDemandTimeouts.set(backendId, timeout);
  }

  /**
   * Get backend status
   */
  getBackendStatus(backendId) {
    const backend = this.backends.get(backendId);
    if (!backend) {
      return {
        backendId,
        state: 'not_started',
        pid: null
      };
    }

    const status = backend.getStatus();
    const lastActivity = this.lastActivity.get(backendId);
    if (lastActivity) {
      status.idleTime = Date.now() - lastActivity;
    }

    return status;
  }

  /**
   * Get all backend statuses
   */
  getAllStatuses() {
    const statuses = {};
    for (const [backendId, backend] of this.backends.entries()) {
      statuses[backendId] = this.getBackendStatus(backendId);
    }
    return statuses;
  }

  /**
   * Get running backends
   */
  getRunningBackends() {
    return Array.from(this.backends.entries())
      .filter(([_, backend]) => backend.isRunning())
      .map(([id, _]) => id);
  }

  /**
   * Get backend logs
   */
  getBackendLogs(backendId, limit = 100) {
    const backend = this.backends.get(backendId);
    if (!backend) {
      return [];
    }
    return backend.getLogs(limit);
  }

  /**
   * Stop all backends
   */
  async stopAll() {
    logger.info('Stopping all backends');

    // Cancel all idle timeouts
    for (const timeout of this.onDemandTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.onDemandTimeouts.clear();

    // Stop all backends
    const stopPromises = [];
    for (const [backendId, backend] of this.backends.entries()) {
      if (backend.isRunning()) {
        stopPromises.push(
          backend.kill().catch(error => {
            logger.error(`Error stopping backend ${backendId}`, {
              error: error.message
            });
          })
        );
      }
    }

    await Promise.all(stopPromises);
    this.backends.clear();
    this.lastActivity.clear();

    logger.info('All backends stopped');
  }

  /**
   * Reload backends from new registry
   */
  async reload(newRegistry, oldRegistry) {
    logger.info('Reloading backends from new registry');

    const newBackends = newRegistry.backends;
    const oldBackends = oldRegistry.backends;

    // Find backends to stop (disabled or removed)
    for (const [backendId, oldConfig] of Object.entries(oldBackends)) {
      const newConfig = newBackends[backendId];
      if (!newConfig || !newConfig.enabled) {
        logger.info(`Backend ${backendId} disabled or removed, stopping`);
        await this.stopBackend(backendId);
      }
    }

    // Find backends to start or restart (enabled or changed)
    for (const [backendId, newConfig] of Object.entries(newBackends)) {
      if (!newConfig.enabled) {
        continue;
      }

      const oldConfig = oldBackends[backendId];
      const configChanged = JSON.stringify(oldConfig) !== JSON.stringify(newConfig);

      if (!oldConfig || configChanged) {
        if (oldConfig) {
          logger.info(`Backend ${backendId} config changed, restarting`);
          await this.stopBackend(backendId);
        }

        // Start if persistent
        if (newConfig.lifecycle === 'persistent') {
          logger.info(`Starting backend ${backendId}`);
          await this.startBackend(backendId, newConfig).catch(error => {
            logger.error(`Failed to start backend ${backendId}`, {
              error: error.message
            });
          });
        }
      }
    }

    logger.info('Backend reload complete');
  }
}

// Singleton instance
let backendManager = null;

/**
 * Get or create backend manager instance
 */
export function getBackendManager() {
  if (!backendManager) {
    backendManager = new BackendManager();
  }
  return backendManager;
}

export default {
  BackendManager,
  getBackendManager
};
