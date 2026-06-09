/**
 * iptables wrapper for Linux OS-level firewall integration
 *
 * Manages iptables rules for IP filtering at kernel level
 * Requires root/sudo access and Linux OS
 *
 * Related: Epic #23 (Network Security)
 */

import { platform } from 'os';
import { spawn } from 'child_process';
import logger, { sanitizeString, sanitizeArgs } from '../../logging/logger.js';
import { loadFirewallConfig } from './config.js';

/**
 * Check if iptables is available and supported
 */
export function isIptablesAvailable(): boolean {
  // Only Linux supports iptables
  if (platform() !== 'linux') {
    return false;
  }

  // Check if iptables command exists
  try {
    const result = spawn('which', ['iptables']);
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Execute iptables command
 */
async function execIptables(args: string[], useSudo: boolean = false): Promise<string> {
  return new Promise((resolve, reject) => {
    const command = useSudo ? 'sudo' : 'iptables';
    const commandArgs = useSudo ? ['iptables', ...args] : args;

    logger.debug('Executing iptables command', {
      command,
      args: sanitizeArgs(commandArgs),
    });

    const proc = spawn(command, commandArgs, { shell: false });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`iptables failed with code ${code}: ${stderr}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to execute iptables: ${err.message}`));
    });
  });
}

/**
 * Add iptables rule to allow/deny IP
 */
export async function addIptablesRule(
  ipRange: string,
  action: 'ACCEPT' | 'DROP',
  port: number = 3000,
  tenant?: string | null
): Promise<void> {
  if (!isIptablesAvailable()) {
    logger.warn('iptables not available on this system');
    return;
  }

  const config = await loadFirewallConfig(tenant ?? null);
  const chain = config.iptablesChain;
  const useSudo = config.iptablesSudo;

  try {
    // Check if rule already exists
    const existingRules = await listIptablesRules(chain, useSudo);
    if (existingRules.some((r) => r.includes(ipRange) && r.includes(action))) {
      logger.debug('iptables rule already exists', {
        ipRange: sanitizeString(ipRange),
        action,
      });
      return;
    }

    // Add rule: iptables -A INPUT -s <ip> -p tcp --dport <port> -j <action>
    const args = ['-A', chain, '-s', ipRange, '-p', 'tcp', '--dport', port.toString(), '-j', action];

    await execIptables(args, useSudo);

    logger.info('Added iptables rule', {
      ipRange: sanitizeString(ipRange),
      action,
      chain,
      port,
    });
  } catch (error) {
    logger.error('Failed to add iptables rule', {
      ipRange: sanitizeString(ipRange),
      action,
      error,
    });
    throw error;
  }
}

/**
 * Remove iptables rule
 */
export async function removeIptablesRule(
  ipRange: string,
  action: 'ACCEPT' | 'DROP',
  port: number = 3000,
  tenant?: string | null
): Promise<void> {
  if (!isIptablesAvailable()) {
    logger.warn('iptables not available on this system');
    return;
  }

  const config = await loadFirewallConfig(tenant ?? null);
  const chain = config.iptablesChain;
  const useSudo = config.iptablesSudo;

  try {
    // Remove rule: iptables -D INPUT -s <ip> -p tcp --dport <port> -j <action>
    const args = ['-D', chain, '-s', ipRange, '-p', 'tcp', '--dport', port.toString(), '-j', action];

    await execIptables(args, useSudo);

    logger.info('Removed iptables rule', {
      ipRange: sanitizeString(ipRange),
      action,
      chain,
      port,
    });
  } catch (error) {
    logger.error('Failed to remove iptables rule', {
      ipRange: sanitizeString(ipRange),
      action,
      error,
    });
    throw error;
  }
}

/**
 * List iptables rules for a chain
 */
export async function listIptablesRules(chain: string = 'INPUT', useSudo: boolean = false): Promise<string[]> {
  if (!isIptablesAvailable()) {
    return [];
  }

  try {
    const args = ['-L', chain, '-n', '--line-numbers'];
    const output = await execIptables(args, useSudo);

    // Parse output into rules
    const lines = output.split('\n');
    return lines.filter((line) => line.trim().length > 0 && !line.startsWith('Chain'));
  } catch (error) {
    logger.error('Failed to list iptables rules', { chain, error });
    return [];
  }
}

/**
 * Flush all iptables rules for MCP Gateway (matching port)
 */
export async function flushIptablesRules(port: number = 3000, tenant?: string | null): Promise<void> {
  if (!isIptablesAvailable()) {
    logger.warn('iptables not available on this system');
    return;
  }

  const config = await loadFirewallConfig(tenant ?? null);
  const chain = config.iptablesChain;
  const useSudo = config.iptablesSudo;

  try {
    const rules = await listIptablesRules(chain, useSudo);

    // Find rules matching port and delete them (in reverse order to avoid index shifting)
    for (let i = rules.length - 1; i >= 0; i--) {
      const rule = rules[i];
      if (rule.includes(`dpt:${port}`)) {
        // Extract rule number
        const match = rule.match(/^(\d+)/);
        if (match) {
          const ruleNum = match[1];
          const args = ['-D', chain, ruleNum];
          await execIptables(args, useSudo);
        }
      }
    }

    logger.info('Flushed iptables rules for MCP Gateway', { chain, port });
  } catch (error) {
    logger.error('Failed to flush iptables rules', { chain, port, error });
    throw error;
  }
}

/**
 * Sync database rules to iptables
 * Adds rules that exist in DB but not in iptables
 * Removes rules that exist in iptables but not in DB
 */
export async function syncIptablesToDatabase(port: number = 3000, tenant?: string | null): Promise<void> {
  if (!isIptablesAvailable()) {
    logger.warn('iptables not available - skipping sync');
    return;
  }

  const { listFirewallRules } = await import('../../storage/models/firewall-rules.js');
  const { loadFirewallConfig } = await import('./config.js');

  const config = await loadFirewallConfig(tenant ?? null);

  if (!config.iptablesEnabled) {
    logger.debug('iptables integration disabled - skipping sync');
    return;
  }

  try {
    const dbRules = listFirewallRules({ enabled: true, tenant: tenant ?? undefined });

    // Clear existing MCP Gateway rules
    await flushIptablesRules(port, tenant);

    // Add rules based on mode
    if (config.mode === 'whitelist') {
      // In whitelist mode, add ACCEPT rules for allow entries
      const allowRules = dbRules.filter((r) => r.rule_type === 'allow');
      for (const rule of allowRules) {
        await addIptablesRule(rule.ip_range, 'ACCEPT', port, tenant);
      }

      // Add DROP rule at the end (deny all others)
      // This is typically done with a default policy, not individual rules
      logger.debug('Whitelist mode: Added ACCEPT rules, default policy should be DROP');
    } else {
      // In blacklist mode, add DROP rules for deny entries
      const denyRules = dbRules.filter((r) => r.rule_type === 'deny');
      for (const rule of denyRules) {
        await addIptablesRule(rule.ip_range, 'DROP', port, tenant);
      }

      logger.debug('Blacklist mode: Added DROP rules, default policy should be ACCEPT');
    }

    logger.info('Synced iptables rules with database', {
      mode: config.mode,
      rulesCount: dbRules.length,
    });
  } catch (error) {
    logger.error('Failed to sync iptables with database', { error });
    throw error;
  }
}

/**
 * Check if current user has permission to run iptables
 */
export async function checkIptablesPermissions(useSudo: boolean = false): Promise<boolean> {
  if (!isIptablesAvailable()) {
    return false;
  }

  try {
    // Try to list rules (read-only operation)
    await execIptables(['-L', 'INPUT', '-n'], useSudo);
    return true;
  } catch {
    return false;
  }
}
