# MCP Gateway Backend Types

The MCP Gateway supports 11 backend types for spawning and managing MCP servers. Each backend type has a dedicated spawner that handles its lifecycle.

## Backend Types Overview

| Type | Description | Use Case | Status |
|------|-------------|----------|--------|
| `npx` | NPM packages | Quick Node.js MCP servers | ✅ Implemented |
| `uvx` | Python packages via uv | Modern Python MCP servers | ✅ Implemented |
| `pipx` | Python packages via pipx | Traditional Python MCP servers | ✅ Implemented |
| `docker` | Docker containers | Containerized MCP servers | ✅ Implemented |
| `git-npm` | Git repo + npm build | Custom Node.js projects | ✅ Implemented |
| `git-python` | Git repo + Python build | Custom Python projects | ✅ Implemented |
| `git-docker` | Git repo + Docker build | Custom containerized projects | ✅ Implemented |
| `local` | Local scripts/binaries | Pre-built executables | ✅ Implemented |
| `remote-sse` | Remote SSE endpoints | Smithery, cloud MCP servers | ✅ Implemented |
| `remote-http` | Remote HTTP endpoints | API-based MCP servers | ✅ Implemented |
| `shell` | Shell scripts | Bash/zsh wrappers | ✅ Implemented |

## Backend Interface

All backends implement a common interface:

```javascript
class Backend extends EventEmitter {
  async spawn()           // Start the backend
  async kill(signal)      // Stop the backend
  isRunning()            // Check if backend is running
  getStatus()            // Get backend status
  getLogs(limit)         // Get recent logs
  write(data)            // Write to backend stdin/send message
  read(callback)         // Read from backend stdout/receive messages
}
```

### Events

Backends emit the following events:

- `started` - Backend started successfully
- `exit` - Backend process exited
- `error` - Backend encountered an error
- `failed` - Backend failed after retries
- `log` - Backend log entry
- `message` - Message received (remote backends)

## Backend Type Details

### 1. NPX Backend (`npx.js`)

Spawns Node.js packages from npm registry using `npx`.

**Config Example:**
```json
{
  "type": "npx",
  "install": {
    "package": "@modelcontextprotocol/server-github",
    "version": "latest"
  },
  "runtime": {
    "args": ["--port", "3000"],
    "env": {
      "GITHUB_TOKEN": "${GITHUB_TOKEN}"
    }
  }
}
```

**Features:**
- Auto-installs packages with `-y` flag
- Version pinning support
- Environment variable injection
- Automatic retry on failure

### 2. UVX Backend (`uvx.js`)

Spawns Python packages using `uvx` (uv's package executor).

**Config Example:**
```json
{
  "type": "uvx",
  "install": {
    "package": "mcp-server-time",
    "version": "0.2.0"
  },
  "runtime": {
    "env": {
      "PYTHONUNBUFFERED": "1"
    }
  }
}
```

**Features:**
- Fast Python package execution
- Version pinning with `==` syntax
- Isolated environments per execution

### 3. PIPX Backend (`pipx.js`)

Spawns Python packages using `pipx run`.

**Config Example:**
```json
{
  "type": "pipx",
  "install": {
    "package": "mcp-server-filesystem",
    "version": "0.1.0"
  },
  "runtime": {
    "args": ["--root", "/data"]
  }
}
```

**Features:**
- Traditional Python package manager
- Isolated virtual environments
- Compatible with standard PyPI packages

### 4. Docker Backend (`docker.js`)

Manages Docker containers using `dockerode`.

**Config Example:**
```json
{
  "type": "docker",
  "install": {
    "image": "ghcr.io/user/mcp-server",
    "tag": "latest",
    "pull": "missing"
  },
  "runtime": {
    "volumes": ["${HOME}/.mcp/data:/data"],
    "ports": {"8080": "8080"},
    "env": {
      "API_KEY": "${API_KEY}"
    }
  },
  "healthcheck": {
    "endpoint": "http://localhost:8080/health",
    "interval": 30
  }
}
```

**Features:**
- Auto-pull images from registries
- Volume mounting with variable resolution
- Port mapping
- Health check monitoring
- Container lifecycle management
- Log streaming

**Pull Strategies:**
- `missing` - Pull only if image not found locally (default)
- `always` - Always pull latest image
- `never` - Never pull, use local only

### 5. Git Backend (`git.js`)

Clones git repositories and builds them. Handles `git-npm`, `git-python`, and `git-docker` types.

**Git-NPM Config:**
```json
{
  "type": "git-npm",
  "install": {
    "repository": "https://github.com/user/mcp-server.git",
    "branch": "main",
    "subdirectory": "packages/server",
    "build": {
      "steps": ["npm install", "npm run build"],
      "entrypoint": "dist/index.js"
    }
  },
  "runtime": {
    "command": "node",
    "env": {
      "NODE_ENV": "production"
    }
  }
}
```

**Git-Python Config:**
```json
{
  "type": "git-python",
  "install": {
    "repository": "https://github.com/user/python-mcp.git",
    "branch": "main",
    "build": {
      "steps": ["uv venv", "uv pip install -e ."],
      "entrypoint": "src/main.py"
    }
  },
  "runtime": {
    "command": "python"
  }
}
```

**Git-Docker Config:**
```json
{
  "type": "git-docker",
  "install": {
    "repository": "https://github.com/user/docker-mcp.git",
    "branch": "main",
    "dockerfile": "Dockerfile"
  },
  "runtime": {
    "volumes": ["${HOME}/.mcp/data:/data"]
  }
}
```

**Features:**
- Clones to `~/.mcp/repos/<backend-id>`
- Skip re-clone if already exists
- Build step execution
- Build caching (`.mcp-built` marker)
- Subdirectory support
- For git-docker: builds image then uses Docker backend

**Environment Variables:**
- `${REPO_DIR}` - Path to cloned repository

### 6. Local Backend (`local.js`)

Executes local scripts or binaries.

**Config Example:**
```json
{
  "type": "local",
  "install": {
    "path": "${HOME}/.mcp/scripts/custom-mcp.js",
    "executable": false
  },
  "runtime": {
    "command": "node",
    "cwd": "${HOME}/.mcp",
    "env": {
      "DEBUG": "true"
    }
  }
}
```

**Features:**
- Path variable resolution (`${HOME}`, `${GATEWAY_DIR}`)
- Executable flag for direct script execution
- Custom working directory
- Command selection (node, python, bash, etc.)

### 7. Remote Backend (`remote.js`)

Proxies to remote MCP servers via SSE or HTTP. Handles `remote-sse` and `remote-http` types.

**Remote-SSE Config:**
```json
{
  "type": "remote-sse",
  "install": {
    "url": "https://smithery.ai/server/user/mcp/sse",
    "postUrl": "https://smithery.ai/server/user/mcp/message"
  },
  "runtime": {
    "headers": {
      "Authorization": "Bearer ${SMITHERY_TOKEN}"
    }
  }
}
```

**Remote-HTTP Config:**
```json
{
  "type": "remote-http",
  "install": {
    "url": "https://api.example.com/mcp"
  },
  "runtime": {
    "headers": {
      "X-API-Key": "${API_KEY}"
    }
  }
}
```

**Features:**
- SSE connection with auto-reconnect
- HTTP request proxying
- Custom headers (auth tokens)
- Message forwarding
- Connection health monitoring

**SSE Protocol:**
- Connects to SSE endpoint for receiving events
- Uses separate POST endpoint for sending messages
- Auto-reconnects on connection loss

### 8. Shell Backend (`shell.js`)

Executes shell scripts (bash, zsh, sh).

**Config Example:**
```json
{
  "type": "shell",
  "install": {
    "script": "${HOME}/.mcp/scripts/wrapper.sh",
    "shell": "/bin/bash"
  },
  "runtime": {
    "args": ["--mode", "production"],
    "cwd": "${HOME}/.mcp",
    "env": {
      "DEBUG": "false"
    }
  }
}
```

**Features:**
- Custom shell selection (bash, zsh, sh, etc.)
- Path variable resolution
- Script argument passing
- Working directory control

**Supported Shells:**
- `/bin/bash` (default)
- `/bin/zsh`
- `/bin/sh`
- Custom shell paths

## Backend State Machine

All backends follow the same state machine:

```
stopped → starting → running → stopping → stopped
   ↓                    ↓
   └────── failed ←─────┘
```

**States:**
- `stopped` - Backend is not running
- `starting` - Backend is initializing
- `running` - Backend is active and ready
- `stopping` - Backend is shutting down
- `failed` - Backend encountered an error

## Retry Logic

All backends implement automatic retry on failure:

- **Max Retries:** 3 attempts
- **Backoff:** Exponential (2s, 4s, 6s)
- **Trigger:** Non-zero exit code or process error
- **Persistent Backends:** Restart automatically
- **On-Demand Backends:** Only retry during initial spawn

## Logging

All backends maintain a circular log buffer:

```javascript
{
  timestamp: "2024-01-01T00:00:00.000Z",
  level: "info|warn|error|stdout|stderr",
  message: "Log message",
  // Additional context data
}
```

**Log Levels:**
- `info` - Informational messages
- `warn` - Warning messages
- `error` - Error messages
- `stdout` - Process stdout
- `stderr` - Process stderr

**Log Buffer:**
- Default size: 1000 entries
- FIFO circular buffer
- Queryable via `getLogs(limit)`

## Environment Variable Resolution

All backends support environment variable substitution:

**System Variables:**
- `${HOME}` - User home directory
- `${GATEWAY_DIR}` - Gateway installation directory
- `${REPO_DIR}` - Git repo directory (git backends only)

**Custom Variables:**
- `${ANY_VAR}` - Resolved from `.env` file or system environment

**OAuth Variables:**
- `${GITHUB_ACCESS_TOKEN}` - Auto-managed by OAuth flow
- `${SMITHERY_ACCESS_TOKEN}` - Auto-managed by OAuth flow

## Usage Example

```javascript
import { createNpxBackend } from './backends/npx.js';

const backend = createNpxBackend('github', {
  type: 'npx',
  install: { package: '@modelcontextprotocol/server-github' },
  runtime: { env: { GITHUB_TOKEN: 'token' } }
});

// Listen for events
backend.on('started', (pid) => {
  console.log(`Backend started with PID ${pid}`);
});

backend.on('log', (entry) => {
  console.log(`[${entry.level}] ${entry.message}`);
});

// Spawn backend
await backend.spawn();

// Check status
console.log(backend.getStatus());

// Write to backend
backend.write('{"jsonrpc":"2.0","method":"initialize"}\n');

// Read from backend
backend.read((data) => {
  console.log('Received:', data.toString());
});

// Stop backend
await backend.kill();
```

## Testing

All backends are tested in `tests/backends.test.js`:

```bash
npm test
```

Tests verify:
- Backend instantiation
- Required interface methods
- State management
- Event emission

## Architecture Notes

### Common Patterns

All backends follow these patterns:

1. **Constructor:** Initialize state, config, and logs
2. **Spawn:** Start the backend process/connection
3. **Event Handlers:** Set up stdout/stderr/exit/error handlers
4. **State Management:** Track state transitions
5. **Retry Logic:** Implement exponential backoff
6. **Kill:** Graceful shutdown with force-kill timeout

### Process Communication

**stdio Backends (npx, uvx, pipx, git-*, local, shell):**
- stdin: Write MCP requests
- stdout: Read MCP responses
- stderr: Log errors

**Docker Backend:**
- stdin: Attach exec stream
- stdout: Container logs
- stderr: Container logs

**Remote Backend:**
- write(): HTTP POST requests
- read(): SSE events or HTTP responses

### Lifecycle Management

**On-Demand Backends:**
- Spawned when first tool call arrives
- Idle timeout: 5 minutes (configurable)
- Auto-stopped when idle
- Not restarted on failure

**Persistent Backends:**
- Spawned at gateway startup
- Always running
- Auto-restarted on failure
- Kept alive until gateway shutdown

## Future Enhancements

Potential improvements:

1. **Resource Limits:** CPU/memory limits per backend
2. **Metrics:** Prometheus metrics export
3. **Scaling:** Multiple instances per backend
4. **Load Balancing:** Distribute tool calls across instances
5. **Circuit Breaker:** Prevent cascade failures
6. **Rate Limiting:** Limit tool calls per backend
7. **Caching:** Cache tool responses
8. **Monitoring:** Backend health dashboard
