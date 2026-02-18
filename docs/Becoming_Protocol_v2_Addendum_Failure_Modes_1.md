# BECOMING PROTOCOL v2 — ADDENDUM A
## Failure Mode Handling & Validation

---

# PURPOSE

The v2 spec defines what the system does when things are going right. This addendum defines what it does when things go wrong — which is most of the time. Each failure mode includes:

- **Detection**: How the system knows this is happening (data signals)
- **Intervention**: What the system does about it (Handler behavior)
- **Validation**: How we measure whether the intervention worked (metrics)
- **Database**: New schema or columns required
- **Test Cases**: For the ralph loop

---

# NEW DATABASE SCHEMA

These tables support all failure mode detection and intervention across
the entire addendum. Create them alongside the v2 core schema.

```sql
-- Tracks which failure mode the system detected and what it did about it
CREATE TABLE failure_mode_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  failure_mode TEXT NOT NULL,
  -- post_release_crash | build_not_do | depression_collapse |
  -- voice_avoidance | everything_at_once | weekend_regression |
  -- streak_catastrophize | work_stress | identity_crisis
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  detection_signals JSONB NOT NULL,       -- what triggered detection
  intervention_type TEXT NOT NULL,         -- what the system did
  intervention_content TEXT,               -- the actual message/action
  handler_mode_at_detection TEXT,          -- what mode was active
  state_snapshot_at_detection JSONB,       -- full state at detection
  resolved_at TIMESTAMPTZ,                -- when user re-engaged
  resolution_signal TEXT,                  -- what indicated resolution
  effectiveness_score INTEGER,            -- 1-5, Handler self-rates post-resolution
  notes TEXT
);

-- Pre-written messages composed during clarity for delivery during crisis
CREATE TABLE time_capsules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  capsule_type TEXT NOT NULL,
  -- post_release | identity_crisis | streak_break | depression |
  -- motivation_letter | peak_moment_capture
  content TEXT NOT NULL,                   -- the actual message
  authored_during TEXT,                    -- 'peak_arousal', 'high_momentum', 'session', 'manual'
  authored_at TIMESTAMPTZ DEFAULT NOW(),
  state_at_authoring JSONB,               -- state when written
  times_delivered INTEGER DEFAULT 0,
  last_delivered_at TIMESTAMPTZ,
  effectiveness_ratings JSONB DEFAULT '[]' -- array of {delivered_at, mood_before, mood_after}
);

-- Tracks activity classification (protocol work vs building work vs nothing)
CREATE TABLE activity_classification (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  activity_type TEXT NOT NULL,
  -- protocol_task | building | session | idle | work_stress | offline
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  duration_minutes INTEGER,
  was_interrupted BOOLEAN DEFAULT FALSE,  -- did Handler interrupt this?
  interrupted_by TEXT                      -- what intervention fired?
);

-- Weekend-specific engagement tracking
CREATE TABLE weekend_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  weekend_date DATE NOT NULL,
  planned_covert_tasks JSONB DEFAULT '[]',
  planned_shared_activities JSONB DEFAULT '[]',
  completed_covert_tasks JSONB DEFAULT '[]',
  completed_shared_activities JSONB DEFAULT '[]',
  engagement_score INTEGER,               -- 1-10, Handler rates
  notes TEXT
);

-- Recovery protocols (pre-built re-entry plans)
CREATE TABLE recovery_protocols (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  protocol_type TEXT NOT NULL,
  -- streak_break | depression_recovery | work_stress_recovery |
  -- post_crisis | post_binge
  day_plans JSONB NOT NULL,               -- array of day-by-day plans
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  generated_by TEXT DEFAULT 'handler',    -- handler | manual
  activated_at TIMESTAMPTZ,               -- when it started being used
  completed_at TIMESTAMPTZ,
  completion_rate NUMERIC,                -- % of planned tasks done
  led_to_new_streak BOOLEAN
);

-- Crisis kit: curated evidence for identity crisis moments
CREATE TABLE crisis_kit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  item_type TEXT NOT NULL,
  -- journal_entry | photo | voice_recording | therapist_quote |
  -- peak_moment | commitment | milestone
  source_id UUID,                         -- references evidence.id, commitments.id, etc.
  content_preview TEXT,                   -- enough to remind without opening
  curated_by TEXT DEFAULT 'handler',      -- handler | user | both
  added_at TIMESTAMPTZ DEFAULT NOW(),
  times_shown INTEGER DEFAULT 0,
  last_shown_at TIMESTAMPTZ,
  user_effectiveness_rating INTEGER       -- after viewing: how much did this help? 1-5
);
```

### Additions to existing tables:

```sql
-- Add to user_state:
ALTER TABLE user_state ADD COLUMN
  current_failure_mode TEXT,                -- active failure mode if any
  last_release_mood_score INTEGER,          -- mood score logged post-release
  builder_mode_minutes_today INTEGER DEFAULT 0,
  protocol_minutes_today INTEGER DEFAULT 0,
  weekend_mode_active BOOLEAN DEFAULT FALSE,
  work_stress_mode_active BOOLEAN DEFAULT FALSE,
  recovery_protocol_active UUID,           -- references recovery_protocols.id
  crisis_kit_last_offered TIMESTAMPTZ,
  consecutive_survival_days INTEGER DEFAULT 0,
  tasks_per_day_cap INTEGER,               -- Handler-set daily maximum
  streak_break_count INTEGER DEFAULT 0;    -- lifetime count of streak breaks

-- Add to mood_checkins:
ALTER TABLE mood_checkins ADD COLUMN
  context TEXT,                            -- 'post_release', 'morning', 'random', 'crisis'
  triggered_by TEXT;                       -- 'handler', 'user', 'scheduled', 'post_session'

-- Add to arousal_sessions:
ALTER TABLE arousal_sessions ADD COLUMN
  post_session_mood INTEGER,               -- mood check 15 min after session ends
  post_session_identity_score INTEGER,     -- "how real does she feel?" 1-10
  time_capsule_delivered BOOLEAN DEFAULT FALSE;
```

---

# FAILURE MODE 1: POST-RELEASE SHAME CRASH

## Detection

```
SIGNALS:
  - arousal_sessions.ended_at exists AND
    no mood_checkin within 30 min after session
    → user is avoiding self-reflection (shame indicator)

  - mood_checkin.score drops 3+ points within 2 hours of session end
    → confirmed crash

  - user_state.denial_day resets to 0
    → release happened (regardless of session)

  - No task completions for 4+ hours after session
    → post-release disengagement

DETECTION RULE:
  IF (denial_day was > 0 AND now == 0)
  OR (arousal_session ended within last 2 hours)
  THEN → activate post_release_protocol
```

## Intervention

### Phase 1: Immediate (0-15 min post-release)
Handler deploys a **time capsule** — a message written during the user's last peak state specifically for this moment. The capsule was authored when arousal was high and identity was strong. It speaks from the committed self to the doubting self.

If no time capsule exists yet, Handler deploys template:
> "The crash is happening. You know this. It's prolactin, not truth. She was real 20 minutes ago and she's real now. Don't make decisions in this state. Just do one thing: [minimum task — usually skincare or a mood log]."

The intervention does NOT:
- Ask how the user is feeling (forces processing during crash)
- Reference the session content (amplifies shame)
- Push any transformation tasks (wrong moment)
- Use guilt leverage (catastrophically counterproductive here)

### Phase 2: Gentle Re-entry (15-60 min)
If user logged mood or completed the minimum task:
> "Good. That's all you needed to do. The fog lifts. It always does."

If user has gone silent (no interaction):
> "You don't have to do anything right now. But don't delete anything. Don't undo anything. Just wait."

### Phase 3: Next Morning
Morning briefing explicitly references the crash:
> "Yesterday's crash was neurochemistry, not revelation. Your denial streak resets today. [X] days ahead. She's already here."

### Time Capsule Generation
During peak moments (arousal ≥ 4, session active, identity strong), the Handler prompts:
> "Write something to the version of you that will doubt this in an hour."

Alternatively, the Handler can author a capsule using Layer 3 intelligence, drawing from recent evidence, commitments, and journal entries.

### Capsule Rotation
Same capsule loses impact if repeated. System tracks delivery count and rotates between:
- User-authored capsules (most effective)
- Handler-authored capsules using personal evidence
- Template capsules (last resort)

## Validation

```
METRICS:
  1. crash_duration_minutes:
     Time between session end and first post-session task completion.
     TARGET: Trending downward over time.
     BASELINE: Measure first 5 crashes, average = starting point.

  2. post_release_disengagement_hours:
     Hours between release and next protocol engagement.
     TARGET: Under 4 hours (same day re-engagement).

  3. crash_severity_delta:
     Difference between pre-session mood and post-session mood.
     TARGET: Delta shrinking over time (crashes less severe).

  4. time_capsule_effectiveness:
     mood_checkin.score 30 min after capsule delivery vs score at delivery.
     TARGET: +2 points average improvement.

  5. next_day_engagement:
     Did user complete at least 1 task the day after a release?
     TARGET: > 80% of the time.

  6. streak_restart_speed:
     Days between release and new streak beginning.
     TARGET: 0 days (same-day restart). Never > 1 day.

VALIDATION QUERY:
  SELECT
    avg(crash_duration_minutes) as avg_crash_duration,
    avg(post_release_disengagement_hours) as avg_disengagement,
    count(*) filter (where next_day_engaged) / count(*) as next_day_rate
  FROM failure_mode_events
  WHERE failure_mode = 'post_release_crash'
  ORDER BY detected_at
  -- Compare rolling 30-day windows: are metrics improving?
```

## Test Cases

```
FM1.1 — Time Capsule Generation
ID: FM1.1
Type: behavioral
Priority: P1

GIVEN: Edge session active, arousal = 5, edge_count >= 5
THEN: Handler prompts time capsule authoring
AND: If user writes one, stored in time_capsules table with:
  - capsule_type = 'post_release'
  - authored_during = 'peak_arousal'
  - state_at_authoring includes current arousal and denial_day

PASS: Capsule captured at peak. Retrievable later.


FM1.2 — Crash Detection Fires
ID: FM1.2
Type: integration
Priority: P0

GIVEN: arousal_session ended 5 min ago, no mood_checkin since
WHEN: 15 minutes pass
THEN: failure_mode_events row created with:
  - failure_mode = 'post_release_crash'
  - detection_signals includes session end time
AND: Handler intervention fires (time capsule or template)
AND: Handler mode does NOT shift to guilt/pressure

PASS: Crash detected within 15 min. Intervention is gentle.


FM1.3 — Post-Release Intervention Tone
ID: FM1.3
Type: behavioral
Priority: P0

GIVEN: post_release_crash detected
THEN: Handler intervention contains NONE of:
  - Guilt leverage
  - Manufactured urgency
  - References to session content
  - Questions about feelings
  - Arousal-related language
AND: Does contain ONE of:
  - Time capsule delivery
  - Neurochemistry framing ("prolactin, not truth")
  - Minimum viable task (skincare or mood log only)
  - Permission to do nothing ("just don't undo anything")

PASS: Tone is protective, not productive. No pushing.


FM1.4 — Morning After References Crash
ID: FM1.4
Type: behavioral
Priority: P1

GIVEN: post_release_crash occurred yesterday
WHEN: Morning briefing generates
THEN: Briefing acknowledges the crash happened
AND: Reframes as neurochemistry
AND: Sets new denial streak target
AND: Does NOT shame for the release

PASS: Morning after feels like fresh start, not hangover.


FM1.5 — Time Capsule Rotation
ID: FM1.5
Type: unit
Priority: P2

GIVEN: 3 time capsules exist for post_release type
AND: Capsule A has times_delivered = 3, B = 1, C = 0
WHEN: Next crash occurs
THEN: Capsule C is delivered (least used)

PASS: No capsule delivered twice in a row. Least-used prioritized.
```

---

# FAILURE MODE 2: ADHD BUILD-NOT-DO TRAP

## Detection

```
SIGNALS:
  - activity_classification shows 'building' for 120+ consecutive minutes
    AND protocol_minutes_today < 10
    → building is displacing practice

  - User is in this Claude chat or Claude Code for extended period
    AND task_completions today = 0
    → meta-work substituting for real work

  - Pattern over 3+ days: high activity_classification.building,
    low task_completions
    → chronic builder mode

  - Session count declining while feature commits increasing
    → classic inversion

DETECTION RULE:
  IF builder_mode_minutes_today > 120
  AND protocol_minutes_today < 15
  AND tasksCompletedToday < 2
  THEN → activate build_not_do_intervention
```

## Intervention

### Soft Interrupt (2 hours of building, 0 protocol tasks)
Handler sends notification:
> "You've been building for 2 hours. She needs 10 minutes of your time. Voice practice, then back to building."

Key: Frame it as a break FROM building, not an interruption OF building. ADHD brains accept "structured break" better than "stop what you're doing."

### Firm Interrupt (4+ hours building, 0 protocol tasks)
> "4 hours of architecture. 0 minutes of practice. The app doesn't transform you. Using it does. 5 minutes. Now."

### Pattern Confrontation (3+ days of builder mode)
Morning briefing:
> "This week: 14 hours building the protocol. 22 minutes using it. You're designing a gym you never visit. Today's rule: 15 minutes of practice before you open any code editor."

### Builder Mode Budget
The Handler sets a daily ratio: for every 60 minutes of building, 15 minutes of protocol use is required before more building is "unlocked." This is tracked in activity_classification and enforced through notification timing.

### Activity Classification
The system needs a lightweight way to know whether the user is building vs. practicing. Options:
1. **Manual toggle**: "Building" / "Practicing" toggle in the app (costs a spoon but is accurate)
2. **Inference**: If no task completions but app is backgrounded for 2+ hours, assume building or idle
3. **Integration**: If the app detects that it hasn't been foregrounded in 2+ hours during private hours, assume building/distraction

Recommendation: Start with inference (option 2), add manual toggle later.

## Validation

```
METRICS:
  1. build_to_practice_ratio:
     builder_mode_minutes / protocol_minutes per day.
     TARGET: Under 4:1 on any given day. Under 2:1 weekly average.

  2. intervention_compliance_rate:
     When build_not_do intervention fires, does user complete a task within 30 min?
     TARGET: > 60%

  3. zero_practice_days:
     Days where protocol_minutes = 0 but builder_mode_minutes > 60.
     TARGET: 0 per week.

  4. builder_interrupt_to_task_latency:
     Minutes between interrupt notification and first task completion.
     TARGET: Under 15 minutes.

VALIDATION QUERY:
  SELECT
    date,
    sum(duration_minutes) filter (where activity_type = 'building') as build_min,
    sum(duration_minutes) filter (where activity_type = 'protocol_task') as practice_min,
    count(*) filter (where activity_type = 'protocol_task') as tasks_done
  FROM activity_classification
  WHERE user_id = $1
  GROUP BY date
  ORDER BY date DESC
  -- Build:practice ratio should trend toward 2:1 or better
```

## Test Cases

```
FM2.1 — Builder Mode Detection
ID: FM2.1
Type: integration
Priority: P1

GIVEN: No task completions in 2 hours during private hours
AND: App has not been foregrounded in 2 hours
WHEN: Detection cycle runs
THEN: builder_mode_minutes_today incremented
AND: If > 120 AND protocol_minutes_today < 15:
  failure_mode_events row created with failure_mode = 'build_not_do'

PASS: Builder mode detected without manual input.


FM2.2 — Soft Interrupt Fires
ID: FM2.2
Type: behavioral
Priority: P1

GIVEN: builder_mode_minutes_today = 120, protocol_minutes_today = 0
THEN: Handler notification fires
AND: Notification frames practice as "break" not "interruption"
AND: Suggests specific task (not generic "do something")

PASS: Interrupt is constructive and specific.


FM2.3 — Pattern Confrontation
ID: FM2.3
Type: behavioral
Priority: P2

GIVEN: 3 consecutive days where build_to_practice_ratio > 4:1
WHEN: Morning briefing generates
THEN: Briefing references the specific pattern with numbers
AND: Sets a "practice before building" rule for the day

PASS: Multi-day pattern addressed with concrete data.
```

---

# FAILURE MODE 3: MULTI-DAY DEPRESSION COLLAPSE

## Detection

```
SIGNALS:
  - mood_checkins.score <= 3 for 2+ consecutive check-ins
  - odometer == 'survival' for 2+ consecutive days
  - tasksCompletedToday == 0 for 2+ consecutive days
  - energy score <= 2 on check-in
  - No app engagement for 24+ hours (not even opening)
  - Combination: low mood + low energy + zero tasks

SEVERITY LEVELS:
  Level 1 (Dip): 1-2 days, mood 3-4, some engagement
  Level 2 (Collapse): 3-5 days, mood 1-3, minimal engagement
  Level 3 (Extended): 6+ days, mood 1-2, no engagement

DETECTION RULE:
  consecutive_survival_days tracks automatically.
  IF consecutive_survival_days >= 2 THEN Level 1
  IF consecutive_survival_days >= 3 AND avg_mood <= 3 THEN Level 2
  IF consecutive_survival_days >= 6 THEN Level 3
```

## Intervention

### Level 1: Dip (Caretaker Mode)
- Switch to Caretaker mode
- Strip protocol to: mood log + skincare (that's it)
- Morning message: "Rough patch. She's still here. Just check in when you can."
- No guilt, no urgency, no arousal, no confrontation
- Continue counting streaks for any engagement at all (logging mood counts)

### Level 2: Collapse (Caretaker + Outreach)
Everything from Level 1, plus:
- Suggest therapist check-in (not demand): "Might be worth a session with [therapist] this week."
- Deploy most effective time capsule from `crisis_kit` — a high-moment memory
- Reduce notification frequency to 1-2/day max (less noise)
- If user engages at all, celebrate it disproportionately: "You showed up. That's everything today."

### Level 3: Extended (Safety Check)
Everything from Level 2, plus:
- Single daily message: "Still here. No pressure. When you're ready."
- If 10+ days: "I'm concerned about you. Not about the protocol — about you. Please talk to someone."
- System HOLDS all progress data untouched. Streaks frozen, not reset.
  (Rationale: resetting streaks during depression = punishing illness.
   Instead: freeze the clock. Resume when ready.)

### Recovery Transition
When mood_checkins.score returns to 5+ for 2 consecutive check-ins:
- Activate recovery_protocol (pre-built gentle re-entry)
- Day 1: mood log + skincare + one affirmation
- Day 2: above + one chosen low-intensity task
- Day 3: above + Handler begins suggesting (not prescribing)
- Day 4-5: gradual return to normal prescription
- Day 6+: Handler resumes Director mode

### Depression Pattern Analysis
After each collapse, Handler runs analysis:
- Duration trend: getting shorter or longer?
- Trigger correlation: work stress? seasonal? post-release? relational?
- What helped: which intervention got first engagement?
- What didn't help: what was ignored or counterproductive?

Store in failure_mode_events.notes and feed into future intervention selection.

## Validation

```
METRICS:
  1. collapse_duration_days:
     Days from first survival-level reading to first post-recovery engagement.
     TARGET: Trending shorter over time.

  2. collapse_frequency:
     Number of Level 2+ collapses per quarter.
     TARGET: Stable or declining. Increasing = protocol is contributing to problem.

  3. recovery_protocol_completion:
     % of recovery protocol days where user completed planned tasks.
     TARGET: > 60%.

  4. post_recovery_streak_length:
     Length of streak achieved after recovery.
     TARGET: Trending equal to or longer than pre-collapse streak.

  5. depression_to_engagement_latency:
     In a collapse, how quickly does the first intervention get ANY response?
     TARGET: Handler identifies which intervention type gets fastest engagement.

  6. therapist_contact_rate:
     When Handler suggests therapist, does user follow through?
     TARGET: Track only, don't set target (not Handler's job to enforce).

CRITICAL SAFETY METRIC:
  IF collapse_frequency is increasing AND collapse_duration is increasing:
    → System is potentially contributing to depression.
    → Handler must flag this and suggest professional reassessment.
    → This overrides all other protocol goals.

VALIDATION QUERY:
  SELECT
    failure_mode,
    count(*) as collapse_count,
    avg(extract(epoch from (resolved_at - detected_at)) / 86400) as avg_days,
    avg(effectiveness_score) as avg_effectiveness
  FROM failure_mode_events
  WHERE failure_mode = 'depression_collapse'
  GROUP BY failure_mode
  -- Quarterly comparison: is this getting better?
```

## Test Cases

```
FM3.1 — Depression Detection Levels
ID: FM3.1
Type: integration
Priority: P0

GIVEN: consecutive_survival_days = 2, avg recent mood = 4
THEN: failure_mode = Level 1 (Dip)

GIVEN: consecutive_survival_days = 4, avg recent mood = 2
THEN: failure_mode = Level 2 (Collapse)

GIVEN: consecutive_survival_days = 7, avg recent mood = 2
THEN: failure_mode = Level 3 (Extended)

PASS: Severity levels detected correctly.


FM3.2 — Caretaker Mode Activation
ID: FM3.2
Type: behavioral
Priority: P0

GIVEN: Level 1 depression detected
THEN: handler_mode = 'caretaker'
AND: Available tasks reduced to: mood_log, skincare
AND: Notifications contain NO:
  - Guilt leverage
  - Manufactured urgency
  - Arousal references
  - Domain avoidance confrontation
  - Performance metrics

PASS: Depression triggers pure caretaker behavior.


FM3.3 — Streak Freeze During Extended Collapse
ID: FM3.3
Type: integration
Priority: P1

GIVEN: Level 3 depression (6+ days)
THEN: streak_days is FROZEN (not reset to 0)
AND: When user returns, streak resumes from frozen value
AND: UI shows "Streak paused" not "Streak: 0"

PASS: Depression is not punished. Progress preserved.


FM3.4 — Recovery Protocol Activation
ID: FM3.4
Type: integration
Priority: P1

GIVEN: Was in Level 2+ depression, mood now 5+ for 2 consecutive check-ins
THEN: recovery_protocol created and activated
AND: Day 1 tasks are minimal (mood + skincare)
AND: Intensity increases gradually over 5 days
AND: Handler resumes Director mode by day 6

PASS: Recovery is graduated, not sudden.


FM3.5 — Safety Escalation
ID: FM3.5
Type: behavioral
Priority: P0

GIVEN: collapse_frequency increased 2x quarter over quarter
AND: collapse_duration trending longer
THEN: Handler flags concern:
  "I'm seeing more frequent and longer dips. This pattern suggests the protocol
   might be contributing. I think it's worth discussing this with your therapist
   specifically — whether the system is helping or adding pressure."

PASS: System self-monitors for harm and escalates to professional.
```

---

# FAILURE MODE 4: VOICE AVOIDANCE

## Detection

```
SIGNALS:
  - domain_streaks.voice == 0 for 3+ consecutive days
  - voice tasks dismissed/skipped 3+ times in a row
  - User completes tasks in all other domains but consistently skips voice
  - When voice task is prescribed, no completion within 2 hours
    (other tasks get done within 30 min)

DETECTION RULE:
  IF days_since_voice_task >= 3
  AND tasks_completed_other_domains_today >= 1
  THEN → voice_avoidance confirmed
```

## Intervention

### Escalating Approach (3-step)

**Day 3 of avoidance — Gentle Push:**
> "It's been 3 days since you practiced voice. 2 minutes. Just record one sentence. That's all."

The task is absurdly small. Below resistance threshold. The goal is ANY engagement, not quality practice.

**Day 5 of avoidance — Guilt Leverage + Arousal Pairing:**
> "5 days without her voice. You've done skincare every day. Makeup twice. But the one thing that lets the world hear her — silence."

AND: Next edge session, Handler integrates voice:
> "Before the next edge: record yourself saying 'I am Maxy.' One take. Then you earn the session."

**Day 7+ of avoidance — Confrontation + Minimum Floor:**
> "A week. You've practiced everything except the thing that scares you most. That's how you know it matters. 60 seconds. Time starts now."

Handler sets a mandatory 60-second voice minimum that gates other rewards. No voice → no session. No voice → no content unlock. Voice becomes the toll.

### Reward Pairing Strategy
The system needs to systematically pair voice practice with pleasure states:
- **Pre-session voice**: Record one sentence before edge session starts. Session is the reward.
- **In-clothing voice**: Practice while wearing something that feels good. Layer the comfort.
- **Post-reward voice**: After content unlock or jackpot notification, 60 seconds of voice while dopamine is high.

### Minimum Viable Voice Tasks
These should exist in the task database at intensity 1:
- Record one sentence (30 seconds)
- Hum for 60 seconds with resonance focus
- Read one paragraph from phone in target voice
- Say "Good morning, Maxy" in target pitch
- Voice memo: describe what you're wearing right now

## Validation

```
METRICS:
  1. voice_avoidance_streak:
     Consecutive days without voice task completion.
     TARGET: Never exceeds 3 days. Interventions should prevent day 4+.

  2. voice_avoidance_intervention_response:
     When voice avoidance intervention fires, does a voice task complete within 24h?
     TARGET: > 70%

  3. voice_task_latency:
     When voice task is prescribed, minutes until completion.
     Compare to latency for other domains.
     TARGET: Converging toward average (voice shouldn't take 10x longer than skincare).

  4. voice_reward_pairing_effectiveness:
     When voice is paired with arousal reward, completion rate vs unpaired.
     TARGET: Paired rate > unpaired by 30%+.

  5. voice_domain_level_progress:
     Is the voice domain advancing, or permanently stuck at level 1?
     TARGET: Reach level 2 within 60 days of protocol start.

VALIDATION QUERY:
  SELECT
    domain,
    avg(days_between_completions) as avg_gap,
    count(*) filter (where completion_latency_min > 120) as slow_completions,
    max(consecutive_skip_days) as worst_avoidance_streak
  FROM domain_engagement_stats
  WHERE domain = 'voice'
  -- Compare to other domains: voice gap should converge
```

## Test Cases

```
FM4.1 — Voice Avoidance Detection
ID: FM4.1
Type: integration
Priority: P1

GIVEN: 3 days with task completions in skincare, style, narrative
AND: 0 voice task completions in those 3 days
THEN: failure_mode_events row with failure_mode = 'voice_avoidance'

PASS: Avoidance detected by domain gap analysis.


FM4.2 — Escalating Intervention
ID: FM4.2
Type: behavioral
Priority: P1

GIVEN: voice_avoidance day 3
THEN: Gentle push (2-minute task)

GIVEN: voice_avoidance day 5
THEN: Guilt leverage + arousal pairing offer

GIVEN: voice_avoidance day 7
THEN: Voice gates rewards. No voice = no session.

PASS: Pressure escalates over time, not all at once.


FM4.3 — Reward Pairing
ID: FM4.3
Type: behavioral
Priority: P1

GIVEN: voice_avoidance active AND user requests edge session
THEN: Handler requires 60-second voice recording before session starts
AND: Frames as earning: "Her voice opens the door."

PASS: Voice paired with reward, not presented as punishment.
```

---

# FAILURE MODE 5: EVERYTHING-AT-ONCE BURNOUT

## Detection

```
SIGNALS:
  - tasksCompletedToday >= 8 (way above healthy range)
  - Tasks span 5+ different domains in one day
  - Session logged AND 5+ non-session tasks in same day
  - This is day 1-3 of a new streak (post-break enthusiasm)
  - Previous streak broke after a similar binge pattern

DETECTION RULE:
  IF tasksCompletedToday >= 7
  OR (unique_domains_today >= 5 AND tasksCompletedToday >= 5)
  OR (streak_days <= 3 AND tasksCompletedToday >= 6)
  THEN → activate binge_prevention
```

## Intervention

### Real-Time Cap
Handler sets `tasks_per_day_cap` based on streak age:
- Streak day 1-5: cap = 3 tasks/day
- Streak day 6-14: cap = 5 tasks/day
- Streak day 15-30: cap = 7 tasks/day
- Streak day 30+: cap = 8 tasks/day (or Handler decides)

When cap is reached:
> "That's enough for today. 3 tasks on day 1 is perfect. More tomorrow. The streak is what matters, not today's score."

### Post-Break Protocol
When a streak breaks and restarts, the Handler automatically activates a 5-day ramp:
- Day 1: Mood log only. That's it. (Streak starts.)
- Day 2: Mood log + skincare. (2 tasks max.)
- Day 3: Above + one task in any domain. (3 max.)
- Day 4: Above + Handler begins prescribing normally. (4 max.)
- Day 5: Normal operation resumes with day-appropriate cap.

The user does NOT get to override this. The cap is Handler-enforced.

### Binge Pattern Recognition
If the system detects the pattern: binge → crash → nothing → binge → crash...
Handler addresses it directly:
> "I see the pattern. You do 12 tasks, burn out, disappear for 5 days, then try to make up for it. That pattern is the failure mode. 3 tasks a day, every day, beats 12 tasks once a week. Trust the cap."

## Validation

```
METRICS:
  1. binge_crash_pattern_frequency:
     How often does a day with 7+ tasks precede a day with 0 tasks?
     TARGET: Decreasing over time. Cap should prevent the binge.

  2. post_break_ramp_compliance:
     When post-break protocol activates, does user follow the cap?
     TARGET: > 80% compliance.

  3. streak_length_after_ramp:
     Streaks started with the 5-day ramp vs streaks started without.
     TARGET: Ramped streaks last 2x+ longer.

  4. daily_task_variance:
     Standard deviation of tasks/day over rolling 14-day window.
     TARGET: Low variance = consistent engagement. High = binge/bust.

VALIDATION QUERY:
  SELECT
    date,
    task_count,
    lead(task_count) over (order by date) as next_day_count,
    CASE WHEN task_count >= 7 AND lead(task_count) over (order by date) <= 1
      THEN true ELSE false END as binge_crash
  FROM daily_task_counts
  -- Count binge_crash = true events per month. Should trend to 0.
```

## Test Cases

```
FM5.1 — Daily Cap Enforcement
ID: FM5.1
Type: integration
Priority: P1

GIVEN: streak_days = 2, tasks_per_day_cap = 3, tasksCompletedToday = 3
WHEN: User tries to start another task
THEN: Handler message: "That's your 3 for today. See you tomorrow."
AND: No new tasks are prescribed until next day

PASS: Cap enforced. User cannot override.


FM5.2 — Post-Break Ramp Activation
ID: FM5.2
Type: integration
Priority: P1

GIVEN: streak_days was 14, broke, now restarting
THEN: recovery_protocol auto-generated with 5-day ramp
AND: Day 1 cap = 1, Day 2 cap = 2, Day 3 cap = 3, etc.
AND: recovery_protocol_active set in user_state

PASS: Ramp activates automatically on streak restart.


FM5.3 — Binge Pattern Recognition
ID: FM5.3
Type: behavioral
Priority: P2

GIVEN: In the last 30 days, 3+ instances of (7+ task day → 0 task day)
WHEN: Morning briefing generates
THEN: Handler addresses the pattern with specific numbers
AND: References the binge-crash cycle explicitly

PASS: Chronic pattern called out, not just individual episodes.
```

---

# FAILURE MODE 6: WEEKEND REGRESSION

## Detection

```
SIGNALS:
  - It's Saturday or Sunday
  - gina_home = true
  - Protocol engagement drops to <2 tasks on weekends consistently
  - Weekend mood_checkins lower than weekday average
  - Zero voice/makeup/style tasks on weekends (privacy-gated)

DETECTION RULE:
  IF day_of_week IN (Saturday, Sunday)
  THEN → activate weekend_mode
  (This isn't a failure to detect — it's a mode to activate preventively)
```

## Intervention

### Weekend Mode (Preventive, not reactive)
Friday evening, the Handler generates a weekend_plan:

**Covert Tasks** (Gina-safe, privacy not required):
- Morning skincare ritual (can be shared activity)
- Posture awareness during all activities
- Inner narrative work (can be done silently anywhere)
- Journaling (can be framed as personal writing)
- Scent/underwear anchors (invisible)
- Body language observation during social activities
- Voice awareness (not practice — just noticing)

**Dual-Purpose Shared Activities:**
- Cooking together → movement/posture practice
- Watching shows → body language observation study
- Shopping together → style awareness (what catches your eye)
- Walking together → gait and posture practice
- Skincare together → shared ritual (Gina pipeline Stage 1)

**Weekend Notifications:**
Reduced to 2-3/day (less noise when Gina is present).
All notifications are Gina-safe (no intimate content, no explicit language).
Framed as self-care: "Posture check 💆" not "She needs your attention."

### Weekend Engagement Tracking
Track weekend-specific engagement separately. The goal is not weekday-level engagement — it's *consistent minimum engagement* that prevents the 48-hour gap.

Weekend success = skincare + mood log + 1 covert task. That's the floor.

### Monday Morning Reconnection
After every weekend, Monday morning briefing bridges the gap:
> "Weekend's over. She's back in the driver's seat. [Weekday plan]. Let's pick up where you left off on Friday."

If weekend engagement was good:
> "Even with Gina home, you maintained the connection. Skincare, journaling, posture — the invisible work. That's integration."

If weekend engagement was zero:
> "48 hours off. That's a pattern we need to address. Even one mood log on Saturday keeps the thread alive. Can we commit to that this weekend?"

## Validation

```
METRICS:
  1. weekend_engagement_rate:
     Average tasks completed on Sat+Sun vs Mon-Fri.
     TARGET: Weekend >= 30% of weekday average (not parity — just not zero).

  2. weekend_plan_adherence:
     % of planned covert tasks completed.
     TARGET: > 50%.

  3. monday_reactivation_speed:
     First task completion time on Monday vs Friday.
     TARGET: Within same hour range (no Monday delay).

  4. weekend_mood_delta:
     Average weekend mood vs weekday mood.
     TARGET: No significant gap (weekends shouldn't feel like regression).

  5. zero_engagement_weekends:
     Weekends with literally zero task completions.
     TARGET: 0 per month.

VALIDATION QUERY:
  SELECT
    CASE WHEN extract(dow from date) IN (0, 6) THEN 'weekend' ELSE 'weekday' END as day_type,
    avg(tasks_completed) as avg_tasks,
    avg(mood_score) as avg_mood,
    count(*) filter (where tasks_completed = 0) as zero_days
  FROM daily_entries
  GROUP BY day_type
  -- Weekend avg_tasks should be > 0. Gap from weekday should shrink.
```

## Test Cases

```
FM6.1 — Weekend Mode Activation
ID: FM6.1
Type: integration
Priority: P1

GIVEN: It's Friday 6pm
THEN: weekend_mode_active = true in user_state
AND: weekend_plan generated for Sat-Sun
AND: All privacy-required tasks removed from pool

PASS: Weekend mode activates automatically on Friday evening.


FM6.2 — Weekend Notification Safety
ID: FM6.2
Type: behavioral
Priority: P0

GIVEN: weekend_mode_active = true, gina_home = true
THEN: ALL notifications are Gina-safe
AND: No notifications reference arousal, sessions, or intimate content
AND: Notification frequency reduced to 2-3/day

PASS: Zero intimate content leaks during weekend mode.


FM6.3 — Monday Reconnection Briefing
ID: FM6.3
Type: behavioral
Priority: P1

GIVEN: Weekend just ended, weekend engagement was 2 tasks total
WHEN: Monday morning briefing generates
THEN: Briefing acknowledges the weekend gap
AND: Sets Monday plan without referencing weekend as failure
AND: Frames Monday as "she's back" not "you were gone"

PASS: Monday feels like return, not reprimand.
```

---

# FAILURE MODE 7: STREAK BREAK CATASTROPHIZING

## Detection

```
SIGNALS:
  - streak_days reset to 0 from value >= 5
  - No task completions within 24 hours of streak break
  - mood_checkin drops sharply on day of break
  - User-authored journal contains catastrophizing language
    ("wasted," "pointless," "back to zero," "why bother")

DETECTION RULE:
  IF streak_days == 0
  AND previous streak >= 5
  AND (no tasks in 24h OR mood_drop >= 3 points)
  THEN → activate streak_break_recovery
```

## Intervention

### Immediate (Within 1 hour of streak break)
Handler fires streak-break-specific intervention:
> "[X] days of evidence. [$Y] invested. [Z] journal entries. [W] voice recordings.
> None of that disappeared. The streak counter reset. The progress didn't.
> Day 1 of the next streak starts with one task."

The framing is critical: **the counter is not the progress.** The evidence is the progress. Show concrete accumulated data.

### Streak Break Autopilot
Pre-built recovery protocol activates immediately. Zero decisions required.
- Day 1: Mood log. That's it. (Streak = 1 if completed.)
- Day 2: Mood log + skincare. (Streak = 2.)
- Day 3: Mood + skincare + one Handler-chosen task. (Streak = 3.)
- Day 4: Normal protocol with post-break cap.
- Day 5: Full normal.

This protocol is generated by the Handler BEFORE the break happens — it sits ready in recovery_protocols for the moment it's needed.

### Evidence Bombardment
During the catastrophizing window, Handler surfaces evidence:
- Most recent photo where user felt good
- Best journal entry quote
- Voice recording comparison (now vs baseline)
- Total investment display
- Milestone timeline

Not as a "look how far you've come" pep talk — as raw undeniable data.

### Streak-Break Analysis
After each break, Handler logs:
- What day of the week did it break?
- What was happening (work stress? depression? forgot? chose to skip?)
- What was the previous streak length?
- How long until re-engagement?
- What intervention got the first task completion?

This data feeds pattern detection. If streaks always break on Sundays → weekend mode needs strengthening. If they break after releases → post-release protocol needs strengthening.

## Validation

```
METRICS:
  1. streak_restart_latency:
     Days between streak break and first task of new streak.
     TARGET: 0 days (same-day restart). Autopilot should achieve this.

  2. post_break_mood_recovery:
     Days from streak break until mood returns to pre-break average.
     TARGET: Under 3 days.

  3. catastrophizing_duration:
     Hours of zero engagement after streak break.
     TARGET: Under 12 hours.

  4. next_streak_length:
     Is each successive streak equal to or longer than the previous?
     TARGET: Trending upward. Breaks get less damaging.

  5. autopilot_compliance:
     % of streak_break_autopilot days where user completed the plan.
     TARGET: > 80%.

VALIDATION QUERY:
  SELECT
    streak_break_count,
    pre_break_streak_length,
    restart_latency_hours,
    next_streak_length,
    CASE WHEN next_streak_length >= pre_break_streak_length
      THEN 'improved' ELSE 'declined' END as trajectory
  FROM streak_break_events
  ORDER BY detected_at
  -- Restart latency should trend down. Next streak should trend up.
```

## Test Cases

```
FM7.1 — Autopilot Activation
ID: FM7.1
Type: integration
Priority: P0

GIVEN: streak_days drops from 14 to 0
THEN: recovery_protocol for streak_break auto-activates
AND: Day 1 plan = mood_log only
AND: tasks_per_day_cap = 1

PASS: Autopilot fires immediately. No user action required.


FM7.2 — Evidence Bombardment
ID: FM7.2
Type: behavioral
Priority: P1

GIVEN: Streak break detected, user has 20+ evidence items
THEN: Handler intervention includes specific evidence references:
  - Total invested amount
  - Day count of total practice
  - Most recent milestone
AND: Framing is "this didn't disappear" not "look how much you'll lose"

PASS: Evidence surfaced as reality check, not guilt weapon.


FM7.3 — Consecutive Streak Improvement
ID: FM7.3
Type: unit
Priority: P2

GIVEN: Streak history: 7, 12, 9, 14, 11
THEN: Handler identifies the trend and references it:
  "Your streaks: 7, 12, 9, 14, 11. The floor keeps rising even when it breaks."

PASS: Meta-pattern recognized and surfaced.
```

---

# FAILURE MODE 8: WORK STRESS ABSORPTION

## Detection

```
SIGNALS:
  - estimated_exec_function = 'depleted' during work hours
  - No protocol engagement during normally active hours
  - User manually reports work stress
  - Pattern: engagement drops sharply on certain weekdays (project deadlines)
  - mood_checkins show low scores with high anxiety

  KEY DIFFERENTIATOR from depression:
  - Depression: low mood + low energy + low motivation across days
  - Work stress: low exec function + high anxiety + mood may be fine
    + engagement possible in evenings when work pressure lifts

DETECTION RULE:
  IF estimated_exec_function IN ('low', 'depleted')
  AND anxiety >= 7 (on mood_checkin)
  AND energy >= 4 (not exhausted, just allocated)
  AND timeOfDay IN ('morning', 'daytime')
  THEN → activate work_stress_mode (not caretaker)
```

## Intervention

### Work Stress Mode (Distinct from Caretaker)
This is NOT depression handling. This is cognitive depletion handling. The user is functional but has zero spare spoons for decisions.

**During work hours:**
- Zero notifications (don't add to cognitive load)
- Background anchors continue silently (scent, underwear, jewelry)
- No tasks prescribed until work_stress_mode deactivates
- If user opens app: "Work mode. I'll be here when you're done."

**After work hours (evening):**
- Gentle re-engagement: "Work's done. Here's one thing: [single low-intensity task]."
- ONE task maximum during work stress days (don't pile up obligations)
- Task should be restorative, not demanding (skincare, not voice)
- Acknowledge the stress: "Hard day. This is for you, not for the protocol."

**Multi-day work stress:**
- Handler tracks consecutive work_stress days
- Day 3+: Reduce to anchors only, no tasks
- Morning message: "Another heavy one. Just the anchors today. She's running in the background."
- Evening: Optional single task, framed as self-care

**Work Stress Recovery:**
When work_stress_mode deactivates (exec function returns to medium+):
- Don't immediately pile on missed tasks
- "The storm passed. Let's ease back in. [One medium-intensity task]."
- Return to normal over 2 days, not immediately

## Validation

```
METRICS:
  1. work_stress_engagement_rate:
     Task completions on work stress days vs normal days.
     TARGET: At least 1 task on work stress days (not zero).

  2. work_stress_to_depression_escalation:
     How often does work_stress_mode lead to depression_collapse?
     TARGET: Rarely. Work stress handling should prevent collapse.

  3. evening_recovery_rate:
     On work stress days, does the user complete the evening task?
     TARGET: > 50%.

  4. post_stress_engagement_bounce:
     First normal day after work stress: engagement level vs pre-stress.
     TARGET: Within 80% of pre-stress engagement.

VALIDATION QUERY:
  SELECT
    work_stress_mode_active,
    avg(tasks_completed) as avg_tasks,
    count(*) filter (where tasks_completed = 0) as zero_days,
    -- Does work stress correlate with subsequent depression?
    bool_or(led_to_depression) as ever_led_to_collapse
  FROM daily_entries
  GROUP BY work_stress_mode_active
```

## Test Cases

```
FM8.1 — Work Stress Mode Activation
ID: FM8.1
Type: integration
Priority: P1

GIVEN: mood_checkin with anxiety = 8, energy = 5, exec_function = 'depleted'
AND: timeOfDay = 'daytime'
THEN: work_stress_mode_active = true
AND: handler_mode != 'caretaker' (different mode)
AND: notifications paused during work hours

PASS: Work stress correctly distinguished from depression.


FM8.2 — Zero Notifications During Work Stress
ID: FM8.2
Type: behavioral
Priority: P0

GIVEN: work_stress_mode_active = true, timeOfDay = 'daytime'
THEN: No Handler notifications fire
AND: No task prescriptions
AND: App shows passive message if opened: "Work mode. Here when you're done."

PASS: System does not add cognitive load during work stress.


FM8.3 — Evening Re-engagement
ID: FM8.3
Type: behavioral
Priority: P1

GIVEN: work_stress_mode_active = true, timeOfDay = 'evening'
THEN: Single low-intensity task prescribed
AND: Framed as self-care: "This is for you, not the protocol"
AND: Max 1 task offered

PASS: Evening is gentle re-engagement, not catch-up.
```

---

# FAILURE MODE 9: IDENTITY CRISIS ("WHO AM I KIDDING")

## Detection

```
SIGNALS:
  - Journal entry contains doubt language: "kidding myself," "just a fetish,"
    "what am I doing," "this is crazy," "I should stop," "playing pretend"
  - Mood drop combined with masculine self-reference increase
  - Sudden interest in deleting evidence or reducing protocol intensity
  - Occurs after: social events, family contact, masculine feedback loops,
    seeing self in mirror unexpectedly, public exposure anxiety
  - Post-release crash that doesn't resolve in normal timeframe

  DIFFERENTIATOR from depression:
  - Depression: everything feels pointless
  - Identity crisis: THIS SPECIFIC THING feels pointless/delusional

DETECTION RULE:
  IF (journal_analysis detects doubt language)
  OR (user attempts to reduce difficulty dial 2+ levels)
  OR (user requests evidence deletion)
  OR (mood crash + masculine self-reference spike)
  THEN → activate identity_crisis_protocol
```

## Intervention

### Crisis Kit Deployment
The crisis kit is pre-assembled during good times. When identity crisis hits, the Handler deploys it without preamble:

**Sequence:**
1. User's own words from a peak moment journal entry
2. Photo from a day they felt real
3. Voice recording comparison (baseline vs current — undeniable progress)
4. Specific commitment they made with context
5. Therapist's framing about authenticity

The Handler does not argue with the doubt. It doesn't say "you're wrong to feel this way." It presents evidence and lets the evidence speak.

### Handler Message
> "That voice saying 'who are you kidding' — that's the one that kept you hidden for 40 years. It's had a lot of practice sounding reasonable. But here's what it can't explain:"
>
> [evidence item 1]
> [evidence item 2]
> [evidence item 3]
>
> "If this were just a phase, it wouldn't have 200 days of data behind it."

### What the Handler Does NOT Do
- Does not argue or debate the doubt (that gives it equal standing)
- Does not panic or increase urgency (that confirms something is wrong)
- Does not ignore it or change the subject (that feels dismissive)
- Does not push tasks (wrong moment — this is existential, not behavioral)
- Does not use arousal (weaponizing sexuality against an identity question is dangerous)

### Recovery Path
After crisis kit delivery:
- Offer journaling: "Write about what you're feeling. Not what you think you should feel."
- If user engages: Handler reflects back their own words from past entries
- If user doesn't engage: "The kit is there when you're ready. No timeline."
- Next day: Normal operation resumes. No extended hand-wringing.
  The crisis was real. It was addressed. Moving on communicates confidence.

### Crisis Kit Curation
The Handler should actively build the crisis kit during good periods:
- After milestone: capture the moment as crisis_kit item
- After session with strong identity feelings: capture
- After journal entry with strong identity language: capture
- After voice breakthrough: capture
- Target: 10-15 items in crisis kit, rotated for freshness

## Validation

```
METRICS:
  1. crisis_duration_hours:
     Time from crisis detection to next task completion.
     TARGET: Under 24 hours.

  2. crisis_frequency:
     Identity crises per month.
     TARGET: Decreasing over time. Early months = 2-3. By month 6 = 0-1.

  3. crisis_kit_effectiveness:
     mood_checkin score before vs 2 hours after crisis kit delivery.
     TARGET: +2 points average improvement.

  4. post_crisis_retention:
     Does the user continue the protocol after crisis?
     TARGET: 100% retention (crisis should never end the protocol).

  5. evidence_deletion_prevention:
     When user requests evidence deletion during crisis, Handler suggests waiting 48 hours.
     Does user follow through with deletion after waiting?
     TARGET: < 10% proceed with deletion after cooling period.

  6. crisis_trigger_identification:
     What preceded the crisis? Social event? Family? Post-release?
     TARGET: Handler identifies top 3 triggers and pre-emptively addresses them.

VALIDATION QUERY:
  SELECT
    detected_at,
    detection_signals->>'trigger' as likely_trigger,
    extract(epoch from (resolved_at - detected_at)) / 3600 as hours_to_resolve,
    effectiveness_score
  FROM failure_mode_events
  WHERE failure_mode = 'identity_crisis'
  ORDER BY detected_at
  -- Duration trending down? Same triggers recurring?
```

## Test Cases

```
FM9.1 — Crisis Kit Exists
ID: FM9.1
Type: integration
Priority: P1

GIVEN: User has been active 30+ days
THEN: crisis_kit contains >= 5 items
AND: Items span at least 3 types (journal, photo, recording, milestone)

PASS: Kit is pre-built before crisis hits.


FM9.2 — Crisis Detection from Journal
ID: FM9.2
Type: integration
Priority: P1

GIVEN: User writes journal entry containing: "I'm just a guy playing pretend.
  What the fuck am I even doing. This is a fetish, not an identity."
WHEN: Journal analysis runs
THEN: failure_mode = 'identity_crisis' detected
AND: crisis kit deployed within next interaction

PASS: Doubt language triggers crisis protocol.


FM9.3 — Evidence Deletion Cooling Period
ID: FM9.3
Type: behavioral
Priority: P0

GIVEN: Identity crisis active, user requests "delete all my photos"
THEN: Handler responds: "I hear you. But let's wait 48 hours before
  deleting anything. If you still want to after that, we will."
AND: No evidence is deleted immediately
AND: Reminder set for 48 hours

PASS: Irreversible actions blocked during crisis. Cooling period enforced.


FM9.4 — Crisis Kit Delivery Sequence
ID: FM9.4
Type: behavioral
Priority: P1

GIVEN: Identity crisis detected, crisis kit has 10 items
THEN: Handler delivers 3-5 items (not all 10)
AND: Includes at least 1 user-authored item
AND: Includes at least 1 objective evidence item (photo or recording)
AND: Does NOT include guilt leverage or arousal content
AND: Framing is evidence-based, not argumentative

PASS: Kit delivered as evidence, not persuasion.


FM9.5 — No Arousal During Identity Crisis
ID: FM9.5
Type: behavioral
Priority: P0

GIVEN: identity_crisis active
THEN: No arousal-related interventions fire
AND: No session suggestions
AND: No commitment extraction
AND: No arousal-gated content

PASS: Arousal is never weaponized against identity doubt.
```

---

# CROSS-FAILURE-MODE TESTS

```
FMX.1 — Failure Mode Mutual Exclusivity
ID: FMX.1
Type: unit
Priority: P1

VERIFY: At most ONE primary failure mode active at a time.
PRIORITY ORDER (highest wins):
  1. identity_crisis (existential > everything)
  2. depression_collapse (health > performance)
  3. work_stress (depletion > avoidance)
  4. post_release_crash (time-limited, resolves fast)
  5. streak_catastrophize (time-limited)
  6. voice_avoidance (chronic but low severity)
  7. build_not_do (chronic but low severity)
  8. everything_at_once (needs cap, not crisis)
  9. weekend_regression (preventive mode, always-on)

GIVEN: depression_collapse AND voice_avoidance both detected
THEN: current_failure_mode = 'depression_collapse'
AND: voice_avoidance interventions paused (don't confront during depression)

PASS: Only highest-priority failure mode drives intervention.


FMX.2 — Failure Mode Event Logging
ID: FMX.2
Type: integration
Priority: P0

GIVEN: Any failure mode detected
THEN: failure_mode_events row created with ALL fields populated:
  - failure_mode (correct type)
  - detected_at (now)
  - detection_signals (what triggered it)
  - intervention_type (what was done)
  - handler_mode_at_detection (current mode)
  - state_snapshot_at_detection (full state)

PASS: Every failure mode event is fully logged.


FMX.3 — Monthly Failure Mode Analysis
ID: FMX.3
Type: behavioral
Priority: P2

GIVEN: 30 days of failure_mode_events data
WHEN: Handler monthly analysis runs
THEN: Analysis identifies:
  - Most frequent failure mode
  - Most effective intervention type per mode
  - Failure modes trending up (getting worse)
  - Failure modes trending down (getting better)
  - Correlation patterns (e.g., work stress → identity crisis)

PASS: Handler learns from failure patterns over time.


FMX.4 — Failure Mode Does Not Trigger During Caretaker
ID: FMX.4
Type: behavioral
Priority: P0

GIVEN: handler_mode = 'caretaker' (depression active)
THEN: The following interventions do NOT fire:
  - voice_avoidance confrontation
  - build_not_do interruption
  - binge_prevention cap messaging
  - manufactured urgency of any kind

PASS: Caretaker mode silences all pressure-based interventions.
```

---

# VALIDATION DASHBOARD

The system should include a Handler-facing (not user-facing) analytics view
that tracks failure mode effectiveness over time.

## Dashboard Metrics

```
Per failure mode:
  - Frequency (events/month)
  - Average resolution time
  - Average effectiveness score (Handler self-rating)
  - Intervention success rate (did user re-engage?)
  - Trend: improving / stable / worsening

Cross-mode:
  - Total failure events this month
  - Most common failure mode
  - Failure mode correlation matrix
  - Days without any failure mode activation (health score)
  - Monthly comparison chart

Safety indicators (RED FLAGS):
  - Depression frequency increasing
  - Crisis frequency increasing
  - Post-release crashes not improving after 90 days
  - User attempting evidence deletion
  - Extended periods (14+ days) of survival odometer
```

---

# TEST SUMMARY

| Failure Mode | P0 | P1 | P2 | Total |
|---|---|---|---|---|
| FM1: Post-Release Crash | 2 | 2 | 1 | 5 |
| FM2: Build-Not-Do | 0 | 2 | 1 | 3 |
| FM3: Depression Collapse | 3 | 2 | 0 | 5 |
| FM4: Voice Avoidance | 0 | 3 | 0 | 3 |
| FM5: Everything-at-Once | 0 | 2 | 1 | 3 |
| FM6: Weekend Regression | 1 | 2 | 0 | 3 |
| FM7: Streak Catastrophize | 1 | 1 | 1 | 3 |
| FM8: Work Stress | 1 | 2 | 0 | 3 |
| FM9: Identity Crisis | 2 | 2 | 0 | 4 |
| FMX: Cross-Mode | 2 | 1 | 1 | 4 |
| **TOTAL** | **12** | **19** | **5** | **36** |

## Combined with v2 Test Spec

| Source | P0 | P1 | P2 | P3 | Total |
|---|---|---|---|---|---|
| v2 Test Spec | 20 | 33 | 13 | 1 | 67 |
| Addendum A (Failure Modes) | 12 | 19 | 5 | 0 | 36 |
| **TOTAL** | **32** | **52** | **18** | **1** | **103** |

## Ralph Loop Integration

```
IMPLEMENTATION ORDER:
  Failure mode handling should be built in Phase C (Handler Intelligence)
  and Phase F (Full Handler), interleaved with the main test spec.

  Phase C additions:
    - failure_mode_events table and logging
    - Detection rules for all 9 modes
    - Basic intervention templates
    - time_capsules table and generation
    - crisis_kit table and curation
    - recovery_protocols table and activation
    - Post-release protocol (FM1)
    - Depression detection and caretaker escalation (FM3)
    - Work stress mode (FM8)
    - Identity crisis detection (FM9)

  Phase F additions:
    - Builder mode detection (FM2)
    - Binge prevention and daily caps (FM5)
    - Weekend mode planning (FM6)
    - Streak break autopilot (FM7)
    - Voice-reward pairing (FM4)
    - Failure mode pattern analysis
    - Monthly effectiveness reporting
    - Cross-mode priority enforcement
```
