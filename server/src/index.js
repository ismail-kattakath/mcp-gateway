#!/usr/bin/env node

/**
 * MCP Gateway Server
 *
 * Main entry point. Loads registry.json, starts the server manager,
 * and serves MCP over SSE plus a small JSON API for status/control.
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from './logging/logger.js';
import { initRegistry, getRegistry, getGatewayConfig, watchRegistry } from './mcp/registry.js';
import { getServerManager } from './mcp/backends/index.js';
import {
  streamMessage,
  sendNotification,
  createSuccessResponse,
  handleMCPRequest
} from './mcp/protocol.js';
import { listAllTools } from './mcp/router.js';
import { createAuthMiddleware } from './middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let server = null;
let isShuttingDown = false;

async function initializeServer() {
  try {
    logger.info('Starting MCP Gateway Server');

    const registryPath = process.env.REGISTRY_PATH ||
      path.resolve(__dirname, '../../registry.json');

    logger.info(`Loading registry from: ${registryPath}`);
    await initRegistry(registryPath);
    const registry = getRegistry();
    const gatewayConfig = getGatewayConfig();

    const app = express();
    // Behind a reverse proxy (Caddy/nginx) on loopback — honor X-Forwarded-* so
    // req.ip and req.protocol reflect the real client / scheme.
    app.set('trust proxy', 'loopback');
    app.use(express.json());

    if (gatewayConfig.server.cors?.enabled) {
      const corsOptions = {
        origin: gatewayConfig.server.cors.origins || '*',
        credentials: gatewayConfig.server.cors.credentials || false,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization']
      };
      app.use(cors(corsOptions));
      logger.info('CORS enabled', { origins: corsOptions.origin });
    }

    app.use((req, res, next) => {
      const start = Date.now();
      res.on('finish', () => {
        logger.debug('HTTP request', {
          method: req.method,
          path: req.path,
          status: res.statusCode,
          duration: `${Date.now() - start}ms`,
          ip: req.ip
        });
      });
      next();
    });

    // Auth + IP allowlist. Throws at construction if enableAuth is true but
    // apiKey is empty — fail-closed at startup, not on first request.
    app.use(createAuthMiddleware(gatewayConfig.security));

    const serverManager = getServerManager();
    await serverManager.initialize(registry);

    watchRegistry(async (newRegistry, oldRegistry) => {
      logger.info('Registry changed, reloading servers');
      await serverManager.reload(newRegistry, oldRegistry);
    });

    const sseConnections = new Map();

    // ===== SSE endpoint (MCP transport) =====
    app.get('/sse', async (req, res) => {
      const sessionId = req.query.sessionId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      logger.info('SSE connection established', { ip: req.ip, sessionId });

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      sseConnections.set(sessionId, res);

      sendNotification(res, 'gateway/connected', {
        sessionId,
        message: 'Connected to MCP Gateway',
        version: registry.version,
        timestamp: new Date().toISOString(),
        capabilities: { tools: true, prompts: false, resources: false }
      });

      try {
        const tools = await listAllTools(serverManager, registry);
        streamMessage(res, createSuccessResponse('init_tools', {
          tools: tools.map(tool => ({
            name: tool.name,
            description: tool.description || '',
            inputSchema: tool.inputSchema || { type: 'object', properties: {} }
          }))
        }));
        logger.info(`Sent ${tools.length} tools to client`);
      } catch (error) {
        logger.error('Failed to send initial tools list', { error: error.message });
      }

      const keepAlive = setInterval(() => res.write(`: ping\n\n`), 30000);

      const logHandler = (serverName, entry) => {
        sendNotification(res, 'server/log', { serverName, ...entry });
      };
      serverManager.on('server:log', logHandler);

      const statusHandler = (serverName, status) => {
        sendNotification(res, 'server/status', { serverName, status });
      };
      serverManager.on('server:started', (serverName, pid) => statusHandler(serverName, { state: 'running', pid }));
      serverManager.on('server:exit', (serverName) => statusHandler(serverName, { state: 'stopped' }));

      req.on('close', () => {
        clearInterval(keepAlive);
        serverManager.off('server:log', logHandler);
        sseConnections.delete(sessionId);
        logger.info('SSE connection closed', { ip: req.ip, sessionId });
      });
    });

    // ===== MCP message endpoint =====
    app.post('/mcp/message', async (req, res) => {
      try {
        const request = req.body;
        const sessionId = req.headers['x-session-id'];

        if (!request || !request.jsonrpc || !request.method) {
          return res.status(400).json({
            error: 'Invalid JSON-RPC request',
            details: 'Request must contain jsonrpc and method fields'
          });
        }

        logger.info('MCP message received', { method: request.method, id: request.id, sessionId, ip: req.ip });

        const response = await handleMCPRequest(request, serverManager, registry);

        if (sessionId && sseConnections.has(sessionId)) {
          streamMessage(sseConnections.get(sessionId), response);
          res.json({ status: 'streamed' });
        } else {
          res.json(response);
        }
      } catch (error) {
        logger.error('Error handling MCP message', { error: error.message, stack: error.stack });
        res.status(500).json({
          jsonrpc: '2.0',
          id: req.body?.id || null,
          error: { code: -32603, message: 'Internal error', data: error.message }
        });
      }
    });

    // ===== Health =====
    app.get('/health', (req, res) => {
      const running = serverManager.getRunningServers();
      res.json({
        status: 'ok',
        uptime: process.uptime(),
        version: registry.version,
        servers: {
          total: Object.keys(registry.servers).length,
          enabled: Object.values(registry.servers).filter(s => s.enabled).length,
          running: running.length,
          list: running
        },
        timestamp: new Date().toISOString()
      });
    });

    // ===== Status / config / logs =====
    app.get('/api/status', (req, res) => {
      res.json({
        servers: serverManager.getAllStatuses(),
        gateway: {
          uptime: process.uptime(),
          version: registry.version,
          pid: process.pid,
          memory: process.memoryUsage(),
          nodeVersion: process.version
        },
        timestamp: new Date().toISOString()
      });
    });

    app.get('/api/config', (req, res) => {
      res.json({ version: registry.version, servers: registry.servers, gateway: registry.gateway });
    });

    app.get('/api/logs/:serverName?', (req, res) => {
      const { serverName } = req.params;
      const limit = parseInt(req.query.limit) || 100;

      if (serverName) {
        const logs = serverManager.getServerLogs(serverName, limit);
        res.json({ serverName, logs, count: logs.length });
      } else {
        const all = {};
        for (const name of serverManager.getRunningServers()) {
          all[name] = serverManager.getServerLogs(name, limit);
        }
        res.json({ servers: all, count: Object.keys(all).length });
      }
    });

    // ===== Server control =====
    app.post('/api/servers/:serverName/start', async (req, res) => {
      try {
        const { serverName } = req.params;
        const config = registry.servers[serverName];
        if (!config) return res.status(404).json({ error: `Server not found: ${serverName}` });
        if (!config.enabled) return res.status(400).json({ error: `Server is disabled: ${serverName}` });
        await serverManager.startServer(serverName, config);
        res.json({ success: true, serverName, status: serverManager.getServerStatus(serverName) });
      } catch (error) {
        logger.error('Failed to start server', { error: error.message });
        res.status(500).json({ error: error.message });
      }
    });

    app.post('/api/servers/:serverName/stop', async (req, res) => {
      try {
        const { serverName } = req.params;
        await serverManager.stopServer(serverName);
        res.json({ success: true, serverName, status: serverManager.getServerStatus(serverName) });
      } catch (error) {
        logger.error('Failed to stop server', { error: error.message });
        res.status(500).json({ error: error.message });
      }
    });

    app.use((req, res) => {
      res.status(404).json({ error: 'Not found', path: req.path, method: req.method });
    });

    app.use((err, req, res, next) => {
      logger.error('Express error', { error: err.message, stack: err.stack, path: req.path });
      res.status(err.status || 500).json({ error: err.message || 'Internal server error', path: req.path });
    });

    const port = process.env.GATEWAY_PORT || gatewayConfig.server.port || 3000;
    const host = process.env.GATEWAY_HOST || gatewayConfig.server.host || '127.0.0.1';

    return new Promise((resolve, reject) => {
      server = app.listen(port, host, (err) => {
        if (err) {
          logger.error('Failed to start server', { error: err.message });
          reject(err);
          return;
        }
        logger.info(`MCP Gateway Server listening on http://${host}:${port}`, {
          port, host, env: process.env.NODE_ENV || 'development', pid: process.pid
        });
        logger.info('Available endpoints:', {
          sse: `/sse`,
          health: `/health`,
          status: `/api/status`,
          config: `/api/config`,
          logs: `/api/logs/:serverName?`,
          control: `/api/servers/:serverName/(start|stop)`
        });
        resolve(server);
      });
    });
  } catch (error) {
    logger.error('Failed to initialize server', { error: error.message, stack: error.stack });
    throw error;
  }
}

async function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info(`Received ${signal}, shutting down gracefully...`);

  try {
    if (server) {
      await new Promise(resolve => server.close(resolve));
      logger.info('HTTP server closed');
    }
    const serverManager = getServerManager();
    await serverManager.stopAll();
    logger.info('Shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error: error.message, stack: error.stack });
  shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', { reason: reason?.message || reason, stack: reason?.stack });
});

if (import.meta.url === `file://${process.argv[1]}`) {
  initializeServer().catch((error) => {
    logger.error('Fatal error during startup', { error: error.message, stack: error.stack });
    process.exit(1);
  });
}

export default initializeServer;
