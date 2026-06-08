# MCP Gateway Testing Guide

Comprehensive testing documentation for the MCP Gateway.

## Test Suites

The gateway includes four types of tests:

1. **Unit Tests** - Test individual functions and modules
2. **Integration Tests** - Test end-to-end server functionality
3. **E2E Tests** - Test real-world usage scenarios
4. **Validation Tests** - Test configuration and schema validation

## Running Tests

### All Tests

```bash
./scripts/test.sh
```

This runs all test suites and provides a summary.

### Individual Test Suites

```bash
# Unit tests
cd server && npm test

# Integration tests
cd server && node tests/integration.test.js

# E2E tests
./scripts/e2e-test.sh

# Validation only
cd server && npm run validate
```

## Unit Tests

Located in `server/tests/`

### Backend Manager Tests

File: `server/tests/backend-manager.test.js`

Tests:
- Backend lifecycle management
- Backend spawning and killing
- State transitions
- Error handling

Run:
```bash
cd server
node --test tests/backend-manager.test.js
```

### OAuth Tests

File: `server/tests/oauth.test.js`

Tests:
- OAuth flow initialization
- Token storage and encryption
- Token refresh logic
- Provider configuration

Run:
```bash
cd server
node --test tests/oauth.test.js
```

### Validation Tests

File: `server/tests/validation.test.js`

Tests:
- Registry schema validation
- Environment variable resolution
- Configuration parsing
- Error messages

Run:
```bash
cd server
node --test tests/validation.test.js
```

### Backend Tests

File: `server/tests/backends.test.js`

Tests:
- NPX backend spawning
- Docker backend management
- Git backend cloning and building
- Remote backend connections

Run:
```bash
cd server
node --test tests/backends.test.js
```

## Integration Tests

File: `server/tests/integration.test.js`

Tests the complete server in a real environment:

### Test Cases

1. **Server Health**
   - Health endpoint responds
   - Root endpoint responds

2. **SSE Connection**
   - Accepts SSE connections
   - Sends initial message

3. **MCP Protocol**
   - Initialize request
   - Tools list request
   - Tool call request

4. **API Endpoints**
   - Backend status API
   - Config API
   - Logs API
   - CORS handling

5. **OAuth Endpoints**
   - OAuth routes available
   - Redirect flows

6. **Error Handling**
   - Invalid JSON handling
   - Unknown methods
   - 404 responses

7. **Backend Management**
   - Backend spawning on demand
   - Backend state tracking

### Running Integration Tests

```bash
cd server
node tests/integration.test.js
```

**Note:** Integration tests start a test server on port 3001. Ensure this port is available.

### Integration Test Output

```
[Setup] Starting server...
[Setup] Server started

✓ should respond to health check (45ms)
✓ should respond to root endpoint (12ms)
✓ should accept SSE connection to /sse (234ms)
...

[Cleanup] Stopping server...
[Cleanup] Server stopped

Tests passed: 15
```

## E2E Tests

File: `scripts/e2e-test.sh`

Tests the gateway in a production-like environment using curl and bash.

### Test Cases

1. Health endpoint
2. Root endpoint
3. Backend status API
4. Config API
5. Logs API
6. OAuth status API
7. SSE endpoint connection
8. MCP initialize request
9. MCP tools/list request
10. 404 error handling
11. Invalid JSON handling

### Running E2E Tests

```bash
./scripts/e2e-test.sh
```

### E2E Test Output

```
[INFO] Starting test server on port 3002...
[PASS] Health endpoint
[PASS] Backend status API
[PASS] MCP initialize request
  Found 8 tools
...

Test Summary:
[PASS] Tests passed: 11
```

## Manual Testing

### Test SSE Connection

```bash
curl -N -H "Accept: text/event-stream" http://localhost:3000/sse
```

Should output:
```
event: message
data: {"jsonrpc":"2.0","method":"initialized","params":{}}
```

### Test MCP Initialize

```bash
curl -X POST http://localhost:3000/message \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "0.1.0",
      "capabilities": {},
      "clientInfo": {
        "name": "test-client",
        "version": "1.0.0"
      }
    }
  }'
```

Should return:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "serverInfo": {
      "name": "mcp-gateway",
      "version": "1.0.0"
    },
    "capabilities": {
      "tools": {}
    }
  }
}
```

### Test Tools List

```bash
curl -X POST http://localhost:3000/message \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/list",
    "params": {}
  }'
```

Should return list of tools from enabled backends.

### Test Tool Call

```bash
curl -X POST http://localhost:3000/message \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "kapture/screenshot",
      "arguments": {}
    }
  }'
```

Should trigger backend spawning and return tool result.

### Test Backend Status

```bash
curl http://localhost:3000/api/status
```

Should return:
```json
{
  "backends": {
    "obs": {
      "state": "idle",
      "enabled": true
    },
    "kapture": {
      "state": "running",
      "enabled": true,
      "pid": 12345
    }
  },
  "connections": 1,
  "uptime": 3600
}
```

### Test Health Check

```bash
curl http://localhost:3000/health
```

Should return:
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Testing with AI Tools

### Claude Code

1. Add gateway to `~/.claude/.mcp.json`:
   ```json
   {
     "mcpServers": {
       "gateway": {
         "url": "http://localhost:3000/sse",
         "transport": "sse"
       }
     }
   }
   ```

2. Restart Claude Code

3. Try commands:
   - "List available MCP tools"
   - "Take a screenshot"
   - "What tools do you have access to?"

4. Check gateway logs:
   ```bash
   tail -f ~/.mcp/logs/gateway.log
   ```

### Testing Specific Backends

#### Test OBS Backend

Prerequisites:
- OBS Studio installed and running
- WebSocket server enabled in OBS
- `OBS_WEBSOCKET_PASSWORD` set in `.env`

Test commands:
- "Start OBS recording"
- "Stop OBS recording"
- "Get OBS recording status"

#### Test Kapture Backend

Prerequisites:
- Screen recording permissions granted

Test commands:
- "Take a screenshot"
- "Capture a screen recording"

#### Test GitHub Backend

Prerequisites:
- GitHub OAuth configured
- Backend enabled in `registry.json`
- OAuth connection established

Test commands:
- "List my GitHub repositories"
- "Create a new issue in repo X"
- "Get latest commits from repo Y"

## Performance Testing

### Backend Spawn Time

Measure how long it takes to spawn a backend:

```bash
# Start with gateway running, all backends idle
time curl -X POST http://localhost:3000/message \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "kapture/screenshot",
      "arguments": {}
    }
  }'
```

Expected: 1-3 seconds for first call (spawning), <100ms for subsequent calls.

### Concurrent Connections

Test with multiple SSE connections:

```bash
# Terminal 1
curl -N -H "Accept: text/event-stream" http://localhost:3000/sse

# Terminal 2
curl -N -H "Accept: text/event-stream" http://localhost:3000/sse

# Terminal 3
curl -N -H "Accept: text/event-stream" http://localhost:3000/sse
```

Check status:
```bash
curl http://localhost:3000/api/status | jq '.connections'
```

Should show 3 active connections.

### Memory Usage

Monitor memory with multiple backends:

```bash
# macOS
ps aux | grep "node.*index.js"

# Linux
ps aux | grep "node.*index.js"

# Watch continuously
watch -n 1 "ps aux | grep 'node.*index.js'"
```

Expected: ~50-100MB base, +20-50MB per active backend.

## Load Testing

Use `ab` (Apache Bench) or `wrk` for load testing:

```bash
# Install ab (if not available)
# macOS: comes with system
# Linux: sudo apt install apache2-utils

# Test health endpoint
ab -n 1000 -c 10 http://localhost:3000/health

# Test API endpoint
ab -n 100 -c 5 http://localhost:3000/api/status
```

Expected:
- Health endpoint: 1000+ req/s
- API endpoints: 500+ req/s
- MCP endpoints: 100+ req/s (limited by backend spawn time)

## Debugging Tests

### Enable Debug Logging

```bash
# Set in .env
LOG_LEVEL=debug

# Or run with env var
LOG_LEVEL=debug npm run dev
```

### View Test Logs

```bash
# Integration test logs
cat /tmp/mcp-gateway-test.log

# E2E test logs
cat /tmp/mcp-gateway-e2e.log

# Gateway logs
cat ~/.mcp/logs/gateway.log
```

### Test with Node Inspector

```bash
cd server
node --inspect --test tests/integration.test.js
```

Open Chrome DevTools at `chrome://inspect`

### Test Individual Functions

Use Node.js REPL:

```bash
cd server
node
```

```javascript
import { initRegistry } from './src/mcp/registry.js';
await initRegistry('/path/to/registry.json');
// Test functions interactively
```

## Continuous Integration

### GitHub Actions

Create `.github/workflows/test.yml`:

```yaml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - uses: actions/setup-node@v3
      with:
        node-version: '18'
    
    - name: Install dependencies
      run: |
        cd server && npm install
    
    - name: Run unit tests
      run: |
        cd server && npm test
    
    - name: Run validation
      run: |
        cd server && npm run validate
    
    - name: Run integration tests
      run: |
        cd server && node tests/integration.test.js
```

### Pre-commit Hook

Create `.git/hooks/pre-commit`:

```bash
#!/bin/bash
set -e

echo "Running tests before commit..."

cd server
npm test

echo "All tests passed!"
```

Make executable:
```bash
chmod +x .git/hooks/pre-commit
```

## Test Coverage

### Generate Coverage Report

```bash
cd server
npm install --save-dev c8

# Run tests with coverage
npx c8 npm test

# Generate HTML report
npx c8 --reporter=html npm test

# Open report
open coverage/index.html  # macOS
xdg-open coverage/index.html  # Linux
```

Expected coverage:
- Core modules: >80%
- Backend managers: >70%
- OAuth flows: >60%
- Overall: >75%

## Troubleshooting Tests

### Tests Timeout

Increase timeout in test files:

```javascript
describe('My test', { timeout: 60000 }, () => {
  // 60 second timeout
});
```

### Port Already in Use

Tests use different ports:
- Integration tests: 3001
- E2E tests: 3002

Kill existing processes:
```bash
lsof -ti:3001 | xargs kill -9
lsof -ti:3002 | xargs kill -9
```

### Backend Not Available

Some tests require backends to be installable:

```bash
# Test if npx works
npx -y obs-mcp --version

# Test if Docker works
docker ps
```

Skip tests if dependencies are missing:

```javascript
if (!backendAvailable) {
  console.log('Skipping backend test - dependency not available');
  return;
}
```

### Tests Fail in CI

CI environments may not have:
- Docker
- Screen recording permissions
- Certain npm packages

Use conditional tests:

```javascript
const hasDocker = await checkDockerAvailable();
if (!hasDocker) {
  console.log('Skipping Docker tests');
  return;
}
```

## Best Practices

1. **Run tests before commits**
   ```bash
   ./scripts/test.sh
   ```

2. **Test on clean state**
   ```bash
   rm -rf ~/.mcp/cache
   rm -rf ~/.mcp/repos
   ./scripts/test.sh
   ```

3. **Test with realistic config**
   - Use production-like `registry.json`
   - Test with actual backends enabled

4. **Monitor logs during tests**
   ```bash
   tail -f ~/.mcp/logs/gateway.log
   ```

5. **Test error paths**
   - Invalid configs
   - Missing environment variables
   - Backend failures

6. **Test cleanup**
   - Verify backends are killed after tests
   - Check for port leaks
   - Monitor memory leaks

## Summary

Testing checklist:
- ✅ Unit tests pass (`npm test`)
- ✅ Integration tests pass
- ✅ E2E tests pass
- ✅ Registry validation passes
- ✅ Manual SSE connection works
- ✅ MCP protocol works
- ✅ Backends spawn correctly
- ✅ AI tool can connect
- ✅ No memory leaks
- ✅ No port conflicts

Run all tests:
```bash
./scripts/test.sh
```

For issues, check:
- Gateway logs: `~/.mcp/logs/gateway.log`
- Test logs: `/tmp/mcp-gateway-*.log`
- Backend states: `curl http://localhost:3000/api/status`
