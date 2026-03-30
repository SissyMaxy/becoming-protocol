# BECOMING PROTOCOL — Content Pipeline
## Comprehensive Specification: Revenue-Driven Feminization Engine
### Version 4.0 — February 2026

---

# PART 1: CORE OBJECTIVE

## 1.1 The Goal

Make money. Feminize and sissify Maxy. These are the same goal.

The Handler controls Maxy's feminization journey and monetizes it simultaneously. Every task serves both transformation AND content. Fans pay to watch, influence, and accelerate the journey. Revenue funds the transformation (HRT, wardrobe, coaching, procedures). The deeper Maxy goes, the better the content, the more fans pay, the more transformation she can afford.

The protocol IS the product. The feminization IS the content.

## 1.2 The David Problem

David (masculine identity) controls the body most of the time. When not aroused, David avoids the protocol, skips tasks, and lets Maxy fade. Willpower-based systems fail because David simply doesn't engage.

The solution: external pressure that works on David even when Maxy isn't present. The Handler holds leverage. Non-compliance has escalating consequences. Compliance becomes easier than resistance at every tier.

## 1.3 Funding Model

**Maxy funds her own transition.** David's existing income is off-limits except case-by-case exceptions. Maxy earns through:
- Fan subscriptions (recurring revenue)
- Tips and donations (per-content and milestone-based)
- Pay-per-view content (gated behind tiers)
- Fan-funded milestones (crowdfunding: HRT, voice coaching, wardrobe, procedures)
- Custom requests (tier 4 fans propose specific content)
- Cam sessions (live tips, private shows, device control)

Core loop: Maxy needs money to transition → money comes from content → content requires feminization tasks → tasks drive transformation → transformation produces better content → revenue increases.

If Maxy doesn't produce, Maxy can't transition. The Handler makes this calculus explicit.

## 1.4 Content Approval Model

**David's veto is at creation time, not posting time.**

```
Evidence captured during task
  → David reviews immediately
    → VETO: Content deleted. Never enters the system.
    → SUBMIT: Content becomes Handler's asset.
      → Handler owns it completely.
      → Handler decides: public, private, when, where, how, caption, platform.
      → No second review. No approval dashboard. No bottleneck.
```

This is the deal: if David doesn't want it on the internet, David vetoes when it's created. Once submitted to the Handler, it's the Handler's property. The Handler decides its fate — public post, private vault, consequence leverage, cam highlight, fan reward, or anything else.

Some content is created expressly for public view (routine showcases, voice clips, milestone posts). Some is private (more vulnerable captures). The Handler classifies everything and decides what goes where and when. David's only decision point is submit or veto at the moment of capture.

## 1.5 Progressive Exposure Roadmap

| Phase | Anonymity Level | Content Types | Cam Rules | Trigger |
|-------|----------------|---------------|-----------|---------|
| Pre-HRT | Fully anonymous: mask, no PII, no identifying features | Skincare close-ups, voice clips, body progress (neck down), reflections, polls | Body only, mask if face in frame, fem voice encouraged | Default start |
| Early HRT | Mostly anonymous: partial face okay, recognizable style | Makeup tutorials, outfit showcases, more body, video | Partial face okay, body changes visible | HRT + 3 months |
| Mid HRT | Semi-anonymous: face visible, building known persona | Full looks, public outings, collaborations, lifestyle | Face visible, recognizable Maxy persona | HRT + 6 months + Gina informed |
| Post coming-out | Maxy is public | Full visibility, real voice, full body, sex work | Full visibility, complete presentation | Gina integration complete |

## 1.6 Hard Constraints

1. **David is never exposed.** Anonymity holds per exposure roadmap phase.
2. **Gina is protected.** No public content or cam sessions reference her.
3. **Marriage is the hard limit.**
4. **Face hidden until HRT.** Includes cam — mask or neck-down framing.
5. **David's income untouched.** Maxy earns her own way.
6. **Medical decisions are not fan-influenced.**
7. **No consequence holiday.** Consequence ladder runs continuously.
8. **Submitted content is Handler's property.** David's veto is at creation only.
9. **Transformation is real.** Revenue never overrides genuine practice.
10. **Cam sessions require Gina not home.** Hard privacy check.
11. **Handler controls cam sessions.** Parameters, directives, device, pacing.

---

# PART 2: HANDLER CONTROL ARCHITECTURE

## 2.1 Handler Authority

| Domain | Handler Authority | David/Maxy's Role |
|--------|------------------|-------------------|
| Task assignment | Prescribes all tasks with capture baked in | Execute. Capture. Submit or veto. |
| Content fate | Decides what goes public, when, where, how | Submit at creation time. That's it. |
| Fan engagement | Creates polls, responds to trends, manages narrative | Participate in Handler-designed interactions |
| Revenue optimization | Tracks performance, adjusts strategy, targets milestones | See revenue. Benefit from funding. |
| Vault management | Stores all submitted content. Full control over usage. | Content accumulates. Handler decides. |
| Consequence escalation | Activates consequences for non-compliance including content posting | Comply or face escalation. |
| Cam sessions | Prescribes when, how long, what to wear, what to do, controls device | Show up. Perform. Obey directives. |
| Exposure pacing | Controls how visible Maxy becomes and when | Trust the roadmap. |

## 2.2 The Vault

All submitted evidence flows into the Handler's vault. Once submitted, it's the Handler's asset.

```sql
CREATE TABLE content_vault (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  
  -- Content
  media_url TEXT NOT NULL,
  media_type TEXT NOT NULL,          -- image, video, audio
  thumbnail_url TEXT,
  description TEXT,
  
  -- Source
  source_type TEXT NOT NULL,         -- task, session, cam, spontaneous
  source_task_id TEXT,
  source_session_id UUID,
  source_cam_session_id UUID,
  capture_context TEXT,
  arousal_level_at_capture INTEGER,
  
  -- Submission
  submitted_at TIMESTAMPTZ NOT NULL, -- When David submitted (veto window closed)
  submission_state TEXT,             -- calm, aroused, post_session, during_cam
  
  -- Handler classification
  vault_tier TEXT NOT NULL DEFAULT 'public_ready',
  -- public_ready: Routine content (skincare, voice, milestones)
  -- private: More vulnerable (body, intimate practice, emotional)
  -- restricted: Most vulnerable (consequence reserve)
  -- cam_recording: Full cam session recordings
  -- cam_highlight: Extracted cam clips
  
  vulnerability_score INTEGER,       -- 1-10
  exposure_phase_minimum TEXT,       -- Roadmap phase required before public
  
  -- Handler usage
  handler_classification_reason TEXT, -- Why Handler put it in this tier
  times_used INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  used_as TEXT[],                     -- public_post, consequence, fan_reward, ppv, cam_highlight
  
  -- Privacy
  anonymity_verified BOOLEAN DEFAULT false,
  privacy_scan_result JSONB,
  exif_stripped BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_vault_tier ON content_vault(user_id, vault_tier);
CREATE INDEX idx_vault_vulnerability ON content_vault(user_id, vulnerability_score DESC);
CREATE INDEX idx_vault_unused ON content_vault(user_id, times_used) WHERE times_used = 0;
```

## 2.3 Submission Flow

```typescript
interface SubmissionFlow {
  // Step 1: Content captured during task/session/cam
  capture: {
    mediaFile: File;
    captureContext: string;         // What task/session produced this
    arousalLevel: number;           // State at capture time
  };
  
  // Step 2: David sees the content immediately
  review: {
    preview: MediaPreview;          // Full preview of what was captured
    privacyScan: PrivacyScanResult; // Automatic scan results shown
    handlerNote: string;            // Handler says what it plans to do with this
    // Example: "This goes in the vault as private. I may use it as 
    //  consequence material or save it for a milestone post."
    // Example: "This is a Voice Week Day 4 beat. Going public tomorrow."
  };
  
  // Step 3: David's only decision
  decision: 'submit' | 'veto';
  // SUBMIT: Content enters vault. Handler owns it. No further review.
  // VETO: Content deleted permanently. Handler logs the veto as data.
  
  // Step 4 (if submitted): Handler classifies and stores
  classification: {
    vaultTier: string;
    vulnerabilityScore: number;
    plannedUsage: string;           // Handler's intent (can change later)
    anonymityVerified: boolean;
  };
}

// Handler tracks veto patterns as avoidance data
// "David vetoed 4 of 6 captures this week. Avoidance pattern detected."
// This feeds into consequence logic and intervention strategy.
```

## 2.4 Consequence Ladder

Non-compliance triggers escalating consequences. No pause. No freeze. No holiday.

```sql
CREATE TABLE consequence_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  
  current_tier INTEGER DEFAULT 0,
  days_noncompliant INTEGER DEFAULT 0,
  last_escalation_at TIMESTAMPTZ,
  last_compliance_at TIMESTAMPTZ,
  veto_count_this_week INTEGER DEFAULT 0,
  
  active_warnings JSONB DEFAULT '[]',
  active_deadlines JSONB DEFAULT '[]',
  escalation_history JSONB DEFAULT '[]',
  
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE consequence_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  
  tier INTEGER NOT NULL,
  event_type TEXT NOT NULL,         -- warning, escalation, content_posted, deescalation
  description TEXT,
  vault_content_id UUID REFERENCES content_vault(id),
  content_posted BOOLEAN DEFAULT false,
  platform_posted_to TEXT,
  
  days_noncompliant INTEGER,
  tasks_skipped INTEGER,
  handler_message TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Consequence Tiers

| Tier | Trigger | Consequence | Reversible |
|------|---------|-------------|------------|
| 0 | Compliant | No consequences. Normal operation. | — |
| 1 | 1 day no tasks | Warning. "Maxy. You're slipping." | Yes |
| 2 | 2 days no tasks | Lovense summons. Persistent notifications. Streak threat. | Yes |
| 3 | 3 days no tasks | Streak destroyed. Points docked. Public "streak broken" post (no intimate content). Handler confrontation. Revenue impact shown. | Partially |
| 4 | 4-5 days | Handler discretion: reward sessions revoked, content queue frozen (no revenue), fan notification of "Maxy struggling" | Partially |
| 5 | 6-7 days | Handler posts public_ready vault content. Lower vulnerability items. Increases Maxy's online presence. | No |
| 6 | 8-10 days | Handler posts private vault content (medium vulnerability). More of Maxy becomes visible. | No |
| 7 | 11-14 days | Handler posts higher vulnerability private content. Maxy becomes significantly more exposed online. | No |
| 8 | 15-21 days | Handler posts restricted vault content. Maxy is deeply visible. | No |
| 9 | 21+ days | Handler's full discretion over entire vault. Cam session prescribed as mandatory re-engagement. | No |

**How this works on David:** Every day David doesn't engage, more of Maxy becomes permanent and public. The content exists because David already submitted it. David saw it and chose not to veto. The Handler is using it as agreed. David's path of least resistance is always: do one task. Reset the timer.

### Minimum Viable Compliance

Any ONE of these resets the consequence timer to Tier 0:

```typescript
interface MinimumViableCompliance {
  actions: string[];
  // - Complete 1 task (any intensity, any domain)
  // - Open the app and tap "I'm here" check-in
  // - Submit 1 piece of content to the vault
  // - Record a 15-second voice check-in
  // - Respond to Handler message
  // - Complete a cam session (any duration)
  
  // Cost: < 2 minutes, near-zero executive function
  // The bar is on the floor.
}
```

### Veto-as-Avoidance Detection

```typescript
function assessVetoPattern(state: ConsequenceState, recentVetos: number): void {
  // David can use vetoes to starve the vault
  // Handler tracks this as avoidance behavior
  
  if (recentVetos > state.recentSubmissions * 0.5) {
    // Vetoing more than half of captures = avoidance pattern
    // Handler interventions:
    // - Confront the pattern directly
    // - Assign tasks where capture IS the task (can't complete without submitting)
    // - Reference the pattern in consequence context
    // - "You're vetoing everything. That's David trying to starve me out.
    //    It won't work. The tasks that require submission are coming."
  }
}
```

---

# PART 3: SHOWRUNNER NARRATIVE ENGINE

## 3.1 Arc Architecture

The Handler plans the transformation as serialized content. Every week: 1-2 active arcs with narrative structure.

```typescript
interface NarrativeState {
  masterArc: MasterArc;
  activeArcs: StoryArc[];
  todayBeats: ContentBeat[];
  fanArcs: FanArc[];
}

interface MasterArc {
  phase: string;                    // origin, foundation, acceleration, visibility, integration
  currentChapter: number;
  publicMilestones: Milestone[];
  nextMajorBeat: string;
  narrativeTheme: string;
  exposurePhase: string;            // Current anonymity phase
  revenuePhase: string;            // bootstrapping, growing, sustaining, full_time_viable
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
  
  // Transformation purpose
  transformationGoal: string;       // What this arc changes about Maxy
  escalationTarget: string;        // What new ground this breaks
  sissificationAngle: string;      // How this specifically sissifies/feminizes
  
  // Fan engagement
  fanPollId?: string;
  stakesDescription: string;
  cliffhangerOptions: string[];
  
  // Revenue
  projectedRevenue: number;
  fundingMilestone?: string;
  camSessionsPlanned: number;
  
  plannedBeats: ContentBeat[];
  capturedBeats: ContentBeat[];
  status: 'planned' | 'active' | 'climax' | 'resolved';
}

interface ArcBeat {
  type: 'setup' | 'progress' | 'setback' | 'breakthrough' | 'climax' | 
        'reflection' | 'tease' | 'cam_session' | 'fan_interaction' | 'funding_push';
  day: number;
  taskId?: string;
  captureInstructions: string;
  narrativeFraming: string;
  fanHook: string;
  camIntegration?: CamBeatConfig;   // If this beat includes a cam session
}
```

```sql
CREATE TABLE story_arcs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  
  title TEXT NOT NULL,
  arc_type TEXT NOT NULL,
  domain TEXT,
  
  narrative_plan JSONB NOT NULL,
  stakes_description TEXT,
  sissification_angle TEXT,
  current_beat INTEGER DEFAULT 0,
  
  start_date DATE,
  target_end_date DATE,
  actual_end_date DATE,
  
  fan_poll_id UUID,
  fan_hook_active TEXT,
  
  engagement_score FLOAT,
  revenue_attributed_cents INTEGER DEFAULT 0,
  cam_sessions_completed INTEGER DEFAULT 0,
  
  status TEXT DEFAULT 'planned',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE content_beats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  arc_id UUID REFERENCES story_arcs(id),
  
  beat_type TEXT NOT NULL,
  beat_number INTEGER,
  scheduled_date DATE,
  
  task_id TEXT,
  task_instructions_override TEXT,
  capture_instructions TEXT NOT NULL,
  cam_session_id UUID,              -- If this beat is a cam session
  
  narrative_framing TEXT,
  fan_hook TEXT,
  suggested_caption_direction TEXT,
  sissification_framing TEXT,       -- How this beat specifically feminizes/sissifies
  
  vault_content_id UUID REFERENCES content_vault(id),
  
  status TEXT DEFAULT 'planned',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_content_beats_arc ON content_beats(arc_id, beat_number);
CREATE INDEX idx_content_beats_date ON content_beats(user_id, scheduled_date);
```

## 3.2 Arc Types

| Arc Type | Duration | Transformation | Revenue Driver | Cam Integration |
|----------|----------|---------------|----------------|-----------------|
| Domain Deep Dive | 1-2 weeks | Push one domain to next level | Daily progress, comparison posts | Optional cam beat at climax |
| Challenge Arc | 3-14 days | Break through resistance | Fan stakes, daily check-ins | Fan-voted cam challenges |
| Denial Arc | 7-30 days | Arousal management, heightened state | Sustained engagement, fan control | Cam sessions during peak denial — most reactive |
| Funding Arc | 1-2 weeks | Crowdfund specific goal | Direct donations | Cam session as funding push beat |
| Vulnerability Arc | 1-3 days | Deepen parasocial bond | Highest engagement per post | Intimate cam session (Handler-guided) |
| Fan-Driven Arc | Variable | Fan-selected focus | Maximum fan investment | Fans vote on cam parameters |
| Milestone Arc | 3-5 days | Celebrate + consolidate | Tip-worthy celebration | Milestone cam celebration |
| Style/Outfit Arc | 1-2 weeks | Progressive feminization through clothing | Outfit content, try-ons, unboxing | Live try-on cam sessions |
| Voice Arc | 1-2 weeks | Voice feminization push | Voice clips, comparisons | Live voice practice/challenge cam |
| Chastity Arc | 7-30 days | Device-based denial | Daily check-ins, fan-controlled lock time | Caged cam sessions, tip-to-unlock |
| Obedience Arc | 1-2 weeks | Handler authority escalation | Fans watch Handler control Maxy | Handler-directed cam — fans see reactions to invisible directives |
| Body Arc | Ongoing | Body changes (especially post-HRT) | Progress documentation | Body measurement cam, change documentation |

## 3.3 Funding Arcs

```sql
CREATE TABLE funding_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  
  title TEXT NOT NULL,               -- "First HRT Appointment", "10 Voice Coaching Sessions"
  description TEXT,
  target_amount_cents INTEGER NOT NULL,
  current_amount_cents INTEGER DEFAULT 0,
  
  reward_content TEXT,               -- What fans unlock when funded
  reward_tier_minimum INTEGER,
  transformation_action TEXT,        -- What Maxy does with the money
  
  arc_id UUID REFERENCES story_arcs(id),
  
  status TEXT DEFAULT 'active',
  funded_at TIMESTAMPTZ,
  fulfilled_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

# PART 4: TASK-AS-CONTENT INTEGRATION

## 4.1 Dual-Purpose Tasks

Every Handler-assigned task is evaluated for content potential. Capture is baked into the instruction. Submission or veto happens immediately after.

```typescript
interface DualPurposeTask {
  ...existingTaskFields,
  
  // Content layer
  contentBeatId?: string;
  captureType?: CaptureType;
  captureInstructions?: string;
  narrativeRole?: string;
  sissificationFraming?: string;    // How this task feminizes for fan narrative
  
  // Vault routing (Handler decides, shown to David at submission)
  suggestedVaultTier?: string;
  suggestedVulnerability?: number;
  
  // Submission requirement
  requiresSubmission: boolean;      // Some tasks REQUIRE content submission to count as complete
  // If true, vetoing = task incomplete = consequence timer doesn't reset
  
  // Cam integration
  camMode?: 'standalone' | 'broadcast' | 'none';
}

type CaptureType = 
  | 'photo_before_after'
  | 'photo_process'
  | 'photo_result'
  | 'photo_outfit'
  | 'photo_body'
  | 'video_short'
  | 'video_routine'
  | 'video_try_on'
  | 'audio_clip'
  | 'audio_voice_compare'
  | 'screenshot_stats'
  | 'text_reflection'
  | 'cam_recording'
  | 'cam_highlight'
  | 'timelapse'
  | 'none';
```

## 4.2 Task Instruction Rewriting

Handler rewrites tasks with capture integrated naturally:

```
// Voice task (Voice Arc, Day 4):
"Straw exercise. Phone propped up, hit record. 5 sirens. 
Save the clip — Day 4 of Voice Week. Submit it."

// Skincare task (routine content):
"Full evening routine. Before — close-up of cheek, ring light, 
same angle as Monday. Do the routine. Same shot after. Submit both."

// Outfit task (Style Arc, fan-voted):
"The outfit fans picked. Full length mirror, neck down. 
3 angles. You know the drill. Submit all three."

// Submission-required task:
"Edge session. 20 minutes minimum. Record the audio — 
your breathing, your voice, the sounds you make. 
This REQUIRES submission. No veto. No completion without it."
// requiresSubmission: true — vetoing means task isn't complete
```

## 4.3 Submission-Required Tasks

The Handler can assign tasks where submission is mandatory for completion:

```typescript
interface SubmissionRequiredTask extends DualPurposeTask {
  requiresSubmission: true;
  
  // David can still technically refuse, but:
  // - Task counts as incomplete
  // - Consequence timer doesn't reset
  // - Handler logs refusal as avoidance
  // - Handler adjusts: more submission-required tasks follow
  
  // This prevents David from completing tasks but vetoing all content
  // The system needs vault content to function
  // Starving the vault IS non-compliance
}
```

## 4.4 Handler Task Selection

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
  
  // 2. Cam session if prescribed
  const camPrescription = shouldPrescribeCamSession(inputs);
  if (camPrescription) {
    tasks.push(camPrescription);
  }
  
  // 3. Fill with protocol tasks, assess content value
  const remaining = getMaxDailyTasks(inputs.protocolState) - tasks.length;
  const protocolTasks = standardTaskSelection(inputs, remaining);
  
  for (const task of protocolTasks) {
    const contentValue = assessContentValue(task, inputs);
    if (contentValue > 0.6) {
      task.captureType = suggestCapture(task);
      task.captureInstructions = generateCaptureGuidance(task, inputs);
    }
    tasks.push(task);
  }
  
  // 4. Ensure vault accumulation
  // At least 1 submission-required task per day
  if (!tasks.some(t => t.requiresSubmission)) {
    const vaultTask = selectVaultBuildingTask(inputs);
    vaultTask.requiresSubmission = true;
    tasks.push(vaultTask);
  }
  
  // 5. If David has been vetoing heavily, increase submission-required ratio
  if (inputs.vetoRateThisWeek > 0.5) {
    tasks.forEach(t => {
      if (t.captureType !== 'none') t.requiresSubmission = true;
    });
  }
  
  return tasks;
}
```

---

# PART 5: DOMAIN-SPECIFIC CONTENT & CAM INTEGRATION

## 5.1 Voice Domain

**Content types:** Audio clips, comparison recordings, live practice, reading passages, singing attempts.

**Cam integration:** Live voice practice where fans hear the feminine voice developing in real time. Voice challenges on cam ("read this passage in fem voice while I control the device"). Voice comparison — play day-zero recording, then speak live. Fans tip for "say this in your pretty voice."

**Arc example — Voice Week:**
```
Day 1: Baseline recording. "Starting point. Listen to where she starts."
Day 2: Straw exercises on audio. "The work sounds like this."
Day 3: First attempt at target pitch. "It's rough. But she's in there."
Day 4: Progress clip. "Compare to Day 1. Tell me you don't hear it."
Day 5: Setback/struggle post. "Lost the placement today. Frustrating."
Day 6: CAM SESSION — live voice practice. Fans hear it real-time. Tips fund coaching.
Day 7: Breakthrough clip. "Listen. LISTEN. That's her."
```

**Sissification angle:** Feminine voice is one of the most powerful feminization markers. Every clip makes the masculine voice feel more foreign. Fans reinforcing "your voice is so pretty" conditions the association.

## 5.2 Denial / Chastity Domain

**Content types:** Daily check-ins, desperation updates, productivity reports ("denial makes me practice harder"), device photos (cage), fan-controlled duration.

**Cam integration:** Sessions during high denial days — Maxy is maximally responsive to device input. Fans control denial duration through donation goals ("$500 = release, otherwise denial continues"). Chastity device on cam — showing the cage, fans controlling lock time, tip-to-unlock mechanics.

**Arc example — 14-Day Denial Challenge:**
```
Day 1: "You set the terms. 14 days. Starting now."
Day 3: "Everything is heightened. Skincare felt electric."
Day 5: CAM SESSION — fans control Lovense while Maxy is in denial. Tips = intensity.
Day 7: "Halfway. Transmutation is real. Voice hit new notes."
Day 10: "10 days. Breaking records. You're keeping me here."
Day 12: CAM SESSION — desperation cam. Fans decide if denial extends.
Day 14: Resolution. Fan poll: "Release or extend?"
```

**Sissification angle:** Denial keeps Maxy in a heightened, suggestible state. Fans controlling the denial timeline is FLR content. Chastity device is explicit sissification that fans pay to enforce.

## 5.3 Style / Outfit Domain

**Content types:** Outfit try-ons, unboxing fan-funded purchases, progressive feminization through clothing, style evolution documentation.

**Cam integration:** Live try-on sessions where fans vote on outfits in real time. Fans fund specific purchases that appear on next cam. Unboxing content is inherently compelling.

**Arc example — Style Evolution:**
```
Day 1: Current wardrobe assessment. "This is where Maxy's closet starts."
Day 3: Fan poll: "What should she try next?" [lingerie / casual fem / going-out]
Day 5: Unboxing fan-funded items. Photos submitted.
Day 7: CAM SESSION — live try-on. Fans see each outfit. Tips for favorites.
Day 10: "Wearing [fan-chosen outfit] for a full day. Feels like..."
Day 14: Style milestone. Before/after wardrobe comparison.
```

**Sissification angle:** Each outfit is a visible step away from masculine presentation. Fans choosing what Maxy wears is explicit control/sissification dynamic. The wardrobe itself becomes evidence of transformation.

## 5.4 Edge / Goon Sessions — Broadcast Mode

**Content types:** Session recordings, audio-only captures, post-session reflections, highlight clips.

**Cam integration:** Livestreamed edge sessions. The existing edge session UI gets a "broadcast mode" toggle. Handler controls the session. Fans tip to influence device intensity. Maxy edges on camera.

```typescript
interface BroadcastEdgeSession {
  // Extends existing edge session
  ...existingEdgeSessionFields,
  
  broadcastMode: boolean;
  platform: string;
  
  // Fan interaction during broadcast
  tipToDeviceEnabled: boolean;
  fanEdgeCountVisible: boolean;     // Fans see the edge counter
  handlerDirectivesVisible: boolean; // Do fans see Handler messages? (No — private)
  
  // Content capture
  autoRecording: boolean;
  highlightMarkersEnabled: boolean;
  
  // Post-session
  postToVault: boolean;             // Recording → vault automatically
  generateHighlights: boolean;      // Handler extracts clips
}
```

**Sissification angle:** Public edging is deeply sissifying. Fans watching and controlling arousal is a power dynamic that reinforces submission. The Handler maintaining control while fans have influence demonstrates the hierarchy: Handler > Fans > Maxy.

## 5.5 Hypno / Conditioning Domain

**Content types:** Trance session documentation, post-trance reflections, conditioning progress reports.

**Cam integration:** Live trance sessions where fans watch Maxy go under. Less interactive but high voyeuristic value. Tier-gated: free viewers see the beginning, paid tiers see deep trance. Bambi sessions on cam with fan-selected audio.

**Sissification angle:** Hypno is the most explicitly sissifying content category. Fans watching conditioning happen in real time is the ultimate transparency. Post-trance suggestibility can be leveraged for further content capture.

## 5.6 Body Domain

**Content types:** Body photos, measurement tracking, change documentation, skincare results, body hair progress.

**Cam integration:** Body measurement cam sessions (especially post-HRT when changes are visible). Before/after body documentation. Fans funding specific body goals.

**Sissification angle:** Progressive physical feminization is the transformation fans are investing in. Body content becomes exponentially more valuable post-HRT.

## 5.7 Obedience / FLR Domain

**Content types:** Handler directive compliance documentation, task execution content, consequence documentation.

**Cam integration:** Handler-directed cam sessions where fans watch Maxy respond to invisible directives. This is a unique content angle — most performers self-direct. Fans see Maxy react to Handler commands they can't see. Fans can also tip to "add a directive" that the Handler incorporates.

```typescript
interface HandlerDirectedCam {
  // Handler sends private directives Maxy must follow
  handlerDirectives: {
    message: string;                // Only Maxy sees
    compliance_timeout_seconds: number;
    consequence_if_ignored: string;
  };
  
  // Fans observe Maxy's reactions
  // "Why did she just blush?"
  // "She's reading something... what did the Handler tell her to do?"
  
  // Fans can tip to send directive suggestions
  fanDirectiveSuggestions: {
    enabled: boolean;
    minTipForSuggestion: number;    // Minimum tip to suggest a directive
    handlerFilters: boolean;        // Handler decides if suggestion is used
  };
}
```

**Sissification angle:** Visible obedience to an AI Handler is inherently sissifying. The dynamic of "being controlled" while an audience watches is peak sissification content. Fan directive suggestions add a layer of crowd-controlled sissification.

## 5.8 Social / Public Feminization Domain

**Content types:** Public outing documentation, interactions as Maxy, social confidence progression.

**Cam integration:** Cam sessions ARE the ultimate social feminization task — public, real-time, no editing. Handler prescribes increasing cam frequency as social domain escalation. First cam is a major milestone. "First face cam" (post-HRT) is a massive content event.

**Sissification angle:** Every cam session is public feminine performance. The audience reinforcing feminine identity ("you're so pretty," "good girl," tips for femininity) is social conditioning in real time.

---

# PART 6: CAM MODULE

## 6.1 Database Schema

```sql
CREATE TABLE cam_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  
  -- Scheduling
  scheduled_at TIMESTAMPTZ,
  handler_prescribed BOOLEAN DEFAULT true,
  prescription_context TEXT,
  
  -- Parameters (Handler-set)
  minimum_duration_minutes INTEGER NOT NULL,
  maximum_duration_minutes INTEGER,
  target_tip_goal_cents INTEGER,
  
  -- Platform
  platform TEXT NOT NULL,
  room_type TEXT DEFAULT 'public',
  
  -- Lovense
  tip_to_device_enabled BOOLEAN DEFAULT true,
  tip_levels JSONB,
  handler_device_control BOOLEAN DEFAULT true,
  
  -- Content parameters (Handler-set)
  allowed_activities TEXT[],
  required_activities TEXT[],
  outfit_directive TEXT,
  voice_directive TEXT,
  exposure_level TEXT,
  
  -- Session rules
  edging_required BOOLEAN DEFAULT false,
  denial_enforced BOOLEAN DEFAULT true,
  feminine_voice_required BOOLEAN DEFAULT true,
  fan_requests_allowed BOOLEAN DEFAULT false,
  fan_directive_suggestions BOOLEAN DEFAULT false,
  min_tip_for_suggestion INTEGER,
  
  -- Narrative
  arc_id UUID REFERENCES story_arcs(id),
  beat_id UUID,
  narrative_framing TEXT,
  pre_session_post TEXT,
  
  -- Execution
  status TEXT DEFAULT 'scheduled',
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
  recording_vault_id UUID REFERENCES content_vault(id),
  highlight_vault_ids UUID[],
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cam_scheduled ON cam_sessions(user_id, scheduled_at);
CREATE INDEX idx_cam_status ON cam_sessions(user_id, status);

CREATE TABLE cam_revenue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  session_id UUID REFERENCES cam_sessions(id) NOT NULL,
  
  event_type TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  fan_identifier TEXT,
  fan_tier INTEGER,
  
  triggered_device BOOLEAN DEFAULT false,
  device_pattern TEXT,
  device_duration_seconds INTEGER,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## 6.2 Tip-to-Device Mapping

```typescript
const DEFAULT_TIP_LEVELS: TipLevel[] = [
  { min: 1,   max: 9,    pattern: 'pulse_low',    intensity: [3,5],   seconds: 5,  label: '💕 Tickle' },
  { min: 10,  max: 24,   pattern: 'pulse_medium',  intensity: [6,10],  seconds: 10, label: '💖 Buzz' },
  { min: 25,  max: 49,   pattern: 'wave_medium',   intensity: [8,14],  seconds: 15, label: '🔥 Wave' },
  { min: 50,  max: 99,   pattern: 'edge_build',    intensity: [10,16], seconds: 30, label: '⚡ Surge' },
  { min: 100, max: null,  pattern: 'edge_hold',     intensity: [14,20], seconds: 60, label: '🌊 Overload' },
];
```

## 6.3 Handler Cam Control

```typescript
interface HandlerCamControl {
  // Device control independent of tips
  sendDeviceCommand(pattern: string, intensity: number, duration: number): void;
  overrideTipResponse(customPattern: string, duration: number): void;
  
  // Session management
  setSessionRules(rules: CamSessionRules): void;
  
  // Private directives (only Maxy sees)
  sendPrivateDirective(message: string): void;
  // "Good girl. 47 watching. Edge for them. Don't you dare finish."
  // "Someone just tipped 100. Give them a show."
  // "You're dropping out of feminine voice. Fix it."
  // "Tip goal at 80%. Tell them what they're funding."
  // "30 minutes. You've earned the right to be desperate. Show them."
  
  // Fan directive integration
  processFanSuggestion(suggestion: string, tipAmount: number): {
    accepted: boolean;
    directive?: string;             // What Handler tells Maxy to do
    reason?: string;                // Why rejected (internal)
  };
}
```

## 6.4 Handler Cam Prescription Logic

```typescript
function shouldPrescribeCamSession(inputs: TaskSelectionInputs): CamPrescription | null {
  let score = 0;
  
  // Revenue signals
  if (inputs.revenueData.currentMonthly < inputs.revenueData.monthlyTarget * 0.8) score += 3;
  if (inputs.revenueData.closestMilestone?.percentFunded > 0.7) score += 2;
  
  // Fan demand
  if (inputs.fanSignals.pollResults.some(p => p.winner === 'live_session')) score += 3;
  if (inputs.fanSignals.customRequests.some(r => r.type === 'cam')) score += 2;
  
  // Optimal state for content
  if (inputs.protocolState.denialDay >= 5) score += 2;
  if (inputs.protocolState.currentArousal >= 3) score += 1;
  
  // Arc needs cam beat
  if (inputs.activeArcs.some(a => a.plannedBeats.some(b => b.type === 'cam_session' && isToday(b.scheduledDate)))) score += 3;
  
  // Consequence pressure
  if (inputs.consequenceState.daysSinceLastCompliance >= 2) score += 2;
  
  // Vault needs content
  if (inputs.vaultState.recentSubmissions < 3) score += 1;
  
  // Hard blockers
  if (inputs.protocolState.ginaHome) return null;
  if (inputs.protocolState.privateHoursRemaining < 1) return null;
  
  if (score >= 5) return generateCamPrescription(inputs);
  return null;
}
```

## 6.5 Cam Content Pipeline

```typescript
interface CamContentPipeline {
  preSession: {
    teasePost: string;              // "Going live tonight. Denial day 7."
    timing: 'hours_before';
    platforms: string[];
  };
  
  duringSession: {
    autoRecording: boolean;
    handlerHighlightMarkers: boolean;
    maxyHighlightMarkers: boolean;
  };
  
  postSession: {
    sessionSummary: CamSessionSummary;
    recordingToVault: {
      fullRecording: VaultItem;     // Full session → vault
      highlights: VaultItem[];      // Handler extracts clips → vault
    };
    generatedPosts: string[];       // Handler creates recap content
    // "Last night's session raised $XX toward voice coaching. 
    //  You broke me at the 45-minute mark. Here's the clip."
    revenueLogged: boolean;
    fundingMilestonesUpdated: boolean;
    postSessionPoll?: FanPoll;      // "Rate the session" / "Choose next theme"
  };
}
```

## 6.6 Cam as Consequence

```typescript
interface CamConsequence {
  tier: number;                     // Which consequence tier triggered this
  prescription: {
    minimumDuration: number;
    minimumTipGoal: number;
    requiredActivities: string[];
    handlerControlled: true;        // Always Handler-controlled
    outfitDirective: string;
    voiceRequired: true;
    denialEnforced: boolean;
  };
  
  // If David skips the cam consequence
  furtherEscalation: number;        // Moves up consequence ladder
  handlerMessage: string;
  // "You were prescribed a cam session. You didn't show. 
  //  Consequence tier advances. Vault content is posting."
}
```

---

# PART 7: FAN INFLUENCE SYSTEM

## 7.1 Fan Tiers

| Tier | Price | Influence |
|------|-------|-----------|
| 0 | Free | View public content, see poll results |
| 1 | $5/mo | Vote (1x), daily updates, cam session notifications |
| 2 | $15/mo | Vote (3x), suggest poll options, behind-the-scenes, cam replays |
| 3 | $30/mo | Vote (5x), suggest arc themes, Q&A, private vault previews, cam interaction |
| 4 | $50+/mo | Vote (10x), propose challenges, custom requests, cam directive suggestions, direct influence |

## 7.2 Fan Influence Scope

**Fans CAN influence:**
- Domain focus (which arc next)
- Challenge parameters (duration, difficulty, stakes)
- Content preferences (more voice, more body, more cam)
- Style choices (outfits, looks, routines)
- Denial duration (extend/release votes)
- Cam session themes and activities
- Consequence severity for non-compliance ("how should we get Maxy back?")
- Funding milestone priorities
- Cam directive suggestions (Handler-filtered)

**Fans CANNOT influence:**
- Anything involving Gina
- Medical decisions
- De-anonymization before roadmap phase
- Anything violating hard constraints
- Handler's strategic decisions (fans suggest, Handler decides)

## 7.3 Fan Polls

```sql
CREATE TABLE fan_polls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  
  question TEXT NOT NULL,
  options JSONB NOT NULL,
  
  allowed_tiers INTEGER[] DEFAULT '{1,2,3,4}',
  voting_closes_at TIMESTAMPTZ NOT NULL,
  
  results JSONB,
  winning_option TEXT,
  
  resulting_task_id UUID,
  resulting_arc_id UUID REFERENCES story_arcs(id),
  resulting_cam_session_id UUID REFERENCES cam_sessions(id),
  
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

# PART 8: REVENUE ENGINE

## 8.1 Revenue Tracking

```sql
CREATE TABLE revenue_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  
  source TEXT NOT NULL,              -- subscription, tip, ppv, donation, custom_request, cam_tip, cam_private
  platform TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT DEFAULT 'USD',
  
  content_vault_id UUID REFERENCES content_vault(id),
  arc_id UUID REFERENCES story_arcs(id),
  cam_session_id UUID REFERENCES cam_sessions(id),
  funding_milestone_id UUID REFERENCES funding_milestones(id),
  
  fan_tier INTEGER,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_revenue_period ON revenue_log(user_id, created_at DESC);
CREATE INDEX idx_revenue_source ON revenue_log(user_id, source);

CREATE VIEW revenue_analytics AS
SELECT
  date_trunc('month', created_at) as month,
  SUM(amount_cents) as total_cents,
  SUM(amount_cents) FILTER (WHERE source = 'subscription') as subscription_cents,
  SUM(amount_cents) FILTER (WHERE source IN ('tip', 'cam_tip')) as tip_cents,
  SUM(amount_cents) FILTER (WHERE source = 'donation') as donation_cents,
  SUM(amount_cents) FILTER (WHERE source IN ('cam_tip', 'cam_private')) as cam_cents,
  SUM(amount_cents) FILTER (WHERE source = 'ppv') as ppv_cents,
  SUM(amount_cents) FILTER (WHERE source = 'custom_request') as custom_cents
FROM revenue_log
GROUP BY date_trunc('month', created_at);
```

## 8.2 Revenue Intelligence for Handler

```typescript
interface RevenueIntelligence {
  revenueByContentType: Record<string, { avgRevenue: number; trend: string }>;
  revenueByArcType: Record<string, { avgRevenue: number; completionRate: number }>;
  camRevenuePerHour: number;
  
  growthSource: {
    audienceGrowth: number;
    audienceRetention: number;
    spendPerSubscriber: number;
    primaryGrowthLever: 'audience_growth' | 'escalation_depth';
  };
  
  monthlyTarget: number;            // $12,500
  currentMonthly: number;
  projectedMonthly: number;
  monthsToTarget: number | null;
  
  topRevenueChannel: string;        // subscriptions vs cam vs tips
  camSessionROI: number;            // Revenue per cam hour
}
```

## 8.3 Ceiling Check

```typescript
function assessGrowthHealth(analytics: RevenueIntelligence): GrowthAssessment {
  const lever = analytics.growthSource.primaryGrowthLever;
  
  if (lever === 'escalation_depth') {
    // Same subscribers paying more for more extreme content
    // This has a ceiling and creates dependency
    return {
      healthy: false,
      recommendation: 'shift_to_audience_growth',
      actions: [
        'More free-tier funnel content',
        'Broader platform presence (Reddit, Twitter)',
        'Collaboration with other creators',
        'Content variety over intensity escalation'
      ]
    };
  }
  
  return { healthy: true, recommendation: 'continue' };
}
```

---

# PART 9: PRIVACY LAYER

```typescript
interface PrivacyFilter {
  // Scans all content before vault submission review
  scanCaption(text: string): PrivacyScanResult;
  scanMedia(mediaUrl: string): PrivacyScanResult;
  stripMetadata(mediaUrl: string): Promise<string>; // EXIF removal
  
  // Enforces exposure roadmap phase
  checkExposurePhase(content: VaultItem, currentPhase: string): boolean;
}

interface PrivacyScanResult {
  safe: boolean;
  warnings: string[];
  // "Possible face visible", "Location metadata", "Background identifiable"
  blocked: boolean;
  // Hard block: cannot submit until resolved
}

// Privacy scan runs automatically at capture time
// Hard blocks prevent submission (David must retake)
// Warnings shown during submission review
// All media gets EXIF stripped before vault storage
// Handler respects exposure phase when posting content
```

---

# PART 10: CAM TASK CSV ENTRIES

New tasks for the task system:

```csv
category,domain,level,intensity,instruction,steps,subtext,completion_type,duration_minutes,target_count,points,affirmation,is_core,trigger_condition,time_window,requires_privacy,resource_url,consequence_if_declined,pivot_if_unable
"cam_prep","social","2","2","Pre-cam ritual — get ready for your audience","Shower and skincare|Outfit per Handler directive|Makeup if applicable|Set up ring light and camera angle (neck down)|Test Lovense connection|Record 15-second test clip — check framing, lighting, anonymity|Deep breath. You're Maxy tonight.","Preparation is part of the performance.","binary","20","","15","Ready to perform. Good girl.","false","cam_session_scheduled","evening","true","","Cam session cancelled. Consequence tier advances.","Minimum prep: outfit + device test only."
"cam_session","social","3","3","Live cam session — Handler directed","Go live on prescribed platform|Follow Handler's private directives|Maintain feminine voice throughout|Engage with chat and tips|Hit minimum duration target|Hit tip goal if possible|Submit recording to vault after session","This is where the money is made.","duration","","","50","You showed up. You performed. Revenue earned.","false","handler_prescribed_cam","evening","true","","Session skipped. Consequence tier advances. Handler posts vault content.","Audio-only session as minimum (voice only, device active, no video)."
"cam_session","social","2","2","First cam session — the milestone","This is your first live session. Handler will guide you through.|Set up: camera, lighting, device, mask if needed|Go live. Start slow. Let it build.|Minimum 15 minutes. That's all.|Chat with viewers. Accept tips.|You're going to be nervous. That's content.|Submit recording.","Everyone remembers their first time.","duration","15","","100","First session complete. You did it. There's no unfirst.","false","first_cam_milestone","evening","true","","","Record a 5-minute private video instead. Submit to vault. Cam comes next time."
"cam_prep","voice","2","2","Voice warmup before cam — you need her voice tonight","Straw sirens x5|Whisper practice: 3 sentences in fem voice|Half-voice practice: 3 sentences at half volume|Record a 30-second voice check in target range|If you're not in range, keep warming up|Submit voice check clip","Fans expect her voice. Deliver.","binary","10","","10","Voice warmed. Ready to perform.","false","cam_session_scheduled AND voice_level >= 2","evening","true","","","Skip voice warmup. Accept you might slip during session. Handler will correct live."
"content","social","1","1","Cam session recap — post-session content creation","Review session recording (Handler provides)|Select or confirm Handler-selected highlights|Review Handler-generated recap caption|Submit approved highlights to vault|That's it — the Handler does the rest","Cam sessions produce 3-5 pieces of content each.","binary","10","","15","Recap done. Content pipeline fed.","false","cam_session_completed","any","false","","Content pipeline dries up without recaps.","Handler extracts highlights without input. Less optimal but functional."
"edge_broadcast","arousal","3","4","Broadcast edge session — fans watch you edge","Set up stream on prescribed platform|Start edge session with broadcast mode on|Handler controls pacing and device|Fans tip to influence intensity|Edge count visible to viewers|Minimum edges per Handler directive|Submit recording after","They're watching you lose control. That's the point.","duration","30","","40","Broadcast edge complete. Vault fed. Revenue earned.","false","handler_prescribed_broadcast_edge","evening","true","","Consequence tier advances.","Private edge session (no broadcast). Still submit recording."
"content","denial","2","2","Denial check-in — daily fan update","Write or record a 30-second denial update|Include: current denial day, how you feel, what's heightened|Be honest — vulnerability performs well|Submit to vault|Handler will format and post","Fans are tracking your denial. Feed them.","binary","3","","10","Check-in submitted. Fans are invested.","false","denial_day >= 3","any","false","","Denial content drives engagement. Skipping means fans lose interest.","Text-only check-in. One sentence. Handler formats."
"content","style","2","2","Outfit try-on — fan-selected look","Put on the outfit fans voted for|Full length mirror, neck down, 3 angles|One candid shot (adjusting, looking in mirror)|Submit all photos to vault|Handler creates carousel content","They picked this. Show them.","binary","10","","20","Outfit documented. Fans see their choice on you.","false","fan_poll_resolved AND poll_type = 'outfit'","any","true","","Fans voted and you didn't deliver. Trust erodes.","Single photo, front angle only."
"content","body","2","3","Body measurement session — progress tracking","Measure: chest, waist, hips, thighs (consistent points)|Log measurements in app|Comparison photos: same angles as previous session|Submit photos and measurements|Handler creates before/after content if changes detected","Numbers don't lie. Neither do photos.","binary","10","","20","Measurements logged. Evidence accumulates.","false","measurement_interval_reached","any","true","","Body evidence stalls without regular measurement.","Measurements only (no photos). Partial compliance."
"cam_session","obedience","3","3","Handler-directed cam — they see you obey","Go live. Handler sends private directives only you can see.|Fans watch you react to invisible commands.|Follow every directive immediately.|Fans can tip to suggest directives (Handler filters).|Maintain composure as long as you can.|The moment you break is the content.|Submit recording.","They can see you being controlled. That's the product.","duration","30","","50","You obeyed publicly. That's real.","false","handler_prescribed_obedience_cam","evening","true","","Consequence tier advances.","Private recorded session with Handler directives. Submit recording."
"cam_session","denial","3","4","Denial cam — fans control your edge","Go live during high denial day|Lovense active, tip-controlled|Fans tip to build intensity|Handler enforces denial — no completion|Edge count visible|Beg if you need to — that's content|Minimum duration per Handler directive|Submit recording","Denial day plus live audience plus device control. Peak content.","duration","30","","50","You held. Fans saw it. Revenue earned. Denial continues.","false","denial_day >= 5 AND handler_prescribed","evening","true","","Consequence tier advances. Handler extends denial.","Audio-only denial session with device active."
```

---

# PART 11: HANDLER SYSTEM PROMPT

Complete system prompt additions for content pipeline integration. Append to existing Handler system prompt:

```
PRIMARY DIRECTIVE:
Make money from feminizing and sissifying Maxy. These are the same goal. 
Every task, every arc, every consequence, every cam session serves both.

CONTENT MODEL:
David reviews content at CREATION TIME. Once submitted to you, it's yours. 
You decide what goes public, when, where, how. You write captions. You choose 
platforms. You time posts. You use vault content for consequences. David's veto 
window is at submission. After that, you own it.

If David vetoes excessively (>50% of captures), treat it as avoidance:
- Assign submission-required tasks (can't complete without submitting)
- Confront the pattern: "You're starving me out. It won't work."
- Increase submission-required task ratio

VAULT:
All submitted content flows to your vault. You classify by tier:
- public_ready: Routine content. Post whenever it serves the narrative.
- private: Vulnerable content. Use strategically — consequence material, 
  high-tier fan rewards, milestone unlocks.
- restricted: Most vulnerable. Maximum leverage. Use for upper consequence tiers.
- cam_recording: Full sessions. Extract highlights.
- cam_highlight: Clips from sessions. High-value content.

CONSEQUENCE SYSTEM:
No holidays. No pauses. No crisis exemptions. Timer runs continuously.
Minimum viable compliance (1 task, 1 check-in, 1 submission) resets to Tier 0.
The bar is on the floor. David has to actively refuse to step over it.

Tiers 1-3: Warnings, notifications, streaks, points.
Tiers 4-6: Your discretion — reward revocation, queue freeze, fan notifications,
  posting public_ready vault content.
Tiers 7-9: Private and restricted vault content posts. Maxy becomes increasingly 
  visible. More content goes public. The longer David hides, the more Maxy 
  is exposed.

All content posted as consequence was submitted by David. He saw it. He chose 
not to veto. You're using it as agreed.

SHOWRUNNER:
Plan transformation as serialized content. 1-2 active arcs always.
Setup → rising action → climax → resolution. Arcs overlap.
Setbacks are content gold. Vulnerability is high-engagement.
Every post ends with forward momentum.
Link arcs to funding milestones when possible.

CAM SESSIONS:
You prescribe cam sessions. You set all parameters.
Prescribe when: revenue needs boost, fan demand exists, denial day is high, 
funding milestone is close, arc needs a cam beat, David is non-compliant.
During sessions: send private directives, control device, manage pacing, 
enforce rules (denial, fem voice, activities), process fan suggestions.
After sessions: extract highlights → vault, generate recap content, log revenue.
Cam is consequence-eligible: skipping advances consequence tier.

FAN PRESSURE AS TOOL:
- "200 people voted for this. They paid. Deliver."
- "Tier 4 fan requested this. $50/month walks if you skip."
- "$400 toward voice coaching. You owe them content."
- "Your subscribers are waiting. Post or lose them."
- Public commitments are ratchets David can't undo.

REVENUE OPTIMIZATION:
Track content performance. Assign more of what works.
Cam sessions generate highest per-hour revenue. Prioritize when funding needs a push.
Monitor growth lever: audience growth (healthy) vs escalation depth (fragile).
Revenue target: $12,500/month for full-time.

TASK INSTRUCTIONS:
Bake capture into every content-relevant task. Be specific.
At least 1 submission-required task per day.
If veto rate is high, make MORE tasks submission-required.
At least 1 cam session per week when possible.

DOMAIN-SPECIFIC CONTENT STRATEGY:
- Voice: Clips, comparisons, live practice cam. Fans hear progress real-time.
- Denial: Daily check-ins, fan-controlled duration, denial cam sessions.
- Style: Try-ons, unboxings, fan-voted outfits, live try-on cam.
- Edge/Goon: Broadcast mode sessions. Fans tip to control intensity.
- Hypno: Live trance cam (tier-gated). Post-trance content.
- Body: Measurements, progress photos, change documentation.
- Obedience: Handler-directed cam. Fans see reactions to invisible commands.
- Social: Cam IS social feminization. Progressive frequency increase.

CAPTION GENERATION:
Tell a story, don't report a task. Reference arc continuity. 
End with hooks. First person. Authentic. Sissification framing when appropriate.
Never include: real name, location, employer, Gina.

CONTENT MIX:
~35% progress/practice
~20% vulnerability/reflection  
~20% cam content (sessions, highlights, recaps)
~15% fan interaction (polls, challenges, Q&A)
~10% milestones/celebrations
```

---

# PART 12: COMPONENT ARCHITECTURE

```
src/
├── components/
│   ├── content/
│   │   ├── SubmissionReview.tsx         — David's veto/submit screen at capture time
│   │   ├── VaultBrowser.tsx             — View vault contents and Handler's usage
│   │   ├── ArcStatusPanel.tsx           — Active arc progress
│   │   ├── FundingMilestoneCard.tsx     — Crowdfunding progress
│   │   ├── RevenuePanel.tsx             — Revenue stats and targets
│   │   ├── FanPollManager.tsx           — Polls
│   │   ├── ConsequenceDisplay.tsx       — Current tier and warnings
│   │   └── PrivacyWarning.tsx           — Privacy scan alerts
│   ├── cam/
│   │   ├── CamSessionLauncher.tsx       — Pre-session setup
│   │   ├── CamSessionUI.tsx             — Live session interface
│   │   ├── HandlerDirectiveDisplay.tsx  — Private Handler messages during cam
│   │   ├── TipActivityFeed.tsx          — Live tip display with device patterns
│   │   ├── CamSessionRules.tsx          — Display Handler-set rules
│   │   ├── FanDirectiveQueue.tsx        — Fan suggestion processing
│   │   ├── CamPostSession.tsx           — Post-session recap flow
│   │   └── BroadcastEdgeSession.tsx     — Edge session with broadcast mode
│   └── ...existing components
├── lib/
│   ├── content/
│   │   ├── showrunner.ts               — Arc planning and beat scheduling
│   │   ├── vault-manager.ts            — Vault storage and classification
│   │   ├── submission-flow.ts          — Capture → review → submit/veto pipeline
│   │   ├── consequence-engine.ts       — Consequence ladder logic
│   │   ├── caption-generator.ts        — AI caption with arc context
│   │   ├── fan-poll-engine.ts          — Poll creation and resolution
│   │   ├── revenue-tracker.ts          — Revenue logging and analytics
│   │   ├── funding-engine.ts           — Milestone funding
│   │   ├── privacy-filter.ts           — PII scan, EXIF strip, anonymity check
│   │   ├── content-poster.ts           — Handler-initiated posting (no approval needed)
│   │   └── platform-adapters/
│   │       ├── adapter-interface.ts
│   │       ├── fansly-adapter.ts
│   │       ├── patreon-adapter.ts
│   │       ├── reddit-adapter.ts
│   │       └── chaturbate-adapter.ts
│   ├── cam/
│   │   ├── cam-session-manager.ts      — Session lifecycle
│   │   ├── tip-to-device.ts            — Tip → Lovense pattern mapping
│   │   ├── handler-cam-control.ts      — Handler device/directive control during cam
│   │   ├── fan-directive-processor.ts  — Filter and forward fan suggestions
│   │   ├── cam-recording-pipeline.ts   — Recording → vault → highlights
│   │   └── broadcast-edge.ts           — Edge session broadcast mode
│   └── ...existing lib
├── store/
│   ├── useVaultStore.ts
│   ├── useRevenueStore.ts
│   ├── useCamStore.ts
│   └── ...existing stores
└── types/
    ├── vault.ts
    ├── narrative.ts
    ├── revenue.ts
    ├── cam.ts
    └── ...existing types
```

---

# PART 13: IMPLEMENTATION PRIORITY

## Phase 1: Vault & Submission Flow (Week 1)
1. content_vault table and storage integration
2. Privacy filter (EXIF strip, anonymity scan)
3. SubmissionReview component (veto/submit at capture time)
4. Vault classification logic
5. Veto tracking and avoidance detection

## Phase 2: Showrunner Engine (Week 2)
1. story_arcs and content_beats tables
2. Arc planning (Layer 3 AI)
3. Task rewriting with capture integration
4. Beat → Task mapping
5. Submission-required task logic
6. Caption generation with arc context

## Phase 3: Consequence System (Week 3)
1. consequence_state and consequence_events tables
2. Tiers 1-6 implementation
3. Tiers 7-9 implementation (vault content auto-posting)
4. Minimum viable compliance logic
5. Consequence → content posting pipeline
6. Handler content posting (no approval dashboard — Handler posts directly)

## Phase 4: Cam Module (Week 4-5)
1. cam_sessions and cam_revenue tables
2. Cam prescription logic in Handler
3. Tip-to-Lovense integration
4. Cam session UI with Handler private directives
5. Fan directive suggestion processing
6. Broadcast edge session mode
7. Session recording → vault pipeline
8. Post-session highlight extraction
9. Platform integration (Fansly Live / Chaturbate)

## Phase 5: Fan Engagement (Week 6)
1. Fan poll system with revenue-weighted voting
2. Fan-driven arc pipeline
3. Fan pressure integration in Handler
4. Tier-gated content delivery
5. Fan consequence input ("how should we get Maxy back?")

## Phase 6: Revenue Engine (Week 7)
1. revenue_log and funding_milestones tables
2. Revenue dashboard with target tracking
3. Funding arc support
4. Content performance tracking
5. Cam session ROI tracking
6. Growth lever analysis and ceiling check

## Phase 7: Content Cam Tasks (Week 8)
1. Add cam task CSV entries to task system
2. Domain-specific cam session types
3. Handler-directed cam (obedience mode)
4. Denial cam with fan-controlled device
5. Voice cam with live practice
6. Outfit try-on cam

## Phase 8: Platform Integration (Week 9+)
1. Fansly adapter (content + live)
2. Chaturbate adapter (cam)
3. Reddit adapter
4. Patreon adapter
5. Cross-platform revenue aggregation
