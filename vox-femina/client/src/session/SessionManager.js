/**
 * SessionManager -- Manages voice training session lifecycle.
 *
 * State machine: idle -> active -> paused -> active -> stopped
 *
 * Captures periodic metric samples via a sampler callback,
 * tracks elapsed time (excluding pauses), and generates a
 * SessionSummary on stop with pillar stats, extras, and trends.
 *
 * Server persistence via REST API (/api/sessions).
 */

const VALID_TRANSITIONS = {
  idle:    ['active'],
  active:  ['paused', 'stopped'],
  paused:  ['active', 'stopped'],
  stopped: [],
};

const SAMPLE_INTERVAL_MS = 500;
const PITCH_TARGET_LOW = 180;
const PITCH_TARGET_HIGH = 250;
const TREND_THRESHOLD = 2;

export class SessionManager {
  constructor() {
    this._state = 'idle';
    this._id = null;
    this._startedAt = null;
    this._endedAt = null;
    this._pausedAt = null;
    this._totalPausedMs = 0;
    this._samples = [];
    this._intervalId = null;
    this._samplerFn = null;
    this._previousSession = null;
  }

  // ============================================
  // State
  // ============================================

  /** @returns {'idle'|'active'|'paused'|'stopped'} */
  get state() {
    return this._state;
  }

  /** @returns {string|null} */
  get id() {
    return this._id;
  }

  /** @returns {Array} */
  get samples() {
    return this._samples;
  }

  // ============================================
  // State transitions
  // ============================================

  /**
   * Transition to a new state. Throws if the transition is invalid.
   * @param {string} newState
   * @private
   */
  _transition(newState) {
    const allowed = VALID_TRANSITIONS[this._state];
    if (!allowed || !allowed.includes(newState)) {
      throw new Error(
        `Invalid state transition: ${this._state} -> ${newState}`
      );
    }
    this._state = newState;
  }

  // ============================================
  // Core methods
  // ============================================

  /**
   * Start a new session. Begins sampling at 500ms intervals.
   *
   * @param {Function} samplerFn - Returns current metric snapshot:
   *   { lightness, resonance, variability, pitch, pitchScore, h1h2, f1, f2, f3, compositeScore }
   */
  start(samplerFn) {
    this._transition('active');
    this._samplerFn = samplerFn;
    this._startedAt = Date.now();
    this._id = crypto.randomUUID();
    this._samples = [];
    this._totalPausedMs = 0;
    this._pausedAt = null;
    this._endedAt = null;

    this._startSampling();
  }

  /**
   * Pause the session. Stops sampling and freezes the elapsed timer.
   */
  pause() {
    this._transition('paused');
    this._pausedAt = Date.now();
    this._stopSampling();
  }

  /**
   * Resume the session after a pause. Restarts sampling.
   * Only valid from the 'paused' state.
   */
  resume() {
    if (this._state !== 'paused') {
      throw new Error(
        `Invalid state transition: ${this._state} -> active (resume is only valid from paused)`
      );
    }
    this._transition('active');
    if (this._pausedAt !== null) {
      this._totalPausedMs += Date.now() - this._pausedAt;
      this._pausedAt = null;
    }
    this._startSampling();
  }

  /**
   * Stop the session and generate a summary.
   *
   * @param {Array} phraseHistory - Array of phrase objects from IntonationTracker.
   *   Each has: { variabilityScore, contour, range, startTime, endTime, ... }
   * @returns {object} SessionSummary
   */
  stop(phraseHistory = []) {
    // If stopping while paused, finalize the current pause duration
    if (this._state === 'paused' && this._pausedAt !== null) {
      this._totalPausedMs += Date.now() - this._pausedAt;
      this._pausedAt = null;
    }

    this._transition('stopped');
    this._endedAt = Date.now();
    this._stopSampling();

    return this._generateSummary(phraseHistory);
  }

  /**
   * Reset all state back to idle defaults.
   */
  reset() {
    this._stopSampling();
    this._state = 'idle';
    this._id = null;
    this._startedAt = null;
    this._endedAt = null;
    this._pausedAt = null;
    this._totalPausedMs = 0;
    this._samples = [];
    this._samplerFn = null;
    // Note: _previousSession is preserved across resets intentionally
  }

  /**
   * Store a reference to the previous session summary for trend computation.
   * @param {object|null} summary
   */
  setPreviousSession(summary) {
    this._previousSession = summary;
  }

  // ============================================
  // Timer
  // ============================================

  /**
   * Get elapsed seconds excluding paused time.
   * When paused, the counter freezes at the moment of pause.
   * @returns {number}
   */
  getElapsedSeconds() {
    if (this._startedAt === null) return 0;

    let end;
    if (this._state === 'paused') {
      end = this._pausedAt;
    } else if (this._state === 'stopped') {
      end = this._endedAt;
    } else {
      end = Date.now();
    }

    const totalMs = end - this._startedAt;
    const activeMs = totalMs - this._totalPausedMs;
    return Math.max(0, activeMs / 1000);
  }

  // ============================================
  // Sampling (private)
  // ============================================

  /** @private */
  _startSampling() {
    this._intervalId = setInterval(() => {
      if (this._samplerFn) {
        try {
          const sample = this._samplerFn();
          this._samples.push(sample);
        } catch {
          // Sampler failure -- skip this tick
        }
      }
    }, SAMPLE_INTERVAL_MS);
  }

  /** @private */
  _stopSampling() {
    if (this._intervalId !== null) {
      clearInterval(this._intervalId);
      this._intervalId = null;
    }
  }

  // ============================================
  // Summary generation (private)
  // ============================================

  /**
   * Generate the session summary from collected samples and phrase history.
   *
   * @param {Array} phraseHistory
   * @returns {object} SessionSummary
   * @private
   */
  _generateSummary(phraseHistory) {
    // Filter out samples that are null/undefined entirely
    const validSamples = this._samples.filter(s => s !== null && s !== undefined);

    const lightnessStats = SessionManager._pillarStats(
      validSamples.map(s => s.lightness)
    );
    const resonanceStats = SessionManager._pillarStats(
      validSamples.map(s => s.resonance)
    );
    const variabilityStats = SessionManager._pillarStats(
      validSamples.map(s => s.variability)
    );

    // For pitch pillar: score is based on pitchScore, but we also track raw pitch
    const pitchScoreStats = SessionManager._pillarStats(
      validSamples.map(s => s.pitchScore)
    );
    const rawPitchStats = SessionManager._pillarStats(
      validSamples.map(s => s.pitch)
    );

    // Extras: averages of formant/spectral data
    const h1h2Stats = SessionManager._pillarStats(validSamples.map(s => s.h1h2));
    const f1Stats = SessionManager._pillarStats(validSamples.map(s => s.f1));
    const f2Stats = SessionManager._pillarStats(validSamples.map(s => s.f2));
    const f3Stats = SessionManager._pillarStats(validSamples.map(s => s.f3));

    // Composite score average
    const compositeValues = validSamples
      .map(s => s.compositeScore)
      .filter(v => v !== null && v !== undefined);
    const compositeScore = compositeValues.length > 0
      ? Math.round((compositeValues.reduce((a, b) => a + b, 0) / compositeValues.length) * 10) / 10
      : null;

    // Time in target pitch range (180-250 Hz)
    const rawPitchValues = validSamples
      .map(s => s.pitch)
      .filter(v => v !== null && v !== undefined);
    const inTarget = rawPitchValues.filter(
      p => p >= PITCH_TARGET_LOW && p <= PITCH_TARGET_HIGH
    );
    const timeInTargetPct = rawPitchValues.length > 0
      ? Math.round((inTarget.length / rawPitchValues.length) * 1000) / 10
      : null;

    // Best and worst phrases by variabilityScore
    const scoredPhrases = (phraseHistory || []).filter(
      p => p.variabilityScore !== null && p.variabilityScore !== undefined
    );
    let bestPhrase = null;
    let worstPhrase = null;
    if (scoredPhrases.length > 0) {
      bestPhrase = scoredPhrases.reduce(
        (best, p) => (p.variabilityScore > best.variabilityScore ? p : best),
        scoredPhrases[0]
      );
      worstPhrase = scoredPhrases.reduce(
        (worst, p) => (p.variabilityScore < worst.variabilityScore ? p : worst),
        scoredPhrases[0]
      );
    }

    // Pillar trends (compared to previous session)
    const prev = this._previousSession;
    const pillarTrends = {
      lightness: SessionManager._computeTrend(
        lightnessStats?.avg,
        prev?.pillarScores?.lightness?.avg
      ),
      resonance: SessionManager._computeTrend(
        resonanceStats?.avg,
        prev?.pillarScores?.resonance?.avg
      ),
      variability: SessionManager._computeTrend(
        variabilityStats?.avg,
        prev?.pillarScores?.variability?.avg
      ),
      pitch: SessionManager._computeTrend(
        pitchScoreStats?.avg,
        prev?.pillarScores?.pitch?.avg
      ),
    };

    return {
      id: this._id,
      startedAt: new Date(this._startedAt).toISOString(),
      endedAt: new Date(this._endedAt).toISOString(),
      durationSeconds: Math.round(this.getElapsedSeconds()),
      sampleCount: validSamples.length,
      pillarScores: {
        lightness: lightnessStats
          ? { avg: lightnessStats.avg, min: lightnessStats.min, max: lightnessStats.max, score: lightnessStats.avg }
          : { avg: null, min: null, max: null, score: null },
        resonance: resonanceStats
          ? { avg: resonanceStats.avg, min: resonanceStats.min, max: resonanceStats.max, score: resonanceStats.avg }
          : { avg: null, min: null, max: null, score: null },
        variability: variabilityStats
          ? { avg: variabilityStats.avg, min: variabilityStats.min, max: variabilityStats.max, score: variabilityStats.avg }
          : { avg: null, min: null, max: null, score: null },
        pitch: pitchScoreStats
          ? { avg: pitchScoreStats.avg, min: pitchScoreStats.min, max: pitchScoreStats.max, score: pitchScoreStats.avg }
          : { avg: null, min: null, max: null, score: null },
      },
      extras: {
        h1h2Avg: h1h2Stats?.avg ?? null,
        f1Avg: f1Stats?.avg ?? null,
        f2Avg: f2Stats?.avg ?? null,
        f3Avg: f3Stats?.avg ?? null,
        bestPhrase,
        worstPhrase,
        timeInTargetPct,
        pitchAvgHz: rawPitchStats?.avg ?? null,
      },
      compositeScore,
      pillarTrends,
    };
  }

  // ============================================
  // Static helpers
  // ============================================

  /**
   * Compute aggregate stats (avg, min, max) for a list of values,
   * filtering out nulls and undefined. Returns null if no valid values.
   *
   * @param {Array<number|null>} values
   * @returns {{ avg: number, min: number, max: number }|null}
   */
  static _pillarStats(values) {
    const valid = values.filter(v => v !== null && v !== undefined);
    if (valid.length === 0) return null;

    const sum = valid.reduce((a, b) => a + b, 0);
    const avg = Math.round((sum / valid.length) * 10) / 10;
    const min = Math.round(Math.min(...valid) * 10) / 10;
    const max = Math.round(Math.max(...valid) * 10) / 10;

    return { avg, min, max };
  }

  /**
   * Compute a trend direction by comparing current and previous values.
   *
   * @param {number|null} current
   * @param {number|null} previous
   * @returns {'up'|'down'|'flat'}
   */
  static _computeTrend(current, previous) {
    if (current === null || current === undefined ||
        previous === null || previous === undefined) {
      return 'flat';
    }
    const delta = current - previous;
    if (delta > TREND_THRESHOLD) return 'up';
    if (delta < -TREND_THRESHOLD) return 'down';
    return 'flat';
  }

  // ============================================
  // Server communication
  // ============================================

  /**
   * Save a session summary to the server.
   * @param {object} summary
   */
  async saveSession(summary) {
    try {
      await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(summary),
      });
    } catch (err) {
      console.warn('SessionManager: failed to save session', err);
    }
  }

  /**
   * Retrieve session history from the server.
   * @returns {Promise<Array>}
   */
  async getHistory() {
    try {
      const res = await fetch('/api/sessions');
      if (!res.ok) return [];
      return await res.json();
    } catch (err) {
      console.warn('SessionManager: failed to fetch history', err);
      return [];
    }
  }

  /**
   * Retrieve a single session by ID.
   * @param {string} id
   * @returns {Promise<object|null>}
   */
  async getSession(id) {
    try {
      const res = await fetch(`/api/sessions/${id}`);
      if (!res.ok) return null;
      return await res.json();
    } catch (err) {
      console.warn('SessionManager: failed to fetch session', err);
      return null;
    }
  }

  /**
   * Clear all session history on the server.
   */
  async clearHistory() {
    try {
      await fetch('/api/sessions', {
        method: 'DELETE',
      });
    } catch (err) {
      console.warn('SessionManager: failed to clear history', err);
    }
  }
}
