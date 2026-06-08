/**
 * MCP Tool Call Router
 *
 * Routes namespaced tool calls to appropriate backends
 * Handles tool name parsing and backend resolution
 */

import logger from '../logging/logger.js';

/**
 * Parse namespaced tool name
 * @param {string} toolName - Tool name in format "backend-id/tool-name" or "tool-name"
 * @returns {object} - { backendId, toolName, isNamespaced }
 */
export function parseToolName(toolName) {
  if (!toolName) {
    throw new Error('Tool name is required');
  }

  const parts = toolName.split('/');

  if (parts.length === 1) {
    // No namespace - ambiguous call
    return {
      backendId: null,
      toolName: parts[0],
      isNamespaced: false
    };
  }

  if (parts.length === 2) {
    // Properly namespaced: "backend-id/tool-name"
    return {
      backendId: parts[0],
      toolName: parts[1],
      isNamespaced: true
    };
  }

  // Handle edge case of multiple slashes - treat everything after first as tool name
  return {
    backendId: parts[0],
    toolName: parts.slice(1).join('/'),
    isNamespaced: true
  };
}

/**
 * Validate backend exists and is enabled
 */
export function validateBackend(backendId, registry) {
  const backend = registry.backends[backendId];

  if (!backend) {
    throw new Error(`Backend not found: ${backendId}`);
  }

  if (!backend.enabled) {
    throw new Error(`Backend is disabled: ${backendId}`);
  }

  return backend;
}

/**
 * Route tool call to backend
 *
 * @param {string} toolName - Namespaced tool name (e.g., "obs/start_recording")
 * @param {object} arguments_ - Tool arguments
 * @param {object} backendManager - Backend manager instance
 * @param {object} registry - Registry object
 * @returns {Promise<object>} - Tool result
 */
export async function routeToolCall(toolName, arguments_, backendManager, registry) {
  logger.debug('Routing tool call', { toolName, arguments: arguments_ });

  // Parse tool name
  const { backendId, toolName: actualToolName, isNamespaced } = parseToolName(toolName);

  if (!isNamespaced) {
    throw new Error(
      `Tool name must be namespaced as "backend-id/tool-name". Received: ${toolName}`
    );
  }

  // Validate backend
  const backendConfig = validateBackend(backendId, registry);

  // Get or start backend (handles on-demand backends)
  const backend = await backendManager.getBackend(backendId, backendConfig);

  if (!backend.isRunning()) {
    throw new Error(`Backend ${backendId} failed to start`);
  }

  logger.info('Tool call routed', {
    toolName: actualToolName,
    backendId,
    arguments: arguments_
  });

  // Call tool on backend via JSON-RPC over stdio
  return await callToolOnBackend(backend, actualToolName, arguments_);
}

/**
 * Call tool on backend via JSON-RPC
 *
 * MCP backends communicate via JSON-RPC 2.0 over stdio.
 * We send requests to stdin and read responses from stdout.
 */
async function callToolOnBackend(backend, toolName, arguments_) {
  return new Promise((resolve, reject) => {
    const requestId = generateRequestId();
    const timeout = backend.config.timeout || 30000;

    // Create JSON-RPC request
    const request = {
      jsonrpc: '2.0',
      id: requestId,
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: arguments_ || {}
      }
    };

    logger.debug('Sending JSON-RPC request to backend', {
      backendId: backend.backendId,
      requestId,
      method: request.method,
      tool: toolName
    });

    // Set up timeout
    const timeoutHandle = setTimeout(() => {
      backend.removeListener('message', onMessage);
      reject(new Error(`Tool call timeout after ${timeout}ms`));
    }, timeout);

    // Set up response handler via event
    const onMessage = (message) => {
      // Check if this is our response
      if (message.id === requestId) {
        clearTimeout(timeoutHandle);
        backend.removeListener('message', onMessage);

        if (message.error) {
          logger.error('Tool call error from backend', {
            backendId: backend.backendId,
            tool: toolName,
            error: message.error
          });
          reject(new Error(message.error.message || 'Tool call failed'));
        } else {
          logger.debug('Tool call successful', {
            backendId: backend.backendId,
            tool: toolName,
            result: message.result
          });
          resolve(message.result);
        }
      }
    };

    // Listen for message events
    backend.on('message', onMessage);

    // Send request to backend stdin
    try {
      const requestStr = JSON.stringify(request) + '\n';
      backend.write(requestStr);
    } catch (error) {
      clearTimeout(timeoutHandle);
      backend.removeListener('message', onMessage);
      reject(error);
    }
  });
}

/**
 * List all tools from all backends
 *
 * @param {object} backendManager - Backend manager instance
 * @param {object} registry - Registry object
 * @returns {Promise<Array>} - Array of tools with namespace prefixes
 */
export async function listAllTools(backendManager, registry) {
  logger.debug('Listing all tools from all backends');

  const allTools = [];
  const enabledBackends = Object.entries(registry.backends)
    .filter(([_, config]) => config.enabled);

  // Get tools from each enabled backend
  for (const [backendId, backendConfig] of enabledBackends) {
    try {
      // Get or start backend
      const backend = await backendManager.getBackend(backendId, backendConfig);

      if (!backend.isRunning()) {
        logger.warn(`Backend ${backendId} not running, skipping tools list`);
        continue;
      }

      // Request tools list via JSON-RPC
      const tools = await listToolsOnBackend(backend);

      // Namespace tools with backend ID
      const namespacedTools = tools.map(tool => ({
        ...tool,
        name: `${backendId}/${tool.name}`,
        _backend: backendId,
        _originalName: tool.name
      }));

      allTools.push(...namespacedTools);

      logger.debug(`Got ${tools.length} tools from backend ${backendId}`);
    } catch (error) {
      logger.error(`Failed to get tools from backend ${backendId}`, {
        error: error.message
      });
      // Continue with other backends
    }
  }

  logger.info(`Listed ${allTools.length} tools from ${enabledBackends.length} backends`);
  return allTools;
}

/**
 * List tools from a specific backend via JSON-RPC
 */
async function listToolsOnBackend(backend) {
  return new Promise((resolve, reject) => {
    const requestId = generateRequestId();
    const timeout = 10000; // 10 second timeout for list

    const request = {
      jsonrpc: '2.0',
      id: requestId,
      method: 'tools/list',
      params: {}
    };

    logger.debug('Requesting tools list from backend', {
      backendId: backend.backendId,
      requestId
    });

    const timeoutHandle = setTimeout(() => {
      backend.removeListener('message', onMessage);
      reject(new Error(`Tools list timeout after ${timeout}ms`));
    }, timeout);

    const onMessage = (message) => {
      if (message.id === requestId) {
        clearTimeout(timeoutHandle);
        backend.removeListener('message', onMessage);

        if (message.error) {
          reject(new Error(message.error.message || 'Tools list failed'));
        } else {
          // MCP returns { tools: [...] }
          resolve(message.result?.tools || []);
        }
      }
    };

    backend.on('message', onMessage);

    try {
      backend.write(JSON.stringify(request) + '\n');
    } catch (error) {
      clearTimeout(timeoutHandle);
      backend.removeListener('message', onMessage);
      reject(error);
    }
  });
}

/**
 * Generate unique request ID for JSON-RPC
 */
let requestIdCounter = 0;
function generateRequestId() {
  return `req_${Date.now()}_${++requestIdCounter}`;
}

export default {
  parseToolName,
  validateBackend,
  routeToolCall,
  listAllTools
};
