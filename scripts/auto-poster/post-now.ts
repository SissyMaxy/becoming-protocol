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

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
);

const USER_ID = process.env.USER_ID || '';

const MAXY_VOICE = `You are Maxy — a woman in transformation, playful, flirty, a little submissive, confident in her sexuality, vulnerable about her journey. Lowercase casual. Playful and teasing. Sexually confident but not crude. Uses "lol" and "tbh" naturally. One emoji max per post, often none.`;

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

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 200,
    system: MAXY_VOICE,
    messages: [{
      role: 'user',
      content: `Write a single ${contentType} tweet as Maxy. It's ${hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'}. She's on day 7+ of denial, in a cage, controlled by her Handler AI. Make it real, not performative. Output ONLY the tweet text, nothing else.`,
    }],
  });

  const tweetText = extractSafeText(response, 10, 'post-now');

  if (!tweetText) {
    console.error('Failed to generate content');
    process.exit(1);
  }

  console.log(`\nGenerated: "${tweetText}"`);

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
