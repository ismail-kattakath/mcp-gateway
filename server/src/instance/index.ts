/**
 * Instance Management
 *
 * Main orchestration module for instance management.
 *
 * Features:
 * - Single instance enforcement
 * - Port conflict resolution
 * - Process locking
 * - PID file management
 * - Port discovery
 * - Graceful shutdown
 */

import type { Server as HttpServer } from 'http';
import logger from '../logging/logger.js';
import { acquireLock, releaseLock, isLocked } from './lock.js';
import { writePidFile, deletePidFile, getRunningPid, cleanupStalePidFile } from './pid.js';
import { findAvailablePort, isPortAvailable } from './port.js';
import {
  writeDiscoveryFile,
  deleteDiscoveryFile,
  readDiscoveryFile,
  getGatewayUrl,
  type PortDiscoveryInfo,
} from './discovery.js';
import {
  registerHttpTerminator,
  registerTracingShutdown,
  registerShutdownHandlers,
  performGracefulShutdown,
  isShutdownInProgress,
} from './shutdown.js';

/**
 * Instance initialization result
 */
export interface InstanceInitResult {
  port: number;
  pid: number;
  lockAcquired: boolean;
}

/**
 * Initialize instance management
 *
 * This should be called before starting the HTTP server.
 *
 * Steps:
 * 1. Check for existing instances
 * 2. Cleanup stale PID files
 * 3. Acquire process lock
 * 4. Write PID file
 * 5. Find available port
 * 6. Write port discovery file
 * 7. Register shutdown handlers
 *
 * @param preferredPort Preferred port (default: 3000)
 * @param version Gateway version
 * @returns Instance initialization result
 * @throws Error if another instance is running or lock cannot be acquired
 */
export async function initializeInstance(
  preferredPort: number = 3000,
  version: string = '3.0.0'
): Promise<InstanceInitResult> {
  logger.info('Initializing instance management...');

  // Step 1: Check for existing instances
  const runningPid = getRunningPid();
  if (runningPid !== null) {
    logger.error('Another instance is already running', { pid: runningPid });
    throw new Error(
      `Another instance of MCP Gateway is already running (PID ${runningPid}). ` +
        'Stop the existing instance before starting a new one.'
    );
  }

  // Step 2: Cleanup stale PID files
  cleanupStalePidFile();

  // Step 3: Acquire process lock
  const lockAcquired = await acquireLock();
  if (!lockAcquired) {
    throw new Error('Failed to acquire process lock');
  }

  // Step 4: Write PID file
  writePidFile();

  // Step 5: Find available port
  const port = await findAvailablePort(preferredPort);

  // Step 6: Write port discovery file
  const discoveryInfo: PortDiscoveryInfo = {
    port,
    pid: process.pid,
    started: new Date().toISOString(),
    version,
  };
  writeDiscoveryFile(discoveryInfo);

  // Step 7: Register shutdown handlers
  registerShutdownHandlers();

  logger.info('Instance management initialized', {
    port,
    pid: process.pid,
    version,
    lockAcquired,
  });

  return {
    port,
    pid: process.pid,
    lockAcquired,
  };
}

/**
 * Register HTTP server for graceful shutdown
 *
 * This should be called after the HTTP server starts.
 *
 * @param server HTTP server instance
 */
export function registerServer(server: HttpServer): void {
  registerHttpTerminator(server);
}

/**
 * Cleanup instance management resources
 *
 * This is called during graceful shutdown.
 * Should not be called directly - use performGracefulShutdown instead.
 */
export async function cleanupInstance(): Promise<void> {
  logger.info('Cleaning up instance management...');

  await releaseLock();
  deletePidFile();
  deleteDiscoveryFile();

  logger.info('Instance management cleaned up');
}

// Re-export key functions for convenience
export {
  acquireLock,
  releaseLock,
  isLocked,
  writePidFile,
  deletePidFile,
  getRunningPid,
  cleanupStalePidFile,
  findAvailablePort,
  isPortAvailable,
  writeDiscoveryFile,
  deleteDiscoveryFile,
  readDiscoveryFile,
  getGatewayUrl,
  registerHttpTerminator,
  registerTracingShutdown,
  registerShutdownHandlers,
  performGracefulShutdown,
  isShutdownInProgress,
  type PortDiscoveryInfo,
};
