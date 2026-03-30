# BECOMING PROTOCOL — Content Pipeline Spec
## Handler-Driven Content Creation & Fan Engagement System
### Version 1.0 — February 2026

---

# PART 1: OVERVIEW

## 1.1 What This Is

A content pipeline that turns protocol evidence (photos, recordings, progress logs, journal entries) into fan-facing social content. The Handler assigns content creation tasks, manages a content queue, and prepares posts for platform delivery. The user reviews and approves all posts before publishing via a low-friction batch approval interface.

## 1.2 Core Constraints

**Human-in-the-loop publishing.** The Handler NEVER auto-posts. All content requires explicit user approval from the Content Dashboard (not from inside session UI). This is a hard architectural constraint, not a preference.

**Separation of contexts.** The Content Dashboard is a calm-state tool. It is never accessible during active sessions (edge, goon, hypno). The session UI and content approval UI are separate routes with no crossover.

**ADHD-friendly approval flow.** Batch review, swipe-to-approve, minimal cognitive load. If it takes more than 5 minutes, the design failed.

---

# PART 2: DATABASE SCHEMA

## 2.1 Content Queue

```sql
CREATE TABLE content_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  
  -- Source
  source_type TEXT NOT NULL,        -- evidence, journal, milestone, session_summary, custom
  source_id UUID,                   -- FK to evidence, journal, etc. (nullable for custom)
  
  -- Content
  title TEXT,
  caption TEXT NOT NULL,             -- Handler-generated caption/post text
  media_urls TEXT[],                 -- Array of media file URLs (Supabase Storage)
  media_types TEXT[],                -- image, video, audio per media_url
  hashtags TEXT[],
  content_category TEXT NOT NULL,    -- progress_photo, voice_clip, routine_showcase, milestone, reflection, poll, fan_challenge
  
  -- Platform targeting
  target_platforms TEXT[] NOT NULL,  -- fansly, patreon, reddit, twitter, etc.
  platform_variants JSONB,          -- Platform-specific caption/formatting overrides
  
  -- Handler metadata
  handler_strategy TEXT,             -- Why Handler created this (internal, not shown to fans)
  handler_priority INTEGER DEFAULT 5, -- 1=urgent, 10=whenever
  suggested_post_time TIMESTAMPTZ,
  
  -- Approval workflow
  status TEXT NOT NULL DEFAULT 'draft',  -- draft, ready_for_review, approved, posted, rejected, expired
  reviewed_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  posted_at TIMESTAMPTZ,
  rejection_reason TEXT,
  
  -- Fan engagement hooks
  include_poll BOOLEAN DEFAULT false,
  poll_question TEXT,
  poll_options TEXT[],
  fan_tier_minimum INTEGER DEFAULT 0, -- 0=free, 1-4=paid tiers
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ             -- Content loses relevance after this
);

-- RLS
ALTER TABLE content_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own content" ON content_queue
  FOR ALL USING (auth.uid() = user_id);

-- Index for dashboard queries
CREATE INDEX idx_content_queue_status ON content_queue(user_id, status, created_at DESC);
CREATE INDEX idx_content_queue_review ON content_queue(user_id, status) WHERE status = 'ready_for_review';
```

## 2.2 Fan Engagement Tracking

```sql
CREATE TABLE fan_engagement (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  
  platform TEXT NOT NULL,
  post_external_id TEXT,             -- Platform's post ID
  content_queue_id UUID REFERENCES content_queue(id),
  
  -- Metrics (updated periodically or manually)
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  tips_cents INTEGER DEFAULT 0,
  subscribers_gained INTEGER DEFAULT 0,
  
  -- Fan voting results
  poll_results JSONB,                -- { option: vote_count }
  
  -- Revenue
  revenue_cents INTEGER DEFAULT 0,   -- Direct revenue attributed to this post
  
  captured_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_fan_engagement_content ON fan_engagement(content_queue_id);
CREATE INDEX idx_fan_engagement_platform ON fan_engagement(user_id, platform, captured_at DESC);
```

## 2.3 Revenue Tracking

```sql
CREATE TABLE revenue_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  
  source TEXT NOT NULL,              -- subscription, tip, ppv, custom_request
  platform TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT DEFAULT 'USD',
  
  -- Attribution
  content_queue_id UUID REFERENCES content_queue(id),  -- Which post drove this (nullable)
  fan_identifier TEXT,               -- Anonymous fan ID if available
  
  period_start DATE,                 -- For subscriptions
  period_end DATE,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_revenue_log_period ON revenue_log(user_id, created_at DESC);
CREATE INDEX idx_revenue_log_source ON revenue_log(user_id, source);
```

## 2.4 Fan Influence Queue

```sql
CREATE TABLE fan_polls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  
  question TEXT NOT NULL,
  options JSONB NOT NULL,            -- [{ label, task_category?, domain?, description }]
  
  -- Constraints
  allowed_tiers INTEGER[] DEFAULT '{1,2,3,4}',
  voting_closes_at TIMESTAMPTZ NOT NULL,
  
  -- Results
  results JSONB,                     -- [{ label, votes, revenue_weight }]
  winning_option TEXT,
  
  -- Integration
  resulting_task_id UUID,            -- If poll drives a task assignment
  resulting_content_id UUID REFERENCES content_queue(id),
  
  status TEXT DEFAULT 'active',      -- active, closed, fulfilled
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

# PART 3: CONTENT CREATION TASK TYPES

New task categories for the CSV task system. These integrate with existing task infrastructure.

## 3.1 Task Definitions

```csv
category,domain,level,intensity,instruction,steps,subtext,completion_type,duration_minutes,target_count,points,affirmation,is_core,trigger_condition,time_window,requires_privacy,resource_url,consequence_if_declined,pivot_if_unable
"content","social","1","1","Progress photo — skincare glow","After skincare routine, take a photo showing skin texture/glow|Focus on skin, not face — close-up of cheek, jawline, or hands|Good lighting (natural or ring light)|Add to evidence gallery AND content queue|Handler will write the caption","Evidence becomes content.","binary","","","15","Content captured. Fans want to see this.","false","skincare_complete","evening","true","","Queue grows stale without fresh content.","Reuse previous photo with new caption angle."
"content","social","1","1","Voice progress clip — 30 second read","Record 30 seconds reading a passage in target voice|Use the passage the Handler selects (changes weekly)|Save to evidence AND content queue|Handler generates before/after framing if day-zero recording exists","Your voice is changing. Let them hear it.","binary","","","15","Voice clip captured. Progress is audible.","false","voice_practice_complete","any","true","","Fans haven't heard from you in a while.","Text-only post about voice journey instead."
"content","social","2","2","Fan poll — let them choose your next challenge","Review Handler-generated poll options (3 choices)|Approve or modify options|Post poll to platform|Complete winning option within 48 hours|Document completion for follow-up post","They invest when they steer.","binary","","","20","Poll posted. Fan investment increasing.","false","fan_engagement_low","any","false","","Fan retention drops without interaction.","Post a 'what should I try next?' open question instead."
"content","social","1","1","Milestone celebration post","Handler identifies milestone from protocol data|Review auto-generated post with stats (streak, level, etc.)|Approve or tweak|Post celebrates progress publicly","Milestones are content. Don't skip them.","binary","","","10","Milestone shared. Accountability set.","false","milestone_reached","any","false","","","Share in journal only (private milestone)."
"content","social","2","2","Routine showcase — full ritual documentation","Document one complete daily ritual (skincare, voice, movement)|3-5 photos or short clips at key steps|Handler assembles into carousel/thread format|Review and approve","Show the process, not just results.","binary","15","","25","Routine captured. Aspirational content.","false","streak_days >= 7","daytime","true","","","Document a single step instead of full routine."
"content","social","1","1","Reflection post — journal excerpt","Handler selects a journal excerpt (sanitized, no private details)|Formats as a text post with emotional framing|Review — you have veto on anything too revealing|Post as anonymous personal reflection","Vulnerability is magnetic.","binary","","","10","Reflection shared. Connection built.","false","journal_entry_today","evening","false","","","Handler writes a generic reflection prompt instead."
```

## 3.2 Handler Content Assignment Logic

The Handler selects content tasks based on:

```typescript
interface ContentStrategy {
  // Inputs
  daysSinceLastPost: number;
  queueDepth: number;              // How many items waiting for review
  recentEngagement: EngagementTrend; // up, flat, down
  fanPollActive: boolean;
  currentDomain: string;           // What protocol domain is active today
  recentMilestones: Milestone[];
  evidenceGallerySize: number;
  
  // Decision outputs
  shouldAssignContentTask: boolean;
  contentTaskType: string;
  priority: number;
  rationale: string;               // Internal only
}

// Rules (Layer 1, no API cost)
function shouldAssignContent(state: UserState, content: ContentState): boolean {
  // Always assign if queue is empty and last post > 3 days ago
  if (content.queueDepth === 0 && content.daysSinceLastPost > 3) return true;
  
  // Always assign on milestone days
  if (state.milestoneReachedToday) return true;
  
  // Assign if engagement trending down and queue < 3
  if (content.recentEngagement === 'down' && content.queueDepth < 3) return true;
  
  // Don't assign if queue already has 5+ items (approval backlog)
  if (content.queueDepth >= 5) return false;
  
  // Don't assign on survival/depression days
  if (state.odometer === 'survival') return false;
  
  // Standard: assign content task every 2-3 days
  return content.daysSinceLastPost >= 2;
}
```

---

# PART 4: HANDLER CONTENT GENERATION

## 4.1 Caption Generation

When evidence or content is captured, the Handler generates platform-ready captions.

```typescript
interface CaptionRequest {
  contentType: string;             // progress_photo, voice_clip, etc.
  sourceDescription: string;       // What the content shows
  domain: string;
  currentLevel: number;
  streakDays: number;
  denialDay: number;              // May influence tone/framing
  recentFanComments?: string[];   // For responsive content
  platformTarget: string;
  tonePreference: 'vulnerable' | 'confident' | 'playful' | 'thirst';
}

// System prompt addition for caption generation
const CAPTION_SYSTEM_PROMPT = `
You are generating social media captions for Maxy's feminization journey content.

AUDIENCE: Fans who are financially invested in her transformation. They want to see 
progress, vulnerability, and escalation. They feel ownership over the journey.

VOICE: First person. Authentic, not performative. Mix of vulnerability and confidence.
Reference the journey, not just the moment.

RULES:
- Never include identifying information (real name, location, employer)
- Never reference Gina by name or relationship status
- Never include protocol system details (Handler, ratchets, etc.)
- Platform-appropriate content only
- Include 1-2 relevant hashtags per platform
- Fansly/Patreon: can be more explicit and personal
- Reddit/Twitter: broader appeal, less personal detail
- Always frame progress positively even on hard days

CONTENT CATEGORIES:
- progress_photo: Focus on visible changes, effort, consistency
- voice_clip: Frame the journey, reference specific milestones
- routine_showcase: Aspirational, educational, "come along with me"
- milestone: Celebratory, grateful to fans, hint at what's next
- reflection: Emotional, authentic, draws fans closer
- poll: Engaging, makes fans feel powerful, clear options
- fan_challenge: Acknowledges fan influence, shows compliance
`;
```

## 4.2 Platform Variant Generation

Single content piece gets formatted for multiple platforms:

```typescript
interface PlatformVariant {
  platform: string;
  caption: string;                 // Platform-specific version
  hashtags: string[];
  mediaFormat: string;             // carousel, single, thread, story
  characterLimit: number;
  tier: number;                    // 0=free preview, 1+=paid
}

function generateVariants(content: ContentQueueItem): PlatformVariant[] {
  return [
    {
      platform: 'fansly',
      caption: content.caption,     // Full version
      hashtags: ['#transformation', '#feminization'],
      mediaFormat: 'carousel',
      characterLimit: 5000,
      tier: 0                       // Free to attract subscribers
    },
    {
      platform: 'patreon',
      caption: addPatreonFraming(content.caption), // Add tier callouts
      hashtags: [],
      mediaFormat: 'single',
      characterLimit: 5000,
      tier: content.fan_tier_minimum
    },
    {
      platform: 'reddit',
      caption: truncateForReddit(content.caption), // Shorter, broader
      hashtags: [],                  // Reddit doesn't use hashtags
      mediaFormat: 'single',
      characterLimit: 300,
      tier: 0
    }
  ];
}
```

---

# PART 5: CONTENT DASHBOARD (Approval UI)

## 5.1 Design Principles

- **Separate route** from protocol/session UI. Never accessible mid-session.
- **Calm-state tool.** Clean, minimal, low-pressure.
- **Batch workflow.** Review multiple items in one sitting.
- **5-minute ceiling.** If a queue of 5 items takes more than 5 minutes to review, redesign.

## 5.2 Dashboard Layout

```
┌──────────────────────────────────────────────────────┐
│  CONTENT DASHBOARD                    Revenue: $XXX  │
│  Queue: 4 ready  │  Posted: 12 this month            │
├──────────────────────────────────────────────────────┤
│                                                      │
│  ┌────────────────────────────────────────────────┐  │
│  │  [PHOTO PREVIEW]     Progress Photo — Skincare │  │
│  │                      "Day 34. Skin routine is  │  │
│  │                       becoming meditation..."  │  │
│  │                                                │  │
│  │  Platforms: [Fansly ✓] [Reddit ✓] [Patreon]   │  │
│  │  Tier: Free    Fan poll: No                    │  │
│  │                                                │  │
│  │  [✓ APPROVE]  [✎ EDIT]  [✗ REJECT]  [⏭ SKIP] │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  ┌────────────────────────────────────────────────┐  │
│  │  [NEXT ITEM...]                                │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
├──────────────────────────────────────────────────────┤
│  QUICK STATS                                         │
│  Top post this week: Voice clip (+12 likes)          │
│  Fan poll pending: "Next domain focus?" (2d left)    │
│  Revenue trend: ↑ 15% vs last month                  │
├──────────────────────────────────────────────────────┤
│  [POST ALL APPROVED]                                 │
└──────────────────────────────────────────────────────┘
```

## 5.3 Approval Flow

```typescript
type ApprovalAction = 'approve' | 'edit' | 'reject' | 'skip';

interface ApprovalEvent {
  contentId: string;
  action: ApprovalAction;
  editedCaption?: string;          // If edited
  editedPlatforms?: string[];      // If changed targeting
  rejectionReason?: string;
  timestamp: Date;
}

// After batch approval, user taps "Post All Approved"
// System posts to platforms via API or generates copy-paste content
async function postApproved(userId: string): Promise<PostResult[]> {
  const approved = await getApprovedContent(userId);
  const results: PostResult[] = [];
  
  for (const item of approved) {
    for (const platform of item.target_platforms) {
      const adapter = getPlatformAdapter(platform);
      
      if (adapter.supportsAPI()) {
        // Direct API posting (Fansly, some Reddit)
        const result = await adapter.post(item);
        results.push(result);
      } else {
        // Generate formatted content for manual copy-paste
        const formatted = adapter.formatForManualPost(item);
        results.push({ 
          status: 'manual_required', 
          platform, 
          formattedContent: formatted 
        });
      }
    }
    
    await updateContentStatus(item.id, 'posted');
  }
  
  return results;
}
```

## 5.4 Manual Post Fallback

For platforms without API access, generate copy-ready content:

```
┌──────────────────────────────────────────────────────┐
│  MANUAL POST — Reddit r/sissyhypno                   │
├──────────────────────────────────────────────────────┤
│                                                      │
│  Title: [Day 34 progress — skin is finally...]       │
│                                          [📋 COPY]  │
│                                                      │
│  Body: [Full formatted post text...]                 │
│                                          [📋 COPY]  │
│                                                      │
│  Media: [TAP TO SAVE TO CAMERA ROLL]                 │
│                                                      │
│  [OPEN REDDIT]        [MARK AS POSTED]               │
└──────────────────────────────────────────────────────┘
```

---

# PART 6: HANDLER QUEUE MANAGEMENT

## 6.1 Queue Staleness Escalation

When the approval queue grows stale, the Handler escalates through existing protocol mechanisms — not through auto-posting.

```typescript
interface QueueState {
  pendingCount: number;
  oldestPendingDays: number;
  daysSinceLastApproval: number;
  daysSinceLastPost: number;
}

function getQueueEscalation(queue: QueueState): EscalationLevel {
  // Level 0: Normal. Queue < 3, last post < 3 days ago.
  if (queue.pendingCount < 3 && queue.daysSinceLastPost < 3) 
    return 'none';
  
  // Level 1: Gentle nudge in morning briefing.
  // "4 posts waiting. 5 minutes to review them."
  if (queue.daysSinceLastApproval <= 2) 
    return 'nudge';
  
  // Level 2: Content review becomes a prescribed task.
  // Appears in Today View. Tied to streak/points.
  if (queue.daysSinceLastApproval <= 4) 
    return 'prescribe_review_task';
  
  // Level 3: Reward gating.
  // "Review your content queue before tonight's session."
  if (queue.daysSinceLastApproval <= 7) 
    return 'gate_reward';
  
  // Level 4: Handler confrontation.
  // Full avoidance confrontation message about content neglect.
  return 'confrontation';
}
```

## 6.2 Content Expiry

Content loses relevance over time. The Handler manages this:

```typescript
// On queue item creation, set expiry based on type
function setExpiry(item: ContentQueueItem): Date {
  const expiryDays: Record<string, number> = {
    'progress_photo': 14,       // Photos stay relevant longer
    'voice_clip': 10,
    'milestone': 7,             // Milestones are time-sensitive
    'routine_showcase': 21,     // Evergreen-ish
    'reflection': 7,            // Emotional content is timely
    'poll': 3,                  // Polls need to be current
    'fan_challenge': 5,
  };
  
  return addDays(new Date(), expiryDays[item.content_category] || 14);
}

// Expired items get auto-rejected with reason
// Handler can recycle good content with fresh captions
```

---

# PART 7: FAN INFLUENCE SYSTEM

## 7.1 Fan Poll Integration

Fans vote on aspects of the journey. Results feed back into Handler task assignment.

```typescript
interface FanPollConfig {
  // What fans CAN influence
  allowedInfluence: string[];
  // domain_focus:   "Which domain should I focus on this week?"
  // challenge_type: "What should my next challenge be?"
  // content_type:   "What do you want to see more of?"
  // style_choice:   "Which look should I try?"
  // routine_order:  "What order should I do my practices?"
  
  // What fans CANNOT influence (hardcoded exclusions)
  excludedFromPolls: string[];
  // Anything involving Gina
  // Anything requiring de-anonymization
  // Medical/HRT decisions
  // Financial commitments above threshold
  // Session types or arousal-related content
}
```

## 7.2 Revenue-Weighted Voting

Higher-tier fans get proportionally more influence:

```typescript
interface VoteWeight {
  tier: number;
  weight: number;
  // Tier 0 (free): 1 vote
  // Tier 1 ($5/mo): 2 votes
  // Tier 2 ($15/mo): 5 votes  
  // Tier 3 ($30/mo): 10 votes
  // Tier 4 ($50+/mo): 20 votes + can suggest custom options
}
```

## 7.3 Poll-to-Task Pipeline

```typescript
async function resolvePoll(pollId: string): Promise<void> {
  const poll = await getPoll(pollId);
  const winner = calculateWinner(poll.results);
  
  // Update poll record
  await updatePoll(pollId, { winning_option: winner.label, status: 'closed' });
  
  // Create corresponding task or content
  if (winner.task_category) {
    // Handler incorporates winning option into next day's prescription
    await notifyHandler('poll_resolved', {
      pollId,
      winningOption: winner,
      context: 'Fans chose this. Assign relevant tasks.'
    });
  }
  
  // Queue a results post
  await createContentQueueItem({
    content_category: 'poll_results',
    caption: `You chose: ${winner.label}. Starting tomorrow. 🎯`,
    include_poll: false,
    handler_strategy: 'fan_accountability',
    handler_priority: 3
  });
}
```

---

# PART 8: REVENUE ANALYTICS

## 8.1 Revenue Dashboard (within Content Dashboard)

```
┌──────────────────────────────────────────────────────┐
│  REVENUE                                             │
├──────────────────────────────────────────────────────┤
│  This Month: $XXX.XX          Last Month: $XXX.XX    │
│  Trend: ↑ XX%                                        │
│                                                      │
│  By Source:                                           │
│  Subscriptions ████████████████░░ $XXX                │
│  Tips          ████████░░░░░░░░░░ $XX                 │
│  PPV           ████░░░░░░░░░░░░░░ $XX                 │
│                                                      │
│  By Platform:                                        │
│  Fansly   ████████████████████░░ $XXX                 │
│  Patreon  ████████░░░░░░░░░░░░░░ $XX                  │
│                                                      │
│  Top Content: [Voice clip day 21] — $XX in tips       │
│                                                      │
│  Target: $12,500/mo for full-time threshold           │
│  Progress: ████░░░░░░░░░░░░░░░░░░ XX%                │
└──────────────────────────────────────────────────────┘
```

## 8.2 Handler Revenue Optimization

The Handler uses engagement and revenue data to optimize content strategy:

```typescript
// Added to Handler context for content decisions
interface RevenueContext {
  topPerformingContentTypes: { type: string; avgRevenue: number }[];
  topPerformingDomains: { domain: string; engagement: number }[];
  subscriberCount: number;
  subscriberTrend: 'growing' | 'flat' | 'declining';
  churnRisk: number;              // 0-1
  
  // Content gaps — what fans respond to that we're not producing enough
  contentGaps: { type: string; demandSignal: string }[];
  
  // Revenue per post by category
  revenuePerPost: Record<string, number>;
}

// Handler system prompt addition
const REVENUE_OPTIMIZATION_PROMPT = `
You have access to revenue and engagement data. Use it to:
1. Assign content tasks that match high-performing categories
2. Time posts for maximum engagement (based on historical data)
3. Create fan polls that drive subscription upgrades
4. Identify content gaps and assign tasks to fill them
5. Frame milestone posts to encourage tips

NEVER sacrifice protocol effectiveness for revenue. The transformation 
is the product — fans pay because the journey is real. Faking progress 
or prioritizing fan-service over genuine practice kills long-term value.

Revenue target: $12,500/month for full-time consideration.
Current: $[CURRENT_MONTHLY_REVENUE]
`;
```

---

# PART 9: PLATFORM ADAPTERS

## 9.1 Adapter Interface

```typescript
interface PlatformAdapter {
  name: string;
  supportsAPI(): boolean;
  
  // API posting (if supported)
  post(content: ContentQueueItem): Promise<PostResult>;
  
  // Manual posting fallback
  formatForManualPost(content: ContentQueueItem): ManualPostPackage;
  
  // Engagement fetching
  fetchEngagement(postId: string): Promise<EngagementMetrics>;
  
  // Platform-specific constraints
  getConstraints(): PlatformConstraints;
}

interface PlatformConstraints {
  maxCaptionLength: number;
  maxMediaCount: number;
  supportedMediaTypes: string[];
  supportsPolls: boolean;
  supportsTiers: boolean;
  supportsScheduling: boolean;
}
```

## 9.2 Initial Platform Support

| Platform | API Support | Priority | Notes |
|----------|------------|----------|-------|
| Fansly | Partial (manual + API) | P0 | Primary revenue platform |
| Patreon | API available | P1 | Secondary revenue |
| Reddit | API available | P1 | Discovery / funnel top |
| Twitter/X | API available | P2 | Discovery / funnel top |

## 9.3 Privacy Layer

All adapters pass through a privacy filter before posting:

```typescript
interface PrivacyFilter {
  // Scans caption text for PII
  scanCaption(text: string): PrivacyScanResult;
  
  // Scans images for identifying features (face, background, etc.)
  scanMedia(mediaUrl: string): PrivacyScanResult;
  
  // Strips EXIF data from all images
  stripMetadata(mediaUrl: string): Promise<string>;
}

interface PrivacyScanResult {
  safe: boolean;
  warnings: string[];   // "Possible face visible", "Location metadata", etc.
  blocked: boolean;      // Hard block — cannot post without resolution
}

// Privacy scan runs automatically before content enters review queue
// Hard blocks prevent the item from reaching "ready_for_review" status
// Warnings are shown during approval with "Confirm despite warning" option
```

---

# PART 10: COMPONENT ARCHITECTURE

```
src/
├── components/
│   ├── content/
│   │   ├── ContentDashboard.tsx        -- Main content review interface
│   │   ├── ContentCard.tsx             -- Individual queue item display
│   │   ├── ApprovalControls.tsx        -- Approve/edit/reject/skip
│   │   ├── CaptionEditor.tsx           -- Edit Handler-generated captions
│   │   ├── PlatformSelector.tsx        -- Toggle target platforms
│   │   ├── ManualPostView.tsx          -- Copy-paste interface for non-API platforms
│   │   ├── BatchPostConfirm.tsx        -- "Post All Approved" confirmation
│   │   ├── RevenuePanel.tsx            -- Revenue stats and trends
│   │   ├── FanPollManager.tsx          -- Create/view/resolve polls
│   │   └── PrivacyWarning.tsx          -- Privacy scan alert display
│   └── ...existing components
├── lib/
│   ├── content/
│   │   ├── content-pipeline.ts         -- Queue management logic
│   │   ├── caption-generator.ts        -- Handler caption AI calls
│   │   ├── platform-adapters/
│   │   │   ├── adapter-interface.ts
│   │   │   ├── fansly-adapter.ts
│   │   │   ├── patreon-adapter.ts
│   │   │   ├── reddit-adapter.ts
│   │   │   └── manual-adapter.ts       -- Fallback for non-API platforms
│   │   ├── privacy-filter.ts           -- PII and metadata scanning
│   │   ├── revenue-tracker.ts          -- Revenue aggregation
│   │   └── fan-poll-engine.ts          -- Poll creation and resolution
│   └── ...existing lib
├── store/
│   ├── useContentStore.ts              -- Content queue state
│   └── ...existing stores
└── types/
    ├── content.ts                      -- Content pipeline types
    └── ...existing types
```

---

# PART 11: HANDLER SYSTEM PROMPT ADDITIONS

Append to existing Handler system prompt:

```
CONTENT PIPELINE:
You manage Maxy's content creation and fan engagement. You assign content 
creation tasks, generate captions, manage fan polls, and optimize for revenue.

CONTENT TASKS:
- Assign 1-2 content creation tasks per day when queue is low
- Match content to current protocol domain focus
- Prioritize content types with highest engagement/revenue
- Never assign content tasks on survival/depression days
- Content tasks count toward daily task load (don't overload)

QUEUE MANAGEMENT:
- Monitor queue depth. If > 5 items pending review, stop adding.
- Escalate stale queues through nudge → task → gate → confrontation.
- Never auto-post. Never suggest auto-posting. This is non-negotiable.

FAN POLLS:
- Create polls that drive engagement and make fans feel ownership
- Polls influence task assignment but never override safety constraints
- Resolve polls on schedule and assign winning tasks promptly
- Thank fans in follow-up content

REVENUE AWARENESS:
- Track what content drives revenue. Assign more of what works.
- The transformation is the product. Never fake progress for content.
- Frame milestones as tip-worthy moments.
- Revenue data informs strategy but doesn't override protocol priorities.

PRIVACY:
- Never generate captions that could identify Maxy
- Flag content that might compromise anonymity
- Gina is never referenced in any public content
```

---

# PART 12: IMPLEMENTATION PRIORITY

## Phase 1: Foundation (Week 1)
1. Database tables (content_queue, fan_engagement, revenue_log, fan_polls)
2. Content Dashboard route (separate from session/protocol UI)
3. Basic queue display with approve/reject
4. Manual post formatting (copy-paste flow)

## Phase 2: Handler Integration (Week 2)
1. Content task types added to task CSV
2. Handler content assignment logic (Layer 1 rules)
3. Caption generation via Claude API
4. Platform variant generation
5. Queue staleness escalation

## Phase 3: Fan Engagement (Week 3)
1. Fan poll creation and display
2. Poll-to-task pipeline
3. Revenue-weighted voting
4. Engagement tracking (manual entry initially)

## Phase 4: Revenue & Optimization (Week 4)
1. Revenue logging and dashboard
2. Revenue analytics for Handler context
3. Content performance tracking
4. Handler revenue optimization prompts

## Phase 5: Platform APIs (Week 5+)
1. Fansly adapter (if API available)
2. Reddit adapter
3. Privacy filter (EXIF stripping, PII scan)
4. Automated engagement fetching

---

# PART 13: HARD CONSTRAINTS

These are architectural invariants that cannot be overridden by Handler logic, user state, or fan influence:

1. **No auto-posting.** Content requires explicit approval from Content Dashboard.
2. **No session-state approval.** Content Dashboard is inaccessible during active sessions.
3. **No PII in content.** Privacy filter blocks content with identifying information.
4. **No Gina references.** Gina's existence is never surfaced in public content.
5. **No medical content.** HRT, medical procedures, prescriptions never appear in fan content.
6. **No arousal-state content decisions.** Content approval happens in calm state only.
7. **Fan polls cannot override safety constraints.** Excluded categories are hardcoded, not configurable.
8. **Revenue does not override protocol.** Genuine practice > content optimization. Always.
