---
name: validate-precommit
description: "Spawn a background agent to validate MCP Gateway pre-commit hooks (ESLint, Prettier, TypeScript) by creating test commits with clean and broken code."
---

# validate-precommit

Spawn a background agent to validate MCP Gateway pre-commit hooks are running properly in a loop.

## What it does

Launches a background agent that:
1. Checks `.husky/pre-commit` exists and is executable
2. Verifies root `package.json` has lint-staged configuration for both `server/` and `ui/`
3. Creates test commits to trigger hooks
4. Verifies hooks run: ESLint fix, Prettier format, TypeScript type-check
5. Tests with intentionally broken code to ensure hooks catch errors
6. Troubleshoots and fixes any issues in /loop
7. Reports final status: which checks run, what they catch, any limitations

The agent works independently and will notify you when done.

## Usage

```
/validate-precommit
```

No arguments needed - the agent will run the full pre-commit validation automatically.

## When to use

- After setting up or modifying husky/lint-staged configuration
- To verify hooks are properly catching errors before commits
- As part of pre-push validation workflow
- When troubleshooting why hooks aren't running
- After updating ESLint, Prettier, or TypeScript configs

## Known Limitations

TypeScript `type-check` in lint-staged has a known limitation in monorepos due to stash/restore timing issues. The hooks work reliably for ESLint and Prettier, but type-checking is also enforced by CI (`ci.yml` workflow runs `npm run type-check`).

## Expected Behavior

**Hooks should run on commit and execute:**

For `server/src/**/*.{ts,tsx}` files:
1. `cd server && npm run lint:fix` — Auto-fix ESLint issues
2. `cd server && npm run format` — Prettier formatting
3. `cd server && npm run type-check` — TypeScript validation

For `ui/src/**/*.{ts,tsx}` files:
1. `cd ui && npm run lint:fix` — Auto-fix ESLint issues
2. `cd ui && npm run format` — Prettier formatting
3. `cd ui && npm run type-check` — TypeScript validation

**Hooks should catch:**
- ESLint violations (unused imports, missing semicolons, etc.)
- Prettier formatting issues (indentation, line length, etc.)
- TypeScript errors (type mismatches, missing imports, etc.)

## Implementation

```agent
{
  "subagent_type": "general-purpose",
  "description": "MCP Gateway pre-commit hooks validation",
  "run_in_background": true,
  "prompt": "Validate MCP Gateway pre-commit hooks in /loop:\n\n## Working Directory\nYou are in /Users/aloshy/aloshy-ai/mcp-gateway\n\n## Tasks\n\n1. **Check hook files exist:**\n   ```bash\n   ls -la .husky/pre-commit\n   cat .husky/pre-commit\n   ```\n   - Should contain `npx lint-staged`\n   - Should be executable (chmod +x)\n\n2. **Check lint-staged configuration:**\n   ```bash\n   cat package.json | grep -A 20 'lint-staged'\n   ```\n   - Should have entries for `server/src/**/*.{ts,tsx}`\n   - Should have entries for `ui/src/**/*.{ts,tsx}`\n   - Each should run: lint:fix, format, type-check\n\n3. **Test hooks with clean code:**\n   ```bash\n   # Make a trivial change to server\n   cd server/src\n   echo '// Test comment' >> logging/logger.ts\n   git add logging/logger.ts\n   git commit -m 'test: trigger pre-commit hooks'\n   ```\n   - Hooks should run automatically\n   - Should see output like:\n     * \"Running tasks for staged files\"\n     * \"✔ server/src/**/*.{ts,tsx}\"\n     * \"✔ cd server && npm run lint:fix\"\n     * \"✔ cd server && npm run format\"\n     * \"✔ cd server && npm run type-check\"\n   - Commit should succeed\n\n4. **Test hooks catch ESLint errors:**\n   ```bash\n   # Add unused import\n   cd server/src\n   # Add this line to a file: import { unused } from 'express';\n   git add [file]\n   git commit -m 'test: intentional eslint error'\n   ```\n   - Hooks should run and auto-fix or warn\n   - Check if commit succeeds after auto-fix\n\n5. **Test hooks catch formatting errors:**\n   ```bash\n   # Break formatting (add extra spaces, wrong indentation)\n   cd server/src\n   # Mess up indentation in a file\n   git add [file]\n   git commit -m 'test: intentional format error'\n   ```\n   - Hooks should run Prettier and auto-fix\n   - Commit should succeed after auto-format\n\n6. **Test hooks catch TypeScript errors:**\n   ```bash\n   # Add type error\n   cd server/src\n   # Add this line: const x: string = 123;\n   git add [file]\n   git commit -m 'test: intentional type error'\n   ```\n   - Hooks should run type-check and fail\n   - Commit should be blocked\n   - **Note:** If type-check doesn't block due to known monorepo limitation, document this\n\n7. **Cleanup test commits:**\n   ```bash\n   git reset --soft HEAD~[n]  # where n = number of test commits\n   git restore --staged .\n   git restore .\n   ```\n\n8. **Report final status:**\n   - Are hooks installed and executable?\n   - Do hooks run on commit?\n   - What checks are performed? (lint, format, type-check)\n   - What errors do hooks catch? (ESLint, Prettier, TypeScript)\n   - Any known limitations? (e.g., type-check monorepo issue)\n   - Are hooks effective for preventing bad commits?\n\n## Important\n\n- DO NOT push any test commits\n- DO clean up all test changes after validation\n- DO test with real errors to ensure hooks catch them\n- DON'T skip the error-catching tests\n- DON'T leave test commits or changes in working tree\n- DO document if type-check has the known monorepo limitation\n\n## Known Good Configuration\n\nRoot `package.json` should have:\n```json\n\"lint-staged\": {\n  \"server/src/**/*.{ts,tsx}\": [\n    \"cd server && npm run lint:fix\",\n    \"cd server && npm run format\",\n    \"cd server && npm run type-check\"\n  ],\n  \"ui/src/**/*.{ts,tsx}\": [\n    \"cd ui && npm run lint:fix\",\n    \"cd ui && npm run format\",\n    \"cd ui && npm run type-check\"\n  ]\n}\n```\n\nYour goal is to validate hooks are properly configured and catch errors before commits."
}
```

## CI Backstop

Even if pre-commit hooks have limitations, CI provides complete validation:
- `.github/workflows/ci.yml` runs on every PR
- Includes: `Build Server`, `Build UI`, `Test Server`, `Test UI`, `TypeScript Check`, `Lint & Format`
- All checks must pass before merge (enforced by branch protection)
