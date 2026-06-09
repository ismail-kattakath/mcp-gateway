/**
 * Domain validation tests
 */

import { describe, it, expect } from 'vitest';
import {
  isValidDomain,
  isValidWildcardDomain,
  isValidIpAddress,
  normalizeDomain,
  isLocalDomain,
  getRootDomain,
  validateTLSConfig,
} from '../validation.js';

describe('Domain Validation', () => {
  describe('isValidDomain', () => {
    it('should validate simple domains', () => {
      expect(isValidDomain('example.com')).toBe(true);
      expect(isValidDomain('google.com')).toBe(true);
      expect(isValidDomain('sub.example.com')).toBe(true);
    });

    it('should validate domains with hyphens', () => {
      expect(isValidDomain('my-site.com')).toBe(true);
      expect(isValidDomain('api-gateway.example.com')).toBe(true);
    });

    it('should validate long domains', () => {
      expect(isValidDomain('very.long.subdomain.example.com')).toBe(true);
    });

    it('should validate FQDN with trailing dot', () => {
      expect(isValidDomain('example.com.')).toBe(true);
    });

    it('should reject invalid domains', () => {
      expect(isValidDomain('example')).toBe(false); // No TLD
      expect(isValidDomain('-example.com')).toBe(false); // Starts with hyphen
      expect(isValidDomain('example-.com')).toBe(false); // Ends with hyphen
      expect(isValidDomain('exam ple.com')).toBe(false); // Space
      expect(isValidDomain('example..com')).toBe(false); // Double dot
      expect(isValidDomain('.example.com')).toBe(false); // Starts with dot
      expect(isValidDomain('example.com-')).toBe(false); // Ends with hyphen
    });

    it('should reject empty or invalid input', () => {
      expect(isValidDomain('')).toBe(false);
      expect(isValidDomain(null as any)).toBe(false);
      expect(isValidDomain(undefined as any)).toBe(false);
      expect(isValidDomain(123 as any)).toBe(false);
    });

    it('should reject domains with invalid characters', () => {
      expect(isValidDomain('exam_ple.com')).toBe(false); // Underscore
      expect(isValidDomain('example$.com')).toBe(false); // Dollar sign
      expect(isValidDomain('example@.com')).toBe(false); // At sign
    });

    it('should reject domains exceeding length limits', () => {
      const longLabel = 'a'.repeat(64); // Labels max 63 chars
      expect(isValidDomain(`${longLabel}.com`)).toBe(false);

      const longDomain = 'subdomain.'.repeat(30) + 'example.com'; // >253 chars
      expect(isValidDomain(longDomain)).toBe(false);
    });
  });

  describe('isValidWildcardDomain', () => {
    it('should validate wildcard domains', () => {
      expect(isValidWildcardDomain('*.example.com')).toBe(true);
      expect(isValidWildcardDomain('*.sub.example.com')).toBe(true);
    });

    it('should reject invalid wildcard domains', () => {
      expect(isValidWildcardDomain('*example.com')).toBe(false); // No dot
      expect(isValidWildcardDomain('example.com')).toBe(false); // No wildcard
      expect(isValidWildcardDomain('*.*.example.com')).toBe(false); // Double wildcard
      expect(isValidWildcardDomain('*')).toBe(false); // Wildcard only
    });

    it('should reject empty or invalid input', () => {
      expect(isValidWildcardDomain('')).toBe(false);
      expect(isValidWildcardDomain(null as any)).toBe(false);
      expect(isValidWildcardDomain(undefined as any)).toBe(false);
    });
  });

  describe('isValidIpAddress', () => {
    it('should validate IPv4 addresses', () => {
      expect(isValidIpAddress('192.168.1.1')).toBe(true);
      expect(isValidIpAddress('10.0.0.1')).toBe(true);
      expect(isValidIpAddress('127.0.0.1')).toBe(true);
      expect(isValidIpAddress('0.0.0.0')).toBe(true);
      expect(isValidIpAddress('255.255.255.255')).toBe(true);
    });

    it('should validate IPv6 addresses', () => {
      expect(isValidIpAddress('2001:0db8:85a3:0000:0000:8a2e:0370:7334')).toBe(true);
      expect(isValidIpAddress('::1')).toBe(false); // Simplified regex doesn't support compressed format
    });

    it('should reject invalid IP addresses', () => {
      expect(isValidIpAddress('256.1.1.1')).toBe(false); // Out of range
      expect(isValidIpAddress('192.168.1')).toBe(false); // Incomplete
      expect(isValidIpAddress('192.168.1.1.1')).toBe(false); // Too many octets
      expect(isValidIpAddress('abc.def.ghi.jkl')).toBe(false); // Not numeric
    });

    it('should reject empty or invalid input', () => {
      expect(isValidIpAddress('')).toBe(false);
      expect(isValidIpAddress(null as any)).toBe(false);
      expect(isValidIpAddress(undefined as any)).toBe(false);
    });
  });

  describe('normalizeDomain', () => {
    it('should normalize domain to lowercase', () => {
      expect(normalizeDomain('EXAMPLE.COM')).toBe('example.com');
      expect(normalizeDomain('Example.Com')).toBe('example.com');
    });

    it('should remove trailing dot', () => {
      expect(normalizeDomain('example.com.')).toBe('example.com');
    });

    it('should trim whitespace', () => {
      expect(normalizeDomain('  example.com  ')).toBe('example.com');
    });

    it('should remove protocol', () => {
      expect(normalizeDomain('https://example.com')).toBe('example.com');
      expect(normalizeDomain('http://example.com')).toBe('example.com');
    });

    it('should remove port', () => {
      expect(normalizeDomain('example.com:443')).toBe('example.com');
      expect(normalizeDomain('example.com:8080')).toBe('example.com');
    });

    it('should handle multiple normalizations', () => {
      expect(normalizeDomain('  HTTPS://EXAMPLE.COM:443.  ')).toBe('example.com');
    });

    it('should throw on invalid input', () => {
      expect(() => normalizeDomain('')).toThrow();
      expect(() => normalizeDomain(null as any)).toThrow();
      expect(() => normalizeDomain(undefined as any)).toThrow();
    });
  });

  describe('isLocalDomain', () => {
    it('should identify localhost', () => {
      expect(isLocalDomain('localhost')).toBe(true);
      expect(isLocalDomain('LOCALHOST')).toBe(true);
    });

    it('should identify loopback IPs', () => {
      expect(isLocalDomain('127.0.0.1')).toBe(true);
      expect(isLocalDomain('::1')).toBe(true);
      expect(isLocalDomain('0.0.0.0')).toBe(true);
    });

    it('should identify .local domains', () => {
      expect(isLocalDomain('example.local')).toBe(true);
      expect(isLocalDomain('api.example.local')).toBe(true);
    });

    it('should identify .localhost domains', () => {
      expect(isLocalDomain('test.localhost')).toBe(true);
    });

    it('should identify private IP ranges', () => {
      // 192.168.x.x
      expect(isLocalDomain('192.168.1.1')).toBe(true);
      expect(isLocalDomain('192.168.255.255')).toBe(true);

      // 10.x.x.x
      expect(isLocalDomain('10.0.0.1')).toBe(true);
      expect(isLocalDomain('10.255.255.255')).toBe(true);

      // 172.16-31.x.x
      expect(isLocalDomain('172.16.0.1')).toBe(true);
      expect(isLocalDomain('172.31.255.255')).toBe(true);
    });

    it('should reject public domains', () => {
      expect(isLocalDomain('example.com')).toBe(false);
      expect(isLocalDomain('google.com')).toBe(false);
      expect(isLocalDomain('8.8.8.8')).toBe(false); // Google DNS
    });
  });

  describe('getRootDomain', () => {
    it('should extract root domain from subdomains', () => {
      expect(getRootDomain('api.example.com')).toBe('example.com');
      expect(getRootDomain('www.example.com')).toBe('example.com');
      expect(getRootDomain('sub.api.example.com')).toBe('example.com');
    });

    it('should handle root domains', () => {
      expect(getRootDomain('example.com')).toBe('example.com');
    });

    it('should handle country code TLDs', () => {
      expect(getRootDomain('example.co.uk')).toBe('example.co.uk');
      expect(getRootDomain('www.example.co.uk')).toBe('example.co.uk');
      expect(getRootDomain('example.com.au')).toBe('example.com.au');
    });

    it('should throw on invalid domains', () => {
      expect(() => getRootDomain('example')).toThrow(); // No TLD
      expect(() => getRootDomain('.com')).toThrow(); // No domain
    });
  });

  describe('validateTLSConfig', () => {
    it('should validate valid TLS 1.3 config', () => {
      const result = validateTLSConfig({
        protocols: ['tls1.3'],
        ciphers: ['TLS_AES_128_GCM_SHA256', 'TLS_AES_256_GCM_SHA384'],
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate TLS 1.2 + 1.3 config', () => {
      const result = validateTLSConfig({
        protocols: ['tls1.2', 'tls1.3'],
        ciphers: ['TLS_AES_128_GCM_SHA256'],
      });

      expect(result.valid).toBe(true);
    });

    it('should warn about TLS 1.2 only', () => {
      const result = validateTLSConfig({
        protocols: ['tls1.2'],
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('deprecated'))).toBe(true);
    });

    it('should reject invalid protocols', () => {
      const result = validateTLSConfig({
        protocols: ['tls1.0', 'tls1.1', 'tls1.3'],
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Invalid TLS protocols'))).toBe(true);
    });

    it('should warn about weak ciphers', () => {
      const result = validateTLSConfig({
        protocols: ['tls1.3'],
        ciphers: ['WEAK_CIPHER_SUITE'],
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('recommended'))).toBe(true);
    });

    it('should validate certificate and key together', () => {
      const validCert = '-----BEGIN CERTIFICATE-----\nMIIC...\n-----END CERTIFICATE-----';
      const validKey = '-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----';

      const result = validateTLSConfig({
        certificate: validCert,
        key: validKey,
      });

      expect(result.valid).toBe(true);
    });

    it('should reject certificate without key', () => {
      const result = validateTLSConfig({
        certificate: '-----BEGIN CERTIFICATE-----\nMIIC...\n-----END CERTIFICATE-----',
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('key is missing'))).toBe(true);
    });

    it('should reject key without certificate', () => {
      const result = validateTLSConfig({
        key: '-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----',
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('certificate is missing'))).toBe(true);
    });

    it('should reject invalid PEM format', () => {
      const result = validateTLSConfig({
        certificate: 'not a valid PEM certificate',
        key: 'not a valid PEM key',
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Invalid certificate format'))).toBe(true);
      expect(result.errors.some((e) => e.includes('Invalid key format'))).toBe(true);
    });

    it('should handle empty config', () => {
      const result = validateTLSConfig({});

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});
