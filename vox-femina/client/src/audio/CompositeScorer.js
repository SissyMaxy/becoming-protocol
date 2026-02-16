/**
 * CompositeScorer — Combines all four pillar scores into a single
 * Voice Feminization Score (0-100).
 *
 * Pillars and default weights:
 *   - Lightness (vocal weight)  35%
 *   - Resonance                 30%
 *   - Variability (intonation)  20%
 *   - Pitch                     15%
 *
 * Handles missing pillar data by redistributing weights proportionally
 * among available pillars.
 */

const DEFAULT_WEIGHTS = {
  lightness: 0.35,
  resonance: 0.30,
  variability: 0.20,
  pitch: 0.15,
};

export class CompositeScorer {
  constructor(weights) {
    this.weights = { ...DEFAULT_WEIGHTS, ...(weights || {}) };
  }

  /**
   * Update pillar weights. Values should sum to 1.0.
   *
   * @param {{ lightness?: number, resonance?: number, variability?: number, pitch?: number }} weights
   */
  setWeights(weights) {
    this.weights = { ...this.weights, ...weights };
  }

  /**
   * Compute the composite feminization score.
   *
   * @param {{ lightness: number|null, resonance: number|null, variability: number|null, pitch: number|null }} scores
   *   Each score is 0-100 or null if unavailable.
   * @returns {{ compositeScore: number|null, breakdown: object, weights: object }}
   */
  score(scores) {
    const pillars = [
      { key: 'lightness', value: scores.lightness, weight: this.weights.lightness },
      { key: 'resonance', value: scores.resonance, weight: this.weights.resonance },
      { key: 'variability', value: scores.variability, weight: this.weights.variability },
      { key: 'pitch', value: scores.pitch, weight: this.weights.pitch },
    ];

    // Filter to only available pillars (non-null)
    const available = pillars.filter(p => p.value !== null && p.value !== undefined);

    if (available.length === 0) {
      return {
        compositeScore: null,
        breakdown: {
          lightness: null,
          resonance: null,
          variability: null,
          pitch: null,
        },
        weights: { ...this.weights },
      };
    }

    // Redistribute weights proportionally among available pillars
    const totalAvailableWeight = available.reduce((sum, p) => sum + p.weight, 0);

    const breakdown = {};
    let compositeScore = 0;

    for (const pillar of pillars) {
      if (pillar.value === null || pillar.value === undefined) {
        breakdown[pillar.key] = null;
      } else {
        const effectiveWeight = pillar.weight / totalAvailableWeight;
        const contribution = pillar.value * effectiveWeight;
        breakdown[pillar.key] = Math.round(contribution * 10) / 10;
        compositeScore += contribution;
      }
    }

    return {
      compositeScore: Math.round(Math.max(0, Math.min(100, compositeScore))),
      breakdown,
      weights: { ...this.weights },
    };
  }

  /**
   * Convert a pitch value (Hz) to a 0-100 feminization score.
   *
   * Uses a piecewise smooth curve:
   *   - Below 100 Hz: 0
   *   - 100-180 Hz: smooth ramp 0→50 (masculine→androgynous)
   *   - 180-215 Hz: smooth ramp 50→80 (androgynous→feminine center)
   *   - 215-250 Hz: smooth ramp 80→100 (feminine center→high feminine)
   *   - 250-300 Hz: slight plateau 100→90 (unnaturally high decrease)
   *   - Above 300 Hz: 90
   *
   * @param {number|null} pitchHz — current pitch in Hz
   * @returns {number|null} — pitch score 0-100, or null if no pitch
   */
  static pitchToScore(pitchHz) {
    if (pitchHz === null || pitchHz === undefined) return null;

    if (pitchHz <= 100) return 0;
    if (pitchHz >= 300) return 90;

    // Piecewise linear interpolation with smooth transitions
    if (pitchHz <= 180) {
      // 100→180 Hz maps to 0→50
      return lerp(0, 50, (pitchHz - 100) / 80);
    }
    if (pitchHz <= 215) {
      // 180→215 Hz maps to 50→80
      return lerp(50, 80, (pitchHz - 180) / 35);
    }
    if (pitchHz <= 250) {
      // 215→250 Hz maps to 80→100
      return lerp(80, 100, (pitchHz - 215) / 35);
    }
    // 250→300 Hz maps to 100→90
    return lerp(100, 90, (pitchHz - 250) / 50);
  }

  /**
   * Get color for a composite score (red → yellow → green gradient).
   *
   * @param {number} score — 0-100
   * @returns {string} — hex color
   */
  static getScoreColor(score) {
    if (score < 25) return '#ef4444';      // red
    if (score < 40) return '#f97316';      // orange
    if (score < 55) return '#eab308';      // yellow
    if (score < 70) return '#84cc16';      // lime
    if (score < 85) return '#22c55e';      // green
    return '#10b981';                       // emerald
  }

  /**
   * Get a label for a composite score.
   *
   * @param {number} score — 0-100
   * @returns {string}
   */
  static getScoreLabel(score) {
    if (score < 20) return 'Very Masculine';
    if (score < 40) return 'Masculine';
    if (score < 55) return 'Androgynous';
    if (score < 70) return 'Feminine';
    if (score < 85) return 'Very Feminine';
    return 'Highly Feminine';
  }
}

/**
 * Linear interpolation.
 */
function lerp(a, b, t) {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}
