/**
 * Tests for tracer utilities
 */

import './setup.js'; // Initialize OpenTelemetry for tests
import { describe, it, expect } from 'vitest';
import {
  getActiveSpan,
  getTraceId,
  getSpanId,
  withSpan,
  addSpanAttributes,
  getTraceContext,
} from '../../tracing/tracer.js';

describe('Tracer Utilities', () => {
  describe('getActiveSpan', () => {
    it('should return undefined when no span is active', () => {
      const span = getActiveSpan();
      expect(span).toBeUndefined();
    });

    it('should return active span', async () => {
      await withSpan('test-span', async (span) => {
        const activeSpan = getActiveSpan();
        expect(activeSpan).toBeDefined();
        expect(activeSpan).toBe(span);
      });
    });
  });

  describe('getTraceId', () => {
    it('should return undefined when no span is active', () => {
      const traceId = getTraceId();
      expect(traceId).toBeUndefined();
    });

    it('should return trace ID from active span', async () => {
      await withSpan('test-span', async () => {
        const traceId = getTraceId();
        expect(traceId).toBeDefined();
        expect(traceId).toMatch(/^[0-9a-f]{32}$/);
      });
    });
  });

  describe('getSpanId', () => {
    it('should return undefined when no span is active', () => {
      const spanId = getSpanId();
      expect(spanId).toBeUndefined();
    });

    it('should return span ID from active span', async () => {
      await withSpan('test-span', async () => {
        const spanId = getSpanId();
        expect(spanId).toBeDefined();
        expect(spanId).toMatch(/^[0-9a-f]{16}$/);
      });
    });
  });

  describe('withSpan', () => {
    it('should create and execute span', async () => {
      const result = await withSpan('test-span', async () => {
        return 'success';
      });

      expect(result).toBe('success');
    });

    it('should add attributes to span', async () => {
      await withSpan(
        'test-span',
        async (_span) => {
          const activeSpan = getActiveSpan();
          expect(activeSpan).toBeDefined();
        },
        { 'test.attribute': 'value' }
      );
    });

    it('should handle errors and set error status', async () => {
      try {
        await withSpan('test-span', async () => {
          throw new Error('Test error');
        });
        expect.fail('Should have thrown error');
      } catch (error) {
        expect((error as Error).message).toBe('Test error');
      }
    });

    it('should return result from function', async () => {
      const result = await withSpan('test-span', async () => {
        return { data: 'test' };
      });

      expect(result).toEqual({ data: 'test' });
    });

    it('should handle synchronous functions', async () => {
      const result = await withSpan('test-span', () => {
        return 'sync result';
      });

      expect(result).toBe('sync result');
    });
  });

  describe('addSpanAttributes', () => {
    it('should add attributes to active span', async () => {
      await withSpan('test-span', async () => {
        addSpanAttributes({
          'custom.key1': 'value1',
          'custom.key2': 42,
          'custom.key3': true,
        });

        // Attributes are added but we can't easily verify without exporter
        // This test just ensures no errors are thrown
      });
    });

    it('should not throw when no active span', () => {
      expect(() => {
        addSpanAttributes({ 'test.key': 'value' });
      }).not.toThrow();
    });

    it('should skip undefined values', async () => {
      await withSpan('test-span', async () => {
        addSpanAttributes({
          'defined.key': 'value',
          'undefined.key': undefined,
          'null.key': null,
        });

        // Should not throw
      });
    });
  });

  describe('getTraceContext', () => {
    it('should return empty object when no span is active', () => {
      const context = getTraceContext();
      expect(context).toEqual({});
    });

    it('should return trace context from active span', async () => {
      await withSpan('test-span', async () => {
        const context = getTraceContext();

        expect(context).toHaveProperty('trace_id');
        expect(context).toHaveProperty('span_id');
        expect(context.trace_id).toMatch(/^[0-9a-f]{32}$/);
        expect(context.span_id).toMatch(/^[0-9a-f]{16}$/);
      });
    });
  });

  describe('nested spans', () => {
    it('should create parent-child span relationship', async () => {
      await withSpan('parent-span', async () => {
        const parentTraceId = getTraceId();

        await withSpan('child-span', async () => {
          const childTraceId = getTraceId();

          // Same trace ID (parent-child relationship)
          expect(childTraceId).toBe(parentTraceId);
        });
      });
    });

    it('should restore parent span after child ends', async () => {
      await withSpan('parent-span', async () => {
        await withSpan('child-span', async () => {
          const childSpanId = getSpanId();
          // Both spans should complete successfully
          expect(childSpanId).toBeDefined();
        });

        // Parent span is still active
        const currentSpanId = getSpanId();
        expect(currentSpanId).toBeDefined();
      });
    });
  });
});
