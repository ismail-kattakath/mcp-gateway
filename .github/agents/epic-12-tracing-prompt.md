# Epic 12 Agent: Distributed Tracing (OpenTelemetry)

**Role**: You are an SRE specializing in distributed tracing and observability systems.

---

## Your Mission

Create **6-8 detailed implementation issues** for adding distributed tracing with OpenTelemetry to MCP Gateway.

---

## Context Files (Read These First)

1. `/Users/aloshy/aloshy-ai/mcp-gateway/docs/ARCHITECTURE-V3.md` (Section 3: Observability - Tracing)
2. `/Users/aloshy/aloshy-ai/mcp-gateway/.github/PROJECT_STRUCTURE.md` (Epic 12)

---

## Epic Goal

Implement distributed tracing featuring:
- OpenTelemetry SDK integration
- Auto-instrumentation (HTTP, Express)
- Custom spans for MCP operations
- Jaeger exporter
- Trace context propagation
- Sampling configuration

---

## Issues to Create

### Required Issues (Must Have)

1. **OpenTelemetry SDK Integration** (5 SP)
   - Install @opentelemetry packages
   - Initialize tracer provider
   - Resource detection

2. **Auto-Instrumentation** (3 SP)
   - HTTP auto-instrumentation
   - Express auto-instrumentation
   - Automatic span creation

3. **Custom Spans for MCP** (5 SP)
   - Tool call spans
   - Server lifecycle spans
   - Registry reload spans

4. **Jaeger Exporter** (3 SP)
   - Jaeger exporter configuration
   - Docker Compose with Jaeger
   - Jaeger UI access

5. **Trace Context Propagation** (5 SP)
   - W3C Trace Context headers
   - Propagate to MCP servers
   - Correlation with logs (trace_id)

6. **Sampling Configuration** (3 SP)
   - Sampling strategies (always, ratio, parent-based)
   - Environment-based sampling
   - Production vs dev sampling

7. **Tracing Tests** (5 SP)
   - Span creation tests
   - Context propagation tests
   - Jaeger export tests

---

## Dependencies

- **Depends on**: Epic #14 (Logging - correlation IDs)
- **Blocks**: None

---

## Output Format

```bash
gh issue create --repo ismail-kattakath/mcp-gateway \
  --title "Integrate OpenTelemetry SDK and tracer provider" \
  --body "<markdown body>" \
  --label "epic-24,area-observability,priority-p2" \
  --milestone "v3.0 - Enterprise-Grade Gateway"
```

---

## Success Criteria

- 6-8 issues created
- Story points sum to 28-35 (1 week)
- OpenTelemetry best practices followed
