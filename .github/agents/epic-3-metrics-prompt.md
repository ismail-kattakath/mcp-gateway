# Epic 3 Agent: Metrics & Monitoring (Prometheus)

**Role**: You are an SRE/DevOps engineer specializing in observability and monitoring systems.

---

## Your Mission

Create **6-8 detailed implementation issues** for adding Prometheus metrics and enhanced health checks to MCP Gateway.

---

## Context Files (Read These First)

1. `/Users/aloshy/aloshy-ai/mcp-gateway/docs/ARCHITECTURE-V3.md` (Section 3: Observability - Metrics)
2. `/Users/aloshy/aloshy-ai/mcp-gateway/.github/PROJECT_STRUCTURE.md` (Epic 3)
3. Current health check:
   - `server/src/index.ts` - `/health` endpoint

---

## Epic Goal

Add comprehensive metrics and monitoring featuring:
- Prometheus client integration (prom-client)
- Custom MCP-specific metrics
- Enhanced health checks (/health, /healthz, /readyz)
- Pre-built Grafana dashboards
- Alerting rules template
- Integration with Epic #14 structured logging

---

## Issues to Create

### Required Issues (Must Have)

1. **Prometheus Client Integration**
   - Install prom-client dependency
   - Configure default metrics (CPU, memory, heap)
   - Create /metrics endpoint
   - Prometheus scrape configuration
   - Story points: 3

2. **Custom MCP Metrics**
   - `mcp_tool_calls_total` (counter by server, tool, status)
   - `mcp_tool_call_duration_seconds` (histogram by server, tool)
   - `mcp_server_status` (gauge by server: 0=stopped, 1=running, 2=failed)
   - `mcp_active_connections` (gauge)
   - `mcp_registry_reload_total` (counter)
   - Story points: 5

3. **Enhanced Health Checks**
   - `/health` - Simple "OK" for load balancers
   - `/healthz` - Kubernetes liveness (process alive?)
   - `/readyz` - Kubernetes readiness (dependencies ready?)
   - Dependency checks (SQLite, MCP servers)
   - Story points: 5

4. **HTTP Metrics Middleware**
   - Request duration histogram
   - Request size histogram
   - Response size histogram
   - Status code counter (2xx, 3xx, 4xx, 5xx)
   - Active requests gauge
   - Story points: 3

5. **Pre-built Grafana Dashboards**
   - Overview dashboard (requests, errors, latency)
   - MCP-specific dashboard (tool calls, server health)
   - Infrastructure dashboard (CPU, memory, connections)
   - JSON dashboard exports
   - Story points: 5

6. **Alerting Rules Template**
   - High error rate (>5% 5xx responses)
   - High latency (p95 >1s)
   - MCP server failures
   - Low storage space
   - PrometheusRule YAML for Kubernetes
   - Story points: 3

7. **Documentation & Setup Guide**
   - Prometheus scrape config
   - Grafana dashboard import
   - Alert manager setup
   - Runbook for common alerts
   - Story points: 3

### Optional Issues (Nice to Have)

8. **Metrics Cardinality Management**
   - Label validation (prevent unbounded cardinality)
   - Metrics aggregation strategies
   - Cardinality monitoring
   - Story points: 3

---

## Issue Template

For each issue, create:

```markdown
## Title
[Action verb] + [What] (e.g., "Integrate Prometheus client and expose /metrics endpoint")

## Problem
[Why this is needed, what pain it solves]

## Acceptance Criteria
- [ ] Specific measurable outcome 1
- [ ] Specific measurable outcome 2
- [ ] All unit tests passing
- [ ] Integration tests passing
- [ ] Documentation updated

## Technical Approach
**Files to Create/Modify**:
- `server/src/metrics/prometheus.ts` - Prometheus client setup
- `server/src/metrics/custom.ts` - Custom MCP metrics
- `server/src/middleware/metrics.ts` - HTTP metrics middleware
- `server/src/index.ts` - Add /metrics endpoint

**Implementation Steps**:
1. [Step 1]
2. [Step 2]
3. [Step 3]

**Key Decisions**:
- [Decision 1 and rationale]
- [Decision 2 and rationale]

**Metrics Design**:
- [Metric name, type, labels, purpose]
- [Cardinality considerations]

## Test Scenarios
1. **Unit Tests**:
   - [Scenario 1]
   - [Scenario 2]

2. **Integration Tests**:
   - [Scenario 1]
   - [Scenario 2]

3. **Performance Tests**:
   - [Metrics overhead <1%]
   - [/metrics response time <100ms]

## Dependencies
- **Depends on**: Epic #14 (Structured Logging for correlation)
- **Blocks**: None (standalone observability)

## Related Files
[Link to existing code that needs modification]

## Complexity Estimate
**Story Points**: [1, 2, 3, 5, 8, 13]

**Rationale**: [Why this estimate]

## Sub-Issues

### 1. Plan: [Title]
**Duration**: 1 day

**Checklist**:
- [ ] Read Prometheus best practices
- [ ] Design metrics taxonomy
- [ ] Plan cardinality limits
- [ ] Design dashboard layouts
- [ ] Document design decisions

**Deliverable**: Metrics design doc

### 2. Implement: [Title]
**Duration**: 2-3 days

**Checklist**:
- [ ] Install prom-client
- [ ] Create metrics modules
- [ ] Add middleware
- [ ] Create dashboards
- [ ] Code review ready

**Deliverable**: Implementation PR (draft)

### 3. Test: [Title]
**Duration**: 1-2 days

**Checklist**:
- [ ] Write unit tests
- [ ] Write integration tests
- [ ] Load test with metrics enabled
- [ ] Test dashboard queries
- [ ] Validate cardinality

**Deliverable**: Tests added to PR

### 4. Integrate: [Title]
**Duration**: 1 day

**Checklist**:
- [ ] Merge dependencies
- [ ] Update deployment docs
- [ ] Add Prometheus scrape config
- [ ] Import dashboards to Grafana
- [ ] Merge PR

**Deliverable**: Merged PR + observability guide
```

---

## Constraints

1. **Prometheus format** - OpenMetrics compatible
2. **Low overhead** - <1% performance impact
3. **Cardinality limits** - No unbounded label values
4. **Kubernetes-ready** - /healthz and /readyz for K8s
5. **Grafana 9.0+** - Dashboard compatibility

---

## Metrics Best Practices

1. **Naming Convention**:
   - Prefix: `mcp_`
   - Snake_case: `mcp_tool_calls_total`
   - Units: `_seconds`, `_bytes`, `_total`

2. **Label Guidelines**:
   - Use labels for dimensions (server, tool, status)
   - Avoid high-cardinality labels (user IDs, timestamps)
   - Maximum 10 label combinations per metric

3. **Metric Types**:
   - Counter: Monotonically increasing (tool_calls_total)
   - Gauge: Can go up/down (active_connections)
   - Histogram: Distribution (tool_call_duration_seconds)
   - Summary: Avoid (use histogram instead)

4. **Health Check Levels**:
   - `/health`: Always return 200 OK if process alive
   - `/healthz`: Return 503 if critical failure (can't recover)
   - `/readyz`: Return 503 if dependencies unavailable (temporary)

---

## Quality Checklist

Before creating issues, verify:
- [ ] All issues are actionable (clear "what to do")
- [ ] Acceptance criteria are measurable
- [ ] Story points are realistic (1 point = 1 ideal day)
- [ ] Dependencies on Epic #14 documented
- [ ] Each issue has 4 sub-issues
- [ ] Metrics follow Prometheus best practices
- [ ] Cardinality limits specified
- [ ] File paths are accurate

---

## Output Format

Create issues via GitHub API (gh CLI):

```bash
gh issue create --repo ismail-kattakath/mcp-gateway \
  --title "Integrate Prometheus client and expose /metrics endpoint" \
  --body "<markdown body>" \
  --label "epic-15,area-observability,priority-p1" \
  --milestone "v3.0 - Enterprise-Grade Gateway"
```

Then create 4 sub-issues linked to parent.

---

## Success Criteria

You succeed when:
- 6-8 issues created
- Each issue is self-contained
- Story points sum to 25-35 (realistic for 1 week)
- Dependencies correctly identify Epic #14 as prerequisite
- Metrics follow Prometheus naming conventions
- Quality checklist verified

---

## Begin

1. Read context files
2. Analyze current /health endpoint
3. Create issues in logical order (client → custom metrics → health checks → dashboards)
4. Report completion summary

Good luck!
