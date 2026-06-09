/**
 * Okta SAML Integration
 *
 * Pre-configured settings for Okta SAML 2.0.
 * Provides default attribute mappings and metadata URL patterns.
 *
 * Related: Epic #19 (SAML SSO)
 */

import type { SAMLAttributeMap, RoleMappings } from '../../../storage/models/saml-providers.js';
import { DEFAULT_ATTRIBUTE_MAPS } from './attributes.js';

/**
 * Okta SAML default attribute mapping
 */
export const OKTA_ATTRIBUTE_MAP: SAMLAttributeMap = DEFAULT_ATTRIBUTE_MAPS.okta;

/**
 * Okta SAML default role mappings
 */
export const OKTA_DEFAULT_ROLE_MAPPINGS: RoleMappings = {
  Administrators: 'admin',
  Developers: 'user',
  Viewers: 'readonly',
  default: 'user',
};

/**
 * Generate Okta metadata URL from domain
 *
 * @param domain - Okta domain (e.g., "mycompany.okta.com" or "mycompany")
 * @param appId - Okta app ID
 * @returns Metadata URL
 */
export function getOktaMetadataUrl(domain: string, appId: string): string {
  // Normalize domain (add .okta.com if not present)
  const oktaDomain = domain.includes('.') ? domain : `${domain}.okta.com`;

  return `https://${oktaDomain}/app/${appId}/sso/saml/metadata`;
}

/**
 * Generate Okta SSO URL from domain
 *
 * @param domain - Okta domain
 * @param appId - Okta app ID
 * @returns SSO URL
 */
export function getOktaSsoUrl(domain: string, appId: string): string {
  const oktaDomain = domain.includes('.') ? domain : `${domain}.okta.com`;

  return `https://${oktaDomain}/app/${appId}/sso/saml`;
}

/**
 * Okta SAML preset configuration
 *
 * @param domain - Okta domain
 * @param appId - Okta app ID
 * @param spBaseUrl - Service Provider base URL (e.g., "https://mcp-gateway.example.com")
 * @returns Preset configuration
 */
export function getOktaPreset(
  domain: string,
  appId: string,
  spBaseUrl: string
): {
  metadataUrl: string;
  attributeMap: SAMLAttributeMap;
  roleMappings: RoleMappings;
  spEntityId: string;
  acsUrl: string;
} {
  const metadataUrl = getOktaMetadataUrl(domain, appId);
  const spEntityId = `${spBaseUrl}/auth/saml/okta`;
  const acsUrl = `${spBaseUrl}/auth/saml/okta/callback`;

  return {
    metadataUrl,
    attributeMap: OKTA_ATTRIBUTE_MAP,
    roleMappings: OKTA_DEFAULT_ROLE_MAPPINGS,
    spEntityId,
    acsUrl,
  };
}

export default {
  OKTA_ATTRIBUTE_MAP,
  OKTA_DEFAULT_ROLE_MAPPINGS,
  getOktaMetadataUrl,
  getOktaSsoUrl,
  getOktaPreset,
};
