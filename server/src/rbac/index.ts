/**
 * RBAC Module
 *
 * Role-Based Access Control and Multi-Tenancy support.
 *
 * Related: Epic #17 (RBAC & Multi-Tenancy)
 */

// Abilities
export {
  defineAbilitiesFor,
  checkPermission,
  getUserPermissions,
  type Action,
  type Subject,
  type AppAbility,
  type SubjectWithConditions,
} from './abilities.js';

// Re-export CASL's subject helper for creating typed subjects
export { subject } from '@casl/ability';

// Roles
export {
  DEFAULT_ROLES,
  isValidRole,
  getRoleDefinition,
  getAllRoles,
  getRoleByName,
  DEFAULT_USER_ROLE,
  type Role,
  type RoleDefinition,
} from './roles.js';

// Permissions
export {
  PERMISSION_MATRIX,
  roleHasPermission,
  getRolePermissions,
  formatPermission,
  parsePermission,
  getPermissionDescription,
} from './permissions.js';

// Middleware
export {
  tenantIsolation,
  requirePermission,
  requireOwnership,
  enforceTenantFilter,
  type AuthenticatedRequest,
} from './middleware.js';
