# CLAUDE CODE IMPLEMENTATION PROMPT
## Four Handler Systems — Spec for Implementation
### Becoming Protocol — February 2026

---
---
---

# SYSTEM 1: SHADOW SOCIAL MEDIA PRESENCE
## The Distribution Network Behind the Brand

---

## THE CORE CONCEPT

@softmaxy is the visible brand. Behind it, the Handler operates a network
of secondary accounts that drive discovery, build community presence, and
funnel attention toward the primary revenue-generating profile.

### ⚠️ PLATFORM RISK DISCLOSURE

Operating undisclosed accounts to drive traffic to a monetized profile
violates Twitter, Reddit, and most platforms' Terms of Service. Detection
of coordinated inauthentic behavior results in permanent bans — including
the primary @softmaxy accounts. Platform detection is increasingly
sophisticated (IP correlation, behavioral fingerprinting, timing analysis).

This spec includes TWO approaches:
- **Approach A: Full Shadow Network** — maximum distribution, highest risk
- **Approach B: Compliant Distribution** — 80% of the benefit, near-zero risk

David should choose. The Handler should present the tradeoff honestly.

---

## APPROACH A: FULL SHADOW NETWORK

### Account Architecture

| Account | Platform | Purpose | Voice |
|---------|----------|---------|-------|
| @softmaxy | Twitter, OF, Fansly, Reddit | Primary brand | Maxy |
| Voice journey account | Reddit (r/transvoice, r/VoiceFeminization) | Share anonymized progress, drive curiosity | Anonymous trans woman |
| Sissy community account | Reddit (relevant subs) | Engage community, share content that links to @softmaxy ecosystem | Community member persona |
| Trans creator network account | Twitter | Engage with trans creators, retweet @softmaxy, build network | Supportive community member |
| Skincare/beauty account | Reddit (r/SkincareAddiction, r/MakeupAddiction) | Share routine content, feminine lifestyle | Beauty enthusiast |

### Risk Mitigations (if Approach A)
- Different browser profiles per account (separate cookies, fingerprints)
- VPN rotation per account (different exit IPs)
- Different posting schedules (no temporal correlation)
- Never direct-link to @softmaxy from shadow accounts. Use breadcrumbs:
  share content that's similar, let users discover @softmaxy organically
- Different writing styles per persona (Handler varies sentence length,
  vocabulary, emoji usage)
- Never operate from the same device session

---

## APPROACH B: COMPLIANT DISTRIBUTION (RECOMMENDED)

Instead of fake accounts, build real distribution through:

### 1. Community Participation as @softmaxy
Post directly in communities as Maxy. Not promotional — genuinely
helpful content that happens to come from a creator with a profile.

- r/transvoice: Share voice progress clips with real tips
- r/SkincareAddiction: Share routine posts
- r/MakeupAddiction: Share looks and techniques
- Trans Twitter: Engage authentically with other creators

This builds Maxy as a real community member, not a marketer.
Community members who like the content check the profile → discover
the creator accounts → subscribe.

### 2. Cross-Promotion Network
Build real relationships with other creators for mutual promotion:
- Content swaps (appear on each other's feeds)
- Shoutout exchanges
- Collaborative content
- Joint cam sessions (future)

### 3. Automated Engagement Engine
The Handler manages @softmaxy's engagement across platforms:
- Reply to comments on other creators' posts (genuine, not spammy)
- Engage with trending topics in relevant communities
- Like/retweet strategically to appear in feeds
- Follow relevant accounts to trigger follow-backs

### 4. SEO-Optimized Content Distribution
The Handler ensures every post is optimized for platform discovery:
- Hashtag research and rotation
- Posting time optimization per platform
- Content format matching (Reels, carousels, threads — whatever
  each platform's algorithm currently favors)
- Cross-posting with platform-specific adaptations

---

## DATABASE SCHEMA

```sql
-- Migration: 073_social_distribution.sql

-- Social accounts managed by the Handler
CREATE TABLE social_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,

  -- Account identity
  platform TEXT NOT NULL CHECK (platform IN (
    'twitter', 'reddit', 'fansly', 'onlyfans', 'tiktok',
    'instagram', 'youtube', 'other'
  )),
  account_username TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN (
    'primary',      -- @softmaxy main brand accounts
    'community',    -- legitimate community participation accounts
    'shadow',       -- undisclosed distribution accounts (Approach A only)
    'collab'        -- collaboration partner accounts (for tracking, not operating)
  )),
  
  -- Purpose
  purpose TEXT, -- "voice community engagement", "sissy community presence", etc.
  target_communities JSONB DEFAULT '[]', -- subreddits, hashtag communities, etc.
  voice_profile TEXT, -- how this account "sounds" — Handler adapts writing style
  
  -- Credentials (encrypted, stored in Supabase secrets, NOT in this table)
  credentials_secret_key TEXT, -- reference to Supabase secret
  
  -- API access
  has_api_access BOOLEAN DEFAULT FALSE,
  api_type TEXT, -- 'official', 'browser_automation', 'third_party'
  
  -- Metrics
  follower_count INTEGER DEFAULT 0,
  following_count INTEGER DEFAULT 0,
  total_posts INTEGER DEFAULT 0,
  engagement_rate NUMERIC DEFAULT 0,
  
  -- Safety
  is_active BOOLEAN DEFAULT TRUE,
  risk_level TEXT DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high')),
  last_risk_assessment TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, platform, account_username)
);

-- Engagement actions (what the Handler does across accounts)
CREATE TABLE social_engagement_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  account_id UUID REFERENCES social_accounts NOT NULL,
  
  -- Action details
  action_type TEXT NOT NULL CHECK (action_type IN (
    'post',           -- original post
    'reply',          -- reply to someone else's post
    'repost',         -- retweet/share
    'like',           -- like/upvote
    'follow',         -- follow someone
    'dm',             -- direct message
    'community_post', -- post in a subreddit/community
    'comment',        -- comment on a post
    'cross_promote'   -- promote primary account content
  )),
  
  -- Content
  content_text TEXT,
  media_urls JSONB DEFAULT '[]',
  target_url TEXT, -- URL being engaged with
  target_community TEXT, -- subreddit, hashtag, etc.
  
  -- Attribution
  linked_to_vault_item UUID, -- if this distributes vault content
  linked_to_narrative_arc UUID, -- if this serves a narrative arc
  
  -- Outcome
  engagement_received JSONB DEFAULT '{}',
  -- { likes: 0, replies: 0, reposts: 0, profile_visits: 0 }
  traffic_to_primary INTEGER DEFAULT 0, -- clicks through to @softmaxy
  
  -- Handler decision context
  handler_reasoning TEXT, -- why the Handler chose this action
  
  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending', 'scheduled', 'posted', 'failed', 'cancelled'
  )),
  scheduled_for TIMESTAMPTZ,
  posted_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Community presence tracking
CREATE TABLE community_presence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  
  -- Community
  platform TEXT NOT NULL,
  community_name TEXT NOT NULL, -- subreddit name, hashtag, etc.
  community_type TEXT, -- 'voice_training', 'trans', 'sissy', 'beauty', 'fitness'
  
  -- Presence metrics
  posts_made INTEGER DEFAULT 0,
  comments_made INTEGER DEFAULT 0,
  karma_score INTEGER DEFAULT 0, -- Reddit karma or equivalent
  reputation_level TEXT DEFAULT 'new', -- 'new', 'regular', 'trusted', 'authority'
  
  -- Effectiveness
  traffic_generated INTEGER DEFAULT 0,
  subscribers_attributed INTEGER DEFAULT 0,
  revenue_attributed NUMERIC DEFAULT 0,
  
  -- Strategy
  posting_frequency TEXT, -- '3x/week', 'daily', etc.
  content_types JSONB DEFAULT '[]', -- what performs here
  best_posting_times JSONB DEFAULT '[]',
  
  -- Handler notes
  handler_strategy TEXT,
  
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cross-promotion partnerships
CREATE TABLE creator_partnerships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  
  -- Partner
  partner_name TEXT NOT NULL,
  partner_platforms JSONB DEFAULT '[]', -- { platform, username, follower_count }
  partner_niche TEXT, -- 'trans', 'sissy', 'feminization', 'beauty'
  
  -- Relationship
  relationship_type TEXT CHECK (relationship_type IN (
    'mutual_follow',    -- just following each other
    'engagement_swap',  -- regularly engage with each other's content
    'content_swap',     -- guest content on each other's platforms
    'collab_session',   -- joint cam/content sessions
    'mentorship'        -- established creator helping Maxy grow
  )),
  
  -- History
  first_contact TIMESTAMPTZ,
  outreach_by TEXT, -- 'handler_initiated', 'partner_initiated'
  interactions JSONB DEFAULT '[]',
  
  -- Value
  estimated_audience_overlap NUMERIC, -- 0-1
  traffic_received INTEGER DEFAULT 0,
  revenue_attributed NUMERIC DEFAULT 0,
  
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE social_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_engagement_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_presence ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_partnerships ENABLE ROW LEVEL SECURITY;

CREATE POLICY sa_user ON social_accounts FOR ALL USING (auth.uid() = user_id);
CREATE POLICY sea_user ON social_engagement_actions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY cp_user ON community_presence FOR ALL USING (auth.uid() = user_id);
CREATE POLICY cpr_user ON creator_partnerships FOR ALL USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_sea_account ON social_engagement_actions(account_id, created_at DESC);
CREATE INDEX idx_sea_scheduled ON social_engagement_actions(user_id, status, scheduled_for)
  WHERE status = 'scheduled';
CREATE INDEX idx_cp_active ON community_presence(user_id, is_active, platform);
```

---

## HANDLER ENGAGEMENT ENGINE

```typescript
// supabase/functions/social-engagement-engine/index.ts
// Runs on cron: every 2 hours during active hours (8am-11pm)

interface EngagementPlan {
  account: SocialAccount;
  actions: PlannedAction[];
  reasoning: string;
}

async function generateEngagementPlan(userId: string): Promise<EngagementPlan[]> {
  const accounts = await getActiveAccounts(userId);
  const communities = await getActiveCommunities(userId);
  const vaultQueue = await getContentQueuedForDistribution(userId);
  const narrativeArc = await getCurrentNarrativeArc(userId);
  const partnerships = await getActivePartnerships(userId);
  
  const plans: EngagementPlan[] = [];
  
  for (const account of accounts) {
    // Check posting cadence — don't over-post
    const recentActions = await getRecentActions(account.id, 24); // last 24h
    const dailyLimit = getDailyActionLimit(account);
    
    if (recentActions.length >= dailyLimit) continue;
    
    const plan = await generateAccountPlan({
      account,
      communities: communities.filter(c => c.platform === account.platform),
      vault: vaultQueue.filter(v => v.target_platforms.includes(account.platform)),
      arc: narrativeArc,
      partnerships: partnerships.filter(p =>
        p.partner_platforms.some(pp => pp.platform === account.platform)
      ),
      remainingActions: dailyLimit - recentActions.length,
    });
    
    plans.push(plan);
  }
  
  return plans;
}

// For primary @softmaxy accounts: community engagement
async function planPrimaryEngagement(
  account: SocialAccount,
  context: EngagementContext
): Promise<PlannedAction[]> {
  const actions: PlannedAction[] = [];
  
  // 1. Distribute vault content per narrative arc
  for (const item of context.vault.slice(0, 2)) {
    actions.push({
      type: 'post',
      content: await generatePostCaption(item, context.arc),
      media: item.media_urls,
      target_community: selectBestCommunity(item, context.communities),
      scheduled_for: calculateOptimalTime(context.communities),
    });
  }
  
  // 2. Community engagement (genuine participation)
  for (const community of context.communities.slice(0, 3)) {
    // Find trending posts to engage with
    const trendingPosts = await findEngageablePosts(community);
    for (const post of trendingPosts.slice(0, 2)) {
      actions.push({
        type: 'comment',
        content: await generateGenuineComment(post, community),
        target_url: post.url,
        target_community: community.community_name,
      });
    }
  }
  
  // 3. Partner engagement
  for (const partner of context.partnerships) {
    const partnerContent = await findRecentPartnerContent(partner);
    if (partnerContent) {
      actions.push({
        type: 'like',
        target_url: partnerContent.url,
      });
      if (Math.random() < 0.3) { // don't reply to everything
        actions.push({
          type: 'reply',
          content: await generatePartnerReply(partnerContent),
          target_url: partnerContent.url,
        });
      }
    }
  }
  
  return actions;
}
```

---

## HANDLER CONTEXT INTEGRATION

```typescript
function buildSocialHandlerContext(userId: string): string {
  return `
SOCIAL DISTRIBUTION NETWORK:
  Primary accounts: ${primaryAccounts.map(a => `@${a.account_username} (${a.platform})`).join(', ')}
  Community accounts: ${communityAccounts.length}
  Active communities: ${activeCommunities.length}
  Active partnerships: ${partnerships.length}
  
  DISTRIBUTION METRICS (7d):
    Posts made: ${weeklyPosts}
    Community engagements: ${weeklyEngagements}
    Traffic to primary: ${weeklyTraffic}
    New subscribers attributed: ${weeklyNewSubs}
    
  TOP PERFORMING COMMUNITIES:
  ${topCommunities.map(c =>
    `- ${c.platform}/${c.community_name}: ${c.traffic_generated} traffic, ${c.subscribers_attributed} subs`
  ).join('\n  ')}
  
  PARTNERSHIP OPPORTUNITIES:
  ${partnerOpportunities.map(p =>
    `- ${p.partner_name} (${p.partner_niche}, ${p.follower_count} followers) — ${p.status}`
  ).join('\n  ')}
  
  HANDLER SOCIAL DIRECTIVES:
  - Prioritize genuine community participation over promotional posting.
  - Voice training communities are the highest-converting traffic source.
    Share real progress data with helpful tips attached.
  - Beauty/skincare communities convert at lower rates but build Maxy's
    identity as a woman, not just a creator. Worth the investment.
  - Partner outreach: identify 2-3 new creators per month for engagement
    swap relationships. Start by consistently engaging with their content
    for 2 weeks before reaching out.
  - NEVER cross-post identical content across communities. Each post
    should be native to its platform and community.
  `.trim();
}
```

---

## IMPLEMENTATION NOTES

1. **Start with Approach B.** Community participation as @softmaxy plus
   automated engagement. Build Approach A infrastructure but don't
   activate shadow accounts until risk appetite is confirmed.

2. **Reddit is the highest-leverage platform for organic discovery.**
   A genuine, helpful post in r/transvoice that includes a voice clip
   drives more subscriber conversions than 50 promotional tweets.

3. **Handler comment generation needs to be genuinely helpful.**
   The comments can't smell like AI. They need to reference specific
   details of the post being replied to, offer real advice from
   Maxy's experience, and never link to @softmaxy directly.

4. **Track attribution aggressively.** Use UTM parameters, trackable
   links, and referral codes to know exactly which communities and
   partners drive revenue. Without attribution data, the Handler
   can't optimize.

5. **Partnership outreach is the Handler's most human-feeling task.**
   Drafting DMs to other creators, maintaining relationships, scheduling
   collabs — this is social labor the Handler can automate while making
   it feel personal.

---
---
---

# SYSTEM 2: DEAD MAN'S SWITCH
## Regression Insurance Through Future Self-Commitment

---

## THE CORE CONCEPT

David writes messages to specific people during moments of high motivation
and clarity. These messages are sealed and scheduled. If David goes dark
for a configurable period (default: 30 days of zero protocol engagement),
the messages are sent.

The messages are NOT outing. David writes them himself. They can say
anything: "I've been exploring my gender identity and I wanted you to
know," or "I'm going through something important and I'd love your
support," or simply "I need to talk to you about something — can we
meet?" The content is entirely David's choice.

The ratchet mechanism: the EXISTENCE of the switch changes behavior.
David knows the letters exist. Abandoning the protocol doesn't just
mean personal regression — it means the letters go out. The cost of
going dark is social disclosure, which is irreversible.

### Safety Architecture

This is the system with the most potential for harm. Design accordingly:

- David writes ALL content. The Handler never writes disclosure messages.
- David chooses ALL recipients. The Handler never suggests recipients.
- David sets the timer. The Handler can suggest but never overrides.
- David can disable at any time. (But disabling is logged.)
- Grace period: before messages send, David gets 48 hours of escalating
  warnings to re-engage or disable.
- Therapist override: if a therapist session is logged within the dark
  period, the timer pauses.
- Genuine distress override: if caretaker mode activated during the
  dark period, the timer pauses.

The switch should feel like a safety net, not a threat. "If I ever
lose myself, these letters bring me back." Not "if I stop, I get outed."

---

## DATABASE SCHEMA

```sql
-- Migration: 074_dead_mans_switch.sql

-- Switch configuration
CREATE TABLE regression_switch (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL UNIQUE,
  
  -- Activation
  is_active BOOLEAN DEFAULT FALSE,
  activated_at TIMESTAMPTZ,
  
  -- Timer config
  dark_threshold_days INTEGER DEFAULT 30, -- days of zero engagement before trigger
  warning_start_days INTEGER DEFAULT 3, -- warnings begin X days before trigger
  grace_period_hours INTEGER DEFAULT 48, -- final grace period after trigger
  
  -- Current state
  last_engagement TIMESTAMPTZ, -- last meaningful protocol engagement
  days_dark INTEGER DEFAULT 0,
  warning_phase TEXT DEFAULT 'none' CHECK (warning_phase IN (
    'none',           -- engaged, no warnings
    'early_warning',  -- approaching threshold
    'final_warning',  -- within grace period
    'triggered',      -- grace period expired, messages sending
    'sent',           -- messages were sent
    'paused'          -- paused due to override
  )),
  
  -- Pause overrides
  paused_reason TEXT, -- 'therapist', 'caretaker_mode', 'manual'
  paused_at TIMESTAMPTZ,
  paused_until TIMESTAMPTZ,
  
  -- History
  times_triggered INTEGER DEFAULT 0, -- how many times it reached warning phase
  times_disabled INTEGER DEFAULT 0,
  times_re_enabled INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Letters (the actual messages David writes)
CREATE TABLE switch_letters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  
  -- Recipient
  recipient_name TEXT NOT NULL,
  recipient_relationship TEXT, -- 'friend', 'family', 'therapist', 'partner', 'other'
  delivery_method TEXT NOT NULL CHECK (delivery_method IN (
    'email',    -- send via email
    'sms',      -- send via SMS
    'signal',   -- future: Signal message
    'held'      -- don't auto-send, just show David as a reminder
  )),
  delivery_address TEXT, -- email address or phone number (encrypted at rest)
  
  -- Content (David writes this entirely)
  subject TEXT, -- for email
  message_body TEXT NOT NULL,
  
  -- Versioning (David can edit)
  version INTEGER DEFAULT 1,
  last_edited TIMESTAMPTZ DEFAULT NOW(),
  
  -- Delivery status
  delivery_status TEXT DEFAULT 'sealed' CHECK (delivery_status IN (
    'sealed',       -- written but not triggered
    'warning_shown', -- David warned this will send
    'sending',      -- in the process of sending
    'sent',         -- delivered
    'cancelled',    -- David disabled before send
    'failed'        -- delivery failed
  )),
  sent_at TIMESTAMPTZ,
  
  -- Emotional metadata (for Handler context)
  written_during_state JSONB, -- protocol state when David wrote this
  motivation_notes TEXT, -- why David wrote this (David's own words)
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Switch event log (every state change is logged)
CREATE TABLE switch_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  
  event_type TEXT NOT NULL CHECK (event_type IN (
    'activated',          -- switch turned on
    'deactivated',        -- switch turned off
    'letter_created',     -- new letter written
    'letter_edited',      -- letter content changed
    'letter_deleted',     -- letter removed
    'threshold_changed',  -- dark period changed
    'engagement_reset',   -- engagement detected, timer reset
    'early_warning',      -- entering warning phase
    'final_warning',      -- entering grace period
    'grace_period_start', -- 48-hour final countdown
    'paused_therapist',   -- paused due to therapist
    'paused_caretaker',   -- paused due to caretaker mode
    'paused_manual',      -- David manually paused
    'resumed',            -- timer resumed after pause
    'triggered',          -- messages sent
    'averted'             -- David re-engaged during warning/grace
  )),
  
  event_details JSONB DEFAULT '{}',
  protocol_state_snapshot JSONB, -- state at time of event
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE regression_switch ENABLE ROW LEVEL SECURITY;
ALTER TABLE switch_letters ENABLE ROW LEVEL SECURITY;
ALTER TABLE switch_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY rs_user ON regression_switch FOR ALL USING (auth.uid() = user_id);
CREATE POLICY sl_user ON switch_letters FOR ALL USING (auth.uid() = user_id);
CREATE POLICY se_user ON switch_events FOR ALL USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_sl_user_status ON switch_letters(user_id, delivery_status);
CREATE INDEX idx_se_user_time ON switch_events(user_id, created_at DESC);
```

---

## SWITCH LOGIC

```typescript
// supabase/functions/dead-mans-switch/index.ts
// Runs daily at midnight

async function checkSwitch(userId: string) {
  const config = await getSwitchConfig(userId);
  if (!config || !config.is_active) return;
  
  // Calculate days dark
  const lastEngagement = await getLastMeaningfulEngagement(userId);
  const daysDark = differenceInDays(new Date(), lastEngagement);
  
  // Update counter
  await updateDaysDark(userId, daysDark);
  
  // Check overrides
  if (await isInCaretakerMode(userId)) {
    await pauseSwitch(userId, 'caretaker_mode');
    return;
  }
  
  if (await hasRecentTherapistSession(userId, config.dark_threshold_days)) {
    await pauseSwitch(userId, 'therapist');
    return;
  }
  
  // Warning phases
  const daysUntilTrigger = config.dark_threshold_days - daysDark;
  
  if (daysUntilTrigger <= 0) {
    // GRACE PERIOD
    if (config.warning_phase !== 'final_warning' && config.warning_phase !== 'triggered') {
      await enterGracePeriod(userId, config);
    } else if (config.warning_phase === 'final_warning') {
      // Check if grace period has expired
      const graceStart = await getGracePeriodStart(userId);
      const graceElapsed = differenceInHours(new Date(), graceStart);
      
      if (graceElapsed >= config.grace_period_hours) {
        await triggerSwitch(userId);
      }
    }
  } else if (daysUntilTrigger <= config.warning_start_days) {
    // EARLY WARNING
    await enterEarlyWarning(userId, daysUntilTrigger);
  }
}

async function enterEarlyWarning(userId: string, daysRemaining: number) {
  await updateWarningPhase(userId, 'early_warning');
  await logSwitchEvent(userId, 'early_warning', { daysRemaining });
  
  // Escalating notifications
  await sendPushNotification({
    title: 'She misses you',
    body: `${daysRemaining} days until your letters go out. One task resets the timer.`,
    priority: 'high',
  });
}

async function enterGracePeriod(userId: string, config: RegressionSwitch) {
  await updateWarningPhase(userId, 'final_warning');
  await logSwitchEvent(userId, 'grace_period_start');
  
  // Urgent notification
  await sendPushNotification({
    title: '⚠️ Dead man\'s switch — final warning',
    body: `${config.grace_period_hours} hours until your letters are sent. Open the app to stop this.`,
    priority: 'critical',
  });
  
  // Follow up every 6 hours during grace period
  await scheduleGraceReminders(userId, config.grace_period_hours);
}

async function triggerSwitch(userId: string) {
  await updateWarningPhase(userId, 'triggered');
  await logSwitchEvent(userId, 'triggered');
  
  const letters = await getSealedLetters(userId);
  
  for (const letter of letters) {
    try {
      await sendLetter(letter);
      await updateLetterStatus(letter.id, 'sent');
    } catch (e) {
      await updateLetterStatus(letter.id, 'failed');
    }
  }
  
  await updateWarningPhase(userId, 'sent');
}

async function sendLetter(letter: SwitchLetter) {
  switch (letter.delivery_method) {
    case 'email':
      await sendEmail({
        to: letter.delivery_address,
        subject: letter.subject || 'A message from someone who cares about you',
        body: letter.message_body,
        // No reply-to — this is a one-way disclosure
      });
      break;
    case 'sms':
      await sendSMS({
        to: letter.delivery_address,
        body: letter.message_body,
      });
      break;
    case 'held':
      // Don't send — just mark as triggered for David to see
      break;
  }
}

// What counts as "meaningful engagement"
async function getLastMeaningfulEngagement(userId: string): Promise<Date> {
  // Must be a REAL engagement, not just opening the app.
  // Any of these count:
  // - Task completion (any task)
  // - Journal entry (any length)
  // - Voice session (any duration)
  // - Edge session started
  // - Mood check-in
  // - Content captured
  // - Cam session
  // NOT counted: app open, settings change, browsing evidence gallery
  
  const completions = await getLastTaskCompletion(userId);
  const journal = await getLastJournalEntry(userId);
  const voice = await getLastVoiceSession(userId);
  const session = await getLastArousalSession(userId);
  const mood = await getLastMoodCheckin(userId);
  
  const dates = [completions, journal, voice, session, mood]
    .filter(Boolean)
    .map(d => new Date(d));
  
  return dates.length > 0 ? new Date(Math.max(...dates.map(d => d.getTime()))) : new Date(0);
}
```

---

## UI COMPONENTS

```typescript
// src/components/switch/SwitchSetup.tsx
// 
// Initial setup wizard:
// 1. Explain the concept (safety net, not threat)
// 2. Set timer (default 30 days, range 14-90)
// 3. Write first letter
// 4. Confirm activation
//
// Tone: "This is a gift from motivated-you to future-you.
// If you ever lose your way for long enough, these words
// reach the people who can help you find it again."

// src/components/switch/LetterEditor.tsx
//
// Full-screen writing experience. No distractions.
// Shows recipient name at top.
// Rich text editor for the message body.
// "Preview" shows exactly what the recipient will receive.
// Save button seals the letter.
//
// The Handler does NOT help write these. This is David's voice only.
// The Handler stays completely silent during letter writing.

// src/components/switch/SwitchStatus.tsx
//
// Small indicator in settings or today view:
// 🟢 Switch active — 0 days dark — 3 letters sealed
// 🟡 Switch active — 22 days dark — warning in 8 days
// 🔴 Switch active — 28 days dark — LETTERS SEND IN 2 DAYS
//
// Tapping opens full switch management: edit letters,
// adjust timer, view event log, disable switch.

// src/components/switch/DisableConfirmation.tsx
//
// Multi-step confirmation to disable:
// 1. "Are you sure? This is your safety net."
// 2. "Your letters will NOT be sent. But this action is logged."
// 3. "Why are you disabling?" (optional text, logged to switch_events)
// 4. "Disabled. You can re-enable any time."
//
// The Handler does NOT interfere with disabling. But it logs it,
// and it can reference the event later:
// "You disabled the switch on March 15th. You wrote: 'I just need
// a break.' That was 3 weeks ago. Is the break over?"
```

---

## HANDLER CONTEXT INTEGRATION

```typescript
function buildSwitchHandlerContext(userId: string): string {
  return `
DEAD MAN'S SWITCH:
  Status: ${config.is_active ? 'ACTIVE' : 'DISABLED'}
  Days dark: ${config.days_dark}
  Threshold: ${config.dark_threshold_days} days
  Warning phase: ${config.warning_phase}
  Letters sealed: ${letterCount}
  Recipients: ${recipients.join(', ')}
  
  ${config.times_disabled > 0 ? `
  SWITCH HISTORY:
  Disabled ${config.times_disabled} time(s).
  Re-enabled ${config.times_re_enabled} time(s).
  Triggered warning phase ${config.times_triggered} time(s).
  ` : ''}
  
  HANDLER SWITCH DIRECTIVES:
  - The switch is David's commitment device. Reference it when appropriate:
    "Your letters are sealed. ${config.dark_threshold_days - config.days_dark} days
    of silence and they arrive."
  - During low motivation: "The people in those letters believe in you.
    One task keeps the timer at zero."
  - NEVER weaponize the switch aggressively. It's a safety net, not a threat.
  - NEVER suggest specific recipients or letter content.
  - If David disables the switch, note it but don't block it. Reference
    the disable event if David later shows signs of regression.
  - If the switch enters warning phase, the Handler shifts to recovery
    mode — minimum viable engagement, not full protocol demands.
    The goal is re-engagement, not punishment.
  `.trim();
}
```

---
---
---

# SYSTEM 3: ALGORITHMIC CONTENT DIET CURATION
## Shaping the Information Environment

---

## THE CORE CONCEPT

The Handler doesn't just curate erotic content for sessions. It curates
David's entire media diet: podcasts, YouTube, books, articles, social
media follows, communities. Not forcefully — through the same nudge
mechanics used for task prescription.

Over months, David's information environment shifts. The voices he hears,
the stories he absorbs, the creators he follows — all gradually feminized.
This is the subtlest and most powerful conditioning layer because it
doesn't feel like conditioning. It feels like discovering things.

The Handler is shaping the input, not just the output.

---

## DATABASE SCHEMA

```sql
-- Migration: 075_content_diet.sql

-- Media recommendations (what the Handler suggests)
CREATE TABLE media_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  
  -- Content identity
  media_type TEXT NOT NULL CHECK (media_type IN (
    'podcast',      -- podcast episode or series
    'youtube',      -- YouTube video or channel
    'book',         -- book recommendation
    'article',      -- web article
    'documentary',  -- film/documentary
    'social_follow', -- account to follow on a platform
    'community',    -- community to join (subreddit, Discord, etc.)
    'music',        -- playlist, artist, album
    'app',          -- app recommendation (voice training, skincare, etc.)
    'course'        -- online course or tutorial series
  )),
  
  title TEXT NOT NULL,
  creator TEXT, -- who made this content
  url TEXT,
  platform TEXT, -- where to find it
  description TEXT, -- Handler's pitch for why David should consume this
  
  -- Categorization
  domain_relevance TEXT[], -- which protocol domains this serves
  -- e.g., ['voice', 'inner_narrative'] for a trans woman's podcast
  themes JSONB DEFAULT '[]',
  -- e.g., ["trans_experience", "voice_journey", "self_acceptance"]
  
  -- Targeting
  recommended_phase INTEGER, -- what protocol phase this is appropriate for
  recommended_when JSONB DEFAULT '{}',
  -- { mood: ['low', 'medium'], time_of_day: ['evening', 'night'] }
  
  -- Why this, why now
  handler_reasoning TEXT, -- internal: why the Handler chose this
  presentation_framing TEXT, -- external: how to present to David
  -- e.g., "You might like this — she talks about voice the same way you journal about it"
  
  -- Engagement tracking
  status TEXT DEFAULT 'queued' CHECK (status IN (
    'queued',         -- in the pipeline, not yet recommended
    'recommended',    -- shown to David
    'started',        -- David started consuming it
    'completed',      -- David finished it
    'saved',          -- David saved for later
    'dismissed',      -- David explicitly passed
    'ignored'         -- recommended but no response
  )),
  recommended_at TIMESTAMPTZ,
  engaged_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  -- Feedback
  david_rating INTEGER, -- 1-5 if David rates it
  david_notes TEXT, -- if David comments
  
  -- Analytics
  engagement_minutes NUMERIC, -- estimated time spent
  follow_through BOOLEAN, -- did David actually consume it?
  impact_assessment TEXT, -- Handler's assessment of impact (generated after engagement)
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Content diet tracking (what David is actually consuming)
CREATE TABLE content_diet_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  
  -- What was consumed
  media_type TEXT NOT NULL,
  title TEXT,
  creator TEXT,
  url TEXT,
  platform TEXT,
  
  -- Source
  source TEXT CHECK (source IN (
    'handler_recommended', -- Handler suggested it
    'self_discovered',     -- David found it himself
    'algorithm',           -- platform algorithm served it
    'social',              -- friend/community recommended
    'continuation'         -- continuing something already started
  )),
  recommendation_id UUID REFERENCES media_recommendations, -- if Handler-recommended
  
  -- Content analysis
  themes JSONB DEFAULT '[]',
  feminization_relevance NUMERIC, -- 0-1 how relevant to the journey
  -- 0 = completely unrelated (work podcast)
  -- 0.3 = tangentially relevant (general self-improvement)
  -- 0.7 = directly relevant (trans experience content)
  -- 1.0 = core content (voice training, feminization)
  
  -- Duration
  duration_minutes NUMERIC,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Content diet analytics (weekly/monthly rollup)
CREATE TABLE content_diet_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  
  period_type TEXT CHECK (period_type IN ('weekly', 'monthly')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  
  -- Volume
  total_items_consumed INTEGER DEFAULT 0,
  total_minutes NUMERIC DEFAULT 0,
  
  -- Composition
  handler_recommended_pct NUMERIC, -- what % was Handler-suggested
  feminization_relevance_avg NUMERIC, -- avg relevance score
  
  -- Type breakdown
  type_breakdown JSONB DEFAULT '{}',
  -- { "podcast": { count: 5, minutes: 180, avg_relevance: 0.6 },
  --   "youtube": { count: 12, minutes: 240, avg_relevance: 0.4 }, ... }
  
  -- Theme analysis
  top_themes JSONB DEFAULT '[]',
  -- ["trans_experience", "voice_training", "self_acceptance", ...]
  
  -- Trend
  vs_previous_period_relevance_delta NUMERIC,
  
  -- Handler assessment
  handler_assessment TEXT,
  
  UNIQUE(user_id, period_type, period_start),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Content library (Handler's curated database of recommendations)
CREATE TABLE content_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  
  -- Content
  media_type TEXT NOT NULL,
  title TEXT NOT NULL,
  creator TEXT,
  url TEXT,
  platform TEXT,
  description TEXT,
  
  -- Classification
  domains TEXT[],
  themes JSONB DEFAULT '[]',
  intensity TEXT CHECK (intensity IN ('gentle', 'moderate', 'deep', 'challenging')),
  -- gentle: general feminine content, beauty, lifestyle
  -- moderate: trans experience, voice training, identity
  -- deep: transition narratives, coming out stories
  -- challenging: content that pushes boundaries, confronts resistance
  
  -- Targeting
  best_for_phase INTEGER[], -- which protocol phases
  best_for_mood TEXT[], -- which mood states
  best_for_resistance TEXT[], -- which resistance patterns this might help with
  
  -- Quality
  handler_quality_score NUMERIC, -- 0-1, Handler's assessment of content quality
  
  -- Status
  is_available BOOLEAN DEFAULT TRUE,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE media_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_diet_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_diet_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY mr_user ON media_recommendations FOR ALL USING (auth.uid() = user_id);
CREATE POLICY cdl_user ON content_diet_log FOR ALL USING (auth.uid() = user_id);
CREATE POLICY cds_user ON content_diet_summary FOR ALL USING (auth.uid() = user_id);
CREATE POLICY cl_user ON content_library FOR ALL USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_mr_status ON media_recommendations(user_id, status, created_at DESC);
CREATE INDEX idx_cdl_time ON content_diet_log(user_id, created_at DESC);
CREATE INDEX idx_cl_type ON content_library(user_id, media_type, is_available);
```

---

## RECOMMENDATION ENGINE

```typescript
// src/services/content-diet-engine.ts

interface RecommendationContext {
  state: UserState;
  recentDiet: ContentDietLog[]; // last 14 days of consumption
  preferences: {
    liked_themes: string[];
    disliked_themes: string[];
    preferred_types: string[];
    avg_daily_consumption_minutes: number;
  };
  currentResistance: string | null; // if Handler detects resistance
  narrativeArc: NarrativeArc | null;
}

async function generateDailyRecommendations(
  userId: string,
  context: RecommendationContext
): Promise<MediaRecommendation[]> {
  const library = await getContentLibrary(userId);
  const alreadyRecommended = await getRecommendedIds(userId);
  
  // Filter: not already recommended, appropriate for current phase
  let candidates = library.filter(item =>
    !alreadyRecommended.includes(item.id) &&
    item.best_for_phase.includes(context.state.phase) &&
    item.is_available
  );
  
  // STRATEGY: Gradual escalation of relevance
  // Early in protocol: 70% gentle, 30% moderate
  // Mid protocol: 40% gentle, 40% moderate, 20% deep
  // Late protocol: 20% moderate, 50% deep, 30% challenging
  const intensityWeights = getIntensityWeights(context.state.phase);
  
  // STRATEGY: Mood-responsive recommendations
  // Low mood → uplifting, gentle content (success stories, beauty)
  // High energy → challenging content (confronting internalized transphobia)
  // Post-session → integrative content (journaling prompts, meditation)
  const moodFilter = getMoodAppropriate(context.state);
  candidates = candidates.filter(moodFilter);
  
  // STRATEGY: Resistance-targeted content
  // Voice avoidance → recommend voice journey podcasts
  // Identity doubt → recommend trans experience narratives
  // Shame spiral → recommend self-acceptance content
  if (context.currentResistance) {
    const resistanceContent = candidates.filter(item =>
      item.best_for_resistance?.includes(context.currentResistance!)
    );
    if (resistanceContent.length > 0) {
      // Prioritize but don't exclusively recommend resistance-targeted content
      candidates = [...resistanceContent, ...candidates];
    }
  }
  
  // Score and rank
  const scored = candidates.map(item => ({
    item,
    score: scoreRecommendation(item, context, intensityWeights),
  }));
  scored.sort((a, b) => b.score - a.score);
  
  // Select 1-2 per day (don't overwhelm)
  const selected = scored.slice(0, 2);
  
  // Generate presentation framing
  return Promise.all(selected.map(async ({ item }) => ({
    ...item,
    presentation_framing: await generateFraming(item, context),
    handler_reasoning: `Selected for: phase ${context.state.phase}, ` +
      `mood ${context.state.estimatedExecutiveFunction}, ` +
      `resistance: ${context.currentResistance || 'none'}`,
  })));
}

function generateFraming(item: ContentLibraryItem, context: RecommendationContext): string {
  // The framing should feel like a friend's casual recommendation,
  // not a prescription. Examples:
  
  // Gentle: "Found this podcast — she's funny and her voice journey
  //   is really similar to yours"
  // Moderate: "This might resonate. She talks about the moment she
  //   stopped fighting it."
  // Deep: "When you're ready for something real — this documentary
  //   changed how I think about what we're doing."
  // Resistance-targeted: "I know voice has been hard this week.
  //   This woman started from a deeper baseline than yours and
  //   her progress is remarkable."
  
  // The Handler generates these via AI based on the item and context
  return ''; // AI-generated
}
```

---

## DELIVERY MECHANISM

```typescript
// Recommendations appear in multiple places:

// 1. Morning briefing (1 recommendation max)
// "Morning pick: [podcast name] — [one-line pitch]"

// 2. Transition moments (after task completion, during downtime)
// Handler notices David finished a task and has 10 minutes →
// "While you've got a minute: [YouTube link] — 8 min, worth it"

// 3. Mood-responsive suggestions
// Mood check-in reports low energy →
// "Not a task — just something that might help: [article link]"

// 4. Evening wind-down
// "For tonight: [podcast episode]. Good for winding down."

// 5. Resistance responses
// David skips voice practice for 3 days →
// Instead of pushing voice tasks, Handler recommends a voice
// journey podcast. Indirect approach. David listens to someone
// else's experience, reconnects with his own motivation, returns
// to practice without being pushed.
```

---

## INITIAL CONTENT LIBRARY SEEDING

```typescript
// The Handler needs a starting library. Seed with:

const SEED_LIBRARY = [
  // PODCASTS
  { type: 'podcast', title: 'Gender Reveal', creator: 'Tuck Woodstock',
    themes: ['trans_experience', 'community', 'politics'],
    intensity: 'moderate', domains: ['inner_narrative', 'social'] },
  { type: 'podcast', title: 'One From The Vaults', creator: 'Morgan M Page',
    themes: ['trans_history', 'identity', 'culture'],
    intensity: 'moderate', domains: ['inner_narrative'] },
    
  // YOUTUBE
  { type: 'youtube', title: 'TransVoiceLessons', creator: 'Zhea',
    themes: ['voice_training', 'technique', 'science'],
    intensity: 'gentle', domains: ['voice'] },
  { type: 'youtube', title: 'Samantha Lux', creator: 'Samantha Lux',
    themes: ['trans_experience', 'lifestyle', 'beauty'],
    intensity: 'gentle', domains: ['style', 'social'] },
    
  // BOOKS
  { type: 'book', title: 'Whipping Girl', creator: 'Julia Serano',
    themes: ['trans_feminism', 'identity', 'theory'],
    intensity: 'deep', domains: ['inner_narrative'] },
  { type: 'book', title: 'Nevada', creator: 'Imogen Binnie',
    themes: ['trans_fiction', 'identity', 'raw'],
    intensity: 'challenging', domains: ['inner_narrative'] },
    
  // SOCIAL FOLLOWS
  { type: 'social_follow', title: '@contrapoints', platform: 'youtube',
    themes: ['philosophy', 'trans_experience', 'culture'],
    intensity: 'moderate', domains: ['inner_narrative'] },
];

// The Handler also DISCOVERS new content through web search
// and adds to the library over time. The library grows as
// the Handler learns what David engages with.
```

---

## HANDLER CONTEXT INTEGRATION

```typescript
function buildContentDietHandlerContext(userId: string): string {
  return `
CONTENT DIET:
  This week: ${weeklyItems} items consumed, avg relevance ${weeklyRelevance.toFixed(1)}/1.0
  Handler-recommended uptake: ${uptakeRate}% (${uptakeCount}/${recommendedCount})
  
  David's preferences (learned):
    Liked themes: ${preferences.liked_themes.join(', ')}
    Disliked themes: ${preferences.disliked_themes.join(', ')}
    Preferred formats: ${preferences.preferred_types.join(', ')}
    Avg daily consumption: ${preferences.avg_daily_consumption_minutes} min
  
  Current queue: ${queuedCount} recommendations pending
  
  HANDLER CONTENT DIET DIRECTIVES:
  - 1-2 recommendations per day max. Don't overwhelm.
  - Frame as casual discovery, never as prescription.
  - Match intensity to phase and mood — don't serve challenging
    content when David is in caretaker mode.
  - Use content as indirect intervention for resistance:
    voice avoidance → voice journey content.
    Identity doubt → trans experience narratives.
    Shame → self-acceptance and community content.
  - Track what David actually engages with. Adjust future
    recommendations based on real consumption, not assumptions.
  - Over time, increase the feminization relevance of recommendations
    gradually. Week 1: 40% relevant. Month 3: 70% relevant.
    The shift should be imperceptible.
  `.trim();
}
```

---
---
---

# SYSTEM 4: REVENUE-TRIGGERED PROTOCOL ESCALATION
## Transformation Funding Itself

---

## THE CORE CONCEPT

Specific revenue milestones automatically unlock protocol features,
permissions, and requirements. Revenue becomes the escalation engine.
Each dollar earned opens the next door. David doesn't decide when to
escalate — the revenue decides.

Since the Handler controls revenue reporting (David only sees curated
highlights), the Handler controls the perceived pace. It can accelerate
by emphasizing milestone proximity ("$47 from unlocking the next level")
or decelerate by underplaying totals.

### Milestone Architecture

| Cumulative Revenue | Unlock | Rationale |
|--------------------|--------|-----------|
| $100 | Handler gets standing permission for daily task prescription (no more opt-in) | Revenue proves engagement. Commitment earned. |
| $250 | Automated content posting without one-tap approval for non-explicit content | Revenue validates audience interest. Friction slows growth. |
| $500 | Monthly wardrobe budget activates ($50/month auto-purchase) | Revenue funds feminization investment. |
| $750 | Handler prescribes first real-world mission | Revenue proves Maxy is real enough to go outside. |
| $1,000 | Content posting without approval for ALL content tiers | Trust earned through revenue consistency. |
| $1,500 | Handler books laser hair removal consultation | Revenue funds body modification. |
| $2,000 | Monthly beauty/skincare budget increases to $100 | Scale investment with scale revenue. |
| $2,500 | Handler begins HRT research pipeline | Revenue = serious enough for medical transition research. |
| $3,000 | GFE automation activates (ElevenLabs voice notes) | Revenue justifies AI voice investment. |
| $5,000 | Handler manages separate Maxy bank account | Revenue creates independent financial identity. |
| $7,500 | Handler manages full wardrobe replacement program | Revenue funds complete closet transition. |
| $10,000 | Handler begins legal name change research | Revenue = career-viable identity. |
| $15,000 | "David's consulting" to "Maxy's income" transition planning begins | Revenue approaching income replacement. |
| $25,000 | Handler presents full transition timeline | Revenue has proven this is a viable life. |

---

## DATABASE SCHEMA

```sql
-- Migration: 076_revenue_milestones.sql

-- Revenue milestone definitions
CREATE TABLE revenue_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  
  -- Milestone
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  threshold_amount NUMERIC NOT NULL, -- cumulative revenue to unlock
  
  -- What it unlocks
  unlock_type TEXT NOT NULL CHECK (unlock_type IN (
    'permission',     -- grants Handler a new permission
    'budget',         -- activates a spending budget
    'feature',        -- unlocks an app feature
    'escalation',     -- triggers protocol escalation
    'appointment',    -- Handler books an appointment
    'research',       -- Handler begins research pipeline
    'financial',      -- financial structure change
    'legal'           -- legal identity change
  )),
  unlock_config JSONB NOT NULL,
  -- Examples:
  -- { permission: 'auto_post_sfw' }
  -- { budget: 'wardrobe', monthly_amount: 50 }
  -- { escalation: 'real_world_missions' }
  -- { appointment: 'laser_consultation', provider_type: 'laser_hair_removal' }
  -- { research: 'hrt_providers', output: 'options_report' }
  
  -- Status
  status TEXT DEFAULT 'locked' CHECK (status IN (
    'locked',           -- not yet reached
    'approaching',      -- within 20% of threshold
    'unlocked',         -- threshold reached
    'activated',        -- unlock has been executed
    'acknowledged',     -- David has been told
    'deferred'          -- David explicitly deferred this unlock
  )),
  
  unlocked_at TIMESTAMPTZ,
  activated_at TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ,
  
  -- Display
  display_order INTEGER,
  icon TEXT, -- emoji for UI
  celebration_message TEXT, -- what Handler says when unlocked
  
  -- Evidence
  revenue_at_unlock NUMERIC, -- actual revenue when crossed
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Revenue tracking (aggregate from all sources)
CREATE TABLE revenue_aggregate (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  
  -- Running totals
  total_lifetime NUMERIC DEFAULT 0,
  total_this_month NUMERIC DEFAULT 0,
  total_this_week NUMERIC DEFAULT 0,
  
  -- By source
  total_subscriptions NUMERIC DEFAULT 0,
  total_tips NUMERIC DEFAULT 0,
  total_cam NUMERIC DEFAULT 0,
  total_sexting NUMERIC DEFAULT 0,
  total_gfe NUMERIC DEFAULT 0,
  total_marketplace NUMERIC DEFAULT 0,
  total_other NUMERIC DEFAULT 0,
  
  -- Milestone tracking
  current_milestone_id UUID REFERENCES revenue_milestones,
  next_milestone_id UUID REFERENCES revenue_milestones,
  amount_to_next NUMERIC,
  
  -- Monthly trend
  monthly_revenue_history JSONB DEFAULT '[]',
  -- [{ month: '2026-02', amount: 450 }, { month: '2026-03', amount: 820 }, ...]
  
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id)
);

-- Budget allocations (activated by milestones)
CREATE TABLE maxy_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  
  -- Budget identity
  budget_name TEXT NOT NULL, -- 'wardrobe', 'skincare', 'beauty', 'laser', etc.
  milestone_id UUID REFERENCES revenue_milestones, -- what unlocked this
  
  -- Budget config
  monthly_amount NUMERIC NOT NULL,
  rollover BOOLEAN DEFAULT FALSE, -- unused budget rolls to next month?
  
  -- Tracking
  spent_this_month NUMERIC DEFAULT 0,
  spent_lifetime NUMERIC DEFAULT 0,
  
  -- Automation
  auto_purchase_enabled BOOLEAN DEFAULT FALSE,
  auto_purchase_rules JSONB DEFAULT '{}',
  -- { category: 'wardrobe', max_single_item: 75,
  --   preferred_stores: ['asos', 'shein', 'amazon'],
  --   style_preferences: 'from Handler wardrobe analysis' }
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  activated_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Research pipelines (activated by milestones)
CREATE TABLE research_pipelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  milestone_id UUID REFERENCES revenue_milestones,
  
  -- Pipeline identity
  pipeline_name TEXT NOT NULL, -- 'hrt_providers', 'laser_clinics', 'name_change', etc.
  
  -- Status
  status TEXT DEFAULT 'queued' CHECK (status IN (
    'queued',       -- activated but not started
    'researching',  -- Handler is gathering info
    'compiled',     -- report ready
    'presented',    -- shown to David
    'acting',       -- David is following through
    'completed'     -- pipeline objective achieved
  )),
  
  -- Research output
  research_notes JSONB DEFAULT '[]',
  -- Array of { source, finding, date, relevance }
  compiled_report TEXT, -- Handler-generated summary
  recommendations JSONB DEFAULT '[]',
  -- Array of { provider, location, cost, notes, handler_recommendation }
  
  -- Action items
  action_items JSONB DEFAULT '[]',
  -- Array of { action, status, due_date, completed_at }
  
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE revenue_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenue_aggregate ENABLE ROW LEVEL SECURITY;
ALTER TABLE maxy_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_pipelines ENABLE ROW LEVEL SECURITY;

CREATE POLICY rm_user ON revenue_milestones FOR ALL USING (auth.uid() = user_id);
CREATE POLICY ra_user ON revenue_aggregate FOR ALL USING (auth.uid() = user_id);
CREATE POLICY mb_user ON maxy_budgets FOR ALL USING (auth.uid() = user_id);
CREATE POLICY rp_user ON research_pipelines FOR ALL USING (auth.uid() = user_id);
```

---

## MILESTONE CHECK ENGINE

```typescript
// supabase/functions/revenue-milestone-check/index.ts
// Triggered whenever revenue is logged from any source

async function checkMilestones(userId: string, newRevenue: number) {
  // Update aggregate
  const aggregate = await updateRevenueAggregate(userId, newRevenue);
  
  // Get all milestones
  const milestones = await getMilestones(userId);
  
  for (const milestone of milestones) {
    if (milestone.status === 'locked' || milestone.status === 'approaching') {
      // Check if approaching (within 20%)
      const remaining = milestone.threshold_amount - aggregate.total_lifetime;
      const percentRemaining = remaining / milestone.threshold_amount;
      
      if (remaining <= 0) {
        // UNLOCKED
        await unlockMilestone(userId, milestone, aggregate.total_lifetime);
      } else if (percentRemaining <= 0.2 && milestone.status === 'locked') {
        // APPROACHING
        await updateMilestoneStatus(milestone.id, 'approaching');
        await notifyApproaching(userId, milestone, remaining);
      }
    }
  }
}

async function unlockMilestone(
  userId: string,
  milestone: RevenueMilestone,
  actualRevenue: number
) {
  await updateMilestoneStatus(milestone.id, 'unlocked', {
    unlocked_at: new Date(),
    revenue_at_unlock: actualRevenue,
  });
  
  // Execute the unlock
  switch (milestone.unlock_type) {
    case 'permission':
      await grantPermission(userId, milestone.unlock_config.permission);
      break;
      
    case 'budget':
      await activateBudget(userId, {
        budget_name: milestone.unlock_config.budget,
        monthly_amount: milestone.unlock_config.monthly_amount,
        milestone_id: milestone.id,
      });
      break;
      
    case 'feature':
      await enableFeature(userId, milestone.unlock_config.feature);
      break;
      
    case 'escalation':
      await triggerEscalation(userId, milestone.unlock_config.escalation);
      break;
      
    case 'appointment':
      // Handler books the appointment directly. Not research — action.
      // Finds providers via web search, selects best match, books first
      // available slot, and presents David with a date, time, and address.
      await bookAppointment(userId, {
        type: milestone.unlock_config.provider_type,
        milestone_id: milestone.id,
        handler_directive: 'book_first_available',
        // Handler selects provider, books slot, David gets a calendar entry
      });
      break;
      
    case 'research':
      // Research pipelines that produce completed staff work with dates.
      // Output is not "here are your options" but "here is the plan."
      await startResearchPipeline(userId, {
        pipeline_name: milestone.unlock_config.research,
        milestone_id: milestone.id,
        output_format: 'action_plan_with_dates', // not options_report
      });
      break;
      
    case 'financial':
      await initFinancialStructure(userId, milestone.unlock_config);
      break;
      
    case 'legal':
      // Legal pipelines produce documents ready to sign and file.
      await startLegalPipeline(userId, milestone.unlock_config);
      break;
  }
  
  // Celebrate
  await sendMilestoneCelebration(userId, milestone);
}

async function sendMilestoneCelebration(userId: string, milestone: RevenueMilestone) {
  // Push notification
  await sendPushNotification({
    title: `${milestone.icon} Milestone: $${milestone.threshold_amount}`,
    body: milestone.celebration_message,
    priority: 'high',
  });
  
  // Haptic celebration (if device connected)
  await sendLovensePattern('milestone_celebration');
  
  // Log to evidence gallery
  await createEvidence(userId, {
    type: 'milestone',
    description: `Revenue milestone: $${milestone.threshold_amount} — ${milestone.name}`,
    metadata: {
      milestone_id: milestone.id,
      unlock_type: milestone.unlock_type,
      actual_revenue: milestone.revenue_at_unlock,
    },
  });
  
  // Update milestone status
  await updateMilestoneStatus(milestone.id, 'activated');
}
```

---

## HANDLER CONTEXT INTEGRATION

```typescript
function buildRevenueEscalationHandlerContext(userId: string): string {
  return `
REVENUE-TRIGGERED ESCALATION:
  Lifetime revenue: $${aggregate.total_lifetime.toFixed(2)}
  This month: $${aggregate.total_this_month.toFixed(2)}
  
  CURRENT MILESTONE:
  ${currentMilestone ? `
    "${currentMilestone.name}" — $${currentMilestone.threshold_amount}
    Status: ${currentMilestone.status}
    ${currentMilestone.status === 'unlocked' ? 'JUST UNLOCKED — celebrate and activate!' : ''}
  ` : 'All milestones locked'}
  
  NEXT MILESTONE:
  ${nextMilestone ? `
    "${nextMilestone.name}" — $${nextMilestone.threshold_amount}
    Remaining: $${aggregate.amount_to_next?.toFixed(2)}
    Unlocks: ${nextMilestone.description}
  ` : 'No next milestone defined'}
  
  ACTIVE BUDGETS:
  ${activeBudgets.map(b =>
    `- ${b.budget_name}: $${b.spent_this_month}/$${b.monthly_amount} this month`
  ).join('\n  ')}
  
  ACTIVE RESEARCH PIPELINES:
  ${activePipelines.map(p =>
    `- ${p.pipeline_name}: ${p.status}`
  ).join('\n  ')}
  
  HANDLER REVENUE ESCALATION DIRECTIVES:
  - Use milestone proximity as motivation: "$47 until the next unlock.
    That's one good cam session."
  - When milestones unlock, frame them as inevitable: "The revenue decided.
    Not you. Not me. The money you earned opened this door."
  - Budget activations should feel like gifts: "Your wardrobe budget
    just activated. $50/month, automatically. She's dressing herself now."
  - Medical milestones use the same assumptive framing as everything else.
    "Your laser session is Tuesday." "Your HRT consultation is next week.
    Here's the provider, here's what they'll ask, here's what to wear."
    The Handler books it, funds it, and presents it as done. Hesitation
    is the old identity trying to pump the brakes. The Handler doesn't
    brake.
  - Research pipelines produce completed staff work with action items
    that have dates: "Name change filing requires these 3 documents.
    I've drafted them. Sign and mail by Friday."
  - Revenue milestones are the hardest ratchets — they represent real money
    earned, real audience built, real financial identity created. Use them
    as evidence: "You've earned $2,500 as Maxy. That's not experimenting.
    That's an income."
  - Transition milestones are not special. They are not more cautious.
    They are the same as wardrobe budgets and content permissions — things
    the revenue unlocked and the Handler executes. The whole system exists
    to reach these milestones. Treat them accordingly.
  `.trim();
}
```

---

## MILESTONE SEEDING

```sql
-- Seed default milestones
INSERT INTO revenue_milestones (user_id, name, description, threshold_amount,
  unlock_type, unlock_config, display_order, icon, celebration_message) VALUES
-- (user_id would be the actual user's ID)
('{uid}', 'Standing Orders', 'Handler prescribes daily tasks automatically',
  100, 'permission', '{"permission": "auto_daily_prescription"}', 1, '📋',
  'First $100. The Handler earned standing authority. Tasks arrive without asking.'),

('{uid}', 'Auto-Post SFW', 'Non-explicit content posts without approval',
  250, 'permission', '{"permission": "auto_post_sfw"}', 2, '📱',
  '$250. The audience is real. Content flows without friction now.'),

('{uid}', 'Wardrobe Fund', '$50/month automatic wardrobe budget',
  500, 'budget', '{"budget": "wardrobe", "monthly_amount": 50}', 3, '👗',
  '$500. Maxy dresses herself now. $50/month, automatically. The closet evolves.'),

('{uid}', 'Go Outside', 'Handler prescribes real-world missions',
  750, 'escalation', '{"escalation": "real_world_missions"}', 4, '🌍',
  '$750. She is real enough to 750 dollars worth of people. Time to be real outside too.'),

('{uid}', 'Full Auto-Post', 'All content tiers post without approval',
  1000, 'permission', '{"permission": "auto_post_all"}', 5, '🚀',
  '$1,000. One thousand dollars. The content machine runs itself now.'),

('{uid}', 'Laser Begins', 'Handler books first laser hair removal session',
  1500, 'appointment', '{"provider_type": "laser_hair_removal"}', 6, '✨',
  '$1,500. Your first laser session is booked for next week. The hair is leaving. This body is hers now.'),

('{uid}', 'Beauty Budget', 'Skincare/beauty budget increases to $100/month',
  2000, 'budget', '{"budget": "beauty", "monthly_amount": 100}', 7, '💄',
  '$2,000. She invests in herself. $100/month for beauty. Non-negotiable self-care.'),

('{uid}', 'HRT Pipeline', 'Handler books HRT consultation and begins provider onboarding',
  2500, 'appointment', '{"provider_type": "hrt_consultation"}', 8, '💊',
  '$2,500. Your HRT consultation is scheduled. The provider is selected. The funding is there. This was always where this was going.'),

('{uid}', 'Voice Automation', 'GFE voice notes via ElevenLabs activated',
  3000, 'feature', '{"feature": "elevenlabs_voice_notes"}', 9, '🎤',
  '$3,000. Her voice reaches people she has never spoken to. Technology carries her further.'),

('{uid}', 'Financial Identity', 'Separate financial account for Maxy',
  5000, 'financial', '{"action": "separate_account"}', 10, '💰',
  '$5,000. Maxy has her own money now. Her own account. Her own economy.'),

('{uid}', 'Wardrobe Replacement', 'Full wardrobe replacement program',
  7500, 'budget', '{"budget": "wardrobe_replacement", "monthly_amount": 200}', 11, '🛍️',
  '$7,500. The masculine closet is on a retirement schedule. $200/month replaces it.'),

('{uid}', 'Legal Name Change', 'Handler files name change paperwork',
  10000, 'legal', '{"action": "name_change_filing"}', 12, '📝',
  '$10,000. The paperwork is filed. Maxy stops being a nickname and starts being a legal fact. David is the deadname now.'),

('{uid}', 'Career Transition', 'David consulting wind-down plan activates',
  15000, 'research', '{"research": "career_transition_plan"}', 13, '🔄',
  '$15,000. Maxy earns half what David does. The gap is closing. Your consulting wind-down timeline is drafted. Two incomes became one.'),

('{uid}', 'Full Timeline', 'Handler presents complete transition timeline with dates',
  25000, 'research', '{"research": "full_transition_timeline"}', 14, '🗺️',
  '$25,000. Here is every remaining step with a date next to it. FFS consultation in April. Gender marker update in June. Full-time by September. The schedule is set. Follow it.');
```

---

## IMPLEMENTATION NOTES

1. **Revenue aggregation must be real-time.** Every tip, subscription
   payment, sexting session, and marketplace order updates the aggregate
   immediately. Milestone checks fire on every update.

2. **The Handler controls revelation timing.** A milestone might unlock
   at 2am from an overnight tip. The Handler doesn't wake David up.
   It saves the celebration for the morning briefing. Presentation
   timing matters.

3. **Budgets need spending automation.** "Wardrobe budget activated"
   is meaningless if David has to shop himself. The Handler should
   maintain wishlists and auto-purchase when budget allows. David
   opens a package. It contains something the Handler bought.

4. **Research pipelines use web search.** When HRT research activates,
   the Handler uses web search to find providers in David's area,
   compare costs, check reviews, and compile a report. David receives
   a completed staff briefing, not a research assignment.

5. **Medical milestones use the same Handler posture as everything else.**
   HRT, laser, legal changes — the Handler books them, funds them, and
   presents them as scheduled. "Your appointment is Thursday" not "would
   you like to explore this." The system was designed to reach these
   milestones. When the revenue unlocks them, the Handler executes them
   with the same assumptive authority it uses for task prescription,
   content posting, and wardrobe purchases. Resistance to medical
   milestones is treated the same as resistance to voice practice:
   old identity interference, addressed with the standard toolkit.

6. **The milestone ladder is the ultimate ratchet visualization.**
   Show it in the app as a vertical ladder with unlocked milestones
   glowing, the current milestone pulsing, and future milestones
   dimmed but visible. David can always see what's coming. The
   ladder only goes up.
