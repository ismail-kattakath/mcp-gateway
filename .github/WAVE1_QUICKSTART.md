# Wave 1 Quick Start Guide

**Target**: Developers A, B, C (Foundation Team)  
**Timeline**: Weeks 1-5  
**Goal**: Complete Epic #13, #14, #27

---

## 🎯 Your Mission

You're building the **foundation** for v3.0. Everything else depends on your work:
- **Developer A**: SQLite database + encryption (blocks all other work)
- **Developer B**: Structured logging (needed for observability)
- **Developer C**: TLS + domain names (needed for production)

---

## 👤 Developer A - Storage Migration

### **Your Epic**: #13 - Storage Layer Migration (53 SP, 4 weeks)

### **What You're Building**
Replace JSON file storage (`registry.json`) with SQLite database:
- 6 tables: servers, users, api_keys, settings, audit_log, refresh_tokens
- Field-level AES-256-GCM encryption for secrets
- Migration tool from v2.x registry.json
- Backward compatibility layer

### **Read These First**
1. `docs/SCHEMA_V3.md` - Complete database schema (386 lines)
2. `.github/agents/epic-1-storage-prompt.md` - Implementation guidance
3. `server/src/mcp/registry.ts` - Current JSON-based storage

### **Your Issues** (in order)
1. **Issue #34** - Database Schema Design (3 SP) - START HERE
2. **Issue #37** - Field-level Encryption Helper (5 SP)
3. **Issue #44** - SQL Query Builder (5 SP)
4. **Issue #46** - SQLite Integration (8 SP)
5. **Issue #61** - Auto-Migration from registry.json (8 SP)
6. **Issue #66** - Backward Compatibility Shim (5 SP)
7. **Issue #68** - Storage Integration Tests (5 SP)
8. **Issue #73** - Database Backup/Restore (3 SP)
9. **Issue #76** - Storage Performance Optimization (5 SP)
10. **Issue #78** - Storage Documentation (3 SP)

### **Tech Stack**
- `better-sqlite3` - Synchronous SQLite
- `crypto` (Node.js built-in) - AES-256-GCM encryption
- `uuid` - UUID v4 generation

### **Success Criteria**
- [ ] All 6 tables created with correct schema
- [ ] Encryption works for env vars, secrets, API keys
- [ ] Migration tool converts registry.json → SQLite
- [ ] Tests: 80%+ coverage
- [ ] Documentation: API docs for storage layer

### **Week-by-Week Plan**
- **Week 1**: Issues #34, #37 (schema + encryption)
- **Week 2**: Issues #44, #46 (query builder + SQLite integration)
- **Week 3**: Issues #61, #66 (migration + compatibility)
- **Week 4**: Issues #68, #73, #76, #78 (tests + docs + optimization)

---

## 👤 Developer B - Structured Logging

### **Your Epic**: #14 - Structured Logging (29 SP, 2 weeks)

### **What You're Building**
Replace basic Winston logging with structured, sanitized logging:
- Winston or Pino (choose based on performance tests)
- Log sanitization (prevent injection attacks)
- Context propagation (request IDs)
- Log rotation and archival

### **Read These First**
1. `docs/ARCHITECTURE-V3.md` Section 2 - Logging & Observability
2. `.github/agents/epic-2-logging-prompt.md`
3. `server/src/logging/logger.ts` - Current logging implementation
4. `server/src/logging/sanitizer.ts` - Existing sanitization (keep this!)

### **Your Issues** (in order)
1. **Issue #47** - Integrate Winston/Pino (5 SP) - START HERE
2. **Issue #49** - Enhance Log Sanitization (3 SP)
3. **Issue #52** - Context Propagation (5 SP)
4. **Issue #55** - Structured Error Logging (5 SP)
5. **Issue #58** - Log Rotation (3 SP)
6. **Issue #60** - Logging Tests (5 SP)
7. **Issue #63** - Logging Documentation (3 SP)

### **Tech Stack**
- `winston` OR `pino` (benchmark both, choose winner)
- `express-pino-logger` or `express-winston`
- `rotating-file-stream` for log rotation

### **Success Criteria**
- [ ] All logs are structured JSON
- [ ] Sanitization prevents log injection
- [ ] Request IDs propagated through all logs
- [ ] Log rotation works (daily, 7 days retention)
- [ ] Tests: 80%+ coverage

### **Week-by-Week Plan**
- **Week 1**: Issues #47, #49, #52 (Winston/Pino + sanitization + context)
- **Week 2**: Issues #55, #58, #60, #63 (errors + rotation + tests + docs)

---

## 👤 Developer C - TLS & Domain Names

### **Your Epic**: #27 - Domain Names & TLS (41 SP, 3 weeks)

### **What You're Building**
Production-ready TLS setup with automatic certificate management:
- Caddy reverse proxy (auto HTTPS)
- Let's Encrypt integration
- Custom domain support
- TLS best practices (TLS 1.3+, strong ciphers)

### **Read These First**
1. `docs/ARCHITECTURE-V3.md` Section 15 - Domain Names & TLS
2. `.github/agents/epic-3-tls-prompt.md`
3. `Dockerfile` - Current container setup

### **Your Issues** (in order)
1. **Issue #105** - Integrate Caddy Reverse Proxy (8 SP) - START HERE
2. **Issue #107** - Let's Encrypt Integration (8 SP)
3. **Issue #109** - Custom Domain Configuration (5 SP)
4. **Issue #111** - TLS Best Practices (5 SP)
5. **Issue #113** - Domain Management API (8 SP)
6. **Issue #115** - TLS Integration Tests (5 SP)
7. **Issue #117** - TLS Documentation (3 SP)

### **Tech Stack**
- `caddy` - Reverse proxy with auto HTTPS
- `acme/lego` - Let's Encrypt client (if needed)
- Docker Compose for local testing

### **Success Criteria**
- [ ] Caddy container runs alongside gateway
- [ ] Auto HTTPS works for custom domains
- [ ] TLS 1.3 enforced, strong ciphers only
- [ ] API for adding/removing domains
- [ ] Tests: 80%+ coverage

### **Week-by-Week Plan**
- **Week 1**: Issues #105, #107 (Caddy + Let's Encrypt)
- **Week 2**: Issues #109, #111 (custom domains + TLS config)
- **Week 3**: Issues #113, #115, #117 (API + tests + docs)

---

## 🛠️ Setup Instructions

### **1. Clone & Install**
```bash
git clone https://github.com/ismail-kattakath/mcp-gateway.git
cd mcp-gateway
git checkout -b develop  # Create v3.0 branch

# Install dependencies
cd server && npm ci && cd ..
cd ui && npm ci && cd ..
```

### **2. Run Tests**
```bash
cd server && npm test
cd ui && npm test
```

### **3. Start Dev Environment**
```bash
# Terminal 1: Server
cd server && npm run dev

# Terminal 2: UI
cd ui && npm run dev
```

### **4. Create Your Feature Branch**
```bash
# Developer A
git checkout -b feat/epic-13-storage-layer

# Developer B
git checkout -b feat/epic-14-logging

# Developer C
git checkout -b feat/epic-27-tls
```

---

## 📝 Development Workflow

### **Daily**
1. Pull latest from `develop`
2. Work on current issue
3. Run tests locally
4. Commit with Conventional Commits (e.g., `feat(storage): add database schema`)
5. Push to your feature branch
6. Post standup update in Slack

### **Per Issue**
1. Move issue to "In Progress" on GitHub Projects
2. Create draft PR (mark as WIP)
3. Implement + tests
4. Mark PR as "Ready for Review"
5. Address review comments
6. Merge to `develop` (squash merge)
7. Close issue

### **Commit Message Format**
```
<type>(<scope>): <subject>

feat(storage): add SQLite schema for servers table
fix(logging): prevent log injection in server names
chore(deps): bump better-sqlite3 to 11.0.0
```

---

## 🔍 Code Review Checklist

Before submitting PR:
- [ ] Tests pass (`npm test`)
- [ ] Coverage ≥80% for new code
- [ ] Linting passes (`npm run lint`)
- [ ] TypeScript compiles (`npm run type-check`)
- [ ] Documentation updated (if API changes)
- [ ] No hardcoded secrets or API keys
- [ ] Security scan passes (CodeQL)

---

## 🚨 Getting Help

### **Stuck on an issue?**
1. Check the epic's agent prompt (`.github/agents/epic-X-prompt.md`)
2. Search existing code for patterns
3. Ask in #v3-dev Slack channel
4. Comment on the GitHub issue with specific question

### **Blocker?**
1. Post in #v3-dev with `@team-lead` mention
2. Document what you tried
3. Include error messages / logs
4. Suggest alternative approaches

### **Architecture question?**
1. Check `docs/ARCHITECTURE-V3.md` first
2. Post in #v3-architecture with context
3. Tag relevant epic (e.g., "re: Epic #13")

---

## 🎯 Week 1 Goals (Entire Team)

By end of Week 1, we should have:
- [x] All developers onboarded
- [x] Dev environments set up
- [x] First PRs submitted (even if small)
- [ ] **Developer A**: Issue #34 complete (database schema designed)
- [ ] **Developer B**: Issue #47 in progress (Winston/Pino benchmarked)
- [ ] **Developer C**: Issue #105 in progress (Caddy running locally)

**Team Standup**: Monday 9 AM, daily async updates in Slack

---

## 📊 Tracking Progress

### **GitHub Projects Board**
- Milestone: "v3.0 - Enterprise-Grade Gateway"
- Columns: Backlog → In Progress → Review → Done

### **Velocity Tracking**
- Target: 40 SP/week (team of 3)
- Reality check after Week 1

### **Burndown Chart**
- Updated daily by project manager
- Review weekly in demo meeting

---

## ✅ Definition of Done

An issue is "done" when:
- [ ] Code implemented and tested
- [ ] PR reviewed and approved
- [ ] Merged to `develop` branch
- [ ] Issue closed with "Completed" label
- [ ] Documentation updated (if needed)
- [ ] Demo recorded (for demo Friday)

---

**Good luck, team! You're building the foundation for something great.** 🚀

**Questions?** Drop them in #v3-dev on Slack!
