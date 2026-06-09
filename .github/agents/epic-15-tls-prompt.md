# Epic 15 Agent: Domain Names & TLS

**Role**: You are a network engineer specializing in TLS/SSL and DNS resolution systems.

---

## Your Mission

Create **6-8 detailed implementation issues** for adding mDNS support and automatic TLS to MCP Gateway.

---

## Context Files (Read These First)

1. `/Users/aloshy/aloshy-ai/mcp-gateway/docs/ARCHITECTURE-V3.md` (Section 7: Domain Names & TLS)
2. `/Users/aloshy/aloshy-ai/mcp-gateway/.github/PROJECT_STRUCTURE.md` (Epic 15)
3. Current server setup:
   - `server/src/index.ts` - HTTP server initialization
   - `server/package.json` - Dependencies

---

## Epic Goal

Add domain name resolution and TLS support featuring:
- mDNS/Bonjour for .local domains (e.g., mcp-gateway.local)
- Automatic Let's Encrypt certificate acquisition and renewal
- Custom CA certificate support
- TLS configuration following Mozilla guidelines
- HTTP → HTTPS automatic redirect
- No breaking changes for HTTP-only users

---

## Issues to Create

### Required Issues (Must Have)

1. **mDNS/Bonjour Integration**
   - Integrate bonjour-hap or multicast-dns library
   - Advertise service as mcp-gateway.local
   - Handle mDNS queries
   - Cross-platform support (macOS, Linux, Windows)
   - Story points: 5

2. **Let's Encrypt Integration (Greenlock)**
   - Integrate greenlock-express
   - ACME challenge handling (HTTP-01)
   - Certificate storage configuration
   - Auto-renewal mechanism
   - Story points: 8

3. **Custom CA Certificate Support**
   - Load custom cert/key pairs
   - PEM format validation
   - Certificate chain verification
   - Configuration via settings
   - Story points: 3

4. **TLS Configuration & Security**
   - Mozilla SSL Configuration Generator compliance
   - Cipher suite configuration (modern profile)
   - Minimum TLS version (1.2+)
   - HSTS headers
   - Security headers (X-Frame-Options, etc.)
   - Story points: 5

5. **HTTP → HTTPS Redirect**
   - Automatic redirect middleware
   - Preserve query params and paths
   - Configurable (optional HTTP-only mode)
   - Story points: 2

6. **TLS Testing Suite**
   - Self-signed cert generation for tests
   - TLS handshake tests
   - Certificate validation tests
   - Renewal tests (mock ACME)
   - Story points: 5

7. **Configuration Management**
   - CLI commands for TLS setup
   - Domain configuration
   - Certificate management (list, renew, revoke)
   - Migration from HTTP to HTTPS
   - Story points: 5

### Optional Issues (Nice to Have)

8. **DNS-01 Challenge Support**
   - For wildcard certificates
   - DNS provider plugins
   - Cloudflare, Route53 integration
   - Story points: 8

9. **Certificate Monitoring**
   - Expiration alerts
   - Renewal failure notifications
   - Prometheus metrics for cert validity
   - Story points: 3

---

## Issue Template

For each issue, create:

```markdown
## Title
[Action verb] + [What] (e.g., "Integrate mDNS for .local domain resolution")

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
- `server/src/network/mdns.ts` - mDNS service advertising
- `server/src/network/tls.ts` - TLS configuration
- `server/src/index.ts` - HTTPS server setup

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

## Test Scenarios
1. **Unit Tests**:
   - [Scenario 1]
   - [Scenario 2]

2. **Integration Tests**:
   - [Scenario 1]
   - [Scenario 2]

3. **Security Tests**:
   - [TLS version enforcement]
   - [Cipher suite validation]

## Dependencies
- **Depends on**: #[issue_number] ([brief description])
- **Blocks**: Epic 16 (HTTP/2 & Performance)

## Related Files
[Link to existing code that needs modification]

## Complexity Estimate
**Story Points**: [1, 2, 3, 5, 8, 13]

**Rationale**: [Why this estimate]

## Sub-Issues

### 1. Plan: [Title]
**Duration**: 1-2 days

**Checklist**:
- [ ] Research mDNS/TLS libraries
- [ ] Review Mozilla SSL guidelines
- [ ] Design certificate storage strategy
- [ ] Plan backward compatibility
- [ ] Document design decisions

**Deliverable**: Design doc or spike PR

### 2. Implement: [Title]
**Duration**: 2-5 days

**Checklist**:
- [ ] Install dependencies
- [ ] Create TLS/mDNS modules
- [ ] Update server initialization
- [ ] Add configuration options
- [ ] Add error handling
- [ ] Code review ready

**Deliverable**: Implementation PR (draft)

### 3. Test: [Title]
**Duration**: 1-2 days

**Checklist**:
- [ ] Write unit tests
- [ ] Write integration tests
- [ ] Test certificate renewal
- [ ] Test cross-platform (Linux, macOS)
- [ ] Security testing (TLS scanner)

**Deliverable**: Tests added to PR

### 4. Integrate: [Title]
**Duration**: 1 day

**Checklist**:
- [ ] Merge dependencies
- [ ] Update documentation
- [ ] Update deployment guides
- [ ] Final review
- [ ] Merge PR

**Deliverable**: Merged PR + updated docs
```

---

## Constraints

1. **Optional TLS** - HTTP-only mode must still work (for dev/testing)
2. **Auto-renewal** - Let's Encrypt certs must renew automatically
3. **Cross-platform** - mDNS must work on macOS, Linux, Windows
4. **Mozilla compliance** - Follow Modern SSL configuration guidelines
5. **No downtime** - Certificate renewal shouldn't interrupt service

---

## Quality Checklist

Before creating issues, verify:
- [ ] All issues are actionable (clear "what to do")
- [ ] Acceptance criteria are measurable
- [ ] Story points are realistic (1 point = 1 ideal day)
- [ ] Dependencies are correct (blocks Epic 16)
- [ ] Each issue has 4 sub-issues
- [ ] Test scenarios cover security
- [ ] Edge cases considered
- [ ] File paths are accurate

---

## Output Format

Create issues via GitHub API (gh CLI):

```bash
gh issue create --repo ismail-kattakath/mcp-gateway \
  --title "Integrate mDNS for .local domain resolution" \
  --body "<markdown body>" \
  --label "epic-15,area-network,priority-p2" \
  --milestone "v3.0 - Enterprise-Grade Gateway"
```

Then create 4 sub-issues linked to parent.

---

## Success Criteria

You succeed when:
- 6-8 issues created
- Each issue is self-contained
- Story points sum to 28-35 (realistic for 1 week)
- Dependencies correctly identify Epic 16 as blocked
- All quality checks pass

---

## Begin

1. Read context files
2. Analyze current HTTP server setup
3. Create issues in priority order
4. Report completion summary

Good luck!
