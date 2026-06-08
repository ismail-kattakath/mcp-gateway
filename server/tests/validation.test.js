/**
 * Registry Validation Tests
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { validateRegistry, validateBackend } from '../src/validation/index.js';

test('Valid minimal registry', () => {
  const registry = {
    version: '2.0',
    backends: {},
    gateway: {
      server: { port: 3000, host: '0.0.0.0', transport: 'sse' },
      storage: { repos: '/tmp', cache: '/tmp', logs: '/tmp' },
      logging: { level: 'info', format: 'json', outputs: ['console'] }
    }
  };

  const result = validateRegistry(registry);
  assert.strictEqual(result.valid, true);
});

test('Valid npx backend', () => {
  const registry = {
    version: '2.0',
    backends: {
      'test-npx': {
        name: 'Test NPX',
        description: 'Test backend',
        type: 'npx',
        install: { package: 'test-package' },
        lifecycle: 'on-demand',
        enabled: true
      }
    },
    gateway: {
      server: { port: 3000, host: '0.0.0.0', transport: 'sse' },
      storage: { repos: '/tmp', cache: '/tmp', logs: '/tmp' },
      logging: { level: 'info', format: 'json', outputs: ['console'] }
    }
  };

  const result = validateRegistry(registry);
  assert.strictEqual(result.valid, true);
});

test('Valid docker backend with healthcheck', () => {
  const registry = {
    version: '2.0',
    backends: {
      'test-docker': {
        name: 'Test Docker',
        description: 'Test backend',
        type: 'docker',
        install: {
          image: 'ghcr.io/user/image',
          tag: 'latest',
          pull: 'missing'
        },
        runtime: {
          volumes: ['/host:/container:ro'],
          ports: { '8080': 8080 },
          env: { API_KEY: '${API_KEY}' }
        },
        healthcheck: {
          endpoint: 'http://localhost:8080/health',
          interval: 30,
          timeout: 5,
          retries: 3
        },
        lifecycle: 'persistent',
        enabled: true
      }
    },
    gateway: {
      server: { port: 3000, host: '0.0.0.0', transport: 'sse' },
      storage: { repos: '/tmp', cache: '/tmp', logs: '/tmp' },
      logging: { level: 'info', format: 'json', outputs: ['console'] }
    }
  };

  const result = validateRegistry(registry);
  assert.strictEqual(result.valid, true);
});

test('Valid git-npm backend', () => {
  const registry = {
    version: '2.0',
    backends: {
      'test-git': {
        name: 'Test Git NPM',
        description: 'Test backend',
        type: 'git-npm',
        install: {
          repository: 'https://github.com/user/repo.git',
          branch: 'main',
          build: {
            steps: ['npm install', 'npm run build'],
            entrypoint: 'dist/index.js'
          }
        },
        runtime: {
          command: 'node',
          env: { NODE_ENV: 'production' }
        },
        lifecycle: 'persistent',
        enabled: true
      }
    },
    gateway: {
      server: { port: 3000, host: '0.0.0.0', transport: 'sse' },
      storage: { repos: '/tmp', cache: '/tmp', logs: '/tmp' },
      logging: { level: 'info', format: 'json', outputs: ['console'] }
    }
  };

  const result = validateRegistry(registry);
  assert.strictEqual(result.valid, true);
});

test('Invalid backend - missing required fields', () => {
  const registry = {
    version: '2.0',
    backends: {
      'bad-backend': {
        name: 'Bad Backend',
        description: 'Missing fields',
        type: 'npx',
        lifecycle: 'on-demand',
        enabled: true
        // Missing install field
      }
    },
    gateway: {
      server: { port: 3000, host: '0.0.0.0', transport: 'sse' },
      storage: { repos: '/tmp', cache: '/tmp', logs: '/tmp' },
      logging: { level: 'info', format: 'json', outputs: ['console'] }
    }
  };

  assert.throws(() => validateRegistry(registry), {
    message: 'Registry validation failed'
  });
});

test('Invalid backend - wrong lifecycle value', () => {
  const registry = {
    version: '2.0',
    backends: {
      'bad-backend': {
        name: 'Bad Backend',
        description: 'Bad lifecycle',
        type: 'npx',
        install: { package: 'test' },
        lifecycle: 'sometimes',
        enabled: true
      }
    },
    gateway: {
      server: { port: 3000, host: '0.0.0.0', transport: 'sse' },
      storage: { repos: '/tmp', cache: '/tmp', logs: '/tmp' },
      logging: { level: 'info', format: 'json', outputs: ['console'] }
    }
  };

  assert.throws(() => validateRegistry(registry), {
    message: 'Registry validation failed'
  });
});

test('Invalid gateway - missing required config', () => {
  const registry = {
    version: '2.0',
    backends: {},
    gateway: {
      server: { port: 3000, host: '0.0.0.0', transport: 'sse' }
      // Missing storage and logging
    }
  };

  assert.throws(() => validateRegistry(registry), {
    message: 'Registry validation failed'
  });
});

test('Invalid version', () => {
  const registry = {
    version: '1.0',
    backends: {},
    gateway: {
      server: { port: 3000, host: '0.0.0.0', transport: 'sse' },
      storage: { repos: '/tmp', cache: '/tmp', logs: '/tmp' },
      logging: { level: 'info', format: 'json', outputs: ['console'] }
    }
  };

  assert.throws(() => validateRegistry(registry), {
    message: 'Registry validation failed'
  });
});

test('Valid backend with OAuth', () => {
  const registry = {
    version: '2.0',
    backends: {
      'oauth-backend': {
        name: 'OAuth Backend',
        description: 'Backend with OAuth',
        type: 'npx',
        install: { package: 'test-package' },
        runtime: {
          env: { TOKEN: '${GITHUB_ACCESS_TOKEN}' }
        },
        auth: {
          type: 'oauth',
          provider: 'github',
          scopes: ['repo'],
          tokenRefresh: true
        },
        lifecycle: 'persistent',
        enabled: true
      }
    },
    gateway: {
      server: { port: 3000, host: '0.0.0.0', transport: 'sse' },
      storage: { repos: '/tmp', cache: '/tmp', logs: '/tmp' },
      logging: { level: 'info', format: 'json', outputs: ['console'] },
      oauth: {
        providers: {
          github: {
            clientId: '${GITHUB_CLIENT_ID}',
            clientSecret: '${GITHUB_CLIENT_SECRET}',
            callbackUrl: 'http://localhost:3000/oauth/github/callback'
          }
        }
      }
    }
  };

  const result = validateRegistry(registry);
  assert.strictEqual(result.valid, true);
});

test('validateBackend helper', () => {
  const backend = {
    name: 'Test',
    description: 'Test backend',
    type: 'npx',
    install: { package: 'test' },
    lifecycle: 'on-demand',
    enabled: true
  };

  const result = validateBackend('test', backend);
  assert.strictEqual(result.valid, true);
});

test('validateBackend helper - invalid', () => {
  const backend = {
    name: 'Test',
    description: 'Test backend',
    type: 'npx',
    // Missing install
    lifecycle: 'on-demand',
    enabled: true
  };

  const result = validateBackend('test', backend);
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.length > 0);
});
