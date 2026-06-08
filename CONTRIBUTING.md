# Contributing

This repo uses **GitHub Flow** + **Conventional Commits** + **release-please** so that releasing a new version of the Docker image is fully automated.

## The everyday loop

1. Branch off `main`, write code, open a PR back to `main`.
2. **Title the PR using Conventional Commits format** (see below). This is enforced by `.github/workflows/pr-title.yml`.
3. Merge with **squash-merge** (the PR title becomes the squash commit message — release-please reads that).
4. That's it. Don't bump versions manually, don't edit `CHANGELOG.md` by hand.

## Conventional Commits cheat sheet

PR title shape: `<type>: <lowercase subject>` (no scope required).

| Prefix | Use for | Release-please bumps |
|---|---|---|
| `feat:` | New feature | minor (0.1.0 → 0.2.0) |
| `fix:` | Bug fix | patch (0.1.0 → 0.1.1) |
| `feat!:` *or* `fix!:` *or* `<type>: <subject>\n\nBREAKING CHANGE: …` | Breaking change | major (0.1.0 → 1.0.0) |
| `docs:` `chore:` `refactor:` `perf:` `test:` `build:` `ci:` `revert:` | No user-visible change | no bump |

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

| Rule | State |
|---|---|
| Require pull request before merging | ✅ (0 approvals — solo repo) |
| Require linear history | ✅ (squash-merge enforced) |
| Allow force pushes | ❌ |
| Allow deletions | ❌ |
| Enforce on administrators | ✅ (no admin bypass) |
| Required status checks | _none yet — see below_ |

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
