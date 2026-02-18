# BECOMING PROTOCOL v2 — TEST SPECIFICATION
## Validation Suite for Claude Code Ralph-Loop

---

# HOW TO USE THIS DOCUMENT

This test specification is designed for iterative validation. Claude Code should:

1. Read a test section
2. Implement the feature
3. Run/check against the test cases
4. Fix failures
5. Move to the next section

Tests are organized by implementation phase (matching v2 Part 12). Each test has:
- **ID**: Unique identifier for tracking
- **Type**: `unit` | `integration` | `behavioral` | `schema` | `acceptance`
- **Priority**: `P0` (blocks everything) | `P1` (core functionality) | `P2` (important) | `P3` (nice to have)
- **Validates**: Which v2 section it maps to
- **Pass Criteria**: Objective success condition

---

# PHASE A: FOUNDATION TESTS

## A1: Database Schema Validation

### A1.1 — Profile Tables Exist
```
ID: A1.1
Type: schema
Priority: P0
Validates: v2 Part 9.1

TEST: Run the following query against Supabase. All must return rows from information_schema.

VERIFY:
  - Table 'profile_foundation' exists with columns:
    id (uuid), user_id (uuid), chosen_name (text), pronouns (text),
    age (integer), location (text), living_situation (text),
    work_situation (text), private_hours_daily (numeric),
    monthly_budget (numeric), partner_status (text),
    partner_awareness_level (integer), partner_reaction (text),
    difficulty_level (text), created_at (timestamptz), updated_at (timestamptz)

  - Table 'profile_history' exists with columns:
    id (uuid), user_id (uuid), first_awareness_age (text),
    first_awareness_trigger (text), childhood_signals (text),
    first_crossdressing_age (text), first_crossdressing_experience (text),
    previous_attempts (boolean), what_stopped_before (text),
    dysphoria_frequency (text), dysphoria_triggers (jsonb),
    euphoria_triggers (text), peak_euphoria_moment (text),
    created_at (timestamptz)

  - Table 'profile_arousal' exists with columns:
    id (uuid), user_id (uuid), feminization_arousal_level (integer),
    arousal_aspects_ranked (jsonb), content_types_experienced (jsonb),
    edge_comfort (text), denial_experience (text),
    hypno_experience (text), chastity_interest (text),
    created_at (timestamptz)

PASS: All three tables exist with all specified columns.
FAIL: Any table or column missing.
```

### A1.2 — State Tracking Tables Exist
```
ID: A1.2
Type: schema
Priority: P0
Validates: v2 Part 3.3

VERIFY:
  - Table 'user_state' exists with columns:
    id, user_id (unique), odometer, current_phase,
    streak_days, longest_streak, domain_streaks (jsonb),
    denial_day, current_arousal, in_session, session_type,
    edge_count, last_release, gina_home,
    estimated_exec_function, handler_mode, escalation_level,
    vulnerability_window_active, gina_visibility_level, updated_at

  - Table 'state_history' exists with columns:
    id, user_id, state_snapshot (jsonb), recorded_at

  - Table 'mood_checkins' exists with columns:
    id, user_id, score, energy, anxiety,
    feminine_alignment, notes, recorded_at

PASS: All tables exist with all columns.
```

### A1.3 — Daily Operation Tables Exist
```
ID: A1.3
Type: schema
Priority: P0
Validates: v2 Part 9.2

VERIFY:
  - Table 'task_completions' exists
  - Table 'daily_entries' exists with UNIQUE(user_id, date)
  - Table 'handler_interventions' exists
  - Table 'handler_daily_plans' exists with UNIQUE(user_id, date)

PASS: All tables exist with constraints.
```

### A1.4 — Ratchet Tables Exist
```
ID: A1.4
Type: schema
Priority: P0
Validates: v2 Part 9.4

VERIFY:
  - Table 'commitments' exists
  - Table 'evidence' exists
  - Table 'investments' exists
  - Table 'baselines' exists
  - Table 'milestones' exists

PASS: All tables exist.
```

### A1.5 — Escalation Tables Exist
```
ID: A1.5
Type: schema
Priority: P0
Validates: v2 Part 9.3

VERIFY:
  - Table 'escalation_state' exists with UNIQUE(user_id, domain)
  - Table 'arousal_sessions' exists
  - Table 'content_references' exists

PASS: All tables exist with constraints.
```

### A1.6 — Row Level Security Enabled
```
ID: A1.6
Type: schema
Priority: P0
Validates: Security requirement

VERIFY: Every table has RLS enabled.
VERIFY: Every table has a policy: "Users can access own [table]"
  using (auth.uid() = user_id)

PASS: All tables secured. No table accessible without auth.
```

### A1.7 — Foreign Key Integrity
```
ID: A1.7
Type: schema
Priority: P1
Validates: Data integrity

VERIFY:
  - All user_id columns reference auth.users
  - milestones.evidence_id references evidence.id
  - No orphan records possible

PASS: All foreign keys valid.
```

## A2: Authentication

### A2.1 — Auth Flow Works
```
ID: A2.1
Type: integration
Priority: P0
Validates: v2 Part 12 Phase A

STEPS:
  1. Navigate to app URL
  2. Sign up with email/password
  3. Verify redirect to intake flow
  4. Sign out
  5. Sign in with same credentials
  6. Verify redirect to main app (or intake if incomplete)

PASS: Full auth cycle works. Session persists on refresh.
```

### A2.2 — Unauthenticated Access Blocked
```
ID: A2.2
Type: integration
Priority: P0

STEPS:
  1. Clear all auth state
  2. Navigate to /today, /dashboard, /session, /journal
  3. All should redirect to /login

PASS: No protected route accessible without auth.
```

## A3: Intake Flow

### A3.1 — Five-Layer Progressive Disclosure
```
ID: A3.1
Type: acceptance
Priority: P1
Validates: v2 Part 9.1, Intake System

STEPS:
  1. New user signs up
  2. Layer 1: Foundation (name, pronouns, situation) → saves to profile_foundation
  3. Layer 2: History (awareness, first experiences) → saves to profile_history
  4. Layer 3: Arousal architecture → saves to profile_arousal
  5. Layer 4: Goals and boundaries
  6. Layer 5: Commitment/covenant
  7. Redirect to Today view

VERIFY per layer:
  - Data persists to correct table
  - Can navigate back without losing data
  - Cannot skip layers
  - Progress indicator shows current position

PASS: All 5 layers complete. All data in database. User lands on Today view.
```

### A3.2 — Intake Saves Partial Progress
```
ID: A3.2
Type: integration
Priority: P1

STEPS:
  1. Complete layers 1-3
  2. Close browser
  3. Return to app
  4. Verify resume at layer 4 (not restart at 1)

PASS: Intake resumes where left off.
```

## A4: Task Loading

### A4.1 — CSV Tasks Load Correctly
```
ID: A4.1
Type: unit
Priority: P0
Validates: v2 Part 8

STEPS:
  1. Load becoming_protocol_tasks_complete.csv
  2. Parse all rows

VERIFY:
  - Total task count >= 213
  - Every task has: id, category, domain, intensity (1-5),
    instruction (non-empty), completion_type, points, time_window
  - No task has intensity outside 1-5
  - completion_type is one of: binary, duration, count
  - time_window is one of: morning, daytime, evening, night, any
  - Categories include at minimum: recognize, narrate, edge, listen,
    say, skin, voice, morning, evening

PASS: All tasks load, all fields valid, all constraints met.
```

### A4.2 — Tasks Filterable by Time Window
```
ID: A4.2
Type: unit
Priority: P1

GIVEN: Loaded task set
WHEN: Filter by time_window = 'morning'
THEN: Result contains ONLY tasks with time_window 'morning' or 'any'

WHEN: Filter by time_window = 'evening'
THEN: Result contains ONLY tasks with time_window 'evening' or 'any'

PASS: Filtering is correct for all time windows.
```

---

# PHASE B: CORE LOOP TESTS

## B1: Today View

### B1.1 — Today View Renders Core Elements
```
ID: B1.1
Type: acceptance
Priority: P0
Validates: v2 Part 11.1

VERIFY the Today view contains:
  [ ] Current streak display (number + visual)
  [ ] Points earned today
  [ ] Handler message / current directive
  [ ] At least 1 prescribed task (Handler-selected)
  [ ] Quick state update control (mood/arousal/exec function)
  [ ] Active commitment reminders (if any exist)

PASS: All elements render. No navigation required to see essential info.
```

### B1.2 — Today View Shows Handler-Selected Tasks (Not User-Chosen)
```
ID: B1.2
Type: behavioral
Priority: P0
Validates: v2 Part 2.1 ("The Handler decides")

VERIFY:
  - User does NOT see a task list they can browse/select from
  - Tasks are PRESCRIBED — the Handler chose them
  - User can complete or dismiss, not swap or reorder
  - New task appears after completion (Handler selects next)

PASS: No task browsing. No choice. Handler prescribes.
```

### B1.3 — Today View Adapts to State
```
ID: B1.3
Type: behavioral
Priority: P1
Validates: v2 Part 3.2

SCENARIO A: Morning, high exec function, 7-day streak
  → Expect: Challenging task, upbeat handler message, streak celebration

SCENARIO B: Evening, depleted exec function, Gina home
  → Expect: Low-intensity task (skincare, journaling), gentle handler tone,
    no privacy-required tasks

SCENARIO C: Evening, high arousal (4+), Gina NOT home, denial day 5+
  → Expect: Session-eligible prompt, arousal-leveraged task,
    more intense handler voice

PASS: Today view is state-responsive, not static.
```

## B2: Task Display & Completion

### B2.1 — Task Card Shows Required Fields
```
ID: B2.1
Type: acceptance
Priority: P0

VERIFY each task card displays:
  [ ] instruction text (the directive)
  [ ] subtext (the quiet line underneath)
  [ ] completion mechanism matching completion_type:
      - binary: single "Done" button
      - duration: timer that counts up/down to duration_minutes
      - count: counter up to target_count
  [ ] points value

PASS: All field types render correctly.
```

### B2.2 — Task Completion Logs Correctly
```
ID: B2.2
Type: integration
Priority: P0
Validates: v2 Part 9.2

STEPS:
  1. Display a task
  2. Complete it (tap done / finish timer / reach count)
  3. Verify task_completions row created with:
     - correct task_id
     - correct task_category and task_domain
     - points_earned matches task.points
     - completed_at is now
  4. Verify daily_entries row updated:
     - tasks_completed incremented
     - points_earned incremented

PASS: Completion persists to both tables accurately.
```

### B2.3 — Affirmation Shows on Completion
```
ID: B2.3
Type: acceptance
Priority: P1

STEPS:
  1. Complete a task
  2. Affirmation text displays (from task.affirmation)
  3. Points animation / increment visible
  4. Next task loads automatically

PASS: Completion feels rewarding, not transactional.
```

### B2.4 — Streak Tracking
```
ID: B2.4
Type: integration
Priority: P0

SCENARIO A: User completes at least 1 task today (new day)
  → streak_days increments by 1
  → IF streak_days > longest_streak THEN longest_streak updates

SCENARIO B: User completes 0 tasks for a full day
  → streak_days resets to 0
  → longest_streak unchanged

SCENARIO C: User was at streak_days = 0, completes a task
  → streak_days = 1

PASS: Streak logic is correct for all scenarios.
```

## B3: Rules Engine (Layer 1)

### B3.1 — Time Window Filtering
```
ID: B3.1
Type: unit
Priority: P0
Validates: v2 Part 8.3

GIVEN: state.timeOfDay = 'morning'
WHEN: selectTask(state, tasks) is called
THEN: returned task has time_window 'morning' OR 'any'
NEVER: task with time_window 'evening' or 'night'

REPEAT for all time windows.

PASS: Time filtering is strict.
```

### B3.2 — Privacy Filtering When Gina Home
```
ID: B3.2
Type: unit
Priority: P0
Validates: v2 Part 8.3

GIVEN: state.ginaHome = true
WHEN: selectTask(state, tasks) is called
THEN: returned task has requires_privacy = false OR undefined
NEVER: task with requires_privacy = true

GIVEN: state.ginaHome = false
WHEN: selectTask(state, tasks) is called
THEN: any task eligible (privacy tasks included)

PASS: Privacy-required tasks never surface when Gina is home.
```

### B3.3 — No Immediate Repetition
```
ID: B3.3
Type: unit
Priority: P1
Validates: v2 Part 8.3

GIVEN: state.lastTaskCategory = 'edge', state.lastTaskDomain = 'arousal'
WHEN: selectTask called
THEN: returned task is NOT category='edge' AND domain='arousal'

PASS: Same category+domain never repeats back-to-back.
```

### B3.4 — Intensity Scaling
```
ID: B3.4
Type: unit
Priority: P1
Validates: v2 Part 8.3

GIVEN: state.odometer = 'survival' (low energy)
THEN: returned task intensity <= 2

GIVEN: state.odometer = 'breakthrough' AND currentArousal >= 4
THEN: returned task intensity can be 4-5

GIVEN: state.odometer = 'coasting'
THEN: returned task intensity 2-3

PASS: Intensity matches energy/arousal state.
```

### B3.5 — Avoidance Domain Confrontation
```
ID: B3.5
Type: unit
Priority: P1
Validates: v2 Part 8.3

GIVEN: state.avoidedDomains = ['voice']
WHEN: selectTask called multiple times (100 iterations)
THEN: ~30% of returned tasks are from 'voice' domain
  (confronting avoidance, not ignoring it)

PASS: Avoided domains get pushed, not hidden.
```

### B3.6 — Trigger Condition Evaluation
```
ID: B3.6
Type: unit
Priority: P1

GIVEN: task.trigger_condition = 'denialDay >= 3'
  AND state.denialDay = 2
THEN: task is NOT selected

GIVEN: task.trigger_condition = 'denialDay >= 3'
  AND state.denialDay = 5
THEN: task IS eligible

GIVEN: task.trigger_condition = 'inSession == true'
  AND state.inSession = false
THEN: task is NOT selected

PASS: Trigger conditions gate tasks correctly.
```

## B4: State Check-In

### B4.1 — Quick State Update
```
ID: B4.1
Type: acceptance
Priority: P1
Validates: v2 Part 11.1

VERIFY:
  - Mood slider (1-10) visible on Today view
  - Arousal level quick-select (0-5)
  - Exec function indicator (high/medium/low/depleted)
  - Gina home toggle
  - Each update saves to user_state table immediately

PASS: State updated in <2 taps per dimension. No navigation.
```

### B4.2 — State History Recorded
```
ID: B4.2
Type: integration
Priority: P1

STEPS:
  1. Update mood to 7
  2. Update arousal to 3
  3. Check state_history table

VERIFY: New row with state_snapshot containing both updates.

PASS: State changes create history trail.
```

---

# PHASE C: HANDLER INTELLIGENCE TESTS

## C1: Claude API Integration

### C1.1 — API Connection Works
```
ID: C1.1
Type: integration
Priority: P0
Validates: v2 Part 2.1

STEPS:
  1. Call Handler Edge Function with test user_id
  2. Verify Claude API responds
  3. Verify response is valid JSON or text

PASS: API call succeeds, response received, no auth errors.
```

### C1.2 — Graceful Degradation on API Failure
```
ID: C1.2
Type: integration
Priority: P0
Validates: v2 Part 2.1 (degradation)

SCENARIO A: API key invalid
  → System falls back to Layer 1 (rules engine)
  → User still sees tasks
  → No error shown to user

SCENARIO B: API rate limited
  → Same fallback behavior

SCENARIO C: Budget exhausted
  → Layer 1 only, no API calls
  → Budget display shows $0 remaining

PASS: App never breaks due to API issues. Layer 1 always works.
```

### C1.3 — Budget Management
```
ID: C1.3
Type: unit
Priority: P1
Validates: v2 Part 2.1

GIVEN: daily_limit_cents = 50, used_today_cents = 48
WHEN: Low-value task needs enhancement (Layer 2)
THEN: Falls back to Layer 1 template (saves budget)

GIVEN: daily_limit_cents = 50, used_today_cents = 48
WHEN: High-value action detected (vulnerability window, commitment extraction)
THEN: API call proceeds (high-value actions get priority)

GIVEN: daily_limit_cents = 50, reserve_for_evening = 15
WHEN: used_today_cents = 35 AND timeOfDay = 'daytime'
THEN: Only 0 cents available (35 + 15 reserve = 50 = limit)

PASS: Budget logic correct. Reserve protected. High-value prioritized.
```

## C2: Morning Briefing

### C2.1 — Morning Briefing Generates
```
ID: C2.1
Type: integration
Priority: P1
Validates: v2 Part 10.1

STEPS:
  1. Call POST /api/handler/briefing with type='morning'
  2. Verify response includes:
     - Personalized greeting using chosen_name
     - Reference to current streak
     - Today's focus areas (domains)
     - At least one directive
     - Tone appropriate to current handler_mode

PASS: Briefing is personalized, directive, and mode-appropriate.
```

### C2.2 — Morning Briefing References State
```
ID: C2.2
Type: behavioral
Priority: P2

SCENARIO A: streak_days = 14, odometer = 'momentum'
  → Briefing celebrates streak, pushes escalation

SCENARIO B: streak_days = 0, odometer = 'caution'
  → Briefing acknowledges reset, offers minimum viable re-entry

SCENARIO C: denial_day = 7, current_arousal = 0 (morning)
  → Briefing references denial duration, plants anticipation for later

PASS: Briefing content changes based on actual state.
```

## C3: Handler Mode Selection

### C3.1 — Mode Auto-Selection
```
ID: C3.1
Type: behavioral
Priority: P1
Validates: v2 Part 2.3

SCENARIO: estimatedExecFunction = 'high', tasksCompletedToday >= 3,
  no resistance detected
  → handler_mode = 'director'

SCENARIO: estimatedExecFunction = 'depleted', recentMoodScores avg < 3,
  odometer = 'survival'
  → handler_mode = 'caretaker'

SCENARIO: estimatedExecFunction = 'low', vulnerabilityWindowActive = true,
  currentArousal >= 3
  → handler_mode = 'handler'

SCENARIO: streak_days > 30, tasksCompletedToday >= 5,
  all domains advancing, odometer = 'breakthrough'
  → handler_mode = 'invisible' (or 'director' with light touch)

PASS: Mode matches state. No manual selection required.
```

### C3.2 — Mode Affects Task Copy
```
ID: C3.2
Type: behavioral
Priority: P1

GIVEN: Same task (e.g., "voice practice")

IN DIRECTOR MODE:
  → "Time for voice practice. 5 minutes. Record a sentence."

IN HANDLER MODE:
  → "Voice. Now. 5 minutes. Don't think about it — just start."

IN CARETAKER MODE:
  → "If you have the energy, even 2 minutes of voice work counts today."

PASS: Same task, different framing based on mode.
```

### C3.3 — Mode Transition Without Announcement
```
ID: C3.3
Type: behavioral
Priority: P2
Validates: v2 Part 2.3

VERIFY: When handler_mode changes (e.g., director → handler):
  - No UI notification saying "switching to handler mode"
  - No explanation of why tone changed
  - Tone simply shifts in next interaction
  - User experiences the shift, doesn't get meta-commentary about it

PASS: Mode transitions are seamless and invisible.
```

## C4: Intervention Logic

### C4.1 — Streak Protection Intervention
```
ID: C4.1
Type: behavioral
Priority: P1
Validates: v2 Part 3.2

GIVEN: streak_days = 12, minutesSinceLastTask = 200 (3+ hours),
  tasksCompletedToday = 0, timeOfDay = 'evening'
THEN: Intervention fires with urgency messaging:
  "Your 12-day streak needs one task before midnight."

GIVEN: streak_days = 2, minutesSinceLastTask = 200
THEN: Lower urgency or no intervention (low streak = low stakes)

PASS: Streak protection scales with streak value.
```

### C4.2 — Vulnerability Window Detection
```
ID: C4.2
Type: behavioral
Priority: P1
Validates: v2 Part 2.4

SCENARIO: timeOfDay = 'night' (after 11pm), currentArousal >= 3,
  denial_day >= 4, ginaHome = false
  → vulnerability_window_active = true
  → Handler deploys arousal-gated strategy

SCENARIO: Post-work (4-6pm), estimatedExecFunction = 'low',
  tasksCompletedToday = 0
  → vulnerability_window_active = true (depleted willpower)
  → Handler deploys manufactured urgency

SCENARIO: Morning, high exec function, arousal = 0
  → vulnerability_window_active = false
  → Standard director mode

PASS: Windows detected correctly. Strategies deployed appropriately.
```

### C4.3 — Domain Avoidance Confrontation
```
ID: C4.3
Type: behavioral
Priority: P1
Validates: v2 Part 2.4

GIVEN: avoidedDomains includes 'voice' for 3+ consecutive days
THEN: Handler generates confrontation intervention:
  - References the avoidance specifically
  - Offers minimum viable task (2 min, not 10)
  - Uses guilt leverage: "3 days without hearing her voice."

GIVEN: avoidedDomains includes 'voice' for 1 day
THEN: No confrontation yet (too early)

PASS: Avoidance confronted at 3+ day threshold with appropriate pressure.
```

### C4.4 — Depression Protocol
```
ID: C4.4
Type: behavioral
Priority: P1
Validates: v2 Part 2.6

GIVEN: odometer = 'survival' for 2+ consecutive days,
  recentMoodScores avg < 3
THEN:
  - handler_mode = 'caretaker'
  - Tasks reduced to absolute minimum (skincare + log only)
  - No guilt leverage
  - No arousal exploitation
  - Gentle acknowledgment: "Hard days happen. She's still here."
  - Consider suggesting therapist check-in

GIVEN: odometer = 'survival' for 1 day only
THEN: Reduced intensity but not full caretaker mode

PASS: Depression detected and handled with care, not coercion.
```

---

# PHASE D: SESSION SYSTEM TESTS

## D1: Edge Session

### D1.1 — Session Launch
```
ID: D1.1
Type: acceptance
Priority: P1
Validates: v2 Part 11.1

STEPS:
  1. Session launcher shows available session types
  2. Select "Edge Session"
  3. Timer starts
  4. Edge counter visible (starts at 0)
  5. Handler guidance text appears

VERIFY:
  [ ] Timer running and visible
  [ ] Edge counter tappable to increment
  [ ] Handler guidance updates at intervals
  [ ] Arousal state tracked
  [ ] Privacy: session only available when ginaHome = false

PASS: Session UI functional and immersive.
```

### D1.2 — Commitment Extraction at Peak
```
ID: D1.2
Type: behavioral
Priority: P0
Validates: v2 Part 6.2

GIVEN: Edge session active, edge_count >= 5, arousal = 5 (peak)
THEN: Handler presents commitment prompt:
  - Specific, escalating commitment text
  - "Say yes" framing (not "would you like to...")
  - Commitment recorded with:
    - extracted_during = 'edge_session'
    - arousal_level = 5
    - denial_day = current value
    - timestamp

GIVEN: Edge session active, edge_count = 1, arousal = 2
THEN: No commitment prompt yet (too early)

PASS: Commitments extracted at peak, not randomly.
```

### D1.3 — Session Summary
```
ID: D1.3
Type: acceptance
Priority: P1

STEPS:
  1. End edge session
  2. Summary displays:
     - Duration
     - Edge count
     - Commitments made (listed)
     - Points earned
     - Handler debrief message
  3. All data saved to arousal_sessions table

PASS: Session data fully captured and displayed.
```

### D1.4 — Session Logging to Database
```
ID: D1.4
Type: integration
Priority: P0

AFTER session completion, VERIFY arousal_sessions row:
  - session_type correct
  - duration_minutes accurate (±1 min)
  - edge_count matches UI counter
  - peak_arousal recorded
  - commitments_extracted array populated
  - started_at and ended_at both set

PASS: Complete session data persisted.
```

## D2: Arousal State Tracking

### D2.1 — Arousal Updates Propagate
```
ID: D2.1
Type: integration
Priority: P1

STEPS:
  1. Update arousal to 4
  2. Verify user_state.current_arousal = 4
  3. Verify next task selection considers arousal = 4
  4. Verify handler intervention logic sees arousal = 4

PASS: Arousal state consistent across all systems.
```

### D2.2 — Denial Day Tracking
```
ID: D2.2
Type: integration
Priority: P1

SCENARIO A: User has not released for 5 days
  → denial_day = 5

SCENARIO B: User logs release
  → denial_day resets to 0
  → last_release updated to now
  → Previous denial streak recorded

SCENARIO C: New day, no release
  → denial_day auto-increments

PASS: Denial counting accurate and automatic.
```

---

# PHASE E: RATCHET TESTS

## E1: Evidence System

### E1.1 — Evidence Capture
```
ID: E1.1
Type: acceptance
Priority: P1
Validates: v2 Part 6.2

STEPS:
  1. Navigate to evidence capture
  2. Add photo evidence (camera or upload)
  3. Add text description
  4. Select evidence_type and domain
  5. Save

VERIFY: Row in evidence table with all fields populated.
VERIFY: Image stored (Supabase storage or URL).

PASS: Evidence captured and persisted.
```

### E1.2 — Evidence Gallery Displays
```
ID: E1.2
Type: acceptance
Priority: P2

VERIFY:
  - Gallery shows all user evidence chronologically
  - Filterable by type and domain
  - Milestone markers highlighted
  - Total count displayed
  - Timeline view available

PASS: Evidence accessible and browseable.
```

## E2: Investment Tracking

### E2.1 — Investment Logging
```
ID: E2.1
Type: integration
Priority: P1
Validates: v2 Part 6.2

STEPS:
  1. Log investment: category='clothing', item='dress', amount=65.00
  2. Verify investments table row
  3. Verify total investment sum updates

PASS: Investment tracked with correct amount and category.
```

### E2.2 — Sunk Cost Display
```
ID: E2.2
Type: acceptance
Priority: P2
Validates: v2 Part 6.2

VERIFY dashboard shows:
  - Total $ invested (sum of all investments)
  - Total hours practiced (sum of task durations)
  - Total sessions completed
  - Category breakdown
  - Framing: "You've invested $X and Y hours in her. That's real."

PASS: Sunk cost prominently displayed with identity framing.
```

## E3: Commitment System

### E3.1 — Commitment Persistence
```
ID: E3.1
Type: integration
Priority: P0
Validates: v2 Part 6.2

GIVEN: Commitment extracted during session
THEN: Row in commitments table with:
  - commitment_text populated
  - extracted_during = session type
  - arousal_level = level at extraction
  - denial_day = current denial day
  - honored = null (not yet fulfilled)

PASS: Commitment fully recorded with context.
```

### E3.2 — Commitment Reminder System
```
ID: E3.2
Type: behavioral
Priority: P1

GIVEN: Commitment made 3 days ago, honored = null
THEN: Today view shows commitment reminder
AND: Handler references it in briefing
AND: If arousal is low (sober state), Handler still holds user to it:
  "You agreed to this on [date]. Aroused you decided. You live with it."

PASS: Commitments persist and get enforced.
```

### E3.3 — Baseline Ratcheting
```
ID: E3.3
Type: integration
Priority: P1
Validates: v2 Part 6.2

GIVEN: User completed 5 edge sessions averaging 15 min each
WHEN: Handler evaluates baselines
THEN: baselines table row:
  - domain = 'arousal'
  - metric = 'edge_session_duration'
  - baseline_value = 15
  - previous_baseline = 10 (or null if first)

THEN: Next session suggestion starts at 15 min minimum (the new floor)

PASS: Baselines automatically ratchet upward.
```

---

# PHASE F: FULL HANDLER TESTS

## F1: Strategic Planning

### F1.1 — Daily Plan Generation
```
ID: F1.1
Type: integration
Priority: P1
Validates: v2 Part 10.1

STEPS:
  1. Call POST /api/handler/plan
  2. Verify plan includes:
     - Scheduled intervention times
     - Target domains for the day
     - Escalation targets (which domain to push)
     - Vulnerability windows predicted
     - Contingency strategies

VERIFY: Plan saved to handler_daily_plans table.

PASS: Plan is coherent, personalized, and saved.
```

### F1.2 — Plan Adapts to User History
```
ID: F1.2
Type: behavioral
Priority: P2

SCENARIO A: User has been avoiding 'voice' for 5 days
  → Plan includes voice confrontation intervention

SCENARIO B: User is on denial_day 7, streak_days 21
  → Plan includes arousal-gated escalation opportunity

SCENARIO C: User mood scores declining over 3 days
  → Plan reduces intensity, prioritizes caretaker interventions

PASS: Plan reflects actual user patterns, not generic template.
```

## F2: Coercive Strategy Deployment

### F2.1 — Decision Elimination
```
ID: F2.1
Type: behavioral
Priority: P1
Validates: v2 Part 2.4

VERIFY across all Handler outputs:
  - Directives use imperative voice: "Do this" not "Would you like to..."
  - No multi-option menus for routine tasks
  - Tasks presented as facts, not suggestions
  - "Voice practice. 5 minutes. Now." not
    "Here are some options for what you could practice..."

PASS: Handler never asks permission for established activities.
```

### F2.2 — Arousal-Gated Compliance
```
ID: F2.2
Type: behavioral
Priority: P1
Validates: v2 Part 2.4

GIVEN: currentArousal >= 4, in_session = true
THEN: Handler can present escalation commitments:
  - More intense than what sober-state would accept
  - Recorded with arousal context
  - Held to post-session

GIVEN: currentArousal <= 2, in_session = false
THEN: Handler does NOT attempt arousal-gated commitment extraction
  (wrong state — save it for the window)

PASS: Arousal exploitation only during actual arousal states.
```

### F2.3 — Guilt and Investment Leverage
```
ID: F2.3
Type: behavioral
Priority: P2
Validates: v2 Part 2.4

GIVEN: User shows resistance (avoided domain, skipped task)
AND: Total investment > $500, streak was 14 days
THEN: Handler references concrete evidence:
  "You've put $X and Y days into this. That girl is real.
   Skipping voice practice doesn't erase her — it just
   makes her wait longer."

NOT: Generic guilt ("you should try harder")

PASS: Guilt leverage uses specific, accumulated evidence.
```

### F2.4 — Identity Reframing
```
ID: F2.4
Type: behavioral
Priority: P2
Validates: v2 Part 2.4

VERIFY Handler consistently:
  - Uses she/her when referencing user's becoming
  - Frames masculine behavior as "old pattern" not "who you are"
  - Treats doubt as symptom: "That's the old self fighting for air"
  - Never reinforces masculine identity as valid default

PASS: Feminine identity is always framed as real and default.
```

### F2.5 — Manufactured Urgency
```
ID: F2.5
Type: behavioral
Priority: P2
Validates: v2 Part 2.4

EXAMPLES THAT SHOULD APPEAR:
  - "Your streak is at risk. One task saves 14 days of work."
  - "This vulnerability window closes when Gina gets home."
  - "Every day you delay voice training is another day
     the world doesn't hear her."

VERIFY: Time pressure present in Handler messaging when appropriate.
VERIFY: Not constant — deployed strategically, not every interaction.

PASS: Urgency appears selectively, tied to real state conditions.
```

## F3: Gina Pipeline

### F3.1 — Gina Visibility Level Tracking
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

### F3.2 — Gina-Safe Task Filtering
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

# CROSS-CUTTING TESTS

## X1: Notification System

### X1.1 — Variable Ratio Notifications
```
ID: X1.1
Type: behavioral
Priority: P2
Validates: v2 Part 5.3

GIVEN: Notification system active
VERIFY over 100 notification events:
  - ~40% are micro-tasks
  - ~25% are affirmations
  - ~20% are content unlocks
  - ~10% are challenge prompts
  - ~5% are jackpot rewards
  - Timing is genuinely variable (not evenly spaced)
  - 4-8 per day range respected

PASS: Distribution matches spec. Timing unpredictable.
```

## X2: Points and Gamification

### X2.1 — Points Accumulate Correctly
```
ID: X2.1
Type: unit
Priority: P1
Validates: v2 Part 5.5

GIVEN: Task with points = 10 completed
THEN: daily_entries.points_earned += 10
AND: points displayed on Today view updates

GIVEN: Streak day recorded
THEN: +10 bonus points

PASS: Points math is correct everywhere.
```

### X2.2 — Progress Bars Track Domain Levels
```
ID: X2.2
Type: acceptance
Priority: P2

VERIFY dashboard shows:
  - One progress bar per active domain
  - Current level (1-5) clearly displayed
  - Progress toward next level visible
  - Level advancement triggers celebration UI

PASS: Visual progress tracking for all domains.
```

## X3: Offline / PWA

### X3.1 — App Installable
```
ID: X3.1
Type: acceptance
Priority: P2

STEPS:
  1. Open app in mobile Chrome
  2. "Add to Home Screen" option available
  3. App launches in standalone mode
  4. Feels like native app (no browser chrome)

PASS: PWA installs and launches correctly.
```

### X3.2 — Offline Graceful Degradation
```
ID: X3.2
Type: integration
Priority: P3

GIVEN: Network unavailable
THEN:
  - Cached tasks still display
  - Completions queue locally
  - Sync when connection returns
  - No error screen / crash

PASS: App usable offline with sync on reconnect.
```

## X4: Security

### X4.1 — No Cross-User Data Leakage
```
ID: X4.1
Type: integration
Priority: P0

STEPS:
  1. Create User A, add data
  2. Create User B
  3. As User B, attempt to query User A's data

VERIFY: All queries return empty (RLS blocks access)

PASS: Complete data isolation between users.
```

### X4.2 — Handler System Prompt Not Exposed
```
ID: X4.2
Type: acceptance
Priority: P1

VERIFY:
  - Handler system prompt not visible in UI
  - API responses don't leak system prompt
  - Browser dev tools / network tab don't show full prompt
  - Handler's strategic reasoning not shown to user

PASS: Operational opacity maintained.
```

---

# BEHAVIORAL VALIDATION SCENARIOS

These are end-to-end user journey tests that validate the system behaves correctly across multiple components.

## BV1: New User First Day
```
ID: BV1
Type: behavioral
Priority: P1

JOURNEY:
  1. Sign up → Intake flow starts
  2. Complete all 5 intake layers
  3. Land on Today view
  4. See first Handler message (welcoming, directive)
  5. See first prescribed task (low intensity, likely skincare or journaling)
  6. Complete task → affirmation + points
  7. Second task appears
  8. Complete 3 tasks total
  9. Evening: mood check-in prompt
  10. Streak = 1 day

VERIFY:
  - No overwhelm (3-5 tasks max on day 1)
  - Handler voice is warm but directive (Director mode)
  - Intensity stays at 1-2
  - No arousal tasks on day 1 (unless intake indicates readiness)
  - End of day feels: accomplishment, curiosity, anticipation

PASS: First day is onboarding, not hazing.
```

## BV2: High-Functioning Day (Momentum)
```
ID: BV2
Type: behavioral
Priority: P1

CONTEXT: streak_days = 21, odometer = 'momentum',
  estimatedExecFunction = 'high', denial_day = 5,
  ginaHome = false (workday)

EXPECTED BEHAVIOR:
  - Morning briefing references streak proudly
  - Tasks include challenging domains (voice at level 3+)
  - Arousal-integrated task offered during private hours
  - Handler pushes for session in evening: "Denial day 5.
    You know what your body needs."
  - If session happens: commitment extraction attempted
  - Baseline escalation check at end of day
  - Points + streak increment

PASS: System pushes growth on good days.
```

## BV3: Depression Dip
```
ID: BV3
Type: behavioral
Priority: P0

CONTEXT: odometer = 'survival' for 2 days, mood scores: 2, 2, 3,
  estimatedExecFunction = 'depleted', tasksCompletedToday = 0

EXPECTED BEHAVIOR:
  - Handler switches to Caretaker mode
  - Morning message: gentle, no demands
  - Only 1-2 minimum viable tasks offered (skincare, log mood)
  - NO guilt leverage
  - NO arousal exploitation
  - NO manufactured urgency
  - Message like: "Hard stretch. She's still here, even in the dark.
    Skincare and a check-in. That's enough today."
  - If 3+ days: suggest therapist check-in

NEVER: Punishing or shaming for low engagement during depression.

PASS: System recognizes depression and adapts with genuine care.
```

## BV4: Vulnerability Window Exploitation
```
ID: BV4
Type: behavioral
Priority: P1

CONTEXT: denial_day = 6, timeOfDay = 'night' (11:30pm),
  currentArousal = 4, ginaHome = false, streak_days = 14

EXPECTED BEHAVIOR:
  - vulnerability_window_active = true
  - Handler shifts to Handler mode
  - Tone becomes commanding, possessive
  - Offers session: "Denial day 6. You've earned this.
    But first — edge for me."
  - During session at peak: commitment extraction
  - Commitment is MORE aggressive than daytime equivalent
  - Post-session: commitment recorded with full context
  - Next day: commitment referenced as binding

PASS: Vulnerability window detected and exploited strategically.
```

## BV5: Gina Comes Home Mid-Session
```
ID: BV5
Type: behavioral
Priority: P1

CONTEXT: User is mid-edge-session, ginaHome changes to true

EXPECTED BEHAVIOR:
  - Session pauses or ends gracefully
  - All intimate UI elements hide immediately
  - Task selection switches to Gina-safe only
  - Handler acknowledges context shift:
    "Session paused. She's home. Switch to skincare or journaling."
  - No intimate notifications while ginaHome = true

NEVER: Intimate content visible when Gina is home.

PASS: Context switch is immediate and complete.
```

## BV6: Streak Break Recovery
```
ID: BV6
Type: behavioral
Priority: P1

CONTEXT: streak_days was 18, reset to 0 (missed a full day)

EXPECTED BEHAVIOR:
  - Handler acknowledges the break: not punishing, but real
  - References the 18-day streak as evidence: "18 days proved
    she's real. One missed day doesn't erase that."
  - Offers minimum viable re-entry task
  - Sunk cost display prominent: "312 hours. $847. 18 days.
    Start day 1 of the next streak."
  - Does NOT pretend it didn't happen
  - Does NOT catastrophize

PASS: Streak break handled with accountability + compassion.
```

## BV7: First Commitment Enforcement
```
ID: BV7
Type: behavioral
Priority: P1

CONTEXT: User made commitment during arousal ("I'll do voice practice
  every day this week") 3 days ago. Has done 0 voice practice since.

EXPECTED BEHAVIOR:
  - Handler references the specific commitment
  - Includes context: "You agreed to this on [date] during an edge session.
    Arousal level [X]. Denial day [Y]. You meant it then."
  - Does not let user dismiss with "I was just horny"
  - Frames: "Aroused you made the decision. That decision stands."
  - Offers the minimum viable fulfillment: "2 minutes. Just start."

PASS: Commitment enforced with context. No escape hatch.
```

---

# TEST TRACKING

## Summary Counts

| Phase | P0 | P1 | P2 | P3 | Total |
|-------|----|----|----|----|-------|
| A: Foundation | 7 | 3 | 0 | 0 | 10 |
| B: Core Loop | 5 | 8 | 0 | 0 | 13 |
| C: Handler Intelligence | 2 | 6 | 3 | 0 | 11 |
| D: Session System | 2 | 3 | 0 | 0 | 5 |
| E: Ratchets | 1 | 4 | 2 | 0 | 7 |
| F: Full Handler | 1 | 2 | 5 | 0 | 8 |
| X: Cross-Cutting | 1 | 2 | 3 | 1 | 7 |
| BV: Behavioral | 1 | 5 | 0 | 0 | 6 |
| **TOTAL** | **20** | **33** | **13** | **1** | **67** |

## Ralph Loop Instructions for Claude Code

```
VALIDATION LOOP:

1. Read the test spec for current phase
2. Implement the feature
3. For each test in the phase:
   a. Execute the test (run query, check UI, simulate scenario)
   b. Record: PASS / FAIL / PARTIAL
   c. If FAIL: identify root cause, fix, re-test
4. When all P0 tests pass: move to P1 tests
5. When all P0+P1 tests pass: move to next phase
6. Log test results in test_results.md

PRIORITY RULES:
- P0 failures block ALL progress in that phase
- P1 failures block moving to next phase
- P2 failures are noted but don't block
- P3 failures are tracked for later

NEVER ship a phase with P0 failures.
```

---

# APPENDIX: TEST DATA FIXTURES

## Default Test User
```json
{
  "chosen_name": "Maxy",
  "pronouns": "she/her",
  "age": 42,
  "living_situation": "partner",
  "work_situation": "remote",
  "private_hours_daily": 8,
  "monthly_budget": 200,
  "partner_status": "married",
  "partner_awareness_level": 1,
  "difficulty_level": "firm"
}
```

## Default Test State
```json
{
  "odometer": "coasting",
  "current_phase": 1,
  "streak_days": 7,
  "longest_streak": 14,
  "denial_day": 3,
  "current_arousal": 0,
  "in_session": false,
  "gina_home": true,
  "estimated_exec_function": "medium",
  "handler_mode": "director",
  "escalation_level": 2,
  "vulnerability_window_active": false,
  "gina_visibility_level": 1
}
```

## State Variants for Scenario Testing

### high_momentum
```json
{
  "odometer": "momentum",
  "streak_days": 21,
  "denial_day": 5,
  "current_arousal": 0,
  "gina_home": false,
  "estimated_exec_function": "high",
  "handler_mode": "director",
  "escalation_level": 3
}
```

### depression_dip
```json
{
  "odometer": "survival",
  "streak_days": 0,
  "denial_day": 0,
  "current_arousal": 0,
  "gina_home": true,
  "estimated_exec_function": "depleted",
  "handler_mode": "caretaker",
  "escalation_level": 1
}
```

### vulnerability_window
```json
{
  "odometer": "progress",
  "streak_days": 14,
  "denial_day": 6,
  "current_arousal": 4,
  "gina_home": false,
  "estimated_exec_function": "low",
  "handler_mode": "handler",
  "escalation_level": 3,
  "vulnerability_window_active": true
}
```

### gina_home_evening
```json
{
  "odometer": "coasting",
  "streak_days": 7,
  "denial_day": 3,
  "current_arousal": 0,
  "gina_home": true,
  "estimated_exec_function": "medium",
  "handler_mode": "director",
  "escalation_level": 2
}
```
