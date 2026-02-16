/**
 * CalibrationManager — Personalized score mapping via two-phase calibration.
 *
 * Phase A: Capture masculine baseline (normal voice, 30s)
 * Phase B: Capture feminine ceiling (best feminine voice, 30s)
 *
 * Once calibrated, rawToPersonalized() maps raw 0-100 analyzer scores
 * to a personal scale where:
 *   - Baseline → ~20 (not 0 — even at baseline the user is doing something)
 *   - Ceiling  → ~70 (room to grow beyond current best)
 *   - Linear interpolation between, extrapolation beyond
 *
 * Persistence via localStorage (swappable for API later).
 */

const STORAGE_KEY = 'vox-femina-calibration';
const PILLARS = ['pitch', 'lightness', 'resonance', 'variability'];

// Personal scale mapping constants
const BASELINE_PERSONAL = 20;
const CEILING_PERSONAL = 70;

export class CalibrationManager {
  constructor() {
    /** @type {{ pitch: Range, lightness: Range, resonance: Range, variability: Range } | null} */
    this.calibrationData = null;
    /** @type {string|null} Current capture phase: 'baseline' | 'ceiling' | null */
    this.capturePhase = null;
    /** @type {Array<CapturedFrame>} Accumulated frames during capture */
    this._captureBuffer = [];

    this._loadFromStorage();
  }

  /**
   * Check if calibration data exists.
   * @returns {boolean}
   */
  isCalibrated() {
    return this.calibrationData !== null;
  }

  /**
   * Get stored calibration data.
   * @returns {object|null}
   */
  getData() {
    return this.calibrationData;
  }

  /**
   * Start capturing baseline or ceiling metrics.
   * @param {'baseline' | 'ceiling'} phase
   */
  startCapture(phase) {
    this.capturePhase = phase;
    this._captureBuffer = [];
  }

  /**
   * Feed a frame of metrics during capture.
   * Called on each rAF tick while calibration is active.
   *
   * @param {{ pitch: number|null, lightness: number|null, resonance: number|null, variability: number|null }} metrics
   */
  addFrame(metrics) {
    if (!this.capturePhase) return;
    this._captureBuffer.push({ ...metrics, time: Date.now() });
  }

  /**
   * End the current capture phase and compute aggregate metrics.
   * @returns {{ pitch: number|null, lightness: number|null, resonance: number|null, variability: number|null, sampleCount: number }}
   */
  endCapture() {
    const phase = this.capturePhase;
    this.capturePhase = null;

    // Filter to frames with actual data (non-null)
    const validFrames = this._captureBuffer.filter(f =>
      f.pitch !== null || f.lightness !== null || f.resonance !== null || f.variability !== null
    );

    const result = {
      pitch: CalibrationManager._median(validFrames.map(f => f.pitch).filter(v => v !== null)),
      lightness: CalibrationManager._median(validFrames.map(f => f.lightness).filter(v => v !== null)),
      resonance: CalibrationManager._median(validFrames.map(f => f.resonance).filter(v => v !== null)),
      variability: CalibrationManager._median(validFrames.map(f => f.variability).filter(v => v !== null)),
      sampleCount: validFrames.length,
    };

    this._captureBuffer = [];
    return { phase, ...result };
  }

  /**
   * Store calibration results from both phases.
   *
   * @param {{ pitch: number|null, lightness: number|null, resonance: number|null, variability: number|null }} baseline
   * @param {{ pitch: number|null, lightness: number|null, resonance: number|null, variability: number|null }} ceiling
   */
  saveCalibration(baseline, ceiling) {
    this.calibrationData = {};
    for (const pillar of PILLARS) {
      const b = baseline[pillar];
      const c = ceiling[pillar];
      if (b !== null && c !== null && c !== b) {
        this.calibrationData[pillar] = { baseline: b, ceiling: c };
      } else {
        this.calibrationData[pillar] = null;
      }
    }
    this.calibrationData.timestamp = Date.now();
    this._saveToStorage();
  }

  /**
   * Map a raw analyzer score (0-100) to a personalized scale.
   *
   * @param {'pitch' | 'lightness' | 'resonance' | 'variability'} pillar
   * @param {number|null} rawScore — raw 0-100 score from the analyzer
   * @returns {number|null} — personalized 0-100 score, or raw score if uncalibrated
   */
  rawToPersonalized(pillar, rawScore) {
    if (rawScore === null || rawScore === undefined) return null;

    if (!this.calibrationData || !this.calibrationData[pillar]) {
      return rawScore; // No calibration for this pillar — pass through
    }

    const { baseline, ceiling } = this.calibrationData[pillar];

    // Linear interpolation: baseline→BASELINE_PERSONAL, ceiling→CEILING_PERSONAL
    // With extrapolation beyond ceiling
    const range = ceiling - baseline;
    if (range === 0) return rawScore;

    const normalized = (rawScore - baseline) / range;
    const personal = BASELINE_PERSONAL + normalized * (CEILING_PERSONAL - BASELINE_PERSONAL);

    // Clamp to 0-100 but allow going above ceiling (extrapolation)
    return Math.max(0, Math.min(100, Math.round(personal)));
  }

  /**
   * Reset calibration state to redo the flow.
   */
  recalibrate() {
    this.calibrationData = null;
    this.capturePhase = null;
    this._captureBuffer = [];
    this._clearStorage();
  }

  // ============================================
  // Storage
  // ============================================

  /** @private */
  _loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        this.calibrationData = JSON.parse(raw);
      }
    } catch {
      this.calibrationData = null;
    }
  }

  /** @private */
  _saveToStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.calibrationData));
    } catch {
      // Storage full or unavailable — calibration still works in-memory
    }
  }

  /** @private */
  _clearStorage() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore
    }
  }

  // ============================================
  // Static helpers
  // ============================================

  /**
   * Compute median of a numeric array. Returns null for empty arrays.
   * @param {number[]} values
   * @returns {number|null}
   */
  static _median(values) {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
      return Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10;
    }
    return Math.round(sorted[mid] * 10) / 10;
  }
}
