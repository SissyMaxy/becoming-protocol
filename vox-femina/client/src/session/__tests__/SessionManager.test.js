import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SessionManager } from '../SessionManager';

// ============================================
// Global mocks
// ============================================

const FAKE_UUID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

vi.stubGlobal('crypto', {
  randomUUID: vi.fn(() => FAKE_UUID),
});

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

// Suppress console.warn from graceful error handlers
vi.spyOn(console, 'warn').mockImplementation(() => {});

describe('SessionManager', () => {
  let sm;

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock.mockReset();
    sm = new SessionManager();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ============================================
  // 1. Initial state
  // ============================================

  describe('initial state', () => {
    it('should start in idle state', () => {
      expect(sm.state).toBe('idle');
    });

    it('should have null id', () => {
      expect(sm.id).toBeNull();
    });

    it('should have empty samples', () => {
      expect(sm.samples).toEqual([]);
    });

    it('should return 0 elapsed seconds', () => {
      expect(sm.getElapsedSeconds()).toBe(0);
    });
  });

  // ============================================
  // 2. State transitions
  // ============================================

  describe('state transitions', () => {
    it('should transition idle -> active on start()', () => {
      sm.start(vi.fn());
      expect(sm.state).toBe('active');
    });

    it('should transition active -> paused on pause()', () => {
      sm.start(vi.fn());
      sm.pause();
      expect(sm.state).toBe('paused');
    });

    it('should transition paused -> active on resume()', () => {
      sm.start(vi.fn());
      sm.pause();
      sm.resume();
      expect(sm.state).toBe('active');
    });

    it('should transition active -> stopped on stop()', () => {
      sm.start(vi.fn());
      sm.stop();
      expect(sm.state).toBe('stopped');
    });

    it('should transition paused -> stopped on stop()', () => {
      sm.start(vi.fn());
      sm.pause();
      sm.stop();
      expect(sm.state).toBe('stopped');
    });

    it('should throw on idle -> paused', () => {
      expect(() => sm.pause()).toThrow('Invalid state transition: idle -> paused');
    });

    it('should throw on idle -> stopped', () => {
      expect(() => sm.stop()).toThrow('Invalid state transition: idle -> stopped');
    });

    it('should throw on idle -> resumed', () => {
      expect(() => sm.resume()).toThrow('Invalid state transition: idle -> active (resume is only valid from paused)');
    });

    it('should throw on active -> active (double start)', () => {
      sm.start(vi.fn());
      expect(() => sm.start(vi.fn())).toThrow('Invalid state transition: active -> active');
    });

    it('should throw on paused -> paused (double pause)', () => {
      sm.start(vi.fn());
      sm.pause();
      expect(() => sm.pause()).toThrow('Invalid state transition: paused -> paused');
    });

    it('should throw on stopped -> active', () => {
      sm.start(vi.fn());
      sm.stop();
      expect(() => sm.start(vi.fn())).toThrow('Invalid state transition: stopped -> active');
    });

    it('should throw on stopped -> paused', () => {
      sm.start(vi.fn());
      sm.stop();
      expect(() => sm.pause()).toThrow('Invalid state transition: stopped -> paused');
    });

    it('should throw on stopped -> stopped', () => {
      sm.start(vi.fn());
      sm.stop();
      expect(() => sm.stop()).toThrow('Invalid state transition: stopped -> stopped');
    });
  });

  // ============================================
  // 3. Sampling
  // ============================================

  describe('sampling', () => {
    it('should assign a UUID on start', () => {
      sm.start(vi.fn());
      expect(sm.id).toBe(FAKE_UUID);
    });

    it('should call samplerFn every 500ms when active', () => {
      const sampler = vi.fn(() => makeSample());
      sm.start(sampler);

      vi.advanceTimersByTime(2500);

      // 2500ms / 500ms = 5 calls
      expect(sampler).toHaveBeenCalledTimes(5);
      expect(sm.samples.length).toBe(5);
    });

    it('should not call samplerFn when paused', () => {
      const sampler = vi.fn(() => makeSample());
      sm.start(sampler);

      vi.advanceTimersByTime(1000); // 2 samples
      sm.pause();
      vi.advanceTimersByTime(2000); // paused -- no samples

      expect(sampler).toHaveBeenCalledTimes(2);
      expect(sm.samples.length).toBe(2);
    });

    it('should resume sampling after pause', () => {
      const sampler = vi.fn(() => makeSample());
      sm.start(sampler);

      vi.advanceTimersByTime(1000); // 2 samples
      sm.pause();
      vi.advanceTimersByTime(2000); // paused
      sm.resume();
      vi.advanceTimersByTime(1500); // 3 more samples

      expect(sampler).toHaveBeenCalledTimes(5);
      expect(sm.samples.length).toBe(5);
    });

    it('should stop sampling on stop()', () => {
      const sampler = vi.fn(() => makeSample());
      sm.start(sampler);

      vi.advanceTimersByTime(1000); // 2 samples
      sm.stop();
      vi.advanceTimersByTime(2000); // stopped -- no more

      expect(sampler).toHaveBeenCalledTimes(2);
    });

    it('should handle samplerFn throwing without crashing', () => {
      let callCount = 0;
      const sampler = vi.fn(() => {
        callCount++;
        if (callCount === 2) throw new Error('sensor failure');
        return makeSample();
      });

      sm.start(sampler);
      vi.advanceTimersByTime(1500); // 3 ticks: sample, error, sample

      expect(sampler).toHaveBeenCalledTimes(3);
      // Only 2 samples saved (tick 1 and tick 3), tick 2 threw
      expect(sm.samples.length).toBe(2);
    });
  });

  // ============================================
  // 4. Timer / getElapsedSeconds
  // ============================================

  describe('timer', () => {
    it('should track elapsed time', () => {
      sm.start(vi.fn());
      vi.advanceTimersByTime(5000);
      expect(sm.getElapsedSeconds()).toBe(5);
    });

    it('should freeze elapsed time when paused', () => {
      sm.start(vi.fn());
      vi.advanceTimersByTime(3000);
      sm.pause();

      const atPause = sm.getElapsedSeconds();
      expect(atPause).toBe(3);

      vi.advanceTimersByTime(10000);
      expect(sm.getElapsedSeconds()).toBe(3); // still frozen
    });

    it('should exclude pause duration after resume', () => {
      sm.start(vi.fn());
      vi.advanceTimersByTime(3000); // 3s active
      sm.pause();
      vi.advanceTimersByTime(2000); // 2s paused
      sm.resume();
      vi.advanceTimersByTime(4000); // 4s active

      // Total active = 3 + 4 = 7s
      expect(sm.getElapsedSeconds()).toBe(7);
    });

    it('should handle multiple pause/resume cycles', () => {
      sm.start(vi.fn());

      vi.advanceTimersByTime(2000); // 2s active
      sm.pause();
      vi.advanceTimersByTime(1000); // 1s paused
      sm.resume();

      vi.advanceTimersByTime(3000); // 3s active
      sm.pause();
      vi.advanceTimersByTime(5000); // 5s paused
      sm.resume();

      vi.advanceTimersByTime(1000); // 1s active

      // Total active: 2 + 3 + 1 = 6s
      // Total paused: 1 + 5 = 6s
      expect(sm.getElapsedSeconds()).toBe(6);
    });

    it('should freeze elapsed at stop time', () => {
      sm.start(vi.fn());
      vi.advanceTimersByTime(4000);
      sm.stop();

      vi.advanceTimersByTime(10000); // more time passes
      expect(sm.getElapsedSeconds()).toBe(4); // still 4
    });

    it('should freeze elapsed at stop time after pause', () => {
      sm.start(vi.fn());
      vi.advanceTimersByTime(3000); // 3s active
      sm.pause();
      vi.advanceTimersByTime(2000); // 2s paused
      sm.stop();

      // Active time was 3s at time of pause, which is when it froze
      // When stopping from paused, endedAt = now, but totalPaused includes
      // the current pause period: now - pausedAt = 2000ms
      // elapsed = (endedAt - startedAt - totalPausedMs) = (5000 - 2000) / 1000 = 3
      expect(sm.getElapsedSeconds()).toBe(3);
    });
  });

  // ============================================
  // 5. Summary generation
  // ============================================

  describe('summary generation', () => {
    it('should produce correct pillar avg/min/max from known inputs', () => {
      const samples = [
        makeSample({ lightness: 60, resonance: 40, variability: 50, pitchScore: 70 }),
        makeSample({ lightness: 80, resonance: 60, variability: 30, pitchScore: 90 }),
        makeSample({ lightness: 70, resonance: 50, variability: 40, pitchScore: 80 }),
      ];
      const sampler = sampleSequence(samples);

      sm.start(sampler);
      vi.advanceTimersByTime(1500); // 3 samples
      const summary = sm.stop();

      expect(summary.pillarScores.lightness.avg).toBe(70);
      expect(summary.pillarScores.lightness.min).toBe(60);
      expect(summary.pillarScores.lightness.max).toBe(80);
      expect(summary.pillarScores.lightness.score).toBe(70);

      expect(summary.pillarScores.resonance.avg).toBe(50);
      expect(summary.pillarScores.resonance.min).toBe(40);
      expect(summary.pillarScores.resonance.max).toBe(60);

      expect(summary.pillarScores.variability.avg).toBe(40);
      expect(summary.pillarScores.variability.min).toBe(30);
      expect(summary.pillarScores.variability.max).toBe(50);

      expect(summary.pillarScores.pitch.avg).toBe(80);
      expect(summary.pillarScores.pitch.min).toBe(70);
      expect(summary.pillarScores.pitch.max).toBe(90);
    });

    it('should handle null pillar values gracefully', () => {
      const samples = [
        makeSample({ lightness: null, resonance: 40, variability: null, pitchScore: null }),
        makeSample({ lightness: null, resonance: 60, variability: null, pitchScore: null }),
      ];
      const sampler = sampleSequence(samples);

      sm.start(sampler);
      vi.advanceTimersByTime(1000); // 2 samples
      const summary = sm.stop();

      expect(summary.pillarScores.lightness.avg).toBeNull();
      expect(summary.pillarScores.lightness.min).toBeNull();
      expect(summary.pillarScores.lightness.max).toBeNull();
      expect(summary.pillarScores.lightness.score).toBeNull();

      expect(summary.pillarScores.resonance.avg).toBe(50);
    });

    it('should compute timeInTargetPct correctly', () => {
      // 3 pitches in range (180-250), 2 outside
      const samples = [
        makeSample({ pitch: 200 }),  // in
        makeSample({ pitch: 220 }),  // in
        makeSample({ pitch: 160 }),  // out
        makeSample({ pitch: 250 }),  // in (boundary)
        makeSample({ pitch: 300 }),  // out
      ];
      const sampler = sampleSequence(samples);

      sm.start(sampler);
      vi.advanceTimersByTime(2500); // 5 samples
      const summary = sm.stop();

      // 3 out of 5 = 60%
      expect(summary.extras.timeInTargetPct).toBe(60);
    });

    it('should compute pitchAvgHz from raw pitch values', () => {
      const samples = [
        makeSample({ pitch: 200 }),
        makeSample({ pitch: 220 }),
        makeSample({ pitch: 240 }),
      ];
      const sampler = sampleSequence(samples);

      sm.start(sampler);
      vi.advanceTimersByTime(1500); // 3 samples
      const summary = sm.stop();

      expect(summary.extras.pitchAvgHz).toBe(220);
    });

    it('should find bestPhrase and worstPhrase', () => {
      sm.start(() => makeSample());
      vi.advanceTimersByTime(500);

      const phraseHistory = [
        { variabilityScore: 30, contour: 'monotone', range: 10, startTime: 0, endTime: 100 },
        { variabilityScore: 80, contour: 'varied', range: 50, startTime: 200, endTime: 400 },
        { variabilityScore: 55, contour: 'rising', range: 25, startTime: 500, endTime: 700 },
      ];

      const summary = sm.stop(phraseHistory);

      expect(summary.extras.bestPhrase.variabilityScore).toBe(80);
      expect(summary.extras.worstPhrase.variabilityScore).toBe(30);
    });

    it('should return null for bestPhrase/worstPhrase with empty phraseHistory', () => {
      sm.start(() => makeSample());
      vi.advanceTimersByTime(500);
      const summary = sm.stop([]);

      expect(summary.extras.bestPhrase).toBeNull();
      expect(summary.extras.worstPhrase).toBeNull();
    });

    it('should compute compositeScore as average of sample compositeScores', () => {
      const samples = [
        makeSample({ compositeScore: 60 }),
        makeSample({ compositeScore: 80 }),
        makeSample({ compositeScore: 70 }),
      ];
      const sampler = sampleSequence(samples);

      sm.start(sampler);
      vi.advanceTimersByTime(1500); // 3 samples
      const summary = sm.stop();

      expect(summary.compositeScore).toBe(70);
    });

    it('should include id, timestamps, durationSeconds, sampleCount', () => {
      sm.start(() => makeSample());
      vi.advanceTimersByTime(3000); // 6 samples
      const summary = sm.stop();

      expect(summary.id).toBe(FAKE_UUID);
      expect(summary.startedAt).toBeDefined();
      expect(summary.endedAt).toBeDefined();
      expect(summary.durationSeconds).toBe(3);
      expect(summary.sampleCount).toBe(6);
    });

    it('should compute extras formant averages', () => {
      const samples = [
        makeSample({ h1h2: 10, f1: 500, f2: 1500, f3: 2500 }),
        makeSample({ h1h2: 20, f1: 600, f2: 1600, f3: 2600 }),
      ];
      const sampler = sampleSequence(samples);

      sm.start(sampler);
      vi.advanceTimersByTime(1000);
      const summary = sm.stop();

      expect(summary.extras.h1h2Avg).toBe(15);
      expect(summary.extras.f1Avg).toBe(550);
      expect(summary.extras.f2Avg).toBe(1550);
      expect(summary.extras.f3Avg).toBe(2550);
    });

    it('should handle timeInTargetPct when all pitches are null', () => {
      const samples = [
        makeSample({ pitch: null }),
        makeSample({ pitch: null }),
      ];
      const sampler = sampleSequence(samples);

      sm.start(sampler);
      vi.advanceTimersByTime(1000);
      const summary = sm.stop();

      expect(summary.extras.timeInTargetPct).toBeNull();
    });
  });

  // ============================================
  // 6. Trend calculation
  // ============================================

  describe('trend calculation', () => {
    it('should return "flat" when no previous session', () => {
      expect(SessionManager._computeTrend(50, null)).toBe('flat');
      expect(SessionManager._computeTrend(50, undefined)).toBe('flat');
    });

    it('should return "flat" when current is null', () => {
      expect(SessionManager._computeTrend(null, 50)).toBe('flat');
    });

    it('should return "up" when delta > 2', () => {
      expect(SessionManager._computeTrend(55, 50)).toBe('up');
      expect(SessionManager._computeTrend(53, 50)).toBe('up');
    });

    it('should return "down" when delta < -2', () => {
      expect(SessionManager._computeTrend(45, 50)).toBe('down');
      expect(SessionManager._computeTrend(47, 50)).toBe('down');
    });

    it('should return "flat" when delta is within [-2, 2]', () => {
      expect(SessionManager._computeTrend(51, 50)).toBe('flat');
      expect(SessionManager._computeTrend(49, 50)).toBe('flat');
      expect(SessionManager._computeTrend(52, 50)).toBe('flat');
      expect(SessionManager._computeTrend(48, 50)).toBe('flat');
      expect(SessionManager._computeTrend(50, 50)).toBe('flat');
    });

    it('should compute pillarTrends in summary from previous session', () => {
      const prevSummary = {
        pillarScores: {
          lightness: { avg: 50, min: 40, max: 60, score: 50 },
          resonance: { avg: 60, min: 50, max: 70, score: 60 },
          variability: { avg: 40, min: 30, max: 50, score: 40 },
          pitch: { avg: 70, min: 60, max: 80, score: 70 },
        },
      };
      sm.setPreviousSession(prevSummary);

      // Lightness avg will be 60 (prev 50 -> up, delta 10)
      // Resonance avg will be 60 (prev 60 -> flat, delta 0)
      // Variability avg will be 35 (prev 40 -> down, delta -5)
      // Pitch avg will be 72 (prev 70 -> flat, delta 2)
      const samples = [
        makeSample({ lightness: 60, resonance: 60, variability: 35, pitchScore: 72 }),
      ];
      const sampler = sampleSequence(samples);

      sm.start(sampler);
      vi.advanceTimersByTime(500);
      const summary = sm.stop();

      expect(summary.pillarTrends.lightness).toBe('up');
      expect(summary.pillarTrends.resonance).toBe('flat');
      expect(summary.pillarTrends.variability).toBe('down');
      expect(summary.pillarTrends.pitch).toBe('flat');
    });

    it('should produce all flat trends when no previous session is set', () => {
      const samples = [makeSample()];
      const sampler = sampleSequence(samples);

      sm.start(sampler);
      vi.advanceTimersByTime(500);
      const summary = sm.stop();

      expect(summary.pillarTrends.lightness).toBe('flat');
      expect(summary.pillarTrends.resonance).toBe('flat');
      expect(summary.pillarTrends.variability).toBe('flat');
      expect(summary.pillarTrends.pitch).toBe('flat');
    });
  });

  // ============================================
  // 7. Server communication
  // ============================================

  describe('server communication', () => {
    it('saveSession should POST to /api/sessions', async () => {
      fetchMock.mockResolvedValueOnce({ ok: true });

      const summary = { id: 'test-123', compositeScore: 72 };
      await sm.saveSession(summary);

      expect(fetchMock).toHaveBeenCalledWith('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(summary),
      });
    });

    it('getHistory should GET /api/sessions and return array', async () => {
      const sessions = [{ id: '1' }, { id: '2' }];
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => sessions,
      });

      const result = await sm.getHistory();
      expect(fetchMock).toHaveBeenCalledWith('/api/sessions');
      expect(result).toEqual(sessions);
    });

    it('getSession should GET /api/sessions/:id and return object', async () => {
      const session = { id: 'abc', compositeScore: 65 };
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => session,
      });

      const result = await sm.getSession('abc');
      expect(fetchMock).toHaveBeenCalledWith('/api/sessions/abc');
      expect(result).toEqual(session);
    });

    it('getSession should return null on 404', async () => {
      fetchMock.mockResolvedValueOnce({ ok: false, status: 404 });
      const result = await sm.getSession('nonexistent');
      expect(result).toBeNull();
    });

    it('clearHistory should DELETE /api/sessions', async () => {
      fetchMock.mockResolvedValueOnce({ ok: true });
      await sm.clearHistory();

      expect(fetchMock).toHaveBeenCalledWith('/api/sessions', {
        method: 'DELETE',
      });
    });

    it('saveSession should not throw on network error', async () => {
      fetchMock.mockRejectedValueOnce(new Error('Network error'));
      await expect(sm.saveSession({ id: '1' })).resolves.toBeUndefined();
    });

    it('getHistory should return [] on network error', async () => {
      fetchMock.mockRejectedValueOnce(new Error('Network error'));
      const result = await sm.getHistory();
      expect(result).toEqual([]);
    });

    it('getSession should return null on network error', async () => {
      fetchMock.mockRejectedValueOnce(new Error('Network error'));
      const result = await sm.getSession('abc');
      expect(result).toBeNull();
    });

    it('clearHistory should not throw on network error', async () => {
      fetchMock.mockRejectedValueOnce(new Error('Network error'));
      await expect(sm.clearHistory()).resolves.toBeUndefined();
    });

    it('getHistory should return [] on non-ok response', async () => {
      fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });
      const result = await sm.getHistory();
      expect(result).toEqual([]);
    });
  });

  // ============================================
  // 8. Reset
  // ============================================

  describe('reset', () => {
    it('should return to idle state', () => {
      sm.start(vi.fn());
      vi.advanceTimersByTime(1000);
      sm.reset();
      expect(sm.state).toBe('idle');
    });

    it('should clear id', () => {
      sm.start(vi.fn());
      expect(sm.id).toBe(FAKE_UUID);
      sm.reset();
      expect(sm.id).toBeNull();
    });

    it('should clear samples', () => {
      sm.start(() => makeSample());
      vi.advanceTimersByTime(1500);
      expect(sm.samples.length).toBe(3);
      sm.reset();
      expect(sm.samples).toEqual([]);
    });

    it('should reset elapsed time to 0', () => {
      sm.start(vi.fn());
      vi.advanceTimersByTime(5000);
      sm.reset();
      expect(sm.getElapsedSeconds()).toBe(0);
    });

    it('should stop sampling interval', () => {
      const sampler = vi.fn(() => makeSample());
      sm.start(sampler);
      vi.advanceTimersByTime(1000); // 2 calls
      sm.reset();
      vi.advanceTimersByTime(5000); // should not trigger more
      expect(sampler).toHaveBeenCalledTimes(2);
    });

    it('should allow starting a new session after reset', () => {
      sm.start(vi.fn());
      vi.advanceTimersByTime(1000);
      sm.reset();

      // Should not throw
      sm.start(vi.fn());
      expect(sm.state).toBe('active');
    });

    it('should preserve previousSession across reset', () => {
      const prev = { pillarScores: { lightness: { avg: 50 } } };
      sm.setPreviousSession(prev);
      sm.reset();

      // setPreviousSession value persists
      sm.start(() => makeSample({ lightness: 60 }));
      vi.advanceTimersByTime(500);
      const summary = sm.stop();
      expect(summary.pillarTrends.lightness).toBe('up');
    });
  });

  // ============================================
  // _pillarStats static helper
  // ============================================

  describe('_pillarStats', () => {
    it('should return null for empty array', () => {
      expect(SessionManager._pillarStats([])).toBeNull();
    });

    it('should return null for all-null array', () => {
      expect(SessionManager._pillarStats([null, null, null])).toBeNull();
    });

    it('should compute avg/min/max filtering nulls', () => {
      const result = SessionManager._pillarStats([10, null, 30, 20, null]);
      expect(result.avg).toBe(20);
      expect(result.min).toBe(10);
      expect(result.max).toBe(30);
    });

    it('should round avg to 1 decimal', () => {
      const result = SessionManager._pillarStats([10, 20, 30]);
      expect(result.avg).toBe(20);

      const result2 = SessionManager._pillarStats([10, 15]);
      expect(result2.avg).toBe(12.5);
    });

    it('should handle single value', () => {
      const result = SessionManager._pillarStats([42]);
      expect(result.avg).toBe(42);
      expect(result.min).toBe(42);
      expect(result.max).toBe(42);
    });
  });
});

// ============================================
// Test helpers
// ============================================

/**
 * Create a metric sample with defaults, allowing overrides.
 */
function makeSample(overrides = {}) {
  return {
    lightness: 50,
    resonance: 50,
    variability: 50,
    pitch: 210,
    pitchScore: 70,
    h1h2: 12,
    f1: 550,
    f2: 1550,
    f3: 2550,
    compositeScore: 65,
    ...overrides,
  };
}

/**
 * Create a sampler function that returns samples in order,
 * cycling back to the last sample once exhausted.
 */
function sampleSequence(samples) {
  let i = 0;
  return () => {
    const sample = samples[Math.min(i, samples.length - 1)];
    i++;
    return sample;
  };
}
