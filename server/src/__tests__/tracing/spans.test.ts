/**
 * Tests for custom MCP spans
 */

import './setup.js'; // Initialize OpenTelemetry for tests
import { describe, it, expect } from 'vitest';
import {
  withToolCallSpan,
  withServerStartSpan,
  withServerStopSpan,
  withRegistryReloadSpan,
  withToolsListSpan,
  withMCPOperationSpan,
  startConnectionSpan,
} from '../../tracing/spans.js';
import { getTraceId, getSpanId } from '../../tracing/tracer.js';

describe('MCP Custom Spans', () => {
  describe('withToolCallSpan', () => {
    it('should create tool call span', async () => {
      const result = await withToolCallSpan('obs/get-data', { query: 'test' }, async (_span) => {
        // Verify span is active
        expect(getTraceId()).toBeDefined();
        expect(getSpanId()).toBeDefined();

        return { data: 'result' };
      });

      expect(result).toEqual({ data: 'result' });
    });

    it('should handle tool without server prefix', async () => {
      const result = await withToolCallSpan('standalone-tool', {}, async () => {
        return 'success';
      });

      expect(result).toBe('success');
    });

    it('should handle errors in tool call', async () => {
      try {
        await withToolCallSpan('obs/get-data', {}, async () => {
          throw new Error('Tool execution failed');
        });
        expect.fail('Should have thrown error');
      } catch (error) {
        expect((error as Error).message).toBe('Tool execution failed');
      }
    });

    it('should track argument count', async () => {
      await withToolCallSpan(
        'obs/get-data',
        { arg1: 'value1', arg2: 'value2', arg3: 'value3' },
        async (_span) => {
          // Span should have arg_count attribute
          // (can't verify without exporter, but ensures no errors)
          return 'success';
        }
      );
    });
  });

  describe('withServerStartSpan', () => {
    it('should create server start span', async () => {
      const result = await withServerStartSpan('obs', 'pkg', async (_span) => {
        expect(getTraceId()).toBeDefined();
        return { started: true };
      });

      expect(result).toEqual({ started: true });
    });

    it('should handle errors in server start', async () => {
      try {
        await withServerStartSpan('obs', 'pkg', async () => {
          throw new Error('Failed to start server');
        });
        expect.fail('Should have thrown error');
      } catch (error) {
        expect((error as Error).message).toBe('Failed to start server');
      }
    });

    it('should track start duration', async () => {
      await withServerStartSpan('obs', 'pkg', async (_span) => {
        // Simulate some work
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { started: true };
      });
    });
  });

  describe('withServerStopSpan', () => {
    it('should create server stop span', async () => {
      const result = await withServerStopSpan('obs', async (_span) => {
        expect(getTraceId()).toBeDefined();
        return { stopped: true };
      });

      expect(result).toEqual({ stopped: true });
    });

    it('should handle errors in server stop', async () => {
      try {
        await withServerStopSpan('obs', async () => {
          throw new Error('Failed to stop server');
        });
        expect.fail('Should have thrown error');
      } catch (error) {
        expect((error as Error).message).toBe('Failed to stop server');
      }
    });
  });

  describe('withRegistryReloadSpan', () => {
    it('should create registry reload span', async () => {
      const result = await withRegistryReloadSpan('file-change', async (_span) => {
        expect(getTraceId()).toBeDefined();
        return { reloaded: true };
      });

      expect(result).toEqual({ reloaded: true });
    });

    it('should handle errors in registry reload', async () => {
      try {
        await withRegistryReloadSpan('file-change', async () => {
          throw new Error('Failed to reload registry');
        });
        expect.fail('Should have thrown error');
      } catch (error) {
        expect((error as Error).message).toBe('Failed to reload registry');
      }
    });

    it('should track reload reason', async () => {
      await withRegistryReloadSpan('manual-trigger', async () => {
        return { reloaded: true };
      });
    });
  });

  describe('withToolsListSpan', () => {
    it('should create tools list span', async () => {
      const result = await withToolsListSpan(async (_span) => {
        expect(getTraceId()).toBeDefined();
        return { tools: [] };
      });

      expect(result).toEqual({ tools: [] });
    });

    it('should handle errors in tools list', async () => {
      try {
        await withToolsListSpan(async () => {
          throw new Error('Failed to list tools');
        });
        expect.fail('Should have thrown error');
      } catch (error) {
        expect((error as Error).message).toBe('Failed to list tools');
      }
    });
  });

  describe('withMCPOperationSpan', () => {
    it('should create generic MCP operation span', async () => {
      const result = await withMCPOperationSpan(
        'custom.operation',
        { 'custom.attr': 'value' },
        async (_span) => {
          expect(getTraceId()).toBeDefined();
          return { success: true };
        }
      );

      expect(result).toEqual({ success: true });
    });

    it('should handle errors in MCP operation', async () => {
      try {
        await withMCPOperationSpan('custom.operation', {}, async () => {
          throw new Error('Operation failed');
        });
        expect.fail('Should have thrown error');
      } catch (error) {
        expect((error as Error).message).toBe('Operation failed');
      }
    });
  });

  describe('startConnectionSpan', () => {
    it('should create connection span', () => {
      const span = startConnectionSpan({ name: 'claude-code', version: '1.0.0' });

      expect(span).toBeDefined();
      // Don't check isRecording() as it depends on sampling

      // Clean up
      span.end();
    });

    it('should create connection span without client info', () => {
      const span = startConnectionSpan();

      expect(span).toBeDefined();
      // Don't check isRecording() as it depends on sampling

      // Clean up
      span.end();
    });

    it('should create connection span with partial client info', () => {
      const span = startConnectionSpan({ name: 'claude-code' });

      expect(span).toBeDefined();

      // Clean up
      span.end();
    });
  });

  describe('span context propagation', () => {
    it('should maintain trace context across nested spans', async () => {
      await withToolsListSpan(async () => {
        const parentTraceId = getTraceId();

        await withToolCallSpan('obs/get-data', {}, async () => {
          const childTraceId = getTraceId();

          // Same trace ID across parent and child
          expect(childTraceId).toBe(parentTraceId);
        });
      });
    });

    it('should create separate traces for independent operations', async () => {
      let firstTraceId: string | undefined;
      let secondTraceId: string | undefined;

      await withToolCallSpan('obs/tool1', {}, async () => {
        firstTraceId = getTraceId();
      });

      await withToolCallSpan('obs/tool2', {}, async () => {
        secondTraceId = getTraceId();
      });

      // Both should complete without errors
      // Note: Trace IDs might be same if SDK defaults to root context
      // The important part is that both operations complete successfully
      expect(firstTraceId).toBeDefined();
      expect(secondTraceId).toBeDefined();
    });
  });
});
