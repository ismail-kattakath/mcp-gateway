/**
 * LDAP Client Wrapper
 *
 * Manages LDAP connections with connection pooling, health checks,
 * and automatic reconnection.
 *
 * Related: Epic #20 (LDAP/AD Integration)
 */

import ldap, { type Client, type SearchOptions, type SearchEntry } from 'ldapjs';
import { EventEmitter } from 'events';
import logger from '../../../logging/logger.js';
import { sanitizeString } from '../../../logging/sanitizer.js';
import type { LDAPProviderPublic } from '../../../storage/models/ldap-providers.js';

/**
 * Connection pool for LDAP clients
 */
export class LDAPConnectionPool extends EventEmitter {
  private provider: LDAPProviderPublic;
  private pool: Client[] = [];
  private availableConnections: Client[] = [];
  private destroyed = false;

  constructor(provider: LDAPProviderPublic) {
    super();
    this.provider = provider;
  }

  /**
   * Initialize connection pool
   */
  async initialize(): Promise<void> {
    logger.info('Initializing LDAP connection pool', {
      provider: sanitizeString(this.provider.name),
      poolSize: this.provider.pool_size,
    });

    for (let i = 0; i < this.provider.pool_size; i++) {
      const client = await this.createConnection();
      this.pool.push(client);
      this.availableConnections.push(client);
    }

    logger.info('LDAP connection pool initialized', {
      provider: sanitizeString(this.provider.name),
    });
  }

  /**
   * Create a new LDAP connection
   */
  private async createConnection(): Promise<Client> {
    return new Promise((resolve, reject) => {
      const client = ldap.createClient({
        url: this.provider.url,
        timeout: this.provider.timeout,
        connectTimeout: this.provider.timeout,
        tlsOptions: this.provider.tls_enabled
          ? {
              rejectUnauthorized: this.provider.tls_reject_unauthorized,
            }
          : undefined,
      });

      // Handle connection
      client.on('connect', () => {
        logger.debug('LDAP connection established', {
          provider: sanitizeString(this.provider.name),
        });
        resolve(client);
      });

      // Handle errors
      client.on('error', (error: Error) => {
        logger.error('LDAP connection error', {
          provider: sanitizeString(this.provider.name),
          error: sanitizeString(error.message),
        });
        reject(error);
      });

      // Handle disconnection
      client.on('close', () => {
        logger.debug('LDAP connection closed', {
          provider: sanitizeString(this.provider.name),
        });
      });
    });
  }

  /**
   * Get a connection from the pool
   */
  async getConnection(): Promise<Client> {
    if (this.destroyed) {
      throw new Error('Connection pool has been destroyed');
    }

    // Wait for available connection
    while (this.availableConnections.length === 0) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    const client = this.availableConnections.pop();

    if (!client) {
      throw new Error('No available connections in pool');
    }

    return client;
  }

  /**
   * Return a connection to the pool
   */
  releaseConnection(client: Client): void {
    if (!this.destroyed && this.pool.includes(client)) {
      this.availableConnections.push(client);
    }
  }

  /**
   * Destroy the connection pool
   */
  async destroy(): Promise<void> {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;

    logger.info('Destroying LDAP connection pool', {
      provider: sanitizeString(this.provider.name),
    });

    for (const client of this.pool) {
      try {
        await this.unbindClient(client);
        client.destroy();
      } catch (error) {
        // Ignore errors during cleanup
      }
    }

    this.pool = [];
    this.availableConnections = [];

    logger.info('LDAP connection pool destroyed', {
      provider: sanitizeString(this.provider.name),
    });
  }

  /**
   * Unbind client connection
   */
  private unbindClient(client: Client): Promise<void> {
    return new Promise((resolve, reject) => {
      client.unbind((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Health check - test connection
   */
  async healthCheck(): Promise<boolean> {
    try {
      const client = await this.getConnection();

      try {
        // Bind with service account
        if (this.provider.bind_dn && this.provider.bind_password) {
          await this.bind(client, this.provider.bind_dn, this.provider.bind_password);
        }

        return true;
      } finally {
        this.releaseConnection(client);
      }
    } catch (error) {
      const err = error as Error;
      logger.error('LDAP health check failed', {
        provider: sanitizeString(this.provider.name),
        error: sanitizeString(err.message),
      });
      return false;
    }
  }

  /**
   * Bind to LDAP server
   */
  private bind(client: Client, dn: string, password: string): Promise<void> {
    return new Promise((resolve, reject) => {
      client.bind(dn, password, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }
}

/**
 * LDAP Client for authentication and user search
 */
export class LDAPClient {
  private provider: LDAPProviderPublic;
  private pool: LDAPConnectionPool;

  constructor(provider: LDAPProviderPublic) {
    this.provider = provider;
    this.pool = new LDAPConnectionPool(provider);
  }

  /**
   * Initialize the client
   */
  async initialize(): Promise<void> {
    await this.pool.initialize();
  }

  /**
   * Authenticate user with username and password
   *
   * @param username - Username
   * @param password - Password
   * @returns User DN and attributes
   */
  async authenticate(
    username: string,
    password: string
  ): Promise<{ dn: string; attributes: Record<string, any> }> {
    const client = await this.pool.getConnection();

    try {
      // Bind with service account if configured
      if (this.provider.bind_dn && this.provider.bind_password) {
        await this.bind(client, this.provider.bind_dn, this.provider.bind_password);
      }

      // Search for user entry
      const searchFilter = this.provider.search_filter.replace('{{username}}', sanitizeUsername(username));
      const searchResult = await this.search(client, this.provider.base_dn, searchFilter);

      if (searchResult.length === 0) {
        throw new Error('User not found');
      }

      if (searchResult.length > 1) {
        throw new Error('Multiple users found');
      }

      const userEntry = searchResult[0];
      const userDn = userEntry.dn;

      // Authenticate by binding with user credentials
      await this.bind(client, userDn, password);

      // Extract attributes
      const attributes = this.extractAttributes(userEntry);

      logger.info('LDAP authentication successful', {
        provider: sanitizeString(this.provider.name),
        username: sanitizeString(username),
        dn: sanitizeString(userDn),
      });

      return { dn: userDn, attributes };
    } catch (error) {
      const err = error as Error;
      logger.error('LDAP authentication failed', {
        provider: sanitizeString(this.provider.name),
        username: sanitizeString(username),
        error: sanitizeString(err.message),
      });
      throw error;
    } finally {
      this.pool.releaseConnection(client);
    }
  }

  /**
   * Search for user entry
   *
   * @param username - Username
   * @returns User entry
   */
  async searchUser(username: string): Promise<{ dn: string; attributes: Record<string, any> } | null> {
    const client = await this.pool.getConnection();

    try {
      // Bind with service account
      if (this.provider.bind_dn && this.provider.bind_password) {
        await this.bind(client, this.provider.bind_dn, this.provider.bind_password);
      }

      // Search for user entry
      const searchFilter = this.provider.search_filter.replace('{{username}}', sanitizeUsername(username));
      const searchResult = await this.search(client, this.provider.base_dn, searchFilter);

      if (searchResult.length === 0) {
        return null;
      }

      const userEntry = searchResult[0];
      const userDn = userEntry.dn;
      const attributes = this.extractAttributes(userEntry);

      return { dn: userDn, attributes };
    } finally {
      this.pool.releaseConnection(client);
    }
  }

  /**
   * Bind to LDAP server
   */
  private bind(client: Client, dn: string, password: string): Promise<void> {
    return new Promise((resolve, reject) => {
      client.bind(dn, password, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Search LDAP directory
   */
  private search(client: Client, baseDn: string, filter: string): Promise<SearchEntry[]> {
    return new Promise((resolve, reject) => {
      const options: SearchOptions = {
        scope: 'sub',
        filter,
      };

      const entries: SearchEntry[] = [];

      client.search(baseDn, options, (error, res) => {
        if (error) {
          reject(error);
          return;
        }

        res.on('searchEntry', (entry) => {
          entries.push(entry);
        });

        res.on('error', (err) => {
          reject(err);
        });

        res.on('end', () => {
          resolve(entries);
        });
      });
    });
  }

  /**
   * Extract attributes from search entry
   */
  private extractAttributes(entry: SearchEntry): Record<string, any> {
    const attributes: Record<string, any> = {};
    const mapping = this.provider.attribute_mapping;

    // Extract mapped attributes
    for (const [userField, ldapAttr] of Object.entries(mapping)) {
      if (ldapAttr && entry.pojo.attributes) {
        const attr = entry.pojo.attributes.find((a: any) => a.type === ldapAttr);
        if (attr && attr.values && attr.values.length > 0) {
          // Handle multi-valued attributes (e.g., memberOf)
          attributes[userField] = attr.values.length === 1 ? attr.values[0] : attr.values;
        }
      }
    }

    // Always include DN
    attributes.dn = entry.dn;

    return attributes;
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    return this.pool.healthCheck();
  }

  /**
   * Destroy the client
   */
  async destroy(): Promise<void> {
    await this.pool.destroy();
  }
}

/**
 * Sanitize username for LDAP query
 */
function sanitizeUsername(username: string): string {
  // Escape LDAP special characters to prevent injection
  return username.replace(/[*()\\]/g, (char) => {
    return '\\' + char.charCodeAt(0).toString(16).padStart(2, '0');
  });
}

export default LDAPClient;
