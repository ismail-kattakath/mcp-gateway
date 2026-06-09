/**
 * Graceful Shutdown Handler
 *
 * Handles graceful shutdown of the gateway server.
 *
 * Features:
 * - SIGTERM/SIGINT signal handlers
 * - HTTP connection draining (30s timeout)
 * - Close all MCP server connections
 * - Close SQLite database
 * - Release process lock
 * - Delete PID and discovery files
 * - Exit with code 0
 */

import { createHttpTerminator, HttpTerminator } from 'http-terminator';
import type { Server as HttpServer } from 'http';
import logger from '../logging/logger.js';
import { releaseLock } from './lock.js';
import { deletePidFile } from './pid.js';
import { deleteDiscoveryFile } from './discovery.js';
import { getServerManager } from '../mcp/backends/index.js';
import { markShuttingDown } from '../metrics/health.js';
import { closeDatabase } from '../storage/index.js';

let isShuttingDown = false;
let httpTerminator: HttpTerminator | null = null;
let tracingShutdown: (() => Promise<void>) | null = null;

/**
 * Register HTTP terminator for graceful connection draining
 *
 * @param server HTTP server instance
 */
export function registerHttpTerminator(server: HttpServer): void {
  httpTerminator = createHttpTerminator({
    server,
    gracefulTerminationTimeout: 30000, // 30s timeout
  });

  logger.info('HTTP terminator registered', {
    timeout: '30s',
  });
}

/**
 * Register tracing shutdown handler
 *
 * @param shutdown Shutdown function from tracing initialization
 */
export function registerTracingShutdown(shutdown: () => Promise<void>): void {
  tracingShutdown = shutdown;
  logger.info('Tracing shutdown handler registered');
}

/**
 * Perform graceful shutdown
 *
 * @param signal Signal that triggered shutdown (e.g., SIGTERM, SIGINT)
 */
export async function performGracefulShutdown(signal: string): Promise<void> {
  // Prevent multiple shutdown attempts
  if (isShuttingDown) {
    logger.warn('Shutdown already in progress', { signal });
    return;
  }

  isShuttingDown = true;
  markShuttingDown();

  logger.info(`Received ${signal}, shutting down gracefully...`);

  try {
    // Step 1: Stop accepting new HTTP requests and drain connections
    if (httpTerminator) {
      logger.info('Draining HTTP connections...');
      await httpTerminator.terminate();
      logger.info('HTTP server closed');
    }

    // Step 2: Stop all MCP servers
    logger.info('Stopping MCP servers...');
    const serverManager = getServerManager();
    await serverManager.stopAll();
    logger.info('All MCP servers stopped');

    // Step 3: Close database connection
    logger.info('Closing database...');
    closeDatabase();
    logger.info('Database closed');

    // Step 4: Release process lock
    logger.info('Releasing process lock...');
    await releaseLock();
    logger.info('Process lock released');

    // Step 5: Delete PID file
    logger.info('Deleting PID file...');
    deletePidFile();
    logger.info('PID file deleted');

    // Step 6: Delete port discovery file
    logger.info('Deleting port discovery file...');
    deleteDiscoveryFile();
    logger.info('Port discovery file deleted');

    // Step 7: Shutdown OpenTelemetry tracing
    if (tracingShutdown) {
      logger.info('Shutting down distributed tracing...');
      await tracingShutdown();
      logger.info('Distributed tracing shut down');
    }

    logger.info('Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    const err = error as Error;
    logger.error('Error during graceful shutdown', {
      error: err.message,
      stack: err.stack,
    });
    process.exit(1);
  }
}

/**
 * Register shutdown signal handlers
 */
export function registerShutdownHandlers(): void {
  process.on('SIGTERM', () => {
    void performGracefulShutdown('SIGTERM');
  });

  process.on('SIGINT', () => {
    void performGracefulShutdown('SIGINT');
  });

  logger.info('Shutdown handlers registered', {
    signals: ['SIGTERM', 'SIGINT'],
  });
}

/**
 * Check if shutdown is in progress
 *
 * @returns true if shutdown is in progress
 */
export function isShutdownInProgress(): boolean {
  return isShuttingDown;
}
