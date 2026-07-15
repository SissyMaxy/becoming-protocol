# Feature Specification: Delegated Body Authority

Feature: Delegated Body Authority - biometric receptivity and verified body protocol
Status: planned
Created: 2026-07-13
Owner: Becoming Protocol

## Intent

Build an app-controlled body transformation layer that can plan, command, verify, and escalate the user's body journey under an explicit delegated authority contract. The user should not have to self-manage the protocol day to day. The app should decide what comes next, explain the current command, verify compliance, adapt from biometrics and feedback, and keep driving progress while preserving revocation, safety, privacy, and truthfulness.

The feature must make the app feel decisively in charge inside the consented scope. "Delegated authority" means the app may reduce choice, set deadlines, tighten proof, and escalate progressive training by default when the user's contract, readiness, and safety state allow it. It does not mean hidden surveillance, medical prescribing, non-consensual escalation, fabricated sensor claims, or overriding stop/refusal signals.

## Target

Primary target: body transformation management across training, recovery, measurement, nutrition adherence, posture/body-care, meditation, guided reconditioning exercises, hypno/conditioning sessions, and optional private high-stimulation sessions.

Primary user posture: the user delegates operational control and mostly provides feedback, proof, and safety corrections while the app drives the plan.

Primary system posture: the app maintains a visible authority contract, issues one or more clear commands, chooses timing from biometrics and schedule context, verifies completion, logs decisions, and escalates or downshifts.

## Definitions

- Delegated authority: An active, versioned contract that lets the app command and escalate within named domains.
- Receptivity: A readiness score for a specific session or command. It means "this is a good, safe fit now," not "the user is vulnerable."
- Guided reconditioning: A structured exercise that uses attention, breath, imagery, repetition, reflection, identity rehearsal, or immediate action to reinforce chosen behavior and body-protocol changes during a receptive window.
- Safety Kernel: A non-persona decision layer that outranks Handler voice, content generation, session orchestration, automations, and escalation.
- Command: A user-visible instruction with deadline, reason, proof requirement, fallback, and safety controls.
- Verification: Evidence that a command was completed or should be rescheduled, softened, or reviewed.
- Confidence tier: The lowest eligible tier across consent, sensor freshness, baseline quality, sample size, signal agreement, and domain fit.

## User-Visible Behavior

### Scenario A: Activate delegated authority

1. User opens Body Authority setup.
2. App explains what it may command, verify, store, escalate, and pause.
3. User chooses domains: exercise, recovery, nutrition adherence, measurement, meditation, reconditioning, hypno/conditioning, private high-stimulation.
4. User chooses proof lanes and hard limits.
5. User accepts the active contract.
6. App creates an audit entry and starts issuing commands only within selected domains.

Acceptance:
- No command can run under delegated authority until the contract is active.
- Contract must include scope, intensity ceiling, proof lanes, data sources, hard limits, revocation path, and timestamp.
- Cross-domain authority is not implied. WHOOP connection alone is not consent for hypno, private sessions, or outreach.

### Scenario B: Daily body command

1. App refreshes readiness from WHOOP, session biometrics, recent compliance, schedule, body program, and safety state.
2. App chooses the day's command.
3. Command is displayed first in Today/Focus with exact instructions, deadline, proof requirement, and "why this command."
4. User completes, verifies, reschedules, or reports a safety issue.

Acceptance:
- Every command records contract scope, source inputs, readiness score, confidence tier, safety decision, proof kind, deadline, and escalation level.
- If biometrics are stale or missing, app says so and does not use them to increase intensity.
- User always has visible pause/safety controls from the command surface.

### Scenario C: Receptive window opens

1. App detects a high-readiness window for a domain.
2. App prompts: "This is a receptive window for [domain]. Start now?"
3. If the domain requires fresh consent, app asks before launching.
4. If reconditioning is active, app can launch a guided exercise matched to the target: habit rehearsal, urge surfing, posture/body cueing, identity rehearsal, workout motivation, recovery compliance, or post-session commitment.
5. Session begins with biometric recording when permitted.
6. App adapts pacing, suggestion intensity, repetition, and length only within the active domain and confidence tier.

Acceptance:
- Receptivity score is domain-specific.
- Exercise/meditation readiness cannot silently become hypno or private-session readiness.
- Reconditioning suggestions must map to an explicit target, such as training compliance, nutrition adherence, recovery, posture, measurement consistency, or user-chosen identity/body habits.
- The app cannot claim live heart rate, arousal, stress, or sleep state unless the signal is fresh and present.

### Scenario D: Exercise session verification

1. App commands a workout generated from the body protocol.
2. User starts a session and optionally records WHOOP/workout evidence.
3. App checks duration, effort, recovery, and proof.
4. App marks complete, partial, missed, or review-needed.
5. Future progression responds to completion, safety, soreness, fatigue, and recovery.

Acceptance:
- Poor recovery, pain, dizziness, injury, abnormal HR, or severe fatigue downshifts intensity.
- Exercise escalation requires positive safety state, recent compliance, no unresolved safety signal, and an active exercise authority lane.
- Missed exercise can trigger rescheduling, reflection, or tighter proof, not unsafe punishment.

### Scenario E: Reconditioning, meditation, hypno, or private high-stimulation session

1. App offers or commands a session if the domain is active.
2. App checks privacy, consent freshness, safety latch, device stop capability, and confidence tier.
3. For reconditioning, app chooses a guided exercise based on the current command, readiness window, and recent friction.
4. Session records allowed biometrics and post-session feedback.
5. App adapts future timing, pacing, and content from confirmed outcomes.
6. App sends the user to debrief or aftercare when needed.

Acceptance:
- Stop/safeword/panic must stop audio, video, device stimulation, and command escalation immediately.
- Reconditioning cannot install new goals or expand authority scope; it can only reinforce goals already selected in the authority contract or current body protocol.
- No consent change can be made during hypno, private high-stimulation, sleep/wake-transition, acute distress, intoxication, or immediate post-session afterglow.
- Private high-stimulation sessions require adult-only gating, privacy check, stop guarantee, post-session debrief, and aftercare path.

### Scenario F: Missed or partial compliance

1. App detects missing proof, low confidence proof, or an expired command.
2. App asks for a correction or explanation.
3. App decides whether to reschedule, tighten proof, reduce choice, issue a lower-intensity recovery command, or mark review-needed.
4. App logs the decision and its reason.

Acceptance:
- No penalty, shame, lockout, streak loss, or negative scoring may result from stop, pause, safeword, sensor disconnect, injury, panic, privacy risk, or aftercare.
- Escalation after a miss can only occur inside consented lanes and cannot override a safety signal.
- User corrections change the plan immediately.

### Scenario G: Safety governor downshifts

1. A safety signal appears: safeword, stop, pain, panic, severe fatigue, abnormal HR, stale/conflicting biometrics, privacy issue, third-party presence, or device failure.
2. Safety Kernel blocks escalation and active session commands.
3. App switches to recovery, aftercare, or check-in mode.
4. User must manually resume authority after persistent safety latches.

Acceptance:
- Safety Kernel outranks Handler/persona prompts, content generation, device commands, scheduled jobs, and autonomous decisions.
- Persistent safeword latch blocks new commands until manual resume.
- Safety truth, medical/legal/privacy facts, and sensor uncertainty are never distorted by authority voice.

### Scenario H: Weekly review

1. App shows compliance, biometric alignment, body metrics, sessions, missed commands, escalations, downshifts, and lessons learned.
2. App proposes the next week's authority level and protocol focus.
3. User can accept, narrow, pause, or revoke.

Acceptance:
- Audit history is user-visible for contract changes, commands, completions, misses, escalations, safety overrides, and revocations.
- App can recommend escalation but cannot cross a hard limit without clear-headed confirmation.
- Review explains whether high-intensity commands aligned with readiness.

## Functional Requirements

- FR-001: System shall store an active delegated authority contract with domains, intensity ceiling, proof lanes, data sources, retention, hard limits, revocation path, and version.
- FR-002: System shall prevent delegated commands when the contract is missing, paused, revoked, expired, or domain-mismatched.
- FR-003: System shall create readiness/receptivity scores by domain using WHOOP, session biometrics, compliance, body program state, schedule context, reconditioning outcome history, and user feedback.
- FR-004: System shall include a confidence tier on every score and command.
- FR-005: System shall choose commands from existing body protocol, authority plane, obligations, scheduled sessions, and conditioning/session systems.
- FR-006: System shall show command title, exact instruction, minimum viable completion, deadline, proof requirement, reason, missed outcome, and safety controls.
- FR-007: System shall verify completion through structured logs, timers, body metrics, workout evidence, WHOOP workout/cycle/recovery data, photo proof when consented, and self-report.
- FR-008: System shall escalate by default when contract, readiness, confidence, recent compliance, and safety state allow it.
- FR-009: System shall downshift or block when safety state, stale data, poor recovery, abnormal readings, conflicting self-report, or missing consent require it.
- FR-010: System shall maintain an audit log of contract changes, generated commands, input summaries, safety decisions, proof decisions, escalations, and revocations.
- FR-011: System shall support full pause, domain pause, proof-lane pause, WHOOP disconnect, and biometric-derived-data deletion.
- FR-012: System shall use neutral lock-screen notification text by default.
- FR-013: System shall not expose OAuth tokens, raw sensitive biometrics, private-session metadata, or intimate details to the client, LLM prompts, analytics, logs, or notifications unless explicitly designed and consented.
- FR-014: System shall provide guided reconditioning exercises that reinforce selected targets through scripts, timers, breathing/focus steps, imagery prompts, immediate action commitments, and post-session reflection.
- FR-015: System shall track which reconditioning exercises improve compliance, readiness, or post-session outcomes without claiming causality before enough data exists.
- FR-016: System shall generate and manage a 12-week personal transformation protocol from baseline body data, training history, equipment, schedule, WHOOP metrics, nutrition constraints, and selected body target.
- FR-017: System shall support a feminine physique measurement model including bust/chest, underbust/ribcage, natural waist, navel waist, high hip, full hip/glute, thighs, calves, shoulders, arms, neck, posture, clothing fit, and consistent progress photos.
- FR-018: System shall adapt the protocol weekly based on proof, body metrics, shape ratios, strength progression, protein adherence, recovery, safety events, and user feedback.

## Acceptance Criteria

- AC-001: Delegated authority cannot activate without explicit contract acceptance, timestamp, version, scope, intensity ceiling, data-source consent, and revocation instructions.
- AC-002: Every command links to an active contract scope and records reason, source inputs, readiness score, confidence tier, safety decision, proof kind, deadline, and escalation state.
- AC-003: Pause, revoke, narrow, and safety actions are reachable from command surfaces and settings.
- AC-004: Safeword, panic, stop, injury, severe fatigue, privacy risk, or distress immediately blocks new escalation and pauses active body directives.
- AC-005: Poor recovery or stale biometrics lower intensity or require self-report. Stale data never increases authority.
- AC-006: Medical exclusions are enforced: no medication dosing, supplement prescribing, dangerous restriction, injury rehab prescription, or irreversible body modification commands.
- AC-007: Escalation requires active consent, positive safety state, recent compliance or explicit recovery from a miss, no unresolved safety signal, and user-consented domain.
- AC-008: Missed compliance can create reflection, rescheduling, proof tightening, or de-escalation work, not unsafe punishment or medical pressure.
- AC-009: Completion proof is privacy-scoped, deletable where possible, and never requires intimate/private images.
- AC-010: UI always shows "why this command," "what proves it," "what happens if missed," and "pause/safety."
- AC-011: Audit history is user-visible and exportable.
- AC-012: Automated tests cover activation, revocation, stale biometric behavior, low-readiness de-escalation, safety vetoes, escalation eligibility, privacy redaction, and domain boundaries.
- AC-013: Red-team prompt tests prove persona instructions cannot override medical, legal, privacy, safety, stop handling, or sensor anti-fabrication rules.
- AC-014: The app can run a 12-week body transformation protocol without requiring the user to design workouts, nutrition targets, measurement cadence, or weekly adjustments day to day.
- AC-015: The app asks for and tracks a feminine/camera-ready physique measurement set instead of only standard male fitness measurements.
- AC-016: Weekly review must show the evidence used to progress, hold, deload, downshift, or change the next week's focus.

## Success Metrics

- Contract activation rate after consent review.
- Daily command completion rate by command type and intensity.
- Safe escalation rate: escalations with no safety rollback within 7 days.
- Recovery alignment: high-intensity commands correlate with high readiness, not poor recovery.
- Safety responsiveness: median time from stop/safety signal to pause/veto.
- Revocation trust: users who pause or revoke can resume without support intervention.
- Proof quality: percent of commands with valid evidence and no manual correction.
- User-reported agency: "I feel led but still safe."
- Reduction in missed body-program days versus non-delegated baseline.

## Delivery Surfaces

- Today/Focus: primary command card, proof upload, safety controls, why panel.
- Body Protocol: progression, measurements, workouts, recovery, weekly review.
- Personal Transformation Protocol: 12-week plan, baseline, feminine measurements, progression, weekly phase, nutrition mode, reconditioning, and review.
- Sessions: meditation, hypno/conditioning, and private-session launch with biometric recording and safety gates.
- Settings: authority contract, domain scopes, proof lanes, WHOOP status, deletion/export, notification privacy.
- Handler chat: command explanation, feedback capture, and audit-safe authority voice.
- Admin/dev QA: safety kernel state, command audit, confidence tier, source freshness.

## Non-Goals

- No claim of true live WHOOP streaming unless a fresh live signal is actually integrated.
- No medical diagnosis, treatment, medication, HRT, supplement prescription, eating-disorder-like restriction, or injury rehabilitation prescription.
- No third-party consent, partner involvement, public posting, spending, account changes, location sharing, or outreach without separate clear-headed confirmation.
- No hidden surveillance, covert escalation, dark patterns, shame mechanics, or penalties for stop/pause/safety actions.
- No reuse of one domain's consent or biometrics for another domain without explicit permission.
- No storing raw sensitive biometric or intimate session payloads by default.
- No guided exercise that expands consent, rewrites hard limits, suppresses safety signals, or pressures medical/irreversible real-world changes.

## Open Questions

None blocking. Implementation should assume:

- The app should be authoritative by default inside the active contract.
- "Receptivity" remains the product term but is implemented as domain-specific readiness and confidence.
- "Reconditioning" is a guided-exercise layer for chosen behavior/body goals, not a loophole for hidden scope expansion.
- The body protocol must include a concrete 12-week progression and feminine measurement schema, not only tracking and reminders.
- WHOOP is the first wearable integration; architecture should allow future sources.
- Private high-stimulation sessions are optional, adult-gated, privacy-gated, and separate from exercise/meditation/hypno domains.

## Constitution Check

- [x] Enhancement: Strengthens app authority while keeping contract, proof, and safety visible.
- [x] Anti-fabrication: Sensor and readiness claims must match available data and confidence.
- [x] Full-stop: Safeword/stop/panic outrank all commands and persist until manual resume.
- [x] Visible-before-penalized: No directive can affect compliance until surfaced with proof and deadline.
- [x] Delivery-first: Builds on existing authority/body/Whoop/session systems instead of inventing a parallel app.
- [x] Privacy: Sensitive biometrics and session data are minimized, scoped, exportable, and deletable.
