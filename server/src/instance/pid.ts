/**
 * PID File Management
 *
 * Manages the process ID file for instance detection and management.
 *
 * Features:
 * - Write current PID on startup
 * - Verify process existence
 * - Cleanup on shutdown
 * - Handle orphaned PID files
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import logger from '../logging/logger.js';

/**
 * Get the PID file path
 * Uses ~/.mcp-gateway/gateway.pid
 */
export function getPidFilePath(): string {
  const homeDir = os.homedir();
  const mcpDir = path.join(homeDir, '.mcp-gateway');

  // Ensure directory exists
  if (!fs.existsSync(mcpDir)) {
    fs.mkdirSync(mcpDir, { recursive: true });
  }

  return path.join(mcpDir, 'gateway.pid');
}

/**
 * Write current process PID to file
 */
export function writePidFile(): void {
  const pidPath = getPidFilePath();

  try {
    fs.writeFileSync(pidPath, process.pid.toString(), 'utf8');
    logger.info('PID file created', { pidPath, pid: process.pid });
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to write PID file', {
      error: err.message,
      pidPath,
      pid: process.pid,
    });
    throw err;
  }
}

/**
 * Read PID from file
 *
 * @returns PID if file exists, null otherwise
 */
export function readPidFile(): number | null {
  const pidPath = getPidFilePath();

  try {
    if (!fs.existsSync(pidPath)) {
      return null;
    }

    const pidStr = fs.readFileSync(pidPath, 'utf8').trim();
    const pid = parseInt(pidStr, 10);

    if (isNaN(pid) || pid <= 0) {
      logger.warn('Invalid PID in file', { pidPath, pidStr });
      return null;
    }

    return pid;
  } catch (error) {
    const err = error as Error;
    logger.warn('Failed to read PID file', { error: err.message, pidPath });
    return null;
  }
}

/**
 * Check if process with given PID exists
 *
 * Uses kill(pid, 0) which checks existence without sending a signal
 *
 * @param pid Process ID to check
 * @returns true if process exists
 */
export function processExists(pid: number): boolean {
  try {
    // Signal 0 doesn't kill the process, just checks if it exists
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;

    // ESRCH = no such process
    if (err.code === 'ESRCH') {
      return false;
    }

    // EPERM = process exists but we don't have permission to signal it
    // This still means it exists
    if (err.code === 'EPERM') {
      return true;
    }

    // Other errors - assume process doesn't exist
    logger.warn('Failed to check process existence', {
      error: err.message,
      pid,
    });
    return false;
  }
}

/**
 * Check if gateway is currently running
 *
 * @returns PID if running, null otherwise
 */
export function getRunningPid(): number | null {
  const pid = readPidFile();

  if (pid === null) {
    return null;
  }

  if (!processExists(pid)) {
    logger.warn('PID file exists but process is not running (stale PID file)', { pid });
    return null;
  }

  return pid;
}

/**
 * Delete PID file
 *
 * Should be called during graceful shutdown
 */
export function deletePidFile(): void {
  const pidPath = getPidFilePath();

  try {
    if (fs.existsSync(pidPath)) {
      fs.unlinkSync(pidPath);
      logger.info('PID file deleted', { pidPath, pid: process.pid });
    } else {
      logger.debug('PID file does not exist, nothing to delete', { pidPath });
    }
  } catch (error) {
    const err = error as Error;
    logger.warn('Failed to delete PID file', {
      error: err.message,
      pidPath,
    });
    // Don't throw - this is during shutdown
  }
}

/**
 * Cleanup stale PID file
 *
 * Should be called if PID file exists but process is not running
 */
export function cleanupStalePidFile(): void {
  const pid = readPidFile();

  if (pid !== null && !processExists(pid)) {
    logger.info('Cleaning up stale PID file', { stalePid: pid });
    deletePidFile();
  }
}
