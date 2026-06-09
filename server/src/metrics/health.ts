/**
 * Enhanced Health Checks
 *
 * Provides three health check endpoints:
 * - /health - Simple status (always returns 200 if process is alive)
 * - /healthz - Kubernetes liveness probe (is process functional?)
 * - /readyz - Kubernetes readiness probe (can accept traffic?)
 */

import { Request, Response } from 'express';
import type { ServerManager } from '../mcp/backends/index.js';
import type { ServerStatus } from '../mcp/backends/base.js';
import type { Registry } from '../types/registry.js';
import logger from '../logging/logger.js';

interface HealthStatus {
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
  uptime: number;
  checks: {
    process: HealthCheck;
    servers?: HealthCheck;
    registry?: HealthCheck;
  };
}

interface HealthCheck {
  status: 'ok' | 'degraded' | 'error';
  message?: string;
  details?: Record<string, any>;
}

let isShuttingDown = false;
let lastCriticalError: { timestamp: Date; message: string } | null = null;

/**
 * Mark application as shutting down
 */
export function markShuttingDown(): void {
  isShuttingDown = true;
  logger.info('Application marked as shutting down');
}

/**
 * Record critical error for health checks
 */
export function recordCriticalError(message: string): void {
  lastCriticalError = {
    timestamp: new Date(),
    message,
  };
  logger.error('Critical error recorded for health checks', { message });
}

/**
 * Check if there are recent critical errors (within last 5 minutes)
 */
function hasRecentCriticalErrors(): boolean {
  if (!lastCriticalError) return false;

  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  return lastCriticalError.timestamp > fiveMinutesAgo;
}

/**
 * Simple health check - always returns 200 if process is alive
 * Used by simple load balancers that only check for 200 vs non-200
 */
export function healthHandler(req: Request, res: Response): Response {
  return res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
}

/**
 * Kubernetes liveness probe - checks if process is functional
 * Returns 503 if process should be restarted
 */
export function livenessHandler(req: Request, res: Response): Response {
  // If shutting down, return 503 (not alive)
  if (isShuttingDown) {
    logger.warn('Liveness check failed: shutting down');
    return res.status(503).json({
      status: 'error',
      message: 'Application is shutting down',
      timestamp: new Date().toISOString(),
    });
  }

  // If recent critical errors, return 503 (should restart)
  if (hasRecentCriticalErrors()) {
    logger.warn('Liveness check failed: recent critical errors', {
      lastError: lastCriticalError,
    });
    return res.status(503).json({
      status: 'error',
      message: 'Recent critical errors detected',
      timestamp: new Date().toISOString(),
      lastError: lastCriticalError,
    });
  }

  // Check basic process health
  const memoryUsage = process.memoryUsage();
  const heapUsedPercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;

  // If heap usage is >95%, process may be in trouble
  if (heapUsedPercent > 95) {
    logger.warn('Liveness check degraded: high memory usage', {
      heapUsedPercent: heapUsedPercent.toFixed(2),
    });
    return res.status(200).json({
      status: 'degraded',
      message: 'High memory usage detected',
      timestamp: new Date().toISOString(),
      memory: {
        heapUsed: memoryUsage.heapUsed,
        heapTotal: memoryUsage.heapTotal,
        heapUsedPercent: heapUsedPercent.toFixed(2),
      },
    });
  }

  // Process is healthy
  return res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
}

/**
 * Kubernetes readiness probe - checks if process can accept traffic
 * Returns 503 if dependencies are unavailable (but process is still alive)
 */
export function readinessHandler(
  serverManager: ServerManager,
  registry: Registry
): (req: Request, res: Response) => Promise<void> {
  return async (req: Request, res: Response): Promise<void> => {
    const status: HealthStatus = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      checks: {
        process: { status: 'ok' },
      },
    };

    let isReady = true;

    // If shutting down, not ready
    if (isShuttingDown) {
      status.status = 'error';
      status.checks.process = {
        status: 'error',
        message: 'Application is shutting down',
      };
      isReady = false;
    }

    // Check if at least one enabled persistent server is running
    const enabledServers = Object.entries(registry.servers).filter(
      ([, config]) => config.enabled && config.lifecycle === 'persistent'
    );

    if (enabledServers.length > 0) {
      const runningServers = serverManager.getRunningServers();
      const runningPersistent = enabledServers.filter(([name]) => runningServers.includes(name));

      const serverCheckStatus: 'ok' | 'error' = runningPersistent.length > 0 ? 'ok' : 'error';
      status.checks.servers = {
        status: serverCheckStatus,
        message:
          runningPersistent.length > 0
            ? `${runningPersistent.length}/${enabledServers.length} persistent servers running`
            : 'No persistent servers running',
        details: {
          total: enabledServers.length,
          running: runningPersistent.length,
          runningList: runningPersistent.map(([name]) => name),
        },
      };

      if (runningPersistent.length === 0) {
        status.status = 'degraded';
        isReady = false;
      }
    } else {
      status.checks.servers = {
        status: 'ok',
        message: 'No persistent servers configured',
      };
    }

    // Check registry
    try {
      const serverCount = Object.keys(registry.servers).length;
      status.checks.registry = {
        status: 'ok',
        message: `Registry loaded with ${serverCount} servers`,
        details: {
          version: registry.version,
          serverCount,
        },
      };
    } catch (error) {
      status.checks.registry = {
        status: 'error',
        message: 'Registry not available',
      };
      status.status = 'error';
      isReady = false;
    }

    const httpStatus = isReady ? 200 : 503;
    res.status(httpStatus).json(status);

    if (!isReady) {
      logger.warn('Readiness check failed', { status });
    }
  };
}

/**
 * Detailed health check with all dependency checks
 * Used for monitoring dashboards and debugging
 */
export function detailedHealthHandler(
  serverManager: ServerManager,
  registry: Registry
): (req: Request, res: Response) => Promise<void> {
  return async (req: Request, res: Response): Promise<void> => {
    const status: HealthStatus = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      checks: {
        process: { status: 'ok' },
      },
    };

    // Process health
    const memoryUsage = process.memoryUsage();
    const heapUsedPercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;

    status.checks.process = {
      status: heapUsedPercent > 95 ? 'error' : 'ok',
      details: {
        uptime: process.uptime(),
        pid: process.pid,
        nodeVersion: process.version,
        memory: {
          rss: memoryUsage.rss,
          heapTotal: memoryUsage.heapTotal,
          heapUsed: memoryUsage.heapUsed,
          heapUsedPercent: heapUsedPercent.toFixed(2),
          external: memoryUsage.external,
        },
        cpu: process.cpuUsage(),
      },
    };

    if (heapUsedPercent > 95) {
      status.status = 'degraded';
    }

    // Servers health
    const allServers = Object.entries(registry.servers);
    const enabledServers = allServers.filter(([, config]) => config.enabled);
    const runningServers = serverManager.getRunningServers();
    const allStatusesRecord = serverManager.getAllStatuses();
    const allStatuses = Object.values(allStatusesRecord);

    const failedServers = allStatuses.filter(
      (s: ServerStatus) => s.state === 'failed' && registry.servers[s.serverName]?.enabled
    );

    const serverCheckStatus: 'ok' | 'degraded' = failedServers.length > 0 ? 'degraded' : 'ok';
    status.checks.servers = {
      status: serverCheckStatus,
      message: `${runningServers.length}/${enabledServers.length} enabled servers running`,
      details: {
        total: allServers.length,
        enabled: enabledServers.length,
        running: runningServers.length,
        failed: failedServers.length,
        statuses: allStatuses,
      },
    };

    if (failedServers.length > 0) {
      status.status = 'degraded';
    }

    // Registry health
    status.checks.registry = {
      status: 'ok',
      message: 'Registry loaded',
      details: {
        version: registry.version,
        serverCount: allServers.length,
      },
    };

    const httpStatus = status.status === 'error' ? 503 : 200;
    res.status(httpStatus).json(status);
  };
}

logger.info('Health check handlers initialized');
