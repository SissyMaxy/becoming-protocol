/**
 * Generation Context — snapshot of Handler state, plan, and quality signals
 * attached to every piece of auto-generated content for retroactive audit.
 *
 * Shape is stored as JSONB in ai_generated_content.generation_context and
 * paid_conversations.generation_context (migration 216).
 *
 * Usage:
 *   const cycle = await loadCycleContext(supabase, USER_ID);
 *   // ... generate reply, run slop check ...
 *   await supabase.from('ai_generated_content').insert({
 *     ...,
 *     generation_context: buildContext(cycle, {
 *       voice_flavor: 'reply_nsfw',
 *       slop: { score: 9, attempts: 1, pattern_reasons: [], llm_reason: '...' },
 *       contact: { id: contactId, tier: 'warm' },
 *       target: { platform: 'twitter', username: '...', url: '...' },
 *     }),
 *   });
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { FullSlopResult } from './slop-detector';

export interface SlopSummary {
  score: number;
  attempts: number;
  pattern_reasons: string[];
  repetition_reasons: string[];
  llm_reason: string;
  hard_ban?: boolean;
}

export interface HandlerStateSnapshot {
  denial_day?: number | null;
  handler_mode?: string | null;
  escalation_level?: number | string | null;
  current_phase?: number | string | null;
  in_session?: boolean | null;
  chastity_locked?: boolean | null;
  chastity_streak_days?: number | null;
  hard_mode_active?: boolean | null;
  opacity_level?: string | number | null;
  feminization_tier?: number | string | null;
  active_arc?: string | null;
  loaded_at?: string;
  [k: string]: unknown;
}

export interface CycleContext {
  generated_at: string;
  handler_state: HandlerStateSnapshot | null;
  active_narrative_arc: { id: string; theme: string } | null;
  active_content_plan: { id: string; narrative_theme: string | null } | null;
}

export interface PerItemContext {
  voice_flavor?: string;
  slop?: SlopSummary;
  contact?: {
    id?: string | null;
    tier?: string | null;
    safety_score?: number | null;
    flags?: string[];
  };
  target?: {
    platform: string;
    username?: string;
    url?: string;
    nsfw?: boolean;
    strategy?: string;
  };
  refusal_detected?: boolean;
  pii_action?: 'suppress' | 'deflect' | null;
  pii_reason?: string | null;
  brief_id?: string | null;
  notes?: string;
}

export interface GenerationContext extends PerItemContext {
  generated_at: string;
  handler_state: HandlerStateSnapshot | null;
  active_narrative_arc: { id: string; theme: string } | null;
  active_content_plan: { id: string; narrative_theme: string | null } | null;
}

/**
 * Pull shared cycle-level context once at the start of a run.
 * All tables are optional — unknown schemas fail silent and return null.
 */
export async function loadCycleContext(
  supabase: SupabaseClient,
  userId: string,
): Promise<CycleContext> {
  const generated_at = new Date().toISOString();

  const [userStateRes, arcRes, planRes] = await Promise.all([
    supabase.from('user_state').select('*').eq('user_id', userId).maybeSingle().then(
      r => r.data,
      () => null,
    ),
    supabase
      .from('narrative_arcs')
      .select('id, theme, status')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(r => r.data, () => null),
    supabase
      .from('content_plan')
      .select('id, narrative_theme, week_start')
      .eq('user_id', userId)
      .order('week_start', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(r => r.data, () => null),
  ]);

  return {
    generated_at,
    handler_state: userStateRes
      ? {
          denial_day: (userStateRes as any).denial_day ?? null,
          handler_mode: (userStateRes as any).handler_mode ?? null,
          escalation_level: (userStateRes as any).escalation_level ?? null,
          current_phase: (userStateRes as any).current_phase ?? null,
          in_session: (userStateRes as any).in_session ?? null,
          chastity_locked: (userStateRes as any).chastity_locked ?? null,
          chastity_streak_days: (userStateRes as any).chastity_streak_days ?? null,
          hard_mode_active: (userStateRes as any).hard_mode_active ?? null,
          opacity_level: (userStateRes as any).opacity_level ?? null,
          loaded_at: generated_at,
        }
      : null,
    active_narrative_arc: arcRes ? { id: (arcRes as any).id, theme: (arcRes as any).theme } : null,
    active_content_plan: planRes
      ? { id: (planRes as any).id, narrative_theme: (planRes as any).narrative_theme ?? null }
      : null,
  };
}

/**
 * Summarize a FullSlopResult for persistence.
 */
export function summarizeSlop(slop: FullSlopResult, attempts: number): SlopSummary {
  return {
    score: slop.llmScore,
    attempts,
    pattern_reasons: slop.patternReasons,
    repetition_reasons: slop.repetitionReasons,
    llm_reason: slop.llmReason,
  };
}

/**
 * Merge cycle-level + per-item into a full generation_context row payload.
 */
export function buildContext(cycle: CycleContext, item: PerItemContext): GenerationContext {
  return {
    generated_at: cycle.generated_at,
    handler_state: cycle.handler_state,
    active_narrative_arc: cycle.active_narrative_arc,
    active_content_plan: cycle.active_content_plan,
    ...item,
  };
}
