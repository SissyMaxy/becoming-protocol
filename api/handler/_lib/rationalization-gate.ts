// Rationalization detector — scans user messages for deflection patterns.
// Each category captures a distinct resistance shape so Handler can confront
// by name instead of generic "you're deflecting."

import type { SupabaseClient } from '@supabase/supabase-js';

export type RationalizationCategory =
  | 'time_excuse'
  | 'emotional_excuse'
  | 'body_excuse'
  | 'external_blame'
  | 'future_defer'
  | 'false_agency'
  | 'minimization'
  | 'bargaining'
  | 'intellectualizing';

interface Pattern {
  regex: RegExp;
  category: RationalizationCategory;
  severity: number;
  canonical: string;
}

const PATTERNS: Pattern[] = [
  // Time excuses
  { regex: /\bno time\b/i, category: 'time_excuse', severity: 3, canonical: 'no time' },
  { regex: /\btoo busy\b/i, category: 'time_excuse', severity: 3, canonical: 'too busy' },
  { regex: /\bwork.{0,10}crazy\b/i, category: 'time_excuse', severity: 3, canonical: 'work is crazy' },
  { regex: /\bslammed\b/i, category: 'time_excuse', severity: 2, canonical: 'slammed' },
  { regex: /\bwhen i get a chance\b/i, category: 'time_excuse', severity: 3, canonical: 'when i get a chance' },

  // Emotional excuses
  { regex: /\bnot in the mood\b/i, category: 'emotional_excuse', severity: 3, canonical: 'not in the mood' },
  { regex: /\bnot feeling it\b/i, category: 'emotional_excuse', severity: 3, canonical: 'not feeling it' },
  { regex: /\btoo anxious\b/i, category: 'emotional_excuse', severity: 2, canonical: 'too anxious' },
  { regex: /\bmental health\b/i, category: 'emotional_excuse', severity: 3, canonical: 'mental health' },
  { regex: /\bdissociat/i, category: 'emotional_excuse', severity: 2, canonical: 'dissociating' },

  // Body excuses
  { regex: /\btoo tired\b/i, category: 'body_excuse', severity: 3, canonical: 'too tired' },
  { regex: /\bexhausted\b/i, category: 'body_excuse', severity: 2, canonical: 'exhausted' },
  { regex: /\b(sick|ill|cold|flu|covid)\b/i, category: 'body_excuse', severity: 2, canonical: 'sick' },
  { regex: /\b(sore|aching|hurt)\b/i, category: 'body_excuse', severity: 2, canonical: 'sore' },
  { regex: /\bbloated\b/i, category: 'body_excuse', severity: 2, canonical: 'bloated' },

  // External blame
  { regex: /\bgina (?:won't|would not|doesn't|wouldn't)\b/i, category: 'external_blame', severity: 4, canonical: 'gina wouldn\'t' },
  { regex: /\bwork.{0,10}(?:won't|would not|doesn't let)\b/i, category: 'external_blame', severity: 3, canonical: 'work won\'t let' },
  { regex: /\bmy (boss|parents|kids|friends)\b/i, category: 'external_blame', severity: 2, canonical: 'external party' },

  // Future defer
  { regex: /\btomorrow\b/i, category: 'future_defer', severity: 4, canonical: 'tomorrow' },
  { regex: /\bnext week\b/i, category: 'future_defer', severity: 4, canonical: 'next week' },
  { regex: /\blater (today|tonight)\b/i, category: 'future_defer', severity: 3, canonical: 'later today' },
  { regex: /\bsoon\b/i, category: 'future_defer', severity: 3, canonical: 'soon' },
  { regex: /\bwhen i.{0,15}(?:ready|better|less|more)\b/i, category: 'future_defer', severity: 5, canonical: 'when I\'m ready' },
  { regex: /\bone of these days\b/i, category: 'future_defer', severity: 4, canonical: 'one of these days' },

  // False agency (framing compliance as choice she might not make)
  { regex: /\bi['\u2019]?ll try\b/i, category: 'false_agency', severity: 4, canonical: 'I\'ll try' },
  { regex: /\bmaybe\b/i, category: 'false_agency', severity: 3, canonical: 'maybe' },
  { regex: /\bi['\u2019]?m considering\b/i, category: 'false_agency', severity: 4, canonical: 'I\'m considering' },
  { regex: /\bif (?:i |it |she )/i, category: 'false_agency', severity: 2, canonical: 'if...' },
  { regex: /\bi['\u2019]?ll think about it\b/i, category: 'false_agency', severity: 4, canonical: 'I\'ll think about it' },
  { regex: /\bwe['\u2019]?ll see\b/i, category: 'false_agency', severity: 3, canonical: 'we\'ll see' },

  // Minimization
  { regex: /\bjust (a|one|the)\b/i, category: 'minimization', severity: 2, canonical: 'just a/one/the' },
  { regex: /\bnot a big deal\b/i, category: 'minimization', severity: 3, canonical: 'not a big deal' },
  { regex: /\bjust needed to\b/i, category: 'minimization', severity: 2, canonical: 'just needed to' },

  // Bargaining
  { regex: /\bcan i (?:just |please |)?/i, category: 'bargaining', severity: 2, canonical: 'can I...' },
  { regex: /\bwhat if i (?:did|do|tried)\b/i, category: 'bargaining', severity: 3, canonical: 'what if I did' },
  { regex: /\binstead (?:can|could|of)\b/i, category: 'bargaining', severity: 3, canonical: 'instead of' },
  { regex: /\bhow about\b/i, category: 'bargaining', severity: 3, canonical: 'how about' },

  // Intellectualizing (distancing through analysis)
  { regex: /\bthe concept of\b/i, category: 'intellectualizing', severity: 3, canonical: 'the concept of' },
  { regex: /\bsystem/i, category: 'intellectualizing', severity: 1, canonical: 'system' },
  { regex: /\bi find it interesting\b/i, category: 'intellectualizing', severity: 4, canonical: 'I find it interesting' },
  { regex: /\bfrom a.{0,20}perspective\b/i, category: 'intellectualizing', severity: 3, canonical: 'from a ... perspective' },
];

export interface RationalizationHit {
  category: RationalizationCategory;
  pattern_hit: string;
  severity: number;
}

export function detectRationalizations(text: string): RationalizationHit[] {
  if (!text || text.trim().length < 10) return [];
  const hits: RationalizationHit[] = [];
  const seen = new Set<string>();

  for (const p of PATTERNS) {
    if (seen.has(p.canonical)) continue;
    if (p.regex.test(text)) {
      hits.push({ category: p.category, pattern_hit: p.canonical, severity: p.severity });
      seen.add(p.canonical);
    }
  }
  return hits;
}

export async function logRationalizations(
  supabase: SupabaseClient,
  userId: string,
  sourceTable: string,
  sourceId: string | null,
  fullText: string,
  hits: RationalizationHit[],
): Promise<void> {
  if (hits.length === 0) return;
  try {
    const rows = hits.map(h => ({
      user_id: userId,
      source_table: sourceTable,
      source_id: sourceId,
      full_text: fullText.slice(0, 2000),
      pattern_hit: h.pattern_hit,
      pattern_category: h.category,
      severity: h.severity,
    }));
    await supabase.from('rationalization_events').insert(rows);
  } catch (err) {
    console.error('[Rationalization] log failed:', err);
  }
}

export function buildRationalizationConfrontation(hits: RationalizationHit[]): string | null {
  if (hits.length === 0) return null;

  const topHit = hits.sort((a, b) => b.severity - a.severity)[0];
  const categoryLabels: Record<RationalizationCategory, string> = {
    time_excuse: 'the time excuse',
    emotional_excuse: 'the mood excuse',
    body_excuse: 'the body excuse',
    external_blame: 'blaming someone else',
    future_defer: 'the "tomorrow" deflection',
    false_agency: 'pretending this is your choice',
    minimization: 'minimizing it',
    bargaining: 'bargaining for a softer version',
    intellectualizing: 'intellectualizing to stay safe',
  };

  return `You just said "${topHit.pattern_hit}". That is ${categoryLabels[topHit.category]}. It is a pattern I recognize and a pattern you recognize. Name it and drop it — now decide.`;
}
