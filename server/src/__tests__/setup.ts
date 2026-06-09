import { beforeAll, afterAll, afterEach } from 'vitest';
import fs from 'fs/promises';
import { webcrypto } from 'node:crypto';
import path from 'path';

// Polyfill `globalThis.crypto` for Node 18: it's available but not exposed as
// a global until Node 19. `uuid` v14 calls `crypto.getRandomValues` directly.
if (typeof globalThis.crypto === 'undefined') {
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    configurable: true,
  });
}

// Set test environment
process.env.NODE_ENV = 'test';
process.env.GATEWAY_STORAGE_REPOS = '/tmp/mcp-gateway-test/repos';
process.env.GATEWAY_STORAGE_CACHE = '/tmp/mcp-gateway-test/cache';
process.env.GATEWAY_STORAGE_LOGS = '/tmp/mcp-gateway-test/logs';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-purposes-minimum-32-characters';
process.env.STORAGE_ENCRYPTION_KEY =
  'dGVzdC1lbmNyeXB0aW9uLWtleS1mb3ItdGVzdGluZy1wdXJwb3Nlcy0zMi1ieXRlcw=='; // base64 encoded 32-byte key for testing
process.env.MCP_GATEWAY_DB_PATH = '/tmp/mcp-gateway-test/test.db';

// Clean up test directories and database before and after tests
beforeAll(async () => {
  const testDir = '/tmp/mcp-gateway-test';
  try {
    await fs.rm(testDir, { recursive: true, force: true });
  } catch (e) {
    // Ignore if doesn't exist
  }
  await fs.mkdir(testDir, { recursive: true });
  await fs.mkdir(path.join(testDir, 'repos'), { recursive: true });
  await fs.mkdir(path.join(testDir, 'cache'), { recursive: true });
  await fs.mkdir(path.join(testDir, 'logs'), { recursive: true });

  // Initialize test database
  const { initDatabase } = await import('../storage/database.js');
  initDatabase('/tmp/mcp-gateway-test/test.db');
});

afterAll(async () => {
  const testDir = '/tmp/mcp-gateway-test';
  try {
    await fs.rm(testDir, { recursive: true, force: true });
  } catch (e) {
    // Ignore errors during cleanup
  }
});

// Reset modules between tests to avoid state leakage
afterEach(() => {
  // Reset any global state if needed
});
