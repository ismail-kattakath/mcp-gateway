# Security Issue: enableAuth Default Value Confusion

**Date:** 2026-06-08  
**Severity:** 🟡 **MEDIUM** - Secure by default in code, but example config overrides it  
**Status:** ⚠️ **CONFIGURATION ISSUE**

---

## Summary

**Designed behavior:** `enableAuth` defaults to **`true`** (secure by default)  
**Actual behavior:** Docker image ships with `enableAuth: false` because it copies `registry.example.json`

**Result:** Users who deploy the Docker image without custom registry get **authentication disabled by default**.

---

## Code Analysis

### ✅ Code Default: TRUE (Secure by Default)

**Location:** `server/src/middleware/auth.ts:109`

```typescript
const enabled = enabledFromEnv !== undefined 
  ? enabledFromEnv === 'true' 
  : gatewayConfig.enableAuth !== false; // default true
```

**Logic:**
- If `enableAuth` is **undefined** → `undefined !== false` → **TRUE** ✅
- If `enableAuth` is **true** → `true !== false` → **TRUE** ✅
- If `enableAuth` is **false** → `false !== false` → **FALSE** ❌

**Schema Definition:** `schema/registry-v2.schema.json`

```json
{
  "enableAuth": { 
    "type": "boolean", 
    "default": true, 
    "description": "Default: true (secure by default)"
  }
}
```

**Documentation:** Comments say "secure by default"

---

## ❌ Configuration Problem: Example Has FALSE

### registry.example.json

```json
{
  "gateway": {
    "enableAuth": false  // ← INSECURE DEFAULT
  }
}
```

### Dockerfile

```dockerfile
# Line 60
COPY registry.example.json ./registry.json
```

**Result:** Docker image ships with **auth disabled**!

---

## Impact Analysis

### Scenario 1: User Deploys Without Custom Registry

**Command:**
```bash
docker run -p 3000:3000 ghcr.io/ismail-kattakath/mcp-gateway:latest
```

**Result:**
- ❌ Auth is **DISABLED** (because example has `false`)
- ❌ No API key required
- ❌ Anyone on network can access `/api/*`
- ❌ Open gateway

**Risk:** HIGH if exposed to network

### Scenario 2: User Deploys With Custom Registry (No enableAuth Field)

**registry.json:**
```json
{
  "version": "2.0",
  "servers": { ... },
  "gateway": {
    "server": { ... }
    // enableAuth not specified
  }
}
```

**Result:**
- ✅ Auth is **ENABLED** (code default kicks in)
- ✅ API key required
- ✅ Secure

**Risk:** LOW - works as designed

### Scenario 3: User Deploys With enableAuth: true

**Result:**
- ✅ Auth is **ENABLED**
- ✅ Secure

### Scenario 4: User Deploys With enableAuth: false

**Result:**
- ❌ Auth is **DISABLED** (explicit choice)
- Valid for:
  - Local development
  - stdio mode (auth bypassed anyway)
  - Internal network (trusted environment)

---

## Root Cause

**Disconnect between:**
1. **Code:** Secure by default (`enableAuth !== false` → defaults to true)
2. **Example config:** Insecure by default (`enableAuth: false`)
3. **Docker image:** Uses example config

**Why the example has false:**
- Probably for easier local development/testing
- Avoids "How do I get the API key?" questions
- Quick start without friction

**But:** This creates a security risk for production deployments.

---

## Recommendations

### ✅ Immediate: Update registry.example.json

**Change:**
```json
{
  "gateway": {
    "enableAuth": true,  // Secure by default
    "allowedIPs": []
  }
}
```

**Or better - remove the field entirely:**
```json
{
  "gateway": {
    // enableAuth omitted - uses secure default (true)
    "allowedIPs": []
  }
}
```

**Benefit:** Docker image will be secure by default

---

### ✅ Add Development Override Option

Create `registry.dev.json` for local development:

```json
{
  "version": "2.0",
  "servers": { ... },
  "gateway": {
    "enableAuth": false,  // OK for local dev
    ...
  }
}
```

**Usage:**
```bash
# Development (auth disabled for easy testing)
docker run -v ./registry.dev.json:/app/registry.json mcp-gateway

# Production (auth enabled by default)
docker run -v ./registry.json:/app/registry.json mcp-gateway
```

---

### ✅ Update Documentation

**README.md quick start should show:**

```markdown
## Quick Start (Secure by Default)

The gateway generates an API key automatically. Retrieve it with:

\`\`\`bash
# Start gateway
docker run -d --name mcp-gateway -p 127.0.0.1:3000:3000 \\
  ghcr.io/ismail-kattakath/mcp-gateway:latest

# Get API key
docker exec mcp-gateway sh -c 'PRINT_API_KEY=true node dist/index.js'
# Output: YOUR-API-KEY-HERE

# Use in client
\`\`\`json
{
  "mcpServers": {
    "gateway": {
      "url": "http://localhost:3000/sse",
      "headers": {
        "Authorization": "Bearer YOUR-API-KEY-HERE"
      }
    }
  }
}
\`\`\`

### Disable Auth (Development Only)

Create \`registry.json\`:
\`\`\`json
{
  "version": "2.0",
  "servers": {},
  "gateway": {
    "enableAuth": false  // WARNING: Insecure! Only for local dev
  }
}
\`\`\`
```

---

### ✅ Add Startup Warning

**In `server/src/middleware/auth.ts`:**

```typescript
if (!enabled) {
  logger.warn('⚠️  AUTH DISABLED - Gateway is open to network!', {
    message: 'enableAuth is false. This is insecure for production.',
    recommendation: 'Set gateway.enableAuth to true or remove it to use secure default.',
    documentation: 'https://github.com/ismail-kattakath/mcp-gateway#authentication'
  });
}
```

**Result:** Users will see a big warning if auth is disabled.

---

## Comparison: Industry Defaults

| System | Default Behavior |
|--------|------------------|
| **Our gateway (code)** | ✅ Auth required (true) |
| **Our gateway (Docker)** | ❌ Auth disabled (example has false) |
| PostgreSQL | ❌ localhost trust, network password |
| MySQL | ⚠️ Root with blank password (localhost) |
| Redis | ❌ No password by default |
| MongoDB | ❌ No auth by default (<v2.6) |
| Elasticsearch | ❌ No auth by default (<v8.0) |
| Nginx | ❌ No auth (static files) |

**Industry trend:** Moving toward secure by default
- Elasticsearch 8.0+ → Auth required by default
- MongoDB 3.0+ → Auth recommended, warnings shown
- Redis 6.0+ → ACL system, warnings for no password

**Our implementation:** Better than most if we fix the example!

---

## Test Cases

### Test 1: Code Default (No Field)

**Config:**
```json
{
  "gateway": {
    // enableAuth not specified
  }
}
```

**Expected:** Auth **ENABLED** ✅  
**Actual:** ✅ PASS

**Verification:**
```bash
curl http://localhost:3000/api/status
# Expected: 401 Unauthorized
```

### Test 2: Explicit True

**Config:**
```json
{
  "gateway": {
    "enableAuth": true
  }
}
```

**Expected:** Auth **ENABLED** ✅  
**Actual:** ✅ PASS

### Test 3: Explicit False

**Config:**
```json
{
  "gateway": {
    "enableAuth": false
  }
}
```

**Expected:** Auth **DISABLED** ❌  
**Actual:** ✅ PASS (working as configured)

### Test 4: Docker Default (Current)

**Command:**
```bash
docker run -p 3000:3000 mcp-gateway:latest
# (Uses registry.example.json with enableAuth: false)
```

**Expected:** Auth should be **ENABLED** by default ✅  
**Actual:** ❌ **FAIL** - Auth is DISABLED (because example has false)

---

## Action Items

### Priority 1: Fix Default Config

- [ ] Update `registry.example.json` to remove `enableAuth` field (use code default)
- [ ] Or set `enableAuth: true` explicitly in example
- [ ] Rebuild Docker image
- [ ] Test fresh deployment

### Priority 2: Add Warning

- [ ] Add loud startup warning when auth is disabled
- [ ] Include in logs at INFO level (so docker logs shows it)
- [ ] Suggest how to enable

### Priority 3: Documentation

- [ ] Update README.md to show secure default
- [ ] Add "Getting the API key" section
- [ ] Add "Disable auth for development" section with warning
- [ ] Update Docker quick start

### Priority 4: Testing

- [ ] Add integration test: "Docker without custom registry should require auth"
- [ ] Add CI check: "registry.example.json must not disable auth"

---

## Conclusion

### Is this a security flaw?

**Answer:** ⚠️ **Configuration issue, not a code flaw**

**The code is correct:**
- ✅ Defaults to true (secure)
- ✅ Schema documents true as default
- ✅ Comments say "secure by default"

**The configuration is wrong:**
- ❌ `registry.example.json` has `enableAuth: false`
- ❌ Docker copies example as default
- ❌ Users get insecure config by default

### Severity: MEDIUM

**Why not HIGH?**
- README shows stdio mode (bypasses auth anyway)
- Users must explicitly expose port (default: 127.0.0.1:3000)
- Intended for localhost/development

**Why not LOW?**
- Docker image with default config is insecure
- Users might deploy without reading security docs
- "Works out of the box" might mean "insecure out of the box"

### Recommended Fix

**Simple fix (5 minutes):**
```bash
# Remove enableAuth from example (use code default)
jq 'del(.gateway.enableAuth)' registry.example.json > tmp && mv tmp registry.example.json

# Rebuild Docker image
docker build -t mcp-gateway:latest .

# Verify
docker run --rm mcp-gateway:latest node -e 'const r = require("./registry.json"); console.log(r.gateway.enableAuth)'
# Output: undefined (good! will default to true)
```

**User's first experience:**
```bash
docker run -p 3000:3000 mcp-gateway
# Server starts
# Try to access: curl http://localhost:3000/api/status
# Response: 401 Unauthorized

# User checks logs
docker logs <container>
# Sees: "Gateway auth enabled (source: default)"
# Sees: "To get API key, run: PRINT_API_KEY=true node dist/index.js"
```

✅ **Secure by default achieved!**
