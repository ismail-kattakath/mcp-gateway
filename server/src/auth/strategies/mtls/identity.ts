/**
 * mTLS Identity Extraction
 *
 * Extract user identity from X.509 client certificates.
 * Supports multiple identity fields: CN, SAN, custom OID.
 *
 * Related: Epic #21 (Advanced Authentication - Kerberos/mTLS)
 */

import forge from 'node-forge';
import logger from '../../../logging/logger.js';
import { sanitizeString } from '../../../logging/sanitizer.js';

export interface CertificateIdentity {
  commonName: string; // CN from subject
  subjectDN: string; // Full subject DN
  subjectAltNames: string[]; // Subject Alternative Names
  issuerDN: string; // Issuer DN
  serialNumber: string;
  notBefore: Date;
  notAfter: Date;
}

/**
 * Parse X.509 certificate and extract identity information
 */
export function parseCertificate(certPem: string): CertificateIdentity {
  try {
    const cert = forge.pki.certificateFromPem(certPem);

    // Extract Common Name from subject
    const cnAttr = cert.subject.getField('CN');
    const commonName = cnAttr?.value || '';

    // Build subject DN
    const subjectDN = cert.subject.attributes
      .map((attr) => `${attr.shortName}=${attr.value}`)
      .join(', ');

    // Build issuer DN
    const issuerDN = cert.issuer.attributes
      .map((attr) => `${attr.shortName}=${attr.value}`)
      .join(', ');

    // Extract Subject Alternative Names
    const subjectAltNames: string[] = [];
    const sanExt = cert.extensions.find((ext) => ext.name === 'subjectAltName');
    if (sanExt && 'altNames' in sanExt) {
      const altNames = sanExt.altNames as Array<{ type: number; value: string }>;
      subjectAltNames.push(...altNames.map((alt) => alt.value));
    }

    return {
      commonName,
      subjectDN,
      subjectAltNames,
      issuerDN,
      serialNumber: cert.serialNumber,
      notBefore: cert.validity.notBefore,
      notAfter: cert.validity.notAfter,
    };
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to parse certificate', {
      error: sanitizeString(err.message),
    });
    throw new Error('Invalid certificate format');
  }
}

/**
 * Extract identity value from certificate based on configuration
 *
 * @param identity - Parsed certificate identity
 * @param field - Identity field to extract (CN, SAN, OID)
 * @param customOid - Custom OID for OID field type
 * @returns Identity value (e.g., username, email)
 */
export function extractIdentity(
  identity: CertificateIdentity,
  field: 'CN' | 'SAN' | 'OID',
  customOid?: string
): string {
  switch (field) {
    case 'CN':
      if (!identity.commonName) {
        throw new Error('Certificate has no Common Name (CN)');
      }
      return identity.commonName;

    case 'SAN':
      if (identity.subjectAltNames.length === 0) {
        throw new Error('Certificate has no Subject Alternative Names (SAN)');
      }
      // Use first SAN (typically email or DNS name)
      return identity.subjectAltNames[0];

    case 'OID':
      if (!customOid) {
        throw new Error('Custom OID not configured for identity extraction');
      }
      // Extract custom OID from certificate
      // This requires parsing the certificate extensions
      throw new Error('Custom OID extraction not yet implemented');

    default:
      throw new Error(`Unknown identity field: ${field}`);
  }
}

/**
 * Extract identity string for username
 *
 * Converts identity value to valid username:
 * - Email: extract local part before @
 * - DN: extract CN value
 * - Other: sanitize and use as-is
 */
export function extractUsername(identityValue: string): string {
  // If email, extract local part
  if (identityValue.includes('@')) {
    return identityValue.split('@')[0];
  }

  // If DN format (CN=...), extract CN value
  if (identityValue.includes('=')) {
    const cnMatch = identityValue.match(/CN=([^,]+)/);
    if (cnMatch) {
      return cnMatch[1];
    }
  }

  // Sanitize: only alphanumeric, dash, underscore, dot
  return identityValue.replace(/[^a-zA-Z0-9._-]/g, '_');
}

/**
 * Validate certificate is within validity period
 */
export function validateCertificateDates(identity: CertificateIdentity): void {
  const now = new Date();

  if (now < identity.notBefore) {
    throw new Error('Certificate not yet valid');
  }

  if (now > identity.notAfter) {
    throw new Error('Certificate has expired');
  }
}
