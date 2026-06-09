# MCP Gateway Architecture

Comprehensive architecture guide for MCP Gateway v3.0.

## Table of Contents

- [System Overview](#system-overview)
- [Component Architecture](#component-architecture)
- [Request Flow](#request-flow)
- [Database Schema](#database-schema)
- [Security Model](#security-model)
- [Extension Points](#extension-points)
- [Deployment Patterns](#deployment-patterns)
- [Scalability](#scalability)
- [Design Decisions](#design-decisions)

## System Overview

MCP Gateway is a universal aggregator for Model Context Protocol servers, built as a production-grade, enterprise-ready TypeScript application.

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         MCP Gateway v3.0                             │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │                    Transport Layer                          │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐                 │    │
│  │  │  stdio   │  │   SSE    │  │   HTTP   │                 │    │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘                 │    │
│  └───────┼─────────────┼─────────────┼────────────────────────┘    │
│          │             │             │                              │
│  ┌───────┴─────────────┴─────────────┴────────────────────────┐    │
│  │                   Middleware Stack                          │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │    │
│  │  │   CORS   │  │   Auth   │  │   RBAC   │  │  Rate    │   │    │
│  │  │          │  │          │  │          │  │  Limit   │   │    │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘   │    │
│  └───────┴─────────────┴─────────────┴─────────────┴──────────┘    │
│          │             │             │             │                │
│  ┌───────┴─────────────┴─────────────┴─────────────┴──────────┐    │
│  │              MCP Protocol Handler                           │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │    │
│  │  │ tools/   │  │ tools/   │  │resources/│  │ prompts/ │   │    │
│  │  │ list     │  │ call     │  │ list     │  │ list     │   │    │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘   │    │
│  └───────┴─────────────┴─────────────┴─────────────┴──────────┘    │
│          │             │             │             │                │
│  ┌───────┴─────────────┴─────────────┴─────────────┴──────────┐    │
│  │                    Router Layer                             │    │
│  │  ┌────────────────────────────────────────────────────┐     │    │
│  │  │  Parse <server>/<tool>, validate, route to backend │     │    │
│  │  └────────────────────────────────────────────────────┘     │    │
│  └────────────────────────┬────────────────────────────────────┘    │
│                           │                                         │
│  ┌────────────────────────┴────────────────────────────────────┐    │
│  │                   Server Manager                            │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │    │
│  │  │ Registry │  │ Lifecycle│  │  State   │  │  Reaper  │   │    │
│  │  │  Loader  │  │ Manager  │  │  Machine │  │  (idle)  │   │    │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘   │    │
│  └───────┴─────────────┴─────────────┴─────────────┴──────────┘    │
│          │             │             │             │                │
│  ┌───────┴─────────────┴─────────────┴─────────────┴──────────┐    │
│  │                   Backend Adapters                          │    │
│  │  ┌──────┐  ┌──────┐  ┌──────────┐  ┌────────┐  ┌───────┐  │    │
│  │  │ pkg  │  │ git  │  │container │  │ remote │  │ local │  │    │
│  │  └──┬───┘  └──┬───┘  └────┬─────┘  └───┬────┘  └───┬───┘  │    │
│  └─────┼─────────┼───────────┼────────────┼───────────┼───────┘    │
└────────┼─────────┼───────────┼────────────┼───────────┼────────────┘
         │         │           │            │           │
    ┌────┴───┐ ┌──┴────┐ ┌────┴─────┐ ┌────┴────┐ ┌───┴────┐
    │  npm   │ │  git  │ │  Docker  │ │  HTTP   │ │ local  │
    │ server │ │ repo  │ │   image  │ │   SSE   │ │ script │
    └────────┘ └───────┘ └──────────┘ └─────────┘ └────────┘
```

### Technology Stack

**Core:**

- **Runtime**: Node.js 18+
- **Language**: TypeScript 5+
- **Framework**: Express.js 4.x
- **Protocol**: MCP JSON-RPC 2.0

**Authentication & Authorization:**

- **Auth Framework**: Passport.js
- **Tokens**: jsonwebtoken (JWT)
- **RBAC**: Custom implementation with policy engine
- **OAuth**: passport-oauth2, passport-github2, passport-google-oauth20
- **SAML**: passport-saml
- **LDAP**: passport-ldapauth
- **Kerberos**: passport-kerberos

**Storage:**

- **Database**: SQLite 3 (default), PostgreSQL, MySQL
- **ORM**: better-sqlite3, pg, mysql2
- **Encryption**: @ronomon/crypto-async (AES-256-GCM)
- **Secrets**: keytar (system keychain), HashiCorp Vault, AWS Secrets Manager

**Monitoring & Observability:**

- **Metrics**: prom-client (Prometheus)
- **Logging**: winston (structured logging)
- **Tracing**: OpenTelemetry, Jaeger
- **Health**: express-actuator

**Security:**

- **Headers**: helmet (security headers)
- **Rate Limiting**: express-rate-limit
- **Input Validation**: joi, validator
- **Sanitization**: Custom sanitizers (CRLF, injection prevention)

**Development:**

- **Testing**: Vitest (unit, integration)
- **Linting**: ESLint + Prettier
- **Type Checking**: TypeScript strict mode
- **Git Hooks**: husky + lint-staged

## Component Architecture

### 1. Transport Layer

Handles protocol-specific communication.

**Stdio Transport (`server/src/transport/stdio.ts`):**

```typescript
// Read JSON-RPC from stdin, write to stdout
process.stdin.on("data", (chunk) => {
  const message = JSON.parse(chunk);
  const response = await handleMCPRequest(message);
  process.stdout.write(JSON.stringify(response) + "\n");
});
```

**SSE Transport (`server/src/transport/sse.ts`):**

```typescript
// Server-Sent Events for bidirectional JSON-RPC
app.get("/sse", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const client = registerClient(req, res);

  req.on("close", () => unregisterClient(client));
});

app.post("/sse/:clientId", async (req, res) => {
  const response = await handleMCPRequest(req.body);
  res.json(response);
});
```

**HTTP Transport (`server/src/transport/http.ts`):**

```typescript
// Simple request-response HTTP
app.post("/rpc", async (req, res) => {
  const response = await handleMCPRequest(req.body);
  res.json(response);
});
```

### 2. Middleware Stack

**CORS Middleware (`server/src/middleware/cors.ts`):**

```typescript
// Configurable CORS with credentials support
app.use(
  cors({
    origin: config.cors.origins,
    credentials: true,
    allowedHeaders: ["Authorization", "Content-Type"],
  }),
);
```

**Authentication Middleware (`server/src/middleware/auth.ts`):**

```typescript
// Multi-strategy authentication
passport.use(
  "api-key",
  new BearerStrategy(async (token, done) => {
    const key = await apiKeyService.validate(token);
    if (!key) return done(null, false);
    return done(null, key.user);
  }),
);

passport.use(
  "jwt",
  new JwtStrategy(
    {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.jwt.secret,
    },
    async (payload, done) => {
      const user = await userService.findById(payload.sub);
      return done(null, user);
    },
  ),
);

// Middleware
app.use(passport.authenticate(["api-key", "jwt"], { session: false }));
```

**RBAC Middleware (`server/src/middleware/rbac.ts`):**

```typescript
// Check permissions
function authorize(resource: string, action: string) {
  return (req, res, next) => {
    const user = req.user;
    const allowed = rbacService.checkPermission(user, resource, action);
    if (!allowed) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };
}

// Usage
app.post("/api/servers", authorize("server", "create"), createServer);
```

**Rate Limiting Middleware (`server/src/middleware/rate-limit.ts`):**

```typescript
// IP-based rate limiting
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      error: "Too many requests",
      retryAfter: Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000),
    });
  },
});

app.use("/api/", limiter);
```

**Audit Logging Middleware (`server/src/middleware/audit.ts`):**

```typescript
// Log all administrative actions
app.use((req, res, next) => {
  const start = Date.now();

  res.on("finish", () => {
    auditLog.create({
      userId: req.user?.id,
      action: `${req.method} ${req.path}`,
      resource: extractResource(req),
      status: res.statusCode,
      duration: Date.now() - start,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
  });

  next();
});
```

### 3. MCP Protocol Handler

**Tools Listing (`server/src/mcp/protocol.ts`):**

```typescript
async function handleToolsList(
  request: JsonRpcRequest,
): Promise<JsonRpcResponse> {
  const servers = await serverManager.getRunningServers();
  const tools: Tool[] = [];

  for (const [serverName, server] of servers) {
    const serverTools = await server.listTools();

    for (const tool of serverTools) {
      tools.push({
        name: `${serverName}/${tool.name}`,
        description: tool.description,
        inputSchema: tool.inputSchema,
      });
    }
  }

  return {
    jsonrpc: "2.0",
    id: request.id,
    result: { tools },
  };
}
```

**Tool Calling (`server/src/mcp/protocol.ts`):**

```typescript
async function handleToolCall(
  request: JsonRpcRequest,
): Promise<JsonRpcResponse> {
  const { name, arguments: args } = request.params;

  // Parse server/tool
  const [serverName, toolName] = name.split("/");

  // Get or start server
  const server = await serverManager.getServer(serverName);
  if (!server) {
    throw new Error(`Server not found: ${serverName}`);
  }

  // Call tool
  const result = await server.callTool(toolName, args);

  return {
    jsonrpc: "2.0",
    id: request.id,
    result,
  };
}
```

### 4. Router Layer

**Server/Tool Parsing (`server/src/mcp/router.ts`):**

```typescript
function parseToolName(fullName: string): { server: string; tool: string } {
  const parts = fullName.split("/");
  if (parts.length !== 2) {
    throw new Error(
      `Invalid tool name: ${fullName}. Expected format: <server>/<tool>`,
    );
  }
  return { server: parts[0], tool: parts[1] };
}

function validateServerName(name: string): void {
  if (!/^[a-z0-9-]+$/.test(name)) {
    throw new Error(
      `Invalid server name: ${name}. Must be lowercase alphanumeric + hyphens`,
    );
  }
}

async function routeToolCall(toolName: string, args: any): Promise<any> {
  const { server, tool } = parseToolName(toolName);
  validateServerName(server);

  // Check RBAC permissions
  await checkPermission(server, tool);

  // Get server (lazy-load if on-demand)
  const serverInstance = await serverManager.getServer(server);

  // Call tool
  return await serverInstance.callTool(tool, args);
}
```

### 5. Server Manager

**Registry Loader (`server/src/mcp/registry.ts`):**

```typescript
class RegistryLoader {
  private watcher: FSWatcher;

  async load(path: string): Promise<Registry> {
    const content = await fs.readFile(path, "utf-8");
    const registry = JSON.parse(content);

    // Validate schema
    await this.validate(registry);

    // Apply defaults
    return this.applyDefaults(registry);
  }

  watch(path: string, onChange: (registry: Registry) => void): void {
    this.watcher = fs.watch(path, async () => {
      try {
        const registry = await this.load(path);
        onChange(registry);
      } catch (error) {
        logger.error("Registry reload failed", { error });
      }
    });
  }
}
```

**Lifecycle Manager (`server/src/mcp/backends/index.ts`):**

```typescript
class ServerManager {
  private servers: Map<string, BaseServer> = new Map();
  private idleTimers: Map<string, NodeJS.Timeout> = new Map();

  async init(registry: Registry): Promise<void> {
    // Start persistent servers
    for (const [name, config] of Object.entries(registry.servers)) {
      if (config.lifecycle === "persistent" && config.enabled) {
        await this.startServer(name, config);
      }
    }
  }

  async getServer(name: string): Promise<BaseServer> {
    let server = this.servers.get(name);

    if (!server) {
      // Lazy-load on-demand server
      const config = registry.servers[name];
      if (!config || !config.enabled) {
        throw new Error(`Server not found or disabled: ${name}`);
      }

      if (config.lifecycle === "on-demand") {
        server = await this.startServer(name, config);
      } else {
        throw new Error(`Server not running: ${name}`);
      }
    }

    // Reset idle timer
    if (server.config.lifecycle === "on-demand") {
      this.resetIdleTimer(name, server);
    }

    return server;
  }

  private resetIdleTimer(name: string, server: BaseServer): void {
    clearTimeout(this.idleTimers.get(name));

    const timeout = server.config.idleTimeout || 300000; // 5 minutes
    this.idleTimers.set(
      name,
      setTimeout(() => {
        this.stopServer(name);
      }, timeout),
    );
  }
}
```

**State Machine (`server/src/mcp/backends/base.ts`):**

```typescript
type ServerState = "stopped" | "starting" | "running" | "stopping" | "failed";

abstract class BaseServer extends EventEmitter {
  protected state: ServerState = "stopped";
  protected process: ChildProcess | null = null;
  protected retryCount = 0;

  async start(): Promise<void> {
    if (this.state !== "stopped") {
      throw new Error(`Cannot start server in state: ${this.state}`);
    }

    this.state = "starting";

    try {
      await this.prepare();
      const { command, args, env } = this.getSpawnArgs();

      this.process = spawn(command, args, {
        env: { ...process.env, ...env },
        stdio: ["pipe", "pipe", "pipe"],
        shell: false,
      });

      this.setupEventHandlers();
      await this.waitForReady();

      this.state = "running";
      this.emit("running");
    } catch (error) {
      this.state = "failed";
      this.emit("failed", error);

      if (
        this.config.autoRestart &&
        this.retryCount < this.config.maxRestarts
      ) {
        this.retryCount++;
        await this.retry();
      }
    }
  }

  async stop(): Promise<void> {
    if (this.state === "stopped") return;

    this.state = "stopping";

    if (this.process) {
      this.process.kill("SIGTERM");

      // Force kill after timeout
      setTimeout(() => {
        if (this.process && !this.process.killed) {
          this.process.kill("SIGKILL");
        }
      }, 5000);
    }

    this.state = "stopped";
    this.emit("stopped");
  }

  abstract prepare(): Promise<void>;
  abstract getSpawnArgs(): {
    command: string;
    args: string[];
    env: NodeJS.ProcessEnv;
  };
}
```

### 6. Backend Adapters

**Package Backend (`server/src/mcp/backends/pkg.ts`):**

```typescript
class PkgServer extends BaseServer {
  async prepare(): Promise<void> {
    // No preparation needed for package managers
  }

  getSpawnArgs(): SpawnArgs {
    return {
      command: this.config.command,
      args: this.config.args,
      env: this.resolveEnv(),
    };
  }
}
```

**Git Backend (`server/src/mcp/backends/git.ts`):**

```typescript
class GitServer extends BaseServer {
  private repoDir: string;

  async prepare(): Promise<void> {
    const repoHash = crypto
      .createHash("sha256")
      .update(this.config.repo)
      .digest("hex")
      .slice(0, 12);

    this.repoDir = path.join(os.homedir(), ".mcp-gateway", "repos", repoHash);

    // Clone or update
    if (!fs.existsSync(this.repoDir)) {
      await this.clone();
    } else {
      await this.update();
    }

    // Checkout specific commit/branch/tag
    if (this.config.commit) {
      await this.checkout(this.config.commit);
    } else if (this.config.tag) {
      await this.checkout(this.config.tag);
    } else {
      await this.checkout(this.config.branch || "main");
    }

    // Run build steps
    if (this.config.build?.steps) {
      await this.build();
    }
  }

  getSpawnArgs(): SpawnArgs {
    const args = this.config.args.map((arg) =>
      arg.replace(/\$\{REPO_DIR\}/g, this.repoDir),
    );

    return {
      command: this.config.command,
      args,
      env: this.resolveEnv(),
    };
  }

  private async clone(): Promise<void> {
    await execAsync(`git clone ${this.config.repo} ${this.repoDir}`);
  }

  private async build(): Promise<void> {
    for (const step of this.config.build.steps) {
      await execAsync(step, { cwd: this.repoDir });
    }
  }
}
```

**Container Backend (`server/src/mcp/backends/container.ts`):**

```typescript
class ContainerServer extends BaseServer {
  private containerId: string;

  async prepare(): Promise<void> {
    if (this.config.pull) {
      await this.pullImage();
    } else if (this.config.build) {
      await this.buildImage();
    }
  }

  getSpawnArgs(): SpawnArgs {
    const args = [
      "run",
      "--rm",
      "-i",
      "--name",
      `mcp-${this.name}-${Date.now()}`,
    ];

    // Add environment variables
    for (const [key, value] of Object.entries(this.resolveEnv())) {
      args.push("-e", `${key}=${value}`);
    }

    // Add volumes
    if (this.config.volumes) {
      for (const volume of this.config.volumes) {
        args.push("-v", volume);
      }
    }

    // Add security options
    if (this.config.securityOpt) {
      for (const opt of this.config.securityOpt) {
        args.push("--security-opt", opt);
      }
    }

    args.push(this.config.image);

    return {
      command: "docker",
      args,
      env: {},
    };
  }

  private async pullImage(): Promise<void> {
    await execAsync(`docker pull ${this.config.image}`);
  }
}
```

**Remote Backend (`server/src/mcp/backends/remote.ts`):**

```typescript
class RemoteServer {
  private client: EventSource | null = null;
  private messageQueue: Map<string, Promise<any>> = new Map();

  async connect(): Promise<void> {
    if (this.config.transport === "sse") {
      await this.connectSSE();
    } else {
      // HTTP doesn't need persistent connection
    }
  }

  private async connectSSE(): Promise<void> {
    this.client = new EventSource(this.config.url, {
      headers: this.config.headers,
    });

    this.client.on("message", (event) => {
      const message = JSON.parse(event.data);
      const pending = this.messageQueue.get(message.id);
      if (pending) {
        pending.resolve(message);
        this.messageQueue.delete(message.id);
      }
    });

    this.client.on("error", (error) => {
      if (this.config.reconnect) {
        setTimeout(() => this.connect(), this.config.reconnectDelay || 1000);
      }
    });
  }

  async callTool(name: string, args: any): Promise<any> {
    const id = crypto.randomUUID();
    const request = {
      jsonrpc: "2.0",
      id,
      method: "tools/call",
      params: { name, arguments: args },
    };

    if (this.config.transport === "sse") {
      // Send via POST, receive via SSE
      const promise = new Promise((resolve, reject) => {
        this.messageQueue.set(id, { resolve, reject });
      });

      await fetch(`${this.config.url}/${this.clientId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...this.config.headers,
        },
        body: JSON.stringify(request),
      });

      return await promise;
    } else {
      // HTTP: request-response
      const response = await fetch(this.config.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...this.config.headers,
        },
        body: JSON.stringify(request),
      });

      return await response.json();
    }
  }
}
```

## Request Flow

### Tool Call Flow

```
1. Client sends MCP JSON-RPC request:
   {
     "jsonrpc": "2.0",
     "id": "1",
     "method": "tools/call",
     "params": {
       "name": "filesystem/read_file",
       "arguments": { "path": "/tmp/test.txt" }
     }
   }

2. Transport Layer receives request (stdio/SSE/HTTP)

3. Middleware Stack processes request:
   - CORS: Check origin
   - Auth: Verify Bearer token or JWT
   - RBAC: Check user has permission for filesystem/read_file
   - Rate Limit: Check request rate
   - Audit: Log request

4. MCP Protocol Handler:
   - Parse method: "tools/call"
   - Validate request structure

5. Router Layer:
   - Parse tool name: "filesystem/read_file"
   - Extract server: "filesystem", tool: "read_file"
   - Validate server name format

6. Server Manager:
   - Check if server exists in registry
   - Check if server is enabled
   - Get server instance:
     - If persistent: return running server
     - If on-demand: start server, wait for ready
   - Reset idle timer (on-demand only)

7. Backend Adapter (PkgServer):
   - If not running: spawn process
   - Send JSON-RPC to server's stdin:
     {
       "jsonrpc": "2.0",
       "id": "server-1",
       "method": "tools/call",
       "params": {
         "name": "read_file",
         "arguments": { "path": "/tmp/test.txt" }
       }
     }
   - Wait for response on stdout

8. MCP Server (filesystem):
   - Process request
   - Read file
   - Return response:
     {
       "jsonrpc": "2.0",
       "id": "server-1",
       "result": {
         "content": "file contents..."
       }
     }

9. Backend Adapter:
   - Parse response
   - Return result

10. MCP Protocol Handler:
    - Wrap result in gateway response:
      {
        "jsonrpc": "2.0",
        "id": "1",
        "result": {
          "content": "file contents..."
        }
      }

11. Transport Layer:
    - Send response to client (stdio/SSE/HTTP)

12. Audit Logger:
    - Record tool call in audit log

Total latency:
- Persistent server: 10-50ms
- On-demand server (cold start): 500-2000ms
- On-demand server (warm): 10-50ms
```

## Database Schema

### SQLite Schema (v3.0)

**users table:**

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT, -- nullable for OAuth users
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_login_at INTEGER,
  enabled BOOLEAN NOT NULL DEFAULT 1,
  tenant_id TEXT,
  metadata TEXT -- JSON blob
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_tenant ON users(tenant_id);
```

**roles table:**

```sql
CREATE TABLE roles (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  permissions TEXT NOT NULL, -- JSON array
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

**user_roles table (many-to-many):**

```sql
CREATE TABLE user_roles (
  user_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  granted_at INTEGER NOT NULL,
  granted_by TEXT,
  PRIMARY KEY (user_id, role_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
);
```

**api_keys table:**

```sql
CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,
  key_hash TEXT UNIQUE NOT NULL, -- SHA256 hash
  user_id TEXT NOT NULL,
  name TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER,
  last_used_at INTEGER,
  revoked BOOLEAN NOT NULL DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_api_keys_user ON api_keys(user_id);
CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);
```

**audit_logs table:**

```sql
CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  timestamp INTEGER NOT NULL,
  user_id TEXT,
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  resource_id TEXT,
  status INTEGER NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  duration INTEGER,
  metadata TEXT, -- JSON blob
  hash TEXT NOT NULL, -- SHA256 of previous hash + this entry (hash chain)
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
```

**tenants table:**

```sql
CREATE TABLE tenants (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  contact_email TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT 1,
  quotas TEXT, -- JSON blob: { servers: 10, users: 50, ... }
  metadata TEXT -- JSON blob
);
```

**secrets table (encrypted):**

```sql
CREATE TABLE secrets (
  id TEXT PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  value_encrypted TEXT NOT NULL, -- AES-256-GCM encrypted
  iv TEXT NOT NULL, -- Initialization vector
  auth_tag TEXT NOT NULL, -- Authentication tag
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  created_by TEXT,
  tenant_id TEXT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX idx_secrets_key ON secrets(key);
CREATE INDEX idx_secrets_tenant ON secrets(tenant_id);
```

### Database Migrations

Managed by custom migration system (`server/src/db/migrations/`):

```typescript
// migrations/001_create_users.ts
export default {
  version: 1,
  name: "create_users",
  up: async (db: Database) => {
    await db.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        ...
      )
    `);
  },
  down: async (db: Database) => {
    await db.exec("DROP TABLE users");
  },
};
```

Run migrations:

```bash
npm run migrate up
npm run migrate down
npm run migrate status
```

## Security Model

### Defense in Depth

**Layer 1: Network Security**

- HTTPS only (production)
- IP allowlist
- Rate limiting
- CORS restrictions

**Layer 2: Authentication**

- Multi-strategy (API key, JWT, OAuth, SAML, LDAP, Kerberos, mTLS)
- Token expiration
- Token revocation
- Password hashing (bcrypt)

**Layer 3: Authorization (RBAC)**

- Role-based permissions
- Resource-level access control
- Multi-tenancy isolation

**Layer 4: Input Validation**

- Schema validation (Joi)
- Path traversal prevention
- Command injection prevention
- SQL injection prevention (prepared statements)

**Layer 5: Output Sanitization**

- Log injection prevention
- XSS prevention
- CRLF injection prevention

**Layer 6: Data Protection**

- Encryption at rest (secrets)
- Encryption in transit (HTTPS)
- Secure key storage (keychain/Vault)

**Layer 7: Audit Logging**

- Tamper-proof hash chain
- Complete audit trail
- Compliance exports

**Layer 8: Container Security**

- Non-root user
- Read-only filesystem
- Seccomp profile
- Capability dropping

See [SECURITY_HARDENING.md](SECURITY_HARDENING.md) for complete guide.

## Extension Points

MCP Gateway is designed for extensibility:

### 1. Custom Backend Adapters

Create new server sources:

```typescript
// server/src/mcp/backends/custom.ts
import { BaseServer } from "./base";

export class CustomServer extends BaseServer {
  async prepare(): Promise<void> {
    // Custom setup logic
  }

  getSpawnArgs(): SpawnArgs {
    // Return command to execute
    return {
      command: "custom-command",
      args: ["arg1", "arg2"],
      env: {},
    };
  }
}

// Register in backend factory
import { CustomServer } from "./custom";

function createBackend(name: string, config: ServerConfig): BaseServer {
  switch (config.source) {
    case "custom":
      return new CustomServer(name, config);
    // ... other sources
  }
}
```

### 2. Custom Authentication Strategies

Add new Passport strategies:

```typescript
// server/src/middleware/auth/strategies/custom.ts
import { Strategy } from "passport-custom";

passport.use(
  "custom",
  new Strategy(async (req, done) => {
    const token = req.headers["x-custom-token"];

    // Validate token
    const user = await validateCustomToken(token);

    if (!user) {
      return done(null, false);
    }

    return done(null, user);
  }),
);

// Register in middleware
app.use(
  passport.authenticate(["custom", "api-key", "jwt"], { session: false }),
);
```

### 3. Custom RBAC Policies

Extend permission model:

```typescript
// server/src/rbac/policies/custom-policy.ts
export class CustomPolicy {
  async check(user: User, resource: string, action: string): Promise<boolean> {
    // Custom authorization logic
    if (resource === "server" && action === "delete") {
      // Only owner can delete
      return server.ownerId === user.id;
    }

    return true;
  }
}

// Register policy
rbacService.registerPolicy(new CustomPolicy());
```

### 4. Custom Metrics

Add custom Prometheus metrics:

```typescript
// server/src/metrics/custom.ts
import { register, Counter, Histogram } from "prom-client";

export const customCounter = new Counter({
  name: "mcp_custom_metric_total",
  help: "Custom metric description",
  labelNames: ["label1", "label2"],
});

register.registerMetric(customCounter);

// Usage
customCounter.inc({ label1: "value1", label2: "value2" });
```

### 5. Plugin System (Future)

Planned for v3.1:

```typescript
// plugins/my-plugin.ts
export default {
  name: "my-plugin",
  version: "1.0.0",

  hooks: {
    beforeToolCall: async (context) => {
      // Modify request
      context.args.modified = true;
      return context;
    },
    afterToolCall: async (context, result) => {
      // Modify response
      result.pluginData = "added";
      return result;
    },
  },

  routes: {
    "/plugin/my-route": async (req, res) => {
      res.json({ message: "Plugin route" });
    },
  },
};
```

## Deployment Patterns

### 1. Standalone Server

Single gateway instance:

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │
┌──────┴──────┐
│  MCP        │
│  Gateway    │
└──────┬──────┘
       │
   ┌───┴────┬────────┬────────┐
   │ Server │ Server │ Server │
   │   1    │   2    │   3    │
   └────────┴────────┴────────┘
```

**Use cases:**

- Development
- Single-user deployments
- Low traffic

### 2. Load Balanced

Multiple gateway instances behind load balancer:

```
┌─────────────┐
│   Clients   │
└──────┬──────┘
       │
┌──────┴──────┐
│   Load      │
│   Balancer  │
└──┬────┬────┬┘
   │    │    │
┌──┴─┐┌─┴─┐┌─┴─┐
│ GW ││GW ││GW │
│ 1  ││ 2 ││ 3 │
└──┬─┘└─┬─┘└─┬─┘
   │    │    │
   └────┼────┘
        │
   ┌────┴─────┐
   │  Shared  │
   │ Database │
   └──────────┘
```

**Use cases:**

- High availability
- High traffic
- Multi-region

### 3. Multi-Tenant

Isolated tenants with shared infrastructure:

```
┌─────────────┐   ┌─────────────┐   ┌─────────────┐
│  Tenant A   │   │  Tenant B   │   │  Tenant C   │
└──────┬──────┘   └──────┬──────┘   └──────┬──────┘
       │                 │                 │
       └─────────────────┼─────────────────┘
                         │
                    ┌────┴────┐
                    │   MCP   │
                    │ Gateway │
                    └────┬────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
    ┌────┴────┐     ┌────┴────┐     ┌───┴─────┐
    │ Tenant  │     │ Tenant  │     │ Tenant  │
    │ A DB    │     │ B DB    │     │ C DB    │
    └─────────┘     └─────────┘     └─────────┘
```

**Use cases:**

- SaaS deployments
- Enterprise multi-team
- Compliance requirements

### 4. Edge Deployment

Distributed gateways at edge locations:

```
┌──────────────────────────────────────────────────────┐
│                  Central Control Plane                │
│              (Config, Auth, Monitoring)               │
└───────┬──────────────────┬──────────────────┬────────┘
        │                  │                  │
   ┌────┴────┐        ┌────┴────┐        ┌───┴─────┐
   │  Edge   │        │  Edge   │        │  Edge   │
   │ Gateway │        │ Gateway │        │ Gateway │
   │ (US-E)  │        │ (US-W)  │        │ (EU)    │
   └────┬────┘        └────┬────┘        └────┬────┘
        │                  │                  │
   ┌────┴────┐        ┌────┴────┐        ┌───┴─────┐
   │ Clients │        │ Clients │        │ Clients │
   │ (US-E)  │        │ (US-W)  │        │ (EU)    │
   └─────────┘        └─────────┘        └─────────┘
```

**Use cases:**

- Low latency requirements
- Geographic distribution
- Data locality (GDPR)

## Scalability

### Horizontal Scaling

**Stateless Design:**

- No in-memory session storage
- Shared database for state
- Distributed caching (Redis)

**Load Balancing Strategies:**

- Round-robin (default)
- Least connections
- IP hash (sticky sessions)

**Auto-Scaling (Kubernetes):**

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: mcp-gateway
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: mcp-gateway
  minReplicas: 3
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
```

### Vertical Scaling

**Resource Limits:**

- Increase CPU/memory per pod
- Optimize server lifecycle (on-demand vs persistent)
- Implement caching

**Database Scaling:**

- SQLite → PostgreSQL
- Connection pooling
- Read replicas
- Query optimization

### Performance Optimization

**Caching:**

- Tool metadata caching
- Server config caching
- Response caching (optional)

**Connection Pooling:**

- Database connections
- Remote server connections
- Docker daemon connections

**Lazy Loading:**

- On-demand server lifecycle
- Deferred module loading
- Code splitting

**Compression:**

- Gzip response compression
- Binary protocol (future)

See [PERFORMANCE_TUNING.md](PERFORMANCE_TUNING.md) for details.

## Design Decisions

### Why TypeScript?

- Type safety reduces bugs
- Better IDE support
- Easier refactoring
- Industry standard for Node.js

### Why Express.js?

- Battle-tested (12+ years)
- Huge ecosystem
- Flexible middleware
- Easy to extend

### Why SQLite by default?

- Zero configuration
- Single file database
- Good performance for small-medium scale
- Easy backup (copy file)
- Can migrate to PostgreSQL later

### Why Passport.js for auth?

- 500+ strategies
- Well-documented
- Active maintenance
- Standard patterns

### Why stdio as default transport?

- Simplest setup (no API keys)
- Automatic lifecycle (starts/stops with client)
- Inherent authentication (pipe ownership)
- No network configuration

### Why on-demand lifecycle?

- Lower memory footprint
- Scales to many servers
- Pay-for-what-you-use model
- Better for development

### Why namespaced tools?

- Prevents name conflicts
- Clear routing
- Multiple instances of same server
- Explicit dependencies

### Why hot reload?

- No downtime for config changes
- Better developer experience
- Production-friendly (add servers without restart)

### Why not use a message queue?

- Additional complexity
- Not needed for current scale
- Can add later if needed (RabbitMQ, Kafka)

### Why not use gRPC?

- MCP spec uses JSON-RPC
- HTTP/SSE more familiar to developers
- Better debugging (human-readable)
- Can add gRPC later if needed

---

**For implementation details, see:**

- [Code Organization](../server/README.md)
- [API Reference](API.md)
- [Security Model](SECURITY_HARDENING.md)
- [Production Deployment](PRODUCTION_DEPLOYMENT.md)
