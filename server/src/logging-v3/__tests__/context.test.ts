/**
 * Tests for Request Context Propagation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateRequestId,
  getRequestContext,
  getRequestId,
  runWithContext,
  withContext,
  asyncLocalStorage,
} from '../context.js';

describe('Context Propagation', () => {
  beforeEach(() => {
    // Ensure clean state
  });

  describe('generateRequestId', () => {
    it('should generate UUID v4 format', () => {
      const id = generateRequestId();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    it('should generate unique IDs', () => {
      const id1 = generateRequestId();
      const id2 = generateRequestId();
      expect(id1).not.toBe(id2);
    });
  });

  describe('getRequestContext', () => {
    it('should return undefined outside context', () => {
      const context = getRequestContext();
      expect(context).toBeUndefined();
    });

    it('should return context inside runWithContext', () => {
      runWithContext({ requestId: 'test-123' }, () => {
        const context = getRequestContext();
        expect(context).toBeDefined();
        expect(context?.requestId).toBe('test-123');
      });
    });

    it('should include all context fields', () => {
      runWithContext(
        {
          requestId: 'test-123',
          userId: 'user-456',
          sessionId: 'session-789',
          tenant: 'acme',
        },
        () => {
          const context = getRequestContext();
          expect(context?.requestId).toBe('test-123');
          expect(context?.userId).toBe('user-456');
          expect(context?.sessionId).toBe('session-789');
          expect(context?.tenant).toBe('acme');
        }
      );
    });
  });

  describe('getRequestId', () => {
    it('should return undefined outside context', () => {
      const id = getRequestId();
      expect(id).toBeUndefined();
    });

    it('should return request ID inside context', () => {
      runWithContext({ requestId: 'test-123' }, () => {
        const id = getRequestId();
        expect(id).toBe('test-123');
      });
    });
  });

  describe('runWithContext', () => {
    it('should run function with context', () => {
      const result = runWithContext({ requestId: 'test-123' }, () => {
        return getRequestId();
      });
      expect(result).toBe('test-123');
    });

    it('should auto-generate request ID if not provided', () => {
      runWithContext({}, () => {
        const id = getRequestId();
        expect(id).toBeDefined();
        expect(id).toMatch(/^[0-9a-f]{8}-/);
      });
    });

    it('should auto-set startTime if not provided', () => {
      runWithContext({ requestId: 'test-123' }, () => {
        const context = getRequestContext();
        expect(context?.startTime).toBeDefined();
        expect(typeof context?.startTime).toBe('number');
      });
    });

    it('should propagate context through async operations', async () => {
      await runWithContext({ requestId: 'test-123' }, async () => {
        // Simulate async operation
        await new Promise((resolve) => setTimeout(resolve, 10));

        const id = getRequestId();
        expect(id).toBe('test-123');
      });
    });

    it('should propagate context through nested functions', () => {
      runWithContext({ requestId: 'test-123' }, () => {
        function nested() {
          return getRequestId();
        }

        expect(nested()).toBe('test-123');
      });
    });

    it('should isolate different contexts', () => {
      const results: string[] = [];

      runWithContext({ requestId: 'req-1' }, () => {
        results.push(getRequestId()!);
      });

      runWithContext({ requestId: 'req-2' }, () => {
        results.push(getRequestId()!);
      });

      expect(results).toEqual(['req-1', 'req-2']);
    });
  });

  describe('withContext', () => {
    it('should wrap async function with context propagation', async () => {
      const wrapped = withContext(async (value: number) => {
        const id = getRequestId();
        return `${id}-${value}`;
      });

      const result = await runWithContext({ requestId: 'test-123' }, async () => {
        return await wrapped(42);
      });

      expect(result).toBe('test-123-42');
    });

    it('should work without existing context', async () => {
      const wrapped = withContext(async (value: number) => {
        const id = getRequestId();
        return id ? `${id}-${value}` : `no-context-${value}`;
      });

      const result = await wrapped(42);
      expect(result).toBe('no-context-42');
    });

    it('should handle errors', async () => {
      const wrapped = withContext(async () => {
        throw new Error('Test error');
      });

      await expect(runWithContext({ requestId: 'test-123' }, () => wrapped())).rejects.toThrow(
        'Test error'
      );
    });
  });

  describe('Context in parallel operations', () => {
    it('should maintain separate contexts in Promise.all', async () => {
      const results = await Promise.all([
        runWithContext({ requestId: 'req-1' }, async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return getRequestId();
        }),
        runWithContext({ requestId: 'req-2' }, async () => {
          await new Promise((resolve) => setTimeout(resolve, 5));
          return getRequestId();
        }),
        runWithContext({ requestId: 'req-3' }, async () => {
          return getRequestId();
        }),
      ]);

      expect(results).toEqual(['req-1', 'req-2', 'req-3']);
    });

    it('should maintain context through multiple async calls', async () => {
      await runWithContext({ requestId: 'test-123' }, async () => {
        const ids: string[] = [];

        ids.push(getRequestId()!);

        await new Promise((resolve) => setTimeout(resolve, 5));
        ids.push(getRequestId()!);

        await Promise.resolve();
        ids.push(getRequestId()!);

        expect(ids).toEqual(['test-123', 'test-123', 'test-123']);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle nested contexts (inner wins)', () => {
      runWithContext({ requestId: 'outer' }, () => {
        expect(getRequestId()).toBe('outer');

        runWithContext({ requestId: 'inner' }, () => {
          expect(getRequestId()).toBe('inner');
        });

        expect(getRequestId()).toBe('outer');
      });
    });

    it('should handle empty context object', () => {
      runWithContext({}, () => {
        const context = getRequestContext();
        expect(context?.requestId).toBeDefined();
        expect(context?.startTime).toBeDefined();
      });
    });

    it('should handle partial context', () => {
      runWithContext({ userId: 'user-123' }, () => {
        const context = getRequestContext();
        expect(context?.requestId).toBeDefined();
        expect(context?.userId).toBe('user-123');
        expect(context?.sessionId).toBeUndefined();
      });
    });
  });
});
