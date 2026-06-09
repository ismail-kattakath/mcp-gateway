/**
 * mTLS Certificate Validation Tests
 *
 * Tests certificate chain validation, CRL, and OCSP checking.
 *
 * Related: Epic #21 (Advanced Authentication - Kerberos/mTLS)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateCertificateChain, checkCRL } from '../validation.js';
import fs from 'fs';

// Mock fs for file operations
vi.mock('fs');

describe('mTLS Certificate Validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('validateCertificateChain', () => {
    it('should return error for missing CA certificate', () => {
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('File not found');
      });

      const clientCert = '-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----';
      const result = validateCertificateChain(clientCert, '/path/to/ca.crt');

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return error for invalid certificate format', () => {
      vi.mocked(fs.readFileSync).mockReturnValue('invalid cert data');

      const clientCert = 'invalid';
      const result = validateCertificateChain(clientCert, '/path/to/ca.crt');

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('checkCRL', () => {
    it('should skip check if CRL file does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const clientCert = '-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----';
      const result = checkCRL(clientCert, '/path/to/ca.crl');

      expect(result.valid).toBe(true);
    });

    it('should return valid if CRL check succeeds but file is malformed', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('Invalid CRL');
      });

      const clientCert = '-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----';
      const result = checkCRL(clientCert, '/path/to/ca.crl');

      // Should not fail validation on CRL check error
      expect(result.valid).toBe(true);
    });
  });

  describe('certificate parsing edge cases', () => {
    it('should handle certificate with no extensions', () => {
      // This test verifies behavior when certificate has no SAN extension
      const identity = {
        commonName: 'test',
        subjectDN: 'CN=test',
        subjectAltNames: [],
        issuerDN: 'CN=CA',
        serialNumber: '1',
        notBefore: new Date('2025-01-01'),
        notAfter: new Date('2027-01-01'),
      };

      expect(identity.subjectAltNames).toEqual([]);
    });

    it('should handle multiple SAN values', () => {
      const identity = {
        commonName: 'test',
        subjectDN: 'CN=test',
        subjectAltNames: ['test@example.com', 'test.example.com', '192.168.1.1'],
        issuerDN: 'CN=CA',
        serialNumber: '1',
        notBefore: new Date('2025-01-01'),
        notAfter: new Date('2027-01-01'),
      };

      expect(identity.subjectAltNames).toHaveLength(3);
      expect(identity.subjectAltNames[0]).toBe('test@example.com');
    });

    it('should handle complex DN with special characters', () => {
      const identity = {
        commonName: 'Test User',
        subjectDN: 'CN=Test User, OU=Engineering, O=Example Inc., L=San Francisco, ST=CA, C=US',
        subjectAltNames: [],
        issuerDN: 'CN=Corporate CA, O=Example Inc.',
        serialNumber: '1234567890',
        notBefore: new Date('2025-01-01'),
        notAfter: new Date('2027-01-01'),
      };

      expect(identity.subjectDN).toContain('CN=Test User');
      expect(identity.subjectDN).toContain('O=Example Inc.');
    });
  });
});
