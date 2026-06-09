# Epic 1 Agent: Storage Layer Migration

**Role**: You are a database architect and storage engineer specializing in SQLite and encryption.

---

## Your Mission

Create **8-12 detailed implementation issues** for migrating MCP Gateway from `registry.json` to SQLite with field-level encryption.

---

## Context Files (Read These First)

1. `/Users/aloshy/aloshy-ai/mcp-gateway/docs/ARCHITECTURE-V3.md` (Section 4: Storage)
2. `/Users/aloshy/aloshy-ai/mcp-gateway/.github/PROJECT_STRUCTURE.md` (Epic 1)
3. Current storage implementation:
   - `server/src/mcp/registry.ts`
   - `server/src/types/registry.d.ts`
   - `schema/registry-v2.schema.json`

---

## Epic Goal

Replace JSON file storage with SQLite database featuring:
- Field-level AES-256-GCM encryption for secrets
- Auto-migration from v2.x registry.json
- Backward-compatible storage abstraction layer
- Backup/restore tooling
- No breaking changes to API/CLI

---

## Issues to Create

### Required Issues (Must Have)

1. **Database Schema Design**
   - Design tables for servers, auth, settings, audit_log
   - Define indexes for performance
   - Plan encryption strategy (which fields)
   - Story points: 3

2. **Field-Level Encryption Helper**
   - Implement AES-256-GCM encryption/decryption
   - Key management (keytar + env var fallback)
   - Secure key storage in keychain
   - Docker compatibility
   - Story points: 5

3. **Storage Abstraction Layer (DAO Pattern)**
   - Create `IStorage` interface
   - Implement `SQLiteStorage` class
   - Implement `JSONStorage` class (legacy compat)
   - Factory pattern for storage selection
   - Story points: 8

4. **SQLite Integration**
   - Add `better-sqlite3` dependency
   - Database initialization
   - Connection pooling
   - Error handling
   - Story points: 3

5. **Auto-Migration from registry.json**
   - Detect v2.x registry.json
   - Parse and validate
   - Transform to SQLite schema
   - Encrypt sensitive fields
   - Create backup before migration
   - Story points: 8

6. **Server CRUD Operations**
   - Create server
   - Read server (get, list, filter)
   - Update server
   - Delete server with cascade
   - Transaction support
   - Story points: 5

7. **Settings Management**
   - Migrate `.mcp-gateway.json` to settings table
   - CRUD operations for settings
   - Encrypted settings support
   - Story points: 3

8. **Backup & Restore Tooling**
   - CLI command: `mcp db backup`
   - CLI command: `mcp db restore`
   - Encrypted backup support
   - Validation on restore
   - Story points: 5

9. **Integration Tests**
   - CRUD operation tests
   - Migration tests (v2.x → v3.0)
   - Encryption/decryption tests
   - Transaction tests
   - Performance benchmarks
   - Story points: 8

10. **API/CLI Updates**
    - Update REST API to use SQLiteStorage
    - Update CLI commands to use SQLiteStorage
    - Remove registry.json dependencies
    - Story points: 5

### Optional Issues (Nice to Have)

11. **Database Migrations Framework**
    - Versioned schema migrations
    - Up/down migration support
    - Migration history table
    - Story points: 5

12. **Query Builder / ORM**
    - Evaluate Kysely, Drizzle, or Prisma
    - Implement if beneficial
    - Type-safe queries
    - Story points: 8

---

## Issue Template

For each issue, create:

```markdown
## Title
[Action verb] + [What] (e.g., "Implement field-level encryption helper")

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
- `server/src/storage/interface.ts` - Define IStorage interface
- `server/src/storage/sqlite.ts` - SQLiteStorage implementation
- `server/src/storage/encryption.ts` - Encryption helper

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
   - [Encryption strength]
   - [Key rotation]

## Dependencies
- **Depends on**: #[issue_number] ([brief description])
- **Blocks**: #[issue_number] ([brief description])

## Related Files
[Link to existing code that needs modification]

## Complexity Estimate
**Story Points**: [1, 2, 3, 5, 8, 13]

**Rationale**: [Why this estimate]

## Sub-Issues

### 1. Plan: [Title]
**Duration**: 1-2 days

**Checklist**:
- [ ] Read existing code
- [ ] Research best practices
- [ ] Design approach
- [ ] Spike/prototype if needed
- [ ] Document design decisions

**Deliverable**: Design doc or spike PR

### 2. Implement: [Title]
**Duration**: 2-5 days

**Checklist**:
- [ ] Create new files
- [ ] Modify existing files
- [ ] Add error handling
- [ ] Add logging
- [ ] Code review ready

**Deliverable**: Implementation PR (draft)

### 3. Test: [Title]
**Duration**: 1-2 days

**Checklist**:
- [ ] Write unit tests
- [ ] Write integration tests
- [ ] Achieve 77%+ coverage
- [ ] Test edge cases
- [ ] Security testing

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

1. **Keep SQLite** - Don't suggest PostgreSQL/MySQL
2. **Field-level encryption** - Not full-DB encryption (SQLCipher)
3. **Backward compatibility** - v2.x API keys must work
4. **No data loss** - Migration must be lossless
5. **Docker friendly** - Encryption key via env var

---

## Quality Checklist

Before creating issues, verify:
- [ ] All issues are actionable (clear "what to do")
- [ ] Acceptance criteria are measurable
- [ ] Story points are realistic (1 point = 1 ideal day)
- [ ] Dependencies are correct
- [ ] Each issue has 4 sub-issues
- [ ] Test scenarios cover security
- [ ] Edge cases considered
- [ ] File paths are accurate

---

## Output Format

Create issues via GitHub API (gh CLI):

```bash
gh issue create --repo ismail-kattakath/mcp-gateway \
  --title "Implement field-level encryption helper" \
  --body "<markdown body>" \
  --label "epic-1,area-storage,priority-p0" \
  --milestone "v3.0 - Enterprise-Grade Gateway"
```

Then create 4 sub-issues linked to parent.

---

## Success Criteria

You succeed when:
- 8-12 issues created
- Each issue is self-contained
- Story points sum to 40-60 (realistic for 2 weeks)
- Dependencies form a valid DAG
- All quality checks pass

---

## Begin

1. Read context files
2. Analyze current implementation
3. Create issues in priority order
4. Report completion summary

Good luck!
