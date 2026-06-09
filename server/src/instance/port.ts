/**
 * Port Conflict Resolution
 *
 * Handles port conflicts by automatically finding available ports.
 *
 * Features:
 * - Try configured port first
 * - Auto-increment if port is taken
 * - Maximum retry attempts (10)
 * - Log actual port used
 */

import portfinder from 'portfinder';
import logger from '../logging/logger.js';

/**
 * Find an available port
 *
 * Tries the preferred port first, then auto-increments if taken
 *
 * @param preferredPort Desired port (default: 3000)
 * @param maxRetries Maximum number of ports to try (default: 10)
 * @returns Available port number
 * @throws Error if no port available within max retries
 */
export async function findAvailablePort(
  preferredPort: number = 3000,
  maxRetries: number = 10
): Promise<number> {
  try {
    // Configure portfinder
    portfinder.setBasePort(preferredPort);
    portfinder.setHighestPort(preferredPort + maxRetries - 1);

    const port = await portfinder.getPortPromise();

    if (port === preferredPort) {
      logger.info('Using preferred port', { port });
    } else {
      logger.warn('Preferred port unavailable, using alternative', {
        preferred: preferredPort,
        actual: port,
      });
    }

    return port;
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to find available port', {
      error: err.message,
      preferredPort,
      maxRetries,
    });

    throw new Error(
      `No available ports found in range ${preferredPort}-${preferredPort + maxRetries - 1}. ` +
        'Please free up a port or specify a different port range.'
    );
  }
}

/**
 * Check if a port is available
 *
 * @param port Port number to check
 * @returns true if port is available
 */
export async function isPortAvailable(port: number): Promise<boolean> {
  try {
    const availablePort = await portfinder.getPortPromise({ port, stopPort: port });
    return availablePort === port;
  } catch (error) {
    return false;
  }
}
