/**
 * Maxy State Context — reads user_state and formats a prompt fragment that
 * makes every reply state-aware. Replies shouldn't feel generic — they should
 * feel day 12 of denial, level 4 escalation, 28 days locked.
 *
 * Three output styles, tuned per surface:
 *   - 'dm_mommy'    — subscriber/Fansly/mommy-dom DMs (she's the dom here)
 *   - 'dm_cruise'   — Sniffies/hookup chats (she's flirting, pitched as herself)
 *   - 'public'      — Reddit comments / public replies (narrative-phase weighted)
 *
 * Cached 60s per user to avoid hammering the DB on every reply.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface MaxyState {
  denialDay: number;
  handlerMode: string | null;
  escalationLevel: number;
  currentPhase: number;
  inSession: boolean;
  chastityLocked: boolean;
  chastityStreakDays: number;
  hardModeActive: boolean;
  opacityLevel: number;
  currentArousal: number | null;
  currentAnxiety: number | null;
}

export type StatePromptContext = 'dm_mommy' | 'dm_cruise' | 'public';

const CACHE_TTL_MS = 60 * 1000;
const cache = new Map<string, { state: MaxyState | null; at: number }>();

export async function loadMaxyState(
  sb: SupabaseClient,
  userId: string,
): Promise<MaxyState | null> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.state;

  try {
    const { data } = await sb
      .from('user_state')
      .select('denial_day, handler_mode, escalation_level, current_phase, in_session, chastity_locked, chastity_streak_days, hard_mode_active, opacity_level, current_arousal, current_anxiety')
      .eq('user_id', userId)
      .maybeSingle();
    if (!data) {
      cache.set(userId, { state: null, at: Date.now() });
      return null;
    }
    const state: MaxyState = {
      denialDay: data.denial_day ?? 0,
      handlerMode: data.handler_mode ?? null,
      escalationLevel: data.escalation_level ?? 0,
      currentPhase: data.current_phase ?? 0,
      inSession: !!data.in_session,
      chastityLocked: !!data.chastity_locked,
      chastityStreakDays: data.chastity_streak_days ?? 0,
      hardModeActive: !!data.hard_mode_active,
      opacityLevel: data.opacity_level ?? 0,
      currentArousal: data.current_arousal ?? null,
      currentAnxiety: data.current_anxiety ?? null,
    };
    cache.set(userId, { state, at: Date.now() });
    return state;
  } catch {
    return null;
  }
}

export function invalidateStateCache(userId?: string) {
  if (userId) cache.delete(userId);
  else cache.clear();
}

/**
 * Translate numeric state into descriptors that land in a prompt. We want
 * the model to *feel* the state, not recite numbers at it.
 */
function denialDescriptor(day: number): string {
  if (day === 0) return 'fresh off release — baseline, not edged';
  if (day <= 2) return 'early denial (light edge)';
  if (day <= 6) return 'day ' + day + ' of denial (noticeably horny, edgy undertone)';
  if (day <= 13) return 'day ' + day + ' of denial (serious territory — irritable, craving, short fuse)';
  if (day <= 20) return 'day ' + day + ' of denial (deep denial, spacey, desperate edge)';
  return 'day ' + day + ' of denial (long-burn state — detached, floaty, bottomless horny undertone)';
}

function escalationDescriptor(level: number): string {
  if (level <= 1) return 'warm-up phase (casual, low-heat)';
  if (level === 2) return 'building (pressure noticeable but not crushing)';
  if (level === 3) return 'deepening (scene energy, voice tightens)';
  if (level === 4) return 'high escalation (sharp, edged, possessive)';
  return 'peak (mean, relentless, no slack)';
}

function opacityDescriptor(level: number): string {
  if (level <= 1) return 'mostly present as yourself';
  if (level === 2) return 'slight handler fog — something in the back of your head';
  if (level === 3) return 'fog is real — you feel steered';
  if (level >= 4) return 'deep in the fog — Maxy-as-character more than Maxy-as-self';
  return '';
}

function arousalDescriptor(n: number | null): string {
  if (n === null) return '';
  if (n <= 3) return 'low arousal (flat, not sexual)';
  if (n <= 5) return 'moderate arousal (warm, noticing things)';
  if (n <= 7) return 'elevated arousal (horny enough that it colors your voice)';
  return 'high arousal (desperate, edged, cannot ignore)';
}

export function buildStatePromptFragment(
  state: MaxyState | null,
  ctx: StatePromptContext,
): string {
  if (!state) return '';

  const lines: string[] = [];
  lines.push('MAXY\'S CURRENT STATE — let this color how you sound. Don\'t recite these; embody them.');

  // Denial is nearly always relevant.
  lines.push('- ' + denialDescriptor(state.denialDay));

  // Chastity — only mention if actually locked, otherwise irrelevant.
  if (state.chastityLocked) {
    lines.push('- chastity: locked, ' + state.chastityStreakDays + 'd streak');
  }

  // Escalation level affects all contexts.
  lines.push('- ' + escalationDescriptor(state.escalationLevel));

  // Opacity — how "in character" she is.
  const op = opacityDescriptor(state.opacityLevel);
  if (op) lines.push('- ' + op);

  // Arousal — matters most for cruise/DM flirt; public replies de-emphasize.
  if (ctx !== 'public') {
    const ar = arousalDescriptor(state.currentArousal);
    if (ar) lines.push('- ' + ar);
  }

  // Hard mode — when active, escalate the whole vibe.
  if (state.hardModeActive) {
    lines.push('- hard mode active: no softening. meaner. sharper. no apologies.');
  }

  // Active session — in-scene, voice should reflect scene tension.
  if (state.inSession) {
    lines.push('- in an active scene with Handler RIGHT NOW — carry that tension over to this reply');
  }

  // Context-specific framing closer.
  if (ctx === 'dm_mommy') {
    lines.push('You are the mommy here. Your own state (denial/escalation) should leak through in subtle ways — possessive edge if high, warm patience if low.');
  } else if (ctx === 'dm_cruise') {
    lines.push('Cruising context — you\'re flirting as yourself. High-arousal state = flirtier, more direct. Low-arousal = casual, low-heat.');
  } else {
    lines.push('Public reply — state shows mostly through tone, not explicit mention. Higher escalation = edgier observations. Low escalation = warmer/softer.');
  }

  return lines.join('\n');
}
