# Delta Green Web App — Claude Working Notes

This file is loaded automatically at the start of every Claude Code session in
this repo. Stable context lives here so it doesn't have to be pasted into
every chat.

---

## Project shape

A two-level web app for running the Delta Green TTRPG online:
**Workspace shell** (campaign list, members, invites, notifications, player
characters) wraps a **Campaign view** (Operations, Subjects, Entities, Events).

Stack: React + TypeScript on Vercel, Supabase (Postgres + Auth + Storage),
Linear for issue tracking, GitHub for code. Tests are smoke-test SQL against
the linked remote Supabase project — no local Postgres.

Current phase: **Phase 3.5 — Campaign Management & Workspace Shell.**
Pre-3.5 the app implicitly assumed one campaign; 3.5 introduces the workspace
layer and makes "current campaign" a route param (`/campaigns/:id/...`)
rather than ambient state.

## Reference URLs

- Repo: <https://github.com/Braindrift/delta-green>
- Supabase: <https://supabase.com/dashboard/project/ijfrouzzfnsqbundknug>
- Vercel: <https://vercel.com/braindrift-s-projects/delta-green>
- Linear board: <https://linear.app/deltagreen/team/DEL/active>
- Design doc: <https://linear.app/deltagreen/document/design-document-delta-green-web-app-2e21e799fc36>
- Task index: <https://linear.app/deltagreen/document/task-index-54b6f7ae56b7>

---

## How we work

The repo is your filesystem. There's no zip snapshot, no Downloads folder
dance — write files directly, run commands directly. Local path is
`E:\Projects\ProjectsWebApps\delta-green` on Windows; you're already there
when the session starts.

### Slash commands

- **`/ticket DEL-XX`** — start work on a Linear ticket. Reads the issue,
  scans relevant code, drafts a plan, asks at most one clarifying question,
  waits for go-ahead.
- **`/wrap`** — end-of-ticket flow. Smoke tests, commit, push, PR, Linear
  status update, generate Session Handoff paste-text.

Definitions live in `.claude/commands/`. The `ticket-workflow` skill holds
the templates these commands reference.

### Auto-approval policy

Auto-approved (just do it):

- File edits, file creation, file moves inside the repo
- Read-only shell commands (`git status`, `git log`, `ls`, `cat`, `npm run
  lint`, `tsc --noEmit`, etc.)
- `git add`, `git commit` on a feature branch
- `git push` to a feature branch (not main)
- Supabase read queries via the MCP
- Linear reads (`get_issue`, `list_issues`, `get_document`)
- Linear writes that *create or update* issues (status changes, descriptions,
  comments, sub-task creation)

Ask first:

- `git push --force`, `git checkout main`, anything touching `main` directly
- `gh pr merge` (any merge, squash or otherwise)
- `npx supabase db push` (schema changes against the remote project)
- `npx supabase db reset` or any destructive Supabase command
- Linear issue closes (state → Done) and any **document** writes
- Deleting branches, files outside the repo, or anything irreversible

When in doubt, ask. The cost of a confirmation prompt is much smaller than
the cost of reverting a bad merge.

### Style during exploration

Don't narrate every tool call. Skip *"Now let me check the seed structure…"*
between every `view`. Batch the reads silently and summarise once at the end
of the discovery phase. Bullet the plan, ask the question if there is one,
wait.

Output budget for the planning phase of a typical ticket: ≤ 30 lines before
the first user response. If a plan needs more than that, the ticket is
probably an epic and should be flagged for breakdown.

---

## Linear contract (token-saving rules)

The expensive thing about Linear isn't issue updates — those are fine and
cheap. The expensive thing is the **Session Handoff document** (`22370e7531bd`):
it's long, frequently re-fetched, and full-document replaces are token-heavy.

Rules:

1. **Never read the Session Handoff doc automatically.** If you think you
   need it for context, ask: *"Want me to pull the Session Handoff, or can
   you summarise the relevant part?"* Often the right answer is "summarise".
2. **Never write to the Session Handoff doc.** `/wrap` ends by giving you a
   ~10-line paste-text block. Erik pastes it manually.
3. **Linear issue writes are fine.** Status updates, PR links, comments on
   the ticket itself — do those without asking, per the auto-approve policy.
4. **Task Index** (`54b6f7ae56b7`) — `get_document` it freely for title
   scans (it's small). Update via `save_document` only when issues are
   created, renamed, or closed in this session, and bundle the update into
   a single write at the end.

If a Linear MCP call returns more than ~500 lines of output, stop and ask
what we actually need before continuing. Don't dump it into context.

---

## Skills

These exist in the workspace and trigger automatically:

- **`project-manager`** — Linear operations, ticket writing, phase placement,
  epic breakdown, ripple detection. Source of truth for the priority and
  label conventions.
- **`database-engineer`** — Supabase schema, migrations, RLS, indexes. Holds
  the canonical `references/schema.sql` and `references/seed.sql` (refreshed
  at the end of each migration ticket).
- **`ticket-workflow`** — the end-to-end implementation lifecycle these
  slash commands sit on top of. Holds the smoke-test patterns, commit
  message format, PR body template, and Session Handoff entry template.

When work crosses a domain (schema + UI + Linear), expect more than one
skill to trigger — that's fine.

---

## Smoke tests

Smoke tests run against the linked remote Supabase project via the
`Supabase` MCP (`execute_sql`), not by pasting into the dashboard SQL
editor. Workflow:

1. Generate the smoke-test SQL inline.
2. Run it via `execute_sql`.
3. Show the result table.
4. Wait for Erik's OK before proceeding to commit/push.

If the MCP `execute_sql` isn't available or fails twice, fall back to
generating the SQL as a fenced block for manual paste — but flag that
the MCP path is broken so we can fix it.

---

## When something goes wrong

- A command fails once: try one alternative.
- A command fails twice: stop, show the error, ask. Don't spelunk through
  stack traces unprompted — Erik prefers approve/reject over debug-with-it.
- A plan turns out to be wrong mid-implementation: stop, summarise what
  changed, propose the revised plan, wait for go-ahead.
- Scope creeps: name the creep, ask whether to absorb it into this ticket
  or file a follow-up.

---

## File hygiene

- Migration filenames: `supabase/migrations/<UTC timestamp>_<snake_case>.sql`
- Branch names: `sjoblomerik/del-XX-<short-kebab-slug>` (Linear suggests this)
- Commit message: `DEL-XX: <one-line summary>` — plain, no scope prefixes
- PR body: short summary + bullet list of what shipped + a "closes DEL-XX" line
