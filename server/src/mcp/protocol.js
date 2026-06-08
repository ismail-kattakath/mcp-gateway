/**
 * MCP Protocol Handler
 *
 * Implements MCP (Model Context Protocol) over SSE transport
 * Handles JSON-RPC 2.0 message format and routing
 *
 * MCP Specification: https://modelcontextprotocol.io/
 * Supported Methods:
 * - tools/list - List all available tools
 * - tools/call - Execute a tool
 * - prompts/list - List available prompts (future)
 * - prompts/get - Get prompt template (future)
 * - resources/list - List resources (future)
 * - resources/read - Read resource (future)
 */

import logger from '../logging/logger.js';
import { routeToolCall, listAllTools } from './router.js';

/**
 * Handle MCP request
 *
 * @param {object} request - JSON-RPC request
 * @param {object} serverManager - Backend manager instance
 * @param {object} registry - Registry object
 * @returns {Promise<object>} - JSON-RPC response
 */
export async function handleMCPRequest(request, serverManager, registry) {
  logger.debug('Handling MCP request', {
    id: request.id,
    method: request.method
  });

  // Validate JSON-RPC format
  if (request.jsonrpc !== '2.0') {
    return createErrorResponse(
      request.id,
      -32600,
      'Invalid Request',
      'jsonrpc field must be "2.0"'
    );
  }

  if (!request.method) {
    return createErrorResponse(
      request.id,
      -32600,
      'Invalid Request',
      'method field is required'
    );
  }

  try {
    // Route to appropriate handler
    let result;

    switch (request.method) {
      case 'tools/list':
        result = await handleToolsList(request.params, serverManager, registry);
        break;

      case 'tools/call':
        result = await handleToolsCall(request.params, serverManager, registry);
        break;

      case 'prompts/list':
        result = await handlePromptsList(request.params, serverManager, registry);
        break;

      case 'prompts/get':
        result = await handlePromptsGet(request.params, serverManager, registry);
        break;

      case 'resources/list':
        result = await handleResourcesList(request.params, serverManager, registry);
        break;

      case 'resources/read':
        result = await handleResourcesRead(request.params, serverManager, registry);
        break;

      case 'initialize':
        result = await handleInitialize(request.params, serverManager, registry);
        break;

      case 'ping':
        result = { pong: true };
        break;

      default:
        return createErrorResponse(
          request.id,
          -32601,
          'Method not found',
          `Unknown method: ${request.method}`
        );
    }

    return createSuccessResponse(request.id, result);
  } catch (error) {
    logger.error('Error handling MCP request', {
      method: request.method,
      error: error.message,
      stack: error.stack
    });

    return createErrorResponse(
      request.id,
      -32603,
      'Internal error',
      error.message
    );
  }
}

/**
 * Handle tools/list request
 */
async function handleToolsList(params, serverManager, registry) {
  logger.info('Handling tools/list request');

  const tools = await listAllTools(serverManager, registry);

  return {
    tools: tools.map(tool => ({
      name: tool.name,
      description: tool.description || '',
      inputSchema: tool.inputSchema || { type: 'object', properties: {} }
    }))
  };
}

/**
 * Handle tools/call request
 */
async function handleToolsCall(params, serverManager, registry) {
  if (!params?.name) {
    throw new Error('Tool name is required');
  }

  logger.info('Handling tools/call request', {
    toolName: params.name,
    hasArguments: !!params.arguments
  });

  const result = await routeToolCall(
    params.name,
    params.arguments || {},
    serverManager,
    registry
  );

  // MCP tool call response format
  return {
    content: [
      {
        type: 'text',
        text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
      }
    ]
  };
}

/**
 * Handle prompts/list request
 */
async function handlePromptsList(params, serverManager, registry) {
  logger.info('Handling prompts/list request');

  // TODO: Aggregate prompts from backends
  // For now, return empty array
  return {
    prompts: []
  };
}

/**
 * Handle prompts/get request
 */
async function handlePromptsGet(params, serverManager, registry) {
  if (!params?.name) {
    throw new Error('Prompt name is required');
  }

  logger.info('Handling prompts/get request', { promptName: params.name });

  // TODO: Route to backend and get prompt
  throw new Error('Prompts not yet implemented');
}

/**
 * Handle resources/list request
 */
async function handleResourcesList(params, serverManager, registry) {
  logger.info('Handling resources/list request');

  // TODO: Aggregate resources from backends
  return {
    resources: []
  };
}

/**
 * Handle resources/read request
 */
async function handleResourcesRead(params, serverManager, registry) {
  if (!params?.uri) {
    throw new Error('Resource URI is required');
  }

  logger.info('Handling resources/read request', { uri: params.uri });

  // TODO: Route to backend and read resource
  throw new Error('Resources not yet implemented');
}

/**
 * Handle initialize request (MCP handshake)
 */
async function handleInitialize(params, serverManager, registry) {
  logger.info('Handling initialize request', { clientInfo: params?.clientInfo });

  return {
    protocolVersion: '2024-11-05',
    serverInfo: {
      name: 'mcp-gateway',
      version: registry.version || '2.0'
    },
    capabilities: {
      tools: {
        // Gateway emits notifications/tools/list_changed when registry.json is
        // edited at runtime and the server manager reloads. See index.js.
        listChanged: true
      },
      prompts: {
        listChanged: false
      },
      resources: {
        listChanged: false,
        subscribe: false
      }
    }
  };
}

/**
 * Create JSON-RPC success response
 */
export function createSuccessResponse(id, result) {
  return {
    jsonrpc: '2.0',
    id,
    result
  };
}

/**
 * Create JSON-RPC error response
 */
export function createErrorResponse(id, code, message, data = null) {
  const error = {
    code,
    message
  };

  if (data) {
    error.data = data;
  }

  return {
    jsonrpc: '2.0',
    id,
    error
  };
}

/**
 * Parse JSON-RPC request from string
 */
export function parseRequest(requestStr) {
  try {
    const request = JSON.parse(requestStr);

    if (!request.jsonrpc || !request.method) {
      throw new Error('Invalid JSON-RPC request format');
    }

    return request;
  } catch (error) {
    logger.error('Failed to parse JSON-RPC request', {
      error: error.message,
      requestStr
    });
    throw new Error(`Invalid JSON: ${error.message}`);
  }
}

/**
 * Format JSON-RPC response as string
 */
export function formatResponse(response) {
  return JSON.stringify(response);
}

/**
 * Create SSE message from JSON-RPC response
 */
export function createSSEMessage(response) {
  const data = formatResponse(response);
  return `data: ${data}\n\n`;
}

/**
 * Stream MCP message over SSE connection
 */
export function streamMessage(res, message) {
  try {
    if (typeof message === 'string') {
      res.write(`data: ${message}\n\n`);
    } else {
      res.write(createSSEMessage(message));
    }
  } catch (error) {
    logger.error('Error streaming SSE message', { error: error.message });
  }
}

/**
 * Send JSON-RPC notification (no ID)
 */
export function sendNotification(res, method, params) {
  const notification = {
    jsonrpc: '2.0',
    method,
    params
  };

  streamMessage(res, notification);
}

/**
 * Handle MCP request and stream response
 */
export async function handleAndStreamRequest(requestStr, res, serverManager, registry) {
  try {
    // Parse request
    const request = parseRequest(requestStr);

    // Handle request
    const response = await handleMCPRequest(request, serverManager, registry);

    // Stream response
    streamMessage(res, response);

    logger.debug('MCP request handled and streamed', {
      method: request.method,
      id: request.id
    });
  } catch (error) {
    logger.error('Error handling and streaming request', {
      error: error.message,
      stack: error.stack
    });

    // Send error response
    const errorResponse = createErrorResponse(
      null,
      -32700,
      'Parse error',
      error.message
    );
    streamMessage(res, errorResponse);
  }
}

export default {
  handleMCPRequest,
  handleAndStreamRequest,
  createSuccessResponse,
  createErrorResponse,
  parseRequest,
  formatResponse,
  createSSEMessage,
  streamMessage,
  sendNotification
};
