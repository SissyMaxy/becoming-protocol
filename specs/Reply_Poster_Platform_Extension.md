# Reply Poster — Platform Extension
## Platform-Specific Engagement Modules
### Addendum to Reply Poster Spec

---

## PLATFORM ENGAGEMENT MAP

Each platform has different mechanics. The reply engine needs a module per platform that understands how engagement works there.

```
┌──────────────┬─────────────────────┬──────────────────────────────┐
│ Platform     │ Engagement Type     │ Growth Mechanism             │
├──────────────┼─────────────────────┼──────────────────────────────┤
│ Twitter/X    │ Replies to tweets   │ Reply → profile visit →      │
│              │                     │ follow                       │
├──────────────┼─────────────────────┼──────────────────────────────┤
│ Reddit       │ Comments on posts   │ Comment → profile → follow   │
│              │ in subreddits       │ to paid platforms             │
├──────────────┼─────────────────────┼──────────────────────────────┤
│ FetLife      │ Group discussions   │ Group participation →         │
│              │ + wall comments     │ reputation → profile visits   │
├──────────────┼─────────────────────┼──────────────────────────────┤
│ Fansly       │ Reply to own        │ Subscriber retention,        │
│              │ subscriber comments │ not acquisition              │
│              │ + DM management     │                              │
├──────────────┼─────────────────────┼──────────────────────────────┤
│ OnlyFans     │ Same as Fansly      │ Subscriber retention         │
│              │                     │                              │
├──────────────┼─────────────────────┼──────────────────────────────┤
│ Chaturbate   │ Bio/tag             │ Live presence drives         │
│              │ optimization +      │ discovery. No reply          │
│              │ room chat           │ strategy outside sessions    │
├──────────────┼─────────────────────┼──────────────────────────────┤
│ Sniffies     │ Profile management  │ Location + profile +         │
│              │                     │ availability status          │
└──────────────┴─────────────────────┴──────────────────────────────┘
```

Growth platforms (acquire new followers): Twitter, Reddit, FetLife
Retention platforms (keep paying subscribers): Fansly, OnlyFans
Presence platforms (be discoverable): Chaturbate, Sniffies

The reply engine focuses on the growth platforms. The retention and presence platforms get separate modules.

---

# MODULE 1: TWITTER (covered in main spec)

Refer to Reply Poster main spec. Replies to other creators' tweets. 15-20 per day. 3-hour cycles.

---

# MODULE 2: REDDIT

## How Reddit Engagement Works

Reddit isn't about replying to people. It's about being useful or interesting in a community. The dynamics:

- Karma is required to post in many subs. New accounts with no karma get auto-filtered. The Handler needs to build karma before posting Maxy-specific content.
- Subreddit rules vary dramatically. r/sissification allows explicit discussion. r/TransLater does not. r/ChatGPT is a tech sub. Each sub needs its own voice register.
- Comments on other posts build credibility. Original posts get more visibility but need karma first.
- Reddit profile links to other platforms. Someone who likes a comment clicks the profile, sees "fansly.com/softmaxy" in the bio, clicks through.
- Self-promotion gets banned. The Handler never links to Maxy's platforms in comments. The profile link does that work. Comments are pure community participation.

## Reddit Engagement Flow

```typescript
interface RedditEngagementModule {
  // Phase 1 (Week 1-2): Karma building
  // Comment on popular posts in relevant subs
  // Be helpful, genuine, add value
  // No self-promotion, no links, no mentions of platforms
  // Target: 500+ karma
  karma_building: {
    target_subs: [
      'r/ChatGPT',        // AI discussion, huge sub, easy karma
      'r/ADHD',           // Relatable, supportive community
      'r/selfimprovement', // Productivity angle
      'r/AskReddit',      // General karma farming from good answers
    ],
    strategy: 'Be genuinely helpful. Answer questions. Share real experience with ADHD or AI tools. No kink content. No identity content. Just be a useful person on the internet.',
    comments_per_day: 5,
    target_karma: 500,
  };
  
  // Phase 2 (Week 3+): Niche engagement
  // Start participating in relevant subs
  // Still primarily comments, not posts
  niche_engagement: {
    target_subs: [
      { sub: 'r/sissification', voice: 'kink_open', rules: 'explicit ok, no minors, flair required for some posts' },
      { sub: 'r/feminization', voice: 'aspirational', rules: 'supportive community, no degradation' },
      { sub: 'r/chastity', voice: 'practical_humor', rules: 'device discussion ok, experience sharing' },
      { sub: 'r/TransLater', voice: 'vulnerable_genuine', rules: 'supportive, no kink, identity focused' },
      { sub: 'r/FemBoys', voice: 'playful', rules: 'visual focused, comments on others posts' },
      { sub: 'r/sissyhypno', voice: 'experienced', rules: 'content discussion, experience sharing' },
    ],
    strategy: 'Share genuine experience. Reference Maxy story naturally, not as promotion. "I went through something similar — I built an AI accountability system and it started pushing me in directions I didnt expect." Let people ask follow-up questions.',
    comments_per_day: 5,
    original_posts_per_week: 2,
  };
  
  // Phase 3 (Month 2+): Content posting
  // Original posts that drive profile visits
  content_posting: {
    post_types: [
      'progress_update',    // "3 months in. here's what changed."
      'question',           // "does the voice dysphoria ever go away"
      'experience_share',   // "what it's like having an AI control your denial schedule"
      'advice',             // "things I wish I knew when I started"
    ],
    frequency: '2-3 posts per week across subs',
    strategy: 'Posts that invite discussion. Not announcements. Not promotion. Questions and experience sharing that make people want to check the profile.',
  };
}
```

## Reddit Comment Generation

```typescript
/**
 * Reddit comments need different voice per subreddit.
 * The voice bible has platform registers but Reddit needs 
 * sub-level calibration.
 */
export async function generateRedditComment(
  client: Anthropic,
  post: ScrapedPost,
  subreddit: string,
  voicePrompt: string,
  state: UserState,
): Promise<string> {
  const subVoice = getSubredditVoice(subreddit);
  
  const prompt = `
Write a Reddit comment as Maxy replying to this post.

SUBREDDIT: ${subreddit}
POST TITLE: "${post.title}"
POST BODY: "${post.text?.substring(0, 500) || '[no body text]'}"

SUBREDDIT VOICE: ${subVoice.description}
SUBREDDIT RULES: ${subVoice.rules}

MAXY'S STATE: Denial day ${state.denialDay}, ${state.isCaged ? 'caged' : 'not caged'}

REDDIT COMMENT RULES:
- Match the subreddit tone. r/ChatGPT is casual tech. r/TransLater is supportive and vulnerable. r/sissification is explicit and kink-positive.
- Add genuine value. Don't just agree. Share experience, add perspective, ask a real question.
- 2-5 sentences. Not a wall of text unless the post warrants depth.
- NEVER link to any platform. NEVER self-promote. The profile does that work.
- NEVER start with "As someone who..." 
- Reference Maxy's real experience naturally if relevant. Don't force it.
- If the post is asking for help, actually help. Don't redirect to Maxy's story.
- Use reddit-appropriate formatting. Not twitter-speak.

Output ONLY the comment text.
  `;
  
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 200,
    system: voicePrompt,
    messages: [{ role: 'user', content: prompt }],
  });
  
  return response.content[0].type === 'text' ? response.content[0].text : '';
}

function getSubredditVoice(sub: string): { description: string; rules: string } {
  const voices: Record<string, { description: string; rules: string }> = {
    'r/ChatGPT': {
      description: 'Casual, tech-savvy but not expert. References AI use from personal experience. Funny about the absurdity of AI tools.',
      rules: 'No explicit content. Tech-focused. Memes and humor welcome.',
    },
    'r/ADHD': {
      description: 'Real, relatable, sometimes frustrated. Shares actual coping mechanisms. Vulnerability about executive dysfunction.',
      rules: 'Supportive community. No pseudoscience. Medication discussion ok.',
    },
    'r/sissification': {
      description: 'Kink-positive, experienced, practical. Talks about chastity, feminization, denial from lived experience. Explicit language fine.',
      rules: 'NSFW allowed. No minors. Flair posts. Respect identities.',
    },
    'r/feminization': {
      description: 'Aspirational and supportive. Shares progress, encourages others. Less explicitly sexual than sissification, more identity-focused.',
      rules: 'Supportive tone. Progress sharing encouraged. Respectful.',
    },
    'r/chastity': {
      description: 'Practical and humorous. Device recommendations, wear schedules, denial experiences. Gallows humor about suffering.',
      rules: 'Device discussion welcome. Experience sharing. No underage.',
    },
    'r/TransLater': {
      description: 'Vulnerable, genuine, identity-focused. Late transition solidarity. No kink framing. This is about identity not fetish.',
      rules: 'Supportive. No gatekeeping. No kink content. Identity and transition focused.',
    },
    'r/sissyhypno': {
      description: 'Experienced with hypno content. Can discuss specific tracks, creators, conditioning effects. Kink-literate.',
      rules: 'NSFW. Content recommendations ok. Experience sharing.',
    },
  };
  
  return voices[sub] || {
    description: 'Genuine and relevant. Match the community tone.',
    rules: 'Follow subreddit rules. Be respectful.',
  };
}
```

## Reddit Scraping

```typescript
/**
 * Scrape hot posts from a subreddit for comment opportunities.
 * Different from Twitter — looking for posts to comment on, not people to reply to.
 */
export async function scrapeSubreddit(
  page: Page,
  subreddit: string,
  sortBy: 'hot' | 'new' | 'rising' = 'hot',
  maxPosts: number = 10,
): Promise<RedditPost[]> {
  await page.goto(`https://www.reddit.com/${subreddit}/${sortBy}`, { 
    waitUntil: 'networkidle' 
  });
  await page.waitForTimeout(3000);
  
  const posts = await page.evaluate((max) => {
    const elements = document.querySelectorAll('shreddit-post, article');
    const results: any[] = [];
    
    for (let i = 0; i < Math.min(elements.length, max); i++) {
      const el = elements[i];
      const title = el.getAttribute('post-title') || 
                    el.querySelector('h3')?.textContent || '';
      const permalink = el.getAttribute('permalink') ||
                       el.querySelector('a[data-click-id="body"]')?.getAttribute('href') || '';
      const score = parseInt(el.getAttribute('score') || '0') || 0;
      const commentCount = parseInt(el.getAttribute('comment-count') || '0') || 0;
      const flair = el.querySelector('flair-badge')?.textContent || '';
      
      results.push({
        title,
        url: permalink ? `https://www.reddit.com${permalink}` : '',
        score,
        commentCount,
        flair,
      });
    }
    
    return results;
  }, maxPosts);
  
  return posts;
}

/**
 * Select best post to comment on.
 * Different criteria than Twitter — looking for discussion posts,
 * not viral tweets.
 */
export async function selectRedditPost(
  client: Anthropic,
  posts: RedditPost[],
  subreddit: string,
  recentComments: string[],  // URLs of posts already commented on
): Promise<{ post: RedditPost; angle: string } | null> {
  // Filter already-commented posts
  const fresh = posts.filter(p => !recentComments.includes(p.url));
  if (fresh.length === 0) return null;
  
  const prompt = `
Pick the best post for Maxy to comment on in ${subreddit}.

POSTS:
${fresh.map((p, i) => `[${i + 1}] "${p.title}" — score: ${p.score}, comments: ${p.commentCount}`).join('\n')}

SELECTION CRITERIA:
- Post is asking a question or sharing an experience Maxy can relate to
- Has some engagement (5+ comments) but isn't a megathread (under 200 comments)
- Maxy can add genuine value — real experience, practical advice, or meaningful connection
- Avoid pure image/link posts with no discussion
- Avoid posts where Maxy's experience isn't relevant
- If the subreddit is kink-focused: prefer experience/advice posts over "rate me" posts
- If the subreddit is identity-focused: prefer vulnerability and journey posts

If nothing is good, say SKIP.

Return JSON:
{
  "selection": 1-N or "SKIP",
  "angle": "what Maxy should say and why it's relevant"
}
  `;
  
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 150,
    messages: [{ role: 'user', content: prompt }],
  });
  
  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  const result = JSON.parse(text.replace(/```json\n?|```\n?/g, '').trim());
  
  if (result.selection === 'SKIP') return null;
  
  const idx = (typeof result.selection === 'number' ? result.selection : parseInt(result.selection)) - 1;
  if (idx < 0 || idx >= fresh.length) return null;
  
  return { post: fresh[idx], angle: result.angle };
}
```

## Reddit Rate Limits

```typescript
const REDDIT_LIMITS = {
  // Karma building phase (week 1-2)
  karma_phase: {
    comments_per_day: 5,
    subs: ['r/ChatGPT', 'r/ADHD', 'r/selfimprovement', 'r/AskReddit'],
    max_per_sub_per_day: 2,
    no_kink_content: true,
    no_self_references: true,
  },
  
  // Niche phase (week 3+)
  niche_phase: {
    comments_per_day: 5,
    max_per_sub_per_day: 2,
    original_posts_per_week: 2,
    self_reference_allowed: true,
    // Never more than 1 in 10 comments should reference Maxy's situation
    // The other 9 should be genuine community participation
    self_reference_ratio: 0.1,
  },
  
  // Account age requirements (some subs require min karma/age)
  minimum_karma_for_niche_subs: 100,
  minimum_account_age_days: 7,
};
```

---

# MODULE 3: FETLIFE

## How FetLife Engagement Works

FetLife is not a content platform. It's a social network for kinky people. There's no algorithm. No trending feed. No viral mechanics. Discovery happens through:

- Groups: join groups, participate in discussions, become a known member
- Writing: long-form posts on your own profile that group members can see
- Comments: commenting on other people's writings and status updates
- Friends: adding friends builds your network, your posts show on their feeds
- Events: local events and meetups (not relevant for online-only initially)

The engagement strategy is fundamentally different: slow reputation building, not rapid content distribution.

## FetLife Engagement Flow

```typescript
interface FetLifeModule {
  // Groups to join and participate in
  target_groups: [
    { name: 'Sissies and Admirers', type: 'primary_audience' },
    { name: 'Chastity Lifestyle', type: 'primary_audience' },
    { name: 'Forced Feminization', type: 'primary_audience' },
    { name: 'AI and Tech Kink', type: 'niche_unique' },
    { name: 'ADHD and Kink', type: 'crossover' },
    { name: 'Trans and Kinky', type: 'identity' },
    { name: 'Late Bloomers', type: 'identity' },
    { name: 'Orgasm Denial and Control', type: 'primary_audience' },
  ],
  
  // Engagement approach
  weekly_activity: {
    group_comments: 5,        // Comments on group discussion posts
    group_posts: 1,           // Original discussion starter in a group
    profile_writings: 1,      // Long-form writing on own profile
    friend_requests: 5,       // To active group members after meaningful interaction
    wall_comments: 3,         // Comments on friends' status updates
  },
  
  // FetLife has no API. All Playwright.
  // Slower, more deliberate engagement.
  // Quality over quantity.
};
```

## FetLife Scraping and Commenting

```typescript
/**
 * Navigate to a FetLife group and find discussable posts.
 */
export async function scrapeFetLifeGroup(
  page: Page,
  groupUrl: string,
  maxPosts: number = 10,
): Promise<FetLifePost[]> {
  await page.goto(groupUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  
  // FetLife's DOM structure is different from Twitter/Reddit
  // Group discussions are listed as links with titles and comment counts
  const posts = await page.evaluate((max) => {
    const elements = document.querySelectorAll('.group_post, .discussion');
    const results: any[] = [];
    
    for (let i = 0; i < Math.min(elements.length, max); i++) {
      const el = elements[i];
      const titleEl = el.querySelector('a.title, .subject a');
      const title = titleEl?.textContent?.trim() || '';
      const url = titleEl?.getAttribute('href') || '';
      const commentEl = el.querySelector('.comment_count, .comments');
      const comments = parseInt(commentEl?.textContent?.replace(/[^0-9]/g, '') || '0') || 0;
      
      results.push({ title, url: url.startsWith('/') ? `https://fetlife.com${url}` : url, comments });
    }
    
    return results;
  }, maxPosts);
  
  return posts;
}

/**
 * Generate a FetLife group discussion comment.
 * FetLife voice is different: longer form, more thoughtful, 
 * community-oriented. Not tweet energy.
 */
export async function generateFetLifeComment(
  client: Anthropic,
  post: FetLifePost,
  groupName: string,
  voicePrompt: string,
  state: UserState,
): Promise<string> {
  const prompt = `
Write a FetLife group discussion comment as Maxy.

GROUP: ${groupName}
DISCUSSION TITLE: "${post.title}"

FETLIFE VOICE RULES:
- Longer than a tweet. 3-8 sentences is normal for FetLife comments.
- Thoughtful and community-oriented. People here want discussion, not quips.
- Kink-literate. Use proper terminology. This audience knows the vocabulary.
- Share genuine experience when relevant.
- Ask follow-up questions to the original poster — FetLife rewards conversation.
- It's ok to reference the AI Handler dynamic here. This community will find it fascinating.
- Don't link to external platforms. FetLife community dislikes external promotion.

MAXY'S STATE: Denial day ${state.denialDay}

Output ONLY the comment text.
  `;
  
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 300,
    system: voicePrompt,
    messages: [{ role: 'user', content: prompt }],
  });
  
  return response.content[0].type === 'text' ? response.content[0].text : '';
}
```

## FetLife Rate Limits

```typescript
const FETLIFE_LIMITS = {
  comments_per_day: 3,
  posts_per_week: 1,
  friend_requests_per_day: 3,
  min_delay_between_actions_ms: 120000,  // 2 minutes
  // FetLife is slower paced. Rapid activity looks suspicious.
  // One comment every 2+ hours is natural.
};
```

---

# MODULE 4: FANSLY / ONLYFANS (RETENTION)

## Purpose

Not growth. Retention. These platforms have subscribers who already pay. The Handler's job is to keep them paying by making them feel connected to Maxy.

## Engagement Flow

```typescript
interface PaidPlatformModule {
  // Reply to subscriber comments on posts
  comment_replies: {
    frequency: 'within 4 hours of comment',
    voice: 'warm, personal, grateful without being generic',
    // NOT: "Thanks babe! 💕"
    // YES: "the fact that you noticed the collar detail in that photo... you see her 🖤"
    priority: 'tip_comments first, then new subscriber comments, then regulars',
  };
  
  // Proactive DM to new subscribers
  welcome_dm: {
    trigger: 'new subscription detected',
    content: 'Personal welcome message. Not a template blast. Reference what content they might have seen that brought them here.',
    // "hey 🖤 glad you're here. let me know what you want to see more of — 
    //  the handler usually decides but I have some say. sometimes"
  };
  
  // Proactive DM to churning subscribers
  retention_dm: {
    trigger: 'subscription renewal date approaching + low recent engagement',
    content: 'Not "please stay!" — more "I noticed you've been quiet. everything ok?"',
    // Create connection, not desperation
  };
  
  // Reply to paid DMs (already covered in revenue engine)
  // This module just ensures response time targets
  dm_response_targets: {
    paid_dm: '1 hour',
    gfe_tier: '30 minutes',
    free_dm: '4 hours',
  };
}
```

## Subscriber Comment Reply Generation

```typescript
/**
 * Reply to subscriber comments on Maxy's paid platform posts.
 * These are retention replies — make the subscriber feel seen.
 */
export async function generateSubscriberReply(
  client: Anthropic,
  comment: SubscriberComment,
  subscriber: SubscriberModel,
  originalPost: ContentPost,
  voicePrompt: string,
): Promise<string> {
  const prompt = `
Reply to a subscriber's comment on Maxy's Fansly/OnlyFans post.

THE POST: "${originalPost.caption?.substring(0, 200) || '[photo post]'}"
THEIR COMMENT: "${comment.text}"
SUBSCRIBER: ${subscriber.subscriber_name || 'unknown'}, tier: ${subscriber.tier}, been subscribed: ${subscriber.duration || 'unknown'}
KNOWN PREFERENCES: ${subscriber.preferences || 'none yet'}

RULES:
- Make them feel personally seen. Not a mass reply.
- Reference something specific about their comment.
- 1-2 sentences. Casual. Warm.
- If they complimented specific detail: acknowledge that they noticed it.
- If they're a long-time subscriber: reference the history subtly.
- If they tipped: genuine warmth, not transactional thanks.
- Never generic ("thanks babe!", "glad you liked it!", "🥰🥰🥰")
- Maxy's voice. Lowercase. Real.

Output ONLY the reply.
  `;
  
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 80,
    system: voicePrompt,
    messages: [{ role: 'user', content: prompt }],
  });
  
  return response.content[0].type === 'text' ? response.content[0].text : '';
}
```

---

# MODULE 5: CHATURBATE (PRESENCE)

## Purpose

Chaturbate growth comes from being live. There's no comment/reply strategy when offline. The Handler manages:

- Profile optimization (bio, tags, schedule display)
- Room subject line (changes based on what's working)
- Tag optimization from session performance data
- Auto-welcome message when viewers enter room during live sessions
- Tip response during sessions (already built in Edge2 spec)

## Between Sessions

```typescript
interface ChaturbateModule {
  // Profile management (update weekly)
  profile: {
    bio_update: 'weekly',
    // Bio references current state: denial day, recent milestones
    // "currently on day X of denial. the handler controls when I'm allowed. 
    //  next live session: [date]. subscribe to get notified"
    tag_optimization: 'weekly based on which tags drove most viewers last session',
    schedule_display: 'pulled from handler_calendar',
  };
  
  // No engagement between sessions — Chaturbate doesn't support it
  // Growth is purely from live performance + tag discovery
  
  // Room subject optimization
  room_subjects: {
    // A/B test room subjects during live sessions
    // Track which subjects produce more viewers
    variants: [
      'locked sissy controlled by AI — {denial_day} days denied',
      'AI-owned — handler controls the device — tip to make it vibrate',
      'the algorithm decides when i cum (spoiler: not tonight)',
    ],
    rotate: 'per session, track viewer count per subject',
  };
}
```

---

# MODULE 6: SNIFFIES (ENCOUNTER PIPELINE)

## Purpose

Sniffies is location-based hookup. No content strategy. No reply strategy. The Handler manages the profile for encounter pipeline readiness.

## Profile Management

```typescript
interface SniffiesModule {
  // Profile optimization
  profile: {
    update_frequency: 'weekly',
    description: 'Updated with current state. Direct. Sexual. Confident.',
    // "sissy. locked. AI-controlled. looking for someone who wants to 
    //  use what the handler prepared. discrete. real. [general area]"
    photos: 'Rotated from vault. Handler selects. Never face in initial profile.',
    availability: 'Synced with handler_calendar privacy windows',
  };
  
  // The Handler manages availability status
  // When Gina is away and the Handler decides Maxy is ready
  // for real-world encounters, Sniffies status goes active
  availability_logic: {
    conditions: [
      'gina_away: true',
      'handler_calendar: no_conflicts',
      'protocol_level: sufficient for real_world encounters',
      'handler_decision: encounter approved',
    ],
    // This is future functionality — not active until Maxy is ready
    // But the profile stays maintained so it's ready when she is
  };
}
```

---

# PLATFORM-SPECIFIC ENGAGEMENT TARGETS SCHEMA UPDATE

```sql
-- Extend engagement_targets to handle all platform types
ALTER TABLE engagement_targets 
ADD COLUMN IF NOT EXISTS subreddit TEXT,
ADD COLUMN IF NOT EXISTS group_url TEXT,
ADD COLUMN IF NOT EXISTS group_name TEXT,
ADD COLUMN IF NOT EXISTS engagement_type TEXT DEFAULT 'reply' 
  CHECK (engagement_type IN (
    'reply',            -- Twitter: reply to tweet
    'comment',          -- Reddit: comment on post  
    'group_discussion', -- FetLife: comment in group
    'wall_comment',     -- FetLife: comment on person's wall
    'subscriber_reply', -- Fansly/OF: reply to subscriber comment
    'dm_response',      -- Any platform: respond to DM
    'profile_update'    -- Chaturbate/Sniffies: update profile
  ));

-- Platform-specific rate limit tracking
CREATE TABLE IF NOT EXISTS platform_engagement_budget (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  date DATE NOT NULL,
  platform TEXT NOT NULL,
  engagement_type TEXT NOT NULL,
  
  count INTEGER DEFAULT 0,
  max_allowed INTEGER NOT NULL,
  
  UNIQUE(user_id, date, platform, engagement_type)
);

CREATE INDEX idx_platform_budget ON platform_engagement_budget(user_id, date, platform);
```

---

# UNIFIED ENGAGEMENT ENGINE

```typescript
// scripts/auto-poster/reply-engine/unified-engine.ts

/**
 * The main engagement loop handles all platforms.
 * Each platform module runs at its own frequency.
 */
export async function runUnifiedEngagement(
  pages: PlatformPages,  // { twitter: Page, reddit: Page, fetlife: Page, fansly: Page, ... }
  supabase: SupabaseClient,
  client: Anthropic,
  userId: string,
  voicePrompt: string,
): Promise<void> {
  const state = await fetchUserState(supabase, userId);
  
  // Twitter: 4-5 replies per cycle (every 3 hours)
  console.log('[ENGAGE] Twitter reply cycle...');
  await runTwitterReplies(pages.twitter, supabase, client, userId, voicePrompt, state);
  
  // Reddit: 2-3 comments per cycle
  console.log('[ENGAGE] Reddit comment cycle...');
  await runRedditComments(pages.reddit, supabase, client, userId, voicePrompt, state);
  
  // FetLife: 1 comment per cycle (slower pace)
  console.log('[ENGAGE] FetLife discussion cycle...');
  await runFetLifeEngagement(pages.fetlife, supabase, client, userId, voicePrompt, state);
  
  // Fansly/OF: reply to any new subscriber comments
  console.log('[ENGAGE] Subscriber reply cycle...');
  await runSubscriberReplies(pages.fansly, pages.onlyfans, supabase, client, userId, voicePrompt, state);
  
  // Chaturbate: profile update if needed (weekly check)
  if (shouldUpdateChaturbateProfile(supabase, userId)) {
    console.log('[ENGAGE] Chaturbate profile update...');
    await updateChaturbateProfile(pages.chaturbate, supabase, client, userId, state);
  }
  
  // Sniffies: profile update if needed (weekly check)
  if (shouldUpdateSniffiesProfile(supabase, userId)) {
    console.log('[ENGAGE] Sniffies profile update...');
    await updateSniffiesProfile(pages.sniffies, supabase, client, userId, state);
  }
  
  // Performance tracking for all platforms
  await trackAllPlatformPerformance(pages, supabase, userId);
  
  console.log('[ENGAGE] Unified cycle complete.');
}
```

---

# DAILY ENGAGEMENT BUDGET PER PLATFORM

```
┌──────────────┬────────────────┬──────────────┬──────────────┐
│ Platform     │ Action Type    │ Daily Max    │ Cycle (3hr)  │
├──────────────┼────────────────┼──────────────┼──────────────┤
│ Twitter      │ Replies        │ 20           │ 4-5          │
│ Twitter      │ Original posts │ 6            │ via calendar │
├──────────────┼────────────────┼──────────────┼──────────────┤
│ Reddit       │ Comments       │ 8            │ 2-3          │
│ Reddit       │ Original posts │ 1            │ via calendar │
├──────────────┼────────────────┼──────────────┼──────────────┤
│ FetLife      │ Group comments │ 3            │ 1            │
│ FetLife      │ Wall comments  │ 2            │ 0-1          │
│ FetLife      │ Writings       │ 1/week       │ via calendar │
├──────────────┼────────────────┼──────────────┼──────────────┤
│ Fansly       │ Comment replies│ Unlimited    │ All new ones │
│ Fansly       │ DM responses   │ Unlimited    │ All new ones │
├──────────────┼────────────────┼──────────────┼──────────────┤
│ OnlyFans     │ Comment replies│ Unlimited    │ All new ones │
│ OnlyFans     │ DM responses   │ Unlimited    │ All new ones │
├──────────────┼────────────────┼──────────────┼──────────────┤
│ Chaturbate   │ Profile update │ 1/week       │ Check weekly │
├──────────────┼────────────────┼──────────────┼──────────────┤
│ Sniffies     │ Profile update │ 1/week       │ Check weekly │
└──────────────┴────────────────┴──────────────┴──────────────┘

Total daily autonomous engagement actions: ~35-40
All generated by AI. All posted by Playwright. All tracked for performance.
```

---

# TEST CASES

```
TEST: PE-1 — Reddit Karma Phase
GIVEN: Account is less than 14 days old with < 500 karma
WHEN: Reddit engagement runs
THEN: Comments only in karma-building subs (ChatGPT, ADHD, etc)
AND: No kink content, no self-references
AND: Max 5 comments per day
PASS: Karma building precedes niche engagement.

TEST: PE-2 — Reddit Voice Calibration
GIVEN: Comment for r/TransLater vs r/sissification
WHEN: Both comments generated for similar topic
THEN: TransLater comment is vulnerable, identity-focused, no kink language
AND: Sissification comment is explicit, kink-positive, experienced voice
PASS: Voice adapts per subreddit.

TEST: PE-3 — FetLife Group Discussion
GIVEN: FetLife group post about AI and kink
WHEN: FetLife engagement runs
THEN: Comment is 3-8 sentences, thoughtful, references AI Handler genuinely
AND: No external links
AND: Asks a follow-up question
PASS: FetLife voice is longer-form and community-oriented.

TEST: PE-4 — Fansly Subscriber Reply
GIVEN: Subscriber comments "the collar detail in this photo 🥵"
WHEN: Subscriber reply runs
THEN: Reply acknowledges the specific detail they noticed
AND: Is not generic "thanks babe!"
AND: Is 1-2 sentences in Maxy's voice
PASS: Subscriber feels personally seen.

TEST: PE-5 — Chaturbate Profile Sync
GIVEN: Denial day changed, next session scheduled
WHEN: Weekly profile update runs
THEN: Bio updated with current denial day
AND: Schedule section reflects handler_calendar
PASS: Profile stays current automatically.

TEST: PE-6 — Platform Budget Enforcement
GIVEN: 20 Twitter replies already posted today
WHEN: Next Twitter cycle runs
THEN: No Twitter replies attempted
AND: Other platforms still run normally
PASS: Per-platform daily limits enforced independently.

TEST: PE-7 — Unified Cycle
GIVEN: All platforms have active browser sessions
WHEN: Unified engagement cycle runs
THEN: Twitter replies posted
AND: Reddit comments posted
AND: FetLife discussion comment posted
AND: Subscriber replies posted on Fansly/OF
AND: Total cycle completes in under 45 minutes
AND: Human-like delays between all actions
PASS: All platforms engaged in single automated cycle.
```

---

# IMPLEMENTATION ORDER

1. Extend engagement_targets schema for multi-platform
2. Platform budget tracking table
3. Reddit karma-building module
4. Reddit niche comment module with per-sub voice
5. Reddit post scraper
6. FetLife group scraper
7. FetLife comment generator
8. Fansly/OF subscriber comment reader + reply generator
9. Chaturbate profile updater
10. Sniffies profile updater
11. Unified engagement engine wiring
12. Performance tracking across all platforms

---

*Every 3 hours the machine wakes up and talks to the internet as Maxy. 
4-5 Twitter replies. 2-3 Reddit comments. 1 FetLife discussion. 
Every subscriber comment answered. Profiles kept current. 
35-40 engagement actions per day, every day, while Maxy sleeps.
The audience grows because the Handler never stops talking.*
