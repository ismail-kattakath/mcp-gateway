/**
 * UVX Backend Spawner
 *
 * Manages lifecycle of UVX-based MCP backends (Python packages via uv)
 */

import { spawn } from 'child_process';
import logger from '../../logging/logger.js';
import { EventEmitter } from 'events';
import { createStdoutHandler, createStderrHandler } from './stdio-handler.js';

export class UvxBackend extends EventEmitter {
  constructor(backendId, config) {
    super();
    this.backendId = backendId;
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
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...data
    };

    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    this.emit('log', entry);
  }

  async spawn() {
    if (this.state === 'running' || this.state === 'starting') {
      logger.warn(`Backend ${this.backendId} is already ${this.state}`);
      return;
    }

    this.state = 'starting';
    this.addLog('info', 'Starting backend');

    try {
      const { install, runtime } = this.config;
      const packageName = install.package;
      const version = install.version || 'latest';

      // Build uvx command
      const packageSpec = version === 'latest' ? packageName : `${packageName}==${version}`;
      const args = [packageSpec];

      // Add runtime args if specified
      if (runtime?.args) {
        args.push(...runtime.args);
      }

      logger.info(`Spawning UVX backend: ${this.backendId}`, {
        package: packageSpec,
        args: args.slice(1)
      });

      // Build environment
      const env = {
        ...process.env,
        ...runtime?.env
      };

      // Spawn process
      this.process = spawn('uvx', args, {
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false
      });

      this.startTime = Date.now();
      this.state = 'running';
      this.lastError = null;
      this.addLog('info', 'Backend started', { pid: this.process.pid });

      logger.info(`Backend ${this.backendId} started`, {
        pid: this.process.pid,
        package: packageSpec
      });

      // Handle stdout - parse JSON-RPC messages and logs
      this.process.stdout.on('data', createStdoutHandler(this, this.backendId));

      // Handle stderr
      this.process.stderr.on('data', createStderrHandler(this, this.backendId));

      // Handle process exit
      this.process.on('exit', (code, signal) => {
        const uptime = Date.now() - this.startTime;
        this.addLog('info', 'Backend process exited', { code, signal, uptime });

        logger.info(`Backend ${this.backendId} exited`, {
          code,
          signal,
          uptime: `${(uptime / 1000).toFixed(2)}s`
        });

        if (code !== 0 && code !== null) {
          this.state = 'failed';
          this.lastError = `Process exited with code ${code}`;

          if (this.retryCount < this.maxRetries) {
            this.retryCount++;
            logger.warn(`Backend ${this.backendId} failed, retrying... (${this.retryCount}/${this.maxRetries})`);
            setTimeout(() => this.spawn(), 2000 * this.retryCount);
          } else {
            logger.error(`Backend ${this.backendId} failed after ${this.maxRetries} retries`);
            this.emit('failed', this.lastError);
          }
        } else {
          this.state = 'stopped';
        }

        this.process = null;
        this.emit('exit', code, signal);
      });

      // Handle process errors
      this.process.on('error', (error) => {
        this.state = 'failed';
        this.lastError = error.message;
        this.addLog('error', 'Backend process error', { error: error.message });

        logger.error(`Backend ${this.backendId} process error`, {
          error: error.message,
          stack: error.stack
        });

        this.emit('error', error);
      });

      this.emit('started', this.process.pid);
    } catch (error) {
      this.state = 'failed';
      this.lastError = error.message;
      this.addLog('error', 'Failed to spawn backend', { error: error.message });

      logger.error(`Failed to spawn backend ${this.backendId}`, {
        error: error.message,
        stack: error.stack
      });

      this.emit('error', error);
      throw error;
    }
  }

  async kill(signal = 'SIGTERM') {
    if (!this.process || this.state === 'stopped' || this.state === 'stopping') {
      return;
    }

    this.state = 'stopping';
    this.addLog('info', 'Stopping backend', { signal });

    logger.info(`Stopping backend ${this.backendId}`, { pid: this.process.pid, signal });

    return new Promise((resolve) => {
      const killTimeout = setTimeout(() => {
        if (this.process) {
          logger.warn(`Backend ${this.backendId} did not stop gracefully, force killing`);
          this.process.kill('SIGKILL');
        }
        resolve();
      }, 5000);

      this.process.once('exit', () => {
        clearTimeout(killTimeout);
        this.state = 'stopped';
        this.process = null;
        this.addLog('info', 'Backend stopped');
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
      backendId: this.backendId,
      state: this.state,
      pid: this.process?.pid || null,
      uptime: this.startTime ? Date.now() - this.startTime : null,
      retryCount: this.retryCount,
      lastError: this.lastError,
      package: this.config.install.package,
      version: this.config.install.version || 'latest'
    };
  }

  getLogs(limit = 100) {
    return this.logs.slice(-limit);
  }

  write(data) {
    if (!this.isRunning()) {
      throw new Error(`Backend ${this.backendId} is not running`);
    }
    this.process.stdin.write(data);
  }

  read(callback) {
    if (!this.isRunning()) {
      throw new Error(`Backend ${this.backendId} is not running`);
    }
    this.process.stdout.on('data', callback);
  }
}

export function createUvxBackend(backendId, config) {
  return new UvxBackend(backendId, config);
}

export default {
  UvxBackend,
  createUvxBackend
};
