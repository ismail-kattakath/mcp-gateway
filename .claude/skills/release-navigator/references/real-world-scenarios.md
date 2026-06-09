# Real-World Release Scenarios - MCP Gateway

This document captures actual release pipeline scenarios encountered in mcp-gateway development, with exact commands and resolutions.

## Scenario: 2026-06-08 - Unblocking v1.1.0 Release

### Initial State
- Latest release: v1.0.0 (from PR #7)
- `.release-please-manifest.json`: `{"server": "1.1.0", "ui": "1.0.0"}`
- PRs #8 and #9 merged with `feat:` and `build:` prefixes
- PR #10 merged with `chore:` prefix
- **No v1.1.0 tag exists**
- **No v1.1.0 release PR created**

### Symptoms
```bash
$ gh release list --limit 3
v1.0.0  Latest  v1.0.0  2026-06-08T10:42:02Z

$ git tag --sort=-version:refname | head -3
v1.0.0

$ cat .release-please-manifest.json
{"server": "1.1.0", "ui": "1.0.0"}
```

Mismatch: manifest says v1.1.0, but no tag exists.

### Root Cause Investigation

Checked release-please logs:
```bash
$ gh run list --workflow="release-please.yml" --limit 1
completed  success  feat: multi-transport support...  Release Please  main  push  27138163364

$ gh run view 27138163364 --log | grep -i "abort\|untagged"
⚠ There are untagged, merged release PRs outstanding - aborting
```

**Root cause**: PR #7 updated manifest to v1.1.0 but never created tag (PAT token issue).

### Diagnosis Commands Used
```bash
# Check for untagged release PRs
$ gh pr list --state merged --label "autorelease: pending"
7  chore: release main  release-please--branches--main  MERGED  2026-06-08T11:16:12Z

# Get commit SHA from release PR
$ gh pr view 7 --json mergeCommit --jq '.mergeCommit.oid'
09c40128a93046c8bfe608d752b69a136ee67b7e

# Verify what version should be tagged
$ gh pr view 7 --json title
{"title":"chore: release main"}

# Check PR body for version (it was in the manifest update)
$ git show 09c4012:.release-please-manifest.json
{"server": "1.1.0", "ui": "1.0.0"}
```

### Resolution Steps

1. **Create missing tag:**
   ```bash
   $ git tag v1.1.0 09c40128a93046c8bfe608d752b69a136ee67b7e
   $ git push origin v1.1.0
   To https://github.com/ismail-kattakath/mcp-gateway.git
    * [new tag]         v1.1.0 -> v1.1.0
   ```

2. **Create GitHub release:**
   ```bash
   $ gh release create v1.1.0 \
     --title "v1.1.0" \
     --notes "Release v1.1.0

   This release was manually created to unblock release-please after PR #7.

   See CHANGELOG.md for details." \
     --target 09c40128a93046c8bfe608d752b69a136ee67b7e
   
   https://github.com/ismail-kattakath/mcp-gateway/releases/tag/v1.1.0
   ```

3. **Remove autorelease: pending label:**
   ```bash
   $ gh pr edit 7 --remove-label "autorelease: pending"
   https://github.com/ismail-kattakath/mcp-gateway/pull/7
   ```

4. **Verify Docker build triggered:**
   ```bash
   $ gh run list --workflow="release.yml" --limit 3
   in_progress  chore: release main (#7)  Release container image  v1.1.0  push  27164407001  9s
   ```

### Post-Resolution State
```bash
$ gh release list --limit 3
v1.1.0  Latest  v1.1.0  2026-06-08T20:18:45Z
v1.0.0          v1.0.0  2026-06-08T10:42:02Z

$ git tag --sort=-version:refname | head -3
v1.1.0
v1.0.0

$ gh pr list --state merged --label "autorelease: pending"
(no results)
```

### Lessons Learned
1. **Always verify `RELEASE_PLEASE_TOKEN` is configured** - Without it, tags won't trigger release.yml
2. **Monitor release-please logs for "aborting" messages** - They indicate blocked state
3. **Manual tag creation is safe when release PR exists** - The version calculation already happened
4. **Remove `autorelease: pending` label after manual tag** - Prevents confusion in future runs

## Scenario: Predicting Version Bump From PR Title

### Context
Developer asks: "I have a PR titled 'feat: multi-transport support', what version will this create?"

### Navigation

Current state:
```bash
$ cat .release-please-manifest.json
{"server": "1.0.0", "ui": "1.0.0"}
```

PR title: `feat: multi-transport support`

**Calculation:**
- Current: v1.0.0
- Type: `feat:` → minor bump
- Next: v1.1.0

If PR title was:
- `fix: bug in auth` → v1.0.1 (patch)
- `feat!: breaking change` → v2.0.0 (major)
- `chore: update docs` → no release (stays v1.0.0)

### Commands to Verify
```bash
# Check current version
$ jq -r '.server' .release-please-manifest.json
1.0.0

# Preview commits since last release
$ LAST_TAG=$(git describe --tags --abbrev=0)
$ git log $LAST_TAG..HEAD --oneline
c08f535 feat: multi-transport support with secure auto-generated API keys (#8)

# Check if release PR exists for this
$ gh pr list --state open --label "autorelease: pending"
(none yet - will be created after merge)
```

## Scenario: Why No Release PR After feat: Merge?

### Initial State
```bash
$ gh pr list --state merged --limit 3
10  chore: clean up documentation...  MERGED
8   feat: multi-transport support...  MERGED  
9   build: commit lockfiles...       MERGED

$ gh pr list --state open --label "autorelease: pending"
(none)
```

Developer asks: "I merged PR #8 with `feat:` prefix, where's the release PR?"

### Investigation

Check release-please runs:
```bash
$ gh run list --workflow="release-please.yml" --limit 3
completed  success  chore: clean up documentation (#10)  2026-06-08T20:00:25Z
completed  success  feat: multi-transport support (#8)   2026-06-08T12:38:25Z
completed  success  build: commit lockfiles (#9)         2026-06-08T12:30:02Z
```

All succeeded, so check logs:
```bash
$ gh run view 27138163364 --log | grep "pull request\|aborting"
⚠ There are untagged, merged release PRs outstanding - aborting
```

**Diagnosis**: Release-please is blocked by untagged v1.1.0.

### Resolution
Follow "Scenario: 2026-06-08 - Unblocking v1.1.0 Release" above.

## Scenario: Docker Build Failed - How to Recover?

### Context
Tag v1.2.0 created, Docker build triggered but failed.

### Investigation
```bash
$ gh release list --limit 1
v1.2.0  Latest  v1.2.0  2026-06-08T22:15:33Z

$ gh run list --workflow="release.yml" --limit 1
completed  failure  chore: release main (#11)  Release container image  v1.2.0  push  27165001234
```

Check failure logs:
```bash
$ gh run view 27165001234 --log | tail -50
Error: buildx failed with: ERROR: failed to solve: process "/bin/sh -c npm ci" did not complete successfully: exit code: 137
```

**Diagnosis**: Build ran out of memory (exit 137 = OOM kill).

### Recovery Options

**Option 1: Re-run workflow (transient failure)**
```bash
$ gh run rerun 27165001234
✓ Requested rerun of run 27165001234
```

**Option 2: Re-push tag (persistent failure, need code fix)**
```bash
# Fix the issue in code (e.g., reduce dependencies)
git checkout -b fix/docker-build
# ... make fixes ...
git commit -m "fix: reduce Docker build memory usage"
gh pr create --title "fix: reduce Docker build memory usage"

# After merge, re-tag
git tag -d v1.2.0
git push origin :refs/tags/v1.2.0
git tag v1.2.0 <NEW_COMMIT>
git push origin v1.2.0
```

**Option 3: Manual Docker build (emergency)**
```bash
# Build locally
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --tag ghcr.io/ismail-kattakath/mcp-gateway:1.2.0 \
  --tag ghcr.io/ismail-kattakath/mcp-gateway:latest \
  --push \
  .
```

### Verification
```bash
# Check build success
$ gh run view 27165001234 --json conclusion
{"conclusion":"success"}

# Verify image published
$ docker pull ghcr.io/ismail-kattakath/mcp-gateway:1.2.0
1.2.0: Pulling from ismail-kattakath/mcp-gateway
...
Status: Downloaded newer image for ghcr.io/ismail-kattakath/mcp-gateway:1.2.0
```

## Scenario: Need v2.0.0 But Current is v1.5.0

### Context
Developer needs major version bump for breaking changes.

### Current State
```bash
$ cat .release-please-manifest.json
{"server": "1.5.0", "ui": "1.5.0"}

$ gh pr list --state open --label "autorelease: pending"
(none)
```

### Solution Path 1: Breaking Change PR

```bash
# Create feature branch
$ git checkout -b feat/breaking-api-changes

# Make breaking changes
# ... edit code ...

# Commit
$ git commit -am "feat!: redesign API endpoints

BREAKING CHANGE: /api/v1/* endpoints removed, use /api/v2/* instead"

# Open PR with breaking prefix
$ gh pr create \
  --title "feat!: redesign API endpoints" \
  --body "Breaking change: redesigned API from v1 to v2

This is a breaking change that requires clients to update their endpoints.

BREAKING CHANGE: /api/v1/* endpoints removed, use /api/v2/* instead"
```

After merge, release-please will create PR for v2.0.0.

### Solution Path 2: Manual Bootstrap (avoid if possible)

```bash
# Edit manifest
$ echo '{"server": "2.0.0", "ui": "2.0.0"}' > .release-please-manifest.json

# Update package.json files
$ cd server && npm version 2.0.0 --no-git-tag-version
$ cd ../ui && npm version 2.0.0 --no-git-tag-version

# Update CHANGELOG.md manually
# ... add entry for 2.0.0 with breaking changes ...

# Commit
$ git checkout -b chore/bootstrap-v2
$ git add .release-please-manifest.json server/package.json ui/package.json CHANGELOG.md
$ git commit -m "chore: bootstrap v2.0.0 manifest"

# PR
$ gh pr create \
  --title "chore: bootstrap v2.0.0 manifest" \
  --body "Manual version bump to start v2.x line"
```

**Caution**: Path 2 bypasses automatic changelog. Prefer Path 1.

## Scenario: Working in Worktree, Need to Know Impact

### Context
Developer working in `git worktree` for hotfix, wants to know what happens when merged.

### Commands
```bash
# Show worktree status
$ git worktree list
/Users/dev/mcp-gateway            6d1fe7a [main]
/Users/dev/mcp-gateway-hotfix     a1b2c3d [hotfix/auth-bug]

# Switch to hotfix worktree
$ cd /Users/dev/mcp-gateway-hotfix

# Check current branch
$ git branch --show-current
hotfix/auth-bug

# Check what main version is
$ git show origin/main:.release-please-manifest.json
{"server": "1.5.0", "ui": "1.5.0"}

# Check PR title (determines bump)
$ gh pr view --json title
{"title": "fix: prevent auth token expiration"}
```

**Analysis:**
- Main is at v1.5.0
- PR title is `fix:` → patch bump
- Expected next version: v1.5.1

**Verification after merge:**
```bash
# Back to main worktree
$ cd /Users/dev/mcp-gateway
$ git pull

# Wait for release PR
$ gh pr list --state open --label "autorelease: pending"
12  chore(main): release 1.5.1  release-please--branches--main  OPEN
```

## Scenario: Emergency Hotfix to Production

### Context
Critical bug in v1.5.0, need v1.5.1 ASAP, bypassing normal flow.

### Emergency Procedure

1. **Create hotfix:**
   ```bash
   $ git checkout -b hotfix/critical-bug v1.5.0
   # Fix bug
   $ git commit -m "fix: critical security vulnerability"
   ```

2. **Update version manually:**
   ```bash
   $ cd server && npm version 1.5.1 --no-git-tag-version
   $ cd ../ui && npm version 1.5.1 --no-git-tag-version
   $ echo '{"server": "1.5.1", "ui": "1.5.1"}' > .release-please-manifest.json
   ```

3. **Commit version bump:**
   ```bash
   $ git add server/package.json ui/package.json .release-please-manifest.json
   $ git commit -m "chore: emergency release 1.5.1"
   ```

4. **Unprotect main temporarily:**
   ```bash
   $ gh api -X DELETE "repos/ismail-kattakath/mcp-gateway/branches/main/protection"
   ```

5. **Merge to main:**
   ```bash
   $ git checkout main
   $ git merge hotfix/critical-bug --no-ff
   $ git push origin main
   ```

6. **Create tag:**
   ```bash
   $ git tag v1.5.1
   $ git push origin v1.5.1
   $ gh release create v1.5.1 --title "v1.5.1 (Emergency Hotfix)" \
     --notes "Emergency security fix - see commit details"
   ```

7. **Re-protect main:**
   ```bash
   $ gh api -X PUT "repos/ismail-kattakath/mcp-gateway/branches/main/protection" \
     -F required_status_checks[strict]=true \
     -F "required_status_checks[contexts][]=validate-title" \
     -F required_pull_request_reviews[required_approving_review_count]=0 \
     -F required_linear_history=true \
     -F allow_force_pushes=false \
     -F allow_deletions=false \
     -F enforce_admins=true
   ```

8. **Verify Docker build:**
   ```bash
   $ gh run list --workflow="release.yml" --limit 1
   $ docker pull ghcr.io/ismail-kattakath/mcp-gateway:1.5.1
   ```

**Post-mortem**: Document why emergency procedure was needed, add tests to prevent recurrence.

## Quick Reference: Command Patterns

### Check Current State
```bash
# Version state
cat .release-please-manifest.json
jq -r '.server' server/package.json
git describe --tags --abbrev=0

# Release pipeline
gh pr list --state open --label "autorelease: pending"
gh pr list --state merged --label "autorelease: pending"
gh release list --limit 3

# Recent activity
gh run list --limit 5
git log --oneline -5
```

### Diagnose Issues
```bash
# Release-please logs
gh run list --workflow="release-please.yml" --limit 3
gh run view <RUN_ID> --log | grep -i "error\|abort\|warning"

# Docker build logs
gh run list --workflow="release.yml" --limit 3
gh run view <RUN_ID> --log | tail -50

# Check for blockages
gh pr list --state merged --label "autorelease: pending"
```

### Common Fixes
```bash
# Create missing tag
git tag v<VERSION> <COMMIT_SHA>
git push origin v<VERSION>
gh release create v<VERSION> --title "v<VERSION>" --target <COMMIT_SHA>

# Remove stale label
gh pr edit <PR_NUM> --remove-label "autorelease: pending"

# Re-run failed workflow
gh run rerun <RUN_ID>

# Re-push tag
git tag -d v<VERSION>
git push origin :refs/tags/v<VERSION>
git tag v<VERSION> <NEW_COMMIT>
git push origin v<VERSION>
```

### Verification
```bash
# Check release created
gh release view v<VERSION>

# Verify Docker image
docker pull ghcr.io/ismail-kattakath/mcp-gateway:<VERSION>
docker images | grep mcp-gateway

# Confirm unblocked
gh pr list --state merged --label "autorelease: pending"
# Should return empty
```
