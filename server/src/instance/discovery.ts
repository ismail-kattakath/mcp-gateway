/**
 * Port Discovery Mechanism
 *
 * Writes port information to a discovery file so CLI can find the running instance.
 *
 * Features:
 * - JSON format with port, PID, start time, version
 * - Used by CLI to discover running instance
 * - Automatic cleanup on shutdown
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import logger from '../logging/logger.js';

/**
 * Port discovery information
 */
export interface PortDiscoveryInfo {
  port: number;
  pid: number;
  started: string; // ISO 8601 timestamp
  version: string;
}

/**
 * Get the port discovery file path
 * Uses ~/.mcp-gateway/gateway.port
 */
export function getDiscoveryFilePath(): string {
  const homeDir = os.homedir();
  const mcpDir = path.join(homeDir, '.mcp-gateway');

  // Ensure directory exists
  if (!fs.existsSync(mcpDir)) {
    fs.mkdirSync(mcpDir, { recursive: true });
  }

  return path.join(mcpDir, 'gateway.port');
}

/**
 * Write port discovery information
 *
 * @param info Port discovery information
 */
export function writeDiscoveryFile(info: PortDiscoveryInfo): void {
  const discoveryPath = getDiscoveryFilePath();

  try {
    const json = JSON.stringify(info, null, 2);
    fs.writeFileSync(discoveryPath, json, 'utf8');

    logger.info('Port discovery file created', {
      discoveryPath,
      port: info.port,
      pid: info.pid,
    });
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to write port discovery file', {
      error: err.message,
      discoveryPath,
    });
    throw err;
  }
}

/**
 * Read port discovery information
 *
 * @returns Discovery info if file exists and is valid, null otherwise
 */
export function readDiscoveryFile(): PortDiscoveryInfo | null {
  const discoveryPath = getDiscoveryFilePath();

  try {
    if (!fs.existsSync(discoveryPath)) {
      return null;
    }

    const json = fs.readFileSync(discoveryPath, 'utf8');
    const info = JSON.parse(json) as PortDiscoveryInfo;

    // Validate required fields
    if (
      typeof info.port !== 'number' ||
      typeof info.pid !== 'number' ||
      typeof info.started !== 'string' ||
      typeof info.version !== 'string'
    ) {
      logger.warn('Invalid port discovery file format', { discoveryPath });
      return null;
    }

    return info;
  } catch (error) {
    const err = error as Error;
    logger.warn('Failed to read port discovery file', {
      error: err.message,
      discoveryPath,
    });
    return null;
  }
}

/**
 * Delete port discovery file
 *
 * Should be called during graceful shutdown
 */
export function deleteDiscoveryFile(): void {
  const discoveryPath = getDiscoveryFilePath();

  try {
    if (fs.existsSync(discoveryPath)) {
      fs.unlinkSync(discoveryPath);
      logger.info('Port discovery file deleted', { discoveryPath });
    } else {
      logger.debug('Port discovery file does not exist, nothing to delete', {
        discoveryPath,
      });
    }
  } catch (error) {
    const err = error as Error;
    logger.warn('Failed to delete port discovery file', {
      error: err.message,
      discoveryPath,
    });
    // Don't throw - this is during shutdown
  }
}

/**
 * Get the gateway URL from discovery file
 *
 * @param defaultPort Fallback port if discovery file doesn't exist
 * @returns Gateway URL (e.g., http://localhost:3000)
 */
export function getGatewayUrl(defaultPort: number = 3000): string {
  const info = readDiscoveryFile();

  if (info) {
    return `http://localhost:${info.port}`;
  }

  return `http://localhost:${defaultPort}`;
}
