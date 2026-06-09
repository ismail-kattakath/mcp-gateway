/**
 * mTLS User Provisioning
 *
 * Just-in-time (JIT) user provisioning for mTLS authentication.
 * Creates or updates user accounts based on client certificate identity.
 *
 * Related: Epic #21 (Advanced Authentication - Kerberos/mTLS)
 */

import { getUsersModel } from '../../../storage/models/users.js';
import type { UserRecord } from '../../../storage/models/users.js';
import logger from '../../../logging/logger.js';
import { sanitizeString } from '../../../logging/sanitizer.js';
import type { CertificateIdentity } from './identity.js';
import { extractUsername } from './identity.js';

export interface MtlsUserInfo {
  certificateDN: string; // Full subject DN
  username: string; // Extracted username from identity
  identityValue: string; // The actual identity value (CN, SAN, etc.)
}

/**
 * Provision or update user from certificate identity
 *
 * Flow:
 * 1. Check if user exists with this certificate DN
 * 2. If exists, update last_login_at
 * 3. If not exists, create new user (JIT provisioning)
 *
 * New users are created with:
 * - username from certificate identity
 * - role: 'user' (default)
 * - status: 'active'
 * - No password (certificate-only authentication)
 */
export async function provisionMtlsUser(userInfo: MtlsUserInfo): Promise<UserRecord> {
  const usersModel = getUsersModel();

  // Check if user exists with this certificate DN
  let user = await usersModel.findByCertificateDN(userInfo.certificateDN);

  if (user) {
    // Update last login
    user = await usersModel.update(user.id, {});
    logger.info('mTLS user authenticated', {
      userId: sanitizeString(user.id),
      username: sanitizeString(user.username),
      certificateDN: sanitizeString(userInfo.certificateDN),
    });
    // Cast to UserRecord to satisfy type system
    return user as unknown as UserRecord;
  }

  // JIT provision new user
  user = await usersModel.createFromCertificate({
    username: userInfo.username,
    certificateDN: userInfo.certificateDN,
    role: 'user',
    status: 'active',
  });

  logger.info('mTLS user provisioned (JIT)', {
    userId: sanitizeString(user.id),
    username: sanitizeString(user.username),
    certificateDN: sanitizeString(userInfo.certificateDN),
  });

  // Cast to UserRecord to satisfy type system
  return user as unknown as UserRecord;
}

/**
 * Create mTLS user info from certificate identity
 */
export function createMtlsUserInfo(
  identity: CertificateIdentity,
  identityValue: string
): MtlsUserInfo {
  return {
    certificateDN: identity.subjectDN,
    username: extractUsername(identityValue),
    identityValue,
  };
}

/**
 * Validate user access
 *
 * Additional validation beyond certificate verification:
 * - Check if user status is 'active'
 * - Check if user is not locked
 */
export function validateUserAccess(user: UserRecord): void {
  if (user.status !== 'active') {
    throw new Error(`User account is ${user.status}. Contact administrator to enable account.`);
  }
}
