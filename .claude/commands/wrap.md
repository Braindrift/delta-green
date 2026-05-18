---
description: Wrap up the current ticket — smoke tests, commit, push, PR, Linear update, handoff text.
argument-hint: (no arguments needed; infers ticket from branch name)
---

# Wrap up the current ticket

Follow the `ticket-workflow` skill's wrap phase. Infer the ticket ID from
the current branch (`sjoblomerik/del-XX-...`). If the branch doesn't match
that pattern, ask which ticket we're wrapping.

Run in order. Pause at the marked checkpoints.

## 0. Pre-flight: tools sanity check

Run one command to verify the tools this flow needs:

```bash
which gh && which git && (which npx || echo "npx missing")
```

If `gh` is missing, **skip to the manual PR path in step 5** (don't try
`gh pr create` and watch it fail). If `git` is missing, abort — something
is very wrong. If `npx` is missing and this is a migration ticket, abort
and tell Erik to fix node/npm.

Don't narrate this check unless something fails. If everything passes,
move silently to step 1.

## 1. Pre-flight checks (auto, no pause)

- `git status` — confirm only the expected files are modified.
- `npm run lint` (if it exists) and `npx tsc --noEmit` for TS work.
- For schema work: re-read the migration once for a final sanity-check
  (no `BEGIN`/`COMMIT` wrappers, idempotent where it should be, comment
  block explains load-bearing changes).

If anything fails, stop and show the error.

## 2. Apply schema changes (only if migration ticket)

Run `npx supabase db push` against the linked remote. **This is on the
ask-first list** — confirm with Erik before running.

## 3. Smoke tests (auto-run via MCP, pause for OK)

Generate smoke-test SQL per the `ticket-workflow` skill's patterns. For
each block:

- Run via the Supabase MCP `execute_sql`.
- Show the result table inline.
- Briefly note pass/fail for each assertion.

Then wait. **Don't proceed to commit until Erik says the results look
good.**

If `execute_sql` isn't available or fails twice, fall back to generating
the SQL as fenced blocks for manual paste, and flag the MCP issue.

## 4. Commit and push (auto, no pause)

- `git add` only the files this ticket touched.
- `git commit -m "DEL-XX: <one-line summary>"` using the ticket title or a
  cleaner version of it.
- `git push -u origin <current branch>`.

## 5. Open the PR

**The branch is now pushed. From here, the path depends on `gh` availability.**

### Path A — `gh` is available

Write the PR body to a temp file first, then create the PR via
`--body-file`. **Never inline a multi-line markdown body** (it fails
across shells; see CLAUDE.md for the rule).

```bash
# Ensure tmp/ exists and is gitignored
mkdir -p tmp
grep -qxF "tmp/" .gitignore 2>/dev/null || echo "tmp/" >> .gitignore

# Write the PR body
cat > tmp/pr-body.md << 'EOF'
## Summary

- <bullet>
- <bullet>

Closes DEL-XX
EOF

gh pr create \
  --title "DEL-XX: <one-line summary>" \
  --body-file tmp/pr-body.md

# Clean up
rm tmp/pr-body.md
```

Use the PR body template from `ticket-workflow`. Show the PR URL on
success.

### Path B — `gh` not available (caught in step 0)

Don't try `gh`. Output:

> "**`gh` not on PATH — open the PR in the browser:**
> https://github.com/Braindrift/delta-green/pull/new/sjoblomerik/del-XX-...
>
> Suggested title: `DEL-XX: <one-line summary>`
> Suggested body (copy from below):"
>
> ```markdown
> <full PR body>
> ```

Then proceed to step 6. Erik will open the PR himself.

## 6. Merge (PAUSE — ask first)

This is on the ask-first list. Wait for Erik's explicit go-ahead before
running the merge. Confirm Vercel preview deploy is green (via `gh pr
checks <PR#>`) or ask Erik to check.

Prefer the combined form so the remote branch is deleted in the same
round trip:

```bash
gh pr merge <PR#> --squash --delete-branch
```

`--delete-branch` removes the remote branch on GitHub and, when the local
working copy is on the feature branch, also deletes the local branch and
checks out main. Use it by default.

**If step 5 went down path B (no `gh`)**, Erik will merge in the browser.
Wait for his confirmation that the merge landed before moving to step 7.

## 7. Linear update (auto for status, PAUSE for close)

**Only after the PR exists** (either created via `gh` in step 5A, or
confirmed by Erik in step 5B):

- Set the issue to `In Review` if it isn't already, with the PR link as a
  comment.

**After merge confirmation**:

- Ask before flipping the issue to `Done`. Linear closes are on the
  ask-first list.

Do not flip Linear to `In Review` before the PR is open. Status changes
must reflect reality, not intent.

## 8. Branch cleanup (auto, after merge confirmation)

Return the local repo to a clean slate so the next `/ticket` starts from
a healthy state. Run regardless of whether step 6 used `--delete-branch`
— the commands no-op when there's nothing to do.

```bash
# Switch to main and fast-forward.
git checkout main
git pull --ff-only

# Delete the local feature branch if it still exists. `-d` refuses to
# delete unmerged work — that's the safety net. Don't use `-D` without
# checking why `-d` failed.
git branch -d <feature-branch> 2>/dev/null || true

# If the remote branch wasn't deleted as part of `gh pr merge`, delete it
# now. `gh pr merge --delete-branch` covers this in the common path, so
# this command will usually fail-fast with "remote ref does not exist",
# which is fine.
git push origin --delete <feature-branch> 2>/dev/null || true

# Drop any dangling `remotes/origin/...` refs so `git branch -a` is clean.
git fetch --prune
```

Then run `git status` and `git branch -a` once to confirm:

- `main` is current and clean
- the feature branch is gone locally
- the `remotes/origin/<feature-branch>` ref is no longer listed

If any of those fail, stop and surface the diff — don't paper over it.

## 9. Session Handoff paste-text (auto)

Output a fenced block titled `Session Handoff entry — paste into Linear`.
Use the template from `ticket-workflow`. Keep it tight — roughly the size
of the DEL-33 / DEL-34 entries: 10-20 lines of markdown.

**Important: the handoff text describes what *shipped*, not what went
sideways in this session.** Tool failures, recovery steps, scope debates
— none of that goes here. Those belong in step 9.

Do **not** write to the Session Handoff document directly. Erik pastes it.

## 10. Wrap-up summary

A short bullet list:

- What shipped (one line)
- What's flagged for follow-up
- Any issues that came up this session (tool failures, manual steps Erik
  still needs to do, etc.) — separate from the handoff block above
- Suggested next ticket (one line of reasoning, not a paragraph)
