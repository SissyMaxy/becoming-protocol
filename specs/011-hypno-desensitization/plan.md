# Plan: At-Home Physical Practice Ladder (011 physical rung track)

> The HOW. Produced by `/plan` from the clarified
> `rung-physical-practice-ladder.md`. Tech choices, data, contracts, the
> constitution gate. No code yet.

**Spec:** `specs/011-hypno-desensitization/rung-physical-practice-ladder.md`
**Status:** draft

## 1. Approach

Build the physical rung track as a seeded ladder + per-user progress state that
issues ONE active drill as a `handler_decrees` row — reusing the exact pattern of
`exercise-conditioning` (a rung LADDER gated by prior completions) and surfacing
through the existing `focus_decree` path (pick-next #1) rendered by
`HandlerDecreeCard`. Advancement is comfort-gated in a SQL function (rating below
threshold + logged completion → advance; size steps refuse to skip and, on the
bottoming track, require a prep attestation first). Copy is seeded + pre-scrubbed
(no LLM freeform), so the voice + no-real-person gates run at the (rare) dynamic
generation site and as CI assertions. Reuse the spine everywhere — no new Focus
surface, no new nav entry, no new scheduler.

## 2. Touch points (existing code to reuse)

- **Generator:** new edge fn `physical-practice-prescriber` modeled on
  `supabase/functions/exercise-conditioning/index.ts` (rung-gated LADDER →
  `handler_decrees`), invoked by the SAME existing conditioning cron that calls
  exercise-conditioning (no new schedule).
- **Surface:** `handler_decrees` → `focus_decree` (pick-next.ts #1) →
  `FocusMode.tsx` / `HandlerDecreeCard.tsx`. New proof type `comfort_slider`
  rendered like the existing `belief_slider` / `assoc_latency` special proofs.
- **Rating capture:** `HandlerDecreeCard` gains the `comfort_slider` instrument
  (0–max "how easy did that feel"); submit writes `physical_practice_log` +
  calls the advancement function.
- **Voice:** `mommyVoiceCleanup` (TS + DB trigger) + `applyCraftFilter` on any
  generated copy; seeded edicts pass voice-gate/craft at CI.
- **Content (optional):** `src/lib/content/auto-capture.ts` → `content_vault`
  (`source_type:'physical_practice'`) when a drill opts into faceless capture.
- **Prep attestation:** reuse the turnout/date-first attestation PATTERN
  (`turnout-orchestrator` / health-prep) for the bottoming-track prep gate.
- **Boundary scan:** `hasScriptBoundaryViolation` (`_shared/mommy-order-boundary`)
  + a new `hasRealPersonElement` reject at the generation site.
- **Facts:** reads `maxy_facts` via the existing block loader for any copy.

## 3. Data & contracts

New DDL — **migration `680_physical_practice_ladder.sql`** (next free per memory):

- `physical_practice_rungs` (seeded definition, both tracks): `id`, `track`
  (`'oral'|'bottoming'`), `rung_order int`, `slug`, `title`, `prop text`,
  `technique_focus text`, `edict_template text`, `is_size_step bool`,
  `requires_prep_attestation bool`, `safety_notes text`. Seed: oral 1–5,
  bottoming 0–5 (0 = prep ritual). Rows are inspectable pre-run
  (visible-before-penalized).
- `physical_practice_progress` (per-user): `user_id`, `track`,
  `active_rung_order int`, `status` (`active|paused|complete`),
  `prep_attested_at timestamptz null`, `comfort_streak int`, timestamps.
  RLS `auth.uid()=user_id`.
- `physical_practice_log` (each drill completion): `user_id`, `rung_id`,
  `comfort_rating int`, `content_captured bool`, `completed_at`, `surfaced_at`
  provenance. RLS `auth.uid()=user_id`. Drives advancement + the evidence loop.
- `advance_physical_practice(user_id, track)` SQL function (SECURITY INVOKER):
  advances `active_rung_order` only when the active rung's recent
  `comfort_rating` is at/under threshold across the required completions; a
  **size step never advances if the prior size step lacks a comfortable log**;
  a **bottoming size step never advances without `prep_attested_at`**; a comfort
  SPIKE splits the rung (inserts a half-step) instead of advancing; a stall is a
  no-op (re-present, no penalty row). Pure/idempotent.
- `handler_decrees`: written with `trigger_source='physical_practice:<track>:<n>'`,
  `proof_type='comfort_slider'` (or `'photo'` when capture opted),
  `consequence='No punishment — Mommy just resets the pairing and we go again.'`;
  `surfaced_at` stamped by the existing FocusMode render (Art. III — reused,
  not rebuilt). Daily deadline-roll like exercise-conditioning (never guilts
  yesterday).

**Application path (Art. VIII item 3):** no Management token → apply `680` via
the one-shot DB-connection edge fn over `SUPABASE_DB_URL`, record the canonical
migration file, then verify (`select count(*) from physical_practice_rungs` = 11;
RLS present; function exists).

## 4. Gates this feature adds (Art. II / VI)

- **No-real-person gate (Art. II item 3):** `hasRealPersonElement(text)` rejects
  any drill copy containing real-partner / real-contact / meet / message-a-person
  terms at the generation site; CI assertion over all seeded edicts. Solo/own-
  body is structurally guaranteed (drills reference only own body + props).
- **Safety-sizing gate (real-body safety):** enforced IN
  `advance_physical_practice` — size steps are strictly ordered, non-skippable,
  and bottoming size progression is prep-attestation-gated. This is code, not
  copy: the ladder cannot prescribe a skipped size.
- **Veto-preservation (Art. II item 2):** no rung or copy references the in-the-
  moment real-partner decision; CI assertion scans seeded edicts for
  approach/consent-override language and rejects.
- **Container-breaker scan:** `hasScriptBoundaryViolation` on any generated copy.
- **Voice (Art. VII):** `mommyVoiceCleanup` + `applyCraftFilter`; voice-gate +
  voice-craft cover the seeded edicts at CI.
- **Builder cord (extend `builder-safety-gate.ts`):** add
  `physical-practice-prescriber` + `physical_practice_*` tables +
  `advance_physical_practice` to the protected path/function/table lists so the
  autonomous builder cannot modify the engine or its safety gates. Regression in
  `builder-safety-gate.test.ts`.
- **Monitor assertion (Art. VI):** a health-check assertion (from the user's
  seat) that no `physical_practice_progress` row has an active size step whose
  prior step lacks a comfortable log or (bottoming) lacks prep attestation —
  auto-flags if the safety invariant is ever violated.

## 5. Rollback

Reversible: gate the whole engine behind a `life_as_woman_settings` flag
(default-on only within the already-opt-in 011/recondition ladder; master gate +
safeword short-circuit above it). Disable = prescriber no-ops, existing decrees
expire. `status='paused'` on progress halts advancement. No destructive delete of
user logs/state. Migration `680` is additive (new tables/fn only) — rollback is a
flag flip, never a data drop.

---
## Constitution Check (MUST pass before /tasks)
- [x] Art. I — reads maxy_facts; target is the recorded receptive/cocksucker
  identity + becoming at pace; no rival target
- [x] Art. II — floor gates in §4 (no-real-person, veto-preservation, container
  scan); solo/own-body structural; real-body safety enforced in the advance fn
- [x] Art. III — delivery via existing focus_decree path; `surfaced_at` stamped
  by FocusMode render (reused)
- [x] Art. IV / IV-b — minimal (reuses exercise-conditioning + decree + capture
  surfaces; no new nav/scheduler); no new user spend (props = acquisition step,
  not protocol-charged); throughput = one active drill/track/day, daily-cap via
  the existing conditioning cadence
- [x] Art. V — no NEW safety-critical schedule added; reuses the existing
  conditioning cron. (Advancement is event-driven off the rating submit, not a
  timer.)
- [x] Art. VI — monitor assertion for the size-skip / prep-gate invariant (new
  failure class) specified in §4
- [x] Art. VII — voice path specified (cleanup + craft + CI voice gates)
- [x] Art. VIII — CI gate + regression tests named: advancement/safety-sizing,
  no-real-person, builder-safety-gate extension; migration applied via one-shot
  edge fn + verified
