/**
 * MCP Tool Call Router
 *
 * Routes namespaced tool calls to the correct server.
 * Tool names are formatted "<server-name>/<tool-name>".
 */

import logger from '../logging/logger.js';

/**
 * Parse a namespaced tool name.
 * Returns { serverName, toolName, isNamespaced }.
 */
export function parseToolName(toolName) {
  if (!toolName) throw new Error('Tool name is required');

  const parts = toolName.split('/');
  if (parts.length === 1) {
    return { serverName: null, toolName: parts[0], isNamespaced: false };
  }
  if (parts.length === 2) {
    return { serverName: parts[0], toolName: parts[1], isNamespaced: true };
  }
  return { serverName: parts[0], toolName: parts.slice(1).join('/'), isNamespaced: true };
}

export function validateServer(serverName, registry) {
  const server = registry.servers[serverName];
  if (!server) throw new Error(`Server not found: ${serverName}`);
  if (!server.enabled) throw new Error(`Server is disabled: ${serverName}`);
  return server;
}

export async function routeToolCall(toolName, args, serverManager, registry) {
  logger.debug('Routing tool call', { toolName, arguments: args });

  const { serverName, toolName: actualToolName, isNamespaced } = parseToolName(toolName);
  if (!isNamespaced) {
    throw new Error(`Tool name must be namespaced as "<server-name>/<tool-name>". Received: ${toolName}`);
  }

  const config = validateServer(serverName, registry);
  const server = await serverManager.getServer(serverName, config);
  if (!server.isRunning()) throw new Error(`Server ${serverName} failed to start`);

  logger.info('Tool call routed', { toolName: actualToolName, serverName });
  return await callToolOnServer(server, actualToolName, args);
}

async function callToolOnServer(server, toolName, args) {
  return new Promise((resolve, reject) => {
    const requestId = generateRequestId();
    const timeout = server.config.timeout || 30000;

    const request = {
      jsonrpc: '2.0',
      id: requestId,
      method: 'tools/call',
      params: { name: toolName, arguments: args || {} }
    };

    const timeoutHandle = setTimeout(() => {
      server.removeListener('message', onMessage);
      reject(new Error(`Tool call timeout after ${timeout}ms`));
    }, timeout);

    const onMessage = (message) => {
      if (message.id === requestId) {
        clearTimeout(timeoutHandle);
        server.removeListener('message', onMessage);
        if (message.error) reject(new Error(message.error.message || 'Tool call failed'));
        else resolve(message.result);
      }
    };

    server.on('message', onMessage);

    try {
      server.write(JSON.stringify(request) + '\n');
    } catch (error) {
      clearTimeout(timeoutHandle);
      server.removeListener('message', onMessage);
      reject(error);
    }
  });
}

export async function listAllTools(serverManager, registry) {
  logger.debug('Listing tools from all enabled servers');

  const allTools = [];
  const enabledServers = Object.entries(registry.servers).filter(([_, c]) => c.enabled);

  for (const [serverName, config] of enabledServers) {
    try {
      const server = await serverManager.getServer(serverName, config);
      if (!server.isRunning()) {
        logger.warn(`Server ${serverName} not running, skipping tools list`);
        continue;
      }
      const tools = await listToolsOnServer(server);
      const namespacedTools = tools.map(tool => ({
        ...tool,
        name: `${serverName}/${tool.name}`,
        _server: serverName,
        _originalName: tool.name
      }));
      allTools.push(...namespacedTools);
    } catch (error) {
      logger.error(`Failed to get tools from server ${serverName}`, { error: error.message });
    }
  }

  logger.info(`Listed ${allTools.length} tools from ${enabledServers.length} servers`);
  return allTools;
}

async function listToolsOnServer(server) {
  return new Promise((resolve, reject) => {
    const requestId = generateRequestId();
    const timeout = 10000;

    const request = { jsonrpc: '2.0', id: requestId, method: 'tools/list', params: {} };

    const timeoutHandle = setTimeout(() => {
      server.removeListener('message', onMessage);
      reject(new Error(`Tools list timeout after ${timeout}ms`));
    }, timeout);

    const onMessage = (message) => {
      if (message.id === requestId) {
        clearTimeout(timeoutHandle);
        server.removeListener('message', onMessage);
        if (message.error) reject(new Error(message.error.message || 'Tools list failed'));
        else resolve(message.result?.tools || []);
      }
    };

    server.on('message', onMessage);

    try {
      server.write(JSON.stringify(request) + '\n');
    } catch (error) {
      clearTimeout(timeoutHandle);
      server.removeListener('message', onMessage);
      reject(error);
    }
  });
}

let requestIdCounter = 0;
function generateRequestId() {
  return `req_${Date.now()}_${++requestIdCounter}`;
}

export default { parseToolName, validateServer, routeToolCall, listAllTools };
