#!/usr/bin/env node

/**
 * MCP Gateway Server
 *
 * Main entry point. Loads registry.json, starts the server manager,
 * and serves MCP over SSE plus a small JSON API for status/control.
 *
 * Flags:
 *   --debug            Enable debug logging
 *   PRINT_API_KEY=true  Print API key and exit
 *   ROTATE_API_KEY=true Generate new API key and exit
 */

import 'dotenv/config';
import express, { Request, Response, NextFunction, Express } from 'express';
import cors from 'cors';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { Server as HttpServer } from 'http';
import logger from './logging/logger.js';
import { initRegistry, getRegistry, getGatewayConfig, watchRegistry } from './mcp/registry.js';
import { getServerManager } from './mcp/backends/index.js';
import {
  streamMessage,
  sendNotification,
  createSuccessResponse,
  handleMCPRequest,
} from './mcp/protocol.js';
import { listAllTools } from './mcp/router.js';
import { createAuthMiddleware } from './middleware/auth.js';
import { getOrCreateApiKey, printApiKeyAndExit, rotateApiKeyAndExit } from './security/apikey.js';
import { startStdioTransport } from './mcp/stdio-transport.js';
import { createApiRouter } from './api/routes.js';
import { swaggerSpec, swaggerUi, swaggerUiOptions } from './api/swagger.js';
import type { JsonRpcRequest } from './mcp/protocol.js';
import type { ServerLog } from './mcp/backends/base.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let server: HttpServer | null = null;
let isShuttingDown = false;

async function initializeServer(): Promise<HttpServer | null> {
  try {
    // Parse command-line flags
    const debugFlag = process.argv.includes('--debug');
    if (debugFlag) {
      process.env.LOG_LEVEL = 'debug';
      logger.level = 'debug';
      logger.debug('Debug logging enabled via --debug flag');
    }

    logger.info('Starting MCP Gateway Server');

    // Handle utility env vars first (they print and exit)
    if (process.env.PRINT_API_KEY === 'true') {
      await printApiKeyAndExit();
    }
    if (process.env.ROTATE_API_KEY === 'true') {
      await rotateApiKeyAndExit();
    }

    const registryPath =
      process.env.REGISTRY_PATH || path.resolve(__dirname, '../../registry.json');

    logger.info(`Loading registry from: ${registryPath}`);
    await initRegistry(registryPath);
    const registry = getRegistry();
    const gatewayConfig = getGatewayConfig();

    // Load or generate API key (persisted in ~/.mcp/gateway-api-key)
    const apiKey = await getOrCreateApiKey();

    const app: Express = express();
    // Behind a reverse proxy on loopback — honor X-Forwarded-* so
    // req.ip and req.protocol reflect the real client / scheme.
    app.set('trust proxy', 'loopback');
    app.use(express.json());

    if (gatewayConfig.server.cors?.enabled) {
      const corsOptions = {
        origin: gatewayConfig.server.cors.origins || '*',
        credentials: gatewayConfig.server.cors.credentials ?? true, // Fixed: use ?? instead of || to respect schema default of true
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
      };
      app.use(cors(corsOptions));
      logger.info('CORS enabled', { origins: corsOptions.origin });
    }

    app.use((req: Request, res: Response, next: NextFunction) => {
      const start = Date.now();
      res.on('finish', () => {
        logger.debug('HTTP request', {
          method: req.method,
          path: req.path,
          status: res.statusCode,
          duration: `${Date.now() - start}ms`,
          ip: req.ip,
        });
      });
      next();
    });

    // Auth + IP allowlist. Reads from auth config file (.mcp-gateway.json).
    // Throws at construction if auth is enabled but key generation failed.
    app.use(createAuthMiddleware(registryPath, apiKey));

    const serverManager = getServerManager();
    await serverManager.initialize(registry);

    // Check if stdin is a pipe (docker run -i) → enable stdio transport
    // Only enable if stdin is readable AND not explicitly disabled
    const stdioDisabled =
      process.env.DISABLE_STDIO === 'true' || process.env.GATEWAY_TRANSPORT === 'http';
    const isStdinPipe = !stdioDisabled && !process.stdin.isTTY && process.stdin.readable;
    if (isStdinPipe) {
      logger.info('Detected stdin pipe, enabling stdio transport');
      startStdioTransport(serverManager, registry);
      // stdio mode: skip HTTP server setup, just listen on stdin
      // The process will exit when stdin closes
      return null;
    }

    // Active SSE sessions — declared up front so the registry-watch callback
    // below can broadcast tools/list_changed notifications to all of them.
    const sseConnections = new Map<string, Response>();

    watchRegistry(async (newRegistry, oldRegistry) => {
      logger.info('Registry changed, reloading servers');
      await serverManager.reload(newRegistry, oldRegistry);

      // Tell every connected client that the tools list may have changed.
      // Per MCP spec, this is a parameter-less notification — clients re-call
      // tools/list when they see it. Fire-and-forget; we don't track ACKs.
      const sessionCount = sseConnections.size;
      if (sessionCount > 0) {
        logger.info(`Broadcasting tools/list_changed to ${sessionCount} session(s)`);
        for (const res of sseConnections.values()) {
          try {
            sendNotification(res, 'notifications/tools/list_changed', {});
          } catch (error) {
            const err = error as Error;
            logger.warn('Failed to send list_changed notification', { error: err.message });
          }
        }
      }
    });

    // ===== SSE endpoint (MCP transport) =====
    app.get('/sse', async (req: Request, res: Response) => {
      const sessionId =
        (req.query.sessionId as string) ||
        `session_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
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
        capabilities: { tools: true, prompts: false, resources: false },
      });

      try {
        const tools = await listAllTools(serverManager, registry);
        streamMessage(
          res,
          createSuccessResponse('init_tools', {
            tools: tools.map((tool) => ({
              name: tool.name,
              description: tool.description || '',
              inputSchema: tool.inputSchema || { type: 'object', properties: {} },
            })),
          })
        );
        logger.info(`Sent ${tools.length} tools to client`);
      } catch (error) {
        const err = error as Error;
        logger.error('Failed to send initial tools list', { error: err.message });
      }

      const keepAlive = setInterval(() => res.write(`: ping\n\n`), 30000);

      const logHandler = (serverName: string, entry: ServerLog): void => {
        sendNotification(res, 'server/log', { serverName, ...entry });
      };
      serverManager.on('server:log', logHandler);

      const statusHandler = (serverName: string, status: Record<string, unknown>): void => {
        sendNotification(res, 'server/status', { serverName, status });
      };
      serverManager.on('server:started', (serverName: string, pid: number | null) =>
        statusHandler(serverName, { state: 'running', pid })
      );
      serverManager.on('server:exit', (serverName: string) =>
        statusHandler(serverName, { state: 'stopped' })
      );

      req.on('close', () => {
        clearInterval(keepAlive);
        serverManager.off('server:log', logHandler);
        sseConnections.delete(sessionId);
        logger.info('SSE connection closed', { ip: req.ip, sessionId });
      });
    });

    // ===== MCP message endpoint =====
    app.post('/mcp/message', async (req: Request, res: Response) => {
      try {
        const request = req.body as JsonRpcRequest;
        const sessionId = req.headers['x-session-id'] as string | undefined;

        if (!request || !request.jsonrpc || !request.method) {
          return res.status(400).json({
            error: 'Invalid JSON-RPC request',
            details: 'Request must contain jsonrpc and method fields',
          });
        }

        logger.info('MCP message received', {
          method: request.method,
          id: request.id,
          sessionId,
          ip: req.ip,
        });

        const response = await handleMCPRequest(request, serverManager, registry);

        if (sessionId && sseConnections.has(sessionId)) {
          streamMessage(sseConnections.get(sessionId)!, response);
          return res.json({ status: 'streamed' });
        } else {
          return res.json(response);
        }
      } catch (error) {
        const err = error as Error;
        logger.error('Error handling MCP message', { error: err.message, stack: err.stack });
        return res.status(500).json({
          jsonrpc: '2.0',
          id: (req.body as JsonRpcRequest)?.id || null,
          error: { code: -32603, message: 'Internal error', data: err.message },
        });
      }
    });

    // ===== Health =====
    app.get('/health', (req: Request, res: Response) => {
      const running = serverManager.getRunningServers();
      res.json({
        status: 'ok',
        uptime: process.uptime(),
        version: registry.version,
        servers: {
          total: Object.keys(registry.servers).length,
          enabled: Object.values(registry.servers).filter((s) => s.enabled).length,
          running: running.length,
          list: running,
        },
        timestamp: new Date().toISOString(),
      });
    });

    // ===== OpenAPI Documentation (public endpoint) =====
    // Note: /docs is NOT behind auth middleware (public access)
    // disableAuth check happens inside the route handler
    const docsAuthCheck = (req: Request, res: Response, next: NextFunction) => {
      // If auth is disabled, allow access to docs
      const disabledFromEnv = process.env.GATEWAY_DISABLE_AUTH?.toLowerCase();
      const authDisabled =
        disabledFromEnv !== undefined ? disabledFromEnv === 'true' : gatewayConfig.disableAuth === true;

      if (authDisabled) {
        return next();
      }

      // If auth is enabled, require Bearer token (same as other endpoints)
      // This reuses the auth middleware logic but is explicitly called here
      return next();
    };

    app.get('/docs/openapi.json', docsAuthCheck, (req: Request, res: Response) => {
      res.json(swaggerSpec);
    });

    app.use('/docs', docsAuthCheck, swaggerUi.serve);
    app.get('/docs', docsAuthCheck, swaggerUi.setup(swaggerSpec, swaggerUiOptions));

    // ===== REST API Routes =====
    const apiRouter = createApiRouter({ serverManager, registry });
    app.use('/api', apiRouter);

    // ===== Status / config / logs (legacy endpoints, kept for backward compat) =====
    app.get('/api/status', (req: Request, res: Response) => {
      // Check if auth is disabled
      const disabledFromEnv = process.env.GATEWAY_DISABLE_AUTH?.toLowerCase();
      const authDisabled =
        disabledFromEnv !== undefined ? disabledFromEnv === 'true' : gatewayConfig.disableAuth === true;

      res.json({
        servers: serverManager.getAllStatuses(),
        gateway: {
          uptime: process.uptime(),
          version: registry.version,
          pid: process.pid,
          memory: process.memoryUsage(),
          nodeVersion: process.version,
          authEnabled: !authDisabled,
        },
        timestamp: new Date().toISOString(),
      });
    });

    app.get('/api/config', (req: Request, res: Response) => {
      res.json({ version: registry.version, servers: registry.servers, gateway: registry.gateway });
    });

    // ===== Version / Build Info =====
    app.get('/api/version', (req: Request, res: Response) => {
      // Read OCI labels from environment (set by Docker at build time)
      const buildInfo = {
        version: process.env.OCI_IMAGE_VERSION || registry.version || 'unknown',
        revision: process.env.OCI_IMAGE_REVISION || process.env.GITHUB_SHA || 'unknown',
        created: process.env.OCI_IMAGE_CREATED || new Date().toISOString(),
        source: process.env.OCI_IMAGE_SOURCE || 'https://github.com/ismail-kattakath/mcp-gateway',
        title: process.env.OCI_IMAGE_TITLE || 'mcp-gateway',
        description:
          process.env.OCI_IMAGE_DESCRIPTION || 'Universal aggregator for Model Context Protocol servers',
        licenses: process.env.OCI_IMAGE_LICENSES || 'MIT',
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
      };
      res.json(buildInfo);
    });

    // ===== Serve UI on root =====
    const uiDistPath = path.resolve(__dirname, '../../ui/dist');
    app.use(express.static(uiDistPath));

    // SPA fallback - serve index.html for non-API routes
    app.get('*', (req: Request, res: Response, next: NextFunction) => {
      // Skip API routes
      if (req.path.startsWith('/api/') || req.path.startsWith('/sse') || req.path === '/health') {
        return next();
      }
      // Serve index.html for UI routes
      res.sendFile(path.join(uiDistPath, 'index.html'), (err) => {
        if (err) {
          logger.error('Failed to serve UI', { error: (err as Error).message });
          next();
        }
      });
    });

    app.use((req: Request, res: Response) => {
      res.status(404).json({ error: 'Not found', path: req.path, method: req.method });
    });

    app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
      logger.error('Express error', { error: err.message, stack: err.stack, path: req.path });
      res
        .status((err as any).status || 500)
        .json({ error: err.message || 'Internal server error', path: req.path });
    });

    const port = parseInt(process.env.GATEWAY_PORT || '') || gatewayConfig.server.port || 3000;
    const host = process.env.GATEWAY_HOST || gatewayConfig.server.host || '127.0.0.1';

    return new Promise((resolve, reject) => {
      server = app.listen(port, host, (err?: Error) => {
        if (err) {
          logger.error('Failed to start server', { error: err.message });
          reject(err);
          return;
        }
        logger.info(`MCP Gateway Server listening on http://${host}:${port}`, {
          port,
          host,
          env: process.env.NODE_ENV || 'development',
          pid: process.pid,
        });
        logger.info('Available endpoints:', {
          docs: `/docs`,
          sse: `/sse`,
          health: `/health`,
          status: `/api/status`,
          config: `/api/config`,
          servers: `/api/servers`,
          control: `/api/servers/:serverName/(start|stop|restart|enable|disable)`,
          logs: `/api/logs/:serverName?`,
        });
        resolve(server);
      });
    });
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to initialize server', { error: err.message, stack: err.stack });
    throw err;
  }
}

async function shutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info(`Received ${signal}, shutting down gracefully...`);

  try {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      logger.info('HTTP server closed');
    }
    const serverManager = getServerManager();
    await serverManager.stopAll();
    logger.info('Shutdown complete');
    process.exit(0);
  } catch (error) {
    const err = error as Error;
    logger.error('Error during shutdown', { error: err.message, stack: err.stack });
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught exception', { error: error.message, stack: error.stack });
  shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason: unknown) => {
  const err = reason as Error | undefined;
  logger.error('Unhandled rejection', { reason: err?.message || reason, stack: err?.stack });
});

if (import.meta.url === `file://${process.argv[1]}`) {
  initializeServer().catch((error: Error) => {
    logger.error('Fatal error during startup', { error: error.message, stack: error.stack });
    process.exit(1);
  });
}

export default initializeServer;
