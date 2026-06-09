/**
 * Kerberos Strategy Tests
 *
 * Tests Kerberos/SPNEGO authentication strategy.
 *
 * Related: Epic #21 (Advanced Authentication - Kerberos/mTLS)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { parseKerberosPrincipal } from '../provisioning.js';
import { parseServicePrincipal, extractRealm, validateKerberosConfig } from '../config.js';
import type { KerberosConfigRecord } from '../../../../storage/models/kerberos-config.js';

// Create temp keytab for testing
const tempKeytabPath = path.join('/tmp', `test-keytab-${Date.now()}`);

beforeAll(() => {
  // Create empty keytab file for tests
  fs.writeFileSync(tempKeytabPath, '');
});

afterAll(() => {
  // Clean up
  try {
    fs.unlinkSync(tempKeytabPath);
  } catch {
    // Ignore errors
  }
});

describe('Kerberos Strategy', () => {
  describe('parseKerberosPrincipal', () => {
    it('should parse simple principal', () => {
      const result = parseKerberosPrincipal('alice@EXAMPLE.COM');
      expect(result).toEqual({
        principal: 'alice@EXAMPLE.COM',
        realm: 'EXAMPLE.COM',
        username: 'alice',
      });
    });

    it('should parse principal with instance', () => {
      const result = parseKerberosPrincipal('alice/admin@EXAMPLE.COM');
      expect(result).toEqual({
        principal: 'alice/admin@EXAMPLE.COM',
        realm: 'EXAMPLE.COM',
        username: 'alice/admin',
      });
    });

    it('should throw on invalid principal', () => {
      expect(() => parseKerberosPrincipal('invalid')).toThrow('Invalid Kerberos principal');
    });

    it('should throw on principal without realm', () => {
      expect(() => parseKerberosPrincipal('alice')).toThrow('Invalid Kerberos principal');
    });
  });

  describe('parseServicePrincipal', () => {
    it('should parse HTTP service principal', () => {
      const result = parseServicePrincipal('HTTP/gateway.example.com@EXAMPLE.COM');
      expect(result).toEqual({
        service: 'HTTP',
        hostname: 'gateway.example.com',
        realm: 'EXAMPLE.COM',
      });
    });

    it('should parse other service types', () => {
      const result = parseServicePrincipal('HOST/server.example.com@EXAMPLE.COM');
      expect(result).toEqual({
        service: 'HOST',
        hostname: 'server.example.com',
        realm: 'EXAMPLE.COM',
      });
    });

    it('should throw on invalid service principal', () => {
      expect(() => parseServicePrincipal('invalid')).toThrow('Invalid service principal');
    });
  });

  describe('extractRealm', () => {
    it('should extract realm from principal', () => {
      expect(extractRealm('HTTP/gateway@EXAMPLE.COM')).toBe('EXAMPLE.COM');
    });

    it('should throw on invalid principal', () => {
      expect(() => extractRealm('invalid')).toThrow('Invalid service principal');
    });
  });

  describe('validateKerberosConfig', () => {
    it('should reject invalid service principal format', () => {
      const config: KerberosConfigRecord = {
        id: 'krb_1',
        servicePrincipal: 'invalid',
        keytabPath: '/tmp/test.keytab',
        realm: 'EXAMPLE.COM',
        enabled: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      expect(() => validateKerberosConfig(config)).toThrow('Invalid service principal format');
    });

    it('should reject non-uppercase realm in principal', () => {
      const config: KerberosConfigRecord = {
        id: 'krb_1',
        servicePrincipal: 'HTTP/gateway.example.com@example.com',
        keytabPath: '/tmp/test.keytab',
        realm: 'EXAMPLE.COM',
        enabled: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      expect(() => validateKerberosConfig(config)).toThrow('Invalid service principal format');
    });

    it('should reject lowercase realm', () => {
      const config: KerberosConfigRecord = {
        id: 'krb_1',
        servicePrincipal: 'HTTP/gateway.example.com@EXAMPLE.COM',
        keytabPath: tempKeytabPath,
        realm: 'example.com',
        enabled: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      expect(() => validateKerberosConfig(config)).toThrow('Realm must be uppercase');
    });

    it('should reject missing keytab file', () => {
      const config: KerberosConfigRecord = {
        id: 'krb_1',
        servicePrincipal: 'HTTP/gateway.example.com@EXAMPLE.COM',
        keytabPath: '/nonexistent/keytab',
        realm: 'EXAMPLE.COM',
        enabled: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      expect(() => validateKerberosConfig(config)).toThrow('Keytab file not found');
    });
  });
});
