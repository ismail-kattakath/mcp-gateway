/**
 * MCP Gateway Firewall - Multi-layer network security
 *
 * Provides IP filtering at multiple layers:
 * 1. Application layer (express-ipfilter)
 * 2. OS layer (iptables on Linux)
 * 3. Reverse proxy layer (Traefik/Nginx - see docs)
 *
 * Related: Epic #23 (Network Security)
 */

import type { Request, Response, NextFunction } from 'express';
import { createIpFilterMiddleware, testIpAgainstRules } from './ipfilter.js';
import {
  isIptablesAvailable,
  syncIptablesToDatabase,
  checkIptablesPermissions,
} from './iptables.js';
import { loadFirewallConfig, saveFirewallConfig, type FirewallConfig } from './config.js';
import { migrateIpAllowlist, checkLegacyIpAllowlist, validateIpRange } from './migration.js';
import logger from '../../logging/logger.js';

/**
 * Initialize firewall system
 * - Run v2.x migration if needed
 * - Sync iptables if enabled
 * - Log configuration
 */
export async function initializeFirewall(
  registryPath?: string,
  tenant?: string,
  gatewayPort: number = 3000
): Promise<void> {
  logger.info('Initializing firewall system');

  // Check for legacy IP allowlist
  const hasLegacy = checkLegacyIpAllowlist(registryPath);

  // Run migration if legacy config exists
  if (hasLegacy) {
    await migrateIpAllowlist(registryPath, tenant);
  }

  // Load firewall config
  const config = await loadFirewallConfig(tenant);

  if (!config.enabled) {
    logger.info('Firewall is disabled (default for backward compatibility)');
    logger.info('To enable: mcp firewall enable');
    return;
  }

  logger.info('Firewall enabled', {
    mode: config.mode,
    iptablesEnabled: config.iptablesEnabled,
  });

  // Check iptables availability
  if (config.iptablesEnabled) {
    const available = isIptablesAvailable();
    if (!available) {
      logger.warn('iptables integration enabled but iptables not available', {
        os: process.platform,
        message: 'iptables is only supported on Linux',
      });
    } else {
      // Check permissions
      const hasPermissions = await checkIptablesPermissions(config.iptablesSudo);
      if (!hasPermissions) {
        logger.warn('iptables integration enabled but insufficient permissions', {
          message: config.iptablesSudo
            ? 'sudo iptables failed - check sudoers configuration'
            : 'Try enabling firewall.iptables_sudo in settings',
        });
      } else {
        // Sync rules
        await syncIptablesToDatabase(gatewayPort, tenant);
        logger.info('iptables rules synced with database');
      }
    }
  }
}

/**
 * Create firewall middleware for Express
 */
export function createFirewallMiddleware(tenant?: string) {
  // Middleware that always checks current config
  return async (req: Request, res: Response, next: NextFunction): Promise<void | Response> => {
    // Always allow /health endpoint
    if (req.path === '/health') {
      return next();
    }

    // Load config on each request (allows dynamic updates)
    const config = await loadFirewallConfig(tenant);

    // If firewall disabled, skip
    if (!config.enabled) {
      return next();
    }

    // Apply IP filtering
    return createIpFilterMiddleware(tenant)(req, res, next);
  };
}

/**
 * Re-export firewall modules
 */
export * from './config.js';
export * from './ipfilter.js';
export * from './iptables.js';
export * from './migration.js';

// Re-export storage model
export * from '../../storage/models/firewall-rules.js';

/**
 * Test if an IP would be allowed
 */
export { testIpAgainstRules };

/**
 * Validate IP or CIDR
 */
export { validateIpRange };
