# Logging v3 Migration Guide: Winston → Pino

**Status**: Ready for incremental adoption  
**Epic**: Epic #2 - Structured Logging  
**Performance Improvement**: 1.65x throughput, 152% better memory efficiency

---

## Executive Summary

MCP Gateway now includes a production-grade Pino logging implementation in `server/src/logging-v3/`. This provides:

- ✅ **1.65x faster** throughput (310k → 510k logs/sec sustained)
- ✅ **152% better memory** efficiency (-59MB vs +112MB at 500k logs)
- ✅ **Structured JSON** output for log aggregation
- ✅ **Request correlation** via AsyncLocalStorage
- ✅ **Enhanced sanitization** (credit cards, emails, phone numbers, PII)
- ✅ **Log rotation** with 7-day retention and gzip compression
- ✅ **Zero breaking changes** to existing Winston code

---

## Current Status

**✅ Completed:**

- Pino core implementation with transports
- Enhanced sanitization (beyond Winston's CRLF protection)
- Request correlation middleware
- Log rotation with pino-rotating-file-stream
- Pretty printing for development
- Performance benchmarks (1.65x improvement documented)
- Integration tests (70 tests covering logger, sanitizer, context)
- Backward compatibility layer

**📝 Remaining Work:**

- Migrate log statements from Winston to Pino format
- Add Pino middleware to Express app
- Update imports from `./logging/logger.js` to `./logging-v3/index.js`

---

## Migration Strategies

### Option 1: Gradual Migration (Recommended)

Migrate incrementally, one module at a time:

1. **Update imports in target file:**

   ```typescript
   // Before
   import logger from "../logging/logger.js";

   // After
   import logger from "../logging-v3/index.js";
   ```

2. **Convert log statements:**

   ```typescript
   // Before (Winston format)
   logger.info("Server started", { port: 3000 });
   logger.error("Operation failed", { error: err.message });

   // After (Pino format)
   logger.info({ port: 3000 }, "Server started");
   logger.error({ error: err.message }, "Operation failed");
   ```

3. **Test the module:**

   ```bash
   npm test src/<module>/__tests__/
   ```

4. **Repeat** for next module.

**Benefits:** Low risk, easy to rollback, minimal disruption.

---

### Option 2: Big Bang Migration

Migrate all at once (higher risk, faster completion):

1. **Run automated migration script:**

   ```bash
   # Create migration script (example):
   node scripts/migrate-winston-to-pino.js
   ```

2. **Update all imports:**

   ```bash
   find server/src -name "*.ts" -not -path "*/logging/*" \
     -exec sed -i '' "s|from '../logging/logger.js'|from '../logging-v3/index.js'|g" {} \;
   ```

3. **Manual fixes:**
   - Multi-line log statements
   - Template literals in log messages
   - Complex metadata objects

4. **Full test suite:**
   ```bash
   npm test
   npm run type-check
   npm run lint
   npm run build
   ```

**Benefits:** Complete migration in one PR, no mixed state.

---

## Technical Guide

### Pino API Changes

**Winston format (before):**

```typescript
logger.info("message", { meta }); // ❌ Old
logger.error("error message", { error }); // ❌ Old
```

**Pino format (after):**

```typescript
logger.info({ meta }, "message"); // ✅ New
logger.error({ error }, "error message"); // ✅ New

// String-only works in both
logger.info("simple message"); // ✅ Works
```

---

### Express Middleware Integration

**Add Pino middleware to `src/index.ts`:**

```typescript
import logger from "./logging-v3/index.js";
import {
  createLoggingMiddleware,
  errorLoggingMiddleware,
} from "./logging-v3/middleware.js";

const app = express();

// Add logging middleware BEFORE other middleware
app.use(...createLoggingMiddleware(logger));

// Your routes
app.get("/api/servers", (req, res) => {
  // Access request-scoped logger
  req.log.info({ count: servers.length }, "Fetching servers");
  res.json({ servers });
});

// Error logging middleware (AFTER routes)
app.use(errorLoggingMiddleware(logger));
```

**Benefits:**

- Automatic request/response logging
- Request ID propagation (UUID v4)
- Performance metrics (response time)
- Context-aware child loggers

---

### Enhanced Sanitization

Pino includes all Winston sanitizers **plus** enhanced patterns:

**Newly detected patterns:**

- Credit cards (PCI-DSS)
- Email addresses (PII)
- Phone numbers (various formats)
- Stripe API keys (`sk_live_*`, `sk_test_*`)
- Azure tokens
- Private keys (PEM, SSH)

```typescript
import {
  sanitizeStringEnhanced,
  containsSensitiveData,
} from "./logging-v3/sanitizer.js";

// Check before logging user input
if (containsSensitiveData(userMessage)) {
  logger.warn("Attempted to log sensitive data");
} else {
  logger.info({ message: sanitizeStringEnhanced(userMessage) }, "User message");
}
```

---

### Request Correlation

**Automatic context propagation:**

```typescript
import { getRequestContext, getRequestId } from "./logging-v3/context.js";

// Anywhere in your async call chain
async function processRequest() {
  const context = getRequestContext();
  logger.info(
    {
      requestId: context.requestId,
      userId: context.userId,
    },
    "Processing request",
  );

  // Or just get the ID
  const reqId = getRequestId();
}
```

**Manual context for background jobs:**

```typescript
import { runWithContext } from "./logging-v3/context.js";

async function backgroundJob() {
  runWithContext({ requestId: "job-123", userId: "system" }, async () => {
    logger.info("Background job started");
    await processItems();
    logger.info("Background job completed");
  });
}
```

---

### Log Rotation

**Automatic rotation configuration:**

- **Size-based**: Rotate when file reaches 10MB
- **Time-based**: Rotate daily at midnight
- **Retention**: Keep 7 days of logs
- **Compression**: Gzip old logs automatically

**Log files:**

- `~/.mcp/logs/gateway.log` - All logs
- `~/.mcp/logs/gateway-error.log` - Errors only
- `~/.mcp/logs/gateway.log.1.gz` - Rotated (compressed)

---

## Performance Benchmarks

**Test environment:**

- Node.js v26.0.0
- macOS (Darwin 25.3.0)
- 500,000 log statements

**Results:**

| Metric           | Winston          | Pino             | Improvement      |
| ---------------- | ---------------- | ---------------- | ---------------- |
| **Throughput**   | 309,758 logs/sec | 510,389 logs/sec | **1.65x faster** |
| **Avg Latency**  | 0.0032 ms/log    | 0.0020 ms/log    | **37% lower**    |
| **Memory Usage** | +112 MB          | -59 MB           | **152% better**  |

```bash
# Run benchmark yourself
npm run benchmark:logging
```

---

## Testing

**Run all Pino tests:**

```bash
npm test src/logging-v3/__tests__/
```

**Test coverage:**

- ✅ Logger: Component/server loggers, child loggers, log levels, JSON output
- ✅ Sanitizer: Enhanced patterns (credit cards, emails, PII), CodeQL compliance
- ✅ Context: Request ID generation, AsyncLocalStorage, context propagation

**Total:** 70 tests passing

---

## Rollback Plan

If issues arise during migration:

1. **Revert imports:**

   ```bash
   git checkout -- server/src/<module>.ts
   ```

2. **Keep Pino infrastructure:**
   - All `server/src/logging-v3/` files remain
   - No impact on existing Winston code
   - Can re-attempt migration later

3. **No data loss:**
   - Winston logs continue to `~/.mcp/logs/`
   - Pino logs to same directory (no conflict)

---

## Common Pitfalls

### 1. Multi-line log statements

**Problem:**

```typescript
// This won't auto-migrate correctly
logger.info("Server started", {
  port: 3000,
  host: "localhost",
});
```

**Solution:**

```typescript
// Manual fix required
logger.info(
  {
    port: 3000,
    host: "localhost",
  },
  "Server started",
);
```

---

### 2. Template literals

**Problem:**

```typescript
// Winston format with template literal
logger.info(`Server ${name} started`, { port });
```

**Solution:**

```typescript
// Pino format
logger.info({ name, port }, `Server ${name} started`);

// Or better: use structured fields
logger.info({ name, port }, "Server started");
```

---

### 3. Forgetting to update imports

**Problem:**

```typescript
// Still importing Winston
import logger from "./logging/logger.js";
// But log statements converted to Pino format
logger.info({ port: 3000 }, "Server started"); // Type error!
```

**Solution:**

```typescript
// Update import first
import logger from "./logging-v3/index.js";
logger.info({ port: 3000 }, "Server started"); // ✅
```

---

## CodeQL Compliance

Pino maintains all CodeQL security requirements:

✅ **Log injection prevention** (CRLF, control characters)  
✅ **Credential redaction** (API keys, tokens, passwords)  
✅ **Explicit sanitization** (required for static analysis)  
✅ **Path traversal prevention** (sanitizePath)  
✅ **Input validation** (all user-controlled values sanitized)

**All CodeQL scans must pass before merge.**

---

## FAQ

### Q: Can I use both Winston and Pino during migration?

**A:** Yes! They are completely independent. Old code uses `./logging/logger.js`, new code uses `./logging-v3/index.js`.

### Q: Will Pino logs be compatible with our log aggregation tools?

**A:** Yes. Pino outputs structured JSON which is compatible with ELK, Splunk, Datadog, Grafana Loki, etc.

### Q: Do I need to change all log statements at once?

**A:** No. Migrate module-by-module for lower risk.

### Q: What if performance is worse in production?

**A:** Unlikely (benchmarks show 1.65x improvement), but you can roll back by reverting imports.

### Q: Will this break log parsing scripts?

**A:** If your scripts parse Winston's text format, yes. Update them to parse JSON. If they already parse JSON, no changes needed.

### Q: How do I pretty-print JSON logs for debugging?

**A:** Set `NODE_ENV=development` or use `pino-pretty`:

```bash
cat ~/.mcp/logs/gateway.log | npx pino-pretty
```

---

## Next Steps

1. ✅ **Review this guide**
2. Choose migration strategy (gradual vs. big bang)
3. Start with low-risk module (e.g., `api/routes.ts`)
4. Update imports and log statements
5. Run tests
6. Repeat for next module
7. Update `src/index.ts` to add Pino middleware
8. Full test suite + CodeQL scan
9. Merge and monitor production

---

## Support

- **Documentation**: `server/src/logging-v3/README.md`
- **Examples**: `server/src/logging-v3/__tests__/`
- **Benchmark**: `npm run benchmark:logging`
- **Questions**: Open GitHub issue with label `epic-2`

---

**Last updated**: 2026-06-09  
**Status**: ✅ Ready for migration
