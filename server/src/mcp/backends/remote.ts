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
import type { RemoteServer as RemoteServerConfig } from '../../types/registry.js';
import type { ServerLog, ServerStatus, ServerState } from './base.js';

interface JsonRpcMessage {
  jsonrpc: '2.0';
  id?: string | number;
  method?: string;
  result?: unknown;
  error?: unknown;
  params?: unknown;
}

export class RemoteServer extends EventEmitter {
  private state: ServerState;
  private lastError: string | null;
  private startTime: number | null;
  private logs: ServerLog[];
  private maxLogs: number;
  private abortController: AbortController | null;

  constructor(
    private serverName: string,
    public config: RemoteServerConfig
  ) {
    super();
    this.state = 'stopped';
    this.lastError = null;
    this.startTime = null;
    this.logs = [];
    this.maxLogs = 1000;
    this.abortController = null;
  }

  addLog(level: string, message: string, data: Record<string, unknown> = {}): void {
    const entry: ServerLog = { timestamp: new Date().toISOString(), level, message, ...data };
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) this.logs.shift();
    this.emit('log', entry);
  }

  async spawn(): Promise<void> {
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
      const err = error as Error;
      this.state = 'failed';
      this.lastError = err.message;
      this.addLog('error', 'Failed to connect', { error: err.message });
      this.emit('error', err);
      throw err;
    }
  }

  async connectSSE(): Promise<void> {
    this.abortController = new AbortController();
    const response = await fetch(this.config.url, {
      method: 'GET',
      headers: { Accept: 'text/event-stream', ...(this.config.headers || {}) },
      signal: this.abortController.signal
    });

    if (!response.ok) throw new Error(`SSE connection failed: ${response.status}`);
    if (!response.body) throw new Error('SSE response has no body');

    this.parseStream(response.body).catch((error: Error) => {
      if (error.name !== 'AbortError') {
        logger.error(`SSE stream error for ${this.serverName}`, { error: error.message });
        this.state = 'failed';
        this.emit('exit', null, null);
      }
    });
  }

  async parseStream(stream: ReadableStream<Uint8Array>): Promise<void> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const events = buffer.split('\n\n');
      buffer = events.pop() || '';

      for (const event of events) {
        const lines = event.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            try {
              const message = JSON.parse(data) as JsonRpcMessage;
              if (message.jsonrpc === '2.0') this.emit('message', message);
            } catch {
              // Ignore parse errors
            }
          }
        }
      }
    }
  }

  async kill(): Promise<void> {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.state = 'stopped';
    this.addLog('info', 'Disconnected from remote');
    this.emit('exit', null, null);
  }

  isRunning(): boolean {
    return this.state === 'running';
  }

  getStatus(): ServerStatus & { url: string; transport: string } {
    return {
      serverName: this.serverName,
      source: 'remote',
      state: this.state,
      pid: null,
      url: this.config.url,
      transport: this.config.transport,
      uptime: this.startTime ? Date.now() - this.startTime : null,
      retryCount: 0,
      lastError: this.lastError
    };
  }

  getLogs(limit = 100): ServerLog[] {
    return this.logs.slice(-limit);
  }

  async write(data: string): Promise<void> {
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
        const message = JSON.parse(text) as JsonRpcMessage;
        if (message.jsonrpc === '2.0') this.emit('message', message);
      } catch {
        logger.warn(`Non-JSON response from ${this.serverName}`);
      }
    } catch (error) {
      const err = error as Error;
      logger.error(`HTTP request to ${this.serverName} failed`, { error: err.message });
      this.emit('error', err);
    }
  }
}

export function createRemoteServer(serverName: string, config: RemoteServerConfig): RemoteServer {
  return new RemoteServer(serverName, config);
}

export default { RemoteServer, createRemoteServer };
