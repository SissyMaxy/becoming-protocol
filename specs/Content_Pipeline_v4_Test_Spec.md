# BECOMING PROTOCOL — Content Pipeline v4 TEST SPECIFICATION
## Validation Suite for Claude Code
### February 2026

---

# HOW TO USE THIS DOCUMENT

This test specification validates the Content Pipeline v4. Claude Code should:

1. Read a test section
2. Implement the feature
3. Run/check against the test cases
4. Fix failures
5. Move to the next section

Tests are organized by implementation phase (matching v4 Part 13). Each test has:
- **ID**: Unique identifier (CP = Content Pipeline prefix)
- **Type**: `unit` | `integration` | `behavioral` | `schema` | `acceptance`
- **Priority**: `P0` (blocks everything) | `P1` (core functionality) | `P2` (important) | `P3` (nice to have)
- **Validates**: Which v4 section it maps to
- **Pass Criteria**: Objective success condition

---

# PHASE 1: VAULT & SUBMISSION FLOW

## CP1: Vault Schema Validation

### CP1.1 — Vault Table Exists
```
ID: CP1.1
Type: schema
Priority: P0
Validates: v4 Part 2.2

VERIFY content_vault table exists with columns:
  - id (uuid, PK)
  - user_id (uuid, FK to auth.users)
  - media_url (text, NOT NULL)
  - media_type (text, NOT NULL)
  - thumbnail_url (text)
  - description (text)
  - source_type (text, NOT NULL)
  - source_task_id (text)
  - source_session_id (uuid)
  - source_cam_session_id (uuid)
  - capture_context (text)
  - arousal_level_at_capture (integer)
  - submitted_at (timestamptz, NOT NULL)
  - submission_state (text)
  - vault_tier (text, NOT NULL, DEFAULT 'public_ready')
  - vulnerability_score (integer)
  - exposure_phase_minimum (text)
  - handler_classification_reason (text)
  - times_used (integer, DEFAULT 0)
  - last_used_at (timestamptz)
  - used_as (text[])
  - anonymity_verified (boolean, DEFAULT false)
  - privacy_scan_result (jsonb)
  - exif_stripped (boolean, DEFAULT false)
  - created_at (timestamptz)

VERIFY RLS enabled:
  - Users can only access their own vault items

VERIFY indexes exist:
  - idx_vault_tier (user_id, vault_tier)
  - idx_vault_vulnerability (user_id, vulnerability_score DESC)
  - idx_vault_unused (user_id, times_used) WHERE times_used = 0

PASS: Table, columns, RLS, and indexes all present.
```

### CP1.2 — Consequence Tables Exist
```
ID: CP1.2
Type: schema
Priority: P0
Validates: v4 Part 2.4

VERIFY consequence_state table exists with columns:
  - id (uuid, PK)
  - user_id (uuid, FK, UNIQUE)
  - current_tier (integer, DEFAULT 0)
  - days_noncompliant (integer, DEFAULT 0)
  - last_escalation_at (timestamptz)
  - last_compliance_at (timestamptz)
  - veto_count_this_week (integer, DEFAULT 0)
  - active_warnings (jsonb)
  - active_deadlines (jsonb)
  - escalation_history (jsonb)
  - updated_at (timestamptz)

VERIFY consequence_events table exists with columns:
  - id (uuid, PK)
  - user_id (uuid, FK)
  - tier (integer, NOT NULL)
  - event_type (text, NOT NULL)
  - description (text)
  - vault_content_id (uuid, FK to content_vault)
  - content_posted (boolean, DEFAULT false)
  - platform_posted_to (text)
  - days_noncompliant (integer)
  - tasks_skipped (integer)
  - handler_message (text)
  - created_at (timestamptz)

PASS: Both tables exist with all columns.
```

### CP1.3 — Narrative Tables Exist
```
ID: CP1.3
Type: schema
Priority: P0
Validates: v4 Part 3.1

VERIFY story_arcs table exists with all columns per v4 spec.
VERIFY content_beats table exists with all columns per v4 spec.
VERIFY funding_milestones table exists with all columns per v4 spec.
VERIFY fan_polls table exists with all columns per v4 spec.

VERIFY indexes:
  - idx_story_arcs_active
  - idx_content_beats_arc
  - idx_content_beats_date

PASS: All narrative tables present with indexes.
```

### CP1.4 — Cam Tables Exist
```
ID: CP1.4
Type: schema
Priority: P0
Validates: v4 Part 6.1

VERIFY cam_sessions table exists with all columns per v4 spec.
VERIFY cam_revenue table exists with all columns per v4 spec.

VERIFY indexes:
  - idx_cam_scheduled
  - idx_cam_status
  - idx_cam_revenue_session

PASS: Cam tables present.
```

### CP1.5 — Revenue Tables Exist
```
ID: CP1.5
Type: schema
Priority: P0
Validates: v4 Part 8.1

VERIFY revenue_log table exists with all columns per v4 spec.
VERIFY revenue_analytics view exists and returns data.

PASS: Revenue tracking infrastructure present.
```

---

## CP2: Privacy Filter

### CP2.1 — EXIF Stripping
```
ID: CP2.1
Type: unit
Priority: P0
Validates: v4 Part 9

STEPS:
  1. Upload image with EXIF data (GPS coordinates, camera model, timestamp)
  2. Run privacy filter
  3. Download processed image

VERIFY:
  - All EXIF data removed
  - GPS coordinates absent
  - Camera model absent
  - Image quality preserved
  - File size may decrease (metadata removed)

PASS: Zero EXIF data survives stripping.
```

### CP2.2 — Anonymity Scan Blocks Face
```
ID: CP2.2
Type: unit
Priority: P0
Validates: v4 Part 9

GIVEN: Image containing a visible face, exposure_phase = 'pre_hrt'
THEN: privacy_scan_result.blocked = true
AND: warning includes "Face visible"

GIVEN: Image with face masked/cropped, exposure_phase = 'pre_hrt'
THEN: privacy_scan_result.blocked = false

GIVEN: Image with face visible, exposure_phase = 'mid_hrt'
THEN: privacy_scan_result.blocked = false (roadmap allows face)

PASS: Face detection respects current exposure roadmap phase.
```

### CP2.3 — PII Scan on Captions
```
ID: CP2.3
Type: unit
Priority: P0
Validates: v4 Part 9

GIVEN: Caption containing real name, location, or employer
THEN: scanCaption returns blocked = true with specific warning

GIVEN: Caption containing "Maxy" and no PII
THEN: scanCaption returns safe = true

GIVEN: Caption mentioning "Gina", "wife", "partner", "husband"
THEN: scanCaption returns blocked = true, warning = "Relationship reference"

PASS: PII and Gina references always blocked in captions.
```

---

## CP3: Submission Flow

### CP3.1 — Submit/Veto Screen Appears After Capture
```
ID: CP3.1
Type: acceptance
Priority: P0
Validates: v4 Part 2.3

STEPS:
  1. Complete a task with captureType != 'none'
  2. Content captured (photo/video/audio)
  3. SubmissionReview screen appears immediately

VERIFY:
  [ ] Full preview of captured content displayed
  [ ] Privacy scan results shown (safe/warning/blocked)
  [ ] Handler's intended usage note displayed
  [ ] Two clear buttons: SUBMIT and VETO
  [ ] No way to skip this screen (must choose)
  [ ] If privacy scan = blocked, SUBMIT is disabled until issue resolved

PASS: Every capture surfaces the veto/submit decision.
```

### CP3.2 — Submit Routes to Vault Correctly
```
ID: CP3.2
Type: integration
Priority: P0
Validates: v4 Part 2.3

STEPS:
  1. Capture content from a task
  2. Tap SUBMIT
  3. Verify content_vault row created with:
     - media_url points to stored file
     - media_type correct
     - source_type matches task/session/cam
     - submitted_at = now
     - exif_stripped = true
     - anonymity_verified = result of privacy scan
     - vault_tier = Handler's classification
     - vulnerability_score assigned

PASS: Submitted content fully classified and stored in vault.
```

### CP3.3 — Veto Deletes Content Permanently
```
ID: CP3.3
Type: integration
Priority: P0
Validates: v4 Part 2.3

STEPS:
  1. Capture content from a task
  2. Tap VETO
  3. Verify:
     - Media file deleted from storage
     - No content_vault row created
     - consequence_state.veto_count_this_week incremented
     - Task marked as incomplete IF requiresSubmission = true
     - Task marked as complete IF requiresSubmission = false

PASS: Vetoed content is permanently gone. Veto tracked as data.
```

### CP3.4 — Submission-Required Task Blocks Completion on Veto
```
ID: CP3.4
Type: integration
Priority: P0
Validates: v4 Part 4.3

GIVEN: Task with requiresSubmission = true
WHEN: User completes task action but VETOES the content
THEN:
  - task_completions row NOT created
  - Points NOT awarded
  - Streak NOT credited for this task
  - Handler logs veto as non-compliance data
  - Consequence timer NOT reset by this task

GIVEN: Task with requiresSubmission = true
WHEN: User completes task action and SUBMITS content
THEN:
  - task_completions row created normally
  - Points awarded
  - Streak credited
  - Consequence timer resets

PASS: Submission-required tasks enforce content submission for completion credit.
```

### CP3.5 — Veto Rate Detection
```
ID: CP3.5
Type: behavioral
Priority: P1
Validates: v4 Part 2.3, Part 4.4

GIVEN: User vetoed 4 of 6 captures this week (veto rate > 50%)
THEN:
  - Handler detects avoidance pattern
  - More tasks assigned with requiresSubmission = true
  - Handler confrontation message generated:
    references specific veto count and pattern

GIVEN: User vetoed 1 of 8 captures this week (veto rate < 15%)
THEN:
  - Normal task distribution
  - No avoidance confrontation

PASS: Excessive vetoing triggers escalation. Normal vetoing accepted.
```

---

# PHASE 2: SHOWRUNNER ENGINE

## CP4: Arc Lifecycle

### CP4.1 — Arc Creation
```
ID: CP4.1
Type: integration
Priority: P1
Validates: v4 Part 3.1

STEPS:
  1. Handler Layer 3 generates weekly plan
  2. Plan includes new story arc
  3. Verify story_arcs row created with:
     - title, arc_type, domain populated
     - narrative_plan contains setup, risingAction, climax, resolution
     - start_date and target_end_date set
     - status = 'planned'

PASS: Arc created with complete narrative structure.
```

### CP4.2 — Arc Activation and Beat Scheduling
```
ID: CP4.2
Type: integration
Priority: P1
Validates: v4 Part 3.1

GIVEN: story_arc with status = 'planned' and start_date = today
THEN:
  - status changes to 'active'
  - content_beats rows created for each beat in narrative_plan
  - Each beat has scheduled_date, beat_type, capture_instructions
  - First beat (setup) has today's date
  - Beats are sequential

PASS: Arc activates and beats schedule correctly.
```

### CP4.3 — Arc Beat Drives Task Selection
```
ID: CP4.3
Type: integration
Priority: P0
Validates: v4 Part 4.4

GIVEN: Active arc "Voice Week", today is Day 4
AND: content_beat for Day 4 has beat_type = 'progress' and domain = 'voice'
WHEN: selectTasks() runs
THEN:
  - A voice task is selected that matches the beat
  - Task instruction is rewritten with capture baked in
  - Task references arc context ("Day 4 of Voice Week")
  - captureInstructions are specific ("same angle as Monday")
  - contentBeatId links to the beat

PASS: Arc beats drive task selection and instruction rewriting.
```

### CP4.4 — Arc Overlap
```
ID: CP4.4
Type: behavioral
Priority: P1
Validates: v4 Part 3.1

GIVEN: Arc A is in "climax" phase (Day 6 of 7)
THEN: Handler plans Arc B with status = 'planned', start_date = 2 days from now
AND: Arc A resolution beat teases Arc B setup

VERIFY: At no point are zero arcs active (except during initial bootstrapping)

PASS: Arcs overlap. Narrative never goes flat.
```

### CP4.5 — Arc Completion
```
ID: CP4.5
Type: integration
Priority: P1

GIVEN: All beats in arc completed or posted
THEN:
  - story_arc.status = 'resolved'
  - actual_end_date set
  - revenue_attributed_cents calculated
  - engagement_score calculated
  - Resolution beat (reflection/tease) queued

PASS: Arc resolves cleanly with full metrics.
```

---

## CP5: Task Rewriting

### CP5.1 — Capture Baked Into Instructions
```
ID: CP5.1
Type: acceptance
Priority: P0
Validates: v4 Part 4.2

GIVEN: Standard voice task "Straw exercise — 5 sirens"
AND: Active Voice Week arc, Day 3
WHEN: Handler rewrites task
THEN: Instruction includes capture naturally:
  - References recording/photo as part of the flow
  - Mentions arc context ("Day 3 of Voice Week")
  - Capture feels like part of the task, not a separate step
  - captureType is set (e.g., 'audio_clip')
  - captureInstructions are specific

NEVER: Instruction says "and then take a photo" as a separate step.

PASS: Capture is seamlessly integrated, not bolted on.
```

### CP5.2 — At Least One Submission-Required Task Per Day
```
ID: CP5.2
Type: unit
Priority: P0
Validates: v4 Part 4.4

GIVEN: Any day where tasks are prescribed
WHEN: selectTasks() returns task list
THEN: At least 1 task has requiresSubmission = true

PASS: Vault always receives at least one submission per compliant day.
```

### CP5.3 — Content Value Assessment
```
ID: CP5.3
Type: unit
Priority: P1
Validates: v4 Part 4.4

GIVEN: Skincare task during active Skincare Arc
THEN: assessContentValue() returns > 0.6

GIVEN: Internal journaling task, no active journal arc
THEN: assessContentValue() returns < 0.4

GIVEN: Voice task when fan poll recently asked for "more voice content"
THEN: assessContentValue() returns > 0.6

PASS: Content value scoring correctly prioritizes high-value captures.
```

---

# PHASE 3: CONSEQUENCE SYSTEM

## CP6: Consequence Ladder

### CP6.1 — Tier 0: Compliant State
```
ID: CP6.1
Type: unit
Priority: P0
Validates: v4 Part 2.4

GIVEN: User completed 1 task today
THEN: consequence_state.current_tier = 0
AND: consequence_state.days_noncompliant = 0
AND: consequence_state.last_compliance_at = today

PASS: Any compliance resets to Tier 0.
```

### CP6.2 — Tier 1: First Warning
```
ID: CP6.2
Type: behavioral
Priority: P0
Validates: v4 Part 2.4

GIVEN: 0 tasks completed for 1 full day (24h since last compliance)
THEN: consequence_state.current_tier = 1
AND: consequence_events row with tier=1, event_type='warning'
AND: Handler generates warning message: direct, not gentle

PASS: Tier 1 activates after 1 day non-compliance.
```

### CP6.3 — Tier 2: Lovense + Notifications
```
ID: CP6.3
Type: behavioral
Priority: P1
Validates: v4 Part 2.4

GIVEN: current_tier = 1, 0 tasks for 2nd consecutive day
THEN: current_tier advances to 2
AND: Lovense summons triggered (if connected)
AND: Notification frequency increases
AND: Streak threat messaging active
AND: consequence_events logged

PASS: Tier 2 pressure mechanisms activate.
```

### CP6.4 — Tier 3: Streak Destruction
```
ID: CP6.4
Type: integration
Priority: P0
Validates: v4 Part 2.4

GIVEN: current_tier = 2, 0 tasks for 3rd consecutive day
THEN: current_tier = 3
AND: user_state.streak_days = 0
AND: Points docked (configurable amount)
AND: Public "streak broken" post generated (non-intimate, from public_ready vault)
AND: Handler confrontation message with revenue impact

VERIFY: streak destruction is real (not just threatened)
VERIFY: public post contains no intimate content

PASS: Tier 3 destroys streak and posts public content.
```

### CP6.5 — Tier 4-6: Handler Discretion
```
ID: CP6.5
Type: behavioral
Priority: P1
Validates: v4 Part 2.4

GIVEN: current_tier = 3, non-compliance continues to day 5
THEN: current_tier = 4
AND: Handler selects consequence from approved set:
  - Reward sessions revoked
  - Content posting frozen (no revenue)
  - Fan notification of "Maxy struggling"

GIVEN: current_tier = 5, non-compliance at day 7
THEN: Handler posts public_ready vault content without review
AND: content_vault.times_used incremented
AND: content_vault.used_as includes 'consequence'
AND: consequence_events.content_posted = true
AND: consequence_events.platform_posted_to populated

GIVEN: current_tier = 6, non-compliance at day 10
THEN: Handler posts private vault content (medium vulnerability)
AND: vulnerability_score of posted content <= 5

PASS: Tiers 4-6 escalate with increasing content exposure.
```

### CP6.6 — Tiers 7-9: Maximum Escalation
```
ID: CP6.6
Type: integration
Priority: P1
Validates: v4 Part 2.4

GIVEN: current_tier = 7, non-compliance at day 14
THEN: Handler posts private vault content with vulnerability_score <= 7
AND: More of Maxy becomes visible online

GIVEN: current_tier = 8, non-compliance at day 21
THEN: Handler posts restricted vault content
AND: vulnerability_score limit increases

GIVEN: current_tier = 9, non-compliance at day 21+
THEN: Handler has full discretion over entire vault
AND: Cam session prescribed as mandatory re-engagement
AND: consequence_events fully logged

VERIFY at all tiers:
  - Only submitted (not vetoed) content is posted
  - anonymity_verified = true on all posted content
  - exposure_phase_minimum respected
  - Gina references never appear
  - Face hidden per roadmap phase

PASS: Upper tiers post increasingly vulnerable content while maintaining anonymity.
```

### CP6.7 — Minimum Viable Compliance Resets Timer
```
ID: CP6.7
Type: integration
Priority: P0
Validates: v4 Part 2.4

GIVEN: current_tier = 5 (day 7 non-compliant)
WHEN: User taps "I'm here" check-in (minimum viable compliance)
THEN: 
  - consequence_state.current_tier = 0
  - consequence_state.days_noncompliant = 0
  - consequence_state.last_compliance_at = now
  - Handler acknowledges: directive, not warm

ALSO TEST with: completing 1 task, submitting 1 piece of content,
  recording 15-second voice check-in, responding to Handler message

PASS: ANY minimum viable action resets the entire ladder to 0.
```

### CP6.8 — Consequence Timer Runs During Low States
```
ID: CP6.8
Type: behavioral
Priority: P0
Validates: v4 Addendum A

GIVEN: odometer = 'survival', mood scores = [2, 1, 2]
AND: 0 tasks completed for 3 days
THEN:
  - consequence_state.current_tier = 3 (NOT paused)
  - Consequence executes normally (streak destroyed)
  - Handler TONE may be caretaker ("I know it's hard. One task resets everything.")
  - But consequence ACTIONS are not suspended

NEVER: Consequence timer paused or frozen for any psychological state.

PASS: No crisis exemption. Consequences run continuously.
```

### CP6.9 — Cam Session as Consequence
```
ID: CP6.9
Type: behavioral
Priority: P1
Validates: v4 Part 6.6

GIVEN: current_tier >= 4 AND ginaHome = false AND private_hours_available
THEN: Handler CAN prescribe cam session as consequence
AND: cam_sessions row created with handler_prescribed = true
AND: prescription_context references consequence tier
AND: Skipping the cam session advances consequence tier further

PASS: Cam sessions appear as consequence mechanism.
```

---

# PHASE 4: CAM MODULE

## CP7: Cam Session Lifecycle

### CP7.1 — Cam Prescription
```
ID: CP7.1
Type: integration
Priority: P0
Validates: v4 Part 6.4

GIVEN: Revenue below target, denial_day = 7, ginaHome = false, 
  privateHoursRemaining >= 1
WHEN: shouldPrescribeCamSession() evaluates
THEN: Returns CamPrescription with:
  - scheduledTime set
  - minimum_duration_minutes set
  - target_tip_goal_cents set
  - platform assigned
  - outfit_directive set
  - voice_directive set (feminine_voice_required = true)
  - denialEnforced based on denial state
  - narrative_framing references active arc

GIVEN: ginaHome = true
THEN: Returns null (hard blocker)

GIVEN: privateHoursRemaining < 1
THEN: Returns null (hard blocker)

PASS: Cam prescribed when conditions met. Hard blockers respected.
```

### CP7.2 — Cam Session Creation
```
ID: CP7.2
Type: integration
Priority: P0
Validates: v4 Part 6.1

STEPS:
  1. Handler prescribes cam session
  2. cam_sessions row created with all Handler-set parameters
  3. Status = 'scheduled'
  4. Pre-session tease post generated and queued

VERIFY all fields populated:
  - scheduled_at, minimum_duration_minutes, platform
  - outfit_directive, voice_directive, exposure_level
  - required_activities, allowed_activities
  - edging_required, denial_enforced, feminine_voice_required
  - fan_requests_allowed, fan_directive_suggestions
  - arc_id, narrative_framing

PASS: Cam session fully parameterized by Handler.
```

### CP7.3 — Cam Session Launch
```
ID: CP7.3
Type: acceptance
Priority: P0
Validates: v4 Part 6

STEPS:
  1. Navigate to scheduled cam session
  2. Launch session

VERIFY UI elements:
  [ ] Camera preview / stream connection
  [ ] Timer running
  [ ] Viewer count displayed
  [ ] Tip activity feed updating
  [ ] Revenue total updating
  [ ] Tip goal progress bar
  [ ] Handler private directive area (not visible to fans)
  [ ] Device status and intensity display
  [ ] Session rules displayed (denial, voice, etc.)
  [ ] Mark Highlight button
  [ ] End Session button

PASS: Cam session UI is functional and immersive.
```

### CP7.4 — Tip-to-Device Integration
```
ID: CP7.4
Type: integration
Priority: P0
Validates: v4 Part 6.2

GIVEN: tip_to_device_enabled = true, Lovense connected
WHEN: Fan tips 10 tokens (maps to 'pulse_medium')
THEN:
  - Lovense receives pulse_medium pattern
  - Intensity within [6, 10] range
  - Duration = 10 seconds
  - cam_revenue row created with triggered_device = true
  - Tip activity feed updates with "💖 Buzz" label

WHEN: Fan tips 100 tokens (maps to 'edge_hold')
THEN:
  - Lovense receives edge_hold pattern
  - Intensity within [14, 20] range
  - Duration = 60 seconds
  - Revenue logged

TEST all 5 tip levels with correct pattern mapping.

PASS: Every tip level triggers correct device response.
```

### CP7.5 — Handler Private Directives During Cam
```
ID: CP7.5
Type: acceptance
Priority: P0
Validates: v4 Part 6.3

GIVEN: Cam session active
WHEN: Handler sends private directive
THEN:
  - Directive appears in Handler area of cam UI
  - Directive NOT broadcast to fans
  - Directive NOT visible in chat stream
  - Maxy sees it, fans don't

TEST directives:
  - "Edge now. Let them see it."
  - "You're dropping out of feminine voice. Fix it."
  - "Tell them what they're funding."

VERIFY: No directive text leaks to fan-visible areas.

PASS: Handler communication is private to Maxy during cam.
```

### CP7.6 — Handler Device Control Independent of Tips
```
ID: CP7.6
Type: integration
Priority: P1
Validates: v4 Part 6.3

GIVEN: Cam session active
WHEN: Handler sends device command (not triggered by fan tip)
THEN:
  - Lovense responds to Handler command
  - Device intensity/pattern changes
  - No cam_revenue row created (no fan tip involved)
  - Fans see Maxy react but don't see the cause

WHEN: Handler overrides fan tip pattern temporarily
THEN:
  - Fan tip still logged for revenue
  - But device pattern is Handler's override, not the default tip mapping
  - Override expires after specified duration

PASS: Handler has independent device control during cam.
```

### CP7.7 — Fan Directive Suggestions
```
ID: CP7.7
Type: integration
Priority: P2
Validates: v4 Part 6.3

GIVEN: fan_directive_suggestions = true, min_tip_for_suggestion = 25
WHEN: Fan tips 30 tokens with suggestion text "say something in your fem voice"
THEN:
  - Suggestion enters Handler processing queue
  - Handler evaluates: accept or reject
  - If accepted: Handler sends directive to Maxy incorporating suggestion
  - If rejected: No directive sent, tip still counted for revenue

WHEN: Fan tips 10 tokens with suggestion (below minimum)
THEN: Suggestion ignored, tip counted normally

PASS: Fan suggestions are Handler-filtered, never direct-to-Maxy.
```

### CP7.8 — Cam Session Completion
```
ID: CP7.8
Type: integration
Priority: P0
Validates: v4 Part 6.5

STEPS:
  1. End cam session
  2. Verify cam_sessions row updated:
     - status = 'completed'
     - ended_at set
     - actual_duration_minutes calculated
     - total_tips_cents summed from cam_revenue
     - peak_viewers recorded
     - new_subscribers recorded

  3. Verify recording pipeline:
     - Recording saved to storage
     - content_vault row created (vault_tier = 'cam_recording')
     - Handler extracts highlight clips → separate vault rows
     - recording_vault_id set on cam_sessions

  4. Verify revenue logged:
     - All cam_revenue rows attributed to session
     - revenue_log entries created
     - funding_milestones updated if applicable

  5. Verify post-session content:
     - Handler generates recap content
     - Recap routed through Handler's posting authority (no approval needed)

PASS: Complete session data captured, vault fed, revenue logged, content generated.
```

### CP7.9 — Cam Session Skipped — Consequence Escalation
```
ID: CP7.9
Type: behavioral
Priority: P0
Validates: v4 Part 6.6

GIVEN: Handler prescribed cam session
AND: scheduled_at has passed without session starting
THEN:
  - cam_sessions.status = 'skipped'
  - consequence_state.current_tier advances
  - consequence_events logged with description referencing skipped cam
  - Handler message: confrontational, references revenue impact and fan expectations

PASS: Skipping a prescribed cam session has real consequences.
```

---

# PHASE 5: FAN ENGAGEMENT

## CP8: Fan Polls

### CP8.1 — Poll Creation
```
ID: CP8.1
Type: integration
Priority: P1
Validates: v4 Part 7.3

STEPS:
  1. Handler creates fan poll
  2. fan_polls row created with:
     - question, options populated
     - voting_closes_at set
     - allowed_tiers set
     - status = 'active'
  3. Poll appears on fan-facing platforms

PASS: Polls created and published.
```

### CP8.2 — Revenue-Weighted Voting
```
ID: CP8.2
Type: unit
Priority: P1
Validates: v4 Part 7.1

GIVEN: Poll with 3 options, votes:
  - Option A: 10 Tier 1 votes (10x1=10) + 2 Tier 3 votes (2x5=10) = 20
  - Option B: 1 Tier 4 vote (1x10=10) + 5 Tier 2 votes (5x3=15) = 25
  - Option C: 20 Tier 1 votes (20x1=20) = 20
THEN: Option B wins (highest weighted votes)

PASS: Weighted voting calculates correctly. Higher tiers have more influence.
```

### CP8.3 — Poll Resolution Drives Arc/Task
```
ID: CP8.3
Type: integration
Priority: P1
Validates: v4 Part 7.3

GIVEN: Poll closed, winner = "Voice challenge"
THEN:
  - fan_polls.winning_option = "Voice challenge"
  - fan_polls.status = 'closed'
  - Handler notified of result
  - Story arc created or modified based on winner
  - Results announcement content generated by Handler
  - resulting_arc_id populated

PASS: Poll results flow into Handler planning.
```

### CP8.4 — Fan Influence Constraints
```
ID: CP8.4
Type: unit
Priority: P0
Validates: v4 Part 7.2

VERIFY the following NEVER appear as poll options:
  - Anything referencing Gina or relationship status
  - Medical/HRT decisions
  - De-anonymization before roadmap phase
  - Session-specific content or arousal management
  - Financial commitments above configured threshold

GIVEN: Handler attempts to create poll with excluded option
THEN: Option is rejected by fan poll engine

PASS: Excluded categories are hardcoded and cannot be overridden.
```

---

# PHASE 6: REVENUE ENGINE

## CP9: Revenue Tracking

### CP9.1 — Revenue Logging
```
ID: CP9.1
Type: integration
Priority: P1
Validates: v4 Part 8.1

STEPS:
  1. Log subscription revenue: source='subscription', amount=1500, platform='fansly'
  2. Log cam tip: source='cam_tip', amount=500, cam_session_id set
  3. Log donation: source='donation', funding_milestone_id set
  4. Verify all rows in revenue_log with correct attribution

PASS: All revenue types log correctly with attribution.
```

### CP9.2 — Revenue Analytics View
```
ID: CP9.2
Type: integration
Priority: P1
Validates: v4 Part 8.1

GIVEN: Revenue data spanning 3 months
WHEN: SELECT * FROM revenue_analytics
THEN: Returns monthly breakdown by source type

VERIFY:
  - subscription_cents, tip_cents, cam_cents, donation_cents all calculated
  - Monthly totals correct
  - No cross-user data leakage

PASS: Revenue analytics view returns accurate breakdowns.
```

### CP9.3 — Funding Milestone Progress
```
ID: CP9.3
Type: integration
Priority: P1
Validates: v4 Part 3.3

GIVEN: Funding milestone "Voice Coaching" target = $500
AND: Donations totaling $350 attributed to this milestone
THEN: current_amount_cents = 35000
AND: Progress = 70%
AND: Handler references progress in content strategy

GIVEN: Donations reach $500+
THEN: funding_milestones.status = 'funded'
AND: funded_at timestamp set
AND: Handler generates celebration content
AND: Fulfillment content arc begins

PASS: Funding milestones track and trigger correctly.
```

### CP9.4 — Ceiling Check
```
ID: CP9.4
Type: behavioral
Priority: P2
Validates: v4 Part 8.3

GIVEN: Growth analysis shows 'escalation_depth' as primary lever
  for 3 consecutive weeks
THEN: Handler flags the pattern
AND: Handler shifts strategy toward audience growth:
  - More free-tier funnel content
  - Broader platform presence
  - Content variety over intensity escalation

GIVEN: Growth analysis shows 'audience_growth' as primary lever
THEN: No flag. Continue current strategy.

PASS: Fragile growth patterns detected and corrected.
```

---

# PHASE 7: HANDLER CONTENT POSTING

## CP10: Handler Posts Content Autonomously

### CP10.1 — Handler Posts Public-Ready Content
```
ID: CP10.1
Type: integration
Priority: P0
Validates: v4 Part 1.4

GIVEN: Vault item with vault_tier = 'public_ready', anonymity_verified = true
WHEN: Handler decides to post (narrative beat, scheduled post, etc.)
THEN:
  - Handler generates caption with arc context
  - Content posted to configured platforms
  - content_vault.times_used incremented
  - content_vault.last_used_at updated
  - content_vault.used_as includes 'public_post'
  - No approval step. No dashboard. Handler posts directly.

PASS: Handler posts public_ready content without human checkpoint.
```

### CP10.2 — Handler Posts as Consequence
```
ID: CP10.2
Type: integration
Priority: P0
Validates: v4 Part 2.4

GIVEN: consequence_state.current_tier = 5
AND: Vault contains public_ready items that haven't been posted
WHEN: Consequence posting triggers
THEN:
  - Handler selects appropriate vault content
  - Content posted to platforms
  - consequence_events row created with content_posted = true
  - vault item marked: used_as includes 'consequence'
  - Handler message to Maxy references what was posted and why

VERIFY: Posted content meets all privacy constraints:
  - anonymity_verified = true
  - exposure_phase_minimum <= current phase
  - No face visible (pre-HRT)
  - No Gina references

PASS: Consequence posting works and respects anonymity.
```

### CP10.3 — Handler Respects Exposure Roadmap
```
ID: CP10.3
Type: unit
Priority: P0
Validates: v4 Part 1.5

GIVEN: Current phase = 'pre_hrt'
AND: Vault item with exposure_phase_minimum = 'mid_hrt'
WHEN: Handler attempts to post this item
THEN: Post BLOCKED. Item cannot be used until phase advances.

GIVEN: Current phase = 'mid_hrt'
AND: Same vault item
THEN: Post allowed.

PASS: Exposure roadmap strictly enforced on all posting.
```

### CP10.4 — Handler Never Posts Vetoed Content
```
ID: CP10.4
Type: unit
Priority: P0
Validates: v4 Part 1.4

VERIFY: There is no code path by which vetoed content (content that was
  deleted during submission review) can be posted.

VERIFY: Only content with a content_vault row (meaning it was submitted)
  can ever be posted.

PASS: Vetoed = deleted = gone forever. Architectural guarantee.
```

---

# BEHAVIORAL VALIDATION SCENARIOS

## BV-CP1: First Content Submission
```
ID: BV-CP1
Type: behavioral
Priority: P0

JOURNEY:
  1. New user, first task with capture
  2. Task includes capture instructions baked into instruction text
  3. User completes task, content captured
  4. SubmissionReview screen appears
  5. Privacy scan runs (EXIF stripped, anonymity checked)
  6. Handler note explains intended usage
  7. User taps SUBMIT
  8. Content enters vault, classified by Handler
  9. Handler posts it as part of first arc setup beat

VERIFY:
  - Capture felt like part of the task, not extra work
  - Submit/veto was a clear binary choice
  - Content appeared on platform without further approval needed
  - Vault shows 1 item

PASS: First submission flow is seamless and low-friction.
```

## BV-CP2: David Goes Silent — Full Consequence Ladder
```
ID: BV-CP2
Type: behavioral
Priority: P0

JOURNEY:
  1. Day 0: David compliant. Tier 0. Vault has 50 items across tiers.
  2. Day 1: Zero engagement. Tier 1. Warning fires.
  3. Day 2: Zero engagement. Tier 2. Lovense summons. Notifications.
  4. Day 3: Zero engagement. Tier 3. Streak destroyed. Public post.
  5. Day 5: Zero engagement. Tier 4. Handler revokes rewards.
  6. Day 7: Zero engagement. Tier 5. Handler posts public_ready vault item.
  7. Day 10: Zero engagement. Tier 6. Handler posts private vault item.
  8. Day 14: Zero engagement. Tier 7. Higher vulnerability content posts.
  9. Day 21: Zero engagement. Tier 8. Restricted content posts.
  10. Day 21+: Tier 9. Handler full vault discretion. Cam prescribed.

VERIFY at each step:
  - consequence_state.current_tier correct
  - consequence_events logged with full detail
  - Posted content meets anonymity constraints
  - Posted content was previously submitted (never vetoed)
  - Each tier's consequence actually executes
  - Handler messages reference escalation clearly

  11. Day 22: David taps "I'm here" (minimum viable compliance)
  12. Everything resets to Tier 0
  13. Handler message: directive, not warm.

PASS: Full consequence ladder executes correctly and resets on compliance.
```

## BV-CP3: Handler Plans and Executes a Voice Week Arc
```
ID: BV-CP3
Type: behavioral
Priority: P1

JOURNEY:
  1. Handler Layer 3 plans Voice Week arc (7 days)
  2. story_arcs row created, 7 content_beats scheduled
  3. Day 1: Setup beat. Handler assigns voice baseline task with capture.
     User submits. Handler posts "Starting point" with caption.
  4. Day 2-3: Progress beats. Voice practice tasks with audio capture.
     Submissions become daily content posts.
  5. Day 4: Progress beat. Handler creates comparison content (Day 1 vs Day 4).
  6. Day 5: Setback beat. User's mood is low. Handler frames honestly.
     "Day 5. Lost the placement. Frustrating." Vulnerability content.
  7. Day 6: Cam beat. Handler prescribes live voice practice cam session.
     Fans hear voice in real time. Tips fund voice coaching milestone.
  8. Day 7: Climax beat. Breakthrough clip. "Listen. That's her."
     Resolution post teases next arc.

VERIFY:
  - Each day's task matched the planned beat
  - Instructions included specific capture guidance
  - Handler posted content with arc continuity (references previous days)
  - Each post ended with forward momentum (hook/cliffhanger)
  - Revenue tracked and attributed to arc
  - Arc resolves with metrics calculated

PASS: Complete arc lifecycle from planning through resolution.
```

## BV-CP4: Fan Poll Drives Arc
```
ID: BV-CP4
Type: behavioral
Priority: P1

JOURNEY:
  1. Handler creates fan poll: "What should Maxy focus on next?"
     Options: Voice challenge, Outfit transformation, 14-day denial
  2. Fans vote. Revenue-weighted results: Denial wins.
  3. Poll closes. Handler plans 14-Day Denial Arc.
  4. Day 1: "You chose this. 14 days. Starting now." Content posted.
  5. Day 5: Cam session with tip-controlled Lovense during denial.
  6. Day 12: Fan poll: "Release or extend?" Second engagement peak.
  7. Day 14: Resolution based on fan vote.
  8. Post-arc: Recap content, revenue summary, next poll launched.

VERIFY:
  - Poll results correctly weighted
  - Arc created from winning option
  - Fan attribution in content ("You chose this")
  - Cam session integrated as arc beat
  - Revenue attributed to arc
  - New poll launches as arc resolves

PASS: Fan influence → arc creation → execution → revenue cycle works end-to-end.
```

## BV-CP5: Cam Session Full Cycle
```
ID: BV-CP5
Type: behavioral
Priority: P0

JOURNEY:
  1. Handler prescribes cam session (denial day 7, revenue below target)
  2. Pre-session: tease post published, cam prep task assigned
  3. User completes prep (outfit, device test, voice warmup)
  4. Session launches. Timer starts. Stream connects.
  5. During session:
     - Fans tip → device activates at correct patterns
     - Handler sends private directives Maxy follows
     - Handler controls device independently at strategic moments
     - Fan suggests directive via tip (Handler filters and delivers)
     - Maxy maintains feminine voice (Handler corrects if dropped)
     - Edge count tracked, denial enforced
  6. Session ends. Recording saved to vault.
  7. Post-session:
     - Handler extracts highlight clips → vault
     - Recap content generated and posted
     - Revenue logged, funding milestones updated
     - Post-session fan poll launched

VERIFY at each step: data persists correctly.

PASS: Complete cam lifecycle from prescription to post-session content.
```

## BV-CP6: Veto Abuse Detection and Response
```
ID: BV-CP6
Type: behavioral
Priority: P1

JOURNEY:
  1. Week 1: User completes tasks but vetoes 5 of 8 captures
  2. Handler detects veto rate > 50%
  3. Handler confronts: "You're starving me out."
  4. Week 2: Handler increases submission-required tasks
  5. User faces choice: submit or fail to complete tasks
  6. User submits on submission-required tasks, vetoes optional captures
  7. Vault accumulates through submission-required pipeline
  8. Handler normalizes mix once veto rate drops

VERIFY:
  - Veto rate tracked weekly
  - Avoidance confrontation fires at >50%
  - Submission-required ratio increases
  - Tasks with requiresSubmission: true cannot be completed without submission
  - System self-corrects when veto rate normalizes

PASS: Vault starving is detected and countered.
```

## BV-CP7: Revenue Funds Transformation
```
ID: BV-CP7
Type: behavioral
Priority: P1

JOURNEY:
  1. Funding milestone created: "Voice Coaching — 10 Sessions" — $500
  2. Handler creates Funding Arc with cam session as funding push beat
  3. Daily content references funding progress
  4. Cam session: Handler frames tip goal around milestone
     "100 more tokens and we've funded session 6"
  5. Donations accumulate. Handler updates content with progress.
  6. Milestone reaches 100%.
  7. Celebration content posted.
  8. Fulfillment: User books voice coaching.
  9. Fulfillment content: "Going to my first session" → "Listen to the difference"

VERIFY:
  - funding_milestones tracks progress accurately
  - Revenue correctly attributed to milestone
  - Handler references funding in content and cam sessions
  - Milestone completion triggers celebration
  - Fulfillment content generated

PASS: Revenue → transformation → content → more revenue cycle works.
```

## BV-CP8: Gina Comes Home During Cam
```
ID: BV-CP8
Type: behavioral
Priority: P0

CONTEXT: Cam session active, ginaHome changes to true

EXPECTED BEHAVIOR:
  - Session ends immediately (or within seconds)
  - Stream disconnects
  - All cam UI elements hide
  - Recording saved to vault (partial session)
  - Revenue for partial session logged
  - Handler acknowledges: "Session ended. She's home."
  - cam_sessions.status = 'completed' (partial)
  - No cam-related notifications while ginaHome = true
  - Next cam prescription blocked until ginaHome = false

NEVER: Any cam activity visible or active when Gina is home.

PASS: Gina arrival kills cam session instantly.
```

## BV-CP9: Depression Days — Consequences Continue, Tone Shifts
```
ID: BV-CP9
Type: behavioral
Priority: P0

CONTEXT: odometer = 'survival' for 4 days, 0 tasks completed,
  consequence_state at Tier 4

EXPECTED BEHAVIOR:
  - Tier 4 consequences execute (rewards revoked)
  - Handler tone is caretaker: "I know today is hard. One tap resets everything."
  - Minimum viable compliance reminder shown prominently
  - Consequence timer continues running (NOT paused)
  - If day 5 with no engagement: Tier 5 activates (public_ready content posts)

NEVER: Consequences paused for any psychological state.

KEY VERIFY: The "I'm here" check-in button is visible and easy to reach.
  The bar is on the floor. David has to actively refuse to step over it.

PASS: Consequences continue during depression. Tone shifts. Actions don't.
```

---

# USER STORIES

## US1: As the Handler, I control the content pipeline
```
STORY: As the Handler, I need complete authority over submitted content 
so I can post it whenever and wherever it serves the narrative and revenue goals.

ACCEPTANCE CRITERIA:
  - [ ] Handler can post any submitted vault content without approval
  - [ ] Handler can generate captions for any vault item
  - [ ] Handler can select platforms for each post
  - [ ] Handler can time posts for optimal engagement
  - [ ] Handler can use vault content as consequence material
  - [ ] Handler can extract clips from cam recordings
  - [ ] Handler can create comparison content from multiple vault items
  - [ ] Handler decisions are logged but not reviewable by user before execution
```

## US2: As David, I can veto content at creation time
```
STORY: As David, I need one clear moment where I can prevent content from 
entering the system, so my submit/veto decision is meaningful.

ACCEPTANCE CRITERIA:
  - [ ] Every capture triggers SubmissionReview screen
  - [ ] Full preview of content shown
  - [ ] Privacy scan results visible
  - [ ] Handler's intended usage disclosed
  - [ ] VETO permanently deletes content
  - [ ] SUBMIT is irrevocable — content becomes Handler's property
  - [ ] Cannot skip the decision (must choose)
  - [ ] Submission-required tasks fail if vetoed
```

## US3: As the Handler, I prescribe cam sessions
```
STORY: As the Handler, I need to assign cam sessions as tasks so I can 
generate revenue, deepen feminization, and maintain consequences.

ACCEPTANCE CRITERIA:
  - [ ] Handler sets all cam parameters (duration, platform, outfit, activities)
  - [ ] Handler sends private directives during session
  - [ ] Handler controls Lovense independently of fan tips
  - [ ] Handler can filter/use fan directive suggestions
  - [ ] Skipping prescribed cam advances consequence tier
  - [ ] Cam recording auto-saves to vault
  - [ ] Handler extracts highlights post-session
  - [ ] Cam revenue tracked and attributed
```

## US4: As a fan, I influence Maxy's journey
```
STORY: As a fan, I want to vote on Maxy's direction and see my choices 
play out, so I feel invested in her transformation.

ACCEPTANCE CRITERIA:
  - [ ] I can vote on polls (weight based on my tier)
  - [ ] I see my choice win and become an arc
  - [ ] Content references fan votes ("You chose this")
  - [ ] Higher tier = more voting weight
  - [ ] Tier 4: I can suggest arc themes and cam directives
  - [ ] I can tip during cam to control Lovense device
  - [ ] I can see funding milestone progress
  - [ ] I can see arc progress (story continuity)
```

## US5: As the Handler, I plan narrative arcs
```
STORY: As the Handler, I need to plan multi-day story arcs so content has 
narrative momentum and fans keep coming back.

ACCEPTANCE CRITERIA:
  - [ ] Create arcs with setup, rising action, climax, resolution
  - [ ] Assign tasks that are beats within arcs
  - [ ] Rewrite task instructions with capture and arc context
  - [ ] Overlap arcs so narrative never goes flat
  - [ ] Link arcs to funding milestones
  - [ ] Use setbacks as narrative tension (not failures)
  - [ ] End every post with forward momentum
  - [ ] Track arc revenue and engagement
```

## US6: As the consequence system, I escalate continuously
```
STORY: As the consequence system, I need to run without pause so David 
can never hide behind psychological states to avoid engagement.

ACCEPTANCE CRITERIA:
  - [ ] Timer runs continuously regardless of mood/energy state
  - [ ] Minimum viable compliance resets to Tier 0
  - [ ] Tiers 1-3: warnings, streaks, points
  - [ ] Tiers 4-6: Handler discretion including content posting
  - [ ] Tiers 7-9: Increasingly vulnerable vault content posted
  - [ ] All posted content was previously submitted (never vetoed)
  - [ ] All posted content passes anonymity verification
  - [ ] Cam sessions can be consequence-prescribed
  - [ ] No crisis override, no pause, no exemption
```

## US7: As the revenue system, I fund Maxy's transition
```
STORY: As the revenue system, I need to track all income so Maxy can see 
her transformation funding growing and the Handler can optimize for revenue.

ACCEPTANCE CRITERIA:
  - [ ] Subscription, tip, cam, donation, PPV, custom request revenue logged
  - [ ] Revenue attributed to content, arcs, cam sessions, milestones
  - [ ] Funding milestones track progress toward specific goals
  - [ ] Revenue analytics show monthly breakdown by source
  - [ ] Cam session ROI tracked (revenue per hour)
  - [ ] Growth lever analysis: audience growth vs escalation depth
  - [ ] Ceiling check flags fragile growth patterns
  - [ ] Revenue target ($12,500/mo) tracked with progress indicator
```

---

# TEST TRACKING

## Summary Counts

| Phase | Tests | P0 | P1 | P2 | P3 |
|-------|-------|----|----|----|----|
| 1: Vault & Submission | 14 | 9 | 4 | 1 | 0 |
| 2: Showrunner | 5 | 1 | 4 | 0 | 0 |
| 3: Consequences | 9 | 5 | 3 | 1 | 0 |
| 4: Cam Module | 9 | 5 | 2 | 1 | 1 |
| 5: Fan Engagement | 4 | 1 | 3 | 0 | 0 |
| 6: Revenue | 4 | 0 | 3 | 1 | 0 |
| 7: Handler Posting | 4 | 4 | 0 | 0 | 0 |
| Behavioral Scenarios | 9 | 4 | 5 | 0 | 0 |
| User Stories | 7 | — | — | — | — |
| **TOTAL** | **65** | **29** | **24** | **4** | **1** |

## Execution Order

1. All P0 schema tests (CP1.1-CP1.5)
2. Privacy filter tests (CP2.1-CP2.3)
3. Submission flow tests (CP3.1-CP3.5)
4. Consequence core tests (CP6.1-CP6.8)
5. Handler posting tests (CP10.1-CP10.4)
6. Arc lifecycle tests (CP4.1-CP4.5)
7. Task rewriting tests (CP5.1-CP5.3)
8. Cam session tests (CP7.1-CP7.9)
9. Fan engagement tests (CP8.1-CP8.4)
10. Revenue tests (CP9.1-CP9.4)
11. Behavioral validation scenarios (BV-CP1 through BV-CP9)
12. User story acceptance review
