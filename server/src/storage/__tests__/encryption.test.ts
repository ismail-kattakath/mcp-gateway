/**
 * Encryption Helper Tests
 *
 * Tests for field-level AES-256-GCM encryption.
 * Related: Epic #13, Issue #37
 */

import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import {
  FieldEncryption,
  EncryptionError,
  shouldEncryptSettingKey,
  encryptServerConfig,
  decryptServerConfig,
  generateEncryptionKey,
} from '../encryption.js';

describe('FieldEncryption', () => {
  let encryptor: FieldEncryption;
  const validKey = crypto.randomBytes(32);

  beforeEach(() => {
    encryptor = new FieldEncryption(validKey);
  });

  describe('constructor', () => {
    it('should accept a valid 32-byte key', () => {
      expect(() => new FieldEncryption(validKey)).not.toThrow();
    });

    it('should throw if key is not a Buffer', () => {
      expect(() => new FieldEncryption('not a buffer' as any)).toThrow(EncryptionError);
      expect(() => new FieldEncryption('not a buffer' as any)).toThrow(
        'Encryption key must be a Buffer'
      );
    });

    it('should throw if key is wrong length', () => {
      const shortKey = crypto.randomBytes(16);
      expect(() => new FieldEncryption(shortKey)).toThrow(EncryptionError);
      expect(() => new FieldEncryption(shortKey)).toThrow(/must be 32 bytes/);
    });
  });

  describe('encrypt', () => {
    it('should encrypt a string', () => {
      const plaintext = 'secret password';
      const encrypted = encryptor.encrypt(plaintext);

      expect(encrypted).toBeTruthy();
      expect(encrypted).not.toBe(plaintext);
      expect(typeof encrypted).toBe('string');
    });

    it('should produce different ciphertext each time (random IV)', () => {
      const plaintext = 'secret password';
      const encrypted1 = encryptor.encrypt(plaintext);
      const encrypted2 = encryptor.encrypt(plaintext);

      expect(encrypted1).not.toBe(encrypted2);
    });

    it('should produce encrypted format: iv:authTag:ciphertext', () => {
      const plaintext = 'secret password';
      const encrypted = encryptor.encrypt(plaintext);

      const parts = encrypted.split(':');
      expect(parts).toHaveLength(3);

      // Check all parts are hex
      expect(parts[0]).toMatch(/^[0-9a-f]+$/);
      expect(parts[1]).toMatch(/^[0-9a-f]+$/);
      expect(parts[2]).toMatch(/^[0-9a-f]+$/);

      // Check IV is 16 bytes (32 hex chars)
      expect(parts[0]).toHaveLength(32);

      // Check auth tag is 16 bytes (32 hex chars)
      expect(parts[1]).toHaveLength(32);
    });

    it('should handle empty strings', () => {
      const encrypted = encryptor.encrypt('');
      expect(encrypted).toBeTruthy();
      expect(encrypted.split(':')).toHaveLength(3);
    });

    it('should handle unicode characters', () => {
      const plaintext = '你好世界 🌍 مرحبا';
      const encrypted = encryptor.encrypt(plaintext);
      expect(encrypted).toBeTruthy();
    });

    it('should handle long strings', () => {
      const plaintext = 'x'.repeat(10000);
      const encrypted = encryptor.encrypt(plaintext);
      expect(encrypted).toBeTruthy();
    });
  });

  describe('decrypt', () => {
    it('should decrypt an encrypted string', () => {
      const plaintext = 'secret password';
      const encrypted = encryptor.encrypt(plaintext);
      const decrypted = encryptor.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle empty strings', () => {
      const plaintext = '';
      const encrypted = encryptor.encrypt(plaintext);
      const decrypted = encryptor.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle unicode characters', () => {
      const plaintext = '你好世界 🌍 مرحبا';
      const encrypted = encryptor.encrypt(plaintext);
      const decrypted = encryptor.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle long strings', () => {
      const plaintext = 'x'.repeat(10000);
      const encrypted = encryptor.encrypt(plaintext);
      const decrypted = encryptor.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should throw on invalid format (wrong number of parts)', () => {
      expect(() => encryptor.decrypt('invalid')).toThrow(EncryptionError);
      expect(() => encryptor.decrypt('iv:authTag')).toThrow(EncryptionError);
      expect(() => encryptor.decrypt('iv:authTag:ciphertext:extra')).toThrow(EncryptionError);
    });

    it('should throw on invalid hex characters', () => {
      expect(() => encryptor.decrypt('ZZZZ:1234:5678')).toThrow(EncryptionError);
      expect(() => encryptor.decrypt('1234:ZZZZ:5678')).toThrow(EncryptionError);
      expect(() => encryptor.decrypt('1234:5678:ZZZZ')).toThrow(EncryptionError);
    });

    it('should throw on wrong IV length', () => {
      // IV too short
      expect(() => encryptor.decrypt('1234:' + '00'.repeat(16) + ':abcd')).toThrow(EncryptionError);
    });

    it('should throw on wrong auth tag length', () => {
      // Auth tag too short
      expect(() => encryptor.decrypt('00'.repeat(16) + ':1234:abcd')).toThrow(EncryptionError);
    });

    it('should throw on tampered ciphertext', () => {
      const plaintext = 'secret password';
      const encrypted = encryptor.encrypt(plaintext);
      const parts = encrypted.split(':');

      // Tamper with ciphertext
      const tampered = `${parts[0]}:${parts[1]}:${parts[2].slice(0, -2)}FF`;

      expect(() => encryptor.decrypt(tampered)).toThrow(EncryptionError);
    });

    it('should throw on wrong key', () => {
      const plaintext = 'secret password';
      const encrypted = encryptor.encrypt(plaintext);

      // Try to decrypt with different key
      const wrongKey = crypto.randomBytes(32);
      const wrongEncryptor = new FieldEncryption(wrongKey);

      expect(() => wrongEncryptor.decrypt(encrypted)).toThrow(EncryptionError);
    });
  });

  describe('isEncrypted', () => {
    it('should return true for encrypted format', () => {
      const plaintext = 'secret password';
      const encrypted = encryptor.encrypt(plaintext);

      expect(FieldEncryption.isEncrypted(encrypted)).toBe(true);
    });

    it('should return false for plaintext', () => {
      expect(FieldEncryption.isEncrypted('plaintext')).toBe(false);
      expect(FieldEncryption.isEncrypted('not:encrypted')).toBe(false);
      expect(FieldEncryption.isEncrypted('not:encrypted:format')).toBe(false);
    });

    it('should return false for invalid hex', () => {
      expect(FieldEncryption.isEncrypted('ZZZZ:1234:5678')).toBe(false);
      expect(FieldEncryption.isEncrypted('1234:ZZZZ:5678')).toBe(false);
      expect(FieldEncryption.isEncrypted('1234:5678:ZZZZ')).toBe(false);
    });
  });
});

describe('shouldEncryptSettingKey', () => {
  it('should return true for keys ending with _secret', () => {
    expect(shouldEncryptSettingKey('jwt_secret')).toBe(true);
    expect(shouldEncryptSettingKey('api_secret')).toBe(true);
    expect(shouldEncryptSettingKey('my_secret')).toBe(true);
  });

  it('should return true for keys ending with _key', () => {
    expect(shouldEncryptSettingKey('api_key')).toBe(true);
    expect(shouldEncryptSettingKey('encryption_key')).toBe(true);
    expect(shouldEncryptSettingKey('my_key')).toBe(true);
  });

  it('should return true for keys ending with _token', () => {
    expect(shouldEncryptSettingKey('access_token')).toBe(true);
    expect(shouldEncryptSettingKey('refresh_token')).toBe(true);
    expect(shouldEncryptSettingKey('my_token')).toBe(true);
  });

  it('should return true for password keys', () => {
    expect(shouldEncryptSettingKey('password')).toBe(true);
    expect(shouldEncryptSettingKey('passwd')).toBe(true);
  });

  it('should be case-insensitive', () => {
    expect(shouldEncryptSettingKey('JWT_SECRET')).toBe(true);
    expect(shouldEncryptSettingKey('API_KEY')).toBe(true);
    expect(shouldEncryptSettingKey('PASSWORD')).toBe(true);
  });

  it('should return false for non-sensitive keys', () => {
    expect(shouldEncryptSettingKey('server.port')).toBe(false);
    expect(shouldEncryptSettingKey('server.host')).toBe(false);
    expect(shouldEncryptSettingKey('logging.level')).toBe(false);
  });
});

describe('encryptServerConfig', () => {
  let encryptor: FieldEncryption;

  beforeEach(() => {
    const key = crypto.randomBytes(32);
    encryptor = new FieldEncryption(key);
  });

  it('should encrypt env values', () => {
    const config = {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      env: {
        GITHUB_TOKEN: 'ghp_secret123',
        API_KEY: 'sk-secret456',
      },
    };

    const encrypted = encryptServerConfig(config, encryptor);

    expect(encrypted.env).toBeDefined();
    const env = encrypted.env as Record<string, string>;
    expect(FieldEncryption.isEncrypted(env.GITHUB_TOKEN)).toBe(true);
    expect(FieldEncryption.isEncrypted(env.API_KEY)).toBe(true);
  });

  it('should encrypt headers values', () => {
    const config = {
      url: 'http://localhost:3001',
      headers: {
        Authorization: 'Bearer secret-token',
        'X-API-Key': 'secret-key',
      },
    };

    const encrypted = encryptServerConfig(config, encryptor);

    expect(encrypted.headers).toBeDefined();
    const headers = encrypted.headers as Record<string, string>;
    expect(FieldEncryption.isEncrypted(headers.Authorization)).toBe(true);
    expect(FieldEncryption.isEncrypted(headers['X-API-Key'])).toBe(true);
  });

  it('should encrypt build.args values with = separator', () => {
    const config = {
      image: 'my-image',
      build: {
        args: [
          'SECRET_KEY=my-secret',
          'API_TOKEN=token123',
          '--flag', // No = separator, not encrypted
        ],
      },
    };

    const encrypted = encryptServerConfig(config, encryptor);

    expect(encrypted.build).toBeDefined();
    const build = encrypted.build as { args: string[] };
    expect(build.args).toHaveLength(3);

    // Check encrypted args
    expect(build.args[0]).toContain('SECRET_KEY=');
    const secret = build.args[0].split('=')[1];
    expect(FieldEncryption.isEncrypted(secret)).toBe(true);

    expect(build.args[1]).toContain('API_TOKEN=');
    const token = build.args[1].split('=')[1];
    expect(FieldEncryption.isEncrypted(token)).toBe(true);

    // Non-secret arg should remain unchanged
    expect(build.args[2]).toBe('--flag');
  });

  it('should not modify non-sensitive fields', () => {
    const config = {
      command: 'npx',
      args: ['-y', 'package'],
      timeout: 30000,
    };

    const encrypted = encryptServerConfig(config, encryptor);

    expect(encrypted.command).toBe('npx');
    expect(encrypted.args).toEqual(['-y', 'package']);
    expect(encrypted.timeout).toBe(30000);
  });

  it('should handle empty env/headers/args', () => {
    const config = {
      command: 'npx',
      env: {},
      headers: {},
      build: { args: [] },
    };

    const encrypted = encryptServerConfig(config, encryptor);

    expect(encrypted.env).toEqual({});
    expect(encrypted.headers).toEqual({});
    expect((encrypted.build as any).args).toEqual([]);
  });
});

describe('decryptServerConfig', () => {
  let encryptor: FieldEncryption;

  beforeEach(() => {
    const key = crypto.randomBytes(32);
    encryptor = new FieldEncryption(key);
  });

  it('should decrypt env values', () => {
    const config = {
      command: 'npx',
      env: {
        GITHUB_TOKEN: 'ghp_secret123',
        API_KEY: 'sk-secret456',
      },
    };

    const encrypted = encryptServerConfig(config, encryptor);
    const decrypted = decryptServerConfig(encrypted, encryptor);

    expect(decrypted.env).toEqual(config.env);
  });

  it('should decrypt headers values', () => {
    const config = {
      url: 'http://localhost:3001',
      headers: {
        Authorization: 'Bearer secret-token',
        'X-API-Key': 'secret-key',
      },
    };

    const encrypted = encryptServerConfig(config, encryptor);
    const decrypted = decryptServerConfig(encrypted, encryptor);

    expect(decrypted.headers).toEqual(config.headers);
  });

  it('should decrypt build.args values', () => {
    const config = {
      image: 'my-image',
      build: {
        args: ['SECRET_KEY=my-secret', 'API_TOKEN=token123', '--flag'],
      },
    };

    const encrypted = encryptServerConfig(config, encryptor);
    const decrypted = decryptServerConfig(encrypted, encryptor);

    expect((decrypted.build as any).args).toEqual(config.build.args);
  });

  it('should handle mixed encrypted/plaintext values', () => {
    const config = {
      command: 'npx',
      env: {
        ENCRYPTED: 'secret',
      },
    };

    const encrypted = encryptServerConfig(config, encryptor);

    // Add plaintext value
    (encrypted.env as any).PLAINTEXT = 'not-encrypted';

    const decrypted = decryptServerConfig(encrypted, encryptor);

    expect((decrypted.env as any).ENCRYPTED).toBe('secret');
    expect((decrypted.env as any).PLAINTEXT).toBe('not-encrypted');
  });

  it('should round-trip correctly', () => {
    const config = {
      command: 'npx',
      args: ['-y', 'package'],
      env: {
        TOKEN: 'secret123',
      },
      headers: {
        Authorization: 'Bearer token',
      },
      build: {
        args: ['KEY=value', '--flag'],
      },
      timeout: 30000,
    };

    const encrypted = encryptServerConfig(config, encryptor);
    const decrypted = decryptServerConfig(encrypted, encryptor);

    expect(decrypted).toEqual(config);
  });
});

describe('generateEncryptionKey', () => {
  it('should generate a valid base64 key', () => {
    const key = generateEncryptionKey();

    expect(key).toBeTruthy();
    expect(typeof key).toBe('string');

    // Should be base64
    expect(key).toMatch(/^[A-Za-z0-9+/]+=*$/);

    // Should decode to 32 bytes
    const decoded = Buffer.from(key, 'base64');
    expect(decoded).toHaveLength(32);
  });

  it('should generate different keys each time', () => {
    const key1 = generateEncryptionKey();
    const key2 = generateEncryptionKey();

    expect(key1).not.toBe(key2);
  });

  it('should generate keys that work with FieldEncryption', () => {
    const keyBase64 = generateEncryptionKey();
    const keyBuffer = Buffer.from(keyBase64, 'base64');

    expect(() => new FieldEncryption(keyBuffer)).not.toThrow();

    const encryptor = new FieldEncryption(keyBuffer);
    const plaintext = 'test';
    const encrypted = encryptor.encrypt(plaintext);
    const decrypted = encryptor.decrypt(encrypted);

    expect(decrypted).toBe(plaintext);
  });
});
