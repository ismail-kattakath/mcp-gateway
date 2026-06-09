/**
 * Domain Manager tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DomainManager } from '../manager.js';

// Mock Caddy client
vi.mock('../caddy.js', () => ({
  CaddyClient: vi.fn().mockImplementation(() => ({
    ping: vi.fn().mockResolvedValue(true),
    reload: vi.fn().mockResolvedValue(undefined),
    getConfig: vi.fn().mockResolvedValue({}),
    getCertificates: vi.fn().mockResolvedValue([]),
    validateCaddyfile: vi.fn().mockReturnValue({ valid: true, errors: [] }),
  })),
  generateDomainBlock: vi.fn().mockReturnValue('# Mock domain block\nexample.com {\n}\n'),
  generateHttpRedirect: vi.fn().mockReturnValue('# HTTP redirect\nhttp:// {\n}\n'),
}));

// Mock file system
vi.mock('fs/promises', () => ({
  default: {
    readFile: vi.fn().mockResolvedValue('# Mock Caddyfile template\n'),
    writeFile: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock logger
vi.mock('../logging/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('DomainManager', () => {
  let manager: DomainManager;

  beforeEach(() => {
    manager = new DomainManager({
      caddyAdminUrl: 'http://localhost:2019',
      caddyfilePath: '/tmp/Caddyfile',
      caddyfileTemplatePath: '/tmp/Caddyfile.template',
    });
  });

  describe('addDomain', () => {
    it('should add a valid domain', async () => {
      const domain = await manager.addDomain('example.com');

      expect(domain.domain).toBe('example.com');
      expect(domain.enabled).toBe(true);
      expect(domain.tlsEnabled).toBe(true);
      expect(domain.createdAt).toBeInstanceOf(Date);
    });

    it('should normalize domain before adding', async () => {
      const domain = await manager.addDomain('EXAMPLE.COM');

      expect(domain.domain).toBe('example.com');
    });

    it('should reject invalid domain format', async () => {
      await expect(manager.addDomain('invalid domain')).rejects.toThrow('Invalid domain format');
    });

    it('should reject duplicate domains', async () => {
      await manager.addDomain('example.com');
      await expect(manager.addDomain('example.com')).rejects.toThrow('already exists');
    });

    it('should handle wildcard domains', async () => {
      const domain = await manager.addDomain('*.example.com');

      expect(domain.domain).toBe('*.example.com');
    });

    it('should respect tlsEnabled option', async () => {
      const domain = await manager.addDomain('example.com', { tlsEnabled: false });

      expect(domain.tlsEnabled).toBe(false);
    });
  });

  describe('removeDomain', () => {
    it('should remove an existing domain', async () => {
      await manager.addDomain('example.com');
      await manager.removeDomain('example.com');

      const domain = manager.getDomain('example.com');
      expect(domain).toBeUndefined();
    });

    it('should reject removing non-existent domain', async () => {
      await expect(manager.removeDomain('nonexistent.com')).rejects.toThrow('not found');
    });
  });

  describe('getDomain', () => {
    it('should return domain if exists', async () => {
      await manager.addDomain('example.com');
      const domain = manager.getDomain('example.com');

      expect(domain).toBeDefined();
      expect(domain?.domain).toBe('example.com');
    });

    it('should return undefined if not exists', () => {
      const domain = manager.getDomain('nonexistent.com');

      expect(domain).toBeUndefined();
    });

    it('should normalize domain before lookup', async () => {
      await manager.addDomain('example.com');
      const domain = manager.getDomain('EXAMPLE.COM');

      expect(domain).toBeDefined();
      expect(domain?.domain).toBe('example.com');
    });
  });

  describe('listDomains', () => {
    it('should return empty array initially', () => {
      const domains = manager.listDomains();

      expect(domains).toEqual([]);
    });

    it('should return all domains', async () => {
      await manager.addDomain('example1.com');
      await manager.addDomain('example2.com');
      await manager.addDomain('example3.com');

      const domains = manager.listDomains();

      expect(domains).toHaveLength(3);
      expect(domains.map((d) => d.domain)).toEqual([
        'example1.com',
        'example2.com',
        'example3.com',
      ]);
    });
  });

  describe('updateDomain', () => {
    it('should update domain options', async () => {
      await manager.addDomain('example.com', { tlsEnabled: true });

      const updated = await manager.updateDomain('example.com', { tlsEnabled: false });

      expect(updated.tlsEnabled).toBe(false);
      expect(updated.updatedAt).toBeInstanceOf(Date);
    });

    it('should reject updating non-existent domain', async () => {
      await expect(manager.updateDomain('nonexistent.com', { tlsEnabled: false })).rejects.toThrow(
        'not found'
      );
    });
  });

  describe('toggleDomain', () => {
    it('should enable domain', async () => {
      await manager.addDomain('example.com');
      await manager.toggleDomain('example.com', false);

      let domain = manager.getDomain('example.com');
      expect(domain?.enabled).toBe(false);

      await manager.toggleDomain('example.com', true);

      domain = manager.getDomain('example.com');
      expect(domain?.enabled).toBe(true);
    });

    it('should disable domain', async () => {
      await manager.addDomain('example.com');
      await manager.toggleDomain('example.com', false);

      const domain = manager.getDomain('example.com');
      expect(domain?.enabled).toBe(false);
    });

    it('should reject toggling non-existent domain', async () => {
      await expect(manager.toggleDomain('nonexistent.com', true)).rejects.toThrow('not found');
    });
  });

  describe('checkCaddyHealth', () => {
    it('should return true if Caddy is healthy', async () => {
      const healthy = await manager.checkCaddyHealth();

      expect(healthy).toBe(true);
    });
  });

  describe('getCertificates', () => {
    it('should return certificates from Caddy', async () => {
      const certificates = await manager.getCertificates();

      expect(Array.isArray(certificates)).toBe(true);
    });
  });
});
