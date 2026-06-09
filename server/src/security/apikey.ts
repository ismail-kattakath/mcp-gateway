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
import { storeSecret, retrieveSecret, migrateFromCleartext } from './secure-storage.js';

const OLD_CLEARTEXT_FILE: string = path.join(
  process.env.HOME ?? process.env.USERPROFILE ?? '/tmp',
  '.mcp',
  'gateway-api-key'
);

/**
 * Generate a cryptographically secure random API key (64 hex chars = 32 bytes).
 */
function generateApiKey(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Load or generate the API key.
 * @param forceRotate - Force generation of a new key
 * @returns The API key
 */
export async function getOrCreateApiKey(forceRotate = false): Promise<string> {
  try {
    // Check for existing key in secure storage
    if (!forceRotate) {
      // Try to migrate from old cleartext storage first
      const migratedKey = await migrateFromCleartext(OLD_CLEARTEXT_FILE);
      if (migratedKey !== null) {
        return migratedKey;
      }

      // Load from secure storage
      const existingKey = await retrieveSecret();
      if (existingKey !== null && existingKey.length >= 16) {
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
    const err = error as Error;
    logger.error('Failed to load/generate API key', {
      error: err.message,
      stack: err.stack,
    });
    throw new Error(`API key management failed: ${err.message}`);
  }
}

/**
 * Print the current API key to stdout and exit.
 * Used when PRINT_API_KEY=true env var is set.
 */
export async function printApiKeyAndExit(): Promise<void> {
  try {
    const key = await getOrCreateApiKey(false);
    // lgtm[js/clear-text-logging]
    // Intentional: This is the CLI command to display the API key to the user
    // eslint-disable-next-line no-console
    console.log(`\nGATEWAY_API_KEY=${key}\n`);
    // eslint-disable-next-line no-console
    console.log('Copy this key to use in client configurations:\n');
    // eslint-disable-next-line no-console
    console.log('  "headers": {');
    // lgtm[js/clear-text-logging]
    // Intentional: This is the CLI command to display the API key to the user
    // eslint-disable-next-line no-console
    console.log(`    "Authorization": "Bearer ${key}"`);
    // eslint-disable-next-line no-console
    console.log('  }\n');
    // eslint-disable-next-line no-console
    console.log("Or for SSE endpoints that don't support headers:");
    // lgtm[js/clear-text-logging]
    // Intentional: This is the CLI command to display the API key to the user
    // eslint-disable-next-line no-console
    console.log(`  http://localhost:3000/sse?access_token=${key}\n`);
    process.exit(0);
  } catch (error) {
    const err = error as Error;

    console.error('Failed to retrieve API key:', err.message);
    process.exit(1);
  }
}

/**
 * Rotate (regenerate) the API key, print it, and exit.
 * Used when ROTATE_API_KEY=true env var is set.
 */
export async function rotateApiKeyAndExit(): Promise<void> {
  try {
    const key = await getOrCreateApiKey(true);
    // eslint-disable-next-line no-console
    console.log('\nAPI key rotated successfully!\n');
    // lgtm[js/clear-text-logging]
    // Intentional: This is the CLI command to display the rotated API key to the user
    // eslint-disable-next-line no-console
    console.log(`GATEWAY_API_KEY=${key}\n`);
    // eslint-disable-next-line no-console
    console.log('⚠️  Update this key in all client configurations.\n');
    process.exit(0);
  } catch (error) {
    const err = error as Error;

    console.error('Failed to rotate API key:', err.message);
    process.exit(1);
  }
}

export default {
  getOrCreateApiKey,
  printApiKeyAndExit,
  rotateApiKeyAndExit,
};
