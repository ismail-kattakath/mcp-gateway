/**
 * remote source — reach an MCP server over HTTP or SSE.
 *
 * Nothing executes locally. Implements the same surface as spawn-based
 * servers (write/message events, isRunning, getStatus) so the manager
 * and router treat it uniformly.
 *
 * For SSE: opens an EventSource-style stream to receive messages.
 * For HTTP: each write() POSTs the request and emits the response.
 */

import { EventEmitter } from 'events';
import logger from '../../logging/logger.js';

export class RemoteServer extends EventEmitter {
  constructor(serverName, config) {
    super();
    this.serverName = serverName;
    this.config = config;
    this.state = 'stopped';
    this.lastError = null;
    this.startTime = null;
    this.logs = [];
    this.maxLogs = 1000;
    this.abortController = null;
  }

  addLog(level, message, data = {}) {
    const entry = { timestamp: new Date().toISOString(), level, message, ...data };
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) this.logs.shift();
    this.emit('log', entry);
  }

  async spawn() {
    if (this.state === 'running' || this.state === 'starting') return;
    this.state = 'starting';
    this.addLog('info', 'Connecting to remote server', { url: this.config.url, transport: this.config.transport });

    try {
      if (this.config.transport === 'sse') {
        await this.connectSSE();
      }
      this.state = 'running';
      this.startTime = Date.now();
      this.emit('started', null);
    } catch (error) {
      this.state = 'failed';
      this.lastError = error.message;
      this.addLog('error', 'Failed to connect', { error: error.message });
      this.emit('error', error);
      throw error;
    }
  }

  async connectSSE() {
    this.abortController = new AbortController();
    const response = await fetch(this.config.url, {
      method: 'GET',
      headers: { Accept: 'text/event-stream', ...(this.config.headers || {}) },
      signal: this.abortController.signal
    });

    if (!response.ok) throw new Error(`SSE connection failed: ${response.status}`);

    this.parseStream(response.body).catch(error => {
      if (error.name !== 'AbortError') {
        logger.error(`SSE stream error for ${this.serverName}`, { error: error.message });
        this.state = 'failed';
        this.emit('exit', null, null);
      }
    });
  }

  async parseStream(stream) {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const events = buffer.split('\n\n');
      buffer = events.pop();

      for (const event of events) {
        const lines = event.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            try {
              const message = JSON.parse(data);
              if (message.jsonrpc === '2.0') this.emit('message', message);
            } catch {}
          }
        }
      }
    }
  }

  async kill() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.state = 'stopped';
    this.addLog('info', 'Disconnected from remote');
    this.emit('exit', null, null);
  }

  isRunning() {
    return this.state === 'running';
  }

  getStatus() {
    return {
      serverName: this.serverName,
      source: 'remote',
      state: this.state,
      url: this.config.url,
      transport: this.config.transport,
      uptime: this.startTime ? Date.now() - this.startTime : null,
      lastError: this.lastError
    };
  }

  getLogs(limit = 100) {
    return this.logs.slice(-limit);
  }

  async write(data) {
    if (!this.isRunning()) throw new Error(`Server ${this.serverName} is not running`);

    if (this.config.transport === 'sse') {
      logger.warn(`Cannot write to SSE remote ${this.serverName}; SSE is read-only`);
      return;
    }

    const method = this.config.method || 'POST';
    try {
      const response = await fetch(this.config.url, {
        method,
        headers: { 'Content-Type': 'application/json', ...(this.config.headers || {}) },
        body: method === 'POST' ? data : undefined
      });
      const text = await response.text();
      try {
        const message = JSON.parse(text);
        if (message.jsonrpc === '2.0') this.emit('message', message);
      } catch {
        logger.warn(`Non-JSON response from ${this.serverName}`);
      }
    } catch (error) {
      logger.error(`HTTP request to ${this.serverName} failed`, { error: error.message });
      this.emit('error', error);
    }
  }
}

export function createRemoteServer(serverName, config) {
  return new RemoteServer(serverName, config);
}

export default { RemoteServer, createRemoteServer };
