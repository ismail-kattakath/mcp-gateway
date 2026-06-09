# Structured Logging v3 (Pino)

Production-grade structured logging system for MCP Gateway using [Pino](https://getpino.io/).

## Features

- **3x Performance** - Benchmarked against Winston, Pino delivers 3x+ faster throughput
- **Structured JSON** - All logs in parseable JSON format (production)
- **Enhanced Sanitization** - Prevents log injection, credential leaks, PII exposure
- **Request Context** - Automatic request ID propagation via AsyncLocalStorage
- **Log Rotation** - Daily rotation with 7-day retention and gzip compression
- **Pretty Printing** - Human-readable colorized output in development
- **Zero Config** - Sensible defaults, works out of the box

---

## Quick Start

### Basic Usage

```typescript
import logger from './logging-v3/logger.js';

logger.info('Server started successfully');
logger.warn({ port: 3000 }, 'Port conflict, using fallback');
logger.error({ err: error }, 'Failed to start server');
```

### Component Logger

```typescript
import { createComponentLogger } from './logging-v3/logger.js';

const log = createComponentLogger('auth');
log.info('User authenticated successfully');
```

### Server Logger

```typescript
import { createServerLogger } from './logging-v3/logger.js';

const log = createServerLogger('obs-mcp');
log.info({ status: 'starting' }, 'Starting MCP server');
```

---

## Express Integration

### Setup Middleware

```typescript
import express from 'express';
import logger from './logging-v3/logger.js';
import { createLoggingMiddleware, errorLoggingMiddleware } from './logging-v3/middleware.js';

const app = express();

// Add logging middleware (BEFORE routes)
app.use(...createLoggingMiddleware(logger));

// Your routes
app.get('/api/servers', (req, res) => {
  // Use request logger (has context)
  req.log.info('Fetching servers');
  res.json({ servers: [] });
});

// Add error logging middleware (AFTER routes)
app.use(errorLoggingMiddleware(logger));
```

### Request Logger

Every request has a child logger with automatic context:

```typescript
app.post('/api/servers', (req, res) => {
  // Includes: requestId, userId, sessionId, tenant
  req.log.info({ serverName: 'obs' }, 'Creating server');

  try {
    // ...
    req.log.info({ duration: 123 }, 'Server created successfully');
  } catch (error) {
    req.log.error({ err: error }, 'Failed to create server');
  }
});
```

---

## Request Context Propagation

### AsyncLocalStorage

Context automatically propagates through async operations:

```typescript
import { getRequestContext, getRequestId } from './logging-v3/context.js';

async function processRequest() {
  // Access context anywhere in the call chain
  const context = getRequestContext();
  console.log(`Request ID: ${context?.requestId}`);

  // Or just get the ID
  const reqId = getRequestId();
}
```

### Manual Context

For background jobs or CLI operations:

```typescript
import { runWithContext } from './logging-v3/context.js';

runWithContext({ requestId: 'cli-job-123', userId: 'system' }, () => {
  // All logs here will have context
  logger.info('Background job started');
});
```

---

## Structured Logging Best Practices

### ✅ DO: Use structured fields

```typescript
logger.info({ serverName: 'obs', status: 'running', uptime: 123 }, 'Server health check');
```

### ❌ DON'T: Use string interpolation

```typescript
logger.info(`Server ${serverName} is ${status} with uptime ${uptime}`);
```

### ✅ DO: Use child loggers

```typescript
const serverLog = logger.child({ serverName: 'obs' });
serverLog.info('Starting');
serverLog.info('Ready');
```

### ❌ DON'T: Repeat fields

```typescript
logger.info({ serverName: 'obs' }, 'Starting');
logger.info({ serverName: 'obs' }, 'Ready');
```

---

## Error Logging

### Standard Errors

```typescript
try {
  await riskyOperation();
} catch (error) {
  logger.error({ err: error }, 'Operation failed');
}
```

### With Context

```typescript
import { logError } from './logging-v3/logger.js';

try {
  await riskyOperation();
} catch (error) {
  logError(logger, error, 'Operation failed', {
    serverName: 'obs',
    operation: 'spawn',
    retries: 3,
  });
}
```

### Fatal Errors

```typescript
import { logFatal } from './logging-v3/logger.js';

try {
  await criticalOperation();
} catch (error) {
  logFatal(logger, error, 'Critical failure, cannot continue', 1);
  // Process exits here
}
```

---

## Performance Logging

```typescript
import { logPerformance } from './logging-v3/logger.js';

const start = Date.now();
await operation();
const duration = Date.now() - start;

logPerformance(logger, 'server-spawn', duration, {
  serverName: 'obs',
  success: true,
});
```

---

## Audit Logging

```typescript
import { logAudit } from './logging-v3/logger.js';

logAudit(logger, 'delete', 'server/obs-mcp', {
  userId: 'user-123',
  ip: '192.168.1.100',
});
```

---

## Sanitization

All logs are automatically sanitized to prevent:

- **Log Injection** (CRLF, control characters)
- **Credential Leaks** (passwords, tokens, API keys)
- **PII Exposure** (emails, phone numbers, credit cards)

### Manual Sanitization

```typescript
import { sanitizeServerName, sanitizeUrl, sanitizeArgs } from './logging-v3/sanitizer.js';

logger.info(
  {
    server: sanitizeServerName(userInput),
    url: sanitizeUrl(repoUrl),
    args: sanitizeArgs(spawnArgs),
  },
  'Spawning server'
);
```

### Enhanced Sanitization

```typescript
import { sanitizeStringEnhanced, containsSensitiveData } from './logging-v3/sanitizer.js';

const message = userInput;
if (containsSensitiveData(message)) {
  logger.warn('Attempted to log sensitive data');
} else {
  logger.info({ message: sanitizeStringEnhanced(message) }, 'User input');
}
```

---

## Configuration

### Environment Variables

| Variable               | Default       | Description                                         |
| ---------------------- | ------------- | --------------------------------------------------- |
| `LOG_LEVEL`            | `info`        | Minimum log level (debug, info, warn, error, fatal) |
| `MCP_LOGS_DIR`         | `~/.mcp/logs` | Directory for log files                             |
| `DISABLE_FILE_LOGGING` | `false`       | Set to `true` to disable file logging               |
| `NODE_ENV`             | `development` | Environment (affects pretty printing)               |

### Log Levels

- `fatal` (60) - Process crashes
- `error` (50) - Errors that need attention
- `warn` (40) - Warnings
- `info` (30) - Informational (default)
- `debug` (20) - Debugging information
- `trace` (10) - Very verbose (not used)

---

## Log Rotation

Automatic rotation with:

- **Size-based**: Rotate when file reaches 10MB
- **Time-based**: Rotate daily at midnight
- **Retention**: Keep 7 days of logs
- **Compression**: Gzip old logs automatically

### Log Files

- `gateway.log` - All logs (info, warn, error, fatal)
- `gateway-error.log` - Errors only (error, fatal)
- `gateway.log.1.gz` - Rotated logs (compressed)

---

## Benchmark Results

Run the benchmark:

```bash
npm run benchmark:logging
```

Expected results:

- **Throughput**: Pino is 3-5x faster than Winston
- **Memory**: Pino uses ~30% less memory
- **Latency**: Pino has lower average latency per log

---

## Migration from Winston

### Step 1: Update imports

```typescript
// Before
import logger from './logging/logger.js';

// After
import logger from './logging-v3/logger.js';
```

### Step 2: Update log statements

```typescript
// Before (Winston)
logger.info('Server started', { port: 3000 });

// After (Pino)
logger.info({ port: 3000 }, 'Server started');
```

**Note**: Pino requires the object BEFORE the message.

### Step 3: Update middleware

```typescript
// Before
// Custom Winston middleware

// After
import { createLoggingMiddleware } from './logging-v3/middleware.js';
app.use(...createLoggingMiddleware(logger));
```

### Step 4: Update error handling

```typescript
// Before
logger.error('Error occurred', { error: err.message });

// After
logger.error({ err }, 'Error occurred');
```

---

## Testing

### Unit Tests

```bash
npm run test src/logging-v3/__tests__/
```

### Coverage

```bash
npm run test:coverage -- src/logging-v3/
```

---

## Troubleshooting

### Logs not appearing

1. Check `LOG_LEVEL` environment variable
2. Check file permissions on `MCP_LOGS_DIR`
3. Check `DISABLE_FILE_LOGGING` is not set

### Pretty print not working

1. Ensure `NODE_ENV !== 'production'`
2. Ensure not running in CI (CI=true disables pretty print)

### Request ID not propagating

1. Ensure middleware is added BEFORE routes
2. Check AsyncLocalStorage is supported (Node.js 12.17.0+)

---

## API Reference

### Logger Methods

- `logger.info(obj, msg)` - Info level log
- `logger.warn(obj, msg)` - Warning level log
- `logger.error(obj, msg)` - Error level log
- `logger.fatal(obj, msg)` - Fatal level log
- `logger.debug(obj, msg)` - Debug level log
- `logger.child(bindings)` - Create child logger

### Utilities

- `createComponentLogger(name)` - Create component logger
- `createServerLogger(name)` - Create server logger
- `logError(logger, err, msg, ctx)` - Log structured error
- `logFatal(logger, err, msg, code)` - Log fatal and exit
- `logPerformance(logger, op, dur, meta)` - Log performance metric
- `logAudit(logger, action, resource, meta)` - Log audit event

### Context

- `getRequestContext()` - Get current context
- `getRequestId()` - Get current request ID
- `runWithContext(ctx, fn)` - Run function with context
- `withContext(fn)` - Wrap async function with context

### Sanitization

- `sanitizeServerName(name)` - Sanitize server name
- `sanitizeUrl(url)` - Sanitize URL
- `sanitizeArgs(args)` - Sanitize command arguments
- `sanitizeEnv(env)` - Sanitize environment variables
- `sanitizeIp(ip)` - Sanitize IP address
- `sanitizePath(path)` - Sanitize file path
- `sanitizeObject(obj)` - Sanitize object recursively
- `sanitizeStringEnhanced(str)` - Enhanced sanitization
- `containsSensitiveData(str)` - Check for sensitive patterns

---

## Examples

### Server Lifecycle Logging

```typescript
const log = createServerLogger('obs-mcp');

log.info({ lifecycle: 'persistent' }, 'Server configured');
log.info({ status: 'starting' }, 'Starting server');

try {
  await spawn();
  log.info({ pid: process.pid }, 'Server started successfully');
} catch (error) {
  logError(log, error, 'Failed to start server', { retries: 3 });
}
```

### Request Handling

```typescript
app.post('/api/servers', async (req, res) => {
  const { name, source } = req.body;

  req.log.info({ name, source }, 'Creating server');

  try {
    const server = await createServer(name, source);
    req.log.info({ serverId: server.id }, 'Server created');
    res.json(server);
  } catch (error) {
    req.log.error({ err: error, name, source }, 'Failed to create server');
    res.status(500).json({ error: error.message });
  }
});
```

### Background Jobs

```typescript
import { runWithContext } from './logging-v3/context.js';

async function runBackgroundJob() {
  runWithContext({ requestId: 'job-123', userId: 'system' }, async () => {
    logger.info('Background job started');

    // All logs here will have context
    await processItems();

    logger.info('Background job completed');
  });
}
```

---

## License

Same as MCP Gateway project.
