---
description: Turn a clarified spec into a technical plan (the HOW) with a constitution gate
---

You are running the **/plan** step for the Protocol.

Input: `$ARGUMENTS` (feature number/slug, or infer the most recent in-progress spec).

Do this:
1. Read the spec at `specs/NNN-slug/spec.md`. If it has unresolved
   `[NEEDS CLARIFICATION]`, STOP and tell the operator to run `/clarify` first.
2. Read `.specify/memory/constitution.md`.
3. Create `specs/NNN-slug/plan.md` from `.specify/templates/plan-template.md`.
4. Fill it: approach (REUSE the spine — delivery surface, safety, voice cleanup,
   facts, pg_cron; never rebuild it), the existing code touch-points, data &
   contracts (note surfaced_at/delivered_at/expires_at semantics), any DDL +
   its application path (Management token OR one-shot DB-connection edge fn over
   SUPABASE_DB_URL) + verification, the runtime gates this feature adds, and the
   reversible rollback.
5. Complete the **Constitution Check**. If ANY box can't be honestly checked,
   STOP — fix the spec or propose a Constitution amendment to the operator. Never
   weaken the plan to pass.

Output: path to plan.md, the approach in 3 lines, and the Constitution Check
result. If clean, tell the operator to run `/tasks` (or `/analyze` first for a
cross-artifact consistency pass).
