/**
 * Encrypted Token Storage
 *
 * Securely stores OAuth tokens with AES-256-GCM encryption
 */

import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../logging/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Encryption constants
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;

/**
 * Token storage location: ~/.mcp/tokens.enc
 */
function getTokenStorePath() {
  const mcpDir = path.join(process.env.HOME || process.env.USERPROFILE || '/tmp', '.mcp');
  return path.join(mcpDir, 'tokens.enc');
}

/**
 * Get or generate encryption key
 * Uses TOKEN_ENCRYPTION_KEY env var, or generates and saves one
 */
async function getEncryptionKey() {
  if (process.env.TOKEN_ENCRYPTION_KEY) {
    // Use provided key
    const key = Buffer.from(process.env.TOKEN_ENCRYPTION_KEY, 'hex');
    if (key.length !== KEY_LENGTH) {
      throw new Error(`TOKEN_ENCRYPTION_KEY must be ${KEY_LENGTH} bytes (${KEY_LENGTH * 2} hex chars)`);
    }
    return key;
  }

  // Generate new key and save to .env
  logger.warn('TOKEN_ENCRYPTION_KEY not found in environment, generating new key');
  const key = crypto.randomBytes(KEY_LENGTH);
  const keyHex = key.toString('hex');

  // Try to append to .env file
  try {
    const envPath = path.resolve(__dirname, '../../../.env');
    const envContent = await fs.readFile(envPath, 'utf-8').catch(() => '');

    if (!envContent.includes('TOKEN_ENCRYPTION_KEY=')) {
      const newContent = envContent.trim() + `\n\n# Auto-generated encryption key for OAuth tokens\nTOKEN_ENCRYPTION_KEY=${keyHex}\n`;
      await fs.writeFile(envPath, newContent);
      logger.info('Generated and saved TOKEN_ENCRYPTION_KEY to .env');
    }
  } catch (error) {
    logger.error('Failed to save encryption key to .env', { error: error.message });
    logger.warn('Please add this to your .env file:', { key: `TOKEN_ENCRYPTION_KEY=${keyHex}` });
  }

  return key;
}

/**
 * Encrypt data using AES-256-GCM
 */
async function encrypt(data) {
  const key = await getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const salt = crypto.randomBytes(SALT_LENGTH);

  // Derive key with salt
  const derivedKey = crypto.pbkdf2Sync(key, salt, 100000, KEY_LENGTH, 'sha256');

  // Encrypt
  const cipher = crypto.createCipheriv(ALGORITHM, derivedKey, iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(data), 'utf8'),
    cipher.final()
  ]);

  const authTag = cipher.getAuthTag();

  // Combine: salt + iv + authTag + encrypted
  return Buffer.concat([salt, iv, authTag, encrypted]).toString('base64');
}

/**
 * Decrypt data using AES-256-GCM
 */
async function decrypt(encryptedData) {
  const key = await getEncryptionKey();
  const buffer = Buffer.from(encryptedData, 'base64');

  // Extract components
  const salt = buffer.subarray(0, SALT_LENGTH);
  const iv = buffer.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const authTag = buffer.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = buffer.subarray(SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);

  // Derive key with salt
  const derivedKey = crypto.pbkdf2Sync(key, salt, 100000, KEY_LENGTH, 'sha256');

  // Decrypt
  const decipher = crypto.createDecipheriv(ALGORITHM, derivedKey, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final()
  ]);

  return JSON.parse(decrypted.toString('utf8'));
}

/**
 * Ensure .mcp directory exists
 */
async function ensureMcpDir() {
  const mcpDir = path.join(process.env.HOME || process.env.USERPROFILE || '/tmp', '.mcp');
  try {
    await fs.mkdir(mcpDir, { recursive: true });
  } catch (error) {
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }
}

/**
 * Load all tokens from encrypted storage
 */
async function loadTokens() {
  const tokenPath = getTokenStorePath();

  try {
    const encryptedData = await fs.readFile(tokenPath, 'utf-8');
    return await decrypt(encryptedData);
  } catch (error) {
    if (error.code === 'ENOENT') {
      // File doesn't exist yet
      return {};
    }

    logger.error('Failed to load tokens', { error: error.message });
    throw error;
  }
}

/**
 * Save all tokens to encrypted storage
 */
async function saveTokens(tokens) {
  await ensureMcpDir();
  const tokenPath = getTokenStorePath();

  try {
    const encryptedData = await encrypt(tokens);
    await fs.writeFile(tokenPath, encryptedData, 'utf-8');
  } catch (error) {
    logger.error('Failed to save tokens', { error: error.message });
    throw error;
  }
}

/**
 * Save a token for a provider
 */
export async function saveToken(provider, tokenData) {
  try {
    const tokens = await loadTokens();

    tokens[provider] = {
      provider,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || null,
      expires_at: tokenData.expires_at || null,
      scopes: tokenData.scopes || tokenData.scope?.split(' ') || [],
      created_at: Date.now(),
      updated_at: Date.now()
    };

    await saveTokens(tokens);

    logger.info('Token saved', { provider, scopes: tokens[provider].scopes });
    return tokens[provider];
  } catch (error) {
    logger.error('Failed to save token', { provider, error: error.message });
    throw error;
  }
}

/**
 * Get a token for a provider
 */
export async function getToken(provider) {
  try {
    const tokens = await loadTokens();
    return tokens[provider] || null;
  } catch (error) {
    logger.error('Failed to get token', { provider, error: error.message });
    throw error;
  }
}

/**
 * Delete a token for a provider
 */
export async function deleteToken(provider) {
  try {
    const tokens = await loadTokens();

    if (!tokens[provider]) {
      logger.warn('Token not found for deletion', { provider });
      return false;
    }

    delete tokens[provider];
    await saveTokens(tokens);

    logger.info('Token deleted', { provider });
    return true;
  } catch (error) {
    logger.error('Failed to delete token', { provider, error: error.message });
    throw error;
  }
}

/**
 * Get all tokens
 */
export async function getAllTokens() {
  try {
    return await loadTokens();
  } catch (error) {
    logger.error('Failed to get all tokens', { error: error.message });
    throw error;
  }
}

/**
 * Update token (for refresh operations)
 */
export async function updateToken(provider, updates) {
  try {
    const tokens = await loadTokens();

    if (!tokens[provider]) {
      throw new Error(`Token not found for provider: ${provider}`);
    }

    tokens[provider] = {
      ...tokens[provider],
      ...updates,
      updated_at: Date.now()
    };

    await saveTokens(tokens);

    logger.info('Token updated', { provider });
    return tokens[provider];
  } catch (error) {
    logger.error('Failed to update token', { provider, error: error.message });
    throw error;
  }
}

/**
 * Check if a token exists and is valid
 */
export async function isTokenValid(provider) {
  try {
    const token = await getToken(provider);

    if (!token) {
      return false;
    }

    // If no expiry, assume valid
    if (!token.expires_at) {
      return true;
    }

    // Check if expired (with 5 minute buffer)
    const expiryTime = new Date(token.expires_at).getTime();
    const now = Date.now();
    const bufferMs = 5 * 60 * 1000; // 5 minutes

    return now < (expiryTime - bufferMs);
  } catch (error) {
    logger.error('Failed to check token validity', { provider, error: error.message });
    return false;
  }
}

export default {
  saveToken,
  getToken,
  deleteToken,
  getAllTokens,
  updateToken,
  isTokenValid
};
