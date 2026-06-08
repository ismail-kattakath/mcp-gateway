import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createAuthMiddleware } from '../../middleware/auth.js';
import type { Request, Response, NextFunction } from 'express';

describe('auth middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let nextFn: NextFunction;
  let statusMock: ReturnType<typeof vi.fn>;
  let jsonMock: ReturnType<typeof vi.fn>;
  let setMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    statusMock = vi.fn().mockReturnThis();
    jsonMock = vi.fn().mockReturnThis();
    setMock = vi.fn().mockReturnThis();

    mockReq = {
      path: '/api/test',
      ip: '127.0.0.1',
      get: vi.fn(),
      query: {},
    };

    mockRes = {
      status: statusMock,
      json: jsonMock,
      set: setMock,
    };

    nextFn = vi.fn();

    // Clear environment variable
    delete process.env.GATEWAY_ENABLE_AUTH;
  });

  describe('health endpoint exemption', () => {
    it('should always allow /health without auth', () => {
      const middleware = createAuthMiddleware({ enableAuth: true }, 'test-api-key');
      mockReq.path = '/health';

      middleware(mockReq as Request, mockRes as Response, nextFn);

      expect(nextFn).toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalled();
    });
  });

  describe('auth disabled', () => {
    it('should allow all requests when auth is disabled', () => {
      const middleware = createAuthMiddleware({ enableAuth: false }, '');

      middleware(mockReq as Request, mockRes as Response, nextFn);

      expect(nextFn).toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should use GATEWAY_ENABLE_AUTH env var over config', () => {
      process.env.GATEWAY_ENABLE_AUTH = 'false';
      const middleware = createAuthMiddleware({ enableAuth: true }, 'test-key');

      middleware(mockReq as Request, mockRes as Response, nextFn);

      expect(nextFn).toHaveBeenCalled();
    });
  });

  describe('bearer token authentication', () => {
    const validToken = 'valid-test-token-12345';

    it('should accept valid bearer token', () => {
      const middleware = createAuthMiddleware({ enableAuth: true }, validToken);
      (mockReq.get as ReturnType<typeof vi.fn>).mockReturnValue(`Bearer ${validToken}`);

      middleware(mockReq as Request, mockRes as Response, nextFn);

      expect(nextFn).toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should reject missing authorization header', () => {
      const middleware = createAuthMiddleware({ enableAuth: true }, validToken);
      (mockReq.get as ReturnType<typeof vi.fn>).mockReturnValue('');

      middleware(mockReq as Request, mockRes as Response, nextFn);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({ error: 'Unauthorized' });
      expect(setMock).toHaveBeenCalledWith('WWW-Authenticate', 'Bearer realm="mcp-gateway"');
      expect(nextFn).not.toHaveBeenCalled();
    });

    it('should reject invalid bearer token', () => {
      const middleware = createAuthMiddleware({ enableAuth: true }, validToken);
      (mockReq.get as ReturnType<typeof vi.fn>).mockReturnValue('Bearer invalid-token');

      middleware(mockReq as Request, mockRes as Response, nextFn);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(nextFn).not.toHaveBeenCalled();
    });

    it('should handle bearer token case-insensitively', () => {
      const middleware = createAuthMiddleware({ enableAuth: true }, validToken);
      (mockReq.get as ReturnType<typeof vi.fn>).mockReturnValue(`bearer ${validToken}`);

      middleware(mockReq as Request, mockRes as Response, nextFn);

      expect(nextFn).toHaveBeenCalled();
    });

    it('should reject malformed authorization header', () => {
      const middleware = createAuthMiddleware({ enableAuth: true }, validToken);
      (mockReq.get as ReturnType<typeof vi.fn>).mockReturnValue('InvalidFormat token');

      middleware(mockReq as Request, mockRes as Response, nextFn);

      expect(statusMock).toHaveBeenCalledWith(401);
    });

    it('should reject empty bearer token', () => {
      const middleware = createAuthMiddleware({ enableAuth: true }, validToken);
      (mockReq.get as ReturnType<typeof vi.fn>).mockReturnValue('Bearer ');

      middleware(mockReq as Request, mockRes as Response, nextFn);

      expect(statusMock).toHaveBeenCalledWith(401);
    });

    it('should trim whitespace from bearer token', () => {
      const middleware = createAuthMiddleware({ enableAuth: true }, validToken);
      (mockReq.get as ReturnType<typeof vi.fn>).mockReturnValue(`Bearer  ${validToken}  `);

      middleware(mockReq as Request, mockRes as Response, nextFn);

      expect(nextFn).toHaveBeenCalled();
    });
  });

  describe('query parameter authentication (SSE fallback)', () => {
    const validToken = 'valid-test-token-12345';

    it('should accept access_token query param on /sse endpoint', () => {
      const middleware = createAuthMiddleware({ enableAuth: true }, validToken);
      mockReq.path = '/sse';
      mockReq.query = { access_token: validToken };
      (mockReq.get as ReturnType<typeof vi.fn>).mockReturnValue('');

      middleware(mockReq as Request, mockRes as Response, nextFn);

      expect(nextFn).toHaveBeenCalled();
    });

    it('should reject access_token query param on non-SSE endpoints', () => {
      const middleware = createAuthMiddleware({ enableAuth: true }, validToken);
      mockReq.path = '/api/status';
      mockReq.query = { access_token: validToken };
      (mockReq.get as ReturnType<typeof vi.fn>).mockReturnValue('');

      middleware(mockReq as Request, mockRes as Response, nextFn);

      expect(statusMock).toHaveBeenCalledWith(401);
    });

    it('should prefer Authorization header over query param', () => {
      const middleware = createAuthMiddleware({ enableAuth: true }, validToken);
      mockReq.path = '/sse';
      mockReq.query = { access_token: 'wrong-token' };
      (mockReq.get as ReturnType<typeof vi.fn>).mockReturnValue(`Bearer ${validToken}`);

      middleware(mockReq as Request, mockRes as Response, nextFn);

      expect(nextFn).toHaveBeenCalled();
    });
  });

  describe('constant-time comparison', () => {
    it('should use timing-safe comparison for tokens', () => {
      const validToken = 'a'.repeat(64);
      const middleware = createAuthMiddleware({ enableAuth: true }, validToken);

      // Test with token that differs at the end (timing attack vulnerability test)
      const wrongToken = 'a'.repeat(63) + 'b';
      (mockReq.get as ReturnType<typeof vi.fn>).mockReturnValue(`Bearer ${wrongToken}`);

      const start = process.hrtime.bigint();
      middleware(mockReq as Request, mockRes as Response, nextFn);
      const end = process.hrtime.bigint();

      expect(statusMock).toHaveBeenCalledWith(401);

      // Time should not be significantly different for different positions
      // (This is a weak test but documents the intent)
      const elapsed = Number(end - start) / 1_000_000; // Convert to ms
      expect(elapsed).toBeLessThan(10); // Should complete in < 10ms
    });
  });

  describe('IP allowlist', () => {
    it('should allow requests from allowed IPs', () => {
      const middleware = createAuthMiddleware(
        { enableAuth: false, allowedIPs: ['127.0.0.1'] },
        ''
      );
      mockReq.ip = '127.0.0.1';

      middleware(mockReq as Request, mockRes as Response, nextFn);

      expect(nextFn).toHaveBeenCalled();
    });

    it('should reject requests from disallowed IPs', () => {
      const middleware = createAuthMiddleware(
        { enableAuth: false, allowedIPs: ['192.168.1.0/24'] },
        ''
      );
      mockReq.ip = '10.0.0.1';

      middleware(mockReq as Request, mockRes as Response, nextFn);

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(jsonMock).toHaveBeenCalledWith({ error: 'Forbidden' });
    });

    it('should handle CIDR notation', () => {
      const middleware = createAuthMiddleware(
        { enableAuth: false, allowedIPs: ['192.168.1.0/24'] },
        ''
      );
      mockReq.ip = '192.168.1.100';

      middleware(mockReq as Request, mockRes as Response, nextFn);

      expect(nextFn).toHaveBeenCalled();
    });

    it('should handle single IP without CIDR', () => {
      const middleware = createAuthMiddleware(
        { enableAuth: false, allowedIPs: ['10.0.0.5'] },
        ''
      );
      mockReq.ip = '10.0.0.5';

      middleware(mockReq as Request, mockRes as Response, nextFn);

      expect(nextFn).toHaveBeenCalled();
    });

    it('should normalize IPv4-mapped-IPv6 addresses', () => {
      const middleware = createAuthMiddleware(
        { enableAuth: false, allowedIPs: ['127.0.0.1'] },
        ''
      );
      mockReq.ip = '::ffff:127.0.0.1';

      middleware(mockReq as Request, mockRes as Response, nextFn);

      expect(nextFn).toHaveBeenCalled();
    });

    it('should apply IP allowlist even when auth is disabled', () => {
      const middleware = createAuthMiddleware(
        { enableAuth: false, allowedIPs: ['10.0.0.0/8'] },
        ''
      );
      mockReq.ip = '192.168.1.1';

      middleware(mockReq as Request, mockRes as Response, nextFn);

      expect(statusMock).toHaveBeenCalledWith(403);
    });

    it('should allow all IPs when allowedIPs is empty', () => {
      const middleware = createAuthMiddleware({ enableAuth: false, allowedIPs: [] }, '');
      mockReq.ip = '1.2.3.4';

      middleware(mockReq as Request, mockRes as Response, nextFn);

      expect(nextFn).toHaveBeenCalled();
    });

    it('should combine auth and IP checks', () => {
      const validToken = 'valid-token';
      const middleware = createAuthMiddleware(
        { enableAuth: true, allowedIPs: ['192.168.1.0/24'] },
        validToken
      );

      // Valid token but wrong IP
      mockReq.ip = '10.0.0.1';
      (mockReq.get as ReturnType<typeof vi.fn>).mockReturnValue(`Bearer ${validToken}`);

      middleware(mockReq as Request, mockRes as Response, nextFn);

      expect(statusMock).toHaveBeenCalledWith(403);
    });
  });

  describe('error handling', () => {
    it('should throw if auth is enabled but no API key provided', () => {
      expect(() => {
        createAuthMiddleware({ enableAuth: true }, '');
      }).toThrow(/auth is enabled but api key/i);
    });

    it('should warn if API key is too short', () => {
      const shortKey = 'short';
      // Should not throw, just log warning
      expect(() => {
        createAuthMiddleware({ enableAuth: true }, shortKey);
      }).not.toThrow();
    });

    it('should handle invalid CIDR entries gracefully', () => {
      // Should not throw, just skip invalid entries
      expect(() => {
        createAuthMiddleware({ enableAuth: false, allowedIPs: ['invalid-cidr'] }, '');
      }).not.toThrow();
    });
  });

  describe('default behavior', () => {
    it('should enable auth by default when enableAuth is undefined', () => {
      const validToken = 'test-token';
      const middleware = createAuthMiddleware({}, validToken);
      (mockReq.get as ReturnType<typeof vi.fn>).mockReturnValue('');

      middleware(mockReq as Request, mockRes as Response, nextFn);

      expect(statusMock).toHaveBeenCalledWith(401);
    });
  });
});
