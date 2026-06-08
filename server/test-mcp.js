#!/usr/bin/env node

/**
 * Test MCP Protocol Implementation
 *
 * Tests the MCP gateway with various requests
 */

import fetch from 'node-fetch';

const GATEWAY_URL = 'http://localhost:3000';

async function testMCPRequest(method, params = {}) {
  const request = {
    jsonrpc: '2.0',
    id: Math.floor(Math.random() * 10000),
    method,
    params
  };

  console.log(`\n📤 Sending ${method} request:`, JSON.stringify(request, null, 2));

  try {
    const response = await fetch(`${GATEWAY_URL}/mcp/message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(request)
    });

    const result = await response.json();
    console.log(`📥 Response:`, JSON.stringify(result, null, 2));
    return result;
  } catch (error) {
    console.error(`❌ Error:`, error.message);
    throw error;
  }
}

async function testSSEConnection() {
  console.log(`\n🔌 Testing SSE connection...`);

  try {
    const response = await fetch(`${GATEWAY_URL}/sse`);

    if (!response.ok) {
      throw new Error(`SSE connection failed: ${response.status}`);
    }

    console.log('✅ SSE connection established');
    console.log('📡 Listening for messages (5 seconds)...\n');

    const reader = response.body;
    let buffer = '';

    // Read for 5 seconds
    const timeout = setTimeout(() => {
      console.log('\n⏱️  Test timeout, closing connection');
      response.body.destroy();
    }, 5000);

    reader.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n\n');
      buffer = lines.pop(); // Keep incomplete message

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.substring(6);
          try {
            const message = JSON.parse(data);
            console.log('📨 SSE Message:', JSON.stringify(message, null, 2));
          } catch (e) {
            console.log('📨 SSE Message (raw):', data);
          }
        } else if (line.startsWith(': ')) {
          // Ping/comment
          console.log('💓 Keep-alive ping');
        }
      }
    });

    reader.on('end', () => {
      clearTimeout(timeout);
      console.log('🔌 SSE connection closed');
    });

    reader.on('error', (error) => {
      clearTimeout(timeout);
      console.error('❌ SSE error:', error.message);
    });

    // Wait for timeout
    await new Promise(resolve => {
      setTimeout(resolve, 5500);
    });

  } catch (error) {
    console.error(`❌ SSE Error:`, error.message);
  }
}

async function main() {
  console.log('🚀 MCP Gateway Protocol Test\n');

  // Test 1: Health check
  console.log('1️⃣  Testing health endpoint...');
  try {
    const response = await fetch(`${GATEWAY_URL}/health`);
    const health = await response.json();
    console.log('✅ Gateway is healthy:', health.status);
    console.log(`   Backends: ${health.backends.running}/${health.backends.enabled} running`);
  } catch (error) {
    console.error('❌ Gateway is not accessible:', error.message);
    console.error('   Make sure the gateway server is running: npm run dev');
    process.exit(1);
  }

  // Test 2: SSE Connection
  await testSSEConnection();

  // Test 3: Initialize
  await testMCPRequest('initialize', {
    clientInfo: {
      name: 'test-client',
      version: '1.0.0'
    },
    protocolVersion: '2024-11-05'
  });

  // Test 4: Tools List
  await testMCPRequest('tools/list', {});

  // Test 5: Ping
  await testMCPRequest('ping', {});

  // Test 6: Tool Call (if OBS backend is enabled)
  // Uncomment if you want to test actual tool calls
  /*
  await testMCPRequest('tools/call', {
    name: 'obs/get_current_scene',
    arguments: {}
  });
  */

  console.log('\n✅ All tests completed!');
}

main().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
