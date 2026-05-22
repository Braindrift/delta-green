---
description: Wrap up the current ticket — verify DoD, smoke tests, commit, push, PR, Linear update, handoff text.
argument-hint: (no arguments needed; infers ticket from branch name)
---

# Wrap up the current ticket

Follow the `ticket-workflow` skill's wrap phase. Infer the ticket ID from
the current branch (`sjoblomerik/del-XX-...`). If the branch doesn't match
that pattern, ask which ticket we're wrapping.

**Context note:** `/wrap` always runs after `/ticket` in the same session.
The implementation is already done. Do NOT re-read the issue or re-scan the
repo — you have that context. Do NOT re-run lint or tsc unless a specific
step below calls for it. Trust the implementation session; only verify what
is genuinely new from this point forward.

Run in order. Pause at the marked checkpoints.

## 0. Pre-flight: tools sanity check

Run one command to verify the tools this flow needs:

```bash
which gh && which git && (which npx || echo "npx missing")
```

If `gh` is missing, **skip to the manual PR path in step 4** (don't try
`gh pr create` and watch it fail). If `git` is missing, abort — something
is very wrong. If `npx` is missing and this is a migration ticket, abort
and tell Erik to fix node/npm.

Don't narrate this check unless something fails. If everything passes,
move silently to step 1.

## 1. DoD + Verification Steps check (PAUSE)

Re-read the ticket's Definition of Done and Verification Steps from your
session context (do NOT fetch the issue again — you read it at `/ticket`
time).

Present the Verification Steps as a checklist for Erik to run manually:

```
Before we commit, please verify:

[ ] <step 1 from ticket's Verification Steps>
[ ] <step 2>
[ ] ...

Any failures? Or ready to proceed?
```

**Wait for Erik's go-ahead.** If he flags a failure, that's a bug to fix
before wrapping — don't proceed to commit. If the ticket has no Verification
Steps (older tickets, pure data/infrastructure work), skip this pause and
move to step 2 automatically.

## 2. Smoke tests (migration tickets only — auto-run, PAUSE for results)

Skip entirely if this ticket has no schema changes.

Generate smoke-test SQL per the `ticket-workflow` skill's patterns. For
each block:

- Run via the Supabase MCP `execute_sql`.
- Show the result table inline.
- Briefly note pass/fail for each assertion.

**Wait for Erik to confirm results look good before proceeding.**

If `execute_sql` isn't available or fails twice, fall back to generating
the SQL as fenced blocks for manual paste, and flag the MCP issue.

## 3. git status check (auto, no pause)

Run `git status` once to confirm only expected files are modified.

If there are unexpected files (test artifacts, temp files, anything not
in the ticket's Ships list), surface them and ask before staging.
If clean, proceed silently.

## 4. Commit and push (auto, no pause)

- `git add` only the files this ticket touched.
- `git commit -m "DEL-XX: <one-line summary>"` using the ticket title or a
  cleaner version of it.
- `git push -u origin <current branch>`.

## 5. Open the PR

**The branch is now pushed. Path depends on `gh` availability (checked in step 0).**

### Path A — `gh` is available

Write the PR body to a temp file first, then create the PR via
`--body-file`. **Never inline a multi-line markdown body.**

```bash
mkdir -p tmp
grep -qxF "tmp/" .gitignore 2>/dev/null || echo "tmp/" >> .gitignore

cat > tmp/pr-body.md << 'EOF'
## Summary

- <bullet>
- <bullet>

Closes DEL-XX
EOF

gh pr create \
  --title "DEL-XX: <one-line summary>" \
  --body-file tmp/pr-body.md

rm tmp/pr-body.md
```

Use the PR body template from `ticket-workflow`. Show the PR URL on success.

### Path B — `gh` not available (caught in step 0)

Output:

> "**`gh` not on PATH — open the PR in the browser:**
> https://github.com/Braindrift/delta-green/pull/new/sjoblomerik/del-XX-...
>
> Suggested title: `DEL-XX: <one-line summary>`
> Suggested body (copy from below):"
>
> ```markdown
> <full PR body>
> ```

## 6. Merge (PAUSE — ask first)

Wait for Erik's explicit go-ahead. Confirm Vercel preview deploy is green
(via `gh pr checks <PR#>`) or ask Erik to check.

```bash
gh pr merge <PR#> --squash --delete-branch
```

**If step 5 went down path B**, Erik will merge in the browser. Wait for
his confirmation that the merge landed before moving to step 7.

## 7. Linear update (auto for status, PAUSE for close)

**Only after the PR exists:**
- Set the issue to `In Review` with the PR link as a comment.

**After merge confirmation:**
- Ask before flipping the issue to `Done`.

## 8. Branch cleanup (auto, after merge confirmation)

```bash
git checkout main
git pull --ff-only
git branch -d <feature-branch> 2>/dev/null || true
git push origin --delete <feature-branch> 2>/dev/null || true
git fetch --prune
```

Run `git status` and `git branch -a` once to confirm main is current,
feature branch is gone locally and remotely.

## 9. Session Handoff paste-text (auto)

Output a fenced block titled `Session Handoff entry — paste into Linear`.
Use the template from `ticket-workflow`. Keep it tight — ~10-20 lines.

The handoff describes what *shipped*, not session mechanics. No tool
failures, no recovery steps, no "Erik still needs to do X" — those go
in the wrap-up summary below.

Do **not** write to the Session Handoff document directly. Erik pastes it.

## 10. Wrap-up summary

Short bullet list — ephemeral context for right now, not for the record:

- What shipped (one line)
- Verification steps that need Erik's manual attention (if any remain)
- Any tool failures or manual steps Erik still needs to do
- Follow-up issues to file (if any surfaced during implementation)

Do NOT suggest the next ticket here. That's a planning conversation, not
part of wrapping this one.
