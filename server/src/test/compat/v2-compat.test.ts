/**
 * Tests for v2 backward compatibility layer
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { V2CompatLayer } from '../../compat/v2-compat.js';

describe('V2 Compatibility Layer', () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.ENABLE_V2_COMPAT;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.ENABLE_V2_COMPAT = originalEnv;
    } else {
      delete process.env.ENABLE_V2_COMPAT;
    }
  });

  describe('Initialization', () => {
    it('should be disabled by default', () => {
      delete process.env.ENABLE_V2_COMPAT;
      const compat = new V2CompatLayer();
      expect(compat.isEnabled()).toBe(false);
    });

    it('should be enabled when ENABLE_V2_COMPAT=true', () => {
      process.env.ENABLE_V2_COMPAT = 'true';
      const compat = new V2CompatLayer();
      expect(compat.isEnabled()).toBe(true);
    });

    it('should be disabled when ENABLE_V2_COMPAT=false', () => {
      process.env.ENABLE_V2_COMPAT = 'false';
      const compat = new V2CompatLayer();
      expect(compat.isEnabled()).toBe(false);
    });
  });

  describe('API Path Mapping', () => {
    it('should return original path when disabled', () => {
      delete process.env.ENABLE_V2_COMPAT;
      const compat = new V2CompatLayer();
      expect(compat.mapApiPath('/api/servers')).toBe('/api/servers');
    });

    it('should return original path for unmapped paths', () => {
      process.env.ENABLE_V2_COMPAT = 'true';
      const compat = new V2CompatLayer();
      expect(compat.mapApiPath('/api/servers')).toBe('/api/servers');
    });

    it('should handle paths that were not changed in v3', () => {
      process.env.ENABLE_V2_COMPAT = 'true';
      const compat = new V2CompatLayer();
      // Since we didn't actually change API paths in v3, all should pass through
      expect(compat.mapApiPath('/api/logs')).toBe('/api/logs');
      expect(compat.mapApiPath('/health')).toBe('/health');
    });
  });

  describe('Tool Name Mapping', () => {
    it('should return original name when disabled', () => {
      delete process.env.ENABLE_V2_COMPAT;
      const compat = new V2CompatLayer();
      expect(compat.mapToolName('obs/list')).toBe('obs/list');
    });

    it('should return original name for unmapped tools', () => {
      process.env.ENABLE_V2_COMPAT = 'true';
      const compat = new V2CompatLayer();
      expect(compat.mapToolName('filesystem/read')).toBe('filesystem/read');
    });

    it('should handle tools that were not renamed in v3', () => {
      process.env.ENABLE_V2_COMPAT = 'true';
      const compat = new V2CompatLayer();
      // Since we didn't actually rename tools in v3, all should pass through
      expect(compat.mapToolName('obs/list')).toBe('obs/list');
      expect(compat.mapToolName('observatory/get')).toBe('observatory/get');
    });
  });

  describe('Server Config Mapping', () => {
    it('should return original config when disabled', () => {
      delete process.env.ENABLE_V2_COMPAT;
      const compat = new V2CompatLayer();
      const config = { type: 'pkg', command: 'npx' };
      expect(compat.mapServerConfig(config)).toEqual(config);
    });

    it('should map "type" to "source" when enabled', () => {
      process.env.ENABLE_V2_COMPAT = 'true';
      const compat = new V2CompatLayer();
      const config = { type: 'pkg', command: 'npx', args: [] };
      const mapped = compat.mapServerConfig(config);

      expect(mapped.source).toBe('pkg');
      expect(mapped.type).toBeUndefined();
      expect(mapped.command).toBe('npx');
    });

    it('should not override existing "source" field', () => {
      process.env.ENABLE_V2_COMPAT = 'true';
      const compat = new V2CompatLayer();
      const config = { type: 'pkg', source: 'git', command: 'node' };
      const mapped = compat.mapServerConfig(config);

      expect(mapped.source).toBe('git'); // source takes precedence
      expect(mapped.type).toBe('pkg'); // type not removed if source exists
    });

    it('should handle config without "type" field', () => {
      process.env.ENABLE_V2_COMPAT = 'true';
      const compat = new V2CompatLayer();
      const config = { source: 'pkg', command: 'npx', args: [] };
      const mapped = compat.mapServerConfig(config);

      expect(mapped.source).toBe('pkg');
      expect(mapped.type).toBeUndefined();
    });
  });

  describe('Deprecated Feature Checking', () => {
    it('should allow features when disabled', () => {
      delete process.env.ENABLE_V2_COMPAT;
      const compat = new V2CompatLayer();
      expect(compat.checkDeprecatedFeature('old-api')).toBe(true);
    });

    it('should allow features when enabled', () => {
      process.env.ENABLE_V2_COMPAT = 'true';
      const compat = new V2CompatLayer();
      expect(compat.checkDeprecatedFeature('old-api', 'use new-api')).toBe(true);
    });

    it('should not throw errors for deprecated features', () => {
      process.env.ENABLE_V2_COMPAT = 'true';
      const compat = new V2CompatLayer();
      expect(() => {
        compat.checkDeprecatedFeature('legacy-endpoint');
      }).not.toThrow();
    });
  });

  describe('Deprecation Logging', () => {
    it('should not log when disabled', () => {
      delete process.env.ENABLE_V2_COMPAT;
      const compat = new V2CompatLayer();
      // Should not throw or cause issues
      expect(() => {
        compat.logDeprecation('old-field', 'new-field');
      }).not.toThrow();
    });

    it('should log when enabled', () => {
      process.env.ENABLE_V2_COMPAT = 'true';
      const compat = new V2CompatLayer();
      // Should not throw
      expect(() => {
        compat.logDeprecation('disableAuth', '.mcp-gateway.json auth config');
      }).not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('should handle null config', () => {
      process.env.ENABLE_V2_COMPAT = 'true';
      const compat = new V2CompatLayer();
      expect(compat.mapServerConfig(null)).toBe(null);
    });

    it('should handle empty config', () => {
      process.env.ENABLE_V2_COMPAT = 'true';
      const compat = new V2CompatLayer();
      expect(compat.mapServerConfig({})).toEqual({});
    });

    it('should handle empty string paths', () => {
      process.env.ENABLE_V2_COMPAT = 'true';
      const compat = new V2CompatLayer();
      expect(compat.mapApiPath('')).toBe('');
    });

    it('should handle empty string tool names', () => {
      process.env.ENABLE_V2_COMPAT = 'true';
      const compat = new V2CompatLayer();
      expect(compat.mapToolName('')).toBe('');
    });
  });
});
