---
description: Cross-artifact consistency + constitution audit before implementing
---

You are running the **/analyze** step for the Protocol — a read-only gate.

Input: `$ARGUMENTS` (feature number/slug).

Do this (DO NOT modify code):
1. Read `specs/NNN-slug/{spec,plan,tasks}.md` and `.specify/memory/constitution.md`.
2. Check **consistency**: every spec acceptance criterion has a task; every task
   traces to the plan; no task does something the spec didn't ask for; no
   `[NEEDS CLARIFICATION]` remains.
3. Check **constitution compliance** article by article (I–VIII). For each
   article, state PASS / FAIL with the evidence. Pay special attention to:
   - Art. I: target = maxy_facts, no rival goal.
   - Art. II: floor — including the gaslighting-within-bounds rule (gaslight OK;
     breaking the safeword/no-fab/irreversible-override is NOT).
   - Art. III: delivery path + surfaced_at.
   - Art. IV-b: no new user spend; funding kept.
   - Art. VIII: regression test + gate planned.
4. Produce a findings table: severity (critical/high/med), article/issue, where,
   fix. CRITICAL or any FAIL = the feature MUST NOT proceed to `/implement` until
   resolved (fix the artifacts or amend the Constitution explicitly).

Output: the compliance table + a clear GO / NO-GO verdict. Never auto-fix; report.
