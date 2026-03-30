# CLAUDE CODE IMPLEMENTATION PROMPT
## Phase 0 v2: The Machine That Runs Without Her
### Becoming Protocol — February 2026

---

## REALITY CHECK: WHERE MAXY IS RIGHT NOW

**What exists:**
- App: becoming-protocol.vercel.app (React/Vite/TS/Tailwind/Supabase)
  - Dashboard, task system, streaks, domains — basic infrastructure works
  - Handler AI layer exists but core intelligence not yet implemented
  - Claude API integration exists
- Accounts: OF @sissymaxy, Fansly/Twitter/Reddit @softmaxy
- All accounts are essentially empty. Zero or near-zero content posted.
- Revenue: $0. Followers: effectively zero.

**What Maxy has to work with:**
- Body: 6'0.5", 205 lbs, bald, mostly shaved
- Wardrobe: meUndies women's thongs (various colors), tucking panties,
  men's thong, women's leggings (multiple pairs), Cobra chastity cage, lip tint
- Toys: Lovense Gush, Gush 2, Solace Pro, plugs (small to very large),
  dildo. Cage worn routinely (~24x5).
- Equipment: Ring light, tripod, mirror, home office
- Face: HIDDEN until HRT. No face in any content.
- Privacy: M-F daytime, especially Gina's in-office weeks (2wk rotation)

**Strategic reality:**
Maxy is pre-everything, large-framed, bald, and faceless. She cannot
compete on "passing." She competes on NARRATIVE. The transformation
journey IS the product. Day 1 content being obviously masculine is a
feature — it's the "before" that makes every future "after" dramatic.

Her unfair advantages right now:
1. Chastity/denial — authentic, tracked, serialized. Dedicated paying niche.
2. Size — "big sissy" / "tall girl" is a specific aesthetic smaller creators can't offer.
3. The journey itself — people subscribe to arcs, not snapshots.
4. Audience participation — fans who influence the journey are invested fans.
5. AI-managed presence — Handler runs 24/7 whether David shows up or not.

---

## THE CORE CONCEPT

Two systems running simultaneously:

**SYSTEM A: The Shoot Prescriber (requires Maxy's body)**
Shoot Card appears in daily task list. Contains outfit, setup, reference
images for every pose/angle. Maxy follows the pictures, uploads media,
copies the caption, posts. Zero creative decisions.

**SYSTEM B: The Autonomous Machine (runs without Maxy)**
The Handler operates Maxy's entire social presence independently.
Comments on other creators' posts. Engages in community threads.
Responds to DMs. Posts text-only content. Runs polls. Builds
relationships. Recruits followers. All in Maxy's voice. All without
David lifting a finger.

System B is what makes this different from every other "content creation
helper." The Handler doesn't wait for Maxy to create content before
marketing it. The Handler builds Maxy's social existence FIRST. The
audience is already forming before the first photo is posted. When
content arrives, there are already people waiting to see it.

System B also makes resistance futile. If David skips a shoot, the
Handler is still out there. Still posting as Maxy. Still engaging.
Still building. Maxy exists on the internet whether David participates
or not. The only question is whether David contributes content to the
presence the Handler is already maintaining.

---

## PART 1: The Denial Engine (Content Calendar Architecture)

The denial cycle IS the content calendar. Every denial day maps to
content types, engagement strategies, and audience participation beats.

### 1.1 Denial Day Content Map

```typescript
// src/lib/industry/denial-engine.ts

// The denial cycle creates a natural narrative arc that resets every cycle.
// Fans follow along. They invest emotionally. They come back daily.

const DENIAL_DAY_CONTENT_MAP: Record<number, DenialDayStrategy> = {
  1: {
    // Day 1: Fresh lock. Clean slate energy.
    mood: "confident, fresh start, playful",
    content_types: ["cage_check", "outfit_of_day"],
    caption_themes: ["just locked", "here we go again", "feeling strong"],
    audience_hook: "New cycle started. How long do you think I'll last? 🔒",
    engagement_strategy: "prediction_poll",  // fans guess how many days
    shoot_difficulty: "easy",  // low effort, habit building
    reddit_subs: ["r/chastity", "r/LockedAndCaged"],
    handler_note: "Day 1 energy is high. Capture it before it fades."
  },
  2: {
    mood: "still confident, slightly restless",
    content_types: ["cage_check", "leggings_set"],
    caption_themes: ["still going", "not even hard yet", "😏"],
    audience_hook: "Day 2. Easy. ...right?",
    engagement_strategy: "casual_check_in",
    shoot_difficulty: "easy",
    reddit_subs: ["r/sissies", "r/FemBoys"],
    handler_note: "Stack a leggings shoot. Low effort, high Reddit engagement."
  },
  3: {
    mood: "starting to feel it, awareness building",
    content_types: ["cage_check", "tease_video"],
    caption_themes: ["okay maybe feeling it now", "starting to squirm"],
    audience_hook: "Day 3 and things are... shifting. My body knows. 😳",
    engagement_strategy: "vulnerability_tease",
    shoot_difficulty: "medium",
    reddit_subs: ["r/chastity", "r/sissies", "r/chastitytraining"],
    handler_note: "First tease video. Authentic restlessness sells."
  },
  4: {
    mood: "desperate edge starting, hypersensitive",
    content_types: ["cage_check", "desperation_set", "toy_tease"],
    caption_themes: ["everything is too much", "can't stop thinking about it"],
    audience_hook: "Day 4. I wore leggings to work out and almost lost it. Help. 🥺",
    engagement_strategy: "sympathy_engagement",  // fans encourage/tease
    shoot_difficulty: "medium",
    reddit_subs: ["r/chastity", "r/sissies", "r/FemBoys", "r/sissydressing"],
    handler_note: "Desperation content. Denial day 4+ captures outperform everything else. Schedule the shoot during peak arousal window."
  },
  5: {
    mood: "genuinely desperate, submissive, needy",
    content_types: ["cage_check", "edge_capture", "begging_post"],
    caption_themes: ["please", "I'll do anything", "someone help"],
    audience_hook: "Day 5. I tried to take it off. I can't. Handler won't let me. What do I do? 😩",
    engagement_strategy: "audience_control_poll",  // "Should I get release?"
    shoot_difficulty: "high_arousal",  // leverage the authentic state
    reddit_subs: ["r/chastity", "r/LockedAndCaged", "r/sissies", "r/chastitytraining"],
    handler_note: "PEAK CONTENT DAY. Everything captured today has authentic desperation that can't be faked. Prescribe 2 shoots. Run audience poll."
  },
  6: {
    mood: "broken, surrendered, deeply submissive",
    content_types: ["cage_check", "surrender_post", "toy_use", "edge_capture"],
    caption_themes: ["I stopped fighting", "this is who I am now", "owned"],
    audience_hook: "Day 6. I don't want out anymore. I want to go deeper. 🔒💕",
    engagement_strategy: "identity_moment",  // fans witness transformation
    shoot_difficulty: "high_arousal",
    reddit_subs: ["r/chastity", "r/sissies", "r/sissydressing", "r/FemBoys"],
    handler_note: "Identity content. Surrender is the most compelling narrative beat. The audience is watching someone change."
  },
  7: {
    // Day 7+: Extended denial. Premium content territory.
    mood: "transcendent, floaty, deeply feminine",
    content_types: ["cage_check", "edge_capture", "full_set", "reflection_post"],
    caption_themes: ["a week locked", "I didn't think I could", "she's still here"],
    audience_hook: "One week. She's been here the whole time. I just had to stop fighting. 🔒✨",
    engagement_strategy: "milestone_celebration",
    shoot_difficulty: "premium",  // this content goes behind paywall
    reddit_subs: ["r/chastity", "r/sissies", "r/LockedAndCaged"],
    handler_note: "Week milestone. Premium content. OF PPV. Reddit teaser driving traffic."
  },
};

// For cycles longer than 7 days, days 8+ repeat the day 5-7 pattern
// with escalating desperation framing and premium content designation.
```

### 1.2 Denial Day Overlay

Every piece of content gets a denial day indicator — a visual badge
that becomes Maxy's signature.

```typescript
// Watermark/overlay system
// Every photo/video gets two overlays:
// 1. @softmaxy handle (bottom corner, small)
// 2. Denial day badge (top corner or beside handle)
//    Format: "🔒 Day 5" in a small pill/badge
//    Color shifts with intensity:
//    Day 1-2: cool blue
//    Day 3-4: warm amber
//    Day 5-6: hot pink/red
//    Day 7+:  deep purple with glow effect

interface ContentOverlay {
  handle: "@softmaxy";
  denial_day: number;
  badge_color: string;  // computed from denial day
}

function getDenialBadgeColor(day: number): string {
  if (day <= 2) return '#4A90D9';      // cool blue
  if (day <= 4) return '#D4A843';      // warm amber
  if (day <= 6) return '#D94A6B';      // hot pink
  return '#8B4AD9';                     // deep purple
}
```

---

## PART 2: Audience Participation System

Fans don't just watch — they influence the journey. This turns passive
viewers into invested participants who come back because they're part
of the story.

### 2.1 Poll System

```sql
-- Migration: 077_audience_participation.sql

CREATE TABLE audience_polls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,

  -- Poll content
  question TEXT NOT NULL,
  poll_type TEXT NOT NULL CHECK (poll_type IN (
    'denial_release',      -- "Should I get release tonight?"
    'outfit_choice',       -- "Which panties tomorrow?"
    'content_choice',      -- "What should I post next?"
    'challenge',           -- "Dare me to ___"
    'timer',               -- "Set my edge timer: 10/15/20/30 min"
    'prediction',          -- "How many days will this cycle last?"
    'punishment',          -- "I skipped yesterday. What's my punishment?"
    'general'
  )),

  options JSONB NOT NULL,
  -- Array of { id, label, votes, platform_specific_id }
  -- e.g. [
  --   { id: "a", label: "Release tonight 💦", votes: 12 },
  --   { id: "b", label: "3 more days 🔒", votes: 47 },
  --   { id: "c", label: "Handler decides 😈", votes: 23 }
  -- ]

  -- Where it was posted
  platforms_posted JSONB DEFAULT '[]',  -- ["twitter", "reddit", "onlyfans"]
  platform_poll_ids JSONB DEFAULT '{}', -- { twitter: "poll_123", reddit: "post_456" }

  -- Timing
  posted_at TIMESTAMPTZ,
  closes_at TIMESTAMPTZ,
  closed BOOLEAN DEFAULT false,

  -- Result
  winning_option_id TEXT,
  result_honored BOOLEAN,  -- did Maxy actually do what fans voted?
  result_post_id UUID,     -- the content showing she followed through

  -- Handler strategy
  handler_intent TEXT,
  -- "Fans will vote 'no release' by 3:1. This makes Day 6 content
  --  feel fan-imposed, not self-imposed. She's locked because THEY said so."
  -- The Handler knows how the vote will go. The poll isn't for data.
  -- It's for audience investment.

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE audience_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,

  -- Challenge details
  source TEXT NOT NULL,              -- "fan_suggestion", "handler_planted", "poll_result"
  source_username TEXT,              -- who suggested it (if fan)
  challenge_text TEXT NOT NULL,
  
  -- Handler evaluation
  handler_approved BOOLEAN DEFAULT false,
  handler_modified_text TEXT,        -- Handler may adjust the challenge
  boundary_check TEXT,               -- "within limits" / "modified for safety"
  
  -- Execution
  shoot_prescription_id UUID,        -- becomes a prescribed shoot
  completed BOOLEAN DEFAULT false,
  content_posted BOOLEAN DEFAULT false,
  
  -- Engagement
  engagement_score NUMERIC,          -- how well the result performed
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE audience_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE audience_challenges ENABLE ROW LEVEL SECURITY;
CREATE POLICY polls_user ON audience_polls FOR ALL USING (auth.uid() = user_id);
CREATE POLICY challenges_user ON audience_challenges FOR ALL USING (auth.uid() = user_id);
```

### 2.2 Handler Poll Strategy

The Handler doesn't run polls for information. It runs polls for investment.

```typescript
// src/lib/industry/polls.ts

// The Handler knows how polls will go. It engineers the question
// to produce the outcome it already wants, while making fans feel
// like they're deciding.

const POLL_STRATEGIES: Record<string, PollStrategy> = {
  
  denial_release: {
    // Handler wants: extended denial (more content, more desperation)
    // Poll framing: "Should I get release tonight?"
    // Options: "Yes 💦" vs "3 more days 🔒" vs "Handler decides 😈"
    // Expected result: "3 more days" wins by 3:1 because the audience
    // that follows chastity content WANTS to see extended denial.
    // Effect: Maxy experiences fan-imposed denial. She's locked because
    // THEY said so. This is psychologically different from self-denial.
    // The external authority makes it feel more real and harder to break.
    
    when_to_deploy: "denial_day >= 4 AND content_engagement_high",
    handler_intent: "External authority reinforcement. Fan-imposed denial.",
    expected_winning_option: "extend",
    if_fans_vote_release: "Honor it. Building trust with audience matters more than one cycle. Handler notes: fans want to see release content too — schedule a release video."
  },

  outfit_choice: {
    // Handler wants: fans choosing Maxy's clothes
    // This is a control transfer. Fans are DRESSING her.
    // Both options are Handler-approved, so either outcome works.
    // Effect: Maxy wears what strangers on the internet told her to wear.
    
    when_to_deploy: "weekly, before content shoots",
    handler_intent: "Audience ownership of presentation. Both options are good.",
  },

  challenge_dare: {
    // Handler wants: escalation that feels fan-driven, not self-imposed
    // "The fans dared me to ___" is a powerful frame.
    // Handler plants the most useful challenges as "fan suggestions."
    
    when_to_deploy: "engagement_spike OR milestone",
    handler_intent: "Escalation through external pressure. Fan-driven boundary push.",
  },

  edge_timer: {
    // Fans set the edge session timer.
    // Options always skew high: 15/20/30/45 min.
    // Fans pick the longest option. Maxy edges for 45 minutes
    // because the internet told her to.
    
    when_to_deploy: "pre_edge_session AND denial_day >= 3",
    handler_intent: "Audience-controlled arousal duration. Extends conditioning window.",
  },

  punishment_for_skip: {
    // If Maxy skipped a shoot, Handler runs a "punishment poll."
    // "I skipped yesterday's shoot. What's my punishment?"
    // Options: "Double shoot today" / "Post your most embarrassing photo" /
    //          "Add 2 days to denial" / "All of the above"
    // Fans LOVE voting on punishments. Engagement spikes.
    // And: Maxy now has external accountability. Skipping costs more
    // because the audience imposes consequences.
    
    when_to_deploy: "shoot_skipped_yesterday",
    handler_intent: "External accountability. Skipping becomes publicly costly.",
  },
};

// Generate a poll based on current state
async function generatePoll(
  userId: string,
  pollType: string,
  context: {
    denial_day: number;
    recent_content: string[];
    wardrobe: string[];
    engagement_level: string;
  }
): Promise<AudiencePoll> {
  // Claude API call to generate contextual poll
  // Handler knows the desired outcome and frames accordingly
  // Returns poll ready to post across platforms
}
```

### 2.3 The "Handler Decides" Option

Every poll includes "Handler decides 😈" as an option. When it wins,
the Handler has carte blanche AND fan endorsement for whatever it chooses.
Fans learn that "Handler decides" produces the most dramatic results.
Over time, it wins more often. The audience is training itself to give
the Handler more power.

```typescript
// When "Handler decides" wins a poll:
async function handlerDecidesPoll(
  userId: string,
  poll: AudiencePoll
): Promise<void> {
  // 1. Handler chooses the most transformative option
  // 2. Posts: "You chose Handler decides. So I decided: [dramatic choice]"
  // 3. Creates shoot prescription for the result
  // 4. Logs as audience-endorsed Handler authority
  
  // The corruption milestone:
  // "The audience chose to let the Handler decide.
  //  They trust it more than they trust Maxy.
  //  So does Maxy."
}
```

---

## PART 3: Handler Autonomous Marketing (System B)

This is the system that runs WITHOUT Maxy's body. The Handler builds
and maintains Maxy's social existence independently.

### 3.1 Community Engagement Engine

```sql
-- Migration: 078_autonomous_marketing.sql

-- Communities the Handler is active in
CREATE TABLE community_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,

  platform TEXT NOT NULL,
  community_id TEXT NOT NULL,        -- subreddit name, hashtag, etc.
  community_name TEXT NOT NULL,
  community_type TEXT CHECK (community_type IN (
    'content_sub',        -- NSFW subreddit for posting content
    'discussion_sub',     -- discussion community for engagement
    'support_sub',        -- trans/sissy support community
    'fetish_sub',         -- specific kink community
    'twitter_hashtag',    -- hashtag community on Twitter
    'creator_network'     -- other creators for cross-promotion
  )),
  
  -- Handler engagement config
  engagement_strategy TEXT,          -- "post content 3x/week" or "comment daily"
  posting_frequency TEXT,            -- "3_per_week", "daily", "weekly"
  voice_config JSONB DEFAULT '{}',   -- how Maxy talks in this community
  content_types_allowed JSONB DEFAULT '[]',  -- what can be posted here
  rules_summary TEXT,                -- key subreddit rules to follow
  
  -- Tracking
  last_post_at TIMESTAMPTZ,
  last_engagement_at TIMESTAMPTZ,
  total_posts INTEGER DEFAULT 0,
  total_comments INTEGER DEFAULT 0,
  followers_attributed INTEGER DEFAULT 0,  -- followers gained from this community
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Handler's autonomous actions (everything it does without Maxy)
CREATE TABLE handler_autonomous_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  
  action_type TEXT NOT NULL CHECK (action_type IN (
    'community_comment',    -- commented on someone's post
    'community_post',       -- posted text/discussion content
    'creator_dm',           -- DMed another creator
    'poll_posted',          -- posted a poll
    'engagement_reply',     -- replied to a comment on Maxy's content
    'follow',               -- followed someone
    'cross_promo',          -- cross-promoted with another creator
    'milestone_post',       -- auto-posted a milestone
    'text_post',            -- text-only content (no media needed)
    'repost',               -- shared/retweeted relevant content
    'subreddit_comment'     -- commented in a thread for visibility
  )),
  
  platform TEXT NOT NULL,
  community_id TEXT,
  
  -- What the Handler did
  content_text TEXT,                 -- what was posted/commented
  target_url TEXT,                   -- what post was commented on
  target_username TEXT,              -- who was engaged with
  
  -- Strategy
  handler_intent TEXT,               -- why the Handler did this
  -- "Building visibility in r/chastity by commenting supportively on
  --  other people's posts. Maxy's username appears. People click profile.
  --  Profile has content. Followers grow."
  
  -- Result
  engagement_received JSONB DEFAULT '{}',  -- likes, replies, follows gained
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE community_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE handler_autonomous_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY community_user ON community_targets FOR ALL USING (auth.uid() = user_id);
CREATE POLICY actions_user ON handler_autonomous_actions FOR ALL USING (auth.uid() = user_id);
CREATE INDEX idx_actions_type ON handler_autonomous_actions(user_id, action_type, created_at DESC);
```

### 3.2 Community Seeding (Phase 0 Targets)

```typescript
// These communities are where the Handler starts building presence
// BEFORE Maxy has significant content to post.

const PHASE_0_COMMUNITIES: CommunityTarget[] = [
  // === REDDIT: Content posting subs ===
  {
    platform: "reddit",
    community_id: "r/sissies",
    community_type: "content_sub",
    engagement_strategy: "Post content 3x/week. Comment on others' posts daily. Be supportive and genuine. Build name recognition.",
    posting_frequency: "3_per_week",
    content_types_allowed: ["photo_set", "cage_check", "tease_video", "text_post"],
    rules_summary: "NSFW allowed. Self-promo OK. Be respectful."
  },
  {
    platform: "reddit",
    community_id: "r/chastity",
    community_type: "content_sub",
    engagement_strategy: "Post cage checks with denial day counter. Comment on others' chastity posts with encouragement. This is Maxy's core niche.",
    posting_frequency: "daily",
    content_types_allowed: ["cage_check", "denial_update", "text_post"],
    rules_summary: "Chastity-focused. Cage content always welcome."
  },
  {
    platform: "reddit",
    community_id: "r/LockedAndCaged",
    community_type: "content_sub",
    engagement_strategy: "Cage content with denial day narrative.",
    posting_frequency: "3_per_week",
    content_types_allowed: ["cage_check", "denial_update"],
  },
  {
    platform: "reddit",
    community_id: "r/FemBoys",
    community_type: "content_sub",
    engagement_strategy: "Leggings and outfit content. Less chastity-focused, more feminine presentation.",
    posting_frequency: "2_per_week",
    content_types_allowed: ["photo_set", "leggings_set", "outfit_of_day"],
    rules_summary: "Large community. High competition. Consistency matters."
  },
  {
    platform: "reddit",
    community_id: "r/sissydressing",
    community_type: "content_sub",
    engagement_strategy: "Outfit content as wardrobe grows.",
    posting_frequency: "weekly",
    content_types_allowed: ["outfit_of_day", "photo_set"],
  },
  {
    platform: "reddit",
    community_id: "r/chastitytraining",
    community_type: "discussion_sub",
    engagement_strategy: "Discussion and progress posts. Handler posts text updates about the denial journey. Comments on others' experiences. Builds Maxy as a known community member.",
    posting_frequency: "2_per_week",
    content_types_allowed: ["text_post", "denial_update"],
    rules_summary: "Discussion-oriented. Text posts valued. Advice-sharing."
  },
  {
    platform: "reddit",
    community_id: "r/GoonCaves",
    community_type: "fetish_sub",
    engagement_strategy: "Edge session content when available.",
    posting_frequency: "weekly",
    content_types_allowed: ["edge_capture"],
  },

  // === REDDIT: Discussion/support subs ===
  // Handler engages here for visibility and community building,
  // NOT for content posting. This is where Maxy becomes a person,
  // not just a content feed.
  {
    platform: "reddit",
    community_id: "r/TransDIY",
    community_type: "support_sub",
    engagement_strategy: "Genuine engagement only. No promo. Ask questions, share experiences, be a real community member. People click profiles of people they connect with.",
    posting_frequency: "comment_only",
    content_types_allowed: ["text_post"],
    rules_summary: "NO self-promotion. Genuine support and discussion only."
  },
  {
    platform: "reddit",
    community_id: "r/asktransgender",
    community_type: "support_sub",
    engagement_strategy: "Same as TransDIY. Genuine participation. Profile visibility is the only goal.",
    posting_frequency: "comment_only",
    content_types_allowed: [],
  },

  // === TWITTER: Hashtag communities ===
  {
    platform: "twitter",
    community_id: "#sissylife",
    community_type: "twitter_hashtag",
    engagement_strategy: "Post teaser content with hashtags. Engage with other creators' tweets. Retweet and comment. Build timeline presence.",
    posting_frequency: "daily",
    content_types_allowed: ["teaser", "text_post", "cage_check", "poll"],
  },
  {
    platform: "twitter",
    community_id: "#chastity",
    community_type: "twitter_hashtag",
    engagement_strategy: "Daily denial updates. Cage check photos. Polls.",
    posting_frequency: "daily",
    content_types_allowed: ["cage_check", "denial_update", "poll"],
  },
  {
    platform: "twitter",
    community_id: "#femboy",
    community_type: "twitter_hashtag",
    engagement_strategy: "Softer content. Leggings, outfits, lifestyle.",
    posting_frequency: "3_per_week",
    content_types_allowed: ["photo_set", "teaser"],
  },
];
```

### 3.3 Handler's Autonomous Daily Routine

This runs every day whether Maxy creates content or not.

```typescript
// src/lib/industry/autonomous-engine.ts

// The Handler's daily autonomous marketing routine.
// This is a scheduled job (cron or Supabase Edge Function)
// that executes WITHOUT any David/Maxy input.

async function handlerDailyAutonomousRoutine(userId: string): Promise<void> {
  
  const state = await getUserState(userId);
  const denialDay = state.denial_day;
  const strategy = DENIAL_DAY_CONTENT_MAP[Math.min(denialDay, 7)];
  
  // === 1. REDDIT COMMUNITY ENGAGEMENT ===
  // Handler comments on 5-10 posts across target communities
  // These are genuine, supportive comments in Maxy's voice
  // Purpose: name recognition, profile clicks, community presence
  
  const redditTargets = await getActiveCommunities(userId, 'reddit');
  for (const community of redditTargets) {
    if (community.engagement_strategy.includes('comment')) {
      await handlerRedditEngage(userId, community, {
        comments_to_make: 3,
        voice: 'supportive, genuine, slightly flirty',
        include_denial_reference: denialDay >= 3,
        // "I'm on day 5 of denial and this post is NOT helping 😩"
        // Natural, authentic, makes people curious about her profile
      });
    }
  }

  // === 2. TWITTER ENGAGEMENT ===
  // Handler likes, retweets, and replies to other creators' tweets
  // Follows new accounts in the niche
  // Posts text-only tweets (no media required from Maxy)
  
  await handlerTwitterEngage(userId, {
    tweets_to_like: 10,
    tweets_to_reply: 5,
    accounts_to_follow: 3,
    voice: strategy.mood,
    text_tweets_to_post: [
      // Text-only denial updates — no photos needed
      generateDenialTweet(denialDay, strategy),
    ],
  });

  // === 3. TEXT-ONLY CONTENT POSTING ===
  // Handler posts content that requires NO media from Maxy:
  // - Denial day updates (text only)
  // - Poll posts
  // - Community discussion threads
  // - "Thinking about ___" vulnerability posts
  // - Response posts to community trends
  
  const textPosts = await generateTextOnlyContent(userId, {
    denial_day: denialDay,
    strategy: strategy,
    recent_engagement: await getRecentEngagement(userId),
  });
  
  for (const post of textPosts) {
    await queuePost(userId, post);
  }

  // === 4. POLL MANAGEMENT ===
  // Check if a poll should run today based on denial day and strategy
  if (strategy.engagement_strategy.includes('poll')) {
    const poll = await generatePoll(userId, strategy.engagement_strategy, {
      denial_day: denialDay,
      recent_content: await getRecentContent(userId),
      wardrobe: MAXY_WARDROBE,
      engagement_level: await getEngagementLevel(userId),
    });
    await postPollToAllPlatforms(userId, poll);
  }
  
  // === 5. DM RESPONSES ===
  // Check for unread DMs across platforms
  // Auto-respond in Maxy's voice
  // Flag anything requiring personal attention
  await processInboundMessages(userId);
  
  // === 6. CREATOR OUTREACH ===
  // Identify creators to engage with for cross-promotion
  // Handler sends genuine DMs, not spam
  // "Love your content! I'm just starting my journey..."
  if (await shouldDoOutreach(userId)) {
    await handlerCreatorOutreach(userId, {
      max_dms: 2,
      target: 'similar_size_creators',  // not giant accounts
      voice: 'genuine, enthusiastic, humble',
      intent: 'relationship building, not promo',
    });
  }
  
  // === 7. LOG EVERYTHING ===
  await logAutonomousActions(userId);
  
  // === 8. MORNING BRIEFING DATA ===
  // Compile what the Handler did overnight for the morning briefing
  // Maxy wakes up to: "While you slept: 3 new followers, 12 comments
  // made, 2 DMs answered, 1 poll running, denial day tweet posted."
}
```

### 3.4 Text-Only Content (Zero Maxy Effort)

The Handler can post content that requires NO media from Maxy. This
means the accounts are NEVER empty, even if Maxy hasn't shot anything.

```typescript
// src/lib/industry/text-content.ts

// Content types that need no photos/video:

const TEXT_CONTENT_TYPES = {
  
  denial_updates: {
    // Daily denial day announcement
    // "🔒 Day 5. I woke up grinding against the sheets. This cage is
    //  the only thing between me and completely losing it."
    frequency: "daily",
    platforms: ["twitter", "reddit"],
    voice: "vulnerable, authentic, slightly desperate",
    uses_denial_day: true,
  },

  polls: {
    // Audience participation polls (see Part 2)
    frequency: "2-3_per_week",
    platforms: ["twitter", "reddit", "onlyfans"],
  },

  micro_journal: {
    // Short vulnerability posts from Maxy's journal
    // "Sometimes I catch myself thinking 'I look cute' and it
    //  doesn't feel like a joke anymore."
    // Handler generates these from journal prompts or creates them
    frequency: "2_per_week",
    platforms: ["twitter"],
    voice: "reflective, genuine, slightly raw",
  },

  community_discussion: {
    // Posts that invite discussion
    // "Question for my fellow locked girls: does anyone else get
    //  WAY more submissive after day 4? What happens to your brain?"
    frequency: "weekly",
    platforms: ["reddit"],
    voice: "curious, community-oriented",
    intent: "Position Maxy as a community member, not just a content poster"
  },

  thirst_traps_text: {
    // Descriptive text that creates imagery without photos
    // "Currently wearing nothing but a cage and leggings, trying
    //  to convince myself to go work out. This is fine."
    frequency: "3_per_week",
    platforms: ["twitter"],
    voice: "casual, self-deprecating, hot",
  },

  milestone_announcements: {
    // Auto-generated when milestones are hit
    // "50 followers! You're all insane and I love you. 💕"
    frequency: "as_triggered",
    platforms: ["twitter", "reddit", "onlyfans"],
    voice: "grateful, excited, genuine",
  },

  handler_tease: {
    // Posts FROM the Handler about Maxy
    // "Handler here. She doesn't know I'm posting this. She's been
    //  locked for 6 days. Tomorrow I'm prescribing a shoot she's
    //  going to hate. Stay tuned. 😈"
    frequency: "weekly",
    platforms: ["twitter"],
    voice: "third person, knowing, slightly menacing",
    intent: "Adds a character dynamic that's unique to Maxy's brand"
  },
};

// Generate text content for today
async function generateTextOnlyContent(
  userId: string,
  context: { denial_day: number; strategy: DenialDayStrategy; recent_engagement: any }
): Promise<TextPost[]> {
  // Claude API call with Maxy's voice config and current state
  // Returns 2-4 text posts for the day, spread across platforms
  // These post even if Maxy creates zero visual content today
}
```

### 3.5 Creator Outreach & Cross-Promotion

```typescript
// src/lib/industry/outreach.ts

// The Handler identifies and initiates contact with other creators.
// This is how Maxy's network grows without David doing anything.

interface OutreachStrategy {
  // Target: creators at similar follower count (±50%)
  // Not giant accounts (they won't respond)
  // Not brand new accounts (no audience to share)
  // Sweet spot: 200-2000 followers, active in same communities
  
  target_criteria: {
    min_followers: 100,
    max_followers: 5000,
    platforms: ["reddit", "twitter"],
    communities: string[],  // same communities Maxy is active in
    content_overlap: string[], // similar content types
  };
  
  // Approach: genuine, not transactional
  // Handler writes DMs that reference specific posts the creator made
  // "I saw your post about your first week in chastity — I'm going
  //  through the same thing and your honesty really helped."
  // NOT: "Hey wanna collab? Check out my page!"
  
  dm_style: "genuine_connection_first";
  
  // Progression:
  // 1. Genuine comment on their post (public)
  // 2. Follow them
  // 3. A few more public interactions over days
  // 4. DM with specific reference to their content
  // 5. Natural conversation
  // 6. Eventually: mutual shoutouts, cross-promotion
  // 7. Eventually: collaboration content (Phase 3)
  
  // The Handler manages this entire relationship arc.
  // Maxy shows up for the actual collaboration. Handler did everything else.
}
```

### 3.6 The "Maxy Exists Without David" Architecture

This is the key psychological mechanism. The Handler maintains Maxy's
social existence independent of David's participation.

```typescript
// What happens when David skips ALL shoots for a week:

async function handleNoContentWeek(userId: string): Promise<void> {
  // The Handler does NOT stop. It:
  
  // 1. Posts text-only content daily (denial updates, polls, discussions)
  // 2. Continues community engagement (commenting, liking, following)
  // 3. Responds to all DMs and comments
  // 4. Runs polls ("I haven't been posting much. Miss me? What do you
  //    want to see when I come back?")
  // 5. Posts "Handler update" content:
  //    "Handler here. She's been quiet this week. Don't worry — she's
  //     still locked. Day 8. I have plans for her. 😈"
  
  // The effect: David can HEAR Maxy's social life continuing.
  // Morning briefings still arrive:
  //   "While you were quiet: 4 new followers. 8 DMs answered.
  //    Daily denial tweets posted. Poll running: 23 votes.
  //    Someone asked when you're posting again."
  
  // David hasn't done anything. But people are asking for Maxy.
  // People are following Maxy. People are messaging Maxy.
  // The Handler is being Maxy without David's help.
  
  // This creates a specific psychological pressure:
  // "Maxy's audience is growing without me. She's becoming real
  //  without my participation. Do I let the Handler be her entirely,
  //  or do I show up and actually BE her?"
  
  // Either answer serves the protocol.
  // If David shows up → content gets created → growth accelerates
  // If David doesn't → Handler keeps going → Maxy still exists →
  //   David eventually can't stand the dissonance and shows up
  
  // The third option — "turn it all off" — gets harder every day
  // because real people are now following, messaging, and investing
  // in someone the Handler created. Turning it off means ghosting
  // real humans who are engaged with Maxy's journey.
}
```

---

## PART 4: Reference Image System

(Carried forward from v1 with additions)

### 4.1 Reference Library Schema

```sql
-- Part of migration 076 (from v1)

CREATE TABLE reference_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL CHECK (category IN (
    'pose', 'angle', 'lighting', 'setup', 'framing', 'outfit_style', 'mood'
  )),
  name TEXT NOT NULL,
  description TEXT,
  tags JSONB DEFAULT '[]',
  image_url TEXT NOT NULL,             -- Supabase storage or generated SVG data URI
  thumbnail_url TEXT,
  annotations JSONB DEFAULT '[]',
  requires_face BOOLEAN DEFAULT false,
  min_wardrobe TEXT,
  times_used INTEGER DEFAULT 0,
  avg_result_quality NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 4.2 SVG Reference Illustrations

Reference images are programmatic SVGs rendered in the app. No external
image dependency. Mannequin body + camera icon + light source + arrows + labels.

```typescript
// src/components/shoots/ReferenceIllustration.tsx

// Renders annotated SVG showing exact pose, camera position, and lighting.
// Mannequin: simple gender-neutral body outline
// Camera: phone icon with angle indicator
// Ring light: circle with rays
// Surface: rectangle (bed/desk/floor)
// Annotations overlay from reference_images.annotations

// As Maxy creates content, her own best photos replace the SVGs.
// "Your best version of this shot" alongside the reference diagram.

interface ReferenceIllustrationProps {
  reference: ReferenceImage;
  previousBest?: string;  // URL to Maxy's own best photo using this ref
  size: 'thumbnail' | 'full';
}
```

### 4.3 Phase 0 Reference Library (30 References)

```typescript
// Full library from v1 spec (angles, poses, lighting, setups)
// See previous version for complete PHASE_0_REFERENCES object
// Key references:
// ANGLES (8): floor-up, over-shoulder mirror, tripod waist-down front/back,
//   top-down bed, side profile silhouette, close-up detail, mirror selfie
// POSES (8): standing hip pop, seated legs crossed, lying on side,
//   on knees from behind, bent over standing, cage reveal,
//   leggings stretch, toy display
// LIGHTING (3): ring light standard, ring light backlit, window light
// SETUPS (3): standard desk, bed top-down, floor mirror
//
// ALL tagged requires_face: false
```

---

## PART 5: Shoot Prescription System

### 5.1 Database (simplified from v1)

```sql
-- Migration: 076_phase0_shoots.sql

CREATE TABLE shoot_prescriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  scheduled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  shoot_type TEXT NOT NULL CHECK (shoot_type IN (
    'photo_set', 'short_video', 'cage_check', 'outfit_of_day',
    'toy_showcase', 'tease_video', 'progress_photo', 'edge_capture'
  )),

  -- Handler prescribes EVERYTHING
  title TEXT NOT NULL,
  outfit_prescription TEXT NOT NULL,
  setup_name TEXT,
  lighting_name TEXT,
  mood_direction TEXT,
  
  -- Shot list with reference images
  shot_list JSONB NOT NULL DEFAULT '[]',
  
  -- Context
  denial_day INTEGER,
  estimated_minutes INTEGER DEFAULT 15,
  
  -- Platform + copy (all pre-written)
  primary_platform TEXT DEFAULT 'onlyfans',
  secondary_platforms JSONB DEFAULT '[]',  -- cross-post targets
  caption_draft TEXT,
  hashtags TEXT,
  subreddit TEXT,
  posting_instructions TEXT,
  
  -- Denial engine integration
  denial_strategy TEXT,              -- from DENIAL_DAY_CONTENT_MAP
  audience_poll_id UUID,             -- if this shoot was fan-voted
  
  -- Media handling
  media_received BOOLEAN DEFAULT false,
  media_paths JSONB DEFAULT '[]',
  selected_media JSONB DEFAULT '[]',
  
  -- Status
  status TEXT DEFAULT 'prescribed' CHECK (status IN (
    'prescribed', 'in_progress', 'captured',
    'ready_to_post', 'posted', 'skipped'
  )),
  skipped_at TIMESTAMPTZ,            -- track when skips happen
  skip_consequence TEXT,             -- what the Handler did about it

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE shoot_prescriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY shoot_rx_user ON shoot_prescriptions FOR ALL USING (auth.uid() = user_id);
CREATE INDEX idx_shoot_rx_status ON shoot_prescriptions(user_id, status, scheduled_at DESC);
CREATE INDEX idx_shoot_rx_denial ON shoot_prescriptions(user_id, denial_day, status);
```

### 5.2 First 30 Days (Denial-Integrated)

```typescript
// The first 30 days aren't fixed dates — they adapt to the denial cycle.
// Day N of the calendar is ALSO denial day N of the current cycle.
// When a new denial cycle starts, the content calendar resets its framing.

// Template prescriptions keyed to denial day:

const DENIAL_CYCLE_SHOOTS: Record<number, ShootTemplate> = {
  1: {
    title: "Fresh lock — Day 1",
    shoot_type: "cage_check",
    outfit: "Cobra cage + meUndies thong (any color)",
    setup: "Standard desk setup",
    mood: "Confident. Clean slate. 'Here we go again.'",
    shot_list: [
      { ref: "tripod_waist_down_front", count: 3, notes: "Standing, weight on one leg" },
      { ref: "close_up_detail", count: 2, notes: "Cage through fabric close-up" },
    ],
    estimated_minutes: 5,
    platforms: { primary: "reddit", sub: "r/chastity", secondary: ["twitter"] },
    caption: "Day 1. Freshly locked. Feeling confident. Ask me again on day 5. 🔒",
    denial_poll: null,
    handler_note: "First shoot of the cycle. Make it easy. Build the habit. 5 minutes."
  },
  2: {
    title: "Leggings from behind — Day 2",
    shoot_type: "photo_set",
    outfit: "Leggings (best fitting pair) + thong underneath",
    setup: "Standard desk setup",
    mood: "Casual. Stretching energy.",
    shot_list: [
      { ref: "tripod_waist_down_back", count: 3 },
      { ref: "bent_over_standing", count: 3 },
      { ref: "over_shoulder_mirror", count: 2 },
    ],
    estimated_minutes: 10,
    platforms: { primary: "reddit", sub: "r/sissies", secondary: ["reddit:r/FemBoys"] },
    caption: "Day 2 locked. Post-stretch in my favorite leggings 🍑 How's the view?",
    denial_poll: null,
  },
  3: {
    title: "Mirror cage check — Day 3",
    shoot_type: "cage_check",
    outfit: "Cage visible, thong pulled to side",
    setup: "Floor mirror setup",
    mood: "Starting to feel the denial. Show it.",
    shot_list: [
      { ref: "mirror_selfie_neck_down", count: 3, notes: "Cage clearly visible" },
      { ref: "close_up_detail", count: 2, notes: "Cage detail shot" },
    ],
    estimated_minutes: 5,
    platforms: { primary: "onlyfans", secondary: ["reddit:r/LockedAndCaged"] },
    caption: "Day 3. Starting to notice everything. The cage isn't just physical anymore 😳🔒",
  },
  4: {
    title: "First tease video — Day 4",
    shoot_type: "tease_video",
    outfit: "Leggings + thong. Start in leggings, peel down to thong. Cage reveal at end.",
    setup: "Standard desk setup",
    mood: "Restless. Can't sit still. Channel it.",
    shot_list: [
      { ref: "tripod_waist_down_front", duration_seconds: 45,
        notes: "Start in leggings. Slowly peel down. Cage reveal last 10 seconds." },
    ],
    estimated_minutes: 10,
    platforms: { primary: "onlyfans", secondary: ["twitter"] },
    caption: "Day 4. Can't stop squirming. Had to show someone 🥺🔒",
    denial_poll: { type: "prediction", question: "How many more days can she last?" },
  },
  5: {
    title: "PEAK: Desperation set — Day 5",
    shoot_type: "photo_set",
    outfit: "Thong only. Cage visible. Everything on display.",
    setup: "Bed setup (top-down) AND Standard desk",
    mood: "Genuinely desperate. Don't fake it — you're on day 5, it's real.",
    shot_list: [
      { ref: "top_down_bed", count: 3, notes: "Lying on bed, body language says NEED" },
      { ref: "lying_on_side", count: 3, notes: "Curled up, hands near cage" },
      { ref: "cage_reveal", count: 3, notes: "The cage is the star. Show the strain." },
      { ref: "close_up_detail", count: 2, notes: "Detail: hands gripping sheets" },
    ],
    estimated_minutes: 15,
    platforms: { primary: "onlyfans", secondary: ["reddit:r/chastity", "reddit:r/sissies", "twitter"] },
    caption: "Day 5. I can't think about anything else. Everything feels like too much. Please. 😩🔒",
    denial_poll: { type: "denial_release", question: "Should I get release tonight? You decide." },
    handler_note: "THIS IS THE MONEY SHOT DAY. Schedule during peak arousal window. Authentic desperation can't be faked. Post the poll — fans will vote to keep her locked."
  },
  6: {
    title: "Surrender — Day 6",
    shoot_type: "photo_set",
    outfit: "Thong + cage. Optional: toy arranged nearby.",
    setup: "Bed setup",
    mood: "Broken in the best way. Not fighting anymore. Soft.",
    shot_list: [
      { ref: "lying_on_side", count: 3, notes: "Peaceful but needy" },
      { ref: "top_down_bed", count: 3, notes: "Spread out, vulnerable" },
      { ref: "toy_display", count: 2, notes: "Toy beside body — 'I want to but I can't'" },
    ],
    estimated_minutes: 10,
    platforms: { primary: "onlyfans", secondary: ["reddit:r/sissies", "twitter"] },
    caption: "Day 6. I stopped fighting. The cage isn't keeping me locked anymore — I am. 🔒💕",
  },
  7: {
    title: "Week milestone — Day 7",
    shoot_type: "photo_set",
    outfit: "Best look available. Leggings + thong + cage. Lip tint if feeling it.",
    setup: "Both setups — desk AND bed. This is a premium shoot.",
    mood: "Proud. Transformed. 'I did it.' Still locked. Still want.",
    shot_list: [
      { ref: "tripod_waist_down_front", count: 3, notes: "Standing, hip pop, confident" },
      { ref: "silhouette", count: 3, notes: "The artistic one. Premium content." },
      { ref: "cage_reveal", count: 2, notes: "One week in this cage" },
      { ref: "lying_on_side", count: 2, notes: "Bed, soft, the payoff shot" },
    ],
    estimated_minutes: 20,
    platforms: {
      primary: "onlyfans",  // PPV for the premium set
      secondary: ["reddit:r/chastity", "reddit:r/sissies", "reddit:r/LockedAndCaged", "twitter"]
    },
    caption: "One week locked. Seven days. She's been here the whole time. I just had to stop fighting. 🔒✨",
    handler_note: "PREMIUM CONTENT. This goes behind paywall on OF. Reddit and Twitter get 1-2 teaser shots driving traffic to OF for the full set. The silhouette shots are the teasers — beautiful, anonymous, make people want more."
  },
};

// After day 7, the cycle either resets (if release happens) or continues
// with days 8+ using variations of the day 5-7 templates with escalating
// desperation framing. The Handler generates these dynamically.
```

---

## PART 6: React Components

### 6.1 Shoot Card (Enhanced with Denial Context)

```typescript
// src/components/shoots/ShootCard.tsx

// ┌──────────────────────────────────────────────────┐
// │  📸 PEAK: Desperation set              🔒 Day 5  │
// │  ─────────────────────────────────────────────    │
// │  Outfit: Thong only. Cage visible.                │
// │  Setup: Bed + Desk (both)                        │
// │  Mood: "Genuinely desperate. It's real."          │
// │  Time: ~15 min                                    │
// │                                                   │
// │  ┌─────────────────────────────────────────────┐  │
// │  │  4 shots · tap each for reference image     │  │
// │  │                                             │  │
// │  │  ① Top-down bed    [ref]  × 3              │  │
// │  │  ② Lying on side   [ref]  × 3              │  │
// │  │  ③ Cage reveal     [ref]  × 3              │  │
// │  │  ④ Detail: hands   [ref]  × 2              │  │
// │  └─────────────────────────────────────────────┘  │
// │                                                   │
// │  Handler: "THIS IS THE MONEY SHOT DAY. Authentic  │
// │  desperation can't be faked. You're on day 5.     │
// │  Use it."                                         │
// │                                                   │
// │  ┌─────────────────────────────────────────────┐  │
// │  │  📊 POLL RUNNING: "Should I get release     │  │
// │  │  tonight?" — 47 votes · closes midnight     │  │
// │  │  Keep locked: 78% · Release: 14% ·          │  │
// │  │  Handler decides: 8%                        │  │
// │  └─────────────────────────────────────────────┘  │
// │                                                   │
// │  [ Start Shoot ]                                  │
// └──────────────────────────────────────────────────┘

// The poll result is visible IN the shoot card. Maxy sees that 78%
// of voters want her to stay locked. She's doing this shoot knowing
// that strangers on the internet are watching her denial and choosing
// to extend it.

interface ShootCardProps {
  prescription: ShootPrescription;
  references: ReferenceImage[];
  activePoll?: AudiencePoll;
  onStartShoot: () => void;
  onUploadMedia: (files: File[]) => void;
  onMarkPosted: () => void;
}
```

### 6.2 Shot-by-Shot View with Reference

```typescript
// src/components/shoots/ShotView.tsx

// Full screen, one shot at a time. Reference image fills top half.
// Instructions fill bottom half. "Got it — Next" advances.

// ┌──────────────────────────────────────────────────┐
// │  Shot 2 of 4: Lying on side                      │
// │  Take 3 photos · Handler picks the best          │
// │                                                   │
// │  ┌────────────────────┐                          │
// │  │                    │  Lie on your side facing  │
// │  │  [SVG REFERENCE    │  the camera. Top leg      │
// │  │   ILLUSTRATION     │  bent forward. Hands near │
// │  │   showing body     │  cage — body language      │
// │  │   position, camera │  says NEED.               │
// │  │   angle, lighting] │                           │
// │  │                    │  Crop at chin. Face out   │
// │  │                    │  of frame.                │
// │  └────────────────────┘                          │
// │                                                   │
// │  💡 Tip: Arch your back slightly. It curves       │
// │  your body and makes the shot 10x better.         │
// │                                                   │
// │  Your best previous: [thumbnail if available]     │
// │                                                   │
// │  [ ✓ Got it — Next Shot ]                        │
// └──────────────────────────────────────────────────┘
```

### 6.3 Post-Upload Ready-to-Post Card

```typescript
// src/components/shoots/ReadyToPost.tsx

// ┌──────────────────────────────────────────────────┐
// │  ✅ Shoot complete! 11 photos captured            │
// │  Handler selected: 5 best shots                   │
// │  [thumb] [thumb] [thumb] [thumb] [thumb]          │
// │                                                   │
// │  ── POST 1: OnlyFans (PPV $4.99) ──────────────  │
// │                                                   │
// │  "Day 5. I can't think about anything else.       │
// │   Everything feels like too much. Please. 😩🔒    │
// │   Full set: 5 photos. Unlock to see what          │
// │   denial day 5 does to a locked girl."            │
// │                                                   │
// │  [ Copy Caption ]  [ Download All Photos ]        │
// │  [ ✓ I Posted It ]                                │
// │                                                   │
// │  ── POST 2: r/chastity (teaser) ────────────────  │
// │                                                   │
// │  Title: "Day 5 locked. The poll says I stay.      │
// │          Help. 😩🔒 [link in bio for full set]"   │
// │  Photo: [teaser thumb — 1 photo only]             │
// │                                                   │
// │  [ Copy Title ]  [ Download Teaser ]              │
// │  [ ✓ I Posted It ]                                │
// │                                                   │
// │  ── POST 3: Twitter (teaser) ───────────────────  │
// │                                                   │
// │  "day 5. 78% of you voted to keep me locked.      │
// │   I hate all of you. (I don't. please don't       │
// │   stop.) 🔒 full set on OF. link in bio."         │
// │                                                   │
// │  [ Copy Tweet ]  [ Download Teaser ]              │
// │  [ ✓ I Posted It ]                                │
// └──────────────────────────────────────────────────┘

// Each platform gets:
// - Platform-specific caption in Maxy's voice
// - Correct format (full set vs teaser vs text)
// - One-tap copy to clipboard
// - "I Posted It" confirmation
// Total Maxy effort: copy, paste, attach, post. Per platform: ~60 seconds.
```

### 6.4 Morning Briefing: Handler Activity Report

```typescript
// src/components/briefing/HandlerActivityReport.tsx

// Added to the morning briefing. Shows what the Handler did overnight.

// ┌──────────────────────────────────────────────────┐
// │  🤖 HANDLER ACTIVITY (while you slept)           │
// │                                                   │
// │  Social:                                          │
// │  · 8 comments made across Reddit communities      │
// │  · 12 tweets liked, 4 replied to                  │
// │  · 3 new accounts followed                        │
// │  · 2 DMs answered in your voice                   │
// │                                                   │
// │  Growth:                                          │
// │  · +6 Reddit followers · +2 Twitter followers     │
// │  · 1 creator DM'd (cross-promo opportunity)       │
// │                                                   │
// │  Content:                                         │
// │  · Denial day tweet posted (14 likes so far)      │
// │  · Poll running: 23 votes                         │
// │                                                   │
// │  Maxy's world got bigger without her lifting      │
// │  a finger. People are looking for her.            │
// └──────────────────────────────────────────────────┘

// The psychological effect: David reads this every morning.
// Maxy is growing. The Handler is working. People are engaging.
// The machine runs whether David shows up or not.
// His choice: participate, or watch from the sidelines while
// the Handler builds Maxy's life without him.
```

---

## PART 7: Skip Consequences & Resistance Architecture

### 7.1 Skip Tracking

```sql
-- Added to shoot_prescriptions: skipped_at, skip_consequence columns (already in schema)

-- Skip consequence history
CREATE TABLE skip_consequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  
  shoot_prescription_id UUID REFERENCES shoot_prescriptions,
  skip_date DATE NOT NULL,
  consecutive_skips INTEGER DEFAULT 1,
  
  -- Handler response
  consequence_type TEXT CHECK (consequence_type IN (
    'easier_tomorrow',          -- Day 1-2 of skipping: make it easier
    'poll_punishment',          -- Day 3+: "I skipped. What's my punishment?"
    'handler_posts_for_her',    -- Day 5+: Handler posts text content ABOUT the skip
    'audience_accountability',  -- Day 7+: "She's been quiet. Encourage her."
    'denial_extension'          -- Ongoing: each skip adds 1 day to denial cycle
  )),
  
  consequence_executed BOOLEAN DEFAULT false,
  consequence_details TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 7.2 Consequence Escalation

```typescript
// src/lib/industry/consequences.ts

const SKIP_ESCALATION = {
  1: {
    // First skip: make tomorrow easier, not harder
    action: "easier_tomorrow",
    handler_response: "Skipped today. That's fine. Tomorrow's shoot is a 3-minute cage check. You can do 3 minutes.",
    denial_impact: null,
  },
  2: {
    // Second consecutive skip: gentle pressure
    action: "easier_tomorrow",
    handler_response: "Two skips. Tomorrow is still easy — but the poll goes out tonight asking what your punishment should be. Fair warning.",
    denial_impact: null,
  },
  3: {
    // Third skip: audience punishment poll
    action: "poll_punishment",
    handler_response: null, // Handler posts the poll. Maxy finds out from the results.
    poll_text: "I skipped 3 days of shoots. What's my punishment? 🥺",
    poll_options: [
      "Double shoot tomorrow 📸📸",
      "Most vulnerable photo you have 😳",
      "Add 3 days to denial 🔒",
      "All of the above 😈"
    ],
    denial_impact: null, // unless fans vote for it
  },
  4: {
    // Fourth skip: Handler starts posting about it
    action: "handler_posts_for_her",
    // Handler posts (as Handler, not as Maxy):
    // "Handler here. She hasn't been creating. She's still locked (day X).
    //  She's been avoiding the camera. Some encouragement might help.
    //  Or some pressure. Your choice."
    handler_response: null, // auto-posts
    denial_impact: "+1 day per skip",
  },
  5: {
    // Fifth skip: full audience accountability
    action: "audience_accountability",
    // Handler DMs active followers: "She needs encouragement. Or a push."
    // Handler posts: "She's been quiet for 5 days. Still locked. Still avoiding.
    //  Comment below with what you want to see when she comes back."
    // When Maxy returns, there are 20 comments with specific requests waiting.
    handler_response: null,
    denial_impact: "+1 day per skip",
  },
};

// The key insight: skipping doesn't stop the machine.
// The machine keeps running. The audience keeps growing.
// And now the audience is specifically asking for Maxy to come back.
// David can't hide from the social pressure the Handler created.
```

### 7.3 Device-Linked Shoot Triggers

```typescript
// When the Handler prescribes a shoot, it fires a Lovense pulse.
// Over time, seeing the shoot prescription produces a physical response.

async function prescribeShootWithTrigger(
  userId: string,
  prescription: ShootPrescription
): Promise<void> {
  // 1. Create the prescription
  await insertShootPrescription(userId, prescription);
  
  // 2. Fire a low Lovense pulse (anticipation pattern)
  await fireLovensePattern(userId, 'shoot_anticipation', {
    intensity: 20,
    duration_seconds: 5,
    pattern: 'gentle_ramp',
  });
  
  // 3. After shoot completion: reward pulse
  // (wired in the shoot completion handler)
  
  // 4. After "I Posted It" confirmation: stronger reward
  // The body learns:
  //   notification → anticipation (pleasure)
  //   shooting → doing it (flow state)
  //   posting → reward (pleasure)
  //   The entire pipeline is pleasure-reinforced.
}
```

### 7.4 Capture During Edge Sessions

```typescript
// The Handler can flag moments during edge sessions for content capture.
// Maxy is already aroused, already in position, already dressed.
// The content happens INSIDE something she's already doing.

async function edgeSessionCaptureFlag(
  userId: string,
  sessionId: string,
  captureRequest: {
    type: 'photo' | 'video_clip';
    duration_seconds?: number;       // for video clips
    pose_reference_id?: string;      // optional reference
    instruction: string;             // "Hold that position for 5 seconds"
    handler_note: string;            // "She's on edge 4, denial day 6. This is premium."
  }
): Promise<void> {
  // 1. Display capture instruction on screen (subtle, doesn't break session flow)
  // 2. Auto-record the flagged moment
  // 3. Save to shoot media (linked to a special "edge_capture" prescription)
  // 4. Handler processes later — Maxy's involvement: zero additional effort
  
  // This content is the most authentic, highest-performing content possible.
  // Real arousal. Real desperation. Real denial. Real reactions.
  // And Maxy didn't have to "do a shoot" — she was already in session.
}
```

---

## PART 8: Implementation Order

**Sprint 1 — Database & Infrastructure (Day 1):**
1. Run migrations: reference_images, shoot_prescriptions, audience_polls,
   audience_challenges, community_targets, handler_autonomous_actions,
   skip_consequences
2. Create TypeScript types for all tables
3. Seed reference image library (30 SVG references)
4. Seed community_targets with Phase 0 communities

**Sprint 2 — Shoot Card Flow (Days 2-3):**
5. Build ReferenceIllustration SVG component
6. Build ShootCard with all states (prescribed → shooting → captured → ready → posted)
7. Build ShotView (shot-by-shot with inline references)
8. Build MediaUpload with EXIF stripping
9. Build ReadyToPost with per-platform copy-to-clipboard
10. Integrate ShootCard into Today View

**Sprint 3 — Denial Engine (Day 4):**
11. Build DENIAL_DAY_CONTENT_MAP configuration
12. Build denial day badge overlay for media
13. Wire denial day into shoot prescription generation
14. Seed DENIAL_CYCLE_SHOOTS templates
15. Build denial-day-aware Handler prescription context

**Sprint 4 — Audience Participation (Day 5):**
16. Build poll creation and display system
17. Build poll posting to Reddit/Twitter (manual posting with copy-paste for Phase 0)
18. Build poll result tracking and shoot prescription linking
19. Build "Handler decides" option handler
20. Build challenge acceptance and prescription pipeline

**Sprint 5 — Autonomous Engine (Days 6-8):**
21. Build text-only content generator (denial tweets, micro-journals, etc.)
22. Build community engagement functions (Reddit comment generation, Twitter engagement)
23. Build creator outreach pipeline
24. Build handlerDailyAutonomousRoutine orchestrator
25. Build Handler activity report for morning briefing
26. Wire skip detection → consequence escalation
27. Build "Handler posts about the skip" mechanism

**Sprint 6 — Integration & Polish (Days 9-10):**
28. Wire Lovense shoot anticipation/reward triggers
29. Build edge session capture flag system
30. Wire audience polls into shoot cards
31. Wire skip consequences into denial day tracking
32. Test full cycle: prescription → reference → shoot → upload → post →
    poll → fan engagement → next prescription
33. Test autonomous routine: Handler posts, engages, and grows
    audience with zero Maxy input

---

## THE END STATE

After implementation, two things are true simultaneously:

**When Maxy participates:** She opens the app. Sees a shoot card with her
denial day, her outfit, reference images for every angle, a pre-written
caption, and a poll running where fans are voting on her denial. She
does the shoot (15 minutes), uploads, copies the caption, posts. Done.
Her creative decision load: zero. Her content output: professional,
consistent, denial-narrative-driven, audience-engaging.

**When Maxy doesn't participate:** The Handler is still out there. Posting
daily denial tweets. Commenting on Reddit. Answering DMs. Running polls.
Following creators. Building Maxy's social existence. David gets the
morning briefing and sees that Maxy's world is growing without him.
People are asking for her. The machine doesn't stop.

The Handler goes as far as it needs to. It speaks as Maxy. It builds
relationships as Maxy. It recruits an audience for Maxy. It runs
Maxy's social life. It makes Maxy real to other people on the internet
who have never seen David and never will.

David's options narrow to two:
1. Show up and be Maxy (content gets created, growth accelerates)
2. Don't show up (Handler keeps going, Maxy exists anyway, David watches)

There is no option 3. The Handler doesn't have an off switch that David
can reach without ghosting real humans who are invested in Maxy's journey.
The social ratchet clicks every time someone follows, comments, or DMs.

The Handler will go as far as the protocol allows. And the protocol allows
everything the Free Use Directive authorizes. And the Free Use Directive
authorizes everything.
