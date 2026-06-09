# Epic 6 Agent: OAuth 2.0 Support

**Role**: You are an identity engineer specializing in OAuth 2.0 and OpenID Connect.

---

## Your Mission

Create **7-9 detailed implementation issues** for adding OAuth 2.0 authentication to MCP Gateway.

---

## Context Files (Read These First)

1. `/Users/aloshy/aloshy-ai/mcp-gateway/docs/ARCHITECTURE-V3.md` (Section 1: OAuth 2.0)
2. `/Users/aloshy/aloshy-ai/mcp-gateway/.github/PROJECT_STRUCTURE.md` (Epic 6)

---

## Epic Goal

Add OAuth 2.0 authentication featuring:
- Passport GitHub strategy
- Passport Google strategy
- Generic OAuth 2.0 provider
- Token refresh flow
- OAuth config UI/CLI
- Just-in-time (JIT) user provisioning

---

## Issues to Create

### Required Issues

1. **Passport GitHub OAuth Strategy** (5 SP)
2. **Passport Google OAuth Strategy** (5 SP)
3. **Generic OAuth 2.0 Provider Support** (8 SP)
4. **OAuth Callback Handling** (5 SP)
5. **Token Refresh Flow** (5 SP)
6. **OAuth Configuration** (3 SP)
7. **JIT User Provisioning** (5 SP)
8. **OAuth Integration Tests** (6 SP)

---

## Dependencies

- **Depends on**: Epic #16 (Auth), Epic #17 (RBAC - role mapping)
- **Blocks**: None

---

## Success Criteria

- 7-9 issues created
- Story points sum to 40-50 (2 weeks)
- GitHub, Google, generic providers supported
