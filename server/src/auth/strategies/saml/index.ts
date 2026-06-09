/**
 * SAML 2.0 Authentication Strategy
 *
 * Enterprise SSO via SAML 2.0 with Okta, Azure AD, and generic IdP support.
 * Features JIT user provisioning, role mapping, and assertion validation.
 *
 * Related: Epic #19 (SAML SSO)
 */

export { createSAMLStrategy, registerSAMLStrategies } from './strategy.js';
export { parseMetadata, fetchMetadata } from './metadata.js';
export { extractAttributes, generateUsername, DEFAULT_ATTRIBUTE_MAPS } from './attributes.js';
export { provisionSAMLUser } from './provisioning.js';
export {
  initializeValidation,
  stopValidation,
  validateAssertionId,
  storeAssertion,
  cleanupExpiredAssertionsFromDB,
  validateConditions,
  getCachedAssertionCount,
} from './validation.js';
export {
  getOktaPreset,
  getOktaMetadataUrl,
  OKTA_ATTRIBUTE_MAP,
  OKTA_DEFAULT_ROLE_MAPPINGS,
} from './okta.js';
export {
  getAzurePreset,
  getAzureMetadataUrl,
  AZURE_ATTRIBUTE_MAP,
  AZURE_DEFAULT_ROLE_MAPPINGS,
} from './azure.js';

export type { SAMLUserProfile } from './provisioning.js';
export type { SAMLMetadata } from './metadata.js';
export type { SAMLAttributes } from './attributes.js';
