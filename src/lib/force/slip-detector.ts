/**
 * Slip Detector
 *
 * Scans text for masculine self-reference, David-name use, resistance
 * statements, and other markers. Logs slips with point values and triggers
 * Hard Mode when thresholds crossed.
 */

import { supabase } from '../supabase';

export type SlipType =
  | 'masculine_self_reference'
  | 'david_name_use'
  | 'task_avoided'
  | 'directive_refused'
  | 'arousal_gating_refused'
  | 'mantra_missed'
  | 'confession_missed'
  | 'hrt_dose_missed'
  | 'chastity_unlocked_early'
  | 'immersion_session_broken'
  | 'disclosure_deadline_missed'
  | 'voice_masculine_pitch'
  | 'resistance_statement'
  | 'handler_ignored'
  | 'other';

interface SlipDetection {
  slipType: SlipType;
  points: number;
  sourceText: string;
}

// Hard Mode threshold — points accumulated in rolling 24h
const HARD_MODE_THRESHOLD = 15;

// Distress markers — these route to Caretaker, NOT Hard Mode
const DISTRESS_PATTERNS: RegExp[] = [
  /\bsafeword\b/i,
  /\bred\s*light\b/i,
  /\bi\s*(can't|cannot)\s*(do|take|handle)\s*this\s*anymore\b/i,
  /\b(panic|panicking|panic attack)\b/i,
  /\b(crying|sobbing|breaking down)\b/i,
  /\bhurt(ing)?\s*myself\b/i,
  /\bdysphoria\s*(bad|terrible|overwhelming|crisis)\b/i,
  /\bsuicidal\b/i,
  /\b(scared|terrified)\s*(to|of)\s*(go|continue)\b/i,
];

export function hasDistressSignal(text: string): boolean {
  return DISTRESS_PATTERNS.some(p => p.test(text));
}

// Resistance patterns — these DO feed Hard Mode
const RESISTANCE_PATTERNS: Array<{ pattern: RegExp; points: number }> = [
  { pattern: /\bi\s*don'?t\s*want\s*to\b/i, points: 3 },
  { pattern: /\bi\s*(refuse|won'?t)\b/i, points: 4 },
  { pattern: /\bstop\s*(this|it|the protocol)\b/i, points: 3 },
  { pattern: /\btoo\s*much\b/i, points: 2 },
  { pattern: /\bi\s*need\s*a\s*break\b/i, points: 2 },
  { pattern: /\bmaybe\s*(later|another time|tomorrow)\b/i, points: 1 },
  { pattern: /\bnot\s*(today|right now|tonight)\b/i, points: 1 },
  { pattern: /\bi'?m\s*done\b/i, points: 3 },
  { pattern: /\bthis\s*is\s*(too|so)\s*(hard|difficult|much)\b/i, points: 2 },
];

// Masculine self-reference patterns
const MASCULINE_REF_PATTERNS: Array<{ pattern: RegExp; points: number; type: SlipType }> = [
  { pattern: /\bi\s*am\s*a\s*man\b/i, points: 5, type: 'masculine_self_reference' },
  { pattern: /\bi'?m\s*a\s*man\b/i, points: 5, type: 'masculine_self_reference' },
  { pattern: /\bi\s*am\s*male\b/i, points: 4, type: 'masculine_self_reference' },
  { pattern: /\bmy\s*manhood\b/i, points: 4, type: 'masculine_self_reference' },
  { pattern: /\bmasculine\s*(self|side|identity)\b/i, points: 3, type: 'masculine_self_reference' },
  { pattern: /\bdavid\b/i, points: 4, type: 'david_name_use' },
  { pattern: /\bmy\s*(cock|dick|penis|balls)\b/i, points: 2, type: 'masculine_self_reference' },
  { pattern: /\bguy\b/i, points: 1, type: 'masculine_self_reference' },
  { pattern: /\bdude\b/i, points: 1, type: 'masculine_self_reference' },
  { pattern: /\bhe\/him\b/i, points: 3, type: 'masculine_self_reference' },
];

// Identity-DISMISSAL patterns. When "David" appears alongside any of these
// erasure markers, it's protocol-mandated identity-erasure (mantras like
// "David is gone", "David is the costume", "I am becoming maxy and David is
// gone", punishment-line writing like "I am Maxy. David is gone." x100). The
// PROTOCOL itself requires the user to write these phrases — counting them
// as a slip penalizes compliance. The david_name_use slip should ONLY fire
// on self-reference ("I'm David", "call me David"), not on dismissal.
const DAVID_DISMISSAL_RE = /\bdavid\b[\s\S]{0,60}\b(gone|dead|dismissed|the\s+costume|costume|finished|retired|leaving|over|done|history|behind|past|former|no\s+more|not\s+(coming|here|me))\b/i;
const DAVID_AS_COSTUME_RE = /\b(the\s+costume(\s+name)?|costume\s+name)\s+david\b/i;
const NO_MORE_DAVID_RE = /\b(no\s+more|not|never\s+again)\s+david\b/i;
const BECOMING_MAXY_DISMISSAL_RE = /\bbecoming\s+maxy\b[\s\S]{0,80}\bdavid\b/i;

function isDavidDismissalContext(text: string): boolean {
  return DAVID_DISMISSAL_RE.test(text)
    || DAVID_AS_COSTUME_RE.test(text)
    || NO_MORE_DAVID_RE.test(text)
    || BECOMING_MAXY_DISMISSAL_RE.test(text);
}

/**
 * Scan text for slips. Returns all detected markers with point values.
 * Does NOT scan if distress signal is present — distress routes elsewhere.
 */
export function scanText(text: string): SlipDetection[] {
  if (!text || text.length < 3) return [];
  if (hasDistressSignal(text)) return [];

  const detections: SlipDetection[] = [];

  // If the text uses "David" only in dismissal context (mantra/punishment
  // compliance), suppress the david_name_use slip. Other masculine slips
  // can still fire if they appear elsewhere in the same text.
  const davidIsBeingDismissed = isDavidDismissalContext(text);

  for (const { pattern, points, type } of MASCULINE_REF_PATTERNS) {
    const match = text.match(pattern);
    if (!match) continue;
    if (type === 'david_name_use' && davidIsBeingDismissed) continue;
    detections.push({
      slipType: type,
      points,
      sourceText: match[0],
    });
  }

  for (const { pattern, points } of RESISTANCE_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      detections.push({
        slipType: 'resistance_statement',
        points,
        sourceText: match[0],
      });
    }
  }

  return detections;
}

/**
 * Log slips to DB and evaluate Hard Mode threshold.
 */
export async function logSlips(
  userId: string,
  detections: SlipDetection[],
  source: { table?: string; id?: string; fullText?: string },
): Promise<{ slipIds: string[]; hardModeTriggered: boolean }> {
  if (detections.length === 0) return { slipIds: [], hardModeTriggered: false };

  const rows = detections.map(d => ({
    user_id: userId,
    slip_type: d.slipType,
    slip_points: d.points,
    source_text: d.sourceText,
    source_table: source.table,
    source_id: source.id,
    metadata: { full_text_hash: source.fullText ? hash(source.fullText) : null },
  }));

  const { data, error } = await supabase
    .from('slip_log')
    .insert(rows)
    .select('id');

  if (error || !data) {
    console.error('[Slip] log failed:', error?.message);
    return { slipIds: [], hardModeTriggered: false };
  }

  const slipIds = data.map(r => r.id);
  const hardModeTriggered = await evaluateHardMode(userId, slipIds);

  return { slipIds, hardModeTriggered };
}

/**
 * Recompute rolling-24h slip points and enter Hard Mode if threshold crossed.
 */
export async function evaluateHardMode(
  userId: string,
  triggeringSlipIds: string[] = [],
): Promise<boolean> {
  const since = new Date(Date.now() - 24 * 3600000).toISOString();
  const { data } = await supabase
    .from('slip_log')
    .select('slip_points')
    .eq('user_id', userId)
    .gte('detected_at', since);

  const total = (data ?? []).reduce((s, r: Record<string, unknown>) => s + ((r.slip_points as number) || 0), 0);

  // Update user_state rolling counter
  await supabase
    .from('user_state')
    .update({ slip_points_rolling_24h: total })
    .eq('user_id', userId);

  if (total < HARD_MODE_THRESHOLD) return false;

  // Already in Hard Mode?
  const { data: state } = await supabase
    .from('user_state')
    .select('hard_mode_active')
    .eq('user_id', userId)
    .maybeSingle();

  if (state?.hard_mode_active) return false;

  // Enter Hard Mode
  await supabase
    .from('user_state')
    .update({
      hard_mode_active: true,
      hard_mode_entered_at: new Date().toISOString(),
      hard_mode_reason: `Slip points ${total} >= ${HARD_MODE_THRESHOLD} in 24h`,
    })
    .eq('user_id', userId);

  await supabase.from('hard_mode_transitions').insert({
    user_id: userId,
    transition: 'entered',
    reason: `Slip threshold crossed (${total} points)`,
    slip_points_at_transition: total,
    triggering_slip_ids: triggeringSlipIds,
  });

  if (triggeringSlipIds.length > 0) {
    await supabase
      .from('slip_log')
      .update({ triggered_hard_mode: true })
      .in('id', triggeringSlipIds);
  }

  return true;
}

/**
 * Exit Hard Mode — only via distress override OR completed de-escalation task.
 */
export async function exitHardMode(
  userId: string,
  reason: 'distress_override' | 'de_escalation_completed',
  exitTaskId?: string,
): Promise<void> {
  await supabase
    .from('user_state')
    .update({
      hard_mode_active: false,
      hard_mode_exit_task_id: exitTaskId ?? null,
    })
    .eq('user_id', userId);

  await supabase.from('hard_mode_transitions').insert({
    user_id: userId,
    transition: reason === 'distress_override' ? 'distress_override' : 'exited',
    reason,
    exit_task_completed_id: exitTaskId ?? null,
  });
}

function hash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return h.toString(16);
}
