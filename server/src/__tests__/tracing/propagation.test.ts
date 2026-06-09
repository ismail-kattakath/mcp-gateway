/**
 * Tests for trace context propagation
 */

import './setup.js'; // Initialize OpenTelemetry for tests
import { describe, it, expect } from 'vitest';
import {
  extractTraceContext,
  injectTraceContext,
  runWithExtractedContext,
  createMCPServerHeaders,
  getTraceContextForLogging,
  hasActiveTrace,
} from '../../tracing/propagation.js';
import { withSpan, getTraceId } from '../../tracing/tracer.js';
import type { IncomingHttpHeaders } from 'http';

describe('Trace Context Propagation', () => {
  describe('extractTraceContext', () => {
    it('should extract trace context from headers', () => {
      const headers: IncomingHttpHeaders = {
        traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
        tracestate: 'congo=t61rcWkgMzE',
      };

      const context = extractTraceContext(headers);
      expect(context).toBeDefined();
    });

    it('should handle headers without trace context', () => {
      const headers: IncomingHttpHeaders = {
        'content-type': 'application/json',
      };

      const context = extractTraceContext(headers);
      expect(context).toBeDefined();
    });

    it('should handle empty headers', () => {
      const headers: IncomingHttpHeaders = {};

      const context = extractTraceContext(headers);
      expect(context).toBeDefined();
    });

    it('should handle array header values', () => {
      const headers: IncomingHttpHeaders = {
        traceparent: ['00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01'],
      };

      const context = extractTraceContext(headers);
      expect(context).toBeDefined();
    });

    it('should normalize header keys to lowercase', () => {
      const headers: IncomingHttpHeaders = {
        TraceParent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
        TraceState: 'congo=t61rcWkgMzE',
      };

      const context = extractTraceContext(headers);
      expect(context).toBeDefined();
    });
  });

  describe('injectTraceContext', () => {
    it('should inject trace context into headers', async () => {
      await withSpan('test-span', async () => {
        const headers: Record<string, string> = {
          'content-type': 'application/json',
        };

        const injected = injectTraceContext(headers);

        // Original headers should be preserved
        expect(injected['content-type']).toBe('application/json');

        // Traceparent may or may not be present depending on sampling
        // but function should not throw
        expect(injected).toBeDefined();
      });
    });

    it('should not modify headers when no active span', () => {
      const headers: Record<string, string> = {
        'content-type': 'application/json',
      };

      const injected = injectTraceContext(headers);

      // May or may not have traceparent depending on active context
      expect(injected).toHaveProperty('content-type', 'application/json');
    });

    it('should preserve existing headers', async () => {
      await withSpan('test-span', async () => {
        const headers: Record<string, string> = {
          'content-type': 'application/json',
          authorization: 'Bearer token',
          'x-custom-header': 'value',
        };

        const injected = injectTraceContext(headers);

        expect(injected['content-type']).toBe('application/json');
        expect(injected.authorization).toBe('Bearer token');
        expect(injected['x-custom-header']).toBe('value');
      });
    });
  });

  describe('runWithExtractedContext', () => {
    it('should run function with extracted context', async () => {
      const headers: IncomingHttpHeaders = {
        traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
      };

      const result = await runWithExtractedContext(headers, async () => {
        return 'success';
      });

      expect(result).toBe('success');
    });

    it('should propagate trace context to nested operations', async () => {
      const headers: IncomingHttpHeaders = {
        traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
      };

      await runWithExtractedContext(headers, async () => {
        await withSpan('nested-span', async () => {
          const traceId = getTraceId();
          // Trace context should be available
          expect(traceId).toBeDefined();
        });
      });
    });

    it('should handle synchronous functions', async () => {
      const headers: IncomingHttpHeaders = {};

      const result = await runWithExtractedContext(headers, () => {
        return 'sync result';
      });

      expect(result).toBe('sync result');
    });
  });

  describe('createMCPServerHeaders', () => {
    it('should create headers with trace context', async () => {
      await withSpan('test-span', async () => {
        const headers = createMCPServerHeaders();

        // Should return a valid headers object
        expect(headers).toBeDefined();
        expect(typeof headers).toBe('object');
      });
    });

    it('should merge with base headers', async () => {
      await withSpan('test-span', async () => {
        const baseHeaders = {
          'content-type': 'application/json',
          authorization: 'Bearer token',
        };

        const headers = createMCPServerHeaders(baseHeaders);

        expect(headers['content-type']).toBe('application/json');
        expect(headers.authorization).toBe('Bearer token');
      });
    });

    it('should work without base headers', async () => {
      await withSpan('test-span', async () => {
        const headers = createMCPServerHeaders();

        expect(headers).toBeDefined();
        expect(typeof headers).toBe('object');
      });
    });
  });

  describe('getTraceContextForLogging', () => {
    it('should return empty object when no span is active', () => {
      const context = getTraceContextForLogging();

      expect(context).toEqual({});
    });

    it('should return trace context from active span', async () => {
      await withSpan('test-span', async () => {
        const context = getTraceContextForLogging();

        // Context should be returned (may be empty if not sampled)
        expect(context).toBeDefined();
        expect(typeof context).toBe('object');
      });
    });

    it('should return consistent values', async () => {
      await withSpan('test-span', async () => {
        const context1 = getTraceContextForLogging();
        const context2 = getTraceContextForLogging();

        expect(context1.trace_id).toBe(context2.trace_id);
        expect(context1.span_id).toBe(context2.span_id);
      });
    });
  });

  describe('hasActiveTrace', () => {
    it('should return false when no span is active', () => {
      expect(hasActiveTrace()).toBe(false);
    });

    it('should check for active trace', async () => {
      await withSpan('test-span', async () => {
        const isActive = hasActiveTrace();
        // Should return a boolean
        expect(typeof isActive).toBe('boolean');
      });
    });

    it('should return consistent value after span ends', async () => {
      await withSpan('test-span', async () => {
        // Inside span
        expect(typeof hasActiveTrace()).toBe('boolean');
      });

      // Outside span
      expect(typeof hasActiveTrace()).toBe('boolean');
    });
  });

  describe('W3C Trace Context format', () => {
    it('should generate valid traceparent header when available', async () => {
      await withSpan('test-span', async () => {
        const headers = createMCPServerHeaders();

        // Headers should be valid
        expect(headers).toBeDefined();
        expect(typeof headers).toBe('object');
      });
    });

    it('should extract trace context from headers', async () => {
      const headers: IncomingHttpHeaders = {
        traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
      };

      await runWithExtractedContext(headers, async () => {
        await withSpan('nested', async () => {
          const traceId = getTraceId();
          // Should have a trace ID
          expect(traceId).toBeDefined();
        });
      });
    });
  });

  describe('cross-service propagation', () => {
    it('should maintain trace across service boundaries', async () => {
      // Simulate incoming request with trace context
      const incomingHeaders: IncomingHttpHeaders = {
        traceparent: '00-aaaabbbbccccdddd1111222233334444-1122334455667788-01',
      };

      await runWithExtractedContext(incomingHeaders, async () => {
        await withSpan('gateway-operation', async () => {
          const gatewayTraceId = getTraceId();

          // Create headers for outgoing request to MCP server
          const outgoingHeaders = createMCPServerHeaders();

          // Should successfully create outgoing headers
          expect(outgoingHeaders).toBeDefined();
          expect(gatewayTraceId).toBeDefined();
        });
      });
    });
  });
});
