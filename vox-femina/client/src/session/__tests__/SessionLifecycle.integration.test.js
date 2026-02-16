import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SessionManager } from '../SessionManager';

// ============================================
// Global mocks
// ============================================

const FAKE_UUID = 'integ-1111-2222-3333-444444444444';

vi.stubGlobal('crypto', {
  randomUUID: vi.fn(() => FAKE_UUID),
});

vi.stubGlobal('fetch', vi.fn());
vi.spyOn(console, 'warn').mockImplementation(() => {});

describe('SessionLifecycle integration', () => {
  let sm;

  beforeEach(() => {
    vi.useFakeTimers();
    sm = new SessionManager();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('full lifecycle: start -> sample -> pause -> resume -> sample -> stop', () => {
    // --- Setup ---
    // Known metric values for deterministic assertions.
    // Lightness 60, Resonance 40, Variability 50, Pitch 210 Hz, PitchScore 75,
    // H1H2 14, F1 520, F2 1480, F3 2520, Composite 68
    const METRICS = {
      lightness: 60,
      resonance: 40,
      variability: 50,
      pitch: 210,       // in target range 180-250
      pitchScore: 75,
      h1h2: 14,
      f1: 520,
      f2: 1480,
      f3: 2520,
      compositeScore: 68,
    };

    const samplerFn = vi.fn(() => ({ ...METRICS }));

    // Phrase history from IntonationTracker
    const phraseHistory = [
      {
        variabilityScore: 35,
        contour: 'monotone',
        range: 12,
        startTime: 500,
        endTime: 2000,
        meanPitch: 210,
        stdDev: 5,
        durationMs: 1500,
        pitchCount: 8,
      },
      {
        variabilityScore: 72,
        contour: 'varied',
        range: 45,
        startTime: 5500,
        endTime: 7500,
        meanPitch: 220,
        stdDev: 18,
        durationMs: 2000,
        pitchCount: 12,
      },
      {
        variabilityScore: 55,
        contour: 'rising',
        range: 30,
        startTime: 8000,
        endTime: 9500,
        meanPitch: 215,
        stdDev: 10,
        durationMs: 1500,
        pitchCount: 10,
      },
    ];

    // --- Phase 1: Start and run for 5 seconds ---
    sm.start(samplerFn);

    expect(sm.state).toBe('active');
    expect(sm.id).toBe(FAKE_UUID);

    vi.advanceTimersByTime(5000);
    // 5000ms / 500ms = 10 samples
    expect(samplerFn).toHaveBeenCalledTimes(10);
    expect(sm.samples.length).toBe(10);
    expect(sm.getElapsedSeconds()).toBe(5);

    // --- Phase 2: Pause for 2 seconds ---
    sm.pause();
    expect(sm.state).toBe('paused');

    const elapsedAtPause = sm.getElapsedSeconds();
    expect(elapsedAtPause).toBe(5);

    vi.advanceTimersByTime(2000);

    // Elapsed should still be 5 (frozen)
    expect(sm.getElapsedSeconds()).toBe(5);
    // No new samples during pause
    expect(samplerFn).toHaveBeenCalledTimes(10);
    expect(sm.samples.length).toBe(10);

    // --- Phase 3: Resume and run for 3 more seconds ---
    sm.resume();
    expect(sm.state).toBe('active');

    vi.advanceTimersByTime(3000);
    // 3000ms / 500ms = 6 more samples
    expect(samplerFn).toHaveBeenCalledTimes(16);
    expect(sm.samples.length).toBe(16);

    // Elapsed: 5s + 3s = 8s (2s pause excluded)
    expect(sm.getElapsedSeconds()).toBe(8);

    // --- Phase 4: Stop and verify summary ---
    const summary = sm.stop(phraseHistory);

    expect(sm.state).toBe('stopped');
    expect(summary).toBeDefined();

    // Metadata
    expect(summary.id).toBe(FAKE_UUID);
    expect(summary.sampleCount).toBe(16);
    expect(summary.durationSeconds).toBe(8);
    expect(summary.startedAt).toBeDefined();
    expect(summary.endedAt).toBeDefined();

    // Validate ISO date formats
    expect(() => new Date(summary.startedAt)).not.toThrow();
    expect(() => new Date(summary.endedAt)).not.toThrow();

    // Pillar scores -- all samples have the same values, so avg=min=max
    expect(summary.pillarScores.lightness.avg).toBe(60);
    expect(summary.pillarScores.lightness.min).toBe(60);
    expect(summary.pillarScores.lightness.max).toBe(60);
    expect(summary.pillarScores.lightness.score).toBe(60);

    expect(summary.pillarScores.resonance.avg).toBe(40);
    expect(summary.pillarScores.resonance.min).toBe(40);
    expect(summary.pillarScores.resonance.max).toBe(40);

    expect(summary.pillarScores.variability.avg).toBe(50);
    expect(summary.pillarScores.variability.min).toBe(50);
    expect(summary.pillarScores.variability.max).toBe(50);

    expect(summary.pillarScores.pitch.avg).toBe(75);
    expect(summary.pillarScores.pitch.min).toBe(75);
    expect(summary.pillarScores.pitch.max).toBe(75);

    // Composite score -- all 16 samples have compositeScore=68
    expect(summary.compositeScore).toBe(68);

    // Extras
    expect(summary.extras.h1h2Avg).toBe(14);
    expect(summary.extras.f1Avg).toBe(520);
    expect(summary.extras.f2Avg).toBe(1480);
    expect(summary.extras.f3Avg).toBe(2520);
    expect(summary.extras.pitchAvgHz).toBe(210);

    // timeInTargetPct -- all 16 samples have pitch=210 (in 180-250 range)
    expect(summary.extras.timeInTargetPct).toBe(100);

    // Best/worst phrases
    expect(summary.extras.bestPhrase.variabilityScore).toBe(72);
    expect(summary.extras.bestPhrase.contour).toBe('varied');
    expect(summary.extras.worstPhrase.variabilityScore).toBe(35);
    expect(summary.extras.worstPhrase.contour).toBe('monotone');

    // Trends -- no previous session, all should be flat
    expect(summary.pillarTrends.lightness).toBe('flat');
    expect(summary.pillarTrends.resonance).toBe('flat');
    expect(summary.pillarTrends.variability).toBe('flat');
    expect(summary.pillarTrends.pitch).toBe('flat');
  });

  it('lifecycle with previous session produces correct trends', () => {
    // Previous session had lower lightness and resonance, higher variability
    const previousSession = {
      pillarScores: {
        lightness: { avg: 45, min: 40, max: 50, score: 45 },
        resonance: { avg: 35, min: 30, max: 40, score: 35 },
        variability: { avg: 60, min: 55, max: 65, score: 60 },
        pitch: { avg: 75, min: 70, max: 80, score: 75 },
      },
    };

    sm.setPreviousSession(previousSession);

    const samplerFn = vi.fn(() => ({
      lightness: 55,      // prev avg 45 -> delta +10 -> up
      resonance: 36,      // prev avg 35 -> delta +1  -> flat
      variability: 50,    // prev avg 60 -> delta -10 -> down
      pitch: 210,
      pitchScore: 76,     // prev avg 75 -> delta +1  -> flat
      h1h2: 12,
      f1: 500,
      f2: 1500,
      f3: 2500,
      compositeScore: 65,
    }));

    sm.start(samplerFn);
    vi.advanceTimersByTime(2000); // 4 samples
    const summary = sm.stop([]);

    expect(summary.pillarTrends.lightness).toBe('up');
    expect(summary.pillarTrends.resonance).toBe('flat');
    expect(summary.pillarTrends.variability).toBe('down');
    expect(summary.pillarTrends.pitch).toBe('flat');
  });

  it('lifecycle with mixed pitch values computes correct timeInTargetPct', () => {
    let callIndex = 0;
    const pitchValues = [150, 180, 200, 220, 250, 260, 170, 215, 190, 300];
    // In range (180-250): 180, 200, 220, 250, 215, 190 = 6 out of 10 = 60%

    const samplerFn = vi.fn(() => {
      const pitch = pitchValues[callIndex % pitchValues.length];
      callIndex++;
      return {
        lightness: 50,
        resonance: 50,
        variability: 50,
        pitch,
        pitchScore: 70,
        h1h2: 10,
        f1: 500,
        f2: 1500,
        f3: 2500,
        compositeScore: 60,
      };
    });

    sm.start(samplerFn);
    vi.advanceTimersByTime(5000); // 10 samples
    const summary = sm.stop([]);

    expect(summary.sampleCount).toBe(10);
    expect(summary.extras.timeInTargetPct).toBe(60);

    // Pitch avg: (150+180+200+220+250+260+170+215+190+300) / 10 = 2135/10 = 213.5
    expect(summary.extras.pitchAvgHz).toBe(213.5);
  });

  it('lifecycle with multiple pause/resume cycles tracks time correctly', () => {
    const samplerFn = vi.fn(() => ({
      lightness: 50,
      resonance: 50,
      variability: 50,
      pitch: 210,
      pitchScore: 70,
      h1h2: 10,
      f1: 500,
      f2: 1500,
      f3: 2500,
      compositeScore: 60,
    }));

    sm.start(samplerFn);

    // Active 2s (4 samples)
    vi.advanceTimersByTime(2000);
    expect(sm.samples.length).toBe(4);

    // Pause 3s
    sm.pause();
    vi.advanceTimersByTime(3000);
    expect(sm.samples.length).toBe(4);

    // Resume, active 1s (2 samples)
    sm.resume();
    vi.advanceTimersByTime(1000);
    expect(sm.samples.length).toBe(6);

    // Pause 5s
    sm.pause();
    vi.advanceTimersByTime(5000);
    expect(sm.samples.length).toBe(6);

    // Resume, active 2s (4 samples)
    sm.resume();
    vi.advanceTimersByTime(2000);
    expect(sm.samples.length).toBe(10);

    const summary = sm.stop([]);

    // Active time: 2 + 1 + 2 = 5s
    // Paused time: 3 + 5 = 8s
    // Wall time: 13s
    expect(summary.durationSeconds).toBe(5);
    expect(summary.sampleCount).toBe(10);
  });

  it('reset mid-session allows a clean restart', () => {
    const sampler1 = vi.fn(() => ({
      lightness: 30,
      resonance: 30,
      variability: 30,
      pitch: 150,
      pitchScore: 40,
      h1h2: 8,
      f1: 400,
      f2: 1400,
      f3: 2400,
      compositeScore: 35,
    }));

    sm.start(sampler1);
    vi.advanceTimersByTime(2000); // 4 samples
    sm.reset();

    expect(sm.state).toBe('idle');
    expect(sm.id).toBeNull();
    expect(sm.samples).toEqual([]);
    expect(sm.getElapsedSeconds()).toBe(0);

    // Start a new session with different data
    const sampler2 = vi.fn(() => ({
      lightness: 80,
      resonance: 70,
      variability: 65,
      pitch: 230,
      pitchScore: 90,
      h1h2: 20,
      f1: 600,
      f2: 1600,
      f3: 2600,
      compositeScore: 82,
    }));

    sm.start(sampler2);
    vi.advanceTimersByTime(1500); // 3 samples
    const summary = sm.stop([]);

    // Should only reflect the second session's data
    expect(summary.sampleCount).toBe(3);
    expect(summary.pillarScores.lightness.avg).toBe(80);
    expect(summary.pillarScores.resonance.avg).toBe(70);
    expect(summary.compositeScore).toBe(82);
    expect(summary.durationSeconds).toBe(2); // Math.round(1.5) = 2
  });
});
