/**
 * Stdio Handler for MCP Backends
 *
 * Shared utilities for handling stdout/stderr from MCP server processes
 * Parses JSON-RPC messages and separates them from regular log output
 */

import logger from '../../logging/logger.js';

/**
 * Create stdout handler for MCP server
 *
 * Parses lines from stdout:
 * - JSON-RPC 2.0 messages are emitted as 'message' events
 * - Other output is treated as logs
 *
 * @param {EventEmitter} server - Backend instance
 * @param {string} serverName - Backend ID for logging
 * @returns {function} - Data handler function
 */
export function createStdoutHandler(server, serverName) {
  let stdoutBuffer = '';

  return (data) => {
    stdoutBuffer += data.toString();
    const lines = stdoutBuffer.split('\n');

    // Keep the last incomplete line in buffer
    stdoutBuffer = lines.pop();

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Try to parse as JSON-RPC message
      try {
        const message = JSON.parse(trimmed);

        // Check if it's a JSON-RPC message
        if (message.jsonrpc === '2.0') {
          // Emit as MCP message
          server.emit('message', message);
          logger.debug(`[${serverName}] JSON-RPC message:`, {
            id: message.id,
            method: message.method,
            hasResult: !!message.result,
            hasError: !!message.error
          });
        } else {
          // Not JSON-RPC, treat as log
          server.addLog('stdout', trimmed);
          logger.debug(`[${serverName}] stdout: ${trimmed}`);
        }
      } catch (parseError) {
        // Not JSON, treat as regular log output
        server.addLog('stdout', trimmed);
        logger.debug(`[${serverName}] stdout: ${trimmed}`);
      }
    }
  };
}

/**
 * Create stderr handler for MCP server
 *
 * @param {EventEmitter} server - Backend instance
 * @param {string} serverName - Backend ID for logging
 * @returns {function} - Data handler function
 */
export function createStderrHandler(server, serverName) {
  return (data) => {
    const message = data.toString().trim();
    if (message) {
      server.addLog('stderr', message);
      // Only log as error if it looks like an error
      if (message.toLowerCase().includes('error') || message.toLowerCase().includes('fatal')) {
        logger.error(`[${serverName}] stderr: ${message}`);
      } else {
        logger.debug(`[${serverName}] stderr: ${message}`);
      }
    }
  };
}

export default {
  createStdoutHandler,
  createStderrHandler
};
