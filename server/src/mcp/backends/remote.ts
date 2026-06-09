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
import logger, { sanitizeServerName, sanitizeUrl } from '../../logging/logger.js';
import type { RemoteServer as RemoteServerConfig } from '../../types/registry.js';
import type { ServerLog, ServerStatus, ServerState } from './base.js';
import { getConnectionPool } from '../../performance/pool.js';

/**
 * Validate URL to prevent SSRF attacks
 * Ensures URL uses safe protocols and doesn't target private/internal networks
 */
function validateRemoteUrl(urlString: string): void {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    throw new Error(`Invalid URL: ${urlString}`);
  }

  // Only allow HTTP/HTTPS protocols
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`Invalid protocol: ${url.protocol}. Only HTTP/HTTPS allowed.`);
  }

  // Block localhost and private IP ranges to prevent SSRF
  const hostname = url.hostname.toLowerCase();
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname.startsWith('169.254.') || // Link-local
    hostname.startsWith('10.') || // Private class A
    hostname.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./) || // Private class B
    hostname.startsWith('192.168.') || // Private class C
    hostname.startsWith('fc00:') || // Private IPv6
    hostname.startsWith('fe80:') // Link-local IPv6
  ) {
    throw new Error(`Access to private/internal networks is not allowed: ${hostname}`);
  }
}

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
    this.addLog('info', 'Connecting to remote server', {
      url: sanitizeUrl(this.config.url),
      transport: this.config.transport,
    });

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
    // Validate URL to prevent SSRF
    validateRemoteUrl(this.config.url);

    this.abortController = new AbortController();

    // Use connection pool if available
    const pool = getConnectionPool();
    const agent = pool?.getAgentForUrl(this.config.url);

    const response = await fetch(this.config.url, {
      method: 'GET',
      headers: { Accept: 'text/event-stream', ...(this.config.headers || {}) },
      signal: this.abortController.signal,
      // @ts-expect-error - agent is valid for node-fetch
      agent,
    });

    if (!response.ok) throw new Error(`SSE connection failed: ${response.status}`);
    if (!response.body) throw new Error('SSE response has no body');

    this.parseStream(response.body).catch((error: Error) => {
      if (error.name !== 'AbortError') {
        logger.error(`SSE stream error for ${sanitizeServerName(this.serverName)}`, {
          error: error.message,
        });
        this.state = 'failed';
        this.emit('exit', null, null);
      }
    });
  }

  async parseStream(stream: ReadableStream<Uint8Array>): Promise<void> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    // eslint-disable-next-line no-constant-condition
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
      lastError: this.lastError,
    };
  }

  getLogs(limit = 100): ServerLog[] {
    return this.logs.slice(-limit);
  }

  async write(data: string): Promise<void> {
    if (!this.isRunning()) throw new Error(`Server ${this.serverName} is not running`);

    if (this.config.transport === 'sse') {
      logger.warn(
        `Cannot write to SSE remote ${sanitizeServerName(this.serverName)}; SSE is read-only`
      );
      return;
    }

    // Validate URL to prevent SSRF
    validateRemoteUrl(this.config.url);

    const method = this.config.method || 'POST';

    // Use connection pool if available
    const pool = getConnectionPool();
    const agent = pool?.getAgentForUrl(this.config.url);

    try {
      const response = await fetch(this.config.url, {
        method,
        headers: { 'Content-Type': 'application/json', ...(this.config.headers || {}) },
        body: method === 'POST' ? data : undefined,
        // @ts-expect-error - agent is valid for node-fetch
        agent,
      });
      const text = await response.text();
      try {
        const message = JSON.parse(text) as JsonRpcMessage;
        if (message.jsonrpc === '2.0') this.emit('message', message);
      } catch {
        logger.warn(`Non-JSON response from ${sanitizeServerName(this.serverName)}`);
      }
    } catch (error) {
      const err = error as Error;
      logger.error(`HTTP request to ${sanitizeServerName(this.serverName)} failed`, {
        error: err.message,
      });
      this.emit('error', err);
    }
  }
}

export function createRemoteServer(serverName: string, config: RemoteServerConfig): RemoteServer {
  return new RemoteServer(serverName, config);
}

export default { RemoteServer, createRemoteServer };
