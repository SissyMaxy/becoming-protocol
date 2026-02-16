/**
 * IntonationTracker — Pillar 3: Intonation & Variability analysis.
 *
 * Consumes pitch values from PitchDetector, segments speech into phrases
 * (using silence gaps), and calculates per-phrase variability metrics:
 *   - Pitch standard deviation
 *   - Pitch range (max - min Hz)
 *   - Directional changes per second (sign changes in pitch derivative)
 *   - Contour classification: rising, falling, rise-fall, monotone, varied
 *   - Composite variability score (0-100)
 *
 * Maintains a rolling phrase history and averages variability across phrases.
 */

const SILENCE_GAP_MS = 200; // >200ms of null pitch = phrase boundary
const MAX_PHRASE_HISTORY = 10;
const MIN_PHRASE_POINTS = 4; // Need at least 4 voiced points to analyze a phrase

// Variability score calibration weights
const STD_DEV_WEIGHT = 0.4;
const RANGE_WEIGHT = 0.3;
const DIR_CHANGE_WEIGHT = 0.3;

// Score mapping ranges (based on typical speech characteristics)
// Std dev: 0-30 Hz maps to 0-100
const STD_DEV_MIN = 0;
const STD_DEV_MAX = 30;
// Range: 0-80 Hz maps to 0-100
const RANGE_MIN = 0;
const RANGE_MAX = 80;
// Directional changes: 0-8 per second maps to 0-100
const DIR_CHANGES_MIN = 0;
const DIR_CHANGES_MAX = 8;

export class IntonationTracker {
  constructor() {
    /** @type {Array<{pitch: number, time: number}>} Current phrase buffer */
    this._currentPhrase = [];
    /** @type {number|null} Last time a voiced pitch was received */
    this._lastVoicedTime = null;
    /** @type {Array<PhraseResult>} Completed phrase history */
    this.phraseHistory = [];
    /** @type {number|null} Rolling variability score across phrases */
    this.variabilityScore = null;
    /** @type {string|null} Current contour classification */
    this.currentContour = null;
    /** @type {PhraseResult|null} Most recent completed phrase data */
    this.currentPhraseData = null;
  }

  /**
   * Feed a new pitch sample from PitchDetector.
   *
   * @param {number|null} pitch — pitch in Hz, or null if silence/unvoiced
   * @param {number} time — timestamp in ms (Date.now())
   * @returns {{ variabilityScore: number|null, currentContour: string|null, phraseHistory: Array, currentPhraseData: object|null }}
   */
  addPitch(pitch, time) {
    if (pitch !== null && pitch > 0) {
      // Check if we need to start a new phrase (gap since last voiced sample)
      if (this._lastVoicedTime !== null && (time - this._lastVoicedTime) > SILENCE_GAP_MS) {
        // Finalize the previous phrase
        this._finalizePhrase();
      }

      this._currentPhrase.push({ pitch, time });
      this._lastVoicedTime = time;
    } else {
      // Silence — check if current phrase should be finalized
      if (this._currentPhrase.length > 0 && this._lastVoicedTime !== null) {
        if ((time - this._lastVoicedTime) > SILENCE_GAP_MS) {
          this._finalizePhrase();
        }
      }
    }

    return {
      variabilityScore: this.variabilityScore,
      currentContour: this.currentContour,
      phraseHistory: this.phraseHistory,
      currentPhraseData: this.currentPhraseData,
    };
  }

  /**
   * Analyze and store the current phrase, then reset the buffer.
   * @private
   */
  _finalizePhrase() {
    if (this._currentPhrase.length < MIN_PHRASE_POINTS) {
      this._currentPhrase = [];
      return;
    }

    const phrase = this._analyzePhrase(this._currentPhrase);
    this.phraseHistory.push(phrase);

    // Keep only the last MAX_PHRASE_HISTORY phrases
    if (this.phraseHistory.length > MAX_PHRASE_HISTORY) {
      this.phraseHistory = this.phraseHistory.slice(-MAX_PHRASE_HISTORY);
    }

    this.currentPhraseData = phrase;
    this.currentContour = phrase.contour;

    // Update rolling variability score (average across recent phrases)
    this._updateRollingScore();

    this._currentPhrase = [];
  }

  /**
   * Analyze a single phrase's pitch data.
   *
   * @param {Array<{pitch: number, time: number}>} points
   * @returns {PhraseResult}
   * @private
   */
  _analyzePhrase(points) {
    const pitches = points.map(p => p.pitch);
    const times = points.map(p => p.time);
    const durationMs = times[times.length - 1] - times[0];
    const durationSec = Math.max(durationMs / 1000, 0.01); // avoid division by zero

    // 1. Pitch standard deviation
    const stdDev = IntonationTracker._stdDev(pitches);

    // 2. Pitch range
    const minPitch = Math.min(...pitches);
    const maxPitch = Math.max(...pitches);
    const range = maxPitch - minPitch;

    // 3. Directional changes per second
    const dirChanges = IntonationTracker._countDirectionalChanges(pitches);
    const dirChangesPerSec = dirChanges / durationSec;

    // 4. Contour classification
    const contour = IntonationTracker._classifyContour(pitches);

    // 5. Composite variability score
    const variabilityScore = this._computeVariabilityScore(stdDev, range, dirChangesPerSec);

    return {
      stdDev: Math.round(stdDev * 10) / 10,
      range: Math.round(range * 10) / 10,
      dirChangesPerSec: Math.round(dirChangesPerSec * 10) / 10,
      contour,
      variabilityScore: Math.round(variabilityScore),
      durationMs: Math.round(durationMs),
      pitchCount: pitches.length,
      startTime: times[0],
      endTime: times[times.length - 1],
      meanPitch: Math.round(IntonationTracker._mean(pitches)),
    };
  }

  /**
   * Compute composite variability score (0-100).
   * @private
   */
  _computeVariabilityScore(stdDev, range, dirChangesPerSec) {
    const stdScore = IntonationTracker._mapToRange(stdDev, STD_DEV_MIN, STD_DEV_MAX);
    const rangeScore = IntonationTracker._mapToRange(range, RANGE_MIN, RANGE_MAX);
    const dirScore = IntonationTracker._mapToRange(dirChangesPerSec, DIR_CHANGES_MIN, DIR_CHANGES_MAX);

    const composite = stdScore * STD_DEV_WEIGHT + rangeScore * RANGE_WEIGHT + dirScore * DIR_CHANGE_WEIGHT;
    return Math.max(0, Math.min(100, composite));
  }

  /**
   * Update the rolling variability score averaged across recent phrases.
   * @private
   */
  _updateRollingScore() {
    if (this.phraseHistory.length === 0) {
      this.variabilityScore = null;
      return;
    }

    const scores = this.phraseHistory.map(p => p.variabilityScore);
    this.variabilityScore = Math.round(IntonationTracker._mean(scores));
  }

  /**
   * Reset all state.
   */
  reset() {
    this._currentPhrase = [];
    this._lastVoicedTime = null;
    this.phraseHistory = [];
    this.variabilityScore = null;
    this.currentContour = null;
    this.currentPhraseData = null;
  }

  // ============================================
  // Static helpers
  // ============================================

  /**
   * Count sign changes in the pitch derivative (directional changes).
   * A sign change occurs when pitch goes from rising to falling or vice versa.
   *
   * @param {number[]} pitches
   * @returns {number}
   */
  static _countDirectionalChanges(pitches) {
    if (pitches.length < 3) return 0;

    let changes = 0;
    let prevDir = 0; // 0 = no direction yet

    for (let i = 1; i < pitches.length; i++) {
      const diff = pitches[i] - pitches[i - 1];
      const dir = diff > 0 ? 1 : diff < 0 ? -1 : 0;

      if (dir !== 0 && prevDir !== 0 && dir !== prevDir) {
        changes++;
      }
      if (dir !== 0) {
        prevDir = dir;
      }
    }

    return changes;
  }

  /**
   * Classify the overall contour shape of a pitch sequence.
   *
   * @param {number[]} pitches
   * @returns {'rising' | 'falling' | 'rise-fall' | 'monotone' | 'varied'}
   */
  static _classifyContour(pitches) {
    if (pitches.length < 2) return 'monotone';

    const stdDev = IntonationTracker._stdDev(pitches);
    const range = Math.max(...pitches) - Math.min(...pitches);

    // Monotone: very low variation
    if (stdDev < 3 || range < 5) return 'monotone';

    // Analyze the overall trajectory using thirds
    const third = Math.floor(pitches.length / 3);
    const firstThird = IntonationTracker._mean(pitches.slice(0, Math.max(third, 1)));
    const lastThird = IntonationTracker._mean(pitches.slice(-Math.max(third, 1)));
    const midThird = IntonationTracker._mean(
      pitches.slice(Math.max(third, 1), Math.max(third * 2, 2))
    );

    const overallDiff = lastThird - firstThird;
    const firstHalfDiff = midThird - firstThird;
    const secondHalfDiff = lastThird - midThird;

    // Check for many directional changes → varied
    const dirChanges = IntonationTracker._countDirectionalChanges(pitches);
    const durationApprox = pitches.length; // rough proxy
    if (dirChanges > durationApprox * 0.15 && dirChanges >= 4) return 'varied';

    // Rise-fall: first half rises, second half falls (or significant rise then fall)
    if (firstHalfDiff > range * 0.2 && secondHalfDiff < -range * 0.2) return 'rise-fall';

    // Rising: overall upward trend
    if (overallDiff > range * 0.3) return 'rising';

    // Falling: overall downward trend
    if (overallDiff < -range * 0.3) return 'falling';

    // Default to varied if none of the above match
    return 'varied';
  }

  /**
   * Classify a variability score into a category.
   *
   * @param {number} score — variability score (0-100)
   * @returns {'monotone' | 'moderate' | 'melodic' | 'very_animated'}
   */
  static classifyVariability(score) {
    if (score < 25) return 'monotone';
    if (score < 50) return 'moderate';
    if (score < 75) return 'melodic';
    return 'very_animated';
  }

  /**
   * Get display info for a variability score.
   *
   * @param {number} score
   * @returns {{ label: string, color: string, category: string }}
   */
  static getVariabilityInfo(score) {
    const category = IntonationTracker.classifyVariability(score);
    switch (category) {
      case 'monotone':
        return { label: 'Monotone', color: '#6366f1', category };
      case 'moderate':
        return { label: 'Moderate', color: '#f59e0b', category };
      case 'melodic':
        return { label: 'Melodic', color: '#10b981', category };
      case 'very_animated':
        return { label: 'Very Animated', color: '#ec4899', category };
      default:
        return { label: '—', color: '#6b7280', category: 'unknown' };
    }
  }

  /**
   * Get display info for a contour type.
   *
   * @param {string} contour
   * @returns {{ label: string, symbol: string }}
   */
  static getContourInfo(contour) {
    switch (contour) {
      case 'rising': return { label: 'Rising', symbol: '↗' };
      case 'falling': return { label: 'Falling', symbol: '↘' };
      case 'rise-fall': return { label: 'Rise-Fall', symbol: '↗↘' };
      case 'monotone': return { label: 'Monotone', symbol: '→' };
      case 'varied': return { label: 'Varied', symbol: '↝' };
      default: return { label: '—', symbol: '—' };
    }
  }

  // ============================================
  // Math utilities
  // ============================================

  static _mean(values) {
    if (values.length === 0) return 0;
    return values.reduce((s, v) => s + v, 0) / values.length;
  }

  static _stdDev(values) {
    if (values.length < 2) return 0;
    const mean = IntonationTracker._mean(values);
    const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
    return Math.sqrt(variance);
  }

  /**
   * Map a value from [min, max] to [0, 100], clamped.
   */
  static _mapToRange(value, min, max) {
    const normalized = (value - min) / (max - min);
    return Math.max(0, Math.min(100, normalized * 100));
  }
}
