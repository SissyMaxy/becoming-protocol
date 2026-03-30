/**
 * Replace generic scheduled tweets with Maxy-specific content.
 * Run: npx tsx fix-tweets.ts
 */

import 'dotenv/config';
import { supabase } from './config';

const MAXY_TWEETS = [
  {
    content: "the handler scheduled a session tonight without asking me. found out from my own calendar. this is what I get for giving an AI access to my google calendar",
    content_type: 'tweet',
    strategy: 'personality_handler',
  },
  {
    content: "day 1 of denial and I already know I'm going to regret every decision I make by day 7. the handler knows too. it's already planning what to ask me when my defenses are down",
    content_type: 'tweet',
    strategy: 'vulnerability_denial',
  },
];

async function main() {
  // Get ALL scheduled tweets
  const { data: scheduled, error } = await supabase
    .from('ai_generated_content')
    .select('id, content, scheduled_at, status')
    .eq('status', 'scheduled')
    .order('scheduled_at', { ascending: true });

  if (error) {
    console.error('Query error:', error.message);
    return;
  }

  if (!scheduled || scheduled.length === 0) {
    console.log('No scheduled posts found.');
    return;
  }

  console.log(`Found ${scheduled.length} scheduled post(s). Updating...\n`);

  const now = new Date();

  for (let i = 0; i < Math.min(scheduled.length, MAXY_TWEETS.length); i++) {
    const tweet = MAXY_TWEETS[i];
    const scheduledAt = new Date(now.getTime() + (i * 45 * 60000)); // 45 min apart

    const { error: updateErr, count } = await supabase
      .from('ai_generated_content')
      .update({
        content: tweet.content,
        content_type: tweet.content_type,
        generation_strategy: tweet.strategy,
        scheduled_at: scheduledAt.toISOString(),
      })
      .eq('id', scheduled[i].id)
      .select('id', { count: 'exact', head: true });

    if (updateErr) {
      console.error(`✗ Update failed for ${scheduled[i].id}: ${updateErr.message}`);
    } else {
      console.log(`✓ Updated row ${scheduled[i].id}`);
      console.log(`  Old: "${scheduled[i].content?.substring(0, 50)}..."`);
      console.log(`  New: "${tweet.content.substring(0, 60)}..."`);
      console.log(`  Scheduled: ${scheduledAt.toISOString()}\n`);
    }
  }

  console.log('Done. Run "npm run post" to post the first one now.');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
