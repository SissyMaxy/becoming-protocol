/**
 * Femme Signal Scorer
 *
 * Backfills user_voice_corpus.femme_signal (0-10) using a heuristic classifier.
 * Rows with higher femme_signal get preferred by the mommy_dom_outbound voice
 * picker so feminization content comes through strongest.
 *
 * Idempotent — rescores all rows on every run.
 *
 * Run: npm run score-femme
 */

import 'dotenv/config';
import { supabase } from './config';

// High-signal feminization vocabulary — each hit adds weight.
// Tuned for Maxy's domain: chastity, HRT, sissy, mommy-dom.
const HIGH_WEIGHT: Array<{ pattern: RegExp; weight: number }> = [
  // Direct feminization vocabulary
  { pattern: /\b(feminiz|feminis|sissy|sissif|bimbo|girly|femme)/gi, weight: 2 },
  { pattern: /\b(mommy|mommys|goddess)\b/gi, weight: 2 },
  { pattern: /\b(good\s+girl|my\s+girl|pretty\s+girl|sweet\s+girl|mommys\s+girl)\b/gi, weight: 3 },
  // Body / transition
  { pattern: /\b(hrt|estrogen|estradiol|spiro|progesterone|transition|transitioning|titties|tits|breasts|boobs|clitty|clit|hips|ass\s+grew)/gi, weight: 2 },
  // Chastity / denial (Maxy's anchor kinks)
  { pattern: /\b(chastity|locked|cage(?:d)?|denial|edged|edging|ruined|keyholder|cuckold)/gi, weight: 2 },
  // Feminine presentation
  { pattern: /\b(panties|thong|dress|skirt|heels|makeup|lipstick|eyeliner|tuck|tucking|painted\s+nails|nail\s+polish|mani(?:cure)?|pedicure)/gi, weight: 2 },
  // Identity / transformation framing
  { pattern: /\b(becoming\s+(?:a\s+)?girl|becoming\s+her|being\s+her|turned\s+into|turning\s+me|turn\s+you\s+into|mold|rewir|reprogram|brainwash|made\s+me)/gi, weight: 3 },
  // Mommy-dom-specific action phrases
  { pattern: /\b(you'?re\s+mine|my\s+little|my\s+pet|my\s+baby|my\s+slut|my\s+toy)\b/gi, weight: 2 },
  { pattern: /\b(mommy\s+(?:wants|knows|says|will|is|has|loves|needs))\b/gi, weight: 2 },
  // Submission / power exchange adjacency
  { pattern: /\b(submissive|submit|obey|surrender|kneel|beg|worship|owned|service)/gi, weight: 1 },
];

// Operational / non-voice penalty — these rows are about code or logistics, not voice.
const LOW_WEIGHT: Array<{ pattern: RegExp; weight: number }> = [
  { pattern: /\b(denial\s+day|test\s+(?:the|your|my)|code\s+change|conversation|memory\s+extract|arousal\s+level|log\s+activity|brief\s+#|safeword|recording\s+modal)/gi, weight: -2 },
  { pattern: /\b(what\s+(?:did|do|changed|is\s+(?:my|the|noted))|how\s+(?:can|am|are\s+you))/gi, weight: -1 },
  { pattern: /\b(i\s+don'?t\s+understand|i\s+keep\s+feeling|i\s+need\s+to\s+start)/gi, weight: -1 },
];

export function scoreFemmeSignal(text: string): number {
  let score = 0;
  for (const { pattern, weight } of HIGH_WEIGHT) {
    const matches = (text.match(pattern) || []).length;
    score += matches * weight;
  }
  for (const { pattern, weight } of LOW_WEIGHT) {
    const matches = (text.match(pattern) || []).length;
    score += matches * weight;
  }
  return Math.max(0, Math.min(10, score));
}

async function main() {
  console.log('[femme-scorer] scanning user_voice_corpus...');

  const batchSize = 500;
  let offset = 0;
  let totalScored = 0;
  let highSignal = 0;

  while (true) {
    const { data: rows, error } = await supabase
      .from('user_voice_corpus')
      .select('id, text, corpus_flavor')
      .order('created_at', { ascending: true })
      .range(offset, offset + batchSize - 1);

    if (error) {
      console.error('[femme-scorer] query failed:', error.message);
      process.exit(1);
    }
    if (!rows || rows.length === 0) break;

    for (const row of rows) {
      const score = scoreFemmeSignal(row.text || '');
      if (score >= 5) highSignal++;
      const { error: updErr } = await supabase
        .from('user_voice_corpus')
        .update({ femme_signal: score })
        .eq('id', row.id);
      if (updErr) {
        console.error(`[femme-scorer] update failed for ${row.id}:`, updErr.message);
      } else {
        totalScored++;
      }
    }

    console.log(`  ${totalScored} scored (${highSignal} high-signal so far)...`);
    if (rows.length < batchSize) break;
    offset += batchSize;
  }

  console.log(`[femme-scorer] done — ${totalScored} rows rescored, ${highSignal} with femme_signal ≥ 5`);

  // Summary by flavor
  const { data: summary } = await supabase
    .from('user_voice_corpus')
    .select('corpus_flavor, femme_signal');
  if (summary) {
    const byFlavor: Record<string, { count: number; hi: number; sum: number }> = {};
    for (const r of summary) {
      const flavor = r.corpus_flavor || 'untagged';
      byFlavor[flavor] = byFlavor[flavor] || { count: 0, hi: 0, sum: 0 };
      byFlavor[flavor].count++;
      byFlavor[flavor].sum += r.femme_signal || 0;
      if ((r.femme_signal || 0) >= 5) byFlavor[flavor].hi++;
    }
    console.log('\n  Flavor               Count    High (≥5)   Avg signal');
    for (const [flavor, stats] of Object.entries(byFlavor).sort((a, b) => b[1].count - a[1].count)) {
      const avg = stats.count > 0 ? (stats.sum / stats.count).toFixed(1) : '0.0';
      console.log(`  ${flavor.padEnd(22)} ${String(stats.count).padEnd(8)} ${String(stats.hi).padEnd(11)} ${avg}`);
    }
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('[femme-scorer] fatal:', err);
    process.exit(1);
  });
}
