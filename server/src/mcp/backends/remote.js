/**
 * Remote Backend Spawner
 *
 * Handles remote-sse and remote-http MCP backends
 * Proxies connections to remote MCP servers
 */

import { EventSource } from 'eventsource';
import axios from 'axios';
import logger from '../../logging/logger.js';
import { EventEmitter } from 'events';

export class RemoteBackend extends EventEmitter {
  constructor(backendId, config) {
    super();
    this.backendId = backendId;
    this.config = config;
    this.eventSource = null;
    this.state = 'stopped';
    this.retryCount = 0;
    this.maxRetries = 3;
    this.lastError = null;
    this.startTime = null;
    this.logs = [];
    this.maxLogs = 1000;
    this.messageHandlers = [];
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
   * Get headers for remote connection
   */
  getHeaders() {
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'MCP-Gateway/1.0',
      ...this.config.runtime?.headers
    };

    return headers;
  }

  async spawn() {
    if (this.state === 'running' || this.state === 'starting') {
      logger.warn(`Backend ${this.backendId} is already ${this.state}`);
      return;
    }

    this.state = 'starting';
    this.addLog('info', 'Starting backend');

    try {
      const { type, install } = this.config;

      if (type === 'remote-sse') {
        await this.connectSSE(install.url);
      } else if (type === 'remote-http') {
        await this.connectHTTP(install.url);
      } else {
        throw new Error(`Unknown remote type: ${type}`);
      }

      this.startTime = Date.now();
      this.state = 'running';
      this.lastError = null;

      logger.info(`Backend ${this.backendId} connected`, {
        type,
        url: install.url
      });

      this.emit('started', 'remote');
    } catch (error) {
      this.state = 'failed';
      this.lastError = error.message;
      this.addLog('error', 'Failed to connect to remote backend', { error: error.message });

      logger.error(`Failed to connect backend ${this.backendId}`, {
        error: error.message,
        stack: error.stack
      });

      // Retry connection
      if (this.retryCount < this.maxRetries) {
        this.retryCount++;
        logger.warn(`Backend ${this.backendId} failed, retrying... (${this.retryCount}/${this.maxRetries})`);
        setTimeout(() => this.spawn(), 2000 * this.retryCount);
      } else {
        logger.error(`Backend ${this.backendId} failed after ${this.maxRetries} retries`);
        this.emit('failed', this.lastError);
      }

      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Connect to SSE endpoint
   */
  async connectSSE(url) {
    logger.info(`Connecting to SSE endpoint: ${url}`, { backend: this.backendId });
    this.addLog('info', 'Connecting to SSE endpoint', { url });

    const headers = this.getHeaders();

    this.eventSource = new EventSource(url, {
      headers
    });

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('SSE connection timeout'));
      }, 10000);

      this.eventSource.onopen = () => {
        clearTimeout(timeout);
        logger.info(`SSE connection established: ${this.backendId}`);
        this.addLog('info', 'SSE connection established');
        resolve();
      };

      this.eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.addLog('message', 'Received message', { type: data.type });
          logger.debug(`[${this.backendId}] SSE message:`, data);

          // Forward to all registered handlers
          for (const handler of this.messageHandlers) {
            handler(data);
          }

          this.emit('message', data);
        } catch (error) {
          logger.error(`Failed to parse SSE message from ${this.backendId}`, {
            error: error.message,
            data: event.data
          });
        }
      };

      this.eventSource.onerror = (error) => {
        clearTimeout(timeout);
        logger.error(`SSE connection error for ${this.backendId}`, { error });
        this.addLog('error', 'SSE connection error', { error: error.message || 'Unknown error' });

        // Attempt reconnect
        if (this.state === 'running') {
          logger.warn(`SSE connection lost for ${this.backendId}, reconnecting...`);
          this.state = 'failed';
          this.eventSource.close();
          this.eventSource = null;

          setTimeout(() => {
            if (this.retryCount < this.maxRetries) {
              this.spawn();
            }
          }, 2000);
        }

        this.emit('error', error);
        reject(error);
      };
    });
  }

  /**
   * Connect to HTTP endpoint
   */
  async connectHTTP(url) {
    logger.info(`Connecting to HTTP endpoint: ${url}`, { backend: this.backendId });
    this.addLog('info', 'Connecting to HTTP endpoint', { url });

    const headers = this.getHeaders();

    // Test connection with a health check or initial request
    try {
      const response = await axios.get(url, {
        headers,
        timeout: 10000,
        validateStatus: (status) => status < 500 // Accept 4xx but not 5xx
      });

      logger.info(`HTTP connection established: ${this.backendId}`, {
        status: response.status
      });
      this.addLog('info', 'HTTP connection established', {
        status: response.status,
        statusText: response.statusText
      });
    } catch (error) {
      logger.error(`Failed to connect to HTTP endpoint ${url}`, {
        error: error.message
      });
      throw error;
    }
  }

  async kill() {
    if (this.state === 'stopped' || this.state === 'stopping') {
      return;
    }

    this.state = 'stopping';
    this.addLog('info', 'Stopping backend');

    logger.info(`Stopping backend ${this.backendId}`);

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    this.messageHandlers = [];
    this.state = 'stopped';
    this.addLog('info', 'Backend stopped');

    logger.info(`Backend ${this.backendId} stopped`);
  }

  isRunning() {
    return this.state === 'running';
  }

  getStatus() {
    return {
      backendId: this.backendId,
      state: this.state,
      uptime: this.startTime ? Date.now() - this.startTime : null,
      retryCount: this.retryCount,
      lastError: this.lastError,
      url: this.config.install.url,
      type: this.config.type
    };
  }

  getLogs(limit = 100) {
    return this.logs.slice(-limit);
  }

  /**
   * Send message to remote backend (HTTP POST)
   */
  async write(data) {
    if (!this.isRunning()) {
      throw new Error(`Backend ${this.backendId} is not running`);
    }

    const { type, install } = this.config;

    if (type === 'remote-http') {
      try {
        const headers = this.getHeaders();
        const response = await axios.post(install.url, data, {
          headers,
          timeout: 30000
        });

        logger.debug(`[${this.backendId}] HTTP response:`, response.data);
        return response.data;
      } catch (error) {
        logger.error(`HTTP request failed for ${this.backendId}`, {
          error: error.message
        });
        throw error;
      }
    } else if (type === 'remote-sse') {
      // For SSE, we might need to send via a separate HTTP endpoint
      const postUrl = install.postUrl || install.url.replace('/sse', '/message');

      try {
        const headers = this.getHeaders();
        const response = await axios.post(postUrl, data, {
          headers,
          timeout: 30000
        });

        logger.debug(`[${this.backendId}] Message sent:`, response.data);
        return response.data;
      } catch (error) {
        logger.error(`Failed to send message to ${this.backendId}`, {
          error: error.message
        });
        throw error;
      }
    }
  }

  /**
   * Register callback for incoming messages
   */
  read(callback) {
    if (!this.isRunning()) {
      throw new Error(`Backend ${this.backendId} is not running`);
    }

    this.messageHandlers.push(callback);
  }

  /**
   * Unregister message callback
   */
  removeReadHandler(callback) {
    const index = this.messageHandlers.indexOf(callback);
    if (index > -1) {
      this.messageHandlers.splice(index, 1);
    }
  }
}

export function createRemoteBackend(backendId, config) {
  return new RemoteBackend(backendId, config);
}

export default {
  RemoteBackend,
  createRemoteBackend
};
