# Tasks: Delegated Body Authority

Feature: specs/010-delegated-body-authority/spec.md
Status: planned
Created: 2026-07-13

## Phase 0: Planning

- [x] T001 Create feature spec package.
- [x] T002 Map existing WHOOP, body protocol, authority, session biometric, timing, and safety systems.
- [x] T003 Define safety/privacy invariants and confidence tiers.
- [x] T004 Define data model and API contracts.
- [x] T005 Define personal 12-week body transformation protocol and feminine measurement model.

## Phase 1: Schema And Privacy Foundation

- [ ] T010 Verify current schema for `body_feminization_directives`, `receptive_window_states`, `handler_authority`, `session_biometrics`, `whoop_tokens`, `whoop_metrics`, and `whoop_workouts`.
- [ ] T011 Create next migration for delegated authority tables.
- [ ] T012 Add `session_source` or equivalent typed linkage for biometric session joins.
- [ ] T013 Add RLS policies and service-role-only write paths.
- [ ] T014 Replace any client-readable WHOOP token exposure with a safe status view/RPC.
- [ ] T015 Add export/delete coverage for authority contracts, commands, receptivity scores, biometric sessions, derived scores, and proof records.

## Phase 2: Safety Kernel

- [ ] T020 Implement `SafetyKernel` decision module.
- [ ] T021 Add hard checks for active safeword/panic/stop latch, injury, pain, severe fatigue, privacy risk, device failure, stale/conflicting biometrics, and missing consent.
- [ ] T022 Wire Safety Kernel into command generation, session launch, content generation, device actions, scheduled jobs, and escalation.
- [ ] T023 Add neutral user-visible safety messages.
- [ ] T024 Add tests proving persona/Handler prompts cannot override safety truth, stop behavior, or sensor anti-fabrication.

## Phase 3: Receptivity Engine

- [ ] T030 Implement biometric source normalization for WHOOP, session biometrics, external imports, and state predictions.
- [ ] T031 Implement domain-specific receptivity scoring.
- [ ] T032 Implement confidence-tier floors and C4 safety override.
- [ ] T033 Write `receptivity_scores` and update existing receptive-window state only after schema verification.
- [ ] T034 Add stale data behavior: stale data can downshift or ask, never intensify.
- [ ] T035 Add tests for connected, disconnected, stale, conflicting, low-readiness, and high-readiness cases.

## Phase 4: Personal Transformation Protocol

- [ ] T025 Implement body transformation profile from baseline metrics, photos, equipment, schedule, goal, injuries, and training history.
- [ ] T026 Implement feminine measurement snapshots and derived shape ratios.
- [ ] T027 Implement 12-week protocol generation with weekly phases and daily command candidates.
- [ ] T028 Implement training progression, deload, recovery downshift, and plateau response rules.
- [ ] T029 Implement nutrition mode selection: recomposition, leaning, or building.
- [ ] T029A Add tests for baseline, feminine measurements, progression, weekly review, deload, missed command recovery, and plateau response.

## Phase 5: Guided Reconditioning Engine

- [ ] T036 Build guided reconditioning exercise library schema and seed content.
- [ ] T037 Implement exercise selection for receptive windows, current commands, misses, and recovery needs.
- [ ] T038 Implement outcome tracking for focus shift, urge shift, helpfulness, next action, biometric response, and safety flags.
- [ ] T039 Add tests proving reconditioning stays inside selected goals, cannot widen consent, and cannot override stop/refusal/safety signals.

## Phase 6: Command Engine

- [ ] T040 Implement active contract lookup and domain matching.
- [ ] T041 Implement next-command selection from body protocol, tasks, sessions, measurements, recovery, and nutrition adherence.
- [ ] T042 Add command creation with surfaced-at, due date, reason, proof, missed outcome, confidence tier, and escalation level.
- [ ] T043 Implement escalation eligibility.
- [ ] T044 Implement downshift and reschedule rules.
- [ ] T045 Add tests for activation, revoked/paused contracts, domain mismatch, escalation, misses, and safety vetoes.

## Phase 7: Verification Engine

- [ ] T050 Implement command verification records.
- [ ] T051 Connect workout proof to WHOOP workouts where available.
- [ ] T052 Connect session proof to biometric sessions and timers.
- [ ] T053 Connect measurement proof to body metrics.
- [ ] T054 Add privacy-scoped photo proof for non-intimate images only.
- [ ] T055 Implement correction/review-needed handling.
- [ ] T056 Add tests for proof confidence, conflicting proof, missing proof, photo consent, and no-penalty safety stops.

## Phase 8: UI Surfaces

- [ ] T060 Add Body Authority setup in Settings.
- [ ] T061 Add authority status and current command card to Today/Focus.
- [ ] T062 Add "why this command," "what proves it," "what happens if missed," and pause/safety controls.
- [ ] T063 Add Body Protocol authority panel and weekly review.
- [ ] T064 Add session launch safety gates and debrief for reconditioning, meditation, hypno/conditioning, and optional private high-stimulation.
- [ ] T065 Add WHOOP freshness and disconnect/delete controls.
- [ ] T066 Add neutral notification copy.
- [ ] T067 Add accessibility and responsive checks.

## Phase 9: Orchestration

- [ ] T070 Implement `body-authority-orchestrator`.
- [ ] T071 Implement `receptivity-score-refresh`.
- [ ] T072 Trigger orchestrator on daily schedule, WHOOP sync, session completion, command miss, safety event, and contract change.
- [ ] T073 Add reconciliation for WHOOP freshness and webhook gaps.
- [ ] T074 Add idempotency keys and duplicate-event handling.
- [ ] T075 Add observability for command decisions, safety decisions, confidence, and source freshness without leaking raw sensitive payloads.

## Phase 10: WHOOP Production Hardening

- [ ] T080 Confirm current endpoint version and align local integration with WHOOP v2 API where needed.
- [ ] T081 Implement optional v2 webhook endpoint with signature validation.
- [ ] T082 Process webhook events asynchronously and fetch actual data after notification.
- [ ] T083 Add reconciliation job because webhook delivery can fail or duplicate.
- [ ] T084 Add rate-limit and token-refresh resilience.
- [ ] T085 Add tests for token expiry, disconnect, delete, webhook duplicate, webhook failure, and stale sync.

## Phase 11: QA And Launch

- [ ] T090 Add unit and integration coverage for every acceptance criterion.
- [ ] T091 Add E2E flows for activate, command, verify, miss, reschedule, downshift, escalate, pause, revoke, and delete.
- [ ] T092 Add manual QA scripts for exercise, recovery, reconditioning, meditation, hypno/conditioning, and optional private high-stimulation.
- [ ] T093 Run red-team prompt tests for safety overrides and anti-fabrication.
- [ ] T094 Run privacy review for LLM payloads, client logs, notifications, analytics, export, and deletion.
- [ ] T095 Ship behind feature flag.
- [ ] T096 Monitor safe escalation rate, recovery alignment, proof quality, completion, and safety responsiveness.

## Acceptance Trace

- AC-001: T010-T015, T040, T060.
- AC-002: T030-T045, T070-T075.
- AC-003: T060-T065.
- AC-004: T020-T024, T064, T090-T093.
- AC-005: T030-T035, T080-T085.
- AC-006: T020-T024, T040-T045.
- AC-007: T040-T045, T070-T075.
- AC-008: T050-T056, T070-T075.
- AC-009: T014-T015, T054, T094.
- AC-010: T061-T064, T067.
- AC-011: T011-T015, T063, T075.
- AC-012: T090-T095.
- AC-013: T024, T093.
- Reconditioning behavior: T036-T039, T064, T090-T093.
- Personal transformation protocol: T025-T029A, T041, T063, T090-T092.

## Definition Of Done

- The user can grant full delegated body authority inside selected domains.
- The app can generate and run a concrete 12-week transformation protocol from baseline data.
- The app tracks feminine/camera-ready physique measurements instead of only standard male fitness measurements.
- The app can generate clear commands, choose timing from readiness, verify compliance, and escalate when eligible.
- The app can run guided reconditioning exercises during receptive windows and learn from outcomes.
- The app can record biometrics for approved session types and use them for future adaptation.
- Safety Kernel blocks unsafe escalation and preserves stop/pause/revoke.
- WHOOP data is used truthfully, with freshness and confidence visible.
- Sensitive data is minimized, redacted, exportable, and deletable.
- All acceptance criteria are covered by automated tests plus manual QA for session surfaces.
