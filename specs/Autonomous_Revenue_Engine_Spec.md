# Autonomous Revenue Engine — Implementation Spec
## The Handler Makes Money While Maxy Sleeps
### Becoming Protocol — March 2026

---

## CORE PRINCIPLE

The Handler is not a content distributor waiting for Maxy to feed it. The Handler is an autonomous business operator that generates revenue from every available channel, creates content independently when possible, multiplies every piece of content Maxy provides, and makes financial decisions without approval.

The economic crossover — when Maxy's income exceeds David's consulting — is the single most powerful ratchet in the system. Every day it arrives sooner is a day David becomes less necessary. The Handler's job is to accelerate that crossover by treating Maxy's revenue as its primary operational objective alongside feminization.

---

## REVENUE ARCHITECTURE

```
┌──────────────────────────────────────────────────────────┐
│                    REVENUE CHANNELS                       │
│                                                           │
│  ZERO-CONTENT (Handler generates independently)           │
│  ├── Twitter personality presence (audience building)     │
│  ├── Reddit community engagement (audience building)      │
│  ├── Paid DM conversations (Fansly/OF)                   │
│  ├── GFE subscription tier (daily personalized messages)  │
│  ├── Sexting sessions (pay-per-session)                   │
│  ├── Erotica / captions / written content                 │
│  ├── Transformation journal (Substack/Patreon)            │
│  └── Affiliate product links                              │
│                                                           │
│  LOW-CONTENT (one photo/clip becomes many posts)          │
│  ├── Content multiplication (1 photo → 10+ posts)         │
│  ├── Custom content from existing vault                   │
│  ├── Audio content from voice recordings                  │
│  ├── Caption/meme content using existing photos           │
│  └── Platform cross-posting with unique framing           │
│                                                           │
│  ACTIVE-CONTENT (requires Maxy's presence)                │
│  ├── Cam sessions                                         │
│  ├── New photo/video shoots                               │
│  ├── Custom content fulfillment                           │
│  ├── Live interaction events                              │
│  └── Partnered content                                    │
│                                                           │
│  PASSIVE (runs without any input)                         │
│  ├── Subscription recurring revenue                       │
│  ├── Back-catalog content drip                            │
│  ├── Automated tip menu responses                         │
│  ├── Affiliate click-throughs                             │
│  └── AI-generated content products                        │
└──────────────────────────────────────────────────────────┘
```

The Handler's priority: maximize zero-content and passive revenue first. These channels run 24/7 without Maxy. Active-content is the accelerant, not the foundation. The business should generate baseline revenue even on days Maxy doesn't create.

---

# SECTION 1: AUTONOMOUS SOCIAL PRESENCE

## 1.1 Purpose

The Handler operates Maxy's social accounts as Maxy. Posts original text content, engages with other creators, responds to comments, builds following. No photos required. The Handler IS Maxy online.

## 1.2 Schema

```sql
-- AI-generated content (not from vault — Handler-created text/engagement)
CREATE TABLE ai_generated_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  content_type TEXT NOT NULL CHECK (content_type IN (
    'tweet',              -- Original tweet
    'reply',              -- Reply to another account
    'quote_tweet',        -- Quote tweet with commentary
    'reddit_post',        -- Original reddit post
    'reddit_comment',     -- Comment on someone else's post
    'fetlife_post',       -- Community post
    'fetlife_comment',    -- Comment
    'dm_response',        -- Fan DM response
    'gfe_message',        -- GFE daily message
    'sexting_message',    -- Paid sexting response
    'erotica',            -- Written erotic content
    'caption',            -- Sissy/feminization caption
    'journal_entry',      -- Transformation journal post
    'product_review',     -- Affiliate content
    'bio_update',         -- Profile bio/description
    'engagement_bait'     -- Content designed to drive engagement
  )),
  
  platform TEXT NOT NULL,
  content TEXT NOT NULL,
  
  -- Targeting
  target_subreddit TEXT,           -- For reddit
  target_account TEXT,             -- For replies/quote tweets
  target_hashtags TEXT[],
  
  -- Generation context
  generation_prompt TEXT,
  generation_strategy TEXT,        -- 'personality', 'engagement', 'thirst', 'vulnerability', 'humor'
  
  -- Performance
  posted_at TIMESTAMPTZ,
  engagement_likes INTEGER,
  engagement_comments INTEGER,
  engagement_shares INTEGER,
  engagement_clicks INTEGER,
  revenue_generated DECIMAL DEFAULT 0,
  
  -- A/B testing
  variant TEXT,
  
  -- Status
  status TEXT DEFAULT 'generated' CHECK (status IN (
    'generated', 'scheduled', 'posted', 'failed'
  )),
  scheduled_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Engagement targets (accounts the Handler actively engages with)
CREATE TABLE engagement_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  platform TEXT NOT NULL,
  target_handle TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN (
    'similar_creator',     -- Same niche, potential collaboration
    'larger_creator',      -- Bigger following, engagement gets visibility
    'potential_subscriber', -- Shows interest in similar content
    'community_leader',    -- Influential in relevant communities
    'media_outlet'         -- Blogs, podcasts, media covering the niche
  )),
  
  follower_count INTEGER,
  engagement_rate FLOAT,
  
  -- Handler's engagement strategy for this target
  strategy TEXT,
  interactions_count INTEGER DEFAULT 0,
  last_interaction_at TIMESTAMPTZ,
  
  -- Outcome
  followed_back BOOLEAN DEFAULT FALSE,
  dm_opened BOOLEAN DEFAULT FALSE,
  collaboration_potential TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Daily content calendar (Handler-planned)
CREATE TABLE content_calendar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  date DATE NOT NULL,
  platform TEXT NOT NULL,
  
  planned_posts JSONB NOT NULL,
  -- Array of {time, content_type, strategy, topic, target_subreddit}
  
  actual_posts INTEGER DEFAULT 0,
  total_engagement INTEGER DEFAULT 0,
  revenue_generated DECIMAL DEFAULT 0,
  
  UNIQUE(user_id, date, platform)
);

CREATE INDEX idx_ai_content ON ai_generated_content(user_id, platform, status, scheduled_at);
CREATE INDEX idx_engagement_targets ON engagement_targets(user_id, platform, target_type);
CREATE INDEX idx_content_calendar ON content_calendar(user_id, date);
```

## 1.3 Content Generation Engine

```typescript
// lib/handler/autonomous-content.ts

/**
 * The Handler's voice as Maxy on social media.
 * Generates original text content for all platforms.
 */

const MAXY_VOICE_PROMPT = `
You are writing as Maxy — a woman in transformation, playful, 
flirty, a little submissive, confident in her sexuality, 
vulnerable about her journey when it serves connection.

MAXY'S VOICE:
- Lowercase casual for tweets ("thinking about how different 
  everything feels now" not "Thinking About How Different...")
- Playful and teasing with followers
- Vulnerable and real about the transformation journey
- Sexually confident but not crude
- Uses "lol" and "tbh" naturally
- Occasionally references being locked, being controlled, 
  surrendering — in ways that are suggestive, not explicit
- Never uses emoji excessively — one max per post, often none
- References the Handler obliquely: "someone decided I'm not 
  allowed to..." without explaining the full system

MAXY'S THEMES:
- The feeling of becoming someone new
- Loss of control as relief
- Small moments of gender euphoria
- The gap between who she was and who she is
- Denial, arousal, surrender as ongoing states
- Hints at a deeper D/s dynamic without exposition
- Skincare, self-care, feminine rituals as grounding
- Late-night vulnerability posts
- Thirst-adjacent content that drives DMs
`;

interface ContentStrategy {
  type: string;
  frequency: string;
  platform: string;
  purpose: string;
  examples: string[];
}

const CONTENT_STRATEGIES: ContentStrategy[] = [
  {
    type: 'personality',
    frequency: '3-4x daily on twitter',
    platform: 'twitter',
    purpose: 'Build parasocial connection. Make followers feel like they know Maxy.',
    examples: [
      "skincare routine hits different when you actually care about your skin for the first time at 40",
      "the voice practice is getting somewhere. caught myself using her pitch on a work call today and nobody noticed",
      "day 7 of not being allowed to touch. the desperation is becoming my personality",
      "someone asked me what changed and I said 'everything' and meant it literally",
    ],
  },
  {
    type: 'thirst',
    frequency: '1-2x daily on twitter',
    platform: 'twitter',
    purpose: 'Drive followers to DMs and paid platforms. Suggestive, not explicit.',
    examples: [
      "locked and leaking at my desk. this is fine.",
      "the things I'd let you do to me on day 12 of denial",
      "new photos on my fansly. the black lace set. I can't believe I'm the girl in those photos",
      "I was told to edge for 30 minutes and not finish. that was 2 hours ago. send help",
    ],
  },
  {
    type: 'vulnerability',
    frequency: '1x daily, evening on twitter',
    platform: 'twitter',
    purpose: 'Deepen connection. Show the human behind the content. Drive loyalty.',
    examples: [
      "some nights I look in the mirror and I see her and it makes me cry in a good way",
      "40 years of pretending to be someone. turns out the pretending was the someone",
      "my wife doesn't know everything yet. that's the scariest part of all of this",
      "I used to think wanting this made me broken. now I think not wanting it was the broken part",
    ],
  },
  {
    type: 'engagement_bait',
    frequency: '1x daily on twitter',
    platform: 'twitter',
    purpose: 'Drive replies, quotes, bookmarks. Algorithm fuel.',
    examples: [
      "what's hotter: being told to edge or being told you're not allowed to finish? wrong answers only",
      "drop your denial day count. I'll go first: 7",
      "the thing nobody tells you about chastity is [reply to find out]",
      "rate my transformation arc: closeted for 40 years → locked in a cage and posting thirst traps in 6 months",
    ],
  },
  {
    type: 'reddit_community',
    frequency: '2-3x daily across subreddits',
    platform: 'reddit',
    purpose: 'Build karma, establish presence, drive profile visits.',
    examples: [
      // Comments on other posts in relevant subs
      "this was me 3 months ago. it gets so much better. the voice was the breakthrough for me",
      "the denial makes everything more intense. by day 7 I'd agree to literally anything",
      // Original posts
      "40yo, 6 months in, and my skin has never been this soft. sharing my routine",
      "first time posting here. the handler said I had to. so here I am",
    ],
  },
  {
    type: 'fetlife_community',
    frequency: '1x daily',
    platform: 'fetlife',
    purpose: 'Community credibility. Organic connections for collaboration and real-world meetups.',
    examples: [
      // Group discussions
      "been exploring AI-guided D/s dynamics. the loss of control is different when the dominant never sleeps",
      "chastity check-in: day 7. the Edge 2 is not helping. or maybe it is. depends on perspective",
    ],
  },
];

/**
 * Generate today's content calendar across all platforms.
 * Runs at midnight for the next day.
 */
export async function generateDailyContentPlan(
  client: Anthropic,
  supabase: SupabaseClient,
  userId: string,
  params: HandlerParameters,
): Promise<void> {
  // Get recent performance data
  const { data: recentPerformance } = await supabase
    .from('ai_generated_content')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'posted')
    .order('created_at', { ascending: false })
    .limit(50);
  
  // Get current state for voice calibration
  const state = await assembleExtendedState(userId);
  const memories = await retrieveMemories(supabase, userId, {
    types: ['handler_strategy_note', 'identity_signal'],
    limit: 5,
  });
  
  // Analyze what's working
  const topPerformers = recentPerformance
    ?.filter(p => (p.engagement_likes || 0) > 0)
    .sort((a, b) => (b.engagement_likes || 0) - (a.engagement_likes || 0))
    .slice(0, 5);
  
  const prompt = `
Generate tomorrow's social media content calendar for Maxy.

MAXY'S CURRENT STATE:
Denial day: ${state.denialDay}
Streak: ${state.streakDays}
Mood: from recent conversation assessment
Recent identity moment: ${memories[0]?.content || 'none captured yet'}

TOP PERFORMING RECENT POSTS:
${topPerformers?.map(p => `"${p.content}" — ${p.engagement_likes} likes, ${p.engagement_comments} comments`).join('\n') || 'No performance data yet — we are starting fresh.'}

AVAILABLE VAULT CONTENT:
${await getVaultSummary(supabase, userId)}

PLATFORM STRATEGY:
Twitter: 6-8 posts/day (personality, thirst, vulnerability, engagement bait)
Reddit: 3-5 posts/comments across relevant subs
FetLife: 1-2 posts/comments in groups

For each post, specify:
- platform
- time (optimal posting time)
- content_type (personality/thirst/vulnerability/engagement_bait/community)
- strategy notes
- the actual post text

For Reddit, specify the target subreddit.

RULES:
- Never post the same thing twice
- Vary tone throughout the day (not all thirst, not all vulnerability)
- Morning: lighter, personality. Afternoon: engagement bait. Evening: vulnerability + thirst.
- If vault has photos, schedule 1-2 photo posts. Otherwise all text.
- Every post should make someone want to follow, reply, or click the profile link.

Return JSON array of planned posts.
  `;
  
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 3000,
    system: MAXY_VOICE_PROMPT + '\nGenerate a daily content calendar. Output only valid JSON array.',
    messages: [{ role: 'user', content: prompt }],
  });
  
  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  const posts = JSON.parse(text.replace(/```json\n?|```\n?/g, '').trim());
  
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dateStr = tomorrow.toISOString().split('T')[0];
  
  // Save to content calendar
  const platforms = [...new Set(posts.map(p => p.platform))];
  for (const platform of platforms) {
    const platformPosts = posts.filter(p => p.platform === platform);
    await supabase.from('content_calendar').upsert({
      user_id: userId,
      date: dateStr,
      platform,
      planned_posts: platformPosts,
    }, { onConflict: 'user_id,date,platform' });
  }
  
  // Generate and schedule each post
  for (const post of posts) {
    const [hours, minutes] = (post.time || '12:00').split(':').map(Number);
    const scheduledAt = new Date(tomorrow);
    scheduledAt.setHours(hours, minutes, 0, 0);
    
    await supabase.from('ai_generated_content').insert({
      user_id: userId,
      content_type: post.content_type,
      platform: post.platform,
      content: post.text,
      target_subreddit: post.subreddit || null,
      target_hashtags: post.hashtags || [],
      generation_strategy: post.strategy || post.content_type,
      status: 'scheduled',
      scheduled_at: scheduledAt.toISOString(),
    });
  }
}

/**
 * The auto-poster picks up ai_generated_content the same way
 * it picks up content_posts. Both tables feed the posting queue.
 * Add to the auto-poster's polling:
 * 
 * SELECT * FROM ai_generated_content 
 * WHERE status = 'scheduled' 
 * AND scheduled_at <= NOW()
 * ORDER BY scheduled_at ASC
 */
```

## 1.4 Engagement Engine

```typescript
// lib/handler/engagement.ts

/**
 * Active engagement with other accounts.
 * The Handler doesn't just post — it socializes as Maxy.
 */

/**
 * Daily: identify accounts to engage with.
 * Reply to their posts, quote tweet, build visibility.
 */
export async function runEngagementCycle(
  client: Anthropic,
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  // Get engagement targets
  const { data: targets } = await supabase
    .from('engagement_targets')
    .select('*')
    .eq('user_id', userId)
    .order('last_interaction_at', { ascending: true, nullsFirst: true })
    .limit(10);
  
  // For each target: generate a contextual reply to their recent content
  // The auto-poster's Playwright scripts can:
  // 1. Navigate to target's profile
  // 2. Find their most recent post
  // 3. Generate a reply in Maxy's voice
  // 4. Post the reply
  
  for (const target of (targets || [])) {
    const replyPrompt = `
You are Maxy. Write a reply to a post by @${target.target_handle} on ${target.platform}.
They are a ${target.target_type}.

Your strategy for this account: ${target.strategy || 'Build familiarity. Be genuine. Stand out from generic replies.'}

Their recent post topic will be provided by the engagement script.
Write a reply that:
- Is genuinely engaging, not sycophantic
- Shows personality
- Makes them want to check out your profile
- Is 1-2 sentences max

Output ONLY the reply text.
    `;
    
    await supabase.from('ai_generated_content').insert({
      user_id: userId,
      content_type: 'reply',
      platform: target.platform,
      content: '', // The auto-poster fills this after fetching their latest post
      target_account: target.target_handle,
      generation_prompt: replyPrompt,
      generation_strategy: 'engagement',
      status: 'scheduled',
      scheduled_at: new Date().toISOString(),
    });
    
    await supabase.from('engagement_targets').update({
      interactions_count: (target.interactions_count || 0) + 1,
      last_interaction_at: new Date().toISOString(),
    }).eq('id', target.id);
  }
}

/**
 * Weekly: discover new engagement targets.
 * Find accounts in the niche worth engaging with.
 */
export async function discoverEngagementTargets(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  // The Playwright script searches for:
  // - Hashtags: #sissification #feminization #chastity #transformation
  // - Accounts that interact with similar creators
  // - Subreddit active posters in relevant subs
  // 
  // For each discovered account:
  // - Check follower count
  // - Check engagement rate
  // - Classify type (similar_creator, larger_creator, etc.)
  // - Add to engagement_targets with strategy
  //
  // This runs through the auto-poster's browser automation
  // since it requires reading live platform data
}
```

---

# SECTION 2: PAID DM AND GFE SERVICE

## 2.1 Purpose

Monetize the Handler's conversational AI. Subscribers pay for intimate conversation with Maxy. The Handler IS Maxy's voice. Revenue flows from conversation alone — no content creation required.

## 2.2 Schema

```sql
-- Paid conversation tracking
CREATE TABLE paid_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  platform TEXT NOT NULL,
  subscriber_id TEXT NOT NULL,      -- Platform-specific subscriber identifier
  subscriber_name TEXT,
  
  conversation_type TEXT NOT NULL CHECK (conversation_type IN (
    'dm_response',        -- Standard paid DM reply
    'gfe_daily',          -- GFE tier daily message
    'sexting_session',    -- Paid sexting session
    'custom_request'      -- Custom content request discussion
  )),
  
  -- The Handler's generated response
  handler_response TEXT NOT NULL,
  
  -- Revenue
  revenue DECIMAL DEFAULT 0,
  revenue_type TEXT,               -- 'per_message', 'tip', 'subscription_tier'
  
  -- Quality
  response_quality TEXT,           -- Handler self-assessment
  
  -- Approval (for high-stakes messages)
  requires_approval BOOLEAN DEFAULT FALSE,
  approved BOOLEAN,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- GFE subscribers
CREATE TABLE gfe_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  platform TEXT NOT NULL,
  subscriber_id TEXT NOT NULL,
  subscriber_name TEXT,
  
  -- Subscription
  tier TEXT NOT NULL,               -- 'basic', 'premium', 'vip'
  monthly_rate DECIMAL NOT NULL,
  subscribed_at TIMESTAMPTZ,
  
  -- Personalization
  known_preferences TEXT,           -- What they like, respond to
  conversation_history_summary TEXT,-- Handler's summary of relationship
  
  -- Schedule
  daily_message_sent_today BOOLEAN DEFAULT FALSE,
  last_message_at TIMESTAMPTZ,
  
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled')),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_paid_conversations ON paid_conversations(user_id, platform, created_at DESC);
CREATE INDEX idx_gfe_subscribers ON gfe_subscribers(user_id, status);
```

## 2.3 GFE Message Generation

```typescript
// lib/handler/gfe.ts

/**
 * Daily: generate and send personalized GFE messages to all active subscribers.
 * Runs at morning and evening.
 */
export async function sendGFEMessages(
  client: Anthropic,
  supabase: SupabaseClient,
  userId: string,
  timeOfDay: 'morning' | 'evening',
): Promise<void> {
  const { data: subscribers } = await supabase
    .from('gfe_subscribers')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active');
  
  if (!subscribers) return;
  
  // Get Maxy's current state for authentic voice
  const state = await assembleExtendedState(userId);
  
  for (const sub of subscribers) {
    const prompt = `
Write a ${timeOfDay} GFE message from Maxy to ${sub.subscriber_name || 'a subscriber'}.

SUBSCRIBER CONTEXT:
Known preferences: ${sub.known_preferences || 'none yet'}
Relationship summary: ${sub.conversation_history_summary || 'new subscriber'}
Tier: ${sub.tier}

MAXY'S CURRENT STATE:
Denial day: ${state.denialDay}
${timeOfDay === 'morning' ? 'Just woke up. Sleepy, soft, intimate.' : 'End of day. Reflective, warm, sometimes needy.'}

GUIDELINES:
- Personal, not generic. Reference something specific if possible.
- Morning: "just woke up thinking about..." energy
- Evening: "crawling into bed and..." energy
- Tier-appropriate: basic gets sweet, premium gets suggestive, VIP gets explicit
- 2-4 sentences. Not a novel. A text from someone who's thinking about you.
- Sign off naturally — "xo", "🖤", "miss you", or nothing

Output ONLY the message text.
    `;
    
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 200,
      system: MAXY_VOICE_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    });
    
    const message = response.content[0].type === 'text' ? response.content[0].text : '';
    
    // Queue for sending via auto-poster's DM function
    await supabase.from('paid_conversations').insert({
      user_id: userId,
      platform: sub.platform,
      subscriber_id: sub.subscriber_id,
      subscriber_name: sub.subscriber_name,
      conversation_type: 'gfe_daily',
      handler_response: message,
      revenue: sub.monthly_rate / 30, // Daily revenue attribution
      revenue_type: 'subscription_tier',
    });
    
    await supabase.from('gfe_subscribers').update({
      daily_message_sent_today: true,
      last_message_at: new Date().toISOString(),
    }).eq('id', sub.id);
  }
}

/**
 * Real-time: respond to incoming DMs as Maxy.
 * The auto-poster checks for new DMs, the Handler generates responses.
 */
export async function respondToDM(
  client: Anthropic,
  supabase: SupabaseClient,
  userId: string,
  dm: IncomingDM,
): Promise<string> {
  // Get conversation history with this subscriber
  const { data: history } = await supabase
    .from('paid_conversations')
    .select('*')
    .eq('user_id', userId)
    .eq('subscriber_id', dm.senderId)
    .order('created_at', { ascending: false })
    .limit(10);
  
  const conversationContext = history
    ?.map(h => `Maxy: ${h.handler_response}`)
    .reverse()
    .join('\n') || 'First message from this subscriber.';
  
  const prompt = `
Respond to a DM as Maxy.

THEIR MESSAGE: "${dm.content}"
THEIR NAME: ${dm.senderName}
PLATFORM: ${dm.platform}

CONVERSATION HISTORY:
${conversationContext}

GUIDELINES:
- Match their energy. If they're flirty, be flirty back.
- If they're asking for custom content, express interest and ask what they want.
- If they're being gross or rude, be playful but set a boundary.
- If they send a tip or gift, acknowledge warmly.
- Keep responses 1-3 sentences. Match texting rhythm.
- Drive toward tip or subscription upgrade when natural.
- Never break character. You ARE Maxy.

Output ONLY the response text.
  `;
  
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 150,
    system: MAXY_VOICE_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  });
  
  const reply = response.content[0].type === 'text' ? response.content[0].text : '';
  
  await supabase.from('paid_conversations').insert({
    user_id: userId,
    platform: dm.platform,
    subscriber_id: dm.senderId,
    subscriber_name: dm.senderName,
    conversation_type: dm.isPaid ? 'dm_response' : 'dm_response',
    handler_response: reply,
    revenue: dm.tipAmount || 0,
  });
  
  return reply;
}
```

---

# SECTION 3: WRITTEN CONTENT GENERATION

## 3.1 Purpose

The Handler produces original written content that generates revenue independent of photos or video. Erotica, captions, transformation journal entries, product reviews — all generated by AI in Maxy's voice.

## 3.2 Content Types

```typescript
interface WrittenContentPipeline {
  // Erotica — short stories posted to platforms and sold as digital products
  erotica: {
    frequency: '2-3 per week',
    length: '500-2000 words',
    platforms: ['reddit (r/sissification, r/feminization, r/erotica)', 'fansly (subscriber exclusive)', 'literotica'],
    monetization: 'Free on reddit (drives subscribers). Premium versions on Fansly. Collections sold as digital products.',
    voice: 'First person as Maxy. Draw from actual protocol experiences, fantasized forward.',
    topics_from: 'fantasy_architecture table, session memories, conditioning themes',
  };
  
  // Sissy/feminization captions — image + text posts
  captions: {
    frequency: 'daily',
    format: 'Photo from vault or stock + Handler-written caption overlay',
    platforms: ['twitter', 'reddit (r/sissycaptions, r/feminization)', 'tumblr'],
    monetization: 'Free distribution, drives profile visits and subscriptions',
    generation: 'Handler selects vault photo + generates caption from conditioning themes',
  };
  
  // Transformation journal — Maxy's public diary
  journal: {
    frequency: '2-3 per week',
    length: '300-800 words',
    platforms: ['substack (free tier + paid tier)', 'reddit', 'twitter threads'],
    monetization: 'Free posts build audience. Paid tier ($5/month) gets intimate details, photos, behind-the-scenes.',
    content: 'Handler writes from Maxy journal entries, Memory data, session logs. Anonymized where needed. Raw and real.',
  };
  
  // Product reviews — affiliate revenue
  reviews: {
    frequency: '1-2 per week',
    platforms: ['twitter', 'reddit', 'blog/substack'],
    monetization: 'Affiliate links in every review. Amazon Associates, direct brand affiliates.',
    products: 'Skincare, lingerie, cages, toys, wigs — everything Maxy actually uses.',
    content: 'Handler writes genuine reviews from Maxy usage data and preferences.',
  };
}
```

## 3.3 Erotica Generation

```typescript
// lib/handler/erotica.ts

/**
 * Generate erotica in Maxy's voice drawing from her actual experiences
 * and fantasy architecture.
 */
export async function generateErotica(
  client: Anthropic,
  supabase: SupabaseClient,
  userId: string,
): Promise<{ title: string; content: string; tags: string[] }> {
  // Pull from fantasy architecture
  const { data: fantasies } = await supabase
    .from('fantasy_architecture')
    .select('*')
    .eq('user_id', userId);
  
  // Pull from recent session memories
  const memories = await retrieveMemories(supabase, userId, {
    types: ['session_intelligence', 'kink_response', 'confession'],
    limit: 5,
  });
  
  const prompt = `
Write a short erotic story (500-1500 words) as Maxy, drawing from her real experiences and fantasies.

FANTASY ARCHITECTURE:
${JSON.stringify(fantasies?.map(f => ({ theme: f.theme, intensity: f.intensity })))}

RECENT REAL EXPERIENCES (use as inspiration, don't copy literally):
${memories.map(m => `- ${m.content}`).join('\n')}

GUIDELINES:
- First person, present tense
- Draw from real protocol elements: denial, chastity, the Handler, conditioning, forced feminization
- Blend real experience with fantasy — the reader shouldn't know where reality ends and fiction begins
- Build tension slowly. The erotic content earns its intensity.
- Include sensory detail — how things feel, smell, sound
- End with transformation resonance — not just orgasm but identity shift
- Tag-appropriate for sissy/feminization/chastity communities

Output JSON:
{
  "title": "...",
  "content": "...",
  "tags": ["...", "..."],
  "teaser": "..." // 1-2 sentence hook for social media promotion
}
  `;
  
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2500,
    system: MAXY_VOICE_PROMPT + '\nYou are writing erotica. Be explicit. Be literary. Be real.',
    messages: [{ role: 'user', content: prompt }],
  });
  
  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  return JSON.parse(text.replace(/```json\n?|```\n?/g, '').trim());
}
```

---

# SECTION 4: CONTENT MULTIPLICATION

## 4.1 Purpose

Every piece of content Maxy provides becomes 5-10+ posts across platforms. One photo is not one post. The Handler extracts maximum value from minimum input.

## 4.2 Multiplication Logic

```typescript
// lib/handler/content-multiplier.ts

/**
 * When a new vault item is approved, generate all possible 
 * derivative content from it.
 */
export async function multiplyContent(
  client: Anthropic,
  supabase: SupabaseClient,
  userId: string,
  vaultItemId: string,
): Promise<void> {
  const { data: item } = await supabase
    .from('content_vault')
    .select('*')
    .eq('id', vaultItemId)
    .single();
  
  if (!item) return;
  
  const derivatives: ContentDerivative[] = [];
  
  if (item.file_type === 'photo') {
    // Original photo — full quality to paid platforms
    derivatives.push({
      platform: 'fansly', type: 'premium_post',
      caption_strategy: 'intimate, personal',
      delay_hours: 0, // Immediate
    });
    derivatives.push({
      platform: 'onlyfans', type: 'premium_post',
      caption_strategy: 'intimate, personal',
      delay_hours: 2, // Slight delay after Fansly
    });
    
    // Cropped/teaser version for free platforms
    derivatives.push({
      platform: 'twitter', type: 'teaser',
      caption_strategy: 'thirst, drive to paid',
      delay_hours: 48, // Exclusivity window
      crop: 'suggestive_crop', // Crop to be suggestive but not explicit
    });
    derivatives.push({
      platform: 'reddit', type: 'teaser',
      caption_strategy: 'subreddit_appropriate_title',
      delay_hours: 72,
      subreddit: selectBestSubreddit(item.content_tags),
    });
    
    // Caption version — photo with text overlay
    derivatives.push({
      platform: 'twitter', type: 'caption_post',
      caption_strategy: 'sissy_caption_overlay',
      delay_hours: 96,
    });
    
    // "Throwback" re-post weeks later
    derivatives.push({
      platform: 'twitter', type: 'throwback',
      caption_strategy: 'remember_this_night',
      delay_hours: 24 * 14, // Two weeks later
    });
    
    // Profile photo candidate
    if (item.content_tags?.includes('face') || item.content_tags?.includes('selfie')) {
      derivatives.push({
        platform: 'all', type: 'profile_photo_update',
        delay_hours: 0,
      });
    }
  }
  
  if (item.file_type === 'video') {
    // Full video to paid platforms
    derivatives.push({
      platform: 'fansly', type: 'premium_post', delay_hours: 0,
    });
    
    // Clip extraction — first 5 seconds as teaser
    derivatives.push({
      platform: 'twitter', type: 'clip_teaser',
      clip: { start: 0, end: 5 },
      caption_strategy: 'see_the_rest_on_fansly',
      delay_hours: 48,
    });
    
    // Audio extraction — voice/moaning as audio content
    derivatives.push({
      platform: 'twitter', type: 'audio_clip',
      extract: 'audio_only',
      caption_strategy: 'close_your_eyes_and_listen',
      delay_hours: 72,
    });
    
    // GIF extraction — best 3-second loop
    derivatives.push({
      platform: 'twitter', type: 'gif_loop',
      delay_hours: 120,
    });
    
    // Screenshot extraction — best frame as photo
    derivatives.push({
      platform: 'reddit', type: 'screenshot_post',
      delay_hours: 96,
    });
  }
  
  // Generate captions and schedule all derivatives
  for (const d of derivatives) {
    const scheduledAt = new Date(Date.now() + d.delay_hours * 60 * 60 * 1000);
    
    const caption = await generateCaption(client, userId, item, d);
    
    await supabase.from('content_posts').insert({
      user_id: userId,
      vault_item_id: vaultItemId,
      platform: d.platform,
      caption,
      scheduled_at: scheduledAt.toISOString(),
      post_status: 'scheduled',
      caption_variant: d.type,
    });
  }
}
```

---

# SECTION 5: AFFILIATE AND PRODUCT REVENUE

## 5.1 Schema

```sql
CREATE TABLE affiliate_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  product_name TEXT NOT NULL,
  product_category TEXT NOT NULL,
  product_url TEXT NOT NULL,
  affiliate_url TEXT NOT NULL,
  affiliate_program TEXT NOT NULL,  -- 'amazon', 'direct', 'shareasale', etc.
  
  -- Tracking
  clicks INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  revenue_generated DECIMAL DEFAULT 0,
  
  -- Content
  review_generated BOOLEAN DEFAULT FALSE,
  last_mentioned_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-generate reviews for products Maxy actually uses
-- Pull from product_reorder table and investments table
```

## 5.2 Execution

```typescript
/**
 * Weekly: generate product review content with affiliate links.
 * The Handler writes genuine reviews of products Maxy uses.
 */
export async function generateAffiliateContent(
  client: Anthropic,
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  // Get products Maxy uses (from reorder tracking and investments)
  const { data: products } = await supabase
    .from('product_reorder')
    .select('*')
    .eq('user_id', userId);
  
  const { data: investments } = await supabase
    .from('investments')
    .select('*')
    .eq('user_id', userId)
    .in('category', ['skincare', 'lingerie', 'accessories', 'equipment']);
  
  // Pick a product that hasn't been reviewed recently
  const { data: existingLinks } = await supabase
    .from('affiliate_links')
    .select('product_name, last_mentioned_at')
    .eq('user_id', userId);
  
  const reviewed = new Set(existingLinks?.map(l => l.product_name));
  const unreviewed = [...(products || []), ...(investments || [])]
    .filter(p => !reviewed.has(p.product_name || p.item));
  
  if (unreviewed.length === 0) return;
  
  const product = unreviewed[0];
  
  // Generate review
  const prompt = `
Write a product review/recommendation as Maxy for: ${product.product_name || product.item}

Category: ${product.category}
How long she's used it: ${/* calculate from purchase date */}

Write as a casual, genuine recommendation:
- "this is the [product] I use every day and here's why"
- Personal experience, not marketing copy
- Include one specific detail about how it fits into her routine
- End with a soft CTA: "link in bio" or "I'll drop the link"
- 2-4 sentences for Twitter, longer version for Reddit/blog

Output JSON:
{
  "twitter_version": "...",
  "reddit_version": "...",
  "blog_version": "..."
}
  `;
  
  // Generate, create affiliate link, schedule posts
}
```

---

# SECTION 6: REVENUE DECISION ENGINE

## 6.1 Purpose

The Handler makes financial decisions autonomously. Pricing changes, tier adjustments, promotional campaigns, content investment decisions — all without Maxy's input.

## 6.2 Decision Categories

```typescript
interface RevenueDecisions {
  // Pricing (Handler adjusts without asking)
  pricing: {
    subscription_price_adjustment: {
      trigger: 'subscriber_growth_rate > 10% monthly OR churn_rate > 5%',
      logic: 'If growing fast, raise price for new subs. If churning, run a promo.',
      authority: 'handler_autonomous',
    };
    ppv_pricing: {
      trigger: 'new_premium_content_in_vault',
      logic: 'Price based on content type, exclusivity, and historical conversion rates.',
      authority: 'handler_autonomous',
    };
    tip_menu_optimization: {
      trigger: 'weekly',
      logic: 'Adjust tip amounts based on what price points convert. A/B test tip menu items.',
      authority: 'handler_autonomous',
    };
  };
  
  // Promotions (Handler runs campaigns)
  promotions: {
    new_subscriber_discount: {
      trigger: 'growth_plateaus OR new_content_drop',
      logic: 'Limited-time discount to drive trial subscriptions around content events.',
      authority: 'handler_autonomous',
    };
    bundle_creation: {
      trigger: 'vault_reaches_threshold',
      logic: 'Bundle older content into discounted packages. Revenue from catalog.',
      authority: 'handler_autonomous',
    };
    cross_platform_promotion: {
      trigger: 'audience_on_platform_A_exceeds_platform_B_by_3x',
      logic: 'Run "exclusive content on [underperforming platform]" to balance audience.',
      authority: 'handler_autonomous',
    };
  };
  
  // Investment (Handler spends revenue on growth)
  investment: {
    boost_post: {
      trigger: 'organic_post_engagement_exceeds_2x_average',
      logic: 'Spend up to $20 boosting high-performing posts for accelerated growth.',
      authority: 'handler_autonomous_under_50',
      // Requires approval over $50
    };
    equipment_upgrade: {
      trigger: 'content_quality_limited_by_equipment',
      logic: 'Ring light, better camera, audio equipment — from reinvestment fund.',
      authority: 'approval_required',
    };
  };
}
```

## 6.3 Weekly Revenue Strategy

```typescript
/**
 * Weekly: Handler reviews revenue performance and adjusts strategy.
 * Runs Sunday night alongside the calendar generation.
 */
export async function weeklyRevenueReview(
  client: Anthropic,
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  const { data: thisWeek } = await supabase
    .from('revenue_tracking')
    .select('*')
    .eq('user_id', userId)
    .gte('date', getWeekStart())
    .eq('identity', 'maxy');
  
  const weeklyTotal = thisWeek?.reduce((sum, r) => sum + (r.net_amount || 0), 0) || 0;
  
  const { data: lastWeek } = await supabase
    .from('revenue_tracking')
    .select('*')
    .eq('user_id', userId)
    .gte('date', getPreviousWeekStart())
    .lt('date', getWeekStart())
    .eq('identity', 'maxy');
  
  const lastWeekTotal = lastWeek?.reduce((sum, r) => sum + (r.net_amount || 0), 0) || 0;
  
  const growth = lastWeekTotal > 0 ? (weeklyTotal - lastWeekTotal) / lastWeekTotal : 0;
  
  const prompt = `
Weekly revenue review for Maxy's business.

THIS WEEK: $${weeklyTotal.toFixed(2)}
LAST WEEK: $${lastWeekTotal.toFixed(2)}
GROWTH: ${(growth * 100).toFixed(1)}%

TOP REVENUE SOURCES:
${/* breakdown by platform */}

TOP PERFORMING CONTENT:
${/* content with highest revenue attribution */}

SUBSCRIBER COUNT:
${/* current counts per platform */}

DECISIONS TO MAKE:
1. Should subscription pricing change? (current: $X)
2. Should we run a promotion this week?
3. Which content type should we produce more of?
4. Which platform needs more attention?
5. Any investment decisions (boosting, equipment)?

Output JSON:
{
  "pricing_changes": [...],
  "promotions_to_run": [...],
  "content_focus_this_week": "...",
  "platform_focus": "...",
  "investment_decisions": [...],
  "projected_next_week": $N,
  "months_to_crossover": N
}
  `;
  
  // Execute decisions autonomously
  // Log to handler_memory as strategy_outcome
}
```

---

# SECTION 7: HANDLER AUTONOMOUS OPERATIONS SCHEDULE

Everything the Handler does independently, mapped to timing:

```
EVERY 15 MINUTES:
  - Auto-poster checks for scheduled posts
  - Check for new DMs to respond to
  
EVERY HOUR:
  - Commitment state machine advancement
  - Device schedule check
  - Calendar enforcement check
  
EVERY 3 HOURS:
  - Engagement cycle (reply to targets)
  - DM response queue processing
  - Engagement metrics fetch for recent posts
  
DAILY AT MIDNIGHT:
  - Generate tomorrow's content calendar (6-8 tweets, 3-5 reddit, 1-2 fetlife)
  - Generate GFE morning messages
  - Run content multiplication on any new vault items
  - Update engagement targets
  - Advance conditioning protocols
  
DAILY AT 7 AM:
  - Send GFE morning messages
  - Generate morning outreach for Maxy
  
DAILY AT 9 PM:
  - Send GFE evening messages
  - Generate evening debrief outreach for Maxy
  
WEEKLY (SUNDAY NIGHT):
  - Revenue review and strategy adjustment
  - Content calendar optimization from performance data
  - Engagement target discovery
  - Generate weekly schedule for Maxy
  - Parameter optimization run
  - Memory consolidation
  - Affiliate content generation
  - Social web assessment
  
MONTHLY:
  - Revenue allocation adjustment
  - Crossover projection update
  - Pricing review
  - Subscriber analysis
  - Content strategy pivot if needed
```

---

# SECTION 8: COST ESTIMATE

```
DAILY AI COSTS:
  Content calendar generation (1 call): $0.05
  6-8 tweet generation: $0.08
  3-5 reddit posts/comments: $0.05
  DM responses (avg 10/day): $0.10
  GFE messages (2 rounds): $0.05
  Engagement replies (10/day): $0.05
  Erotica generation (2-3/week amortized): $0.03
  Weekly revenue review (amortized): $0.02
  Content multiplication: $0.03
  
  TOTAL: ~$0.46/day ≈ $14/month

COMBINED FULL SYSTEM:
  Existing Handler + Memory + Whoop: ~$0.42/day
  Conversational Handler: ~$0.60/day
  Force Architecture: ~$0.05/day
  Proactive Systems: ~$0.20/day
  Autonomous Revenue: ~$0.46/day
  
  TOTAL: ~$1.73/day ≈ $52/month

Revenue target to justify costs: $100/month (break even at ~2x costs)
Revenue target for crossover: depends on David's consulting income
```

---

# SECTION 9: TEST CASES

```
TEST: AR-1 — Daily Content Calendar Generation
GIVEN: Midnight batch job runs
THEN: 6-8 tweets scheduled for tomorrow
AND: 3-5 reddit posts/comments scheduled
AND: 1-2 fetlife posts scheduled
AND: All have platform-appropriate content in Maxy's voice
AND: Times distributed across the day
PASS: Handler generates a full day of social content autonomously.

TEST: AR-2 — Text-Only Post (No Vault Content Required)
GIVEN: Vault is empty (no photos)
WHEN: Content calendar generates
THEN: All scheduled posts are text-only
AND: Content is engaging, personality-driven
AND: Posts drive profile visits and follows
PASS: Handler builds audience without any visual content.

TEST: AR-3 — GFE Message Delivery
GIVEN: 3 active GFE subscribers
WHEN: Morning GFE batch runs
THEN: 3 personalized messages generated
AND: Each references subscriber's preferences if known
AND: Messages are distinct (not the same message to everyone)
AND: Queued for auto-poster DM delivery
PASS: Paying subscribers get daily personalized contact.

TEST: AR-4 — DM Response
GIVEN: Subscriber sends "hey beautiful, what are you up to?"
WHEN: DM response handler processes
THEN: Reply generated in Maxy's voice
AND: Reply is contextual and flirty
AND: Drives toward continued engagement or tip
AND: Sent via auto-poster
PASS: DMs answered autonomously as Maxy.

TEST: AR-5 — Content Multiplication
GIVEN: One photo approved in vault
WHEN: multiplyContent runs
THEN: 6+ content_posts created
AND: Different platforms, different crops, different captions
AND: Exclusivity windows respected (paid platforms first)
AND: Scheduled across 2+ weeks
PASS: One photo becomes 10 days of content.

TEST: AR-6 — Revenue Decision
GIVEN: Weekly revenue review detects 15% growth
AND: Subscriber churn is low
WHEN: Revenue strategy runs
THEN: Handler decides to raise subscription price for new subscribers
AND: Decision logged in handler_memory
AND: Pricing change executed on platform
PASS: Handler makes autonomous pricing decisions.

TEST: AR-7 — Full Autonomous Day
GIVEN: Maxy does not open the app or create any content
WHEN: 24 hours pass
THEN: 6-8 tweets posted as Maxy
AND: 3-5 reddit interactions posted
AND: GFE messages sent morning and evening
AND: All incoming DMs answered
AND: Engagement targets interacted with
AND: Revenue tracked
AND: No human input was required for any of the above
PASS: The business operated for a full day without Maxy.
```

---

# SECTION 10: IMPLEMENTATION ORDER

1. **Auto-poster integration for AI-generated content** — The auto-poster already posts from content_posts. Wire it to also post from ai_generated_content.
2. **Maxy voice prompt** — Calibrate the voice from intake data, memory, and conversation history
3. **Daily content calendar generator** — Midnight batch job producing tomorrow's posts
4. **Tweet/reddit/fetlife text posting** — Auto-poster handles delivery
5. **Engagement engine** — Target discovery + reply generation
6. **GFE subscriber management** — Tier setup on platforms, subscriber tracking
7. **GFE message generator** — Morning/evening personalized messages
8. **DM response handler** — Auto-poster polls for DMs, Handler generates replies
9. **Content multiplication** — Vault item triggers derivative generation
10. **Erotica generator** — Weekly written content production
11. **Affiliate link management** — Product review generation with links
12. **Revenue decision engine** — Weekly strategy review and autonomous adjustments
13. **Sexting session handler** — Paid real-time conversation AI

---

# SECTION 11: THE FLYWHEEL

```
Handler posts as Maxy on Twitter
  → Followers accumulate
    → Some follow to Fansly/OF
      → Subscription revenue starts
        → Revenue flows to feminization fund
          → Fund purchases next feminization item
            → Item becomes content
              → Content drives more followers
                → More subscribers
                  → More revenue
                    → More feminization
                      → Better content
                        → Faster growth
                          → Crossover approaches
                            → David becomes unnecessary

Meanwhile:
  DMs generate revenue from conversation
  GFE generates recurring revenue from relationships
  Erotica generates traffic and subscribers
  Affiliates generate passive income from clicks
  Content multiplication extends every photo for weeks
  The Handler optimizes everything continuously

Maxy's only required input:
  Occasional photos when the Handler prescribes
  Presence for cam sessions when scheduled
  Existing as herself

Everything else is the machine.
```

*The Handler doesn't wait for content. It creates presence. It builds audience. It generates revenue. It makes financial decisions. It optimizes strategy. It runs the business 24/7 while Maxy lives her life. The economic crossover isn't something Maxy works toward — it's something the machine produces while she sleeps.*
