# Root Cause Analysis: Why Docker Image Was Built from Old Commit

**Date:** 2026-06-08  
**Issue:** Docker image `ghcr.io/ismail-kattakath/mcp-gateway:latest` was missing stdio transport functionality  
**Impact:** Users couldn't use auto-spawn mode with `.mcp.json` configuration

---

## Executive Summary

The Docker image `:latest` tag was built from commit `09c4012` (v1.1.0 release) at 12:09 PM, but **critical stdio transport functionality was merged 29 minutes later** at 12:38 PM in PR #8. This created a gap where the published image was immediately outdated.

**Root Cause:** Feature PRs were merged **after** the release PR, but **before** creating the next release, leaving new features untagged and unpublished.

---

## Timeline of Events (2026-06-08)

```
10:27:26 - PR #1  merged: feat!: rewrite registry to 5-source model
10:41:52 - PR #2  merged: chore: release main
           └─> Creates tag v1.0.0
           └─> Docker image built and published

12:09:26 - PR #7  merged: chore: release main  
           └─> Creates tag v1.1.0 at commit 09c4012
           └─> Docker image built and published
           └─> :latest tag points to this commit

═══════════════════════════════════════════════════════════
THE GAP - Features merged AFTER release but BEFORE next tag
═══════════════════════════════════════════════════════════

12:29:59 - PR #9  merged: build: commit lockfiles and switch to npm ci
           └─> e00314d (not tagged)

12:38:21 - PR #8  merged: feat: multi-transport support + stdio
           └─> c08f535 (not tagged)
           └─> ✨ stdio-transport.ts added
           └─> ✨ Auto-generated API keys added
           └─> ✨ Secure keychain storage added

20:00:20 - PR #10 merged: chore: clean up documentation and ship v2.0.0
           └─> 6d1fe7a (not tagged)
           └─> Title mentions "v2.0.0" but no version bump
           └─> No new release created

═══════════════════════════════════════════════════════════

Current state:
  - HEAD: 6d1fe7a (has stdio)
  - Latest tag: v1.1.0 @ 09c4012 (no stdio)
  - Docker :latest: 09c4012 (no stdio) ❌
  - Gap: 3 untagged commits with major features
```

---

## What Went Wrong

### 1. Release-Then-Feature Pattern (Anti-Pattern)

**What happened:**
- Release PR #7 merged at 12:09, creating v1.1.0
- Feature PR #8 merged at 12:38 (29 minutes later)
- Feature PR #9 merged at 12:30 (21 minutes later)

**Why this is wrong:**
- Features should be merged **before** the release PR
- Once release PR merges, it creates a tag immediately
- Any PRs merged after that are in "limbo" - code is on main but not released

**Correct pattern:**
```
1. Merge feature PRs
2. release-please detects them and opens/updates release PR
3. Review release PR (check version bump, changelog)
4. Merge release PR → tag created → Docker published
```

### 2. Manual "ship v2.0.0" PR Without Version Bump

**What happened:**
- PR #10 titled "ship v2.0.0"  
- But it didn't update package.json or manifest
- Not a release-please PR
- Just documentation cleanup + squashed previous commits

**Why this is wrong:**
- Title implies it's shipping a release, but it's not
- Doesn't trigger version bump or tag creation
- Misleading - developers think v2.0.0 is released but it's not

### 3. No Release PR Opened After Feature Merges

**What happened:**
- After PR #8 and #9 merged (with `feat:` prefix), release-please should have opened a new release PR
- But no release PR appeared

**Possible reasons:**
1. **RELEASE_PLEASE_TOKEN not configured** (see release-please.yml lines 19-31)
   - Without PAT, GITHUB_TOKEN is used
   - GITHUB_TOKEN can't trigger other workflows
   - release-please PR opens but doesn't trigger release.yml
   
2. **Manual intervention disrupted the flow**
   - PR #10 might have manually bumped/reset state
   - release-please might be confused about what to release

---

## Why Docker Image Wasn't Rebuilt

Docker images are **only** built on these triggers (from `.github/workflows/release.yml`):

```yaml
on:
  push:
    branches: [main]        # Builds :edge tag (not :latest)
    tags: ['v*.*.*']        # Builds :latest tag ✅
  pull_request:             # Test build (not pushed)
  workflow_dispatch:        # Manual trigger
```

**Key insight:** `:latest` tag is **only** applied when a `v*.*.*` tag is pushed (line 54):
```yaml
type=raw,value=latest,enable=${{ startsWith(github.ref, 'refs/tags/v') }}
```

**What this means:**
- Merging to main → builds `:edge` tag
- Creating version tag (v1.2.0) → builds `:latest` and `:1.2.0` tags
- Since no tag was created after stdio merged, `:latest` stayed old

---

## Impact Analysis

### What Was Missing from Published Image

| Feature | Commit | Status in :latest |
|---------|--------|-------------------|
| stdio transport | c08f535 | ❌ Missing |
| Auto-generated API keys | c08f535 | ❌ Missing |
| Secure keychain storage | c08f535 | ❌ Missing |
| npm lockfiles | e00314d | ❌ Missing |
| Updated docs | 6d1fe7a | ❌ Missing |

### User Impact

**Before fix:**
- Users following README quick-start got `:latest` = 09c4012
- Image had no stdio transport
- `.mcp.json` auto-spawn config didn't work
- Gateway started HTTP server instead of stdio mode
- Claude Code couldn't communicate with gateway

**After building from HEAD:**
- All features present
- stdio transport works perfectly
- Auto-spawn mode functional
- 152 tools available from 2 servers

---

## How This Should Have Worked

### Correct Workflow

```
Developer:
  1. Create feature branch
  2. Implement stdio transport
  3. Open PR #8 with title: "feat: multi-transport support"
  4. Merge PR #8 to main
     └─> release-please detects "feat:" prefix
     └─> Opens/updates release PR automatically

Developer:
  5. Review release PR
     └─> Check version bump (1.1.0 → 1.2.0 for feat)
     └─> Check CHANGELOG.md
     └─> Verify Docker will build
  
  6. Merge release PR
     └─> release-please creates tag v1.2.0
     └─> Tag push triggers release.yml workflow
     └─> Docker image built from v1.2.0 (includes stdio)
     └─> Image published with :latest and :1.2.0 tags
```

**Timeline with correct flow:**
```
12:09 - PR #7 merged (release v1.1.0)
12:30 - PR #9 merged (feat: build updates)
12:38 - PR #8 merged (feat: stdio transport)
        └─> release-please opens new release PR
        
13:00 - Developer reviews and merges release PR
        └─> Tag v1.2.0 created
        └─> Docker built from v1.2.0 (includes stdio) ✅
        └─> :latest updated to v1.2.0 ✅
```

---

## Root Causes

### Primary Root Cause
**Feature PRs merged AFTER release PR instead of BEFORE**

This is a **workflow ordering issue**. The pattern should be:
1. Accumulate features on main
2. release-please watches and updates release PR
3. Merge release PR when ready to ship

Instead, what happened:
1. Release PR merged prematurely (v1.1.0)
2. Features merged immediately after
3. No new release created
4. Features stuck in limbo on main

### Contributing Factors

1. **No PR merge discipline**
   - Nothing prevents merging features right after a release
   - Developers don't know which PRs are "in" vs "out" of next release
   - No "feature freeze" between release PR open and merge

2. **Confusing PR titles**
   - PR #10 says "ship v2.0.0" but doesn't actually ship
   - Misleading for developers and reviewers

3. **Possible RELEASE_PLEASE_TOKEN issue**
   - Comments in workflow suggest PAT might not be configured
   - Would prevent automatic release PR creation

4. **No monitoring for untagged commits**
   - No alert when commits pile up on main without a release
   - 3 commits accumulated over 8 hours (12:09 → 20:00)

---

## Prevention Strategies

### 1. Implement Feature Freeze Process

**Before merging any release PR:**
```
1. Announce "feature freeze for v1.2.0"
2. Hold all feat:/fix: PRs
3. Merge only docs/chore PRs
4. Review and merge release PR
5. Verify Docker image published
6. Lift feature freeze
```

### 2. Add Pre-Release Checklist

Create `.github/PULL_REQUEST_TEMPLATE/release.md`:
```markdown
## Release Checklist

Before merging this release PR:

- [ ] No feature PRs are pending merge
- [ ] All desired features are already on main
- [ ] CI passes
- [ ] CHANGELOG.md is accurate
- [ ] Version bump is correct
- [ ] Docker workflow will trigger (tag push)

After merging:
- [ ] Wait for Docker workflow to complete
- [ ] Verify :latest tag updated on ghcr.io
- [ ] Test image: `docker run ghcr.io/.../mcp-gateway:latest`
```

### 3. Verify RELEASE_PLEASE_TOKEN

**Check if PAT is configured:**
```bash
gh secret list | grep RELEASE_PLEASE_TOKEN
```

**If missing:**
1. Create fine-grained PAT with:
   - contents: write
   - pull-requests: write  
   - issues: write
2. Save as `RELEASE_PLEASE_TOKEN` repo secret
3. This allows release-please tags to trigger Docker workflow

### 4. Add GitHub Actions Protection

**Branch protection rules:**
- Require status checks before merge
- Add check: "Is there an open release PR?"
- If yes, block feat:/fix: PRs until release merges

**Implementation:**
```yaml
# .github/workflows/check-release-freeze.yml
name: Check Release Freeze
on: pull_request

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - name: Check if release PR is open
        run: |
          OPEN_RELEASE=$(gh pr list --search "chore(main): release" --state open --json number)
          if [ "$OPEN_RELEASE" != "[]" ]; then
            if [[ "${{ github.event.pull_request.title }}" =~ ^(feat|fix): ]]; then
              echo "❌ Release PR is open. Feature/fix PRs blocked until release ships."
              exit 1
            fi
          fi
```

### 5. Automated Untagged Commit Detector

**Add monitoring workflow:**
```yaml
# .github/workflows/untagged-commits.yml
name: Check Untagged Commits
on:
  schedule:
    - cron: '0 */6 * * *'  # Every 6 hours

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      
      - name: Check for untagged commits
        run: |
          UNTAGGED=$(git log $(git describe --tags --abbrev=0)..HEAD --oneline | wc -l)
          if [ "$UNTAGGED" -gt 5 ]; then
            echo "⚠️  $UNTAGGED commits on main without a release tag"
            echo "Consider opening a release PR"
            # Post to Slack/Discord/etc
          fi
```

### 6. Document Release Process

**Add to CONTRIBUTING.md:**
```markdown
## Release Process

### When to Release

release-please automatically opens a release PR when it detects:
- `feat:` commits → minor version bump
- `fix:` commits → patch version bump  
- `feat!:` or `BREAKING CHANGE:` → major version bump

### How to Release

1. **Review the release PR** (titled "chore(main): release X.Y.Z")
   - Check version bump is correct
   - Review CHANGELOG.md changes
   - Ensure all desired features are included

2. **Verify no pending feature PRs**
   - Don't merge features right after a release
   - Let release-please include them in next release

3. **Merge the release PR**
   - Creates git tag automatically
   - Triggers Docker build
   - Publishes to ghcr.io

4. **Verify deployment**
   - Check GitHub Actions completed
   - Test: `docker pull ghcr.io/.../mcp-gateway:latest`
   - Verify version: `docker run --rm ghcr.io/.../mcp-gateway:latest cat /app/server/package.json`

### ❌ Anti-Patterns to Avoid

- ❌ Merging feature PRs immediately after a release
- ❌ Creating manual "ship vX.Y.Z" PRs
- ❌ Editing version numbers manually
- ❌ Bypassing release-please process
```

---

## Immediate Action Items

### Short Term (Now)

1. ✅ Build new Docker image from HEAD (completed - test-stdio)
2. ⏳ Tag HEAD as v1.2.0 or v2.0.0
3. ⏳ Push tag to trigger official Docker build
4. ⏳ Verify :latest tag updates on ghcr.io

### Medium Term (This Week)

1. ⏳ Verify RELEASE_PLEASE_TOKEN is configured
2. ⏳ Add release checklist template
3. ⏳ Document release process in CONTRIBUTING.md
4. ⏳ Add untagged-commits monitoring

### Long Term (Next Sprint)

1. ⏳ Implement feature-freeze check
2. ⏳ Add branch protection rules
3. ⏳ Create release runbook
4. ⏳ Train team on release process

---

## Lessons Learned

1. **Releases are snapshots** - Once a release tag is created, it's immutable. New features need a new release.

2. **Timing matters** - Merging features after a release PR creates a gap. Feature PRs should land before release PRs.

3. **Automation needs guardrails** - release-please is automatic, but developers need to understand when/how it triggers.

4. **:latest is not "main"** - The `:latest` Docker tag points to the latest **release**, not the latest **commit** on main.

5. **PAT vs GITHUB_TOKEN** - Using GITHUB_TOKEN for release-please prevents workflow chaining. Always use a PAT.

---

## Conclusion

The issue occurred because **feature PRs were merged after the release PR**, leaving new features untagged and unpublished. This is a **process issue**, not a technical bug.

**To prevent recurrence:**
- Establish feature freeze before release merges
- Add pre-release checklist
- Verify RELEASE_PLEASE_TOKEN configuration
- Monitor for untagged commits
- Document and train team on release process

**The Docker image was not "wrong"** - it correctly reflected the v1.1.0 tag. The problem was that v1.1.0 was tagged **before** stdio transport was merged, and no subsequent release was created to include the new features.
