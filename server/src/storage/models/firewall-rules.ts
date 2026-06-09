/**
 * Firewall Rules Model - CRUD operations for firewall_rules table
 *
 * Type-safe query wrapper for firewall rule management.
 * Related: Epic #23 (Network Security), Issue #XX
 */

import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../database.js';
import logger from '../../logging/logger.js';
import { sanitizeString } from '../../logging/sanitizer.js';

/**
 * Firewall rule record in database
 */
export interface FirewallRuleRecord {
  id: string;
  ip_range: string;
  rule_type: 'allow' | 'deny';
  description: string | null;
  enabled: number; // 0 or 1
  tenant: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

/**
 * Create firewall rule options
 */
export interface CreateFirewallRuleOptions {
  ip_range: string;
  rule_type: 'allow' | 'deny';
  description?: string;
  enabled?: boolean;
  tenant?: string;
  created_by?: string;
}

/**
 * Update firewall rule options
 */
export interface UpdateFirewallRuleOptions {
  ip_range?: string;
  rule_type?: 'allow' | 'deny';
  description?: string;
  enabled?: boolean;
}

/**
 * List firewall rules options
 */
export interface ListFirewallRulesOptions {
  rule_type?: 'allow' | 'deny';
  enabled?: boolean;
  tenant?: string;
}

/**
 * Create a new firewall rule
 */
export async function createFirewallRule(
  options: CreateFirewallRuleOptions
): Promise<FirewallRuleRecord> {
  const db = getDatabase();
  const id = uuidv4();
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO firewall_rules (
      id, ip_range, rule_type, description, enabled, tenant, created_at, updated_at, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    options.ip_range,
    options.rule_type,
    options.description ?? null,
    (options.enabled ?? true) ? 1 : 0,
    options.tenant ?? null,
    now,
    now,
    options.created_by ?? null
  );

  logger.info('Created firewall rule', {
    id,
    ip_range: sanitizeString(options.ip_range),
    rule_type: options.rule_type,
  });

  const record = getFirewallRuleById(id);
  if (!record) {
    throw new Error(`Failed to retrieve created firewall rule ${id}`);
  }

  return record;
}

/**
 * Get firewall rule by ID
 */
export function getFirewallRuleById(id: string): FirewallRuleRecord | null {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM firewall_rules WHERE id = ?');
  const row = stmt.get(id);

  return row ? (row as FirewallRuleRecord) : null;
}

/**
 * Get firewall rule by IP range
 */
export function getFirewallRuleByIpRange(
  ip_range: string,
  tenant?: string
): FirewallRuleRecord | null {
  const db = getDatabase();

  let stmt;
  let row;

  if (tenant !== undefined) {
    stmt = db.prepare('SELECT * FROM firewall_rules WHERE ip_range = ? AND tenant = ?');
    row = stmt.get(ip_range, tenant);
  } else {
    stmt = db.prepare('SELECT * FROM firewall_rules WHERE ip_range = ? AND tenant IS NULL');
    row = stmt.get(ip_range);
  }

  return row ? (row as FirewallRuleRecord) : null;
}

/**
 * List all firewall rules with optional filters
 */
export function listFirewallRules(options?: ListFirewallRulesOptions): FirewallRuleRecord[] {
  const db = getDatabase();
  const filters: string[] = [];
  const params: any[] = [];

  if (options?.rule_type) {
    filters.push('rule_type = ?');
    params.push(options.rule_type);
  }

  if (options?.enabled !== undefined) {
    filters.push('enabled = ?');
    params.push(options.enabled ? 1 : 0);
  }

  if (options?.tenant !== undefined) {
    if (options.tenant === null) {
      filters.push('tenant IS NULL');
    } else {
      filters.push('tenant = ?');
      params.push(options.tenant);
    }
  }

  const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
  const query = `SELECT * FROM firewall_rules ${whereClause} ORDER BY created_at ASC`;

  const stmt = db.prepare(query);
  const rows = stmt.all(...params);

  return rows as FirewallRuleRecord[];
}

/**
 * Update a firewall rule
 */
export async function updateFirewallRule(
  id: string,
  options: UpdateFirewallRuleOptions
): Promise<FirewallRuleRecord> {
  const db = getDatabase();
  const existing = getFirewallRuleById(id);

  if (!existing) {
    throw new Error(`Firewall rule not found: ${id}`);
  }

  const updates: string[] = [];
  const params: any[] = [];

  if (options.ip_range !== undefined) {
    updates.push('ip_range = ?');
    params.push(options.ip_range);
  }

  if (options.rule_type !== undefined) {
    updates.push('rule_type = ?');
    params.push(options.rule_type);
  }

  if (options.description !== undefined) {
    updates.push('description = ?');
    params.push(options.description);
  }

  if (options.enabled !== undefined) {
    updates.push('enabled = ?');
    params.push(options.enabled ? 1 : 0);
  }

  if (updates.length === 0) {
    return existing; // No changes
  }

  updates.push('updated_at = ?');
  params.push(new Date().toISOString());

  params.push(id);

  const query = `UPDATE firewall_rules SET ${updates.join(', ')} WHERE id = ?`;
  const stmt = db.prepare(query);
  stmt.run(...params);

  logger.info('Updated firewall rule', {
    id,
    changes: Object.keys(options).length,
  });

  const updated = getFirewallRuleById(id);
  if (!updated) {
    throw new Error(`Failed to retrieve updated firewall rule ${id}`);
  }

  return updated;
}

/**
 * Delete a firewall rule (hard delete)
 */
export function deleteFirewallRule(id: string): void {
  const db = getDatabase();
  const existing = getFirewallRuleById(id);

  if (!existing) {
    throw new Error(`Firewall rule not found: ${id}`);
  }

  const stmt = db.prepare('DELETE FROM firewall_rules WHERE id = ?');
  stmt.run(id);

  logger.info('Deleted firewall rule', {
    id,
    ip_range: sanitizeString(existing.ip_range),
  });
}

/**
 * Enable a firewall rule
 */
export async function enableFirewallRule(id: string): Promise<FirewallRuleRecord> {
  return updateFirewallRule(id, { enabled: true });
}

/**
 * Disable a firewall rule
 */
export async function disableFirewallRule(id: string): Promise<FirewallRuleRecord> {
  return updateFirewallRule(id, { enabled: false });
}

/**
 * Count firewall rules
 */
export function countFirewallRules(options?: ListFirewallRulesOptions): number {
  const db = getDatabase();
  const filters: string[] = [];
  const params: any[] = [];

  if (options?.rule_type) {
    filters.push('rule_type = ?');
    params.push(options.rule_type);
  }

  if (options?.enabled !== undefined) {
    filters.push('enabled = ?');
    params.push(options.enabled ? 1 : 0);
  }

  if (options?.tenant !== undefined) {
    if (options.tenant === null) {
      filters.push('tenant IS NULL');
    } else {
      filters.push('tenant = ?');
      params.push(options.tenant);
    }
  }

  const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
  const query = `SELECT COUNT(*) as count FROM firewall_rules ${whereClause}`;

  const stmt = db.prepare(query);
  const result = stmt.get(...params) as { count: number };

  return result.count;
}

/**
 * Delete all firewall rules for a tenant
 */
export function deleteAllFirewallRulesByTenant(tenant: string | null): void {
  const db = getDatabase();

  let stmt;
  if (tenant === null) {
    stmt = db.prepare('DELETE FROM firewall_rules WHERE tenant IS NULL');
    stmt.run();
  } else {
    stmt = db.prepare('DELETE FROM firewall_rules WHERE tenant = ?');
    stmt.run(tenant);
  }

  logger.info('Deleted all firewall rules for tenant', {
    tenant: tenant ?? 'default',
  });
}
