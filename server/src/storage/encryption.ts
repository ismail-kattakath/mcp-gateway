/**
 * Field-Level Encryption Helper
 *
 * Implements AES-256-GCM encryption for sensitive fields in the database.
 * Used for encrypting:
 * - servers.config: env values, headers values, build.args
 * - settings.value: when key matches *_secret, *_key, *_token
 *
 * Format: iv:authTag:ciphertext (all hex-encoded)
 *
 * Related: Epic #13, Issue #37
 */

import crypto from 'crypto';
import { sanitizeString } from '../logging/sanitizer.js';
import logger from '../logging/logger.js';

// Encryption algorithm
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128 bits
const AUTH_TAG_LENGTH = 16; // 128 bits
const KEY_LENGTH = 32; // 256 bits

// Separator for encrypted format
const SEPARATOR = ':';

/**
 * Error thrown when encryption/decryption fails
 */
export class EncryptionError extends Error {
  constructor(message: string, cause?: Error) {
    super(message);
    this.name = 'EncryptionError';
    if (cause) {
      this.cause = cause;
    }
  }
}

/**
 * Field-level encryption helper using AES-256-GCM
 */
export class FieldEncryption {
  private key: Buffer;

  /**
   * Create a new FieldEncryption instance
   * @param key - 256-bit (32-byte) encryption key
   * @throws {EncryptionError} If key is invalid
   */
  constructor(key: Buffer) {
    if (!Buffer.isBuffer(key)) {
      throw new EncryptionError('Encryption key must be a Buffer');
    }
    if (key.length !== KEY_LENGTH) {
      throw new EncryptionError(
        `Encryption key must be ${KEY_LENGTH} bytes (${KEY_LENGTH * 8} bits), got ${key.length} bytes`
      );
    }
    this.key = key;
  }

  /**
   * Encrypt a plaintext string
   * @param plaintext - String to encrypt
   * @returns Encrypted string in format: iv:authTag:ciphertext (hex-encoded)
   * @throws {EncryptionError} If encryption fails
   */
  encrypt(plaintext: string): string {
    try {
      // Generate random IV
      const iv = crypto.randomBytes(IV_LENGTH);

      // Create cipher
      const cipher = crypto.createCipheriv(ALGORITHM, this.key, iv);

      // Encrypt
      let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
      ciphertext += cipher.final('hex');

      // Get authentication tag
      const authTag = cipher.getAuthTag();

      // Format: iv:authTag:ciphertext
      const encrypted = `${iv.toString('hex')}${SEPARATOR}${authTag.toString('hex')}${SEPARATOR}${ciphertext}`;

      logger.debug('Encrypted field', {
        plaintextLength: plaintext.length,
        encryptedLength: encrypted.length,
      });

      return encrypted;
    } catch (error) {
      const err = error as Error;
      logger.error('Encryption failed', { error: sanitizeString(err.message) });
      throw new EncryptionError('Failed to encrypt data', err);
    }
  }

  /**
   * Decrypt an encrypted string
   * @param encrypted - Encrypted string in format: iv:authTag:ciphertext
   * @returns Decrypted plaintext string
   * @throws {EncryptionError} If decryption fails or format is invalid
   */
  decrypt(encrypted: string): string {
    try {
      // Parse encrypted format
      const parts = encrypted.split(SEPARATOR);
      if (parts.length !== 3) {
        throw new EncryptionError(
          `Invalid encrypted format. Expected "iv:authTag:ciphertext", got ${parts.length} parts`
        );
      }

      const [ivHex, authTagHex, ciphertext] = parts;

      // Validate hex strings (ciphertext can be empty for empty plaintext)
      if (!this.isValidHex(ivHex) || !this.isValidHex(authTagHex) || (ciphertext.length > 0 && !this.isValidHex(ciphertext))) {
        throw new EncryptionError('Invalid encrypted format: contains non-hex characters');
      }

      // Parse components
      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');

      // Validate lengths
      if (iv.length !== IV_LENGTH) {
        throw new EncryptionError(`Invalid IV length: expected ${IV_LENGTH} bytes, got ${iv.length}`);
      }
      if (authTag.length !== AUTH_TAG_LENGTH) {
        throw new EncryptionError(
          `Invalid auth tag length: expected ${AUTH_TAG_LENGTH} bytes, got ${authTag.length}`
        );
      }

      // Create decipher
      const decipher = crypto.createDecipheriv(ALGORITHM, this.key, iv);
      decipher.setAuthTag(authTag);

      // Decrypt
      let plaintext = decipher.update(ciphertext, 'hex', 'utf8');
      plaintext += decipher.final('utf8');

      logger.debug('Decrypted field', {
        encryptedLength: encrypted.length,
        plaintextLength: plaintext.length,
      });

      return plaintext;
    } catch (error) {
      const err = error as Error;

      // Don't log encrypted data or error details (might leak sensitive info)
      if (err instanceof EncryptionError) {
        throw err;
      }

      logger.error('Decryption failed', {
        error: 'Invalid encrypted data or authentication failed',
      });
      throw new EncryptionError('Failed to decrypt data: Invalid encrypted data or wrong key', err);
    }
  }

  /**
   * Check if a string contains only valid hex characters
   * Empty string is considered valid (empty ciphertext)
   */
  private isValidHex(str: string): boolean {
    if (str.length === 0) return true;
    return /^[0-9a-fA-F]+$/.test(str);
  }

  /**
   * Check if a value is encrypted (matches encrypted format)
   * @param value - Value to check
   * @returns True if value appears to be encrypted
   */
  static isEncrypted(value: string): boolean {
    const parts = value.split(SEPARATOR);
    if (parts.length !== 3) return false;

    const [ivHex, authTagHex, ciphertext] = parts;

    // Check if all parts are valid hex
    const hexPattern = /^[0-9a-fA-F]+$/;
    return (
      hexPattern.test(ivHex) &&
      hexPattern.test(authTagHex) &&
      hexPattern.test(ciphertext)
    );
  }
}

/**
 * Get encryption key from environment or generate a new one
 *
 * Key sources (in priority order):
 * 1. STORAGE_ENCRYPTION_KEY environment variable (base64)
 * 2. System keychain (via keytar - to be implemented)
 * 3. Generate new key and store in keychain
 *
 * @returns 256-bit encryption key
 * @throws {EncryptionError} If key cannot be retrieved or generated
 */
export async function getEncryptionKey(): Promise<Buffer> {
  // Try environment variable first (for Docker/production)
  const envKey = process.env.STORAGE_ENCRYPTION_KEY;
  if (envKey) {
    try {
      const key = Buffer.from(envKey, 'base64');
      if (key.length !== KEY_LENGTH) {
        throw new EncryptionError(
          `STORAGE_ENCRYPTION_KEY must be ${KEY_LENGTH * 8} bits (base64-encoded), got ${key.length * 8} bits`
        );
      }
      logger.info('Using encryption key from STORAGE_ENCRYPTION_KEY environment variable');
      return key;
    } catch (error) {
      const err = error as Error;
      if (err instanceof EncryptionError) throw err;
      throw new EncryptionError('Invalid STORAGE_ENCRYPTION_KEY format (must be base64)', err);
    }
  }

  // TODO: Try system keychain (keytar) - Issue #37
  // For now, throw error if no key is available
  throw new EncryptionError(
    'No encryption key found. Set STORAGE_ENCRYPTION_KEY environment variable.\n' +
    'Generate a key with: node -e "console.log(crypto.randomBytes(32).toString(\'base64\'))"'
  );
}

/**
 * Generate a new random encryption key
 * @returns 256-bit encryption key (base64-encoded for env var)
 */
export function generateEncryptionKey(): string {
  const key = crypto.randomBytes(KEY_LENGTH);
  const base64Key = key.toString('base64');
  logger.info('Generated new encryption key (STORE THIS SECURELY!)');
  return base64Key;
}

/**
 * Check if a setting key should be encrypted
 * Settings ending with _secret, _key, or _token should be encrypted
 */
export function shouldEncryptSettingKey(key: string): boolean {
  const sensitivePatterns = [
    /_secret$/i,
    /_key$/i,
    /_token$/i,
    /^password$/i,
    /^passwd$/i,
  ];
  return sensitivePatterns.some(pattern => pattern.test(key));
}

/**
 * Encrypt sensitive fields in a server config object
 *
 * Encrypts:
 * - env values (all environment variables)
 * - headers values (for remote servers)
 * - build.args values (for container servers)
 *
 * @param config - Server configuration object
 * @param encryptor - FieldEncryption instance
 * @returns Config with encrypted sensitive fields
 */
export function encryptServerConfig(config: Record<string, unknown>, encryptor: FieldEncryption): Record<string, unknown> {
  const result = { ...config };

  // Encrypt env values
  if (result.env && typeof result.env === 'object') {
    const env = result.env as Record<string, unknown>;
    const encryptedEnv: Record<string, string> = {};

    for (const [key, value] of Object.entries(env)) {
      if (typeof value === 'string') {
        encryptedEnv[key] = encryptor.encrypt(value);
      } else {
        // Non-string values are kept as-is (shouldn't happen in practice)
        encryptedEnv[key] = String(value);
      }
    }

    result.env = encryptedEnv;
  }

  // Encrypt headers values (RemoteServer)
  if (result.headers && typeof result.headers === 'object') {
    const headers = result.headers as Record<string, unknown>;
    const encryptedHeaders: Record<string, string> = {};

    for (const [key, value] of Object.entries(headers)) {
      if (typeof value === 'string') {
        encryptedHeaders[key] = encryptor.encrypt(value);
      } else {
        encryptedHeaders[key] = String(value);
      }
    }

    result.headers = encryptedHeaders;
  }

  // Encrypt build.args values (ContainerServer)
  if (result.build && typeof result.build === 'object') {
    const build = result.build as Record<string, unknown>;

    if (Array.isArray(build.args)) {
      const encryptedArgs: string[] = [];

      for (const arg of build.args) {
        if (typeof arg === 'string') {
          // Only encrypt args that look like secrets (contain '=' and value part)
          if (arg.includes('=')) {
            const [key, ...valueParts] = arg.split('=');
            const value = valueParts.join('=');
            const encryptedValue = encryptor.encrypt(value);
            encryptedArgs.push(`${key}=${encryptedValue}`);
          } else {
            encryptedArgs.push(arg);
          }
        } else {
          encryptedArgs.push(String(arg));
        }
      }

      result.build = { ...build, args: encryptedArgs };
    }
  }

  return result;
}

/**
 * Decrypt sensitive fields in a server config object
 *
 * @param config - Server configuration with encrypted fields
 * @param encryptor - FieldEncryption instance
 * @returns Config with decrypted sensitive fields
 * @throws {EncryptionError} If decryption fails
 */
export function decryptServerConfig(config: Record<string, unknown>, encryptor: FieldEncryption): Record<string, unknown> {
  const result = { ...config };

  // Decrypt env values
  if (result.env && typeof result.env === 'object') {
    const env = result.env as Record<string, unknown>;
    const decryptedEnv: Record<string, string> = {};

    for (const [key, value] of Object.entries(env)) {
      if (typeof value === 'string' && FieldEncryption.isEncrypted(value)) {
        decryptedEnv[key] = encryptor.decrypt(value);
      } else {
        decryptedEnv[key] = String(value);
      }
    }

    result.env = decryptedEnv;
  }

  // Decrypt headers values
  if (result.headers && typeof result.headers === 'object') {
    const headers = result.headers as Record<string, unknown>;
    const decryptedHeaders: Record<string, string> = {};

    for (const [key, value] of Object.entries(headers)) {
      if (typeof value === 'string' && FieldEncryption.isEncrypted(value)) {
        decryptedHeaders[key] = encryptor.decrypt(value);
      } else {
        decryptedHeaders[key] = String(value);
      }
    }

    result.headers = decryptedHeaders;
  }

  // Decrypt build.args values
  if (result.build && typeof result.build === 'object') {
    const build = result.build as Record<string, unknown>;

    if (Array.isArray(build.args)) {
      const decryptedArgs: string[] = [];

      for (const arg of build.args) {
        if (typeof arg === 'string' && arg.includes('=')) {
          const [key, ...valueParts] = arg.split('=');
          const value = valueParts.join('=');

          if (FieldEncryption.isEncrypted(value)) {
            const decryptedValue = encryptor.decrypt(value);
            decryptedArgs.push(`${key}=${decryptedValue}`);
          } else {
            decryptedArgs.push(arg);
          }
        } else {
          decryptedArgs.push(String(arg));
        }
      }

      result.build = { ...build, args: decryptedArgs };
    }
  }

  return result;
}

export default {
  FieldEncryption,
  getEncryptionKey,
  generateEncryptionKey,
  shouldEncryptSettingKey,
  encryptServerConfig,
  decryptServerConfig,
  EncryptionError,
};
