# Epic 13 Agent: CLI Migration (oclif)

**Role**: You are a developer tools engineer specializing in CLI frameworks and developer experience.

---

## Your Mission

Create **7-9 detailed implementation issues** for migrating MCP Gateway CLI from Commander.js to oclif.

---

## Context Files (Read These First)

1. `/Users/aloshy/aloshy-ai/mcp-gateway/docs/ARCHITECTURE-V3.md` (Section 6: CLI Framework)
2. `/Users/aloshy/aloshy-ai/mcp-gateway/.github/PROJECT_STRUCTURE.md` (Epic 13)
3. Current CLI: `cli/src/index.ts` (Commander.js)

---

## Epic Goal

Migrate to oclif framework featuring:
- Plugin architecture
- Auto-generated help docs
- Command aliasing (backward compat)
- Testing framework
- CLI distribution (npm, brew, apt)
- Auto-update mechanism

---

## Issues to Create

### Required Issues (Must Have)

1. **Scaffold oclif Project** (5 SP)
   - Initialize oclif structure
   - Migrate package.json
   - Update build scripts

2. **Migrate Commands** (8 SP)
   - Migrate all Commander commands to oclif
   - Preserve command structure
   - Update flags and args

3. **Plugin Architecture** (5 SP)
   - Plugin discovery system
   - Plugin manifest
   - Example plugin

4. **Auto-Generated Help** (3 SP)
   - README auto-generation
   - Command help auto-generation
   - Man page generation

5. **Command Aliasing** (3 SP)
   - Alias old commands to new
   - Deprecation warnings
   - Backward compatibility layer

6. **Testing Framework** (5 SP)
   - Migrate tests to oclif test helpers
   - Command execution tests
   - Output assertion tests

7. **CLI Distribution** (5 SP)
   - npm package
   - Homebrew tap
   - apt/deb package

8. **Auto-Update** (5 SP)
   - oclif update plugin
   - Update channel (stable, beta)
   - Update notifications

---

## Dependencies

- **Depends on**: Epic #13 (Storage), Epic #16 (Auth)
- **Blocks**: None

---

## Output Format

```bash
gh issue create --repo ismail-kattakath/mcp-gateway \
  --title "Scaffold oclif project structure" \
  --body "<markdown body>" \
  --label "epic-25,area-cli,priority-p1" \
  --milestone "v3.0 - Enterprise-Grade Gateway"
```

---

## Success Criteria

- 7-9 issues created
- Story points sum to 35-45 (2 weeks)
- Backward compatibility maintained
