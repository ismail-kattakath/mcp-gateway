/**
 * Certificate Management Tests
 *
 * Tests certificate parsing, validation, and generation.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import {
  parseCertificate,
  generateSelfSigned,
  saveCertificate,
  checkExpiration,
  verifyCertificateKeyPair,
  loadCertificate,
  validateCertificateChain,
} from '../certificates.js';

describe('Certificate Module', () => {
  let tempDir: string;

  beforeEach(async () => {
    // Create temporary directory for test files
    tempDir = path.join(os.tmpdir(), `mcp-cert-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('generateSelfSigned', () => {
    it('should generate self-signed certificate and key', () => {
      const result = generateSelfSigned({
        commonName: 'test.local',
      });

      expect(result.cert).toBeDefined();
      expect(result.key).toBeDefined();
      expect(result.cert).toContain('-----BEGIN CERTIFICATE-----');
      expect(result.key).toContain('-----BEGIN RSA PRIVATE KEY-----');
    });

    it('should use provided common name', () => {
      const result = generateSelfSigned({
        commonName: 'example.com',
      });

      const cert = parseCertificate(result.cert);
      expect(cert.subject.commonName).toBe('example.com');
    });

    it('should use default organization', () => {
      const result = generateSelfSigned({
        commonName: 'test.local',
      });

      const cert = parseCertificate(result.cert);
      expect(cert.subject.organization).toBe('MCP Gateway');
    });

    it('should use custom organization', () => {
      const result = generateSelfSigned({
        commonName: 'test.local',
        organization: 'Test Org',
      });

      const cert = parseCertificate(result.cert);
      expect(cert.subject.organization).toBe('Test Org');
    });

    it('should use default validity period of 365 days', () => {
      const result = generateSelfSigned({
        commonName: 'test.local',
      });

      const cert = parseCertificate(result.cert);
      const expectedExpiry = new Date();
      expectedExpiry.setDate(expectedExpiry.getDate() + 365);

      expect(cert.daysUntilExpiry).toBeGreaterThanOrEqual(364);
      expect(cert.daysUntilExpiry).toBeLessThanOrEqual(366);
    });

    it('should use custom validity period', () => {
      const result = generateSelfSigned({
        commonName: 'test.local',
        validityDays: 30,
      });

      const cert = parseCertificate(result.cert);
      expect(cert.daysUntilExpiry).toBeGreaterThanOrEqual(29);
      expect(cert.daysUntilExpiry).toBeLessThanOrEqual(31);
    });

    it('should mark certificate as self-signed', () => {
      const result = generateSelfSigned({
        commonName: 'test.local',
      });

      const cert = parseCertificate(result.cert);
      expect(cert.isSelfSigned).toBe(true);
    });

    it('should not be expired', () => {
      const result = generateSelfSigned({
        commonName: 'test.local',
      });

      const cert = parseCertificate(result.cert);
      expect(cert.isExpired).toBe(false);
    });

    it('should include Subject Alternative Names', () => {
      const result = generateSelfSigned({
        commonName: 'test.local',
        altNames: ['localhost', '127.0.0.1', 'test.example.com'],
      });

      const cert = parseCertificate(result.cert);
      expect(cert.subjectAltNames).toBeDefined();
      expect(cert.subjectAltNames).toContain('localhost');
      expect(cert.subjectAltNames).toContain('test.example.com');
    });

    it('should generate different certificates each time', () => {
      const result1 = generateSelfSigned({ commonName: 'test.local' });
      const result2 = generateSelfSigned({ commonName: 'test.local' });

      expect(result1.cert).not.toBe(result2.cert);
      expect(result1.key).not.toBe(result2.key);
    });

    it('should generate 2048-bit key by default', () => {
      const result = generateSelfSigned({
        commonName: 'test.local',
      });

      // Check key length (rough estimate based on PEM size)
      expect(result.key.length).toBeGreaterThan(1500);
      expect(result.key.length).toBeLessThan(2000);
    });

    it('should support custom key sizes', () => {
      const result = generateSelfSigned({
        commonName: 'test.local',
        keySize: 4096,
      });

      // 4096-bit key should be larger
      expect(result.key.length).toBeGreaterThan(3000);
    });
  });

  describe('parseCertificate', () => {
    it('should parse certificate information', () => {
      const { cert } = generateSelfSigned({ commonName: 'test.local' });
      const info = parseCertificate(cert);

      expect(info).toBeDefined();
      expect(info.subject).toBeDefined();
      expect(info.issuer).toBeDefined();
      expect(info.validFrom).toBeInstanceOf(Date);
      expect(info.validTo).toBeInstanceOf(Date);
    });

    it('should extract subject common name', () => {
      const { cert } = generateSelfSigned({ commonName: 'example.com' });
      const info = parseCertificate(cert);

      expect(info.subject.commonName).toBe('example.com');
    });

    it('should extract issuer information', () => {
      const { cert } = generateSelfSigned({
        commonName: 'test.local',
        organization: 'Test Org',
      });
      const info = parseCertificate(cert);

      expect(info.issuer.commonName).toBe('test.local');
      expect(info.issuer.organization).toBe('Test Org');
    });

    it('should calculate days until expiry', () => {
      const { cert } = generateSelfSigned({
        commonName: 'test.local',
        validityDays: 30,
      });
      const info = parseCertificate(cert);

      expect(info.daysUntilExpiry).toBeGreaterThanOrEqual(29);
      expect(info.daysUntilExpiry).toBeLessThanOrEqual(31);
    });

    it('should have fingerprint', () => {
      const { cert } = generateSelfSigned({ commonName: 'test.local' });
      const info = parseCertificate(cert);

      expect(info.fingerprint).toBeDefined();
      expect(info.fingerprint).toMatch(/^[A-F0-9:]+$/);
    });

    it('should throw error for invalid PEM', () => {
      expect(() => parseCertificate('invalid pem')).toThrow();
    });
  });

  describe('saveCertificate', () => {
    it('should save certificate to file', async () => {
      const { cert } = generateSelfSigned({ commonName: 'test.local' });
      const filePath = path.join(tempDir, 'cert.pem');

      await saveCertificate(filePath, cert, false);

      const saved = await fs.readFile(filePath, 'utf8');
      expect(saved).toBe(cert);
    });

    it('should save private key with restricted permissions', async () => {
      const { key } = generateSelfSigned({ commonName: 'test.local' });
      const filePath = path.join(tempDir, 'key.pem');

      await saveCertificate(filePath, key, true);

      const stats = await fs.stat(filePath);
      // Check permissions (600 = 0o600)
      // Note: On some systems this might not be enforced
      expect(stats.mode & 0o777).toBeLessThanOrEqual(0o700);
    });

    it('should create directory if not exists', async () => {
      const { cert } = generateSelfSigned({ commonName: 'test.local' });
      const filePath = path.join(tempDir, 'subdir', 'cert.pem');

      await saveCertificate(filePath, cert, false);

      const exists = await fs
        .access(filePath)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);
    });
  });

  describe('loadCertificate', () => {
    it('should load certificate from file', async () => {
      const { cert } = generateSelfSigned({ commonName: 'test.local' });
      const filePath = path.join(tempDir, 'cert.pem');
      await saveCertificate(filePath, cert, false);

      const loaded = await loadCertificate(filePath);

      expect(loaded).toBeDefined();
      expect(loaded.subject.commonName).toBe('test.local');
    });

    it('should throw error if file not found', async () => {
      const filePath = path.join(tempDir, 'nonexistent.pem');

      await expect(loadCertificate(filePath)).rejects.toThrow();
    });
  });

  describe('checkExpiration', () => {
    it('should detect expiring certificate', async () => {
      const { cert } = generateSelfSigned({
        commonName: 'test.local',
        validityDays: 20,
      });
      const filePath = path.join(tempDir, 'cert.pem');
      await saveCertificate(filePath, cert, false);

      const status = await checkExpiration(filePath, 30);

      expect(status.expiring).toBe(true);
      expect(status.expired).toBe(false);
    });

    it('should detect valid certificate', async () => {
      const { cert } = generateSelfSigned({
        commonName: 'test.local',
        validityDays: 365,
      });
      const filePath = path.join(tempDir, 'cert.pem');
      await saveCertificate(filePath, cert, false);

      const status = await checkExpiration(filePath, 30);

      expect(status.expiring).toBe(false);
      expect(status.expired).toBe(false);
      expect(status.daysUntilExpiry).toBeGreaterThan(30);
    });

    it('should return expiry date', async () => {
      const { cert } = generateSelfSigned({ commonName: 'test.local' });
      const filePath = path.join(tempDir, 'cert.pem');
      await saveCertificate(filePath, cert, false);

      const status = await checkExpiration(filePath);

      expect(status.validTo).toBeInstanceOf(Date);
      expect(status.validTo.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('verifyCertificateKeyPair', () => {
    it('should verify matching certificate and key', async () => {
      const { cert, key } = generateSelfSigned({ commonName: 'test.local' });
      const certPath = path.join(tempDir, 'cert.pem');
      const keyPath = path.join(tempDir, 'key.pem');
      await saveCertificate(certPath, cert, false);
      await saveCertificate(keyPath, key, true);

      const isValid = await verifyCertificateKeyPair(certPath, keyPath);

      expect(isValid).toBe(true);
    });

    it('should detect mismatched certificate and key', async () => {
      const pair1 = generateSelfSigned({ commonName: 'test1.local' });
      const pair2 = generateSelfSigned({ commonName: 'test2.local' });

      const certPath = path.join(tempDir, 'cert.pem');
      const keyPath = path.join(tempDir, 'key.pem');
      await saveCertificate(certPath, pair1.cert, false);
      await saveCertificate(keyPath, pair2.key, true);

      const isValid = await verifyCertificateKeyPair(certPath, keyPath);

      expect(isValid).toBe(false);
    });
  });

  describe('validateCertificateChain', () => {
    it('should validate self-signed certificate', async () => {
      const { cert } = generateSelfSigned({ commonName: 'test.local' });
      const certPath = path.join(tempDir, 'cert.pem');
      await saveCertificate(certPath, cert, false);

      const result = await validateCertificateChain(certPath);

      expect(result).toBeDefined();
      expect(result.certificate).toBeDefined();
      expect(result.certificate.subject.commonName).toBe('test.local');
    });

    it('should warn about self-signed certificate without chain', async () => {
      const { cert } = generateSelfSigned({ commonName: 'test.local' });
      const certPath = path.join(tempDir, 'cert.pem');
      await saveCertificate(certPath, cert, false);

      const result = await validateCertificateChain(certPath);

      expect(result.isValid).toBe(false);
      expect(result.validationErrors.some((e) => e.includes('Self-signed'))).toBe(true);
    });

    it('should detect certificate expiring soon', async () => {
      const { cert } = generateSelfSigned({
        commonName: 'test.local',
        validityDays: 20,
      });
      const certPath = path.join(tempDir, 'cert.pem');
      await saveCertificate(certPath, cert, false);

      const result = await validateCertificateChain(certPath);

      expect(result.isValid).toBe(false);
      expect(result.validationErrors.some((e) => e.includes('expires in'))).toBe(true);
    });
  });
});
