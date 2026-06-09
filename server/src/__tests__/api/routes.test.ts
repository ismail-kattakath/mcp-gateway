import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import { createApiRouter } from '../../api/routes.js';
import type { ServerManager } from '../../mcp/backends/index.js';
import type { Registry } from '../../types/registry.js';

// Track the mock registry for ServerModel operations
let testRegistry: Registry;

// Mock ServerModel to update the test registry
vi.mock('../../storage/models/servers.js', () => ({
  ServerModel: vi.fn().mockImplementation(() => ({
    create: vi.fn(async (options: any) => {
      // Add server to test registry
      if (testRegistry && testRegistry.servers) {
        testRegistry.servers[options.name] = options.config;
      }
      return {
        id: 'test-id',
        name: options.name,
        source: options.source,
        config: options.config,
        lifecycle: options.lifecycle || 'on-demand',
        enabled: options.enabled !== false ? 1 : 0,
        tenant: options.tenant || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        created_by: options.created_by || null,
      };
    }),
    update: vi.fn(async (name: string, options: any) => {
      // Update server in test registry
      if (testRegistry && testRegistry.servers && testRegistry.servers[name]) {
        if (options.config) testRegistry.servers[name] = options.config;
        if (options.enabled !== undefined) testRegistry.servers[name].enabled = options.enabled;
        if (options.lifecycle) testRegistry.servers[name].lifecycle = options.lifecycle;
      }
    }),
    delete: vi.fn(async (name: string) => {
      // Delete server from test registry
      if (testRegistry && testRegistry.servers) {
        delete testRegistry.servers[name];
      }
    }),
  })),
}));

// Mock reloadFromDatabase to update the registry in tests
let mockReloadFromDatabase: () => Promise<Registry>;

vi.mock('../../mcp/registry.js', async () => {
  const actual = await vi.importActual('../../mcp/registry.js');
  return {
    ...actual,
    reloadFromDatabase: vi.fn(async () => {
      // This will be set to update the mockRegistry in tests
      return mockReloadFromDatabase
        ? await mockReloadFromDatabase()
        : { version: '2.0', servers: {}, gateway: {} };
    }),
  };
});

describe('API routes', () => {
  let app: Express;
  let mockServerManager: Partial<ServerManager>;
  let mockRegistry: Registry;

  beforeEach(() => {
    testRegistry = mockRegistry = {
      version: '2.0',
      servers: {
        'test-server': {
          source: 'pkg',
          command: 'npx',
          args: ['test-mcp'],
          enabled: true,
          lifecycle: 'on-demand',
          timeout: 30000,
        },
        'disabled-server': {
          source: 'local',
          command: 'node',
          args: ['server.js'],
          enabled: false,
          lifecycle: 'persistent',
        },
      },
      gateway: {
        server: { port: 3000, host: '0.0.0.0', transport: 'sse' },
        storage: { repos: '/tmp/repos', cache: '/tmp/cache', logs: '/tmp/logs' },
        logging: { level: 'info', format: 'json', outputs: ['console'] },
      },
    };

    // Mock reloadFromDatabase to return the current mockRegistry
    mockReloadFromDatabase = vi.fn(async () => mockRegistry);

    mockServerManager = {
      getAllStatuses: vi.fn().mockReturnValue({
        'test-server': { name: 'test-server', state: 'running', pid: 1234 },
        'disabled-server': { name: 'disabled-server', state: 'stopped', pid: null },
      }),
      getServerStatus: vi.fn((name: string) => {
        if (name === 'test-server') {
          return { name, state: 'running', pid: 1234, uptime: 5000 };
        } else if (name === 'disabled-server') {
          return { name, state: 'stopped', pid: null, uptime: 0 };
        }
        return null;
      }),
      startServer: vi.fn().mockResolvedValue(undefined),
      stopServer: vi.fn().mockResolvedValue(undefined),
      getRunningServers: vi.fn().mockReturnValue(['test-server']),
      getServerLogs: vi.fn().mockReturnValue([
        {
          timestamp: '2024-01-01T00:00:00.000Z',
          level: 'info',
          stream: 'stdout',
          message: 'test',
        },
      ]),
    };

    // Create Express app with API router
    app = express();
    app.use(express.json());
    const apiRouter = createApiRouter({
      serverManager: mockServerManager as ServerManager,
      registry: mockRegistry,
    });
    app.use('/api', apiRouter);
  });

  describe('GET /api/servers', () => {
    it('should list all servers', async () => {
      const res = await request(app).get('/api/servers').expect(200);

      expect(res.body).toEqual({
        servers: {
          'test-server': { name: 'test-server', state: 'running', pid: 1234 },
          'disabled-server': { name: 'disabled-server', state: 'stopped', pid: null },
        },
        count: 2,
      });
    });
  });

  describe('GET /api/servers/:serverName', () => {
    it('should get server details', async () => {
      const res = await request(app).get('/api/servers/test-server').expect(200);

      expect(res.body).toEqual({
        name: 'test-server',
        config: mockRegistry.servers['test-server'],
        status: { name: 'test-server', state: 'running', pid: 1234, uptime: 5000 },
      });
    });

    it('should return 404 for unknown server', async () => {
      const res = await request(app).get('/api/servers/unknown').expect(404);

      expect(res.body).toEqual({ error: 'Server not found: unknown' });
    });
  });

  describe('POST /api/servers', () => {
    it('should create a new server', async () => {
      const newServer = {
        name: 'new-server',
        config: {
          source: 'pkg',
          command: 'npx',
          args: ['new-mcp'],
          enabled: true,
          lifecycle: 'persistent',
        },
      };

      const res = await request(app).post('/api/servers').send(newServer).expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.name).toBe('new-server');
      expect(mockServerManager.startServer).toHaveBeenCalledWith('new-server', newServer.config);
      expect(mockRegistry.servers['new-server']).toEqual(newServer.config);
    });

    it('should reject invalid server names', async () => {
      const res = await request(app)
        .post('/api/servers')
        .send({
          name: 'Invalid_Name',
          config: { source: 'pkg', command: 'npx', args: [] },
        })
        .expect(400);

      expect(res.body.error).toContain('Invalid server name');
    });

    it('should reject duplicate server names', async () => {
      const res = await request(app)
        .post('/api/servers')
        .send({
          name: 'test-server',
          config: { source: 'pkg', command: 'npx', args: [] },
        })
        .expect(409);

      expect(res.body.error).toContain('already exists');
    });

    it('should reject missing fields', async () => {
      const res = await request(app).post('/api/servers').send({ name: 'test' }).expect(400);

      expect(res.body.error).toContain('Missing required fields');
    });
  });

  describe('PUT /api/servers/:serverName', () => {
    it('should update server config and restart if running', async () => {
      const newConfig = {
        source: 'pkg' as const,
        command: 'npx',
        args: ['updated-mcp'],
        enabled: true,
      };

      const res = await request(app).put('/api/servers/test-server').send(newConfig).expect(200);

      expect(mockServerManager.stopServer).toHaveBeenCalledWith('test-server');
      expect(mockServerManager.startServer).toHaveBeenCalledWith('test-server', newConfig);
      expect(mockRegistry.servers['test-server']).toEqual(newConfig);
      expect(res.body.success).toBe(true);
      expect(res.body.restarted).toBe(true);
    });

    it('should return 404 for unknown server', async () => {
      const res = await request(app)
        .put('/api/servers/unknown')
        .send({ source: 'pkg', command: 'npx', args: [] })
        .expect(404);

      expect(res.body.error).toContain('not found');
    });

    it('should reject invalid config', async () => {
      const res = await request(app)
        .put('/api/servers/test-server')
        .send({ invalid: true })
        .expect(400);

      expect(res.body.error).toContain('Invalid server configuration');
    });
  });

  describe('DELETE /api/servers/:serverName', () => {
    it('should delete a server', async () => {
      const res = await request(app).delete('/api/servers/test-server').expect(200);

      expect(mockServerManager.stopServer).toHaveBeenCalledWith('test-server');
      expect(mockRegistry.servers['test-server']).toBeUndefined();
      expect(res.body.success).toBe(true);
    });

    it('should return 404 for unknown server', async () => {
      const res = await request(app).delete('/api/servers/unknown').expect(404);

      expect(res.body.error).toContain('not found');
    });
  });

  describe('POST /api/servers/:serverName/start', () => {
    it('should start a server', async () => {
      const res = await request(app).post('/api/servers/test-server/start').expect(200);

      expect(mockServerManager.startServer).toHaveBeenCalledWith(
        'test-server',
        mockRegistry.servers['test-server']
      );
      expect(res.body.success).toBe(true);
      expect(res.body.serverName).toBe('test-server');
    });

    it('should reject starting disabled server', async () => {
      const res = await request(app).post('/api/servers/disabled-server/start').expect(400);

      expect(res.body.error).toContain('disabled');
    });

    it('should return 404 for unknown server', async () => {
      await request(app).post('/api/servers/unknown/start').expect(404);
    });
  });

  describe('POST /api/servers/:serverName/stop', () => {
    it('should stop a server', async () => {
      const res = await request(app).post('/api/servers/test-server/stop').expect(200);

      expect(mockServerManager.stopServer).toHaveBeenCalledWith('test-server');
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /api/servers/:serverName/restart', () => {
    it('should restart a server', async () => {
      const res = await request(app).post('/api/servers/test-server/restart').expect(200);

      expect(mockServerManager.stopServer).toHaveBeenCalledWith('test-server');
      expect(mockServerManager.startServer).toHaveBeenCalledWith(
        'test-server',
        mockRegistry.servers['test-server']
      );
      expect(res.body.success).toBe(true);
    });

    it('should reject restarting disabled server', async () => {
      const res = await request(app).post('/api/servers/disabled-server/restart').expect(400);

      expect(res.body.error).toContain('disabled');
    });
  });

  describe('POST /api/servers/:serverName/enable', () => {
    it('should enable a server', async () => {
      const res = await request(app).post('/api/servers/disabled-server/enable').expect(200);

      expect(mockRegistry.servers['disabled-server'].enabled).toBe(true);
      expect(res.body.success).toBe(true);
      expect(res.body.enabled).toBe(true);
    });

    it('should return 404 for unknown server', async () => {
      await request(app).post('/api/servers/unknown/enable').expect(404);
    });
  });

  describe('POST /api/servers/:serverName/disable', () => {
    it('should disable a server and stop it', async () => {
      const res = await request(app).post('/api/servers/test-server/disable').expect(200);

      expect(mockRegistry.servers['test-server'].enabled).toBe(false);
      expect(mockServerManager.stopServer).toHaveBeenCalledWith('test-server');
      expect(res.body.success).toBe(true);
      expect(res.body.enabled).toBe(false);
    });

    it('should return 404 for unknown server', async () => {
      await request(app).post('/api/servers/unknown/disable').expect(404);
    });
  });

  describe('GET /api/logs', () => {
    it('should get logs for all servers', async () => {
      const res = await request(app).get('/api/logs').expect(200);

      expect(mockServerManager.getRunningServers).toHaveBeenCalled();
      expect(mockServerManager.getServerLogs).toHaveBeenCalledWith('test-server', 100);
      expect(res.body.count).toBe(1);
      expect(res.body.servers['test-server']).toBeDefined();
    });

    it('should respect limit query param', async () => {
      await request(app).get('/api/logs?limit=50').expect(200);

      expect(mockServerManager.getServerLogs).toHaveBeenCalledWith('test-server', 50);
    });
  });

  describe('GET /api/logs/:serverName', () => {
    it('should get logs for specific server', async () => {
      const res = await request(app).get('/api/logs/test-server').expect(200);

      expect(mockServerManager.getServerLogs).toHaveBeenCalledWith('test-server', 100);
      expect(res.body.serverName).toBe('test-server');
      expect(res.body.logs).toBeDefined();
      expect(res.body.count).toBe(1);
    });

    it('should respect limit query param', async () => {
      await request(app).get('/api/logs/test-server?limit=200').expect(200);

      expect(mockServerManager.getServerLogs).toHaveBeenCalledWith('test-server', 200);
    });
  });
});
