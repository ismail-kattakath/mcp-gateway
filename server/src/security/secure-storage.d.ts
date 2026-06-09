/**
 * Secure Storage for API Keys
 *
 * Industry-standard approach:
 * 1. Primary: System keychain (macOS Keychain, Linux libsecret, Windows Credential Manager)
 * 2. Fallback: AES-256-GCM encrypted file with machine-derived key (for headless servers)
 *
 * Security properties:
 * - Keychain: OS-level encryption, process isolation, audit trails
 * - Encrypted file: Key derived from machine ID + salt via PBKDF2, AES-256-GCM authenticated encryption
 * - No cleartext keys on disk
 * - Secure memory handling (immediate wipe after use where possible)
 */
/**
 * Store secret securely (tries keychain first, falls back to encrypted file).
 * @param secret - Secret to store
 * @param accountName - Account name for keychain (default: 'api-key')
 */
export declare function storeSecret(secret: string, accountName?: string): Promise<boolean>;
/**
 * Retrieve secret securely (tries keychain first, falls back to encrypted file).
 * @param accountName - Account name for keychain (default: 'api-key')
 */
export declare function retrieveSecret(accountName?: string): Promise<string | null>;
/**
 * Delete secret from all storage locations.
 */
export declare function deleteSecret(): Promise<boolean>;
/**
 * Migrate from old cleartext file to secure storage.
 * @param oldFilePath - Path to old cleartext file
 */
export declare function migrateFromCleartext(oldFilePath: string): Promise<string | null>;
/**
 * SecureStorage class wrapper for keychain operations
 */
export declare class SecureStorage {
  setPassword(service: string, account: string, password: string): Promise<void>;
  getPassword(service: string, account: string): Promise<string | null>;
  deletePassword(service: string, account: string): Promise<void>;
}
declare const _default: {
  storeSecret: typeof storeSecret;
  retrieveSecret: typeof retrieveSecret;
  deleteSecret: typeof deleteSecret;
  migrateFromCleartext: typeof migrateFromCleartext;
  SecureStorage: typeof SecureStorage;
};
export default _default;
//# sourceMappingURL=secure-storage.d.ts.map
