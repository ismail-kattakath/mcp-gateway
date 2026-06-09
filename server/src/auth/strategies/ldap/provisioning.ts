/**
 * JIT (Just-In-Time) User Provisioning for LDAP
 *
 * Automatically creates or updates users on first LDAP login.
 * Handles role mapping based on LDAP groups.
 *
 * Related: Epic #20 (LDAP/AD Integration)
 */

import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';
import { usersModel } from '../../../storage/models/users.js';
import logger from '../../../logging/logger.js';
import { sanitizeString } from '../../../logging/sanitizer.js';
import type { UserPublic } from '../../../storage/models/users.js';
import type { LDAPProviderPublic } from '../../../storage/models/ldap-providers.js';
import { mapGroupsToRole } from './groups.js';

/**
 * LDAP user profile (normalized)
 */
export interface LDAPUserProfile {
  provider: string; // LDAP provider name
  dn: string; // Distinguished Name (unique identifier)
  attributes: Record<string, any>; // LDAP attributes (mapped)
}

/**
 * LDAP placeholder password hash
 * Used for users who authenticate via LDAP only (no password login)
 */
const LDAP_PLACEHOLDER = '<ldap>';

/**
 * Provision user from LDAP profile
 *
 * Flow:
 * 1. Check if user exists by LDAP DN
 * 2. If not found, check by email
 * 3. If found by email, link LDAP account
 * 4. If not found at all, create new user
 * 5. Apply role mapping based on provider config
 *
 * @param profile - Normalized LDAP user profile
 * @param provider - LDAP provider configuration
 * @returns Provisioned user
 */
export async function provisionLDAPUser(
  profile: LDAPUserProfile,
  provider: LDAPProviderPublic
): Promise<UserPublic> {
  logger.info('Provisioning LDAP user', {
    provider: sanitizeString(profile.provider),
    dn: sanitizeString(profile.dn),
    username: sanitizeString(profile.attributes.username || ''),
  });

  try {
    // Step 1: Check if user exists by LDAP DN
    let user = await findUserByLDAPDN(profile);

    if (user) {
      logger.info('User found by LDAP DN', {
        userId: sanitizeString(user.id),
        username: sanitizeString(user.username),
      });

      // Update user attributes and role
      await updateUserFromLDAP(user.id, profile, provider);

      // Update last login
      await updateLastLogin(user.id);

      // Fetch updated user
      const updatedUser = usersModel.findById(user.id);
      return updatedUser || user;
    }

    // Step 2: Check if user exists by email
    if (profile.attributes.email) {
      user = usersModel.findByEmail(profile.attributes.email);

      if (user) {
        logger.info('User found by email, linking LDAP account', {
          userId: sanitizeString(user.id),
          username: sanitizeString(user.username),
          provider: sanitizeString(profile.provider),
        });

        // Link LDAP account to existing user
        await linkLDAPAccount(user.id, profile, provider);

        // Update last login
        await updateLastLogin(user.id);

        // Fetch updated user
        const updatedUser = usersModel.findById(user.id);
        return updatedUser || user;
      }
    }

    // Step 3: Create new user (JIT provisioning)
    logger.info('Creating new user via JIT provisioning', {
      provider: sanitizeString(profile.provider),
      username: sanitizeString(profile.attributes.username || 'unknown'),
      email: sanitizeString(profile.attributes.email || ''),
    });

    // Determine role based on role mappings
    const role = determineRole(profile, provider);

    // Generate username from LDAP attributes
    const username =
      profile.attributes.username ||
      profile.attributes.email?.split('@')[0] ||
      extractUsernameFromDN(profile.dn);

    // Create user
    const userId = uuidv4();
    const now = new Date().toISOString();

    // Hash placeholder password (LDAP users can't login via password)
    const passwordHash = await bcrypt.hash(LDAP_PLACEHOLDER, 12);

    // Insert user directly (bypassing create() to set LDAP fields)
    const { getDatabase } = await import('../../../storage/database.js');
    const db = getDatabase();

    db.prepare(
      `INSERT INTO users
       (id, username, email, password_hash, role, status, ldap_provider, ldap_dn, created_at, updated_at, last_login_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      userId,
      username,
      profile.attributes.email || null,
      passwordHash,
      role,
      'active',
      profile.provider,
      profile.dn,
      now,
      now,
      now
    );

    logger.info('User created via JIT provisioning', {
      userId: sanitizeString(userId),
      username: sanitizeString(username),
      role: sanitizeString(role),
    });

    // Fetch created user
    const createdUser = usersModel.findById(userId);

    if (!createdUser) {
      throw new Error('Failed to fetch created user');
    }

    return createdUser;
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to provision LDAP user', {
      provider: sanitizeString(profile.provider),
      error: sanitizeString(err.message),
    });
    throw new Error(`LDAP user provisioning failed: ${err.message}`);
  }
}

/**
 * Find user by LDAP DN
 */
async function findUserByLDAPDN(profile: LDAPUserProfile): Promise<UserPublic | null> {
  const { getDatabase } = await import('../../../storage/database.js');
  const db = getDatabase();

  const user = db
    .prepare('SELECT * FROM users WHERE ldap_provider = ? AND ldap_dn = ?')
    .get(profile.provider, profile.dn) as UserPublic | undefined;

  return user || null;
}

/**
 * Link LDAP account to existing user
 */
async function linkLDAPAccount(
  userId: string,
  profile: LDAPUserProfile,
  provider: LDAPProviderPublic
): Promise<void> {
  const { getDatabase } = await import('../../../storage/database.js');
  const db = getDatabase();

  // Determine role
  const role = determineRole(profile, provider);

  const now = new Date().toISOString();
  db.prepare(
    'UPDATE users SET ldap_provider = ?, ldap_dn = ?, role = ?, updated_at = ? WHERE id = ?'
  ).run(profile.provider, profile.dn, role, now, userId);

  logger.info('LDAP account linked to existing user', {
    userId: sanitizeString(userId),
    provider: sanitizeString(profile.provider),
    role: sanitizeString(role),
  });
}

/**
 * Update user attributes from LDAP profile
 */
async function updateUserFromLDAP(
  userId: string,
  profile: LDAPUserProfile,
  provider: LDAPProviderPublic
): Promise<void> {
  const { getDatabase } = await import('../../../storage/database.js');
  const db = getDatabase();

  // Determine role (may have changed due to group membership changes)
  const role = determineRole(profile, provider);

  const now = new Date().toISOString();

  // Update role if changed
  db.prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ?').run(role, now, userId);

  logger.debug('User attributes updated from LDAP', {
    userId: sanitizeString(userId),
    role: sanitizeString(role),
  });
}

/**
 * Update user's last login timestamp
 */
async function updateLastLogin(userId: string): Promise<void> {
  const { getDatabase } = await import('../../../storage/database.js');
  const db = getDatabase();

  const now = new Date().toISOString();
  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(now, userId);
}

/**
 * Determine user role based on LDAP groups and provider role mappings
 *
 * @param profile - LDAP user profile
 * @param provider - LDAP provider configuration
 * @returns Assigned role
 */
function determineRole(
  profile: LDAPUserProfile,
  provider: LDAPProviderPublic
): 'admin' | 'user' | 'readonly' {
  const roleMappings = provider.group_mapping;

  logger.debug('Determining role from LDAP profile', {
    provider: sanitizeString(profile.provider),
    groups: profile.attributes.groups,
    roleMappings,
  });

  // Map LDAP groups to role
  const role = mapGroupsToRole(profile.attributes.groups, roleMappings, true);

  logger.info('Role determined from LDAP groups', {
    provider: sanitizeString(profile.provider),
    role: sanitizeString(role),
  });

  return role as 'admin' | 'user' | 'readonly';
}

/**
 * Extract username from DN
 *
 * Example: "CN=John Doe,OU=Users,DC=corp,DC=com" -> "john.doe"
 */
function extractUsernameFromDN(dn: string): string {
  // Extract CN (Common Name)
  const match = dn.match(/CN=([^,]+)/i);
  if (match) {
    return match[1]
      .toLowerCase()
      .replace(/\s+/g, '.')
      .replace(/[^a-z0-9._-]/gi, '_');
  }

  // Fallback: use entire DN (sanitized)
  return dn.toLowerCase().replace(/[^a-z0-9._-]/gi, '_');
}

/**
 * Log authentication attempt to database
 */
export async function logAuthenticationAttempt(
  providerId: string,
  providerName: string,
  username: string,
  success: boolean,
  dn?: string,
  groups?: string[],
  errorMessage?: string,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  try {
    const { getDatabase } = await import('../../../storage/database.js');
    const db = getDatabase();

    const id = uuidv4();
    const now = new Date().toISOString();

    // Get user ID if authentication was successful
    let userId: string | null = null;
    if (success && dn) {
      const user = await findUserByLDAPDN({ provider: providerName, dn, attributes: {} });
      userId = user?.id || null;
    }

    db.prepare(
      `INSERT INTO ldap_auth_logs
       (id, user_id, provider_name, username, dn, groups, success, error_message, ip_address, user_agent, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      userId,
      providerName,
      username,
      dn || null,
      groups ? JSON.stringify(groups) : null,
      success ? 1 : 0,
      errorMessage || null,
      ipAddress || null,
      userAgent || null,
      now
    );

    logger.debug('LDAP authentication attempt logged', {
      providerId: sanitizeString(providerId),
      username: sanitizeString(username),
      success,
    });
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to log LDAP authentication attempt', {
      error: sanitizeString(err.message),
    });
    // Don't throw - logging failures shouldn't break authentication
  }
}

export default provisionLDAPUser;
