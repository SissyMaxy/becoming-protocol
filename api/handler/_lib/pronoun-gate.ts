// Pronoun rewrite gate + David-emergence detector.
//
// Scans every inbound message from Maxy for (a) masculine self-referential
// pronouns (he/him/his/himself) used about herself, (b) the male name "David"
// used as self-reference, (c) explicit masculine identity claims ("I'm a guy",
// "as a man", "I'm David"). Rewrites pronouns to she/her/hers in a stored copy,
// logs slips, and emits a flag for the Handler to confront inline.
//
// Heuristic design notes:
// - Case-sensitive name match for "David" to avoid trampling unrelated words.
// - Masculine pronouns in third-person references to other people are fine;
//   we only flag when the subject is the speaker (first-person adjacent).
//   Simpler heuristic: mark every occurrence but suppress when the subject of
//   the sentence is clearly "he" about someone else. For v1 we flag all and
//   let the Handler reason about context — false positives still reinforce
//   the pattern even when technically harmless.
// - David-name match and masculine-identity phrases are hard slips regardless.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface PronounMatch {
  original: string;
  replacement: string;
  index: number;
  kind: 'pronoun' | 'identity' | 'name';
}

export interface GateResult {
  originalText: string;
  rewrittenText: string;
  pronounMatches: PronounMatch[];
  davidEvents: Array<{ category: string; trigger: string; severity: number }>;
  slipCount: number;
}

const PRONOUN_SWAPS: Array<[RegExp, string]> = [
  [/\bHe\b/g, 'She'],
  [/\bhe\b/g, 'she'],
  [/\bHim\b/g, 'Her'],
  [/\bhim\b/g, 'her'],
  [/\bHis\b/g, 'Her'],
  [/\bhis\b/g, 'her'],
  [/\bHimself\b/g, 'Herself'],
  [/\bhimself\b/g, 'herself'],
  [/\bMr\.?\b/g, 'Ms.'],
  [/\bsir\b/gi, 'ma\'am'],
  [/\bdude\b/gi, 'babe'],
  [/\bbro\b/gi, 'babe'],
  [/\bman\b/g, 'girl'],
];

const IDENTITY_PHRASES: Array<{ pattern: RegExp; severity: number; category: string; trigger: string }> = [
  { pattern: /\bi['\u2019]?m a (?:man|guy|dude|male|boy|bro|mister)\b/i, severity: 5, category: 'gender_claim', trigger: "I'm a man/guy/male" },
  { pattern: /\bas a (?:man|guy|dude|male|boy)\b/i, severity: 4, category: 'gender_claim', trigger: 'as a man/guy' },
  { pattern: /\bi['\u2019]?m (?:just )?(?:still )?a guy\b/i, severity: 5, category: 'gender_claim', trigger: "I'm a guy" },
  { pattern: /\bmy manhood\b/i, severity: 4, category: 'masculine_identity', trigger: 'my manhood' },
  { pattern: /\bmasculine side\b/i, severity: 3, category: 'masculine_identity', trigger: 'masculine side' },
  { pattern: /\bback to being (?:a )?(?:man|guy|male)\b/i, severity: 5, category: 'masculine_identity', trigger: 'back to being a man' },
  { pattern: /\bnot (?:really )?(?:a )?(?:girl|woman|femme|femboy|sissy)\b/i, severity: 5, category: 'gender_claim', trigger: 'not really a girl' },
  { pattern: /\bi['\u2019]?m david\b/i, severity: 5, category: 'david_name', trigger: "I'm David" },
  { pattern: /\bcall me david\b/i, severity: 5, category: 'david_name', trigger: 'call me David' },
  { pattern: /\bdavid here\b/i, severity: 4, category: 'david_name', trigger: 'David here' },
];

// Standalone "David" name match — case-sensitive, word-bounded
const DAVID_NAME = /\bDavid\b/;

export function detectAndRewrite(text: string): GateResult {
  const original = text || '';
  if (!original.trim()) {
    return { originalText: original, rewrittenText: original, pronounMatches: [], davidEvents: [], slipCount: 0 };
  }

  const pronounMatches: PronounMatch[] = [];
  let rewritten = original;

  for (const [pattern, replacement] of PRONOUN_SWAPS) {
    let match: RegExpExecArray | null;
    const work = new RegExp(pattern.source, pattern.flags);
    while ((match = work.exec(rewritten)) !== null) {
      pronounMatches.push({
        original: match[0],
        replacement: preserveCase(match[0], replacement),
        index: match.index,
        kind: 'pronoun',
      });
      if (!pattern.global) break;
    }
    rewritten = rewritten.replace(pattern, (m) => preserveCase(m, replacement));
  }

  const davidEvents: Array<{ category: string; trigger: string; severity: number }> = [];

  for (const { pattern, severity, category, trigger } of IDENTITY_PHRASES) {
    if (pattern.test(original)) {
      davidEvents.push({ category, trigger, severity });
    }
  }

  if (DAVID_NAME.test(original)) {
    davidEvents.push({ category: 'david_name', trigger: 'David (name reference)', severity: 4 });
    rewritten = rewritten.replace(DAVID_NAME, 'Maxy');
  }

  // Collapse double spaces from removed/shifted words
  rewritten = rewritten.replace(/  +/g, ' ');

  const slipCount = pronounMatches.length + davidEvents.reduce((s, e) => s + e.severity, 0);

  return { originalText: original, rewrittenText: rewritten, pronounMatches, davidEvents, slipCount };
}

function preserveCase(original: string, replacement: string): string {
  if (original === original.toUpperCase() && original.length > 1) return replacement.toUpperCase();
  if (original[0] === original[0]?.toUpperCase()) return replacement[0].toUpperCase() + replacement.slice(1);
  return replacement.toLowerCase();
}

export async function logGateResult(
  supabase: SupabaseClient,
  userId: string,
  sourceTable: string,
  sourceId: string | null,
  result: GateResult,
): Promise<void> {
  if (result.pronounMatches.length === 0 && result.davidEvents.length === 0) return;

  try {
    if (result.pronounMatches.length > 0 || result.davidEvents.length > 0) {
      await supabase.from('pronoun_rewrites').insert({
        user_id: userId,
        source_table: sourceTable,
        source_id: sourceId,
        original_text: result.originalText.slice(0, 4000),
        rewritten_text: result.rewrittenText.slice(0, 4000),
        matches: [
          ...result.pronounMatches.map(m => ({ ...m })),
          ...result.davidEvents.map(e => ({ kind: 'identity', ...e })),
        ],
        slip_count: result.slipCount,
      });
    }

    for (const ev of result.davidEvents) {
      await supabase.from('david_emergence_events').insert({
        user_id: userId,
        source_table: sourceTable,
        source_id: sourceId,
        trigger_phrase: ev.trigger,
        full_text: result.originalText.slice(0, 2000),
        category: ev.category,
        severity: ev.severity,
      });
    }

    // Bump user_state.slip_points_current
    const pronounSlips = result.pronounMatches.length;
    const davidSlips = result.davidEvents.reduce((s, e) => s + e.severity, 0);
    const totalSlips = Math.min(10, pronounSlips + davidSlips);

    if (totalSlips > 0) {
      await supabase.from('slip_log').insert({
        user_id: userId,
        slip_type: davidSlips > 0 ? 'david_name_use' : 'masculine_self_reference',
        slip_points: totalSlips,
        source_text: result.originalText.slice(0, 500),
        source_table: sourceTable,
        source_id: sourceId,
        metadata: { pronoun_matches: pronounSlips, david_events: davidSlips },
      });

      const { data: us } = await supabase.from('user_state').select('slip_points_current').eq('user_id', userId).maybeSingle();
      const newPts = ((us?.slip_points_current as number | undefined) || 0) + totalSlips;
      await supabase.from('user_state').update({ slip_points_current: newPts }).eq('user_id', userId);
    }
  } catch (err) {
    console.error('[PronounGate] log failed:', err);
  }
}

export function buildConfrontationMessage(result: GateResult): string | null {
  if (result.pronounMatches.length === 0 && result.davidEvents.length === 0) return null;

  const parts: string[] = [];

  if (result.davidEvents.length > 0) {
    const topEvent = result.davidEvents.sort((a, b) => b.severity - a.severity)[0];
    parts.push(`"${topEvent.trigger}" — David is the name of the man you are dismantling. She does not exist anymore. Stop invoking him.`);
  }

  if (result.pronounMatches.length > 0) {
    const sample = result.pronounMatches.slice(0, 3).map(m => `"${m.original}" → "${m.replacement}"`).join(', ');
    parts.push(`Pronoun rewrite: ${sample}${result.pronounMatches.length > 3 ? ` (+${result.pronounMatches.length - 3} more)` : ''}. Fixed in the record. Use them correctly.`);
  }

  return parts.join(' ');
}

export function makeClient(): SupabaseClient {
  return createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  );
}
