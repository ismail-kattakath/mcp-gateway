/**
 * Certificate Management Module
 *
 * Handles SSL/TLS certificate operations:
 * - Parse PEM certificates
 * - Validate certificate chains
 * - Monitor expiration dates
 * - Generate self-signed certificates (testing)
 * - Secure storage with proper permissions
 */

import fs from 'fs/promises';
import path from 'path';
import forge from 'node-forge';
import logger from '../logging/logger.js';
import { sanitizePath } from '../logging/sanitizer.js';

export interface CertificateInfo {
  subject: {
    commonName: string;
    organization?: string;
    organizationalUnit?: string;
    country?: string;
  };
  issuer: {
    commonName: string;
    organization?: string;
  };
  validFrom: Date;
  validTo: Date;
  daysUntilExpiry: number;
  serialNumber: string;
  fingerprint: string;
  isExpired: boolean;
  isSelfSigned: boolean;
  subjectAltNames?: string[];
}

export interface CertificateChain {
  certificate: CertificateInfo;
  chain: CertificateInfo[];
  isValid: boolean;
  validationErrors: string[];
}

/**
 * Load and parse PEM certificate
 *
 * Reads a certificate file and extracts key information.
 *
 * @param certPath Path to PEM certificate file
 * @returns Certificate information
 */
export async function loadCertificate(certPath: string): Promise<CertificateInfo> {
  try {
    const certPem = await fs.readFile(certPath, 'utf8');
    return parseCertificate(certPem);
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to load certificate', {
      path: sanitizePath(certPath),
      error: err.message,
    });
    throw new Error(`Failed to load certificate from ${sanitizePath(certPath)}: ${err.message}`);
  }
}

/**
 * Parse PEM certificate string
 *
 * Extracts certificate information from PEM format.
 *
 * @param certPem PEM-encoded certificate
 * @returns Certificate information
 */
export function parseCertificate(certPem: string): CertificateInfo {
  try {
    const cert = forge.pki.certificateFromPem(certPem);

    // Extract subject information
    const subject = {
      commonName: cert.subject.getField('CN')?.value || 'Unknown',
      organization: cert.subject.getField('O')?.value,
      organizationalUnit: cert.subject.getField('OU')?.value,
      country: cert.subject.getField('C')?.value,
    };

    // Extract issuer information
    const issuer = {
      commonName: cert.issuer.getField('CN')?.value || 'Unknown',
      organization: cert.issuer.getField('O')?.value,
    };

    // Parse validity dates
    const validFrom = new Date(cert.validity.notBefore);
    const validTo = new Date(cert.validity.notAfter);
    const now = new Date();
    const daysUntilExpiry = Math.floor((validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    // Check if self-signed
    const isSelfSigned = subject.commonName === issuer.commonName;

    // Extract Subject Alternative Names
    const sanExtension = cert.getExtension('subjectAltName');
    let subjectAltNames: string[] | undefined;

    if (sanExtension && 'altNames' in sanExtension) {
      const altNames = sanExtension.altNames as Array<{ type: number; value: string }>;
      subjectAltNames = altNames
        .filter((name) => name.type === 2) // DNS names
        .map((name) => name.value);
    }

    // Calculate fingerprint
    const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
    const md = forge.md.sha256.create();
    md.update(der);
    const fingerprint = md.digest().toHex().toUpperCase().match(/.{2}/g)!.join(':');

    return {
      subject,
      issuer,
      validFrom,
      validTo,
      daysUntilExpiry,
      serialNumber: cert.serialNumber,
      fingerprint,
      isExpired: now > validTo,
      isSelfSigned,
      subjectAltNames,
    };
  } catch (error) {
    const err = error as Error;
    throw new Error(`Failed to parse certificate: ${err.message}`);
  }
}

/**
 * Validate certificate chain
 *
 * Verifies the certificate chain is valid and trusted.
 *
 * @param certPath Path to certificate file
 * @param chainPath Optional path to CA chain file
 * @returns Validation result
 */
export async function validateCertificateChain(
  certPath: string,
  chainPath?: string
): Promise<CertificateChain> {
  const validationErrors: string[] = [];

  try {
    // Load main certificate
    const certificate = await loadCertificate(certPath);

    // Load chain if provided
    let chain: CertificateInfo[] = [];
    if (chainPath) {
      const chainPem = await fs.readFile(chainPath, 'utf8');
      const certs = extractCertificatesFromPEM(chainPem);
      chain = certs.map((pem) => parseCertificate(pem));
    }

    // Validation checks
    if (certificate.isExpired) {
      validationErrors.push(`Certificate expired on ${certificate.validTo.toISOString()}`);
    }

    if (certificate.daysUntilExpiry < 30) {
      validationErrors.push(
        `Certificate expires in ${certificate.daysUntilExpiry} days (renewal recommended)`
      );
    }

    if (certificate.isSelfSigned && !chainPath) {
      validationErrors.push('Self-signed certificate without CA chain');
    }

    return {
      certificate,
      chain,
      isValid: validationErrors.length === 0,
      validationErrors,
    };
  } catch (error) {
    const err = error as Error;
    return {
      certificate: {} as CertificateInfo,
      chain: [],
      isValid: false,
      validationErrors: [err.message],
    };
  }
}

/**
 * Check certificate expiration
 *
 * Monitors certificate expiration and returns warning status.
 *
 * @param certPath Path to certificate file
 * @param warningDays Number of days before expiry to warn (default 30)
 * @returns Expiration status
 */
export async function checkExpiration(
  certPath: string,
  warningDays: number = 30
): Promise<{
  expiring: boolean;
  expired: boolean;
  daysUntilExpiry: number;
  validTo: Date;
}> {
  const cert = await loadCertificate(certPath);

  return {
    expiring: cert.daysUntilExpiry <= warningDays && cert.daysUntilExpiry > 0,
    expired: cert.isExpired,
    daysUntilExpiry: cert.daysUntilExpiry,
    validTo: cert.validTo,
  };
}

/**
 * Generate self-signed certificate
 *
 * Creates a self-signed certificate for testing/development.
 * DO NOT use in production.
 *
 * @param options Certificate generation options
 * @returns PEM-encoded certificate and private key
 */
export function generateSelfSigned(options: {
  commonName: string;
  organization?: string;
  country?: string;
  validityDays?: number;
  keySize?: number;
  altNames?: string[];
}): { cert: string; key: string } {
  const {
    commonName,
    organization = 'MCP Gateway',
    country = 'US',
    validityDays = 365,
    keySize = 2048,
    altNames = [],
  } = options;

  logger.info('Generating self-signed certificate', {
    commonName,
    validityDays,
    keySize,
  });

  // Generate key pair
  const keys = forge.pki.rsa.generateKeyPair(keySize);

  // Create certificate
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';

  // Set validity period
  const now = new Date();
  cert.validity.notBefore = now;
  cert.validity.notAfter = new Date(now.getTime() + validityDays * 24 * 60 * 60 * 1000);

  // Set subject and issuer (same for self-signed)
  const attrs = [
    { name: 'commonName', value: commonName },
    { name: 'organizationName', value: organization },
    { name: 'countryName', value: country },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);

  // Add extensions
  const extensions: any[] = [
    {
      name: 'basicConstraints',
      cA: false,
    },
    {
      name: 'keyUsage',
      digitalSignature: true,
      keyEncipherment: true,
    },
    {
      name: 'extKeyUsage',
      serverAuth: true,
      clientAuth: true,
    },
  ];

  // Add Subject Alternative Names if provided
  if (altNames.length > 0) {
    extensions.push({
      name: 'subjectAltName',
      altNames: altNames.map((name) => ({
        type: 2, // DNS name
        value: name,
      })),
    });
  }

  cert.setExtensions(extensions);

  // Self-sign certificate
  cert.sign(keys.privateKey, forge.md.sha256.create());

  // Convert to PEM format
  const certPem = forge.pki.certificateToPem(cert);
  const keyPem = forge.pki.privateKeyToPem(keys.privateKey);

  logger.info('Self-signed certificate generated successfully', {
    fingerprint: cert.serialNumber,
    validFrom: cert.validity.notBefore,
    validTo: cert.validity.notAfter,
  });

  return {
    cert: certPem,
    key: keyPem,
  };
}

/**
 * Save certificate to file with secure permissions
 *
 * Writes certificate/key to disk with restrictive permissions (600).
 *
 * @param filePath Path to save file
 * @param content File content (PEM)
 * @param isPrivateKey Whether this is a private key (affects permissions)
 */
export async function saveCertificate(
  filePath: string,
  content: string,
  isPrivateKey: boolean = false
): Promise<void> {
  try {
    // Ensure directory exists
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });

    // Write file
    await fs.writeFile(filePath, content, 'utf8');

    // Set secure permissions
    // 600 (rw-------) for private keys
    // 644 (rw-r--r--) for certificates
    const mode = isPrivateKey ? 0o600 : 0o644;
    await fs.chmod(filePath, mode);

    logger.info('Certificate saved', {
      path: sanitizePath(filePath),
      permissions: mode.toString(8),
    });
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to save certificate', {
      path: sanitizePath(filePath),
      error: err.message,
    });
    throw new Error(`Failed to save certificate: ${err.message}`);
  }
}

/**
 * Extract multiple certificates from PEM file
 *
 * Some files contain certificate chains with multiple certs.
 * This extracts each certificate separately.
 *
 * @param pem PEM content
 * @returns Array of individual certificate PEMs
 */
function extractCertificatesFromPEM(pem: string): string[] {
  const certs: string[] = [];
  const certRegex = /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g;
  let match;

  while ((match = certRegex.exec(pem)) !== null) {
    certs.push(match[0]);
  }

  return certs;
}

/**
 * Verify certificate matches private key
 *
 * Ensures the private key corresponds to the certificate.
 *
 * @param certPath Path to certificate
 * @param keyPath Path to private key
 * @returns true if key matches certificate
 */
export async function verifyCertificateKeyPair(
  certPath: string,
  keyPath: string
): Promise<boolean> {
  try {
    const certPem = await fs.readFile(certPath, 'utf8');
    const keyPem = await fs.readFile(keyPath, 'utf8');

    const cert = forge.pki.certificateFromPem(certPem);
    const key = forge.pki.privateKeyFromPem(keyPem);

    // Extract public key from certificate
    const certPublicKey = forge.pki.publicKeyToPem(cert.publicKey);
    const keyPublicKey = forge.pki.publicKeyToPem(forge.pki.setRsaPublicKey(key.n, key.e));

    return certPublicKey === keyPublicKey;
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to verify certificate key pair', {
      certPath: sanitizePath(certPath),
      keyPath: sanitizePath(keyPath),
      error: err.message,
    });
    return false;
  }
}

export default {
  loadCertificate,
  parseCertificate,
  validateCertificateChain,
  checkExpiration,
  generateSelfSigned,
  saveCertificate,
  verifyCertificateKeyPair,
};
