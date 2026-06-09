/**
 * JIT (Just-In-Time) User Provisioning
 *
 * Automatically creates or updates users on first OAuth login.
 * Handles role mapping based on OAuth provider data.
 *
 * Related: Epic #18 (OAuth 2.0 Support)
 */

import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';
import { usersModel } from '../../../storage/models/users.js';
import logger from '../../../logging/logger.js';
import { sanitizeString } from '../../../logging/sanitizer.js';
import type { UserPublic } from '../../../storage/models/users.js';
import type { OAuthProviderPublic } from '../../../storage/models/oauth-providers.js';

/**
 * OAuth user profile (normalized across providers)
 */
export interface OAuthUserProfile {
  provider: string; // 'github', 'google', 'generic:<name>'
  id: string; // OAuth user ID
  username: string;
  email?: string;
  name?: string;
  avatar?: string;
  // Provider-specific fields for role mapping
  organizations?: Array<{ login: string; role?: string }>; // GitHub
  domain?: string; // Google Workspace
  groups?: string[]; // Generic OAuth
}

/**
 * OAuth placeholder password hash
 * Used for users who authenticate via OAuth only (no password login)
 */
const OAUTH_PLACEHOLDER = '<oauth>';

/**
 * Provision user from OAuth profile
 *
 * Flow:
 * 1. Check if user exists by OAuth ID
 * 2. If not found, check by email
 * 3. If found by email, link OAuth account
 * 4. If not found at all, create new user
 * 5. Apply role mapping based on provider config
 *
 * @param profile - Normalized OAuth user profile
 * @param provider - OAuth provider configuration
 * @returns Provisioned user
 */
export async function provisionOAuthUser(
  profile: OAuthUserProfile,
  provider: OAuthProviderPublic
): Promise<UserPublic> {
  logger.info('Provisioning OAuth user', {
    provider: sanitizeString(profile.provider),
    oauthId: sanitizeString(profile.id),
    email: sanitizeString(profile.email || ''),
  });

  try {
    // Step 1: Check if user exists by OAuth ID
    let user = await findUserByOAuthId(profile);

    if (user) {
      logger.info('User found by OAuth ID', {
        userId: sanitizeString(user.id),
        username: sanitizeString(user.username),
      });

      // Update last login
      await updateLastLogin(user.id);

      return user;
    }

    // Step 2: Check if user exists by email
    if (profile.email) {
      user = usersModel.findByEmail(profile.email);

      if (user) {
        logger.info('User found by email, linking OAuth account', {
          userId: sanitizeString(user.id),
          username: sanitizeString(user.username),
          provider: sanitizeString(profile.provider),
        });

        // Link OAuth account to existing user
        await linkOAuthAccount(user.id, profile);

        // Update last login
        await updateLastLogin(user.id);

        return user;
      }
    }

    // Step 3: Create new user (JIT provisioning)
    logger.info('Creating new user via JIT provisioning', {
      provider: sanitizeString(profile.provider),
      username: sanitizeString(profile.username),
      email: sanitizeString(profile.email || ''),
    });

    // Determine role based on role mappings
    const role = determineRole(profile, provider);

    // Create user
    const userId = uuidv4();
    const now = new Date().toISOString();

    // Hash placeholder password (OAuth users can't login via password)
    const passwordHash = await bcrypt.hash(OAUTH_PLACEHOLDER, 12);

    // Build OAuth columns
    const oauthColumns: Record<string, string | null> = {
      github_id: null,
      google_id: null,
      oauth_provider: null,
      oauth_id: null,
    };

    if (profile.provider === 'github') {
      oauthColumns.github_id = profile.id;
    } else if (profile.provider === 'google') {
      oauthColumns.google_id = profile.id;
    } else {
      oauthColumns.oauth_provider = profile.provider;
      oauthColumns.oauth_id = profile.id;
    }

    // Insert user directly (bypassing create() to set OAuth fields)
    const { getDatabase } = await import('../../../storage/database.js');
    const db = getDatabase();

    db.prepare(
      `INSERT INTO users
       (id, username, email, password_hash, role, status, github_id, google_id, oauth_provider, oauth_id, created_at, updated_at, last_login_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      userId,
      profile.username,
      profile.email || null,
      passwordHash,
      role,
      'active',
      oauthColumns.github_id,
      oauthColumns.google_id,
      oauthColumns.oauth_provider,
      oauthColumns.oauth_id,
      now,
      now,
      now
    );

    logger.info('User created via JIT provisioning', {
      userId: sanitizeString(userId),
      username: sanitizeString(profile.username),
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
    logger.error('Failed to provision OAuth user', {
      provider: sanitizeString(profile.provider),
      error: sanitizeString(err.message),
    });
    throw new Error(`OAuth user provisioning failed: ${err.message}`);
  }
}

/**
 * Find user by OAuth ID (provider-specific)
 */
async function findUserByOAuthId(profile: OAuthUserProfile): Promise<UserPublic | null> {
  if (profile.provider === 'github') {
    return usersModel.findByGitHubId(profile.id);
  } else if (profile.provider === 'google') {
    return usersModel.findByGoogleId(profile.id);
  } else {
    return usersModel.findByOAuthId(profile.provider, profile.id);
  }
}

/**
 * Link OAuth account to existing user
 */
async function linkOAuthAccount(userId: string, profile: OAuthUserProfile): Promise<void> {
  if (profile.provider === 'github') {
    usersModel.linkGitHub(userId, profile.id);
  } else if (profile.provider === 'google') {
    usersModel.linkGoogle(userId, profile.id);
  } else {
    usersModel.linkOAuth(userId, profile.provider, profile.id);
  }
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
 * Determine user role based on OAuth profile and provider role mappings
 *
 * Role mapping examples:
 * - GitHub: "my-org:admin" -> "admin"
 * - Google: "@mycompany.com" -> "user"
 * - Generic: "admins" -> "admin"
 *
 * @param profile - OAuth user profile
 * @param provider - OAuth provider configuration
 * @returns Assigned role
 */
function determineRole(
  profile: OAuthUserProfile,
  provider: OAuthProviderPublic
): 'admin' | 'user' | 'readonly' {
  const roleMappings = provider.role_mappings;

  logger.debug('Determining role from OAuth profile', {
    provider: sanitizeString(profile.provider),
    roleMappings,
  });

  // GitHub: Check organization memberships
  if (profile.provider === 'github' && profile.organizations) {
    for (const org of profile.organizations) {
      const key = `${org.login}:${org.role || 'member'}`;
      const mappedRole = roleMappings[key];

      if (mappedRole && isValidRole(mappedRole)) {
        logger.info('Role mapped from GitHub organization', {
          org: sanitizeString(org.login),
          orgRole: sanitizeString(org.role || 'member'),
          mappedRole: sanitizeString(mappedRole),
        });
        return mappedRole as 'admin' | 'user' | 'readonly';
      }
    }
  }

  // Google: Check email domain
  if (profile.provider === 'google' && profile.email) {
    // Check specific email
    const emailMappedRole = roleMappings[profile.email];
    if (emailMappedRole && isValidRole(emailMappedRole)) {
      logger.info('Role mapped from email', {
        email: sanitizeString(profile.email),
        mappedRole: sanitizeString(emailMappedRole),
      });
      return emailMappedRole as 'admin' | 'user' | 'readonly';
    }

    // Check domain
    if (profile.domain) {
      const domainKey = `@${profile.domain}`;
      const domainMappedRole = roleMappings[domainKey];

      if (domainMappedRole && isValidRole(domainMappedRole)) {
        logger.info('Role mapped from email domain', {
          domain: sanitizeString(profile.domain),
          mappedRole: sanitizeString(domainMappedRole),
        });
        return domainMappedRole as 'admin' | 'user' | 'readonly';
      }
    }
  }

  // Generic OAuth: Check groups
  if (profile.groups) {
    for (const group of profile.groups) {
      const mappedRole = roleMappings[group];

      if (mappedRole && isValidRole(mappedRole)) {
        logger.info('Role mapped from OAuth group', {
          group: sanitizeString(group),
          mappedRole: sanitizeString(mappedRole),
        });
        return mappedRole as 'admin' | 'user' | 'readonly';
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

export default provisionOAuthUser;
