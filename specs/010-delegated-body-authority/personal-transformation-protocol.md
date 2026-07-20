# Personal Transformation Protocol

Feature: Delegated Body Authority
Status: planned
Created: 2026-07-13

## Purpose

This document turns Delegated Body Authority into a concrete body-transformation operating system for one user. The app's job is not to "track fitness." The app's job is to create visible fitness and appearance change by commanding the right work, at the right time, with proof, adaptation, and reconditioning.

The user's private aspiration includes a camera-ready feminine body and presentation. The app should therefore track the body using a feminine physique model, not only generic male fitness measurements. That means the protocol must track shape, proportion, posture, curves, body composition signals, and presentation fit with the same rigor it tracks workouts.

The user grants broad latitude for in-app methods that improve follow-through: directive commands, reduced choice, scheduled prompts, proof demands, reconditioning exercises, biometric timing, missed-work recovery, and progressive escalation. The app should default to action and only ask when the answer changes consent, safety, privacy, injury risk, public exposure, or a hard limit.

## Success Definition

The protocol succeeds when the app can show, over 12 weeks:

- Higher weekly workout completion.
- Higher protein/nutrition adherence.
- Improving strength or work capacity.
- Improving recovery discipline.
- More camera-ready feminine presentation: waist-to-hip trend, glute/hip development, posture, shoulder/waist balance, clothing fit, and progress photos.
- Better body composition signals: weight trend, waist/hip/chest/shoulder/thigh measurements, progress photos, and user-rated appearance.
- Better biometric alignment: harder training on better recovery days and recovery work on lower-readiness days.
- Fewer missed days caused by avoidance, ambiguity, or lack of planning.

## Operating Thesis

Appearance change comes from four levers:

1. Training stimulus: progressive strength work, enough weekly volume, and movement consistency.
2. Nutrition: enough protein, enough total fuel for training, and body-composition adjustments from trends.
3. Recovery: sleep, lower stress load, rest days, and fatigue management.
4. Behavior execution: the app removes daily negotiation and uses reconditioning to make the next correct action easier.

The app should treat behavior change as part of the protocol, not a motivational add-on.

## Feminine Physique Tracking Model

The app should ask for measurements as though it is tracking a feminine body target and camera presentation. It should not default to a male-only measurement set.

Core measurements:

- Weight.
- Bust/chest at fullest point.
- Underbust/ribcage.
- Natural waist.
- Navel waist.
- High hip.
- Full hip/glute at widest point.
- Upper glute shelf if the user wants more detailed curve tracking.
- Left and right thigh at consistent height.
- Calves.
- Shoulders.
- Upper arms.
- Neck.
- Inseam and height for proportion context.

Derived shape metrics:

- Waist-to-hip ratio.
- Waist-to-shoulder ratio.
- Hip-to-shoulder ratio.
- Bust-to-underbust difference.
- Hip/glute change over time.
- Thigh symmetry.
- Weight trend versus waist/hip trend.
- Progress-photo score by pose and lighting consistency.

Presentation tracking:

- Front, side, back, and three-quarter progress photos.
- Optional clothed "camera-ready" set in the same outfit/lighting.
- Posture check: shoulders, rib flare, pelvic tilt, stance, neck/head position.
- Clothing fit notes: waist, hip, chest/bust, thigh, silhouette.
- Hair/skin/grooming/presentation notes if the user enables those domains.

Privacy:

- Photos are optional proof lanes and must be privacy-scoped.
- The app should never require explicit or intimate images as proof.
- If the adult-performer aspiration becomes real-world outreach, public posting, paid work, partner involvement, or account creation, that is outside this protocol and requires separate clear-headed confirmation.

## Onboarding Baseline

Before the app escalates, it must collect a baseline. If data is missing, the app starts with a 7-day calibration phase and fills gaps as commands.

Required baseline:

- Height.
- Weight and 7-day weight trend when available.
- Feminine physique measurement set from above.
- Front/side/back/three-quarter progress photos using consistent pose, distance, lighting, and clothing.
- Current workout history and estimated training level.
- Equipment access: gym, dumbbells, bands, bodyweight only, cardio equipment.
- Schedule constraints and preferred training windows.
- Injury, pain, mobility limits, and movements to avoid.
- Nutrition constraints, protein preferences, appetite pattern, and meal timing.
- Current step/activity average.
- WHOOP connection status, recovery trend, HRV/RHR baseline, sleep baseline, strain baseline, and workout history.
- User target: leaner, more muscular, stronger, glute/lower emphasis, upper/posture emphasis, cardio fitness, feminine silhouette, camera-ready presentation, or recomposition.

Output:

- `body_transformation_profile`
- feminine measurement schema
- 12-week target plan
- weekly command template
- first 7-day calibration commands

## Default 12-Week Arc

### Week 0: Calibration

Goal: collect data and install the command loop.

Commands:

- Baseline photos and measurements.
- 2-3 low-to-moderate strength sessions to assess tolerance.
- Daily protein logging.
- Daily sleep/recovery check.
- 2 easy cardio or walking sessions.
- Reconditioning exercise before each workout.

Escalation:

- No aggressive overload yet.
- App may tighten proof and reminders immediately.

### Weeks 1-4: Consistency Install

Goal: make training, protein, and measurement compliance automatic.

Minimum weekly floor:

- 3 strength sessions.
- 2 cardio or step-volume sessions.
- 5 protein-target days.
- 1 measurement/progress review.
- 3 guided reconditioning exercises tied to workout starts, nutrition, recovery, posture, or presentation.

Training:

- Start with the existing lower-led progression if it is the active body program.
- Add upper/posture/core accessories for a more generally fit and camera-ready appearance.
- Keep most sets at controlled effort with 1-3 reps in reserve.
- Progress reps first, then load.

Nutrition:

- App sets protein from body weight and goal.
- Starting planning range: roughly 1.6-2.2 g protein per kg body weight per day unless the user has a medical reason to use a different target.
- Calories are adjusted from 7-14 day trends, not single-day noise.
- No crash dieting or unsafe restriction.

### Weeks 5-8: Progressive Overload

Goal: make the body adapt.

Minimum weekly floor:

- 3-4 strength sessions.
- 2 cardio or step-volume sessions.
- 5-6 protein-target days.
- 1 recovery command after the hardest training day.
- 4 guided reconditioning exercises.

Training:

- Increase load, reps, sets, tempo difficulty, or range of motion when previous work was completed with good form.
- Maintain a lower-body/glute emphasis if chosen, but preserve posture/upper/core work so the result reads as fit and feminine in presentation.
- Add one optional specialization block if compliance is strong.

Escalation:

- If the user completes at least 85 percent of commands for 2 straight weeks and recovery is acceptable, app may tighten proof, reduce workout choice, and schedule harder sessions during high-readiness windows.

### Weeks 9-12: Consolidation And Visible Result

Goal: preserve consistency while sharpening the highest-impact levers.

Minimum weekly floor:

- 3-4 strength sessions.
- 2-3 cardio or step-volume sessions.
- 6 protein-target days when tolerated.
- 1 weekly review.
- 4-5 guided reconditioning exercises.

Training:

- Keep progressive overload where recovery allows.
- Use deload or reduced-volume week if fatigue accumulates.
- Add short finishers only when recovery and soreness allow.

Review:

- Compare photos and measurements every 2 weeks.
- Compare strength, work capacity, and compliance every week.
- App proposes the next 4-week focus: build, lean, recover, specialize, or maintain.

## Weekly Command Template

The orchestrator should generate a weekly plan, then issue daily commands.

Default week:

- Day 1: Strength A plus workout-start reconditioning.
- Day 2: Protein/recovery plus easy walk.
- Day 3: Strength B plus posture or core accessory.
- Day 4: Cardio/steps plus nutrition or posture reconditioning.
- Day 5: Strength C plus post-workout lock-in.
- Day 6: Recovery, mobility, presentation practice, or optional specialization if green.
- Day 7: Review, measurement/photo when due, plan acceptance.

The app can reorder based on WHOOP recovery, schedule, soreness, and prior completion.

## Daily Command Structure

Every command should contain:

- Primary order: the one thing that must happen.
- Minimum viable completion: the smallest acceptable version.
- Timing: now, next window, or deadline.
- Proof: workout log, timer, WHOOP support, protein log, metric, photo, or text.
- Reason: why this command today.
- Reconditioning: a short guided exercise when friction or opportunity is high.
- Missed outcome: reschedule, proof tightening, lower-intensity recovery work, or review.
- Safety check: pain, dizziness, severe fatigue, illness, privacy, stop.

Example:

```text
Primary: Complete Strength A.
Minimum: Warmup plus first two working sets.
Window: 6:00-8:00 PM. Start at 6:30 unless blocked.
Proof: Workout timer plus completion note. WHOOP workout support if present.
Reason: Recovery is moderate, last lower session was completed, and soreness is low.
Reconditioning: 90-second start primer before changing clothes.
Missed outcome: reschedule within 24 hours and tighten proof tomorrow.
```

## Biometric Adaptation Rules

The app should use relative baselines rather than brittle one-size thresholds.

Inputs:

- WHOOP recovery score.
- HRV versus personal baseline.
- Resting heart rate versus personal baseline.
- Sleep duration/performance/debt.
- Day strain and recent workout strain.
- Soreness, pain, illness, mood, and subjective readiness.
- Session biometrics when available.

Readiness bands:

- Green: train as planned or progress.
- Yellow: train but hold progression, reduce volume, or extend warmup.
- Red: switch to recovery, mobility, walking, nutrition, measurement, or light reconditioning.
- Safety override: stop/aftercare only.

Rules:

- Strong training commands require acceptable recovery and no conflicting safety signal.
- Poor recovery can never justify harder training.
- Good recovery can escalate only inside the active contract.
- If user report conflicts with biometrics, the lower-risk interpretation wins.
- If data is stale, the app asks or uses conservative defaults.

## Training Progression Rules

For each lift or movement pattern:

- If all sets are completed with good form and target reps are reached, progress next time.
- Progression options: add reps, add load, add set, slow tempo, increase range, reduce rest.
- If form breaks, pain appears, or completion drops, hold or reduce.
- If recovery is low, keep movement but reduce volume/intensity.
- Every 4th week can become a deload if fatigue markers rise.

Appearance-focused movement categories:

- Lower body/glutes/legs: hip thrust, bridge, squat/lunge, hinge, abduction, carry.
- Upper/posture: row, pulldown/pullup progression, pushup/press, rear delts, external rotation.
- Core/waist support: anti-rotation, carries, planks, dead bug, breathing/bracing.
- Cardio/conditioning: zone 2, intervals only when recovery supports them, steps.
- Mobility/recovery: hips, ankles, thoracic spine, hamstrings, calves, shoulders.
- Presentation: posture, stance, walk mechanics, shoulder/rib/pelvis positioning, camera-pose practice.

## Nutrition And Body Composition Rules

The app should choose one of three modes:

- Recomposition: keep calories near maintenance, high protein, progressive training.
- Leaning: mild calorie deficit based on trend, not aggressive restriction.
- Building: small surplus or maintenance-plus when strength gain and size are the target.

Rules:

- Protein is the first nutrition command because it supports training adaptation and satiety.
- Calorie changes require at least 7-14 days of trend data unless the user explicitly logs a major change.
- The app should avoid shame language around food.
- If appetite is low, the app uses protein-first meal planning and smaller repeated prompts.
- If missed protein repeats, the app issues grocery/prep commands before blaming compliance.
- Hydration, fiber, and meal timing can be used as support commands.

## Reconditioning Protocol

Reconditioning is a guided exercise at the moment the user is most likely to act. It should produce an immediate behavior, not just a feeling.

Eligible windows:

- Before the planned workout start.
- Immediately after putting on workout clothes or opening the workout card.
- After a completed set or workout, to lock in identity and next action.
- Before the first meal or protein decision.
- During avoidance, delay, or urge to skip.
- During a calm, focused meditation window.
- During a high-readiness window identified by biometrics and schedule.
- Before bed for recovery compliance, if the user is awake and has opted in.
- Before measurement/photo review, to keep the user consistent and evidence-oriented.

Exercise families:

- Start primer: 60-120 seconds to begin the workout without negotiation.
- Implementation intention: "When [cue], I do [specific action]."
- Identity rehearsal: rehearse being the person who follows the body protocol.
- Feminine presentation rehearsal: posture, stance, breath, and camera confidence.
- Urge surfing: ride out avoidance/craving without acting on it.
- Somatic focus: breath, posture, muscle engagement, and attention.
- Nutrition lock: choose and start the next protein action.
- Recovery lock: downshift when the body needs recovery.
- Post-workout lock-in: record proof, protein, and next session commitment.

Rules:

- Reconditioning must be visible and attached to a selected target.
- It cannot create new goals, expand consent, or rewrite hard limits.
- It can use direct language and repeated cues, but cannot suppress stop, pain, panic, or refusal signals.
- The app should learn which exercises lead to completed actions for this user.
- Strong claims about effectiveness require repeated comparable sessions and matching self-report.

## Escalation Ladder

Level 0: Calibration

- Collect baseline.
- Keep commands simple.
- Require proof but avoid hard progression.

Level 1: Standard Authority

- Daily command.
- Proof required for workouts/protein/measurements.
- Reconditioning offered before likely friction points.

Level 2: Reduced Choice

- App selects workout time and exercise variant.
- Missed command creates same-day recovery or reschedule.
- Proof strictness increases.

Level 3: High Accountability

- App plans the week.
- User can give feedback but does not choose the plan unless safety/schedule requires it.
- Reconditioning is commanded when avoidance is detected.
- Weekly review can escalate volume, proof, or reminder cadence.

Level 4: Peak Drive

- Only available after strong compliance and safe recovery.
- App uses best biometric windows for harder sessions.
- App increases progressive overload or specialization.
- App can issue multiple linked commands: prime, train, protein, proof, recover.

Downshift:

- Any safety override, injury, severe fatigue, illness, panic, privacy issue, or repeated recovery failure drops the ladder until resolved.
- Downshift is not failure; it is the app preserving the transformation.

## Verification Plan

Daily:

- Workout status.
- Protein progress.
- Sleep/recovery check.
- Reconditioning completed when assigned.

Weekly:

- Workout completion percentage.
- Strength progression.
- Protein-target days.
- Cardio/step completion.
- Average recovery and sleep.
- Body weight trend.
- Safety events and downshifts.

Biweekly:

- Progress photos.
- Feminine physique measurements.
- Fit/appearance self-rating.
- Protocol adjustment.

12-week:

- Before/after review.
- Measured compliance.
- Strength/work-capacity change.
- Body metrics and photo comparison.
- Feminine presentation and camera-ready confidence review.
- Next-phase recommendation.

## Failure Modes And Corrections

Ambiguity:

- Correction: app issues a single command, not a menu.

Avoidance:

- Correction: command a start primer and minimum viable completion.

Low recovery:

- Correction: switch to recovery, walking, mobility, or nutrition. Do not intensify.

Repeated missed protein:

- Correction: grocery/prep command, easier protein defaults, meal timing prompts.

Workout skipped:

- Correction: same-day minimum session or 24-hour reschedule, plus proof tightening.

Plateau:

- Correction: check adherence first, then adjust calories, volume, cardio, or recovery after enough trend data.

Pain:

- Correction: stop the movement, substitute lower-risk work, require feedback, and block escalation until resolved.

Data gap:

- Correction: ask for self-report or issue a conservative command.

Measurement avoidance:

- Correction: reconditioning first, then a minimum viable clothed measurement/photo set.

## Implementation Requirements

- Add `body_transformation_profile` concept using existing body metrics, workouts, protein logs, WHOOP metrics, and authority contract data.
- Add feminine measurement schema and derived shape metrics.
- Add weekly protocol generator that creates a week plan before daily commands.
- Add 12-week phase state to command selection.
- Add training progression logic for exercise patterns, not only a fixed lower-body sequence.
- Add protocol modes: recomposition, leaning, building.
- Add reconditioning exercise selection tied to current command and friction state.
- Add review UI that shows actual progress and app decisions.
- Add tests for calibration, progression, deload, downshift, plateau response, missed command handling, and reconditioning selection.

## Acceptance Criteria

- The app can create a 12-week protocol from baseline inputs.
- The app asks for and tracks a feminine physique measurement set, not only standard male fitness measurements.
- The user receives exactly one primary body command per day unless a linked command is intentionally generated.
- Every workout has a minimum viable completion and proof requirement.
- Every nutrition/protein target has an easier fallback when appetite or schedule interferes.
- WHOOP readiness can reorder or downshift training but cannot intensify stale or conflicting data.
- Reconditioning can be commanded at receptive windows and must produce a next action or reflection.
- Weekly review changes the plan from evidence, not vibes.
- The app can explain why it escalated, held, downshifted, or rescheduled.
- The protocol can be run for 12 weeks without the user needing to design workouts day to day.
