/**
 * TLS Configuration Tests
 *
 * Validates TLS options, cipher suites, and security headers.
 */

import { describe, it, expect } from 'vitest';
import {
  getTLSOptions,
  getSecurityHeaders,
  applySecurityHeaders,
  validateTLSConfig,
  getCipherSuites,
  isTLS13Supported,
  getRecommendedConfig,
  type TLSConfig,
} from '../tls.js';
import type { ServerResponse } from 'http';

describe('TLS Module', () => {
  describe('getTLSOptions', () => {
    it('should return Mozilla Modern cipher suites', () => {
      const options = getTLSOptions();
      expect(options.ciphers).toBeDefined();
      expect(options.ciphers).toContain('TLS_AES_128_GCM_SHA256');
      expect(options.ciphers).toContain('ECDHE-RSA-AES128-GCM-SHA256');
    });

    it('should set TLS 1.2 as minimum version by default', () => {
      const options = getTLSOptions();
      expect(options.minVersion).toBe('TLSv1.2');
    });

    it('should honor server cipher order', () => {
      const options = getTLSOptions();
      expect(options.honorCipherOrder).toBe(true);
    });

    it('should allow custom TLS version range', () => {
      const options = getTLSOptions({
        minVersion: 'TLSv1.3',
        maxVersion: 'TLSv1.3',
      });
      expect(options.minVersion).toBe('TLSv1.3');
      expect(options.maxVersion).toBe('TLSv1.3');
    });

    it('should not set secureProtocol (conflicts with minVersion)', () => {
      const options = getTLSOptions();
      // secureProtocol and minVersion/maxVersion conflict, so we don't set secureProtocol
      expect(options.secureProtocol).toBeUndefined();
    });

    it('should set session timeout', () => {
      const options = getTLSOptions();
      expect(options.sessionTimeout).toBe(300);
    });
  });

  describe('getCipherSuites', () => {
    it('should return array of cipher suites', () => {
      const suites = getCipherSuites();
      expect(Array.isArray(suites)).toBe(true);
      expect(suites.length).toBeGreaterThan(0);
    });

    it('should include modern AEAD ciphers', () => {
      const suites = getCipherSuites();
      expect(suites).toContain('TLS_AES_128_GCM_SHA256');
      expect(suites).toContain('TLS_AES_256_GCM_SHA384');
      expect(suites).toContain('TLS_CHACHA20_POLY1305_SHA256');
    });

    it('should include ECDHE ciphers for forward secrecy', () => {
      const suites = getCipherSuites();
      const ecdheCount = suites.filter((s) => s.includes('ECDHE')).length;
      expect(ecdheCount).toBeGreaterThan(0);
    });

    it('should not include weak ciphers', () => {
      const suites = getCipherSuites();
      const weakCiphers = ['RC4', '3DES', 'MD5', 'DES', 'NULL'];
      for (const weak of weakCiphers) {
        expect(suites.some((s) => s.includes(weak))).toBe(false);
      }
    });
  });

  describe('getSecurityHeaders', () => {
    it('should return default security headers', () => {
      const headers = getSecurityHeaders();
      expect(headers).toBeDefined();
      expect(headers['Strict-Transport-Security']).toBeDefined();
      expect(headers['X-Frame-Options']).toBeDefined();
      expect(headers['X-Content-Type-Options']).toBeDefined();
    });

    it('should include HSTS with 1 year max-age by default', () => {
      const headers = getSecurityHeaders();
      const hsts = headers['Strict-Transport-Security'];
      expect(hsts).toContain('max-age=31536000');
    });

    it('should include includeSubDomains in HSTS by default', () => {
      const headers = getSecurityHeaders();
      const hsts = headers['Strict-Transport-Security'];
      expect(hsts).toContain('includeSubDomains');
    });

    it('should allow custom HSTS max-age', () => {
      const headers = getSecurityHeaders({ hstsMaxAge: 7776000 });
      const hsts = headers['Strict-Transport-Security'];
      expect(hsts).toContain('max-age=7776000');
    });

    it('should support HSTS preload', () => {
      const headers = getSecurityHeaders({ hstsPreload: true });
      const hsts = headers['Strict-Transport-Security'];
      expect(hsts).toContain('preload');
    });

    it('should set X-Frame-Options to DENY by default', () => {
      const headers = getSecurityHeaders();
      expect(headers['X-Frame-Options']).toBe('DENY');
    });

    it('should allow SAMEORIGIN for X-Frame-Options', () => {
      const headers = getSecurityHeaders({ frameOptions: 'SAMEORIGIN' });
      expect(headers['X-Frame-Options']).toBe('SAMEORIGIN');
    });

    it('should include X-Content-Type-Options nosniff', () => {
      const headers = getSecurityHeaders();
      expect(headers['X-Content-Type-Options']).toBe('nosniff');
    });

    it('should include X-XSS-Protection', () => {
      const headers = getSecurityHeaders();
      expect(headers['X-XSS-Protection']).toBe('1; mode=block');
    });

    it('should include Referrer-Policy', () => {
      const headers = getSecurityHeaders();
      expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    });

    it('should include Permissions-Policy', () => {
      const headers = getSecurityHeaders();
      expect(headers['Permissions-Policy']).toBeDefined();
      expect(headers['Permissions-Policy']).toContain('geolocation=()');
    });
  });

  describe('applySecurityHeaders', () => {
    it('should set headers on response object', () => {
      const mockRes = {
        headers: {} as Record<string, string>,
        setHeader(name: string, value: string) {
          this.headers[name] = value;
        },
      } as unknown as ServerResponse;

      const headers = getSecurityHeaders();
      applySecurityHeaders(mockRes, headers);

      expect(mockRes.headers['Strict-Transport-Security']).toBeDefined();
      expect(mockRes.headers['X-Frame-Options']).toBe('DENY');
    });
  });

  describe('validateTLSConfig', () => {
    it('should pass validation for disabled TLS', () => {
      const config: Partial<TLSConfig> = { enabled: false };
      const result = validateTLSConfig(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should require mode when enabled', () => {
      const config: Partial<TLSConfig> = { enabled: true };
      const result = validateTLSConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('TLS mode is required when TLS is enabled');
    });

    it('should validate letsencrypt mode configuration', () => {
      const config: Partial<TLSConfig> = {
        enabled: true,
        mode: 'letsencrypt',
      };
      const result = validateTLSConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("Let's Encrypt"))).toBe(true);
    });

    it('should require email for letsencrypt', () => {
      const config: Partial<TLSConfig> = {
        enabled: true,
        mode: 'letsencrypt',
        letsencrypt: {
          email: '',
          staging: false,
          renewWithin: 30,
        },
      };
      const result = validateTLSConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('email'))).toBe(true);
    });

    it('should require domains for letsencrypt', () => {
      const config: Partial<TLSConfig> = {
        enabled: true,
        mode: 'letsencrypt',
        letsencrypt: {
          email: 'test@example.com',
          staging: false,
          renewWithin: 30,
        },
        domains: [],
      };
      const result = validateTLSConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('domain'))).toBe(true);
    });

    it('should validate custom mode configuration', () => {
      const config: Partial<TLSConfig> = {
        enabled: true,
        mode: 'custom',
      };
      const result = validateTLSConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Custom certificate'))).toBe(true);
    });

    it('should require cert and key for custom mode', () => {
      const config: Partial<TLSConfig> = {
        enabled: true,
        mode: 'custom',
        custom: {
          cert: '',
          key: '',
        },
      };
      const result = validateTLSConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should pass validation for complete letsencrypt config', () => {
      const config: Partial<TLSConfig> = {
        enabled: true,
        mode: 'letsencrypt',
        letsencrypt: {
          email: 'test@example.com',
          staging: true,
          renewWithin: 30,
        },
        domains: ['example.com'],
        redirect: true,
      };
      const result = validateTLSConfig(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should pass validation for complete custom config', () => {
      const config: Partial<TLSConfig> = {
        enabled: true,
        mode: 'custom',
        custom: {
          cert: '/path/to/cert.pem',
          key: '/path/to/key.pem',
        },
        redirect: false,
      };
      const result = validateTLSConfig(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject weak TLS versions', () => {
      const config: Partial<TLSConfig> = {
        enabled: true,
        mode: 'custom',
        custom: {
          cert: '/path/to/cert.pem',
          key: '/path/to/key.pem',
        },
        minVersion: 'TLSv1',
      };
      const result = validateTLSConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Insecure'))).toBe(true);
    });

    it('should accept TLSv1.2', () => {
      const config: Partial<TLSConfig> = {
        enabled: true,
        mode: 'custom',
        custom: {
          cert: '/path/to/cert.pem',
          key: '/path/to/key.pem',
        },
        minVersion: 'TLSv1.2',
      };
      const result = validateTLSConfig(config);
      expect(result.valid).toBe(true);
    });

    it('should accept TLSv1.3', () => {
      const config: Partial<TLSConfig> = {
        enabled: true,
        mode: 'custom',
        custom: {
          cert: '/path/to/cert.pem',
          key: '/path/to/key.pem',
        },
        minVersion: 'TLSv1.3',
      };
      const result = validateTLSConfig(config);
      expect(result.valid).toBe(true);
    });
  });

  describe('isTLS13Supported', () => {
    it('should return boolean', () => {
      const result = isTLS13Supported();
      expect(typeof result).toBe('boolean');
    });

    it('should return true for Node.js 12+', () => {
      // Current Node.js version should be >= 12
      const nodeVersion = process.versions.node;
      const major = parseInt(nodeVersion.split('.')[0], 10);
      const expected = major >= 12;

      expect(isTLS13Supported()).toBe(expected);
    });
  });

  describe('getRecommendedConfig', () => {
    it('should return enabled TLS configuration', () => {
      const config = getRecommendedConfig();
      expect(config.enabled).toBe(true);
    });

    it('should enable redirect', () => {
      const config = getRecommendedConfig();
      expect(config.redirect).toBe(true);
    });

    it('should set appropriate TLS version', () => {
      const config = getRecommendedConfig();
      expect(config.minVersion).toBe('TLSv1.2');
    });

    it('should set max version based on support', () => {
      const config = getRecommendedConfig();
      if (isTLS13Supported()) {
        expect(config.maxVersion).toBe('TLSv1.3');
      } else {
        expect(config.maxVersion).toBe('TLSv1.2');
      }
    });
  });

  describe('Mozilla Modern Compliance', () => {
    it('should only include modern cipher suites', () => {
      const suites = getCipherSuites();

      // All should be GCM or ChaCha20
      const modernCiphers = suites.every(
        (s) => s.includes('GCM') || s.includes('CHACHA20') || s.includes('TLS_AES')
      );
      expect(modernCiphers).toBe(true);
    });

    it('should prioritize AES-GCM', () => {
      const suites = getCipherSuites();
      const firstSuite = suites[0];
      expect(firstSuite).toContain('AES');
      expect(firstSuite).toContain('GCM');
    });

    it('should not include CBC mode ciphers', () => {
      const suites = getCipherSuites();
      const hasCBC = suites.some((s) => s.includes('CBC'));
      expect(hasCBC).toBe(false);
    });
  });
});
