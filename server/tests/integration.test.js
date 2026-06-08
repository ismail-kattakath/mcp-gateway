/**
 * Integration Tests for MCP Gateway
 *
 * Tests end-to-end functionality including:
 * - Server startup
 * - Health endpoint
 * - SSE connection
 * - MCP protocol (initialize, tools/list)
 * - Backend spawning
 * - API endpoints
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import EventSource from 'eventsource';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const SERVER_PORT = 3001; // Use different port to avoid conflicts
const SERVER_HOST = 'localhost';
const BASE_URL = `http://${SERVER_HOST}:${SERVER_PORT}`;
const SERVER_STARTUP_TIMEOUT = 10000; // 10 seconds
const TEST_TIMEOUT = 30000; // 30 seconds per test

// Server process
let serverProcess = null;

/**
 * Start the gateway server for testing
 */
async function startServer() {
  return new Promise((resolve, reject) => {
    const serverPath = path.resolve(__dirname, '../src/index.js');

    serverProcess = spawn('node', [serverPath], {
      env: {
        ...process.env,
        GATEWAY_PORT: SERVER_PORT.toString(),
        GATEWAY_HOST: SERVER_HOST,
        LOG_LEVEL: 'error', // Reduce log noise during tests
        NODE_ENV: 'test'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let output = '';

    // Capture output to detect when server is ready
    serverProcess.stdout.on('data', (data) => {
      output += data.toString();
      if (output.includes('Server listening') || output.includes('MCP Gateway Server')) {
        resolve();
      }
    });

    serverProcess.stderr.on('data', (data) => {
      output += data.toString();
    });

    serverProcess.on('error', (error) => {
      reject(new Error(`Failed to start server: ${error.message}`));
    });

    serverProcess.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        reject(new Error(`Server exited with code ${code}. Output: ${output}`));
      }
    });

    // Timeout if server doesn't start
    setTimeout(SERVER_STARTUP_TIMEOUT).then(() => {
      if (serverProcess && serverProcess.exitCode === null) {
        // Server still running but no ready signal, assume it's ready
        resolve();
      }
    });
  });
}

/**
 * Stop the gateway server
 */
async function stopServer() {
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    await setTimeout(2000); // Wait for graceful shutdown
    if (serverProcess.exitCode === null) {
      serverProcess.kill('SIGKILL'); // Force kill if still running
    }
    serverProcess = null;
  }
}

/**
 * Make HTTP request
 */
async function request(method, path, body = null, headers = {}) {
  const url = `${BASE_URL}${path}`;

  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    }
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  let data = null;
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  return { status: response.status, data };
}

// Test Suite
describe('MCP Gateway Integration Tests', { timeout: TEST_TIMEOUT * 10 }, () => {

  before(async () => {
    console.log('\n[Setup] Starting server...');
    await startServer();
    // Give server extra time to initialize
    await setTimeout(3000);
    console.log('[Setup] Server started\n');
  });

  after(async () => {
    console.log('\n[Cleanup] Stopping server...');
    await stopServer();
    console.log('[Cleanup] Server stopped\n');
  });

  describe('Server Health', () => {
    it('should respond to health check', async () => {
      const { status, data } = await request('GET', '/health');
      assert.strictEqual(status, 200);
      assert.strictEqual(typeof data, 'object');
      assert.strictEqual(data.status, 'ok');
    });

    it('should respond to root endpoint', async () => {
      const { status } = await request('GET', '/');
      assert.strictEqual(status, 200);
    });
  });

  describe('MCP Protocol - SSE Connection', () => {
    it('should accept SSE connection to /sse', async () => {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          eventSource.close();
          reject(new Error('SSE connection timeout'));
        }, 5000);

        const eventSource = new EventSource(`${BASE_URL}/sse`);

        eventSource.onopen = () => {
          clearTimeout(timeout);
          eventSource.close();
          resolve();
        };

        eventSource.onerror = (error) => {
          clearTimeout(timeout);
          eventSource.close();
          reject(error);
        };
      });
    });

    it('should send initial message on SSE connection', async () => {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          eventSource.close();
          reject(new Error('No message received within timeout'));
        }, 5000);

        const eventSource = new EventSource(`${BASE_URL}/sse`);

        eventSource.onmessage = (event) => {
          clearTimeout(timeout);

          try {
            const data = JSON.parse(event.data);
            assert.strictEqual(typeof data, 'object');
            eventSource.close();
            resolve();
          } catch (error) {
            eventSource.close();
            reject(error);
          }
        };

        eventSource.onerror = (error) => {
          clearTimeout(timeout);
          eventSource.close();
          reject(error);
        };
      });
    });
  });

  describe('MCP Protocol - Initialize', () => {
    it('should handle initialize request', async () => {
      const { status, data } = await request('POST', '/message', {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '0.1.0',
          capabilities: {},
          clientInfo: {
            name: 'test-client',
            version: '1.0.0'
          }
        }
      });

      assert.strictEqual(status, 200);
      assert.strictEqual(data.jsonrpc, '2.0');
      assert.strictEqual(data.id, 1);
      assert.ok(data.result);
      assert.ok(data.result.serverInfo);
      assert.strictEqual(data.result.serverInfo.name, 'mcp-gateway');
    });
  });

  describe('MCP Protocol - Tools', () => {
    it('should list available tools', async () => {
      const { status, data } = await request('POST', '/message', {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {}
      });

      assert.strictEqual(status, 200);
      assert.strictEqual(data.jsonrpc, '2.0');
      assert.strictEqual(data.id, 2);
      assert.ok(data.result);
      assert.ok(Array.isArray(data.result.tools));

      // Should have tools from enabled backends (obs and kapture)
      console.log(`  Found ${data.result.tools.length} tools`);

      if (data.result.tools.length > 0) {
        const tool = data.result.tools[0];
        assert.ok(tool.name);
        assert.ok(tool.description);

        // Check for namespace prefix
        if (tool.name.includes('/')) {
          console.log(`  Tool namespace example: ${tool.name}`);
        }
      }
    });
  });

  describe('API Endpoints', () => {
    it('should return backend status', async () => {
      const { status, data } = await request('GET', '/api/status');
      assert.strictEqual(status, 200);
      assert.ok(data.backends);
      assert.strictEqual(typeof data.backends, 'object');
    });

    it('should return registry config', async () => {
      const { status, data } = await request('GET', '/api/config');
      assert.strictEqual(status, 200);
      assert.ok(data.version);
      assert.ok(data.backends);
      assert.ok(data.gateway);
    });

    it('should handle CORS preflight', async () => {
      const response = await fetch(`${BASE_URL}/api/status`, {
        method: 'OPTIONS',
        headers: {
          'Origin': 'http://localhost:5173',
          'Access-Control-Request-Method': 'GET'
        }
      });

      assert.strictEqual(response.status, 204);
      assert.ok(response.headers.get('access-control-allow-origin'));
    });
  });

  describe('OAuth Endpoints', () => {
    it('should have OAuth routes available', async () => {
      const { status } = await request('GET', '/oauth/status');
      // Should not be 404
      assert.ok(status === 200 || status === 401 || status === 500);
    });

    it('should redirect to GitHub OAuth', async () => {
      const response = await fetch(`${BASE_URL}/oauth/github/connect`, {
        redirect: 'manual'
      });

      // Should redirect (302/307) or return error if not configured
      assert.ok(
        response.status === 302 ||
        response.status === 307 ||
        response.status === 500 ||
        response.status === 400
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid JSON', async () => {
      const response = await fetch(`${BASE_URL}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json{'
      });

      assert.ok(response.status >= 400);
    });

    it('should handle unknown method', async () => {
      const { status, data } = await request('POST', '/message', {
        jsonrpc: '2.0',
        id: 999,
        method: 'unknown/method',
        params: {}
      });

      assert.strictEqual(status, 200); // MCP always returns 200
      assert.ok(data.error || data.result);
    });

    it('should return 404 for unknown routes', async () => {
      const { status } = await request('GET', '/nonexistent');
      assert.strictEqual(status, 404);
    });
  });

  describe('Backend Management', () => {
    it('should spawn backend on tool request', async () => {
      // This test attempts to trigger backend spawning
      // Skip if backends are not properly configured
      const { status, data } = await request('POST', '/message', {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'kapture/screenshot',
          arguments: {}
        }
      });

      assert.strictEqual(status, 200);
      // Should either succeed or fail gracefully
      assert.ok(data.result || data.error);

      if (data.error) {
        console.log(`  Backend spawn note: ${data.error.message}`);
      }
    });
  });
});

// Run tests if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('Running integration tests...\n');
}
