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

import type { Response } from 'express';
import logger from '../logging/logger.js';
import { routeToolCall, listAllTools } from './router.js';
import type { Registry } from '../types/registry.js';
import type { ServerManager } from './backends/index.js';

// JSON-RPC 2.0 Types
export interface JsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
  id?: string | number;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: JsonRpcError;
}

export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

// MCP-specific types
export interface MCPTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface MCPToolsListResult {
  tools: MCPTool[];
}

export interface MCPToolCallParams {
  name: string;
  arguments?: Record<string, unknown>;
}

export interface MCPToolCallResult {
  content: Array<{
    type: string;
    text: string;
  }>;
}

export interface MCPInitializeParams {
  clientInfo?: {
    name?: string;
    version?: string;
  };
}

export interface MCPInitializeResult {
  protocolVersion: string;
  serverInfo: {
    name: string;
    version: string;
  };
  capabilities: {
    tools: {
      listChanged: boolean;
    };
    prompts: {
      listChanged: boolean;
    };
    resources: {
      listChanged: boolean;
      subscribe: boolean;
    };
  };
}

/**
 * Handle MCP request
 *
 * @param request - JSON-RPC request
 * @param serverManager - Backend manager instance
 * @param registry - Registry object
 * @returns JSON-RPC response
 */
export async function handleMCPRequest(
  request: JsonRpcRequest,
  serverManager: ServerManager,
  registry: Registry
): Promise<JsonRpcResponse> {
  logger.debug('Handling MCP request', {
    id: request.id,
    method: request.method
  });

  // Validate JSON-RPC format
  if (request.jsonrpc !== '2.0') {
    return createErrorResponse(
      request.id ?? null,
      -32600,
      'Invalid Request',
      'jsonrpc field must be "2.0"'
    );
  }

  if (!request.method) {
    return createErrorResponse(
      request.id ?? null,
      -32600,
      'Invalid Request',
      'method field is required'
    );
  }

  try {
    // Route to appropriate handler
    let result: unknown;

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
          request.id ?? null,
          -32601,
          'Method not found',
          `Unknown method: ${request.method}`
        );
    }

    return createSuccessResponse(request.id ?? null, result);
  } catch (error) {
    const err = error as Error;
    logger.error('Error handling MCP request', {
      method: request.method,
      error: err.message,
      stack: err.stack
    });

    return createErrorResponse(
      request.id ?? null,
      -32603,
      'Internal error',
      err.message
    );
  }
}

/**
 * Handle tools/list request
 */
async function handleToolsList(
  params: unknown,
  serverManager: ServerManager,
  registry: Registry
): Promise<MCPToolsListResult> {
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
async function handleToolsCall(
  params: unknown,
  serverManager: ServerManager,
  registry: Registry
): Promise<MCPToolCallResult> {
  const toolParams = params as MCPToolCallParams;

  if (!toolParams?.name) {
    throw new Error('Tool name is required');
  }

  logger.info('Handling tools/call request', {
    toolName: toolParams.name,
    hasArguments: !!toolParams.arguments
  });

  const result = await routeToolCall(
    toolParams.name,
    toolParams.arguments || {},
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
async function handlePromptsList(
  _params: unknown,
  _serverManager: ServerManager,
  _registry: Registry
): Promise<{ prompts: unknown[] }> {
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
async function handlePromptsGet(
  params: unknown,
  _serverManager: ServerManager,
  _registry: Registry
): Promise<never> {
  const promptParams = params as { name?: string };

  if (!promptParams?.name) {
    throw new Error('Prompt name is required');
  }

  logger.info('Handling prompts/get request', { promptName: promptParams.name });

  // TODO: Route to backend and get prompt
  throw new Error('Prompts not yet implemented');
}

/**
 * Handle resources/list request
 */
async function handleResourcesList(
  _params: unknown,
  _serverManager: ServerManager,
  _registry: Registry
): Promise<{ resources: unknown[] }> {
  logger.info('Handling resources/list request');

  // TODO: Aggregate resources from backends
  return {
    resources: []
  };
}

/**
 * Handle resources/read request
 */
async function handleResourcesRead(
  params: unknown,
  _serverManager: ServerManager,
  _registry: Registry
): Promise<never> {
  const resourceParams = params as { uri?: string };

  if (!resourceParams?.uri) {
    throw new Error('Resource URI is required');
  }

  logger.info('Handling resources/read request', { uri: resourceParams.uri });

  // TODO: Route to backend and read resource
  throw new Error('Resources not yet implemented');
}

/**
 * Handle initialize request (MCP handshake)
 */
async function handleInitialize(
  params: unknown,
  serverManager: ServerManager,
  registry: Registry
): Promise<MCPInitializeResult> {
  const initParams = params as MCPInitializeParams;
  logger.info('Handling initialize request', { clientInfo: initParams?.clientInfo });

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
export function createSuccessResponse(id: string | number | null, result: unknown): JsonRpcResponse {
  return {
    jsonrpc: '2.0',
    id,
    result
  };
}

/**
 * Create JSON-RPC error response
 */
export function createErrorResponse(
  id: string | number | null,
  code: number,
  message: string,
  data: unknown = null
): JsonRpcResponse {
  const error: JsonRpcError = {
    code,
    message
  };

  if (data !== null) {
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
export function parseRequest(requestStr: string): JsonRpcRequest {
  try {
    const request = JSON.parse(requestStr) as JsonRpcRequest;

    if (!request.jsonrpc || !request.method) {
      throw new Error('Invalid JSON-RPC request format');
    }

    return request;
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to parse JSON-RPC request', {
      error: err.message,
      requestStr
    });
    throw new Error(`Invalid JSON: ${err.message}`);
  }
}

/**
 * Format JSON-RPC response as string
 */
export function formatResponse(response: JsonRpcResponse | JsonRpcNotification): string {
  return JSON.stringify(response);
}

/**
 * Create SSE message from JSON-RPC response
 */
export function createSSEMessage(response: JsonRpcResponse | JsonRpcNotification): string {
  const data = formatResponse(response);
  return `data: ${data}\n\n`;
}

/**
 * Stream MCP message over SSE connection
 */
export function streamMessage(res: Response, message: string | JsonRpcResponse | JsonRpcNotification): void {
  try {
    if (typeof message === 'string') {
      res.write(`data: ${message}\n\n`);
    } else {
      res.write(createSSEMessage(message));
    }
  } catch (error) {
    const err = error as Error;
    logger.error('Error streaming SSE message', { error: err.message });
  }
}

/**
 * Send JSON-RPC notification (no ID)
 */
export function sendNotification(res: Response, method: string, params?: unknown): void {
  const notification: JsonRpcNotification = {
    jsonrpc: '2.0',
    method,
    params
  };

  streamMessage(res, notification);
}

/**
 * Handle MCP request and stream response
 */
export async function handleAndStreamRequest(
  requestStr: string,
  res: Response,
  serverManager: ServerManager,
  registry: Registry
): Promise<void> {
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
    const err = error as Error;
    logger.error('Error handling and streaming request', {
      error: err.message,
      stack: err.stack
    });

    // Send error response
    const errorResponse = createErrorResponse(
      null,
      -32700,
      'Parse error',
      err.message
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
