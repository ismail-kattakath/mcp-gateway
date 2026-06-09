/**
 * Domain Manager
 *
 * Manages custom domains for MCP Gateway with automatic TLS via Caddy.
 * Domains are stored in SQLite (future) and synced to Caddyfile.
 */

import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import logger from '../logging/logger.js';
import { sanitizePath, sanitizeString } from '../logging/sanitizer.js';
import { CaddyClient, generateDomainBlock, generateHttpRedirect } from './caddy.js';
import {
  isValidDomain,
  isValidWildcardDomain,
  isLocalDomain,
  normalizeDomain,
} from './validation.js';

export interface Domain {
  id: string;
  domain: string;
  enabled: boolean;
  tlsEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  certificateIssued?: Date;
  certificateExpiry?: Date;
}

export interface DomainOptions {
  tlsEnabled?: boolean;
  tlsProtocols?: string[];
  tlsCiphers?: string[];
  upstreamUrl?: string;
  securityHeaders?: boolean;
}

/**
 * DomainManager class
 *
 * Manages domains and synchronizes them with Caddy reverse proxy
 */
export class DomainManager {
  private domains: Map<string, Domain> = new Map();
  private caddyClient: CaddyClient;
  private caddyfilePath: string;
  private caddyfileTemplatePath: string;

  constructor(
    options: {
      caddyAdminUrl?: string;
      caddyfilePath?: string;
      caddyfileTemplatePath?: string;
    } = {}
  ) {
    this.caddyClient = new CaddyClient({
      adminUrl: options.caddyAdminUrl || process.env.CADDY_ADMIN_URL || 'http://localhost:2019',
    });

    this.caddyfilePath =
      options.caddyfilePath ||
      process.env.CADDYFILE_PATH ||
      path.resolve(process.cwd(), '../caddy/Caddyfile');

    this.caddyfileTemplatePath =
      options.caddyfileTemplatePath ||
      process.env.CADDYFILE_TEMPLATE_PATH ||
      path.resolve(process.cwd(), '../caddy/Caddyfile.template');

    const tempDir = path.resolve(os.tmpdir());
    if (path.resolve(this.caddyfilePath).startsWith(`${tempDir}${path.sep}`)) {
      throw new Error('Insecure caddyfilePath: paths under OS temp directory are not allowed');
    }
    if (path.resolve(this.caddyfileTemplatePath).startsWith(`${tempDir}${path.sep}`)) {
      throw new Error('Insecure caddyfileTemplatePath: paths under OS temp directory are not allowed');
    }

    logger.info('DomainManager initialized', {
      caddyfilePath: sanitizePath(this.caddyfilePath),
      templatePath: sanitizePath(this.caddyfileTemplatePath),
    });
  }

  /**
   * Add a new domain
   */
  async addDomain(domain: string, options: DomainOptions = {}): Promise<Domain> {
    // Normalize and validate
    const normalized = normalizeDomain(domain);

    if (!isValidDomain(normalized) && !isValidWildcardDomain(normalized)) {
      throw new Error(`Invalid domain format: ${sanitizeString(domain)}`);
    }

    // Check if already exists
    if (this.domains.has(normalized)) {
      throw new Error(`Domain already exists: ${sanitizeString(normalized)}`);
    }

    // Warn for local domains
    if (isLocalDomain(normalized)) {
      const safeDomainForLog = sanitizeString(normalized);
      logger.warn('Adding local domain (TLS may not work)', { domain: safeDomainForLog });
    }

    // Create domain object
    const newDomain: Domain = {
      id: this.generateDomainId(normalized),
      domain: normalized,
      enabled: true,
      tlsEnabled: options.tlsEnabled !== false, // Default true
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Add to in-memory store
    this.domains.set(normalized, newDomain);

    logger.info('Domain added', { domain: sanitizeString(normalized) });

    // Regenerate Caddyfile and reload
    await this.syncCaddyfile();

    return newDomain;
  }

  /**
   * Remove a domain
   */
  async removeDomain(domain: string): Promise<void> {
    const normalized = normalizeDomain(domain);

    if (!this.domains.has(normalized)) {
      throw new Error(`Domain not found: ${sanitizeString(normalized)}`);
    }

    this.domains.delete(normalized);

    logger.info(`Domain removed: ${sanitizeString(normalized)}`);

    // Regenerate Caddyfile and reload
    await this.syncCaddyfile();
  }

  /**
   * Get domain by name
   */
  getDomain(domain: string): Domain | undefined {
    const normalized = normalizeDomain(domain);
    return this.domains.get(normalized);
  }

  /**
   * List all domains
   */
  listDomains(): Domain[] {
    return Array.from(this.domains.values());
  }

  /**
   * Update domain options
   */
  async updateDomain(domain: string, options: Partial<DomainOptions>): Promise<Domain> {
    const normalized = normalizeDomain(domain);
    const existingDomain = this.domains.get(normalized);

    if (!existingDomain) {
      throw new Error(`Domain not found: ${sanitizeString(normalized)}`);
    }

    // Update domain
    existingDomain.updatedAt = new Date();

    if (options.tlsEnabled !== undefined) {
      existingDomain.tlsEnabled = options.tlsEnabled;
    }

    this.domains.set(normalized, existingDomain);

    logger.info('Domain updated', { domain: sanitizeString(normalized) });

    // Regenerate Caddyfile and reload
    await this.syncCaddyfile();

    return existingDomain;
  }

  /**
   * Enable/disable a domain
   */
  async toggleDomain(domain: string, enabled: boolean): Promise<Domain> {
    const normalized = normalizeDomain(domain);
    const existingDomain = this.domains.get(normalized);

    if (!existingDomain) {
      throw new Error(`Domain not found: ${sanitizeString(normalized)}`);
    }

    existingDomain.enabled = enabled;
    existingDomain.updatedAt = new Date();

    this.domains.set(normalized, existingDomain);

    logger.info(`Domain ${enabled ? 'enabled' : 'disabled'}`);

    // Regenerate Caddyfile and reload
    await this.syncCaddyfile();

    return existingDomain;
  }

  /**
   * Synchronize domains to Caddyfile and reload Caddy
   */
  private async syncCaddyfile(): Promise<void> {
    try {
      // Read template
      const template = await fs.readFile(this.caddyfileTemplatePath, 'utf-8');

      // Generate domain blocks
      const domainBlocks = Array.from(this.domains.values())
        .filter((d) => d.enabled)
        .map((d) =>
          generateDomainBlock(d.domain, {
            tlsEnabled: d.tlsEnabled,
            tlsProtocols: ['tls1.3'],
            securityHeaders: true,
          })
        )
        .join('\n');

      // Add HTTP redirect if any domains have TLS enabled
      const hasTlsDomains = Array.from(this.domains.values()).some(
        (d) => d.enabled && d.tlsEnabled
      );

      const httpRedirect = hasTlsDomains ? generateHttpRedirect() : '';

      // Combine template + custom domains
      const caddyfile = `${template}\n\n${httpRedirect}\n${domainBlocks}`;

      // Validate before writing
      const validation = this.caddyClient.validateCaddyfile(caddyfile);
      if (!validation.valid) {
        throw new Error(`Invalid Caddyfile: ${validation.errors.join(', ')}`);
      }

      // Write to file atomically using a securely created temp file in the same directory
      const caddyfileDir = path.dirname(this.caddyfilePath);
      const tmpPath = path.join(
        caddyfileDir,
        `.Caddyfile.tmp-${process.pid}-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`
      );

      let tmpHandle: Awaited<ReturnType<typeof fs.open>> | null = null;
      try {
        tmpHandle = await fs.open(tmpPath, 'wx', 0o600);
        await tmpHandle.writeFile(caddyfile, 'utf-8');
        await tmpHandle.close();
        tmpHandle = null;
        await fs.rename(tmpPath, this.caddyfilePath);
      } finally {
        if (tmpHandle) {
          await tmpHandle.close().catch(() => {});
        }
        await fs.unlink(tmpPath).catch(() => {});
      }

      logger.info('Caddyfile updated', {
        path: sanitizePath(this.caddyfilePath),
        domains: this.domains.size,
      });

      // Reload Caddy
      await this.caddyClient.reload(caddyfile);

      logger.info('Caddy reloaded successfully');
    } catch (error: any) {
      logger.error('Failed to sync Caddyfile', { error: error.message });
      throw new Error(`Failed to sync Caddyfile: ${error.message}`);
    }
  }

  /**
   * Check Caddy health
   */
  async checkCaddyHealth(): Promise<boolean> {
    return this.caddyClient.ping();
  }

  /**
   * Get certificate info from Caddy
   */
  async getCertificates(): Promise<any[]> {
    return this.caddyClient.getCertificates();
  }

  /**
   * Generate unique domain ID
   */
  private generateDomainId(domain: string): string {
    return `domain_${domain.replace(/[^a-z0-9]/g, '_')}_${Date.now()}`;
  }

  /**
   * Load domains from SQLite (future implementation)
   */
  private async loadDomainsFromDatabase(): Promise<void> {
    // TODO: Load from SQLite when storage layer is migrated
    logger.info('Domain persistence not yet implemented (SQLite migration pending)');
  }

  /**
   * Save domain to SQLite (future implementation)
   */
  private async saveDomainToDatabase(domain: Domain): Promise<void> {
    // TODO: Save to SQLite when storage layer is migrated
    logger.debug(`Domain save to DB deferred: ${sanitizeString(domain.domain)}`);
  }

  /**
   * Delete domain from SQLite (future implementation)
   */
  private async deleteDomainFromDatabase(domainName: string): Promise<void> {
    // TODO: Delete from SQLite when storage layer is migrated
    logger.debug(`Domain delete from DB deferred: ${sanitizeString(domainName)}`);
  }
}

/**
 * Singleton instance (lazy-loaded)
 */
let domainManagerInstance: DomainManager | null = null;

export function getDomainManager(): DomainManager {
  if (!domainManagerInstance) {
    domainManagerInstance = new DomainManager();
  }
  return domainManagerInstance;
}

export function initDomainManager(options?: {
  caddyAdminUrl?: string;
  caddyfilePath?: string;
  caddyfileTemplatePath?: string;
}): DomainManager {
  domainManagerInstance = new DomainManager(options);
  return domainManagerInstance;
}
