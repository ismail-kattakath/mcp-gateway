import { describe, it, expect } from 'vitest';
import {
  sanitizeString,
  sanitizeServerName,
  sanitizeUrl,
  sanitizeArgs,
  sanitizeEnv,
  sanitizeError,
  sanitizeIp,
  sanitizePath,
  sanitizeObject,
} from '../../logging/sanitizer.js';

describe('sanitizer', () => {
  describe('sanitizeString', () => {
    it('should remove control characters', () => {
      const input = 'test\nvalue\rwith\x00nulls';
      const result = sanitizeString(input);
      expect(result).not.toContain('\n');
      expect(result).not.toContain('\r');
      expect(result).not.toContain('\x00');
    });

    it('should truncate long strings', () => {
      const input = 'a'.repeat(500);
      const result = sanitizeString(input, 100);
      expect(result.length).toBeLessThanOrEqual(120); // includes truncation suffix
      expect(result).toContain('[truncated]');
    });

    it('should redact API keys', () => {
      const input = 'My api_key is secret123';
      const result = sanitizeString(input);
      expect(result).toContain('[REDACTED_API_KEY]');
      expect(result).not.toContain('secret123');
    });

    it('should redact bearer tokens', () => {
      const input = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test';
      const result = sanitizeString(input);
      expect(result).toContain('[REDACTED]');
    });

    it('should redact JWT tokens', () => {
      const input =
        'Token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
      const result = sanitizeString(input);
      expect(result).toContain('[REDACTED_JWT]');
    });

    it('should redact AWS keys', () => {
      const input = 'Access key: AKIAIOSFODNN7EXAMPLE';
      const result = sanitizeString(input);
      expect(result).toContain('[REDACTED_AWS_KEY]');
    });

    it('should redact GitHub tokens', () => {
      const input = 'Token: ghp_1234567890abcdefghijklmnopqrstuv';
      const result = sanitizeString(input);
      expect(result).toContain('[REDACTED_GITHUB_TOKEN]');
    });
  });

  describe('sanitizeServerName', () => {
    it('should allow valid server names', () => {
      expect(sanitizeServerName('my-server-123')).toBe('my-server-123');
      expect(sanitizeServerName('test_server')).toBe('test_server');
    });

    it('should sanitize invalid server names', () => {
      const result = sanitizeServerName('../../etc/passwd');
      expect(result).toBe('[INVALID_SERVER_NAME]');
    });

    it('should handle non-string input', () => {
      expect(sanitizeServerName(123)).toBe('[INVALID_SERVER_NAME]');
      expect(sanitizeServerName(null)).toBe('[INVALID_SERVER_NAME]');
    });
  });

  describe('sanitizeUrl', () => {
    it('should remove credentials from URLs', () => {
      const input = 'https://user:pass@example.com/path';
      const result = sanitizeUrl(input);
      expect(result).toBe('https://example.com/path');
      expect(result).not.toContain('user');
      expect(result).not.toContain('pass');
    });

    it('should remove query parameters', () => {
      const input = 'https://api.example.com/users?token=secret123';
      const result = sanitizeUrl(input);
      expect(result).toBe('https://api.example.com/users');
      expect(result).not.toContain('token');
    });

    it('should handle invalid URLs', () => {
      const result = sanitizeUrl('not a url');
      expect(result).not.toBe('not a url');
    });
  });

  describe('sanitizeArgs', () => {
    it('should redact password flags', () => {
      const args = ['--username=admin', '--password=secret123'];
      const result = sanitizeArgs(args);
      expect(result).toContain('--password=[REDACTED]');
      expect(result[1]).not.toContain('secret123');
    });

    it('should redact token flags', () => {
      const args = ['--token=abc123'];
      const result = sanitizeArgs(args);
      expect(result).toContain('--token=[REDACTED]');
    });

    it('should sanitize non-flag arguments', () => {
      const args = ['command', 'arg\nwith\nnewlines'];
      const result = sanitizeArgs(args);
      expect(result[1]).not.toContain('\n');
    });

    it('should handle non-array input', () => {
      expect(sanitizeArgs('not an array')).toEqual(['[INVALID_ARGS]']);
    });
  });

  describe('sanitizeEnv', () => {
    it('should redact sensitive environment variables', () => {
      const env = {
        NODE_ENV: 'production',
        API_KEY: 'secret123',
        AWS_SECRET_ACCESS_KEY: 'secret456',
        DATABASE_PASSWORD: 'secret789',
        SAFE_VALUE: 'visible',
      };
      const result = sanitizeEnv(env);

      expect(result.NODE_ENV).toBe('production');
      expect(result.SAFE_VALUE).toBe('visible');
      expect(result.API_KEY).toBe('[REDACTED]');
      expect(result.AWS_SECRET_ACCESS_KEY).toBe('[REDACTED]');
      expect(result.DATABASE_PASSWORD).toBe('[REDACTED]');
    });
  });

  describe('sanitizeError', () => {
    it('should sanitize Error objects', () => {
      const error = new Error('Database connection failed: password=secret123');
      const result = sanitizeError(error);

      expect(result.message).toBeDefined();
      expect(result.name).toBe('Error');
      expect(result.message).not.toContain('secret123');
    });

    it('should handle non-Error values', () => {
      const result = sanitizeError('String error');
      expect(result.message).toBe('String error');
    });

    it('should include stack trace in non-production', () => {
      const oldEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const error = new Error('Test error');
      const result = sanitizeError(error);

      expect(result.stack).toBeDefined();
      process.env.NODE_ENV = oldEnv;
    });
  });

  describe('sanitizeIp', () => {
    it('should mask IPv4 addresses', () => {
      expect(sanitizeIp('192.168.1.100')).toBe('192.168.1.xxx');
      expect(sanitizeIp('10.0.0.5')).toBe('10.0.0.xxx');
    });

    it('should mask IPv6 addresses', () => {
      const result = sanitizeIp('2001:0db8:85a3:0000:0000:8a2e:0370:7334');
      expect(result).toContain('xxxx');
    });

    it('should handle invalid IPs', () => {
      expect(sanitizeIp('not an ip')).toBe('[INVALID_IP]');
      expect(sanitizeIp(12345)).toBe('[INVALID_IP]');
    });
  });

  describe('sanitizePath', () => {
    it('should replace home directory', () => {
      const home = process.env.HOME || '/home/user';
      const result = sanitizePath(`${home}/config/app.json`);
      expect(result).toContain('~');
      expect(result).not.toContain(home);
    });

    it('should replace user directories', () => {
      expect(sanitizePath('/Users/john/documents')).toBe('/Users/[USER]/documents');
      expect(sanitizePath('/home/jane/projects')).toBe('/home/[USER]/projects');
    });

    it('should handle invalid paths', () => {
      expect(sanitizePath(null)).toBe('[INVALID_PATH]');
      expect(sanitizePath({})).toBe('[INVALID_PATH]');
    });
  });

  describe('sanitizeObject', () => {
    it('should sanitize nested objects', () => {
      const input = {
        user: 'admin',
        password: 'secret123',
        config: {
          apiKey: 'key456',
          timeout: 30,
        },
      };
      const result = sanitizeObject(input) as Record<string, unknown>;

      expect(result.user).toBe('admin');
      expect(result.password).toBe('[REDACTED]');
      expect((result.config as Record<string, unknown>).apiKey).toBe('[REDACTED]');
      expect((result.config as Record<string, unknown>).timeout).toBe(30);
    });

    it('should truncate large arrays', () => {
      const input = { items: new Array(100).fill('item') };
      const result = sanitizeObject(input) as Record<string, unknown>;

      expect(typeof result.items).toBe('string');
      expect(result.items).toContain('truncated');
    });

    it('should truncate large objects', () => {
      const input: Record<string, number> = {};
      for (let i = 0; i < 100; i++) {
        input[`key${i}`] = i;
      }
      const result = sanitizeObject(input);

      expect(typeof result).toBe('string');
      expect(result).toContain('truncated');
    });

    it('should handle circular references by limiting depth', () => {
      const input: Record<string, unknown> = { level: 1 };
      const deep = { level: 2, deeper: { level: 3, deepest: { level: 4, tooDeep: { level: 5 } } } };
      input.nested = deep;

      const result = sanitizeObject(input, 0, 3);
      expect(result).toBeDefined();
    });

    it('should preserve primitives', () => {
      expect(sanitizeObject(null)).toBeNull();
      expect(sanitizeObject(undefined)).toBeUndefined();
      expect(sanitizeObject(123)).toBe(123);
      expect(sanitizeObject(true)).toBe(true);
    });
  });
});
