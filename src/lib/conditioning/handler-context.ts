/**
 * Conditioning Engine — Handler Context Builder
 *
 * Assembles conditioning state into a formatted string block
 * for injection into the Handler system prompt. Does NOT expose
 * hidden operations in the output.
 */

import { supabase } from '../supabase';

/**
 * Build the conditioning engine context block for the Handler system prompt.
 * Queries recent sessions, trance progression, established triggers,
 * pending post-hypnotics, and scent conditioning state.
 */
export async function buildConditioningEngineContext(userId: string): Promise<string> {
  try {
    const [sessions, trance, triggers, postHypnotics, scent] = await Promise.all([
      fetchRecentSessions(userId),
      fetchTranceProgression(userId),
      fetchEstablishedTriggers(userId),
      fetchPendingPostHypnotics(userId),
      fetchScentConditioning(userId),
    ]);

    const lines: string[] = ['## Conditioning Engine State'];

    // Recent sessions
    if (sessions.length) {
      lines.push('');
      lines.push('### Recent Sessions');
      for (const s of sessions) {
        const date = s.created_at ? new Date(s.created_at).toLocaleDateString() : 'unknown';
        lines.push(`- ${s.session_type} (${date}) — depth: ${s.trance_depth ?? 'n/a'}, intensity: ${s.intensity ?? 'n/a'}, outcome: ${s.outcome ?? 'completed'}`);
      }
    }

    // Trance progression
    if (trance.length) {
      lines.push('');
      lines.push('### Trance Progression');
      for (const t of trance) {
        const date = t.created_at ? new Date(t.created_at).toLocaleDateString() : 'unknown';
        lines.push(`- ${date}: depth ${t.depth_achieved ?? 'n/a'}, induction ${t.induction_method ?? 'standard'}, time-to-depth ${t.time_to_depth_seconds ? `${t.time_to_depth_seconds}s` : 'n/a'}`);
      }
    }

    // Established triggers — available for conversation weaving
    if (triggers.length) {
      lines.push('');
      lines.push('### Available Triggers (for conversation weaving)');
      for (const tr of triggers) {
        lines.push(`- "${tr.trigger_phrase}" — strength: ${tr.estimated_strength}, pairings: ${tr.pairing_count}, response: ${tr.intended_response ?? 'general'}`);
      }
    }

    // Pending post-hypnotic suggestions
    if (postHypnotics.length) {
      lines.push('');
      lines.push('### Pending Post-Hypnotic Suggestions');
      for (const ph of postHypnotics) {
        const expected = ph.activation_expected_at
          ? new Date(ph.activation_expected_at).toLocaleString()
          : 'unscheduled';
        lines.push(`- "${ph.suggestion}" — expected: ${expected}, context: ${ph.context ?? 'general'}`);
      }
    }

    // Scent conditioning
    if (scent.length) {
      lines.push('');
      lines.push('### Scent Conditioning');
      for (const sc of scent) {
        lines.push(`- ${sc.scent_name}: ${sc.pairing_count ?? 0} pairings, associated with ${sc.associated_state ?? 'trance'}, strength: ${sc.conditioning_strength ?? 'forming'}`);
      }
    }

    if (lines.length <= 1) return '';

    return lines.join('\n');
  } catch (err) {
    console.error('[conditioning-context] buildConditioningEngineContext exception:', err);
    return '';
  }
}

async function fetchRecentSessions(userId: string) {
  const { data, error } = await supabase
    .from('conditioning_sessions_v2')
    .select('session_type, trance_depth, intensity, outcome, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) {
    console.error('[conditioning-context] fetchRecentSessions error:', error.message);
    return [];
  }
  return data ?? [];
}

async function fetchTranceProgression(userId: string) {
  const { data, error } = await supabase
    .from('trance_progression')
    .select('depth_achieved, induction_method, time_to_depth_seconds, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) {
    console.error('[conditioning-context] fetchTranceProgression error:', error.message);
    return [];
  }
  return data ?? [];
}

async function fetchEstablishedTriggers(userId: string) {
  const { data, error } = await supabase
    .from('conditioned_triggers')
    .select('trigger_phrase, estimated_strength, pairing_count, intended_response')
    .eq('user_id', userId)
    .in('estimated_strength', ['established', 'conditioned'])
    .order('pairing_count', { ascending: false });

  if (error) {
    console.error('[conditioning-context] fetchEstablishedTriggers error:', error.message);
    return [];
  }
  return data ?? [];
}

async function fetchPendingPostHypnotics(userId: string) {
  const { data, error } = await supabase
    .from('post_hypnotic_tracking')
    .select('suggestion, activation_expected_at, context')
    .eq('user_id', userId)
    .or('activation_detected.is.null,activation_detected.eq.false')
    .order('activation_expected_at', { ascending: true })
    .limit(5);

  if (error) {
    console.error('[conditioning-context] fetchPendingPostHypnotics error:', error.message);
    return [];
  }
  return data ?? [];
}

async function fetchScentConditioning(userId: string) {
  const { data, error } = await supabase
    .from('scent_conditioning')
    .select('scent_name, pairing_count, associated_state, conditioning_strength')
    .eq('user_id', userId)
    .order('pairing_count', { ascending: false });

  if (error) {
    console.error('[conditioning-context] fetchScentConditioning error:', error.message);
    return [];
  }
  return data ?? [];
}
