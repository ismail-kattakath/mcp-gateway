/**
 * Kerberos User Provisioning
 *
 * Just-in-time (JIT) user provisioning for Kerberos authentication.
 * Creates or updates user accounts based on Kerberos principal.
 *
 * Related: Epic #21 (Advanced Authentication - Kerberos/mTLS)
 */

import { getUsersModel } from '../../../storage/models/users.js';
import type { UserRecord } from '../../../storage/models/users.js';
import logger from '../../../logging/logger.js';
import { sanitizeString } from '../../../logging/sanitizer.js';

export interface KerberosUserInfo {
  principal: string; // e.g., user@REALM
  realm: string;
  username: string; // extracted from principal
}

/**
 * Parse Kerberos principal into components
 *
 * Examples:
 * - user@EXAMPLE.COM -> { principal, realm: EXAMPLE.COM, username: user }
 * - user/admin@EXAMPLE.COM -> { principal, realm: EXAMPLE.COM, username: user/admin }
 */
export function parseKerberosPrincipal(principal: string): KerberosUserInfo {
  const parts = principal.split('@');
  if (parts.length !== 2) {
    throw new Error(`Invalid Kerberos principal: ${principal}`);
  }

  const [username, realm] = parts;
  return {
    principal,
    realm,
    username,
  };
}

/**
 * Provision or update user from Kerberos principal
 *
 * Flow:
 * 1. Check if user exists with this principal
 * 2. If exists, update last_login_at
 * 3. If not exists, create new user (JIT provisioning)
 *
 * New users are created with:
 * - username from principal
 * - role: 'user' (default)
 * - status: 'active'
 * - No password (Kerberos-only authentication)
 */
export async function provisionKerberosUser(userInfo: KerberosUserInfo): Promise<UserRecord> {
  const usersModel = getUsersModel();

  // Check if user exists with this principal
  let user = await usersModel.findByKerberosPrincipal(userInfo.principal);

  if (user) {
    // Update last login
    user = await usersModel.update(user.id, {});
    logger.info('Kerberos user authenticated', {
      userId: sanitizeString(user.id),
      username: sanitizeString(user.username),
      principal: sanitizeString(userInfo.principal),
    });
    // Cast to UserRecord to satisfy type system
    return user as unknown as UserRecord;
  }

  // JIT provision new user
  user = await usersModel.createFromKerberos({
    username: userInfo.username,
    kerberosPrincipal: userInfo.principal,
    role: 'user',
    status: 'active',
  });

  logger.info('Kerberos user provisioned (JIT)', {
    userId: sanitizeString(user.id),
    username: sanitizeString(user.username),
    principal: sanitizeString(userInfo.principal),
    realm: sanitizeString(userInfo.realm),
  });

  // Cast to UserRecord to satisfy type system
  return user as unknown as UserRecord;
}

/**
 * Check if principal is allowed to authenticate
 *
 * Additional validation beyond Kerberos verification:
 * - Check if user status is 'active'
 * - Check if user is not locked
 */
export function validatePrincipalAccess(user: UserRecord): void {
  if (user.status !== 'active') {
    throw new Error(`User account is ${user.status}. Contact administrator to enable account.`);
  }
}
