/**
 * Permission Matrix & Utilities
 *
 * Centralized permission definitions and utility functions.
 *
 * Related: Epic #17 (RBAC & Multi-Tenancy)
 */

import type { Role } from './roles.js';
import type { Action, Subject } from './abilities.js';

/**
 * Permission matrix: What each role can do on each resource
 */
export const PERMISSION_MATRIX: Record<Role, Partial<Record<Subject, Action[]>>> = {
  admin: {
    server: ['read', 'create', 'update', 'delete', 'manage'],
    tool: ['read', 'create', 'update', 'delete', 'manage', 'write'],
    user: ['read', 'create', 'update', 'delete', 'manage'],
    role: ['read', 'create', 'update', 'delete', 'manage'],
    setting: ['read', 'create', 'update', 'delete', 'manage'],
    apikey: ['read', 'create', 'update', 'delete', 'manage'],
    audit: ['read', 'manage'],
  },
  user: {
    server: ['read', 'create', 'update', 'delete'], // Update/delete only own
    tool: ['read', 'write'], // Can execute tools
    user: ['read'], // Only own user
    role: ['read'],
    setting: ['read'],
    apikey: ['read', 'create', 'update', 'delete'], // Only own keys
    audit: ['read'], // Only own logs
  },
  readonly: {
    server: ['read'],
    tool: ['read'],
    user: ['read'], // Only own user
    role: ['read'],
    setting: ['read'],
    apikey: ['read'], // Only own keys
    audit: ['read'], // Only own logs
  },
};

/**
 * Check if role has permission for action on subject
 *
 * @param role - User role
 * @param action - Action to perform
 * @param subject - Subject to act on
 * @returns True if role has permission
 */
export function roleHasPermission(role: Role, action: Action, subject: Subject): boolean {
  const permissions = PERMISSION_MATRIX[role];

  if (!permissions) {
    return false;
  }

  const subjectPermissions = permissions[subject];

  if (!subjectPermissions) {
    return false;
  }

  // Check if role has the specific action or 'manage' (all actions)
  return subjectPermissions.includes(action) || subjectPermissions.includes('manage');
}

/**
 * Get all permissions for a role
 *
 * @param role - User role
 * @returns Array of permission strings
 */
export function getRolePermissions(role: Role): string[] {
  const permissions = PERMISSION_MATRIX[role];

  if (!permissions) {
    return [];
  }

  const result: string[] = [];

  for (const [subject, actions] of Object.entries(permissions)) {
    for (const action of actions) {
      result.push(`${action}:${subject}`);
    }
  }

  return result;
}

/**
 * Format permission string
 *
 * @param action - Action
 * @param subject - Subject
 * @returns Formatted permission string (e.g., "read:server")
 */
export function formatPermission(action: Action, subject: Subject): string {
  return `${action}:${subject}`;
}

/**
 * Parse permission string
 *
 * @param permission - Permission string (e.g., "read:server")
 * @returns Parsed action and subject
 */
export function parsePermission(permission: string): {
  action: Action;
  subject: Subject;
} | null {
  const [action, subject] = permission.split(':');

  if (!action || !subject) {
    return null;
  }

  return {
    action: action as Action,
    subject: subject as Subject,
  };
}

/**
 * Get permission description
 *
 * @param action - Action
 * @param subject - Subject
 * @returns Human-readable description
 */
export function getPermissionDescription(action: Action, subject: Subject): string {
  const descriptions: Record<Action, string> = {
    read: 'View',
    write: 'Execute/Modify',
    create: 'Create new',
    update: 'Update existing',
    delete: 'Delete',
    manage: 'Full control over',
  };

  const subjectNames: Record<Subject, string> = {
    server: 'MCP servers',
    tool: 'tools',
    user: 'users',
    role: 'roles',
    setting: 'settings',
    apikey: 'API keys',
    audit: 'audit logs',
    all: 'all resources',
  };

  return `${descriptions[action]} ${subjectNames[subject]}`;
}
