---
description: Break a plan into an ordered, verifiable, TDD task list
---

You are running the **/tasks** step for the Protocol.

Input: `$ARGUMENTS` (feature number/slug, or the most recent planned spec).

Do this:
1. Read `specs/NNN-slug/plan.md` (and spec.md for the acceptance criteria).
   Its Constitution Check MUST be all-green; if not, STOP.
2. Create `specs/NNN-slug/tasks.md` from `.specify/templates/tasks-template.md`.
3. Decompose into small, ordered, individually-verifiable tasks:
   - **Tests first** (write the failing test, note it must be verified red).
   - Core implementation (each task names the file + the spec criterion it meets).
   - Gates & enforcement (generation-site gate, blind-spot-monitor assertion,
     protocol-health-check registration for new generators).
   - Delivery & voice verification.
   - Validation (npm run ci; end-to-end with real data; DDL recorded+applied;
     rollback confirmed).
4. Mark `[P]` tasks that are parallel-safe (different files, no ordering dep).
5. Fill the acceptance-trace table mapping every spec criterion → task(s).

Output: path to tasks.md and the task count by section. Tell the operator to run
`/implement`.
