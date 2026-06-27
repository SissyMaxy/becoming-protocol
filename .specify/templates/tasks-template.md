# Tasks: [FEATURE NAME]

> The ordered, verifiable breakdown. Produced by `/tasks` from plan.md.
> `/implement` executes these top-to-bottom, marking each done only when its
> acceptance check + the Art. VIII gates pass. Each task is small and traceable.

**Plan:** `specs/[NNN-feature-slug]/plan.md`

Legend: `[ ]` todo · `[~]` in-progress · `[x]` done · `[P]` parallel-safe

## Setup
- [ ] T001 …

## Tests first (TDD — write failing, verify red)
- [ ] T010 Regression/unit test for [behavior] — MUST fail on current code first
- [ ] T011 [P] …

## Core implementation
- [ ] T020 … (references the file + the spec acceptance criterion it satisfies)
- [ ] T021 …

## Gates & enforcement (Art. II / VI / VIII)
- [ ] T030 Generation-site gate for [floor risk]
- [ ] T031 blind-spot-monitor assertion for [failure class]
- [ ] T032 Register with protocol-health-check if a new generator

## Delivery & voice (Art. III / VII)
- [ ] T040 Surface path + surfaced_at writer verified end-to-end
- [ ] T041 Voice-gate / regendering / telemetry scrub passes

## Validation (Art. VIII — the law of done)
- [ ] T090 `npm run ci` green
- [ ] T091 End-to-end verified with real data (not "compiles"/"deployed")
- [ ] T092 If DDL: migration recorded + applied + verified
- [ ] T093 Rollback confirmed reversible

## Acceptance trace
| Spec criterion | Task(s) | Verified |
|---|---|---|
| … | T0xx | [ ] |
