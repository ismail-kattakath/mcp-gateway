/**
 * Tests for Enhanced Log Sanitization
 */

import { describe, it, expect } from 'vitest';
import {
  sanitizeStringEnhanced,
  sanitizeRequest,
  sanitizeResponse,
  sanitizeErrorEnhanced,
  containsSensitiveData,
} from '../sanitizer.js';

describe('Enhanced Sanitization', () => {
  describe('sanitizeStringEnhanced', () => {
    it('should remove CRLF characters', () => {
      const input = 'Hello\r\nWorld\nTest\r';
      const result = sanitizeStringEnhanced(input);
      expect(result).not.toContain('\r');
      expect(result).not.toContain('\n');
    });

    it('should remove control characters', () => {
      const input = 'Test\x00\x01\x02\x1F\x7F';
      const result = sanitizeStringEnhanced(input);
      expect(result).toBe('Test');
    });

    it('should redact credit card numbers', () => {
      const input = 'Card: 4532-1234-5678-9010';
      const result = sanitizeStringEnhanced(input);
      expect(result).toContain('[REDACTED_CREDIT_CARD]');
      expect(result).not.toContain('4532');
    });

    it('should redact email addresses', () => {
      const input = 'Contact: user@example.com';
      const result = sanitizeStringEnhanced(input);
      expect(result).toContain('[REDACTED_EMAIL]');
      expect(result).not.toContain('user@example.com');
    });

    it('should redact phone numbers', () => {
      const inputs = ['123-456-7890', '(123) 456-7890', '+1 123 456 7890', '1234567890'];

      inputs.forEach((input) => {
        const result = sanitizeStringEnhanced(input);
        expect(result).toContain('[REDACTED_PHONE]');
      });
    });

    it('should redact Stripe API keys', () => {
      const liveKey = 'sk_live_FAKE1234567890TESTKEY';
      const testKey = 'sk_test_FAKE1234567890TESTKEY';

      expect(sanitizeStringEnhanced(liveKey)).toContain('[REDACTED_STRIPE_SECRET]');
      expect(sanitizeStringEnhanced(testKey)).toContain('[REDACTED_STRIPE_TEST]');
    });

    it('should redact AWS credentials', () => {
      const awsKey = 'AKIAIOSFODNN7EXAMPLE';
      const result = sanitizeStringEnhanced(awsKey);
      expect(result).toContain('[REDACTED_AWS_KEY]');
    });

    it('should redact GitHub tokens', () => {
      const token = 'ghp_1234567890abcdefghijklmnopqrst';
      const result = sanitizeStringEnhanced(token);
      expect(result).toContain('[REDACTED_GITHUB_TOKEN]');
    });

    it('should redact JWTs', () => {
      const jwt =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
      const result = sanitizeStringEnhanced(jwt);
      expect(result).toContain('[REDACTED_JWT]');
      expect(result).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    });

    it('should redact private keys', () => {
      const privateKey = `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA1234567890
-----END RSA PRIVATE KEY-----`;
      const result = sanitizeStringEnhanced(privateKey);
      expect(result).toContain('[REDACTED_PRIVATE_KEY]');
    });

    it('should truncate long strings', () => {
      const longString = 'a'.repeat(300);
      const result = sanitizeStringEnhanced(longString, 200);
      expect(result.length).toBeLessThan(300);
      expect(result).toContain('...[truncated]');
    });
  });

  describe('sanitizeRequest', () => {
    it('should sanitize request object', () => {
      const req = {
        id: 'req-123',
        method: 'POST',
        url: '/api/servers',
        ip: '192.168.1.100',
        headers: {
          authorization: 'Bearer secret-token',
          'x-api-key': 'api-key-123',
          'user-agent': 'Mozilla/5.0',
        },
        query: { page: 1, limit: 10 },
        body: { name: 'test-server' },
      };

      const result = sanitizeRequest(req);

      expect(result.method).toBe('POST');
      expect(result.headers.authorization).toBe('[REDACTED]');
      expect(result.headers['x-api-key']).toBe('[REDACTED]');
      expect(result.headers['user-agent']).toContain('Mozilla');
    });

    it('should handle missing fields', () => {
      const req = {};
      const result = sanitizeRequest(req);
      expect(result).toMatchObject({});
    });

    it('should redact cookie headers', () => {
      const req = {
        headers: {
          cookie: 'sessionId=abc123; token=secret',
        },
      };

      const result = sanitizeRequest(req);
      expect(result.headers.cookie).toBe('[REDACTED]');
    });
  });

  describe('sanitizeResponse', () => {
    it('should sanitize response object', () => {
      const res = {
        statusCode: 200,
        getHeaders: () => ({
          'content-type': 'application/json',
          'x-request-id': 'req-123',
        }),
      };

      const result = sanitizeResponse(res);
      expect(result.statusCode).toBe(200);
      expect(result.headers).toBeDefined();
    });

    it('should handle missing getHeaders', () => {
      const res = { statusCode: 404 };
      const result = sanitizeResponse(res);
      expect(result.statusCode).toBe(404);
      expect(result.headers).toEqual({});
    });
  });

  describe('sanitizeErrorEnhanced', () => {
    it('should sanitize Error objects', () => {
      const error = new Error('Database connection failed: password=secret123');
      error.name = 'DatabaseError';
      (error as any).code = 'ECONNREFUSED';

      const result = sanitizeErrorEnhanced(error);

      expect(result.type).toBe('DatabaseError');
      expect(result.message).toContain('Database connection failed');
      expect(result.code).toBe('ECONNREFUSED');
    });

    it('should include stack in non-production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const error = new Error('Test error');
      const result = sanitizeErrorEnhanced(error);

      expect(result.stack).toBeDefined();

      process.env.NODE_ENV = originalEnv;
    });

    it('should exclude stack in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const error = new Error('Test error');
      const result = sanitizeErrorEnhanced(error);

      expect(result.stack).toBeUndefined();

      process.env.NODE_ENV = originalEnv;
    });

    it('should handle non-Error objects', () => {
      const error = 'String error message';
      const result = sanitizeErrorEnhanced(error);

      expect(result.type).toBe('Unknown');
      expect(result.message).toBe('String error message');
    });

    it('should sanitize custom error properties', () => {
      const error: any = new Error('Custom error');
      error.userId = 'user-123';
      error.apiKey = 'secret-key';

      const result = sanitizeErrorEnhanced(error);

      expect(result.userId).toBeDefined();
      expect(result.apiKey).toBe('[REDACTED]');
    });
  });

  describe('containsSensitiveData', () => {
    it('should detect credit card patterns', () => {
      expect(containsSensitiveData('Card: 1234-5678-9012-3456')).toBe(true);
    });

    it('should detect email addresses', () => {
      expect(containsSensitiveData('user@example.com')).toBe(true);
    });

    it('should detect phone numbers', () => {
      expect(containsSensitiveData('Call me at 123-456-7890')).toBe(true);
    });

    it('should detect API keys', () => {
      expect(containsSensitiveData('sk_live_FAKE1234567890TESTKEY')).toBe(true);
      expect(containsSensitiveData('contains api_key here')).toBe(true);
    });

    it('should detect private keys', () => {
      expect(containsSensitiveData('-----BEGIN PRIVATE KEY-----')).toBe(true);
    });

    it('should detect sensitive keywords', () => {
      expect(containsSensitiveData('password: secret123')).toBe(true);
      expect(containsSensitiveData('api_token: xyz')).toBe(true);
    });

    it('should return false for safe strings', () => {
      expect(containsSensitiveData('Hello world')).toBe(false);
      expect(containsSensitiveData('Server started successfully')).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle null and undefined', () => {
      expect(() => sanitizeStringEnhanced(null as any)).not.toThrow();
      expect(() => sanitizeStringEnhanced(undefined as any)).not.toThrow();
    });

    it('should handle empty strings', () => {
      expect(sanitizeStringEnhanced('')).toBe('');
    });

    it('should handle unicode characters', () => {
      const unicode = 'Hello 世界 🌍';
      const result = sanitizeStringEnhanced(unicode);
      expect(result).toContain('Hello');
      expect(result).toContain('世界');
    });

    it('should handle mixed sensitive patterns', () => {
      const mixed =
        'User user@example.com has credit card 1234-5678-9012-3456 and token ghp_abc123';
      const result = sanitizeStringEnhanced(mixed);
      expect(result).toContain('[REDACTED_EMAIL]');
      expect(result).toContain('[REDACTED_CREDIT_CARD]');
      expect(result).toContain('[REDACTED_GITHUB_TOKEN]');
    });
  });
});
