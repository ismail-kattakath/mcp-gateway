/**
 * Tests for ETag support
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateETag,
  generateWeakETag,
  generateHashETag,
  matchesETag,
  validateETagPrecondition,
  handleConditionalRequest,
} from '../etag.js';
import type { Request, Response } from 'express';

describe('ETag', () => {
  describe('generateETag', () => {
    it('should generate ETag from string', () => {
      const tag = generateETag('test content');
      expect(tag).toBeTypeOf('string');
      // ETag format: "length-base64hash" or just quoted hash
      expect(tag).toMatch(/^"[0-9a-zA-Z\-_+/=]+"$/);
    });

    it('should generate ETag from buffer', () => {
      const buffer = Buffer.from('test content');
      const tag = generateETag(buffer);
      expect(tag).toBeTypeOf('string');
      expect(tag).toMatch(/^"[0-9a-zA-Z\-_+/=]+"$/);
    });

    it('should generate ETag from object', () => {
      const obj = { key: 'value', nested: { data: 'test' } };
      const tag = generateETag(obj);
      expect(tag).toBeTypeOf('string');
      expect(tag).toMatch(/^"[0-9a-zA-Z\-_+/=]+"$/);
    });

    it('should generate consistent ETags for same content', () => {
      const content = 'test content';
      const tag1 = generateETag(content);
      const tag2 = generateETag(content);
      expect(tag1).toBe(tag2);
    });

    it('should generate different ETags for different content', () => {
      const tag1 = generateETag('content1');
      const tag2 = generateETag('content2');
      expect(tag1).not.toBe(tag2);
    });
  });

  describe('generateWeakETag', () => {
    it('should generate weak ETag', () => {
      const tag = generateWeakETag('test content');
      expect(tag).toMatch(/^W\/"[0-9a-zA-Z\-_+/=]+"$/);
    });

    it('should be different from strong ETag', () => {
      const content = 'test content';
      const strongTag = generateETag(content);
      const weakTag = generateWeakETag(content);
      expect(weakTag).not.toBe(strongTag);
      expect(weakTag).toBe(`W/${strongTag}`);
    });
  });

  describe('generateHashETag', () => {
    it('should generate hash-based ETag', () => {
      const obj = { key: 'value' };
      const tag = generateHashETag(obj);
      expect(tag).toBeTypeOf('string');
      expect(tag).toMatch(/^"[0-9a-f]{16}"$/);
    });

    it('should generate consistent ETags for same object', () => {
      const obj = { key: 'value', num: 123 };
      const tag1 = generateHashETag(obj);
      const tag2 = generateHashETag(obj);
      expect(tag1).toBe(tag2);
    });

    it('should generate different ETags for different objects', () => {
      const tag1 = generateHashETag({ key: 'value1' });
      const tag2 = generateHashETag({ key: 'value2' });
      expect(tag1).not.toBe(tag2);
    });
  });

  describe('matchesETag', () => {
    const testTag = '"abc123"';
    let mockReq: Partial<Request>;

    beforeEach(() => {
      mockReq = {
        headers: {},
      };
    });

    it('should return false when If-None-Match is not present', () => {
      expect(matchesETag(mockReq as Request, testTag)).toBe(false);
    });

    it('should match exact ETag', () => {
      mockReq.headers = { 'if-none-match': '"abc123"' };
      expect(matchesETag(mockReq as Request, testTag)).toBe(true);
    });

    it('should not match different ETag', () => {
      mockReq.headers = { 'if-none-match': '"xyz789"' };
      expect(matchesETag(mockReq as Request, testTag)).toBe(false);
    });

    it('should match wildcard', () => {
      mockReq.headers = { 'if-none-match': '*' };
      expect(matchesETag(mockReq as Request, testTag)).toBe(true);
    });

    it('should match one of multiple ETags', () => {
      mockReq.headers = { 'if-none-match': '"xyz789", "abc123", "def456"' };
      expect(matchesETag(mockReq as Request, testTag)).toBe(true);
    });

    it('should match weak ETag', () => {
      mockReq.headers = { 'if-none-match': 'W/"abc123"' };
      expect(matchesETag(mockReq as Request, '"abc123"')).toBe(true);
    });

    it('should match strong against weak', () => {
      mockReq.headers = { 'if-none-match': '"abc123"' };
      expect(matchesETag(mockReq as Request, 'W/"abc123"')).toBe(true);
    });
  });

  describe('validateETagPrecondition', () => {
    const testTag = '"abc123"';
    let mockReq: Partial<Request>;

    beforeEach(() => {
      mockReq = {
        headers: {},
      };
    });

    it('should be valid when If-Match is not present', () => {
      const result = validateETagPrecondition(mockReq as Request, testTag);
      expect(result.valid).toBe(true);
    });

    it('should be valid for wildcard', () => {
      mockReq.headers = { 'if-match': '*' };
      const result = validateETagPrecondition(mockReq as Request, testTag);
      expect(result.valid).toBe(true);
    });

    it('should be valid for matching ETag', () => {
      mockReq.headers = { 'if-match': '"abc123"' };
      const result = validateETagPrecondition(mockReq as Request, testTag);
      expect(result.valid).toBe(true);
    });

    it('should be invalid for non-matching ETag', () => {
      mockReq.headers = { 'if-match': '"xyz789"' };
      const result = validateETagPrecondition(mockReq as Request, testTag);
      expect(result.valid).toBe(false);
      expect(result.status).toBe(412);
      expect(result.error).toContain('Precondition Failed');
    });

    it('should be valid when one of multiple ETags matches', () => {
      mockReq.headers = { 'if-match': '"xyz789", "abc123", "def456"' };
      const result = validateETagPrecondition(mockReq as Request, testTag);
      expect(result.valid).toBe(true);
    });
  });

  describe('handleConditionalRequest', () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;

    beforeEach(() => {
      mockReq = {
        headers: {},
        path: '/test',
      };
      mockRes = {
        setHeader: vi.fn(),
        status: vi.fn().mockReturnThis(),
        send: vi.fn(),
        json: vi.fn(),
      };
    });

    it('should return false for non-matching ETag', () => {
      const content = 'test content';
      const result = handleConditionalRequest(mockReq as Request, mockRes as Response, content);

      expect(result).toBe(false);
      expect(mockRes.setHeader).toHaveBeenCalledWith('ETag', expect.any(String));
    });

    it('should return true and send 304 for matching If-None-Match', () => {
      const content = 'test content';
      const tag = generateETag(content);
      mockReq.headers = { 'if-none-match': tag };

      const result = handleConditionalRequest(mockReq as Request, mockRes as Response, content);

      expect(result).toBe(true);
      expect(mockRes.status).toHaveBeenCalledWith(304);
      expect(mockRes.send).toHaveBeenCalled();
    });

    it('should return true and send 412 for failing If-Match precondition', () => {
      const content = 'test content';
      mockReq.headers = { 'if-match': '"nonmatching"' };

      const result = handleConditionalRequest(mockReq as Request, mockRes as Response, content);

      expect(result).toBe(true);
      expect(mockRes.status).toHaveBeenCalledWith(412);
      expect(mockRes.json).toHaveBeenCalledWith({ error: expect.any(String) });
    });
  });
});
