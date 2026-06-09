# Troubleshooting Patterns for MCP Gateway Release Pipeline

This document contains detailed diagnostic patterns and solutions for common release pipeline issues.

## Pattern 1: Version Drift Between Manifest and Reality

### Symptoms
- `.release-please-manifest.json` shows vX.Y.Z
- Latest git tag is vA.B.C (different version)
- Release-please refuses to create new PRs
- Logs show "untagged, merged release PRs outstanding"

### Root Cause
Release PR was merged but tag was never created, usually due to:
1. `GITHUB_TOKEN` used instead of `RELEASE_PLEASE_TOKEN`
2. Manual manifest edit without corresponding tag
3. Failed GitHub API call during release creation

### Diagnostic Commands
```bash
# Compare manifest vs actual tags
echo "Manifest versions:"
cat .release-please-manifest.json | jq .

echo "\nActual tags:"
git tag --sort=-version:refname | head -5

echo "\nMissing tags:"
MANIFEST_SERVER=$(jq -r '.server' .release-please-manifest.json)
MANIFEST_UI=$(jq -r '.ui' .release-please-manifest.json)
git tag | grep -q "v$MANIFEST_SERVER" || echo "  v$MANIFEST_SERVER (server)"
git tag | grep -q "v$MANIFEST_UI" || echo "  v$MANIFEST_UI (ui)"

# Find untagged release PRs
gh pr list --state merged --label "autorelease: pending" \
  --json number,title,mergeCommit,mergedAt \
  --jq '.[] | "PR #\(.number): \(.title) (merged: \(.mergedAt), commit: \(.mergeCommit.oid))"'
```

### Resolution Steps

1. **Identify the commit to tag:**
   ```bash
   # If release PR exists
   RELEASE_PR=$(gh pr list --state merged --label "autorelease: pending" --limit 1 --json number --jq '.[0].number')
   COMMIT=$(gh pr view $RELEASE_PR --json mergeCommit --jq '.mergeCommit.oid')
   
   # Or manually find the "chore(main): release" commit
   git log --oneline --grep="chore(main): release" -5
   ```

2. **Create missing tag:**
   ```bash
   VERSION=$(jq -r '.server' .release-please-manifest.json)
   git tag v$VERSION $COMMIT
   git push origin v$VERSION
   ```

3. **Create GitHub release:**
   ```bash
   gh release create v$VERSION \
     --title "v$VERSION" \
     --notes "Release v$VERSION - see CHANGELOG.md for details" \
     --target $COMMIT
   ```

4. **Verify unblock:**
   ```bash
   # Trigger release-please by merging any PR
   # Or wait for next merge to main
   # Check logs should no longer show "untagged" warning
   ```

### Prevention
- Ensure `RELEASE_PLEASE_TOKEN` secret is configured
- Never manually edit `.release-please-manifest.json` without creating corresponding tag
- Monitor release-please.yml runs for PAT token warnings

## Pattern 2: Silent Release-Please Failures

### Symptoms
- PRs merge to main with `feat:`/`fix:` prefixes
- No release PR appears
- No errors in GitHub UI
- release-please.yml shows "success" status

### Root Cause
Release-please silently skips PR creation when:
1. All commits since last release are non-releasable (`chore:`, `docs:`, etc.)
2. Commits are malformed and unparseable
3. Plugin configuration prevents release (e.g., `skip-github-pull-request: true`)

### Diagnostic Commands
```bash
# Check releasable commits since last release
LAST_TAG=$(git describe --tags --abbrev=0)
echo "Commits since $LAST_TAG:"
git log $LAST_TAG..HEAD --oneline

echo "\nReleasable commits (feat/fix/breaking):"
git log $LAST_TAG..HEAD --oneline | grep -E "^[a-f0-9]+ (feat|fix|feat!|fix!)" || echo "  None found"

echo "\nNon-releasable commits:"
git log $LAST_TAG..HEAD --oneline | grep -E "^[a-f0-9]+ (chore|docs|test|refactor|ci|build|perf|revert)"

# Check for unparseable commits in logs
RUN_ID=$(gh run list --workflow="release-please.yml" --limit 1 --json databaseId --jq '.[0].databaseId')
gh run view $RUN_ID --log | grep "could not be parsed"
```

### Resolution

**If no releasable commits:**
- Expected behavior, no action needed
- Wait for `feat:`/`fix:` commits

**If releasable commits exist:**
1. Check release-please logs for parsing errors
2. Verify commits follow Conventional Commits format
3. Check for blocking conditions in logs ("aborting", "skipping")

**If commits unparseable:**
- Identify malformed commits from logs
- Cherry-pick with correct format:
  ```bash
  git checkout -b fix/reformat-commit
  git cherry-pick <SHA> --no-commit
  git reset HEAD~1
  git commit -m "feat: properly formatted message"
  gh pr create --title "feat: properly formatted message"
  ```

## Pattern 3: Docker Build Triggers But Fails

### Symptoms
- Tag created successfully
- release.yml workflow fires
- Build fails partway through
- Docker image not published

### Common Failure Points

#### 3a: Multi-arch Build Failure
```
Error: failed to solve: process "/bin/sh -c npm ci" did not complete successfully
```

**Cause**: QEMU emulation issues with arm64 build

**Diagnostic:**
```bash
# Check which platform failed
gh run view <RUN_ID> --log | grep -A 10 "linux/arm64\|linux/amd64"
```

**Resolution:**
- Usually transient, re-run workflow:
  ```bash
  gh run rerun <RUN_ID>
  ```
- If persistent, check for arm64-specific dependencies in package-lock.json

#### 3b: GHCR Authentication Failure
```
Error: failed to authorize: failed to fetch anonymous token
```

**Cause**: GITHUB_TOKEN lacks `packages: write` permission

**Diagnostic:**
```bash
# Check workflow permissions
gh api repos/ismail-kattakath/mcp-gateway/actions/workflows/release.yml --jq '.permissions'
```

**Resolution:**
- Verify release.yml has:
  ```yaml
  permissions:
    contents: read
    packages: write
  ```

#### 3c: Build Context Issues
```
Error: failed to read dockerfile: open /Dockerfile: no such file or directory
```

**Cause**: Dockerfile not in expected location or context path wrong

**Diagnostic:**
```bash
# Verify Dockerfile at root
ls -la Dockerfile

# Check release.yml build context
grep -A 5 "docker/build-push-action" .github/workflows/release.yml | grep context
```

**Resolution:**
- Ensure Dockerfile is at repo root
- Verify `context: .` in release.yml

### Recovery Procedure

1. **Fix underlying issue** (see above)

2. **Re-trigger build:**
   ```bash
   # Option 1: Re-run failed workflow
   gh run rerun <RUN_ID>
   
   # Option 2: Force re-push tag
   git tag -d v<VERSION>
   git push origin :refs/tags/v<VERSION>
   git tag v<VERSION> <COMMIT>
   git push origin v<VERSION>
   ```

3. **Verify success:**
   ```bash
   docker pull ghcr.io/ismail-kattakath/mcp-gateway:<VERSION>
   docker images | grep mcp-gateway
   ```

## Pattern 4: Release PR Merged But No Follow-Up

### Symptoms
- Release PR (titled `chore(main): release X.Y.Z`) merged
- No GitHub release created
- No git tag pushed
- `autorelease: pending` label still present

### Root Cause
Release-please.yml didn't detect the merged release PR on post-merge run, usually due to:
1. PAT token issue (GITHUB_TOKEN used, can't trigger workflows)
2. Label removed prematurely
3. Release-please run failed silently

### Diagnostic Commands
```bash
# Find merged release PR
RELEASE_PR=$(gh pr list --state merged --label "autorelease: pending" --limit 1 --json number,title,mergedAt --jq '.[0]')
echo "Untagged release PR: $RELEASE_PR"

# Check release-please runs after merge
MERGE_TIME=$(echo "$RELEASE_PR" | jq -r '.mergedAt')
gh run list --workflow="release-please.yml" --created ">$MERGE_TIME" --limit 3

# Check latest run logs for release creation
LATEST_RUN=$(gh run list --workflow="release-please.yml" --limit 1 --json databaseId --jq '.[0].databaseId')
gh run view $LATEST_RUN --log | grep -i "creating release\|release created\|tagging"
```

### Resolution

**Manual release creation:**
```bash
# Get release PR details
RELEASE_PR_NUM=$(gh pr list --state merged --label "autorelease: pending" --limit 1 --json number --jq '.[0].number')
COMMIT=$(gh pr view $RELEASE_PR_NUM --json mergeCommit --jq -r '.mergeCommit.oid')
VERSION=$(gh pr view $RELEASE_PR_NUM --json title --jq -r '.title' | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')

# Create tag
git tag v$VERSION $COMMIT
git push origin v$VERSION

# Create release
gh release create v$VERSION \
  --title "v$VERSION" \
  --notes "See CHANGELOG.md for full details" \
  --target $COMMIT \
  --latest

# Remove autorelease: pending label
gh pr edit $RELEASE_PR_NUM --remove-label "autorelease: pending"
```

## Pattern 5: Manifest/package.json Version Mismatch

### Symptoms
- `.release-please-manifest.json` shows vX.Y.Z
- `server/package.json` shows different version
- `ui/package.json` shows different version
- Confusion about "current version"

### Root Cause
- Manual edits to package.json without updating manifest
- Failed release-please update (partial commit)
- Cherry-picking/rebasing across release boundaries

### Diagnostic Commands
```bash
# Compare all version sources
echo "Manifest:"
jq . .release-please-manifest.json

echo "\nServer package.json:"
jq -r '.version' server/package.json

echo "\nUI package.json:"
jq -r '.version' ui/package.json

echo "\nLatest git tag:"
git describe --tags --abbrev=0

echo "\nLatest GitHub release:"
gh release list --limit 1
```

### Resolution

**Determine source of truth:**
1. Latest git tag = actual released version
2. Manifest should match latest tag
3. package.json files should match manifest

**Fix drift:**
```bash
# Get latest tag
LATEST_TAG=$(git describe --tags --abbrev=0)
VERSION=${LATEST_TAG#v}  # Remove 'v' prefix

# Update manifest
echo "{\"server\": \"$VERSION\", \"ui\": \"$VERSION\"}" > .release-please-manifest.json

# Update package.json files
cd server && npm version $VERSION --no-git-tag-version
cd ../ui && npm version $VERSION --no-git-tag-version

# Commit fixes
git checkout -b fix/version-sync
git add .release-please-manifest.json server/package.json ui/package.json
git commit -m "chore: sync versions to $VERSION"
gh pr create --title "chore: sync versions to $VERSION" \
  --body "Fixes version drift between manifest, package.json, and git tags"
```

## Pattern 6: Breaking Change Not Triggering Major Bump

### Symptoms
- PR titled with `feat!:` or `fix!:`
- Release PR created with minor/patch bump instead of major
- Expected v2.0.0, got v1.2.0

### Root Cause
- Breaking change footer used instead of `!` in type:
  ```
  feat: some change
  
  BREAKING CHANGE: this breaks things
  ```
  Release-please may not parse this correctly in PR title format
  
- Commit message format issue after squash merge

### Diagnostic Commands
```bash
# Check how release-please parsed recent commits
RUN_ID=$(gh run list --workflow="release-please.yml" --limit 1 --json databaseId --jq '.[0].databaseId')
gh run view $RUN_ID --log | grep -i "breaking\|major"

# Check actual commit message format
git log --oneline -5
git show <SHA> --format=full
```

### Resolution

**Ensure PR title uses `!` syntax:**
```
feat!: breaking change description
fix!: breaking fix description
```

**NOT footer syntax in PR title** (footer works in commit body, but PR titles become squash commits):
```
# Won't trigger major bump in PR title:
feat: breaking change

BREAKING CHANGE: details
```

**If already merged with wrong bump:**
1. Close the release PR
2. Manually bump to major in new PR:
   ```bash
   # Update versions manually
   echo '{"server": "2.0.0", "ui": "2.0.0"}' > .release-please-manifest.json
   cd server && npm version 2.0.0 --no-git-tag-version
   cd ../ui && npm version 2.0.0 --no-git-tag-version
   
   # Update CHANGELOG.md to reflect breaking change
   # Commit and PR
   ```

## Pattern 7: Worktree/Branch Confusion

### Symptoms
- Working in feature branch or worktree
- Unsure what will happen when PR merges
- Need to predict version bump

### Navigation Strategy

```bash
# Show current location
git branch --show-current
git worktree list

# Preview your PR impact
echo "Your PR title will determine version bump:"
echo "  feat:  → minor (1.0.0 → 1.1.0)"
echo "  fix:   → patch (1.0.0 → 1.0.1)"
echo "  feat!: → major (1.0.0 → 2.0.0)"
echo "  chore: → no bump"

# Check what current main version is
git fetch origin main
git show origin/main:.release-please-manifest.json

# Calculate expected next version based on your PR title
# Example: if main is 1.2.3 and your PR is "feat: ...", next will be 1.3.0
```

### Best Practice
1. Determine PR title BEFORE opening PR
2. Use pr-title.yml validation to confirm format
3. Review release PR before merging (preview CHANGELOG)
4. Merge release PR only when ready to ship

## Diagnostic Script Template

Save this as `.claude/skills/release-navigator/scripts/diagnose-release.sh`:

```bash
#!/usr/bin/env bash
# Quick release pipeline diagnosis script

set -euo pipefail

echo "=== MCP Gateway Release Pipeline Diagnosis ==="
echo

echo "1. Version State:"
echo "  Manifest: $(jq -r '.server' .release-please-manifest.json)"
echo "  Server package.json: $(jq -r '.version' server/package.json)"
echo "  UI package.json: $(jq -r '.version' ui/package.json)"
echo "  Latest git tag: $(git describe --tags --abbrev=0 2>/dev/null || echo 'none')"
echo

echo "2. Open Release PR:"
RELEASE_PR=$(gh pr list --state open --label "autorelease: pending" --json number,title --jq '.[0]' || echo '{}')
if [[ "$RELEASE_PR" == "{}" ]]; then
  echo "  None"
else
  echo "  $(echo "$RELEASE_PR" | jq -r '"PR #\(.number): \(.title)"')"
fi
echo

echo "3. Untagged Release PRs:"
UNTAGGED=$(gh pr list --state merged --label "autorelease: pending" --json number,title --jq '.[] | "PR #\(.number): \(.title)"' || echo '')
if [[ -z "$UNTAGGED" ]]; then
  echo "  None (healthy)"
else
  echo "$UNTAGGED"
fi
echo

echo "4. Recent Commits Since Last Release:"
LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo 'HEAD~10')
echo "  Since $LAST_TAG:"
git log "$LAST_TAG..HEAD" --oneline | head -5
echo

echo "5. Releasable Commits:"
RELEASABLE=$(git log "$LAST_TAG..HEAD" --oneline | grep -E "feat:|fix:|feat!:|fix!:" | wc -l)
echo "  Count: $RELEASABLE"
echo

echo "6. Recent Workflow Runs:"
gh run list --workflow="release-please.yml" --limit 3 --json conclusion,createdAt,displayTitle \
  --jq '.[] | "  \(.displayTitle): \(.conclusion) (\(.createdAt))"'
echo

echo "=== Diagnosis Complete ==="
echo
echo "Next steps:"
if [[ -n "$UNTAGGED" ]]; then
  echo "  ❌ BLOCKED: Untagged release PRs found. Create missing tags."
elif [[ "$RELEASE_PR" != "{}" ]]; then
  echo "  ✅ Ready to ship: Merge release PR when ready"
elif [[ $RELEASABLE -gt 0 ]]; then
  echo "  ⏳ Accumulating: Waiting for more commits or merge next PR to trigger release-please"
else
  echo "  ℹ️  No releasable commits yet. Merge feat:/fix: PRs to trigger release"
fi
```

Usage:
```bash
chmod +x .claude/skills/release-navigator/scripts/diagnose-release.sh
./.claude/skills/release-navigator/scripts/diagnose-release.sh
```
