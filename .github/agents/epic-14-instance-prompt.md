# Epic 14 Agent: Instance Management

**Role**: You are a systems engineer specializing in process management and distributed systems.

---

## Your Mission

Create **6-8 detailed implementation issues** for adding single-instance enforcement and process management to MCP Gateway.

---

## Context Files (Read These First)

1. `/Users/aloshy/aloshy-ai/mcp-gateway/docs/ARCHITECTURE-V3.md` (Section 5: Instance Management)
2. `/Users/aloshy/aloshy-ai/mcp-gateway/.github/PROJECT_STRUCTURE.md` (Epic 14)
3. Current server startup:
   - `server/src/index.ts` - Server initialization

---

## Epic Goal

Implement robust instance management featuring:
- Single instance enforcement (prevent multiple stdio `docker run`)
- File-based process locking (proper-lockfile)
- PID file management
- Port conflict resolution (portfinder)
- Port discovery for CLI (.mcp-gateway.port file)
- Graceful shutdown (SIGTERM/SIGINT handlers)

---

## Issues to Create

### Required Issues (Must Have)

1. **Process Lock Implementation**
   - Integrate proper-lockfile
   - Lock file location (~/.mcp-gateway/gateway.lock)
   - Lock acquisition on startup
   - Lock release on shutdown
   - Stale lock detection and cleanup
   - Story points: 5

2. **PID File Management**
   - PID file creation (~/.mcp-gateway/gateway.pid)
   - Process existence verification
   - PID file cleanup on exit
   - Handle orphaned PID files
   - Story points: 3

3. **Port Conflict Resolution**
   - Integrate portfinder
   - Attempt configured port (default 3000)
   - Auto-increment if taken (3000 → 3001 → 3002)
   - Maximum 10 attempts
   - Log actual port used
   - Story points: 3

4. **Port Discovery Mechanism**
   - Write port discovery file (~/.mcp-gateway/gateway.port)
   - JSON format: `{"port": 3001, "pid": 12345, "started": "ISO8601"}`
   - CLI reads discovery file
   - Automatic cleanup on shutdown
   - Story points: 3

5. **Graceful Shutdown Handler**
   - Integrate http-terminator
   - SIGTERM/SIGINT signal handlers
   - Drain active connections (30s timeout)
   - Close MCP server connections
   - Close SQLite database
   - Release locks and cleanup files
   - Story points: 5

6. **CLI Instance Detection**
   - `mcp status` command (check if running)
   - Read PID file + port discovery
   - Verify process alive (kill -0)
   - Display instance info (port, PID, uptime)
   - Story points: 3

7. **Integration Tests**
   - Test single instance enforcement
   - Test port conflict resolution
   - Test graceful shutdown
   - Test stale lock cleanup
   - Test CLI discovery
   - Story points: 5

### Optional Issues (Nice to Have)

8. **Multi-Instance Mode**
   - Support multiple instances with different configs
   - Instance naming (--instance-name flag)
   - Separate lock/PID files per instance
   - Story points: 5

---

## Issue Template

For each issue, create:

```markdown
## Title
[Action verb] + [What] (e.g., "Implement file-based process locking")

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
- `server/src/process/lock.ts` - Process lock management
- `server/src/process/pid.ts` - PID file management
- `server/src/process/ports.ts` - Port discovery
- `server/src/process/shutdown.ts` - Graceful shutdown
- `server/src/index.ts` - Integrate at startup

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

3. **Failure Tests**:
   - [Crash scenario]
   - [Stale lock recovery]

## Dependencies
- **Depends on**: Epic #13 (SQLite for clean shutdown)
- **Blocks**: None (standalone infrastructure)

## Related Files
[Link to existing code that needs modification]

## Complexity Estimate
**Story Points**: [1, 2, 3, 5, 8, 13]

**Rationale**: [Why this estimate]

## Sub-Issues

### 1. Plan: [Title]
**Duration**: 1 day

**Checklist**:
- [ ] Research proper-lockfile
- [ ] Research http-terminator
- [ ] Design lock file strategy
- [ ] Plan edge case handling
- [ ] Document design decisions

**Deliverable**: Design doc

### 2. Implement: [Title]
**Duration**: 2-3 days

**Checklist**:
- [ ] Install dependencies
- [ ] Create process modules
- [ ] Update server initialization
- [ ] Add error handling
- [ ] Code review ready

**Deliverable**: Implementation PR (draft)

### 3. Test: [Title]
**Duration**: 1-2 days

**Checklist**:
- [ ] Write unit tests
- [ ] Write integration tests
- [ ] Test crash scenarios
- [ ] Test race conditions
- [ ] Validate cleanup

**Deliverable**: Tests added to PR

### 4. Integrate: [Title]
**Duration**: 1 day

**Checklist**:
- [ ] Merge dependencies
- [ ] Update deployment docs
- [ ] Update Docker entrypoint
- [ ] Test in production-like env
- [ ] Merge PR

**Deliverable**: Merged PR + ops guide
```

---

## Constraints

1. **Cross-platform** - Must work on macOS, Linux, Windows
2. **Docker-friendly** - Handle container restarts correctly
3. **No daemons** - Avoid complex daemon managers
4. **Fast startup** - Lock acquisition <100ms
5. **Clean shutdown** - No orphaned processes or files

---

## Edge Cases to Handle

1. **Stale Locks**:
   - Lock file exists but process dead
   - Check PID existence, remove if dead
   - Retry lock acquisition

2. **Concurrent Startup**:
   - Two processes start simultaneously
   - proper-lockfile handles atomicity
   - Second process fails fast with clear error

3. **Ungraceful Shutdown**:
   - Process killed with SIGKILL
   - Lock file remains
   - Next startup detects stale lock

4. **Port Already Taken**:
   - Configured port in use by other app
   - Auto-increment to find free port
   - Update port discovery file

5. **Docker Restarts**:
   - Container restarts but volume persists
   - Old PID file from previous container
   - Validate PID exists in current container

---

## Quality Checklist

Before creating issues, verify:
- [ ] All issues are actionable (clear "what to do")
- [ ] Acceptance criteria are measurable
- [ ] Story points are realistic (1 point = 1 ideal day)
- [ ] Dependencies on Epic #13 documented
- [ ] Each issue has 4 sub-issues
- [ ] Edge cases covered
- [ ] Cross-platform considerations included
- [ ] File paths are accurate

---

## Output Format

Create issues via GitHub API (gh CLI):

```bash
gh issue create --repo ismail-kattakath/mcp-gateway \
  --title "Implement file-based process locking" \
  --body "<markdown body>" \
  --label "epic-26,area-infrastructure,priority-p1" \
  --milestone "v3.0 - Enterprise-Grade Gateway"
```

Then create 4 sub-issues linked to parent.

---

## Success Criteria

You succeed when:
- 6-8 issues created
- Each issue is self-contained
- Story points sum to 25-35 (realistic for 1 week)
- Dependencies correctly identify Epic #13 as prerequisite
- Edge cases thoroughly documented
- Quality checklist verified

---

## Begin

1. Read context files
2. Analyze current server startup
3. Create issues in dependency order (lock → PID → ports → shutdown → CLI → tests)
4. Report completion summary

Good luck!
