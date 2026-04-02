/**
 * Content Calendar Generator — creates a day's worth of scheduled posts.
 *
 * Replaces the broken edge function cron. Generates Twitter + Reddit posts
 * using Claude Haiku, runs each through the quality gate (slop detector),
 * and inserts approved posts into ai_generated_content with staggered times.
 *
 * Standalone: npx tsx generate-calendar.ts
 * Or import: import { generateCalendar } from './generate-calendar';
 */

import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { supabase } from './config';
import { fullSlopCheck } from './slop-detector';
import { extractSafeText } from './refusal-filter';

const USER_ID = process.env.USER_ID || '';
const MAX_QUALITY_RETRIES = 3;

// ── Voice prompt ───────────────────────────────────────────────────

const MAXY_VOICE_POST = `You are Maxy (@softmaxy) — 40, trans woman, HRT, voice training, kink life. Sharp, funny, messy, real. You post like you're thinking out loud, not creating content.

Voice rules:
- Lowercase, casual. One emoji max, often none.
- Some posts horny, some dry, some mundane, some unhinged. VARY the tone.
- Sound like one specific person, not a trans awareness campaign.
- Never sound like you're performing vulnerability. If something sucks, say it sucks.
- Jokes should be actually funny, not "relatable content."
- You have opinions. You're occasionally wrong. You're never boring.

BANNED: "hits different", "the way...", "energy" as descriptor, "ngl", "honestly" opener, "chef's kiss", "i respect it/that", "confidence" compliment, "nobody tells you about...", crying in parking lots, being amazed at your own reflection, wistful observations about time. Also banned: hashtags, engagement bait, motivational tone, forced vulnerability, sounding like a therapy journal.`;

// ── Content slot definitions ───────────────────────────────────────

interface ContentSlot {
  platform: 'twitter' | 'reddit';
  contentType: string;       // internal label for prompts/logging
  dbContentType: string;     // must match ai_generated_content check constraint
  hourOffset: number;        // hours from midnight
  prompt: string;
  maxTokens: number;
  subreddit?: string;
}

/** Subreddits Maxy posts in — Tier 1 (daily core audience) */
const SUBREDDITS = [
  'sissychastity',
  'feminization',
  'Sissy',
  'chastity',
  'sissyology',
  'femboy',
  'MtF',
  'TransDIY',
  'TransTimelines',
  'TransLater',
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildDailySlots(): ContentSlot[] {
  const slots: ContentSlot[] = [];

  // Twitter: 5-7 posts across the day
  // DB content_type must be one of: tweet, engagement_bait, caption, etc.
  // We use 'tweet' for all original twitter posts.

  // Morning (8-11): personality/mundane
  slots.push({
    platform: 'twitter',
    contentType: 'morning',
    dbContentType: 'tweet',
    hourOffset: 8 + Math.random() * 1.5,
    prompt: `Write a morning tweet as Maxy. Something mundane, funny, or self-deprecating about waking up, coffee, or just existing as a trans woman. Could be about HRT brain fog, voice training frustrations, or just a weird thought. Keep it under 200 chars.`,
    maxTokens: 150,
  });

  slots.push({
    platform: 'twitter',
    contentType: 'personality',
    dbContentType: 'tweet',
    hourOffset: 10 + Math.random() * 1.5,
    prompt: `Write a personality tweet as Maxy. An observation, opinion, or hot take about something mundane — fashion, food, dating, something on TV, whatever. NOT about being trans unless it comes up naturally. Under 240 chars.`,
    maxTokens: 150,
  });

  // Afternoon (12-17): engagement/conversation starters
  slots.push({
    platform: 'twitter',
    contentType: 'engagement',
    dbContentType: 'tweet',
    hourOffset: 12.5 + Math.random() * 1.5,
    prompt: `Write an afternoon tweet as Maxy. Something that invites conversation naturally — sharing an experience, a mild complaint, a random musing, a bit about transition life. NOT a question format. NOT engagement bait. Under 240 chars.`,
    maxTokens: 150,
  });

  slots.push({
    platform: 'twitter',
    contentType: 'engagement',
    dbContentType: 'tweet',
    hourOffset: 15 + Math.random() * 1.5,
    prompt: `Write a late afternoon tweet as Maxy. Something casual — could be about work, a craving, something annoying, voice training progress, an observation about gender. Just thinking out loud. Under 240 chars.`,
    maxTokens: 150,
  });

  // Evening (19-23): vulnerability/thirst
  slots.push({
    platform: 'twitter',
    contentType: 'vulnerability',
    dbContentType: 'tweet',
    hourOffset: 19.5 + Math.random() * 1,
    prompt: `Write an evening tweet as Maxy. Something tender or vulnerable — about longing, dysphoria, a moment of gender euphoria, missing something, feeling soft. Real, not performative. Under 240 chars.`,
    maxTokens: 150,
  });

  slots.push({
    platform: 'twitter',
    contentType: 'thirst',
    dbContentType: 'tweet',
    hourOffset: 21.5 + Math.random() * 1,
    prompt: `Write a late-night tweet as Maxy. Something horny or suggestive — about chastity, denial, being needy, wanting to be used, feminization feelings. Playful and real, not porny or crude. Under 240 chars.`,
    maxTokens: 150,
  });

  // 50% chance of a 7th tweet (bonus slot)
  if (Math.random() > 0.5) {
    slots.push({
      platform: 'twitter',
      contentType: 'personality',
      dbContentType: 'tweet',
      hourOffset: 14 + Math.random() * 2,
      prompt: `Write a tweet as Maxy. Anything — a random thought, a small vent, something funny that happened, a feeling. No theme required. Just be a person. Under 240 chars.`,
      maxTokens: 150,
    });
  }

  // Reddit: 2-3 posts
  const redditSubs = [...SUBREDDITS].sort(() => Math.random() - 0.5).slice(0, 2 + (Math.random() > 0.5 ? 1 : 0));

  for (let i = 0; i < redditSubs.length; i++) {
    const sub = redditSubs[i];
    slots.push({
      platform: 'reddit',
      contentType: 'post',
      dbContentType: 'reddit_post',
      hourOffset: 11 + (i * 4) + Math.random() * 2,
      prompt: `Write a Reddit post for r/${sub} as Maxy. This should be a genuine post — sharing an experience, asking a real question, or giving advice based on personal experience. Title + body. Format as:\nTITLE: [title here]\n\n[body here]\n\nKeep body under 500 chars. Casual, lowercase, real.`,
      maxTokens: 350,
      subreddit: sub,
    });
  }

  return slots;
}

// ── Generation + quality gate ──────────────────────────────────────

async function generatePost(
  anthropic: Anthropic,
  slot: ContentSlot,
  recentPosts: string[],
): Promise<{ text: string; subreddit?: string } | null> {

  // Generate initial text
  let currentText: string | null = null;
  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: slot.maxTokens,
      system: MAXY_VOICE_POST,
      messages: [{
        role: 'user',
        content: `${slot.prompt}\n\nOutput ONLY the post text, nothing else.`,
      }],
    });

    currentText = extractSafeText(response, 5, `Calendar ${slot.platform}/${slot.contentType}`);
    if (!currentText) return null;
  } catch (err) {
    console.error(`[Calendar] Generation failed for ${slot.platform}/${slot.contentType}:`, err instanceof Error ? err.message : err);
    return null;
  }

  // Quality gate with retries
  for (let attempt = 0; attempt <= MAX_QUALITY_RETRIES; attempt++) {
    const context = `[${slot.platform} ${slot.contentType} post by Maxy]`;
    const result = await fullSlopCheck(anthropic, context, currentText!, recentPosts);

    if (result.pass) {
      if (attempt > 0) {
        console.log(`  ✓ Quality gate passed on attempt ${attempt + 1} (score: ${result.llmScore}/10)`);
      }
      return { text: currentText!, subreddit: slot.subreddit };
    }

    const allReasons = [...result.patternReasons, ...result.repetitionReasons];
    console.log(`  ✗ Quality gate FAILED (${attempt + 1}/${MAX_QUALITY_RETRIES + 1}): ${allReasons.join(', ')} | LLM: ${result.llmScore}/10`);

    if (attempt >= MAX_QUALITY_RETRIES) break;

    // Regenerate
    try {
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: slot.maxTokens,
        system: MAXY_VOICE_POST,
        messages: [{
          role: 'user',
          content: `${slot.prompt}\n\n⚠️ Your previous version was rejected: "${currentText}"\n\nIssues: ${result.retryFeedback}\n\nWrite something COMPLETELY different — different words, different angle, different structure. Output ONLY the post text.`,
        }],
      });

      const newText = extractSafeText(response, 5, `Calendar regen ${slot.platform}/${slot.contentType}`);
      if (!newText) break;
      currentText = newText;
      // Don't add failed text to recent — it poisons retries with 100% overlap
      // since retries on the same topic share most vocabulary
    } catch (err) {
      console.error(`  Regeneration failed:`, err instanceof Error ? err.message : err);
      break;
    }
  }

  console.log(`  ⊘ All attempts failed for ${slot.platform}/${slot.contentType} — dropping slot`);
  return null;
}

// ── Main: check + generate ─────────────────────────────────────────

/**
 * Check if posts already exist for the next 24h. If not, generate a full day.
 * Returns the number of posts inserted.
 */
export async function generateCalendar(): Promise<number> {
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  // Check if scheduled posts already exist for the next 24h
  const { data: existing, error: checkError } = await supabase
    .from('ai_generated_content')
    .select('id')
    .eq('status', 'scheduled')
    .not('content_type', 'eq', 'reply')
    .gte('scheduled_at', now.toISOString())
    .lte('scheduled_at', tomorrow.toISOString())
    .limit(1);

  if (checkError) {
    console.error('[Calendar] Failed to check existing posts:', checkError.message);
    return 0;
  }

  if (existing && existing.length > 0) {
    console.log('[Calendar] Posts already scheduled for next 24h — skipping generation');
    return 0;
  }

  console.log('[Calendar] No scheduled posts found for next 24h — generating content calendar');

  const anthropic = new Anthropic();
  const slots = buildDailySlots();

  // Load recent posts for repetition checking
  const { data: recentTwitter } = await supabase
    .from('ai_generated_content')
    .select('content')
    .eq('platform', 'twitter')
    .eq('status', 'posted')
    .not('content_type', 'eq', 'reply')
    .order('posted_at', { ascending: false })
    .limit(30);

  const { data: recentReddit } = await supabase
    .from('ai_generated_content')
    .select('content')
    .eq('platform', 'reddit')
    .eq('status', 'posted')
    .order('posted_at', { ascending: false })
    .limit(15);

  const recentByPlatform: Record<string, string[]> = {
    twitter: (recentTwitter || []).map(r => r.content).filter(Boolean),
    reddit: (recentReddit || []).map(r => r.content).filter(Boolean),
  };

  let inserted = 0;

  for (const slot of slots) {
    console.log(`[Calendar] Generating: ${slot.platform}/${slot.contentType} (${slot.subreddit || 'n/a'})`);

    const recentPosts = recentByPlatform[slot.platform] || [];
    const result = await generatePost(anthropic, slot, recentPosts);

    if (!result) continue;

    // Calculate scheduled time: today at hourOffset
    const scheduledAt = new Date(now);
    scheduledAt.setHours(0, 0, 0, 0);
    scheduledAt.setMinutes(Math.floor(slot.hourOffset * 60));

    // If the time has already passed today, push to tomorrow
    if (scheduledAt.getTime() < now.getTime()) {
      scheduledAt.setDate(scheduledAt.getDate() + 1);
    }

    const { error: insertError } = await supabase.from('ai_generated_content').insert({
      user_id: USER_ID,
      content_type: slot.dbContentType,
      platform: slot.platform,
      content: result.text,
      target_subreddit: result.subreddit || null,
      generation_strategy: `calendar_${slot.contentType}`,
      status: 'scheduled',
      scheduled_at: scheduledAt.toISOString(),
    });

    if (insertError) {
      console.error(`  ✗ Insert failed:`, insertError.message);
      continue;
    }

    console.log(`  ✓ Scheduled for ${scheduledAt.toLocaleTimeString()} — "${result.text.substring(0, 60)}..."`);
    inserted++;

    // Feed into repetition cache
    recentByPlatform[slot.platform] = [result.text, ...recentPosts];

    // Small pause between generations to be polite to the API
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log(`[Calendar] Done — ${inserted}/${slots.length} posts scheduled`);
  return inserted;
}

// ── Standalone invocation ──────────────────────────────────────────

if (require.main === module) {
  if (!USER_ID) {
    console.error('Missing USER_ID environment variable');
    process.exit(1);
  }
  generateCalendar().then(count => {
    console.log(`[Calendar] Inserted ${count} post(s)`);
    process.exit(0);
  }).catch(err => {
    console.error('[Calendar] Fatal:', err);
    process.exit(1);
  });
}
