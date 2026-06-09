# Epic 5 Agent: RBAC & Multi-Tenancy

**Role**: You are a security architect specializing in authorization systems and multi-tenant architectures.

---

## Your Mission

Create **6-8 detailed implementation issues** for adding Role-Based Access Control (RBAC) and multi-tenancy to MCP Gateway.

---

## Context Files (Read These First)

1. `/Users/aloshy/aloshy-ai/mcp-gateway/docs/ARCHITECTURE-V3.md` (Section 1: Authentication & Authorization - RBAC)
2. `/Users/aloshy/aloshy-ai/mcp-gateway/.github/PROJECT_STRUCTURE.md` (Epic 5)
3. `/Users/aloshy/aloshy-ai/mcp-gateway/docs/SCHEMA_V3.md` (users, roles, tenant columns)

---

## Epic Goal

Implement fine-grained authorization featuring:
- CASL (or casbin) for RBAC
- Default roles: admin, user, readonly
- Permission decorators for routes
- Multi-tenancy with tenant isolation
- CLI role management commands

---

## Issues to Create

### Required Issues (Must Have)

1. **Integrate CASL for RBAC** (5 SP)
   - Install @casl/ability
   - Define ability rules
   - Permission checking utility

2. **Define Default Roles** (3 SP)
   - admin, user, readonly roles
   - Permission matrix
   - Role assignment on user creation

3. **Permission Decorators** (5 SP)
   - Express middleware decorators
   - Route-level permissions
   - Action-based checks (read, write, delete)

4. **Multi-Tenancy Schema** (3 SP)
   - Add tenant column to tables
   - Tenant isolation middleware
   - Default tenant handling

5. **Tenant Isolation Middleware** (5 SP)
   - Request tenant extraction
   - Query filtering by tenant
   - Cross-tenant access prevention

6. **CLI Role Management** (3 SP)
   - mcp role list/create/assign
   - User role assignment
   - Permission testing

7. **RBAC Tests** (5 SP)
   - Permission enforcement tests
   - Tenant isolation tests
   - Role inheritance tests

---

## Dependencies

- **Depends on**: Epic #16 (Authentication - user roles in JWT)
- **Blocks**: Epic #6-9 (OAuth/SAML need RBAC for role mapping)

---

## Output Format

```bash
gh issue create --repo ismail-kattakath/mcp-gateway \
  --title "Integrate CASL for RBAC" \
  --body "<markdown body>" \
  --label "epic-17,area-auth,priority-p1" \
  --milestone "v3.0 - Enterprise-Grade Gateway"
```

---

## Success Criteria

- 6-8 issues created
- Story points sum to 28-35 (1 week)
- Dependencies on Epic #16 documented
- Blocks Epic #6-9
