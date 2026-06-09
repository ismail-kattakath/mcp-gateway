/**
 * OpenTelemetry Tracing Initialization
 *
 * Distributed tracing with OpenTelemetry for MCP Gateway.
 * Auto-instruments HTTP and Express for automatic span creation.
 * Custom spans for MCP operations (tool calls, server lifecycle, registry).
 *
 * Usage:
 * ```typescript
 * import { initTracing } from './tracing';
 *
 * // Initialize before any other imports (early startup)
 * const shutdown = initTracing();
 *
 * // Graceful shutdown
 * process.on('SIGTERM', async () => {
 *   await shutdown();
 * });
 * ```
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import {
  AlwaysOnSampler,
  AlwaysOffSampler,
  TraceIdRatioBasedSampler,
  ParentBasedSampler,
} from '@opentelemetry/sdk-trace-node';
import { getTracingConfig, createResource } from './config.js';
import { logger } from './tracer.js';

let sdk: NodeSDK | null = null;

/**
 * Create sampler based on configuration
 */
function createSampler(config: ReturnType<typeof getTracingConfig>) {
  switch (config.samplerType) {
    case 'always_on':
      return new AlwaysOnSampler();

    case 'always_off':
      return new AlwaysOffSampler();

    case 'traceidratio':
      return new TraceIdRatioBasedSampler(config.samplerRatio);

    case 'parentbased_always_on':
      return new ParentBasedSampler({
        root: new AlwaysOnSampler(),
      });

    case 'parentbased_always_off':
      return new ParentBasedSampler({
        root: new AlwaysOffSampler(),
      });

    case 'parentbased_traceidratio':
      return new ParentBasedSampler({
        root: new TraceIdRatioBasedSampler(config.samplerRatio),
      });

    default:
      logger.warn(`Unknown sampler type: ${config.samplerType}, using parentbased_always_on`);
      return new ParentBasedSampler({
        root: new AlwaysOnSampler(),
      });
  }
}

/**
 * Initialize OpenTelemetry tracing
 *
 * @returns Shutdown function to gracefully stop tracing
 */
export function initTracing(): () => Promise<void> {
  const config = getTracingConfig();

  if (!config.enabled) {
    logger.info('OpenTelemetry tracing disabled (OTEL_TRACING_ENABLED=false)');
    return async () => {
      // No-op shutdown
    };
  }

  try {
    // Create OTLP trace exporter (HTTP)
    const traceExporter = new OTLPTraceExporter({
      url: config.exporterEndpoint,
      headers: {}, // Add auth headers if needed
    });

    // Create resource with service info
    const resource = createResource(config);

    // Create sampler
    const sampler = createSampler(config);

    // Initialize SDK with auto-instrumentation
    sdk = new NodeSDK({
      resource,
      traceExporter,
      sampler,
      instrumentations: [
        // Auto-instrument HTTP (Node.js http/https modules)
        new HttpInstrumentation({
          // Don't trace health checks
          ignoreIncomingRequestHook: (req) => {
            return req.url === '/health' || req.url === '/healthz' || req.url === '/readyz';
          },
          // Add custom attributes to HTTP spans
          requestHook: (span, request) => {
            span.setAttribute('http.client_ip', request.socket?.remoteAddress || 'unknown');
          },
        }),

        // Auto-instrument Express
        new ExpressInstrumentation({
          // Add route name to span
          requestHook: (span, info) => {
            if (info.route) {
              span.updateName(`${info.request.method} ${info.route}`);
            }
          },
        }),
      ],
    });

    // Start the SDK
    sdk.start();

    logger.info('OpenTelemetry tracing initialized', {
      service: config.serviceName,
      version: config.serviceVersion,
      exporter: config.exporterEndpoint,
      sampler: config.samplerType,
      samplerRatio: config.samplerRatio,
    });

    // Return shutdown function
    return async () => {
      if (sdk) {
        logger.info('Shutting down OpenTelemetry tracing');
        await sdk.shutdown();
        logger.info('OpenTelemetry tracing shut down successfully');
      }
    };
  } catch (error) {
    logger.error('Failed to initialize OpenTelemetry tracing', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Return no-op shutdown
    return async () => {};
  }
}

/**
 * Get current tracing configuration
 */
export function getCurrentConfig() {
  return getTracingConfig();
}

export { getTracingConfig, createResource };
