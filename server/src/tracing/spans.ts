/**
 * Custom Span Creation for MCP Operations
 *
 * Provides helper functions to create custom spans for:
 * - Tool calls
 * - Server lifecycle (start/stop)
 * - Registry operations (reload)
 * - Connections (SSE)
 */

import { SpanKind, SpanStatusCode } from '@opentelemetry/api';
import type { Span, Attributes } from '@opentelemetry/api';
import { tracer } from './tracer.js';

/**
 * MCP Tool Call Span
 *
 * Creates a span for MCP tool call operations.
 *
 * @example
 * ```typescript
 * await withToolCallSpan('obs/get-data', { query: 'test' }, async (span) => {
 *   const result = await executeTool();
 *   span.setAttribute('mcp.result.size', result.length);
 *   return result;
 * });
 * ```
 */
export async function withToolCallSpan<T>(
  toolName: string,
  args: Record<string, unknown>,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  const [serverName, actualToolName] = toolName.includes('/')
    ? toolName.split('/')
    : ['unknown', toolName];

  const attributes: Attributes = {
    'mcp.operation': 'tool.call',
    'mcp.tool.name': actualToolName,
    'mcp.server.name': serverName,
    'mcp.tool.full_name': toolName,
  };

  // Add argument count (don't log actual args for security)
  if (args) {
    attributes['mcp.tool.arg_count'] = Object.keys(args).length;
  }

  return tracer.startActiveSpan(
    `mcp.tool.call ${toolName}`,
    {
      kind: SpanKind.CLIENT,
      attributes,
    },
    async (span) => {
      try {
        const result = await fn(span);
        span.setAttribute('mcp.status', 'success');
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.setAttribute('mcp.status', 'error');
        span.setAttribute('mcp.error.type', error instanceof Error ? error.name : 'Error');
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : String(error),
        });
        span.recordException(error as Error);
        throw error;
      } finally {
        span.end();
      }
    }
  );
}

/**
 * MCP Server Start Span
 */
export async function withServerStartSpan<T>(
  serverName: string,
  source: string,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  return tracer.startActiveSpan(
    `mcp.server.start ${serverName}`,
    {
      kind: SpanKind.INTERNAL,
      attributes: {
        'mcp.operation': 'server.start',
        'mcp.server.name': serverName,
        'mcp.server.source': source,
      },
    },
    async (span) => {
      try {
        const startTime = Date.now();
        const result = await fn(span);
        const duration = Date.now() - startTime;
        span.setAttribute('mcp.server.start_duration_ms', duration);
        span.setAttribute('mcp.status', 'success');
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.setAttribute('mcp.status', 'error');
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : String(error),
        });
        span.recordException(error as Error);
        throw error;
      } finally {
        span.end();
      }
    }
  );
}

/**
 * MCP Server Stop Span
 */
export async function withServerStopSpan<T>(
  serverName: string,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  return tracer.startActiveSpan(
    `mcp.server.stop ${serverName}`,
    {
      kind: SpanKind.INTERNAL,
      attributes: {
        'mcp.operation': 'server.stop',
        'mcp.server.name': serverName,
      },
    },
    async (span) => {
      try {
        const result = await fn(span);
        span.setAttribute('mcp.status', 'success');
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.setAttribute('mcp.status', 'error');
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : String(error),
        });
        span.recordException(error as Error);
        throw error;
      } finally {
        span.end();
      }
    }
  );
}

/**
 * MCP Registry Reload Span
 */
export async function withRegistryReloadSpan<T>(
  reason: string,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  return tracer.startActiveSpan(
    'mcp.registry.reload',
    {
      kind: SpanKind.INTERNAL,
      attributes: {
        'mcp.operation': 'registry.reload',
        'mcp.registry.reload_reason': reason,
      },
    },
    async (span) => {
      try {
        const result = await fn(span);
        span.setAttribute('mcp.status', 'success');
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.setAttribute('mcp.status', 'error');
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : String(error),
        });
        span.recordException(error as Error);
        throw error;
      } finally {
        span.end();
      }
    }
  );
}

/**
 * MCP Connection Span (for SSE connections)
 */
export function startConnectionSpan(clientInfo?: { name?: string; version?: string }): Span {
  return tracer.startSpan('mcp.connection', {
    kind: SpanKind.SERVER,
    attributes: {
      'mcp.operation': 'connection',
      'mcp.client.name': clientInfo?.name || 'unknown',
      'mcp.client.version': clientInfo?.version || 'unknown',
    },
  });
}

/**
 * Tools List Span
 */
export async function withToolsListSpan<T>(fn: (span: Span) => Promise<T>): Promise<T> {
  return tracer.startActiveSpan(
    'mcp.tools.list',
    {
      kind: SpanKind.INTERNAL,
      attributes: {
        'mcp.operation': 'tools.list',
      },
    },
    async (span) => {
      try {
        const result = await fn(span);
        span.setAttribute('mcp.status', 'success');
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.setAttribute('mcp.status', 'error');
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : String(error),
        });
        span.recordException(error as Error);
        throw error;
      } finally {
        span.end();
      }
    }
  );
}

/**
 * Generic MCP operation span
 */
export async function withMCPOperationSpan<T>(
  operation: string,
  attributes: Attributes,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  return tracer.startActiveSpan(
    `mcp.${operation}`,
    {
      kind: SpanKind.INTERNAL,
      attributes: {
        'mcp.operation': operation,
        ...attributes,
      },
    },
    async (span) => {
      try {
        const result = await fn(span);
        span.setAttribute('mcp.status', 'success');
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.setAttribute('mcp.status', 'error');
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : String(error),
        });
        span.recordException(error as Error);
        throw error;
      } finally {
        span.end();
      }
    }
  );
}
