/**
 * stdio Transport for MCP
 *
 * Reads JSON-RPC messages from stdin, writes responses to stdout.
 * Runs in parallel with HTTP/SSE server, shares the same ServerManager.
 * No auth required (pipe is inherently authenticated by OS).
 */

import readline from 'readline';
import logger from '../logging/logger.js';
import { handleMCPRequest } from './protocol.js';
import type { ServerManager } from './backends/index.js';
import type { Registry } from '../types/registry.js';
import type { JsonRpcRequest, JsonRpcResponse } from './protocol.js';

/**
 * Start stdio transport handler.
 * @param serverManager - Shared server manager instance
 * @param registry - Registry configuration
 */
export function startStdioTransport(serverManager: ServerManager, registry: Registry): void {
  logger.info('Starting stdio transport (interactive mode)');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false, // Disable terminal-specific features (no ANSI, no echoing)
  });

  rl.on('line', async (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return; // Skip empty lines

    try {
      const request = JSON.parse(trimmed) as JsonRpcRequest;
      logger.debug('stdio: received request', { method: request.method, id: request.id });

      const response = await handleMCPRequest(request, serverManager, registry);

      // Write JSON-RPC response to stdout (one line per response)
      process.stdout.write(JSON.stringify(response) + '\n');
      logger.debug('stdio: sent response', { id: response.id });
    } catch (error) {
      const err = error as Error;
      logger.error('stdio: failed to process message', { error: err.message, line: trimmed });

      // Send error response if we can extract an ID
      let errorResponse: JsonRpcResponse;
      try {
        const partial = JSON.parse(trimmed) as Partial<JsonRpcRequest>;
        errorResponse = {
          jsonrpc: '2.0',
          id: partial.id || null,
          error: { code: -32603, message: 'Internal error', data: err.message },
        };
      } catch {
        errorResponse = {
          jsonrpc: '2.0',
          id: null,
          error: { code: -32700, message: 'Parse error', data: err.message },
        };
      }

      process.stdout.write(JSON.stringify(errorResponse) + '\n');
    }
  });

  rl.on('close', () => {
    logger.info('stdio: input closed, shutting down');
    process.exit(0);
  });

  process.stdin.on('error', (error: Error) => {
    logger.error('stdio: stdin error', { error: error.message });
  });

  logger.info('stdio transport ready (listening on stdin)');
}

export default { startStdioTransport };
