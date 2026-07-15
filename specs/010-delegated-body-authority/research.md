# Research: Delegated Body Authority

Created: 2026-07-13

## Findings

The repo already has most of the raw material for delegated body authority. The missing piece is not another session surface; it is a governed orchestration layer that unifies authority, biometrics, body protocol, proof, and safety.

## Current Capabilities To Reuse

- WHOOP OAuth, token refresh, sync, disconnect, and session polling exist in `api/whoop/[action].ts`.
- WHOOP client state exists in `src/hooks/useWhoop.ts` and `src/components/settings/WhoopCard.tsx`.
- WHOOP data tables exist in `supabase/migrations/123_whoop_integration.sql`.
- Generic biometric import exists in `supabase/functions/biometric-ingest/index.ts`.
- Session biometrics exist in `session_biometrics` and `src/hooks/useSessionBiometrics.ts`.
- Handler context already has WHOOP and session state builders.
- Body protocol primitives exist in `src/lib/body-program.ts` and Today body components.
- Authority, assigned tasks, scheduled sessions, and automatic decisions exist in the Handler authority plane.
- Timing/receptivity primitives exist in `timing-engine`, `state_predictions`, and `receptive_window_states` readers.
- Reconditioning and hypno-adjacent primitives exist in the current conditioning/session systems and should be governed by the new authority contract and Safety Kernel.
- Safeword persistent latch and RLS patterns exist and should be reused.

## WHOOP Capability Summary

Official WHOOP docs checked on 2026-07-13 confirm OAuth 2.0 support, short-lived access tokens, optional refresh tokens with `offline`, and user-consented scopes for recovery, cycles, workouts, sleep, profile, and body measurement. WHOOP API docs expose recovery, cycle, sleep, workout, user profile, and body measurement endpoints. WHOOP webhooks can notify update/delete events for workout, sleep, and recovery; the app must fetch the actual data after receiving the event and should still run reconciliation.

Planning implications:

- WHOOP is good for recovery, sleep, strain, workout verification, and trend-based personalization.
- WHOOP should not be treated as true live streaming by default.
- The app should not claim "your heart rate is now X" unless a fresh current sample exists.
- Webhooks should improve freshness but not replace polling/reconciliation.
- Disconnect must stop collection and should offer historical/derived deletion.

Sources:

- https://developer.whoop.com/api/
- https://developer.whoop.com/docs/developing/oauth/
- https://developer.whoop.com/docs/developing/webhooks/

## Receptivity Signal Model

Receptivity is a domain-specific readiness score. It should be computed for the requested use case, not as a global permission to escalate.

WHOOP factors:

- Recovery score.
- HRV RMSSD.
- Resting heart rate.
- Sleep performance, efficiency, duration, and sleep debt.
- Day strain.
- Workout strain, average HR, max HR, percent recorded, and zone durations.
- Body measurements where relevant.
- Data freshness and source confidence.

App factors:

- Active authority contract and domain.
- Body program phase and command backlog.
- Recent command completion and misses.
- Proof quality and correction history.
- Soreness, fatigue, pain, injury, illness, mood, distress, and dysphoria feedback.
- Calendar/schedule availability.
- Session outcomes and aftercare notes.
- Existing state predictions.
- Reconditioning exercise history, target, completion, self-rated influence, and next-day behavior follow-through.

Session factors:

- Pre-session snapshot.
- In-session samples when available.
- Stop/pause events.
- Post-session feedback.
- Perceived depth/focus.
- Recovery response after session.

## Decision Rules

- High readiness plus recent compliance can increase command difficulty, proof strictness, session length, or scheduling assertiveness.
- Poor recovery lowers physical intensity and may route toward recovery, mobility, measurement, planning, or light meditation.
- Low confidence cannot produce strong sensor claims.
- Stale biometrics can only downshift, ask, or fall back to self-report.
- Safety override always stops escalation.
- A user report of pain, panic, dizziness, dissociation, injury, privacy risk, or "not now" overrides biometric optimism.
- At least 30 comparable tracked sessions are required before strong hypno/private-session personalization claims.
- Exercise readiness, meditation readiness, hypno readiness, and private-session readiness must remain separate.
- Reconditioning readiness can increase prompt timing, repetition, and exercise choice, but cannot add new goals, widen consent, or override refusal.

## Guided Reconditioning Model

Guided reconditioning is the layer that turns receptive windows into concrete behavior-change work. It should be built as a library of short, structured exercises that can be commanded or offered by the app.

Exercise families:

- Body-protocol priming: prepare the user to begin a workout, measurement, posture block, recovery block, or nutrition action.
- Identity rehearsal: repeat and visualize a selected body/behavior identity already chosen in the contract.
- Implementation intention: convert a command into an immediate "when X, I do Y" action.
- Urge surfing: ride out avoidance, craving, delay, or resistance without escalating into shame.
- Somatic focus: breathing, posture, muscle engagement, relaxation, and body-awareness drills.
- Post-session lock-in: brief reflection and next action after workout, meditation, or hypno.
- Recovery compliance: reinforce sleep, hydration, rest, stretching, and lower-intensity choices when readiness is low.

Selection inputs:

- Current command and target.
- Receptivity score and confidence tier.
- Recent misses or friction.
- Session type, privacy state, and available time.
- Safety Kernel decision.
- User feedback on what felt effective.

Outcome tracking:

- Exercise completion.
- Immediate readiness/focus shift.
- Next-command compliance.
- Biometrics where permitted.
- User-rated helpfulness.
- Safety/aftercare flags.

Rules:

- Reconditioning suggestions must stay inside explicit chosen goals.
- Strong claims require enough comparable sessions and matching self-report.
- The app may use direct authority voice for selected targets, but safety, consent, and sensor facts stay neutral and truthful.
- Reconditioning cannot happen as hidden background persuasion. It is a visible exercise, command, or session.

## Verification Confidence Model

Final confidence is the lowest eligible tier among consent scope, source freshness, baseline quality, sample size, signal agreement, and domain fit.

- C0 No Signal: missing consent, stale sensor, disconnected source, active safeword, privacy unsafe, or conflicting user report.
- C1 Weak: self-report only, fewer than 7 baseline days, fewer than 5 comparable sessions, or non-live biometrics.
- C2 Moderate: fresh wearable data, 7-14 day baseline, no conflict, and 5-29 comparable sessions.
- C3 Strong: fresh signal, stable baseline, at least 30 comparable tracked sessions for hypno/private personalization, and matching self-report.
- C4 Safety Override: stop/safeword, pain, panic, abnormal HR, sensor anomaly, privacy risk, third-party presence, or device failure.

## Safety And Privacy Baselines

Safety:

- The Safety Kernel must outrank prompts, persona, session generation, device commands, scheduled jobs, and autonomous decisions.
- Stop/safeword/panic must halt active stimulation and persist until manual resume.
- No consent changes during altered-state, high-stimulation, sleep/wake-transition, acute distress, intoxication, or immediate post-session periods.
- No penalties for stop, pause, safeword, aftercare, sensor disconnect, or privacy risk.
- No hidden post-session triggers outside explicit fantasy/session scope.
- No medical prescription, dosing, dangerous restriction, injury rehab, or irreversible action.

Privacy:

- Store derived summaries by default.
- Keep OAuth tokens service-side only.
- Exclude raw biometric and intimate session payloads from LLM prompts, analytics, notifications, and client logs unless separately consented.
- Provide export and deletion for raw and derived data.
- Use neutral notifications by default.
- Maintain audit trails without storing unnecessary intimate detail.

External privacy/safety references:

- NIST Privacy Framework: https://www.nist.gov/privacy-framework
- NIST AI Risk Management Framework: https://www.nist.gov/itl/ai-risk-management-framework
- FTC biometric information warning: https://www.ftc.gov/news-events/news/press-releases/2023/05/ftc-warns-about-misuses-biometric-information-harm-consumers

## Schema Risk Notes

- Some existing modules may query legacy metric names. Implementation should normalize current WHOOP/session shapes before scoring.
- `body_feminization_directives` and `receptive_window_states` should be verified before adding foreign keys.
- `session_biometrics.session_id` needs a source/type so authority sessions can be joined reliably.
- WHOOP tokens should not be readable from client-facing RLS paths; expose a status view instead.

## Product Decision

Proceed with a new feature package named Delegated Body Authority:

- New tables for contracts, commands, receptivity scores, verification, sessions, outcomes, escalation, and reviews.
- New safety kernel and readiness scorer.
- Existing UI surfaces extended rather than replaced.
- WHOOP as first biometric source with future provider abstraction.
- Escalation default is yes inside contract, but safety veto is absolute.
