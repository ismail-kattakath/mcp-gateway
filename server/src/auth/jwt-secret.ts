/**
 * JWT Secret Management
 *
 * Handles automatic generation and storage of JWT secret.
 * Uses system keychain for secure storage.
 *
 * Related: Epic #4 (Authentication Framework)
 */

import crypto from 'crypto';
import logger from '../logging/logger.js';
import { storeSecret, retrieveSecret } from '../security/secure-storage.js';

const JWT_SECRET_KEY = 'mcp-gateway-jwt-secret';

/**
 * Generate a cryptographically secure JWT secret (32 bytes = 256 bits)
 */
function generateJwtSecret(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Get or create JWT secret
 *
 * Loads from keychain or generates new one if not found.
 *
 * @returns JWT secret
 */
export async function getOrCreateJwtSecret(): Promise<string> {
  try {
    // Check environment variable first
    if (process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 32) {
      logger.debug('Using JWT_SECRET from environment');
      return process.env.JWT_SECRET;
    }

    // Try to load from keychain
    const existingSecret = await retrieveSecret(JWT_SECRET_KEY);
    if (existingSecret && existingSecret.length >= 32) {
      logger.debug('Loaded JWT secret from keychain');
      // Set in process.env for token.ts to use
      process.env.JWT_SECRET = existingSecret;
      return existingSecret;
    }

    // Generate new secret
    const newSecret = generateJwtSecret();
    const stored = await storeSecret(newSecret, JWT_SECRET_KEY);

    if (!stored) {
      throw new Error('Failed to store JWT secret in keychain');
    }

    logger.info('Generated new JWT secret');
    // Set in process.env for token.ts to use
    process.env.JWT_SECRET = newSecret;
    return newSecret;
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to get/create JWT secret', {
      error: err.message,
    });
    throw new Error(`JWT secret management failed: ${err.message}`);
  }
}

/**
 * Rotate JWT secret (generate new one)
 *
 * WARNING: This will invalidate all existing JWT tokens.
 *
 * @returns New JWT secret
 */
export async function rotateJwtSecret(): Promise<string> {
  try {
    const newSecret = generateJwtSecret();
    const stored = await storeSecret(newSecret, JWT_SECRET_KEY);

    if (!stored) {
      throw new Error('Failed to store new JWT secret');
    }

    logger.warn('JWT secret rotated - all existing tokens invalidated');
    process.env.JWT_SECRET = newSecret;
    return newSecret;
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to rotate JWT secret', {
      error: err.message,
    });
    throw err;
  }
}

export default {
  getOrCreateJwtSecret,
  rotateJwtSecret,
};
