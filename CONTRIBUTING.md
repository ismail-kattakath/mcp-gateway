# Contributing

This repo uses **GitHub Flow** + **Conventional Commits** + **release-please** so that releasing a new version of the Docker image is fully automated.

## The everyday loop

1. Branch off `main`, write code, open a PR back to `main`.
2. **Title the PR using Conventional Commits format** (see below). This is enforced by `.github/workflows/pr-title.yml`.
3. Merge with **squash-merge** (the PR title becomes the squash commit message — release-please reads that).
4. That's it. Don't bump versions manually, don't edit `CHANGELOG.md` by hand.

## Conventional Commits cheat sheet

PR title shape: `<type>: <lowercase subject>` (no scope required).

| Prefix                                                                | Use for                | Release-please bumps  |
| --------------------------------------------------------------------- | ---------------------- | --------------------- |
| `feat:`                                                               | New feature            | minor (0.1.0 → 0.2.0) |
| `fix:`                                                                | Bug fix                | patch (0.1.0 → 0.1.1) |
| `feat!:` _or_ `fix!:` _or_ `<type>: <subject>\n\nBREAKING CHANGE: …`  | Breaking change        | major (0.1.0 → 1.0.0) |
| `docs:` `chore:` `refactor:` `perf:` `test:` `build:` `ci:` `revert:` | No user-visible change | no bump               |

Examples that pass the linter:

- `feat: add container source build.repo support`
- `fix: prevent on-demand server reaping during active tool call`
- `chore: bump express to 4.21.3`
- `feat!: rename backends to servers`

Examples that fail:

- `Add new feature` — missing type prefix
- `feat: Add new feature` — subject must start lowercase
- `Feat: add new feature` — type must be lowercase

## How releases happen

The flow has three workflows that hand off cleanly:

```
┌───────────────────────────────────────────────────────────────────────┐
│  You merge a PR to main                                               │
│  └─→ pr-title.yml has already validated the title (Conventional)      │
└───────────────────────────┬───────────────────────────────────────────┘
                            ↓
┌───────────────────────────────────────────────────────────────────────┐
│  release-please.yml fires on every push to main                       │
│  └─→ Opens (or updates) a "chore(main): release X.Y.Z" PR             │
│      • Calculates the next version from accumulated commit types      │
│      • Updates server/package.json + ui/package.json                  │
│      • Regenerates CHANGELOG.md                                       │
│      • Updates .release-please-manifest.json                          │
│                                                                       │
│  This PR sits there accumulating future merges to main until you're   │
│  ready to ship.                                                       │
└───────────────────────────┬───────────────────────────────────────────┘
                            ↓
┌───────────────────────────────────────────────────────────────────────┐
│  You merge the release PR                                             │
│  └─→ release-please.yml runs again, sees "autorelease: pending",      │
│      creates the GitHub Release, pushes the vX.Y.Z git tag.           │
└───────────────────────────┬───────────────────────────────────────────┘
                            ↓
┌───────────────────────────────────────────────────────────────────────┐
│  release.yml fires on the vX.Y.Z tag push                             │
│  └─→ Builds multi-arch image, pushes to                               │
│      ghcr.io/ismail-kattakath/mcp-gateway with tags:                  │
│      :X.Y.Z, :X.Y, :X, :latest, :sha-<short>                          │
└───────────────────────────────────────────────────────────────────────┘
```

Zero manual steps in steady state. You merge PRs with good titles, you merge the release PR when you want to ship, the image appears on ghcr.

## One-time setup (human actions)

### 1. PAT for release-please

The default `GITHUB_TOKEN` issued to Actions **cannot trigger other workflows** — that's GitHub's loop-prevention rule. So if `release-please.yml` pushes a tag using `GITHUB_TOKEN`, `release.yml` will NOT fire on that tag push, and no Docker image will be built.

Fix once:

1. Create a [**fine-grained Personal Access Token**](https://github.com/settings/tokens?type=beta) on this repo with permissions:
   - `Contents: Read and write`
   - `Pull requests: Read and write`
   - `Issues: Read and write`
2. In the repo settings → Secrets and variables → Actions → New repository secret, name it `RELEASE_PLEASE_TOKEN`, paste the PAT.

If you skip this, release PRs will still open, but the resulting tag won't fire the Docker workflow. You'd have to push the tag manually (`git push origin v0.1.0 --force-with-lease`) to trigger `release.yml`. Bad UX — set up the PAT.

### 2. Branch protection on `main`

Already applied via `gh api`. Current rules:

| Rule                                | State                        |
| ----------------------------------- | ---------------------------- |
| Require pull request before merging | ✅ (0 approvals — solo repo) |
| Require linear history              | ✅ (squash-merge enforced)   |
| Allow force pushes                  | ❌                           |
| Allow deletions                     | ❌                           |
| Enforce on administrators           | ✅ (no admin bypass)         |
| Required status checks              | _none yet — see below_       |

**Bootstrap note:** the `validate-title` status check from `pr-title.yml` is intentionally NOT required yet. It can't be required until the workflow file is on `main` and has run at least once. After the first PR (the one introducing these workflows) is merged, run the follow-up command in the next section to add it as required.

### 3. After the bootstrap PR lands — require the PR title check

```bash
gh api -X PATCH \
  "repos/ismail-kattakath/mcp-gateway/branches/main/protection/required_status_checks" \
  -F strict=true \
  -F 'contexts[]=validate-title'
```

That makes `pr-title.yml` a required check — PRs with malformed Conventional Commits titles cannot be merged. (`strict=true` also means PRs must be up to date with `main` before merging.)

### Reverting

If you ever need to undo branch protection (emergency hotfix that needs a direct push):

```bash
gh api -X DELETE "repos/ismail-kattakath/mcp-gateway/branches/main/protection"
# … do the thing …
# … then re-apply protection (see the JSON in /tmp/branch-protection.json or recreate from this doc)
```

Admin permissions to MODIFY protection are separate from the bypass exemption. So even with `enforce_admins: true`, you can disable protection — you just can't push directly while it's enabled.

## How to ship a release

Open the open release PR (titled `chore(main): release X.Y.Z`), review the diff (it'll show the version bump and the auto-generated changelog), and merge it.

That's the whole interaction. You don't run any commands locally.

## Bootstrapping a fresh version

If you ever need to start a new major-version line out-of-band, edit `.release-please-manifest.json` and bump both `server` and `ui` to the new baseline (e.g. `"2.0.0"`), commit with `chore: bootstrap v2 manifest`, and the next release PR will pick it up from there.

## Development Setup

### Prerequisites

- Node.js 18+ (LTS recommended)
- npm 9+
- Git
- Docker (for testing container sources)
- PostgreSQL (optional, for testing database features)

### Local Development

**Clone and install:**

```bash
git clone https://github.com/ismail-kattakath/mcp-gateway.git
cd mcp-gateway
npm install
```

**Server development:**

```bash
cd server
npm install
npm run dev  # Hot reload with tsx
```

**UI development:**

```bash
cd ui
npm install
npm run dev  # Vite dev server on :5173
```

**CLI development:**

```bash
cd cli
npm install
npm run dev -- servers list  # Run without building
```

### Running Tests

**Unit tests:**

```bash
cd server
npm test  # Run once
npm run test:watch  # Watch mode
npm run test:coverage  # With coverage
```

**Integration tests:**

```bash
npm run test:integration
```

**E2E tests:**

```bash
npm run test:e2e
```

### Code Quality

**Linting:**

```bash
npm run lint  # Check
npm run lint:fix  # Auto-fix
```

**Formatting:**

```bash
npm run format  # Format
npm run format:check  # Check only (CI)
```

**Type checking:**

```bash
npm run type-check
```

**All checks:**

```bash
npm run validate  # Lint + format + type-check + test
```

## Code Style Guidelines

### TypeScript

- Use strict mode
- Explicit return types for functions
- Prefer `const` over `let`
- Use `readonly` for immutable properties
- Avoid `any` (use `unknown` if needed)

**Example:**

```typescript
// Good
async function getServer(name: string): Promise<Server> {
  const server = await serverManager.get(name);
  return server;
}

// Bad
function getServer(name) {
  return serverManager.get(name);
}
```

### Error Handling

- Use custom error classes
- Include context in error messages
- Log errors at appropriate level

**Example:**

```typescript
class ServerNotFoundError extends Error {
  constructor(name: string) {
    super(`Server not found: ${sanitizeServerName(name)}`);
    this.name = "ServerNotFoundError";
  }
}

try {
  const server = await getServer(name);
} catch (error) {
  if (error instanceof ServerNotFoundError) {
    logger.warn("Server lookup failed", { name, error });
    return res.status(404).json({ error: error.message });
  }
  throw error;
}
```

### Async/Await

- Prefer `async/await` over callbacks
- Handle errors with try/catch
- Don't use `Promise.all` for unrelated operations

**Example:**

```typescript
// Good
async function processServers(names: string[]): Promise<void> {
  for (const name of names) {
    try {
      await startServer(name);
    } catch (error) {
      logger.error("Failed to start server", { name, error });
    }
  }
}

// Bad
function processServers(names, callback) {
  let pending = names.length;
  names.forEach((name) => {
    startServer(name, (error) => {
      if (--pending === 0) callback();
    });
  });
}
```

### Naming Conventions

- **Variables/Functions**: camelCase (`serverName`, `getServer`)
- **Classes**: PascalCase (`ServerManager`, `BaseServer`)
- **Constants**: UPPER_SNAKE_CASE (`DEFAULT_TIMEOUT`, `MAX_RETRIES`)
- **Types/Interfaces**: PascalCase (`ServerConfig`, `ToolCall`)
- **Files**: kebab-case (`server-manager.ts`, `base-server.ts`)

### Comments

- Use JSDoc for public API
- Explain **why**, not **what**
- Keep comments up-to-date

**Example:**

```typescript
/**
 * Lazy-load an on-demand server.
 *
 * Servers are started on first tool call and stopped after idleTimeout.
 * This reduces memory usage for rarely-used servers.
 *
 * @param name - Server name
 * @returns Server instance
 * @throws ServerNotFoundError if server doesn't exist
 */
async function lazyLoadServer(name: string): Promise<Server> {
  // Check if already loaded (cache lookup is cheap)
  const cached = serverCache.get(name);
  if (cached) return cached;

  // Start server (expensive operation)
  const server = await startServer(name);
  serverCache.set(name, server);
  return server;
}
```

## Testing Requirements

### Unit Tests

- Test pure functions and business logic
- Mock external dependencies (database, network, filesystem)
- Use descriptive test names

**Example:**

```typescript
import { describe, it, expect, vi } from "vitest";
import { sanitizeServerName } from "./sanitizer";

describe("sanitizeServerName", () => {
  it("removes CRLF characters", () => {
    expect(sanitizeServerName("server\r\nname")).toBe("servername");
  });

  it("truncates long names", () => {
    const long = "a".repeat(100);
    expect(sanitizeServerName(long)).toHaveLength(50);
  });

  it("escapes control characters", () => {
    expect(sanitizeServerName("server\x00name")).toBe("server\\x00name");
  });
});
```

### Integration Tests

- Test interaction between components
- Use test database
- Clean up after tests

**Example:**

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { setupTestDB, teardownTestDB } from "./test-helpers";
import { ServerManager } from "./server-manager";

describe("ServerManager", () => {
  let db: Database;
  let manager: ServerManager;

  beforeEach(async () => {
    db = await setupTestDB();
    manager = new ServerManager(db);
  });

  afterEach(async () => {
    await teardownTestDB(db);
  });

  it("creates and starts server", async () => {
    await manager.create("test-server", {
      source: "pkg",
      command: "echo",
      args: ["hello"],
    });

    const server = await manager.get("test-server");
    expect(server.state).toBe("running");
  });
});
```

### Coverage Requirements

- **Overall**: 77%+ (current: ~80%)
- **New code**: 85%+
- **Critical paths**: 95%+

**Check coverage:**

```bash
npm run test:coverage
open coverage/index.html
```

## Adding New Features

### 1. Authentication Strategy

**Create strategy file:**

```typescript
// server/src/middleware/auth/strategies/custom.ts
import { Strategy } from "passport-custom";

export function createCustomStrategy() {
  return new Strategy(async (req, done) => {
    const token = req.headers["x-custom-token"];

    // Validate token
    const user = await validateToken(token);

    if (!user) {
      return done(null, false, { message: "Invalid token" });
    }

    return done(null, user);
  });
}
```

**Register strategy:**

```typescript
// server/src/middleware/auth/index.ts
import { createCustomStrategy } from "./strategies/custom";

passport.use("custom", createCustomStrategy());
```

**Add tests:**

```typescript
// server/src/middleware/auth/strategies/custom.test.ts
describe("Custom Strategy", () => {
  it("authenticates valid token", async () => {
    // Test implementation
  });
});
```

**Update documentation:**

Add to `docs/USER_GUIDE.md` under Authentication section.

### 2. Backend Adapter

**Create adapter file:**

```typescript
// server/src/mcp/backends/custom.ts
import { BaseServer } from "./base";

export class CustomServer extends BaseServer {
  async prepare(): Promise<void> {
    // Setup logic (download, build, etc.)
  }

  getSpawnArgs(): SpawnArgs {
    return {
      command: this.config.command,
      args: this.config.args,
      env: this.resolveEnv(),
    };
  }
}
```

**Register backend:**

```typescript
// server/src/mcp/backends/index.ts
import { CustomServer } from "./custom";

function createBackend(name: string, config: ServerConfig): BaseServer {
  switch (config.source) {
    case "custom":
      return new CustomServer(name, config);
    // ... existing sources
  }
}
```

**Add schema:**

```json
{
  "custom": {
    "type": "object",
    "properties": {
      "source": { "const": "custom" },
      "customField": { "type": "string" }
    }
  }
}
```

**Add tests and docs.**

### 3. CLI Command

**Create command file:**

```typescript
// cli/src/commands/custom.ts
import { Command } from "commander";

export function createCustomCommand(): Command {
  return new Command("custom")
    .description("Custom command")
    .argument("<name>", "Name argument")
    .option("-f, --flag", "Optional flag")
    .action(async (name, options) => {
      // Command implementation
    });
}
```

**Register command:**

```typescript
// cli/src/index.ts
import { createCustomCommand } from "./commands/custom";

program.addCommand(createCustomCommand());
```

## Security Guidelines

### Input Validation

**Always validate user input:**

```typescript
import Joi from "joi";

const serverSchema = Joi.object({
  name: Joi.string()
    .pattern(/^[a-z0-9-]+$/)
    .required(),
  config: Joi.object({
    source: Joi.string().valid("pkg", "git", "container", "remote", "local"),
    // ... more fields
  }),
});

function validateServer(data: unknown): ServerConfig {
  const { error, value } = serverSchema.validate(data);
  if (error) {
    throw new ValidationError(error.message);
  }
  return value;
}
```

### Sanitization

**Sanitize before logging:**

```typescript
import { sanitizeServerName, sanitizePath } from "./sanitizer";

logger.info(`Starting server: ${sanitizeServerName(name)}`);
logger.debug(`Loading from: ${sanitizePath(repoDir)}`);
```

### Command Execution

**Never use shell=true:**

```typescript
// Good
spawn("git", ["clone", repoUrl, repoDir], { shell: false });

// Bad
spawn(`git clone ${repoUrl} ${repoDir}`, { shell: true });
```

### Path Traversal Prevention

**Validate paths don't escape parent:**

```typescript
import path from "path";

function validatePath(userPath: string, parentDir: string): string {
  const resolved = path.resolve(parentDir, userPath);
  if (!resolved.startsWith(path.resolve(parentDir))) {
    throw new Error("Path traversal attempt detected");
  }
  return resolved;
}
```

## Performance Guidelines

### Database Queries

- Use prepared statements
- Implement connection pooling
- Add indexes for frequently-queried fields
- Use transactions for multi-statement operations

### Caching

- Cache server metadata
- Cache tool schemas
- Implement TTL for caches
- Clear cache on updates

### Async Operations

- Use `Promise.all` for parallel operations
- Implement timeouts for network calls
- Use streams for large files
- Avoid blocking operations in event loop

## Documentation

### When to Update Docs

- **New feature**: Add to User Guide + API docs
- **Breaking change**: Migration guide + changelog
- **Bug fix**: Update troubleshooting section
- **Performance improvement**: Update Performance Tuning docs

### Documentation Standards

- Use Markdown
- Include code examples
- Add diagrams where helpful (ASCII or Mermaid)
- Cross-reference related docs
- Keep Table of Contents updated

## Release Checklist

Before creating a release PR:

- [ ] All tests pass
- [ ] Lint and format checks pass
- [ ] Type checking passes
- [ ] Documentation updated
- [ ] Migration guide (if breaking changes)
- [ ] CHANGELOG.md entry (auto-generated)
- [ ] Version bumped (auto-generated)

## Getting Help

- **Questions**: GitHub Discussions
- **Bugs**: GitHub Issues
- **Security**: See SECURITY.md
- **Chat**: (Discord/Slack link if available)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
