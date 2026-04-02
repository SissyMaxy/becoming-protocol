/**
 * Conditioning Engine — Handler Context Builder
 *
 * Assembles conditioning state into a formatted string block
 * for injection into the Handler system prompt. Does NOT expose
 * hidden operations in the output.
 */

import { supabase } from '../supabase';
import { buildBatchTtsContext } from './batch-tts';
import { buildContentLibraryContext } from './content-sourcer';
import { getTriggerDeploymentStats } from './trigger-deployment-logger';

/**
 * Build the conditioning engine context block for the Handler system prompt.
 * Queries recent sessions, trance progression, established triggers,
 * pending post-hypnotics, scent conditioning state, template pipeline,
 * and external content library.
 */
export async function buildConditioningEngineContext(userId: string): Promise<string> {
  try {
    const [sessions, trance, triggers, postHypnotics, scent, batchTtsCtx, contentLibCtx, deploymentStats] = await Promise.all([
      fetchRecentSessions(userId),
      fetchTranceProgression(userId),
      fetchEstablishedTriggers(userId),
      fetchPendingPostHypnotics(userId),
      fetchScentConditioning(userId),
      buildBatchTtsContext(userId).catch(() => ''),
      buildContentLibraryContext(userId).catch(() => ''),
      getTriggerDeploymentStats(userId).catch(() => []),
    ]);

    const lines: string[] = ['## Conditioning Engine State'];

    // Recent sessions
    if (sessions.length) {
      lines.push('');
      lines.push('### Recent Sessions');
      for (const s of sessions) {
        const date = s.started_at ? new Date(s.started_at).toLocaleDateString() : 'unknown';
        lines.push(`- ${s.session_type} (${date}) — depth: ${s.trance_depth_estimated ?? 'n/a'}, arousal: ${s.arousal_level_estimated ?? 'n/a'}, completed: ${s.completed ?? false}`);
      }
    }

    // Trance progression
    if (trance.length) {
      lines.push('');
      lines.push('### Trance Progression');
      for (const t of trance) {
        const date = t.recorded_at ? new Date(t.recorded_at).toLocaleDateString() : 'unknown';
        lines.push(`- ${date}: depth ${t.peak_depth ?? 'n/a'}, induction ${t.induction_time_seconds ? `${t.induction_time_seconds}s` : 'n/a'}, sustained ${t.sustained_depth_minutes ? `${t.sustained_depth_minutes}min` : 'n/a'}`);
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

    // Trigger deployment intelligence
    if (deploymentStats.length) {
      lines.push('');
      lines.push('### Trigger Deployment Intelligence');
      for (const stat of deploymentStats) {
        const lastStr = stat.lastDeployedAt
          ? `${Math.round((Date.now() - new Date(stat.lastDeployedAt).getTime()) / 3600000)}h ago`
          : 'never';
        const effStr = stat.avgEffectiveness !== null ? `${stat.avgEffectiveness}/10` : 'no data';
        const riskLabel = stat.habituationRisk >= 0.6 ? 'HIGH' : stat.habituationRisk >= 0.3 ? 'MODERATE' : 'LOW';
        lines.push(`- "${stat.triggerPhrase}" — ${stat.last7Days} deployments (7d), last: ${lastStr}, effectiveness: ${effStr}, habituation: ${stat.habituationRisk} ${riskLabel}`);

        // Context breakdown
        const contexts = Object.entries(stat.byContext);
        if (contexts.length > 1) {
          const sorted = contexts.sort((a, b) => (b[1].avgEffectiveness ?? 0) - (a[1].avgEffectiveness ?? 0));
          const best = sorted[0];
          if (best[1].avgEffectiveness !== null) {
            lines.push(`  best context: ${best[0]} (${best[1].avgEffectiveness}/10)`);
          }
        }

        // Warnings
        if (stat.habituationRisk >= 0.6) {
          lines.push(`  HABITUATION WARNING: reduce frequency, space deployments further apart`);
        }
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
        lines.push(`- ${sc.scent_name}: ${sc.sessions_paired ?? 0} pairings, strength: ${sc.association_strength ?? 'none'}`);
      }
    }

    // Template audio pipeline status
    if (batchTtsCtx) {
      lines.push('');
      lines.push(batchTtsCtx);
    }

    // External content library
    if (contentLibCtx) {
      lines.push('');
      lines.push(contentLibCtx);
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
    .select('session_type, trance_depth_estimated, arousal_level_estimated, completed, started_at')
    .eq('user_id', userId)
    .order('started_at', { ascending: false })
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
    .select('peak_depth, induction_time_seconds, sustained_depth_minutes, recorded_at')
    .eq('user_id', userId)
    .order('recorded_at', { ascending: false })
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
    .select('scent_name, sessions_paired, association_strength')
    .eq('user_id', userId)
    .order('sessions_paired', { ascending: false });

  if (error) {
    console.error('[conditioning-context] fetchScentConditioning error:', error.message);
    return [];
  }
  return data ?? [];
}
