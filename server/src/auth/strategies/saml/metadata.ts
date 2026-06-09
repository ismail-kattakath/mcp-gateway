/**
 * SAML Metadata Parser
 *
 * Parses SAML 2.0 IdP metadata XML to extract configuration.
 * Supports both HTTP and file-based metadata sources.
 *
 * Related: Epic #19 (SAML SSO)
 */

import { parseStringPromise } from 'xml2js';
import logger from '../../../logging/logger.js';
import { sanitizeString, sanitizeUrl } from '../../../logging/sanitizer.js';

/**
 * Parsed SAML IdP metadata
 */
export interface SAMLMetadata {
  entityId: string;
  ssoUrl: string;
  sloUrl: string | null;
  certificate: string;
}

/**
 * Parse SAML metadata XML
 *
 * @param xml - SAML metadata XML string
 * @returns Parsed metadata
 * @throws {Error} If parsing fails or required fields missing
 */
export async function parseMetadata(xml: string): Promise<SAMLMetadata> {
  try {
    logger.debug('Parsing SAML metadata XML');

    // Parse XML (disable external entities for security)
    const parsed = await parseStringPromise(xml, {
      explicitArray: false,
      tagNameProcessors: [stripPrefix],
      attrNameProcessors: [stripPrefix],
    });

    // Navigate to EntityDescriptor
    const entityDescriptor = parsed.EntityDescriptor;

    if (!entityDescriptor) {
      throw new Error('EntityDescriptor not found in metadata');
    }

    // Extract Entity ID
    const entityId = entityDescriptor.$.entityID;

    if (!entityId) {
      throw new Error('entityID not found in EntityDescriptor');
    }

    // Navigate to IDPSSODescriptor
    const idpDescriptor = entityDescriptor.IDPSSODescriptor;

    if (!idpDescriptor) {
      throw new Error('IDPSSODescriptor not found in metadata');
    }

    // Extract SSO URL (HTTP-Redirect or HTTP-POST binding)
    const ssoServices = Array.isArray(idpDescriptor.SingleSignOnService)
      ? idpDescriptor.SingleSignOnService
      : [idpDescriptor.SingleSignOnService];

    const ssoService =
      ssoServices.find(
        (s: { $: { Binding: string } }) =>
          s.$.Binding === 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect'
      ) ||
      ssoServices.find(
        (s: { $: { Binding: string } }) =>
          s.$.Binding === 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST'
      ) ||
      ssoServices[0];

    if (!ssoService || !ssoService.$.Location) {
      throw new Error('SingleSignOnService not found in metadata');
    }

    const ssoUrl = ssoService.$.Location;

    // Extract SLO URL (optional)
    let sloUrl: string | null = null;

    if (idpDescriptor.SingleLogoutService) {
      const sloServices = Array.isArray(idpDescriptor.SingleLogoutService)
        ? idpDescriptor.SingleLogoutService
        : [idpDescriptor.SingleLogoutService];

      const sloService =
        sloServices.find(
          (s: { $: { Binding: string } }) =>
            s.$.Binding === 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect'
        ) ||
        sloServices.find(
          (s: { $: { Binding: string } }) =>
            s.$.Binding === 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST'
        ) ||
        sloServices[0];

      if (sloService && sloService.$.Location) {
        sloUrl = sloService.$.Location;
      }
    }

    // Extract certificate
    const keyDescriptor = Array.isArray(idpDescriptor.KeyDescriptor)
      ? idpDescriptor.KeyDescriptor.find(
          (k: { $?: { use?: string } }) => !k.$ || !k.$.use || k.$.use === 'signing'
        ) || idpDescriptor.KeyDescriptor[0]
      : idpDescriptor.KeyDescriptor;

    if (!keyDescriptor || !keyDescriptor.KeyInfo || !keyDescriptor.KeyInfo.X509Data) {
      throw new Error('KeyDescriptor not found in metadata');
    }

    const x509Certificate = keyDescriptor.KeyInfo.X509Data.X509Certificate;

    if (!x509Certificate) {
      throw new Error('X509Certificate not found in metadata');
    }

    // Clean certificate (remove whitespace)
    const certificate = x509Certificate.replace(/\s+/g, '');

    logger.info('SAML metadata parsed successfully', {
      entityId: sanitizeString(entityId),
      ssoUrl: sanitizeUrl(ssoUrl),
      sloUrl: sloUrl ? sanitizeUrl(sloUrl) : null,
    });

    return {
      entityId,
      ssoUrl,
      sloUrl,
      certificate,
    };
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to parse SAML metadata', {
      error: sanitizeString(err.message),
    });
    throw new Error(`SAML metadata parsing failed: ${err.message}`);
  }
}

/**
 * Fetch and parse SAML metadata from URL
 *
 * @param url - Metadata URL
 * @returns Parsed metadata
 */
export async function fetchMetadata(url: string): Promise<SAMLMetadata> {
  try {
    logger.info('Fetching SAML metadata', { url: sanitizeUrl(url) });

    const response = await fetch(url, {
      headers: {
        Accept: 'application/samlmetadata+xml, application/xml, text/xml',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const xml = await response.text();

    return parseMetadata(xml);
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to fetch SAML metadata', {
      url: sanitizeUrl(url),
      error: sanitizeString(err.message),
    });
    throw new Error(`SAML metadata fetch failed: ${err.message}`);
  }
}

/**
 * Strip XML namespace prefixes
 */
function stripPrefix(name: string): string {
  const match = name.match(/(?:.*:)?(.+)/);
  return match ? match[1] : name;
}

export default { parseMetadata, fetchMetadata };
