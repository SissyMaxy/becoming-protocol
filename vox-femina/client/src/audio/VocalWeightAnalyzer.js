/**
 * VocalWeightAnalyzer — Vocal Weight (Lightness) Analysis
 *
 * Vocal weight is arguably the most important dimension of voice feminization,
 * more so than pitch alone. A "light" voice has:
 *   - Strong fundamental relative to harmonics (high H1-H2)
 *   - Steep spectral slope (harmonics decay quickly)
 *   - Breathier, less pressed phonation
 *
 * A "heavy" voice has:
 *   - Harmonics nearly as strong as the fundamental (low/negative H1-H2)
 *   - Flat spectral slope (energy spread across harmonics)
 *   - Pressed, chest-dominant phonation
 *
 * This analyzer works with the FFT magnitude spectrum (dB) from AudioEngine's
 * getFloatFrequencyData(), which returns values in dB (typically -100 to 0).
 *
 * Requires: FFT size >= 4096 at 44100 Hz for ~10.7 Hz bin resolution,
 * sufficient to isolate individual harmonics in the vocal range.
 */

const SMOOTHING_FACTOR = 0.3; // EMA smoothing for lightness score
const MIN_FUNDAMENTAL_HZ = 80;
const MAX_FUNDAMENTAL_HZ = 400;
const NUM_HARMONICS_FOR_SLOPE = 6; // Use first 6 harmonics for spectral slope
const SILENCE_THRESHOLD_DB = -70; // Below this, treat as silence
const MAX_HARMONIC_HZ = 4000; // Don't look for harmonics above this

export class VocalWeightAnalyzer {
  /**
   * @param {number} sampleRate — audio sample rate (e.g. 44100)
   * @param {number} fftSize — FFT size (must be >= 4096)
   */
  constructor(sampleRate, fftSize = 4096) {
    this.sampleRate = sampleRate;
    this.fftSize = fftSize;
    this.binResolution = sampleRate / fftSize; // Hz per FFT bin
    this.smoothedLightness = null;
  }

  /**
   * Analyze vocal weight from FFT frequency data.
   *
   * @param {Float32Array} frequencyData — dB magnitudes from getFloatFrequencyData()
   * @param {number|null} fundamentalHz — detected pitch from PitchDetector (required)
   * @returns {{ h1h2: number|null, spectralSlope: number|null, lightness: number|null, rawLightness: number|null }}
   */
  analyze(frequencyData, fundamentalHz) {
    if (!frequencyData || frequencyData.length === 0 || fundamentalHz === null || fundamentalHz === undefined) {
      return { h1h2: null, spectralSlope: null, lightness: null, rawLightness: null };
    }

    if (fundamentalHz < MIN_FUNDAMENTAL_HZ || fundamentalHz > MAX_FUNDAMENTAL_HZ) {
      return { h1h2: null, spectralSlope: null, lightness: null, rawLightness: null };
    }

    // Extract harmonic amplitudes
    const harmonics = this._getHarmonicAmplitudes(frequencyData, fundamentalHz);

    if (harmonics.length < 2) {
      return { h1h2: null, spectralSlope: null, lightness: null, rawLightness: null };
    }

    // Check if fundamental is above silence threshold
    if (harmonics[0] < SILENCE_THRESHOLD_DB) {
      return { h1h2: null, spectralSlope: null, lightness: null, rawLightness: null };
    }

    // H1-H2: amplitude difference between first and second harmonic
    const h1h2 = harmonics[0] - harmonics[1];

    // Spectral slope: linear regression of harmonic amplitudes (dB) vs harmonic number
    const spectralSlope = this._calculateSpectralSlope(harmonics);

    // Composite lightness score (0-100)
    const rawLightness = this._calculateLightness(h1h2, spectralSlope);

    // Smooth the output
    if (this.smoothedLightness === null) {
      this.smoothedLightness = rawLightness;
    } else {
      this.smoothedLightness = SMOOTHING_FACTOR * rawLightness + (1 - SMOOTHING_FACTOR) * this.smoothedLightness;
    }

    const lightness = Math.round(this.smoothedLightness * 10) / 10;

    return { h1h2, spectralSlope, lightness, rawLightness };
  }

  /**
   * Reset the smoothing state (e.g., on session start).
   */
  reset() {
    this.smoothedLightness = null;
  }

  /**
   * Get the amplitude (dB) at each harmonic of the fundamental.
   * Uses peak-picking within ±1 bin of the expected harmonic frequency.
   *
   * @param {Float32Array} frequencyData
   * @param {number} fundamentalHz
   * @returns {number[]} — array of dB values for harmonics [H1, H2, H3, ...]
   */
  _getHarmonicAmplitudes(frequencyData, fundamentalHz) {
    const amplitudes = [];
    const maxBin = frequencyData.length;

    for (let h = 1; h <= NUM_HARMONICS_FOR_SLOPE; h++) {
      const harmonicHz = fundamentalHz * h;
      if (harmonicHz > MAX_HARMONIC_HZ) break;

      const centerBin = Math.round(harmonicHz / this.binResolution);
      if (centerBin >= maxBin) break;

      // Peak-pick within ±2 bins of expected position
      const searchRadius = 2;
      let peakDb = -Infinity;
      const startBin = Math.max(0, centerBin - searchRadius);
      const endBin = Math.min(maxBin - 1, centerBin + searchRadius);

      for (let bin = startBin; bin <= endBin; bin++) {
        if (frequencyData[bin] > peakDb) {
          peakDb = frequencyData[bin];
        }
      }

      amplitudes.push(peakDb);
    }

    return amplitudes;
  }

  /**
   * Calculate spectral slope via linear regression on harmonic amplitudes.
   * Slope is in dB per harmonic number — more negative = steeper rolloff = lighter.
   *
   * @param {number[]} harmonics — dB values [H1, H2, H3, ...]
   * @returns {number} — slope in dB/harmonic
   */
  _calculateSpectralSlope(harmonics) {
    const n = harmonics.length;
    if (n < 2) return 0;

    // Simple linear regression: y = dB, x = harmonic index (1-based)
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

    for (let i = 0; i < n; i++) {
      const x = i + 1; // 1-based harmonic number
      const y = harmonics[i];
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x * x;
    }

    const denominator = n * sumX2 - sumX * sumX;
    if (denominator === 0) return 0;

    return (n * sumXY - sumX * sumY) / denominator;
  }

  /**
   * Combine H1-H2 and spectral slope into a composite lightness score (0-100).
   *
   * Mapping rationale:
   * - H1-H2 range: typically -5 to +15 dB in voice
   *   Heavy/pressed voice: -5 to +2 dB → low lightness
   *   Light/breathy voice: +5 to +15 dB → high lightness
   *
   * - Spectral slope range: typically -2 to -12 dB/harmonic
   *   Flat (heavy): -2 to -4 dB/harmonic → low lightness
   *   Steep (light): -8 to -12 dB/harmonic → high lightness
   *
   * Each metric contributes 50% to the final score.
   *
   * @param {number} h1h2
   * @param {number} spectralSlope
   * @returns {number} — 0 to 100
   */
  _calculateLightness(h1h2, spectralSlope) {
    // Map H1-H2 from [-5, +15] to [0, 100]
    // Clamp to range then normalize
    const h1h2Clamped = Math.max(-5, Math.min(15, h1h2));
    const h1h2Score = ((h1h2Clamped + 5) / 20) * 100;

    // Map spectral slope from [-2, -12] to [0, 100]
    // Note: more negative slope = lighter, so we invert
    const slopeClamped = Math.max(-12, Math.min(-2, spectralSlope));
    const slopeScore = ((-2 - slopeClamped) / 10) * 100;

    // Weighted composite: H1-H2 is 60%, spectral slope is 40%
    // H1-H2 is more directly perceptible for vocal weight
    const composite = h1h2Score * 0.6 + slopeScore * 0.4;

    return Math.max(0, Math.min(100, Math.round(composite * 10) / 10));
  }

  /**
   * Classify lightness score into a qualitative category.
   * @param {number} lightness — 0-100
   * @returns {'heavy' | 'moderate' | 'light' | 'very_light'}
   */
  static classifyWeight(lightness) {
    if (lightness < 30) return 'heavy';
    if (lightness < 50) return 'moderate';
    if (lightness < 70) return 'light';
    return 'very_light';
  }

  /**
   * Get display info for a lightness value.
   * @param {number} lightness
   * @returns {{ label: string, color: string, category: string }}
   */
  static getWeightInfo(lightness) {
    const category = VocalWeightAnalyzer.classifyWeight(lightness);
    switch (category) {
      case 'heavy':
        return { label: 'Heavy', color: '#6366f1', category };
      case 'moderate':
        return { label: 'Moderate', color: '#f59e0b', category };
      case 'light':
        return { label: 'Light', color: '#10b981', category };
      case 'very_light':
        return { label: 'Very Light', color: '#ec4899', category };
      default:
        return { label: '—', color: '#6b7280', category: 'unknown' };
    }
  }
}
