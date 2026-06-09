/**
 * OpenTelemetry Tracer Instance
 *
 * Provides tracer instance and helper functions for creating custom spans.
 */

import { trace, SpanStatusCode, Span } from '@opentelemetry/api';
import type { Attributes, AttributeValue } from '@opentelemetry/api';

/**
 * Get the tracer instance
 */
export const tracer = trace.getTracer('mcp-gateway', '3.0.0');

/**
 * Simple logger for tracing (avoid circular dependency with logging-v3)
 */
export const logger = {
  info: (message: string, meta?: Record<string, unknown>) => {
    if (process.env.DEBUG) {
      console.log(`[TRACING] ${message}`, meta ? JSON.stringify(meta) : '');
    }
  },
  warn: (message: string, meta?: Record<string, unknown>) => {
    console.warn(`[TRACING] ${message}`, meta ? JSON.stringify(meta) : '');
  },
  error: (message: string, meta?: Record<string, unknown>) => {
    console.error(`[TRACING] ${message}`, meta ? JSON.stringify(meta) : '');
  },
  debug: (message: string, meta?: Record<string, unknown>) => {
    if (process.env.DEBUG) {
      console.debug(`[TRACING] ${message}`, meta ? JSON.stringify(meta) : '');
    }
  },
};

/**
 * Get the active span (if any)
 */
export function getActiveSpan(): Span | undefined {
  return trace.getActiveSpan();
}

/**
 * Get trace ID from active span
 */
export function getTraceId(): string | undefined {
  const span = getActiveSpan();
  if (span) {
    const spanContext = span.spanContext();
    return spanContext.traceId;
  }
  return undefined;
}

/**
 * Get span ID from active span
 */
export function getSpanId(): string | undefined {
  const span = getActiveSpan();
  if (span) {
    const spanContext = span.spanContext();
    return spanContext.spanId;
  }
  return undefined;
}

/**
 * Create and execute a function within a span
 *
 * @param name - Span name
 * @param fn - Function to execute
 * @param attributes - Optional span attributes
 * @returns Result of the function
 */
export async function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T> | T,
  attributes?: Attributes
): Promise<T> {
  return tracer.startActiveSpan(name, { attributes }, async (span) => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      });
      span.recordException(error as Error);
      throw error;
    } finally {
      span.end();
    }
  });
}

/**
 * Add attributes to active span
 */
export function addSpanAttributes(attributes: Attributes): void {
  const span = getActiveSpan();
  if (span) {
    Object.entries(attributes).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        span.setAttribute(key, value as AttributeValue);
      }
    });
  }
}

/**
 * Set span status to error
 */
export function setSpanError(error: Error, message?: string): void {
  const span = getActiveSpan();
  if (span) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: message || error.message,
    });
    span.recordException(error);
  }
}

/**
 * Set span status to success
 */
export function setSpanSuccess(): void {
  const span = getActiveSpan();
  if (span) {
    span.setStatus({ code: SpanStatusCode.OK });
  }
}

/**
 * Add event to active span
 */
export function addSpanEvent(name: string, attributes?: Attributes): void {
  const span = getActiveSpan();
  if (span) {
    span.addEvent(name, attributes);
  }
}

/**
 * Extract trace context for logging
 */
export function getTraceContext(): { trace_id?: string; span_id?: string } {
  const traceId = getTraceId();
  const spanId = getSpanId();

  const context: { trace_id?: string; span_id?: string } = {};
  if (traceId) {
    context.trace_id = traceId;
  }
  if (spanId) {
    context.span_id = spanId;
  }

  return context;
}
