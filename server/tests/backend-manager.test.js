/**
 * Backend Manager Integration Test
 *
 * Tests the backend manager can create and manage different backend types
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { BackendManager } from '../src/mcp/backends/index.js';

test('BackendManager can be instantiated', () => {
  const manager = new BackendManager();
  assert.ok(manager);
  assert.ok(manager.backends instanceof Map);
});

test('BackendManager can create NPX backend', async () => {
  const manager = new BackendManager();

  const config = {
    type: 'npx',
    install: { package: 'test-package' },
    runtime: {},
    lifecycle: 'on-demand',
    enabled: true
  };

  // Don't actually spawn, just verify creation
  const backend = await manager.startBackend('test-npx', config).catch(err => {
    // Expected to fail since package doesn't exist
    return null;
  });

  // Check backend was stored in manager
  const stored = manager.backends.get('test-npx');
  assert.ok(stored);
  assert.strictEqual(stored.backendId, 'test-npx');
});

test('BackendManager can create UVX backend', async () => {
  const manager = new BackendManager();

  const config = {
    type: 'uvx',
    install: { package: 'test-package' },
    runtime: {},
    lifecycle: 'on-demand',
    enabled: true
  };

  await manager.startBackend('test-uvx', config).catch(() => {});
  const stored = manager.backends.get('test-uvx');
  assert.ok(stored);
});

test('BackendManager can create PIPX backend', async () => {
  const manager = new BackendManager();

  const config = {
    type: 'pipx',
    install: { package: 'test-package' },
    runtime: {},
    lifecycle: 'on-demand',
    enabled: true
  };

  await manager.startBackend('test-pipx', config).catch(() => {});
  const stored = manager.backends.get('test-pipx');
  assert.ok(stored);
});

test('BackendManager can create Docker backend', async () => {
  const manager = new BackendManager();

  const config = {
    type: 'docker',
    install: { image: 'test-image', tag: 'latest' },
    runtime: {},
    lifecycle: 'on-demand',
    enabled: true
  };

  await manager.startBackend('test-docker', config).catch(() => {});
  const stored = manager.backends.get('test-docker');
  assert.ok(stored);
});

test('BackendManager can create Git backend', async () => {
  const manager = new BackendManager();

  const config = {
    type: 'git-npm',
    install: {
      repository: 'https://github.com/test/repo.git',
      build: { steps: [], entrypoint: 'index.js' }
    },
    runtime: { command: 'node' },
    lifecycle: 'on-demand',
    enabled: true
  };

  await manager.startBackend('test-git', config).catch(() => {});
  const stored = manager.backends.get('test-git');
  assert.ok(stored);
});

test('BackendManager can create Local backend', async () => {
  const manager = new BackendManager();

  const config = {
    type: 'local',
    install: { path: '/nonexistent/script.js' },
    runtime: { command: 'node' },
    lifecycle: 'on-demand',
    enabled: true
  };

  await manager.startBackend('test-local', config).catch(() => {});
  const stored = manager.backends.get('test-local');
  assert.ok(stored);
});

test('BackendManager can create Remote backend', async () => {
  const manager = new BackendManager();

  const config = {
    type: 'remote-sse',
    install: { url: 'http://example.com/sse' },
    runtime: {},
    lifecycle: 'on-demand',
    enabled: true
  };

  await manager.startBackend('test-remote', config).catch(() => {});
  const stored = manager.backends.get('test-remote');
  assert.ok(stored);
});

test('BackendManager can create Shell backend', async () => {
  const manager = new BackendManager();

  const config = {
    type: 'shell',
    install: { script: '/nonexistent/script.sh' },
    runtime: {},
    lifecycle: 'on-demand',
    enabled: true
  };

  await manager.startBackend('test-shell', config).catch(() => {});
  const stored = manager.backends.get('test-shell');
  assert.ok(stored);
});

test('BackendManager rejects unknown backend type', async () => {
  const manager = new BackendManager();

  const config = {
    type: 'unknown-type',
    install: {},
    runtime: {},
    lifecycle: 'on-demand',
    enabled: true
  };

  await assert.rejects(
    manager.startBackend('test-unknown', config),
    /Unknown backend type/
  );
});

test('BackendManager can get backend status', async () => {
  const manager = new BackendManager();

  const config = {
    type: 'npx',
    install: { package: 'test-package' },
    runtime: {},
    lifecycle: 'on-demand',
    enabled: true
  };

  await manager.startBackend('test-status', config).catch(() => {});

  const status = manager.getBackendStatus('test-status');
  assert.ok(status);
  assert.strictEqual(status.backendId, 'test-status');
  assert.ok(status.state);
});

test('BackendManager can stop backend', async () => {
  const manager = new BackendManager();

  const config = {
    type: 'npx',
    install: { package: 'test-package' },
    runtime: {},
    lifecycle: 'on-demand',
    enabled: true
  };

  await manager.startBackend('test-stop', config).catch(() => {});
  await manager.stopBackend('test-stop');

  const backend = manager.backends.get('test-stop');
  assert.strictEqual(backend, undefined);
});

test('BackendManager can get all statuses', async () => {
  const manager = new BackendManager();

  const config = {
    type: 'npx',
    install: { package: 'test-package' },
    runtime: {},
    lifecycle: 'on-demand',
    enabled: true
  };

  await manager.startBackend('test-1', config).catch(() => {});
  await manager.startBackend('test-2', config).catch(() => {});

  const statuses = manager.getAllStatuses();
  assert.ok(statuses);
  assert.ok(statuses['test-1']);
  assert.ok(statuses['test-2']);
});

test('BackendManager can stop all backends', async () => {
  const manager = new BackendManager();

  const config = {
    type: 'npx',
    install: { package: 'test-package' },
    runtime: {},
    lifecycle: 'on-demand',
    enabled: true
  };

  await manager.startBackend('test-a', config).catch(() => {});
  await manager.startBackend('test-b', config).catch(() => {});

  await manager.stopAll();

  assert.strictEqual(manager.backends.size, 0);
});
