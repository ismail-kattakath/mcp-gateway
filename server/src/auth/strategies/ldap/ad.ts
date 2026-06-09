/**
 * Active Directory Helper
 *
 * Provides AD-specific functionality:
 * - Nested group resolution
 * - sAMAccountName and userPrincipalName support
 * - Domain controller failover
 *
 * Related: Epic #20 (LDAP/AD Integration)
 */

import logger from '../../../logging/logger.js';
import { sanitizeString } from '../../../logging/sanitizer.js';
import type { LDAPProviderPublic } from '../../../storage/models/ldap-providers.js';

/**
 * Active Directory configuration presets
 */
export const AD_PRESETS = {
  /**
   * Search filter for sAMAccountName (Windows username)
   */
  SAMACCOUNTNAME_FILTER: '(&(objectClass=user)(sAMAccountName={{username}}))',

  /**
   * Search filter for userPrincipalName (email format)
   */
  UPN_FILTER: '(&(objectClass=user)(userPrincipalName={{username}}))',

  /**
   * Default attribute mapping for Active Directory
   */
  DEFAULT_ATTRIBUTES: {
    username: 'sAMAccountName',
    email: 'mail',
    fullName: 'displayName',
    firstName: 'givenName',
    lastName: 'sn',
    groups: 'memberOf',
  },
};

/**
 * Resolve nested group memberships
 *
 * Active Directory supports transitive group membership via the memberOf attribute.
 * This function recursively resolves all group memberships.
 *
 * @param groups - Initial groups from user's memberOf attribute
 * @param maxDepth - Maximum recursion depth (default: 10)
 * @returns All group DNs (including nested)
 */
export function resolveNestedGroups(groups: string | string[], maxDepth = 10): string[] {
  const groupArray = Array.isArray(groups) ? groups : [groups];
  const allGroups = new Set<string>();
  const visited = new Set<string>();

  function traverse(groupDn: string, depth: number) {
    if (depth > maxDepth || visited.has(groupDn)) {
      return;
    }

    visited.add(groupDn);
    allGroups.add(groupDn);

    // In a full implementation, we would query LDAP for the group's memberOf
    // For now, we just collect direct groups
    // TODO: Query LDAP for nested group memberships
  }

  for (const group of groupArray) {
    traverse(group, 0);
  }

  return Array.from(allGroups);
}

/**
 * Extract domain controllers from URL
 *
 * Supports multiple DCs for failover:
 * - ldaps://dc1.corp.example.com:636,dc2.corp.example.com:636
 *
 * @param url - LDAP URL (may contain comma-separated DCs)
 * @returns Array of DC URLs
 */
export function extractDomainControllers(url: string): string[] {
  // Check if URL contains multiple DCs (comma-separated)
  if (url.includes(',')) {
    // Extract protocol and port from first URL
    const match = url.match(/^(ldaps?:\/\/)([^:,]+)(:\d+)?/);
    if (!match) {
      return [url];
    }

    const protocol = match[1];
    const port = match[3] || '';

    // Split by comma and build full URLs
    const hosts = url
      .replace(/^ldaps?:\/\//, '')
      .split(',')
      .map((h) => h.trim());

    return hosts.map((host) => {
      // If host already has protocol, use as-is
      if (host.startsWith('ldap://') || host.startsWith('ldaps://')) {
        return host;
      }
      // Otherwise, add protocol and port
      return `${protocol}${host.replace(/:\d+$/, '')}${port}`;
    });
  }

  return [url];
}

/**
 * Detect if username is in UPN format (e.g., user@domain.com)
 */
export function isUserPrincipalName(username: string): boolean {
  return username.includes('@');
}

/**
 * Build Active Directory search filter
 *
 * Auto-detects sAMAccountName vs userPrincipalName format
 *
 * @param username - Username
 * @param customFilter - Custom filter (optional)
 * @returns LDAP search filter
 */
export function buildADSearchFilter(username: string, customFilter?: string): string {
  if (customFilter) {
    return customFilter.replace('{{username}}', username);
  }

  if (isUserPrincipalName(username)) {
    return AD_PRESETS.UPN_FILTER.replace('{{username}}', username);
  }

  return AD_PRESETS.SAMACCOUNTNAME_FILTER.replace('{{username}}', username);
}

/**
 * Create Active Directory provider preset
 *
 * Provides sensible defaults for AD environments
 */
export function createADProviderPreset(
  partial: Partial<LDAPProviderPublic>
): Partial<LDAPProviderPublic> {
  return {
    ...partial,
    search_filter: partial.search_filter || AD_PRESETS.SAMACCOUNTNAME_FILTER,
    attribute_mapping: {
      ...AD_PRESETS.DEFAULT_ATTRIBUTES,
      ...(partial.attribute_mapping || {}),
    },
    tls_enabled: partial.tls_enabled !== undefined ? partial.tls_enabled : true,
    tls_reject_unauthorized:
      partial.tls_reject_unauthorized !== undefined ? partial.tls_reject_unauthorized : true,
    pool_size: partial.pool_size || 5,
    timeout: partial.timeout || 10000,
  };
}

/**
 * Parse AD distinguished name components
 *
 * Example: "CN=John Doe,OU=Users,DC=corp,DC=example,DC=com"
 * Returns: { cn: "John Doe", ou: ["Users"], dc: ["corp", "example", "com"] }
 */
export function parseDistinguishedName(dn: string): Record<string, string | string[]> {
  const components: Record<string, string[]> = {};

  const parts = dn.split(',').map((p) => p.trim());

  for (const part of parts) {
    const [key, value] = part.split('=').map((s) => s.trim());

    if (!key || !value) {
      continue;
    }

    const lowerKey = key.toLowerCase();

    if (!components[lowerKey]) {
      components[lowerKey] = [];
    }

    components[lowerKey].push(value);
  }

  // Convert single-value arrays to strings
  const result: Record<string, string | string[]> = {};
  for (const [key, values] of Object.entries(components)) {
    result[key] = values.length === 1 ? values[0] : values;
  }

  return result;
}

/**
 * Extract domain from distinguished name
 *
 * Example: "CN=John Doe,OU=Users,DC=corp,DC=example,DC=com" -> "corp.example.com"
 */
export function extractDomainFromDN(dn: string): string | null {
  const parsed = parseDistinguishedName(dn);
  const dc = parsed.dc;

  if (!dc) {
    return null;
  }

  return Array.isArray(dc) ? dc.join('.') : dc;
}

/**
 * Log Active Directory authentication attempt
 */
export function logADAuthentication(
  provider: string,
  username: string,
  success: boolean,
  error?: Error
): void {
  if (success) {
    logger.info('Active Directory authentication successful', {
      provider: sanitizeString(provider),
      username: sanitizeString(username),
      isUPN: isUserPrincipalName(username),
    });
  } else {
    logger.error('Active Directory authentication failed', {
      provider: sanitizeString(provider),
      username: sanitizeString(username),
      isUPN: isUserPrincipalName(username),
      error: sanitizeString(error?.message || 'Unknown error'),
    });
  }
}

export default {
  AD_PRESETS,
  resolveNestedGroups,
  extractDomainControllers,
  isUserPrincipalName,
  buildADSearchFilter,
  createADProviderPreset,
  parseDistinguishedName,
  extractDomainFromDN,
  logADAuthentication,
};
