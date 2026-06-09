/**
 * Azure AD SAML Integration
 *
 * Pre-configured settings for Azure Active Directory SAML 2.0.
 * Provides default attribute mappings and metadata URL patterns.
 *
 * Related: Epic #19 (SAML SSO)
 */

import type { SAMLAttributeMap, RoleMappings } from '../../../storage/models/saml-providers.js';
import { DEFAULT_ATTRIBUTE_MAPS } from './attributes.js';

/**
 * Azure AD SAML default attribute mapping
 */
export const AZURE_ATTRIBUTE_MAP: SAMLAttributeMap = DEFAULT_ATTRIBUTE_MAPS.azure;

/**
 * Azure AD SAML default role mappings
 */
export const AZURE_DEFAULT_ROLE_MAPPINGS: RoleMappings = {
  Administrators: 'admin',
  Developers: 'user',
  Viewers: 'readonly',
  default: 'user',
};

/**
 * Generate Azure AD metadata URL from tenant ID and app ID
 *
 * @param tenantId - Azure AD tenant ID (UUID or domain)
 * @param appId - Azure AD application ID (UUID)
 * @returns Metadata URL
 */
export function getAzureMetadataUrl(tenantId: string, appId: string): string {
  return `https://login.microsoftonline.com/${tenantId}/federationmetadata/2007-06/federationmetadata.xml?appid=${appId}`;
}

/**
 * Generate Azure AD SSO URL from tenant ID
 *
 * @param tenantId - Azure AD tenant ID
 * @returns SSO URL
 */
export function getAzureSsoUrl(tenantId: string): string {
  return `https://login.microsoftonline.com/${tenantId}/saml2`;
}

/**
 * Azure AD SAML preset configuration
 *
 * @param tenantId - Azure AD tenant ID
 * @param appId - Azure AD application ID
 * @param spBaseUrl - Service Provider base URL (e.g., "https://mcp-gateway.example.com")
 * @returns Preset configuration
 */
export function getAzurePreset(
  tenantId: string,
  appId: string,
  spBaseUrl: string
): {
  metadataUrl: string;
  attributeMap: SAMLAttributeMap;
  roleMappings: RoleMappings;
  spEntityId: string;
  acsUrl: string;
} {
  const metadataUrl = getAzureMetadataUrl(tenantId, appId);
  const spEntityId = `${spBaseUrl}/auth/saml/azure`;
  const acsUrl = `${spBaseUrl}/auth/saml/azure/callback`;

  return {
    metadataUrl,
    attributeMap: AZURE_ATTRIBUTE_MAP,
    roleMappings: AZURE_DEFAULT_ROLE_MAPPINGS,
    spEntityId,
    acsUrl,
  };
}

export default {
  AZURE_ATTRIBUTE_MAP,
  AZURE_DEFAULT_ROLE_MAPPINGS,
  getAzureMetadataUrl,
  getAzureSsoUrl,
  getAzurePreset,
};
