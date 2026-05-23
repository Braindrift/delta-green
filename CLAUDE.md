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
- Supabase project ref: `ijfrouzzfnsqbundknug` ([dashboard](https://supabase.com/dashboard/project/ijfrouzzfnsqbundknug))
- Vercel: <https://vercel.com/braindrift-s-projects/delta-green>
- Linear board: <https://linear.app/deltagreen/team/DEL/active>
- Design doc: <https://linear.app/deltagreen/document/design-document-delta-green-web-app-2e21e799fc36>
- Task index: <https://linear.app/deltagreen/document/task-index-54b6f7ae56b7>

---

## Dev environment (confirmed installed)

Erik's machine has these tools on PATH — don't second-guess them:

| Tool | How to call it | Notes |
|---|---|---|
| `node`, `npm` | direct (`node`, `npm`) | Global install |
| `git` | direct (`git`) | Global install |
| `gh` | direct (`gh`) | GitHub CLI, authed |
| Supabase CLI | **`npx supabase`** | NOT a global install — repo convention is `npx supabase ...` always |

**Local Supabase / Docker is not Erik's workflow.** He works directly
against the linked remote project. Never suggest `npx supabase start`,
`supabase db reset` against local, or anything that requires the Docker
stack. The CLI is linked to project ref `ijfrouzzfnsqbundknug`; commands
like `npx supabase db push`, `npx supabase migration list --linked`, and
`npx supabase projects list` all work against the remote.

Repo path on Windows: `E:\Projects\ProjectsWebApps\delta-green`.

---

## Applying schema migrations

Migrations get applied via **`npx supabase db push`**, not via the MCP
`apply_migration` tool. Two paths, two clocks:

- `db push` reads the filename's timestamp and writes that into the remote
  `supabase_migrations.schema_migrations` bookkeeping table.
- `apply_migration` (MCP) stamps with its *own* clock at apply time,
  ignoring the filename.

Mixing the two causes the bookkeeping table to drift away from the local
filenames. Once that happens, the next `db push` refuses to run — which
tempts a fallback to `apply_migration` — which adds more drift. This loop
has bitten us across multiple sessions. Don't restart it.

Standard flow for a migration ticket:

1. **Before writing new SQL**, run `npx supabase migration list --linked`
   to confirm local and remote columns agree. If anything is misaligned,
   repair it with `npx supabase migration repair --status applied <ver>`
   or `--status reverted <ver>` before adding new files on top. `repair`
   only touches the bookkeeping table; it doesn't run or undo SQL.
2. Write the file to `supabase/migrations/<UTC>_<snake_case>.sql`.
3. Apply with `npx supabase db push` (it's in the "Ask first" list — ask
   Erik first per the auto-approval policy below).
4. If `db push` fails, fix the underlying cause. **Do not reach for MCP
   `apply_migration` to bypass it.**

MCP `execute_sql` remains fine for smoke tests, reads, and exploratory
queries — it does not write to the bookkeeping table.

---

## How we work

The repo is your filesystem. Write files directly, run commands directly.

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
- `gh pr create` (creating a PR — merging is separate)

Ask first:

- `git push --force`, `git checkout main`, anything touching `main` directly
- `gh pr merge` (any merge, squash or otherwise)
- `npx supabase db push` (schema changes against the remote project)
- `npx supabase migration repair` (touches the bookkeeping table — ask
  first so Erik can confirm which row gets relabeled)
- Any destructive Supabase command

Don't use:

- **MCP `apply_migration`** — see "Applying schema migrations" above.
  Production migrations go through `npx supabase db push`. If you find
  yourself reaching for `apply_migration`, stop and ask.
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

## Multi-line PR bodies — the `--body-file` rule

**Never pass a multi-line markdown body inline to `gh pr create --body`.**
The quoting fails differently in bash, PowerShell, and cmd, and the
recovery loop costs more tokens than the body itself.

Always use a temp file:

```bash
# 1. Write the body to a temp file in the repo (gitignored)
cat > tmp/pr-body.md << 'EOF'
## Summary

- Bullet one
- Bullet two with `backticks` and "quotes" — both safe in here

Closes DEL-XX
EOF

# 2. Pass the file to gh
gh pr create --title "DEL-XX: <summary>" --body-file tmp/pr-body.md

# 3. Clean up
rm tmp/pr-body.md
```

If `tmp/` doesn't exist, create it and add `tmp/` to `.gitignore` once.
The file approach is the only reliable way to ship markdown bodies through
Windows shells; the heredoc-inline route hits PowerShell's escape rules and
fails.

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
- **`frontend-architect`** — React/TypeScript surface: components, contexts,
  hooks, pages, data-access layer wrappers, `Result<T>` pattern, testing
  setup, visual language.
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
- PR body: short summary + bullet list of what shipped + a "closes DEL-XX" line,
  written to `tmp/pr-body.md` and passed via `--body-file`
