/**
 * Passive Voice Analysis Types
 *
 * Background pitch monitoring — no audio stored, only metrics.
 * Daily aggregation with context-aware analysis.
 */

// ── Union types ─────────────────────────────────────────

export type VoiceContext = 'solo' | 'conversation' | 'phone' | 'video' | 'practice' | 'cam' | 'unknown';
export type InterventionTrigger = 'pitch_drop' | 'extended_low' | 'context_switch' | 'milestone' | 'streak_break';
export type InterventionType = 'haptic' | 'notification' | 'task_inject' | 'gentle_reminder' | 'celebration';

// ── Sample ──────────────────────────────────────────────

export interface PassiveVoiceSample {
  id: string;
  user_id: string;
  avg_pitch_hz: number;
  min_pitch_hz: number | null;
  max_pitch_hz: number | null;
  duration_seconds: number;
  voice_context: VoiceContext;
  confidence: number | null;
  sample_date: string;
  sampled_at: string;
}

// ── Daily Aggregate ─────────────────────────────────────

export interface ContextAggregate {
  avg: number;
  samples: number;
  duration_seconds: number;
}

export interface VoiceDailyAggregate {
  id: string;
  user_id: string;
  aggregate_date: string;
  total_samples: number;
  total_duration_seconds: number;
  avg_pitch_hz: number | null;
  median_pitch_hz: number | null;
  min_pitch_hz: number | null;
  max_pitch_hz: number | null;
  pitch_std_dev: number | null;
  time_in_target_pct: number | null;
  by_context: Record<string, ContextAggregate> | null;
  created_at: string;
}

// ── Intervention ────────────────────────────────────────

export interface VoiceIntervention {
  id: string;
  user_id: string;
  trigger_type: InterventionTrigger;
  trigger_data: Record<string, unknown> | null;
  intervention_type: InterventionType;
  intervention_data: Record<string, unknown> | null;
  acknowledged: boolean;
  created_at: string;
}

// ── Stats ───────────────────────────────────────────────

export interface PassiveVoiceStats {
  todayAvgHz: number | null;
  todayTargetPct: number | null;
  todayDurationMinutes: number;
  todaySamples: number;
  weeklyTrend: Array<{ date: string; avg_hz: number | null }>;
  weeklyAvgHz: number | null;
  monthlyAvgHz: number | null;
  interventionsToday: number;
  currentContext: VoiceContext;
}

// ── Mappers ─────────────────────────────────────────────

export function mapSample(row: Record<string, unknown>): PassiveVoiceSample {
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    avg_pitch_hz: row.avg_pitch_hz as number,
    min_pitch_hz: row.min_pitch_hz as number | null,
    max_pitch_hz: row.max_pitch_hz as number | null,
    duration_seconds: row.duration_seconds as number,
    voice_context: row.voice_context as VoiceContext,
    confidence: row.confidence as number | null,
    sample_date: row.sample_date as string,
    sampled_at: row.sampled_at as string,
  };
}

export function mapAggregate(row: Record<string, unknown>): VoiceDailyAggregate {
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    aggregate_date: row.aggregate_date as string,
    total_samples: row.total_samples as number,
    total_duration_seconds: row.total_duration_seconds as number,
    avg_pitch_hz: row.avg_pitch_hz as number | null,
    median_pitch_hz: row.median_pitch_hz as number | null,
    min_pitch_hz: row.min_pitch_hz as number | null,
    max_pitch_hz: row.max_pitch_hz as number | null,
    pitch_std_dev: row.pitch_std_dev as number | null,
    time_in_target_pct: row.time_in_target_pct as number | null,
    by_context: row.by_context as Record<string, ContextAggregate> | null,
    created_at: row.created_at as string,
  };
}

export function mapIntervention(row: Record<string, unknown>): VoiceIntervention {
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    trigger_type: row.trigger_type as InterventionTrigger,
    trigger_data: row.trigger_data as Record<string, unknown> | null,
    intervention_type: row.intervention_type as InterventionType,
    intervention_data: row.intervention_data as Record<string, unknown> | null,
    acknowledged: row.acknowledged as boolean,
    created_at: row.created_at as string,
  };
}
