/**
 * JIT (Just-In-Time) User Provisioning for SAML
 *
 * Automatically creates or updates users on first SAML login.
 * Handles role mapping based on SAML groups.
 *
 * Related: Epic #19 (SAML SSO)
 */

import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';
import { usersModel } from '../../../storage/models/users.js';
import logger from '../../../logging/logger.js';
import { sanitizeString } from '../../../logging/sanitizer.js';
import type { UserPublic } from '../../../storage/models/users.js';
import type { SAMLProviderPublic } from '../../../storage/models/saml-providers.js';
import type { SAMLAttributes } from './attributes.js';

/**
 * SAML user profile (normalized)
 */
export interface SAMLUserProfile {
  provider: string; // SAML provider name
  nameId: string; // SAML NameID (unique identifier)
  sessionIndex?: string; // SAML SessionIndex (for SLO)
  attributes: SAMLAttributes;
}

/**
 * SAML placeholder password hash
 * Used for users who authenticate via SAML only (no password login)
 */
const SAML_PLACEHOLDER = '<saml>';

/**
 * Provision user from SAML profile
 *
 * Flow:
 * 1. Check if user exists by SAML NameID
 * 2. If not found, check by email
 * 3. If found by email, link SAML account
 * 4. If not found at all, create new user
 * 5. Apply role mapping based on provider config
 *
 * @param profile - Normalized SAML user profile
 * @param provider - SAML provider configuration
 * @returns Provisioned user
 */
export async function provisionSAMLUser(
  profile: SAMLUserProfile,
  provider: SAMLProviderPublic
): Promise<UserPublic> {
  logger.info('Provisioning SAML user', {
    provider: sanitizeString(profile.provider),
    nameId: sanitizeString(profile.nameId),
    email: sanitizeString(profile.attributes.email || ''),
  });

  try {
    // Step 1: Check if user exists by SAML NameID
    let user = await findUserBySAMLNameId(profile);

    if (user) {
      logger.info('User found by SAML NameID', {
        userId: sanitizeString(user.id),
        username: sanitizeString(user.username),
      });

      // Update last login
      await updateLastLogin(user.id);

      return user;
    }

    // Step 2: Check if user exists by email
    if (profile.attributes.email) {
      user = usersModel.findByEmail(profile.attributes.email);

      if (user) {
        logger.info('User found by email, linking SAML account', {
          userId: sanitizeString(user.id),
          username: sanitizeString(user.username),
          provider: sanitizeString(profile.provider),
        });

        // Link SAML account to existing user
        await linkSAMLAccount(user.id, profile);

        // Update last login
        await updateLastLogin(user.id);

        return user;
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

    // Generate username from SAML attributes
    const username =
      profile.attributes.username ||
      profile.attributes.email?.split('@')[0] ||
      profile.nameId.replace(/[^a-z0-9_-]/gi, '_').toLowerCase();

    // Create user
    const userId = uuidv4();
    const now = new Date().toISOString();

    // Hash placeholder password (SAML users can't login via password)
    const passwordHash = await bcrypt.hash(SAML_PLACEHOLDER, 12);

    // Insert user directly (bypassing create() to set SAML fields)
    const { getDatabase } = await import('../../../storage/database.js');
    const db = getDatabase();

    db.prepare(
      `INSERT INTO users
       (id, username, email, password_hash, role, status, saml_provider, saml_nameid, created_at, updated_at, last_login_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      userId,
      username,
      profile.attributes.email || null,
      passwordHash,
      role,
      'active',
      profile.provider,
      profile.nameId,
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
    logger.error('Failed to provision SAML user', {
      provider: sanitizeString(profile.provider),
      error: sanitizeString(err.message),
    });
    throw new Error(`SAML user provisioning failed: ${err.message}`);
  }
}

/**
 * Find user by SAML NameID
 */
async function findUserBySAMLNameId(profile: SAMLUserProfile): Promise<UserPublic | null> {
  const { getDatabase } = await import('../../../storage/database.js');
  const db = getDatabase();

  const user = db
    .prepare('SELECT * FROM users WHERE saml_provider = ? AND saml_nameid = ?')
    .get(profile.provider, profile.nameId) as UserPublic | undefined;

  return user || null;
}

/**
 * Link SAML account to existing user
 */
async function linkSAMLAccount(userId: string, profile: SAMLUserProfile): Promise<void> {
  const { getDatabase } = await import('../../../storage/database.js');
  const db = getDatabase();

  const now = new Date().toISOString();
  db.prepare(
    'UPDATE users SET saml_provider = ?, saml_nameid = ?, updated_at = ? WHERE id = ?'
  ).run(profile.provider, profile.nameId, now, userId);
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
 * Determine user role based on SAML attributes and provider role mappings
 *
 * Role mapping examples:
 * - "Administrators" -> "admin"
 * - "Developers" -> "user"
 * - "Viewers" -> "readonly"
 *
 * @param profile - SAML user profile
 * @param provider - SAML provider configuration
 * @returns Assigned role
 */
function determineRole(
  profile: SAMLUserProfile,
  provider: SAMLProviderPublic
): 'admin' | 'user' | 'readonly' {
  const roleMappings = provider.role_mappings;

  logger.debug('Determining role from SAML profile', {
    provider: sanitizeString(profile.provider),
    groups: profile.attributes.groups,
    roleMappings,
  });

  // Check SAML groups against role mappings
  if (profile.attributes.groups) {
    for (const group of profile.attributes.groups) {
      const mappedRole = roleMappings[group];

      if (mappedRole && isValidRole(mappedRole)) {
        logger.info('Role mapped from SAML group', {
          group: sanitizeString(group),
          mappedRole: sanitizeString(mappedRole),
        });
        return mappedRole as 'admin' | 'user' | 'readonly';
      }
    }
  }

  // Check email-based mappings
  if (profile.attributes.email) {
    const emailMappedRole = roleMappings[profile.attributes.email];
    if (emailMappedRole && isValidRole(emailMappedRole)) {
      logger.info('Role mapped from email', {
        email: sanitizeString(profile.attributes.email),
        mappedRole: sanitizeString(emailMappedRole),
      });
      return emailMappedRole as 'admin' | 'user' | 'readonly';
    }

    // Check domain-based mappings
    const domain = profile.attributes.email.split('@')[1];
    if (domain) {
      const domainKey = `@${domain}`;
      const domainMappedRole = roleMappings[domainKey];

      if (domainMappedRole && isValidRole(domainMappedRole)) {
        logger.info('Role mapped from email domain', {
          domain: sanitizeString(domain),
          mappedRole: sanitizeString(domainMappedRole),
        });
        return domainMappedRole as 'admin' | 'user' | 'readonly';
      }
    }
  }

  // Default role from provider config
  const defaultRole = roleMappings.default;

  if (defaultRole && isValidRole(defaultRole)) {
    logger.info('Using default role from provider config', {
      defaultRole: sanitizeString(defaultRole),
    });
    return defaultRole as 'admin' | 'user' | 'readonly';
  }

  // Fallback to 'user' role
  logger.info('No role mapping matched, using fallback role: user');
  return 'user';
}

/**
 * Validate role string
 */
function isValidRole(role: string): boolean {
  return role === 'admin' || role === 'user' || role === 'readonly';
}

export default provisionSAMLUser;
