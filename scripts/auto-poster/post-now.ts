/**
 * Post NOW — reschedule existing scheduled posts to right now,
 * or generate fresh content for immediate posting.
 *
 * Run: npx tsx post-now.ts
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { extractSafeText } from './refusal-filter';
import { fullSlopCheck } from './slop-detector';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
);

const USER_ID = process.env.USER_ID || '';

const MAXY_VOICE = `You are Maxy (@softmaxy) — a 40-year-old trans woman on HRT. Into chastity, denial, feminization. Sharp, dry, funny, messy, real. A little dominant, a little chaotic. Lowercase, casual. One emoji max per post, often none. Never sounds like a brand. Never hashtags.

You write tweets that sound like a real person thinking out loud — not performing, not seeking engagement, not being inspirational. Some posts are horny, some are tender, some are mundane. All of them sound like one specific human being, not a content machine.

BANNED: "hits different", "the way...", "energy" as descriptor, "ngl", "honestly" as opener, "chef's kiss", "i respect it/that", "confidence" as compliment. Also banned: hashtags, engagement bait questions, motivational poster tone, forced vulnerability.`;

const MAX_RETRIES = 3;

async function main() {
  if (!USER_ID) {
    console.error('Missing USER_ID in .env');
    process.exit(1);
  }

  const now = new Date();
  console.log(`Current time: ${now.toISOString()}`);

  // Check for existing scheduled posts we can reschedule
  const { data: existing } = await supabase
    .from('ai_generated_content')
    .select('id, platform, content, scheduled_at')
    .eq('user_id', USER_ID)
    .eq('status', 'scheduled')
    .order('scheduled_at', { ascending: true });

  if (existing && existing.length > 0) {
    console.log(`\nFound ${existing.length} scheduled post(s). Rescheduling first one to NOW...`);
    const first = existing[0];

    await supabase
      .from('ai_generated_content')
      .update({ scheduled_at: now.toISOString() })
      .eq('id', first.id);

    console.log(`Rescheduled: [${first.platform}] "${first.content?.substring(0, 60)}..."`);
    console.log(`\nRun "npm run post" to post it immediately.`);
    return;
  }

  // No existing posts — generate fresh content for right now
  console.log('\nNo scheduled posts found. Generating fresh content...');

  const anthropic = new Anthropic();
  const hour = now.getHours();

  const contentType = hour < 12 ? 'personality' : hour < 18 ? 'engagement_bait' : 'vulnerability';

  // Load recent posts for repetition check
  const { data: recentData } = await supabase
    .from('ai_generated_content')
    .select('content')
    .eq('status', 'posted')
    .eq('platform', 'twitter')
    .not('content_type', 'eq', 'reply')
    .order('posted_at', { ascending: false })
    .limit(20);
  const recentPosts = (recentData || []).map(r => r.content).filter(Boolean);

  let tweetText: string | null = null;
  let retryFeedback = '';

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const prompt = retryFeedback
      ? `Write a single ${contentType} tweet as Maxy. It's ${hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'}. She's on day 7+ of denial, locked in a cage, living her structured kink life. Make it real, not performative.\n\n⚠️ SELF-EVAL FEEDBACK (attempt ${attempt + 1}): ${retryFeedback}\n\nOutput ONLY the tweet text, nothing else.`
      : `Write a single ${contentType} tweet as Maxy. It's ${hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'}. She's on day 7+ of denial, locked in a cage, living her structured kink life. Make it real, not performative. Output ONLY the tweet text, nothing else.`;

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system: MAXY_VOICE,
      messages: [{ role: 'user', content: prompt }],
    });

    const candidate = extractSafeText(response, 10, 'post-now');
    if (!candidate) {
      console.error('Failed to generate content');
      continue;
    }

    console.log(`\n  Attempt ${attempt + 1}: "${candidate}"`);

    // Quality check
    const slopResult = await fullSlopCheck(anthropic, `[twitter ${contentType} post]`, candidate, recentPosts);
    if (slopResult.pass) {
      console.log(`  ✓ Quality check passed (score: ${slopResult.llmScore}/10)`);
      tweetText = candidate;
      break;
    }

    const reasons = [...slopResult.patternReasons, ...slopResult.repetitionReasons];
    console.log(`  ✗ Quality check FAILED: ${reasons.join(', ')} | LLM: ${slopResult.llmScore}/10 — ${slopResult.llmReason}`);
    retryFeedback = slopResult.retryFeedback;
    recentPosts.unshift(candidate); // avoid repeating failed attempts
  }

  if (!tweetText) {
    console.error('\nAll attempts failed quality check. Not posting slop.');
    process.exit(1);
  }

  console.log(`\nApproved: "${tweetText}"`);

  // Insert scheduled for right now
  await supabase.from('ai_generated_content').insert({
    user_id: USER_ID,
    content_type: contentType,
    platform: 'twitter',
    content: tweetText,
    generation_strategy: contentType,
    status: 'scheduled',
    scheduled_at: now.toISOString(),
  });

  console.log('Inserted and scheduled for NOW.');
  console.log('\nRun "npm run post" to post it immediately.');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
