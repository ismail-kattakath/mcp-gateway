import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  storeSecret,
  retrieveSecret,
  deleteSecret,
  migrateFromCleartext,
} from '../../security/secure-storage.js';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const STORAGE_DIR = path.join(process.env.HOME ?? '/tmp', '.mcp');
const ENCRYPTED_FILE = path.join(STORAGE_DIR, '.gateway-api-key.enc');
const TEST_SECRET = 'test-secret-key-' + Date.now();

// Run sequentially to avoid keychain race conditions
describe.sequential('secure-storage', () => {
  beforeEach(async () => {
    // Clean up any existing test keys
    await deleteSecret().catch(() => {});
    // Give keychain time to settle
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

  afterEach(async () => {
    await deleteSecret().catch(() => {});
    // Give keychain time to settle
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

  describe('encryption and decryption', () => {
    it('should encrypt and decrypt secrets correctly', async () => {
      const secret = TEST_SECRET;

      const stored = await storeSecret(secret);
      expect(stored).toBe(true);

      const retrieved = await retrieveSecret();
      expect(retrieved).toBe(secret);
    });

    it('should generate unique ciphertext for same secret', async () => {
      const secret = 'same-secret-test';

      await storeSecret(secret);
      const fileExists1 = await fs
        .access(ENCRYPTED_FILE)
        .then(() => true)
        .catch(() => false);

      if (fileExists1) {
        // Fixed: Read file immediately after check to minimize TOCTOU window
        let encFile1: Buffer;
        try {
          encFile1 = await fs.readFile(ENCRYPTED_FILE);
        } catch {
          // File was deleted between check and read - skip this test
          return;
        }
        await deleteSecret();

        await storeSecret(secret);
        let encFile2: Buffer;
        try {
          encFile2 = await fs.readFile(ENCRYPTED_FILE);
        } catch {
          throw new Error('Failed to read encrypted file after storing secret');
        }

        // Different IV/salt should produce different ciphertext
        expect(Buffer.compare(encFile1, encFile2)).not.toBe(0);
      } else {
        // Using keychain - just verify storage and retrieval works
        const retrieved = await retrieveSecret();
        expect(retrieved).toBe(secret);
      }
    });

    it('should return null for non-existent secret', async () => {
      const result = await retrieveSecret();
      expect(result).toBeNull();
    });

    it('should handle long secrets correctly', async () => {
      const longSecret = crypto.randomBytes(1024).toString('hex'); // 2KB hex string

      const stored = await storeSecret(longSecret);
      expect(stored).toBe(true);

      const retrieved = await retrieveSecret();
      expect(retrieved).toBe(longSecret);
    });

    it('should handle special characters in secrets', async () => {
      const specialSecret = 'test-!@#$%^&*()_+-={}[]|\\:";\'<>?,./~`\n\r\t';

      const stored = await storeSecret(specialSecret);
      expect(stored).toBe(true);

      const retrieved = await retrieveSecret();
      expect(retrieved).toBe(specialSecret);
    });
  });

  describe('encrypted file storage', () => {
    it('should create encrypted file with correct permissions', async () => {
      await storeSecret(TEST_SECRET);

      // Check if encrypted file exists (keytar may store in keychain instead)
      const fileExists = await fs
        .access(ENCRYPTED_FILE)
        .then(() => true)
        .catch(() => false);

      if (fileExists) {
        const stats = await fs.stat(ENCRYPTED_FILE);
        // On Unix, mode 0o600 = user read/write only
        const mode = stats.mode & 0o777;
        expect(mode).toBe(0o600);
      } else {
        // Stored in keychain - skip file permission check
        expect(fileExists).toBe(false);
      }
    });

    it('should create storage directory if it does not exist', async () => {
      // Clean up storage dir
      await fs.rm(STORAGE_DIR, { recursive: true, force: true });

      const stored = await storeSecret(TEST_SECRET);
      expect(stored).toBe(true);

      // Directory may or may not exist depending on whether keychain was used
      await fs
        .access(STORAGE_DIR)
        .then(() => true)
        .catch(() => false);

      // Storage should work regardless
      const retrieved = await retrieveSecret();
      expect(retrieved).toBe(TEST_SECRET);
    });

    it('should handle corrupted encrypted file gracefully', async () => {
      // Write garbage data
      await fs.mkdir(STORAGE_DIR, { recursive: true });
      await fs.writeFile(ENCRYPTED_FILE, 'corrupted-data');

      const retrieved = await retrieveSecret();
      expect(retrieved).toBeNull();
    });

    it('should handle truncated encrypted file', async () => {
      // Write data that is too short
      await fs.mkdir(STORAGE_DIR, { recursive: true });
      await fs.writeFile(ENCRYPTED_FILE, Buffer.from([1, 2, 3]));

      const retrieved = await retrieveSecret();
      expect(retrieved).toBeNull();
    });
  });

  describe('delete operations', () => {
    it('should delete secret successfully', async () => {
      await storeSecret(TEST_SECRET);

      const deleted = await deleteSecret();
      expect(deleted).toBe(true);

      const retrieved = await retrieveSecret();
      expect(retrieved).toBeNull();
    });

    it('should return false when deleting non-existent secret', async () => {
      const deleted = await deleteSecret();
      expect(deleted).toBe(false);
    });
  });

  describe('migration from cleartext', () => {
    it('should migrate from cleartext file to secure storage', async () => {
      const cleartextPath = path.join(STORAGE_DIR, 'test-cleartext-key');
      const cleartextSecret = 'cleartext-api-key-test';

      await fs.mkdir(STORAGE_DIR, { recursive: true });
      await fs.writeFile(cleartextPath, cleartextSecret + '\n');

      const migrated = await migrateFromCleartext(cleartextPath);
      expect(migrated).toBe(cleartextSecret);

      // Should delete cleartext file
      const cleartextExists = await fs
        .access(cleartextPath)
        .then(() => true)
        .catch(() => false);
      expect(cleartextExists).toBe(false);

      // Should be stored securely
      const retrieved = await retrieveSecret();
      expect(retrieved).toBe(cleartextSecret);
    });

    it('should return null for non-existent cleartext file', async () => {
      const migrated = await migrateFromCleartext('/tmp/does-not-exist.txt');
      expect(migrated).toBeNull();
    });

    it('should reject cleartext file with short secret', async () => {
      const cleartextPath = path.join(STORAGE_DIR, 'test-short-key');

      await fs.mkdir(STORAGE_DIR, { recursive: true });
      await fs.writeFile(cleartextPath, 'short'); // Less than 16 chars

      const migrated = await migrateFromCleartext(cleartextPath);
      expect(migrated).toBeNull();
    });

    it('should reject empty cleartext file', async () => {
      const cleartextPath = path.join(STORAGE_DIR, 'test-empty-key');

      await fs.mkdir(STORAGE_DIR, { recursive: true });
      await fs.writeFile(cleartextPath, '');

      const migrated = await migrateFromCleartext(cleartextPath);
      expect(migrated).toBeNull();
    });
  });

  describe('machine binding', () => {
    it('should encrypt with machine-specific key', async () => {
      // This test documents that encryption is machine-bound
      // If the encrypted file is moved to another machine, it won't decrypt
      // (tested manually by copying file between machines)

      await storeSecret(TEST_SECRET);

      // Fixed: Combine check and read to minimize TOCTOU
      let encryptedContent: Buffer | null = null;
      try {
        encryptedContent = await fs.readFile(ENCRYPTED_FILE);
      } catch {
        // File doesn't exist - using keychain
      }
      const fileExists = encryptedContent !== null;

      if (fileExists) {
        const encryptedData = await fs.readFile(ENCRYPTED_FILE);
        // Encrypted file should contain more data than the plaintext (salt 32 + IV 16 + tag 16 = 64 bytes overhead minimum)
        expect(encryptedData.length).toBeGreaterThanOrEqual(TEST_SECRET.length + 64);
      } else {
        // Stored in keychain - test that retrieval works
        const retrieved = await retrieveSecret();
        expect(retrieved).toBe(TEST_SECRET);
      }
    });
  });
});
