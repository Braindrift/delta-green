---
description: Start work on a Linear ticket. Reads the issue, scans relevant code, drafts a plan.
argument-hint: DEL-XX [optional notes]
---

# Start ticket: $ARGUMENTS

Follow the `ticket-workflow` skill. In short:

## 0. Pre-flight: branch sanity check

Before doing anything else, run:

```bash
git branch --show-current
```

Three cases:

- **On `main`**: good. Proceed to step 1.
- **On a branch matching `sjoblomerik/del-XX-...` where XX matches `$ARGUMENTS`**: also good — Erik is resuming work on the same ticket. Proceed to step 1.
- **On any other branch** (different ticket, the workflow-setup branch, anything weird): **STOP**. Show the current branch and ask:
  > "You're on `<branch>`, not `main` or a branch matching `$ARGUMENTS`. Three options: (a) finish/abandon the current branch first, (b) start `$ARGUMENTS` from `main` anyway (I'll stash and recover any uncommitted work), or (c) you meant to resume something else — tell me which ticket."
  Wait for the answer before proceeding.

This catches the case where the previous session's branch never got merged and the new ticket would otherwise pile on top.

## 1. Read the issue

Pull `$ARGUMENTS` from Linear via `get_issue`. Read the Description,
Definition of Done, and any linked issues (parent, blocked-by). Do **not**
fetch the Session Handoff doc.

## 2. Scan the repo

Read only what's needed to plan this specific ticket — typically the
existing migrations directory for schema work, or the relevant component
tree for UI work. Don't `ls` the whole repo. Batch reads silently — don't
narrate each `view`.

**If this is a migration ticket** (the DoD calls for schema changes,
RLS, RPCs, triggers, etc.): also run `npx supabase migration list --linked`
as part of the scan. If local and remote columns don't agree on every
row, surface the drift in the plan as a pre-implementation gate — fixing
it via `npx supabase migration repair` comes before any new SQL goes on
top. See "Applying schema migrations" in `CLAUDE.md` for the why.

## 3. Draft the plan

Output budget: ≤ 30 lines. Use the structure in the `ticket-workflow`
skill's plan template. End with at most one clarifying question if
there's a real ambiguity in the DoD — otherwise, end with "Ready to
start?"

## 4. Wait for go-ahead

Don't start writing files until Erik confirms.

If the issue turns out to be larger than expected mid-planning, stop and
flag it as a possible epic instead of producing a sprawling plan.

If `$ARGUMENTS` is empty or doesn't look like a DEL-XX ID, ask which ticket
to start instead of guessing.
