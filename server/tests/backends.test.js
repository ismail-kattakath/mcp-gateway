/**
 * Backend Spawners Test
 *
 * Tests all 11 backend types can be instantiated
 */

import { test } from 'node:test';
import assert from 'node:assert';

import { createNpxBackend } from '../src/mcp/backends/npx.js';
import { createUvxBackend } from '../src/mcp/backends/uvx.js';
import { createPipxBackend } from '../src/mcp/backends/pipx.js';
import { createDockerBackend } from '../src/mcp/backends/docker.js';
import { createGitBackend } from '../src/mcp/backends/git.js';
import { createLocalBackend } from '../src/mcp/backends/local.js';
import { createRemoteBackend } from '../src/mcp/backends/remote.js';
import { createShellBackend } from '../src/mcp/backends/shell.js';

test('NPX backend can be instantiated', () => {
  const config = {
    type: 'npx',
    install: { package: 'test-package' },
    runtime: {}
  };

  const backend = createNpxBackend('test-npx', config);
  assert.ok(backend);
  assert.strictEqual(backend.backendId, 'test-npx');
  assert.strictEqual(backend.state, 'stopped');
});

test('UVX backend can be instantiated', () => {
  const config = {
    type: 'uvx',
    install: { package: 'test-package' },
    runtime: {}
  };

  const backend = createUvxBackend('test-uvx', config);
  assert.ok(backend);
  assert.strictEqual(backend.backendId, 'test-uvx');
  assert.strictEqual(backend.state, 'stopped');
});

test('PIPX backend can be instantiated', () => {
  const config = {
    type: 'pipx',
    install: { package: 'test-package' },
    runtime: {}
  };

  const backend = createPipxBackend('test-pipx', config);
  assert.ok(backend);
  assert.strictEqual(backend.backendId, 'test-pipx');
  assert.strictEqual(backend.state, 'stopped');
});

test('Docker backend can be instantiated', () => {
  const config = {
    type: 'docker',
    install: { image: 'test-image', tag: 'latest' },
    runtime: {}
  };

  const backend = createDockerBackend('test-docker', config);
  assert.ok(backend);
  assert.strictEqual(backend.backendId, 'test-docker');
  assert.strictEqual(backend.state, 'stopped');
});

test('Git-NPM backend can be instantiated', () => {
  const config = {
    type: 'git-npm',
    install: {
      repository: 'https://github.com/test/repo.git',
      branch: 'main',
      build: {
        steps: ['npm install', 'npm run build'],
        entrypoint: 'dist/index.js'
      }
    },
    runtime: { command: 'node' }
  };

  const backend = createGitBackend('test-git-npm', config);
  assert.ok(backend);
  assert.strictEqual(backend.backendId, 'test-git-npm');
  assert.strictEqual(backend.state, 'stopped');
});

test('Git-Python backend can be instantiated', () => {
  const config = {
    type: 'git-python',
    install: {
      repository: 'https://github.com/test/repo.git',
      branch: 'main',
      build: {
        steps: ['uv venv', 'uv pip install -e .'],
        entrypoint: 'main.py'
      }
    },
    runtime: { command: 'python' }
  };

  const backend = createGitBackend('test-git-python', config);
  assert.ok(backend);
  assert.strictEqual(backend.backendId, 'test-git-python');
  assert.strictEqual(backend.state, 'stopped');
});

test('Git-Docker backend can be instantiated', () => {
  const config = {
    type: 'git-docker',
    install: {
      repository: 'https://github.com/test/repo.git',
      branch: 'main',
      dockerfile: 'Dockerfile'
    },
    runtime: {}
  };

  const backend = createGitBackend('test-git-docker', config);
  assert.ok(backend);
  assert.strictEqual(backend.backendId, 'test-git-docker');
  assert.strictEqual(backend.state, 'stopped');
});

test('Local backend can be instantiated', () => {
  const config = {
    type: 'local',
    install: { path: '/path/to/script.js' },
    runtime: { command: 'node' }
  };

  const backend = createLocalBackend('test-local', config);
  assert.ok(backend);
  assert.strictEqual(backend.backendId, 'test-local');
  assert.strictEqual(backend.state, 'stopped');
});

test('Remote SSE backend can be instantiated', () => {
  const config = {
    type: 'remote-sse',
    install: { url: 'https://example.com/sse' },
    runtime: {}
  };

  const backend = createRemoteBackend('test-remote-sse', config);
  assert.ok(backend);
  assert.strictEqual(backend.backendId, 'test-remote-sse');
  assert.strictEqual(backend.state, 'stopped');
});

test('Remote HTTP backend can be instantiated', () => {
  const config = {
    type: 'remote-http',
    install: { url: 'https://example.com/api' },
    runtime: {}
  };

  const backend = createRemoteBackend('test-remote-http', config);
  assert.ok(backend);
  assert.strictEqual(backend.backendId, 'test-remote-http');
  assert.strictEqual(backend.state, 'stopped');
});

test('Shell backend can be instantiated', () => {
  const config = {
    type: 'shell',
    install: { script: '/path/to/script.sh' },
    runtime: { shell: '/bin/bash' }
  };

  const backend = createShellBackend('test-shell', config);
  assert.ok(backend);
  assert.strictEqual(backend.backendId, 'test-shell');
  assert.strictEqual(backend.state, 'stopped');
});

test('All backends implement required interface', () => {
  const backends = [
    createNpxBackend('test', { type: 'npx', install: { package: 'test' }, runtime: {} }),
    createUvxBackend('test', { type: 'uvx', install: { package: 'test' }, runtime: {} }),
    createPipxBackend('test', { type: 'pipx', install: { package: 'test' }, runtime: {} }),
    createDockerBackend('test', { type: 'docker', install: { image: 'test' }, runtime: {} }),
    createGitBackend('test', { type: 'git-npm', install: { repository: 'test' }, runtime: {} }),
    createLocalBackend('test', { type: 'local', install: { path: '/test' }, runtime: {} }),
    createRemoteBackend('test', { type: 'remote-sse', install: { url: 'http://test' }, runtime: {} }),
    createShellBackend('test', { type: 'shell', install: { script: '/test.sh' }, runtime: {} })
  ];

  for (const backend of backends) {
    // Check required methods exist
    assert.strictEqual(typeof backend.spawn, 'function', 'spawn method exists');
    assert.strictEqual(typeof backend.kill, 'function', 'kill method exists');
    assert.strictEqual(typeof backend.isRunning, 'function', 'isRunning method exists');
    assert.strictEqual(typeof backend.getStatus, 'function', 'getStatus method exists');
    assert.strictEqual(typeof backend.getLogs, 'function', 'getLogs method exists');
    assert.strictEqual(typeof backend.write, 'function', 'write method exists');
    assert.strictEqual(typeof backend.read, 'function', 'read method exists');

    // Check required properties exist
    assert.ok(backend.backendId, 'backendId exists');
    assert.ok(backend.config, 'config exists');
    assert.strictEqual(backend.state, 'stopped', 'initial state is stopped');
    assert.ok(Array.isArray(backend.logs), 'logs array exists');
  }
});
