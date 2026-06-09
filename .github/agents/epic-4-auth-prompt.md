# Epic 4 Agent: Authentication Framework (Passport.js)

**Role**: You are a security engineer specializing in authentication systems and identity management.

---

## Your Mission

Create **8-10 detailed implementation issues** for migrating MCP Gateway from custom auth to Passport.js + JWT.

---

## Context Files (Read These First)

1. `/Users/aloshy/aloshy-ai/mcp-gateway/docs/ARCHITECTURE-V3.md` (Section 1: Authentication & Authorization)
2. `/Users/aloshy/aloshy-ai/mcp-gateway/.github/PROJECT_STRUCTURE.md` (Epic 4)
3. Current auth implementation:
   - `server/src/middleware/auth.ts`
   - `server/src/security/apikey.ts`
   - `server/src/security/secure-storage.ts`

---

## Epic Goal

Replace custom Bearer token auth with industry-standard Passport.js framework featuring:
- JWT access tokens (15min) + refresh tokens (30 days)
- Multi-strategy support (API keys, Basic Auth, JWT)
- Backward compatibility with v2.x API keys
- bcrypt password hashing
- User management in SQLite (depends on Epic #13)

---

## Issues to Create

### Required Issues (Must Have)

1. **Passport.js Core Integration**
   - Install passport + passport-jwt dependencies
   - Configure Passport middleware
   - Express session setup (stateless JWT mode)
   - Error handling
   - Story points: 5

2. **JWT Strategy Implementation**
   - Access token generation (15min expiry)
   - Refresh token generation (30 days expiry)
   - Token verification middleware
   - Token refresh endpoint
   - Story points: 8

3. **API Key Strategy (JWT-based)**
   - Convert API keys to JWT format
   - passport-headerapikey strategy
   - API key CRUD operations
   - Key metadata (created, last_used)
   - Story points: 5

4. **Basic Auth Strategy**
   - passport-http for Basic Auth
   - bcrypt password hashing
   - User credentials validation
   - Rate limiting for auth attempts
   - Story points: 3

5. **User Management**
   - User CRUD operations (SQLiteStorage)
   - Password reset flow
   - User roles (for Epic 5 RBAC)
   - User status (active, disabled)
   - Story points: 5

6. **Auth Endpoints**
   - POST /auth/login (username/password → JWT)
   - POST /auth/token (refresh token → new access token)
   - POST /auth/logout (invalidate refresh token)
   - POST /auth/apikey (create API key)
   - GET /auth/me (current user info)
   - Story points: 5

7. **v2.x Compatibility Layer**
   - Detect v2.x API keys (format check)
   - Transform to v3.0 format
   - Deprecation warnings
   - 6-month sunset timeline
   - Story points: 5

8. **Auth Middleware Refactor**
   - Replace custom auth.ts with Passport
   - Maintain IP allowlist support
   - Request user context injection
   - Auth exemptions (/health, /docs)
   - Story points: 5

9. **CLI Auth Commands**
   - `mcp auth login`
   - `mcp auth logout`
   - `mcp auth key create/list/revoke`
   - `mcp auth user create/list/disable`
   - Story points: 5

10. **Integration Tests**
    - JWT flow tests
    - API key auth tests
    - Basic auth tests
    - Compatibility layer tests
    - Story points: 8

### Optional Issues (Nice to Have)

11. **Token Revocation**
    - Blacklist for revoked tokens
    - Redis integration for distributed revocation
    - Automatic cleanup of expired tokens
    - Story points: 5

---

## Issue Template

For each issue, create:

```markdown
## Title
[Action verb] + [What] (e.g., "Integrate Passport.js authentication framework")

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
- `server/src/auth/passport.ts` - Passport configuration
- `server/src/auth/strategies/jwt.ts` - JWT strategy
- `server/src/auth/strategies/apikey.ts` - API key strategy
- `server/src/middleware/auth.ts` - Replace with Passport middleware

**Implementation Steps**:
1. [Step 1]
2. [Step 2]
3. [Step 3]

**Key Decisions**:
- [Decision 1 and rationale]
- [Decision 2 and rationale]

**Edge Cases**:
- [Edge case 1 and handling]
- [Edge case 2 and handling]

## Security Considerations
- [Security concern 1 and mitigation]
- [Security concern 2 and mitigation]

## Test Scenarios
1. **Unit Tests**:
   - [Scenario 1]
   - [Scenario 2]

2. **Integration Tests**:
   - [Scenario 1]
   - [Scenario 2]

3. **Security Tests**:
   - [Attack scenario 1]
   - [Attack scenario 2]

## Dependencies
- **Depends on**: Epic #13 (SQLite for user storage)
- **Blocks**: Epic 5 (RBAC), Epic 6-9 (OAuth, SAML, LDAP, Advanced Auth)

## Related Files
[Link to existing code that needs modification]

## Complexity Estimate
**Story Points**: [1, 2, 3, 5, 8, 13]

**Rationale**: [Why this estimate]

## Sub-Issues

### 1. Plan: [Title]
**Duration**: 1-2 days

**Checklist**:
- [ ] Read Passport.js documentation
- [ ] Review JWT best practices (OWASP)
- [ ] Design token structure
- [ ] Plan backward compatibility
- [ ] Document security decisions

**Deliverable**: Security design doc

### 2. Implement: [Title]
**Duration**: 2-5 days

**Checklist**:
- [ ] Install dependencies
- [ ] Create auth modules
- [ ] Implement strategies
- [ ] Add error handling
- [ ] Code review ready

**Deliverable**: Implementation PR (draft)

### 3. Test: [Title]
**Duration**: 1-3 days

**Checklist**:
- [ ] Write unit tests
- [ ] Write integration tests
- [ ] Security testing (OWASP Top 10)
- [ ] Penetration testing
- [ ] Coverage 77%+

**Deliverable**: Tests added to PR

### 4. Integrate: [Title]
**Duration**: 1 day

**Checklist**:
- [ ] Merge Epic #13 (storage dependency)
- [ ] Update API documentation
- [ ] Update migration guide
- [ ] Security audit review
- [ ] Merge PR

**Deliverable**: Merged PR + security audit report
```

---

## Constraints

1. **Passport.js required** - Industry standard, extensible
2. **JWT standard** - RFC 7519 compliant
3. **bcrypt only** - No argon2, scrypt, or custom hashing
4. **Stateless JWT** - No server-side session storage (except refresh tokens)
5. **Backward compatibility** - v2.x API keys must work for 6 months

---

## Security Requirements (CRITICAL)

1. **Token Security**:
   - Access tokens: 15min expiry (short-lived)
   - Refresh tokens: 30 days expiry (long-lived, stored encrypted)
   - Secrets: 256-bit random keys (crypto.randomBytes)
   - Constant-time comparison for tokens

2. **Password Security**:
   - bcrypt rounds: 12 (OWASP recommended)
   - Password requirements: 12+ chars, complexity rules
   - Rate limiting: 5 attempts per 15min per IP

3. **API Key Security**:
   - 32-byte random generation
   - One-way hashing before storage
   - Last-used timestamp tracking
   - Automatic expiry support

4. **Attack Mitigation**:
   - Brute force: Rate limiting + account lockout
   - Timing attacks: Constant-time comparison
   - Token theft: Short expiry + rotation
   - CSRF: SameSite cookies + CSRF tokens

---

## Quality Checklist

Before creating issues, verify:
- [ ] All issues are actionable (clear "what to do")
- [ ] Acceptance criteria are measurable
- [ ] Story points are realistic (1 point = 1 ideal day)
- [ ] Dependencies on Epic #13 documented
- [ ] Blocks Epic 5-9 correctly
- [ ] Each issue has 4 sub-issues
- [ ] Security considerations included
- [ ] OWASP compliance addressed
- [ ] File paths are accurate

---

## Output Format

Create issues via GitHub API (gh CLI):

```bash
gh issue create --repo ismail-kattakath/mcp-gateway \
  --title "Integrate Passport.js authentication framework" \
  --body "<markdown body>" \
  --label "epic-16,area-auth,priority-p0" \
  --milestone "v3.0 - Enterprise-Grade Gateway"
```

Then create 4 sub-issues linked to parent.

---

## Success Criteria

You succeed when:
- 8-10 issues created
- Each issue is self-contained
- Story points sum to 45-55 (realistic for 2 weeks)
- Dependencies correctly identify Epic #13 as prerequisite
- All security checks pass
- Quality checklist verified

---

## Begin

1. Read context files (ARCHITECTURE-V3.md, current auth implementation)
2. Analyze current custom auth system
3. Create issues in security-critical order
4. Report completion summary

Good luck!
