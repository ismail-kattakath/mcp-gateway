/**
 * CASL Abilities Definition
 *
 * Defines permission rules for different user roles using CASL.
 * Supports fine-grained access control and multi-tenant isolation.
 *
 * Related: Epic #17 (RBAC & Multi-Tenancy)
 */

import { AbilityBuilder, createMongoAbility, MongoAbility } from '@casl/ability';
import type { UserPublic } from '../storage/models/users.js';

/**
 * Actions that can be performed on resources
 */
export type Action = 'read' | 'write' | 'create' | 'update' | 'delete' | 'manage';

/**
 * Resources that can be accessed
 */
export type Subject = 'server' | 'tool' | 'user' | 'role' | 'setting' | 'apikey' | 'audit' | 'all';

/**
 * Subject with conditions for field-level permissions
 */
export interface SubjectWithConditions {
  id?: string;
  userId?: string;
  tenantId?: string | null;
  owner?: string;
}

/**
 * Type alias for our CASL ability
 */
export type AppAbility = MongoAbility<[Action, Subject | SubjectWithConditions]>;

/**
 * Define abilities based on user role and tenant
 *
 * @param user - User to define abilities for
 * @returns CASL ability instance
 */
export function defineAbilitiesFor(user: UserPublic): AppAbility {
  const { can, cannot, build } = new AbilityBuilder<AppAbility>(createMongoAbility);

  if (user.role === 'admin') {
    // Admins can do everything across all tenants
    can('manage', 'all');
  } else if (user.role === 'user') {
    // Users can read servers
    can('read', 'server');

    // Users can create/update/delete their own servers
    can('create', 'server');
    can('update', 'server', { owner: user.id });
    can('delete', 'server', { owner: user.id });

    // Users can read/write tools (execute tool calls)
    can('read', 'tool');
    can('write', 'tool');

    // Users can read their own user info
    can('read', 'user', { id: user.id });

    // Users can update their own user info (password, email)
    can('update', 'user', { id: user.id });

    // Users can read available roles (but not manage them)
    can('read', 'role');

    // Users can read settings
    can('read', 'setting');

    // Users can manage their own API keys
    can('read', 'apikey', { userId: user.id });
    can('create', 'apikey', { userId: user.id });
    can('update', 'apikey', { userId: user.id });
    can('delete', 'apikey', { userId: user.id });

    // Users can read audit logs for their actions
    can('read', 'audit', { userId: user.id });
  } else if (user.role === 'readonly') {
    // Readonly users can only read
    can('read', 'server');
    can('read', 'tool');
    can('read', 'user', { id: user.id });
    can('read', 'role');
    can('read', 'setting');
    can('read', 'apikey', { userId: user.id });
    can('read', 'audit', { userId: user.id });
  }

  // Tenant isolation: users cannot access resources from other tenants
  // Admin is exempt (can access all tenants)
  if (user.role !== 'admin' && user.tenant !== null) {
    cannot('read', 'all', {
      tenantId: { $ne: user.tenant },
    });
    cannot('write', 'all', {
      tenantId: { $ne: user.tenant },
    });
    cannot('create', 'all', {
      tenantId: { $ne: user.tenant },
    });
    cannot('update', 'all', {
      tenantId: { $ne: user.tenant },
    });
    cannot('delete', 'all', {
      tenantId: { $ne: user.tenant },
    });
  }

  return build();
}

/**
 * Check if user has permission for action on subject
 *
 * @param user - User to check
 * @param action - Action to perform
 * @param subject - Subject to act on
 * @param conditions - Optional conditions (e.g., owner check)
 * @returns True if user has permission
 */
export function checkPermission(
  user: UserPublic,
  action: Action,
  subject: Subject | SubjectWithConditions
): boolean {
  const ability = defineAbilitiesFor(user);
  return ability.can(action, subject);
}

/**
 * Get all permissions for a user (for debugging/display)
 *
 * @param user - User to get permissions for
 * @returns Array of permission rules
 */
export function getUserPermissions(user: UserPublic): {
  action: Action;
  subject: Subject;
  conditions?: unknown;
}[] {
  const ability = defineAbilitiesFor(user);
  return ability.rules.map((rule) => ({
    action: rule.action as Action,
    subject: rule.subject as Subject,
    conditions: rule.conditions,
  }));
}
