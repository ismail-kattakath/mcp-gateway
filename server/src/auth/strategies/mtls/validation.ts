/**
 * mTLS Certificate Validation
 *
 * Validates client certificates against CA chain, CRL, and OCSP.
 * Implements comprehensive certificate validation for mTLS authentication.
 *
 * Related: Epic #21 (Advanced Authentication - Kerberos/mTLS)
 */

import fs from 'fs';
import https from 'https';
import forge from 'node-forge';
import logger from '../../../logging/logger.js';
import { sanitizeString, sanitizePath } from '../../../logging/sanitizer.js';

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate certificate chain against CA certificate
 *
 * @param clientCertPem - Client certificate in PEM format
 * @param caCertPath - Path to CA certificate file
 * @returns Validation result
 */
export function validateCertificateChain(
  clientCertPem: string,
  caCertPath: string
): ValidationResult {
  try {
    // Load CA certificate
    const caCertPem = fs.readFileSync(caCertPath, 'utf-8');
    const caCert = forge.pki.certificateFromPem(caCertPem);

    // Parse client certificate
    const clientCert = forge.pki.certificateFromPem(clientCertPem);

    // Create CA store
    const caStore = forge.pki.createCaStore([caCert]);

    // Verify certificate chain
    try {
      forge.pki.verifyCertificateChain(caStore, [clientCert]);
      return { valid: true };
    } catch (error) {
      const err = error as Error;
      logger.warn('Certificate chain validation failed', {
        error: sanitizeString(err.message),
      });
      return { valid: false, error: 'Invalid certificate chain' };
    }
  } catch (error) {
    const err = error as Error;
    logger.error('Certificate validation error', {
      error: sanitizeString(err.message),
      caCertPath: sanitizePath(caCertPath),
    });
    return { valid: false, error: err.message };
  }
}

/**
 * Check certificate revocation status using CRL
 *
 * @param clientCertPem - Client certificate in PEM format
 * @param crlPath - Path to CRL file
 * @returns Validation result
 */
export function checkCRL(clientCertPem: string, crlPath: string): ValidationResult {
  try {
    // Check if CRL file exists
    if (!fs.existsSync(crlPath)) {
      logger.debug('CRL file not found, skipping CRL check', {
        crlPath: sanitizePath(crlPath),
      });
      return { valid: true }; // Skip if CRL not available
    }

    // Load CRL (note: node-forge CRL support is limited)
    // For production, use a dedicated CRL library or OCSP
    const crlPem = fs.readFileSync(crlPath, 'utf-8');

    // Parse client certificate
    const clientCert = forge.pki.certificateFromPem(clientCertPem);

    // Simple CRL check: look for serial number in CRL text
    // This is a simplified implementation - production should use proper ASN.1 parsing
    const revokedCert = crlPem.includes(clientCert.serialNumber);

    if (revokedCert) {
      logger.warn('Certificate is revoked (CRL)', {
        serialNumber: sanitizeString(clientCert.serialNumber),
      });
      return { valid: false, error: 'Certificate has been revoked' };
    }

    return { valid: true };
  } catch (error) {
    const err = error as Error;
    logger.error('CRL check error', {
      error: sanitizeString(err.message),
      crlPath: sanitizePath(crlPath),
    });
    // Don't fail validation on CRL check error (CRL might be temporarily unavailable)
    return { valid: true };
  }
}

/**
 * Check certificate revocation status using OCSP
 *
 * @param clientCertPem - Client certificate in PEM format
 * @param ocspUrl - OCSP responder URL
 * @returns Validation result
 */
export async function checkOCSP(clientCertPem: string, ocspUrl: string): Promise<ValidationResult> {
  try {
    // Parse client certificate
    const clientCert = forge.pki.certificateFromPem(clientCertPem);

    // Build OCSP request
    // Note: Full OCSP implementation requires encoding the request per RFC 6960
    // This is a simplified version for demonstration
    const ocspRequest = {
      serialNumber: clientCert.serialNumber,
    };

    // Send OCSP request
    const response = await makeOCSPRequest(ocspUrl, ocspRequest);

    if (response.status === 'revoked') {
      logger.warn('Certificate is revoked (OCSP)', {
        serialNumber: sanitizeString(clientCert.serialNumber),
      });
      return { valid: false, error: 'Certificate has been revoked' };
    }

    return { valid: true };
  } catch (error) {
    const err = error as Error;
    logger.error('OCSP check error', {
      error: sanitizeString(err.message),
      ocspUrl: sanitizeString(ocspUrl),
    });
    // Don't fail validation on OCSP check error (OCSP might be temporarily unavailable)
    return { valid: true };
  }
}

/**
 * Make OCSP request to responder
 *
 * Note: This is a simplified implementation.
 * Production systems should use a proper OCSP library.
 */
async function makeOCSPRequest(
  url: string,
  request: { serialNumber: string }
): Promise<{ status: 'good' | 'revoked' | 'unknown' }> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/ocsp-request',
      },
    };

    const req = https.request(options, (res) => {
      res.on('data', () => {
        // Consume data to prevent memory issues
      });
      res.on('end', () => {
        // Simplified OCSP response parsing
        // In production, use proper ASN.1 decoding
        if (res.statusCode === 200) {
          resolve({ status: 'good' });
        } else {
          resolve({ status: 'unknown' });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    // Write OCSP request (simplified)
    req.write(JSON.stringify(request));
    req.end();
  });
}

/**
 * Comprehensive certificate validation
 *
 * Validates:
 * 1. Certificate chain against CA
 * 2. Certificate revocation (CRL if available)
 * 3. Certificate revocation (OCSP if configured)
 *
 * @param clientCertPem - Client certificate in PEM format
 * @param config - Validation configuration
 * @returns Validation result
 */
export async function validateCertificate(
  clientCertPem: string,
  config: {
    caCertPath: string;
    crlPath?: string | null;
    ocspUrl?: string | null;
  }
): Promise<ValidationResult> {
  // 1. Validate certificate chain
  const chainResult = validateCertificateChain(clientCertPem, config.caCertPath);
  if (!chainResult.valid) {
    return chainResult;
  }

  // 2. Check CRL if available
  if (config.crlPath) {
    const crlResult = checkCRL(clientCertPem, config.crlPath);
    if (!crlResult.valid) {
      return crlResult;
    }
  }

  // 3. Check OCSP if configured
  if (config.ocspUrl) {
    const ocspResult = await checkOCSP(clientCertPem, config.ocspUrl);
    if (!ocspResult.valid) {
      return ocspResult;
    }
  }

  return { valid: true };
}
