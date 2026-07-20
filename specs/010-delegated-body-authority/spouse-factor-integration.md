# Spouse Factor Integration

## Product Boundary

The spouse-facing product is an honest fitness and body-composition support surface. It can invite Gina to help with measurement capture, workout timing, accountability, exercise preferences, meal support, recovery nudges, and visual/aesthetic progress goals.

It must not ask her to unknowingly perform a sexualized or gender-transition role. If a future version includes explicit feminization, erotic accountability, or partner-directed gender expression, that becomes a separate opt-in tier with clear language and consent.

## Motivation Model

The app can still use spouse involvement as a powerful change driver:

- Partner-assisted measurements create a higher-integrity baseline.
- Her workout votes influence what the app prescribes.
- Her check-in cadence raises accountability without making her responsible for enforcement.
- Her encouragement style changes notification copy and post-workout prompts.
- Her aesthetic preferences can be captured as neutral body-shape goals, such as waist reduction, glute growth, posture, flexibility, conditioning, and leaner presentation.
- Private interpretation stays private to the primary user. The spouse surface only says what it honestly does.

## Consent Tiers

### Tier 1: Fitness Support

Default spouse mode. Language: exercise, body composition, health, consistency, measurement repeatability.

Allowed spouse actions:

- Capture baseline measurements.
- Check off baseline photos were taken.
- Choose workout focus votes.
- Choose check-in cadence.
- Choose encouragement tone.
- Add partner notes.
- Confirm whether a workout happened.

Not allowed:

- Sexual prompts.
- Hidden feminization language.
- Kink roles.
- "Make me" or delegated authority framing.

### Tier 2: Aesthetic Coaching

Still non-sexual, but more appearance-oriented. Requires explicit opt-in because it asks for preferences about how the user's body looks.

Allowed spouse actions:

- Vote on visual goals: leaner waist, bigger glutes, posture, flexibility, softer presentation, camera readiness.
- Rank priorities.
- Leave supportive style feedback.

Guardrail:

- The UI frames this as aesthetic/body-composition coaching, not feminization.

### Tier 3: Gender-Expression Support

Only if Gina explicitly opts in. This tier can mention gender expression, feminizing goals, wardrobe, presentation, and identity-aligned body goals.

Required:

- Clear consent screen.
- Revocable access.
- Separate language from the neutral fitness mode.
- Audit trail of what she agreed to.

### Tier 4: Intimate / Erotic Accountability

Not part of spouse-safe fitness mode. Requires explicit, informed, ongoing consent from both people.

## Implementation Plan

### 1. Baseline Intake

Implemented as a neutral route: `#/baseline-intake`.

Captures:

- Date and time.
- Helper name.
- Unit system.
- Weight, waist, hips, chest, underbust, shoulders, thigh, neck.
- Baseline photo checklist.
- Partner exercise input.
- Notes.

Stores into `body_metrics` with source `card`; partner fields are currently appended to notes.

### 2. Partner Exercise Input

Current intake fields:

- Partner input on/off.
- Check-in cadence: after workouts, twice weekly, weekly.
- Encouragement style: encouraging, direct, playful.
- Helpful nudges: workout windows, walks/cardio, strength days, recovery/sleep.
- Workout focus votes: upper, lower, core, cardio, mobility, outdoor.
- Partner note.

Next upgrade:

- Move partner fields into a structured `partner_fitness_preferences` table.
- Add `partner_preference_version`.
- Add `last_partner_reviewed_at`.
- Feed these preferences into workout generation.

### 3. Workout Influence Engine

Use spouse input as weighted constraints:

- Workout focus votes increase prescription probability.
- Check-in cadence schedules reminders.
- Encouragement tone selects notification copy.
- Partner notes become soft constraints reviewed by the planner.
- Missed workouts can generate a neutral "partner check-in suggested" card.

Acceptance criteria:

- The planner can explain which partner inputs influenced today's workout.
- The spouse-facing explanation remains neutral.
- The private user view may show "partner factor active" without exposing private interpretation.

### 4. Measurement Accountability

Use spouse-assisted measurement as higher confidence data:

- Helper name present = higher confidence.
- Baseline photo checklist complete = higher confidence.
- Repeatable notes improve trend reliability.
- Outlier jumps still trigger evidence-required safeguards.

Acceptance criteria:

- Baseline measurement saves to `body_metrics`.
- Body metrics page shows latest measurement age.
- Weekly check-in copy stays neutral in focused mode.

### 5. Partner Portal

Future route: `#/partner`.

Spouse-facing pages:

- Today's fitness check-in.
- Measurement capture.
- Workout focus vote.
- Encouragement note.
- Progress summary.

Security:

- Separate partner token or short-lived QR handoff.
- Revocable access.
- No private modules.
- No hidden private copy in partner payloads.

### 6. Private Motivation Overlay

The user's private app can interpret spouse participation as motivationally meaningful, but it must not rewrite her role or imply consent she did not give.

Allowed:

- "Partner factor active."
- "Gina's workout vote increased lower-body priority today."
- "Partner-assisted baseline raises confidence."

Avoid:

- Claims that Gina is intentionally feminizing the user unless she explicitly opted into that tier.
- Erotic or coercive framing tied to her neutral actions.

## Success Criteria

- A spouse can use the intake without seeing private intent.
- The intake creates a real baseline for future progress.
- Partner input measurably affects workout prescriptions.
- The user feels more accountable because spouse choices shape the plan.
- The app preserves consent boundaries and does not manipulate a third party into an undisclosed intimate role.
