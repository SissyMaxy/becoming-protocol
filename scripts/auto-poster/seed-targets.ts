/**
 * Seed engagement targets — 40 mid-size accounts for reply-based growth.
 * Run: npx tsx seed-targets.ts
 */

import 'dotenv/config';
import { supabase } from './config';

const USER_ID = process.env.USER_ID || '';

const TARGETS = [
  // Sissy/feminization creators (1K-50K)
  { platform: 'twitter', username: 'sissyhypno', niche: 'sissy_feminization', notes: 'Sissy hypno content creator' },
  { platform: 'twitter', username: 'feminization_', niche: 'sissy_feminization', notes: 'Feminization journey posts' },
  { platform: 'twitter', username: 'sissymaker', niche: 'sissy_feminization', notes: 'Feminization transformation content' },
  { platform: 'twitter', username: 'sissycaptions', niche: 'sissy_feminization', notes: 'Sissy caption creator' },
  { platform: 'twitter', username: 'crossdresserlife', niche: 'sissy_feminization', notes: 'Crossdressing lifestyle' },
  { platform: 'twitter', username: 'feminize_me', niche: 'sissy_feminization', notes: 'Feminization tips and encouragement' },
  { platform: 'twitter', username: 'sissytraining101', niche: 'sissy_feminization', notes: 'Training and progression content' },
  { platform: 'twitter', username: 'bimbojourney', niche: 'sissy_feminization', notes: 'Bimbofication journey posts' },

  // Chastity/denial accounts
  { platform: 'twitter', username: 'lockedlife', niche: 'chastity_denial', notes: 'Male chastity lifestyle' },
  { platform: 'twitter', username: 'chastitycage', niche: 'chastity_denial', notes: 'Chastity device reviews and lifestyle' },
  { platform: 'twitter', username: 'deniedandlocked', niche: 'chastity_denial', notes: 'Denial journey documentation' },
  { platform: 'twitter', username: 'keyholderlife', niche: 'chastity_denial', notes: 'Keyholder perspective content' },
  { platform: 'twitter', username: 'locktober365', niche: 'chastity_denial', notes: 'Year-round chastity content' },
  { platform: 'twitter', username: 'orgasmdenial_', niche: 'chastity_denial', notes: 'Orgasm denial community' },
  { platform: 'twitter', username: 'edgingdaily', niche: 'chastity_denial', notes: 'Edging and denial content' },
  { platform: 'twitter', username: 'cagecheck', niche: 'chastity_denial', notes: 'Daily cage check-ins' },

  // Trans creators and community
  { platform: 'twitter', username: 'translater', niche: 'trans_community', notes: 'Late transition stories' },
  { platform: 'twitter', username: 'transtimeline', niche: 'trans_community', notes: 'Transition timeline sharing' },
  { platform: 'twitter', username: 'hrtdiaries', niche: 'trans_community', notes: 'HRT journey documentation' },
  { platform: 'twitter', username: 'transvoicetips', niche: 'trans_community', notes: 'Voice feminization tips' },
  { platform: 'twitter', username: 'eggirl_memes', niche: 'trans_community', notes: 'Trans egg memes and community' },
  { platform: 'twitter', username: 'transadulthood', niche: 'trans_community', notes: 'Adult transition experiences' },
  { platform: 'twitter', username: 'transskincare', niche: 'trans_community', notes: 'Skincare for trans women' },
  { platform: 'twitter', username: 'latebloomer_t', niche: 'trans_community', notes: 'Late bloomer trans experiences' },

  // AI/tech dom accounts
  { platform: 'twitter', username: 'aidomme', niche: 'ai_techdom', notes: 'AI domination concepts' },
  { platform: 'twitter', username: 'techkink', niche: 'ai_techdom', notes: 'Technology and kink intersection' },
  { platform: 'twitter', username: 'smartlockdom', niche: 'ai_techdom', notes: 'Smart lock chastity tech' },
  { platform: 'twitter', username: 'lovenselife', niche: 'ai_techdom', notes: 'Lovense user community' },
  { platform: 'twitter', username: 'quantifiedkink', niche: 'ai_techdom', notes: 'Data-driven kink exploration' },
  { platform: 'twitter', username: 'algorithmdom', niche: 'ai_techdom', notes: 'Algorithmic dominance concepts' },
  { platform: 'twitter', username: 'biometrickink', niche: 'ai_techdom', notes: 'Biometrics meets kink' },
  { platform: 'twitter', username: 'whoopkink', niche: 'ai_techdom', notes: 'Whoop data in D/s context' },

  // Kink community figures
  { platform: 'twitter', username: 'kinkeducator', niche: 'kink_community', notes: 'Kink education and safety' },
  { platform: 'twitter', username: 'subspacedaily', niche: 'kink_community', notes: 'Subspace experiences' },
  { platform: 'twitter', username: 'dslifestyle', niche: 'kink_community', notes: 'D/s relationship content' },
  { platform: 'twitter', username: 'fetlifepeople', niche: 'kink_community', notes: 'FetLife community crosspost' },
  { platform: 'twitter', username: 'kinkpositivity', niche: 'kink_community', notes: 'Kink-positive content' },
  { platform: 'twitter', username: 'aftercaredaily', niche: 'kink_community', notes: 'Aftercare and sub welfare' },
  { platform: 'twitter', username: 'protocoldaily', niche: 'kink_community', notes: 'D/s protocol content' },
  { platform: 'twitter', username: 'surrenderdaily', niche: 'kink_community', notes: 'Surrender and submission content' },
];

async function main() {
  if (!USER_ID) {
    console.error('Missing USER_ID in .env');
    process.exit(1);
  }

  console.log(`Seeding ${TARGETS.length} engagement targets...`);

  let inserted = 0;
  for (const target of TARGETS) {
    const { error } = await supabase.from('engagement_targets').upsert({
      user_id: USER_ID,
      platform: target.platform,
      target_username: target.username,
      target_niche: target.niche,
      notes: target.notes,
      priority: target.niche === 'sissy_feminization' || target.niche === 'chastity_denial' ? 'high' : 'medium',
      status: 'active',
    }, {
      onConflict: 'user_id,platform,target_username',
    });

    if (error) {
      console.error(`  ✗ ${target.username}: ${error.message}`);
    } else {
      console.log(`  ✓ ${target.username} (${target.niche})`);
      inserted++;
    }
  }

  console.log(`\nDone: ${inserted}/${TARGETS.length} targets seeded.`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
