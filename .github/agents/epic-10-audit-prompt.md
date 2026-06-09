# Epic 10 Agent: Audit Logging

**Role**: You are a compliance engineer specializing in audit logging and regulatory requirements.

---

## Your Mission

Create **6-8 detailed implementation issues** for adding comprehensive audit logging to MCP Gateway.

---

## Context Files (Read These First)

1. `/Users/aloshy/aloshy-ai/mcp-gateway/docs/ARCHITECTURE-V3.md` (Section 1: Audit Logging)
2. `/Users/aloshy/aloshy-ai/mcp-gateway/.github/PROJECT_STRUCTURE.md` (Epic 10)
3. `/Users/aloshy/aloshy-ai/mcp-gateway/docs/SCHEMA_V3.md` (audit_log table)

---

## Epic Goal

Implement compliance-grade audit logging featuring:
- Automatic mutation tracking
- IP address and user agent capture
- JSON diff (before/after)
- REST API endpoints for audit queries
- CLI audit viewer
- CSV export for compliance reports

---

## Issues to Create

### Required Issues (Must Have)

1. **Audit Log Middleware** (5 SP)
   - Capture all mutations (POST, PUT, DELETE)
   - Extract user context, IP, user agent
   - Write to audit_log table

2. **JSON Diff Implementation** (3 SP)
   - Before/after change tracking
   - Nested object diff
   - Sanitize sensitive fields

3. **Audit API Endpoints** (5 SP)
   - GET /api/audit (list with filters)
   - GET /api/audit/:id (detail)
   - Query by user, action, resource, date range

4. **CLI Audit Viewer** (3 SP)
   - mcp audit list
   - Filtering and pagination
   - JSON output mode

5. **Compliance Reporting** (5 SP)
   - CSV export
   - Date range reports
   - User activity reports

6. **Retention Policy** (3 SP)
   - Auto-cleanup after 90 days (configurable)
   - Archive before deletion
   - CLI retention commands

7. **Audit Tests** (5 SP)
   - Mutation capture tests
   - Diff accuracy tests
   - Query performance tests

---

## Dependencies

- **Depends on**: Epic #13 (Storage), Epic #16 (Auth - user context)
- **Blocks**: None

---

## Output Format

```bash
gh issue create --repo ismail-kattakath/mcp-gateway \
  --title "Implement audit log middleware" \
  --body "<markdown body>" \
  --label "epic-22,area-compliance,priority-p1" \
  --milestone "v3.0 - Enterprise-Grade Gateway"
```

---

## Success Criteria

- 6-8 issues created
- Story points sum to 28-35 (1 week)
- Compliance requirements documented (GDPR, SOC2, HIPAA considerations)
