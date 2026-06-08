/**
 * Server Manager
 *
 * Manages lifecycle of all MCP servers:
 * - Dispatches on config.source to the right adapter (pkg/git/container/remote/local)
 * - Spawns persistent servers at startup
 * - Lazy-loads on-demand servers; reaps after 5 min idle
 */

import { EventEmitter } from 'events';
import logger, { sanitizeServerName } from '../../logging/logger.js';
import { createPkgServer } from './pkg.js';
import { createGitServer } from './git.js';
import { createContainerServer } from './container.js';
import { createRemoteServer } from './remote.js';
import { createLocalServer } from './local.js';
import type { Registry, Server } from '../../types/registry.js';
import type { BaseServer, ServerLog, ServerStatus } from './base.js';
import type { RemoteServer } from './remote.js';

type ManagedServer = BaseServer | RemoteServer;

function createServerForSource(serverName: string, config: Server): ManagedServer {
  switch (config.source) {
    case 'pkg':
      return createPkgServer(serverName, config);
    case 'git':
      return createGitServer(serverName, config);
    case 'container':
      return createContainerServer(serverName, config);
    case 'remote':
      return createRemoteServer(serverName, config);
    case 'local':
      return createLocalServer(serverName, config);
    default:
      // TypeScript should ensure this never happens
      throw new Error(`Unknown server source: ${(config as Server).source}`);
  }
}

interface ServerManagerEvents {
  'server:started': (serverName: string, pid: number | null) => void;
  'server:exit': (serverName: string, code: number | null, signal: NodeJS.Signals | null) => void;
  'server:error': (serverName: string, error: Error) => void;
  'server:failed': (serverName: string, error: string) => void;
  'server:log': (serverName: string, entry: ServerLog) => void;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export declare interface ServerManager {
  on<U extends keyof ServerManagerEvents>(event: U, listener: ServerManagerEvents[U]): this;
  emit<U extends keyof ServerManagerEvents>(
    event: U,
    ...args: Parameters<ServerManagerEvents[U]>
  ): boolean;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ServerManager extends EventEmitter {
  private servers: Map<string, ManagedServer>;
  private lastActivity: Map<string, number>;
  private onDemandTimeouts: Map<string, NodeJS.Timeout>;
  private onDemandIdleTime: number;

  constructor() {
    super();
    this.servers = new Map();
    this.lastActivity = new Map();
    this.onDemandTimeouts = new Map();
    this.onDemandIdleTime = 5 * 60 * 1000;
  }

  async initialize(registry: Registry): Promise<void> {
    logger.info('Initializing server manager');
    const enabled = Object.entries(registry.servers).filter(([_, c]) => c.enabled);
    logger.info(`Found ${enabled.length} enabled servers`);

    for (const [name, config] of enabled) {
      if (config.lifecycle === 'persistent') {
        logger.info(`Starting persistent server: ${sanitizeServerName(name)}`);
        try {
          await this.startServer(name, config);
        } catch (error) {
          const err = error as Error;
          logger.error(`Failed to start persistent server ${sanitizeServerName(name)}`, {
            error: err.message,
          });
        }
      } else {
        logger.debug(`Server ${sanitizeServerName(name)} is on-demand, will start when needed`);
      }
    }

    logger.info('Server manager initialized', {
      running: this.getRunningServers().length,
      total: enabled.length,
    });
  }

  async startServer(serverName: string, config: Server): Promise<ManagedServer> {
    if (this.servers.has(serverName)) {
      const existing = this.servers.get(serverName)!;
      if (existing.isRunning()) {
        logger.debug(`Server ${sanitizeServerName(serverName)} is already running`);
        return existing;
      }
    }

    logger.info(`Starting server: ${sanitizeServerName(serverName)}`, {
      source: config.source,
      lifecycle: config.lifecycle,
    });

    const server = createServerForSource(serverName, config);

    server.on('started', (pid: number | null) => {
      logger.info(`Server ${sanitizeServerName(serverName)} started`, { pid });
      this.emit('server:started', serverName, pid);
    });

    server.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
      logger.info(`Server ${sanitizeServerName(serverName)} exited`, { code, signal });
      this.emit('server:exit', serverName, code, signal);
      if (config.lifecycle === 'persistent') {
        logger.info(`Restarting persistent server: ${sanitizeServerName(serverName)}`);
        setTimeout(() => {
          this.startServer(serverName, config).catch((error: Error) => {
            logger.error(`Failed to restart server ${sanitizeServerName(serverName)}`, {
              error: error.message,
            });
          });
        }, 2000);
      }
    });

    server.on('error', (error: Error) => {
      logger.error(`Server ${sanitizeServerName(serverName)} error`, { error: error.message });
      this.emit('server:error', serverName, error);
    });

    server.on('failed', (error: string) => {
      logger.error(`Server ${sanitizeServerName(serverName)} failed`, { error });
      this.emit('server:failed', serverName, error);
    });

    server.on('log', (entry: ServerLog) => this.emit('server:log', serverName, entry));

    this.servers.set(serverName, server);
    await server.spawn();

    if (config.lifecycle === 'on-demand') {
      this.updateActivity(serverName);
      this.scheduleIdleCheck(serverName, config);
    }

    return server;
  }

  async stopServer(serverName: string): Promise<void> {
    const server = this.servers.get(serverName);
    if (!server) {
      logger.warn(`Server ${sanitizeServerName(serverName)} not found`);
      return;
    }
    logger.info(`Stopping server: ${sanitizeServerName(serverName)}`);
    const timeout = this.onDemandTimeouts.get(serverName);
    if (timeout) {
      clearTimeout(timeout);
      this.onDemandTimeouts.delete(serverName);
    }
    await server.kill();
    this.servers.delete(serverName);
    this.lastActivity.delete(serverName);
    logger.info(`Server ${sanitizeServerName(serverName)} stopped`);
  }

  async getServer(serverName: string, config: Server): Promise<ManagedServer> {
    let server = this.servers.get(serverName);
    if (!server || !server.isRunning()) {
      logger.info(`Server ${sanitizeServerName(serverName)} not running, starting on-demand`);
      server = await this.startServer(serverName, config);
    }
    if (config.lifecycle === 'on-demand') {
      this.updateActivity(serverName);
      this.scheduleIdleCheck(serverName, config);
    }
    return server;
  }

  updateActivity(serverName: string): void {
    this.lastActivity.set(serverName, Date.now());
  }

  scheduleIdleCheck(serverName: string, config: Server): void {
    const existing = this.onDemandTimeouts.get(serverName);
    if (existing) clearTimeout(existing);

    const timeout = setTimeout(async () => {
      const last = this.lastActivity.get(serverName);
      if (!last) return;
      const idle = Date.now() - last;
      if (idle >= this.onDemandIdleTime) {
        logger.info(
          `Server ${sanitizeServerName(serverName)} idle for ${(idle / 1000).toFixed(0)}s, stopping`
        );
        await this.stopServer(serverName);
      } else {
        this.scheduleIdleCheck(serverName, config);
      }
    }, this.onDemandIdleTime);

    this.onDemandTimeouts.set(serverName, timeout);
  }

  getServerStatus(serverName: string): ServerStatus & { serverName: string } {
    const server = this.servers.get(serverName);
    if (!server) {
      return {
        serverName,
        source: 'unknown',
        state: 'stopped',
        pid: null,
        uptime: null,
        retryCount: 0,
        lastError: null,
      };
    }
    const status = server.getStatus();
    const last = this.lastActivity.get(serverName);
    if (last) {
      return { ...status, idleTime: Date.now() - last };
    }
    return status;
  }

  getAllStatuses(): Record<string, ServerStatus> {
    const statuses: Record<string, ServerStatus> = {};
    for (const [name] of this.servers.entries()) {
      statuses[name] = this.getServerStatus(name);
    }
    return statuses;
  }

  getRunningServers(): string[] {
    return Array.from(this.servers.entries())
      .filter(([_, s]) => s.isRunning())
      .map(([name]) => name);
  }

  getServerLogs(serverName: string, limit = 100): ServerLog[] {
    const server = this.servers.get(serverName);
    if (!server) return [];
    return server.getLogs(limit);
  }

  async stopAll(): Promise<void> {
    logger.info('Stopping all servers');
    for (const t of this.onDemandTimeouts.values()) clearTimeout(t);
    this.onDemandTimeouts.clear();

    const stopPromises = [];
    for (const [name, server] of this.servers.entries()) {
      if (server.isRunning()) {
        stopPromises.push(
          server.kill().catch((error: Error) => {
            logger.error(`Error stopping server ${sanitizeServerName(name)}`, {
              error: error.message,
            });
          })
        );
      }
    }
    await Promise.all(stopPromises);
    this.servers.clear();
    this.lastActivity.clear();
    logger.info('All servers stopped');
  }

  async reload(newRegistry: Registry, oldRegistry: Registry): Promise<void> {
    logger.info('Reloading servers from new registry');
    const next = newRegistry.servers;
    const prev = oldRegistry.servers;

    for (const [name] of Object.entries(prev)) {
      const newCfg = next[name];
      if (!newCfg || !newCfg.enabled) {
        logger.info(`Server ${sanitizeServerName(name)} disabled or removed, stopping`);
        await this.stopServer(name);
      }
    }

    for (const [name, newCfg] of Object.entries(next)) {
      if (!newCfg.enabled) continue;
      const oldCfg = prev[name];
      const changed = JSON.stringify(oldCfg) !== JSON.stringify(newCfg);
      if (!oldCfg || changed) {
        if (oldCfg) {
          logger.info(`Server ${sanitizeServerName(name)} config changed, restarting`);
          await this.stopServer(name);
        }
        if (newCfg.lifecycle === 'persistent') {
          logger.info(`Starting server ${sanitizeServerName(name)}`);
          await this.startServer(name, newCfg).catch((error: Error) => {
            logger.error(`Failed to start server ${sanitizeServerName(name)}`, {
              error: error.message,
            });
          });
        }
      }
    }
    logger.info('Server reload complete');
  }
}

let serverManager: ServerManager | null = null;

export function getServerManager(): ServerManager {
  if (!serverManager) serverManager = new ServerManager();
  return serverManager;
}

export default { ServerManager, getServerManager };
