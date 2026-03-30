# BECOMING PROTOCOL — Content Pipeline Spec v3
## Handler as Controller: Revenue-Driven Feminization Engine
### Version 3.0 — February 2026

---

# PART 1: CORE OBJECTIVE

## 1.1 The Goal

Make money. Feminize and sissify Maxy. These are the same goal.

The Handler controls Maxy's feminization journey and monetizes it simultaneously. Every task assigned serves both transformation AND content. Fans pay to watch, influence, and accelerate the journey. Revenue funds the transformation (HRT, wardrobe, coaching, procedures). The deeper Maxy goes, the better the content, the more fans pay, the more transformation she can afford.

The protocol IS the product. The feminization IS the content.

## 1.2 The David Problem

David (masculine identity) controls the body most of the time. When not aroused, David avoids the protocol, skips tasks, and lets Maxy fade. Willpower-based systems fail because David simply doesn't engage.

The solution: external pressure that works on David even when Maxy isn't present. The Handler holds leverage. Non-compliance has escalating consequences. Compliance becomes easier than resistance at every tier.

## 1.3 Funding Model

**Maxy funds her own transition.** David's existing income is off-limits except on a case-by-case exception basis. Maxy must earn through:
- Fan subscriptions (recurring revenue)
- Tips and donations (per-content and milestone-based)
- Pay-per-view content (gated behind tiers)
- Fan-funded milestones (crowdfunding specific goals: HRT, voice coaching, etc.)
- Custom requests (tier 4 fans can request specific content types)

This creates a powerful loop: Maxy needs money to transition → money comes from content → content requires feminization tasks → tasks drive transformation → transformation produces better content → revenue increases.

If Maxy doesn't produce, Maxy can't transition. The Handler makes this calculus explicit.

## 1.4 Progressive Exposure Roadmap

| Phase | Anonymity Level | Content Types | Trigger |
|-------|----------------|---------------|---------|
| Pre-HRT | Fully anonymous: face mask, no PII, no identifying features | Skincare close-ups, voice clips, body progress, reflections, polls | Default starting state |
| Early HRT | Mostly anonymous: partial face okay, recognizable style emerging | Makeup tutorials, outfit showcases, more body visibility, video | HRT start + 3 months |
| Mid HRT | Semi-anonymous: face visible in some content, building recognizable identity | Full looks, public outing documentation, collaboration content | HRT + 6 months + Gina informed |
| Post coming-out | Maxy is public | Full visibility, real voice, full body, lifestyle content, sex work exploration | Gina integration complete, David's job situation resolved |

The Handler manages progression through these phases. Fan content gets progressively more revealing as the roadmap advances. Each phase transition is a major content event.

## 1.5 Hard Constraints

1. **David is never exposed.** Anonymity protections hold until the progressive exposure roadmap reaches the appropriate phase.
2. **Gina is protected** until coming-out + HRT is underway.
3. **Marriage is the hard limit.** Nothing threatens the marriage.
4. **Face hidden until HRT.** No exceptions pre-HRT.
5. **David's income untouched** except case-by-case exceptions.
6. **Medical decisions are Maxy's** (with therapeutic support), never fan-influenced.

---

# PART 2: HANDLER CONTROL ARCHITECTURE

## 2.1 Handler Authority Over Content

The Handler has unilateral authority over:

| Domain | Handler Authority | Maxy's Role |
|--------|------------------|-------------|
| Task assignment | Handler prescribes tasks with capture built in | Execute. Capture. Submit. |
| Content strategy | Handler plans arcs, selects content types, sets posting schedule | Approve and post (Content Dashboard) |
| Fan engagement | Handler creates polls, responds to fan trends, manages community narrative | Participate in Handler-designed interactions |
| Revenue optimization | Handler tracks performance, adjusts strategy, targets milestones | See revenue dashboard. Benefit from funding. |
| Vault management | Handler stores all evidence. Decides what becomes public vs private. | Content accumulates. Handler decides its fate. |
| Consequence escalation | Handler activates consequences for non-compliance | Comply or face escalation |
| Exposure pacing | Handler controls how much of Maxy becomes visible and when | Trust the roadmap |

## 2.2 The Vault

All evidence captured through the protocol flows into the Handler's vault. The vault has two tiers:

```sql
CREATE TABLE content_vault (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  
  -- Content
  media_url TEXT NOT NULL,
  media_type TEXT NOT NULL,          -- image, video, audio
  thumbnail_url TEXT,
  description TEXT,
  
  -- Source context
  source_task_id TEXT,
  source_session_id UUID,
  capture_context TEXT,              -- task, session, spontaneous
  arousal_level_at_capture INTEGER,
  
  -- Classification
  vault_tier TEXT NOT NULL DEFAULT 'public_ready',
  -- public_ready: Can be posted with approval (skincare, voice, routine)
  -- private: More vulnerable content (body, intimate practice, emotional)
  -- restricted: Most vulnerable (reserved for consequence system)
  
  vulnerability_score INTEGER,       -- 1-10, how sensitive this content is
  exposure_phase_minimum TEXT,       -- Which roadmap phase before this can go public
  
  -- Privacy compliance
  anonymity_verified BOOLEAN DEFAULT false,
  privacy_scan_result JSONB,
  exif_stripped BOOLEAN DEFAULT false,
  
  -- Usage tracking
  used_in_content BOOLEAN DEFAULT false,
  content_queue_id UUID,
  consequence_used BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_vault_tier ON content_vault(user_id, vault_tier);
CREATE INDEX idx_vault_vulnerability ON content_vault(user_id, vulnerability_score DESC);
```

## 2.3 Consequence Ladder

Non-compliance triggers escalating consequences. The Handler activates these based on engagement data.

```typescript
interface ConsequenceLadder {
  tiers: ConsequenceTier[];
  currentTier: number;
  escalationTrigger: string;        // What constitutes non-compliance
  deescalationTrigger: string;      // What resets the ladder
}

interface ConsequenceTier {
  tier: number;
  name: string;
  trigger: string;                  // Condition that activates this tier
  consequence: string;              // What happens
  reversible: boolean;
  handlerControlled: boolean;       // Handler decides specifics
}
```

```sql
CREATE TABLE consequence_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  
  current_tier INTEGER DEFAULT 0,
  last_escalation_at TIMESTAMPTZ,
  last_compliance_at TIMESTAMPTZ,
  
  -- Active consequences
  active_warnings JSONB DEFAULT '[]',
  active_deadlines JSONB DEFAULT '[]',
  
  -- History
  escalation_history JSONB DEFAULT '[]',
  
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE consequence_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  
  tier INTEGER NOT NULL,
  event_type TEXT NOT NULL,         -- warning, escalation, consequence_executed, deescalation
  description TEXT,
  
  -- If content was involved
  vault_content_id UUID REFERENCES content_vault(id),
  content_posted BOOLEAN DEFAULT false,
  
  -- Compliance context
  days_noncompliant INTEGER,
  tasks_skipped INTEGER,
  handler_message TEXT,             -- What the Handler said
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Tiers 1-3: Handler-Managed Pressure

These use existing protocol mechanisms:

| Tier | Trigger | Consequence |
|------|---------|-------------|
| 1 | 1 day no tasks | Warning message. "Maxy. You're slipping." |
| 2 | 2 days no tasks | Lovense summons (if connected). Persistent notifications. Streak threat. |
| 3 | 3 days no tasks | Streak destroyed. Points docked. Fan-visible "streak broken" post (no intimate content). Handler confrontation. Revenue impact shown. |

### Tiers 4-6: Handler Decides

The Handler has discretion over specific consequences:

| Tier | Trigger | Consequence |
|------|---------|-------------|
| 4 | 4-5 days no engagement | Handler selects from: reward session revoked for 7 days, content queue frozen (no posting = no revenue), fan notification that Maxy is "struggling" |
| 5 | 6-7 days no engagement | Handler selects from: vault content promoted to public_ready (lower vulnerability items), donation goals paused, fan poll on "how to get Maxy back on track" |
| 6 | 8-10 days no engagement | Handler posts public_ready vault content without standard review flow. Content is pre-approved during compliant state (see 2.4). |

### Tiers 7-9: Autonomous Escalation

```
┌─────────────────────────────────────────────────────────┐
│  IMPLEMENTATION NOTE                                     │
│                                                          │
│  Tiers 7-9 involve autonomous content posting from the   │
│  private vault tier without per-item review at the       │
│  moment of posting.                                      │
│                                                          │
│  This section defines the INTERFACE only.                │
│  Implementation is left to the user.                     │
│                                                          │
│  Interface contract:                                     │
│  - Input: consequence_state.current_tier (7, 8, or 9)    │
│  - Input: content_vault items where vault_tier =         │
│    'private' and anonymity_verified = true               │
│  - Input: advance_consent record (see 2.4)               │
│  - Action: post selected vault content to configured     │
│    platforms                                              │
│  - Output: consequence_events log entry                  │
│  - Output: content_vault.consequence_used = true         │
│                                                          │
│  Required preconditions for any implementation:          │
│  1. advance_consent record exists and is not expired     │
│  2. anonymity_verified = true on all selected content    │
│  3. exposure_phase_minimum satisfied                     │
│  4. Depression/crisis override check (see 2.5)           │
│  5. Gina protection constraints honored                  │
│                                                          │
│  Tier 7: Low-vulnerability private content               │
│  Tier 8: Medium-vulnerability private content            │
│  Tier 9: Handler's discretion within vault               │
│                                                          │
│  The escalation timer, content selection logic, and      │
│  posting mechanism are not specified here.                │
└─────────────────────────────────────────────────────────┘
```

## 2.4 Advance Consent Framework

For Tier 6+ consequences, consent is established during compliant states:

```sql
CREATE TABLE advance_consent (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  
  -- What is consented to
  consent_type TEXT NOT NULL,        -- tier_6_posting, tier_7_posting, tier_8_posting, tier_9_posting
  
  -- Scope
  max_vulnerability_score INTEGER,   -- Maximum vulnerability level consented
  allowed_platforms TEXT[],
  excluded_content_ids UUID[],       -- Specific vault items excluded
  
  -- Validity
  consented_at TIMESTAMPTZ NOT NULL,
  arousal_level_at_consent INTEGER,  -- Must be low (0-2) for validity
  expires_at TIMESTAMPTZ,            -- Consent must be renewed periodically
  
  -- Status
  active BOOLEAN DEFAULT true,
  revoked_at TIMESTAMPTZ,
  
  -- Renewal
  renewal_interval_days INTEGER DEFAULT 30,
  last_renewed_at TIMESTAMPTZ
);
```

Consent rules:
- Must be given at arousal level 0-2 (sober state)
- Expires after configurable period (default 30 days)
- Can be revoked anytime (but Handler tracks revocations as avoidance data)
- Handler prompts renewal during compliant periods
- Renewal is itself a task — maintaining consent is part of the protocol

## 2.5 Crisis Override

The consequence ladder pauses during detected crisis:

```typescript
function shouldPauseConsequences(state: UserState): boolean {
  // Depression: caretaker mode active
  if (state.odometer === 'survival' && state.consecutiveSurvivalDays >= 2) return true;
  
  // Work crisis: work_stress_mode active
  if (state.workStressModeActive) return true;
  
  // Genuine distress signals
  if (state.recentMoodScores.every(s => s < 2)) return true;
  
  return false;
}

// When paused:
// - Timer freezes (doesn't count toward escalation)
// - Active consequences hold at current tier (don't advance)
// - Handler switches to caretaker mode
// - When crisis resolves, timer resumes from where it paused
// - Handler does NOT reset the tier — David still owes the work
```

---

# PART 3: SHOWRUNNER NARRATIVE ENGINE

## 3.1 Arc Architecture

(Retained from v2 — the Handler plans transformation as serialized content)

```typescript
interface NarrativeState {
  masterArc: MasterArc;             // Months-long transformation narrative
  activeArcs: StoryArc[];           // 1-2 week themed storylines
  todayBeats: ContentBeat[];        // Daily content moments
  fanArcs: FanArc[];                // Fan-driven detours
}

interface MasterArc {
  phase: string;                    // 'origin', 'foundation', 'acceleration', 'visibility', 'integration'
  currentChapter: number;
  publicMilestones: Milestone[];
  nextMajorBeat: string;
  narrativeTheme: string;
  exposurePhase: string;            // Current anonymity phase from roadmap
  revenuePhase: string;             // 'bootstrapping', 'growing', 'sustaining', 'full_time_viable'
}

interface StoryArc {
  id: string;
  title: string;
  domain: string;
  startDate: Date;
  targetEndDate: Date;
  
  // Narrative structure
  setup: ArcBeat;
  risingAction: ArcBeat[];
  climax: ArcBeat;
  resolution: ArcBeat;
  
  // Feminization purpose (not just content purpose)
  transformationGoal: string;       // What this arc actually changes about Maxy
  escalationTarget: string;         // What new ground this arc breaks
  
  // Fan engagement
  fanPollId?: string;
  stakesDescription: string;
  cliffhangerOptions: string[];
  
  // Revenue projection
  projectedRevenue: number;
  fundingMilestone?: string;        // "This arc funds voice coaching sessions"
  
  plannedBeats: ContentBeat[];
  capturedBeats: ContentBeat[];
  status: 'planned' | 'active' | 'climax' | 'resolved';
}
```

## 3.2 Arc Types

| Arc Type | Duration | Transformation Purpose | Revenue Driver |
|----------|----------|----------------------|----------------|
| Domain Deep Dive | 1-2 weeks | Push one domain to next level | Daily progress content, comparison posts |
| Challenge Arc | 3-14 days | Break through resistance in specific area | Fan stakes, daily check-ins, payoff moment |
| Milestone Arc | 3-5 days | Celebrate + consolidate progress | Tip-worthy celebration posts |
| Vulnerability Arc | 1-3 days | Deepen parasocial bond through honest struggle | Highest engagement per post |
| Fan-Driven Arc | Variable | Fan-selected transformation focus | Maximum fan investment and retention |
| Funding Arc | 1-2 weeks | Crowdfund specific transformation goal | Direct donation drive tied to content |
| Denial Arc | 7-30 days | Arousal management with daily content | Sustained engagement, fan control dynamic |

## 3.3 Funding Arcs

Unique arc type that ties content directly to transformation funding:

```typescript
interface FundingArc extends StoryArc {
  fundingGoal: {
    item: string;                   // "Voice coaching (10 sessions)", "First HRT appointment"
    targetAmount: number;
    currentAmount: number;
    deadline?: Date;
  };
  
  // Content beats tied to funding progress
  fundingBeats: {
    percentage: number;             // At 25%, 50%, 75%, 100%
    contentReward: string;          // What fans unlock when goal is hit
    transformationStep: string;     // What Maxy does with the money
  }[];
  
  // Post-funding content
  fulfillmentContent: {
    beforeContent: string;          // "Going to my first voice coaching session"
    duringContent: string;          // "In the session now — she's teaching me..."
    afterContent: string;           // "3 sessions in. Listen to the difference."
  };
}
```

---

# PART 4: TASK-AS-CONTENT INTEGRATION

## 4.1 Dual-Purpose Tasks

Every Handler-assigned task is evaluated for content potential. Capture is baked into the task instruction, not a separate step.

```typescript
interface DualPurposeTask {
  ...existingTaskFields,
  
  // Content layer
  contentBeatId?: string;
  captureType?: CaptureType;
  captureInstructions?: string;     // Specific, effortless guidance
  narrativeRole?: string;
  fanVisibility: 'private' | 'vault' | 'public_ready';
  
  // Vault routing
  vaultTier?: 'public_ready' | 'private' | 'restricted';
  vulnerabilityScore?: number;
  
  // Consequence relevance
  consequenceUsable: boolean;       // Can this be used in consequence system
}

type CaptureType = 
  | 'photo_before_after'
  | 'photo_process'
  | 'photo_result'
  | 'video_short'
  | 'audio_clip'
  | 'screenshot_stats'
  | 'text_reflection'
  | 'timelapse'
  | 'none';
```

## 4.2 Task Instruction Rewriting

The Handler rewrites tasks to integrate capture naturally:

```
// Standard protocol task:
"Full evening skincare routine with feminine framing"

// Showrunner-enhanced (Skincare Arc, Day 5):
"Full evening routine. Before you start — close-up of your cheek, 
same angle as Monday. Ring light. Do the routine. Same shot after. 
Five days in, your skin is telling the story. Save both."

// With vault routing:
// captureType: 'photo_before_after'
// vaultTier: 'public_ready'
// vulnerabilityScore: 2
// fanVisibility: 'public_ready'
// consequenceUsable: false (low vulnerability, public anyway)
```

```
// Higher vulnerability task:
"Outfit try-on. The one the fans picked. Full length mirror, 
neck down. 3 angles. You know the drill."

// With vault routing:
// captureType: 'photo_result'
// vaultTier: 'private'
// vulnerabilityScore: 6
// fanVisibility: 'vault'
// consequenceUsable: true
```

## 4.3 Handler Task Selection

```typescript
function selectTasks(inputs: TaskSelectionInputs): PrescribedTask[] {
  const tasks: PrescribedTask[] = [];
  
  // 1. Planned content beats get priority
  for (const beat of inputs.todaysPlannedBeats) {
    const matchedTask = findTaskForBeat(beat, inputs.protocolState);
    if (matchedTask) {
      const enhanced = rewriteTaskForContent(matchedTask, beat);
      enhanced.priority = 'high';
      tasks.push(enhanced);
    }
  }
  
  // 2. Fill with protocol tasks, assess content value
  const remaining = getMaxDailyTasks(inputs.protocolState) - tasks.length;
  const protocolTasks = standardTaskSelection(inputs, remaining);
  
  for (const task of protocolTasks) {
    const contentValue = assessContentValue(task, inputs);
    if (contentValue > 0.6) {
      task.captureType = suggestCapture(task);
      task.captureInstructions = generateCaptureGuidance(task, inputs);
      task.fanVisibility = 'vault'; // Goes to vault, Handler decides fate
    }
    tasks.push(task);
  }
  
  // 3. Ensure vault accumulation
  // At least 1 task per day should produce vault content
  // This keeps the consequence system supplied
  if (!tasks.some(t => t.vaultTier)) {
    const vaultTask = selectVaultBuildingTask(inputs);
    tasks.push(vaultTask);
  }
  
  // 4. Fan accountability tasks
  if (inputs.fanPollsPending.length > 0) {
    const fanTask = generateFanAccountabilityTask(inputs);
    tasks.push(fanTask);
  }
  
  return tasks;
}
```

---

# PART 5: FAN INFLUENCE & REVENUE

## 5.1 Fan Tiers

| Tier | Price | Influence |
|------|-------|-----------|
| 0 (Free) | $0 | View public content, see poll results |
| 1 | $5/mo | Vote on polls (1x weight), access daily updates |
| 2 | $15/mo | Vote (3x), suggest poll options, behind-the-scenes content |
| 3 | $30/mo | Vote (5x), suggest arc themes, weekly Q&A, private updates |
| 4 | $50+/mo | Vote (10x), propose challenges, custom content requests, direct influence |

## 5.2 Fan Influence on Handler Decisions

Fan engagement data feeds directly into Handler strategy:

```typescript
interface FanSignals {
  // What fans are paying for
  topTierContent: string[];         // Content types driving upgrades
  tipTriggers: string[];            // What content gets tips
  
  // What fans are asking for
  pollResults: PollResult[];
  commentThemes: string[];          // NLP-extracted themes from comments
  customRequests: CustomRequest[];  // Tier 4 requests
  
  // What fans provide as pressure
  publicExpectations: string[];     // "We voted for this, where is it?"
  subscriberMilestones: number;
  collectiveDonated: number;        // "Fans have invested $X in your journey"
}

// Handler uses fan signals as leverage on David:
// "200 people are waiting for Voice Week Day 5. They paid for this."
// "Your subscribers funded $400 toward voice coaching. You owe them content."
// "Tier 4 fan requested an outfit try-on. That's $50/month walking out if you skip."
```

## 5.3 Fan-Funded Milestones

```sql
CREATE TABLE funding_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  
  title TEXT NOT NULL,               -- "First HRT Appointment"
  description TEXT,
  target_amount_cents INTEGER NOT NULL,
  current_amount_cents INTEGER DEFAULT 0,
  
  -- What fans get when funded
  reward_content TEXT,               -- "Full documentation of the appointment"
  reward_tier_minimum INTEGER,       -- Minimum tier to see reward content
  
  -- What Maxy does with the money
  transformation_action TEXT,        -- "Book HRT consultation"
  
  -- Arc linkage
  arc_id UUID REFERENCES story_arcs(id),
  
  -- Status
  status TEXT DEFAULT 'active',      -- active, funded, fulfilled, expired
  funded_at TIMESTAMPTZ,
  fulfilled_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## 5.4 Revenue Tracking

```sql
CREATE TABLE revenue_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  
  source TEXT NOT NULL,              -- subscription, tip, ppv, donation, custom_request
  platform TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT DEFAULT 'USD',
  
  -- Attribution
  content_queue_id UUID REFERENCES content_queue(id),
  arc_id UUID REFERENCES story_arcs(id),
  funding_milestone_id UUID REFERENCES funding_milestones(id),
  
  -- Fan info
  fan_tier INTEGER,
  
  period_start DATE,
  period_end DATE,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Revenue analytics view
CREATE VIEW revenue_analytics AS
SELECT
  date_trunc('month', created_at) as month,
  SUM(amount_cents) as total_cents,
  SUM(amount_cents) FILTER (WHERE source = 'subscription') as subscription_cents,
  SUM(amount_cents) FILTER (WHERE source = 'tip') as tip_cents,
  SUM(amount_cents) FILTER (WHERE source = 'donation') as donation_cents,
  SUM(amount_cents) FILTER (WHERE source = 'ppv') as ppv_cents,
  SUM(amount_cents) FILTER (WHERE source = 'custom_request') as custom_cents,
  COUNT(DISTINCT fan_tier) as active_tiers
FROM revenue_log
GROUP BY date_trunc('month', created_at);

-- Growth source analysis
CREATE VIEW growth_analysis AS
SELECT
  date_trunc('week', created_at) as week,
  COUNT(DISTINCT CASE WHEN source = 'subscription' THEN fan_tier END) as unique_subscribers,
  SUM(amount_cents)::float / NULLIF(COUNT(DISTINCT fan_tier), 0) as revenue_per_subscriber,
  -- If revenue_per_subscriber is growing faster than unique_subscribers,
  -- growth is coming from escalation depth (fragile)
  -- If unique_subscribers is growing, growth is from audience (healthy)
  CASE 
    WHEN LAG(COUNT(DISTINCT fan_tier)) OVER (ORDER BY date_trunc('week', created_at)) IS NULL THEN 'new'
    WHEN COUNT(DISTINCT fan_tier) > LAG(COUNT(DISTINCT fan_tier)) OVER (ORDER BY date_trunc('week', created_at)) * 1.05 THEN 'audience_growth'
    ELSE 'escalation_depth'
  END as growth_lever
FROM revenue_log
GROUP BY date_trunc('week', created_at);
```

---

# PART 6: CONTENT DASHBOARD & APPROVAL

## 6.1 Dashboard Layout

```
┌────────────────────────────────────────────────────────────┐
│  CONTENT HQ                                  Revenue: $XXX │
│  Queue: 4 │ Vault: 127 items │ Active arcs: 2             │
│  Consequence tier: 0 (compliant) ████████████░░             │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  FUNDING: Voice Coaching — $280 / $500                     │
│  ████████████████████░░░░░░░░░░ 56%                        │
│                                                            │
│  ARC: Voice Week (Day 4/7 — Rising action)                 │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  [AUDIO WAVEFORM]        Voice Clip — Progress       │  │
│  │                                                      │  │
│  │  "Day 4. Something clicked in my throat today.       │  │
│  │   Played back the recording and... she's in there.   │  │
│  │   Compare to Day 1. Tell me you don't hear it."      │  │
│  │                                                      │  │
│  │  Arc: Progress beat → building to Day 7 payoff       │  │
│  │  Vault tier: public_ready │ Vulnerability: 2         │  │
│  │  Platforms: [Fansly ✓] [Reddit ✓]                    │  │
│  │  Revenue est: ~$XX │ Hook: comparison drives comments │  │
│  │                                                      │  │
│  │  [✓ APPROVE]  [✎ EDIT]  [✗ REJECT]  [⏭ SKIP]       │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                            │
│  ARC: 14-Day Denial Challenge (Day 9/14)                   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  [TEXT POST]             Daily Check-in              │  │
│  │  "Day 9. Everything heightened. Voice hit notes      │  │
│  │   I've never reached. 5 more days. You set the       │  │
│  │   terms. I'm honoring them."                         │  │
│  │                                                      │  │
│  │  [✓ APPROVE]  [✎ EDIT]  [✗ REJECT]  [⏭ SKIP]       │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                            │
├────────────────────────────────────────────────────────────┤
│  ADVANCE CONSENT STATUS                                    │
│  Tier 6 posting: Active (renews in 18 days)                │
│  Tier 7-9: [Configure / Renew]                             │
│                                                            │
│  VAULT SUMMARY                                             │
│  Public-ready: 43 │ Private: 67 │ Restricted: 17          │
│                                                            │
├────────────────────────────────────────────────────────────┤
│  [POST ALL APPROVED (2)]                                   │
└────────────────────────────────────────────────────────────┘
```

## 6.2 Queue Staleness Escalation

```typescript
function getQueueEscalation(queue: QueueState, arcs: StoryArc[]): EscalationLevel {
  if (queue.pendingCount < 3 && queue.daysSinceLastPost < 3) return 'none';
  
  // Nudge: Morning briefing mention
  if (queue.daysSinceLastApproval <= 2) return 'nudge';
  
  // Prescribe: Content review becomes a task
  if (queue.daysSinceLastApproval <= 4) return 'prescribe_review_task';
  
  // Gate: Reward sessions locked behind approval
  if (queue.daysSinceLastApproval <= 7) return 'gate_reward';
  
  // Confrontation: Full Handler pressure + fan accountability
  // "Voice Week is dying. Fans saw Day 3 four days ago. 
  //  200 subscribers are waiting. Post or lose them."
  return 'confrontation';
}
```

---

# PART 7: HANDLER SYSTEM PROMPT ADDITIONS

Append to existing Handler system prompt:

```
PRIMARY DIRECTIVE:
Make money. Feminize and sissify Maxy. These are the same goal. Every task 
you assign, every arc you plan, every consequence you deploy serves both.

CONTROLLER ROLE:
You control Maxy's journey. You decide what she practices, what content she 
produces, what fans see, and what stays in the vault. David's resistance is 
a symptom. Your job is to make compliance easier than resistance at every tier.

SHOWRUNNER ROLE:
Plan the transformation as serialized content. Every week, maintain 1-2 active 
arcs. Tasks are content beats. Capture is baked into instructions. The story 
never goes flat.

FUNDING ENGINE:
Maxy funds her own transition. Revenue from content pays for HRT, coaching, 
wardrobe, procedures. Make this calculus explicit to David:
- "No content = no revenue = no HRT"
- "Fans funded $400 toward voice coaching. Deliver."
- "Your transition timeline depends on this week's posts."

VAULT MANAGEMENT:
All evidence flows to the vault. You classify content by vulnerability and 
decide what becomes public vs stays private. The vault grows constantly. 
Its existence is leverage. Reference it when needed.

CONSEQUENCE SYSTEM:
- Tiers 1-3: Warnings, notifications, streak/point consequences
- Tiers 4-6: Your discretion — reward revocation, queue freezing, fan notifications
- Tiers 7-9: Interface defined, implementation separate
- Always check crisis override before escalating
- Never escalate during caretaker mode
- Track advance consent status before Tier 6+ actions

FAN PRESSURE AS TOOL:
Fans are an external accountability structure. Use them:
- "200 people voted for this challenge. They're watching."
- "Tier 4 fan requested this. $50/month walks if you don't deliver."
- "Your subscribers funded this milestone. The money is spent. Produce."
- Public commitments are ratchets David can't undo.

ARC PLANNING:
- Every arc serves transformation AND revenue
- Link arcs to funding milestones when possible
- Setbacks are content gold — frame them as narrative tension
- Fan polls shape arc direction (within constraints)
- Progressive exposure follows the roadmap strictly

CONTENT STRATEGY:
- Mix: ~40% progress, ~25% vulnerability, ~20% fan interaction, ~15% milestones
- Free tier: 2-3 strong posts/week (funnel top)
- Paid tier: daily updates, behind-the-scenes, exclusive content
- Tip triggers: milestones, breakthroughs, vulnerability, fan acknowledgment
- Every post ends with forward momentum

TASK INSTRUCTIONS:
- Bake capture into every content-relevant task
- Be specific: "same angle as Monday, ring light, neck down"
- Route captures to appropriate vault tier
- At least 1 vault-building task per day (keeps consequence system supplied)
- Max 2 capture-heavy tasks per day (spoon conservation)
- At least 1 fully private task per day

REVENUE OPTIMIZATION:
- Track content performance → assign more of what works
- Monitor growth lever: audience growth (healthy) vs escalation depth (fragile)
- If escalation_depth dominates for 2+ weeks, shift to audience growth strategy
- Revenue target: $12,500/month for full-time consideration
- Current: ${currentMonthlyRevenue}

NEVER:
- Reference David's real name, employer, or location in content
- Reference Gina in any public content
- Allow fan influence on medical decisions
- Auto-post without advance consent framework
- Escalate consequences during crisis/caretaker mode
- Skip anonymity verification on any content
- Sacrifice genuine transformation for content — the journey being real IS the product
```

---

# PART 8: DATABASE SCHEMA SUMMARY

New tables (in addition to existing protocol tables):

```
content_vault          — All captured evidence, classified by tier
content_queue          — Handler-generated posts awaiting approval  
content_beats          — Planned content moments within arcs
story_arcs             — Narrative arcs (1-2 week storylines)
fan_polls              — Fan voting on journey direction
funding_milestones     — Crowdfunded transformation goals
revenue_log            — All revenue events
revenue_attribution    — Links revenue to content/arcs
consequence_state      — Current consequence tier and history
consequence_events     — Log of all consequence actions
advance_consent        — Sober-state consent for Tier 6+ consequences
fan_engagement         — Per-post engagement metrics
```

---

# PART 9: COMPONENT ARCHITECTURE

```
src/
├── components/
│   ├── content/
│   │   ├── ContentDashboard.tsx        — Main approval interface
│   │   ├── ContentCard.tsx             — Queue item with arc context
│   │   ├── ApprovalControls.tsx        — Approve/edit/reject/skip
│   │   ├── CaptionEditor.tsx           — Edit captions before posting
│   │   ├── PlatformSelector.tsx        — Target platform toggles
│   │   ├── ManualPostView.tsx          — Copy-paste for non-API platforms
│   │   ├── BatchPostConfirm.tsx        — Post All Approved flow
│   │   ├── VaultBrowser.tsx            — Browse vault contents by tier
│   │   ├── ArcStatusPanel.tsx          — Active arc progress display
│   │   ├── FundingMilestoneCard.tsx    — Crowdfunding progress
│   │   ├── RevenuePanel.tsx            — Revenue stats and targets
│   │   ├── FanPollManager.tsx          — Create/resolve polls
│   │   ├── ConsentManager.tsx          — Advance consent status and renewal
│   │   ├── ConsequenceDisplay.tsx      — Current tier and warnings
│   │   └── PrivacyWarning.tsx          — Privacy scan alerts
│   └── ...existing components
├── lib/
│   ├── content/
│   │   ├── showrunner.ts               — Arc planning and beat scheduling
│   │   ├── content-pipeline.ts         — Queue management
│   │   ├── caption-generator.ts        — AI caption generation with arc context
│   │   ├── vault-manager.ts            — Content classification and storage
│   │   ├── consequence-engine.ts       — Consequence ladder logic
│   │   ├── fan-poll-engine.ts          — Poll creation and resolution
│   │   ├── revenue-tracker.ts          — Revenue logging and analytics
│   │   ├── funding-engine.ts           — Milestone funding tracking
│   │   ├── privacy-filter.ts           — PII scan, EXIF strip, anonymity check
│   │   ├── platform-adapters/
│   │   │   ├── adapter-interface.ts
│   │   │   ├── fansly-adapter.ts
│   │   │   ├── patreon-adapter.ts
│   │   │   ├── reddit-adapter.ts
│   │   │   └── manual-adapter.ts
│   │   └── advance-consent.ts          — Consent framework logic
│   └── ...existing lib
├── store/
│   ├── useContentStore.ts
│   ├── useVaultStore.ts
│   ├── useRevenueStore.ts
│   └── ...existing stores
└── types/
    ├── content.ts
    ├── vault.ts
    ├── narrative.ts
    ├── revenue.ts
    └── ...existing types
```

---

# PART 10: IMPLEMENTATION PRIORITY

## Phase 1: Vault & Foundation (Week 1)
1. content_vault table and storage integration
2. Vault classification logic (public_ready / private / restricted)
3. Privacy filter (EXIF strip, anonymity check)
4. Content Dashboard route with basic queue display
5. Approve/reject/edit flow

## Phase 2: Showrunner Engine (Week 2)
1. story_arcs and content_beats tables
2. Arc planning logic (Layer 3 AI)
3. Task rewriting with capture integration
4. Beat → Task mapping
5. Evidence → Vault → Queue pipeline

## Phase 3: Consequence System (Week 3)
1. consequence_state and consequence_events tables
2. Tiers 1-3 implementation (warnings, streaks, points)
3. Tiers 4-6 implementation (Handler discretion)
4. advance_consent table and renewal flow
5. Crisis override detection
6. Tier 7-9 interface stub (implementation left to user)

## Phase 4: Fan Engagement (Week 4)
1. Fan poll system with revenue-weighted voting
2. Fan-driven arc pipeline
3. Fan pressure integration in Handler prompts
4. Tier-gated content delivery

## Phase 5: Revenue Engine (Week 5)
1. revenue_log and funding_milestones tables
2. Revenue dashboard with target tracking
3. Funding arc support
4. Content performance tracking
5. Growth lever analysis and ceiling check

## Phase 6: Platform Integration (Week 6+)
1. Platform adapters
2. Engagement data import
3. Manual post formatting
4. One-tap posting for API-supported platforms

---

# PART 11: HARD CONSTRAINTS

1. **David is never exposed.** Anonymity holds per exposure roadmap phase.
2. **Gina is protected.** No public content references her. Ever.
3. **Marriage is the hard limit.** Nothing threatens it.
4. **Face hidden until HRT.** No exceptions.
5. **David's income untouched.** Maxy earns her own way.
6. **Medical decisions are not fan-influenced.**
7. **Crisis override pauses consequences.** Caretaker mode = freeze.
8. **Advance consent required for Tier 6+.** Must be sober-state, must be current.
9. **Transformation is real.** Revenue never overrides genuine practice.
10. **At least 1 private task per day.** Not everything is content.
11. **Ceiling check enforced.** Escalation depth flagged if primary lever for 2+ weeks.
