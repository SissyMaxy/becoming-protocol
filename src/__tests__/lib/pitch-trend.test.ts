// Voice pitch trend — the sign-convention regression (FEM §2).
//
// The old voice-pitch-watcher had the trend inverted for an MTF user:
// "trend >= -2 → stagnant, reason: pitch_rising" — a WIN converted into an
// escalation. This suite pins the fixed semantics forever:
//   positive (direction-adjusted) trend ≥ +3Hz → 'progress', NEVER
//   'stagnation'/'plateau'.
// Verified failing on the old code: old checkUserStagnation returned
// { stagnant: true, reason: 'pitch_rising' } for trend=+6.

import { describe, it, expect } from 'vitest';
import {
  computePitchTrend,
  classifyVoiceResponse,
  median,
  MIN_WINDOW_SAMPLES,
  type PitchSampleLike,
} from '../../../supabase/functions/_shared/pitch-trend';

const NOW = new Date('2026-07-01T12:00:00Z');

function samplesAt(daysAgoList: number[], hz: number | ((i: number) => number)): PitchSampleLike[] {
  return daysAgoList.map((d, i) => ({
    recorded_at: new Date(NOW.getTime() - d * 86400_000).toISOString(),
    pitch_median_hz: typeof hz === 'function' ? hz(i) : hz,
  }));
}

describe('median', () => {
  it('odd and even lengths', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
  });
});

describe('computePitchTrend', () => {
  it('recent median minus prior median, MTF direction (+1)', () => {
    const recent = samplesAt([1, 3, 5, 7, 9], 156);   // 14d window
    const prior = samplesAt([15, 17, 19, 21, 23], 150); // prior 14d
    const t = computePitchTrend([...recent, ...prior], NOW, 1);
    expect(t).not.toBeNull();
    expect(t!.trend).toBe(6);
    expect(t!.recentCount).toBe(5);
    expect(t!.priorCount).toBe(5);
  });

  it('requires ≥5 pitched samples per window', () => {
    const recent = samplesAt([1, 3, 5, 7], 156); // only 4
    const prior = samplesAt([15, 17, 19, 21, 23], 150);
    expect(computePitchTrend([...recent, ...prior], NOW, 1)).toBeNull();
    expect(MIN_WINDOW_SAMPLES).toBe(5);
  });

  it('unpitched samples do not count toward the window minimum', () => {
    const recent = [...samplesAt([1, 3, 5, 7], 156), { recorded_at: new Date(NOW.getTime() - 86400_000).toISOString(), pitch_median_hz: null }];
    const prior = samplesAt([15, 17, 19, 21, 23], 150);
    expect(computePitchTrend([...recent, ...prior], NOW, 1)).toBeNull();
  });

  it('direction sign flips the trend (FTM would read falling as progress)', () => {
    const recent = samplesAt([1, 3, 5, 7, 9], 144);
    const prior = samplesAt([15, 17, 19, 21, 23], 150);
    const t = computePitchTrend([...recent, ...prior], NOW, -1);
    expect(t!.trend).toBe(6);
  });
});

describe('classifyVoiceResponse — THE regression', () => {
  const rising = () => {
    const recent = samplesAt([1, 3, 5, 7, 9], 156);
    const prior = samplesAt([15, 17, 19, 21, 23], 150);
    return computePitchTrend([...recent, ...prior], NOW, 1);
  };

  it('trend = +6Hz → progress, never stagnation, never plateau', () => {
    const rung = classifyVoiceResponse({ trend: rising(), samplesInRecentWindow: 5 });
    expect(rung).toBe('progress');
    expect(rung).not.toBe('stagnation');
    expect(rung).not.toBe('plateau');
  });

  it('progress wins even if the recent-sample count were somehow zero (trend implies samples)', () => {
    // Structural: the progress check runs FIRST — nothing below can fire.
    const rung = classifyVoiceResponse({ trend: rising(), samplesInRecentWindow: 0 });
    expect(rung).toBe('progress');
  });

  it('zero samples in 14d → stagnation', () => {
    expect(classifyVoiceResponse({ trend: null, samplesInRecentWindow: 0 })).toBe('stagnation');
  });

  it('samples exist but flat trend (|t| < 3) → plateau', () => {
    const recent = samplesAt([1, 3, 5, 7, 9], 151);
    const prior = samplesAt([15, 17, 19, 21, 23], 150);
    const t = computePitchTrend([...recent, ...prior], NOW, 1);
    expect(classifyVoiceResponse({ trend: t, samplesInRecentWindow: 5 })).toBe('plateau');
  });

  it('samples exist but no computable trend → insufficient (no rung fires)', () => {
    expect(classifyVoiceResponse({ trend: null, samplesInRecentWindow: 3 })).toBe('insufficient');
  });

  it('negative trend beyond threshold fires NO punitive rung (track, do not force)', () => {
    const recent = samplesAt([1, 3, 5, 7, 9], 144);
    const prior = samplesAt([15, 17, 19, 21, 23], 150);
    const t = computePitchTrend([...recent, ...prior], NOW, 1);
    expect(t!.trend).toBe(-6);
    expect(classifyVoiceResponse({ trend: t, samplesInRecentWindow: 5 })).toBe('insufficient');
  });
});
