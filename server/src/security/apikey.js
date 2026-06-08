/**
 * Auto-generated API Key Manager
 *
 * Handles automatic generation, storage, and retrieval of the gateway API key.
 * Uses industry-standard secure storage:
 * - Primary: System keychain (macOS Keychain, Linux libsecret, Windows Credential Manager)
 * - Fallback: AES-256-GCM encrypted file with machine-derived key
 */

import path from 'path';
import crypto from 'crypto';
import logger from '../logging/logger.js';
import { storeSecret, retrieveSecret, deleteSecret, migrateFromCleartext } from './secure-storage.js';

const OLD_CLEARTEXT_FILE = path.join(
  process.env.HOME || process.env.USERPROFILE || '/tmp',
  '.mcp',
  'gateway-api-key'
);

/**
 * Generate a cryptographically secure random API key (64 hex chars = 32 bytes).
 */
function generateApiKey() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Load or generate the API key.
 * @param {boolean} forceRotate - Force generation of a new key
 * @returns {Promise<string>} The API key
 */
export async function getOrCreateApiKey(forceRotate = false) {
  try {
    // Check for existing key in secure storage
    if (!forceRotate) {
      // Try to migrate from old cleartext storage first
      const migratedKey = await migrateFromCleartext(OLD_CLEARTEXT_FILE);
      if (migratedKey) {
        return migratedKey;
      }

      // Load from secure storage
      const existingKey = await retrieveSecret();
      if (existingKey && existingKey.length >= 16) {
        logger.debug('Loaded existing API key from secure storage');
        return existingKey;
      }
    }

    // Generate new key
    const newKey = generateApiKey();
    const stored = await storeSecret(newKey);

    if (!stored) {
      throw new Error('Failed to store API key in any storage backend');
    }

    logger.info(forceRotate ? 'API key rotated' : 'Generated new API key');
    return newKey;
  } catch (error) {
    logger.error('Failed to load/generate API key', { error: error.message, stack: error.stack });
    throw new Error(`API key management failed: ${error.message}`);
  }
}

/**
 * Print the current API key to stdout and exit.
 * Used when PRINT_API_KEY=true env var is set.
 */
export async function printApiKeyAndExit() {
  try {
    const key = await getOrCreateApiKey(false);
    console.log(`\nGATEWAY_API_KEY=${key}\n`);
    console.log('Copy this key to use in client configurations:\n');
    console.log('  "headers": {');
    console.log(`    "Authorization": "Bearer ${key}"`);
    console.log('  }\n');
    console.log('Or for SSE endpoints that don\'t support headers:');
    console.log(`  http://localhost:3000/sse?access_token=${key}\n`);
    process.exit(0);
  } catch (error) {
    console.error('Failed to retrieve API key:', error.message);
    process.exit(1);
  }
}

/**
 * Rotate (regenerate) the API key, print it, and exit.
 * Used when ROTATE_API_KEY=true env var is set.
 */
export async function rotateApiKeyAndExit() {
  try {
    const key = await getOrCreateApiKey(true);
    console.log('\nAPI key rotated successfully!\n');
    console.log(`GATEWAY_API_KEY=${key}\n`);
    console.log('⚠️  Update this key in all client configurations.\n');
    process.exit(0);
  } catch (error) {
    console.error('Failed to rotate API key:', error.message);
    process.exit(1);
  }
}

export default {
  getOrCreateApiKey,
  printApiKeyAndExit,
  rotateApiKeyAndExit
};
