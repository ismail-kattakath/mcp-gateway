/**
 * Auto-generated API Key Manager
 *
 * Handles automatic generation, storage, and retrieval of the gateway API key.
 * Key is stored in ~/.mcp/gateway-api-key and persists across restarts.
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import logger from '../logging/logger.js';

const API_KEY_FILE = path.join(
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
    // Ensure directory exists
    await fs.mkdir(path.dirname(API_KEY_FILE), { recursive: true });

    // Check for existing key
    if (!forceRotate) {
      try {
        const existingKey = await fs.readFile(API_KEY_FILE, 'utf-8');
        const key = existingKey.trim();
        if (key && key.length >= 16) {
          logger.debug('Loaded existing API key from storage');
          return key;
        }
      } catch (err) {
        if (err.code !== 'ENOENT') {
          logger.warn('Failed to read existing API key, generating new one', { error: err.message });
        }
      }
    }

    // Generate new key
    const newKey = generateApiKey();
    await fs.writeFile(API_KEY_FILE, newKey, { mode: 0o600 }); // user-readable only
    logger.info(forceRotate ? 'API key rotated' : 'Generated new API key', { path: API_KEY_FILE });
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
