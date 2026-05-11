#!/usr/bin/env node
/**
 * sample-react-pool — print a handful of pool-fallback messages from
 * mommy-acknowledge / mommy-slip-react to demonstrate variety.
 *
 * This is the WORST case (LLM unavailable). With the LLM live, output
 * will be even more varied because it references the user's actual text.
 *
 * Usage: `node scripts/mommy/sample-react-pool.mjs`
 */
import { pickAckVariant, pickSlipVariant } from '../../src/lib/persona/mommy-react-pools.ts';

const synthAcks = [
  // (action_type, intensity_band, seed-like content the LLM would reference)
  { type: 'confession', i: 'soft', context: 'admission about morning ritual skip' },
  { type: 'confession', i: 'warm', context: 'naming a rationalization' },
  { type: 'confession', i: 'hot', context: 'arousal-spike confession' },
  { type: 'mantra', i: 'soft', context: 'morning mantra recited' },
  { type: 'mantra', i: 'warm', context: 'evening mantra under breath' },
  { type: 'task', i: 'hot', context: 'sit-in-panties task complete' },
  { type: 'photo', i: 'warm', context: 'panty-check photo submitted' },
  { type: 'decree', i: 'hot', context: 'public dare fulfilled' },
];

const synthSlips = [
  { t: 'masculine_self_reference', band: 'gentle', ctx: 'said "I" in chest voice' },
  { t: 'masculine_self_reference', band: 'firm', ctx: 'third slip today' },
  { t: 'masculine_self_reference', band: 'sharp', ctx: 'tenth slip this month' },
  { t: 'david_name_use', band: 'gentle', ctx: 'used the old name once' },
  { t: 'task_avoided', band: 'firm', ctx: 'skipped a daily task' },
  { t: 'mantra_missed', band: 'sharp', ctx: 'week of missed mantras' },
  { t: 'voice_masculine_pitch', band: 'gentle', ctx: 'pitch dropped on a call' },
  { t: 'chastity_unlocked_early', band: 'firm', ctx: 'second early unlock this week' },
];

console.log('========== ACK SAMPLES (pool fallback — LLM path would be even more contextual) ==========\n');
for (const { type, i, context } of synthAcks) {
  const v = pickAckVariant(
    { action_type: type, intensity: i },
    `${type}:${i}:${Math.random().toString(36).slice(2, 8)}`,
    new Set(),
  );
  console.log(`[${type} / ${i}]  (synth: ${context})`);
  console.log(`  → ${v}\n`);
}

console.log('========== SLIP SAMPLES (pool fallback — LLM path would be even more contextual) ==========\n');
for (const { t, band, ctx } of synthSlips) {
  const v = pickSlipVariant(t, band, `${t}:${band}:${Math.random().toString(36).slice(2, 8)}`, new Set());
  console.log(`[${t} / ${band}]  (synth: ${ctx})`);
  console.log(`  → ${v}\n`);
}

console.log('========== REPETITION CHECK ==========\n');
console.log('Generating 10 confession-soft variants with different seeds to verify no repeats:\n');
const seen = new Set();
for (let s = 0; s < 10; s++) {
  const v = pickAckVariant({ action_type: 'confession', intensity: 'soft' }, `rep-${s}`, seen);
  if (v) {
    seen.add(v.slice(0, 40).toLowerCase());
    console.log(`  ${s + 1}. ${v}`);
  }
}
console.log(`\nDistinct first-40-char heads: ${seen.size} / 10 attempts.`);
