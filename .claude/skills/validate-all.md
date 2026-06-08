---
name: validate-all
description: "Spawn a master background agent that orchestrates all MCP Gateway validation tasks (tests, Docker, pre-commit hooks) in parallel. Use before pushing changes to ensure everything works locally."
---

# validate-all

Spawn a master background agent that orchestrates all MCP Gateway validation tasks before pushing changes.

## What it does

Launches a lead background agent that:
1. Spawns 3 validation sub-agents in parallel:
   - `/validate-tests` — Full test suite validation (server + UI)
   - `/validate-docker` — Docker build and runtime validation  
   - `/validate-precommit` — Pre-commit hooks validation
2. Monitors all sub-agents and collects their results
3. Waits for all validations to complete
4. Reports back with consolidated summary showing:
   - Which validations passed/failed
   - Detailed findings from each validation
   - Overall readiness status for pushing changes
   - Any issues that need attention

The master agent coordinates everything and provides a single consolidated report.

## Usage

```
/validate-all
```

No arguments needed - the master agent will orchestrate all validations automatically.

## When to use

- **Before pushing any changes** — Ensures everything works locally first
- **After security hardening** — Validates CodeQL fixes don't break functionality
- **Before creating/updating PRs** — Catches issues before CI/CD
- **As part of release checklist** — Final validation before merging release PR
- **After dependency updates** — Verifies no regressions introduced
- **After modifying Dockerfile** — Ensures container still builds correctly

## Output

The master agent will interrupt you with a consolidated summary like:

```
✅ VALIDATION COMPLETE - ALL SYSTEMS GO

Test Suite Validation: ✅ PASSED
  - Server: 124 tests passing, 77% coverage
  - UI: All tests passing
  - Zero flaky tests
  - Execution time: <5s

Docker Validation: ✅ PASSED  
  - Build successful (multi-stage)
  - Container runtime verified (stdio + HTTP)
  - Health endpoint responding
  - Build time: 2m 15s

Pre-commit Hooks: ⚠️ PARTIAL
  - ESLint auto-fix working correctly
  - Prettier format working correctly
  - TypeScript type-check has known monorepo limitation
    (CI handles this with full type-check)

Overall Status: READY TO PUSH ✅

All critical validations passed. The type-check limitation in pre-commit
hooks is expected and covered by CI enforcement.
```

## Implementation

```agent
{
  "subagent_type": "general-purpose",
  "description": "MCP Gateway master validation orchestrator",
  "run_in_background": true,
  "prompt": "You are the MASTER VALIDATION AGENT for MCP Gateway. Your mission is to orchestrate comprehensive local validation before changes are pushed.\n\n## Working Directory\nYou are in /Users/aloshy/aloshy-ai/mcp-gateway\n\n## Your Responsibilities\n\n1. **Spawn 3 validation sub-agents in parallel** using the Agent tool (all in a single message with 3 Agent tool calls):\n   - Test suite validation agent\n   - Docker build validation agent\n   - Pre-commit hooks validation agent\n\n2. **Monitor all sub-agents** as they complete and collect their results\n\n3. **Create consolidated summary** with:\n   - Pass/fail status for each validation\n   - Key metrics (test count, coverage, build time)\n   - Any warnings or issues discovered\n   - Overall readiness assessment\n\n4. **Report back** with clear, actionable summary\n\n## Sub-Agent Configurations\n\n### Test Suite Validation Agent\n```json\n{\n  \"subagent_type\": \"general-purpose\",\n  \"description\": \"MCP Gateway test suite validation\",\n  \"run_in_background\": true,\n  \"prompt\": \"Run full MCP Gateway test suite locally in /loop until all pass:\\n\\nWorking directory: /Users/aloshy/aloshy-ai/mcp-gateway\\n\\n1. Server tests: `cd server && npm run test:coverage`\\n   - Expected: 124+ tests passing\\n   - Coverage target: 77%+\\n   - Key tests: sanitization (32), auth, security, validation\\n\\n2. UI tests: `cd ui && npm run test:coverage`\\n   - Expected: All React component tests passing\\n\\n3. If any test fails, troubleshoot and fix in /loop\\n\\n4. Run 3 times to ensure no flaky tests (important for async MCP protocol tests)\\n\\n5. Report:\\n   - Total tests passed (server + UI)\\n   - Coverage percentages\\n   - Flaky tests (if any)\\n   - Execution time\\n   - Any issues\\n\\nDo NOT push any changes. Just validate and fix locally.\"\n}\n```\n\n### Docker Validation Agent\n```json\n{\n  \"subagent_type\": \"general-purpose\",\n  \"description\": \"MCP Gateway Docker validation\",\n  \"run_in_background\": true,\n  \"prompt\": \"Validate MCP Gateway Docker build and runtime in /loop until successful:\\n\\nWorking directory: /Users/aloshy/aloshy-ai/mcp-gateway\\n\\n1. Build: `docker build -t mcp-gateway:local-test .`\\n\\n2. Test HTTP mode: Run detached on port 3001 with GATEWAY_TRANSPORT=http\\n\\n3. Test health endpoint: `curl http://localhost:3001/health`\\n   - Should return: {\\\"status\\\":\\\"ok\\\"}\\n\\n4. Test stdio mode: Run with initialize request\\n   - This is the default mode for Claude Code/Desktop\\n\\n5. Check logs for errors\\n\\n6. If any step fails, troubleshoot and fix in /loop\\n\\n7. Run full test sequence 2 times to ensure stability\\n\\n8. Cleanup test containers\\n\\n9. Report:\\n   - Build time\\n   - Image size\\n   - Container startup time\\n   - Health check result\\n   - Stdio mode result\\n   - Any issues\\n\\nDo NOT push any changes. Just validate and fix locally.\"\n}\n```\n\n### Pre-commit Hooks Validation Agent\n```json\n{\n  \"subagent_type\": \"general-purpose\",\n  \"description\": \"MCP Gateway pre-commit hooks validation\",\n  \"run_in_background\": true,\n  \"prompt\": \"Validate MCP Gateway pre-commit hooks in /loop:\\n\\nWorking directory: /Users/aloshy/aloshy-ai/mcp-gateway\\n\\n1. Check `.husky/pre-commit` exists and is executable\\n\\n2. Check root `package.json` has lint-staged configuration for server/ and ui/\\n\\n3. Create test commits to trigger hooks:\\n   - Test with clean code (should pass)\\n   - Test with ESLint errors (should auto-fix or block)\\n   - Test with formatting errors (should auto-fix)\\n   - Test with TypeScript errors (should block, or document if monorepo limitation exists)\\n\\n4. Verify hooks run:\\n   - ESLint fix (cd server && npm run lint:fix)\\n   - Prettier format (cd server && npm run format)\\n   - TypeScript check (cd server && npm run type-check)\\n\\n5. If hooks don't run or fail unexpectedly, troubleshoot and fix in /loop\\n\\n6. Cleanup all test commits (git reset)\\n\\n7. Report:\\n   - Hooks status (installed, executable, configured)\\n   - What checks run (lint, format, type-check)\\n   - What errors hooks catch\\n   - Any known limitations (type-check monorepo issue)\\n   - Are hooks effective?\\n\\nDo NOT push test commits. Clean up all changes.\"\n}\n```\n\n## Execution Steps\n\n1. **Launch all 3 sub-agents in parallel** (use 3 Agent tool calls in a single message for optimal speed)\n\n2. **Wait for completion notifications** from all agents\n   - You will be notified when each agent finishes\n   - Do NOT poll or check status manually\n   - Continue with consolidation only after all 3 complete\n\n3. **Parse each agent's summary** to extract:\n   - Pass/fail status\n   - Key metrics (test count, coverage, build time, etc.)\n   - Issues or warnings\n   - Action items (if any)\n\n4. **Create formatted consolidated report:**\n   ```\n   # MCP GATEWAY VALIDATION SUMMARY\n   \n   ## Test Suite: [✅ PASSED | ❌ FAILED | ⚠️ PARTIAL]\n   [Key metrics: tests, coverage, flaky tests, time]\n   [Issues/warnings if any]\n   \n   ## Docker Build: [✅ PASSED | ❌ FAILED | ⚠️ PARTIAL]\n   [Key metrics: build time, image size, health check]\n   [Issues/warnings if any]\n   \n   ## Pre-commit Hooks: [✅ PASSED | ❌ FAILED | ⚠️ PARTIAL]\n   [What works: lint, format, type-check status]\n   [Known limitations if any]\n   \n   ## Overall Assessment\n   [READY TO PUSH ✅ | ISSUES TO ADDRESS ❌]\n   \n   [Specific action items if any validations failed]\n   ```\n\n5. **Include context for known limitations:**\n   - If type-check limitation exists in pre-commit hooks, explain it's covered by CI\n   - If any validation has expected warnings, explain why they're acceptable\n\n## Important\n\n- DO spawn sub-agents in parallel for speed (3 Agent calls in 1 message)\n- DO wait for ALL agents to complete before consolidating\n- DO provide actionable recommendations if any validation fails\n- DO explain known limitations with context (e.g., \"covered by CI\")\n- DON'T push any changes yourself\n- DON'T skip reporting if some validations fail — that's when reporting matters most\n- DON'T mark overall status as READY if critical validations fail\n\n## Success Criteria\n\nMark as **READY TO PUSH ✅** if:\n- All tests passing (no flaky tests)\n- Docker builds and runs successfully\n- Pre-commit hooks working (ESLint + Prettier at minimum)\n\nMark as **ISSUES TO ADDRESS ❌** if:\n- Any tests failing consistently\n- Docker build/runtime errors\n- Pre-commit hooks not running at all\n\nMark as **PARTIAL ⚠️** for individual validations if:\n- Type-check limitation in pre-commit (acceptable, covered by CI)\n- Minor warnings that don't block functionality\n\nYour final report should clearly answer: \"Is it safe to push these changes?\""
}
```

## Benefits

- **Parallel execution** — All validations run simultaneously (~same time as longest validation)
- **Comprehensive coverage** — Tests, Docker, and hooks all validated
- **Single consolidated report** — No need to check 3 separate outputs
- **Actionable feedback** — Clear pass/fail with specific issues
- **Prevents CI failures** — Catches issues locally before pushing
- **Context for limitations** — Explains expected warnings (type-check, etc.)

## Expected Validation Times

- **Test Suite:** ~5-10 seconds (3 runs for flaky test detection)
- **Docker:** ~2-3 minutes (build + runtime tests)
- **Pre-commit Hooks:** ~30-60 seconds (test with various code issues)

**Total (parallel):** ~2-3 minutes

## Notes

The master agent will automatically handle sub-agent failures and provide clear remediation steps. If any validation fails, the consolidated report will include specific instructions for fixing the issues. Known limitations (like type-check in monorepo) are explained with context that they're covered by CI enforcement.
