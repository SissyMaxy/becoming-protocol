// One-shot cleanup for the 2026-05-11 Mommy-autoplay spam.
//
// Marks all PENDING handler_outreach_queue rows from synthetic sources as
// 'superseded' so the user's queue clears. After migration 367 + the
// handler-autonomous code disable, no new rows from these sources should
// land — but anything queued before the deploy is still pending delivery.
//
// Sources cleaned:
//   - random_reward       (handler-autonomous randomRewardSchedule — disabled)
//   - mommy_immediate     (trg_mommy_immediate_on_slip — now gates on is_synthetic)
//   - mommy_receipt       (trg_mommy_receipt_on_confession — now gates on is_machine_generated)
//
// Usage:
//   node scripts/one-shot/clear-synthetic-outreach-spam.mjs            # dry-run
//   APPLY=1 node scripts/one-shot/clear-synthetic-outreach-spam.mjs    # actually update
//
// Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://atevwvexapiykchvqvhm.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APPLY = process.env.APPLY === '1';

if (!SERVICE_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY not set in env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
const SYNTHETIC_SOURCES = ['random_reward', 'mommy_immediate', 'mommy_receipt'];

async function main() {
  // 1. Count what we'd touch
  const counts = {};
  for (const src of SYNTHETIC_SOURCES) {
    const { count, error } = await supabase
      .from('handler_outreach_queue')
      .select('id', { count: 'exact', head: true })
      .eq('source', src)
      .eq('status', 'pending');
    if (error) throw error;
    counts[src] = count ?? 0;
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log('Pending synthetic outreach rows:');
  for (const src of SYNTHETIC_SOURCES) {
    console.log(`  ${src}: ${counts[src]}`);
  }
  console.log(`  total: ${total}`);

  if (total === 0) {
    console.log('Nothing to clean.');
    return;
  }

  if (!APPLY) {
    console.log('\nDry-run. Re-run with APPLY=1 to actually mark these as superseded.');
    return;
  }

  // 2. Update — chunk by source so a failure on one doesn't block the others
  let updated = 0;
  for (const src of SYNTHETIC_SOURCES) {
    if (counts[src] === 0) continue;
    const { data, error } = await supabase
      .from('handler_outreach_queue')
      .update({ status: 'superseded' })
      .eq('source', src)
      .eq('status', 'pending')
      .select('id');
    if (error) {
      console.error(`Failed to update ${src}:`, error.message);
      continue;
    }
    const n = (data || []).length;
    updated += n;
    console.log(`Cleared ${n} ${src} rows.`);
  }
  console.log(`Total cleared: ${updated}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
