---
name: release-navigator
description: This skill should be used when the user asks about "release status", "CI/CD state", "why didn't my release work", "what's blocking my release", "release-please stuck", "Docker build failed", "where is my version", "how to ship", "release workflow", "unblock release", or needs guidance on the automated release pipeline at any repo state (PR/action/build/deploy success/failed, any branch or worktree).
version: 1.0.0
---

# Release Navigator - MCP Gateway CI/CD Guide

Navigate the fully automated release pipeline for mcp-gateway, diagnose issues, and understand next steps regardless of current repo state.

## Overview

This skill provides real-time navigation of the three-stage release pipeline:

1. **PR Stage** - Conventional Commits validation
2. **Release-Please Stage** - Automated release PR creation
3. **Release Stage** - Docker image build and publish

Use this skill to diagnose stuck releases, understand current state, and determine next actions.

## Quick Diagnosis Commands

Execute these to assess current state:

```bash
# Check latest release and tags
gh release list --limit 3
git tag --sort=-version:refname | head -5

# Check for open release PR
gh pr list --state open --label "autorelease: pending"

# Check recent workflow runs
gh run list --limit 10

# Check current branch and manifest
git branch --show-current
cat .release-please-manifest.json
cat server/package.json | grep '"version"'
cat ui/package.json | grep '"version"'
```

## Pipeline Architecture

### Stage 1: PR Merge to Main

**Trigger**: Any PR merged to `main`

**What Happens**:
- `.github/workflows/pr-title.yml` validates PR title (Conventional Commits)
- Title becomes squash commit message
- Commit lands on `main`

**Validation Rules**:
- `feat:` → minor bump (0.1.0 → 0.2.0)
- `fix:` → patch bump (0.1.0 → 0.1.1)
- `feat!:` or `fix!:` → major bump (0.1.0 → 1.0.0)
- `chore:`, `docs:`, `refactor:`, `test:`, `build:`, `ci:` → no bump

**Status Checks Required**:
- `validate-title` (from pr-title.yml)
- Must be up-to-date with `main` (strict mode)

**Branch Protection Settings**:
```json
{
  "require_pr": true,
  "required_approving_review_count": 0,
  "linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "enforce_admins": true,
  "required_status_checks": ["validate-title"],
  "strict": true
}
```

**Diagnosis**: PR won't merge
```bash
# Check if title passes validation
gh pr view <PR_NUMBER> --json title

# Check required status checks
gh pr checks <PR_NUMBER>

# Verify title format
# Valid: "feat: add new feature"
# Invalid: "Add new feature" (no type)
# Invalid: "feat: Add new feature" (uppercase subject)
```

**Fix**: Update PR title to match Conventional Commits format.

### Stage 2: Release-Please Creates Release PR

**Trigger**: Push to `main` with releasable commits

**Workflow**: `.github/workflows/release-please.yml`

**What Happens**:
1. Runs on every push to `main`
2. Analyzes commits since last release
3. Calculates next version from commit types
4. Opens/updates PR titled `chore(main): release X.Y.Z`
5. PR updates:
   - `server/package.json` version
   - `ui/package.json` version
   - `CHANGELOG.md` (regenerated)
   - `.release-please-manifest.json`

**PR Label**: `autorelease: pending`

**Diagnosis**: No release PR appears after merging feat/fix PRs

```bash
# Check latest release-please run
gh run list --workflow="release-please.yml" --limit 1

# View logs for errors
gh run view <RUN_ID> --log | grep -i "error\|warning\|abort"

# Common issues to grep for:
# "untagged, merged release PRs outstanding - aborting"
# "No releasable changes"
# "commit could not be parsed"
```

**Common Blockages**:

1. **Untagged Release PR** - Release-please found a merged release PR that was never tagged
   
   **Symptom**: Logs show `⚠ There are untagged, merged release PRs outstanding - aborting`
   
   **Diagnosis**:
   ```bash
   # Check for merged release PRs with autorelease: pending
   gh pr list --state merged --label "autorelease: pending"
   
   # Check what version manifest expects
   cat .release-please-manifest.json
   
   # Check if tag exists
   git tag | grep "v$(jq -r '.server' .release-please-manifest.json)"
   ```
   
   **Fix**: Manually create and push the missing tag
   ```bash
   # Find the release PR commit
   gh pr view <RELEASE_PR_NUMBER> --json mergeCommit
   
   # Create tag at that commit
   git tag v<VERSION> <COMMIT_SHA>
   git push origin v<VERSION>
   
   # Create GitHub release
   gh release create v<VERSION> --title "v<VERSION>" \
     --notes "Release v<VERSION>" --target <COMMIT_SHA>
   ```

2. **PAT Token Missing** - `GITHUB_TOKEN` used instead of `RELEASE_PLEASE_TOKEN`
   
   **Symptom**: Release PR merges but no tag/release created, Docker build never fires
   
   **Diagnosis**:
   ```bash
   # Check if secret exists
   gh secret list | grep RELEASE_PLEASE_TOKEN
   ```
   
   **Impact**: Tags won't trigger `release.yml` (GitHub's loop-prevention rule)
   
   **Fix**: Add `RELEASE_PLEASE_TOKEN` secret (see CONTRIBUTING.md "One-time setup")

3. **No Releasable Commits** - Only `chore:`, `docs:`, etc. commits since last release
   
   **Symptom**: No release PR created after merges
   
   **Diagnosis**:
   ```bash
   # Check commits since last release
   LAST_TAG=$(git describe --tags --abbrev=0)
   git log $LAST_TAG..HEAD --oneline
   
   # Count releasable commits (feat, fix, breaking)
   git log $LAST_TAG..HEAD --oneline | grep -E "^[a-f0-9]+ (feat|fix|feat!|fix!)"
   ```
   
   **Fix**: None needed - this is expected behavior. Wait for feat:/fix: commits.

4. **Unparseable Commits** - Commits don't match Conventional Commits format
   
   **Symptom**: Logs show `❯ commit could not be parsed: <SHA> <message>`
   
   **Diagnosis**: Look for commits with malformed messages (spaces in type, missing colon, etc.)
   
   **Fix**: Usually ignorable - release-please skips these commits. If critical, cherry-pick with correct format.

### Stage 3: Merge Release PR → Tag → Docker Build

**Trigger**: Release PR merged to `main`

**What Happens**:

1. **release-please.yml runs again**:
   - Detects `autorelease: pending` label
   - Creates GitHub Release
   - Pushes `vX.Y.Z` git tag

2. **release.yml fires on tag push**:
   - Builds multi-arch Docker image (`linux/amd64`, `linux/arm64`)
   - Pushes to `ghcr.io/ismail-kattakath/mcp-gateway`
   - Tags: `:latest`, `:X.Y.Z`, `:X.Y`, `:X`, `:edge`, `:sha-<short>`

**Diagnosis**: Release PR merged but no tag/release/Docker build

```bash
# Check if release was created
gh release list --limit 5

# Check if tag exists
EXPECTED_VERSION=$(cat .release-please-manifest.json | jq -r '.server')
git tag | grep "v$EXPECTED_VERSION"

# Check release.yml runs
gh run list --workflow="release.yml" --limit 5

# Check if release.yml triggered on tag
gh run list --event push --branch "v*" --limit 3
```

**Common Issues**:

1. **No Tag Created** - PAT token issue (see Stage 2 blockage #2)

2. **Docker Build Failed**
   
   **Diagnosis**:
   ```bash
   # Find failed run
   gh run list --workflow="release.yml" --limit 5
   
   # View logs
   gh run view <RUN_ID> --log
   
   # Common failures:
   # - Build errors (check Dockerfile)
   # - GHCR auth issues (check GITHUB_TOKEN permissions)
   # - Multi-arch build issues (QEMU/buildx)
   ```
   
   **Fix**: Depends on error. Can re-trigger:
   ```bash
   # Re-run failed workflow
   gh run rerun <RUN_ID>
   
   # Or manually trigger (if workflow_dispatch enabled)
   gh workflow run release.yml
   ```

## Navigating Common Scenarios

### Scenario 1: "Where is my version X.Y.Z?"

**Context**: You merged PRs but don't see a release

**Diagnosis Steps**:

1. Check if release PR exists:
   ```bash
   gh pr list --state open --label "autorelease: pending"
   ```

2. If no release PR:
   - Check if commits are releasable (feat/fix/breaking)
   - Check release-please.yml logs for blockages
   - Verify `.release-please-manifest.json` vs actual tags

3. If release PR exists but not merged:
   - Review the PR, verify changelog looks correct
   - Merge it when ready to ship

4. If release PR merged but no release:
   - Check for PAT token issue
   - Manually create tag (see Stage 2 blockage #1)

### Scenario 2: "Release-please is stuck/not creating PRs"

**Most Common Cause**: Untagged release PR

**Resolution**:
```bash
# 1. Find the untagged version
cat .release-please-manifest.json

# 2. Check if tag exists
git tag | grep "v<VERSION>"

# 3. If missing, find the release PR commit
gh pr list --state merged --label "autorelease: pending" --limit 5

# 4. Create tag manually (see Stage 2 blockage #1 fix)
```

### Scenario 3: "I want v2.0.0 but I'm at v1.1.0"

**Context**: Need major version bump

**Solution**: Create PR with breaking change prefix

```bash
# Create feature branch
git checkout -b feat/breaking-change

# Make changes
# ...

# Open PR with title:
# "feat!: breaking change description"
# OR
# "fix!: breaking fix description"

# Merge to main
# Release-please will bump to v2.0.0
```

### Scenario 4: "Docker image not updating"

**Diagnosis**:

1. Check tag was created:
   ```bash
   git tag --sort=-version:refname | head -3
   ```

2. Check release.yml triggered:
   ```bash
   gh run list --workflow="release.yml" --event push --limit 5
   ```

3. Check build status:
   ```bash
   gh run view <RUN_ID> --log | tail -50
   ```

4. Verify image exists:
   ```bash
   docker pull ghcr.io/ismail-kattakath/mcp-gateway:latest
   docker pull ghcr.io/ismail-kattakath/mcp-gateway:<VERSION>
   ```

**Fix**:
- If tag missing: Create manually
- If build failed: Check logs, fix issue, re-run or re-tag
- If build succeeded but image wrong: Check tag mappings in release.yml

### Scenario 5: "Working in feature branch/worktree"

**Navigation**:

```bash
# Check current location
git branch --show-current
git worktree list

# See what will happen when merged
# 1. Your PR title determines version bump
# 2. Preview with conventional-commits-parser or check manually

# Title format:
# "feat: ..." → minor bump
# "fix: ..." → patch bump  
# "feat!: ..." → major bump
# "chore: ..." → no bump
```

**Tip**: Title your PR correctly BEFORE merging. PR title validation prevents mistakes.

## Configuration Files Reference

### `.release-please-manifest.json`
Current version state:
```json
{
  "server": "X.Y.Z",
  "ui": "X.Y.Z"
}
```

**What it means**: Release-please thinks these are the latest released versions. Must match actual git tags or release-please blocks.

### `release-please-config.json`
Pipeline behavior:
- Monorepo with linked versions (server + ui bump together)
- Release PR title: `chore(${branch}): release ${version}`
- Tag format: `vX.Y.Z` (no component prefix)
- UI skips GitHub Release (server only)

### Workflow Triggers Summary

| Workflow | Triggers | Purpose |
|----------|----------|---------|
| `ci.yml` | Push/PR to main (non-docs) | Lint, test, type-check |
| `pr-title.yml` | Pull request opened/edited | Validate Conventional Commits title |
| `release-please.yml` | Push to main | Create/update release PR |
| `release.yml` | Push to main, PR to main, `v*` tags | Build Docker image |
| `codeql.yml` | Push/PR to main, schedule | Security scanning |
| `docker-test.yml` | Push/PR to main | Test Docker build |
| `stale.yml` | Schedule | Mark stale issues/PRs |

## Emergency Procedures

### Force-Create a Release Manually

**When**: Release-please completely broken, need to ship NOW

**Steps**:
```bash
# 1. Manually update versions
cd server && npm version <NEW_VERSION> --no-git-tag-version
cd ../ui && npm version <NEW_VERSION> --no-git-tag-version

# 2. Update manifest
echo '{"server": "<NEW_VERSION>", "ui": "<NEW_VERSION>"}' > .release-please-manifest.json

# 3. Update CHANGELOG.md manually (optional but recommended)

# 4. Commit on a branch
git checkout -b chore/manual-release-<NEW_VERSION>
git add server/package.json ui/package.json .release-please-manifest.json CHANGELOG.md
git commit -m "chore: manual release <NEW_VERSION>"

# 5. Open PR titled "chore: manual release <NEW_VERSION>"
gh pr create --title "chore: manual release <NEW_VERSION>" --body "Manual release due to <REASON>"

# 6. Merge PR

# 7. Create tag manually
git checkout main && git pull
git tag v<NEW_VERSION>
git push origin v<NEW_VERSION>

# 8. Create release
gh release create v<NEW_VERSION> --title "v<NEW_VERSION>" \
  --notes "See CHANGELOG.md" --latest
```

**Caution**: This bypasses release-please. Use only in emergencies.

### Unprotect Main (Emergency)

**When**: Absolutely must push directly to main (broken state, hotfix)

```bash
# 1. Remove protection
gh api -X DELETE "repos/ismail-kattakath/mcp-gateway/branches/main/protection"

# 2. Push your fix
git push origin main

# 3. Re-apply protection (REQUIRED AFTER)
gh api -X PUT "repos/ismail-kattakath/mcp-gateway/branches/main/protection" \
  -F required_status_checks[strict]=true \
  -F "required_status_checks[contexts][]=validate-title" \
  -F required_pull_request_reviews[required_approving_review_count]=0 \
  -F required_linear_history=true \
  -F allow_force_pushes=false \
  -F allow_deletions=false \
  -F enforce_admins=true
```

## Verification Checklist

After diagnosing/fixing release issues, verify:

- [ ] `.release-please-manifest.json` matches actual git tags
- [ ] No merged release PRs with `autorelease: pending` label
- [ ] Latest tag corresponds to latest release
- [ ] Docker image exists at `ghcr.io/ismail-kattakath/mcp-gateway:<VERSION>`
- [ ] `RELEASE_PLEASE_TOKEN` secret exists
- [ ] Branch protection includes `validate-title` check

## Quick Reference: Common Commands

```bash
# Current state snapshot
gh release list --limit 3
git tag --sort=-version:refname | head -5
gh pr list --state open --label "autorelease: pending"
cat .release-please-manifest.json

# Recent activity
gh run list --limit 10
gh pr list --state merged --limit 5

# Workflow logs
gh run list --workflow="release-please.yml" --limit 3
gh run view <RUN_ID> --log

# Manual tag creation (unblock release-please)
git tag v<VERSION> <COMMIT_SHA>
git push origin v<VERSION>
gh release create v<VERSION> --title "v<VERSION>" --target <COMMIT_SHA>

# Docker verification
docker pull ghcr.io/ismail-kattakath/mcp-gateway:latest
docker images | grep mcp-gateway
```

## Additional Resources

For complete documentation:
- **`../../CONTRIBUTING.md`** - Full release process documentation
- **`../../CLAUDE.md`** - Project architecture and conventions
- **`.github/workflows/`** - All workflow definitions

## Version History

- **v1.0.0** (2026-06-08): Initial release navigator skill based on actual CI/CD implementation and real-world unblocking experience
