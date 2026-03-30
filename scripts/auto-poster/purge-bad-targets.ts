/**
 * One-time cleanup — remove the bad targets from the first discovery run
 * and all the original fake seed targets.
 * Run: npx tsx purge-bad-targets.ts
 */

import 'dotenv/config';
import { supabase } from './config';

const USER_ID = process.env.USER_ID || '';

async function main() {
  if (!USER_ID) { console.error('Missing USER_ID'); process.exit(1); }

  // Delete ALL current twitter targets — repopulate with better-targeted discovery
  const { data, error } = await supabase
    .from('engagement_targets')
    .delete()
    .eq('user_id', USER_ID)
    .eq('platform', 'twitter')
    .select('target_handle');

  if (error) {
    console.error('Error:', error.message);
  } else {
    console.log(`Purged ${data?.length || 0} twitter targets.`);
    console.log('Run: npx tsx discover-targets.ts');
  }
}

main();
