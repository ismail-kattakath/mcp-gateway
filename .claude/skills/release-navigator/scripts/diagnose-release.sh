#!/usr/bin/env bash
# Quick release pipeline diagnosis script for mcp-gateway

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
RELEASE_PR=$(gh pr list --state open --label "autorelease: pending" --json number,title 2>/dev/null | jq -r '.[0] // {}')
if [[ "$RELEASE_PR" == "{}" ]]; then
  echo "  None"
else
  echo "  $(echo "$RELEASE_PR" | jq -r 'if . != {} then "PR #\(.number): \(.title)" else "None" end')"
fi
echo

echo "3. Untagged Release PRs:"
UNTAGGED=$(gh pr list --state merged --label "autorelease: pending" --json number,title 2>/dev/null | jq -r '.[] | "PR #\(.number): \(.title)"' || echo '')
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
RELEASABLE=$(git log "$LAST_TAG..HEAD" --oneline 2>/dev/null | grep -E "feat:|fix:|feat!:|fix!:" | wc -l | tr -d ' ')
echo "  Count: $RELEASABLE"
echo

echo "6. Recent Workflow Runs:"
gh run list --workflow="release-please.yml" --limit 3 --json conclusion,createdAt,displayTitle 2>/dev/null \
  | jq -r '.[] | "  \(.displayTitle): \(.conclusion) (\(.createdAt))"'
echo

echo "=== Diagnosis Complete ==="
echo
echo "Next steps:"
if [[ -n "$UNTAGGED" ]]; then
  echo "  ❌ BLOCKED: Untagged release PRs found. Create missing tags."
  echo "     Run: git tag v<VERSION> <COMMIT_SHA> && git push origin v<VERSION>"
elif [[ "$RELEASE_PR" != "{}" ]] && [[ "$RELEASE_PR" != "None" ]]; then
  echo "  ✅ Ready to ship: Merge release PR when ready"
elif [[ ${RELEASABLE:-0} -gt 0 ]]; then
  echo "  ⏳ Accumulating: Waiting for more commits or merge next PR to trigger release-please"
else
  echo "  ℹ️  No releasable commits yet. Merge feat:/fix: PRs to trigger release"
fi
