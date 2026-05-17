---
description: Wrap up the current ticket — smoke tests, commit, push, PR, Linear update, handoff text.
argument-hint: (no arguments needed; infers ticket from branch name)
---

# Wrap up the current ticket

Follow the `ticket-workflow` skill's wrap phase. Infer the ticket ID from
the current branch (`sjoblomerik/del-XX-...`). If the branch doesn't match
that pattern, ask which ticket we're wrapping.

Run in order. Pause at the marked checkpoints.

## 1. Pre-flight checks (auto, no pause)

- `git status` — confirm only the expected files are modified.
- `npm run lint` (if it exists) and `tsc --noEmit` for TS work.
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

## 5. Open the PR (auto, no pause)

`gh pr create` with:

- Title: `DEL-XX: <one-line summary>`
- Body: the PR body template from `ticket-workflow` skill, filled in.
- Ends with `Closes DEL-XX` so Linear auto-closes on merge.

Show the PR URL.

## 6. Merge (PAUSE — ask first)

This is on the ask-first list. Wait for Erik's explicit go-ahead before
running `gh pr merge --squash`. Confirm Vercel preview deploy is green
before merging (or ask Erik to check).

## 7. Linear update (auto for status, PAUSE for close)

- Set the issue to `In Review` if it isn't already, with the PR link as
  a comment.
- After merge confirmation: ask before flipping the issue to `Done`. Linear
  closes are on the ask-first list.

## 8. Session Handoff paste-text (auto, last step)

Output a fenced block titled `Session Handoff entry — paste into Linear`.
Use the template from `ticket-workflow`. Keep it tight — roughly the size
of the DEL-33 / DEL-34 entries: 10-20 lines of markdown.

Do **not** write to the Session Handoff document directly. Erik pastes it.

## 9. Wrap-up summary

A short bullet list: what shipped, what's flagged for follow-up, suggested
next ticket (one line of reasoning, not a paragraph).
