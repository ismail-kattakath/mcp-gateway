/**
 * OpenTelemetry Tracing Configuration
 *
 * Environment variables:
 * - OTEL_SERVICE_NAME - Service name for traces (default: mcp-gateway)
 * - OTEL_SERVICE_VERSION - Service version (default: 3.0.0)
 * - OTEL_EXPORTER_OTLP_ENDPOINT - OTLP endpoint (default: http://localhost:4318/v1/traces)
 * - OTEL_TRACES_SAMPLER - Sampling strategy (default: parentbased_always_on)
 * - OTEL_TRACES_SAMPLER_ARG - Sampling ratio for ratio-based samplers (default: 1.0)
 * - OTEL_TRACING_ENABLED - Enable/disable tracing (default: true)
 */

import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

/**
 * Tracing configuration
 */
export interface TracingConfig {
  enabled: boolean;
  serviceName: string;
  serviceVersion: string;
  exporterEndpoint: string;
  samplerType:
    | 'always_on'
    | 'always_off'
    | 'traceidratio'
    | 'parentbased_always_on'
    | 'parentbased_always_off'
    | 'parentbased_traceidratio';
  samplerRatio: number;
}

/**
 * Get tracing configuration from environment
 */
export function getTracingConfig(): TracingConfig {
  const enabled = process.env.OTEL_TRACING_ENABLED !== 'false';
  const serviceName = process.env.OTEL_SERVICE_NAME || 'mcp-gateway';
  const serviceVersion = process.env.OTEL_SERVICE_VERSION || '3.0.0';
  const exporterEndpoint =
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces';
  const samplerType = (process.env.OTEL_TRACES_SAMPLER ||
    'parentbased_always_on') as TracingConfig['samplerType'];
  const samplerRatio = parseFloat(process.env.OTEL_TRACES_SAMPLER_ARG || '1.0');

  return {
    enabled,
    serviceName,
    serviceVersion,
    exporterEndpoint,
    samplerType,
    samplerRatio,
  };
}

/**
 * Create OpenTelemetry resource with service information
 */
export function createResource(config: TracingConfig): Resource {
  return new Resource({
    [ATTR_SERVICE_NAME]: config.serviceName,
    [ATTR_SERVICE_VERSION]: config.serviceVersion,
  });
}
