/**
 * Kerberos Configuration
 *
 * Loads and validates Kerberos/SPNEGO configuration from database.
 * Validates keytab file existence and service principal format.
 *
 * Related: Epic #21 (Advanced Authentication - Kerberos/mTLS)
 */

import fs from 'fs';
import path from 'path';
import { getKerberosConfigModel } from '../../../storage/models/kerberos-config.js';
import type { KerberosConfigRecord } from '../../../storage/models/kerberos-config.js';
import logger from '../../../logging/logger.js';
import { sanitizeString, sanitizePath } from '../../../logging/sanitizer.js';

export interface KerberosConfig {
  servicePrincipal: string;
  keytabPath: string;
  realm: string;
  enabled: boolean;
}

/**
 * Load Kerberos configuration from database
 */
export async function loadKerberosConfig(): Promise<KerberosConfig | null> {
  const model = getKerberosConfigModel();
  const config = model.getEnabled();

  if (!config) {
    logger.debug('No enabled Kerberos configuration found');
    return null;
  }

  // Validate configuration
  try {
    validateKerberosConfig(config);
  } catch (error) {
    const err = error as Error;
    logger.error('Invalid Kerberos configuration', {
      id: sanitizeString(config.id),
      error: sanitizeString(err.message),
    });
    return null;
  }

  return {
    servicePrincipal: config.servicePrincipal,
    keytabPath: config.keytabPath,
    realm: config.realm,
    enabled: config.enabled,
  };
}

/**
 * Validate Kerberos configuration
 *
 * Checks:
 * 1. Service principal format (e.g., HTTP/gateway.example.com@REALM)
 * 2. Keytab file exists and is readable
 * 3. Realm is uppercase
 */
export function validateKerberosConfig(config: KerberosConfigRecord): void {
  // Validate service principal format
  const spnRegex = /^[A-Z]+\/[a-z0-9.-]+@[A-Z0-9.-]+$/;
  if (!spnRegex.test(config.servicePrincipal)) {
    throw new Error(
      `Invalid service principal format: ${config.servicePrincipal}. ` +
        'Expected format: SERVICE/hostname@REALM (e.g., HTTP/gateway.example.com@EXAMPLE.COM)'
    );
  }

  // Validate keytab file exists
  const resolvedPath = path.resolve(config.keytabPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(
      `Keytab file not found: ${sanitizePath(resolvedPath)}. ` +
        'Ensure the keytab file is accessible to the gateway process.'
    );
  }

  // Check keytab file is readable
  try {
    fs.accessSync(resolvedPath, fs.constants.R_OK);
  } catch {
    throw new Error(
      `Keytab file not readable: ${sanitizePath(resolvedPath)}. ` +
        'Check file permissions (should be readable by gateway process only).'
    );
  }

  // Validate realm is uppercase
  if (config.realm !== config.realm.toUpperCase()) {
    throw new Error(
      `Realm must be uppercase: ${config.realm}. ` + 'Use uppercase realm name (e.g., EXAMPLE.COM).'
    );
  }

  logger.debug('Kerberos configuration validated', {
    servicePrincipal: sanitizeString(config.servicePrincipal),
    realm: sanitizeString(config.realm),
    keytabPath: sanitizePath(config.keytabPath),
  });
}

/**
 * Extract realm from service principal
 */
export function extractRealm(servicePrincipal: string): string {
  const parts = servicePrincipal.split('@');
  if (parts.length !== 2) {
    throw new Error(`Invalid service principal: ${servicePrincipal}`);
  }
  return parts[1];
}

/**
 * Extract service and hostname from service principal
 */
export function parseServicePrincipal(servicePrincipal: string): {
  service: string;
  hostname: string;
  realm: string;
} {
  const parts = servicePrincipal.split('@');
  if (parts.length !== 2) {
    throw new Error(`Invalid service principal: ${servicePrincipal}`);
  }

  const [serviceAndHost, realm] = parts;
  const serviceParts = serviceAndHost.split('/');
  if (serviceParts.length !== 2) {
    throw new Error(`Invalid service principal: ${servicePrincipal}`);
  }

  const [service, hostname] = serviceParts;
  return { service, hostname, realm };
}
