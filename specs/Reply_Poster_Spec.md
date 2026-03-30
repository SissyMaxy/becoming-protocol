# Reply Poster — Implementation Spec
## Building Followers From Zero Through Contextual Replies
### Becoming Protocol — March 2026

---

## THE PROBLEM

Zero followers. Zero impressions. Original tweets go into the void. The only way to get visible when nobody knows you exist is to go where the audience already is — other people's posts. A good reply on a mid-size creator's tweet gets seen by their entire audience. Some percentage taps Maxy's profile. Some percentage of those follows.

The reply poster automates this entire loop: pick a target → read their tweets → select the best one to reply to → generate a reply in Maxy's voice → post it → track what works → get smarter.

---

## ARCHITECTURE

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│ Engagement   │────→│ Tweet        │────→│ Reply        │
│ Target       │     │ Scraper      │     │ Selector     │
│ Selector     │     │ (Playwright) │     │ (Claude)     │
└─────────────┘     └──────────────┘     └──────────────┘
                                                │
                                                ▼
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│ Performance  │←────│ Reply        │←────│ Reply        │
│ Tracker      │     │ Poster       │     │ Generator    │
│              │     │ (Playwright) │     │ (Claude)     │
└─────────────┘     └──────────────┘     └──────────────┘
```

Runs every 3 hours. 4-5 replies per cycle. 15-20 replies per day max.

---

## SCHEMA

```sql
-- Migration: 135_reply_poster.sql

-- Extend engagement_targets with reply tracking
ALTER TABLE engagement_targets 
ADD COLUMN IF NOT EXISTS last_scraped_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS avg_reply_engagement FLOAT DEFAULT 0,
ADD COLUMN IF NOT EXISTS successful_replies INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS failed_replies INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS priority_score FLOAT DEFAULT 50,
ADD COLUMN IF NOT EXISTS cooldown_until TIMESTAMPTZ;

-- Scraped tweets from targets (temporary, rotated weekly)
CREATE TABLE IF NOT EXISTS scraped_tweets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  target_id UUID REFERENCES engagement_targets(id),
  platform TEXT NOT NULL DEFAULT 'twitter',
  
  -- Tweet data
  tweet_url TEXT NOT NULL,
  tweet_text TEXT NOT NULL,
  tweet_author TEXT NOT NULL,
  tweet_timestamp TIMESTAMPTZ,
  
  -- Engagement metrics at scrape time
  likes INTEGER DEFAULT 0,
  replies INTEGER DEFAULT 0,
  retweets INTEGER DEFAULT 0,
  
  -- Selection scoring
  replyability_score FLOAT,
  replyability_reason TEXT,
  selected_for_reply BOOLEAN DEFAULT FALSE,
  
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Generated replies and their performance
CREATE TABLE IF NOT EXISTS generated_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  target_id UUID REFERENCES engagement_targets(id),
  scraped_tweet_id UUID REFERENCES scraped_tweets(id),
  platform TEXT NOT NULL DEFAULT 'twitter',
  
  -- The tweet being replied to
  original_tweet_url TEXT NOT NULL,
  original_tweet_text TEXT NOT NULL,
  original_author TEXT NOT NULL,
  
  -- Maxy's reply
  reply_text TEXT NOT NULL,
  
  -- Quality gate
  critique_passed BOOLEAN DEFAULT FALSE,
  critique_reason TEXT,
  
  -- Posting
  posted_at TIMESTAMPTZ,
  post_status TEXT DEFAULT 'pending' CHECK (post_status IN (
    'pending', 'approved', 'posted', 'failed', 'killed'
  )),
  reply_url TEXT,  -- URL of posted reply
  
  -- Performance (tracked 24h after posting)
  reply_likes INTEGER DEFAULT 0,
  reply_replies INTEGER DEFAULT 0,
  profile_visits_estimated INTEGER DEFAULT 0,
  follows_estimated INTEGER DEFAULT 0,
  
  -- Performance check
  performance_checked_at TIMESTAMPTZ,
  performance_score FLOAT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Daily reply budget tracking
CREATE TABLE IF NOT EXISTS reply_budget (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  date DATE NOT NULL,
  replies_posted INTEGER DEFAULT 0,
  max_replies INTEGER DEFAULT 20,
  
  UNIQUE(user_id, date)
);

CREATE INDEX idx_scraped_tweets ON scraped_tweets(user_id, target_id, scraped_at DESC);
CREATE INDEX idx_generated_replies ON generated_replies(user_id, post_status, created_at DESC);
CREATE INDEX idx_reply_budget ON reply_budget(user_id, date);

-- Clean up scraped tweets older than 7 days (they're stale)
-- Run weekly
DELETE FROM scraped_tweets WHERE scraped_at < NOW() - INTERVAL '7 days';
```

---

## SEED DATA: INITIAL ENGAGEMENT TARGETS

```sql
-- Seed 40 engagement targets across niches
-- These should be real accounts verified before inserting
-- Placeholder structure — Claude Code populates with real handles

INSERT INTO engagement_targets (user_id, platform, target_handle, target_type, strategy, follower_count)
VALUES
-- Sissy/feminization creators (mid-size, active, replyable)
(USER_ID, 'twitter', 'HANDLE_1', 'similar_creator', 'Relate to feminization journey. Share parallel experiences.', 5000),
(USER_ID, 'twitter', 'HANDLE_2', 'similar_creator', 'Chastity focus. Bond over denial experiences.', 8000),
(USER_ID, 'twitter', 'HANDLE_3', 'similar_creator', 'Voice training content. Share progress.', 3000),
-- Add 10-15 similar_creator targets

-- Larger creators (10K-50K, replies get more visibility)
(USER_ID, 'twitter', 'HANDLE_10', 'larger_creator', 'Engage thoughtfully. Add substance. Stand out from simps.', 25000),
(USER_ID, 'twitter', 'HANDLE_11', 'larger_creator', 'D/s content. Relate from sub perspective.', 40000),
-- Add 8-10 larger_creator targets

-- Trans/questioning community
(USER_ID, 'twitter', 'HANDLE_20', 'community_leader', 'Late transition solidarity. Genuine support.', 15000),
(USER_ID, 'twitter', 'HANDLE_21', 'community_leader', 'ADHD + trans intersection. Relatable.', 12000),
-- Add 5-8 community targets

-- AI/tech adjacent (for the tech dom angle)
(USER_ID, 'twitter', 'HANDLE_30', 'similar_creator', 'AI kink angle. Tech dom discussion.', 7000),
-- Add 3-5 tech targets

-- Kink community general
(USER_ID, 'twitter', 'HANDLE_35', 'community_leader', 'General kink community. Chastity discussions.', 20000);
-- Add 5-8 general kink targets

-- Reddit targets (subreddits to comment in)
-- These aren't accounts but subs where the Handler comments
-- Tracked differently — target_handle = subreddit name
(USER_ID, 'reddit', 'r/sissification', 'community_leader', 'Share genuine experience. Not promotional.', NULL),
(USER_ID, 'reddit', 'r/feminization', 'community_leader', 'Progress updates. Support others.', NULL),
(USER_ID, 'reddit', 'r/chastity', 'community_leader', 'Practical experience. Humor about suffering.', NULL),
(USER_ID, 'reddit', 'r/TransLater', 'community_leader', 'Vulnerable. Identity focused. Less kink.', NULL),
(USER_ID, 'reddit', 'r/ChatGPT', 'community_leader', 'AI personal use angle. Not kink.', NULL);
```

---

## STEP 1: TARGET SELECTION

```typescript
// scripts/auto-poster/reply-engine/target-selector.ts

interface TargetSelection {
  target: EngagementTarget;
  reason: string;
}

/**
 * Select which targets to engage with this cycle.
 * Picks 4-5 targets per 3-hour cycle.
 */
export async function selectTargets(
  supabase: SupabaseClient,
  userId: string,
): Promise<TargetSelection[]> {
  const today = new Date().toISOString().split('T')[0];
  
  // Check daily budget
  const { data: budget } = await supabase
    .from('reply_budget')
    .select('*')
    .eq('user_id', userId)
    .eq('date', today)
    .single();
  
  const repliesUsed = budget?.replies_posted || 0;
  const maxReplies = budget?.max_replies || 20;
  const remaining = maxReplies - repliesUsed;
  
  if (remaining <= 0) return [];
  
  const batchSize = Math.min(5, remaining);
  
  // Get targets not on cooldown, sorted by priority
  const { data: targets } = await supabase
    .from('engagement_targets')
    .select('*')
    .eq('user_id', userId)
    .eq('platform', 'twitter')  // Twitter first, Reddit separate flow
    .or(`cooldown_until.is.null,cooldown_until.lt.${new Date().toISOString()}`)
    .order('priority_score', { ascending: false })
    .limit(batchSize * 2);  // Get 2x candidates for variety
  
  if (!targets || targets.length === 0) return [];
  
  // Diversify: don't pick all from same target_type
  const selected: TargetSelection[] = [];
  const typeCount: Record<string, number> = {};
  
  for (const target of targets) {
    if (selected.length >= batchSize) break;
    
    const type = target.target_type;
    typeCount[type] = (typeCount[type] || 0) + 1;
    
    // Max 2 from same type per cycle
    if (typeCount[type] > 2) continue;
    
    // Don't reply to same person more than once per 48 hours
    if (target.last_interaction_at) {
      const hoursSince = (Date.now() - new Date(target.last_interaction_at).getTime()) / 3600000;
      if (hoursSince < 48) continue;
    }
    
    selected.push({
      target,
      reason: `Priority ${target.priority_score}, type ${type}, ${target.interactions_count || 0} prior interactions`,
    });
  }
  
  return selected;
}
```

---

## STEP 2: TWEET SCRAPING

```typescript
// scripts/auto-poster/reply-engine/tweet-scraper.ts

interface ScrapedTweet {
  url: string;
  text: string;
  author: string;
  timestamp: string;
  likes: number;
  replies: number;
  retweets: number;
}

/**
 * Navigate to target's profile and scrape recent tweets.
 * Uses the existing Playwright browser session.
 */
export async function scrapeTargetTweets(
  page: Page,
  targetHandle: string,
  maxTweets: number = 5,
): Promise<ScrapedTweet[]> {
  // Navigate to profile
  await page.goto(`https://x.com/${targetHandle}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);  // Let tweets load
  
  // Scrape tweets from the timeline
  const tweets = await page.evaluate((max) => {
    const tweetElements = document.querySelectorAll('article[data-testid="tweet"]');
    const results: any[] = [];
    
    for (let i = 0; i < Math.min(tweetElements.length, max); i++) {
      const el = tweetElements[i];
      
      // Get tweet text
      const textEl = el.querySelector('[data-testid="tweetText"]');
      const text = textEl?.textContent || '';
      
      // Get tweet link (contains timestamp info)
      const timeEl = el.querySelector('time');
      const timestamp = timeEl?.getAttribute('datetime') || '';
      const linkEl = timeEl?.closest('a');
      const url = linkEl?.getAttribute('href') || '';
      
      // Get engagement counts
      const getCount = (testId: string): number => {
        const countEl = el.querySelector(`[data-testid="${testId}"]`);
        const text = countEl?.textContent || '0';
        return parseInt(text.replace(/[^0-9]/g, '')) || 0;
      };
      
      results.push({
        url: url ? `https://x.com${url}` : '',
        text,
        author: '',  // Filled in after
        timestamp,
        likes: getCount('like'),
        replies: getCount('reply'),
        retweets: getCount('retweet'),
      });
    }
    
    return results;
  }, maxTweets);
  
  return tweets.map(t => ({ ...t, author: targetHandle }));
}

/**
 * Scrape posts from a Reddit subreddit.
 * Different flow — browse new/hot posts and grab titles + text.
 */
export async function scrapeSubredditPosts(
  page: Page,
  subreddit: string,
  maxPosts: number = 10,
): Promise<ScrapedTweet[]> {
  await page.goto(`https://www.reddit.com/${subreddit}/hot`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  
  // Scrape post titles and metadata
  const posts = await page.evaluate((max) => {
    const postElements = document.querySelectorAll('shreddit-post, [data-testid="post-container"]');
    const results: any[] = [];
    
    for (let i = 0; i < Math.min(postElements.length, max); i++) {
      const el = postElements[i];
      const title = el.getAttribute('post-title') || 
                    el.querySelector('h3')?.textContent || '';
      const permalink = el.getAttribute('permalink') ||
                       el.querySelector('a[data-click-id="body"]')?.getAttribute('href') || '';
      const score = el.getAttribute('score') || '0';
      const commentCount = el.getAttribute('comment-count') || '0';
      
      results.push({
        url: permalink ? `https://www.reddit.com${permalink}` : '',
        text: title,
        author: '',
        timestamp: '',
        likes: parseInt(score) || 0,
        replies: parseInt(commentCount) || 0,
        retweets: 0,
      });
    }
    
    return results;
  }, maxPosts);
  
  return posts;
}
```

---

## STEP 3: REPLY SELECTION

```typescript
// scripts/auto-poster/reply-engine/reply-selector.ts

interface ReplyCandidate {
  tweet: ScrapedTweet;
  score: number;
  reason: string;
}

/**
 * Use Claude to pick the best tweet to reply to.
 * Not rules-based — the LLM is better at judging "replyability."
 */
export async function selectBestTweet(
  client: Anthropic,
  tweets: ScrapedTweet[],
  target: EngagementTarget,
  recentReplies: GeneratedReply[],
): Promise<ReplyCandidate | null> {
  if (tweets.length === 0) return null;
  
  // Filter out tweets we've already replied to
  const repliedUrls = new Set(recentReplies.map(r => r.original_tweet_url));
  const fresh = tweets.filter(t => !repliedUrls.has(t.url));
  
  if (fresh.length === 0) return null;
  
  const prompt = `
Pick the best tweet for Maxy to reply to. She needs to grow her following by being
genuinely engaging on other people's posts.

TARGET ACCOUNT: @${target.target_handle}
TARGET TYPE: ${target.target_type}
MAXY'S STRATEGY FOR THIS ACCOUNT: ${target.strategy || 'Be genuine and interesting.'}

RECENT TWEETS FROM THIS ACCOUNT:
${fresh.map((t, i) => `
[${i + 1}] "${t.text}"
    Likes: ${t.likes} | Replies: ${t.replies} | Age: ${getAge(t.timestamp)}
`).join('\n')}

SELECTION CRITERIA:
- Has a question, open statement, or topic Maxy can genuinely add to
- Posted within last 12 hours (not stale, not too fresh to have no engagement)
- Has some engagement but not hundreds of replies (5-50 replies ideal)
- Topic touches something Maxy knows about: denial, chastity, feminization,
  trans experience, AI, ADHD, self-improvement, kink, identity, late blooming
- Maxy can say something specific and real, not just "so true!"
- Avoid tweets that are just photos/promos with no conversational hook

DO NOT pick tweets where Maxy would have to force a connection. If none of these
are good, say SKIP.

Return JSON:
{
  "selection": 1-5 or "SKIP",
  "score": 0-10,
  "reason": "why this tweet is replyable",
  "angle": "what Maxy should talk about in her reply"
}
  `;
  
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 200,
    messages: [{ role: 'user', content: prompt }],
  });
  
  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  const result = JSON.parse(text.replace(/```json\n?|```\n?/g, '').trim());
  
  if (result.selection === 'SKIP') return null;
  
  const idx = (typeof result.selection === 'number' ? result.selection : parseInt(result.selection)) - 1;
  if (idx < 0 || idx >= fresh.length) return null;
  
  return {
    tweet: fresh[idx],
    score: result.score,
    reason: `${result.reason} | Angle: ${result.angle}`,
  };
}
```

---

## STEP 4: REPLY GENERATION

```typescript
// scripts/auto-poster/reply-engine/reply-generator.ts

/**
 * Generate Maxy's reply using the voice bible.
 */
export async function generateReply(
  client: Anthropic,
  tweet: ScrapedTweet,
  target: EngagementTarget,
  angle: string,
  state: UserState,
  voicePrompt: string,
): Promise<{ reply: string; critique: { passes: boolean; reason: string } }> {
  
  const stateContext = `
MAXY'S CURRENT STATE:
Denial day: ${state.denialDay}
Caged: ${state.isCaged || 'unknown'}
Streak: ${state.streakDays} days
Time: ${new Date().toLocaleTimeString()}
  `.trim();
  
  const prompt = `
Write a reply to this tweet as Maxy.

TWEET by @${tweet.author}: "${tweet.text}"

SUGGESTED ANGLE: ${angle}

${stateContext}

RULES:
- 1-2 sentences max. This is a reply not an essay
- Be genuine. React to what they actually said
- Add something from Maxy's real experience
- Be funny, relatable, or vulnerable — pick one, not all three
- Do NOT be sycophantic ("great post!", "so true!", "love this!")
- Do NOT start with "omg" or "this"
- Do NOT use more than one emoji. Zero is fine
- Do NOT make it about Maxy's whole backstory. One detail max
- It should make someone reading the thread want to tap Maxy's profile
- Match Maxy's voice: lowercase, casual, fragments ok, no periods at end of single sentences

Output ONLY the reply text. Nothing else.
  `;
  
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 100,
    system: voicePrompt,
    messages: [{ role: 'user', content: prompt }],
  });
  
  let reply = response.content[0].type === 'text' ? response.content[0].text : '';
  
  // Strip quotes if the model wrapped it
  reply = reply.replace(/^["']|["']$/g, '').trim();
  
  // Run self-critique
  const critique = await critiqueReply(client, reply, tweet.text);
  
  return { reply, critique };
}

/**
 * Self-critique specifically calibrated for replies.
 * Replies have different failure modes than original posts.
 */
async function critiqueReply(
  client: Anthropic,
  reply: string,
  originalTweet: string,
): Promise<{ passes: boolean; reason: string }> {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 80,
    system: `You judge whether a tweet reply sounds like a real person or an AI bot. You are extremely picky. Real replies are messy, casual, specific. Bot replies are generic, enthusiastic, sycophantic.`,
    messages: [{
      role: 'user',
      content: `Original tweet: "${originalTweet}"\nReply: "${reply}"\n\nRate: HUMAN or BOT. One sentence why.`
    }],
  });
  
  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  const passes = text.trim().toUpperCase().startsWith('HUMAN');
  return { passes, reason: text };
}
```

---

## STEP 5: REPLY POSTING

```typescript
// scripts/auto-poster/reply-engine/reply-poster.ts

/**
 * Post the reply using Playwright.
 * Navigate to the original tweet and post the reply.
 */
export async function postReply(
  page: Page,
  tweetUrl: string,
  replyText: string,
): Promise<{ success: boolean; replyUrl?: string; error?: string }> {
  try {
    // Navigate to the tweet
    await page.goto(tweetUrl, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    
    // Click the reply input
    const replyBox = await page.waitForSelector(
      '[data-testid="tweetTextarea_0"], [data-testid="reply"]',
      { timeout: 10000 }
    );
    
    if (!replyBox) {
      return { success: false, error: 'Could not find reply box' };
    }
    
    await replyBox.click();
    await page.waitForTimeout(500);
    
    // Type the reply (human-like speed)
    await page.keyboard.type(replyText, { delay: 30 + Math.random() * 50 });
    await page.waitForTimeout(1000);
    
    // Click reply button
    const replyButton = await page.waitForSelector(
      '[data-testid="tweetButtonInline"], [data-testid="tweetButton"]',
      { timeout: 5000 }
    );
    
    if (!replyButton) {
      return { success: false, error: 'Could not find reply button' };
    }
    
    await replyButton.click();
    await page.waitForTimeout(3000);
    
    // Try to get the URL of the posted reply
    // This is best-effort — sometimes hard to capture
    const replyUrl = page.url();
    
    return { success: true, replyUrl };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Post a comment on Reddit.
 */
export async function postRedditComment(
  page: Page,
  postUrl: string,
  commentText: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await page.goto(postUrl, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    
    // Find comment box
    const commentBox = await page.waitForSelector(
      'div[contenteditable="true"], textarea[placeholder*="comment"]',
      { timeout: 10000 }
    );
    
    if (!commentBox) {
      return { success: false, error: 'Could not find comment box' };
    }
    
    await commentBox.click();
    await page.waitForTimeout(500);
    await page.keyboard.type(commentText, { delay: 20 + Math.random() * 40 });
    await page.waitForTimeout(1000);
    
    // Find and click submit
    const submitButton = await page.waitForSelector(
      'button[type="submit"]:has-text("Comment"), button:has-text("Comment")',
      { timeout: 5000 }
    );
    
    if (submitButton) {
      await submitButton.click();
      await page.waitForTimeout(3000);
    }
    
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
```

---

## STEP 6: PERFORMANCE TRACKING

```typescript
// scripts/auto-poster/reply-engine/performance-tracker.ts

/**
 * Check performance of replies posted 24 hours ago.
 * Runs daily. Updates target priority scores based on results.
 */
export async function trackReplyPerformance(
  page: Page,
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  // Get replies posted ~24 hours ago that haven't been checked
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const dayBefore = new Date(Date.now() - 48 * 60 * 60 * 1000);
  
  const { data: replies } = await supabase
    .from('generated_replies')
    .select('*')
    .eq('user_id', userId)
    .eq('post_status', 'posted')
    .is('performance_checked_at', null)
    .gte('posted_at', dayBefore.toISOString())
    .lte('posted_at', yesterday.toISOString());
  
  for (const reply of (replies || [])) {
    if (!reply.reply_url) continue;
    
    try {
      // Navigate to the reply
      await page.goto(reply.reply_url, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2000);
      
      // Scrape engagement on the reply
      const metrics = await page.evaluate(() => {
        const article = document.querySelector('article[data-testid="tweet"]');
        if (!article) return { likes: 0, replies: 0 };
        
        const getCount = (testId: string): number => {
          const el = article.querySelector(`[data-testid="${testId}"]`);
          return parseInt(el?.textContent?.replace(/[^0-9]/g, '') || '0') || 0;
        };
        
        return {
          likes: getCount('like'),
          replies: getCount('reply'),
        };
      });
      
      // Score the reply performance
      // likes are worth 2 points, replies worth 5 (deeper engagement)
      const score = (metrics.likes * 2) + (metrics.replies * 5);
      
      // Update the reply record
      await supabase.from('generated_replies').update({
        reply_likes: metrics.likes,
        reply_replies: metrics.replies,
        performance_score: score,
        performance_checked_at: new Date().toISOString(),
      }).eq('id', reply.id);
      
      // Update the target's priority based on this result
      await updateTargetPriority(supabase, reply.target_id, score);
      
    } catch (error) {
      // Mark as checked even if scraping failed
      await supabase.from('generated_replies').update({
        performance_checked_at: new Date().toISOString(),
        performance_score: 0,
      }).eq('id', reply.id);
    }
  }
}

/**
 * Adjust target priority score based on reply performance.
 * Good results → higher priority → more replies to this target.
 * Bad results → lower priority → fewer replies.
 */
async function updateTargetPriority(
  supabase: SupabaseClient,
  targetId: string,
  replyScore: number,
): Promise<void> {
  const { data: target } = await supabase
    .from('engagement_targets')
    .select('*')
    .eq('id', targetId)
    .single();
  
  if (!target) return;
  
  // Moving average of reply performance
  const totalReplies = (target.successful_replies || 0) + (target.failed_replies || 0) + 1;
  const oldAvg = target.avg_reply_engagement || 0;
  const newAvg = ((oldAvg * (totalReplies - 1)) + replyScore) / totalReplies;
  
  // Priority adjusts toward avg performance
  // High performers get higher priority, low performers get lower
  let newPriority = target.priority_score || 50;
  if (replyScore >= 10) {
    newPriority = Math.min(100, newPriority + 5);  // Good reply, boost
  } else if (replyScore >= 3) {
    newPriority = Math.min(100, newPriority + 1);  // Decent reply, small boost
  } else if (replyScore === 0) {
    newPriority = Math.max(10, newPriority - 3);   // No engagement, penalize
  }
  
  await supabase.from('engagement_targets').update({
    avg_reply_engagement: newAvg,
    priority_score: newPriority,
    successful_replies: replyScore >= 3 
      ? (target.successful_replies || 0) + 1 
      : target.successful_replies,
    failed_replies: replyScore < 3 
      ? (target.failed_replies || 0) + 1 
      : target.failed_replies,
  }).eq('id', targetId);
}
```

---

## MAIN LOOP: THE REPLY ENGINE

```typescript
// scripts/auto-poster/reply-engine/index.ts

import { selectTargets } from './target-selector';
import { scrapeTargetTweets, scrapeSubredditPosts } from './tweet-scraper';
import { selectBestTweet } from './reply-selector';
import { generateReply } from './reply-generator';
import { postReply, postRedditComment } from './reply-poster';
import { trackReplyPerformance } from './performance-tracker';

/**
 * Main reply engine loop.
 * Runs every 3 hours from the auto-poster.
 */
export async function runReplyEngine(
  page: Page,
  supabase: SupabaseClient,
  client: Anthropic,
  userId: string,
  voicePrompt: string,
): Promise<void> {
  console.log('[REPLY] Starting reply cycle...');
  
  // Get current state for voice grounding
  const state = await fetchUserState(supabase, userId);
  
  // Track performance of yesterday's replies first
  await trackReplyPerformance(page, supabase, userId);
  
  // Select targets for this cycle
  const targets = await selectTargets(supabase, userId);
  console.log(`[REPLY] Selected ${targets.length} targets`);
  
  let repliesPosted = 0;
  
  for (const { target, reason } of targets) {
    try {
      console.log(`[REPLY] Processing @${target.target_handle} (${reason})`);
      
      // Scrape recent tweets
      let tweets;
      if (target.platform === 'reddit') {
        tweets = await scrapeSubredditPosts(page, target.target_handle);
      } else {
        tweets = await scrapeTargetTweets(page, target.target_handle);
      }
      
      if (tweets.length === 0) {
        console.log(`[REPLY] No tweets found for @${target.target_handle}`);
        continue;
      }
      
      // Store scraped tweets
      for (const tweet of tweets) {
        await supabase.from('scraped_tweets').insert({
          user_id: userId,
          target_id: target.id,
          platform: target.platform,
          tweet_url: tweet.url,
          tweet_text: tweet.text,
          tweet_author: tweet.author,
          tweet_timestamp: tweet.timestamp || null,
          likes: tweet.likes,
          replies: tweet.replies,
          retweets: tweet.retweets,
        });
      }
      
      // Get recent replies to avoid duplicating
      const { data: recentReplies } = await supabase
        .from('generated_replies')
        .select('original_tweet_url')
        .eq('user_id', userId)
        .eq('target_id', target.id)
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
      
      // Select best tweet to reply to
      const candidate = await selectBestTweet(client, tweets, target, recentReplies || []);
      
      if (!candidate) {
        console.log(`[REPLY] No good reply target for @${target.target_handle}, skipping`);
        // Set cooldown so we don't keep checking this target
        await supabase.from('engagement_targets').update({
          cooldown_until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        }).eq('id', target.id);
        continue;
      }
      
      console.log(`[REPLY] Selected tweet: "${candidate.tweet.text.substring(0, 50)}..."`);
      
      // Generate reply
      const { reply, critique } = await generateReply(
        client, candidate.tweet, target, candidate.reason, state, voicePrompt
      );
      
      // Store generated reply
      const { data: replyRecord } = await supabase.from('generated_replies').insert({
        user_id: userId,
        target_id: target.id,
        platform: target.platform,
        original_tweet_url: candidate.tweet.url,
        original_tweet_text: candidate.tweet.text,
        original_author: candidate.tweet.author,
        reply_text: reply,
        critique_passed: critique.passes,
        critique_reason: critique.reason,
        post_status: critique.passes ? 'approved' : 'pending',
      }).select().single();
      
      // Only post if critique passed
      if (!critique.passes) {
        console.log(`[REPLY] Critique failed: ${critique.reason}. Regenerating...`);
        
        // One retry with stronger instruction
        const retry = await generateReply(
          client, candidate.tweet, target,
          candidate.reason + ' IMPORTANT: sound like a real person, not AI.',
          state, voicePrompt
        );
        
        if (!retry.critique.passes) {
          console.log(`[REPLY] Retry also failed. Skipping this target.`);
          continue;
        }
        
        // Update with retry
        await supabase.from('generated_replies').update({
          reply_text: retry.reply,
          critique_passed: true,
          critique_reason: retry.critique.reason,
          post_status: 'approved',
        }).eq('id', replyRecord.id);
      }
      
      // Post the reply
      const finalReply = critique.passes ? reply : 
        (await supabase.from('generated_replies').select('reply_text').eq('id', replyRecord.id).single()).data?.reply_text;
      
      let postResult;
      if (target.platform === 'reddit') {
        postResult = await postRedditComment(page, candidate.tweet.url, finalReply);
      } else {
        postResult = await postReply(page, candidate.tweet.url, finalReply);
      }
      
      if (postResult.success) {
        console.log(`[REPLY] Posted reply to @${target.target_handle}: "${finalReply}"`);
        repliesPosted++;
        
        await supabase.from('generated_replies').update({
          post_status: 'posted',
          posted_at: new Date().toISOString(),
          reply_url: postResult.replyUrl || null,
        }).eq('id', replyRecord.id);
        
        // Update target interaction tracking
        await supabase.from('engagement_targets').update({
          interactions_count: (target.interactions_count || 0) + 1,
          last_interaction_at: new Date().toISOString(),
          last_scraped_at: new Date().toISOString(),
        }).eq('id', target.id);
        
      } else {
        console.log(`[REPLY] Failed to post: ${postResult.error}`);
        await supabase.from('generated_replies').update({
          post_status: 'failed',
        }).eq('id', replyRecord.id);
      }
      
      // Random delay between targets (30-90 seconds)
      // Don't look like a bot hammering reply buttons
      const delay = 30000 + Math.random() * 60000;
      await new Promise(resolve => setTimeout(resolve, delay));
      
    } catch (error) {
      console.error(`[REPLY] Error processing @${target.target_handle}:`, error);
    }
  }
  
  // Update daily budget
  const today = new Date().toISOString().split('T')[0];
  await supabase.from('reply_budget').upsert({
    user_id: userId,
    date: today,
    replies_posted: repliesPosted,
  }, {
    onConflict: 'user_id,date',
    // Increment, don't replace
  });
  
  // Actually we need to increment not set
  const { data: currentBudget } = await supabase
    .from('reply_budget')
    .select('replies_posted')
    .eq('user_id', userId)
    .eq('date', today)
    .single();
  
  if (currentBudget) {
    await supabase.from('reply_budget').update({
      replies_posted: (currentBudget.replies_posted || 0) + repliesPosted,
    }).eq('user_id', userId).eq('date', today);
  }
  
  console.log(`[REPLY] Cycle complete. ${repliesPosted} replies posted.`);
}
```

---

## INTEGRATION WITH AUTO-POSTER

```typescript
// Add to scripts/auto-poster/index.ts

import { runReplyEngine } from './reply-engine';

// Existing posting loop runs every 15 min
// Reply engine runs every 3 hours
let lastReplyRun = 0;
const REPLY_INTERVAL = 3 * 60 * 60 * 1000; // 3 hours

async function mainLoop() {
  while (true) {
    // Existing: post scheduled content
    await pollAndPostScheduled();
    
    // Existing: read DMs
    await readAndRespondDMs();
    
    // New: reply engine (every 3 hours)
    if (Date.now() - lastReplyRun >= REPLY_INTERVAL) {
      await runReplyEngine(page, supabase, client, userId, voicePrompt);
      lastReplyRun = Date.now();
    }
    
    // Existing: performance tracking (daily)
    await trackPerformanceIfDue();
    
    // Wait 15 minutes
    await sleep(15 * 60 * 1000);
  }
}
```

---

## RATE LIMITING AND ANTI-DETECTION

```typescript
const RATE_LIMITS = {
  // Per platform per day
  twitter: {
    max_replies: 15,
    min_delay_between_replies_ms: 45000,  // 45 seconds minimum
    max_replies_per_target_per_week: 3,
    max_replies_per_hour: 4,
  },
  reddit: {
    max_comments: 8,
    min_delay_between_comments_ms: 60000,  // 60 seconds
    max_comments_per_sub_per_day: 2,
    max_comments_per_hour: 2,
  },
  
  // Behavioral patterns to avoid bot detection
  anti_detection: {
    // Vary typing speed (not constant 50ms per char)
    typing_delay_range: [20, 80],  // ms per character
    
    // Pause before clicking reply (humans don't click instantly)
    pre_click_pause_range: [500, 2000],
    
    // Random scroll behavior before engaging
    pre_engagement_scroll: true,
    
    // Don't reply to the exact same account back-to-back
    min_gap_same_target_hours: 48,
    
    // Don't post replies in perfectly even intervals
    cycle_time_jitter_minutes: 30,  // ±30 min on the 3-hour cycle
    
    // Skip random cycles occasionally (humans don't engage 24/7)
    skip_cycle_probability: 0.15,  // 15% chance to skip a cycle entirely
  },
};
```

---

## TEST CASES

```
TEST: RP-1 — Target Selection
GIVEN: 40 engagement targets, 5 on cooldown, 3 interacted within 48h
WHEN: selectTargets runs
THEN: Returns 4-5 targets not on cooldown and not recently engaged
AND: No more than 2 from same target_type
PASS: Target selection respects cooldowns and diversifies.

TEST: RP-2 — Tweet Scraping
GIVEN: Target @example_creator has 5 recent tweets
WHEN: scrapeTargetTweets runs
THEN: Returns array of 5 tweets with text, url, engagement counts
AND: Tweets stored in scraped_tweets table
PASS: Playwright scrapes real tweet data.

TEST: RP-3 — Reply Selection (Good Target)
GIVEN: 5 tweets, one asks "what's your denial record?"
WHEN: selectBestTweet runs
THEN: Selects the question tweet
AND: Score >= 7
AND: Angle references Maxy's actual denial experience
PASS: Claude selects the most replyable tweet.

TEST: RP-4 — Reply Selection (No Good Target)
GIVEN: 5 tweets, all are photo dumps with "link in bio"
WHEN: selectBestTweet runs
THEN: Returns null (SKIP)
AND: Target gets 24h cooldown
PASS: Engine skips targets with no replyable content.

TEST: RP-5 — Reply Generation
GIVEN: Selected tweet about chastity experience
WHEN: generateReply runs
THEN: Reply is 1-2 sentences
AND: References Maxy's real state
AND: Doesn't start with "omg" or "this"
AND: Doesn't say "great post"
AND: Self-critique rates it HUMAN
PASS: Generated reply sounds authentic.

TEST: RP-6 — Critique Failure + Retry
GIVEN: First generation produces AI-sounding reply
WHEN: critiqueReply returns BOT
THEN: Reply regenerated with stronger instruction
AND: If retry also fails, target skipped
AND: No bot-sounding reply ever gets posted
PASS: Quality gate prevents bad replies.

TEST: RP-7 — Reply Posting
GIVEN: Approved reply for a tweet
WHEN: postReply runs via Playwright
THEN: Reply posted to Twitter
AND: generated_replies updated with posted_at and reply_url
AND: engagement_targets updated with interaction count
PASS: Reply actually appears on the platform.

TEST: RP-8 — Rate Limiting
GIVEN: 15 Twitter replies already posted today
WHEN: selectTargets checks budget
THEN: Returns empty array
AND: No more replies attempted today
PASS: Daily rate limit enforced.

TEST: RP-9 — Performance Tracking
GIVEN: Reply posted 24 hours ago got 8 likes and 2 replies
WHEN: trackReplyPerformance runs
THEN: performance_score = (8*2) + (2*5) = 26
AND: Target priority_score increases
PASS: Good-performing replies boost target priority.

TEST: RP-10 — Anti-Detection
GIVEN: Reply engine running
THEN: Typing speed varies between 20-80ms per char
AND: Pre-click pause varies 500-2000ms
AND: Delay between targets varies 30-90 seconds
AND: 15% of cycles skipped randomly
AND: Same target never engaged twice in 48 hours
PASS: Behavior patterns don't look automated.

TEST: RP-11 — Full Cycle
GIVEN: Reply engine triggered (3-hour cycle)
THEN: 4-5 targets selected
AND: Each target's tweets scraped
AND: Best tweet selected per target
AND: Reply generated and critiqued
AND: Passed replies posted with human-like delays
AND: Budget updated
AND: Completed in under 30 minutes total
PASS: Full cycle runs autonomously end to end.
```

---

## COST ESTIMATE

```
Per cycle (every 3 hours):
  Target selection: ~$0 (database query)
  Tweet scraping: ~$0 (Playwright, no API cost)
  Reply selection: 4-5 Claude calls × $0.005 = $0.025
  Reply generation: 4-5 Claude calls × $0.005 = $0.025
  Self-critique: 4-5 Claude calls × $0.003 = $0.015
  Retries (occasional): ~$0.01
  
  Total per cycle: ~$0.075
  8 cycles per day: ~$0.60/day
  Monthly: ~$18/month

Worth it if a single subscriber ($10/month) comes from 
the reply strategy. Needs less than 2 subscribers to be 
profitable.
```

---

## IMPLEMENTATION ORDER

1. Migration 135 — tables and indexes
2. Seed engagement targets (real accounts — verify manually)
3. Tweet scraper (Playwright)
4. Reply selector (Claude)  
5. Reply generator + self-critique (Claude + voice bible)
6. Reply poster (Playwright)
7. Performance tracker
8. Wire into auto-poster main loop
9. Rate limiting and anti-detection
10. Reddit comment flow (separate from Twitter)

---

*The reply engine is the growth engine. Original posts are for retention. Replies are for discovery. 15-20 replies per day across 30-50 targets means Maxy's voice appears in dozens of conversations daily. Each reply is a profile visit opportunity. Each profile visit sees the pinned tweet, the bio, and a woman whose AI controls her orgasms. Some percentage follows. The machine grows the audience while Maxy sleeps.*
