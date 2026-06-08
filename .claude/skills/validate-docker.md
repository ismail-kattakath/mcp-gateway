---
name: validate-docker
description: "Spawn a background agent to validate MCP Gateway Docker build and runtime (stdio + HTTP transports, health endpoint) locally in a loop until successful."
---

# validate-docker

Spawn a background agent to validate MCP Gateway Docker build and runtime in a loop until successful.

## What it does

Launches a background agent that:
1. Builds Docker image: `docker build -t mcp-gateway:local-test .`
2. Tests container starts in detached mode with test configuration
3. Tests health endpoint responds at `http://localhost:3000/health`
4. Validates stdio transport mode (the default auto-spawn mode)
5. Checks logs for errors or warnings
6. Troubleshoots and fixes any failures in /loop
7. Runs full test sequence 2 times to ensure stability
8. Reports build time, container status, health check result

The agent works independently and will notify you when done.

## Usage

```
/validate-docker
```

No arguments needed - the agent will run the full Docker validation automatically.

## When to use

- Before pushing Dockerfile changes
- After modifying `.dockerignore` or multi-stage build
- To verify container build and runtime stability
- Before releases (Docker images published to ghcr.io)
- As part of pre-push validation workflow for Docker changes
- After dependency updates that might affect container build

## Expected Results

- Build completes successfully (multi-stage build: build → production)
- Image size reasonable (base Alpine image)
- Container starts cleanly in both stdio and HTTP modes
- Health endpoint returns `{"status":"ok"}`
- No error logs during startup
- Registry loads successfully
- API key generation works (stored in container's keychain simulation)

## Implementation

```agent
{
  "subagent_type": "general-purpose",
  "description": "MCP Gateway Docker validation",
  "run_in_background": true,
  "prompt": "Validate MCP Gateway Docker build and runtime in /loop until successful:\n\n## Working Directory\nYou are in /Users/aloshy/aloshy-ai/mcp-gateway\n\n## Tasks\n\n1. **Build image:**\n   ```bash\n   docker build -t mcp-gateway:local-test .\n   ```\n   - Should complete without errors\n   - Multi-stage build: dependencies → build → production\n   - Check for build warnings\n\n2. **Test HTTP mode startup:**\n   ```bash\n   docker run -d --name mcp-gateway-test \\\n     -p 3001:3000 \\\n     -e GATEWAY_TRANSPORT=http \\\n     mcp-gateway:local-test\n   ```\n   - Wait 5 seconds for startup\n   - Check logs: `docker logs mcp-gateway-test`\n   - Should see \"Starting MCP Gateway Server\"\n   - Should see \"Server listening on :3000\"\n\n3. **Test health endpoint:**\n   ```bash\n   curl http://localhost:3001/health\n   ```\n   - Should return: `{\"status\":\"ok\"}`\n   - Status code should be 200\n\n4. **Check container logs:**\n   ```bash\n   docker logs mcp-gateway-test 2>&1 | grep -i error\n   ```\n   - Should be empty or only contain expected errors (like \"No registry.json found, using default\")\n\n5. **Test stdio mode:**\n   ```bash\n   docker run --rm -i mcp-gateway:local-test <<EOF\n   {\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\",\"params\":{}}\n   EOF\n   ```\n   - Should return JSON-RPC response\n   - This is the default mode for Claude Code/Claude Desktop\n\n6. **Cleanup:**\n   ```bash\n   docker stop mcp-gateway-test\n   docker rm mcp-gateway-test\n   ```\n\n7. **If any step fails:**\n   - Check Dockerfile for syntax errors\n   - Check `.dockerignore` isn't excluding required files\n   - Check server/package.json dependencies are installable\n   - Check TypeScript compilation succeeds in container\n   - Fix issues and rebuild\n\n8. **Run full sequence 2 times** to ensure stability\n\n9. **Report final status:**\n   - Build time\n   - Image size (from `docker images mcp-gateway:local-test`)\n   - Container startup time\n   - Health check result\n   - Any warnings or issues\n   - Stdio mode test result\n\n## Important\n\n- DO NOT push any changes\n- DO test both stdio and HTTP transports\n- DO check for any error logs\n- DON'T skip the 2-run stability test\n- DON'T leave test containers running (cleanup after each run)\n\nYour goal is to validate Docker build/runtime stability before pushing."
}
```

## Known Docker Configuration

**Dockerfile:**
- Multi-stage build (node:18-alpine base)
- Stage 1: Install dependencies (both server + UI)
- Stage 2: Build TypeScript + React
- Stage 3: Production image (only runtime dependencies + dist/)
- Entrypoint: `node dist/index.js`

**Transports:**
- Default: stdio (for auto-spawn mode with Claude Code/Desktop)
- Optional: HTTP/SSE (for persistent daemon mode)

**Port:**
- Internal: 3000
- Configurable via `GATEWAY_PORT` env var
