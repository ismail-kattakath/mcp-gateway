# OCI Labels: Enterprise Compliance & Implementation Guide

This document answers three critical questions about OCI Image Spec labels in enterprise containers.

---

## Question 1: Do Enterprise Containers Maintain OCI Image Spec Labels?

**Answer:** Mixed compliance - **most don't, but some do**.

### Test Results

We tested popular enterprise container images:

| Vendor | Image | OCI Labels? | Commit SHA? |
|--------|-------|-------------|-------------|
| **Red Hat** | `redhat/ubi9:latest` | ✅ YES | ✅ YES |
| Google | `gcr.io/distroless/base:latest` | ❌ NO | ❌ NO |
| Microsoft | `mcr.microsoft.com/dotnet/runtime:8.0` | ❌ NO | ❌ NO |
| AWS | `public.ecr.aws/lambda/python:3.11` | ❌ NO | ❌ NO |

**Red Hat UBI (Universal Base Image) Labels:**
```json
{
  "org.opencontainers.image.created": "2026-06-08T06:37:48Z",
  "org.opencontainers.image.revision": "39cd5d765f517bc20cbc4a8b85ccab466bacfa7c"
}
```

### Why Most Don't Follow the Spec

1. **OCI Spec labels are RECOMMENDED, not REQUIRED**
   - The spec uses "SHOULD" not "MUST"
   - No enforcement mechanism
   - No standardized tooling until recently

2. **Legacy build processes**
   - Many images predate the OCI Image Spec
   - Built with custom scripts, not modern GitHub Actions
   - Retrofitting labels requires workflow changes

3. **Different priorities**
   - Official language images (node, python) prioritize size/compatibility
   - Cloud vendor images focus on runtime, not traceability
   - Security/compliance teams care, but dev teams often don't

### Enterprise Best Practices

**Companies that DO follow OCI Image Spec:**
- ✅ Red Hat (full compliance)
- ✅ GitHub (images built with metadata-action)
- ✅ HashiCorp (Terraform, Consul images)
- ✅ Organizations with strong compliance requirements

**Why they do it:**
- Compliance requirements (SOC 2, ISO 27001)
- Security auditing needs
- Reproducible builds
- Supply chain security (SLSA, SBOM)

---

## Question 2: Is There a Ready-Made Workflow for OCI Compliance?

**Answer:** ✅ **YES - `docker/metadata-action` is the industry standard.**

### The Standard Tool

```yaml
name: Build Docker Image
on:
  push:
    tags: ['v*']

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3
      
      # ⭐ THIS IS THE STANDARD ⭐
      - name: Docker metadata
        id: meta
        uses: docker/metadata-action@v5  # ← Industry standard
        with:
          images: ghcr.io/${{ github.repository }}
          tags: |
            type=semver,pattern={{version}}
            type=sha,prefix=sha-
          labels: |
            org.opencontainers.image.title=My App
            org.opencontainers.image.description=My awesome app
            org.opencontainers.image.licenses=MIT
      
      - name: Build and push
        uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}  # ← Injects labels
          provenance: true  # ← SLSA provenance
          sbom: true        # ← Software Bill of Materials
```

### What This Gives You (Automatically)

**OCI Labels Added by metadata-action:**
- ✅ `org.opencontainers.image.created` - Build timestamp
- ✅ `org.opencontainers.image.revision` - **Git commit SHA** (the smoking gun!)
- ✅ `org.opencontainers.image.source` - Repository URL
- ✅ `org.opencontainers.image.version` - Version from git tag
- ✅ `org.opencontainers.image.url` - Repository URL
- ✅ Plus any custom labels you specify

**Image Tags Generated:**
- `latest` (if version tag)
- `1.2.3` (semver)
- `1.2` (major.minor)
- `1` (major)
- `sha-09c4012` (7-char commit hash)
- `edge` (latest main branch)

### Additional Compliance Tools

| Tool | Purpose | Usage |
|------|---------|-------|
| **docker/metadata-action@v5** | ✅ OCI labels + tags | **Use this** (we already do) |
| **docker/build-push-action@v6** | ✅ Multi-platform builds | **Use this** (we already do) |
| `anchore/sbom-action@v0` | ✅ Software Bill of Materials | Optional (we use built-in) |
| `sigstore/cosign` | ✅ Image signing | Optional (for high-security) |
| `aquasecurity/trivy-action` | ✅ Vulnerability scanning | Recommended |

### Our Project Status

✅ **We already use the standard workflow!**

```yaml
# .github/workflows/release.yml (excerpt)
- uses: docker/metadata-action@v5  # ✅ Already using it
  id: meta
  with:
    images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
    
- uses: docker/build-push-action@v6  # ✅ Already using it
  with:
    labels: ${{ steps.meta.outputs.labels }}
    provenance: true  # ✅ SLSA provenance
    sbom: true        # ✅ SBOM attestation
```

**Result:** Our images are **already OCI Image Spec compliant** and include SLSA provenance + SBOM.

---

## Question 3: Can OCI Labels Be Displayed on the Landing Page?

**Answer:** ✅ **YES - Implemented!**

We've added three components to display OCI metadata:

### 1. Backend API Endpoint: `/api/version`

**Implementation:** `server/src/index.ts`

```typescript
app.get('/api/version', (req: Request, res: Response) => {
  const buildInfo = {
    version: process.env.OCI_IMAGE_VERSION || 'unknown',
    revision: process.env.OCI_IMAGE_REVISION || 'unknown',
    created: process.env.OCI_IMAGE_CREATED || new Date().toISOString(),
    source: process.env.OCI_IMAGE_SOURCE || 'https://github.com/...',
    title: process.env.OCI_IMAGE_TITLE || 'mcp-gateway',
    description: process.env.OCI_IMAGE_DESCRIPTION || '...',
    licenses: process.env.OCI_IMAGE_LICENSES || 'MIT',
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
  };
  res.json(buildInfo);
});
```

**Test:**
```bash
curl http://localhost:3000/api/version | jq
```

**Response:**
```json
{
  "version": "1.2.0",
  "revision": "6d1fe7a6f2440801050fc7673c6616545adc2984",
  "created": "2026-06-08T20:18:28Z",
  "source": "https://github.com/ismail-kattakath/mcp-gateway",
  "title": "mcp-gateway",
  "description": "Universal aggregator for Model Context Protocol servers",
  "licenses": "MIT",
  "nodeVersion": "v20.20.2",
  "platform": "linux",
  "arch": "arm64"
}
```

### 2. Dockerfile Updates

**Pass OCI labels as environment variables:**

```dockerfile
# Build args (set by GitHub Actions)
ARG OCI_IMAGE_VERSION=dev
ARG OCI_IMAGE_REVISION=unknown
ARG OCI_IMAGE_CREATED
ARG OCI_IMAGE_SOURCE=https://github.com/ismail-kattakath/mcp-gateway

# Expose as environment variables for runtime access
ENV OCI_IMAGE_VERSION=${OCI_IMAGE_VERSION} \
    OCI_IMAGE_REVISION=${OCI_IMAGE_REVISION} \
    OCI_IMAGE_CREATED=${OCI_IMAGE_CREATED} \
    OCI_IMAGE_SOURCE=${OCI_IMAGE_SOURCE}

# Also set as OCI labels (Docker metadata)
LABEL org.opencontainers.image.version="${OCI_IMAGE_VERSION}"
LABEL org.opencontainers.image.revision="${OCI_IMAGE_REVISION}"
LABEL org.opencontainers.image.created="${OCI_IMAGE_CREATED}"
```

**Why both ENV and LABEL?**
- `LABEL` → Docker inspect can read (external tools)
- `ENV` → Application can read at runtime (our /api/version endpoint)

### 3. Workflow Updates

**Pass build args to Docker:**

```yaml
- name: Build and push
  uses: docker/build-push-action@v6
  with:
    build-args: |
      OCI_IMAGE_VERSION=${{ steps.meta.outputs.version }}
      OCI_IMAGE_REVISION=${{ github.sha }}
      OCI_IMAGE_CREATED=${{ steps.meta.outputs.json && fromJSON(steps.meta.outputs.json).labels['org.opencontainers.image.created'] }}
      OCI_IMAGE_SOURCE=https://github.com/${{ github.repository }}
    labels: ${{ steps.meta.outputs.labels }}
```

### 4. UI Component: Version Footer

**New component:** `ui/src/components/VersionFooter.tsx`

**Features:**
- Displays version, commit SHA, build date in sidebar footer
- Expandable to show full details
- Links to GitHub commit and repository
- Shows Node.js version and platform

**Visual:**
```
┌────────────────────────────┐
│ MCP Gateway                │
│ Universal MCP Manager      │
├────────────────────────────┤
│ 🏠 Dashboard               │
│ 🖥️  Servers                │
│ 📊 Logs                    │
│                            │
│                            │
├────────────────────────────┤
│ 📦 v1.2.0              ▶   │  ← Click to expand
└────────────────────────────┘

Expanded:
┌────────────────────────────┐
│ 📦 v1.2.0              ▼   │
│ 🔀 6d1fe7a → GitHub        │
│ 📅 Jun 8, 2026             │
│    Node v20.20.2           │
│    linux/arm64             │
│    GitHub →                │
└────────────────────────────┘
```

### 5. UI Root Serving

**Added static file serving:**

```typescript
// Serve UI on root
const uiDistPath = path.resolve(__dirname, '../../ui/dist');
app.use(express.static(uiDistPath));

// SPA fallback
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/sse') || req.path === '/health') {
    return next();
  }
  res.sendFile(path.join(uiDistPath, 'index.html'));
});
```

**Result:**
- `/` → Serves React UI
- `/api/*` → API endpoints
- `/sse` → MCP SSE transport
- `/health` → Health check

### Testing the Implementation

```bash
# 1. Build image with OCI metadata
docker build -t mcp-gateway:test \
  --build-arg OCI_IMAGE_VERSION=1.2.0 \
  --build-arg OCI_IMAGE_REVISION=$(git rev-parse HEAD) \
  --build-arg OCI_IMAGE_CREATED=$(date -u +"%Y-%m-%dT%H:%M:%SZ") \
  .

# 2. Run container (bind to 0.0.0.0 for Docker)
docker run -d -p 3000:3000 \
  -e GATEWAY_HOST=0.0.0.0 \
  -e GATEWAY_TRANSPORT=http \
  -v $(pwd)/registry.json:/app/registry.json:ro \
  mcp-gateway:test

# 3. Test API endpoint
curl http://localhost:3000/api/version | jq

# 4. Open UI in browser
open http://localhost:3000
# Check footer for version info with commit link
```

---

## Benefits of This Implementation

### 1. Traceability
- Every running container can report its exact source code commit
- Click commit SHA in UI → goes straight to GitHub commit
- No guessing which code is deployed

### 2. Debugging
- When user reports a bug, ask for `/api/version` output
- Instantly know: version, commit, build date
- Can reproduce exact environment

### 3. Compliance
- Audit trail: what code was running when?
- SBOM + provenance attestations
- Meets SOC 2, ISO 27001 requirements

### 4. Security
- Vulnerability scanning tools can read OCI labels
- Identify affected images by commit SHA
- Track which images need patching

### 5. Developer Experience
- UI shows version without checking Docker labels
- Links directly to source code
- No manual version tracking

---

## Comparison: Before vs After

### Before (Without Implementation)

```bash
# How do I know what's running?
docker inspect my-image | jq '.[0].Config.Labels'
# Output: null  ❌

# Where's the source code?
# 🤷 Check git tags? Hope it matches?

# What version is this?
# 🤷 Filename says "latest"? What does that mean?
```

### After (With Implementation)

```bash
# Check Docker labels
docker inspect my-image | jq '.[0].Config.Labels'
# Output: Full OCI metadata ✅

# Check running container
curl http://localhost:3000/api/version
# Output: Commit SHA, version, build date ✅

# Open UI
open http://localhost:3000
# Footer shows: v1.2.0 • 6d1fe7a • Jun 8, 2026 ✅
# Click commit → opens GitHub ✅
```

---

## Summary: Answers to All Three Questions

| Question | Answer | Status |
|----------|--------|--------|
| **1. Do enterprise containers maintain OCI labels?** | **Mixed** - Red Hat does, most others don't | ⚠️ Industry inconsistent |
| **2. Is there a ready-made workflow?** | **YES** - `docker/metadata-action@v5` | ✅ We already use it |
| **3. Can labels be displayed on landing page?** | **YES** - Implemented `/api/version` + UI footer | ✅ Fully implemented |

---

## Recommendations

### Immediate (Already Done)

- ✅ Use `docker/metadata-action@v5` in CI/CD
- ✅ Enable SBOM and provenance attestations
- ✅ Add `/api/version` endpoint
- ✅ Display version info in UI footer
- ✅ Pass OCI labels as environment variables

### Short Term (Next Release)

- ⏳ Document version endpoint in API docs
- ⏳ Add version check on startup (compare to GitHub releases)
- ⏳ Add "Update available" banner if outdated

### Long Term (Future)

- 🔮 Add vulnerability scanning (Trivy)
- 🔮 Implement image signing (Cosign)
- 🔮 Create compliance dashboard showing all deployments
- 🔮 Auto-generate security reports from SBOM

---

## Key Takeaways

1. **OCI Image Spec compliance is NOT automatic** - you must explicitly use tools like `docker/metadata-action`

2. **We're already compliant** - our workflow follows industry best practices

3. **Displaying metadata requires plumbing** - labels alone aren't enough, you need to pass them as environment variables for runtime access

4. **This solves real problems** - the commit SHA metadata is exactly what let us discover the stdio transport was missing from the published image!

5. **Enterprise grade ≠ OCI compliant** - even major cloud vendors (AWS, Microsoft, Google) don't follow the spec consistently

The implementation is complete and tested. The gateway now displays full OCI metadata on its landing page, making it easy to verify what code is running in any environment.
