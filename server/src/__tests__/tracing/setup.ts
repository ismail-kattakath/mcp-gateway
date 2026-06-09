/**
 * Test setup for OpenTelemetry
 *
 * Initialize a test tracer provider with in-memory exporter
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  AlwaysOnSampler,
} from '@opentelemetry/sdk-trace-node';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { beforeAll, afterAll } from 'vitest';

let sdk: NodeSDK | null = null;
export const memoryExporter = new InMemorySpanExporter();

beforeAll(() => {
  // Initialize OpenTelemetry SDK for tests
  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: 'mcp-gateway-test',
    }),
    spanProcessor: new SimpleSpanProcessor(memoryExporter),
    sampler: new AlwaysOnSampler(), // Always sample in tests
  });

  sdk.start();
});

afterAll(async () => {
  if (sdk) {
    await sdk.shutdown();
  }
});

export function getExportedSpans() {
  return memoryExporter.getFinishedSpans();
}

export function clearExportedSpans() {
  memoryExporter.reset();
}
