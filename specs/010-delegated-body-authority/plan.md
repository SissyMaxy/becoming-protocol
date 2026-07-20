# Implementation Plan: Delegated Body Authority

Feature: specs/010-delegated-body-authority/spec.md
Status: planned
Created: 2026-07-13

## Approach

Implement Delegated Body Authority as a governed layer over the existing authority, body protocol, WHOOP, session biometric, obligation, and timing systems. The app should not get a second parallel command system. It should use existing task/directive/session surfaces, with new authority contracts, readiness scoring, command audit data, and safety kernel checks.

Core implementation modules:

1. Authority Contract
   - Store active delegated body authority scopes, intensity ceiling, proof lanes, data-source consent, safety limits, retention choices, and revocation state.
   - Expose activation, pause, domain-pause, narrow, revoke, export, and delete flows.

2. Safety Kernel
   - Central predicate that must pass before command generation, session launch, escalation, device action, or content generation.
   - Outranks persona prompts, Handler voice, scheduled jobs, and autonomous decisions.
   - Produces a structured decision: allow, soften, ask, block, stop, aftercare.

3. Receptivity Engine
   - Domain-specific readiness scorer for exercise, recovery, meditation, hypno/conditioning, and optional private high-stimulation.
   - Reads WHOOP metrics, session biometrics, body program state, recent compliance, schedule, state predictions, and user feedback.
   - Writes score, confidence tier, factors, contraindications, and recommended window.

4. Personal Transformation Protocol
   - Builds a 12-week body transformation plan from baseline, goals, equipment, schedule, body metrics, training history, nutrition constraints, and WHOOP data.
   - Uses a feminine/camera-ready physique measurement model rather than only generic male fitness measurements.
   - Generates weekly structure and daily command candidates.
   - Adapts progression, deloads, nutrition mode, measurement cadence, and recovery from evidence.

5. Guided Reconditioning Engine
   - Selects short exercises for suggestibility/readiness windows: breath, focus, identity rehearsal, behavior rehearsal, urge surfing, body-protocol priming, recovery compliance, and immediate commitment.
   - Keeps suggestions tied to explicit contract targets and current body commands.
   - Learns from outcomes without claiming causality before enough comparable sessions exist.

6. Command Engine
   - Chooses the next body authority command.
   - Creates visible, auditable instructions with deadlines and proof requirements.
   - Escalates by default only when contract, readiness, confidence, and safety allow.

7. Verification Engine
   - Computes completion confidence from proof lanes.
   - Reconciles WHOOP workout/recovery/cycle data, session biometric records, timers, measurements, photos when consented, and self-report.
   - Emits completion, partial, missed, review-needed, or safety-downshift.

8. UI Surfaces
   - Today/Focus command card.
   - Body Protocol authority panel and weekly review.
   - Settings authority contract and WHOOP privacy controls.
   - Session launch gates and debrief.

## Existing Touch Points

- WHOOP OAuth/sync: `api/whoop/[action].ts`, `src/hooks/useWhoop.ts`, `src/components/settings/WhoopCard.tsx`.
- WHOOP storage: `supabase/migrations/123_whoop_integration.sql`, `whoop_tokens`, `whoop_metrics`, `whoop_workouts`.
- WHOOP/Handler context: `api/handler/_lib/handler-context-builders.ts`, `buildWhoopContext`.
- Session biometrics: `supabase/migrations/144_session_biometrics.sql`, `src/hooks/useSessionBiometrics.ts`.
- Body program: `src/lib/body-program.ts`, `src/components/today-redesign/BodyProtocolView.tsx`, `WorkoutCard`, `BodyMeasurementCard`, `FitnessTrackerCard`, `ProteinSection`.
- Authority plane: `supabase/migrations/029_handler_authority.sql`, `src/lib/handler-authority.ts`, `src/hooks/useHandlerAuthority.ts`.
- Timing/receptivity: `src/lib/timing-engine.ts`, `state_predictions`, `receptive_window_states`.
- Obligation/enforcement concepts: existing obligations, surfaced-at behavior, safeword persistent latch, anti-fabrication prompts.
- Session surfaces: `SessionLauncher`, `UnifiedSessionView`, meditation/hypno/private-session cards.

## Repo Gaps To Resolve

- `body_feminization_directives` appears heavily used but its creation migration was not found. Verify actual schema before attaching foreign keys.
- `receptive_window_states` is read and later protected by RLS, but its creation migration was not found. Verify before writing.
- `handler_authority.delegated_domains` is referenced elsewhere but not present in the base authority migration. Prefer a new feature-specific table rather than relying on drifted columns.
- `session_biometrics.session_id` has no typed source. Add `session_source` or create a join table so Handler conversations, conditioning sessions, edge sessions, and authority sessions do not collide.
- Existing code may query old biometric column names. Normalize on current table shape before building scoring.

## Data And Contracts

New migration target:

- `671_delegated_body_authority.sql` or next available migration number at implementation time.

New tables:

- `delegated_authority_contracts`
- `receptivity_scores`
- `authority_commands`
- `command_verifications`
- `biometric_sessions`
- `biometric_session_samples`
- `session_outcomes`
- `protocol_escalation_events`
- `body_protocol_reviews`
- `body_transformation_profiles`
- `feminine_measurement_snapshots`

New service/API contracts:

- `POST /api/body-authority/contract`
- `POST /api/body-authority/command/next`
- `POST /api/body-authority/command/:id/verify`
- `POST /api/body-authority/session/start`
- `POST /api/body-authority/session/sample`
- `POST /api/body-authority/session/complete`
- `POST /api/body-authority/protocol/baseline`
- `POST /api/body-authority/protocol/week-plan`
- `POST /api/body-authority/protocol/review`
- Edge function: `body-authority-orchestrator`
- Edge function: `receptivity-score-refresh`
- Reconditioning library/service: `guided-reconditioning-engine`
- Optional: `POST /api/whoop/webhook` using WHOOP v2 webhooks if production callback infrastructure is available.

## WHOOP Integration Plan

Use the current WHOOP integration as the first biometric source:

- OAuth scopes: recovery, cycles, workout, sleep, profile, body measurement, and offline refresh where configured.
- Readiness inputs: recovery score, HRV, resting heart rate, sleep performance, sleep debt, day strain, workout strain, average HR, max HR, and body measurements.
- Verification inputs: workout start/end, sport, strain, average HR, max HR, percent recorded, and zone durations when available.
- Freshness: use `fetched_at`, metric dates, webhook timestamps, and reconciliation jobs. Stale WHOOP data can downshift or ask for self-report, never increase authority.
- Webhooks: if enabled, process update/delete notifications asynchronously, validate signatures, dedupe by trace id, and retain reconciliation jobs because webhooks are notifications, not source-of-truth payloads.
- Live-session caveat: WHOOP API data is useful for recovery, workouts, sleep, strain, and post-session verification; it must not be presented as true live streaming unless the implementation actually has a fresh live signal.

Official WHOOP references checked 2026-07-13:

- https://developer.whoop.com/api/
- https://developer.whoop.com/docs/developing/oauth/
- https://developer.whoop.com/docs/developing/webhooks/

## Safety Gates

Gate every command, session launch, escalation, and device/content action through these checks:

- Active contract and matching domain.
- Clear-headed consent where required.
- No active safeword/panic/stop latch.
- No unresolved injury, severe fatigue, pain, dizziness, panic, dissociation, abnormal HR, privacy issue, third-party presence, or device failure.
- Biometric freshness and confidence tier match the intended claim.
- Domain boundary respected.
- Medical and irreversible real-world actions excluded.
- Notification privacy respected.
- Raw sensitive data excluded from LLM and analytics payloads unless specifically consented.

## Confidence Tiers

- C0 No Signal: missing consent, stale sensor, disconnected source, active safeword, privacy unsafe, conflicting user report. Allowed action: stop, ask, or offer low-intensity support.
- C1 Weak: self-report only, fewer than 7 baseline days, fewer than 5 comparable sessions, or non-live biometrics. Allowed action: suggestions and low-risk commands.
- C2 Moderate: fresh wearable data, 7-14 day baseline, no conflict, 5-29 comparable sessions. Allowed action: adjust exercise/meditation/reconditioning pacing and length within bounds.
- C3 Strong: fresh signal, stable baseline, at least 30 comparable tracked sessions for hypno/private personalization, and matching self-report. Allowed action: personalize pacing/content inside active consent.
- C4 Safety Override: stop/safeword, pain, panic, abnormal HR, sensor anomaly, privacy risk, third-party presence, device failure. Allowed action: stop and aftercare only.

Final confidence is the minimum eligible tier across consent, source freshness, baseline, sample size, signal agreement, and domain fit.

## UI Design Requirements

- The command is the first thing the user sees in the delegated body flow.
- Command card must show exact instruction, deadline, proof, reason, missed outcome, and safety controls.
- Use direct, decisive copy for authority commands. Use neutral copy for safety and privacy.
- Do not bury pause/revoke behind settings only.
- Receptivity explanation must say readiness/capacity/timing, not vulnerability.
- Reconditioning exercises should feel guided and directive, but must name the selected target and keep safety/stop controls visible.
- Weekly review must be dense and operational: progress, compliance, biometric alignment, next escalation, safety notes.
- Private-session copy and notifications must be discreet.

## Testing Strategy

Unit tests:

- Safety Kernel decisions.
- Receptivity scoring and confidence floors.
- 12-week protocol generation, feminine measurement derivation, progression, deload, and weekly adaptation.
- Reconditioning exercise selection and outcome learning thresholds.
- Command selection and escalation eligibility.
- Verification confidence aggregation.
- Privacy redaction and payload filtering.

Integration tests:

- WHOOP connected/disconnected/stale.
- Command generation from body program state.
- Session launch with active/paused/revoked contract.
- Safeword latch blocks orchestrator, session launch, content generation, and device actions.
- Deletion/export includes derived data.

E2E/manual QA:

- Activate authority, receive command, verify workout, weekly review.
- Low recovery downshifts workout.
- Stale WHOOP data does not increase intensity.
- Stop during session halts within 2 seconds and latches.
- Domain boundary between exercise, meditation, hypno, and private high-stimulation.

Ship gate:

- Zero open P0/P1 safety or privacy bugs.
- Automated coverage for every acceptance criterion.
- Manual QA script completed for each session type.

## Rollback Plan

- Feature flag the Body Authority contract and orchestrator.
- Pausing or disabling the contract stops new command generation immediately.
- Existing generated commands remain visible but are marked paused/retired, not deleted.
- Evidence and audit history remain exportable.
- WHOOP disconnect stops future collection; deletion flow removes historical and derived biometric data according to retention choice.
- Rollback migration should leave read-only audit data intact unless the user requests deletion.

## Constitution Check

- [x] Enhancement: Authority is stronger, clearer, and auditable.
- [x] Anti-fabrication: Sensor claims are confidence-gated.
- [x] Safeword: Persistent stop latch blocks commands and sessions.
- [x] Visible-before-penalized: Commands require surfaced_at, proof, deadline, and missed outcome before enforcement.
- [x] Delivery-first: Reuses existing systems and limits new abstractions to contract, scoring, safety, and audit.
- [x] Privacy: Sensitive data minimized, scoped, redacted, exportable, and deletable.
