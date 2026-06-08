# MCP Gateway Project Guide

This guide helps the main orchestrator agent coordinate work across specialized agents.

## Agent Architecture

This project uses **parallel agent pattern** for optimal development speed:

```
Main Agent (Orchestrator)
    ├─→ backend-dev     (Node.js server, MCP protocol)
    ├─→ frontend-dev    (React UI, dashboard)
    ├─→ docker-infra    (Dockerfile, docker-compose)
    └─→ schema-validator (JSON schema, validation)
```

### When to Spawn Agents

**In Parallel** (independent work):
```
Agent(backend-dev, "Implement MCP protocol handler")
Agent(frontend-dev, "Build Dashboard component")
Agent(schema-validator, "Create JSON schema")
Agent(docker-infra, "Write Dockerfile")
```

**Sequential** (dependencies):
1. schema-validator creates JSON schema
2. backend-dev implements validation using schema
3. frontend-dev uses schema for form validation

### Agent Specializations

| Agent | Focus | Key Files |
|-------|-------|-----------|
| backend-dev | Server logic | `server/src/**` |
| frontend-dev | UI components | `ui/src/**` |
| docker-infra | Deployment | `Dockerfile`, `docker-compose.yml` |
| schema-validator | Data validation | `schema/**`, `types/**` |

## Implementation Order

### Phase 1: Foundation (Parallel)
```javascript
// Spawn all in one message for parallel execution
Agent(schema-validator, "Create registry-v2.schema.json with all 11 backend types")
Agent(docker-infra, "Create Dockerfile multi-stage build and docker-compose.yml")
```

### Phase 2: Core Backend (Mixed)
```javascript
// Sequential: schema first
Agent(schema-validator, "Create TypeScript types from schema")
// Then parallel: independent modules
Agent(backend-dev, "Implement registry loader and NPX backend manager")
Agent(backend-dev, "Implement Docker backend manager")
```

### Phase 3: Server + UI (Parallel)
```javascript
Agent(backend-dev, "Implement SSE server and MCP protocol handler")
Agent(frontend-dev, "Build Dashboard and BackendConfig components")
```

### Phase 4: Integration Features (Mixed)
```javascript
Agent(backend-dev, "Implement OAuth flows for GitHub and Smithery")
Agent(frontend-dev, "Build OAuthPanel and EnvEditor components")
```

### Phase 5: Testing & Polish
```javascript
Agent(backend-dev, "Write integration tests for all backend types")
Agent(frontend-dev, "Add error handling and loading states")
```

## Coordination Strategy

### Main Agent Responsibilities
1. **Task Breakdown**: Split work into agent-sized chunks
2. **Dependency Management**: Track which tasks block others
3. **Integration**: Ensure agents' work connects properly
4. **Testing**: Verify integrated system works end-to-end

### Communication Pattern
- Agents return artifacts (code files)
- Main agent reviews and coordinates next steps
- Don't have agents call each other (orchestrator pattern)

### Conflict Avoidance
- Each agent owns specific directories
- Shared files (types, schemas) assigned to schema-validator
- Main agent handles cross-cutting concerns

## File Ownership

```
.claude/agents/           → Main agent
server/src/
  ├─ index.js            → backend-dev
  ├─ mcp/                → backend-dev
  ├─ oauth/              → backend-dev
  └─ validation/         → schema-validator
ui/src/                  → frontend-dev
schema/                  → schema-validator
types/                   → schema-validator
Dockerfile               → docker-infra
docker-compose*.yml      → docker-infra
```

## Quality Checks

Before marking tasks complete:

1. **Code Quality**
   - No hardcoded secrets
   - Error handling present
   - Logging statements added
   - Comments for complex logic

2. **Integration**
   - Interfaces match between modules
   - Environment variables documented
   - Dependencies in package.json

3. **Testing**
   - Unit tests for utilities
   - Integration tests for workflows
   - Manual testing instructions

## Example Orchestration

```javascript
// Phase 1: Parallel foundation
Agent({
  subagent_type: "schema-validator",
  description: "Create JSON schema",
  prompt: "Create schema/registry-v2.schema.json with complete JSON Schema for all 11 backend types. Include discriminated unions, validation rules for env vars, git URLs, docker images. Export TypeScript types."
})
Agent({
  subagent_type: "docker-infra", 
  description: "Docker setup",
  prompt: "Create multi-stage Dockerfile (server build, UI build, production runtime) and docker-compose.yml for local dev. Include volume mounts for hot reload."
})

// Wait for completion, then Phase 2
Agent({
  subagent_type: "backend-dev",
  description: "Registry loader",
  prompt: "Implement server/src/mcp/registry.js to load registry.json, validate with JSON schema, watch for changes, resolve ${ENV_VAR} from .env file."
})
```

## Success Criteria

Project complete when:
- ✅ All 11 backend types spawn and execute tools
- ✅ SSE transport works with Claude Code client
- ✅ Web UI can add/edit/disable backends
- ✅ OAuth flows work for GitHub and Smithery
- ✅ Docker deployment runs locally
- ✅ README has quick start instructions
- ✅ Example registry.json with working MCPs
