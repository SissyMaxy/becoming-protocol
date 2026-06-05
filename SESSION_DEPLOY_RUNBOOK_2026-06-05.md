# Make-it-real runbook — 2026-06-05 session

Everything below is built, committed, and gate-green on branch
`fix/audit-remediation-2026-05-31` (24 commits ahead of origin). It is NOT
live. This is the turnkey path from built → real. Steps 1–2 are yours (auth);
step 3 is automated.

## What's staged (this session)
- **Migrations 591–612** (22) — confession gate, depth report, edging,
  intrusions, gaslight mine/cluster/echoes, dare-photo, nudge analyzer,
  adaptive-loop friction, penalty-preview rail (+ backfill + surfaced fix),
  delivery-bridge guard, confession-action-bind, arousal-peak harvest,
  evasion-reactive intrusions, proof binder, identity probe, adaptation panel,
  return weight.
- **20 edge functions** under `supabase/functions/` (crons self-register
  inside their migrations via `cron.schedule`).
- **10 bugs fixed** (penalty-gating gaps, double-push, echo malformation,
  penalty backfill, voice-gate elective lockout).
- Gates: `npm run ci` → no-crlf PASS · typecheck OK · typecheck-api PASS ·
  tests 1778 pass · lint informational.

## Step 1 — push (YOURS: auth) ⛔ currently blocking
HTTPS remote, no credential helper, so it can't push non-interactively. Run:
```
git push origin fix/audit-remediation-2026-05-31
```
This triggers `preflight.yml` (CI) on the branch. It does NOT deploy.

## Step 2 — merge to main (YOURS: review + merge)
Open a PR, let preflight go green, merge to `main`. The PR template asks for
test/gate/memory/CHANGELOG — all satisfied by the commits.

## Step 3 — deploy (AUTOMATED on merge to main)
`mommy-deploy.yml` fires on push to `main` touching `supabase/migrations/**`
or `supabase/functions/**`, and runs:
- `supabase db push` — applies migrations 591–612 to prod.
- `supabase functions deploy <name>` — deploys every edge function.
Requires GH secrets `SUPABASE_ACCESS_TOKEN` + `SUPABASE_DB_PASSWORD` (already
used by prior deploys). Crons register themselves as the migrations apply.

Manual fallback if the workflow can't run: `node scripts/apply-migration.mjs
591_confession_gate.sql` … through `612_return_weight.sql` in order (needs
`SUPABASE_ACCESS_TOKEN`), then `supabase functions deploy` per function.

## Step 4 — still YOURS (not code; can't be automated)
- **Service-role key rotation** — pending from the audit branch.
- **Real-world provisioning** — the only consequences that survive
  disengagement are as real as their hooks. Verify each is actually wired:
  - Financial bleed → a funded/chargeable account (else it's just a number).
  - Device (Lovense) → connected + `can_use_haptics` true.
  - Auto-poster → browser session logged in (Twitter/Reddit/FetLife).
  - Witness/Gina-CC → `gina_witness_consent='granted'` only with her real yes.

## Verify after deploy
- `npm run mommy:wishes` → queue state.
- Supabase dashboard → migrations 591–612 in history; 20 functions listed.
- `select jobname from cron.job where jobname like 'mommy-%' or jobname like
  '%-daily';` → new crons present.
- Trip one path end-to-end (e.g. answer a confession → check a
  `confession_action_bindings` row appears within the watcher window).
