# Vox Femina Ã— Becoming Protocol â€” Integration Specification

## 1. Integration Vision

Right now the Protocol's voice domain relies on self-reported task completion: "Did you practice voice for 5 minutes? Yes/No." That's weak data. Vox Femina replaces guesswork with objective measurement â€” the Protocol knows your actual pitch, resonance, time in feminine range, and session consistency. This transforms every voice-related system in the Protocol:

- **Handler prescriptions become specific:** Instead of "practice voice," the Handler says "Your resonance dropped since Tuesday â€” do 3 minutes of brightness drills in Vox Femina."
- **Voice avoidance detection uses real data:** Not "days since self-reported voice task" but "days since an actual recorded session with measurable effort."
- **Level advancement is evidence-based:** Advancing from Voice Level 2 to 3 requires quantifiable metrics (sustained target pitch for 5+ minutes), not self-assessment.
- **Reward pairing has a trigger:** Completing a Vox Femina session can fire Lovense haptics, unlock content, or gate edge sessions.
- **The AI coach knows Protocol context:** Claude doesn't just know your pitch â€” it knows your streak, your mood, your denial day, your avoidance patterns, and coaches accordingly.

---

## 2. Data Flow Architecture

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                     Vox Femina (Browser)                         â”‚
â”‚                                                                  â”‚
â”‚  Audio Engine â†’ Pitch/Resonance/Intonation Analysis              â”‚
â”‚       â”‚                                                          â”‚
â”‚       â–¼                                                          â”‚
â”‚  Session Summary (metrics object)                                â”‚
â”‚       â”‚                                                          â”‚
â”‚       â”œâ”€â”€â–¶ POST /api/voice-sessions (to Supabase)               â”‚
â”‚       â”‚         â†“                                                â”‚
â”‚       â”‚    â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”                        â”‚
â”‚       â”‚    â”‚  voice_sessions table      â”‚                        â”‚
â”‚       â”‚    â”‚  (Becoming Protocol DB)    â”‚                        â”‚
â”‚       â”‚    â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜                        â”‚
â”‚       â”‚               â”‚                                          â”‚
â”‚       â”‚               â–¼                                          â”‚
â”‚       â”‚    â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”                        â”‚
â”‚       â”‚    â”‚  Handler reads voice data  â”‚                        â”‚
â”‚       â”‚    â”‚  for prescriptions,        â”‚                        â”‚
â”‚       â”‚    â”‚  avoidance detection,      â”‚                        â”‚
â”‚       â”‚    â”‚  level advancement         â”‚                        â”‚
â”‚       â”‚    â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜                        â”‚
â”‚       â”‚                                                          â”‚
â”‚       â””â”€â”€â–¶ POST /api/coach (Claude API via Protocol backend)     â”‚
â”‚                 â†“                                                â”‚
â”‚            Claude receives:                                      â”‚
â”‚            - Voice session metrics                               â”‚
â”‚            - Protocol state (streak, mood, denial day, level)    â”‚
â”‚            - Voice history trend                                 â”‚
â”‚            - Handler's current coaching directive                â”‚
â”‚                 â†“                                                â”‚
â”‚            Returns: Context-aware coaching                       â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

---

## 3. Database Schema (Supabase Extension)

### 3.1 New Table: voice_sessions

```sql
CREATE TABLE voice_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  
  -- Session metadata
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ NOT NULL,
  duration_seconds INTEGER NOT NULL,
  exercise_type TEXT, -- 'free_practice' | 'pitch_glide' | 'sustained_vowel' | 'reading_passage'
  
  -- Pitch metrics
  avg_pitch_hz NUMERIC NOT NULL,
  min_pitch_hz NUMERIC,
  max_pitch_hz NUMERIC,
  pitch_std_dev NUMERIC,
  target_min_hz NUMERIC DEFAULT 180,
  target_max_hz NUMERIC DEFAULT 250,
  time_in_target_pct NUMERIC, -- 0-100, percentage of session in target range
  
  -- Resonance metrics
  avg_spectral_centroid NUMERIC,
  resonance_score NUMERIC, -- 0-1, normalized dark-to-bright
  
  -- Intonation metrics
  intonation_variability NUMERIC, -- pitch std dev over phrases
  intonation_classification TEXT, -- 'monotone' | 'moderate' | 'melodic'
  
  -- Protocol integration
  prescribed_by_handler BOOLEAN DEFAULT FALSE,
  handler_task_id UUID REFERENCES daily_tasks,
  protocol_state_snapshot JSONB, -- snapshot of user state at session time
  
  -- AI coaching
  coaching_requested BOOLEAN DEFAULT FALSE,
  coaching_conversation JSONB, -- full conversation history with Claude
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for Handler queries
CREATE INDEX idx_voice_sessions_user_date ON voice_sessions(user_id, started_at DESC);
CREATE INDEX idx_voice_sessions_prescribed ON voice_sessions(user_id, prescribed_by_handler);
```

### 3.2 New Table: voice_baselines

```sql
CREATE TABLE voice_baselines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  
  metric TEXT NOT NULL, -- 'avg_pitch' | 'time_in_target' | 'resonance' | 'intonation'
  baseline_value NUMERIC NOT NULL,
  previous_baseline NUMERIC,
  measurement_count INTEGER NOT NULL, -- how many sessions this baseline is based on
  established_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, metric)
);
```

### 3.3 New Table: voice_recordings (Evidence)

```sql
CREATE TABLE voice_recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  session_id UUID REFERENCES voice_sessions,
  
  -- Recording metadata (audio stored locally, not in DB)
  duration_seconds INTEGER NOT NULL,
  recording_type TEXT NOT NULL, -- 'baseline' | 'exercise' | 'phrase' | 'conversation'
  phrase_text TEXT, -- what they were asked to say
  
  -- Analysis at time of recording
  avg_pitch_hz NUMERIC,
  resonance_score NUMERIC,
  
  -- Protocol evidence link
  evidence_id UUID REFERENCES evidence, -- links to Protocol's evidence gallery
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 4. Handler Integration Points

### 4.1 Voice Task Prescription (Enhanced)

The Handler currently prescribes generic voice tasks. With Vox Femina, prescriptions become specific and data-driven:

```typescript
// Handler voice prescription logic (extends RulesEngine)

interface VoiceTaskPrescription {
  type: 'vox_femina_session';
  exercise: 'free_practice' | 'pitch_glide' | 'sustained_vowel' | 'reading_passage';
  target_duration_minutes: number;
  focus_area: 'pitch' | 'resonance' | 'intonation' | 'general';
  target_metrics?: {
    min_pitch_hz?: number;
    target_resonance?: number;
    target_time_in_range_pct?: number;
  };
  handler_coaching_directive?: string; // injected into Claude's coaching prompt
  completion_reward?: {
    type: 'points' | 'haptic' | 'content_unlock' | 'session_gate';
    value: any;
  };
}

function prescribeVoiceTask(state: UserState, voiceHistory: VoiceSession[]): VoiceTaskPrescription {
  const recentSessions = voiceHistory.filter(s => isWithinDays(s.started_at, 7));
  const lastSession = recentSessions[0];
  
  // Determine focus area based on weakest metric
  let focus: 'pitch' | 'resonance' | 'intonation' = 'pitch';
  if (lastSession) {
    if (lastSession.avg_pitch_hz >= 180 && lastSession.resonance_score < 0.5) {
      focus = 'resonance'; // Pitch is OK but resonance needs work
    } else if (lastSession.avg_pitch_hz >= 180 && lastSession.resonance_score >= 0.5 
               && lastSession.intonation_classification === 'monotone') {
      focus = 'intonation'; // Pitch and resonance OK, intonation needs work
    }
  }
  
  // Scale difficulty to voice domain level
  const voiceLevel = state.domainLevels?.voice || 1;
  const duration = [2, 5, 10, 15, 20][voiceLevel - 1]; // Level 1: 2 min, Level 5: 20 min
  
  // Pick exercise based on focus
  const exerciseMap = {
    pitch: 'pitch_glide',
    resonance: 'sustained_vowel', // resonance is easier to feel on sustained sounds
    intonation: 'reading_passage', // intonation shows in connected speech
  };
  
  return {
    type: 'vox_femina_session',
    exercise: exerciseMap[focus],
    target_duration_minutes: duration,
    focus_area: focus,
    target_metrics: {
      min_pitch_hz: 180,
      target_resonance: Math.min(0.3 + (voiceLevel * 0.1), 0.7),
      target_time_in_range_pct: Math.min(30 + (voiceLevel * 10), 70),
    },
    handler_coaching_directive: generateCoachingDirective(state, lastSession, focus),
    completion_reward: determineReward(state, voiceLevel),
  };
}
```

### 4.2 Voice Avoidance Detection (Enhanced with Real Data)

The Protocol's Failure Mode 4 (Voice Avoidance) currently detects avoidance based on self-reported task completion gaps. With Vox Femina, detection becomes much sharper:

```typescript
// Enhanced voice avoidance detection

interface VoiceAvoidanceSignals {
  daysSinceSession: number;         // days since last Vox Femina session
  sessionQuality: 'genuine' | 'token' | 'none'; // was effort real?
  prescribedButSkipped: number;     // Handler prescribed voice, user didn't do it
  otherDomainsActive: boolean;      // completing tasks in other domains?
  pitchTrending: 'up' | 'flat' | 'down' | 'unknown';
}

function detectVoiceAvoidance(signals: VoiceAvoidanceSignals): AvoidanceLevel {
  // Token sessions: sessions < 60 seconds or pitch never enters target range
  // These count as avoidance â€” the user is technically "doing it" but not trying
  
  if (signals.daysSinceSession >= 3 && signals.otherDomainsActive) {
    return 'confirmed'; // Classic avoidance pattern
  }
  
  if (signals.sessionQuality === 'token' && signals.prescribedButSkipped >= 2) {
    return 'confirmed'; // Going through motions
  }
  
  if (signals.daysSinceSession >= 2 && signals.pitchTrending === 'down') {
    return 'early_warning'; // Skills regressing
  }
  
  return 'none';
}
```

### 4.3 Voice Level Advancement Criteria (Objective)

The Protocol defines 5 voice levels. With Vox Femina, advancement becomes measurable:

```typescript
// Voice domain level advancement (evidence-based)

const VOICE_LEVEL_CRITERIA = {
  1: { // Awareness â†’ Foundation
    requirements: [
      'Completed baseline recording in Vox Femina',
      'Completed 3+ Vox Femina sessions (any length)',
      'Average pitch measured and tracked',
    ],
    metrics: {
      min_sessions: 3,
      baseline_recorded: true,
    }
  },
  2: { // Foundation â†’ Control
    requirements: [
      '14-day practice streak (sessions in Vox Femina)',
      'Average pitch shifted +30 Hz from baseline',
      'Time in target range > 30% in recent sessions',
    ],
    metrics: {
      streak_days: 14,
      pitch_shift_from_baseline: 30, // Hz
      min_time_in_target_pct: 30,
    }
  },
  3: { // Control â†’ Conversation
    requirements: [
      'Sustained target pitch for 5+ minutes in a session',
      'Resonance score consistently > 0.5',
      'Intonation classified as "moderate" or "melodic"',
    ],
    metrics: {
      sustained_target_minutes: 5,
      min_resonance_score: 0.5,
      intonation_above_monotone: true,
    }
  },
  4: { // Conversation â†’ Integration
    requirements: [
      'Used trained voice in 3+ real conversations (self-reported + recording)',
      'Average session pitch in feminine range without warmup',
      'Resonance score consistently > 0.6',
    ],
    metrics: {
      real_conversation_uses: 3,
      cold_start_pitch_in_range: true,
      min_resonance_score: 0.6,
    }
  },
  5: { // Integration â†’ Default
    requirements: [
      'Full day without breaking trained voice (self-reported)',
      'Cold-start pitch consistently in feminine range across 10+ sessions',
      'All metrics at or above target for 30+ days',
    ],
    metrics: {
      consecutive_in_range_sessions: 10,
      all_metrics_target_days: 30,
    }
  },
};
```

### 4.4 Reward Pairing (Vox Femina Ã— Lovense / Content)

```typescript
// Voice session completion triggers Protocol rewards

async function onVoiceSessionComplete(session: VoiceSession, state: UserState) {
  // 1. Log completion as Protocol task
  await completeProtocolTask({
    domain: 'voice',
    category: 'practice',
    duration_minutes: session.duration_seconds / 60,
    evidence: {
      type: 'voice_session',
      session_id: session.id,
      metrics: {
        avg_pitch: session.avg_pitch_hz,
        time_in_target: session.time_in_target_pct,
        resonance: session.resonance_score,
      }
    }
  });
  
  // 2. Points based on quality, not just completion
  const points = calculateVoicePoints(session);
  await awardPoints(state.user_id, points, 'voice_session');
  
  // 3. Haptic reward if Lovense connected
  if (state.lovenseConnected) {
    if (session.time_in_target_pct > 50) {
      await sendLovenseCommand('voice_session_good', 'voice_complete', session.id);
    } else {
      await sendLovenseCommand('task_complete', 'voice_complete', session.id); // smaller reward
    }
  }
  
  // 4. Content unlock (variable ratio)
  if (Math.random() < 0.2) { // 20% chance
    await unlockContent(state.user_id, 'voice_tip'); // Voice training tip unlocked
  }
  
  // 5. Update baselines (ratchet)
  await updateVoiceBaseline(state.user_id, session);
  
  // 6. Check level advancement
  await checkVoiceLevelAdvancement(state.user_id);
}

function calculateVoicePoints(session: VoiceSession): number {
  let points = 10; // base points for any session
  
  if (session.duration_seconds >= 300) points += 10;  // 5+ minutes
  if (session.time_in_target_pct > 30) points += 10;  // decent time in range
  if (session.time_in_target_pct > 60) points += 15;  // strong time in range
  if (session.resonance_score > 0.5) points += 10;    // good resonance
  if (session.intonation_classification === 'melodic') points += 10; // melodic speech
  
  return points;
}
```

### 4.5 Pre-Session Voice Gate

The Protocol already defines voice gating for edge sessions after 7+ days of avoidance. With Vox Femina, this becomes concrete:

```typescript
// Voice gate for edge sessions

async function canStartEdgeSession(state: UserState): Promise<GateResult> {
  if (!isVoiceAvoidanceActive(state)) {
    return { allowed: true };
  }
  
  // Voice avoidance active â€” require Vox Femina proof
  return {
    allowed: false,
    gate: {
      type: 'voice_session_required',
      message: "Her voice opens the door. Complete a 60-second Vox Femina session first.",
      minimum_duration_seconds: 60,
      minimum_effort: true, // must actually speak (pitch detected for > 30 seconds)
      onComplete: () => {
        // Unlock the edge session
        return { allowed: true };
      }
    }
  };
}
```

---

## 5. Enhanced AI Coaching (Protocol-Aware)

### 5.1 Context-Enriched System Prompt

When a user requests coaching in Vox Femina, the backend enriches the Claude prompt with Protocol state:

```typescript
function buildCoachingPrompt(
  voiceMetrics: VoiceSessionMetrics,
  protocolState: UserState,
  voiceHistory: VoiceSession[],
  handlerDirective?: string
): string {
  
  const basePrompt = `You are Vox Femina Coach, an expert voice feminization coach for MTF 
transgender individuals. You are knowledgeable, warm, affirming, and encouraging.`;

  const contextBlock = `
CURRENT SESSION METRICS:
- Average pitch: ${voiceMetrics.avg_pitch_hz} Hz
- Time in target range (${voiceMetrics.target_min_hz}-${voiceMetrics.target_max_hz} Hz): ${voiceMetrics.time_in_target_pct}%
- Resonance score: ${voiceMetrics.resonance_score} (0=dark/chest, 1=bright/head)
- Intonation: ${voiceMetrics.intonation_classification}
- Session duration: ${Math.round(voiceMetrics.duration_seconds / 60)} minutes

VOICE TRAINING HISTORY (last 7 days):
- Sessions this week: ${voiceHistory.length}
- Pitch trend: ${calculatePitchTrend(voiceHistory)}
- Best session this week: ${getBestSession(voiceHistory)}
- Voice domain level: ${protocolState.domainLevels?.voice || 1} of 5

PROTOCOL CONTEXT (use to personalize tone, DO NOT reference directly):
- Overall streak: ${protocolState.streakDays} days
- Current mood: ${protocolState.currentMood || 'unknown'}
- Practice consistency: ${protocolState.tasksCompletedToday} tasks today
- Time of day: ${protocolState.timeOfDay}
${handlerDirective ? `\nHANDLER DIRECTIVE (follow this guidance for coaching focus):\n${handlerDirective}` : ''}
`;

  const toneGuidance = `
COACHING APPROACH:
${protocolState.currentMood && protocolState.currentMood <= 3 
  ? '- User may be in a low mood. Be extra gentle and celebratory of any effort.'
  : '- User is in good spirits. You can push a bit and set ambitious targets.'}
${protocolState.streakDays > 14 
  ? '- Strong streak going. Reference their consistency as evidence of commitment.'
  : '- Building momentum. Focus on making practice feel rewarding, not obligatory.'}
${voiceHistory.length === 0 
  ? '- This appears to be their first session! Make it feel exciting and low-pressure.'
  : ''}
`;

  return basePrompt + contextBlock + toneGuidance;
}
```

### 5.2 Handler Coaching Directives

The Handler can inject specific coaching directions based on the user's Protocol state:

```typescript
function generateCoachingDirective(
  state: UserState, 
  lastSession: VoiceSession | null, 
  focus: string
): string {
  
  // If voice avoidance was active and user just showed up
  if (state.voiceAvoidanceDays >= 3) {
    return `The user has been avoiding voice practice for ${state.voiceAvoidanceDays} days. 
    They just showed up. Do NOT mention the gap negatively. Instead, celebrate that they're 
    here NOW. Make this session feel like a win. Keep it short and sweet. 
    Plant the seed: "Tomorrow, just 2 minutes. That's all."`;
  }
  
  // If pitch is plateauing
  if (lastSession && isPitchPlateaued(state.user_id)) {
    return `The user's pitch has plateaued around ${lastSession.avg_pitch_hz} Hz for the 
    past week. They may be frustrated. Validate that plateaus are NORMAL and often precede 
    breakthroughs. Suggest a resonance-focused session instead â€” shifting the focus can 
    break through pitch walls indirectly.`;
  }
  
  // If they're on a hot streak
  if (state.streakDays > 7 && focus === 'general') {
    return `The user is on a ${state.streakDays}-day streak and their voice metrics are 
    improving. Push them slightly outside comfort zone. Suggest they try using their 
    practiced voice for one real interaction today â€” ordering coffee, calling a store, etc. 
    Frame it as "field testing" not "passing."`;
  }
  
  // If arousal is high and voice is being paired
  if (state.currentArousal >= 3) {
    return `The user is in a heightened state. Keep coaching brief and sensory. 
    Focus on how the voice FEELS, not just the numbers. "Notice how your throat 
    opens when you relax into that pitch." Create positive body associations.`;
  }
  
  return ''; // No special directive
}
```

---

## 6. UI Integration

### 6.1 Launching Vox Femina from the Protocol

Vox Femina can be launched as a view within the Protocol app or as a linked standalone app:

**Option A: Embedded View (Recommended)**
Vox Femina's audio engine and UI components are built as a React module that slots into the Protocol's component tree. The Today View's TaskCard renders a "Start Voice Session" button that expands into the Vox Femina interface inline.

**Option B: Linked App**
Vox Femina runs on a separate port. The Protocol's TaskCard links to it with query params containing the prescription:
```
http://localhost:3001/session?exercise=pitch_glide&duration=5&focus=resonance&task_id=abc123
```
On session complete, Vox Femina posts results back to the Protocol's API.

### 6.2 Protocol UI Enhancements

**Today View â€” Voice Task Card:**
Instead of a generic "Practice voice for 5 minutes" checkbox, the voice task card shows:
- Last session's key metric (e.g., "Avg pitch: 172 Hz â€” 8 Hz from target")
- A "Start Vox Femina" button that opens the training interface
- On completion: session summary with metrics, not just a checkmark

**Dashboard View â€” Voice Domain:**
The voice domain progress bar now shows real data:
- Current level with objective advancement criteria
- Pitch trend sparkline (last 10 sessions)
- "Personal best" badges (highest time-in-target, best resonance score)
- Baseline ratchet indicator (your floor is rising)

**Evidence Gallery â€” Voice Tab:**
Voice recordings captured during sessions appear as playable evidence items with:
- Waveform visualization
- Pitch/resonance metrics at time of recording
- Date and session context
- Before/after comparisons (earliest recording vs. most recent)

### 6.3 Notification Integration

The Protocol's variable-ratio notification system can include voice-specific prompts:

```typescript
const voiceNotifications = [
  {
    trigger: 'random',
    frequency: 0.15, // 15% of notifications
    templates: [
      "Quick voice check: say 'Hello, my name is Maxy' in your practiced pitch. Just once. That's today's voice task.",
      "Resonance moment: hum for 30 seconds. Feel it in your face, not your chest. That's her resonance.",
      "Voice tip unlocked: Open Vox Femina to see today's technique.",
    ]
  },
  {
    trigger: 'post_session', // after edge session
    templates: [
      "Dopamine is high. Perfect window. 60 seconds of voice practice right now wires pleasure to her voice.",
    ]
  },
  {
    trigger: 'morning',
    templates: [
      "Morning warmup: 2-minute pitch glide in Vox Femina before coffee. Start the day in her range.",
    ]
  }
];
```

---

## 7. Architecture Decision: Embedded vs. Standalone

### Recommendation: Start Standalone, Plan for Embedded

**Phase 1 (now):** Build Vox Femina as a standalone app per the original spec. Add the Supabase integration layer so it writes to the Protocol's database. The Protocol reads voice data but doesn't control the Vox Femina UI.

**Phase 2 (after MVP validated):** Extract Vox Femina's audio engine and core components into a shared package. Embed the voice training interface directly into the Protocol's Today View as an expandable panel. The Handler now fully controls when and how voice training appears.

**Rationale:** Building standalone first lets you validate the audio pipeline and coaching without coupling to Protocol complexity. The data integration (writing to Supabase) is simple and can happen from day one. Full UI embedding is a refactor, not a rewrite.

### Shared Infrastructure

Both apps share:
- **Supabase instance** (same database, same auth)
- **Claude API key** (same backend proxy, different system prompts)
- **User identity** (same auth token)

Vox Femina just needs the Supabase client configured to write to the Protocol's database, and the Protocol needs queries to read from voice_sessions.

---

## 8. Updated Cost Estimate

| Item | Cost |
|------|------|
| Building (Claude Code via Pro subscription) | $0 additional |
| Claude API â€” Voice coaching (~10-15 calls/session) | ~$0.15â€“0.45/session |
| Claude API â€” Handler prescriptions (already budgeted) | included in Protocol costs |
| Supabase (already running for Protocol) | $0 additional |
| Hosting (localhost) | $0 |
| **Total additional ongoing cost** | **~$3â€“10/month for voice coaching** |

---

## 9. New Test Cases for Integration

### TC-INT-1: Voice Session Writes to Protocol DB
- Action: Complete a Vox Femina session
- Expected: Row inserted in voice_sessions table with correct metrics
- Automated: Query Supabase after session, verify row exists

### TC-INT-2: Handler Reads Voice Data
- Precondition: 3 voice sessions in DB
- Action: Handler generates daily plan
- Expected: Voice prescription references historical metrics
- Automated: Mock Handler with known voice data, verify prescription includes focus area

### TC-INT-3: Voice Avoidance Detection (Real Data)
- Precondition: 4 days with no voice_sessions rows, daily_tasks completed in other domains
- Action: Handler checks for avoidance
- Expected: voice_avoidance event created
- Automated: Insert test data, run avoidance check, verify event

### TC-INT-4: Level Advancement Trigger
- Precondition: User at Voice Level 1, 3+ sessions completed with baseline recorded
- Action: System checks advancement criteria
- Expected: escalation_state updated to voice level 2
- Automated: Insert qualifying sessions, run level check, verify escalation_state

### TC-INT-5: Voice Gate for Edge Sessions
- Precondition: voice_avoidance active for 7+ days, user requests edge session
- Action: Session launcher checks gates
- Expected: Gate blocks session, shows "Complete 60-second voice session first"
- Automated: Set avoidance state, call canStartEdgeSession, verify gate returned

### TC-INT-6: Coaching Includes Protocol Context
- Action: Request coaching with known Protocol state (streak=12, mood=7, denial_day=3)
- Expected: Claude prompt includes streak, mood, and appropriate tone guidance
- Automated: Intercept prompt sent to Claude API, verify context block present

### TC-INT-7: Haptic Reward on Session Complete
- Precondition: Lovense connected, session with time_in_target > 50%
- Action: Complete voice session
- Expected: Lovense command fired with 'voice_session_good' pattern
- Automated: Mock Lovense API, verify command sent with correct pattern

### TC-INT-8: Evidence Gallery Integration
- Action: Complete voice session with recording
- Expected: Recording appears in Protocol's evidence gallery with voice domain badge
- Automated: Complete session, query evidence table, verify voice recording row exists

### TC-INT-9: Baseline Ratchet
- Precondition: Existing baseline avg_pitch = 160 Hz
- Action: Complete 3 sessions averaging 175 Hz
- Expected: Baseline updates to 175 Hz, previous_baseline stores 160 Hz
- Automated: Insert qualifying sessions, run baseline update, verify values

### TC-INT-10: Privacy â€” No Audio Leaves Browser
- Action: Monitor all network requests during a voice session
- Expected: Only numeric metrics sent to Supabase/Claude. Zero audio data transmitted.
- Automated: Intercept all fetch/XHR, assert no audio MIME types or large binary payloads
