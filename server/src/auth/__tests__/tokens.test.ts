/**
 * Tests for JWT token generation and verification
 */

import { describe, it, expect } from 'vitest';
import {
  generateAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  generateApiKey,
  isLegacyApiKey,
} from '../tokens.js';

// Set JWT_SECRET for tests
process.env.JWT_SECRET = 'test-secret-key-for-jwt-tokens-minimum-32-chars';

describe('Token Generation', () => {
  it('should generate valid access token', () => {
    const payload = {
      sub: 'user-123',
      username: 'alice',
      role: 'user',
      tenant: null,
    };

    const token = generateAccessToken(payload);

    expect(token).toBeTypeOf('string');
    expect(token.length).toBeGreaterThan(0);
    expect(token.split('.')).toHaveLength(3); // JWT format: header.payload.signature
  });

  it('should generate refresh token with hash', () => {
    const { token, tokenHash, expiresAt } = generateRefreshToken();

    expect(token).toBeTypeOf('string');
    expect(token.length).toBeGreaterThan(0);
    expect(tokenHash).toBeTypeOf('string');
    expect(tokenHash.length).toBe(64); // SHA-256 hex = 64 chars
    expect(expiresAt).toBeInstanceOf(Date);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('should generate API key with long expiry', () => {
    const payload = {
      sub: 'user-123',
      username: 'alice',
      role: 'admin',
      tenant: null,
    };

    const apiKey = generateApiKey(payload);

    expect(apiKey).toBeTypeOf('string');
    expect(apiKey.split('.')).toHaveLength(3);
  });

  it('should hash refresh token consistently', () => {
    const token = 'test-refresh-token-abc123';
    const hash1 = hashRefreshToken(token);
    const hash2 = hashRefreshToken(token);

    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(64);
  });
});

describe('Token Verification', () => {
  it('should verify valid access token', () => {
    const payload = {
      sub: 'user-123',
      username: 'alice',
      role: 'user',
      tenant: null,
    };

    const token = generateAccessToken(payload);
    const decoded = verifyAccessToken(token);

    expect(decoded.sub).toBe(payload.sub);
    expect(decoded.username).toBe(payload.username);
    expect(decoded.role).toBe(payload.role);
  });

  it('should reject invalid token', () => {
    expect(() => verifyAccessToken('invalid-token')).toThrow();
  });

  it('should reject tampered token', () => {
    const payload = {
      sub: 'user-123',
      username: 'alice',
      role: 'user',
      tenant: null,
    };

    const token = generateAccessToken(payload);
    const tampered = token.slice(0, -10) + 'tampered00';

    expect(() => verifyAccessToken(tampered)).toThrow();
  });
});

describe('Legacy API Key Detection', () => {
  it('should detect v2.x API key format', () => {
    const legacyKey = 'a'.repeat(64); // 64 hex chars
    expect(isLegacyApiKey(legacyKey)).toBe(true);
  });

  it('should not detect JWT as legacy key', () => {
    const payload = {
      sub: 'user-123',
      username: 'alice',
      role: 'user',
      tenant: null,
    };

    const jwtToken = generateAccessToken(payload);
    expect(isLegacyApiKey(jwtToken)).toBe(false);
  });

  it('should not detect short string as legacy key', () => {
    expect(isLegacyApiKey('short-key')).toBe(false);
  });
});

describe('Token Claims', () => {
  it('should include correct issuer and audience', () => {
    const payload = {
      sub: 'user-123',
      username: 'alice',
      role: 'admin',
      tenant: 'team-alpha',
    };

    const token = generateAccessToken(payload);
    const decoded = verifyAccessToken(token);

    expect(decoded.sub).toBe('user-123');
    expect(decoded.username).toBe('alice');
    expect(decoded.role).toBe('admin');
    expect(decoded.tenant).toBe('team-alpha');
  });

  it('should handle null tenant', () => {
    const payload = {
      sub: 'user-123',
      username: 'alice',
      role: 'user',
      tenant: null,
    };

    const token = generateAccessToken(payload);
    const decoded = verifyAccessToken(token);

    expect(decoded.tenant).toBeNull();
  });
});
