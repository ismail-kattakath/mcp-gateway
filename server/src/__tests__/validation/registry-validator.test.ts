import { describe, it, expect } from 'vitest';
import { validateRegistry, validateServer } from '../../validation/registry-validator.js';
import type { Registry, Server } from '../../../../types/registry.js';

describe('registry-validator', () => {
  const minimalValidRegistry: Registry = {
    version: '2.0',
    servers: {
      'test-server': {
        source: 'pkg',
        command: 'npx',
        args: ['-y', 'test-mcp@latest'],
      },
    },
    gateway: {
      server: { port: 3000, host: '0.0.0.0', transport: 'sse' },
      storage: { repos: '/tmp/repos', cache: '/tmp/cache', logs: '/tmp/logs' },
      logging: { level: 'info', format: 'json', outputs: ['console'] },
    },
  };

  describe('schema validation', () => {
    it('should validate minimal valid registry', () => {
      const result = validateRegistry(minimalValidRegistry);
      expect(result.valid).toBe(true);
    });

    it('should reject missing version field', () => {
      const invalid = { ...minimalValidRegistry, version: undefined };
      expect(() => validateRegistry(invalid as unknown as Registry)).toThrow(/validation failed/i);
    });

    it('should reject invalid version', () => {
      const invalid = { ...minimalValidRegistry, version: '1.0' };
      expect(() => validateRegistry(invalid as any)).toThrow();
    });

    it('should reject missing servers field', () => {
      const invalid = { ...minimalValidRegistry, servers: undefined };
      expect(() => validateRegistry(invalid as unknown as Registry)).toThrow(/validation failed/i);
    });

    it('should accept missing gateway field (v2.1+)', () => {
      const valid = { version: '2.0', servers: {} };
      expect(() => validateRegistry(valid as Registry)).not.toThrow();
    });

    it('should reject server with invalid name', () => {
      const invalid = {
        ...minimalValidRegistry,
        servers: {
          Invalid_Name: { source: 'pkg', command: 'npx', args: [] },
        },
      };
      expect(() => validateRegistry(invalid as Registry)).toThrow();
    });

    it('should accept server with valid hyphenated name', () => {
      const valid = {
        ...minimalValidRegistry,
        servers: {
          'my-server-name': { source: 'pkg', command: 'npx', args: ['test'] },
        },
      };
      const result = validateRegistry(valid as any);
      expect(result.valid).toBe(true);
    });

    it('should reject server with uppercase letters', () => {
      const invalid = {
        ...minimalValidRegistry,
        servers: {
          MyServer: { source: 'pkg', command: 'npx', args: [] },
        },
      };
      expect(() => validateRegistry(invalid as Registry)).toThrow();
    });
  });

  describe('pkg source validation', () => {
    it('should validate pkg server with all fields', () => {
      const registry: Registry = {
        ...minimalValidRegistry,
        servers: {
          'pkg-test': {
            source: 'pkg',
            command: 'npx',
            args: ['-y', 'test-mcp@1.0.0'],
            env: { TEST_VAR: 'value' },
            lifecycle: 'persistent',
            enabled: true,
            timeout: 30000,
          },
        },
      };
      const result = validateRegistry(registry);
      expect(result.valid).toBe(true);
    });

    it('should reject pkg server without command', () => {
      const invalid = {
        ...minimalValidRegistry,
        servers: {
          'pkg-test': { source: 'pkg', args: [] },
        },
      };
      expect(() => validateRegistry(invalid as Registry)).toThrow();
    });

    it('should reject pkg server without args', () => {
      const invalid = {
        ...minimalValidRegistry,
        servers: {
          'pkg-test': { source: 'pkg', command: 'npx' },
        },
      };
      expect(() => validateRegistry(invalid as Registry)).toThrow();
    });
  });

  describe('git source validation', () => {
    it('should validate git server with minimal fields', () => {
      const registry: Registry = {
        ...minimalValidRegistry,
        servers: {
          'git-test': {
            source: 'git',
            repo: 'https://github.com/user/repo.git',
            command: 'node',
            args: ['${REPO_DIR}/index.js'],
          },
        },
      };
      const result = validateRegistry(registry);
      expect(result.valid).toBe(true);
    });

    it('should validate git server with branch', () => {
      const registry: Registry = {
        ...minimalValidRegistry,
        servers: {
          'git-test': {
            source: 'git',
            repo: 'https://github.com/user/repo.git',
            branch: 'main',
            command: 'node',
            args: ['index.js'],
          },
        },
      };
      const result = validateRegistry(registry);
      expect(result.valid).toBe(true);
    });

    it('should validate git server with tag', () => {
      const registry: Registry = {
        ...minimalValidRegistry,
        servers: {
          'git-test': {
            source: 'git',
            repo: 'https://github.com/user/repo.git',
            tag: 'v1.0.0',
            command: 'node',
            args: ['index.js'],
          },
        },
      };
      const result = validateRegistry(registry);
      expect(result.valid).toBe(true);
    });

    it('should reject git server with multiple refs', () => {
      const invalid: Registry = {
        ...minimalValidRegistry,
        servers: {
          'git-test': {
            source: 'git',
            repo: 'https://github.com/user/repo.git',
            branch: 'main',
            tag: 'v1.0.0',
            command: 'node',
            args: ['index.js'],
          },
        },
      };
      expect(() => validateRegistry(invalid)).toThrow();
    });

    it('should validate git server with install and build arrays', () => {
      const registry: Registry = {
        ...minimalValidRegistry,
        servers: {
          'git-test': {
            source: 'git',
            repo: 'https://github.com/user/repo.git',
            install: ['npm install'],
            build: ['npm run build'],
            command: 'node',
            args: ['dist/index.js'],
          },
        },
      };
      const result = validateRegistry(registry);
      expect(result.valid).toBe(true);
    });
  });

  describe('container source validation', () => {
    it('should validate container with image', () => {
      const registry: Registry = {
        ...minimalValidRegistry,
        servers: {
          'container-test': {
            source: 'container',
            image: 'ghcr.io/user/mcp-server:latest',
          },
        },
      };
      const result = validateRegistry(registry);
      expect(result.valid).toBe(true);
    });

    it('should validate container with build', () => {
      const registry: Registry = {
        ...minimalValidRegistry,
        servers: {
          'container-test': {
            source: 'container',
            build: {
              repo: 'https://github.com/user/repo.git',
              dockerfile: 'Dockerfile',
              context: '.',
            },
          },
        },
      };
      const result = validateRegistry(registry);
      expect(result.valid).toBe(true);
    });

    it('should reject container without image or build', () => {
      const invalid: Registry = {
        ...minimalValidRegistry,
        servers: {
          'container-test': {
            source: 'container',
          },
        },
      };
      expect(() => validateRegistry(invalid)).toThrow();
    });

    it('should reject container with invalid volume format', () => {
      const invalid: Registry = {
        ...minimalValidRegistry,
        servers: {
          'container-test': {
            source: 'container',
            image: 'test:latest',
            volumes: ['invalid-volume-format'],
          },
        },
      };
      expect(() => validateRegistry(invalid)).toThrow();
    });

    it('should validate container with valid volumes', () => {
      const registry: Registry = {
        ...minimalValidRegistry,
        servers: {
          'container-test': {
            source: 'container',
            image: 'test:latest',
            volumes: ['/host/path:/container/path', '/another:/path:ro'],
          },
        },
      };
      const result = validateRegistry(registry);
      expect(result.valid).toBe(true);
    });

    it('should validate container with ports', () => {
      const registry: Registry = {
        ...minimalValidRegistry,
        servers: {
          'container-test': {
            source: 'container',
            image: 'test:latest',
            ports: { '8080': 8081, '3000': 3001 },
          },
        },
      };
      const result = validateRegistry(registry);
      expect(result.valid).toBe(true);
    });
  });

  describe('remote source validation', () => {
    it('should validate remote server with sse transport', () => {
      const registry: Registry = {
        ...minimalValidRegistry,
        servers: {
          'remote-test': {
            source: 'remote',
            transport: 'sse',
            url: 'https://server.example.com/sse',
          },
        },
      };
      const result = validateRegistry(registry);
      expect(result.valid).toBe(true);
    });

    it('should validate remote server with http transport', () => {
      const registry: Registry = {
        ...minimalValidRegistry,
        servers: {
          'remote-test': {
            source: 'remote',
            transport: 'http',
            url: 'https://api.example.com/mcp',
            method: 'POST',
          },
        },
      };
      const result = validateRegistry(registry);
      expect(result.valid).toBe(true);
    });

    it('should validate remote server with headers', () => {
      const registry: Registry = {
        ...minimalValidRegistry,
        servers: {
          'remote-test': {
            source: 'remote',
            transport: 'sse',
            url: 'https://server.example.com/sse',
            headers: {
              Authorization: 'Bearer ${TOKEN}',
              'X-Custom-Header': 'value',
            },
          },
        },
      };
      const result = validateRegistry(registry);
      expect(result.valid).toBe(true);
    });

    it('should reject remote server without transport', () => {
      const invalid: Registry = {
        ...minimalValidRegistry,
        servers: {
          'remote-test': {
            source: 'remote',
            url: 'https://server.example.com/sse',
          } as Server,
        },
      };
      expect(() => validateRegistry(invalid)).toThrow();
    });
  });

  describe('local source validation', () => {
    it('should validate local server', () => {
      const registry: Registry = {
        ...minimalValidRegistry,
        servers: {
          'local-test': {
            source: 'local',
            command: 'python3',
            args: ['${HOME}/scripts/mcp-server.py'],
          },
        },
      };
      const result = validateRegistry(registry);
      expect(result.valid).toBe(true);
    });

    it('should validate local server with env vars', () => {
      const registry: Registry = {
        ...minimalValidRegistry,
        servers: {
          'local-test': {
            source: 'local',
            command: 'bash',
            args: ['./server.sh'],
            env: { DEBUG: 'true' },
          },
        },
      };
      const result = validateRegistry(registry);
      expect(result.valid).toBe(true);
    });
  });

  describe('gateway security validation', () => {
    it('should validate disableAuth as boolean', () => {
      const registry: Registry = {
        ...minimalValidRegistry,
        gateway: {
          ...minimalValidRegistry.gateway,
          disableAuth: true,
        },
      };
      const result = validateRegistry(registry);
      expect(result.valid).toBe(true);
    });

    it('should validate allowedIPs with CIDR notation', () => {
      const registry: Registry = {
        ...minimalValidRegistry,
        gateway: {
          ...minimalValidRegistry.gateway,
          allowedIPs: ['192.168.1.0/24', '10.0.0.5'],
        },
      };
      const result = validateRegistry(registry);
      expect(result.valid).toBe(true);
    });

    it('should validate allowedIPs with IPv6', () => {
      const registry: Registry = {
        ...minimalValidRegistry,
        gateway: {
          ...minimalValidRegistry.gateway,
          allowedIPs: ['2001:db8::/32'],
        },
      };
      const result = validateRegistry(registry);
      expect(result.valid).toBe(true);
    });
  });

  describe('lifecycle and timeout validation', () => {
    it('should validate on-demand lifecycle', () => {
      const registry: Registry = {
        ...minimalValidRegistry,
        servers: {
          test: {
            source: 'pkg',
            command: 'npx',
            args: ['test'],
            lifecycle: 'on-demand',
          },
        },
      };
      const result = validateRegistry(registry);
      expect(result.valid).toBe(true);
    });

    it('should validate persistent lifecycle', () => {
      const registry: Registry = {
        ...minimalValidRegistry,
        servers: {
          test: {
            source: 'pkg',
            command: 'npx',
            args: ['test'],
            lifecycle: 'persistent',
          },
        },
      };
      const result = validateRegistry(registry);
      expect(result.valid).toBe(true);
    });

    it('should reject invalid lifecycle', () => {
      const invalid: Registry = {
        ...minimalValidRegistry,
        servers: {
          test: {
            source: 'pkg',
            command: 'npx',
            args: ['test'],
            lifecycle: 'invalid' as 'on-demand',
          },
        },
      };
      expect(() => validateRegistry(invalid)).toThrow();
    });

    it('should validate timeout in range', () => {
      const registry: Registry = {
        ...minimalValidRegistry,
        servers: {
          test: {
            source: 'pkg',
            command: 'npx',
            args: ['test'],
            timeout: 60000,
          },
        },
      };
      const result = validateRegistry(registry);
      expect(result.valid).toBe(true);
    });
  });

  describe('validateServer', () => {
    it('should validate single server entry', () => {
      const server: Server = {
        source: 'pkg',
        command: 'npx',
        args: ['-y', 'test-mcp'],
      };
      const result = validateServer('test-server', server);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should return errors for invalid server', () => {
      const server: Server = {
        source: 'pkg',
        command: 'npx',
      } as Server;
      const result = validateServer('test-server', server);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('environment variable patterns', () => {
    it('should validate env vars with UPPER_SNAKE_CASE keys', () => {
      const registry: Registry = {
        ...minimalValidRegistry,
        servers: {
          test: {
            source: 'pkg',
            command: 'npx',
            args: ['test'],
            env: {
              MY_API_KEY: '${MY_API_KEY}',
              ANOTHER_VAR: 'value',
            },
          },
        },
      };
      const result = validateRegistry(registry);
      expect(result.valid).toBe(true);
    });
  });
});
