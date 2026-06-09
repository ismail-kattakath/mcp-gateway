/**
 * Prometheus Metrics Registry
 *
 * Central registry for all Prometheus metrics.
 * Exports default metrics (CPU, memory, heap) and custom MCP metrics.
 */

import promClient from 'prom-client';
import logger from '../logging/logger.js';

// Create a new registry
export const register = new promClient.Registry();

// Add default metrics (CPU, memory, event loop, etc.)
promClient.collectDefaultMetrics({
  register,
  prefix: 'mcp_gateway_',
  gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5], // Garbage collection buckets
});

logger.info('Prometheus metrics registry initialized with default metrics');

/**
 * Get metrics in Prometheus exposition format
 */
export async function getMetrics(): Promise<string> {
  return register.metrics();
}

/**
 * Get metrics as JSON (for debugging)
 */
export async function getMetricsJSON(): Promise<any> {
  return register.getMetricsAsJSON();
}

/**
 * Reset all metrics (useful for testing)
 */
export function resetMetrics(): void {
  register.resetMetrics();
  logger.debug('Metrics registry reset');
}

export { promClient };
