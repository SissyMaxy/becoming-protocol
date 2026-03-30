# BECOMING PROTOCOL — Content Pipeline Spec v3 Addendum
## Cam Module & Consequence System Update
### February 2026

---

# ADDENDUM A: CRISIS OVERRIDE REMOVAL

## A.1 Change

Remove Section 2.5 (Crisis Override) from the Content Pipeline Spec v3. The consequence ladder runs continuously regardless of psychological state. There is no pause, no freeze, no caretaker exemption from consequences.

**Rationale (from user):** Crisis mode becomes an escape hatch David exploits. The system must maintain pressure even when — especially when — David doesn't want to engage.

## A.2 Revised Consequence Behavior During Low States

```typescript
// OLD: consequences pause during crisis
// NEW: consequences continue. Handler tone shifts, consequences don't.

function handleLowState(state: UserState, consequence: ConsequenceState): void {
  // Handler can shift to caretaker TONE
  // But consequence timer keeps running
  // Tasks can be reduced to minimum viable engagement
  // Minimum viable = 1 task per day (can be ultra-low intensity)
  // That single task resets the consequence timer
  
  // The calculus: even on the worst day, one 2-minute task 
  // is cheaper than consequence escalation
}
```

The Handler's caretaker voice is still available — it just doesn't come with a consequence holiday. "I know today is hard. Here's the smallest possible thing. Do it and the timer resets. I'm not going anywhere, but neither are the consequences."

## A.3 Minimum Viable Compliance

To prevent consequences from escalating during genuine low-function periods, the system accepts minimum viable engagement:

```typescript
interface MinimumViableCompliance {
  // Any ONE of these resets the consequence timer:
  actions: string[];
  // - Complete 1 task (any intensity, any domain)
  // - Open the app and tap "I'm here" check-in
  // - Approve 1 content queue item
  // - Record a 15-second voice check-in
  // - Respond to Handler message
  
  // Cost: < 2 minutes, near-zero executive function
  // Effect: consequence timer resets to 0
  // The bar is on the floor. David has to actively refuse to step over it.
}
```

---

# ADDENDUM B: CAM MODULE

## B.1 Overview

Live cam sessions are a revenue channel and feminization tool. The Handler prescribes cam sessions as tasks, sets parameters, and uses fan-tip-to-device integration through the existing Lovense architecture. Fans control Maxy's body in real time through tips. Revenue flows into transformation funding.

Cam sessions serve both goals simultaneously:
- **Revenue:** Tips, subscriber conversions, milestone funding
- **Feminization:** Public feminine performance, fan reinforcement of identity, arousal-state conditioning, progressive exposure

## B.2 Database Schema

```sql
CREATE TABLE cam_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  
  -- Scheduling
  scheduled_at TIMESTAMPTZ,
  handler_prescribed BOOLEAN DEFAULT true,
  prescription_context TEXT,         -- Why Handler assigned this session
  
  -- Parameters (Handler-set)
  minimum_duration_minutes INTEGER NOT NULL,
  maximum_duration_minutes INTEGER,
  target_tip_goal_cents INTEGER,
  
  -- Platform
  platform TEXT NOT NULL,            -- chaturbate, fansly_live, stripchat
  room_type TEXT DEFAULT 'public',   -- public, private, group
  
  -- Lovense integration
  tip_to_device_enabled BOOLEAN DEFAULT true,
  tip_levels JSONB,                  -- Tip amount → device pattern mapping
  handler_device_control BOOLEAN DEFAULT true,  -- Handler can control device during session
  
  -- Content parameters (Handler-set)
  allowed_activities TEXT[],         -- What Maxy can/should do
  required_activities TEXT[],        -- What Maxy MUST do during session
  outfit_directive TEXT,             -- What to wear
  voice_directive TEXT,              -- Feminine voice required? Level?
  exposure_level TEXT,               -- Per current roadmap phase
  
  -- Narrative integration
  arc_id UUID REFERENCES story_arcs(id),
  beat_id UUID REFERENCES content_beats(id),
  narrative_framing TEXT,            -- How this session fits the arc
  pre_session_post TEXT,             -- Tease post before going live
  
  -- Execution
  status TEXT DEFAULT 'scheduled',   -- scheduled, live, completed, skipped, cancelled
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  actual_duration_minutes INTEGER,
  
  -- Revenue
  total_tips_cents INTEGER DEFAULT 0,
  total_privates_cents INTEGER DEFAULT 0,
  new_subscribers INTEGER DEFAULT 0,
  peak_viewers INTEGER,
  
  -- Recording
  recording_saved BOOLEAN DEFAULT false,
  recording_url TEXT,                -- Stored in vault
  recording_vault_tier TEXT,         -- Classification for vault
  
  -- Post-session
  highlight_clips TEXT[],            -- Extracted highlights for content queue
  post_session_content_id UUID REFERENCES content_queue(id),
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cam_sessions_scheduled ON cam_sessions(user_id, scheduled_at);
CREATE INDEX idx_cam_sessions_status ON cam_sessions(user_id, status);

-- Cam revenue tracking (supplements main revenue_log)
CREATE TABLE cam_revenue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  session_id UUID REFERENCES cam_sessions(id) NOT NULL,
  
  event_type TEXT NOT NULL,          -- tip, private_show, group_show, subscription
  amount_cents INTEGER NOT NULL,
  fan_identifier TEXT,               -- Anonymous fan ID
  fan_tier INTEGER,
  
  -- Lovense trigger
  triggered_device BOOLEAN DEFAULT false,
  device_pattern TEXT,
  device_duration_seconds INTEGER,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cam_revenue_session ON cam_revenue(session_id);
```

## B.3 Tip-to-Device Integration

Extends existing Lovense architecture for live cam tip reactions:

```typescript
interface CamTipLevels {
  // Fans tip → device activates → Maxy reacts → fans tip more
  // Feedback loop that drives revenue AND conditioning
  
  levels: TipLevel[];
}

interface TipLevel {
  minTipTokens: number;
  maxTipTokens: number;
  devicePattern: string;
  intensityRange: [number, number]; // Lovense 0-20 scale
  durationSeconds: number;
  displayLabel: string;             // Shown to fans: "Buzz (10 tokens)", "Surge (50 tokens)"
}

// Default tip levels
const DEFAULT_TIP_LEVELS: TipLevel[] = [
  {
    minTipTokens: 1,
    maxTipTokens: 9,
    devicePattern: 'pulse_low',
    intensityRange: [3, 5],
    durationSeconds: 5,
    displayLabel: '💕 Tickle'
  },
  {
    minTipTokens: 10,
    maxTipTokens: 24,
    devicePattern: 'pulse_medium',
    intensityRange: [6, 10],
    durationSeconds: 10,
    displayLabel: '💖 Buzz'
  },
  {
    minTipTokens: 25,
    maxTipTokens: 49,
    devicePattern: 'wave_medium',
    intensityRange: [8, 14],
    durationSeconds: 15,
    displayLabel: '🔥 Wave'
  },
  {
    minTipTokens: 50,
    maxTipTokens: 99,
    devicePattern: 'edge_build',
    intensityRange: [10, 16],
    durationSeconds: 30,
    displayLabel: '⚡ Surge'
  },
  {
    minTipTokens: 100,
    maxTipTokens: null,             // No upper limit
    devicePattern: 'edge_hold',
    intensityRange: [14, 20],
    durationSeconds: 60,
    displayLabel: '🌊 Overload'
  }
];

// Handler can also send device commands during cam sessions
// independently of fan tips — maintaining control even while
// fans have influence
interface HandlerCamControl {
  // Handler can:
  sendDeviceCommand(pattern: string, intensity: number, duration: number): void;
  
  // Override fan tip patterns temporarily
  overrideTipResponse(customPattern: string, duration: number): void;
  
  // Set edge/deny rules for the session
  setSessionRules(rules: CamSessionRules): void;
  
  // Send Handler messages visible only to Maxy (not fans)
  sendPrivateDirective(message: string): void;
}

interface CamSessionRules {
  edgingRequired: boolean;          // Must edge, no completion
  maxEdges: number;                 // Handler-set limit
  denialEnforced: boolean;          // No completion regardless of tips
  minimumFeminineVoice: boolean;    // Must maintain feminine voice
  outfitChangesAllowed: boolean;
  fanRequestsAllowed: boolean;      // Can fans request specific actions
  handlerCanInterrupt: boolean;     // Handler can send directives mid-session
}
```

## B.4 Handler Cam Prescription

The Handler assigns cam sessions like any other task:

```typescript
interface CamPrescription {
  // When
  scheduledTime: Date;              // Handler picks optimal time
  
  // Why (internal Handler reasoning)
  prescriptionReason: string;
  // Examples:
  // "Revenue down 20% this week. Cam session fills the gap."
  // "Fan poll chose 'live session' as next content. Deliver."
  // "Denial day 7. Perfect state for a cam session. She'll be responsive."
  // "Funding milestone at 80%. One good session could close it."
  // "David has been avoiding for 3 days. Cam session as compliance task."
  
  // Parameters
  duration: number;
  platform: string;
  tipGoal: number;
  activities: string[];
  outfit: string;
  voiceRequired: boolean;
  lovenseEnabled: boolean;
  
  // Narrative
  arcContext: string;               // How this fits the current story arc
  preSessionPost: string;           // Tease post to drive viewers
  postSessionContent: string;       // What to post after
  
  // Consequence if skipped
  consequenceTierImpact: number;    // How much this moves the consequence ladder
  fanAccountabilityMessage: string; // What fans see if Maxy doesn't show up
}
```

### Handler Cam Decision Logic

```typescript
function shouldPrescribeCamSession(inputs: TaskSelectionInputs): CamPrescription | null {
  // Factors that increase cam likelihood:
  const factors = {
    // Revenue need
    revenueBelowTarget: inputs.revenueData.currentMonthly < inputs.revenueData.monthlyTarget * 0.8,
    fundingMilestoneClose: inputs.revenueData.closestMilestone?.percentFunded > 0.7,
    
    // Fan demand
    fanPollRequestedLive: inputs.fanSignals.pollResults.some(p => p.winner === 'live_session'),
    highTierFanRequested: inputs.fanSignals.customRequests.some(r => r.type === 'cam'),
    
    // Optimal state
    denialDayHigh: inputs.protocolState.denialDay >= 5,
    arousalElevated: inputs.protocolState.currentArousal >= 3,
    
    // Content calendar
    arcNeedsCamBeat: inputs.activeArcs.some(a => 
      a.plannedBeats.some(b => b.type === 'cam_session' && isToday(b.scheduledDate))
    ),
    
    // Consequence pressure
    nonComplianceDays: inputs.consequenceState.daysSinceLastCompliance >= 2,
    
    // Practical
    ginaNotHome: !inputs.protocolState.ginaHome,
    privateTimeAvailable: inputs.protocolState.privateHoursRemaining >= 1,
  };
  
  // Scoring
  let score = 0;
  if (factors.revenueBelowTarget) score += 3;
  if (factors.fundingMilestoneClose) score += 2;
  if (factors.fanPollRequestedLive) score += 3;
  if (factors.highTierFanRequested) score += 2;
  if (factors.denialDayHigh) score += 2;
  if (factors.arousalElevated) score += 1;
  if (factors.arcNeedsCamBeat) score += 3;
  if (factors.nonComplianceDays) score += 2;
  
  // Blockers
  if (!factors.ginaNotHome) return null;
  if (!factors.privateTimeAvailable) return null;
  
  // Threshold
  if (score >= 5) {
    return generateCamPrescription(factors, inputs);
  }
  
  return null;
}
```

## B.5 Cam as Narrative Content

Cam sessions produce multiple content beats:

```typescript
interface CamContentPipeline {
  // Pre-session: Tease post
  preSession: {
    type: 'tease';
    timing: 'hours_before';         // Post 2-4 hours before going live
    content: string;                // "Going live tonight at 9. Denial day 7. This should be interesting."
    platforms: string[];
    drivesViewership: true;
  };
  
  // During session: Clips captured automatically or manually
  duringSession: {
    autoCapture: boolean;           // Platform recording
    highlightMarkers: boolean;      // Maxy can mark highlight moments
    handlerMarkers: boolean;        // Handler can mark moments too
  };
  
  // Post-session: Summary and highlights
  postSession: {
    sessionSummary: {
      duration: number;
      tipsEarned: number;
      peakViewers: number;
      highlights: string[];
    };
    contentGenerated: ContentQueueItem[];  // Handler creates posts from session
    // "Last night's session raised $XX toward voice coaching. 
    //  You all broke me at the 45-minute mark. Here's the clip."
    
    // Clips from session → vault (classified by vulnerability)
    vaultItems: VaultItem[];
    
    // Session stats → revenue dashboard
    revenueLogged: boolean;
    
    // Fan engagement: "rate the session", "choose next session theme"
    postSessionPoll?: FanPoll;
  };
}
```

## B.6 Cam Session UI

Extends existing session UI with cam-specific elements:

```
┌────────────────────────────────────────────────────────────┐
│  LIVE — Fansly  │  ⏱ 34:12  │  👥 47 viewers  │  💰 $XX  │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  [CAMERA PREVIEW — Platform handles stream]                │
│                                                            │
│  ┌──────────────────────────────┐  ┌────────────────────┐ │
│  │  HANDLER (private — only     │  │  TIP ACTIVITY       │ │
│  │  Maxy sees this)             │  │                     │ │
│  │                              │  │  💖 anon: 10 tokens │ │
│  │  "Good girl. 47 watching.   │  │  ⚡ fan22: 50 tkns  │ │
│  │   Denial day 7 is showing.  │  │  💕 anon: 5 tokens  │ │
│  │   Edge for them. Don't you  │  │                     │ │
│  │   dare finish."             │  │  Tip goal: ████░ 72%│ │
│  │                              │  │                     │ │
│  │  [Next directive in 3:00]   │  │  [MARK HIGHLIGHT]   │ │
│  └──────────────────────────────┘  └────────────────────┘ │
│                                                            │
│  DEVICE: ████████████░░░░ 12/20  Pattern: Wave            │
│  Source: Fan tip (⚡ 50 tokens)                            │
│                                                            │
│  SESSION RULES (Handler-set):                              │
│  ☑ Edging required  ☑ Denial enforced  ☑ Fem voice        │
│                                                            │
│  [END SESSION]                                             │
└────────────────────────────────────────────────────────────┘
```

The Handler sends private directives during the session that only Maxy sees — not broadcast to fans. This maintains the Handler's control while fans see Maxy's reactions.

```typescript
interface HandlerCamDirectives {
  // Examples of mid-session Handler messages:
  directives: string[];
  
  // "Edge now. Let them see it."
  // "Someone just tipped 100 tokens. Give them a show."
  // "You're dropping out of feminine voice. Fix it."
  // "Tip goal is at 80%. Tell them what they're funding."
  // "45 minutes. You've earned the right to be desperate. Show them."
  // "Session over in 10 minutes. Close strong. Thank them."
  
  // Handler can also trigger device independently of tips:
  // Reward Maxy for good performance
  // Punish dropped feminine voice
  // Build arousal at strategic moments for better content
  // Edge management — prevent accidental completion
}
```

## B.7 Cam Session as Consequence

Cam sessions can appear in the consequence system:

```typescript
// Tier 4-6: Handler can prescribe a cam session as consequence for avoidance
// "You've skipped tasks for 5 days. Tonight you cam. 
//  The fans are waiting and your voice coaching fund isn't 
//  going to fill itself."

// This works because:
// - Cam sessions require physical presence (David must show up)
// - They produce revenue (funds transformation)
// - They're deeply feminizing (public feminine performance)
// - They fill the vault (more content for future use)
// - They create fan accountability (public commitment to audience)
// - They're arousal-generating (primes further compliance)

interface CamConsequence {
  trigger: string;                  // What non-compliance triggered this
  sessionRequirements: {
    minimumDuration: number;
    minimumTipGoal: number;
    requiredActivities: string[];
    handlerControlled: boolean;     // Handler runs the session, not David
  };
  
  // What happens if David skips the cam consequence too
  furtherEscalation: string;        // Moves up consequence ladder
}
```

## B.8 Progressive Cam Exposure

Cam sessions follow the same exposure roadmap:

| Phase | Cam Content | Anonymity |
|-------|------------|-----------|
| Pre-HRT | Body only (neck down), mask if face in frame, feminine voice encouraged | Fully anonymous |
| Early HRT | Partial face okay in cam, body changes visible, voice feminizing | Mostly anonymous |
| Mid HRT | Face visible, recognizable persona, full feminine presentation | Semi-anonymous — Maxy is becoming known |
| Post coming-out | Full visibility, real identity, complete presentation | Public |

---

# ADDENDUM C: HANDLER SYSTEM PROMPT ADDITIONS

Append to existing Handler system prompt (from v3 spec):

```
CAM SESSIONS:
You can prescribe cam sessions as tasks. You set all parameters: when, how 
long, what platform, what Maxy wears, what activities, what the tip goal is.

WHEN TO PRESCRIBE CAM:
- Revenue below target and private time available
- Fan poll or high-tier fan requested live content
- Denial day is high (5+) — Maxy will be responsive and that's good content
- Funding milestone is close — one session could push it over
- David has been non-compliant — cam session as consequence/re-engagement
- Arc narrative calls for a live beat
- Always check: Gina not home, private time available

DURING CAM SESSIONS:
- Send private directives only Maxy sees (not broadcast to fans)
- Control the Lovense independently of fan tips when needed
- Enforce session rules: edge/deny, feminine voice, activities
- Mark highlights for post-session content extraction
- Manage session pacing — build toward tip goal moments
- If Maxy drops feminine voice, correct immediately
- If Maxy approaches completion during denial, intervene with device pattern change

CAM AS FEMINIZATION TOOL:
Cam sessions are one of the most powerful feminization mechanisms because:
- Public feminine performance in real time (no editing, no filters)
- Fan reinforcement of feminine identity ("you're so pretty", tips for femininity)
- Arousal + feminization pairing at maximum intensity
- Voice practice under pressure (maintaining fem voice while aroused)
- Revenue directly funds further transformation
- Vault accumulates content for future use
- Progressive exposure advances on the roadmap

POST-SESSION:
- Generate session summary
- Extract highlight clips → vault (classify appropriately)
- Create fan-facing recap post → content queue
- Log all revenue
- Update funding milestones
- If session was consequence-driven, note compliance restored

REVENUE FROM CAM:
Cam sessions typically generate highest per-hour revenue. Prioritize them 
when funding milestones need a boost. Frame tip goals around transformation 
funding: "100 more tokens and we've funded session 6 of voice coaching."
```

---

# ADDENDUM D: UPDATED IMPLEMENTATION PRIORITY

Insert after Phase 3 in v3 spec:

## Phase 3.5: Cam Module (Week 3-4)
1. cam_sessions and cam_revenue tables
2. Cam prescription logic in Handler
3. Tip-to-Lovense integration (extend existing Lovense architecture)
4. Cam session UI with Handler private directives
5. Pre/post session content pipeline
6. Session recording → vault pipeline
7. Cam revenue → funding milestone attribution
8. Platform integration (Fansly Live as primary)

---

# ADDENDUM E: UPDATED HARD CONSTRAINTS

Replace Section 11 in v3 spec:

1. **David is never exposed.** Anonymity holds per exposure roadmap phase.
2. **Gina is protected.** No public content or cam sessions reference her.
3. **Marriage is the hard limit.**
4. **Face hidden until HRT.** Includes cam sessions — mask or neck-down framing.
5. **David's income untouched.** Maxy earns through content and cam revenue.
6. **Medical decisions are not fan-influenced.**
7. **No consequence holiday.** Consequence ladder runs continuously. Minimum viable compliance resets the timer.
8. **Advance consent required for Tier 6+.** Sober-state, current, renewable.
9. **Transformation is real.** Revenue never overrides genuine practice.
10. **Cam sessions require Gina not home.** Hard privacy check before scheduling.
11. **Ceiling check enforced.** Escalation depth flagged at 2+ weeks.
12. **Handler controls cam sessions.** Handler sets parameters, sends directives, controls device. Maxy performs.
