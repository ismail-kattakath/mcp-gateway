/**
 * Input Validator Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InputValidator, ValidationError } from '../../validation/input-validator.js';

describe('InputValidator', () => {
  let validator: InputValidator;

  beforeEach(() => {
    validator = new InputValidator();
  });

  describe('validateServerName', () => {
    it('should accept valid server names', () => {
      expect(validator.validateServerName('my-server')).toBe('my-server');
      expect(validator.validateServerName('server123')).toBe('server123');
      expect(validator.validateServerName('a')).toBe('a');
      expect(validator.validateServerName('my-server-123')).toBe('my-server-123');
    });

    it('should reject uppercase letters', () => {
      expect(() => validator.validateServerName('My-Server')).toThrow(ValidationError);
    });

    it('should reject names starting with hyphen', () => {
      expect(() => validator.validateServerName('-server')).toThrow(ValidationError);
    });

    it('should reject names ending with hyphen', () => {
      expect(() => validator.validateServerName('server-')).toThrow(ValidationError);
    });

    it('should reject names with special characters', () => {
      expect(() => validator.validateServerName('server_name')).toThrow(ValidationError);
      expect(() => validator.validateServerName('server.name')).toThrow(ValidationError);
      expect(() => validator.validateServerName('server@name')).toThrow(ValidationError);
    });

    it('should reject names longer than 64 chars', () => {
      const longName = 'a'.repeat(65);
      expect(() => validator.validateServerName(longName)).toThrow(ValidationError);
    });

    it('should reject non-string inputs', () => {
      expect(() => validator.validateServerName(123 as any)).toThrow(ValidationError);
      expect(() => validator.validateServerName(null as any)).toThrow(ValidationError);
      expect(() => validator.validateServerName(undefined as any)).toThrow(ValidationError);
    });
  });

  describe('validateUrl', () => {
    it('should accept valid HTTP URLs', () => {
      expect(validator.validateUrl('http://example.com')).toBeTruthy();
      expect(validator.validateUrl('https://example.com:8080/path')).toBeTruthy();
    });

    it('should reject dangerous protocols', () => {
      expect(() => validator.validateUrl('file:///etc/passwd')).toThrow(ValidationError);
      expect(() => validator.validateUrl('javascript:alert(1)')).toThrow(ValidationError);
      expect(() => validator.validateUrl('data:text/html,<script>alert(1)</script>')).toThrow(
        ValidationError
      );
    });

    it('should reject localhost in production', () => {
      process.env.NODE_ENV = 'production';
      expect(() => validator.validateUrl('http://localhost:3000')).toThrow(ValidationError);
      expect(() => validator.validateUrl('http://127.0.0.1')).toThrow(ValidationError);
      expect(() => validator.validateUrl('http://0.0.0.0')).toThrow(ValidationError);
      process.env.NODE_ENV = 'test';
    });

    it('should allow localhost in non-production', () => {
      process.env.NODE_ENV = 'development';
      expect(validator.validateUrl('http://localhost:3000')).toBeTruthy();
      process.env.NODE_ENV = 'test';
    });

    it('should reject malformed URLs', () => {
      expect(() => validator.validateUrl('not-a-url')).toThrow(ValidationError);
      expect(() => validator.validateUrl('http://')).toThrow(ValidationError);
    });
  });

  describe('validatePath', () => {
    it('should accept valid paths', () => {
      expect(validator.validatePath('/tmp/file.txt')).toBeTruthy();
      expect(validator.validatePath('./relative/path')).toBeTruthy();
    });

    it('should reject path traversal attempts', () => {
      expect(() => validator.validatePath('../../../etc/passwd')).toThrow(ValidationError);
      expect(() => validator.validatePath('/tmp/../../../etc/passwd')).toThrow(ValidationError);
      expect(() => validator.validatePath('..\\..\\..\\windows\\system32')).toThrow(
        ValidationError
      );
    });

    it('should reject paths with null bytes', () => {
      expect(() => validator.validatePath('/tmp/file\0.txt')).toThrow(ValidationError);
    });

    it('should reject encoded path traversal', () => {
      expect(() => validator.validatePath('/tmp/%2e%2e/etc/passwd')).toThrow(ValidationError);
      expect(() => validator.validatePath('/tmp/%252e%252e/etc/passwd')).toThrow(ValidationError);
    });

    it('should enforce allowedParent constraint', () => {
      expect(() => validator.validatePath('/etc/passwd', '/tmp')).toThrow(ValidationError);
      expect(validator.validatePath('/tmp/file.txt', '/tmp')).toBeTruthy();
    });
  });

  describe('validateArgs', () => {
    it('should accept valid arguments', () => {
      expect(validator.validateArgs(['arg1', 'arg2', '--flag'])).toEqual([
        'arg1',
        'arg2',
        '--flag',
      ]);
    });

    it('should reject command injection patterns', () => {
      expect(() => validator.validateArgs(['arg1', 'arg2 && rm -rf /'])).toThrow(ValidationError);
      expect(() => validator.validateArgs(['arg1', 'arg2 | cat'])).toThrow(ValidationError);
      expect(() => validator.validateArgs(['arg1', 'arg2; ls'])).toThrow(ValidationError);
      expect(() => validator.validateArgs(['arg1', '`whoami`'])).toThrow(ValidationError);
      expect(() => validator.validateArgs(['arg1', '$(whoami)'])).toThrow(ValidationError);
    });

    it('should reject non-array inputs', () => {
      expect(() => validator.validateArgs('not-an-array' as any)).toThrow(ValidationError);
    });

    it('should reject non-string array elements', () => {
      expect(() => validator.validateArgs([1, 2, 3] as any)).toThrow(ValidationError);
    });
  });

  describe('validateEnvKey', () => {
    it('should accept valid environment variable names', () => {
      expect(validator.validateEnvKey('API_KEY')).toBe('API_KEY');
      expect(validator.validateEnvKey('MY_VAR_123')).toBe('MY_VAR_123');
    });

    it('should reject lowercase names', () => {
      expect(() => validator.validateEnvKey('api_key')).toThrow(ValidationError);
    });

    it('should reject names starting with number', () => {
      expect(() => validator.validateEnvKey('123_VAR')).toThrow(ValidationError);
    });

    it('should reject names with hyphens', () => {
      expect(() => validator.validateEnvKey('API-KEY')).toThrow(ValidationError);
    });

    it('should reject names longer than 128 chars', () => {
      const longName = 'A'.repeat(129);
      expect(() => validator.validateEnvKey(longName)).toThrow(ValidationError);
    });
  });

  describe('validateEnvValue', () => {
    it('should accept valid environment variable values', () => {
      expect(validator.validateEnvValue('value123')).toBe('value123');
      expect(validator.validateEnvValue('https://example.com')).toBe('https://example.com');
    });

    it('should reject values with null bytes', () => {
      expect(() => validator.validateEnvValue('value\0with\0nulls')).toThrow(ValidationError);
    });

    it('should reject values longer than 4096 chars', () => {
      const longValue = 'a'.repeat(4097);
      expect(() => validator.validateEnvValue(longValue)).toThrow(ValidationError);
    });
  });

  describe('validateLdapFilter', () => {
    it('should accept valid LDAP filters', () => {
      expect(validator.validateLdapFilter('user123')).toBe('user123');
    });

    it('should reject LDAP special characters', () => {
      expect(() => validator.validateLdapFilter('(cn=user)')).toThrow(ValidationError);
      expect(() => validator.validateLdapFilter('cn=*')).toThrow(ValidationError);
      expect(() => validator.validateLdapFilter('cn=user\\admin')).toThrow(ValidationError);
    });
  });

  describe('validateSqlIdentifier', () => {
    it('should accept valid SQL identifiers', () => {
      expect(validator.validateSqlIdentifier('users')).toBe('users');
      expect(validator.validateSqlIdentifier('user_id')).toBe('user_id');
      expect(validator.validateSqlIdentifier('Column123')).toBe('Column123');
    });

    it('should reject identifiers starting with number', () => {
      expect(() => validator.validateSqlIdentifier('123users')).toThrow(ValidationError);
    });

    it('should reject identifiers with special characters', () => {
      expect(() => validator.validateSqlIdentifier('user-id')).toThrow(ValidationError);
      expect(() => validator.validateSqlIdentifier('user.id')).toThrow(ValidationError);
    });

    it('should reject identifiers longer than 64 chars', () => {
      const longName = 'a'.repeat(65);
      expect(() => validator.validateSqlIdentifier(longName)).toThrow(ValidationError);
    });
  });

  describe('validatePort', () => {
    it('should accept valid ports', () => {
      expect(validator.validatePort(80)).toBe(80);
      expect(validator.validatePort(3000)).toBe(3000);
      expect(validator.validatePort(65535)).toBe(65535);
    });

    it('should accept string ports', () => {
      expect(validator.validatePort('8080')).toBe(8080);
    });

    it('should reject ports out of range', () => {
      expect(() => validator.validatePort(0)).toThrow(ValidationError);
      expect(() => validator.validatePort(65536)).toThrow(ValidationError);
      expect(() => validator.validatePort(-1)).toThrow(ValidationError);
    });

    it('should reject non-numeric ports', () => {
      expect(() => validator.validatePort('not-a-port' as any)).toThrow(ValidationError);
    });
  });

  describe('validateIpAddress', () => {
    it('should accept valid IPv4 addresses', () => {
      expect(validator.validateIpAddress('192.168.1.1')).toBe('192.168.1.1');
      expect(validator.validateIpAddress('127.0.0.1')).toBe('127.0.0.1');
      expect(validator.validateIpAddress('0.0.0.0')).toBe('0.0.0.0');
    });

    it('should accept valid IPv6 addresses', () => {
      expect(validator.validateIpAddress('::1')).toBe('::1');
      expect(validator.validateIpAddress('2001:db8::1')).toBe('2001:db8::1');
    });

    it('should reject invalid IPv4 addresses', () => {
      expect(() => validator.validateIpAddress('256.1.1.1')).toThrow(ValidationError);
      expect(() => validator.validateIpAddress('1.2.3')).toThrow(ValidationError);
    });

    it('should reject non-IP strings', () => {
      expect(() => validator.validateIpAddress('not-an-ip')).toThrow(ValidationError);
    });
  });

  describe('validateEmail', () => {
    it('should accept valid email addresses', () => {
      expect(validator.validateEmail('user@example.com')).toBe('user@example.com');
      expect(validator.validateEmail('test+tag@domain.co.uk')).toBe('test+tag@domain.co.uk');
    });

    it('should reject invalid email formats', () => {
      expect(() => validator.validateEmail('not-an-email')).toThrow(ValidationError);
      expect(() => validator.validateEmail('@example.com')).toThrow(ValidationError);
      expect(() => validator.validateEmail('user@')).toThrow(ValidationError);
    });

    it('should reject emails longer than 254 chars', () => {
      const longEmail = 'a'.repeat(250) + '@example.com';
      expect(() => validator.validateEmail(longEmail)).toThrow(ValidationError);
    });
  });

  describe('validateDockerImage', () => {
    it('should accept valid Docker image names', () => {
      expect(validator.validateDockerImage('nginx')).toBe('nginx');
      expect(validator.validateDockerImage('nginx:latest')).toBe('nginx:latest');
      expect(validator.validateDockerImage('ghcr.io/user/image:v1.0')).toBe(
        'ghcr.io/user/image:v1.0'
      );
    });

    it('should accept images with SHA256 digest', () => {
      const digest = 'a'.repeat(64);
      expect(validator.validateDockerImage(`nginx@sha256:${digest}`)).toBeTruthy();
    });

    it('should reject uppercase image names', () => {
      expect(() => validator.validateDockerImage('NGINX')).toThrow(ValidationError);
      expect(() => validator.validateDockerImage('Nginx:latest')).toThrow(ValidationError);
    });

    it('should reject image names longer than 255 chars', () => {
      const longImage = 'a'.repeat(256);
      expect(() => validator.validateDockerImage(longImage)).toThrow(ValidationError);
    });
  });

  describe('validateGitRepo', () => {
    it('should accept valid Git HTTPS URLs', () => {
      expect(validator.validateGitRepo('https://github.com/user/repo.git')).toBe(
        'https://github.com/user/repo.git'
      );
    });

    it('should accept valid Git SSH URLs', () => {
      expect(validator.validateGitRepo('git@github.com:user/repo.git')).toBe(
        'git@github.com:user/repo.git'
      );
    });

    it('should reject URLs without .git extension', () => {
      expect(() => validator.validateGitRepo('https://github.com/user/repo')).toThrow(
        ValidationError
      );
    });

    it('should reject HTTP URLs', () => {
      expect(() => validator.validateGitRepo('http://github.com/user/repo.git')).toThrow(
        ValidationError
      );
    });
  });

  describe('validateJson', () => {
    it('should validate against registered schema', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
        required: ['name'],
      };

      validator.registerSchema('user', schema);

      expect(() => validator.validateJson({ name: 'John', age: 30 }, 'user')).not.toThrow();
    });

    it('should reject invalid data', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
        required: ['name'],
      };

      validator.registerSchema('user', schema);

      expect(() => validator.validateJson({ age: 30 }, 'user')).toThrow(ValidationError);
    });

    it('should throw for unknown schema', () => {
      expect(() => validator.validateJson({}, 'unknown')).toThrow();
    });
  });
});
