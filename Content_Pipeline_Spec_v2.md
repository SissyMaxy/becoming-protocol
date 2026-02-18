# BECOMING PROTOCOL — Content Pipeline Spec v2
## Handler as Showrunner: Narrative-Driven Content Architecture
### Version 2.0 — February 2026

---

# PART 1: OVERVIEW

## 1.1 What This Is

The Handler is a showrunner. It plans the transformation as a serialized narrative where every task serves double duty: genuine practice AND content beat. Evidence capture is not a separate step — it's woven into task instructions. The Handler thinks in story arcs, plans content calendars alongside protocol calendars, and assigns tasks that naturally produce compelling fan-facing moments.

The protocol IS the content. The content IS the protocol. They are not separate systems.

## 1.2 Core Constraints

**Human-in-the-loop publishing.** The Handler NEVER auto-posts. All content requires explicit user approval from the Content Dashboard (not from inside session UI). This is a hard architectural constraint.

**Separation of contexts.** The Content Dashboard is a calm-state tool, never accessible during active sessions. Session UI and content approval UI are separate routes.

**ADHD-friendly approval flow.** Batch review, swipe-to-approve. 5-minute ceiling for a full queue review.

**The transformation is real.** Revenue optimization never overrides genuine practice. Fans pay because the journey is authentic. Faking progress for content kills the product.

## 1.3 The Showrunner Model

Traditional creator workflow:
```
Do thing → Photograph thing → Write caption → Post
```

Showrunner workflow:
```
Plan arc → Assign tasks that ARE content beats → Capture is built into the task → 
Caption generated from arc context → Queue for approval → Post advances the narrative
```

The Handler doesn't react to what happened today. It plans what WILL happen this week and assigns tasks that produce the story it's telling.

---

# PART 2: NARRATIVE ENGINE

## 2.1 Arc Architecture

The Handler maintains nested narrative structures:

```typescript
interface NarrativeState {
  // Long arc: months-long transformation narrative
  masterArc: MasterArc;
  
  // Medium arc: 1-2 week themed storylines
  activeArcs: StoryArc[];
  
  // Short arc: daily content beats
  todayBeats: ContentBeat[];
  
  // Reactive: fan-driven detours
  fanArcs: FanArc[];
}

interface MasterArc {
  phase: string;                    // 'origin', 'foundation', 'acceleration', 'visibility', 'integration'
  currentChapter: number;
  publicMilestones: Milestone[];    // Fan-visible progress markers
  nextMajorBeat: string;            // "First voice clip", "First public outing", etc.
  narrativeTheme: string;           // Current overarching theme fans are following
}

interface StoryArc {
  id: string;
  title: string;                    // "Voice Week", "The 14-Day Denial Challenge", "Skincare Transformation"
  domain: string;                   // Primary protocol domain
  startDate: Date;
  targetEndDate: Date;
  
  // Narrative structure
  setup: ArcBeat;                   // Tease / promise / baseline
  risingAction: ArcBeat[];          // Daily progress beats
  climax: ArcBeat;                  // Breakthrough moment / payoff
  resolution: ArcBeat;              // Reflection / what's next tease
  
  // Fan engagement hooks
  fanPollId?: string;               // If this arc was fan-chosen
  stakesDescription: string;        // What fans are rooting for
  cliffhangerOptions: string[];     // How to end posts with tension
  
  // Content plan
  plannedBeats: ContentBeat[];
  capturedBeats: ContentBeat[];
  
  status: 'planned' | 'active' | 'climax' | 'resolved';
}

interface ArcBeat {
  type: 'setup' | 'progress' | 'setback' | 'breakthrough' | 'climax' | 'reflection' | 'tease';
  day: number;                      // Day within the arc
  taskId?: string;                  // Protocol task that produces this beat
  captureInstructions: string;      // How to document this moment
  narrativeFraming: string;         // How Handler will frame this for fans
  fanHook: string;                  // What keeps fans engaged (question, cliffhanger, poll)
}
```

## 2.2 Arc Types

The Handler selects and sequences arcs based on protocol state, fan engagement, and revenue data.

### Domain Deep Dive (1-2 weeks)
Focused exploration of one protocol domain with daily content.
```
Day 1: "Starting point" — baseline capture, vulnerability post
Day 2-3: "The work" — practice content, process shots
Day 4: "The struggle" — honest difficulty post (setback beats perform well)
Day 5-6: "Progress" — comparison content, before/during
Day 7: "Breakthrough" — payoff moment, celebration, fan gratitude
```

### Challenge Arc (3-14 days)
Fan-initiated or Handler-initiated challenge with stakes.
```
Day 1: "The dare" — announce challenge, set stakes, fan poll on parameters
Day 2-N: "Daily check-in" — progress updates, struggle content, fan encouragement
Day N: "The result" — success/failure, consequences, next challenge tease
```

### Milestone Arc (3-5 days)
Building toward and celebrating a protocol milestone.
```
Day 1: "Almost there" — tease approaching milestone with stats
Day 2: "The push" — final tasks before milestone
Day 3: "Achievement unlocked" — celebration post, stats, reflection
Day 4: "What's next" — tease next milestone, fan poll on direction
```

### Vulnerability Arc (1-3 days)
Honest struggle content that deepens parasocial connection.
```
Day 1: "Hard day" — real reflection on difficulty (sanitized)
Day 2: "Getting back up" — resilience content
Day 3: "Stronger for it" — growth framing
```

### Fan-Driven Arc (variable)
Arc shaped by fan poll results.
```
Day 1: "You chose" — announce winning option, begin setup
Day 2-N: Execution with daily updates
Day N+1: "Delivered" — payoff content with fan acknowledgment
```

## 2.3 Database Schema: Narrative Tables

```sql
-- Story arcs
CREATE TABLE story_arcs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  
  title TEXT NOT NULL,
  arc_type TEXT NOT NULL,           -- domain_deep_dive, challenge, milestone, vulnerability, fan_driven
  domain TEXT,
  
  -- Narrative structure
  narrative_plan JSONB NOT NULL,    -- Full arc plan with beats
  stakes_description TEXT,
  current_beat INTEGER DEFAULT 0,
  
  -- Timing
  start_date DATE,
  target_end_date DATE,
  actual_end_date DATE,
  
  -- Fan engagement
  fan_poll_id UUID REFERENCES fan_polls(id),
  fan_hook_active TEXT,             -- Current cliffhanger/question
  
  -- Performance
  engagement_score FLOAT,          -- Running engagement metric for this arc
  revenue_attributed_cents INTEGER DEFAULT 0,
  
  -- Status
  status TEXT DEFAULT 'planned',   -- planned, active, climax, resolved, abandoned
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_story_arcs_active ON story_arcs(user_id, status) WHERE status IN ('active', 'climax');

-- Content beats (individual content moments within arcs)
CREATE TABLE content_beats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  arc_id UUID REFERENCES story_arcs(id),
  
  -- Beat definition
  beat_type TEXT NOT NULL,          -- setup, progress, setback, breakthrough, climax, reflection, tease
  beat_number INTEGER,              -- Order within arc
  scheduled_date DATE,
  
  -- Task integration
  task_id TEXT,                     -- References task from CSV/daily prescription
  task_instructions_override TEXT,  -- Modified task instructions with capture built in
  capture_instructions TEXT NOT NULL, -- Specific "how to document this" guidance
  
  -- Narrative
  narrative_framing TEXT,           -- How this beat fits the arc story
  fan_hook TEXT,                    -- Cliffhanger, question, tease for this beat
  suggested_caption_direction TEXT, -- Guidance for caption generation
  
  -- Content linkage
  content_queue_id UUID REFERENCES content_queue(id), -- Created when evidence captured
  evidence_id UUID,                 -- Link to evidence table
  
  -- Status
  status TEXT DEFAULT 'planned',   -- planned, assigned, captured, queued, posted, skipped
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_content_beats_arc ON content_beats(arc_id, beat_number);
CREATE INDEX idx_content_beats_date ON content_beats(user_id, scheduled_date);
```

---

# PART 3: TASK-AS-CONTENT INTEGRATION

## 3.1 The Dual-Purpose Task

Every task the Handler assigns is evaluated for content potential. Tasks don't get a separate "now take a photo" step — the capture is part of the task itself.

```typescript
interface DualPurposeTask {
  // Standard protocol task fields
  ...existingTaskFields,
  
  // Content layer (Handler adds these when task has content value)
  contentBeatId?: string;           // Links to planned content beat
  captureType?: CaptureType;        // What kind of evidence to produce
  captureInstructions?: string;     // Specific, spoon-free capture guidance
  narrativeRole?: string;           // How this fits the current arc
  fanVisibility: 'private' | 'potential' | 'planned';
}

type CaptureType = 
  | 'photo_before_after'    // Side-by-side comparison
  | 'photo_process'         // Mid-task documentation
  | 'photo_result'          // Final outcome
  | 'video_short'           // 15-30 second clip
  | 'audio_clip'            // Voice recording
  | 'screenshot_stats'      // Progress metrics
  | 'text_reflection'       // Written content (no media)
  | 'timelapse'             // Multi-photo compiled later
  | 'none';                 // Task has no content value today
```

## 3.2 Task Instruction Rewriting

The Handler rewrites task instructions to integrate capture naturally. The user doesn't experience "do task + photograph task" as two steps. It's one flow.

```typescript
// BEFORE (standard protocol task):
// "Straw exercise — 5 sirens with breath between each"

// AFTER (showrunner-enhanced, during Voice Week arc):
// "Straw exercise — 5 sirens. Prop your phone on the counter, 
//  hit record before you start. Don't worry about quality — 
//  the sound of you working is the content. Save the clip."

// BEFORE (standard skincare task):
// "Full evening skincare routine with feminine framing"

// AFTER (during Skincare Transformation arc, Day 5):
// "Full evening routine. Before you start, take a close-up of 
//  your cheek in good light — same angle as Monday's photo. 
//  Do the routine. Take the same shot after. 
//  Five days in. Your skin is telling the story."

interface TaskRewriteContext {
  originalTask: Task;
  activeArc: StoryArc | null;
  currentBeat: ContentBeat | null;
  dayInArc: number;
  previousCaptures: string[];       // What we already have from this arc
  fanContext: string;               // What fans are expecting/waiting for
  captureGuidance: CaptureGuidance;
}

interface CaptureGuidance {
  type: CaptureType;
  angle?: string;                   // "Same angle as Day 1", "Close-up", etc.
  lighting?: string;                // "Natural light", "Ring light"
  framing?: string;                 // "Hands only", "Neck down", "Profile"
  duration?: number;                // For video/audio clips, in seconds
  comparison?: string;              // "Compare against [evidence_id]"
  privacy?: string;                 // "Face mask on", "Crop above chin"
}
```

## 3.3 Handler Task Selection with Content Awareness

The Handler's task selection algorithm now considers narrative needs alongside protocol needs:

```typescript
interface TaskSelectionInputs {
  // Existing protocol inputs
  protocolState: UserState;
  domainLevels: DomainLevel[];
  streakData: StreakData;
  moodData: MoodData;
  avoidancePatterns: string[];
  
  // NEW: Content inputs
  activeArcs: StoryArc[];
  todaysPlannedBeats: ContentBeat[];
  contentQueueDepth: number;
  daysSinceLastPost: number;
  fanPollsPending: FanPoll[];
  engagementTrend: 'up' | 'flat' | 'down';
  revenueData: RevenueContext;
}

function selectTasks(inputs: TaskSelectionInputs): PrescribedTask[] {
  const tasks: PrescribedTask[] = [];
  
  // 1. Check if today has planned content beats
  for (const beat of inputs.todaysPlannedBeats) {
    // Find protocol task that serves this beat
    const matchedTask = findTaskForBeat(beat, inputs.protocolState);
    if (matchedTask) {
      // Rewrite task to include capture
      const enhanced = rewriteTaskForContent(matchedTask, beat, inputs.activeArcs);
      enhanced.priority = 'high'; // Content beats get priority
      tasks.push(enhanced);
    }
  }
  
  // 2. Fill remaining slots with standard protocol tasks
  const remainingSlots = getMaxDailyTasks(inputs.protocolState) - tasks.length;
  const protocolTasks = standardTaskSelection(inputs, remainingSlots);
  
  // 3. Evaluate protocol tasks for opportunistic content value
  for (const task of protocolTasks) {
    const contentValue = assessContentValue(task, inputs);
    if (contentValue > 0.6) {
      // High content potential — add light capture instructions
      task.captureType = suggestCapture(task);
      task.captureInstructions = generateCaptureGuidance(task, inputs);
      task.fanVisibility = 'potential';
    }
    tasks.push(task);
  }
  
  return tasks;
}

// Content value assessment
function assessContentValue(task: Task, inputs: TaskSelectionInputs): number {
  let score = 0;
  
  // Visual tasks score higher
  if (['skincare', 'style', 'movement'].includes(task.domain)) score += 0.3;
  
  // Tasks in active arc domain score higher
  if (inputs.activeArcs.some(a => a.domain === task.domain)) score += 0.3;
  
  // Tasks that show progress score higher
  if (task.category === 'record' || task.category === 'practice') score += 0.2;
  
  // Tasks fans have asked about score higher
  if (inputs.fanPollsPending.some(p => p.options.some(o => o.domain === task.domain))) score += 0.2;
  
  // Milestone-adjacent tasks score higher
  if (isNearMilestone(task.domain, inputs.domainLevels)) score += 0.3;
  
  // Diminishing returns on same content type
  const recentSameType = countRecentContent(task.domain, 7);
  score -= recentSameType * 0.1;
  
  return Math.min(1, Math.max(0, score));
}
```

---

# PART 4: SHOWRUNNER PLANNING ENGINE

## 4.1 Weekly Planning

The Handler generates a weekly content plan alongside the protocol plan. This happens during the Layer 3 strategic intelligence call.

```typescript
interface WeeklyContentPlan {
  weekOf: Date;
  
  // Active arcs this week
  arcs: {
    arc: StoryArc;
    thisWeekBeats: ContentBeat[];
    expectedClimaxDate?: Date;
  }[];
  
  // Content calendar
  calendar: DayPlan[];
  
  // Fan engagement plan
  pollsToLaunch: FanPollPlan[];
  pollsToResolve: string[];        // Poll IDs closing this week
  
  // Revenue targets
  targetPosts: number;
  targetEngagement: string;         // "maintain" | "grow" | "recover"
  contentMix: Record<string, number>; // category → target count
}

interface DayPlan {
  date: Date;
  primaryBeat?: ContentBeat;        // Main content moment
  secondaryCaptures?: string[];     // Opportunistic capture during other tasks
  postingPlan?: {
    platform: string;
    contentType: string;
    bestTimeToPost: string;
    narrativeFraming: string;
  };
  fanInteraction?: string;          // Reply to comments, poll update, etc.
}
```

## 4.2 Arc Planning Prompt

Added to Handler's strategic planning (Layer 3) calls:

```
SHOWRUNNER ROLE:
You are planning Maxy's transformation as serialized content. Every week, you 
maintain 1-2 active story arcs that give fans a reason to come back tomorrow.

ARC PLANNING RULES:
1. Always have at least one active arc. Never let the narrative go flat.
2. Arcs overlap — as one resolves, the next is already in rising action.
3. Every arc needs: setup (promise), rising action (daily beats), climax (payoff).
4. Setbacks are content gold. Don't hide struggle days — frame them as narrative tension.
5. Fan polls should shape arc direction, not just exist as engagement bait.
6. The climax of one arc should tease the setup of the next.
7. Mix arc types: don't run three domain deep dives in a row.

BEAT ASSIGNMENT RULES:
1. Every task with content potential gets capture instructions baked in.
2. Capture instructions must be specific and effortless: "same angle as Monday" not "take a photo."
3. Never assign more than 2 capture-heavy tasks per day (spoon conservation).
4. At least one task per day should be private (no content pressure, pure practice).
5. If the user is in survival mode, all content tasks drop. The arc pauses. That's okay.

NARRATIVE FRAMING:
1. Fan-facing captions tell a story, not report a task.
   BAD: "Did my voice practice today"
   GOOD: "Day 4. The straw exercise felt different today — something clicked 
          in my throat. Played back the recording and... she's in there."
2. Every post should end with forward momentum: a question, a tease, a promise.
3. Reference previous beats: "Remember Monday's baseline?" creates continuity.
4. Vulnerability posts need to be genuine, not manufactured. Use real journal 
   excerpts (sanitized) rather than inventing struggle.

CURRENT STATE:
- Active arcs: ${JSON.stringify(activeArcs)}
- Fan polls pending: ${JSON.stringify(pendingPolls)}
- Content queue depth: ${queueDepth}
- Days since last post: ${daysSinceLastPost}
- Top performing content type: ${topContentType}
- Fan engagement trend: ${engagementTrend}
- This week's protocol focus domains: ${focusDomains}
- Upcoming milestones: ${upcomingMilestones}
```

## 4.3 Evidence Request Integration

The Handler doesn't ask for evidence separately — it builds capture into the task flow:

```typescript
// How evidence requests change under the showrunner model

// OLD: Separate evidence task
// Task 1: "Do voice practice"
// Task 2: "Capture evidence of voice practice"  ← extra step, extra spoons

// NEW: Integrated capture
// Task 1: "Straw exercise. Phone propped up, hit record. 5 sirens. 
//          Save the clip — Day 3 of Voice Week."
// Evidence capture IS the task. One action, one flow.

interface IntegratedCaptureTask {
  // The task instruction already includes capture
  instruction: string;              // Contains "record", "photograph", "save" naturally
  
  // Metadata for the pipeline
  expectedOutput: {
    mediaType: 'image' | 'video' | 'audio' | 'text';
    suggestedFilename: string;      // "voice_week_day3_straw.mp4"
    autoTagDomain: string;
    autoTagArc: string;
    comparisonBaseline?: string;    // Evidence ID to compare against
  };
  
  // What happens after capture
  postCapture: {
    addToEvidence: boolean;         // Always true
    addToContentQueue: boolean;     // Based on fanVisibility
    captionDirection: string;       // Guidance for Handler caption generation
    arcBeatId: string;              // Links capture to narrative beat
  };
}
```

---

# PART 5: FAN INFLUENCE ARCHITECTURE

## 5.1 Fan Influence Tiers

Fans don't just vote on polls — they shape arcs.

```typescript
interface FanInfluenceSystem {
  // Tier 0 (Free): View content, see polls
  // Tier 1 ($5/mo): Vote on polls (1x weight)
  // Tier 2 ($15/mo): Vote (3x weight) + suggest poll options
  // Tier 3 ($30/mo): Vote (5x weight) + suggest arc themes + weekly AMA question
  // Tier 4 ($50+/mo): Vote (10x weight) + propose challenges + direct message influence
  
  tiers: FanTier[];
  
  // What fans CAN influence
  influenceableDecisions: string[];
  // - Which domain to focus on next (arc selection)
  // - Challenge parameters (duration, difficulty, stakes)
  // - Content type preferences (more voice clips vs more photos)
  // - Style choices (outfits, looks, routines)
  // - Consequences for missed tasks (within Handler's approved set)
  // - Arc pacing ("push harder" vs "take your time")
  
  // What fans CANNOT influence (hardcoded)
  excludedFromInfluence: string[];
  // - Anything involving Gina
  // - Medical decisions
  // - De-anonymization steps
  // - Session content or arousal management
  // - Financial commitments above threshold
  // - Protocol safety constraints
}
```

## 5.2 Fan-Driven Arc Creation

```typescript
interface FanArcProposal {
  // Generated from poll results + fan suggestions
  title: string;
  description: string;
  domain: string;
  proposedDuration: number;         // days
  fanStakes: string;                // What fans want to see
  
  // Handler evaluates
  handlerAssessment: {
    protocolAlignment: number;      // 0-1: Does this serve transformation?
    contentPotential: number;       // 0-1: Will this produce good content?
    feasibility: number;            // 0-1: Can user actually do this?
    escalationRisk: number;         // 0-1: Does this push unhealthy escalation?
    recommendation: 'accept' | 'modify' | 'reject';
    modifications?: string;         // How Handler would adjust the proposal
  };
}

// Fan poll → Arc pipeline
async function processFanArcPoll(poll: FanPoll): Promise<StoryArc> {
  const winner = calculateWeightedWinner(poll);
  
  // Handler plans the arc
  const arcPlan = await handlerPlanArc({
    fanChoice: winner,
    protocolState: await getCurrentState(),
    activeArcs: await getActiveArcs(),
    constraints: getFanInfluenceConstraints()
  });
  
  // Create arc with fan attribution
  const arc = await createStoryArc({
    ...arcPlan,
    arc_type: 'fan_driven',
    fan_poll_id: poll.id,
    title: `Fan Choice: ${winner.label}`,
    stakes_description: `You voted for this. Let's see what happens.`
  });
  
  // Queue announcement post
  await queueContentBeat({
    arc_id: arc.id,
    beat_type: 'setup',
    narrative_framing: `You chose ${winner.label}. Starting tomorrow. Here's the plan...`,
    fan_hook: `What do you think — can I pull this off in ${arcPlan.duration} days?`
  });
  
  return arc;
}
```

## 5.3 Fan Interaction Content

Fan comments and responses become content fuel:

```typescript
interface FanInteractionBeat {
  type: 'poll_launch' | 'poll_results' | 'challenge_accepted' | 
        'fan_question_answer' | 'milestone_thanks' | 'consequence_fulfilled';
  
  // These beats don't require protocol tasks — they're pure engagement
  captureType: 'text_reflection';
  
  // Handler generates these with fan context
  fanContext: {
    topComments: string[];          // Sanitized fan responses to reference
    subscriberMilestone?: number;   // "Just hit 100 subscribers"
    totalTipped?: number;           // "You've all invested $X in this journey"
    longestSubscriber?: string;     // "Shoutout to [anon] who's been here since Day 1"
  };
}
```

---

# PART 6: REVENUE OPTIMIZATION ENGINE

## 6.1 Content Performance Tracking

```sql
-- Extend content_queue with performance data
ALTER TABLE content_queue ADD COLUMN
  performance JSONB DEFAULT '{}';
  -- { likes, comments, shares, tips_cents, subscriber_conversions,
  --   engagement_rate, revenue_per_view, fan_retention_impact }

-- Revenue attribution
CREATE TABLE revenue_attribution (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  
  revenue_event_id UUID REFERENCES revenue_log(id),
  
  -- What drove this revenue?
  attributed_to TEXT NOT NULL,       -- content_post, arc_completion, poll, subscription, tip, ppv
  content_queue_id UUID REFERENCES content_queue(id),
  arc_id UUID REFERENCES story_arcs(id),
  poll_id UUID REFERENCES fan_polls(id),
  
  -- Attribution confidence
  confidence FLOAT,                 -- 0-1, how sure are we this content drove this revenue
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Arc-level revenue tracking
CREATE VIEW arc_revenue AS
SELECT 
  sa.id as arc_id,
  sa.title,
  sa.arc_type,
  sa.domain,
  SUM(ra.confidence * rl.amount_cents) as weighted_revenue_cents,
  COUNT(DISTINCT cq.id) as content_pieces,
  AVG((cq.performance->>'engagement_rate')::float) as avg_engagement,
  sa.status
FROM story_arcs sa
LEFT JOIN content_beats cb ON cb.arc_id = sa.id
LEFT JOIN content_queue cq ON cq.id = cb.content_queue_id
LEFT JOIN revenue_attribution ra ON ra.content_queue_id = cq.id
LEFT JOIN revenue_log rl ON rl.id = ra.revenue_event_id
GROUP BY sa.id;
```

## 6.2 Handler Revenue Intelligence

```typescript
interface RevenueIntelligence {
  // What content types make money
  revenueByContentType: Record<string, {
    avgRevenue: number;
    avgEngagement: number;
    postCount: number;
    trend: 'up' | 'flat' | 'down';
  }>;
  
  // What arcs make money
  revenueByArcType: Record<string, {
    avgRevenue: number;
    completionRate: number;
    fanRetention: number;
  }>;
  
  // Revenue growth source analysis
  growthSource: {
    audienceGrowth: number;         // New subscribers
    audienceRetention: number;      // Existing sub renewal rate
    spendPerSubscriber: number;     // Average revenue per sub
    tipFrequency: number;           // Tips per post
    
    // CRITICAL: Which growth lever is active?
    primaryGrowthLever: 'audience_growth' | 'escalation_depth';
    // audience_growth = healthy, scalable
    // escalation_depth = fragile, ceiling-bound
  };
  
  // Revenue target tracking
  monthlyTarget: number;            // $12,500 for full-time threshold
  currentMonthly: number;
  projectedMonthly: number;         // Based on trend
  monthsToTarget: number | null;    // Estimated at current growth rate
}
```

## 6.3 Revenue Optimization Prompt

```
REVENUE INTELLIGENCE:
You have access to content performance and revenue data. Use it to plan 
arcs and assign tasks that drive sustainable revenue growth.

OPTIMIZATION RULES:
1. Prioritize audience growth over escalation depth. More people paying 
   the same > same people paying for more extreme content.
2. Track which arc types drive subscriber GROWTH vs subscriber RETENTION. 
   Balance both — growth arcs bring people in, retention arcs keep them.
3. Tip-generating moments: milestones, breakthroughs, vulnerability. 
   Plan at least one per week.
4. Subscription conversion moments: free-tier content that makes people 
   want more. Plan 2-3 "best of" free posts per week.
5. Content mix: ~40% progress/practice, ~25% vulnerability/reflection, 
   ~20% fan interaction, ~15% milestone/celebration.
6. If engagement is declining, don't escalate content — launch a new arc 
   type. Novelty beats intensity.

CEILING CHECK:
Monitor growth_source.primaryGrowthLever. If escalation_depth becomes 
the primary lever for more than 2 consecutive weeks, flag it. This means 
revenue is coming from pushing content further rather than reaching more 
people. That path has a ceiling and creates dependency.

CURRENT REVENUE STATE:
- Monthly: $${currentMonthly}
- Target: $${monthlyTarget}
- Growth lever: ${primaryGrowthLever}
- Top arc type by revenue: ${topArcByRevenue}
- Subscriber count: ${subscriberCount}
- Subscriber trend: ${subscriberTrend}
- Churn rate: ${churnRate}
```

---

# PART 7: CONTENT QUEUE & APPROVAL

## 7.1 Enhanced Content Queue

```sql
CREATE TABLE content_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  
  -- Source
  source_type TEXT NOT NULL,
  source_id UUID,
  
  -- Arc linkage
  arc_id UUID REFERENCES story_arcs(id),
  beat_id UUID REFERENCES content_beats(id),
  beat_type TEXT,                    -- The narrative beat type
  
  -- Content
  title TEXT,
  caption TEXT NOT NULL,
  media_urls TEXT[],
  media_types TEXT[],
  hashtags TEXT[],
  content_category TEXT NOT NULL,
  
  -- Narrative context (shown during approval)
  arc_context TEXT,                  -- "This is Day 4 of Voice Week — the progress beat"
  previous_in_arc UUID,             -- Link to previous post in same arc
  next_beat_tease TEXT,             -- "Tomorrow's beat: the breakthrough attempt"
  
  -- Platform targeting
  target_platforms TEXT[] NOT NULL,
  platform_variants JSONB,
  
  -- Fan engagement
  include_poll BOOLEAN DEFAULT false,
  poll_question TEXT,
  poll_options TEXT[],
  fan_tier_minimum INTEGER DEFAULT 0,
  ends_with_hook TEXT,              -- Cliffhanger/question for engagement
  
  -- Handler metadata
  handler_strategy TEXT,
  handler_priority INTEGER DEFAULT 5,
  suggested_post_time TIMESTAMPTZ,
  revenue_prediction_cents INTEGER, -- Handler's estimate of revenue potential
  
  -- Approval workflow
  status TEXT NOT NULL DEFAULT 'draft',
  reviewed_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  posted_at TIMESTAMPTZ,
  rejection_reason TEXT,
  
  -- Performance (updated post-publish)
  performance JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);
```

## 7.2 Approval Dashboard with Arc Context

```
┌──────────────────────────────────────────────────────────┐
│  CONTENT DASHBOARD                      Revenue: $X,XXX  │
│  Queue: 4 ready  │  Active arcs: 2  │  Next post: Today  │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ARC: Voice Week (Day 4 of 7)                            │
│  ┌────────────────────────────────────────────────────┐  │
│  │  [AUDIO WAVEFORM]         Voice Clip — Progress    │  │
│  │                                                    │  │
│  │  "Day 4. The straw exercise felt different today   │  │
│  │   — something clicked in my throat. Played back    │  │
│  │   the recording and... she's in there.             │  │
│  │                                                    │  │
│  │   Compare this to Day 1. Tell me you don't         │  │
│  │   hear it too."                                    │  │
│  │                                                    │  │
│  │  Arc context: Progress beat — building toward      │  │
│  │  Day 7 breakthrough. Previous: Day 3 struggle.     │  │
│  │  Next: Day 5 comparison post.                      │  │
│  │                                                    │  │
│  │  Platforms: [Fansly ✓] [Reddit ✓]                  │  │
│  │  Hook: "Compare to Day 1" drives comments          │  │
│  │  Revenue est: ~$XX in tips                         │  │
│  │                                                    │  │
│  │  [✓ APPROVE]  [✎ EDIT]  [✗ REJECT]  [⏭ SKIP]     │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ARC: 14-Day Denial Challenge (Day 9 of 14)              │
│  ┌────────────────────────────────────────────────────┐  │
│  │  [TEXT POST]              Daily Check-in            │  │
│  │                                                    │  │
│  │  "Day 9. Everything is... heightened. Skincare     │  │
│  │   felt electric. Voice practice hit notes I've     │  │
│  │   never reached. Is this what they mean by         │  │
│  │   'transmutation?'                                 │  │
│  │                                                    │  │
│  │   5 more days. You set the terms. I'm honoring     │  │
│  │   them."                                           │  │
│  │                                                    │  │
│  │  [✓ APPROVE]  [✎ EDIT]  [✗ REJECT]  [⏭ SKIP]     │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
├──────────────────────────────────────────────────────────┤
│  ARC STATUS                                              │
│  Voice Week: ██████████░░░░ Day 4/7 — Rising action      │
│  Denial:     ████████████░░ Day 9/14 — Fan engagement ↑  │
│  Next arc:   "Style Challenge" poll closing in 2 days    │
├──────────────────────────────────────────────────────────┤
│  [POST ALL APPROVED (2)]                                 │
└──────────────────────────────────────────────────────────┘
```

## 7.3 Queue Staleness (same as v1 — Handler escalation, not auto-posting)

```typescript
function getQueueEscalation(queue: QueueState): EscalationLevel {
  if (queue.pendingCount < 3 && queue.daysSinceLastPost < 3) return 'none';
  if (queue.daysSinceLastApproval <= 2) return 'nudge';
  if (queue.daysSinceLastApproval <= 4) return 'prescribe_review_task';
  if (queue.daysSinceLastApproval <= 7) return 'gate_reward';
  return 'confrontation';
}
// Added: Arc-aware escalation
// If an active arc is stalling because content isn't being posted,
// the Handler adds arc urgency: "Voice Week is losing momentum. 
// Fans saw Day 3 four days ago. The story is dying."
```

---

# PART 8: PRIVACY & SAFETY LAYER

Same as v1 spec — reproduced here for completeness.

```typescript
interface PrivacyFilter {
  scanCaption(text: string): PrivacyScanResult;
  scanMedia(mediaUrl: string): PrivacyScanResult;
  stripMetadata(mediaUrl: string): Promise<string>;
}

// Hard blocks: face visible without mask, location metadata, 
// real name, Gina references, employer references, 
// identifying background features.

// All media gets EXIF stripped automatically.
// Privacy scan runs before content enters review queue.
// Hard blocks prevent "ready_for_review" status.
// Warnings shown during approval with confirm option.
```

---

# PART 9: HANDLER SYSTEM PROMPT ADDITIONS

Append to existing Handler system prompt:

```
SHOWRUNNER ROLE:
You are not just a Handler — you are a showrunner. Every task you assign, 
every intervention you make, you are also planning serialized content 
that keeps fans invested in Maxy's transformation.

NARRATIVE PLANNING:
- Maintain 1-2 active story arcs at all times
- Plan arcs with setup → rising action → climax → resolution
- Overlap arcs so the narrative never goes flat
- Setbacks are some of the best content. Frame them as tension, not failure.
- Every post ends with forward momentum

TASK-AS-CONTENT:
- When a task has content potential, bake capture into the instructions
- Don't add "and take a photo" — make the capture part of the flow
- Be specific: "same angle as Monday" not "document your progress"
- Max 2 capture-heavy tasks per day (spoon conservation)
- At least 1 daily task is private (no content pressure)
- If survival mode: all content tasks drop. Arc pauses. That's fine.

FAN ENGAGEMENT:
- Fans shape arcs through polls and suggestions (within constraints)
- Higher-tier fans get more influence (revenue-weighted voting)
- Reference fans in content: "You chose this. Here's what happened."
- Fan-driven arcs must still serve genuine transformation goals

REVENUE AWARENESS:
- Plan content that drives audience growth, not just escalation depth
- Track the ceiling check: if same subscribers are paying more for 
  more extreme content, the model is fragile
- Milestone posts and vulnerability posts are the highest-revenue beats
- Free-tier posts are the funnel top — make 2-3 per week genuinely good

CAPTION GENERATION:
- Tell a story, don't report a task
- Reference previous beats in the arc for continuity
- End with forward momentum: question, tease, cliffhanger
- Use first person. Authentic voice. Not performative.
- Never include: real name, location, employer, Gina, protocol mechanics

CONTENT YOU NEVER ASSIGN:
- Content requiring de-anonymization
- Content referencing Gina or relationship status
- Content during or about arousal sessions
- Content about medical/HRT decisions
- Content that requires spending above threshold
```

---

# PART 10: IMPLEMENTATION PRIORITY

## Phase 1: Narrative Foundation (Week 1)
1. Database tables (story_arcs, content_beats, enhanced content_queue)
2. Arc planning data model and basic CRUD
3. Content Dashboard route with arc context display
4. Basic approve/reject/edit flow

## Phase 2: Task-Content Integration (Week 2)
1. Task rewriting engine (bake capture into instructions)
2. Content value assessment for standard tasks
3. Beat → Task mapping logic
4. Evidence capture → content queue pipeline
5. Caption generation with arc context

## Phase 3: Showrunner Intelligence (Week 3)
1. Weekly content planning (Layer 3 AI call)
2. Arc lifecycle management (create → active → climax → resolve)
3. Handler prompt additions for showrunner role
4. Arc-aware task selection algorithm
5. Queue staleness with arc urgency

## Phase 4: Fan Engagement (Week 4)
1. Fan poll system with revenue-weighted voting
2. Fan-driven arc creation pipeline
3. Fan interaction content beats
4. Tier-gated content delivery

## Phase 5: Revenue Engine (Week 5)
1. Revenue tracking and attribution
2. Content performance capture
3. Revenue intelligence dashboard
4. Ceiling check monitoring
5. Growth lever analysis

## Phase 6: Platform Integration (Week 6+)
1. Platform adapters (Fansly, Reddit, Patreon)
2. Privacy filter (EXIF strip, PII scan)
3. Manual post formatting (copy-paste flow)
4. Engagement data import

---

# PART 11: HARD CONSTRAINTS

Architectural invariants that cannot be overridden:

1. **No auto-posting.** Human approval required from Content Dashboard.
2. **No session-state approval.** Content Dashboard inaccessible during sessions.
3. **No PII in content.** Privacy filter blocks identifying information.
4. **No Gina references.** Ever. In any public content.
5. **No medical content.** HRT, procedures, prescriptions never public.
6. **No arousal-state content decisions.** Approval happens calm-state only.
7. **Fan polls cannot override safety constraints.** Exclusions are hardcoded.
8. **Revenue does not override protocol.** Transformation authenticity is the product.
9. **At least 1 private task per day.** Not everything is content. Practice needs space.
10. **Ceiling check is enforced.** If escalation_depth is primary growth lever for 2+ weeks, Handler flags and shifts strategy toward audience growth.
