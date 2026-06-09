/**
 * Custom MCP Metrics
 *
 * MCP-specific Prometheus metrics for monitoring tool calls,
 * server health, connections, and registry operations.
 */

import { Counter, Gauge, Histogram } from 'prom-client';
import { register } from './index.js';
import logger from '../logging/logger.js';

// ===== Tool Call Metrics =====

/**
 * Total number of MCP tool calls
 * Labels: server, tool, status (success|error)
 */
export const toolCallsTotal = new Counter({
  name: 'mcp_tool_calls_total',
  help: 'Total number of MCP tool calls by server, tool, and status',
  labelNames: ['server', 'tool', 'status'],
  registers: [register],
});

/**
 * Duration of MCP tool calls in seconds
 * Labels: server, tool
 * Buckets optimized for typical tool call latencies
 */
export const toolCallDuration = new Histogram({
  name: 'mcp_tool_call_duration_seconds',
  help: 'Duration of MCP tool calls in seconds',
  labelNames: ['server', 'tool'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5, 10], // 10ms to 10s
  registers: [register],
});

// ===== Server Status Metrics =====

/**
 * Status of MCP servers
 * Labels: server, source, lifecycle
 * Values: 0=stopped, 1=running, 2=failed, 3=starting, 4=stopping
 */
export const serverStatus = new Gauge({
  name: 'mcp_server_status',
  help: 'Status of MCP servers (0=stopped, 1=running, 2=failed, 3=starting, 4=stopping)',
  labelNames: ['server', 'source', 'lifecycle'],
  registers: [register],
});

/**
 * Number of server restarts
 * Labels: server, source
 */
export const serverRestartsTotal = new Counter({
  name: 'mcp_server_restarts_total',
  help: 'Total number of server restarts',
  labelNames: ['server', 'source'],
  registers: [register],
});

/**
 * Server uptime in seconds
 * Labels: server
 */
export const serverUptime = new Gauge({
  name: 'mcp_server_uptime_seconds',
  help: 'Server uptime in seconds',
  labelNames: ['server'],
  registers: [register],
});

// ===== Connection Metrics =====

/**
 * Number of active SSE connections
 */
export const activeConnections = new Gauge({
  name: 'mcp_active_connections',
  help: 'Number of active SSE connections',
  registers: [register],
});

/**
 * Total number of connections established
 * Labels: transport (sse|stdio|http)
 */
export const connectionsTotal = new Counter({
  name: 'mcp_connections_total',
  help: 'Total number of connections established',
  labelNames: ['transport'],
  registers: [register],
});

// ===== Registry Metrics =====

/**
 * Total number of registry reloads
 * Labels: reason (file_change|manual)
 */
export const registryReloadTotal = new Counter({
  name: 'mcp_registry_reload_total',
  help: 'Total number of registry reloads',
  labelNames: ['reason'],
  registers: [register],
});

/**
 * Number of servers in registry
 * Labels: enabled (true|false)
 */
export const registryServersCount = new Gauge({
  name: 'mcp_registry_servers_count',
  help: 'Number of servers in registry',
  labelNames: ['enabled'],
  registers: [register],
});

// ===== Error Metrics =====

/**
 * Total number of errors
 * Labels: type (tool_call|server_start|server_stop|registry|auth)
 */
export const errorsTotal = new Counter({
  name: 'mcp_errors_total',
  help: 'Total number of errors by type',
  labelNames: ['type', 'server'],
  registers: [register],
});

// ===== Helper Functions =====

/**
 * Record a tool call
 */
export function recordToolCall(
  serverName: string,
  toolName: string,
  durationMs: number,
  success: boolean
): void {
  const status = success ? 'success' : 'error';
  toolCallsTotal.inc({ server: serverName, tool: toolName, status });
  toolCallDuration.observe({ server: serverName, tool: toolName }, durationMs / 1000);

  if (!success) {
    errorsTotal.inc({ type: 'tool_call', server: serverName });
  }

  logger.debug('Recorded tool call metric', {
    server: serverName,
    tool: toolName,
    duration: `${durationMs}ms`,
    status,
  });
}

/**
 * Update server status
 */
export function updateServerStatus(
  serverName: string,
  source: string,
  lifecycle: string,
  status: 'stopped' | 'running' | 'failed' | 'starting' | 'stopping'
): void {
  const statusValue = {
    stopped: 0,
    running: 1,
    failed: 2,
    starting: 3,
    stopping: 4,
  }[status];

  serverStatus.set({ server: serverName, source, lifecycle }, statusValue);

  logger.debug('Updated server status metric', {
    server: serverName,
    status,
    value: statusValue,
  });
}

/**
 * Record server restart
 */
export function recordServerRestart(serverName: string, source: string): void {
  serverRestartsTotal.inc({ server: serverName, source });
  logger.debug('Recorded server restart metric', { server: serverName, source });
}

/**
 * Update server uptime
 */
export function updateServerUptime(serverName: string, uptimeSeconds: number): void {
  serverUptime.set({ server: serverName }, uptimeSeconds);
}

/**
 * Update active connections count
 */
export function updateActiveConnections(count: number): void {
  activeConnections.set(count);
  logger.debug('Updated active connections metric', { count });
}

/**
 * Record new connection
 */
export function recordConnection(transport: 'sse' | 'stdio' | 'http'): void {
  connectionsTotal.inc({ transport });
  logger.debug('Recorded connection metric', { transport });
}

/**
 * Record registry reload
 */
export function recordRegistryReload(reason: 'file_change' | 'manual'): void {
  registryReloadTotal.inc({ reason });
  logger.info('Recorded registry reload metric', { reason });
}

/**
 * Update registry server count
 */
export function updateRegistryServerCount(enabledCount: number, disabledCount: number): void {
  registryServersCount.set({ enabled: 'true' }, enabledCount);
  registryServersCount.set({ enabled: 'false' }, disabledCount);
  logger.debug('Updated registry server count metrics', {
    enabled: enabledCount,
    disabled: disabledCount,
  });
}

/**
 * Record error
 */
export function recordError(
  type: 'tool_call' | 'server_start' | 'server_stop' | 'registry' | 'auth',
  serverName?: string
): void {
  errorsTotal.inc({ type, server: serverName || 'unknown' });
  logger.debug('Recorded error metric', { type, server: serverName });
}

logger.info('Custom MCP metrics initialized');
