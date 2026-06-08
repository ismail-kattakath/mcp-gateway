/**
 * Docker Backend Spawner
 *
 * Manages lifecycle of Docker-based MCP backends
 */

import Docker from 'dockerode';
import logger from '../../logging/logger.js';
import { EventEmitter } from 'events';
import path from 'path';
import os from 'os';

export class DockerBackend extends EventEmitter {
  constructor(backendId, config) {
    super();
    this.backendId = backendId;
    this.config = config;
    this.docker = new Docker();
    this.container = null;
    this.state = 'stopped';
    this.retryCount = 0;
    this.maxRetries = 3;
    this.lastError = null;
    this.startTime = null;
    this.logs = [];
    this.maxLogs = 1000;
    this.healthCheckInterval = null;
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

  /**
   * Resolve environment variables in volume paths
   */
  resolveVolume(volumeSpec) {
    let resolved = volumeSpec.replace('${HOME}', os.homedir());
    resolved = resolved.replace('${GATEWAY_DIR}', process.cwd());
    return resolved;
  }

  /**
   * Pull image if needed
   */
  async pullImage(imageName) {
    const { pull = 'missing' } = this.config.install;

    if (pull === 'never') {
      logger.debug(`Skipping image pull for ${imageName} (pull=never)`);
      return;
    }

    try {
      // Check if image exists locally
      const images = await this.docker.listImages({ filters: { reference: [imageName] } });

      if (images.length > 0 && pull === 'missing') {
        logger.debug(`Image ${imageName} already exists locally`);
        return;
      }

      logger.info(`Pulling Docker image: ${imageName}`);
      this.addLog('info', 'Pulling Docker image', { image: imageName });

      const stream = await this.docker.pull(imageName);

      await new Promise((resolve, reject) => {
        this.docker.modem.followProgress(stream, (err, output) => {
          if (err) {
            reject(err);
          } else {
            resolve(output);
          }
        }, (event) => {
          if (event.status) {
            logger.debug(`[${imageName}] ${event.status}${event.progress || ''}`);
          }
        });
      });

      logger.info(`Image ${imageName} pulled successfully`);
      this.addLog('info', 'Image pulled successfully', { image: imageName });
    } catch (error) {
      logger.error(`Failed to pull image ${imageName}`, { error: error.message });
      throw error;
    }
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
      const imageName = `${install.image}:${install.tag || 'latest'}`;

      // Pull image if needed
      await this.pullImage(imageName);

      // Build container config
      const containerConfig = {
        Image: imageName,
        name: `mcp-gateway-${this.backendId}`,
        Env: [],
        HostConfig: {
          AutoRemove: false,
          RestartPolicy: { Name: 'no' }
        },
        OpenStdin: true,
        StdinOnce: false,
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true
      };

      // Add environment variables
      if (runtime?.env) {
        for (const [key, value] of Object.entries(runtime.env)) {
          containerConfig.Env.push(`${key}=${value}`);
        }
      }

      // Add volumes
      if (runtime?.volumes && runtime.volumes.length > 0) {
        containerConfig.HostConfig.Binds = runtime.volumes.map(v => this.resolveVolume(v));
      }

      // Add ports
      if (runtime?.ports) {
        containerConfig.ExposedPorts = {};
        containerConfig.HostConfig.PortBindings = {};

        for (const [containerPort, hostPort] of Object.entries(runtime.ports)) {
          const portKey = `${containerPort}/tcp`;
          containerConfig.ExposedPorts[portKey] = {};
          containerConfig.HostConfig.PortBindings[portKey] = [{ HostPort: String(hostPort) }];
        }
      }

      // Add command args
      if (runtime?.args && runtime.args.length > 0) {
        containerConfig.Cmd = runtime.args;
      }

      logger.info(`Creating Docker container: ${this.backendId}`, {
        image: imageName,
        volumes: containerConfig.HostConfig.Binds,
        ports: containerConfig.HostConfig.PortBindings
      });

      // Remove existing container with same name if exists
      try {
        const existingContainer = this.docker.getContainer(`mcp-gateway-${this.backendId}`);
        await existingContainer.remove({ force: true });
        logger.debug(`Removed existing container: mcp-gateway-${this.backendId}`);
      } catch (err) {
        // Container doesn't exist, that's fine
      }

      // Create container
      this.container = await this.docker.createContainer(containerConfig);

      // Start container
      await this.container.start();

      this.startTime = Date.now();
      this.state = 'running';
      this.lastError = null;

      const info = await this.container.inspect();
      this.addLog('info', 'Backend started', { containerId: info.Id.substring(0, 12) });

      logger.info(`Backend ${this.backendId} started`, {
        containerId: info.Id.substring(0, 12),
        image: imageName
      });

      // Stream logs
      const logStream = await this.container.logs({
        follow: true,
        stdout: true,
        stderr: true,
        timestamps: true
      });

      logStream.on('data', (chunk) => {
        const message = chunk.toString('utf8').trim();
        if (message) {
          // Docker log format includes stream type prefix, parse it
          const lines = message.split('\n');
          for (const line of lines) {
            if (line.length > 8) {
              const logMessage = line.substring(8).trim(); // Skip docker stream header
              if (logMessage) {
                this.addLog('stdout', logMessage);
                logger.debug(`[${this.backendId}] ${logMessage}`);
              }
            }
          }
        }
      });

      // Monitor container status
      this.container.wait((err, data) => {
        const uptime = Date.now() - this.startTime;
        this.addLog('info', 'Container exited', { statusCode: data?.StatusCode, uptime });

        logger.info(`Backend ${this.backendId} container exited`, {
          statusCode: data?.StatusCode,
          uptime: `${(uptime / 1000).toFixed(2)}s`
        });

        if (data?.StatusCode !== 0 && data?.StatusCode !== null) {
          this.state = 'failed';
          this.lastError = `Container exited with code ${data.StatusCode}`;

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

        if (this.healthCheckInterval) {
          clearInterval(this.healthCheckInterval);
          this.healthCheckInterval = null;
        }

        this.emit('exit', data?.StatusCode, null);
      });

      // Start health checks if configured
      if (this.config.healthcheck) {
        this.startHealthChecks();
      }

      this.emit('started', info.Id.substring(0, 12));
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

  /**
   * Start health checks
   */
  startHealthChecks() {
    const { healthcheck } = this.config;
    if (!healthcheck) return;

    const interval = (healthcheck.interval || 30) * 1000;

    this.healthCheckInterval = setInterval(async () => {
      try {
        const info = await this.container.inspect();
        const isRunning = info.State.Running;

        if (!isRunning) {
          logger.warn(`Backend ${this.backendId} container is not running`);
          this.addLog('warn', 'Container health check failed: not running');
        }
      } catch (error) {
        logger.error(`Health check failed for ${this.backendId}`, { error: error.message });
        this.addLog('error', 'Health check failed', { error: error.message });
      }
    }, interval);
  }

  async kill(signal = 'SIGTERM') {
    if (!this.container || this.state === 'stopped' || this.state === 'stopping') {
      return;
    }

    this.state = 'stopping';
    this.addLog('info', 'Stopping backend');

    logger.info(`Stopping backend ${this.backendId}`);

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    try {
      // Stop container gracefully
      await this.container.stop({ t: 10 });

      // Remove container
      await this.container.remove();

      this.state = 'stopped';
      this.container = null;
      this.addLog('info', 'Backend stopped');

      logger.info(`Backend ${this.backendId} stopped`);
    } catch (error) {
      logger.error(`Error stopping backend ${this.backendId}`, { error: error.message });

      // Try force removal
      try {
        await this.container.remove({ force: true });
      } catch (removeError) {
        logger.error(`Error removing container ${this.backendId}`, { error: removeError.message });
      }

      this.state = 'stopped';
      this.container = null;
    }
  }

  isRunning() {
    return this.state === 'running' && this.container !== null;
  }

  async getStatus() {
    const status = {
      backendId: this.backendId,
      state: this.state,
      uptime: this.startTime ? Date.now() - this.startTime : null,
      retryCount: this.retryCount,
      lastError: this.lastError,
      image: this.config.install.image,
      tag: this.config.install.tag || 'latest'
    };

    if (this.container) {
      try {
        const info = await this.container.inspect();
        status.containerId = info.Id.substring(0, 12);
        status.containerState = info.State;
      } catch (error) {
        logger.debug(`Could not inspect container ${this.backendId}`, { error: error.message });
      }
    }

    return status;
  }

  getLogs(limit = 100) {
    return this.logs.slice(-limit);
  }

  async write(data) {
    if (!this.isRunning()) {
      throw new Error(`Backend ${this.backendId} is not running`);
    }

    // Attach to container stdin
    const exec = await this.container.exec({
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Cmd: ['sh', '-c', 'cat']
    });

    const stream = await exec.start({ hijack: true, stdin: true });
    stream.write(data);
    stream.end();
  }

  async read(callback) {
    if (!this.isRunning()) {
      throw new Error(`Backend ${this.backendId} is not running`);
    }

    // Already streaming logs in spawn(), this is for additional reads
    const logStream = await this.container.logs({
      follow: true,
      stdout: true,
      stderr: true
    });

    logStream.on('data', callback);
  }
}

export function createDockerBackend(backendId, config) {
  return new DockerBackend(backendId, config);
}

export default {
  DockerBackend,
  createDockerBackend
};
