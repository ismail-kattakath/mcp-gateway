/**
 * mDNS/Bonjour Service Module
 *
 * Advertises MCP Gateway on local network using mDNS.
 * Enables discovery at mcp-gateway.local domain.
 *
 * Cross-platform support:
 * - macOS: Native Bonjour
 * - Linux: Avahi
 * - Windows: Bonjour for Windows (if installed)
 */

import Bonjour from 'bonjour-service';
import logger from '../logging/logger.js';
import { sanitizeString } from '../logging/sanitizer.js';

export interface MDNSConfig {
  enabled: boolean;
  name?: string;
  port?: number;
  txt?: Record<string, string>;
}

export interface MDNSStatus {
  enabled: boolean;
  running: boolean;
  name: string;
  port: number;
  type: string;
  domain: string;
  error?: string;
}

type BonjourInstance = any; // bonjour-service doesn't export proper types
type BonjourService = any; // bonjour-service doesn't export proper types

let bonjourInstance: BonjourInstance | null = null;
let publishedService: BonjourService | null = null;
let currentConfig: MDNSConfig | null = null;

/**
 * Start mDNS service advertising
 *
 * Publishes the gateway on the local network as:
 * - mcp-gateway.local (or custom name)
 * - Type: _http._tcp
 *
 * @param config mDNS configuration
 * @returns Published service info
 */
export function startMDNS(config: MDNSConfig): MDNSStatus {
  if (!config.enabled) {
    logger.info('mDNS is disabled');
    return {
      enabled: false,
      running: false,
      name: '',
      port: 0,
      type: '',
      domain: '',
    };
  }

  const name = config.name || 'MCP Gateway';
  const port = config.port || 3000;
  const type = 'http';

  try {
    // Stop existing service if running
    if (publishedService) {
      logger.warn('mDNS service already running, stopping first');
      stopMDNS();
    }

    // Create new Bonjour instance
    bonjourInstance = new Bonjour();

    // Prepare TXT record with metadata
    const txt: Record<string, string> = {
      version: '3.0',
      transport: 'sse',
      protocol: 'mcp',
      ...config.txt,
    };

    logger.info('Starting mDNS service', {
      name: sanitizeString(name),
      port,
      type,
    });

    // Publish service
    publishedService = bonjourInstance.publish({
      name,
      type,
      port,
      txt,
    });

    currentConfig = config;

    // Handle service events
    publishedService.on('up', () => {
      const fqdn = `${name.toLowerCase().replace(/\s+/g, '-')}.local`;
      logger.info('mDNS service published', {
        name: sanitizeString(name),
        domain: fqdn,
        port,
      });
    });

    publishedService.on('error', (error: Error) => {
      logger.error('mDNS service error', {
        name: sanitizeString(name),
        error: error.message,
      });
    });

    const fqdn = `${name.toLowerCase().replace(/\s+/g, '-')}.local`;

    return {
      enabled: true,
      running: true,
      name,
      port,
      type: `_${type}._tcp`,
      domain: fqdn,
    };
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to start mDNS service', {
      name: sanitizeString(name),
      error: err.message,
      stack: err.stack,
    });

    return {
      enabled: true,
      running: false,
      name,
      port,
      type: `_${type}._tcp`,
      domain: '',
      error: err.message,
    };
  }
}

/**
 * Stop mDNS service advertising
 *
 * Unpublishes the service from the network.
 */
export function stopMDNS(): void {
  if (!publishedService && !bonjourInstance) {
    logger.debug('mDNS service not running, nothing to stop');
    return;
  }

  try {
    logger.info('Stopping mDNS service');

    if (publishedService) {
      publishedService.stop();
      publishedService = null;
    }

    if (bonjourInstance) {
      bonjourInstance.destroy();
      bonjourInstance = null;
    }

    currentConfig = null;

    logger.info('mDNS service stopped');
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to stop mDNS service', {
      error: err.message,
    });
  }
}

/**
 * Get current mDNS status
 *
 * Returns information about the running mDNS service.
 *
 * @returns Current mDNS status
 */
export function getMDNSStatus(): MDNSStatus {
  if (!currentConfig || !currentConfig.enabled) {
    return {
      enabled: false,
      running: false,
      name: '',
      port: 0,
      type: '',
      domain: '',
    };
  }

  const name = currentConfig.name || 'MCP Gateway';
  const port = currentConfig.port || 3000;
  const type = 'http';
  const fqdn = `${name.toLowerCase().replace(/\s+/g, '-')}.local`;

  return {
    enabled: true,
    running: publishedService !== null,
    name,
    port,
    type: `_${type}._tcp`,
    domain: fqdn,
  };
}

/**
 * Restart mDNS service
 *
 * Stops and starts the service with new configuration.
 *
 * @param config New mDNS configuration
 * @returns Updated status
 */
export function restartMDNS(config: MDNSConfig): MDNSStatus {
  stopMDNS();
  return startMDNS(config);
}

/**
 * Check if mDNS is supported on this platform
 *
 * mDNS/Bonjour requires:
 * - macOS: Native support
 * - Linux: Avahi daemon
 * - Windows: Bonjour for Windows
 *
 * @returns true if mDNS is likely supported
 */
export function isMDNSSupported(): boolean {
  const platform = process.platform;

  // macOS has native Bonjour support
  if (platform === 'darwin') {
    return true;
  }

  // Linux requires Avahi
  if (platform === 'linux') {
    // Check if avahi-daemon is installed
    // In production, we'll assume it's available and let Bonjour handle errors
    return true;
  }

  // Windows requires Bonjour for Windows
  if (platform === 'win32') {
    // Bonjour for Windows is often installed by iTunes or other Apple software
    // We'll attempt to use it and handle errors if not available
    return true;
  }

  logger.warn('mDNS support uncertain on this platform', { platform });
  return false;
}

/**
 * Discover other mDNS services on the network
 *
 * Useful for finding other MCP Gateway instances.
 *
 * @param serviceType Service type to discover (default: 'http')
 * @param timeout Discovery timeout in milliseconds (default: 5000)
 * @returns Promise with discovered services
 */
export function discoverServices(
  serviceType: string = 'http',
  timeout: number = 5000
): Promise<BonjourService[]> {
  return new Promise((resolve) => {
    if (!bonjourInstance) {
      bonjourInstance = new Bonjour();
    }

    const services: BonjourService[] = [];
    const browser = bonjourInstance.find({ type: serviceType });

    browser.on('up', (service: BonjourService) => {
      logger.debug('Discovered mDNS service', {
        name: sanitizeString(service.name),
        host: service.host,
        port: service.port,
      });
      services.push(service);
    });

    browser.on('error', (error: Error) => {
      logger.error('mDNS discovery error', { error: error.message });
    });

    // Stop discovery after timeout
    setTimeout(() => {
      browser.stop();
      resolve(services);
    }, timeout);
  });
}

/**
 * Get platform-specific mDNS implementation info
 *
 * Returns information about the underlying mDNS implementation.
 *
 * @returns Platform info
 */
export function getPlatformInfo(): {
  platform: string;
  supported: boolean;
  implementation: string;
} {
  const platform = process.platform;
  const supported = isMDNSSupported();

  let implementation = 'Unknown';
  if (platform === 'darwin') {
    implementation = 'Bonjour (native)';
  } else if (platform === 'linux') {
    implementation = 'Avahi';
  } else if (platform === 'win32') {
    implementation = 'Bonjour for Windows';
  }

  return {
    platform,
    supported,
    implementation,
  };
}

export default {
  startMDNS,
  stopMDNS,
  getMDNSStatus,
  restartMDNS,
  isMDNSSupported,
  discoverServices,
  getPlatformInfo,
};
