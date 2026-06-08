/**
 * Base MCP server adapter.
 *
 * Shared boilerplate for spawn-based sources (pkg, git, container, local):
 * - State machine (stopped / starting / running / stopping / failed)
 * - Log buffer + log event
 * - Retry-with-backoff on unexpected exit
 * - JSON-RPC message parsing via stdio-handler
 * - write() to stdin for outgoing requests
 *
 * Subclasses implement getSpawnArgs() and may override prepare() for setup work.
 */

import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import logger from '../../logging/logger.js';
import { createStdoutHandler, createStderrHandler } from './stdio-handler.js';

export class BaseServer extends EventEmitter {
  constructor(serverName, config) {
    super();
    this.serverName = serverName;
    this.config = config;
    this.process = null;
    this.state = 'stopped';
    this.retryCount = 0;
    this.maxRetries = 3;
    this.lastError = null;
    this.startTime = null;
    this.logs = [];
    this.maxLogs = 1000;
  }

  addLog(level, message, data = {}) {
    const entry = { timestamp: new Date().toISOString(), level, message, ...data };
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) this.logs.shift();
    this.emit('log', entry);
  }

  /**
   * Subclasses override to do clone/build/etc. before spawn.
   * Default: no-op.
   */
  async prepare() {}

  /**
   * Subclasses MUST override. Return { command, args, env, cwd? }.
   */
  async getSpawnArgs() {
    throw new Error(`${this.constructor.name} must implement getSpawnArgs()`);
  }

  async spawn() {
    if (this.state === 'running' || this.state === 'starting') {
      logger.warn(`Server ${this.serverName} is already ${this.state}`);
      return;
    }

    this.state = 'starting';
    this.addLog('info', 'Starting server');

    try {
      await this.prepare();
      const { command, args, env: extraEnv = {}, cwd } = await this.getSpawnArgs();

      logger.info(`Spawning server: ${this.serverName}`, { command, args });

      const env = { ...process.env, ...extraEnv };

      this.process = spawn(command, args, {
        env,
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false
      });

      this.startTime = Date.now();
      this.state = 'running';
      this.lastError = null;
      this.addLog('info', 'Server started', { pid: this.process.pid });
      logger.info(`Server ${this.serverName} started`, { pid: this.process.pid });

      this.process.stdout.on('data', createStdoutHandler(this, this.serverName));
      this.process.stderr.on('data', createStderrHandler(this, this.serverName));

      this.process.on('exit', (code, signal) => {
        const uptime = Date.now() - this.startTime;
        this.addLog('info', 'Server process exited', { code, signal, uptime });
        logger.info(`Server ${this.serverName} exited`, {
          code, signal, uptime: `${(uptime / 1000).toFixed(2)}s`
        });

        if (code !== 0 && code !== null) {
          this.state = 'failed';
          this.lastError = `Process exited with code ${code}`;
          if (this.retryCount < this.maxRetries) {
            this.retryCount++;
            logger.warn(`Server ${this.serverName} failed, retrying ${this.retryCount}/${this.maxRetries}`);
            setTimeout(() => this.spawn(), 2000 * this.retryCount);
          } else {
            logger.error(`Server ${this.serverName} failed after ${this.maxRetries} retries`);
            this.emit('failed', this.lastError);
          }
        } else {
          this.state = 'stopped';
        }

        this.process = null;
        this.emit('exit', code, signal);
      });

      this.process.on('error', (error) => {
        this.state = 'failed';
        this.lastError = error.message;
        this.addLog('error', 'Server process error', { error: error.message });
        logger.error(`Server ${this.serverName} process error`, { error: error.message });
        this.emit('error', error);
      });

      this.emit('started', this.process.pid);
    } catch (error) {
      this.state = 'failed';
      this.lastError = error.message;
      this.addLog('error', 'Failed to spawn server', { error: error.message });
      logger.error(`Failed to spawn server ${this.serverName}`, { error: error.message, stack: error.stack });
      this.emit('error', error);
      throw error;
    }
  }

  async kill(signal = 'SIGTERM') {
    if (!this.process || this.state === 'stopped' || this.state === 'stopping') return;

    this.state = 'stopping';
    this.addLog('info', 'Stopping server', { signal });
    logger.info(`Stopping server ${this.serverName}`, { pid: this.process.pid, signal });

    return new Promise((resolve) => {
      const killTimeout = setTimeout(() => {
        if (this.process) {
          logger.warn(`Server ${this.serverName} did not stop gracefully, force killing`);
          this.process.kill('SIGKILL');
        }
        resolve();
      }, 5000);

      this.process.once('exit', () => {
        clearTimeout(killTimeout);
        this.state = 'stopped';
        this.process = null;
        this.addLog('info', 'Server stopped');
        resolve();
      });

      this.process.kill(signal);
    });
  }

  isRunning() {
    return this.state === 'running' && this.process !== null;
  }

  getStatus() {
    return {
      serverName: this.serverName,
      source: this.config.source,
      state: this.state,
      pid: this.process?.pid || null,
      uptime: this.startTime ? Date.now() - this.startTime : null,
      retryCount: this.retryCount,
      lastError: this.lastError
    };
  }

  getLogs(limit = 100) {
    return this.logs.slice(-limit);
  }

  write(data) {
    if (!this.isRunning()) throw new Error(`Server ${this.serverName} is not running`);
    this.process.stdin.write(data);
  }
}

export default { BaseServer };
