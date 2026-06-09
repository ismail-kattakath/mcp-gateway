/**
 * mTLS Strategy Tests
 *
 * Tests mTLS (mutual TLS) client certificate authentication strategy.
 *
 * Related: Epic #21 (Advanced Authentication - Kerberos/mTLS)
 */

import { describe, it, expect } from 'vitest';
import { extractIdentity, extractUsername, validateCertificateDates } from '../identity.js';
import type { CertificateIdentity } from '../identity.js';

describe('mTLS Strategy', () => {
  describe('extractIdentity', () => {
    it('should extract CN from certificate', () => {
      const identity: CertificateIdentity = {
        commonName: 'alice',
        subjectDN: 'CN=alice, OU=Engineering, O=Example Inc',
        subjectAltNames: [],
        issuerDN: 'CN=CA, O=Example Inc',
        serialNumber: '12345',
        notBefore: new Date('2025-01-01'),
        notAfter: new Date('2027-01-01'),
      };

      const result = extractIdentity(identity, 'CN');
      expect(result).toBe('alice');
    });

    it('should throw if CN is empty', () => {
      const identity: CertificateIdentity = {
        commonName: '',
        subjectDN: 'O=Example Inc',
        subjectAltNames: [],
        issuerDN: 'CN=CA',
        serialNumber: '12345',
        notBefore: new Date('2025-01-01'),
        notAfter: new Date('2027-01-01'),
      };

      expect(() => extractIdentity(identity, 'CN')).toThrow('Certificate has no Common Name');
    });

    it('should extract SAN from certificate', () => {
      const identity: CertificateIdentity = {
        commonName: 'alice',
        subjectDN: 'CN=alice',
        subjectAltNames: ['alice@example.com', 'alice.example.com'],
        issuerDN: 'CN=CA',
        serialNumber: '12345',
        notBefore: new Date('2025-01-01'),
        notAfter: new Date('2027-01-01'),
      };

      const result = extractIdentity(identity, 'SAN');
      expect(result).toBe('alice@example.com');
    });

    it('should throw if SAN is empty', () => {
      const identity: CertificateIdentity = {
        commonName: 'alice',
        subjectDN: 'CN=alice',
        subjectAltNames: [],
        issuerDN: 'CN=CA',
        serialNumber: '12345',
        notBefore: new Date('2025-01-01'),
        notAfter: new Date('2027-01-01'),
      };

      expect(() => extractIdentity(identity, 'SAN')).toThrow(
        'Certificate has no Subject Alternative Names'
      );
    });

    it('should throw on OID (not implemented)', () => {
      const identity: CertificateIdentity = {
        commonName: 'alice',
        subjectDN: 'CN=alice',
        subjectAltNames: [],
        issuerDN: 'CN=CA',
        serialNumber: '12345',
        notBefore: new Date('2025-01-01'),
        notAfter: new Date('2027-01-01'),
      };

      expect(() => extractIdentity(identity, 'OID', '1.2.3.4')).toThrow(
        'Custom OID extraction not yet implemented'
      );
    });

    it('should throw on missing custom OID', () => {
      const identity: CertificateIdentity = {
        commonName: 'alice',
        subjectDN: 'CN=alice',
        subjectAltNames: [],
        issuerDN: 'CN=CA',
        serialNumber: '12345',
        notBefore: new Date('2025-01-01'),
        notAfter: new Date('2027-01-01'),
      };

      expect(() => extractIdentity(identity, 'OID')).toThrow('Custom OID not configured');
    });
  });

  describe('extractUsername', () => {
    it('should extract local part from email', () => {
      expect(extractUsername('alice@example.com')).toBe('alice');
    });

    it('should extract CN from DN', () => {
      expect(extractUsername('CN=alice, OU=Engineering')).toBe('alice');
    });

    it('should extract local part from email even with special chars', () => {
      expect(extractUsername('alice!@#$%')).toBe('alice!');
    });

    it('should preserve valid characters', () => {
      expect(extractUsername('alice.doe_123')).toBe('alice.doe_123');
    });
  });

  describe('validateCertificateDates', () => {
    it('should accept valid certificate', () => {
      const identity: CertificateIdentity = {
        commonName: 'alice',
        subjectDN: 'CN=alice',
        subjectAltNames: [],
        issuerDN: 'CN=CA',
        serialNumber: '12345',
        notBefore: new Date('2025-01-01'),
        notAfter: new Date('2027-01-01'),
      };

      expect(() => validateCertificateDates(identity)).not.toThrow();
    });

    it('should reject certificate not yet valid', () => {
      const identity: CertificateIdentity = {
        commonName: 'alice',
        subjectDN: 'CN=alice',
        subjectAltNames: [],
        issuerDN: 'CN=CA',
        serialNumber: '12345',
        notBefore: new Date('2030-01-01'),
        notAfter: new Date('2032-01-01'),
      };

      expect(() => validateCertificateDates(identity)).toThrow('Certificate not yet valid');
    });

    it('should reject expired certificate', () => {
      const identity: CertificateIdentity = {
        commonName: 'alice',
        subjectDN: 'CN=alice',
        subjectAltNames: [],
        issuerDN: 'CN=CA',
        serialNumber: '12345',
        notBefore: new Date('2020-01-01'),
        notAfter: new Date('2022-01-01'),
      };

      expect(() => validateCertificateDates(identity)).toThrow('Certificate has expired');
    });
  });
});
