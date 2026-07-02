// pitch-trend — pure trend logic for the voice progression watcher (FEM §2).
//
// Extracted pure so vitest can pin the sign convention forever: the old
// voice-pitch-watcher inverted it ("trend >= -2 → stagnation"), converting
// every MTF win into an escalation. POSITIVE trend toward the feminine band
// is PROGRESS and the watcher returns early to praise.
//
// No Deno / no supabase imports — importable from vitest as plain TS.

export interface PitchSampleLike {
  recorded_at: string;
  pitch_median_hz: number | null;
}

export interface PitchTrend {
  /** median(recent 14d) − median(prior 14d), in Hz, direction-adjusted. */
  trend: number;
  recentMedianHz: number;
  priorMedianHz: number;
  recentCount: number;
  priorCount: number;
}

export type VoiceResponseRung =
  | 'progress'        // praise, no task, early return
  | 'plateau'         // samples exist, |trend| < 3Hz for the window pair
  | 'stagnation'      // zero samples in 14d
  | 'insufficient';   // not enough pitched samples to say anything

export const MIN_WINDOW_SAMPLES = 5;
export const PROGRESS_THRESHOLD_HZ = 3;
export const WINDOW_DAYS = 14;

export function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Rolling 14d median vs prior 14d median. `directionSign` comes from
 * maxy_facts (MTF: +1 — rising pitch is progress), never hardcoded at the
 * call site. Returns null when either window lacks MIN_WINDOW_SAMPLES
 * pitched samples.
 */
export function computePitchTrend(
  samples: PitchSampleLike[],
  now: Date,
  directionSign: 1 | -1,
): PitchTrend | null {
  const nowMs = now.getTime();
  const recentStart = nowMs - WINDOW_DAYS * 86400_000;
  const priorStart = nowMs - 2 * WINDOW_DAYS * 86400_000;

  const recent: number[] = [];
  const prior: number[] = [];
  for (const s of samples) {
    if (s.pitch_median_hz == null) continue;
    const t = new Date(s.recorded_at).getTime();
    if (t >= recentStart && t <= nowMs) recent.push(s.pitch_median_hz);
    else if (t >= priorStart && t < recentStart) prior.push(s.pitch_median_hz);
  }

  if (recent.length < MIN_WINDOW_SAMPLES || prior.length < MIN_WINDOW_SAMPLES) return null;

  const recentMedianHz = median(recent);
  const priorMedianHz = median(prior);
  return {
    trend: (recentMedianHz - priorMedianHz) * directionSign,
    recentMedianHz,
    priorMedianHz,
    recentCount: recent.length,
    priorCount: prior.length,
  };
}

/**
 * Response ladder classifier. One rung max per run:
 *  - progress   — trend ≥ +3Hz (direction-adjusted). STRUCTURAL early
 *                 return: while trend is positive nothing below fires.
 *  - stagnation — ZERO samples (pitched or not) in the recent 14d window.
 *  - plateau    — enough samples, |trend| < 3Hz.
 *  - insufficient — samples exist but not enough pitched ones for a trend.
 */
export function classifyVoiceResponse(opts: {
  trend: PitchTrend | null;
  samplesInRecentWindow: number;
}): VoiceResponseRung {
  const { trend, samplesInRecentWindow } = opts;

  if (trend && trend.trend >= PROGRESS_THRESHOLD_HZ) return 'progress';
  if (samplesInRecentWindow === 0) return 'stagnation';
  if (trend === null) return 'insufficient';
  if (Math.abs(trend.trend) < PROGRESS_THRESHOLD_HZ) return 'plateau';
  // Negative trend beyond threshold: the design fires no punitive rung for
  // moving the "wrong" way — track, don't force. Treat as insufficient
  // pressure grounds; Mama stays quiet.
  return 'insufficient';
}
