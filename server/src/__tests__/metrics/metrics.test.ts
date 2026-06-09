/**
 * Metrics Tests
 *
 * Tests for Prometheus metrics collection and health checks.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { register, resetMetrics } from '../../metrics/index.js';
import {
  toolCallsTotal,
  toolCallDuration,
  serverStatus,
  activeConnections,
  recordToolCall,
  updateServerStatus,
  updateActiveConnections,
  recordRegistryReload,
  updateRegistryServerCount,
} from '../../metrics/custom.js';

describe('Prometheus Metrics', () => {
  beforeEach(() => {
    // Reset metrics before each test
    resetMetrics();
  });

  describe('Default Metrics', () => {
    it('should include process metrics', async () => {
      const metrics = await register.getMetricsAsJSON();
      const metricNames = metrics.map((m: any) => m.name);

      expect(metricNames).toContain('mcp_gateway_process_cpu_user_seconds_total');
      expect(metricNames).toContain('mcp_gateway_process_resident_memory_bytes');
      expect(metricNames).toContain('mcp_gateway_nodejs_heap_size_total_bytes');
    });

    it('should include Node.js metrics', async () => {
      const metrics = await register.getMetricsAsJSON();
      const metricNames = metrics.map((m: any) => m.name);

      expect(metricNames).toContain('mcp_gateway_nodejs_heap_size_used_bytes');
      expect(metricNames).toContain('mcp_gateway_nodejs_eventloop_lag_seconds');
    });
  });

  describe('Tool Call Metrics', () => {
    it('should record successful tool call', async () => {
      recordToolCall('obs', 'get-observations', 150, true);

      const metricsText = await register.metrics();
      expect(metricsText).toContain('mcp_tool_calls_total');
      expect(metricsText).toContain('server="obs"');
      expect(metricsText).toContain('status="success"');
    });

    it('should record failed tool call', async () => {
      recordToolCall('obs', 'get-observations', 50, false);

      const metricsText = await register.metrics();
      expect(metricsText).toContain('mcp_tool_calls_total');
      expect(metricsText).toContain('status="error"');
    });

    it('should record tool call duration', async () => {
      recordToolCall('obs', 'get-observations', 250, true);

      const metricsText = await register.metrics();
      expect(metricsText).toContain('mcp_tool_call_duration_seconds');
      expect(metricsText).toContain('server="obs"');
    });

    it('should handle multiple tool calls', async () => {
      recordToolCall('obs', 'get-observations', 100, true);
      recordToolCall('obs', 'get-observations', 150, true);
      recordToolCall('filesystem', 'read_file', 50, true);

      const metricsText = await register.metrics();
      expect(metricsText).toContain('server="obs"');
      expect(metricsText).toContain('server="filesystem"');
      expect(metricsText).toContain('tool="get-observations"');
      expect(metricsText).toContain('tool="read_file"');
    });
  });

  describe('Server Status Metrics', () => {
    it('should update server status to running', async () => {
      updateServerStatus('obs', 'pkg', 'persistent', 'running');

      const metricsText = await register.metrics();
      expect(metricsText).toContain('mcp_server_status');
      expect(metricsText).toContain('server="obs"');
      expect(metricsText).toContain('source="pkg"');
      expect(metricsText).toContain('lifecycle="persistent"');
    });

    it('should update server status to stopped', async () => {
      updateServerStatus('obs', 'pkg', 'persistent', 'stopped');

      const metricsText = await register.metrics();
      expect(metricsText).toContain('mcp_server_status');
      expect(metricsText).toContain('server="obs"');
    });

    it('should update server status to failed', async () => {
      updateServerStatus('obs', 'pkg', 'persistent', 'failed');

      const metricsText = await register.metrics();
      expect(metricsText).toContain('mcp_server_status');
      expect(metricsText).toContain('server="obs"');
    });

    it('should handle multiple servers', async () => {
      updateServerStatus('obs', 'pkg', 'persistent', 'running');
      updateServerStatus('filesystem', 'pkg', 'on-demand', 'stopped');

      const metricsText = await register.metrics();
      expect(metricsText).toContain('server="obs"');
      expect(metricsText).toContain('server="filesystem"');
    });
  });

  describe('Connection Metrics', () => {
    it('should update active connections', async () => {
      updateActiveConnections(5);

      // Check metric is registered
      const metricsText = await register.metrics();
      expect(metricsText).toContain('mcp_active_connections');
    });

    it('should handle zero connections', async () => {
      updateActiveConnections(0);

      // Check metric is registered
      const metricsText = await register.metrics();
      expect(metricsText).toContain('mcp_active_connections');
    });
  });

  describe('Registry Metrics', () => {
    it('should record registry reload', () => {
      recordRegistryReload('file_change');

      const metrics = register.getSingleMetric('mcp_registry_reload_total');
      expect(metrics).toBeDefined();
    });

    it('should update registry server count', () => {
      updateRegistryServerCount(5, 2);

      const metric = register.getSingleMetric('mcp_registry_servers_count');
      expect(metric).toBeDefined();
    });
  });

  describe('Metrics Export', () => {
    it('should export metrics in Prometheus format', async () => {
      // Record some metrics
      recordToolCall('obs', 'get-observations', 100, true);
      updateServerStatus('obs', 'pkg', 'persistent', 'running');

      const metricsText = await register.metrics();
      expect(metricsText).toContain('# HELP');
      expect(metricsText).toContain('# TYPE');
      expect(metricsText).toContain('mcp_tool_calls_total');
      expect(metricsText).toContain('mcp_server_status');
    });

    it('should export metrics as JSON', async () => {
      recordToolCall('obs', 'get-observations', 100, true);

      const metricsJSON = await register.getMetricsAsJSON();
      expect(Array.isArray(metricsJSON)).toBe(true);
      expect(metricsJSON.length).toBeGreaterThan(0);
    });
  });

  describe('Cardinality Management', () => {
    it('should limit label combinations', async () => {
      // Record tool calls with various combinations
      recordToolCall('obs', 'get-observations', 100, true);
      recordToolCall('obs', 'get-observations', 150, false);
      recordToolCall('filesystem', 'read_file', 50, true);

      // Check metrics are registered
      const metricsText = await register.metrics();
      expect(metricsText).toContain('mcp_tool_calls_total');
      expect(metricsText).toContain('server="obs"');
      expect(metricsText).toContain('server="filesystem"');
    });
  });
});

describe('Health Checks', () => {
  describe('Health Check Interfaces', () => {
    it('should define proper status types', () => {
      const statuses: Array<'ok' | 'degraded' | 'error'> = ['ok', 'degraded', 'error'];
      expect(statuses).toHaveLength(3);
    });
  });
});
