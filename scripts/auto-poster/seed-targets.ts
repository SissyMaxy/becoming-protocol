/**
 * Seed engagement targets — 40 mid-size accounts for reply-based growth.
 * Run: npx tsx seed-targets.ts
 */

import 'dotenv/config';
import { supabase } from './config';

const USER_ID = process.env.USER_ID || '';

const TARGETS = [
  // Sissy/feminization creators (1K-50K)
  { platform: 'twitter', handle: 'sissyhypno', type: 'similar_creator' as const, strategy: 'Sissy hypno content creator' },
  { platform: 'twitter', handle: 'feminization_', type: 'similar_creator' as const, strategy: 'Feminization journey posts' },
  { platform: 'twitter', handle: 'sissymaker', type: 'similar_creator' as const, strategy: 'Feminization transformation content' },
  { platform: 'twitter', handle: 'sissycaptions', type: 'similar_creator' as const, strategy: 'Sissy caption creator' },
  { platform: 'twitter', handle: 'crossdresserlife', type: 'similar_creator' as const, strategy: 'Crossdressing lifestyle' },
  { platform: 'twitter', handle: 'feminize_me', type: 'similar_creator' as const, strategy: 'Feminization tips and encouragement' },
  { platform: 'twitter', handle: 'sissytraining101', type: 'similar_creator' as const, strategy: 'Training and progression content' },
  { platform: 'twitter', handle: 'bimbojourney', type: 'similar_creator' as const, strategy: 'Bimbofication journey posts' },

  // Chastity/denial accounts
  { platform: 'twitter', handle: 'lockedlife', type: 'community_leader' as const, strategy: 'Male chastity lifestyle' },
  { platform: 'twitter', handle: 'chastitycage', type: 'similar_creator' as const, strategy: 'Chastity device reviews and lifestyle' },
  { platform: 'twitter', handle: 'deniedandlocked', type: 'similar_creator' as const, strategy: 'Denial journey documentation' },
  { platform: 'twitter', handle: 'keyholderlife', type: 'larger_creator' as const, strategy: 'Keyholder perspective content' },
  { platform: 'twitter', handle: 'locktober365', type: 'community_leader' as const, strategy: 'Year-round chastity content' },
  { platform: 'twitter', handle: 'orgasmdenial_', type: 'community_leader' as const, strategy: 'Orgasm denial community' },
  { platform: 'twitter', handle: 'edgingdaily', type: 'similar_creator' as const, strategy: 'Edging and denial content' },
  { platform: 'twitter', handle: 'cagecheck', type: 'similar_creator' as const, strategy: 'Daily cage check-ins' },

  // Trans creators and community
  { platform: 'twitter', handle: 'translater', type: 'community_leader' as const, strategy: 'Late transition stories' },
  { platform: 'twitter', handle: 'transtimeline', type: 'community_leader' as const, strategy: 'Transition timeline sharing' },
  { platform: 'twitter', handle: 'hrtdiaries', type: 'similar_creator' as const, strategy: 'HRT journey documentation' },
  { platform: 'twitter', handle: 'transvoicetips', type: 'similar_creator' as const, strategy: 'Voice feminization tips' },
  { platform: 'twitter', handle: 'eggirl_memes', type: 'community_leader' as const, strategy: 'Trans egg memes and community' },
  { platform: 'twitter', handle: 'transadulthood', type: 'similar_creator' as const, strategy: 'Adult transition experiences' },
  { platform: 'twitter', handle: 'transskincare', type: 'similar_creator' as const, strategy: 'Skincare for trans women' },
  { platform: 'twitter', handle: 'latebloomer_t', type: 'similar_creator' as const, strategy: 'Late bloomer trans experiences' },

  // AI/tech dom accounts
  { platform: 'twitter', handle: 'aidomme', type: 'similar_creator' as const, strategy: 'AI domination concepts' },
  { platform: 'twitter', handle: 'techkink', type: 'similar_creator' as const, strategy: 'Technology and kink intersection' },
  { platform: 'twitter', handle: 'smartlockdom', type: 'similar_creator' as const, strategy: 'Smart lock chastity tech' },
  { platform: 'twitter', handle: 'lovenselife', type: 'community_leader' as const, strategy: 'Lovense user community' },
  { platform: 'twitter', handle: 'quantifiedkink', type: 'similar_creator' as const, strategy: 'Data-driven kink exploration' },
  { platform: 'twitter', handle: 'algorithmdom', type: 'similar_creator' as const, strategy: 'Algorithmic dominance concepts' },
  { platform: 'twitter', handle: 'biometrickink', type: 'similar_creator' as const, strategy: 'Biometrics meets kink' },
  { platform: 'twitter', handle: 'whoopkink', type: 'similar_creator' as const, strategy: 'Whoop data in D/s context' },

  // Kink community figures
  { platform: 'twitter', handle: 'kinkeducator', type: 'community_leader' as const, strategy: 'Kink education and safety' },
  { platform: 'twitter', handle: 'subspacedaily', type: 'similar_creator' as const, strategy: 'Subspace experiences' },
  { platform: 'twitter', handle: 'dslifestyle', type: 'similar_creator' as const, strategy: 'D/s relationship content' },
  { platform: 'twitter', handle: 'fetlifepeople', type: 'community_leader' as const, strategy: 'FetLife community crosspost' },
  { platform: 'twitter', handle: 'kinkpositivity', type: 'community_leader' as const, strategy: 'Kink-positive content' },
  { platform: 'twitter', handle: 'aftercaredaily', type: 'similar_creator' as const, strategy: 'Aftercare and sub welfare' },
  { platform: 'twitter', handle: 'protocoldaily', type: 'similar_creator' as const, strategy: 'D/s protocol content' },
  { platform: 'twitter', handle: 'surrenderdaily', type: 'similar_creator' as const, strategy: 'Surrender and submission content' },
];

async function main() {
  if (!USER_ID) {
    console.error('Missing USER_ID in .env');
    process.exit(1);
  }

  console.log(`Seeding ${TARGETS.length} engagement targets...`);

  let inserted = 0;
  for (const target of TARGETS) {
    // Check if already exists
    const { count } = await supabase
      .from('engagement_targets')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', USER_ID)
      .eq('platform', target.platform)
      .eq('target_handle', target.handle);

    if ((count || 0) > 0) {
      console.log(`  ⊘ ${target.handle} already exists, skipping`);
      inserted++;
      continue;
    }

    const { error } = await supabase.from('engagement_targets').insert({
      user_id: USER_ID,
      platform: target.platform,
      target_handle: target.handle,
      target_type: target.type,
      strategy: target.strategy,
    });

    if (error) {
      console.error(`  ✗ ${target.username}: ${error.message}`);
    } else {
      console.log(`  ✓ ${target.handle} (${target.type})`);
      inserted++;
    }
  }

  console.log(`\nDone: ${inserted}/${TARGETS.length} targets seeded.`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
