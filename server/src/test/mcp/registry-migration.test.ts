/**
 * Tests for registry version detection and auto-upgrade
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { detectRegistryVersion } from '../../mcp/registry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Registry Version Detection', () => {
  describe('detectRegistryVersion', () => {
    it('should detect explicit v2.0 version', () => {
      const registry = { version: '2.0', servers: {} };
      expect(detectRegistryVersion(registry)).toBe('2.0');
    });

    it('should detect explicit v2.1 version', () => {
      const registry = { version: '2.1', servers: {} };
      expect(detectRegistryVersion(registry)).toBe('2.1');
    });

    it('should detect explicit v3.0 version', () => {
      const registry = { version: '3.0', servers: {} };
      expect(detectRegistryVersion(registry)).toBe('3.0');
    });

    it('should detect v2.0 from mcpServers key', () => {
      const registry = { mcpServers: { test: {} } };
      expect(detectRegistryVersion(registry)).toBe('2.0');
    });

    it('should detect v2.1 from servers key without version', () => {
      const registry = { servers: { test: {} } };
      expect(detectRegistryVersion(registry)).toBe('2.1');
    });

    it('should prefer explicit version over heuristics', () => {
      const registry = { version: '3.0', mcpServers: { test: {} } };
      expect(detectRegistryVersion(registry)).toBe('3.0');
    });

    it('should throw on unknown structure', () => {
      const registry = { unknown: {} };
      expect(() => detectRegistryVersion(registry)).toThrow('Unable to detect registry version');
    });
  });

  describe('Fixture Validation', () => {
    it('should load v2.0 fixture', async () => {
      const fixturePath = path.join(__dirname, '../fixtures/v2.0-registry.json');
      const content = await fs.readFile(fixturePath, 'utf-8');
      const registry = JSON.parse(content);

      expect(detectRegistryVersion(registry)).toBe('2.0');
      expect(registry.mcpServers).toBeDefined();
      expect(registry.mcpServers.filesystem).toBeDefined();
      expect(registry.gateway?.disableAuth).toBe(false);
      expect(registry.gateway?.allowedIPs).toEqual(['192.168.1.0/24', '10.0.0.1']);
    });

    it('should load v2.1 fixture', async () => {
      const fixturePath = path.join(__dirname, '../fixtures/v2.1-registry.json');
      const content = await fs.readFile(fixturePath, 'utf-8');
      const registry = JSON.parse(content);

      expect(detectRegistryVersion(registry)).toBe('2.1');
      expect(registry.servers).toBeDefined();
      expect(registry.servers.filesystem).toBeDefined();
      expect(registry.mcpServers).toBeUndefined();
    });

    it('should load v3.0 fixture', async () => {
      const fixturePath = path.join(__dirname, '../fixtures/v3.0-registry.json');
      const content = await fs.readFile(fixturePath, 'utf-8');
      const registry = JSON.parse(content);

      expect(detectRegistryVersion(registry)).toBe('3.0');
      expect(registry.servers).toBeDefined();
      expect(registry.servers.filesystem).toBeDefined();
    });
  });

  describe('Server Config Structure', () => {
    it('v2.0 should have mcpServers', async () => {
      const fixturePath = path.join(__dirname, '../fixtures/v2.0-registry.json');
      const content = await fs.readFile(fixturePath, 'utf-8');
      const registry = JSON.parse(content);

      expect(registry.mcpServers).toBeDefined();
      expect(registry.servers).toBeUndefined();
    });

    it('v2.1 should have servers', async () => {
      const fixturePath = path.join(__dirname, '../fixtures/v2.1-registry.json');
      const content = await fs.readFile(fixturePath, 'utf-8');
      const registry = JSON.parse(content);

      expect(registry.servers).toBeDefined();
      expect(registry.mcpServers).toBeUndefined();
    });

    it('v3.0 should have servers', async () => {
      const fixturePath = path.join(__dirname, '../fixtures/v3.0-registry.json');
      const content = await fs.readFile(fixturePath, 'utf-8');
      const registry = JSON.parse(content);

      expect(registry.servers).toBeDefined();
      expect(registry.mcpServers).toBeUndefined();
    });
  });

  describe('Gateway Config Structure', () => {
    it('v2.0 should have full gateway config with auth', async () => {
      const fixturePath = path.join(__dirname, '../fixtures/v2.0-registry.json');
      const content = await fs.readFile(fixturePath, 'utf-8');
      const registry = JSON.parse(content);

      expect(registry.gateway).toBeDefined();
      expect(registry.gateway.server).toBeDefined();
      expect(registry.gateway.storage).toBeDefined();
      expect(registry.gateway.logging).toBeDefined();
      expect(registry.gateway.disableAuth).toBeDefined();
      expect(registry.gateway.allowedIPs).toBeDefined();
    });

    it('v2.1 should have simplified gateway config', async () => {
      const fixturePath = path.join(__dirname, '../fixtures/v2.1-registry.json');
      const content = await fs.readFile(fixturePath, 'utf-8');
      const registry = JSON.parse(content);

      expect(registry.gateway).toBeDefined();
      expect(registry.gateway.port).toBe(3000);
      expect(registry.gateway.server).toBeUndefined(); // Simplified format
      expect(registry.gateway.disableAuth).toBeUndefined(); // Moved to .mcp-gateway.json
    });

    it('v3.0 should have simplified gateway config', async () => {
      const fixturePath = path.join(__dirname, '../fixtures/v3.0-registry.json');
      const content = await fs.readFile(fixturePath, 'utf-8');
      const registry = JSON.parse(content);

      expect(registry.gateway).toBeDefined();
      expect(registry.gateway.port).toBe(3000);
    });
  });

  describe('Migration Validation', () => {
    it('v2.0 to v3.0 should preserve server configs', async () => {
      const v2Path = path.join(__dirname, '../fixtures/v2.0-registry.json');
      const v2Content = await fs.readFile(v2Path, 'utf-8');
      const v2Registry = JSON.parse(v2Content);

      // Simulate migration
      const v3Registry = {
        version: '3.0',
        servers: v2Registry.mcpServers,
      };

      expect(v3Registry.servers.filesystem).toEqual(v2Registry.mcpServers.filesystem);
      expect(v3Registry.servers.observatory).toEqual(v2Registry.mcpServers.observatory);
    });

    it('v2.1 to v3.0 should be a simple version bump', async () => {
      const v2Path = path.join(__dirname, '../fixtures/v2.1-registry.json');
      const v2Content = await fs.readFile(v2Path, 'utf-8');
      const v2Registry = JSON.parse(v2Content);

      // Simulate migration
      const v3Registry = {
        version: '3.0',
        servers: v2Registry.servers,
        gateway: v2Registry.gateway,
      };

      expect(v3Registry.servers).toEqual(v2Registry.servers);
      expect(detectRegistryVersion(v3Registry)).toBe('3.0');
    });
  });
});
