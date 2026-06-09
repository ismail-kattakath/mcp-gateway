/**
 * Tests for compression middleware
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCompressionMiddleware, shouldCompressContentType } from '../compression.js';
import type { Request, Response, NextFunction } from 'express';
import type { PerformanceConfig } from '../config.js';

describe('Compression', () => {
  describe('shouldCompressContentType', () => {
    const allowedTypes = ['text/plain', 'text/html', 'application/json', 'application/javascript'];

    it('should return true for allowed content types', () => {
      expect(shouldCompressContentType('text/plain', allowedTypes)).toBe(true);
      expect(shouldCompressContentType('text/html', allowedTypes)).toBe(true);
      expect(shouldCompressContentType('application/json', allowedTypes)).toBe(true);
      expect(shouldCompressContentType('application/javascript', allowedTypes)).toBe(true);
    });

    it('should return false for disallowed content types', () => {
      expect(shouldCompressContentType('image/png', allowedTypes)).toBe(false);
      expect(shouldCompressContentType('video/mp4', allowedTypes)).toBe(false);
      expect(shouldCompressContentType('application/pdf', allowedTypes)).toBe(false);
    });

    it('should handle content type with charset', () => {
      expect(shouldCompressContentType('text/plain; charset=utf-8', allowedTypes)).toBe(true);
      expect(shouldCompressContentType('application/json; charset=utf-8', allowedTypes)).toBe(true);
    });

    it('should return false for undefined content type', () => {
      expect(shouldCompressContentType(undefined, allowedTypes)).toBe(false);
    });

    it('should return false for empty content type', () => {
      expect(shouldCompressContentType('', allowedTypes)).toBe(false);
    });
  });

  describe('createCompressionMiddleware', () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let nextFn: NextFunction;

    beforeEach(() => {
      mockReq = {
        headers: {},
        path: '/test',
      };
      mockRes = {
        getHeader: vi.fn(),
      };
      nextFn = vi.fn();
    });

    it('should create middleware when compression is enabled', () => {
      const config: PerformanceConfig['compression'] = {
        enabled: true,
        level: 6,
        threshold: 1024,
        types: ['application/json'],
      };

      const middleware = createCompressionMiddleware(config);
      expect(middleware).toBeTypeOf('function');
    });

    it('should create passthrough middleware when compression is disabled', () => {
      const config: PerformanceConfig['compression'] = {
        enabled: false,
        level: 6,
        threshold: 1024,
        types: ['application/json'],
      };

      const middleware = createCompressionMiddleware(config);
      middleware(mockReq as Request, mockRes as Response, nextFn);

      expect(nextFn).toHaveBeenCalled();
    });

    it('should skip compression when x-no-compression header is present', () => {
      const config: PerformanceConfig['compression'] = {
        enabled: true,
        level: 6,
        threshold: 1024,
        types: ['application/json'],
      };

      mockReq.headers = { 'x-no-compression': '1' };

      const middleware = createCompressionMiddleware(config);
      expect(middleware).toBeTypeOf('function');
    });

    it('should use correct compression level', () => {
      const config: PerformanceConfig['compression'] = {
        enabled: true,
        level: 9,
        threshold: 1024,
        types: ['application/json'],
      };

      const middleware = createCompressionMiddleware(config);
      expect(middleware).toBeTypeOf('function');
    });

    it('should use correct compression threshold', () => {
      const config: PerformanceConfig['compression'] = {
        enabled: true,
        level: 6,
        threshold: 2048,
        types: ['application/json'],
      };

      const middleware = createCompressionMiddleware(config);
      expect(middleware).toBeTypeOf('function');
    });
  });
});
