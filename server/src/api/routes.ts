/**
 * API Routes
 *
 * REST API endpoints for managing MCP Gateway servers.
 * All endpoints require Bearer token authentication (except /health and /docs).
 *
 * OpenAPI spec auto-generated from JSDoc annotations.
 */

import { Router, Request, Response } from 'express';
import type { Registry, Server } from '../types/registry.js';
import type { ServerManager } from '../mcp/backends/index.js';
import logger, { sanitizeServerName } from '../logging/logger.js';
import { ServerModel } from '../storage/models/servers.js';
import { reloadFromDatabase } from '../mcp/registry.js';

interface ApiRouterOptions {
  serverManager: ServerManager;
  registry: Registry;
}

export function createApiRouter({ serverManager, registry }: ApiRouterOptions): Router {
  const router = Router();

  /**
   * @openapi
   * /api/servers:
   *   get:
   *     summary: List all servers
   *     description: Returns a list of all configured MCP servers with their current status
   *     tags:
   *       - Servers
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: List of servers
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 servers:
   *                   type: object
   *                   additionalProperties:
   *                     $ref: '#/components/schemas/ServerStatus'
   *                 count:
   *                   type: integer
   *                   example: 5
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   */
  router.get('/servers', (req: Request, res: Response) => {
    const statuses = serverManager.getAllStatuses();
    res.json({ servers: statuses, count: Object.keys(statuses).length });
  });

  /**
   * @openapi
   * /api/servers/{serverName}:
   *   get:
   *     summary: Get server details
   *     description: Returns detailed configuration and status for a specific server
   *     tags:
   *       - Servers
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: serverName
   *         required: true
   *         schema:
   *           type: string
   *         description: Server name (lowercase, alphanumeric + hyphens)
   *         example: obs-mcp
   *     responses:
   *       200:
   *         description: Server details
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 name:
   *                   type: string
   *                 config:
   *                   $ref: '#/components/schemas/ServerConfig'
   *                 status:
   *                   $ref: '#/components/schemas/ServerStatus'
   *       404:
   *         $ref: '#/components/responses/NotFound'
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   */
  router.get('/servers/:serverName', (req: Request, res: Response) => {
    const { serverName } = req.params;
    const config = registry.servers[serverName];
    if (!config) {
      return res.status(404).json({ error: `Server not found: ${serverName}` });
    }
    const status = serverManager.getServerStatus(serverName);
    return res.json({ name: serverName, config, status });
  });

  /**
   * @openapi
   * /api/servers:
   *   post:
   *     summary: Create a new server
   *     description: Adds a new MCP server configuration to the registry
   *     tags:
   *       - Servers
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - name
   *               - config
   *             properties:
   *               name:
   *                 type: string
   *                 pattern: '^[a-z0-9-]+$'
   *                 example: my-new-server
   *               config:
   *                 $ref: '#/components/schemas/ServerConfig'
   *     responses:
   *       201:
   *         description: Server created successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                 name:
   *                   type: string
   *                 status:
   *                   $ref: '#/components/schemas/ServerStatus'
   *       400:
   *         $ref: '#/components/responses/BadRequest'
   *       409:
   *         description: Server already exists
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   */
  router.post('/servers', async (req: Request, res: Response) => {
    try {
      const { name, config } = req.body as { name: string; config: Server };
      if (!name || !config) {
        return res.status(400).json({ error: 'Missing required fields: name, config' });
      }
      if (!/^[a-z0-9-]+$/.test(name)) {
        return res
          .status(400)
          .json({ error: 'Invalid server name: must be lowercase alphanumeric + hyphens' });
      }
      if (registry.servers[name]) {
        return res.status(409).json({ error: `Server already exists: ${name}` });
      }

      // Persist to database
      const serverModel = new ServerModel();
      await serverModel.create({
        name,
        source: config.source,
        config,
        lifecycle: config.lifecycle || 'on-demand',
        enabled: config.enabled !== false,
      });

      // Reload registry from database to sync in-memory state
      await reloadFromDatabase();

      // Auto-start if enabled and persistent
      if (config.enabled && config.lifecycle === 'persistent') {
        await serverManager.startServer(name, config);
      }

      const status = serverManager.getServerStatus(name);
      logger.info(`Server created and persisted: ${sanitizeServerName(name)}`, {
        source: config.source,
      });
      return res.status(201).json({ success: true, name, status });
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to create server', { error: err.message });
      return res.status(500).json({ error: err.message });
    }
  });

  /**
   * @openapi
   * /api/servers/{serverName}:
   *   put:
   *     summary: Update server configuration
   *     description: Updates an existing server's configuration (requires restart if running)
   *     tags:
   *       - Servers
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: serverName
   *         required: true
   *         schema:
   *           type: string
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/ServerConfig'
   *     responses:
   *       200:
   *         description: Server updated successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                 name:
   *                   type: string
   *                 restarted:
   *                   type: boolean
   *                 status:
   *                   $ref: '#/components/schemas/ServerStatus'
   *       404:
   *         $ref: '#/components/responses/NotFound'
   *       400:
   *         $ref: '#/components/responses/BadRequest'
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   */
  router.put('/servers/:serverName', async (req: Request, res: Response) => {
    try {
      const { serverName } = req.params;
      const config = req.body as Server;
      if (!config || !config.source) {
        return res.status(400).json({ error: 'Invalid server configuration' });
      }
      if (!registry.servers[serverName]) {
        return res.status(404).json({ error: `Server not found: ${serverName}` });
      }

      const wasRunning = serverManager.getServerStatus(serverName)?.state === 'running';

      // Persist to database
      const serverModel = new ServerModel();
      await serverModel.update(serverName, {
        source: config.source,
        config,
        lifecycle: config.lifecycle,
        enabled: config.enabled,
      });

      // Reload registry from database to sync in-memory state
      await reloadFromDatabase();

      // Restart if it was running
      if (wasRunning) {
        await serverManager.stopServer(serverName);
        if (config.enabled) {
          await serverManager.startServer(serverName, config);
        }
      }

      const status = serverManager.getServerStatus(serverName);
      logger.info(`Server updated and persisted: ${sanitizeServerName(serverName)}`, {
        restarted: wasRunning,
      });
      return res.json({ success: true, name: serverName, restarted: wasRunning, status });
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to update server', { error: err.message });
      return res.status(500).json({ error: err.message });
    }
  });

  /**
   * @openapi
   * /api/servers/{serverName}:
   *   delete:
   *     summary: Delete a server
   *     description: Stops and removes a server from the registry
   *     tags:
   *       - Servers
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: serverName
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Server deleted successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                 name:
   *                   type: string
   *       404:
   *         $ref: '#/components/responses/NotFound'
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   */
  router.delete('/servers/:serverName', async (req: Request, res: Response) => {
    try {
      const { serverName } = req.params;
      if (!registry.servers[serverName]) {
        return res.status(404).json({ error: `Server not found: ${serverName}` });
      }

      // Stop if running
      await serverManager.stopServer(serverName);

      // Delete from database
      const serverModel = new ServerModel();
      await serverModel.delete(serverName);

      // Reload registry from database to sync in-memory state
      await reloadFromDatabase();

      logger.info(`Server deleted and removed from database: ${sanitizeServerName(serverName)}`);
      return res.json({ success: true, name: serverName });
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to delete server', { error: err.message });
      return res.status(500).json({ error: err.message });
    }
  });

  /**
   * @openapi
   * /api/servers/{serverName}/start:
   *   post:
   *     summary: Start a server
   *     description: Starts a stopped server
   *     tags:
   *       - Server Control
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: serverName
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Server started successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                 serverName:
   *                   type: string
   *                 status:
   *                   $ref: '#/components/schemas/ServerStatus'
   *       404:
   *         $ref: '#/components/responses/NotFound'
   *       400:
   *         description: Server is disabled
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   */
  router.post('/servers/:serverName/start', async (req: Request, res: Response) => {
    try {
      const { serverName } = req.params;
      const config = registry.servers[serverName];
      if (!config) {
        return res.status(404).json({ error: `Server not found: ${serverName}` });
      }
      if (!config.enabled) {
        return res.status(400).json({ error: `Server is disabled: ${serverName}` });
      }
      await serverManager.startServer(serverName, config);
      return res.json({
        success: true,
        serverName,
        status: serverManager.getServerStatus(serverName),
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to start server', { error: err.message });
      return res.status(500).json({ error: err.message });
    }
  });

  /**
   * @openapi
   * /api/servers/{serverName}/stop:
   *   post:
   *     summary: Stop a server
   *     description: Stops a running server
   *     tags:
   *       - Server Control
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: serverName
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Server stopped successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                 serverName:
   *                   type: string
   *                 status:
   *                   $ref: '#/components/schemas/ServerStatus'
   *       404:
   *         $ref: '#/components/responses/NotFound'
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   */
  router.post('/servers/:serverName/stop', async (req: Request, res: Response) => {
    try {
      const { serverName } = req.params;
      await serverManager.stopServer(serverName);
      res.json({ success: true, serverName, status: serverManager.getServerStatus(serverName) });
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to stop server', { error: err.message });
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * @openapi
   * /api/servers/{serverName}/restart:
   *   post:
   *     summary: Restart a server
   *     description: Stops and starts a server
   *     tags:
   *       - Server Control
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: serverName
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Server restarted successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                 serverName:
   *                   type: string
   *                 status:
   *                   $ref: '#/components/schemas/ServerStatus'
   *       404:
   *         $ref: '#/components/responses/NotFound'
   *       400:
   *         description: Server is disabled
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   */
  router.post('/servers/:serverName/restart', async (req: Request, res: Response) => {
    try {
      const { serverName } = req.params;
      const config = registry.servers[serverName];
      if (!config) {
        return res.status(404).json({ error: `Server not found: ${serverName}` });
      }
      if (!config.enabled) {
        return res.status(400).json({ error: `Server is disabled: ${serverName}` });
      }
      await serverManager.stopServer(serverName);
      await serverManager.startServer(serverName, config);
      return res.json({
        success: true,
        serverName,
        status: serverManager.getServerStatus(serverName),
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to restart server', { error: err.message });
      return res.status(500).json({ error: err.message });
    }
  });

  /**
   * @openapi
   * /api/servers/{serverName}/enable:
   *   post:
   *     summary: Enable a server
   *     description: Enables a disabled server (does not auto-start)
   *     tags:
   *       - Server Control
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: serverName
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Server enabled successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                 serverName:
   *                   type: string
   *                 enabled:
   *                   type: boolean
   *       404:
   *         $ref: '#/components/responses/NotFound'
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   */
  router.post('/servers/:serverName/enable', async (req: Request, res: Response) => {
    try {
      const { serverName } = req.params;
      const config = registry.servers[serverName];
      if (!config) {
        return res.status(404).json({ error: `Server not found: ${serverName}` });
      }

      // Persist to database
      const serverModel = new ServerModel();
      await serverModel.update(serverName, { enabled: true });

      // Reload registry from database to sync in-memory state
      await reloadFromDatabase();

      logger.info(`Server enabled and persisted: ${sanitizeServerName(serverName)}`);
      return res.json({ success: true, serverName, enabled: true });
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to enable server', { error: err.message });
      return res.status(500).json({ error: err.message });
    }
  });

  /**
   * @openapi
   * /api/servers/{serverName}/disable:
   *   post:
   *     summary: Disable a server
   *     description: Disables and stops a server
   *     tags:
   *       - Server Control
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: serverName
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Server disabled successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                 serverName:
   *                   type: string
   *                 enabled:
   *                   type: boolean
   *       404:
   *         $ref: '#/components/responses/NotFound'
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   */
  router.post('/servers/:serverName/disable', async (req: Request, res: Response) => {
    try {
      const { serverName } = req.params;
      const config = registry.servers[serverName];
      if (!config) {
        return res.status(404).json({ error: `Server not found: ${serverName}` });
      }

      // Stop server first
      await serverManager.stopServer(serverName);

      // Persist to database
      const serverModel = new ServerModel();
      await serverModel.update(serverName, { enabled: false });

      // Reload registry from database to sync in-memory state
      await reloadFromDatabase();

      logger.info(`Server disabled and persisted: ${sanitizeServerName(serverName)}`);
      return res.json({ success: true, serverName, enabled: false });
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to disable server', { error: err.message });
      return res.status(500).json({ error: err.message });
    }
  });

  /**
   * @openapi
   * /api/logs:
   *   get:
   *     summary: Get logs for all servers
   *     description: Returns recent logs from all running servers
   *     tags:
   *       - Logs
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           default: 100
   *           minimum: 1
   *           maximum: 1000
   *         description: Maximum number of log entries per server
   *     responses:
   *       200:
   *         description: Server logs
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 servers:
   *                   type: object
   *                   additionalProperties:
   *                     type: array
   *                     items:
   *                       $ref: '#/components/schemas/LogEntry'
   *                 count:
   *                   type: integer
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   */
  router.get('/logs', (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 100;
    const all: Record<string, unknown> = {};
    for (const name of serverManager.getRunningServers()) {
      all[name] = serverManager.getServerLogs(name, limit);
    }
    res.json({ servers: all, count: Object.keys(all).length });
  });

  /**
   * @openapi
   * /api/logs/{serverName}:
   *   get:
   *     summary: Get logs for a specific server
   *     description: Returns recent logs from a specific server
   *     tags:
   *       - Logs
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: serverName
   *         required: true
   *         schema:
   *           type: string
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           default: 100
   *           minimum: 1
   *           maximum: 1000
   *     responses:
   *       200:
   *         description: Server logs
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 serverName:
   *                   type: string
   *                 logs:
   *                   type: array
   *                   items:
   *                     $ref: '#/components/schemas/LogEntry'
   *                 count:
   *                   type: integer
   *       404:
   *         $ref: '#/components/responses/NotFound'
   *       401:
   *         $ref: '#/components/responses/Unauthorized'
   */
  router.get('/logs/:serverName', (req: Request, res: Response) => {
    const { serverName } = req.params;
    const limit = parseInt(req.query.limit as string) || 100;
    const logs = serverManager.getServerLogs(serverName, limit);
    res.json({ serverName, logs, count: logs.length });
  });

  return router;
}
