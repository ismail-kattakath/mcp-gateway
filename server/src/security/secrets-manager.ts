/**
 * Secrets Manager
 *
 * Centralized secrets management with support for multiple providers:
 * - System keychain (macOS Keychain, Linux libsecret, Windows Credential Manager)
 * - HashiCorp Vault
 * - AWS Secrets Manager
 * - Azure Key Vault
 *
 * Priority order: Vault > AWS > Azure > Keychain > Environment variables
 */

import logger, { sanitizeString } from '../logging/logger.js';
import { SecureStorage } from './secure-storage.js';

/**
 * Abstract secret provider interface
 */
export interface SecretProvider {
  name: string;
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(): Promise<string[]>;
}

/**
 * System keychain provider (uses existing SecureStorage)
 */
export class KeychainProvider implements SecretProvider {
  name = 'keychain';
  private storage: SecureStorage;

  constructor() {
    this.storage = new SecureStorage();
  }

  async get(key: string): Promise<string | null> {
    try {
      return await this.storage.getPassword('mcp-gateway', key);
    } catch (error) {
      logger.debug('Failed to get secret from keychain', {
        key: sanitizeString(key),
        error: (error as Error).message,
      });
      return null;
    }
  }

  async set(key: string, value: string): Promise<void> {
    await this.storage.setPassword('mcp-gateway', key, value);
  }

  async delete(key: string): Promise<void> {
    await this.storage.deletePassword('mcp-gateway', key);
  }

  async list(): Promise<string[]> {
    // Keychain doesn't support listing - return empty array
    return [];
  }
}

/**
 * HashiCorp Vault provider
 */
export class VaultProvider implements SecretProvider {
  name = 'vault';
  private client: any; // node-vault client
  private mountPath: string;

  constructor(endpoint: string, token: string, mountPath = 'secret') {
    this.mountPath = mountPath;

    // Lazy load node-vault to avoid requiring it if not used
    import('node-vault')
      .then((vault) => {
        this.client = vault.default({
          endpoint,
          token,
        });
        logger.info('Vault provider initialized', { endpoint, mountPath });
      })
      .catch((error) => {
        logger.error('Failed to initialize Vault provider', { error: (error as Error).message });
      });
  }

  async get(key: string): Promise<string | null> {
    if (!this.client) {
      return null;
    }

    try {
      const result = await this.client.read(`${this.mountPath}/data/${key}`);
      return result?.data?.data?.value ?? null;
    } catch (error) {
      logger.debug('Failed to get secret from Vault', {
        key: sanitizeString(key),
        error: (error as Error).message,
      });
      return null;
    }
  }

  async set(key: string, value: string): Promise<void> {
    if (!this.client) {
      throw new Error('Vault client not initialized');
    }

    await this.client.write(`${this.mountPath}/data/${key}`, {
      data: { value },
    });
  }

  async delete(key: string): Promise<void> {
    if (!this.client) {
      throw new Error('Vault client not initialized');
    }

    await this.client.delete(`${this.mountPath}/data/${key}`);
  }

  async list(): Promise<string[]> {
    if (!this.client) {
      return [];
    }

    try {
      const result = await this.client.list(`${this.mountPath}/metadata`);
      return result?.data?.keys ?? [];
    } catch {
      return [];
    }
  }
}

/**
 * AWS Secrets Manager provider
 */
export class AWSSecretsProvider implements SecretProvider {
  name = 'aws';
  private client: any; // AWS SDK client
  private region: string;

  constructor(region = 'us-east-1') {
    this.region = region;

    // Lazy load AWS SDK to avoid requiring it if not used
    import('@aws-sdk/client-secrets-manager')
      .then((awsModule) => {
        this.client = new awsModule.SecretsManagerClient({ region });
        logger.info('AWS Secrets Manager provider initialized', { region });
      })
      .catch((error) => {
        logger.error('Failed to initialize AWS Secrets Manager provider', {
          error: (error as Error).message,
        });
      });
  }

  async get(key: string): Promise<string | null> {
    if (!this.client) {
      return null;
    }

    try {
      const awsModule = await import('@aws-sdk/client-secrets-manager');
      const command = new awsModule.GetSecretValueCommand({
        SecretId: key,
      });
      const result = await this.client.send(command);
      return result.SecretString ?? null;
    } catch (error) {
      logger.debug('Failed to get secret from AWS Secrets Manager', {
        key: sanitizeString(key),
        error: (error as Error).message,
      });
      return null;
    }
  }

  async set(key: string, value: string): Promise<void> {
    if (!this.client) {
      throw new Error('AWS Secrets Manager client not initialized');
    }

    const awsModule = await import('@aws-sdk/client-secrets-manager');

    try {
      // Try to update existing secret
      const updateCommand = new awsModule.UpdateSecretCommand({
        SecretId: key,
        SecretString: value,
      });
      await this.client.send(updateCommand);
    } catch {
      // If update fails, create new secret
      const createCommand = new awsModule.CreateSecretCommand({
        Name: key,
        SecretString: value,
      });
      await this.client.send(createCommand);
    }
  }

  async delete(key: string): Promise<void> {
    if (!this.client) {
      throw new Error('AWS Secrets Manager client not initialized');
    }

    const awsModule = await import('@aws-sdk/client-secrets-manager');
    const command = new awsModule.DeleteSecretCommand({
      SecretId: key,
      ForceDeleteWithoutRecovery: true,
    });
    await this.client.send(command);
  }

  async list(): Promise<string[]> {
    if (!this.client) {
      return [];
    }

    try {
      const awsModule = await import('@aws-sdk/client-secrets-manager');
      const command = new awsModule.ListSecretsCommand({});
      const result = await this.client.send(command);
      return result.SecretList?.map((s: { Name?: string }) => s.Name ?? '') ?? [];
    } catch {
      return [];
    }
  }
}

/**
 * Azure Key Vault provider
 */
export class AzureKeyVaultProvider implements SecretProvider {
  name = 'azure';
  private client: any; // Azure SDK client
  private vaultUrl: string;

  constructor(vaultUrl: string) {
    this.vaultUrl = vaultUrl;

    // Lazy load Azure SDK to avoid requiring it if not used
    Promise.all([import('@azure/keyvault-secrets'), import('@azure/identity')])
      .then(([secretsModule, identityModule]) => {
        const credential = new identityModule.DefaultAzureCredential();
        this.client = new secretsModule.SecretClient(vaultUrl, credential);
        logger.info('Azure Key Vault provider initialized', { vaultUrl });
      })
      .catch((error) => {
        logger.error('Failed to initialize Azure Key Vault provider', {
          error: (error as Error).message,
        });
      });
  }

  async get(key: string): Promise<string | null> {
    if (!this.client) {
      return null;
    }

    try {
      const secret = await this.client.getSecret(key);
      return secret.value ?? null;
    } catch (error) {
      logger.debug('Failed to get secret from Azure Key Vault', {
        key: sanitizeString(key),
        error: (error as Error).message,
      });
      return null;
    }
  }

  async set(key: string, value: string): Promise<void> {
    if (!this.client) {
      throw new Error('Azure Key Vault client not initialized');
    }

    await this.client.setSecret(key, value);
  }

  async delete(key: string): Promise<void> {
    if (!this.client) {
      throw new Error('Azure Key Vault client not initialized');
    }

    const poller = await this.client.beginDeleteSecret(key);
    await poller.pollUntilDone();
  }

  async list(): Promise<string[]> {
    if (!this.client) {
      return [];
    }

    try {
      const secrets: string[] = [];
      for await (const properties of this.client.listPropertiesOfSecrets()) {
        secrets.push(properties.name);
      }
      return secrets;
    } catch {
      return [];
    }
  }
}

/**
 * Secrets Manager
 * Cascades through multiple providers to resolve secrets
 */
export class SecretsManager {
  private providers: SecretProvider[] = [];

  constructor() {
    // Initialize keychain provider by default
    this.providers.push(new KeychainProvider());
  }

  /**
   * Add a Vault provider
   */
  addVaultProvider(endpoint: string, token: string, mountPath = 'secret'): void {
    this.providers.unshift(new VaultProvider(endpoint, token, mountPath));
    logger.info('Added Vault provider', { endpoint, mountPath });
  }

  /**
   * Add AWS Secrets Manager provider
   */
  addAWSProvider(region = 'us-east-1'): void {
    this.providers.unshift(new AWSSecretsProvider(region));
    logger.info('Added AWS Secrets Manager provider', { region });
  }

  /**
   * Add Azure Key Vault provider
   */
  addAzureProvider(vaultUrl: string): void {
    this.providers.unshift(new AzureKeyVaultProvider(vaultUrl));
    logger.info('Added Azure Key Vault provider', { vaultUrl });
  }

  /**
   * Get a secret by key (cascades through providers)
   */
  async get(key: string): Promise<string | null> {
    for (const provider of this.providers) {
      try {
        const value = await provider.get(key);
        if (value !== null) {
          logger.debug('Secret retrieved', {
            key: sanitizeString(key),
            provider: provider.name,
          });
          return value;
        }
      } catch (error) {
        logger.debug('Provider failed to get secret', {
          key: sanitizeString(key),
          provider: provider.name,
          error: (error as Error).message,
        });
      }
    }

    // Fallback to environment variable
    const envValue = process.env[key];
    if (envValue) {
      logger.debug('Secret retrieved from environment', { key: sanitizeString(key) });
      return envValue;
    }

    return null;
  }

  /**
   * Set a secret (uses first available provider)
   */
  async set(key: string, value: string): Promise<void> {
    if (this.providers.length === 0) {
      throw new Error('No secret providers available');
    }

    const provider = this.providers[0];
    await provider.set(key, value);
    logger.info('Secret stored', {
      key: sanitizeString(key),
      provider: provider.name,
    });
  }

  /**
   * Delete a secret (from all providers)
   */
  async delete(key: string): Promise<void> {
    for (const provider of this.providers) {
      try {
        await provider.delete(key);
        logger.info('Secret deleted', {
          key: sanitizeString(key),
          provider: provider.name,
        });
      } catch (error) {
        logger.debug('Provider failed to delete secret', {
          key: sanitizeString(key),
          provider: provider.name,
          error: (error as Error).message,
        });
      }
    }
  }

  /**
   * List all secret keys (from all providers)
   */
  async list(): Promise<string[]> {
    const allKeys = new Set<string>();

    for (const provider of this.providers) {
      try {
        const keys = await provider.list();
        keys.forEach((key) => allKeys.add(key));
      } catch (error) {
        logger.debug('Provider failed to list secrets', {
          provider: provider.name,
          error: (error as Error).message,
        });
      }
    }

    return Array.from(allKeys);
  }

  /**
   * Resolve environment variable template with secrets
   * Supports: ${SECRET:key} for secrets manager, ${VAR} for env vars
   */
  async resolveEnv(template: string): Promise<string> {
    let resolved = template;

    // Replace ${SECRET:key} with secrets manager lookup
    const secretPattern = /\$\{SECRET:([A-Z0-9_]+)\}/g;
    const secretMatches = [...template.matchAll(secretPattern)];

    for (const match of secretMatches) {
      const key = match[1];
      const value = await this.get(key);
      if (value !== null) {
        resolved = resolved.replace(match[0], value);
      } else {
        logger.warn('Secret not found', { key: sanitizeString(key) });
      }
    }

    // Replace ${VAR} with environment variables
    const envPattern = /\$\{([A-Z0-9_]+)\}/g;
    resolved = resolved.replace(envPattern, (match, key) => {
      return process.env[key] ?? match;
    });

    return resolved;
  }

  /**
   * Resolve all environment variables in an object
   */
  async resolveEnvObject(env: Record<string, string>): Promise<Record<string, string>> {
    const resolved: Record<string, string> = {};

    for (const [key, value] of Object.entries(env)) {
      resolved[key] = await this.resolveEnv(value);
    }

    return resolved;
  }
}

/**
 * Singleton instance
 */
export const secretsManager = new SecretsManager();

export default secretsManager;
