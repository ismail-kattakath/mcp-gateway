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

// CRITICAL: Initialize OpenTelemetry tracing FIRST (before any other imports)
// This ensures auto-instrumentation captures all HTTP/Express operations
import { initTracing } from './tracing/index.js';
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
import { createFirewallRouter } from './api/firewall-routes.js';
import { createLDAPRouter } from './api/ldap-routes.js';
import { swaggerSpec, swaggerUi, swaggerUiOptions } from './api/swagger.js';
// Firewall (Epic #23)
import { initializeFirewall, createFirewallMiddleware } from './security/firewall/index.js';
// Metrics & Monitoring (Epic #3)
import { getMetrics } from './metrics/index.js';
import { httpMetricsMiddleware } from './metrics/middleware.js';
import {
  healthHandler,
  livenessHandler,
  readinessHandler,
  detailedHealthHandler,
} from './metrics/health.js';
import {
  updateActiveConnections,
  recordConnection,
  recordRegistryReload,
  updateRegistryServerCount,
} from './metrics/custom.js';
// Authentication (Epic #4)
import { initDatabase, usersModel } from './storage/index.js';
import { initializePassport } from './auth/index.js';
import { getOrCreateJwtSecret } from './auth/jwt-secret.js';
import authRoutes from './auth/routes.js';
import type { JsonRpcRequest } from './mcp/protocol.js';
import type { ServerLog } from './mcp/backends/base.js';
// Instance Management (Epic #26)
import {
  initializeInstance,
  registerServer as registerInstanceServer,
  registerTracingShutdown,
  performGracefulShutdown,
} from './instance/index.js';
// Performance Optimization (Epic #28)
import {
  getPerformanceConfig,
  validatePerformanceConfig,
  createCompressionMiddleware,
  ResponseCache,
  initializeConnectionPool,
  createETagMiddleware,
} from './performance/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let server: HttpServer | null = null;
let isShuttingDown = false;
let shutdownTracing: (() => Promise<void>) | null = null;
let responseCache: ResponseCache | null = null;

/**
 * Ensure default admin user exists for v3.0 authentication
 * Creates user with username 'admin' and password 'changeme' if no users exist
 */
async function ensureDefaultAdminUser(): Promise<void> {
  try {
    const userCount = usersModel.count();
    if (userCount === 0) {
      logger.info('No users found, creating default admin user');
      const defaultUser = await usersModel.create({
        username: 'admin',
        password: 'changeme',
        email: 'admin@mcp-gateway.local',
        role: 'admin',
        status: 'active',
      });
      logger.warn('⚠️  DEFAULT ADMIN USER CREATED', {
        userId: defaultUser.id,
        username: 'admin',
        password: 'changeme',
        warning: 'CHANGE THIS PASSWORD IMMEDIATELY',
        message: 'Default credentials are insecure for production use',
        instructions: 'Run: mcp auth user update admin --password <new-password>',
      });
    } else {
      logger.debug(`Found ${userCount} existing user(s), skipping default admin creation`);
    }
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to ensure default admin user', {
      error: err.message,
      stack: err.stack,
    });
    // Don't throw - allow server to start even if user creation fails
  }
}

async function initializeServer(): Promise<HttpServer | null> {
  try {
    // Parse command-line flags
    const debugFlag = process.argv.includes('--debug');
    if (debugFlag) {
      process.env.LOG_LEVEL = 'debug';
      logger.level = 'debug';
      logger.debug('Debug logging enabled via --debug flag');
    }

    // Initialize OpenTelemetry tracing (Epic #24)
    logger.info('Initializing distributed tracing...');
    shutdownTracing = initTracing();
    registerTracingShutdown(shutdownTracing);
    logger.info('Distributed tracing initialized');

    logger.info('Starting MCP Gateway Server');

    // Initialize performance configuration
    logger.info('Initializing performance configuration...');
    const perfConfig = getPerformanceConfig();
    const configErrors = validatePerformanceConfig(perfConfig);
    if (configErrors.length > 0) {
      throw new Error(`Invalid performance configuration: ${configErrors.join(', ')}`);
    }
    logger.info('Performance configuration validated', {
      http2: perfConfig.http2.enabled,
      compression: perfConfig.compression.enabled,
      cache: perfConfig.cache.enabled,
      pool: perfConfig.pool.keepAlive,
    });

    // Initialize connection pool (for remote servers)
    initializeConnectionPool(perfConfig.pool);

    // Initialize response cache
    responseCache = new ResponseCache(perfConfig.cache);

    // Initialize database (SQLite)
    logger.info('Initializing database...');
    initDatabase();
    logger.info('Database initialized');

    // Initialize JWT secret (required for authentication)
    logger.info('Initializing JWT secret...');
    await getOrCreateJwtSecret();
    logger.info('JWT secret initialized');

    // Ensure default admin user exists
    await ensureDefaultAdminUser();

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

    // Initialize firewall system (Epic #23)
    // This must happen after registry initialization
    logger.info('Initializing firewall system...');
    const firewallPort =
      parseInt(process.env.GATEWAY_PORT || '') || gatewayConfig.server.port || 3000;
    await initializeFirewall(registryPath, undefined, firewallPort);
    logger.info('Firewall system initialized');

    // Initialize instance management (Epic #26)
    // This must happen before starting the HTTP server
    const preferredPort =
      parseInt(process.env.GATEWAY_PORT || '') || gatewayConfig.server.port || 3000;
    const instanceInfo = await initializeInstance(preferredPort, registry.version);
    logger.info('Instance management initialized', {
      port: instanceInfo.port,
      pid: instanceInfo.pid,
      lockAcquired: instanceInfo.lockAcquired,
    });

    // Load or generate API key (persisted in ~/.mcp/gateway-api-key)
    const apiKey = await getOrCreateApiKey();

    const app: Express = express();
    // Behind a reverse proxy on loopback — honor X-Forwarded-* so
    // req.ip and req.protocol reflect the real client / scheme.
    app.set('trust proxy', 'loopback');
    app.use(express.json());

    // Initialize performance middleware
    // Compression must come before response handlers
    app.use(createCompressionMiddleware(perfConfig.compression));

    // ETag support for conditional requests
    app.use(createETagMiddleware());

    // Initialize metrics middleware (before auth so we track all requests)
    app.use(httpMetricsMiddleware);

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

    // Initialize Passport.js with all auth strategies
    const passportInstance = await initializePassport();
    app.use(passportInstance.initialize());

    // Firewall middleware (IP filtering) - MUST come before auth
    // This provides defense-in-depth: firewall -> auth -> routes
    app.use(createFirewallMiddleware());

    // Auth + IP allowlist. Reads from auth config file (.mcp-gateway.json).
    // Throws at construction if auth is enabled but key generation failed.
    app.use(createAuthMiddleware(registryPath, apiKey));

    // Mount auth routes (login, token refresh, logout, user management)
    app.use('/auth', authRoutes);

    const serverManager = getServerManager();
    await serverManager.initialize(registry);

    // Initialize registry metrics
    const enabledServers = Object.values(registry.servers).filter((s) => s.enabled);
    const disabledServers = Object.values(registry.servers).filter((s) => !s.enabled);
    updateRegistryServerCount(enabledServers.length, disabledServers.length);

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

      // Invalidate cache for changed servers
      if (responseCache && responseCache.isEnabled()) {
        const changedServers = new Set<string>();

        // Find servers that changed
        for (const serverName in newRegistry.servers) {
          const newConfig = newRegistry.servers[serverName];
          const oldConfig = oldRegistry?.servers[serverName];

          if (!oldConfig || JSON.stringify(newConfig) !== JSON.stringify(oldConfig)) {
            changedServers.add(serverName);
          }
        }

        // Invalidate cache for each changed server
        for (const serverName of changedServers) {
          responseCache.invalidateServer(serverName);
        }
      }

      // Update registry metrics
      recordRegistryReload('file_change');
      const enabled = Object.values(newRegistry.servers).filter((s) => s.enabled);
      const disabled = Object.values(newRegistry.servers).filter((s) => !s.enabled);
      updateRegistryServerCount(enabled.length, disabled.length);

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

      // Record connection metrics
      recordConnection('sse');
      updateActiveConnections(sseConnections.size + 1);

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
        updateActiveConnections(sseConnections.size);
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

    // ===== Metrics Endpoint =====
    app.get('/metrics', async (req: Request, res: Response) => {
      try {
        res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
        res.end(await getMetrics());
      } catch (error) {
        const err = error as Error;
        logger.error('Failed to collect metrics', { error: err.message });
        res.status(500).send('Failed to collect metrics');
      }
    });

    // ===== Health Check Endpoints =====
    // Simple health check (always returns 200 if process is alive)
    app.get('/health', healthHandler);

    // Kubernetes liveness probe (is process functional?)
    app.get('/healthz', livenessHandler);

    // Kubernetes readiness probe (can accept traffic?)
    app.get('/readyz', readinessHandler(serverManager, registry));

    // Detailed health check (for monitoring dashboards)
    app.get('/health/detailed', detailedHealthHandler(serverManager, registry));

    // ===== OpenAPI Documentation (public endpoint) =====
    // Note: /docs is NOT behind auth middleware (public access)
    // disableAuth check happens inside the route handler
    const docsAuthCheck = (req: Request, res: Response, next: NextFunction) => {
      // If auth is disabled, allow access to docs
      const disabledFromEnv = process.env.GATEWAY_DISABLE_AUTH?.toLowerCase();
      const authDisabled =
        disabledFromEnv !== undefined
          ? disabledFromEnv === 'true'
          : gatewayConfig.disableAuth === true;

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

    // ===== Firewall Management Routes =====
    const firewallRouter = createFirewallRouter();
    app.use('/api/firewall', firewallRouter);

    // ===== LDAP Provider Management Routes =====
    const ldapRouter = createLDAPRouter();
    app.use('/api/ldap', ldapRouter);

    // ===== Domain Management Routes =====
    // Import dynamically to handle optional Caddy integration
    try {
      const { domainRouter } = await import('./domains/api-routes.js');
      app.use('/api/domains', domainRouter);
      logger.info('Domain management API enabled');
    } catch (error) {
      logger.warn('Domain management API not available (Caddy integration disabled)', {
        error: (error as Error).message,
      });
    }

    // ===== Status / config / logs (legacy endpoints, kept for backward compat) =====
    app.get('/api/status', (req: Request, res: Response) => {
      // Check if auth is disabled
      const disabledFromEnv = process.env.GATEWAY_DISABLE_AUTH?.toLowerCase();
      const authDisabled =
        disabledFromEnv !== undefined
          ? disabledFromEnv === 'true'
          : gatewayConfig.disableAuth === true;

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
          process.env.OCI_IMAGE_DESCRIPTION ||
          'Universal aggregator for Model Context Protocol servers',
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

    // Use the port resolved by instance management
    const port = instanceInfo.port;
    const host = process.env.GATEWAY_HOST || gatewayConfig.server.host || '127.0.0.1';

    return new Promise((resolve, reject) => {
      server = app.listen(port, host, (err?: Error) => {
        if (err) {
          logger.error('Failed to start server', { error: err.message });
          reject(err);
          return;
        }

        // Register server for graceful shutdown (Epic #26)
        if (server) {
          registerInstanceServer(server);
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
          metrics: `/metrics`,
          health: `/health`,
          healthz: `/healthz`,
          readyz: `/readyz`,
          healthDetailed: `/health/detailed`,
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
  // Note: This function is now deprecated in favor of performGracefulShutdown
  // from the instance management module (Epic #26).
  // Keeping it for backward compatibility, but it delegates to the new handler.
  if (isShuttingDown) return;
  isShuttingDown = true;

  // Delegate to the new graceful shutdown handler
  await performGracefulShutdown(signal);
}

// Note: Shutdown handlers are now registered by instance management (Epic #26)
// The following lines are kept for backward compatibility but are redundant
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
