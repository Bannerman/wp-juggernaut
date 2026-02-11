# Pull Request Review Process

## Overview

This document defines how PRs are reviewed, labeled, and managed in this repository. PRs are primarily authored by Jules (Google's AI agent) and reviewed by the maintainer (with Claude Code assistance).

---

## Labels

### Review Status Labels

| Label | Color | Meaning |
|-------|-------|---------|
| `ready-to-merge` | Green `#0E8A16` | Reviewed and approved — safe to merge |
| `changes-requested` | Yellow `#E4E669` | Review feedback needs to be addressed |
| `needs-rebase` | Red `#D93F0B` | Branch is stale and needs rebasing against main |
| `superseded` | Gray `#CCCCCC` | Replaced by another PR — should be closed |

### Category Labels

| Label | Color | Meaning |
|-------|-------|---------|
| `performance` | Blue `#1D76DB` | Performance optimization |
| `accessibility` | Purple `#7057FF` | Accessibility improvement |
| `security` | Dark Red `#B60205` | Security-related change |
| `refactor` | Teal `#006B75` | Code refactoring — no behavior change |
| `feature` | Light Blue `#A2EEEF` | New feature or capability |

---

## Review Workflow

### Step 1: Triage

For each open PR, determine its disposition:

- **Ready to merge** — Code is clean, tests pass, no conflicts
- **Changes needed** — Good direction but has issues to fix
- **Superseded** — Another PR does the same thing better → close it
- **Not applicable** — Doesn't fit the project direction → close it

### Step 2: Submit Formal Review

**Always use formal reviews, not regular comments.** This sets the PR status correctly on GitHub and enables Jules to track the review state.

#### For Approved PRs

```bash
gh pr review <number> --approve --body "Approval summary here"
gh pr edit <number> --add-label "ready-to-merge"
```

#### For PRs Needing Changes

Use **inline comments on specific lines** so Jules can find and fix the exact issues. Then submit the review with a summary.

```bash
# Submit review with inline comments pointing to specific files/lines
gh api repos/OWNER/REPO/pulls/<number>/reviews \
  --method POST \
  -f event="REQUEST_CHANGES" \
  -f body="Summary of changes needed" \
  -f 'comments[][path]=src/lib/sync.ts' \
  -f 'comments[][position]=42' \
  -f 'comments[][body]=This should use `unknown` not `any`'
```

Or the simpler approach — submit inline comments individually, then the review:

```bash
# Add inline comment on a specific file
gh api repos/OWNER/REPO/pulls/<number>/comments \
  --method POST \
  -f body="Use \`unknown\` instead of \`any\` per project standards" \
  -f path="src/lib/semver.d.ts" \
  -f commit_id="$(gh pr view <number> --json headRefOid -q .headRefOid)" \
  -f side="RIGHT" \
  -f line=5

# Then submit the overall review
gh pr review <number> --request-changes --body "Summary here"
```

**Important for Jules:** Jules reads inline review comments on specific lines and pushes fixes. General review body summaries give context but inline comments are what Jules acts on. If you want Jules to fix something, put it in an inline comment on the relevant line.

#### For Superseded PRs

```bash
gh pr comment <number> --body "Superseded by #XX which does the same thing plus additional improvements."
gh pr close <number>
```

### Step 3: Apply Labels

```bash
# Review status
gh pr edit <number> --add-label "ready-to-merge"
gh pr edit <number> --add-label "changes-requested"
gh pr edit <number> --add-label "needs-rebase"

# Category (pick one)
gh pr edit <number> --add-label "performance"
gh pr edit <number> --add-label "refactor"
```

### Step 4: After Author Updates

When Jules pushes new commits in response to feedback:

1. GitHub shows "New changes since your review" indicator
2. Re-review the changes
3. If fixed: approve and update label to `ready-to-merge` (remove `changes-requested`)
4. If still has issues: submit new review with remaining feedback

```bash
# Update labels after re-review
gh pr edit <number> --remove-label "changes-requested" --add-label "ready-to-merge"
```

---

## Merge Process

### Merge Order

When multiple PRs are approved, merge in dependency order:
1. PRs that don't touch overlapping files first
2. Simpler/smaller PRs before larger ones
3. After each merge, check if remaining PRs now have conflicts

### Merge Command

```bash
gh pr merge <number> --squash --delete-branch
```

Use `--squash` to keep the main branch history clean. Use `--merge` if you want to preserve individual commits.

### Post-Merge

After merging, check remaining open PRs for new conflicts:
```bash
gh pr list --state open --json number,title,mergeable \
  --jq '.[] | "\(.number) \(.title) - mergeable: \(.mergeable)"'
```

---

## Quick Reference

### List PRs by status
```bash
gh pr list -l ready-to-merge          # Ready to merge
gh pr list -l changes-requested       # Waiting on author
gh pr list -l needs-rebase            # Stale branches
gh pr list --state open               # All open
```

### Common review commands
```bash
gh pr review <n> --approve --body "LGTM"
gh pr review <n> --request-changes --body "See inline comments"
gh pr comment <n> --body "General comment"
gh pr diff <n>                        # View diff locally
gh pr checkout <n>                    # Test locally
```

---

## Anti-Patterns

- **Don't post both a comment AND a review** — Use only formal reviews. Comments are for discussion, reviews are for approval/rejection
- **Don't put all feedback in the review body only** — Jules needs inline comments on specific lines to act on feedback
- **Don't merge without checking conflicts** — After each merge, verify remaining PRs are still mergeable
- **Don't leave PRs without labels** — Every open PR should have both a review status and category label
