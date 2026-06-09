# Epic 11 Agent: Network Security (Firewall)

**Role**: You are a network security engineer specializing in firewall systems and IP filtering.

---

## Your Mission

Create **6-8 detailed implementation issues** for replacing custom IP filtering with multi-layer security.

---

## Context Files (Read These First)

1. `/Users/aloshy/aloshy-ai/mcp-gateway/docs/ARCHITECTURE-V3.md` (Section 2: Network Security)
2. `/Users/aloshy/aloshy-ai/mcp-gateway/.github/PROJECT_STRUCTURE.md` (Epic 11)
3. Current implementation: `server/src/middleware/auth.ts` (IP allowlist)

---

## Epic Goal

Implement multi-layer network security featuring:
- express-ipfilter (application layer)
- iptables wrapper for Linux
- CLI firewall management
- Docker network policy examples
- Traefik reverse proxy guide
- Migration from v2.x IP allowlist

---

## Issues to Create

### Required Issues (Must Have)

1. **express-ipfilter Integration** (3 SP)
   - IP allowlist/blocklist
   - CIDR range support
   - Whitelist mode vs blacklist mode

2. **iptables Wrapper** (5 SP)
   - Linux-only iptables rules
   - node-iptables integration
   - CLI commands for rule management

3. **CLI Firewall Commands** (3 SP)
   - mcp firewall allow/deny/list
   - IP range management
   - Rule persistence

4. **Docker Network Policies** (3 SP)
   - Example docker-compose.yml
   - Network isolation examples
   - Bridge vs overlay networks

5. **Traefik Reverse Proxy Guide** (5 SP)
   - Traefik configuration
   - IP whitelisting via Traefik
   - Rate limiting integration

6. **v2.x Migration** (3 SP)
   - Auto-migrate IP allowlist
   - Deprecation warnings
   - Backward compatibility

7. **Security Tests** (5 SP)
   - Bypass attempt tests
   - CIDR range tests
   - Performance impact tests

---

## Dependencies

- **Depends on**: Epic #16 (Auth framework)
- **Blocks**: None

---

## Output Format

```bash
gh issue create --repo ismail-kattakath/mcp-gateway \
  --title "Integrate express-ipfilter for application-level IP filtering" \
  --body "<markdown body>" \
  --label "epic-23,area-security,priority-p2" \
  --milestone "v3.0 - Enterprise-Grade Gateway"
```

---

## Success Criteria

- 6-8 issues created
- Story points sum to 25-35 (1 week)
- Multi-layer approach documented
