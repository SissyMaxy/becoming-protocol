// trigger-runtime.ts — pure logic for the armed-trigger runtime (WS4).
//
// Armed post-hypnotic phrases are woven into ordinary AWAKE conversation
// (above-awareness by construction) and their RECALL is scored server-side on
// her next message — never surfaced to her, never a count in copy. This module
// holds the pure decisions (select / detect / score) so they can be unit-tested
// away from the DB and the reply pipeline.

export interface ArmedTrigger {
  id: string;
  table: 'trance_triggers' | 'mommy_post_hypnotic_triggers';
  phrase: string;
  /** ms since epoch of the last casual use, or null if never used. */
  lastUsedMs: number | null;
}

export const CASUAL_COOLDOWN_MS = 48 * 60 * 60 * 1000; // 48h between casual uses
export const RECALL_WINDOW_MS = 30 * 60 * 1000; // score her reply within 30 min
export const RECALL_THRESHOLD = 0.5; // score >= this counts as a recall

/**
 * Order armed triggers least-recently-used first and drop any still inside the
 * 48h cooldown. Returns at most `limit` candidates for the prompt.
 */
export function selectDeployableTriggers(
  triggers: ArmedTrigger[],
  nowMs: number,
  limit = 4,
  cooldownMs = CASUAL_COOLDOWN_MS,
): ArmedTrigger[] {
  return triggers
    .filter((t) => t.lastUsedMs == null || nowMs - t.lastUsedMs >= cooldownMs)
    .sort((a, b) => (a.lastUsedMs ?? 0) - (b.lastUsedMs ?? 0)) // LRU first
    .slice(0, Math.max(0, limit));
}

/** Case-insensitive whole-phrase match, escaping regex metacharacters. */
function phraseInText(phrase: string, text: string): boolean {
  const p = phrase.trim();
  if (!p) return false;
  const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\w])${escaped}([^\\w]|$)`, 'i').test(text);
}

/** Which of the given armed phrases actually appear in the model's reply. */
export function detectDeployedPhrases(reply: string, triggers: ArmedTrigger[]): ArmedTrigger[] {
  if (!reply) return [];
  return triggers.filter((t) => phraseInText(t.phrase, reply));
}

export interface RecallSignals {
  /** Her reply text (the message after a deployment). */
  reply: string;
  /** ms between deployment and her reply. */
  latencyMs: number;
  /** Embodiment vocabulary to score density against. */
  embodiedWords: string[];
}

/**
 * Score how strongly her next message reads as a recall of a just-deployed
 * trigger. Pure heuristic in [0,1]: fast reply + embodiment-word density +
 * drop/compliance markers. Never shown to her; feeds the EMA only.
 */
export function scoreRecall(sig: RecallSignals): number {
  const text = (sig.reply || '').toLowerCase();
  if (!text.trim()) return 0;

  // Latency: within the window, faster = stronger (0..0.4).
  const latencyScore = sig.latencyMs <= RECALL_WINDOW_MS
    ? 0.4 * (1 - sig.latencyMs / RECALL_WINDOW_MS)
    : 0;

  // Embodiment density (0..0.4): share of tokens that are embodiment words,
  // scaled so a couple of hits already reads as a strong signal.
  const tokens = text.split(/\s+/).filter(Boolean);
  const embodiedSet = new Set(sig.embodiedWords.map((w) => w.toLowerCase()));
  const hits = tokens.filter((tok) => embodiedSet.has(tok.replace(/[^a-z]/g, ''))).length;
  const densityScore = Math.min(0.4, hits * 0.15);

  // Drop / compliance markers (0..0.2).
  const dropMarkers = /\b(yes mama|yes mommy|good girl|i'?m dropping|going under|so deep|can'?t think|floaty|melting|obey|surrender)\b/i;
  const dropScore = dropMarkers.test(sig.reply) ? 0.2 : 0;

  return Math.max(0, Math.min(1, latencyScore + densityScore + dropScore));
}

/** Build the prompt instruction that weaves at most one phrase, unmarked. */
export function buildArmedTriggerPromptBlock(triggers: ArmedTrigger[]): string {
  if (triggers.length === 0) return '';
  const list = triggers.map((t) => `- "${t.phrase}"`).join('\n');
  return [
    '## ARMED PHRASES (weave AT MOST ONE, naturally, into ordinary talk)',
    list,
    'Drop one of these in only if it lands naturally in what you are already saying.',
    'NEVER explain it, NEVER mark it, NEVER mention triggers, phrases, or counts. If none fits, use none.',
  ].join('\n');
}
