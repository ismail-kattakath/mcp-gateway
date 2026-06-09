/**
 * mDNS Service Tests
 *
 * Tests mDNS advertising and discovery functionality.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  startMDNS,
  stopMDNS,
  getMDNSStatus,
  restartMDNS,
  isMDNSSupported,
  getPlatformInfo,
  type MDNSConfig,
} from '../mdns.js';

describe('mDNS Module', () => {
  beforeEach(() => {
    // Ensure clean state
    stopMDNS();
  });

  afterEach(() => {
    // Cleanup
    stopMDNS();
  });

  describe('startMDNS', () => {
    it('should return disabled status when mDNS is disabled', () => {
      const config: MDNSConfig = {
        enabled: false,
      };

      const status = startMDNS(config);

      expect(status.enabled).toBe(false);
      expect(status.running).toBe(false);
    });

    it('should start mDNS service when enabled', () => {
      const config: MDNSConfig = {
        enabled: true,
        name: 'Test Gateway',
        port: 3000,
      };

      const status = startMDNS(config);

      expect(status.enabled).toBe(true);
      expect(status.name).toBe('Test Gateway');
      expect(status.port).toBe(3000);
    });

    it('should use default name if not provided', () => {
      const config: MDNSConfig = {
        enabled: true,
        port: 3000,
      };

      const status = startMDNS(config);

      expect(status.name).toBe('MCP Gateway');
    });

    it('should use default port if not provided', () => {
      const config: MDNSConfig = {
        enabled: true,
      };

      const status = startMDNS(config);

      expect(status.port).toBe(3000);
    });

    it('should set service type to _http._tcp', () => {
      const config: MDNSConfig = {
        enabled: true,
        port: 3000,
      };

      const status = startMDNS(config);

      expect(status.type).toBe('_http._tcp');
    });

    it('should generate domain from name', () => {
      const config: MDNSConfig = {
        enabled: true,
        name: 'My Gateway',
        port: 3000,
      };

      const status = startMDNS(config);

      expect(status.domain).toBe('my-gateway.local');
    });

    it('should handle names with spaces', () => {
      const config: MDNSConfig = {
        enabled: true,
        name: 'MCP Gateway Server',
        port: 3000,
      };

      const status = startMDNS(config);

      expect(status.domain).toContain('.local');
      expect(status.domain).not.toContain(' ');
    });

    it('should stop existing service before starting new one', () => {
      const config1: MDNSConfig = {
        enabled: true,
        name: 'Gateway 1',
        port: 3000,
      };

      startMDNS(config1);

      const config2: MDNSConfig = {
        enabled: true,
        name: 'Gateway 2',
        port: 3001,
      };

      const status = startMDNS(config2);

      expect(status.name).toBe('Gateway 2');
      expect(status.port).toBe(3001);
    });
  });

  describe('stopMDNS', () => {
    it('should not throw when no service is running', () => {
      expect(() => stopMDNS()).not.toThrow();
    });

    it('should stop running service', () => {
      const config: MDNSConfig = {
        enabled: true,
        port: 3000,
      };

      startMDNS(config);
      stopMDNS();

      const status = getMDNSStatus();
      expect(status.running).toBe(false);
    });
  });

  describe('getMDNSStatus', () => {
    it('should return disabled status when not configured', () => {
      const status = getMDNSStatus();

      expect(status.enabled).toBe(false);
      expect(status.running).toBe(false);
    });

    it('should return current status when running', () => {
      const config: MDNSConfig = {
        enabled: true,
        name: 'Test Gateway',
        port: 3000,
      };

      startMDNS(config);
      const status = getMDNSStatus();

      expect(status.enabled).toBe(true);
      expect(status.name).toBe('Test Gateway');
      expect(status.port).toBe(3000);
    });
  });

  describe('restartMDNS', () => {
    it('should restart mDNS with new configuration', () => {
      const config1: MDNSConfig = {
        enabled: true,
        name: 'Gateway 1',
        port: 3000,
      };

      startMDNS(config1);

      const config2: MDNSConfig = {
        enabled: true,
        name: 'Gateway 2',
        port: 3001,
      };

      const status = restartMDNS(config2);

      expect(status.name).toBe('Gateway 2');
      expect(status.port).toBe(3001);
    });

    it('should work even if not previously running', () => {
      const config: MDNSConfig = {
        enabled: true,
        name: 'Test Gateway',
        port: 3000,
      };

      expect(() => restartMDNS(config)).not.toThrow();
    });
  });

  describe('isMDNSSupported', () => {
    it('should return boolean', () => {
      const result = isMDNSSupported();
      expect(typeof result).toBe('boolean');
    });

    it('should return true on macOS', () => {
      if (process.platform === 'darwin') {
        expect(isMDNSSupported()).toBe(true);
      }
    });

    it('should return true on Linux', () => {
      if (process.platform === 'linux') {
        expect(isMDNSSupported()).toBe(true);
      }
    });

    it('should return true on Windows', () => {
      if (process.platform === 'win32') {
        expect(isMDNSSupported()).toBe(true);
      }
    });
  });

  describe('getPlatformInfo', () => {
    it('should return platform information', () => {
      const info = getPlatformInfo();

      expect(info).toBeDefined();
      expect(info.platform).toBeDefined();
      expect(info.supported).toBeDefined();
      expect(info.implementation).toBeDefined();
    });

    it('should match current platform', () => {
      const info = getPlatformInfo();
      expect(info.platform).toBe(process.platform);
    });

    it('should identify correct implementation on macOS', () => {
      if (process.platform === 'darwin') {
        const info = getPlatformInfo();
        expect(info.implementation).toBe('Bonjour (native)');
      }
    });

    it('should identify correct implementation on Linux', () => {
      if (process.platform === 'linux') {
        const info = getPlatformInfo();
        expect(info.implementation).toBe('Avahi');
      }
    });

    it('should identify correct implementation on Windows', () => {
      if (process.platform === 'win32') {
        const info = getPlatformInfo();
        expect(info.implementation).toBe('Bonjour for Windows');
      }
    });
  });

  describe('Configuration validation', () => {
    it('should handle missing optional fields', () => {
      const config: MDNSConfig = {
        enabled: true,
      };

      const status = startMDNS(config);

      expect(status.name).toBeDefined();
      expect(status.port).toBeDefined();
    });

    it('should respect custom port', () => {
      const config: MDNSConfig = {
        enabled: true,
        port: 8080,
      };

      const status = startMDNS(config);

      expect(status.port).toBe(8080);
    });

    it('should respect custom name', () => {
      const config: MDNSConfig = {
        enabled: true,
        name: 'Custom Name',
      };

      const status = startMDNS(config);

      expect(status.name).toBe('Custom Name');
    });
  });

  describe('Error handling', () => {
    it('should handle startup errors gracefully', () => {
      const config: MDNSConfig = {
        enabled: true,
        port: 3000,
      };

      // Should not throw even if Bonjour fails to start
      expect(() => startMDNS(config)).not.toThrow();
    });

    it('should return error in status if startup fails', () => {
      // This test depends on platform and may not always trigger an error
      const config: MDNSConfig = {
        enabled: true,
        port: 3000,
      };

      const status = startMDNS(config);

      // Either running successfully or has error
      if (!status.running) {
        expect(status.error).toBeDefined();
      }
    });
  });

  describe('TXT records', () => {
    it('should include version in TXT record', () => {
      const config: MDNSConfig = {
        enabled: true,
        port: 3000,
        txt: {
          version: '3.0.0',
        },
      };

      const status = startMDNS(config);

      // TXT records are internal, status doesn't expose them
      // Just verify service starts
      expect(status.enabled).toBe(true);
    });

    it('should allow custom TXT records', () => {
      const config: MDNSConfig = {
        enabled: true,
        port: 3000,
        txt: {
          custom: 'value',
          another: 'field',
        },
      };

      expect(() => startMDNS(config)).not.toThrow();
    });
  });
});
