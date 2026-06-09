/**
 * Secret Detector Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SecretDetector } from '../../security/secret-detector.js';
import type { Registry } from '../../types/registry.js';

describe('SecretDetector', () => {
  let detector: SecretDetector;

  beforeEach(() => {
    detector = new SecretDetector();
  });

  describe('detect API keys', () => {
    it('should detect API key patterns', () => {
      const text = 'api_key: sk_live_1234567890abcdef';
      const detections = detector.detect(text);

      expect(detections.length).toBeGreaterThan(0);
      expect(detections.some((d) => d.severity === 'high')).toBe(true);
    });

    it('should detect auth tokens', () => {
      const text = 'auth_token: "1234567890abcdef1234567890"';
      const detections = detector.detect(text);

      expect(detections.length).toBeGreaterThan(0);
    });

    it('should detect bearer tokens', () => {
      const text = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';
      const detections = detector.detect(text);

      expect(detections.length).toBeGreaterThan(0);
    });
  });

  describe('detect AWS credentials', () => {
    it('should detect AWS access keys', () => {
      const text = 'AKIAIOSFODNN7EXAMPLE';
      const detections = detector.detect(text);

      expect(detections.some((d) => d.pattern === 'AWS Access Key')).toBe(true);
    });

    it('should detect AWS secret keys', () => {
      const text = 'aws_secret_access_key: wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
      const detections = detector.detect(text);

      expect(detections.length).toBeGreaterThan(0);
    });
  });

  describe('detect GitHub tokens', () => {
    it('should detect GitHub personal access tokens', () => {
      const text = 'ghp_1234567890abcdef1234567890abcdef12';
      const detections = detector.detect(text);

      expect(detections.some((d) => d.pattern === 'GitHub Personal Access Token')).toBe(true);
    });

    it('should detect GitHub OAuth tokens', () => {
      const text = 'gho_1234567890abcdef1234567890abcdef12';
      const detections = detector.detect(text);

      expect(detections.some((d) => d.pattern === 'GitHub OAuth Token')).toBe(true);
    });
  });

  describe('detect JWTs', () => {
    it('should detect JWT tokens', () => {
      const jwt =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
      const detections = detector.detect(jwt);

      expect(detections.some((d) => d.pattern === 'JWT Token')).toBe(true);
    });
  });

  describe('detect private keys', () => {
    it('should detect RSA private keys', () => {
      const text = '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...';
      const detections = detector.detect(text);

      expect(detections.some((d) => d.pattern === 'RSA Private Key')).toBe(true);
    });

    it('should detect generic private keys', () => {
      const text = '-----BEGIN PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...';
      const detections = detector.detect(text);

      expect(detections.some((d) => d.pattern === 'Private Key')).toBe(true);
    });
  });

  describe('detect database connection strings', () => {
    it('should detect PostgreSQL connection strings', () => {
      const text = 'postgresql://user:password@localhost:5432/db';
      const detections = detector.detect(text);

      expect(detections.some((d) => d.pattern === 'PostgreSQL Connection String')).toBe(true);
    });

    it('should detect MySQL connection strings', () => {
      const text = 'mysql://user:password@localhost:3306/db';
      const detections = detector.detect(text);

      expect(detections.some((d) => d.pattern === 'MySQL Connection String')).toBe(true);
    });

    it('should detect MongoDB connection strings', () => {
      const text = 'mongodb://user:password@localhost:27017/db';
      const detections = detector.detect(text);

      expect(detections.some((d) => d.pattern === 'MongoDB Connection String')).toBe(true);
    });
  });

  describe('detectInObject', () => {
    it('should detect secrets in nested objects', () => {
      const obj = {
        server: {
          env: {
            API_KEY: 'sk_live_1234567890abcdef',
            DATABASE_URL: 'postgresql://user:pass@host/db',
          },
        },
      };

      const detections = detector.detectInObject(obj);
      expect(detections.length).toBeGreaterThan(0);
    });

    it('should detect sensitive field names', () => {
      const obj = {
        password: 'secret123',
        apiKey: 'key123',
      };

      const detections = detector.detectInObject(obj);
      expect(detections.some((d) => d.pattern === 'Sensitive Field Name')).toBe(true);
    });
  });

  describe('scanRegistry', () => {
    it('should scan registry for secrets', () => {
      const registry: Registry = {
        version: '2.0',
        servers: {
          'test-server': {
            source: 'pkg',
            package: 'test',
            env: {
              API_KEY: 'sk_live_1234567890abcdef',
            },
          },
        },
      };

      const detections = detector.scanRegistry(registry);
      expect(detections.length).toBeGreaterThan(0);
    });

    it('should handle registries without secrets', () => {
      const registry: Registry = {
        version: '2.0',
        servers: {
          'test-server': {
            source: 'pkg',
            package: 'test',
          },
        },
      };

      const detections = detector.scanRegistry(registry);
      // May still detect sensitive field names, but no high-severity secrets
      const highSeverity = detections.filter((d) => d.severity === 'high');
      expect(highSeverity.length).toBe(0);
    });
  });

  describe('generateReport', () => {
    it('should generate summary report', () => {
      const detections = [
        {
          pattern: 'API Key',
          location: 'env.API_KEY',
          severity: 'high' as const,
          description: 'API key detected',
        },
        {
          pattern: 'Sensitive Field Name',
          location: 'env.password',
          severity: 'medium' as const,
          description: 'Sensitive field',
        },
        {
          pattern: 'Base64 String',
          location: 'env.token',
          severity: 'low' as const,
          description: 'Base64 string',
        },
      ];

      const report = detector.generateReport(detections);

      expect(report.summary.high).toBe(1);
      expect(report.summary.medium).toBe(1);
      expect(report.summary.low).toBe(1);
      expect(report.summary.total).toBe(3);
    });
  });
});
