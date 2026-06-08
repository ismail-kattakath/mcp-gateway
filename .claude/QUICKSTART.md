# Quick Start for Development

## For Main Orchestrator Agent

When spawned in this directory with `/resume`, follow this workflow:

### 1. Understand Context
```bash
# Read these in order:
1. CLAUDE.md - Complete technical architecture
2. .claude/PROJECT.md - Agent coordination strategy
3. README.md - User-facing overview
```

### 2. Phase 1: Foundation (Spawn in Parallel)

```javascript
// Send in ONE message for parallel execution:
Agent({
  subagent_type: "schema-validator",
  description: "Create JSON schema and types",
  prompt: "Create schema/registry-v2.schema.json with complete JSON Schema Draft 7 for registry format. Include all 11 backend types as discriminated unions. Add custom validators for env vars (${VAR}), git URLs, docker images. Then generate types/registry.d.ts TypeScript definitions. See CLAUDE.md for full spec."
})

Agent({
  subagent_type: "docker-infra",
  description: "Docker setup",
  prompt: "Create multi-stage Dockerfile: (1) server build, (2) UI build, (3) production runtime. Include docker-compose.yml for local dev with hot reload volumes. Add docker-compose.prod.yml for production. See .claude/agents/docker-infra.md for requirements."
})
```

### 3. Phase 2: Backend Core (Sequential then Parallel)

Wait for schema completion, then:

```javascript
Agent({
  subagent_type: "backend-dev",
  description: "Initialize server structure",
  prompt: "Create server/ with package.json, src/index.js (Express + SSE setup), src/mcp/registry.js (load & validate registry), src/logging/logger.js (Winston). Install deps: express, dotenv, winston, ajv, axios. Initialize npm project."
})
```

After structure ready:

```javascript
// Parallel: independent backend managers
Agent({
  subagent_type: "backend-dev",
  description: "NPX and Docker backends",
  prompt: "Implement src/mcp/backends/npx.js (spawn npx processes) and docker.js (use dockerode). Include lifecycle management (on-demand vs persistent), process pooling, health checks."
})

Agent({
  subagent_type: "backend-dev",
  description: "Git and local backends",
  prompt: "Implement src/mcp/backends/git.js (clone, build npm/python/docker) and local.js (execute local scripts). Use simple-git for cloning. Handle build steps array."
})

Agent({
  subagent_type: "backend-dev",
  description: "Remote backends",
  prompt: "Implement src/mcp/backends/remote.js (proxy SSE and HTTP MCP servers). Handle headers, auth, timeout. Use EventSource for SSE."
})
```

### 4. Phase 3: Server + UI (Parallel)

```javascript
Agent({
  subagent_type: "backend-dev",
  description: "MCP protocol and routing",
  prompt: "Implement src/mcp/protocol.js (SSE transport, MCP message handling) and router.js (namespace tools, route to backends). Create src/api/ endpoints: status.js, config.js, logs.js. See CLAUDE.md SSE protocol section."
})

Agent({
  subagent_type: "frontend-dev",
  description: "Initialize UI structure",
  prompt: "Create ui/ with React + Vite + Tailwind. Setup: package.json, vite.config.js, src/main.jsx, src/App.jsx, src/api/client.js. Install deps: react, react-router-dom, @tanstack/react-query, tailwindcss, lucide-react."
})
```

Then UI components (after structure ready):

```javascript
Agent({
  subagent_type: "frontend-dev",
  description: "Dashboard and config UI",
  prompt: "Build src/components/Dashboard.jsx (status cards, metrics) and BackendConfig.jsx (registry editor, Add Backend wizard with 11 type options). Use React Query for API calls. Dark theme."
})

Agent({
  subagent_type: "frontend-dev",
  description: "OAuth and logs UI",
  prompt: "Build src/components/OAuthPanel.jsx (Connect buttons, token status) and LogsViewer.jsx (SSE log stream, filtering). Build EnvEditor.jsx (.env management with masking)."
})
```

### 5. Phase 4: OAuth Integration

```javascript
Agent({
  subagent_type: "backend-dev",
  description: "OAuth implementation",
  prompt: "Implement src/oauth/github.js and smithery.js (OAuth 2.0 flows). Implement tokenStore.js (AES-256-GCM encrypted token storage). Auto-refresh tokens before expiry. Expose ${GITHUB_ACCESS_TOKEN} to backends."
})
```

### 6. Phase 5: Testing & Integration

```javascript
Agent({
  subagent_type: "backend-dev",
  description: "Integration tests",
  prompt: "Create server/tests/ with integration tests: spawn all backend types, tool call routing, OAuth token refresh, registry hot-reload. Use Vitest or Jest."
})
```

### 7. Verify & Document

- Test with real MCP backends (obs, kapture from user's setup)
- Update README with actual commands
- Create demo video/screenshots
- Write deployment guide

## Current Status

- ✅ Task #1: Architecture design
- ✅ Task #2: Project structure setup
- ⏳ Task #3: Build gateway server (ready to start Phase 1)
- ⏳ Task #4: Build web UI
- ⏳ Task #5: Deploy and test

## Files Created

```
✅ CLAUDE.md (444 lines) - Complete architecture
✅ .claude/PROJECT.md - Agent coordination
✅ .claude/agents/*.md - 4 specialized agents
✅ README.md - User docs
✅ .env.example - Config template
✅ registry.example.json - Sample backends
✅ .gitignore - Ignore rules
```

## Next Command

From new terminal:
```bash
cd ~/aloshy-ai/mcp-gateway
# Then in Claude Code: /resume
```

The orchestrator agent will read this file and start Phase 1.
