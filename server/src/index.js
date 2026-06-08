#!/usr/bin/env node

/**
 * MCP Gateway Server
 *
 * Main entry point for the MCP Gateway server
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from './logging/logger.js';
import { initRegistry, getRegistry, getGatewayConfig, watchRegistry } from './mcp/registry.js';
import { getBackendManager } from './mcp/backends/index.js';
import {
  handleAndStreamRequest,
  streamMessage,
  sendNotification,
  createSuccessResponse
} from './mcp/protocol.js';
import { listAllTools } from './mcp/router.js';
import { initializeOAuth, createOAuthRouter, getOAuthManager } from './oauth/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Server state
let server = null;
let isShuttingDown = false;

/**
 * Initialize the gateway server
 */
async function initializeServer() {
  try {
    logger.info('Starting MCP Gateway Server');

    // Load registry
    const registryPath = process.env.REGISTRY_PATH ||
      path.resolve(__dirname, '../../registry.json');

    logger.info(`Loading registry from: ${registryPath}`);
    await initRegistry(registryPath);
    const registry = getRegistry();
    const gatewayConfig = getGatewayConfig();

    // Create Express app
    const app = express();

    // Middleware
    app.use(express.json());

    // CORS configuration
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

    // Request logging middleware
    app.use((req, res, next) => {
      const start = Date.now();
      res.on('finish', () => {
        const duration = Date.now() - start;
        logger.debug('HTTP request', {
          method: req.method,
          path: req.path,
          status: res.statusCode,
          duration: `${duration}ms`,
          ip: req.ip
        });
      });
      next();
    });

    // ===== OAuth Routes =====
    const oauthRouter = createOAuthRouter();
    app.use('/oauth', oauthRouter);
    logger.info('OAuth routes mounted at /oauth');

    // Initialize OAuth system
    logger.info('Initializing OAuth system');
    await initializeOAuth();
    const oauthManager = getOAuthManager();

    // Listen for token refresh events
    oauthManager.on('token:refreshed', ({ provider, expiresAt }) => {
      logger.info('OAuth token refreshed', { provider, expiresAt });
    });

    oauthManager.on('token:refresh_failed', ({ provider, error }) => {
      logger.error('OAuth token refresh failed', { provider, error });
    });

    // Initialize backend manager
    const backendManager = getBackendManager();
    await backendManager.initialize(registry);

    // Watch registry for changes
    watchRegistry(async (newRegistry, oldRegistry) => {
      logger.info('Registry changed, reloading backends');
      await backendManager.reload(newRegistry, oldRegistry);
    });

    // ===== SSE Endpoint (MCP Protocol) =====
    app.get('/sse', async (req, res) => {
      const sessionId = req.query.sessionId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      logger.info('SSE connection established', { ip: req.ip, sessionId });

      // Set SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

      // Register this connection
      sseConnections.set(sessionId, res);

      // Send MCP initialize notification with session ID
      sendNotification(res, 'gateway/connected', {
        sessionId,
        message: 'Connected to MCP Gateway',
        version: registry.version,
        timestamp: new Date().toISOString(),
        capabilities: {
          tools: true,
          prompts: false,
          resources: false
        }
      });

      // Send initial tools list
      try {
        const tools = await listAllTools(backendManager, registry);
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

      // Keep-alive ping every 30 seconds
      const keepAlive = setInterval(() => {
        res.write(`: ping\n\n`);
      }, 30000);

      // Listen for backend logs (optional, for debugging)
      const logHandler = (backendId, entry) => {
        sendNotification(res, 'backend/log', {
          backendId,
          ...entry
        });
      };
      backendManager.on('backend:log', logHandler);

      // Listen for backend status changes
      const statusHandler = (backendId, status) => {
        sendNotification(res, 'backend/status', {
          backendId,
          status
        });
      };
      backendManager.on('backend:started', (backendId, pid) => {
        statusHandler(backendId, { state: 'running', pid });
      });
      backendManager.on('backend:exit', (backendId) => {
        statusHandler(backendId, { state: 'stopped' });
      });

      // Cleanup on disconnect
      req.on('close', () => {
        clearInterval(keepAlive);
        backendManager.off('backend:log', logHandler);
        sseConnections.delete(sessionId);
        logger.info('SSE connection closed', { ip: req.ip, sessionId });
      });
    });

    // ===== MCP Message Endpoint (for SSE clients to send requests) =====
    // Store active SSE connections
    const sseConnections = new Map();

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

        logger.info('MCP message received', {
          method: request.method,
          id: request.id,
          sessionId,
          ip: req.ip
        });

        // Import protocol handler
        const { handleMCPRequest } = await import('./mcp/protocol.js');
        const response = await handleMCPRequest(request, backendManager, registry);

        // If this is associated with an SSE connection, stream the response
        if (sessionId && sseConnections.has(sessionId)) {
          const sseRes = sseConnections.get(sessionId);
          streamMessage(sseRes, response);
          res.json({ status: 'streamed' });
        } else {
          // Otherwise, return directly
          res.json(response);
        }
      } catch (error) {
        logger.error('Error handling MCP message', {
          error: error.message,
          stack: error.stack
        });

        res.status(500).json({
          jsonrpc: '2.0',
          id: req.body?.id || null,
          error: {
            code: -32603,
            message: 'Internal error',
            data: error.message
          }
        });
      }
    });

    // ===== Health Check =====
    app.get('/health', (req, res) => {
      const runningBackends = backendManager.getRunningBackends();
      res.json({
        status: 'ok',
        uptime: process.uptime(),
        version: registry.version,
        backends: {
          total: Object.keys(registry.backends).length,
          enabled: Object.values(registry.backends).filter(b => b.enabled).length,
          running: runningBackends.length,
          list: runningBackends
        },
        timestamp: new Date().toISOString()
      });
    });

    // ===== Status Endpoint =====
    app.get('/api/status', async (req, res) => {
      const statuses = backendManager.getAllStatuses();

      // Get OAuth status
      let oauthStatus = {};
      try {
        const { getAllTokens } = await import('./oauth/tokenStore.js');
        const tokens = await getAllTokens();

        for (const [provider, token] of Object.entries(tokens)) {
          const isExpired = token.expires_at && new Date(token.expires_at) < new Date();
          oauthStatus[provider] = {
            connected: true,
            expired: isExpired,
            expires_at: token.expires_at,
            scopes: token.scopes || []
          };
        }
      } catch (error) {
        logger.error('Failed to get OAuth status', { error: error.message });
      }

      res.json({
        backends: statuses,
        oauth: oauthStatus,
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

    // ===== Config Endpoint =====
    app.get('/api/config', (req, res) => {
      res.json({
        version: registry.version,
        backends: registry.backends,
        gateway: registry.gateway
      });
    });

    // ===== Logs Endpoint =====
    app.get('/api/logs/:backendId?', (req, res) => {
      const { backendId } = req.params;
      const limit = parseInt(req.query.limit) || 100;

      if (backendId) {
        // Get logs for specific backend
        const logs = backendManager.getBackendLogs(backendId, limit);
        res.json({
          backendId,
          logs,
          count: logs.length
        });
      } else {
        // Get logs for all backends
        const allLogs = {};
        const runningBackends = backendManager.getRunningBackends();

        for (const id of runningBackends) {
          allLogs[id] = backendManager.getBackendLogs(id, limit);
        }

        res.json({
          backends: allLogs,
          count: Object.keys(allLogs).length
        });
      }
    });

    // ===== Backend Control Endpoints =====
    app.post('/api/backends/:backendId/start', async (req, res) => {
      try {
        const { backendId } = req.params;
        const config = registry.backends[backendId];

        if (!config) {
          return res.status(404).json({ error: `Backend not found: ${backendId}` });
        }

        if (!config.enabled) {
          return res.status(400).json({ error: `Backend is disabled: ${backendId}` });
        }

        await backendManager.startBackend(backendId, config);
        res.json({
          success: true,
          backendId,
          status: backendManager.getBackendStatus(backendId)
        });
      } catch (error) {
        logger.error('Failed to start backend', { error: error.message });
        res.status(500).json({ error: error.message });
      }
    });

    app.post('/api/backends/:backendId/stop', async (req, res) => {
      try {
        const { backendId } = req.params;
        await backendManager.stopBackend(backendId);
        res.json({
          success: true,
          backendId,
          status: backendManager.getBackendStatus(backendId)
        });
      } catch (error) {
        logger.error('Failed to stop backend', { error: error.message });
        res.status(500).json({ error: error.message });
      }
    });

    // ===== 404 Handler =====
    app.use((req, res) => {
      res.status(404).json({
        error: 'Not found',
        path: req.path,
        method: req.method
      });
    });

    // ===== Error Handler =====
    app.use((err, req, res, next) => {
      logger.error('Express error', {
        error: err.message,
        stack: err.stack,
        path: req.path,
        method: req.method
      });

      res.status(err.status || 500).json({
        error: err.message || 'Internal server error',
        path: req.path
      });
    });

    // Start server
    const port = process.env.GATEWAY_PORT || gatewayConfig.server.port || 3000;
    const host = process.env.GATEWAY_HOST || gatewayConfig.server.host || '0.0.0.0';

    return new Promise((resolve, reject) => {
      server = app.listen(port, host, (err) => {
        if (err) {
          logger.error('Failed to start server', { error: err.message });
          reject(err);
          return;
        }

        logger.info(`MCP Gateway Server listening on http://${host}:${port}`, {
          port,
          host,
          env: process.env.NODE_ENV || 'development',
          pid: process.pid
        });

        logger.info('Available endpoints:', {
          sse: `/sse`,
          health: `/health`,
          status: `/api/status`,
          config: `/api/config`,
          logs: `/api/logs/:backendId?`,
          control: `/api/backends/:backendId/(start|stop)`
        });

        resolve(server);
      });
    });
  } catch (error) {
    logger.error('Failed to initialize server', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Graceful shutdown handler
 */
async function shutdown(signal) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  logger.info(`Received ${signal}, shutting down gracefully...`);

  try {
    // Stop accepting new connections
    if (server) {
      await new Promise((resolve) => {
        server.close(resolve);
      });
      logger.info('HTTP server closed');
    }

    // Stop OAuth manager
    const oauthManager = getOAuthManager();
    await oauthManager.shutdown();

    // Stop all backends
    const backendManager = getBackendManager();
    await backendManager.stopAll();

    logger.info('Shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', {
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  }
}

// Handle shutdown signals
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', {
    error: error.message,
    stack: error.stack
  });
  shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', {
    reason: reason?.message || reason,
    stack: reason?.stack
  });
});

// Start server
if (import.meta.url === `file://${process.argv[1]}`) {
  initializeServer().catch((error) => {
    logger.error('Fatal error during startup', {
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  });
}

export default initializeServer;
