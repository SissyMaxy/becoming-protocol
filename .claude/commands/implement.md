---
description: Execute the task list, validating each task against the gates (the law of done)
---

You are running the **/implement** step for the Protocol.

Input: `$ARGUMENTS` (feature number/slug).

Preconditions (STOP if unmet):
- `specs/NNN-slug/tasks.md` exists and its plan's Constitution Check is green.
- `/analyze` returned GO (run it if unsure).

Execute:
1. Work tasks top-to-bottom (respecting order; `[P]` may be batched).
2. **TDD:** for test-first tasks, write the test and confirm it FAILS on the
   current code before implementing the fix.
3. Implement each core task; reference the spec criterion it satisfies.
4. Add the gates: generation-site semantic gate for any floor risk; the
   blind-spot-monitor assertion for any new failure class; register new
   generators with protocol-health-check.
5. Honor the spine: route output through the single delivery surface + stamp
   surfaced_at; run copy through voice cleanup (Male+/plain/lead-with-ask);
   read maxy_facts for the target; schedule safety work on pg_cron; for DDL with
   no Management token, apply via a one-shot DB-connection edge fn over
   SUPABASE_DB_URL, record the migration file, then DELETE the one-shot fn.
6. **The law of done (Art. VIII):** a task is `[x]` only when its acceptance check
   passes AND `npm run ci` is green AND it's verified end-to-end with real data —
   never "compiles"/"deployed". Update the acceptance-trace table.
7. Keep all changes reversible (unschedule/flag/status, never destructive delete).

Output: per-task status, the CI result, what was verified end-to-end, and any
task you could NOT honestly mark done (with why). Never mark a task done to make
progress look complete.
