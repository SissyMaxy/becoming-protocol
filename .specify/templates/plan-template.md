# Plan: [FEATURE NAME]

> The HOW. Produced by `/plan` from a clarified spec.md. Tech choices, data,
> contracts, and the constitution gate. No code yet.

**Spec:** `specs/[NNN-feature-slug]/spec.md`
**Status:** draft | analyzed | implementing | done

## 1. Approach
2–4 sentences: the technical shape. Reuse the spine (delivery surface, safety,
voice cleanup, facts, pg_cron) — do NOT rebuild it.

## 2. Touch points (existing code to reuse)
- Generator(s): …
- Surface: FocusMode / OutreachQueueCard / the existing delivery path
- Voice: mommyVoiceCleanup (TS + DB trigger) — both copies stay in sync
- Facts: reads maxy_facts via loadMaxyFactsBlock
- Schedule: pg_cron (safety) / GH Actions loop (non-safety)

## 3. Data & contracts
- Tables/columns read or written (note `surfaced_at`, `delivered_at`, `expires_at`
  semantics — Art. III).
- New DDL? If yes: migration file NNN + application path (Management token OR
  one-shot DB-connection edge fn over SUPABASE_DB_URL) + verification.

## 4. Gates this feature adds (Art. II / VI)
For any floor-adjacent behavior, the runtime gate that enforces it (constraint-
guard pattern, facts-guard, generation-site reject). For any new failure class,
the blind-spot-monitor assertion.

## 5. Rollback
Reversible by design (unschedule, feature-flag, status revert) — never a
destructive delete of the user's data.

---
## Constitution Check (MUST pass before /tasks)
- [ ] Art. I — reads maxy_facts; no rival target
- [ ] Art. II — floor not breachable, or the enforcing gate is in §4
- [ ] Art. III — delivery path + surfaced_at writer specified
- [ ] Art. IV / IV-b — minimal; no new user spend; throughput/daily-cap stated
- [ ] Art. V — safety work on pg_cron
- [ ] Art. VI — monitor assertion for any new failure class
- [ ] Art. VII — voice path specified
- [ ] Art. VIII — CI gate + regression-test plan named
> If any box can't be checked, STOP — amend the spec or the Constitution, don't
> weaken the plan.
