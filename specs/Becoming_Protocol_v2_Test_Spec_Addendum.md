# BECOMING PROTOCOL v2 -- TEST SPECIFICATION ADDENDUM
## Covers: Gina Pipeline Engine (F3 expansion), Phase G, Phase H
## February 2026

---

# HOW TO USE THIS ADDENDUM

This extends `Becoming_Protocol_v2_Test_Spec.md` with tests for:
- **F3 (expanded):** Gina Pipeline engine -- ladder state, seed management, measurements, rung advancement, recovery protocols, trigger conditions, composite scoring
- **F4 (new):** Gina Pipeline UI -- GinaLadderView, SeedLogger, MeasurementForm, ChannelDetail, DisclosureMap
- **Phase G:** Dashboard widgets, journal, evidence capture
- **Phase H:** Settings, PWA, offline mode

Test IDs continue from existing spec. Same format: ID, Type, Priority, Validates, Pass Criteria.

**Files under test:**
- `src/lib/gina/ladder-engine.ts`
- `src/lib/gina/seed-manager.ts`
- `src/lib/gina/measurement-engine.ts`
- `src/components/gina/GinaLadderView.tsx`
- `src/components/gina/SeedLogger.tsx`
- `src/components/gina/MeasurementForm.tsx`
- `src/components/gina/ChannelDetail.tsx`
- `src/components/gina/DisclosureMap.tsx`
- `src/components/dashboard/Dashboard.tsx`
- `src/components/dashboard/DomainProgress.tsx`
- `src/components/dashboard/StreakCalendar.tsx`
- `src/components/dashboard/EvidenceGallery.tsx`
- `src/components/dashboard/InvestmentTracker.tsx`
- `src/components/dashboard/CommitmentDashboard.tsx`
- `src/components/journal/JournalView.tsx`
- `src/components/journal/DailyEntry.tsx`
- `src/components/journal/EvidenceCapture.tsx`
- `src/components/settings/Settings.tsx`

---

# F3: GINA PIPELINE ENGINE (EXPANDED)

Replaces the original F3.1 and F3.2 (which are retained as F3.1 and F3.2 below). All new tests start at F3.3.

## F3.1 -- Gina Visibility Level Tracking (RETAINED)
```
ID: F3.1
Type: integration
Priority: P2
Validates: v2 Part 7.2

VERIFY:
  - gina_visibility_level starts at 0
  - Can be updated through settings
  - Level determines what shared view shows (if shared view exists)
  - Handler respects current level in recommendations

PASS: Visibility level persisted and referenced.
```

## F3.2 -- Gina-Safe Task Filtering (RETAINED)
```
ID: F3.2
Type: unit
Priority: P0

GIVEN: ginaHome = true
THEN: NO tasks from these categories appear:
  - edge, deepen, worship, fantasy
  - corrupt, bambi
  - Any task with requires_privacy = true

GIVEN: ginaHome = false
THEN: All tasks eligible

PASS: Zero intimate/private tasks when Gina is present.
```

---

## F3.3 -- Ladder State Initialization
```
ID: F3.3
Type: schema
Priority: P0
Validates: Build Spec Phase F, Migration 005

STEPS:
  1. New user completes intake with partner_status = 'married'
  2. Query gina_ladder_state for that user

VERIFY:
  - 10 rows exist, one per channel:
    scent, touch, domestic, intimacy, visual, social,
    bedroom, pronoun, financial, body_change_touch
  - All rows: current_rung = 0, consecutive_failures = 0
  - cooldown_until is NULL for all

PASS: All 10 channels initialized at rung 0 with clean state.
```

## F3.4 -- Ladder State Table Schema
```
ID: F3.4
Type: schema
Priority: P0

VERIFY gina_ladder_state table has columns:
  id (uuid), user_id (uuid), channel (text), current_rung (integer),
  rung_entered_at (timestamptz), last_seed_date (timestamptz),
  last_seed_result (text), consecutive_failures (integer),
  cooldown_until (timestamptz), notes (jsonb)

VERIFY unique constraint on (user_id, channel).
VERIFY RLS policy: users can only access own rows.

PASS: Schema matches spec, constraints enforced.
```

## F3.5 -- Seed Log Table Schema
```
ID: F3.5
Type: schema
Priority: P0

VERIFY gina_seed_log table has columns:
  id (uuid), user_id (uuid), channel (text), rung (integer),
  task_id (text), seed_description (text), gina_response (text),
  gina_exact_words (text), context_notes (text),
  recovery_triggered (boolean), recovery_type (text),
  created_at (timestamptz)

VERIFY RLS policy: users can only access own rows.
VERIFY index on (user_id, channel, created_at DESC).

PASS: Schema matches spec.
```

## F3.6 -- Measurement Table Schema
```
ID: F3.6
Type: schema
Priority: P0

VERIFY gina_measurements table has columns:
  id (uuid), user_id (uuid), measurement_type (text),
  channel (text), data (jsonb), period_start (date),
  period_end (date), created_at (timestamptz)

VERIFY RLS policy: users can only access own rows.
VERIFY index on (user_id, measurement_type, created_at DESC).

PASS: Schema matches spec.
```

## F3.7 -- Arc State Table Schema
```
ID: F3.7
Type: schema
Priority: P0

VERIFY gina_arc_state table has columns:
  id (uuid), user_id (uuid), arc (text),
  gate_status (text), gate_condition (text),
  current_milestone (text), milestones_completed (jsonb)

VERIFY unique constraint on (user_id, arc).
VERIFY 4 arcs initialized per user:
  identity_processing, social_circle, shopper, hrt_management
VERIFY all start with gate_status = 'locked'.

PASS: Schema matches spec, all arcs initialized.
```

## F3.8 -- Disclosure Map Table Schema
```
ID: F3.8
Type: schema
Priority: P1

VERIFY gina_disclosure_map table has columns:
  id (uuid), user_id (uuid), person_name (text),
  relationship (text), relationship_to (text),
  awareness_status (text), told_date (date),
  told_by (text), initial_reaction (text),
  current_stance (text), provides_active_support (boolean),
  notes (text), created_at (timestamptz)

VERIFY RLS policy: users can only access own rows.

PASS: Schema matches spec.
```

---

## F3.9 -- Seed Logging: Positive Response
```
ID: F3.9
Type: unit
Priority: P0
Validates: Build Spec seed-manager.ts

GIVEN: channel = 'scent', current_rung = 1
ACTION: Log seed with gina_response = 'positive'

VERIFY:
  - New row in gina_seed_log with correct channel, rung, response
  - gina_ladder_state.last_seed_date updated to now
  - gina_ladder_state.last_seed_result = 'positive'
  - gina_ladder_state.consecutive_failures = 0

PASS: Positive seed logged, state updated, failures reset.
```

## F3.10 -- Seed Logging: Negative Response (Single Failure)
```
ID: F3.10
Type: unit
Priority: P0
Validates: Build Spec seed-manager.ts, Recovery Protocol

GIVEN: channel = 'touch', current_rung = 2, consecutive_failures = 0
ACTION: Log seed with gina_response = 'negative'

VERIFY:
  - New row in gina_seed_log with recovery_triggered = true, recovery_type = 'single_failure'
  - gina_ladder_state.consecutive_failures = 1
  - gina_ladder_state.last_seed_result = 'negative'
  - NO cooldown set (single failure = 72hr same-channel pause only)

PASS: Single failure logged, recovery triggered, no full cooldown.
```

## F3.11 -- Seed Logging: Double Failure (Cooldown Triggered)
```
ID: F3.11
Type: unit
Priority: P0
Validates: Build Spec seed-manager.ts, Recovery Protocol

GIVEN: channel = 'touch', current_rung = 2, consecutive_failures = 1
ACTION: Log seed with gina_response = 'negative'

VERIFY:
  - gina_ladder_state.consecutive_failures = 2
  - gina_ladder_state.cooldown_until = now + 14 days
  - gina_seed_log entry: recovery_type = 'double_failure'
  - Tasks for this channel at this rung are filtered out during cooldown

PASS: Double failure triggers 14-day cooldown.
```

## F3.12 -- Seed Logging: Callout Response
```
ID: F3.12
Type: unit
Priority: P0
Validates: Build Spec seed-manager.ts

GIVEN: channel = 'visual', current_rung = 3
ACTION: Log seed with gina_response = 'callout', gina_exact_words = "Why are you doing that?"

VERIFY:
  - gina_seed_log entry: recovery_type = 'callout'
  - gina_ladder_state.cooldown_until set (longer cooldown: 21 days)
  - gina_exact_words stored verbatim
  - Handler intervention queue includes callout response task

PASS: Callout logged with exact words, extended cooldown, recovery task queued.
```

## F3.13 -- Seed Logging: Rupture Response
```
ID: F3.13
Type: unit
Priority: P1

GIVEN: Any channel
ACTION: Log seed with gina_response = 'negative', recovery_type = 'rupture' (manually flagged)

VERIFY:
  - gina_seed_log entry: recovery_type = 'rupture'
  - ALL channels get cooldown_until = now + 30 days
  - Handler mode shifts to caretaker for Gina-related tasks
  - 5-step repair protocol tasks queued

PASS: Rupture freezes all channels, triggers repair sequence.
```

## F3.14 -- Cooldown Enforcement
```
ID: F3.14
Type: unit
Priority: P0

GIVEN: channel = 'touch', cooldown_until = now + 7 days (still active)
ACTION: Rules engine selects tasks

VERIFY:
  - NO tasks from channel 'touch' appear in candidates
  - Tasks from OTHER channels still appear normally
  - After cooldown expires: touch tasks become eligible again

PASS: Cooldown blocks only the affected channel, expires correctly.
```

## F3.15 -- Cooldown Edge Case: Multiple Channels
```
ID: F3.15
Type: unit
Priority: P2

GIVEN: channel 'touch' in cooldown, channel 'visual' in cooldown, all others normal
ACTION: Rules engine selects Gina domain tasks

VERIFY:
  - Only non-cooldown channels produce candidates
  - If ALL channels are in cooldown (rupture state), Gina domain tasks return empty
  - Handler falls back to non-Gina domains when all Gina channels blocked

PASS: Multi-channel cooldowns handled correctly.
```

---

## F3.16 -- Rung Advancement: Basic Criteria
```
ID: F3.16
Type: unit
Priority: P0
Validates: Build Spec ladder-engine.ts

GIVEN: channel = 'scent', current_rung = 1
AND: 3 positive seeds logged at rung 1
AND: 0 negative seeds in last 5 entries for this channel

ACTION: Check advancement criteria

VERIFY:
  - Advancement returns true
  - On advancement: current_rung = 2
  - rung_entered_at = now
  - Milestone logged

PASS: Rung advances when criteria met.
```

## F3.17 -- Rung Advancement: Blocked by Recent Negative
```
ID: F3.17
Type: unit
Priority: P0

GIVEN: channel = 'scent', current_rung = 1
AND: 3 positive seeds at rung 1
AND: 1 negative seed in last 5 entries

ACTION: Check advancement criteria

VERIFY:
  - Advancement returns false
  - current_rung stays at 1

PASS: Negative seed in recent window blocks advancement.
```

## F3.18 -- Rung Advancement: Higher Rungs Need More Evidence
```
ID: F3.18
Type: unit
Priority: P1

VERIFY advancement criteria scale by rung:
  - Rung 1 -> 2: 3+ positive seeds, 0 negative in last 5
  - Rung 2 -> 3: 5+ positive seeds, measurement score above threshold
  - Rung 3 -> 4: measurement sustained above threshold for 2+ periods
  - Rung 4 -> 5: Gina-initiated behaviors detected in measurements

PASS: Each tier requires progressively more evidence.
```

## F3.19 -- Rung Advancement: Task Unlocking
```
ID: F3.19
Type: integration
Priority: P0

GIVEN: channel = 'bedroom', current_rung = 1
ACTION: Advance to rung 2

VERIFY:
  - Tasks with domain='gina' AND channel='bedroom' AND level=2 now appear in candidates
  - Level 3 tasks still do NOT appear
  - Level 1 tasks still appear (lower levels always available)

PASS: Task selector respects rung as level gate for Gina tasks.
```

## F3.20 -- Rung Advancement: Cannot Skip Rungs
```
ID: F3.20
Type: unit
Priority: P1

GIVEN: channel = 'financial', current_rung = 1
ACTION: Attempt to advance directly to rung 3

VERIFY:
  - Advancement rejected
  - current_rung stays at 1
  - System enforces sequential rung progression

PASS: No rung skipping.
```

---

## F3.21 -- Trigger Condition: gina_negative_reaction
```
ID: F3.21
Type: unit
Priority: P1
Validates: Build Spec B1.2 trigger conditions

GIVEN: gina_seed_log last entry for any channel has gina_response = 'negative'
ACTION: Evaluate trigger 'gina_negative_reaction'

VERIFY: Returns true.

GIVEN: gina_seed_log last entry has gina_response = 'positive'
ACTION: Evaluate trigger 'gina_negative_reaction'

VERIFY: Returns false.

PASS: Trigger correctly reads last seed result.
```

## F3.22 -- Trigger Condition: post_disclosure_stable
```
ID: F3.22
Type: unit
Priority: P1

GIVEN: gina_arc_state for 'identity_processing' has gate_status = 'unlocked'
ACTION: Evaluate trigger 'post_disclosure_stable'

VERIFY: Returns true.

GIVEN: gate_status = 'locked'
VERIFY: Returns false.

PASS: Trigger gates on arc state.
```

## F3.23 -- Trigger Condition: pre_disclosure
```
ID: F3.23
Type: unit
Priority: P1

GIVEN: user_state.gina_visibility_level = 3
ACTION: Evaluate trigger 'pre_disclosure'
VERIFY: Returns true.

GIVEN: gina_visibility_level = 4
VERIFY: Returns false.

PASS: pre_disclosure true when visibility < 4.
```

## F3.24 -- Trigger Condition: post_first_ally
```
ID: F3.24
Type: unit
Priority: P1

GIVEN: gina_disclosure_map has 1 entry with awareness_status = 'supportive'
ACTION: Evaluate trigger 'post_first_ally'
VERIFY: Returns true.

GIVEN: 0 supportive entries
VERIFY: Returns false.

PASS: Correctly counts supportive allies.
```

## F3.25 -- Trigger Condition: inner_circle_stable
```
ID: F3.25
Type: unit
Priority: P1

GIVEN: gina_disclosure_map has 3 entries with awareness_status = 'supportive'
VERIFY: 'inner_circle_stable' returns true.

GIVEN: 2 supportive entries
VERIFY: Returns false.

PASS: Threshold is 3 supportive people.
```

## F3.26 -- Trigger Condition: weekly_review / monthly_review / biweekly_review
```
ID: F3.26
Type: unit
Priority: P2

VERIFY:
  - 'weekly_review' returns true on configured review day (default Sunday)
  - 'monthly_review' returns true on configured review day (default 1st)
  - 'biweekly_review' returns true on alternating configured days
  - All return false on non-matching days

PASS: Periodic triggers fire on correct days.
```

---

## F3.27 -- Measurement: Bedroom Weekly Scoring
```
ID: F3.27
Type: unit
Priority: P1
Validates: Build Spec measurement-engine.ts

ACTION: Submit bedroom_weekly measurement with data:
  {
    sessions: 3,
    per_session: [
      { initiated_by: 'gina', agency_score: 4 },
      { initiated_by: 'user', agency_score: 2 },
      { initiated_by: 'gina', agency_score: 3 }
    ],
    unprompted_behaviors: ['chose_position', 'initiated_touch']
  }

VERIFY:
  - Measurement saved to gina_measurements
  - Score calculated: average agency = 3.0
  - Gina-initiated ratio: 66%
  - Unprompted count: 2

PASS: Bedroom measurement data parsed and scored correctly.
```

## F3.28 -- Measurement: Pronoun Weekly Scoring
```
ID: F3.28
Type: unit
Priority: P1

ACTION: Submit pronoun_weekly measurement with data:
  {
    total_references: 50,
    correct: 35,
    self_corrected: 10,
    uncorrected: 5
  }

VERIFY:
  - correct_pct = 70% (35/50)
  - self_correct_pct = 90% ((35+10)/50)
  - Measurement saved with calculated percentages

PASS: Pronoun percentages calculated correctly.
```

## F3.29 -- Measurement: Touch Biweekly Body Zone Map
```
ID: F3.29
Type: unit
Priority: P1

ACTION: Submit touch_biweekly measurement with data:
  {
    zones: {
      hands: 5, arms: 4, shoulders: 4, back: 3,
      chest: 2, waist: 3, hips: 2, thighs: 1, face: 4
    },
    context: 'casual'
  }

VERIFY:
  - 9 zones scored
  - Average score calculated: 3.1
  - Avoidance zones identified: thighs (1), chest (2), hips (2)
  - Comfort zones identified: hands (5), arms (4), face (4)
  - Measurement saved with zone breakdown

PASS: Body zone map correctly identifies comfort and avoidance patterns.
```

## F3.30 -- Measurement: Financial Monthly
```
ID: F3.30
Type: unit
Priority: P1

ACTION: Submit financial_monthly measurement with data:
  {
    total_spending: 180,
    invisible: 80,
    visible: 70,
    discussed: 30,
    visible_reactions: [
      { item: 'face serum', amount: 35, gina_score: 4 },
      { item: 'earrings', amount: 35, gina_score: 3 }
    ]
  }

VERIFY:
  - Visibility ratio: invisible=44%, visible=39%, discussed=17%
  - Average Gina reaction score: 3.5
  - Measurement saved

PASS: Financial visibility breakdown calculated correctly.
```

## F3.31 -- Measurement: Master Composite
```
ID: F3.31
Type: integration
Priority: P0

GIVEN: 10 channels with varying current_rung values:
  scent=3, touch=2, domestic=3, intimacy=2, visual=2,
  social=1, bedroom=1, pronoun=1, financial=1, body_change_touch=0

ACTION: Generate master_composite measurement

VERIFY:
  - Average calculated: 1.6
  - Leader identified: scent and domestic (tied at 3)
  - Laggard identified: body_change_touch (0)
  - Widest gap: 3 (between leaders and laggard)
  - Gap assessment: "2+ level gap" flagged
  - Health status: stalled channels identified
  - Measurement saved to gina_measurements with type = 'master_composite'

PASS: Composite correctly aggregates all channels and identifies patterns.
```

## F3.32 -- Measurement: Scheduling and Overdue Detection
```
ID: F3.32
Type: unit
Priority: P2

GIVEN: Last bedroom_weekly measurement was 10 days ago
ACTION: Check overdue measurements

VERIFY:
  - bedroom_weekly flagged as overdue (interval = 7 days)
  - pronoun_weekly flagged if > 7 days
  - touch_biweekly flagged if > 14 days
  - financial_monthly flagged if > 30 days
  - Non-overdue measurements NOT flagged

PASS: Overdue detection uses correct interval per measurement type.
```

## F3.33 -- Measurement: Rung Advancement Gate
```
ID: F3.33
Type: integration
Priority: P1

GIVEN: channel = 'touch', current_rung = 2
AND: 5 positive seeds at rung 2
AND: Most recent touch_biweekly measurement average score = 3.8

ACTION: Check advancement criteria for rung 2 -> 3

VERIFY:
  - Seeds criterion met (5+ positive)
  - Measurement criterion met (score above threshold)
  - Advancement approved

GIVEN: Same seeds but measurement average = 1.5
VERIFY: Advancement blocked (measurement below threshold)

PASS: Measurement scores gate higher rung advancement.
```

---

## F3.34 -- Arc State: Locked by Default
```
ID: F3.34
Type: unit
Priority: P1

VERIFY for new user:
  - identity_processing: gate_status = 'locked', gate_condition describes disclosure
  - social_circle: gate_status = 'locked'
  - shopper: gate_status = 'locked'
  - hrt_management: gate_status = 'locked'

PASS: All arcs start locked.
```

## F3.35 -- Arc State: Unlocking
```
ID: F3.35
Type: integration
Priority: P1

SCENARIO A: Disclosure happens
  ACTION: Update gina_visibility_level to 4+, mark identity_processing gate
  VERIFY: identity_processing.gate_status = 'unlocked'
  VERIFY: Tasks gated on 'post_disclosure_stable' now appear

SCENARIO B: First ally identified
  ACTION: Add supportive entry to gina_disclosure_map
  VERIFY: social_circle arc becomes unlockable
  VERIFY: Tasks gated on 'post_first_ally' now appear

PASS: Arc gates unlock based on real milestone achievement.
```

## F3.36 -- Disclosure Map: CRUD Operations
```
ID: F3.36
Type: integration
Priority: P1

STEPS:
  1. Add person: name="Sarah", relationship="friend",
     relationship_to="gina", awareness_status="told", told_by="gina"
  2. Verify row created in gina_disclosure_map
  3. Update: awareness_status -> 'supportive', provides_active_support = true
  4. Verify update persisted
  5. Query all entries for user
  6. Verify support metrics: 1 told, 1 supportive, 1 active support
  7. Delete entry
  8. Verify removed

PASS: Full CRUD works, metrics calculate correctly.
```

## F3.37 -- Disclosure Map: Support Threshold Calculation
```
ID: F3.37
Type: unit
Priority: P2

GIVEN: 5 entries: 3 supportive, 1 neutral, 1 hostile
ACTION: Calculate support metrics

VERIFY:
  - Total disclosed to: 5
  - Supportive count: 3
  - Supportive percentage: 60%
  - "Pause expansion if supportive% below 60%" check: at threshold, no pause
  - Active support count calculated separately from supportive count

PASS: Support metrics match spec thresholds.
```

---

# F4: GINA PIPELINE UI

## F4.1 -- GinaLadderView: Channel Display
```
ID: F4.1
Type: acceptance
Priority: P1

VERIFY GinaLadderView displays:
  - Composite score (numeric, e.g. "L2.4 average")
  - 10 channel rows, each showing:
    - Channel name
    - Progress bar (0-5 scale)
    - Current rung label
    - Cooldown indicator if active (red/warning)
  - Channels sorted by rung (highest first) or alphabetical (configurable)

PASS: All 10 channels visible with correct rung data.
```

## F4.2 -- GinaLadderView: Recovery Alerts
```
ID: F4.2
Type: acceptance
Priority: P2

GIVEN: channel 'touch' has consecutive_failures = 2, cooldown active
VERIFY: GinaLadderView shows recovery alert for 'touch' channel
  - Alert visible without scrolling (top of view or prominent badge)
  - Shows cooldown remaining time
  - Links to recovery protocol tasks

PASS: Active recovery states prominently displayed.
```

## F4.3 -- GinaLadderView: Due Measurement Alerts
```
ID: F4.3
Type: acceptance
Priority: P2

GIVEN: bedroom_weekly is 10 days since last measurement
VERIFY: Alert shows "Bedroom weekly measurement overdue"
  - Tap/click opens MeasurementForm for that type
  - Alert count badge on main navigation if measurements overdue

PASS: Overdue measurements surfaced to user.
```

## F4.4 -- SeedLogger: Form Submission
```
ID: F4.4
Type: integration
Priority: P0

STEPS:
  1. Open SeedLogger
  2. Select channel = 'scent'
  3. Current rung auto-fills from gina_ladder_state
  4. Enter seed description: "Left jasmine lotion on bathroom counter"
  5. Select gina_response = 'positive'
  6. Enter gina_exact_words = "This smells nice"
  7. Set context: mood = 'relaxed', timing = 'evening', setting = 'home'
  8. Submit

VERIFY:
  - Row created in gina_seed_log with all fields
  - gina_ladder_state updated (last_seed_date, last_seed_result)
  - Result screen shows: seed logged, no recovery needed
  - If advancement criteria now met: advancement prompt shown

PASS: Full seed logging flow works end-to-end.
```

## F4.5 -- SeedLogger: Negative Seed with Recovery
```
ID: F4.5
Type: integration
Priority: P0

STEPS:
  1. Open SeedLogger
  2. Select channel with consecutive_failures = 1
  3. Enter seed with gina_response = 'negative'
  4. Submit

VERIFY:
  - Result screen shows: "Double failure. 14-day cooldown activated."
  - Channel shows cooldown in GinaLadderView
  - Recovery protocol task appears in next task prescription

PASS: Negative seed triggers appropriate recovery feedback in UI.
```

## F4.6 -- MeasurementForm: Dynamic Rendering
```
ID: F4.6
Type: acceptance
Priority: P1

VERIFY each measurement type renders correct form fields:
  - bedroom_weekly: session count, per-session inputs, unprompted checklist
  - pronoun_weekly: total/correct/self-corrected/uncorrected number fields
  - touch_biweekly: 9-zone score sliders (1-5), context selector
  - financial_monthly: spending breakdown, visibility categories, reaction scores
  - shopper_monthly: participation level slider (1-7)
  - occasion_debrief: occasion type, element list with scores
  - master_composite: auto-generated (no user input, shows results only)

PASS: Each measurement type has appropriate, distinct form fields.
```

## F4.7 -- ChannelDetail: Rung Visualization
```
ID: F4.7
Type: acceptance
Priority: P2

VERIFY ChannelDetail for a specific channel shows:
  - 5 rungs visualized (vertical or horizontal)
  - Current rung highlighted
  - Completed rungs marked
  - Each rung clickable to show seed history at that rung
  - Advancement check button (shows criteria status)
  - Seed statistics (total, positive%, last seed date)
  - Seed timeline (chronological list)

PASS: Channel detail provides full visibility into channel state.
```

## F4.8 -- DisclosureMap: People Management
```
ID: F4.8
Type: acceptance
Priority: P2

VERIFY DisclosureMap component:
  - Shows list of all people in gina_disclosure_map
  - Add button opens form (name, relationship, status, etc.)
  - Each entry editable (tap to edit)
  - Delete with confirmation
  - Summary metrics at top: total disclosed, supportive count, supportive%
  - Support threshold warning if supportive% below 60%

PASS: Full people management with support metrics.
```

---

# PHASE G: DASHBOARD + ANALYTICS + JOURNAL TESTS

## G1: Dashboard Layout

### G1.1 -- Dashboard Renders All Widgets
```
ID: G1.1
Type: acceptance
Priority: P0

VERIFY Dashboard.tsx displays all 8 widget sections:
  1. Identity Odometer (gauge: survival -> breakthrough)
  2. Domain Progress (9 domain bars)
  3. Gina Pipeline Summary (10 channel bars, compact)
  4. Streak Calendar (heatmap)
  5. Evidence Gallery (recent items)
  6. Investment Total (dollar amount)
  7. Milestone Timeline (achievements)
  8. Commitment Status (honored/pending/broken)

VERIFY:
  - All widgets load without error
  - Data displayed matches database state
  - Mobile layout: single column, scrollable
  - No widget takes more than 2 seconds to render

PASS: All 8 widgets visible and populated.
```

### G1.2 -- Dashboard Data Accuracy
```
ID: G1.2
Type: integration
Priority: P0

SETUP:
  - Insert 5 task completions across 3 domains
  - Insert 2 evidence items
  - Insert 3 investments totaling $150
  - Insert 2 commitments (1 honored, 1 pending)
  - Set streak_days = 7, odometer = 'progress'

VERIFY:
  - Odometer shows 'progress'
  - Domain bars show correct levels for the 3 active domains
  - Evidence gallery shows 2 items
  - Investment total shows $150
  - Commitments show: 1 honored, 1 pending, 0 broken
  - Streak shows 7

PASS: All dashboard numbers match database values exactly.
```

## G2: Identity Odometer

### G2.1 -- Odometer Displays All States
```
ID: G2.1
Type: unit
Priority: P1

VERIFY odometer renders correctly for each state:
  - survival: lowest position, warning color
  - caution: low position
  - coasting: middle position
  - progress: above middle
  - momentum: high position
  - breakthrough: highest position, celebration color

VERIFY: Visual gauge clearly shows relative position.

PASS: All 6 states render distinctly.
```

## G3: Domain Progress

### G3.1 -- Domain Progress Bars
```
ID: G3.1
Type: acceptance
Priority: P1

VERIFY DomainProgress.tsx shows:
  - 9 domains: voice, movement, skincare, style, makeup,
    body_language, inner_narrative, social_presentation, intimate
  - Each domain shows: name, current level (1-5), progress bar
  - Progress bar fills proportionally within current level
  - Level number clearly visible

PASS: All 9 domains visible with correct levels from escalation_state.
```

### G3.2 -- Domain Progress from Escalation State
```
ID: G3.2
Type: integration
Priority: P1

SETUP: Set escalation_state rows:
  voice: level 2, skincare: level 3, intimate: level 1, rest: level 1

VERIFY:
  - Voice bar shows level 2
  - Skincare bar shows level 3
  - Intimate bar shows level 1
  - Order reflects current levels or is consistent (alphabetical or by level)

PASS: Progress bars read from escalation_state table.
```

## G4: Streak Calendar

### G4.1 -- Streak Calendar Heatmap
```
ID: G4.1
Type: acceptance
Priority: P2

VERIFY StreakCalendar.tsx:
  - Displays GitHub-style heatmap grid
  - Each cell = one day
  - Color intensity based on tasks_completed from daily_entries
  - 0 tasks: empty/lightest
  - 1-2 tasks: light
  - 3-5 tasks: medium
  - 6+ tasks: dark/full
  - Shows at least 90 days of history
  - Today highlighted

PASS: Heatmap renders with correct color mapping from daily_entries.
```

### G4.2 -- Streak Calendar Data Accuracy
```
ID: G4.2
Type: integration
Priority: P2

SETUP: Insert daily_entries for last 7 days:
  Day 1: 0 tasks, Day 2: 1, Day 3: 3, Day 4: 5,
  Day 5: 8, Day 6: 0, Day 7 (today): 2

VERIFY: Heatmap shows correct intensity for each day.
VERIFY: Current streak = 1 (today only, broken by Day 6).

PASS: Calendar matches daily_entries data.
```

## G5: Evidence Gallery

### G5.1 -- Evidence Gallery Display
```
ID: G5.1
Type: acceptance
Priority: P1

VERIFY EvidenceGallery.tsx:
  - Shows grid of evidence items
  - Each item shows: type icon, description, date, domain badge
  - Photo evidence shows thumbnail
  - Voice evidence shows duration/play button
  - Journal evidence shows text preview
  - Filterable by domain and type
  - Sorted by created_at DESC (newest first)
  - "Add Evidence" button visible

PASS: Gallery displays all evidence types with appropriate previews.
```

### G5.2 -- Evidence Gallery Loads from Database
```
ID: G5.2
Type: integration
Priority: P1

SETUP: Insert evidence rows:
  - 1 photo (evidence_type='photo', content_url set)
  - 1 voice recording (evidence_type='recording')
  - 1 journal entry (evidence_type='journal')

VERIFY:
  - 3 items displayed
  - Photo shows image thumbnail
  - Correct domain badges
  - Correct dates

PASS: Gallery reads from evidence table correctly.
```

## G6: Investment Tracker

### G6.1 -- Investment Total Display
```
ID: G6.1
Type: acceptance
Priority: P1

VERIFY InvestmentTracker.tsx shows:
  - Total invested amount (bold, prominent)
  - Breakdown by category (clothing, skincare, makeup, medical, other)
  - Time invested (calculated from SUM of task_completions.duration_actual)
  - Session count (from COUNT of arousal_sessions)
  - Days active (from COUNT DISTINCT date in daily_entries)
  - "Add Purchase" button

PASS: Financial and time investment prominently displayed.
```

### G6.2 -- Add Purchase Flow
```
ID: G6.2
Type: integration
Priority: P1

STEPS:
  1. Click "Add Purchase"
  2. Select category = 'skincare'
  3. Enter item = 'Retinol serum'
  4. Enter amount = 28.99
  5. Date defaults to today
  6. Submit

VERIFY:
  - Row created in investments table
  - Total updates immediately
  - Category breakdown updates
  - New purchase appears in list

PASS: Purchase recording works end-to-end.
```

## G7: Commitment Dashboard

### G7.1 -- Commitment Status Display
```
ID: G7.1
Type: acceptance
Priority: P1

VERIFY CommitmentDashboard.tsx shows:
  - Three sections: Pending, Honored, Broken
  - Each commitment shows: text, extraction context, date
  - Pending commitments show: "Honor" button
  - Context line shows: "Extracted during edge session, arousal 5, denial day 7"
  - Counts: X pending, Y honored, Z broken

PASS: All commitments visible with status and context.
```

### G7.2 -- Commitment Honoring
```
ID: G7.2
Type: integration
Priority: P1

GIVEN: Pending commitment exists
STEPS:
  1. Click "Honor" on the commitment
  2. Confirm

VERIFY:
  - commitments.honored = true
  - commitments.honored_at = now
  - Commitment moves from Pending to Honored section
  - Points awarded (if applicable)

PASS: Commitment can be marked as honored.
```

## G8: Milestone Timeline

### G8.1 -- Milestone Timeline Display
```
ID: G8.1
Type: acceptance
Priority: P2

VERIFY Milestone Timeline shows:
  - Chronological list of achievements from milestones table
  - Each milestone: type, description, date
  - Evidence link if evidence_id is set
  - Visual timeline format (dates on one side, descriptions on other)

PASS: Milestones display in chronological order with evidence links.
```

## G9: Journal

### G9.1 -- Daily Entry Form
```
ID: G9.1
Type: acceptance
Priority: P1

VERIFY JournalView.tsx / DailyEntry.tsx:
  - Alignment score: slider 1-10 ("How feminine did today feel?")
  - Euphoria notes: text area
  - Dysphoria notes: text area
  - Free journal entry: text area
  - Evidence capture button (camera, mic, text)
  - Date shown (defaults to today)
  - Submit button

PASS: All journal fields present and functional.
```

### G9.2 -- Daily Entry Saves
```
ID: G9.2
Type: integration
Priority: P0

STEPS:
  1. Open JournalView for today
  2. Set alignment_score = 7
  3. Enter euphoria_notes = "Voice practice felt natural today"
  4. Submit

VERIFY:
  - daily_entries row updated (alignment_score = 7, euphoria_notes populated)
  - If no daily_entry for today existed: created
  - Journal list shows today's entry

PASS: Journal entry persists to daily_entries table.
```

### G9.3 -- Journal History View
```
ID: G9.3
Type: acceptance
Priority: P2

VERIFY:
  - Journal shows list of past daily_entries
  - Sorted by date DESC
  - Each entry expandable to show full notes
  - Alignment score visible without expanding
  - Scrollable/paginated for history

PASS: Past journal entries browsable.
```

## G10: Evidence Capture

### G10.1 -- Photo Capture
```
ID: G10.1
Type: integration
Priority: P1

STEPS:
  1. Open EvidenceCapture
  2. Select "Photo"
  3. Camera input opens (or file picker on desktop)
  4. Take/select photo
  5. Add description and domain
  6. Submit

VERIFY:
  - Image uploaded to Supabase Storage
  - evidence row created with content_url pointing to storage
  - evidence_type = 'photo'
  - Photo appears in Evidence Gallery

PASS: Photo capture -> storage -> gallery pipeline works.
```

### G10.2 -- Voice Recording
```
ID: G10.2
Type: integration
Priority: P2

STEPS:
  1. Open EvidenceCapture
  2. Select "Voice Recording"
  3. MediaRecorder starts on button press
  4. Record for 10 seconds
  5. Stop recording
  6. Preview playback available
  7. Submit with description

VERIFY:
  - Audio blob uploaded to Supabase Storage
  - evidence row created with content_url
  - evidence_type = 'recording'
  - Duration metadata stored

PASS: Voice recording pipeline works.
```

### G10.3 -- Text Evidence
```
ID: G10.3
Type: integration
Priority: P1

STEPS:
  1. Open EvidenceCapture
  2. Select "Journal Entry"
  3. Enter text reflection
  4. Select domain
  5. Submit

VERIFY:
  - evidence row created
  - evidence_type = 'journal'
  - description contains text
  - No file upload needed

PASS: Text evidence saves without storage upload.
```

---

# PHASE H: SETTINGS + PWA TESTS

## H1: Settings View

### H1.1 -- Settings Sections Present
```
ID: H1.1
Type: acceptance
Priority: P1

VERIFY Settings.tsx displays all sections:
  1. Profile: chosen_name, pronouns, age, living_situation, etc.
  2. Difficulty: Handler intensity dial (off/gentle/moderate/firm/relentless)
  3. Gina Visibility: level selector (0-5) with description per level
  4. Notifications: frequency, quiet hours, types enabled
  5. Content Library: manage content_references
  6. AI Budget: daily limit, current usage, cost history
  7. Data Export: download button
  8. Danger Zone: reset streak, clear data, delete account

PASS: All 8 sections visible and labeled.
```

### H1.2 -- Profile Edit
```
ID: H1.2
Type: integration
Priority: P1

STEPS:
  1. Open Settings > Profile
  2. Change chosen_name from "Maxy" to "Max"
  3. Save

VERIFY:
  - profile_foundation.chosen_name = 'Max'
  - Handler messages use new name
  - UI header/greeting uses new name

PASS: Profile changes persist and propagate.
```

### H1.3 -- Difficulty Dial
```
ID: H1.3
Type: integration
Priority: P1

STEPS:
  1. Open Settings > Difficulty
  2. Change from 'moderate' to 'firm'
  3. Save

VERIFY:
  - profile_foundation.difficulty_level = 'firm'
  - Handler AI receives updated difficulty in system context
  - Next Handler message reflects firmer tone

GIVEN: difficulty = 'off'
VERIFY: Handler issues no interventions, no notifications, tasks still available but not pushed

PASS: Difficulty setting affects Handler behavior.
```

### H1.4 -- Gina Visibility Levels
```
ID: H1.4
Type: acceptance
Priority: P2

VERIFY Gina Visibility selector shows descriptions:
  - Level 0: Sees nothing
  - Level 1: Sees streak, phase, completion rate
  - Level 2: Adds investment total, infractions
  - Level 3: Adds task domains, categories
  - Level 4: Adds wishlist
  - Level 5: Keyholder -- everything except intimate

VERIFY: Changing level updates user_state.gina_visibility_level

PASS: All levels described, selection persists.
```

### H1.5 -- Notification Settings
```
ID: H1.5
Type: integration
Priority: P2

VERIFY:
  - Frequency slider (4-8 per day)
  - Quiet hours (start time, end time)
  - Type toggles: micro_task, affirmation, challenge, streak_threat
  - Changes persist to user preferences
  - Notifications respect quiet hours (none fire during quiet period)

PASS: Notification preferences saved and respected.
```

### H1.6 -- AI Budget Monitor
```
ID: H1.6
Type: acceptance
Priority: P2

VERIFY AI Budget section shows:
  - Daily limit (editable)
  - Used today (cents)
  - Remaining today
  - Last 7 days chart/list
  - Current budget status (green/yellow/red)
  - Budget exhausted warning when remaining < 20%

PASS: Budget visibility accurate and clear.
```

### H1.7 -- Data Export
```
ID: H1.7
Type: integration
Priority: P3

STEPS:
  1. Click "Export All Data"
  2. System queries all user tables
  3. JSON file generated and downloaded

VERIFY:
  - JSON contains all user data from all tables
  - File downloads in browser
  - Data is valid JSON, parseable
  - No data from other users included

PASS: Complete user data exportable as JSON.
```

### H1.8 -- Danger Zone: Reset Streak
```
ID: H1.8
Type: integration
Priority: P2

STEPS:
  1. Open Danger Zone
  2. Click "Reset Streak"
  3. Confirmation dialog appears with warning text
  4. Confirm

VERIFY:
  - user_state.streak_days = 0
  - user_state.longest_streak unchanged
  - domain_streaks all reset to 0
  - Today view reflects reset
  - daily_entries NOT deleted (history preserved)

PASS: Streak resets without destroying history.
```

### H1.9 -- Danger Zone: Delete Account
```
ID: H1.9
Type: integration
Priority: P1

STEPS:
  1. Click "Delete Account"
  2. Type confirmation phrase
  3. Confirm

VERIFY:
  - All rows with user_id deleted from ALL tables
  - Supabase Storage files for user deleted
  - Auth user deleted
  - Redirected to login page
  - Subsequent login attempts fail

PASS: Complete data deletion, irreversible.
```

## H2: PWA Configuration

### H2.1 -- Manifest Valid
```
ID: H2.1
Type: schema
Priority: P1

VERIFY public/manifest.json contains:
  - name: configurable (default something discreet, not "Becoming Protocol")
  - short_name: configurable (default "BP" or similar)
  - start_url: "/"
  - display: "standalone"
  - background_color and theme_color set
  - icons: at least 192x192 and 512x512
  - Icon design: discreet, not obviously trans/femme themed

PASS: Valid manifest that produces discreet installed app.
```

### H2.2 -- Service Worker Registration
```
ID: H2.2
Type: integration
Priority: P1

VERIFY:
  - Service worker registers on first load
  - sw.ts handles fetch events
  - Static assets cached for offline use
  - Task CSV cached for offline task selection

PASS: Service worker active and caching.
```

### H2.3 -- App Installable (RETAINED from X3.1)
```
ID: H2.3
Type: acceptance
Priority: P2

STEPS:
  1. Open app in mobile Chrome
  2. "Add to Home Screen" option available
  3. App launches in standalone mode
  4. Feels like native app (no browser chrome)

PASS: PWA installs and launches correctly.
```

### H2.4 -- Offline Task Selection
```
ID: H2.4
Type: integration
Priority: P1

STEPS:
  1. Load app with network active (tasks cache)
  2. Disable network
  3. Complete a task
  4. Request next task

VERIFY:
  - Cached tasks available
  - Rules engine selects from cached tasks (Layer 1 only)
  - Completion queued locally
  - "Offline mode" indicator shown
  - No crash, no error screen

PASS: Core task loop works without network.
```

### H2.5 -- Offline Sync on Reconnect
```
ID: H2.5
Type: integration
Priority: P1

STEPS:
  1. While offline: complete 3 tasks, submit mood check-in
  2. Reconnect to network
  3. Wait for sync

VERIFY:
  - All 3 task_completions synced to database
  - mood_checkins row synced
  - daily_entries updated
  - user_state updated (streak, points)
  - No duplicate entries
  - Sync indicator shows success

PASS: Queued data syncs without duplicates.
```

### H2.6 -- Push Notifications
```
ID: H2.6
Type: integration
Priority: P2

STEPS:
  1. Grant notification permission
  2. App in background or closed
  3. Scheduled notification fires

VERIFY:
  - System notification appears
  - Tapping notification opens app to relevant view
  - Notification content matches Handler message
  - Quiet hours respected

PASS: Push notifications work when app is backgrounded.
```

### H2.7 -- Discreet Appearance
```
ID: H2.7
Type: acceptance
Priority: P1

VERIFY:
  - Home screen icon: abstract/neutral design
  - App name on home screen: "BP" or user-configured, not "Becoming Protocol"
  - Lock screen notifications: content hidden by default
  - Recent apps view: neutral app title
  - No notification content visible without unlocking

PASS: Someone seeing the phone cannot identify what this app does.
```

---

# ADDITIONAL BEHAVIORAL VALIDATION SCENARIOS

## BV7: Gina Pipeline Full Cycle
```
ID: BV7
Type: behavioral
Priority: P1

JOURNEY:
  1. New user, all Gina channels at rung 0
  2. Handler prescribes scent channel L1 task
  3. User completes task, logs seed via SeedLogger
  4. Gina response = 'positive'
  5. Repeat seed logging 3 more times (all positive)
  6. Check advancement: criteria met, rung advances to 1
  7. Handler now prescribes L1 tasks (rung 1 unlocked)
  8. User logs negative seed
  9. System records single failure
  10. User logs another negative seed in same channel
  11. Double failure: 14-day cooldown activates
  12. Channel tasks disappear from prescriptions
  13. 14 days pass
  14. Cooldown expires, channel tasks reappear at one rung lower
  15. Recovery protocol tasks fire

VERIFY at each step: state matches expected values.

PASS: Complete seed -> advance -> fail -> recover cycle works end-to-end.
```

## BV8: Dashboard Sunk Cost Pressure
```
ID: BV8
Type: behavioral
Priority: P2

JOURNEY:
  1. User has been active 30 days
  2. 45 tasks completed, $200 invested, 3 milestones
  3. User enters depression dip (odometer = 'survival')
  4. Open Dashboard

VERIFY Dashboard shows:
  - Investment: $200 and X hours prominently displayed
  - Streak: 30 days visible
  - Evidence: photos/recordings visible
  - Milestones: 3 achievements in timeline
  - Handler message (if caretaker mode): references specific evidence
  - Overall effect: stopping means losing all of this

PASS: Dashboard serves as sunk cost reminder during low motivation.
```

## BV9: Master Composite Drives Strategy
```
ID: BV9
Type: behavioral
Priority: P2

GIVEN: Master composite shows:
  - scent=3, domestic=3 (leaders)
  - pronoun=0, financial=0 (laggards)
  - Widest gap: 3

VERIFY:
  - Handler identifies laggard channels
  - Next prescribed Gina tasks prioritize pronoun or financial seeds
  - If flat for 2+ months: structural issue flagged
  - If declining: relationship health check triggered

PASS: Composite data influences Handler strategy.
```

## BV10: Offline Weekend Session
```
ID: BV10
Type: behavioral
Priority: P2

JOURNEY:
  1. User at cabin with no internet (Saturday morning)
  2. Opens app -> offline indicator shown
  3. Morning routine tasks appear (cached)
  4. Completes skincare, voice practice, journaling (3 tasks)
  5. Logs mood check-in
  6. Opens session view -> edge session available (local timer)
  7. Completes session (commitment extraction still works locally)
  8. Sunday evening: returns to cell service
  9. Sync fires automatically

VERIFY:
  - All 3 task completions + mood check-in + session synced
  - Streak maintained (not broken by offline gap)
  - No duplicate entries
  - Points calculated correctly post-sync

PASS: Full protocol operates offline with clean sync.
```

---

# UPDATED TEST TRACKING

## Summary Counts (Updated)

| Phase | P0 | P1 | P2 | P3 | Total |
|-------|----|----|----|----|-------|
| A: Foundation | 7 | 3 | 0 | 0 | 10 |
| B: Core Loop | 5 | 8 | 0 | 0 | 13 |
| C: Handler Intelligence | 2 | 6 | 3 | 0 | 11 |
| D: Session System | 2 | 3 | 0 | 0 | 5 |
| E: Ratchets | 1 | 4 | 2 | 0 | 7 |
| F: Full Handler | 1 | 2 | 5 | 0 | 8 |
| F3: Gina Pipeline Engine | 8 | 12 | 5 | 0 | 25 |
| F4: Gina Pipeline UI | 1 | 2 | 5 | 0 | 8 |
| G: Dashboard + Journal | 2 | 11 | 5 | 0 | 18 |
| H: Settings + PWA | 0 | 6 | 4 | 1 | 11 |
| X: Cross-Cutting | 1 | 2 | 3 | 1 | 7 |
| BV: Behavioral (original) | 1 | 5 | 0 | 0 | 6 |
| BV: Behavioral (new) | 0 | 1 | 3 | 0 | 4 |
| **TOTAL** | **31** | **65** | **35** | **2** | **133** |

## Test ID Index (Addendum Only)

| ID | Description | Priority |
|----|-------------|----------|
| F3.3 | Ladder state initialization | P0 |
| F3.4 | Ladder state table schema | P0 |
| F3.5 | Seed log table schema | P0 |
| F3.6 | Measurement table schema | P0 |
| F3.7 | Arc state table schema | P0 |
| F3.8 | Disclosure map table schema | P1 |
| F3.9 | Seed logging: positive response | P0 |
| F3.10 | Seed logging: negative (single failure) | P0 |
| F3.11 | Seed logging: double failure (cooldown) | P0 |
| F3.12 | Seed logging: callout response | P0 |
| F3.13 | Seed logging: rupture response | P1 |
| F3.14 | Cooldown enforcement | P0 |
| F3.15 | Cooldown: multiple channels | P2 |
| F3.16 | Rung advancement: basic criteria | P0 |
| F3.17 | Rung advancement: blocked by negative | P0 |
| F3.18 | Rung advancement: scaling criteria | P1 |
| F3.19 | Rung advancement: task unlocking | P0 |
| F3.20 | Rung advancement: no skipping | P1 |
| F3.21 | Trigger: gina_negative_reaction | P1 |
| F3.22 | Trigger: post_disclosure_stable | P1 |
| F3.23 | Trigger: pre_disclosure | P1 |
| F3.24 | Trigger: post_first_ally | P1 |
| F3.25 | Trigger: inner_circle_stable | P1 |
| F3.26 | Trigger: periodic reviews | P2 |
| F3.27 | Measurement: bedroom weekly | P1 |
| F3.28 | Measurement: pronoun weekly | P1 |
| F3.29 | Measurement: touch biweekly | P1 |
| F3.30 | Measurement: financial monthly | P1 |
| F3.31 | Measurement: master composite | P0 |
| F3.32 | Measurement: overdue detection | P2 |
| F3.33 | Measurement: rung advancement gate | P1 |
| F3.34 | Arc state: locked by default | P1 |
| F3.35 | Arc state: unlocking | P1 |
| F3.36 | Disclosure map: CRUD | P1 |
| F3.37 | Disclosure map: support threshold | P2 |
| F4.1 | GinaLadderView: channel display | P1 |
| F4.2 | GinaLadderView: recovery alerts | P2 |
| F4.3 | GinaLadderView: measurement alerts | P2 |
| F4.4 | SeedLogger: form submission | P0 |
| F4.5 | SeedLogger: negative with recovery | P0 |
| F4.6 | MeasurementForm: dynamic rendering | P1 |
| F4.7 | ChannelDetail: rung visualization | P2 |
| F4.8 | DisclosureMap: people management | P2 |
| G1.1 | Dashboard renders all widgets | P0 |
| G1.2 | Dashboard data accuracy | P0 |
| G2.1 | Odometer displays all states | P1 |
| G3.1 | Domain progress bars | P1 |
| G3.2 | Domain progress from escalation_state | P1 |
| G4.1 | Streak calendar heatmap | P2 |
| G4.2 | Streak calendar data accuracy | P2 |
| G5.1 | Evidence gallery display | P1 |
| G5.2 | Evidence gallery loads from DB | P1 |
| G6.1 | Investment total display | P1 |
| G6.2 | Add purchase flow | P1 |
| G7.1 | Commitment status display | P1 |
| G7.2 | Commitment honoring | P1 |
| G8.1 | Milestone timeline display | P2 |
| G9.1 | Daily entry form | P1 |
| G9.2 | Daily entry saves | P0 |
| G9.3 | Journal history view | P2 |
| G10.1 | Photo capture | P1 |
| G10.2 | Voice recording | P2 |
| G10.3 | Text evidence | P1 |
| H1.1 | Settings sections present | P1 |
| H1.2 | Profile edit | P1 |
| H1.3 | Difficulty dial | P1 |
| H1.4 | Gina visibility levels | P2 |
| H1.5 | Notification settings | P2 |
| H1.6 | AI budget monitor | P2 |
| H1.7 | Data export | P3 |
| H1.8 | Danger zone: reset streak | P2 |
| H1.9 | Danger zone: delete account | P1 |
| H2.1 | Manifest valid | P1 |
| H2.2 | Service worker registration | P1 |
| H2.3 | App installable | P2 |
| H2.4 | Offline task selection | P1 |
| H2.5 | Offline sync on reconnect | P1 |
| H2.6 | Push notifications | P2 |
| H2.7 | Discreet appearance | P1 |
| BV7 | Gina pipeline full cycle | P1 |
| BV8 | Dashboard sunk cost pressure | P2 |
| BV9 | Master composite drives strategy | P2 |
| BV10 | Offline weekend session | P2 |

---

# APPENDIX: GINA PIPELINE TEST DATA FIXTURES

## Default Gina Ladder State (10 channels at rung 0)
```json
[
  { "channel": "scent", "current_rung": 0, "consecutive_failures": 0 },
  { "channel": "touch", "current_rung": 0, "consecutive_failures": 0 },
  { "channel": "domestic", "current_rung": 0, "consecutive_failures": 0 },
  { "channel": "intimacy", "current_rung": 0, "consecutive_failures": 0 },
  { "channel": "visual", "current_rung": 0, "consecutive_failures": 0 },
  { "channel": "social", "current_rung": 0, "consecutive_failures": 0 },
  { "channel": "bedroom", "current_rung": 0, "consecutive_failures": 0 },
  { "channel": "pronoun", "current_rung": 0, "consecutive_failures": 0 },
  { "channel": "financial", "current_rung": 0, "consecutive_failures": 0 },
  { "channel": "body_change_touch", "current_rung": 0, "consecutive_failures": 0 }
]
```

## Mixed Progress State (for composite testing)
```json
[
  { "channel": "scent", "current_rung": 3, "consecutive_failures": 0 },
  { "channel": "touch", "current_rung": 2, "consecutive_failures": 0 },
  { "channel": "domestic", "current_rung": 3, "consecutive_failures": 0 },
  { "channel": "intimacy", "current_rung": 2, "consecutive_failures": 0 },
  { "channel": "visual", "current_rung": 2, "consecutive_failures": 0 },
  { "channel": "social", "current_rung": 1, "consecutive_failures": 0 },
  { "channel": "bedroom", "current_rung": 1, "consecutive_failures": 0 },
  { "channel": "pronoun", "current_rung": 1, "consecutive_failures": 0 },
  { "channel": "financial", "current_rung": 1, "consecutive_failures": 0 },
  { "channel": "body_change_touch", "current_rung": 0, "consecutive_failures": 0 }
]
```

## Cooldown State (for cooldown testing)
```json
[
  { "channel": "touch", "current_rung": 2, "consecutive_failures": 2,
    "cooldown_until": "2026-02-18T00:00:00Z", "last_seed_result": "negative" },
  { "channel": "visual", "current_rung": 3, "consecutive_failures": 0,
    "cooldown_until": "2026-02-25T00:00:00Z", "last_seed_result": "callout" }
]
```

## Sample Seed Log Entries
```json
[
  {
    "channel": "scent",
    "rung": 1,
    "seed_description": "Left jasmine lotion on bathroom counter",
    "gina_response": "positive",
    "gina_exact_words": "This smells nice, is it new?",
    "context_notes": "Evening, she was relaxed after dinner",
    "recovery_triggered": false
  },
  {
    "channel": "touch",
    "rung": 2,
    "seed_description": "Held her hand with freshly moisturized hands",
    "gina_response": "negative",
    "gina_exact_words": "Your hands feel weird",
    "context_notes": "Morning, she was rushing",
    "recovery_triggered": true,
    "recovery_type": "single_failure"
  }
]
```

## Sample Measurements
```json
{
  "bedroom_weekly": {
    "sessions": 2,
    "per_session": [
      { "initiated_by": "gina", "agency_score": 3 },
      { "initiated_by": "user", "agency_score": 2 }
    ],
    "unprompted_behaviors": ["chose_position"]
  },
  "pronoun_weekly": {
    "total_references": 30,
    "correct": 20,
    "self_corrected": 7,
    "uncorrected": 3
  },
  "touch_biweekly": {
    "zones": {
      "hands": 5, "arms": 4, "shoulders": 4, "back": 3,
      "chest": 2, "waist": 3, "hips": 2, "thighs": 1, "face": 4
    },
    "context": "casual"
  }
}
```

## Sample Disclosure Map
```json
[
  {
    "person_name": "Sarah",
    "relationship": "friend",
    "relationship_to": "gina",
    "awareness_status": "supportive",
    "told_by": "gina",
    "told_date": "2026-01-15",
    "initial_reaction": "surprised but supportive",
    "current_stance": "actively supportive",
    "provides_active_support": true
  },
  {
    "person_name": "Mom",
    "relationship": "family",
    "relationship_to": "user",
    "awareness_status": "neutral",
    "told_by": "user",
    "told_date": "2026-02-01",
    "initial_reaction": "confused, needed time",
    "current_stance": "processing",
    "provides_active_support": false
  }
]
```
