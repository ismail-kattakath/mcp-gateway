/**
 * LDAP Group Resolution and Role Mapping
 *
 * Maps LDAP groups to RBAC roles and handles nested group resolution.
 *
 * Related: Epic #20 (LDAP/AD Integration), Epic #17 (RBAC)
 */

import logger from '../../../logging/logger.js';
import { sanitizeString } from '../../../logging/sanitizer.js';
import type { GroupMapping } from '../../../storage/models/ldap-providers.js';
import { resolveNestedGroups } from './ad.js';

/**
 * Map LDAP groups to RBAC roles
 *
 * @param groups - LDAP group DNs
 * @param mapping - Group mapping configuration
 * @param resolveNested - Whether to resolve nested groups (default: true)
 * @returns Assigned role
 */
export function mapGroupsToRole(
  groups: string | string[] | undefined,
  mapping: GroupMapping,
  resolveNested = true
): string {
  if (!groups) {
    return mapping.default || 'user';
  }

  // Convert to array
  const groupArray = Array.isArray(groups) ? groups : [groups];

  // Resolve nested groups if enabled
  const allGroups = resolveNested ? resolveNestedGroups(groupArray) : groupArray;

  // Check each group against mapping (order matters - first match wins)
  for (const [groupDn, role] of Object.entries(mapping)) {
    if (groupDn === 'default') {
      continue;
    }

    // Normalize both DNs for comparison (case-insensitive)
    const normalizedMappingDn = normalizeDN(groupDn);

    for (const userGroup of allGroups) {
      const normalizedUserGroup = normalizeDN(userGroup);

      if (normalizedUserGroup === normalizedMappingDn) {
        logger.debug('LDAP group matched to role', {
          group: sanitizeString(userGroup),
          role: sanitizeString(role),
        });
        return role;
      }
    }
  }

  // No match found, return default role
  const defaultRole = mapping.default || 'user';

  logger.debug('No LDAP group match, using default role', {
    role: sanitizeString(defaultRole),
    groupCount: allGroups.length,
  });

  return defaultRole;
}

/**
 * Normalize Distinguished Name for comparison
 *
 * - Lowercase
 * - Remove extra whitespace
 * - Sort components (optional)
 */
function normalizeDN(dn: string): string {
  return dn.toLowerCase().replace(/\s+/g, '');
}

/**
 * Extract group names from group DNs
 *
 * Example: "CN=Admins,OU=Groups,DC=corp,DC=com" -> "Admins"
 */
export function extractGroupNames(groups: string | string[] | undefined): string[] {
  if (!groups) {
    return [];
  }

  const groupArray = Array.isArray(groups) ? groups : [groups];

  return groupArray.map((dn) => {
    // Extract CN (Common Name) from DN
    const match = dn.match(/CN=([^,]+)/i);
    return match ? match[1] : dn;
  });
}

/**
 * Filter groups by base DN
 *
 * Only includes groups that are under the specified base DN
 */
export function filterGroupsByBaseDN(
  groups: string | string[] | undefined,
  baseDn: string
): string[] {
  if (!groups) {
    return [];
  }

  const groupArray = Array.isArray(groups) ? groups : [groups];
  const normalizedBaseDn = normalizeDN(baseDn);

  return groupArray.filter((group) => {
    const normalizedGroup = normalizeDN(group);
    return normalizedGroup.endsWith(normalizedBaseDn);
  });
}

/**
 * Validate group mapping configuration
 *
 * Ensures all roles are valid RBAC roles
 */
export function validateGroupMapping(mapping: GroupMapping, validRoles: string[]): boolean {
  for (const [groupDn, role] of Object.entries(mapping)) {
    if (groupDn === 'default') {
      // Validate default role
      if (!validRoles.includes(role)) {
        logger.error('Invalid default role in group mapping', {
          role: sanitizeString(role),
          validRoles,
        });
        return false;
      }
    } else {
      // Validate group mapping role
      if (!validRoles.includes(role)) {
        logger.error('Invalid role in group mapping', {
          group: sanitizeString(groupDn),
          role: sanitizeString(role),
          validRoles,
        });
        return false;
      }
    }
  }

  return true;
}

/**
 * Build group mapping summary for logging
 */
export function buildGroupMappingSummary(mapping: GroupMapping): string {
  const entries = Object.entries(mapping)
    .filter(([key]) => key !== 'default')
    .map(([group, role]) => {
      const groupName = extractGroupNames([group])[0];
      return `${groupName} -> ${role}`;
    });

  const defaultRole = mapping.default || 'user';
  entries.push(`(default) -> ${defaultRole}`);

  return entries.join(', ');
}

/**
 * Check if user is member of specific group
 */
export function isMemberOfGroup(
  userGroups: string | string[] | undefined,
  targetGroup: string,
  resolveNested = true
): boolean {
  if (!userGroups) {
    return false;
  }

  const groupArray = Array.isArray(userGroups) ? userGroups : [userGroups];
  const allGroups = resolveNested ? resolveNestedGroups(groupArray) : groupArray;

  const normalizedTarget = normalizeDN(targetGroup);

  return allGroups.some((group) => normalizeDN(group) === normalizedTarget);
}

/**
 * Get highest privilege role from multiple groups
 *
 * Role hierarchy: admin > user > readonly
 */
export function getHighestPrivilegeRole(roles: string[]): string {
  const hierarchy = ['admin', 'user', 'readonly'];

  for (const role of hierarchy) {
    if (roles.includes(role)) {
      return role;
    }
  }

  return 'readonly';
}

export default {
  mapGroupsToRole,
  extractGroupNames,
  filterGroupsByBaseDN,
  validateGroupMapping,
  buildGroupMappingSummary,
  isMemberOfGroup,
  getHighestPrivilegeRole,
};
