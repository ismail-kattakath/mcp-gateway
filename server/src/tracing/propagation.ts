/**
 * Trace Context Propagation
 *
 * Utilities for propagating trace context across service boundaries.
 * Implements W3C Trace Context specification.
 *
 * Reference: https://www.w3.org/TR/trace-context/
 */

import { context, propagation, trace } from '@opentelemetry/api';
import type { Context } from '@opentelemetry/api';
import type { IncomingHttpHeaders } from 'http';

/**
 * Extract trace context from HTTP headers
 *
 * Reads W3C Trace Context headers (traceparent, tracestate) and
 * creates a new context with the extracted span context.
 *
 * @param headers - Incoming HTTP headers
 * @returns OpenTelemetry context with extracted trace information
 */
export function extractTraceContext(headers: IncomingHttpHeaders): Context {
  // Convert headers to carrier format (lowercase keys)
  const carrier: Record<string, string> = {};
  Object.entries(headers).forEach(([key, value]) => {
    if (value) {
      carrier[key.toLowerCase()] = Array.isArray(value) ? value[0] : value;
    }
  });

  // Extract context using W3C Trace Context propagator
  return propagation.extract(context.active(), carrier);
}

/**
 * Inject trace context into HTTP headers
 *
 * Writes W3C Trace Context headers (traceparent, tracestate) into
 * the provided headers object for outgoing requests.
 *
 * @param headers - Outgoing HTTP headers object
 * @param ctx - OpenTelemetry context (defaults to active context)
 * @returns Modified headers object with trace context
 */
export function injectTraceContext(
  headers: Record<string, string>,
  ctx?: Context
): Record<string, string> {
  const activeContext = ctx || context.active();

  // Inject context using W3C Trace Context propagator
  propagation.inject(activeContext, headers);

  return headers;
}

/**
 * Run a function with extracted trace context
 *
 * Extracts trace context from headers and runs the function
 * within that context, maintaining parent-child span relationships.
 *
 * @param headers - Incoming HTTP headers
 * @param fn - Function to run with context
 * @returns Result of the function
 */
export async function runWithExtractedContext<T>(
  headers: IncomingHttpHeaders,
  fn: () => Promise<T> | T
): Promise<T> {
  const extractedContext = extractTraceContext(headers);
  return context.with(extractedContext, fn);
}

/**
 * Create headers for outgoing MCP server request
 *
 * Generates HTTP headers with trace context for requests to MCP servers.
 * This allows trace propagation across the gateway → server boundary.
 *
 * @param baseHeaders - Base headers (e.g., Content-Type)
 * @returns Headers with trace context injected
 */
export function createMCPServerHeaders(
  baseHeaders: Record<string, string> = {}
): Record<string, string> {
  const headers = { ...baseHeaders };
  return injectTraceContext(headers);
}

/**
 * Get trace context for logging
 *
 * Extracts trace ID and span ID from active context for correlation
 * with logs.
 *
 * @returns Object with trace_id and span_id (if available)
 */
export function getTraceContextForLogging(): { trace_id?: string; span_id?: string } {
  const span = trace.getActiveSpan();
  if (!span) {
    return {};
  }

  const spanContext = span.spanContext();
  return {
    trace_id: spanContext.traceId,
    span_id: spanContext.spanId,
  };
}

/**
 * Check if current context has valid trace
 *
 * @returns true if there's an active span with valid trace context
 */
export function hasActiveTrace(): boolean {
  const span = trace.getActiveSpan();
  if (!span) {
    return false;
  }

  const spanContext = span.spanContext();
  return spanContext.traceId !== '00000000000000000000000000000000';
}
