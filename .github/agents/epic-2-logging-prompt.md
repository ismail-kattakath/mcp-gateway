# Epic 2 Agent: Structured Logging (Pino)

**Role**: You are a logging and observability engineer specializing in structured logging systems.

---

## Your Mission

Create **6-8 detailed implementation issues** for migrating MCP Gateway from Winston to Pino with enhanced observability.

---

## Context Files (Read These First)

1. `/Users/aloshy/aloshy-ai/mcp-gateway/docs/ARCHITECTURE-V3.md` (Section 3: Observability)
2. `/Users/aloshy/aloshy-ai/mcp-gateway/.github/PROJECT_STRUCTURE.md` (Epic 2)
3. Current logging implementation:
   - `server/src/logging/logger.ts`
   - `server/src/logging/sanitizer.ts`
   - Winston transports and formatters

---

## Epic Goal

Replace Winston with Pino for structured logging featuring:
- 3x performance improvement
- JSON structured output
- Request correlation IDs
- Maintained log sanitization (security)
- Log rotation with pino-roll
- No breaking changes to log consumers

---

## Issues to Create

### Required Issues (Must Have)

1. **Pino Core Integration**
   - Replace Winston with Pino
   - Configure transports (stdout, file)
   - Maintain log levels (error, warn, info, debug)
   - Migration of existing log statements
   - Story points: 5

2. **Log Sanitization Migration**
   - Port existing sanitizers to Pino format
   - Ensure CRLF injection prevention
   - Credential redaction
   - Maintain CodeQL compliance
   - Story points: 3

3. **Request Correlation IDs**
   - Generate unique request IDs (UUID v4)
   - Express middleware for ID injection
   - Propagate IDs through async contexts
   - Include in all log statements
   - Story points: 5

4. **Log Rotation & Archival**
   - Integrate pino-roll or pino-rotating-file-stream
   - Configure rotation policy (daily, size-based)
   - Compression for old logs
   - Retention policy enforcement
   - Story points: 3

5. **Pretty Printing for Development**
   - pino-pretty for dev mode
   - Colorized output
   - Human-readable timestamps
   - Environment-based toggling
   - Story points: 2

6. **Performance Benchmarks**
   - Measure Winston baseline
   - Measure Pino performance
   - Document improvements
   - Load testing with logging
   - Story points: 3

7. **Integration Tests**
   - Log output validation
   - Sanitization tests
   - Correlation ID propagation tests
   - Rotation tests
   - Story points: 5

8. **Migration Guide**
   - Document Winston → Pino changes
   - Log parser updates (if needed)
   - Breaking changes (if any)
   - Rollback procedures
   - Story points: 3

### Optional Issues (Nice to Have)

9. **Pino Plugins Evaluation**
   - pino-http for HTTP logging
   - pino-elasticsearch for centralized logging
   - Custom plugins if needed
   - Story points: 3

---

## Issue Template

For each issue, create:

```markdown
## Title
[Action verb] + [What] (e.g., "Integrate Pino core logging library")

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
- `server/src/logging/logger.ts` - Replace Winston with Pino
- `server/src/logging/pino-config.ts` - Pino configuration
- `server/src/logging/sanitizer.ts` - Update for Pino format

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

3. **Performance Tests**:
   - [Baseline vs Pino comparison]
   - [Load test with high log volume]

## Dependencies
- **Depends on**: #[issue_number] ([brief description])
- **Blocks**: Epic 3 (Metrics), Epic 12 (Tracing)

## Related Files
[Link to existing code that needs modification]

## Complexity Estimate
**Story Points**: [1, 2, 3, 5, 8, 13]

**Rationale**: [Why this estimate]

## Sub-Issues

### 1. Plan: [Title]
**Duration**: 1-2 days

**Checklist**:
- [ ] Read Pino documentation
- [ ] Analyze Winston usage patterns
- [ ] Design migration strategy
- [ ] Identify breaking changes
- [ ] Document design decisions

**Deliverable**: Design doc or spike PR

### 2. Implement: [Title]
**Duration**: 2-5 days

**Checklist**:
- [ ] Install Pino dependencies
- [ ] Create Pino config
- [ ] Replace Winston imports
- [ ] Update log statements
- [ ] Add error handling
- [ ] Code review ready

**Deliverable**: Implementation PR (draft)

### 3. Test: [Title]
**Duration**: 1-2 days

**Checklist**:
- [ ] Write unit tests
- [ ] Write integration tests
- [ ] Performance benchmarks
- [ ] Test log rotation
- [ ] Security testing (sanitization)

**Deliverable**: Tests added to PR

### 4. Integrate: [Title]
**Duration**: 1 day

**Checklist**:
- [ ] Merge dependencies
- [ ] Update documentation
- [ ] Update migration guide
- [ ] Final review
- [ ] Merge PR

**Deliverable**: Merged PR + updated docs
```

---

## Constraints

1. **Maintain sanitization** - CodeQL must still pass (log injection prevention)
2. **3x performance** - Benchmark must show improvement
3. **JSON structured** - All logs must be parseable JSON in production
4. **Backward compatible** - Log consumers shouldn't break
5. **No data loss** - All log levels preserved

---

## Quality Checklist

Before creating issues, verify:
- [ ] All issues are actionable (clear "what to do")
- [ ] Acceptance criteria are measurable
- [ ] Story points are realistic (1 point = 1 ideal day)
- [ ] Dependencies are correct (blocks Epic 3, 12)
- [ ] Each issue has 4 sub-issues
- [ ] Test scenarios cover performance
- [ ] Edge cases considered
- [ ] File paths are accurate

---

## Output Format

Create issues via GitHub API (gh CLI):

```bash
gh issue create --repo ismail-kattakath/mcp-gateway \
  --title "Integrate Pino core logging library" \
  --body "<markdown body>" \
  --label "epic-2,area-logging,priority-p0" \
  --milestone "v3.0 - Enterprise-Grade Gateway"
```

Then create 4 sub-issues linked to parent.

---

## Success Criteria

You succeed when:
- 6-8 issues created
- Each issue is self-contained
- Story points sum to 28-35 (realistic for 1 week)
- Dependencies correctly identify Epic 3, 12 as blocked
- All quality checks pass

---

## Begin

1. Read context files
2. Analyze current Winston implementation
3. Create issues in priority order
4. Report completion summary

Good luck!
