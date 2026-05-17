---
description: Start work on a Linear ticket. Reads the issue, scans relevant code, drafts a plan.
argument-hint: DEL-XX [optional notes]
---

# Start ticket: $ARGUMENTS

Follow the `ticket-workflow` skill. In short:

1. **Read the issue.** Pull `$ARGUMENTS` from Linear via `get_issue`. Read
   the Description, Definition of Done, and any linked issues (parent,
   blocked-by). Do **not** fetch the Session Handoff doc.

2. **Scan the repo.** Read only what's needed to plan this specific ticket
   — typically the existing migrations directory for schema work, or the
   relevant component tree for UI work. Don't `ls` the whole repo.

3. **Draft the plan.** Output budget: ≤ 30 lines. Use the structure in the
   `ticket-workflow` skill's plan template. End with at most one clarifying
   question if there's a real ambiguity in the DoD — otherwise, end with
   "Ready to start?"

4. **Wait for go-ahead.** Don't start writing files until Erik confirms.

If the issue turns out to be larger than expected mid-planning, stop and
flag it as a possible epic instead of producing a sprawling plan.

If `$ARGUMENTS` is empty or doesn't look like a DEL-XX ID, ask which ticket
to start instead of guessing.
