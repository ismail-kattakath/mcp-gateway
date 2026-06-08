---
name: validate-tests
description: "Spawn a background agent to run the full MCP Gateway test suite (server + UI, 124+ tests, 77%+ coverage) locally in a loop until all pass. Detects flaky tests by running 3 times."
---

# validate-tests

Spawn a background agent to run the full MCP Gateway test suite locally in a loop until all tests pass.

## What it does

Launches a background agent that:
1. Runs server tests: `cd server && npm run test:coverage`
2. Runs UI tests: `cd ui && npm run test:coverage`
3. Troubleshoots and fixes any failures in /loop
4. Runs 3 times to ensure no flaky tests (especially important for async MCP protocol tests)
5. Reports: total tests (124+), coverage (target 77%+), flaky tests (if any), execution time
6. Validates all sanitization tests pass (32 tests in `server/src/__tests__/logging/sanitizer.test.ts`)

The agent works independently and will notify you when done.

## Usage

```
/validate-tests
```

No arguments needed - the agent will run the full test suite validation automatically.

## When to use

- Before pushing security-related changes (sanitization, auth, validation)
- After modifying MCP protocol handlers or backend adapters
- To verify test stability and absence of flaky tests
- As part of pre-push validation workflow
- After enterprise hardening or CodeQL remediation

## Expected Results

**Server:**
- 124+ tests passing (Vitest)
- 77%+ coverage
- All sanitization tests (32 tests) passing
- All security tests passing (API key generation, auth middleware)
- Execution time: <5s

**UI:**
- All React component tests passing
- Dashboard rendering tests passing

## Implementation

```agent
{
  "subagent_type": "general-purpose",
  "description": "MCP Gateway test suite validation",
  "run_in_background": true,
  "prompt": "Run full MCP Gateway test suite locally in /loop until all pass:\n\n## Working Directory\nYou are in /Users/aloshy/aloshy-ai/mcp-gateway\n\n## Tasks\n\n1. **Server tests:** `cd server && npm run test:coverage`\n   - Expected: 124+ tests passing\n   - Coverage target: 77%+\n   - Key test groups:\n     * 32 sanitization tests (sanitizer.test.ts)\n     * Auth middleware tests (Bearer token, IP allowlist)\n     * Registry validation tests\n     * Security tests (API key generation, secure storage)\n\n2. **UI tests:** `cd ui && npm run test:coverage`\n   - Expected: All React component tests passing\n\n3. **If any test fails:**\n   - Read the test file to understand what's being tested\n   - Check if it's a legitimate failure or environmental issue\n   - Fix the code (not the test) if it's a real bug\n   - Re-run tests\n\n4. **Run 3 times** to ensure no flaky tests\n   - MCP protocol tests involve async operations and stdio streams\n   - Sanitization tests must be 100% deterministic\n\n5. **Report final status:**\n   - Total tests passed\n   - Coverage percentage for server and UI\n   - Any flaky tests detected (failed on some runs but not others)\n   - Execution time\n   - Any warnings or issues\n\n## Important\n\n- DO NOT push any changes\n- DO fix legitimate test failures by fixing the code\n- DO report if tests are consistently failing (might indicate real bugs)\n- DON'T skip flaky test detection - run 3 times\n- DON'T modify tests to make them pass - fix the implementation\n\nYour goal is to validate test suite stability and catch any issues before pushing."
}
```

## Known Test Categories

**Server tests:**
- `__tests__/logging/sanitizer.test.ts` — 32 tests for control char removal, path traversal prevention, URL sanitization
- `__tests__/middleware/auth.test.ts` — Bearer token validation, IP allowlist, constant-time comparison
- `__tests__/security/apikey.test.ts` — Crypto.randomBytes usage, key length, storage
- `__tests__/security/secure-storage.test.ts` — Keychain integration
- `__tests__/validation/registry-validator.test.ts` — Schema validation, semantic checks

**UI tests:**
- Component rendering tests
- Dashboard integration tests
- React Query integration tests
