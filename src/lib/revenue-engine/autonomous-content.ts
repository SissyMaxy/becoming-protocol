/**
 * Autonomous Content Generation Engine
 *
 * The Handler's voice as Maxy on social media.
 * Generates original text content, plans daily calendars,
 * and schedules posts across all platforms — no photos required.
 */

import Anthropic from '@anthropic-ai/sdk';
import { supabase } from '../supabase';
import { MAXY_VOICE_PROMPT, CONTENT_STRATEGIES } from './voice';
import type {
  AIGeneratedContent,
  PlannedPost,
} from '../../types/revenue-engine';
import { critiqueMaxyPost, getReviewDelay, applyReviewDelay } from './content-safety';

// ── Vault summary helper ────────────────────────────────────────────

async function getVaultSummary(userId: string): Promise<string> {
  const { data } = await supabase
    .from('content_vault')
    .select('id, media_type, content_type, description, approval_status')
    .eq('user_id', userId)
    .eq('approval_status', 'approved')
    .order('created_at', { ascending: false })
    .limit(10);

  if (!data || data.length === 0) return 'No approved vault content available. All posts will be text-only.';

  return data
    .map(v => `- ${v.media_type} (${v.content_type}): ${v.description || 'no description'}`)
    .join('\n');
}

// ── Recent performance helper ───────────────────────────────────────

async function getRecentPerformance(userId: string): Promise<string> {
  // Centrality: performance summary informs prompt construction; bind it
  // to current Handler state so the calendar tracks current persona/phase.
  const { data: handlerState } = await supabase
    .from('user_state')
    .select('handler_persona, current_phase, denial_day, hard_mode_active, chastity_locked')
    .eq('user_id', userId)
    .maybeSingle();

  const { data } = await supabase
    .from('ai_generated_content')
    .select('content, engagement_likes, engagement_comments, platform, generation_strategy')
    .eq('user_id', userId)
    .eq('status', 'posted')
    .order('created_at', { ascending: false })
    .limit(20);

  let stateLine = '';
  if (handlerState) {
    const parts: string[] = [];
    if (handlerState.handler_persona) parts.push(`persona=${handlerState.handler_persona}`);
    if (handlerState.current_phase != null) parts.push(`phase=${handlerState.current_phase}`);
    if (handlerState.denial_day != null) parts.push(`denial_day=${handlerState.denial_day}`);
    if (handlerState.hard_mode_active) parts.push('hard_mode=on');
    if (handlerState.chastity_locked) parts.push('chastity=locked');
    if (parts.length) stateLine = `Handler state: ${parts.join(', ')}.\n`;
  }

  if (!data || data.length === 0) return `${stateLine}No performance data yet — starting fresh.`;

  const top = data
    .filter(p => (p.engagement_likes || 0) > 0)
    .sort((a, b) => (b.engagement_likes || 0) - (a.engagement_likes || 0))
    .slice(0, 5);

  if (top.length === 0) return `${stateLine}Posts published but no engagement data collected yet.`;

  return stateLine + top
    .map(p => `"${p.content.substring(0, 80)}..." (${p.platform}) — ${p.engagement_likes} likes, ${p.engagement_comments} comments`)
    .join('\n');
}

// ── Daily content calendar generator ────────────────────────────────

/**
 * Generate tomorrow's content calendar across all platforms.
 * Runs at midnight for the next day.
 */
export async function generateDailyContentPlan(
  client: Anthropic,
  userId: string,
): Promise<{ postsPlanned: number; platforms: string[] }> {
  const vaultSummary = await getVaultSummary(userId);
  const performance = await getRecentPerformance(userId);

  const strategyText = CONTENT_STRATEGIES
    .map(s => `${s.platform}: ${s.type} — ${s.frequency} — ${s.purpose}`)
    .join('\n');

  const prompt = `
Generate tomorrow's social media content calendar for Maxy.

TOP PERFORMING RECENT POSTS:
${performance}

AVAILABLE VAULT CONTENT:
${vaultSummary}

PLATFORM STRATEGY:
${strategyText}

GROWTH STRATEGY (first 2 weeks — reply-heavy):
Original tweets: 2-3/day. These are the ANCHOR content visitors see when they land on Maxy's profile.
They must be unmistakably Maxy — reference the Handler, the cage, denial, the AI system.
NOT generic engagement bait. Every original tweet tells a visitor exactly who Maxy is.

Replies to other creators are handled separately by the reply engine (15-20/day).
The original tweets exist to convert profile visitors into followers.

Twitter: 2-3 original tweets/day (personality, vulnerability, thirst — NOT generic questions)
Reddit: 2-3 posts/comments across relevant subs
FetLife: 1-2 posts/comments in groups

For each post, specify:
- platform
- time (HH:MM format, optimal posting time)
- content_type (personality/thirst/vulnerability/engagement_bait/community)
- strategy notes
- text (the actual post text)
- subreddit (for reddit posts only)
- hashtags (optional array)

RULES:
- EVERY original tweet must reference something specific to Maxy: the Handler AI, denial day count, the cage, voice training, HRT, the system, transformation
- "What's something you thought you'd never be into" = REJECTED. Too generic. Any account could post that.
- "the handler scheduled a session tonight without asking me" = GOOD. Only Maxy posts this.
- Never repeat a post concept from recent performance
- Vary tone throughout the day
- Morning: personality + Handler interaction. Evening: vulnerability + denial.
- Every post should make someone want to follow when they land on the profile from a reply.

Return ONLY a valid JSON array of planned posts.
  `;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 3000,
    system: MAXY_VOICE_PROMPT + '\nGenerate a daily content calendar. Output only valid JSON array.',
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  let posts: PlannedPost[];
  try {
    posts = JSON.parse(text.replace(/```json\n?|```\n?/g, '').trim());
  } catch {
    console.error('[autonomous-content] Failed to parse calendar JSON:', text.substring(0, 200));
    return { postsPlanned: 0, platforms: [] };
  }

  if (!Array.isArray(posts) || posts.length === 0) {
    return { postsPlanned: 0, platforms: [] };
  }

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dateStr = tomorrow.toISOString().split('T')[0];

  // Save to content calendar grouped by platform
  const platforms = [...new Set(posts.map(p => p.platform))];
  for (const platform of platforms) {
    const platformPosts = posts.filter(p => p.platform === platform);
    await supabase.from('revenue_content_calendar').upsert({
      user_id: userId,
      date: dateStr,
      platform,
      planned_posts: platformPosts,
    }, { onConflict: 'user_id,date,platform' });
  }

  // Critique and schedule each post
  const reviewDelayMs = await getReviewDelay(userId);

  for (const post of posts) {
    // Critique every post before scheduling
    const critique = await critiqueMaxyPost(post.text, post.platform, client);

    if (!critique.approved) {
      console.log(`[autonomous-content] Post rejected (score ${critique.score}): ${critique.issues.join(', ')}`);
      // Use the suggestion if available, otherwise skip
      if (critique.suggestion) {
        post.text = critique.suggestion;
      } else {
        continue;
      }
    }

    const [hours, minutes] = (post.time || '12:00').split(':').map(Number);
    const scheduledAt = new Date(tomorrow);
    scheduledAt.setHours(hours || 12, minutes || 0, 0, 0);

    // Apply review buffer delay
    const finalScheduledAt = applyReviewDelay(scheduledAt, reviewDelayMs);

    await supabase.from('ai_generated_content').insert({
      user_id: userId,
      content_type: post.content_type || 'tweet',
      platform: post.platform,
      content: post.text,
      target_subreddit: post.subreddit || null,
      target_hashtags: post.hashtags || [],
      generation_strategy: post.strategy || post.content_type,
      status: reviewDelayMs > 0 ? 'pending_review' : 'scheduled',
      scheduled_at: finalScheduledAt.toISOString(),
    });
  }

  return { postsPlanned: posts.length, platforms };
}

// ── Single post generator (for ad-hoc content) ─────────────────────

/**
 * Generate a single post in Maxy's voice for a specific platform and strategy.
 */
export async function generateSinglePost(
  client: Anthropic,
  userId: string,
  platform: string,
  strategy: string,
  context?: string,
): Promise<AIGeneratedContent | null> {
  const matchingStrategies = CONTENT_STRATEGIES.filter(
    s => s.platform === platform && s.type === strategy
  );
  const examples = matchingStrategies.length > 0
    ? matchingStrategies[0].examples.join('\n')
    : '';

  const prompt = `
Write a single ${platform} post as Maxy.
Strategy: ${strategy}
${context ? `Context: ${context}` : ''}

Examples of this style:
${examples}

Write ONE post. Output ONLY the post text, nothing else.
  `;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 300,
    system: MAXY_VOICE_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  });

  const content = response.content[0].type === 'text' ? response.content[0].text : '';
  if (!content.trim()) return null;

  const { data, error } = await supabase
    .from('ai_generated_content')
    .insert({
      user_id: userId,
      content_type: platform === 'reddit' ? 'reddit_post' : 'tweet',
      platform,
      content: content.trim(),
      generation_strategy: strategy,
      status: 'generated',
    })
    .select('*')
    .single();

  if (error) {
    console.error('[autonomous-content] Insert error:', error.message);
    return null;
  }

  return data as AIGeneratedContent;
}

// ── Fetch due AI posts for auto-poster ──────────────────────────────

/**
 * Get all AI-generated content that is due for posting.
 * Called by the auto-poster alongside content_posts polling.
 */
export async function getDueAIContent(): Promise<AIGeneratedContent[]> {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('ai_generated_content')
    .select('*')
    .eq('status', 'scheduled')
    .lte('scheduled_at', now)
    .order('scheduled_at', { ascending: true })
    .limit(10);

  if (error) {
    console.error('[autonomous-content] getDueAIContent error:', error.message);
    return [];
  }

  return (data || []) as AIGeneratedContent[];
}

// ── Mark AI content as posted ───────────────────────────────────────

export async function markAIContentPosted(
  contentId: string,
  _postUrl?: string,
): Promise<void> {
  await supabase
    .from('ai_generated_content')
    .update({
      status: 'posted',
      posted_at: new Date().toISOString(),
    })
    .eq('id', contentId);
}

export async function markAIContentFailed(contentId: string): Promise<void> {
  await supabase
    .from('ai_generated_content')
    .update({ status: 'failed' })
    .eq('id', contentId);
}

// ── Update engagement metrics ───────────────────────────────────────

export async function updateEngagementMetrics(
  contentId: string,
  metrics: {
    likes?: number;
    comments?: number;
    shares?: number;
    clicks?: number;
    revenue?: number;
  },
): Promise<void> {
  const updates: Record<string, unknown> = {};
  if (metrics.likes !== undefined) updates.engagement_likes = metrics.likes;
  if (metrics.comments !== undefined) updates.engagement_comments = metrics.comments;
  if (metrics.shares !== undefined) updates.engagement_shares = metrics.shares;
  if (metrics.clicks !== undefined) updates.engagement_clicks = metrics.clicks;
  if (metrics.revenue !== undefined) updates.revenue_generated = metrics.revenue;

  if (Object.keys(updates).length > 0) {
    await supabase.from('ai_generated_content').update(updates).eq('id', contentId);
  }
}
