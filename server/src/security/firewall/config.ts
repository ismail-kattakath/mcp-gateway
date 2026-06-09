/**
 * Firewall configuration management
 *
 * Loads firewall settings from database (settings table)
 * Provides type-safe access to firewall configuration
 *
 * Related: Epic #23 (Network Security)
 */

import { settingsModel } from '../../storage/models/settings.js';
import logger from '../../logging/logger.js';

/**
 * Firewall mode: whitelist (default deny) or blacklist (default allow)
 */
export type FirewallMode = 'whitelist' | 'blacklist';

/**
 * Firewall configuration
 */
export interface FirewallConfig {
  /** Enable firewall (default: false for backward compatibility) */
  enabled: boolean;

  /** Firewall mode: whitelist or blacklist (default: whitelist) */
  mode: FirewallMode;

  /** Enable iptables integration (Linux only, default: false) */
  iptablesEnabled: boolean;

  /** iptables chain to use (default: INPUT) */
  iptablesChain: string;

  /** Use sudo for iptables (default: false) */
  iptablesSudo: boolean;
}

/**
 * Default firewall configuration (backward compatible)
 */
export const DEFAULT_FIREWALL_CONFIG: FirewallConfig = {
  enabled: false, // Disabled by default for backward compatibility
  mode: 'whitelist',
  iptablesEnabled: false,
  iptablesChain: 'INPUT',
  iptablesSudo: false,
};

/**
 * Load firewall configuration from database
 */
export async function loadFirewallConfig(tenant?: string | null): Promise<FirewallConfig> {
  try {
    const enabled = await settingsModel.get('firewall.enabled', tenant ?? null);
    const mode = await settingsModel.get('firewall.mode', tenant ?? null);
    const iptablesEnabled = await settingsModel.get('firewall.iptables_enabled', tenant ?? null);
    const iptablesChain = await settingsModel.get('firewall.iptables_chain', tenant ?? null);
    const iptablesSudo = await settingsModel.get('firewall.iptables_sudo', tenant ?? null);

    return {
      enabled: enabled ? JSON.parse(enabled.value) : DEFAULT_FIREWALL_CONFIG.enabled,
      mode: mode ? (JSON.parse(mode.value) as FirewallMode) : DEFAULT_FIREWALL_CONFIG.mode,
      iptablesEnabled: iptablesEnabled
        ? JSON.parse(iptablesEnabled.value)
        : DEFAULT_FIREWALL_CONFIG.iptablesEnabled,
      iptablesChain: iptablesChain
        ? JSON.parse(iptablesChain.value)
        : DEFAULT_FIREWALL_CONFIG.iptablesChain,
      iptablesSudo: iptablesSudo
        ? JSON.parse(iptablesSudo.value)
        : DEFAULT_FIREWALL_CONFIG.iptablesSudo,
    };
  } catch (error) {
    logger.error('Failed to load firewall config', { error });
    return DEFAULT_FIREWALL_CONFIG;
  }
}

/**
 * Save firewall configuration to database
 */
export async function saveFirewallConfig(
  config: Partial<FirewallConfig>,
  tenant?: string | null
): Promise<void> {
  try {
    if (config.enabled !== undefined) {
      await settingsModel.set('firewall.enabled', {
        value: JSON.stringify(config.enabled),
        tenant: tenant ?? null,
        category: 'firewall',
        description: 'Enable firewall (IP filtering)',
      });
    }

    if (config.mode !== undefined) {
      await settingsModel.set('firewall.mode', {
        value: JSON.stringify(config.mode),
        tenant: tenant ?? null,
        category: 'firewall',
        description: 'Firewall mode: whitelist or blacklist',
      });
    }

    if (config.iptablesEnabled !== undefined) {
      await settingsModel.set('firewall.iptables_enabled', {
        value: JSON.stringify(config.iptablesEnabled),
        tenant: tenant ?? null,
        category: 'firewall',
        description: 'Enable iptables integration (Linux only)',
      });
    }

    if (config.iptablesChain !== undefined) {
      await settingsModel.set('firewall.iptables_chain', {
        value: JSON.stringify(config.iptablesChain),
        tenant: tenant ?? null,
        category: 'firewall',
        description: 'iptables chain to use (default: INPUT)',
      });
    }

    if (config.iptablesSudo !== undefined) {
      await settingsModel.set('firewall.iptables_sudo', {
        value: JSON.stringify(config.iptablesSudo),
        tenant: tenant ?? null,
        category: 'firewall',
        description: 'Use sudo for iptables commands',
      });
    }

    logger.info('Saved firewall configuration', {
      changes: Object.keys(config),
      tenant: tenant ?? 'default',
    });
  } catch (error) {
    logger.error('Failed to save firewall config', { error });
    throw error;
  }
}

/**
 * Check if firewall is enabled
 */
export async function isFirewallEnabled(tenant?: string | null): Promise<boolean> {
  const config = await loadFirewallConfig(tenant ?? null);
  return config.enabled;
}

/**
 * Get firewall mode
 */
export async function getFirewallMode(tenant?: string | null): Promise<FirewallMode> {
  const config = await loadFirewallConfig(tenant ?? null);
  return config.mode;
}

/**
 * Check if iptables integration is enabled
 */
export async function isIptablesEnabled(tenant?: string | null): Promise<boolean> {
  const config = await loadFirewallConfig(tenant ?? null);
  return config.iptablesEnabled;
}
