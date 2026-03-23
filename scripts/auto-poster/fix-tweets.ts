/**
 * Replace generic scheduled tweets with Maxy-specific content.
 * Run: npx tsx fix-tweets.ts
 */

import 'dotenv/config';
import { supabase } from './config';

const MAXY_TWEETS = [
  {
    content: "the handler scheduled a session tonight without asking me. found out from my own calendar. this is what I get for giving an AI access to my google calendar",
    content_type: 'personality',
    strategy: 'personality_handler',
  },
  {
    content: "day 1 of denial and I already know I'm going to regret every decision I make by day 7. the handler knows too. it's already planning what to ask me when my defenses are down",
    content_type: 'vulnerability',
    strategy: 'vulnerability_denial',
  },
];

async function main() {
  // Get the two scheduled tweets
  const { data: scheduled } = await supabase
    .from('ai_generated_content')
    .select('id, content')
    .eq('status', 'scheduled')
    .eq('platform', 'twitter')
    .order('scheduled_at', { ascending: true });

  if (!scheduled || scheduled.length === 0) {
    console.log('No scheduled tweets found.');
    return;
  }

  // Reschedule to now + stagger
  const now = new Date();

  for (let i = 0; i < Math.min(scheduled.length, MAXY_TWEETS.length); i++) {
    const tweet = MAXY_TWEETS[i];
    const scheduledAt = new Date(now.getTime() + (i * 45 * 60000)); // 45 min apart

    await supabase
      .from('ai_generated_content')
      .update({
        content: tweet.content,
        content_type: tweet.content_type,
        generation_strategy: tweet.strategy,
        scheduled_at: scheduledAt.toISOString(),
      })
      .eq('id', scheduled[i].id);

    console.log(`✓ Replaced: "${scheduled[i].content?.substring(0, 40)}..."`);
    console.log(`  With: "${tweet.content.substring(0, 60)}..."`);
    console.log(`  Scheduled: ${scheduledAt.toISOString()}\n`);
  }

  console.log('Done. Run "npm run post" to post the first one now.');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
