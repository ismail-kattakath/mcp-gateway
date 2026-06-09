/**
 * Role Definitions
 *
 * Default roles and permission matrix for MCP Gateway.
 *
 * Related: Epic #17 (RBAC & Multi-Tenancy)
 */

/**
 * Available roles in the system
 */
export type Role = 'admin' | 'user' | 'readonly';

/**
 * Role metadata
 */
export interface RoleDefinition {
  name: Role;
  description: string;
  permissions: string[];
}

/**
 * Default role definitions
 */
export const DEFAULT_ROLES: Record<Role, RoleDefinition> = {
  admin: {
    name: 'admin',
    description: 'Full system access including user and role management',
    permissions: [
      'manage:all', // Can do everything
      'manage:server',
      'manage:tool',
      'manage:user',
      'manage:role',
      'manage:setting',
      'manage:apikey',
      'manage:audit',
    ],
  },
  user: {
    name: 'user',
    description: 'Standard user with server creation and tool execution rights',
    permissions: [
      'read:server',
      'create:server',
      'update:server:own', // Can only update own servers
      'delete:server:own', // Can only delete own servers
      'read:tool',
      'write:tool', // Can execute tool calls
      'read:user:own', // Can only read own user info
      'update:user:own', // Can only update own user info
      'read:role',
      'read:setting',
      'manage:apikey:own', // Can manage own API keys
      'read:audit:own', // Can read own audit logs
    ],
  },
  readonly: {
    name: 'readonly',
    description: 'Read-only access to resources',
    permissions: [
      'read:server',
      'read:tool',
      'read:user:own',
      'read:role',
      'read:setting',
      'read:apikey:own',
      'read:audit:own',
    ],
  },
};

/**
 * Permission matrix showing what each role can do
 *
 * | Role     | Servers | Tools | Users | Roles | Settings | API Keys | Audit |
 * |----------|---------|-------|-------|-------|----------|----------|-------|
 * | admin    | CRUD    | CRUD  | CRUD  | CRUD  | CRUD     | CRUD     | R     |
 * | user     | R       | RU    | R*    | R     | R        | RU*      | R*    |
 * | readonly | R       | R     | R*    | R     | R        | R*       | R*    |
 *
 * R=Read, U=Update, C=Create, D=Delete, *=own only
 */

/**
 * Check if a role exists
 *
 * @param role - Role name to check
 * @returns True if role is valid
 */
export function isValidRole(role: string): role is Role {
  return role in DEFAULT_ROLES;
}

/**
 * Get role definition
 *
 * @param role - Role name
 * @returns Role definition or undefined
 */
export function getRoleDefinition(role: Role): RoleDefinition {
  return DEFAULT_ROLES[role];
}

/**
 * Get all available roles
 *
 * @returns Array of role definitions
 */
export function getAllRoles(): RoleDefinition[] {
  return Object.values(DEFAULT_ROLES);
}

/**
 * Get role by name
 *
 * @param name - Role name
 * @returns Role definition or undefined
 */
export function getRoleByName(name: string): RoleDefinition | undefined {
  if (isValidRole(name)) {
    return DEFAULT_ROLES[name];
  }
  return undefined;
}

/**
 * Default role assigned to new users
 */
export const DEFAULT_USER_ROLE: Role = 'user';
