/**
 * v2.x to v3.0 firewall migration
 *
 * Auto-migrates IP allowlist from .mcp-gateway.json to firewall_rules table
 * Logs deprecation warnings
 *
 * Related: Epic #23 (Network Security)
 */

import { existsSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { homedir } from 'os';
import logger, { sanitizeString } from '../../logging/logger.js';
import {
  createFirewallRule,
  getFirewallRuleByIpRange,
  listFirewallRules,
} from '../../storage/models/firewall-rules.js';
import { saveFirewallConfig } from './config.js';

/**
 * v2.x auth config format
 */
interface LegacyAuthConfig {
  disableAuth?: boolean;
  allowedIPs?: string[];
}

/**
 * Get legacy auth config path
 */
function getLegacyAuthConfigPath(registryPath?: string): string {
  const CONFIG_FILENAME = '.mcp-gateway.json';

  // If registry path provided, use its directory
  if (registryPath && existsSync(registryPath)) {
    const projectRoot = dirname(registryPath);
    return resolve(projectRoot, CONFIG_FILENAME);
  }

  // Otherwise use home directory
  return resolve(homedir(), CONFIG_FILENAME);
}

/**
 * Load legacy auth config from v2.x
 */
function loadLegacyAuthConfig(registryPath?: string): LegacyAuthConfig | null {
  const configPath = getLegacyAuthConfigPath(registryPath);

  if (!existsSync(configPath)) {
    return null;
  }

  try {
    const content = readFileSync(configPath, 'utf-8');
    const config = JSON.parse(content) as LegacyAuthConfig;
    return config;
  } catch (error) {
    logger.error('Failed to load legacy auth config', {
      path: sanitizeString(configPath),
      error,
    });
    return null;
  }
}

/**
 * Migrate v2.x IP allowlist to v3.0 firewall rules
 */
export async function migrateIpAllowlist(
  registryPath?: string,
  tenant?: string | null
): Promise<void> {
  const legacyConfig = loadLegacyAuthConfig(registryPath);

  if (!legacyConfig || !legacyConfig.allowedIPs || legacyConfig.allowedIPs.length === 0) {
    logger.debug('No legacy IP allowlist found - skipping migration');
    return;
  }

  logger.warn('⚠️  DEPRECATION WARNING: IP allowlist in .mcp-gateway.json is deprecated', {
    message: 'Migrating to new firewall_rules table',
    action: 'This migration will run once. Please use CLI: mcp firewall allow/deny',
  });

  // Check if already migrated
  const existingRules = listFirewallRules({ tenant: tenant ?? undefined });
  if (existingRules.length > 0) {
    logger.info('Firewall rules already exist - skipping migration', {
      existingRulesCount: existingRules.length,
    });
    return;
  }

  let migratedCount = 0;

  for (const ipRange of legacyConfig.allowedIPs) {
    try {
      // Check if rule already exists
      const existing = getFirewallRuleByIpRange(ipRange, tenant ?? undefined);
      if (existing) {
        logger.debug('Firewall rule already exists', {
          ipRange: sanitizeString(ipRange),
        });
        continue;
      }

      // Create new firewall rule
      await createFirewallRule({
        ip_range: ipRange,
        rule_type: 'allow',
        description: 'Migrated from v2.x IP allowlist',
        enabled: true,
        tenant: tenant ?? undefined,
      });

      migratedCount++;

      logger.info('Migrated IP allowlist entry to firewall rule', {
        ipRange: sanitizeString(ipRange),
      });
    } catch (error) {
      logger.error('Failed to migrate IP allowlist entry', {
        ipRange: sanitizeString(ipRange),
        error,
      });
    }
  }

  // Enable firewall and set to whitelist mode (same behavior as v2.x)
  if (migratedCount > 0) {
    await saveFirewallConfig(
      {
        enabled: true,
        mode: 'whitelist',
      },
      tenant ?? null
    );

    logger.info('IP allowlist migration completed', {
      migratedCount,
      total: legacyConfig.allowedIPs.length,
    });
  }
}

/**
 * Check if legacy IP allowlist exists and log deprecation warning
 */
export function checkLegacyIpAllowlist(registryPath?: string): boolean {
  const legacyConfig = loadLegacyAuthConfig(registryPath);

  if (!legacyConfig || !legacyConfig.allowedIPs || legacyConfig.allowedIPs.length === 0) {
    return false;
  }

  logger.warn('⚠️  DEPRECATION WARNING: IP allowlist in .mcp-gateway.json is deprecated', {
    message: 'This feature will be removed in v4.0',
    migration: 'Run automatic migration or use CLI: mcp firewall allow <ip>',
    documentationUrl: 'https://github.com/ismail-kattakath/mcp-gateway/docs/MIGRATION-v2.1.md',
  });

  return true;
}

/**
 * Validate IP or CIDR notation
 */
export function validateIpRange(ipRange: string): { valid: boolean; error?: string } {
  const ipaddr = require('ipaddr.js');

  try {
    if (ipRange.includes('/')) {
      // CIDR notation
      ipaddr.parseCIDR(ipRange);
    } else {
      // Single IP
      ipaddr.parse(ipRange);
    }

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: `Invalid IP or CIDR notation: ${error}`,
    };
  }
}
