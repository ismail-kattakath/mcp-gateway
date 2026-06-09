/**
 * Process Lock Management
 *
 * Implements file-based process locking to ensure only one instance
 * of MCP Gateway runs at a time.
 *
 * Features:
 * - Atomic lock acquisition using proper-lockfile
 * - Stale lock detection (process no longer exists)
 * - Automatic cleanup on shutdown
 * - Cross-platform support
 */

import lockfile from 'proper-lockfile';
import fs from 'fs';
import path from 'path';
import os from 'os';
import logger from '../logging/logger.js';

/**
 * Get the lock file path
 * Uses ~/.mcp-gateway/gateway.lock
 */
export function getLockFilePath(): string {
  const homeDir = os.homedir();
  const mcpDir = path.join(homeDir, '.mcp-gateway');

  // Ensure directory exists
  if (!fs.existsSync(mcpDir)) {
    fs.mkdirSync(mcpDir, { recursive: true });
  }

  return path.join(mcpDir, 'gateway.lock');
}

/**
 * Acquire process lock
 *
 * @returns true if lock acquired successfully
 * @throws Error if lock cannot be acquired
 */
export async function acquireLock(): Promise<boolean> {
  const lockPath = getLockFilePath();

  try {
    // Ensure lock file exists
    if (!fs.existsSync(lockPath)) {
      fs.writeFileSync(lockPath, '');
    }

    // Try to acquire lock
    await lockfile.lock(lockPath, {
      retries: 0, // Fail immediately if locked
      stale: 10000, // 10s stale detection
      realpath: false, // Don't resolve symlinks (can cause issues in some environments)
    });

    logger.info('Process lock acquired', { lockPath, pid: process.pid });
    return true;
  } catch (error) {
    const err = error as Error & { code?: string };

    // Check if lock is held by another process
    if (err.code === 'ELOCKED') {
      logger.error('Another instance is already running', { lockPath });
      throw new Error(
        'Another instance of MCP Gateway is already running. ' +
          'Stop the existing instance before starting a new one.'
      );
    }

    // Other errors
    logger.error('Failed to acquire process lock', {
      error: err.message,
      lockPath,
    });
    throw err;
  }
}

/**
 * Release process lock
 *
 * Should be called during graceful shutdown
 */
export async function releaseLock(): Promise<void> {
  const lockPath = getLockFilePath();

  try {
    // Check if lock file exists and is locked
    if (fs.existsSync(lockPath)) {
      const isLocked = await lockfile.check(lockPath);

      if (isLocked) {
        await lockfile.unlock(lockPath);
        logger.info('Process lock released', { lockPath, pid: process.pid });
      } else {
        logger.debug('Lock file exists but is not locked', { lockPath });
      }
    } else {
      logger.debug('Lock file does not exist, nothing to release', { lockPath });
    }
  } catch (error) {
    const err = error as Error;
    logger.warn('Failed to release process lock', {
      error: err.message,
      lockPath,
    });
    // Don't throw - this is during shutdown
  }
}

/**
 * Check if lock is currently held
 *
 * @returns true if lock is held by any process
 */
export async function isLocked(): Promise<boolean> {
  const lockPath = getLockFilePath();

  try {
    if (!fs.existsSync(lockPath)) {
      return false;
    }

    return await lockfile.check(lockPath);
  } catch (error) {
    const err = error as Error;
    logger.warn('Failed to check lock status', { error: err.message });
    return false;
  }
}
