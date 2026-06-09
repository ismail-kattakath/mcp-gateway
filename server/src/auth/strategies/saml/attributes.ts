/**
 * SAML Attribute Mapping
 *
 * Maps SAML assertion attributes to user profile fields.
 * Supports Okta, Azure AD, and generic SAML IdPs.
 *
 * Related: Epic #19 (SAML SSO)
 */

import logger from '../../../logging/logger.js';
import { sanitizeString } from '../../../logging/sanitizer.js';
import type { SAMLAttributeMap } from '../../../storage/models/saml-providers.js';

/**
 * Extracted SAML attributes
 */
export interface SAMLAttributes {
  email?: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  groups?: string[];
}

/**
 * Default attribute mappings for known providers
 */
export const DEFAULT_ATTRIBUTE_MAPS: Record<string, SAMLAttributeMap> = {
  okta: {
    email: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
    firstName: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname',
    lastName: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname',
    username: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name',
    groups: 'http://schemas.xmlsoap.org/claims/Group',
  },
  azure: {
    email: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
    firstName: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname',
    lastName: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname',
    username: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name',
    groups: 'http://schemas.microsoft.com/ws/2008/06/identity/claims/groups',
  },
};

/**
 * Extract attributes from SAML assertion using attribute mapping
 *
 * @param profile - Raw SAML profile from passport-saml
 * @param attributeMap - Attribute mapping configuration
 * @returns Extracted attributes
 */
export function extractAttributes(
  profile: Record<string, unknown>,
  attributeMap: SAMLAttributeMap
): SAMLAttributes {
  const attributes: SAMLAttributes = {};

  logger.debug('Extracting SAML attributes', {
    profileKeys: Object.keys(profile),
    attributeMap,
  });

  // Extract email
  if (attributeMap.email) {
    const email = getAttributeValue(profile, attributeMap.email);
    if (email && typeof email === 'string') {
      attributes.email = email;
    }
  }

  // Extract first name
  if (attributeMap.firstName) {
    const firstName = getAttributeValue(profile, attributeMap.firstName);
    if (firstName && typeof firstName === 'string') {
      attributes.firstName = firstName;
    }
  }

  // Extract last name
  if (attributeMap.lastName) {
    const lastName = getAttributeValue(profile, attributeMap.lastName);
    if (lastName && typeof lastName === 'string') {
      attributes.lastName = lastName;
    }
  }

  // Extract username
  if (attributeMap.username) {
    const username = getAttributeValue(profile, attributeMap.username);
    if (username && typeof username === 'string') {
      attributes.username = username;
    }
  }

  // Extract groups (can be array or single value)
  if (attributeMap.groups) {
    const groups = getAttributeValue(profile, attributeMap.groups);
    if (groups) {
      if (Array.isArray(groups)) {
        attributes.groups = groups;
      } else if (typeof groups === 'string') {
        attributes.groups = [groups];
      }
    }
  }

  // Fallback: try common attribute names if mapping didn't work
  if (!attributes.email) {
    const email =
      getAttributeValue(profile, 'email') ||
      getAttributeValue(profile, 'mail') ||
      getAttributeValue(profile, 'emailAddress');
    if (email && typeof email === 'string') {
      attributes.email = email;
    }
  }

  if (!attributes.username) {
    const username =
      getAttributeValue(profile, 'username') ||
      getAttributeValue(profile, 'name') ||
      getAttributeValue(profile, 'uid');
    if (username && typeof username === 'string') {
      attributes.username = username;
    } else if (attributes.email) {
      attributes.username = attributes.email.split('@')[0];
    }
  }

  logger.info('SAML attributes extracted', {
    email: sanitizeString(attributes.email || ''),
    username: sanitizeString(attributes.username || ''),
    hasGroups: !!attributes.groups,
    groupCount: attributes.groups?.length || 0,
  });

  return attributes;
}

/**
 * Get attribute value from SAML profile
 *
 * Handles various SAML attribute formats:
 * - Direct property: { email: 'user@example.com' }
 * - Nested property: { attributes: { email: 'user@example.com' } }
 * - Array property: { email: ['user@example.com'] }
 *
 * @param profile - SAML profile object
 * @param key - Attribute key or path
 * @returns Attribute value (string) or undefined
 */
function getAttributeValue(
  profile: Record<string, unknown>,
  key: string
): string | string[] | undefined {
  // Try direct property
  if (profile[key] !== undefined) {
    const value = profile[key];
    if (typeof value === 'string') {
      return value;
    }
    if (Array.isArray(value)) {
      return value.map(String);
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
  }

  // Try nested in attributes object
  if (profile.attributes && typeof profile.attributes === 'object') {
    const attributes = profile.attributes as Record<string, unknown>;
    if (attributes[key] !== undefined) {
      const value = attributes[key];
      if (typeof value === 'string') {
        return value;
      }
      if (Array.isArray(value)) {
        return value.map(String);
      }
      if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
      }
    }
  }

  // Try short name (strip namespace)
  const shortKey = key.split('/').pop() || key;
  if (shortKey !== key) {
    return getAttributeValue(profile, shortKey);
  }

  return undefined;
}

/**
 * Generate username from SAML attributes
 *
 * Fallback logic:
 * 1. Use mapped username attribute
 * 2. Use email prefix
 * 3. Use NameID
 * 4. Generate from email
 *
 * @param attributes - Extracted SAML attributes
 * @param nameId - SAML NameID
 * @returns Generated username
 */
export function generateUsername(attributes: SAMLAttributes, nameId: string): string {
  if (attributes.username) {
    return sanitizeUsername(attributes.username);
  }

  if (attributes.email) {
    return sanitizeUsername(attributes.email.split('@')[0]);
  }

  // Use NameID (sanitize for username)
  return sanitizeUsername(nameId);
}

/**
 * Sanitize username (lowercase, alphanumeric + hyphens/underscores)
 */
function sanitizeUsername(username: string): string {
  return username
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .slice(0, 32); // Max 32 characters
}

export default { extractAttributes, generateUsername, DEFAULT_ATTRIBUTE_MAPS };
