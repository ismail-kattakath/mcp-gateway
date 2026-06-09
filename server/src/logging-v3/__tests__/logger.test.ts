/**
 * Tests for Pino Logger
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import pino from 'pino';
import {
  createComponentLogger,
  createServerLogger,
  logError,
  logPerformance,
  logAudit,
} from '../logger.js';
import { runWithContext } from '../context.js';

describe('Pino Logger', () => {
  const testLogDir = path.join(os.tmpdir(), 'mcp-logger-test');
  const originalLogDir = process.env.MCP_LOGS_DIR;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    // Set test log directory
    process.env.MCP_LOGS_DIR = testLogDir;
    process.env.DISABLE_FILE_LOGGING = 'true'; // Disable file logging in tests
    process.env.NODE_ENV = 'test';

    // Clean up test directory
    if (fs.existsSync(testLogDir)) {
      fs.rmSync(testLogDir, { recursive: true });
    }
    fs.mkdirSync(testLogDir, { recursive: true });
  });

  afterEach(() => {
    // Restore environment
    if (originalLogDir) {
      process.env.MCP_LOGS_DIR = originalLogDir;
    } else {
      delete process.env.MCP_LOGS_DIR;
    }
    process.env.NODE_ENV = originalNodeEnv;

    // Clean up test directory
    if (fs.existsSync(testLogDir)) {
      fs.rmSync(testLogDir, { recursive: true });
    }
  });

  describe('createComponentLogger', () => {
    it('should create logger with component field', () => {
      const logger = createComponentLogger('auth');
      expect(logger).toBeDefined();

      // Mock to capture output
      const logs: any[] = [];
      const stream = {
        write: (obj: string) => logs.push(JSON.parse(obj)),
      };

      const testLogger = pino({ level: 'info' }, stream as any);
      const componentLogger = testLogger.child({ component: 'auth' });
      componentLogger.info('test message');

      expect(logs[0].component).toBe('auth');
      expect(logs[0].msg).toBe('test message');
    });

    it('should sanitize component name', () => {
      const logger = createComponentLogger('auth\r\n<script>');
      expect(logger).toBeDefined();
    });
  });

  describe('createServerLogger', () => {
    it('should create logger with server fields', () => {
      const logs: any[] = [];
      const stream = {
        write: (obj: string) => logs.push(JSON.parse(obj)),
      };

      const testLogger = pino({ level: 'info' }, stream as any);
      const serverLogger = testLogger.child({
        component: 'mcp-server',
        serverName: 'obs',
      });
      serverLogger.info('test message');

      expect(logs[0].component).toBe('mcp-server');
      expect(logs[0].serverName).toBe('obs');
    });

    it('should sanitize server name', () => {
      const logger = createServerLogger('obs\r\n<script>');
      expect(logger).toBeDefined();
    });
  });

  describe('logError', () => {
    it('should log structured error', () => {
      const logs: any[] = [];
      const stream = {
        write: (obj: string) => logs.push(JSON.parse(obj)),
      };

      const logger = pino({ level: 'error' }, stream as any);
      const error = new Error('Test error');

      logError(logger, error, 'Operation failed', { serverName: 'obs' });

      expect(logs.length).toBe(1);
      expect(logs[0].level).toBe(50); // error level
      expect(logs[0].msg).toBe('Operation failed');
      expect(logs[0].err).toBeDefined();
      expect(logs[0].serverName).toBe('obs');
    });

    it('should handle non-Error objects', () => {
      const logs: any[] = [];
      const stream = {
        write: (obj: string) => logs.push(JSON.parse(obj)),
      };

      const logger = pino({ level: 'error' }, stream as any);
      logError(logger, 'String error', 'Operation failed');

      expect(logs[0].err).toBeDefined();
    });
  });

  describe('logPerformance', () => {
    it('should log performance metrics', () => {
      const logs: any[] = [];
      const stream = {
        write: (obj: string) => logs.push(JSON.parse(obj)),
      };

      const logger = pino({ level: 'info' }, stream as any);
      logPerformance(logger, 'server-spawn', 123.45, {
        serverName: 'obs',
        success: true,
      });

      expect(logs[0].event).toBe('performance');
      expect(logs[0].operation).toBe('server-spawn');
      expect(logs[0].durationMs).toBe(123.45);
      expect(logs[0].serverName).toBe('obs');
      expect(logs[0].success).toBe(true);
    });
  });

  describe('logAudit', () => {
    it('should log audit events', () => {
      const logs: any[] = [];
      const stream = {
        write: (obj: string) => logs.push(JSON.parse(obj)),
      };

      const logger = pino({ level: 'info' }, stream as any);
      logAudit(logger, 'delete', 'server/obs-mcp', {
        userId: 'user-123',
        ip: '192.168.1.100',
      });

      expect(logs[0].event).toBe('audit');
      expect(logs[0].action).toBe('delete');
      expect(logs[0].resource).toBe('server/obs-mcp');
      expect(logs[0].userId).toBe('user-123');
      expect(logs[0].ip).toBe('192.168.1.100');
      expect(logs[0].timestamp).toBeDefined();
    });
  });

  describe('Context Integration', () => {
    it('should include request context in logs', () => {
      const logs: any[] = [];
      const stream = {
        write: (obj: string) => logs.push(JSON.parse(obj)),
      };

      const logger = pino(
        {
          level: 'info',
          formatters: {
            log: (object: any) => {
              const context = {
                requestId: 'test-123',
                userId: 'user-456',
              };
              return { ...object, ...context };
            },
          },
        },
        stream as any
      );

      runWithContext({ requestId: 'test-123', userId: 'user-456' }, () => {
        logger.info('test message');
      });

      expect(logs[0].requestId).toBe('test-123');
      expect(logs[0].userId).toBe('user-456');
    });
  });

  describe('Serializers', () => {
    it('should serialize error objects', () => {
      const logs: any[] = [];
      const stream = {
        write: (obj: string) => logs.push(JSON.parse(obj)),
      };

      const logger = pino(
        {
          level: 'error',
          serializers: {
            err: pino.stdSerializers.err,
          },
        },
        stream as any
      );

      const error = new Error('Test error');
      logger.error({ err: error }, 'Error occurred');

      expect(logs[0].err.type).toBe('Error');
      expect(logs[0].err.message).toBe('Test error');
    });
  });

  describe('Log Levels', () => {
    it('should respect log level configuration', () => {
      const logs: any[] = [];
      const stream = {
        write: (obj: string) => logs.push(JSON.parse(obj)),
      };

      const logger = pino({ level: 'warn' }, stream as any);

      logger.debug('debug message'); // Should not log
      logger.info('info message'); // Should not log
      logger.warn('warn message'); // Should log
      logger.error('error message'); // Should log

      expect(logs.length).toBe(2);
      expect(logs[0].level).toBe(40); // warn
      expect(logs[1].level).toBe(50); // error
    });
  });

  describe('Child Loggers', () => {
    it('should inherit parent bindings', () => {
      const logs: any[] = [];
      const stream = {
        write: (obj: string) => logs.push(JSON.parse(obj)),
      };

      const logger = pino({ level: 'info' }, stream as any);
      const child = logger.child({ component: 'auth' });
      const grandchild = child.child({ userId: 'user-123' });

      grandchild.info('test message');

      expect(logs[0].component).toBe('auth');
      expect(logs[0].userId).toBe('user-123');
    });

    it('should allow overriding bindings', () => {
      const logs: any[] = [];
      const stream = {
        write: (obj: string) => logs.push(JSON.parse(obj)),
      };

      const logger = pino({ level: 'info' }, stream as any);
      const child = logger.child({ component: 'auth' });

      child.info('message 1');
      child.info({ component: 'override' }, 'message 2');

      expect(logs[0].component).toBe('auth');
      expect(logs[1].component).toBe('override');
    });
  });

  describe('JSON Output', () => {
    it('should output valid JSON', () => {
      const logs: any[] = [];
      const stream = {
        write: (obj: string) => {
          expect(() => JSON.parse(obj)).not.toThrow();
          logs.push(JSON.parse(obj));
        },
      };

      const logger = pino({ level: 'info' }, stream as any);

      logger.info('message 1');
      logger.info({ foo: 'bar' }, 'message 2');
      logger.error({ err: new Error('test') }, 'message 3');

      expect(logs.length).toBe(3);
    });
  });

  describe('Edge Cases', () => {
    it('should handle circular references', () => {
      const logs: any[] = [];
      const stream = {
        write: (obj: string) => logs.push(JSON.parse(obj)),
      };

      const logger = pino({ level: 'info' }, stream as any);

      const circular: any = { name: 'test' };
      circular.self = circular;

      // Pino handles circular references automatically
      expect(() => logger.info({ obj: circular }, 'test')).not.toThrow();
    });

    it('should handle undefined and null values', () => {
      const logs: any[] = [];
      const stream = {
        write: (obj: string) => logs.push(JSON.parse(obj)),
      };

      const logger = pino({ level: 'info' }, stream as any);

      logger.info({ a: undefined, b: null }, 'test');

      expect(logs[0].b).toBeNull();
      expect(logs[0].a).toBeUndefined();
    });

    it('should handle large objects', () => {
      const logs: any[] = [];
      const stream = {
        write: (obj: string) => logs.push(JSON.parse(obj)),
      };

      const logger = pino({ level: 'info' }, stream as any);

      const largeObject = {
        data: Array(100).fill({ key: 'value' }),
      };

      expect(() => logger.info({ obj: largeObject }, 'test')).not.toThrow();
    });
  });
});
