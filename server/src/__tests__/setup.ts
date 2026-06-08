import { beforeAll, afterAll, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';

// Set test environment
process.env.NODE_ENV = 'test';
process.env.GATEWAY_STORAGE_REPOS = '/tmp/mcp-gateway-test/repos';
process.env.GATEWAY_STORAGE_CACHE = '/tmp/mcp-gateway-test/cache';
process.env.GATEWAY_STORAGE_LOGS = '/tmp/mcp-gateway-test/logs';

// Clean up test directories before and after tests
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
