/**
 * Server Manager
 *
 * Manages lifecycle of all MCP servers:
 * - Dispatches on config.source to the right adapter (pkg/git/container/remote/local)
 * - Spawns persistent servers at startup
 * - Lazy-loads on-demand servers; reaps after 5 min idle
 */

import { EventEmitter } from 'events';
import logger from '../../logging/logger.js';
import { createPkgServer } from './pkg.js';
import { createGitServer } from './git.js';
import { createContainerServer } from './container.js';
import { createRemoteServer } from './remote.js';
import { createLocalServer } from './local.js';

function createServerForSource(serverName, config) {
  switch (config.source) {
    case 'pkg':       return createPkgServer(serverName, config);
    case 'git':       return createGitServer(serverName, config);
    case 'container': return createContainerServer(serverName, config);
    case 'remote':    return createRemoteServer(serverName, config);
    case 'local':     return createLocalServer(serverName, config);
    default:          throw new Error(`Unknown server source: ${config.source}`);
  }
}

export class ServerManager extends EventEmitter {
  constructor() {
    super();
    this.servers = new Map();
    this.lastActivity = new Map();
    this.onDemandTimeouts = new Map();
    this.onDemandIdleTime = 5 * 60 * 1000;
  }

  async initialize(registry) {
    logger.info('Initializing server manager');
    const enabled = Object.entries(registry.servers).filter(([_, c]) => c.enabled);
    logger.info(`Found ${enabled.length} enabled servers`);

    for (const [name, config] of enabled) {
      if (config.lifecycle === 'persistent') {
        logger.info(`Starting persistent server: ${name}`);
        try {
          await this.startServer(name, config);
        } catch (error) {
          logger.error(`Failed to start persistent server ${name}`, { error: error.message });
        }
      } else {
        logger.debug(`Server ${name} is on-demand, will start when needed`);
      }
    }

    logger.info('Server manager initialized', {
      running: this.getRunningServers().length,
      total: enabled.length
    });
  }

  async startServer(serverName, config) {
    if (this.servers.has(serverName)) {
      const existing = this.servers.get(serverName);
      if (existing.isRunning()) {
        logger.debug(`Server ${serverName} is already running`);
        return existing;
      }
    }

    logger.info(`Starting server: ${serverName}`, { source: config.source, lifecycle: config.lifecycle });

    const server = createServerForSource(serverName, config);

    server.on('started', (pid) => {
      logger.info(`Server ${serverName} started`, { pid });
      this.emit('server:started', serverName, pid);
    });

    server.on('exit', (code, signal) => {
      logger.info(`Server ${serverName} exited`, { code, signal });
      this.emit('server:exit', serverName, code, signal);
      if (config.lifecycle === 'persistent') {
        logger.info(`Restarting persistent server: ${serverName}`);
        setTimeout(() => {
          this.startServer(serverName, config).catch(error => {
            logger.error(`Failed to restart server ${serverName}`, { error: error.message });
          });
        }, 2000);
      }
    });

    server.on('error', (error) => {
      logger.error(`Server ${serverName} error`, { error: error.message });
      this.emit('server:error', serverName, error);
    });

    server.on('failed', (error) => {
      logger.error(`Server ${serverName} failed`, { error });
      this.emit('server:failed', serverName, error);
    });

    server.on('log', (entry) => this.emit('server:log', serverName, entry));

    this.servers.set(serverName, server);
    await server.spawn();

    if (config.lifecycle === 'on-demand') {
      this.updateActivity(serverName);
      this.scheduleIdleCheck(serverName, config);
    }

    return server;
  }

  async stopServer(serverName) {
    const server = this.servers.get(serverName);
    if (!server) {
      logger.warn(`Server ${serverName} not found`);
      return;
    }
    logger.info(`Stopping server: ${serverName}`);
    const timeout = this.onDemandTimeouts.get(serverName);
    if (timeout) {
      clearTimeout(timeout);
      this.onDemandTimeouts.delete(serverName);
    }
    await server.kill();
    this.servers.delete(serverName);
    this.lastActivity.delete(serverName);
    logger.info(`Server ${serverName} stopped`);
  }

  async getServer(serverName, config) {
    let server = this.servers.get(serverName);
    if (!server || !server.isRunning()) {
      logger.info(`Server ${serverName} not running, starting on-demand`);
      server = await this.startServer(serverName, config);
    }
    if (config.lifecycle === 'on-demand') {
      this.updateActivity(serverName);
      this.scheduleIdleCheck(serverName, config);
    }
    return server;
  }

  updateActivity(serverName) {
    this.lastActivity.set(serverName, Date.now());
  }

  scheduleIdleCheck(serverName, config) {
    const existing = this.onDemandTimeouts.get(serverName);
    if (existing) clearTimeout(existing);

    const timeout = setTimeout(async () => {
      const last = this.lastActivity.get(serverName);
      const idle = Date.now() - last;
      if (idle >= this.onDemandIdleTime) {
        logger.info(`Server ${serverName} idle for ${(idle / 1000).toFixed(0)}s, stopping`);
        await this.stopServer(serverName);
      } else {
        this.scheduleIdleCheck(serverName, config);
      }
    }, this.onDemandIdleTime);

    this.onDemandTimeouts.set(serverName, timeout);
  }

  getServerStatus(serverName) {
    const server = this.servers.get(serverName);
    if (!server) return { serverName, state: 'not_started', pid: null };
    const status = server.getStatus();
    const last = this.lastActivity.get(serverName);
    if (last) status.idleTime = Date.now() - last;
    return status;
  }

  getAllStatuses() {
    const statuses = {};
    for (const [name] of this.servers.entries()) {
      statuses[name] = this.getServerStatus(name);
    }
    return statuses;
  }

  getRunningServers() {
    return Array.from(this.servers.entries())
      .filter(([_, s]) => s.isRunning())
      .map(([name]) => name);
  }

  getServerLogs(serverName, limit = 100) {
    const server = this.servers.get(serverName);
    if (!server) return [];
    return server.getLogs(limit);
  }

  async stopAll() {
    logger.info('Stopping all servers');
    for (const t of this.onDemandTimeouts.values()) clearTimeout(t);
    this.onDemandTimeouts.clear();

    const stopPromises = [];
    for (const [name, server] of this.servers.entries()) {
      if (server.isRunning()) {
        stopPromises.push(
          server.kill().catch(error => {
            logger.error(`Error stopping server ${name}`, { error: error.message });
          })
        );
      }
    }
    await Promise.all(stopPromises);
    this.servers.clear();
    this.lastActivity.clear();
    logger.info('All servers stopped');
  }

  async reload(newRegistry, oldRegistry) {
    logger.info('Reloading servers from new registry');
    const next = newRegistry.servers;
    const prev = oldRegistry.servers;

    for (const [name] of Object.entries(prev)) {
      const newCfg = next[name];
      if (!newCfg || !newCfg.enabled) {
        logger.info(`Server ${name} disabled or removed, stopping`);
        await this.stopServer(name);
      }
    }

    for (const [name, newCfg] of Object.entries(next)) {
      if (!newCfg.enabled) continue;
      const oldCfg = prev[name];
      const changed = JSON.stringify(oldCfg) !== JSON.stringify(newCfg);
      if (!oldCfg || changed) {
        if (oldCfg) {
          logger.info(`Server ${name} config changed, restarting`);
          await this.stopServer(name);
        }
        if (newCfg.lifecycle === 'persistent') {
          logger.info(`Starting server ${name}`);
          await this.startServer(name, newCfg).catch(error => {
            logger.error(`Failed to start server ${name}`, { error: error.message });
          });
        }
      }
    }
    logger.info('Server reload complete');
  }
}

let serverManager = null;

export function getServerManager() {
  if (!serverManager) serverManager = new ServerManager();
  return serverManager;
}

export default { ServerManager, getServerManager };
