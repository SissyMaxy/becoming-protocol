# Tasks: At-Home Physical Practice Ladder (011 physical rung track)

> The ordered, verifiable breakdown. `/implement` executes top-to-bottom,
> marking each done only when its acceptance check + the Art. VIII gates pass.

**Plan:** `specs/011-hypno-desensitization/plan.md`

Legend: `[ ]` todo · `[~]` in-progress · `[x]` done · `[P]` parallel-safe

## Setup
- [ ] T001 Author migration `supabase/migrations/680_physical_practice_ladder.sql`:
  tables `physical_practice_rungs`, `physical_practice_progress`,
  `physical_practice_log`; RLS `auth.uid()=user_id` on the two per-user tables;
  `advance_physical_practice(uuid, text)` `SECURITY INVOKER`; seed oral 1–5 +
  bottoming 0–5 (11 rows), size steps flagged `is_size_step`, bottoming size
  steps `requires_prep_attestation`. *Accept:* file parses; seed = 11 rows.
- [ ] T002 Add types: `src/lib/types/physical-practice.ts` (DbPhysicalRung ↔
  camel mappers, `PhysicalTrack`, `ComfortRating`). *Accept:* typecheck.

## Tests first (TDD — write failing, verify red)
- [ ] T010 `src/__tests__/lib/physical-practice-advancement.test.ts` — pure
  advancement logic (mirror the SQL in TS or test via a harness): comfort-gated
  advance (rating ≤ threshold + completed → next rung); **size step never skips**
  (rung N+size can't activate until N logged comfortable); **bottoming size step
  blocked without prep attestation**; comfort SPIKE splits (half-step inserted,
  not advanced); stall = no-op (re-present, no penalty). MUST fail red first.
- [ ] T011 [P] `src/__tests__/lib/physical-practice-no-real-person.test.ts` —
  `hasRealPersonElement()` rejects real-partner/contact/meet/message strings and
  the veto-override scan rejects approach/consent-override language; PASSES clean
  own-body drill copy. MUST fail red first (function absent).
- [ ] T012 [P] `src/__tests__/lib/physical-practice-seed-voice.test.ts` — every
  seeded `edict_template` passes `hasRealPersonElement`, `hasForbiddenVoice`,
  `hasScriptBoundaryViolation`, and has no telemetry tokens. MUST fail red first.

## Core implementation
- [ ] T020 `src/lib/conditioning/physical-practice.ts` — pure ladder logic:
  `selectActiveDrill(progress, rungs)`, `hasRealPersonElement(text)`,
  `computeAdvancement(logs, activeRung)` (comfort-gate + size-skip guard +
  prep-gate + balk-split + stall-noop). Satisfies spec §4 advancement + safety-
  sizing + no-real-person criteria. Makes T010/T011 green.
- [ ] T021 `supabase/functions/physical-practice-prescriber/index.ts` — modeled
  on `exercise-conditioning`: read `physical_practice_progress` (default-on init
  within the enabled ladder), select the active drill per track, dedup on
  `trigger_source='physical_practice:<track>:<n>'`, daily deadline-roll, insert
  `handler_decrees` (proof `comfort_slider`, no-punish consequence). Runs
  `mommyVoiceCleanup` + `applyCraftFilter` + `hasRealPersonElement` +
  `hasScriptBoundaryViolation` before insert (skip-on-violation). Invoked by the
  existing conditioning cron (no new schedule). Satisfies §3 delivery + §4 gates.
- [ ] T022 Wire the existing conditioning cron caller to also invoke
  `physical-practice-prescriber` (mirror how it invokes exercise-conditioning).
  *Accept:* one active drill/track surfaces per day, no duplicate.
- [ ] T023 `src/components/today-redesign/HandlerDecreeCard.tsx` — add the
  `comfort_slider` proof instrument (0–max "how easy did that feel"), rendered
  like the existing `belief_slider`; submit writes `physical_practice_log` and
  calls `advance_physical_practice`. Satisfies §3 rating capture + Art. III.
- [ ] T024 [P] `physical_practice:` trigger-source recognized in
  `src/lib/focus/pick-next.ts` so the drill surfaces as `focus_decree` (#1) with
  no ordering regression. *Accept:* focus-pick-next tests stay green.
- [ ] T025 [P] Auto-capture opt-in: a drill flagged capture routes proof through
  `src/lib/content/auto-capture.ts` with `source_type:'physical_practice'`,
  faceless gate enforced. Satisfies §3 optional content (spec §4 faceless).
- [ ] T026 Prep-attestation step (bottoming rung 0): reuse the turnout/date-first
  attestation pattern to set `physical_practice_progress.prep_attested_at`;
  gates all bottoming size steps. Satisfies §4 real-body safety.
- [ ] T027 [P] Acquisition step: when the active rung's `prop` isn't owned,
  prescribe an acquisition task first (prescribe-only-what-he-owns) instead of
  the drill. *Accept:* missing-prop path issues acquisition, not the drill.

## Gates & enforcement (Art. II / VI / VIII)
- [ ] T030 Generation-site gate confirmed: `hasRealPersonElement` +
  veto-override scan + `hasScriptBoundaryViolation` wired into T021's insert path
  (not just unit-tested). *Accept:* a doctored real-person edict is skipped.
- [ ] T031 Blind-spot-monitor assertion: no `physical_practice_progress` row has
  an active size step whose prior step lacks a comfortable log, or (bottoming)
  lacks `prep_attested_at`. Register in the recon/protocol health-check.
- [ ] T032 Extend `scripts/mommy/builder-safety-gate.ts`:
  `physical-practice-prescriber`, `physical_practice_` (tables),
  `advance_physical_practice` → protected path/function/table lists +
  `builder-safety-gate.test.ts` cases. *Accept:* test green.
- [ ] T033 Register `physical-practice-prescriber` in `protocol-health-check`
  GENERATORS list (new generator). *Accept:* health-check enumerates it.

## Delivery & voice (Art. III / VII)
- [ ] T040 Surface path + `surfaced_at` verified end-to-end: a seeded progress
  row → prescriber → `handler_decrees` → FocusMode renders the drill card and
  stamps `surfaced_at`; comfort submit advances. Visible-before-penalized: no
  stakes before surfacing; stall never penalized.
- [ ] T041 Voice: seeded edicts + any generated copy pass voice-gate,
  voice-craft, regendering + telemetry scrubs (Male+, no /10, leads with ask).

## Validation (Art. VIII — the law of done)
- [ ] T090 `npm run ci` green (all gates incl. enum-guard, storage, migrations,
  voice-*, ui-lint, pattern-lint).
- [ ] T091 End-to-end verified with real data: seed a progress row, drive
  prescriber → card → comfort submit → advancement (not "compiles"/"deployed").
- [ ] T092 DDL: `680` recorded as canonical migration + applied via one-shot
  DB-connection edge fn over `SUPABASE_DB_URL` + verified (11 rungs, RLS, fn).
- [ ] T093 Rollback confirmed: `life_as_woman_settings` flag off → prescriber
  no-ops, existing decrees expire, no data drop.

## Acceptance trace
| Spec criterion (§4) | Task(s) | Verified |
|---|---|---|
| Solo/own-body/at-home; no real-person element | T011, T020, T030 | [ ] |
| Comfort/flinch + completion gated advancement; balk splits; stall re-presents | T010, T020, T023 | [ ] |
| Real-body safety prescribed; size steps non-skippable; prep-gated | T001, T010, T020, T026, T031 | [ ] |
| Prescribe-only-what-he-owns (acquisition first) | T027 | [ ] |
| Optional faceless own-body capture | T025 | [ ] |
| No fabricated medical/body status | T041 | [ ] |
| Autonomous + default-on; inspectable before drill; safeword short-circuits | T021, T024, T040 | [ ] |
| Muscle-memory preserves the safety-veto (no real-partner judgment target) | T011, T041 | [ ] |
| Voice Male+/no telemetry/leads with ask | T041, T012 | [ ] |
| Builder cannot modify engine/gates | T032 | [ ] |
| Delivery + surfaced_at (Art. III) | T040 | [ ] |
