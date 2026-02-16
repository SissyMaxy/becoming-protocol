/**
 * ResonanceAnalyzer — Formant-based vocal resonance analysis
 *
 * Uses LPC (Linear Predictive Coding) to estimate formant frequencies
 * F1, F2, F3 from raw audio samples. Derives a composite resonance
 * score (0-100) primarily based on F2 position:
 *   - Lower F2 (~800-1200 Hz) = darker, chest-dominant = masculine
 *   - Higher F2 (~1800-2800 Hz) = brighter, head-dominant = feminine
 *
 * Also calculates spectral centroid as a supplementary brightness metric.
 *
 * LPC analysis is computationally heavier than pitch/lightness, so it
 * should be throttled to 5-10 Hz (not every frame).
 */

import { analyzeLPC } from './lpc.js';

const SMOOTHING_ALPHA = 0.2;
const SILENCE_RMS_THRESHOLD = 0.01;

// F2 mapping for resonance score
const F2_MIN = 800;   // Darkest expected F2
const F2_MAX = 2800;  // Brightest expected F2

// Feminine target F2 range
const F2_TARGET_MIN = 1800;
const F2_TARGET_MAX = 2500;

export class ResonanceAnalyzer {
  /**
   * @param {number} sampleRate — audio sample rate (e.g. 44100)
   * @param {number} [lpcOrder=14] — LPC model order
   */
  constructor(sampleRate, lpcOrder = 14) {
    this.sampleRate = sampleRate;
    this.lpcOrder = lpcOrder;

    // Smoothed formant estimates
    this.smoothedF1 = null;
    this.smoothedF2 = null;
    this.smoothedF3 = null;
    this.smoothedResonance = null;
    this.smoothedCentroid = null;
  }

  /**
   * Analyze resonance from raw time-domain audio samples.
   *
   * @param {Float32Array} timeDomainData — raw audio samples from AudioEngine
   * @param {Float32Array} frequencyData — dB magnitude spectrum for spectral centroid
   * @returns {{ f1: number|null, f2: number|null, f3: number|null,
   *             resonanceScore: number|null, spectralCentroid: number|null }}
   */
  analyze(timeDomainData, frequencyData) {
    if (!timeDomainData || timeDomainData.length === 0) {
      return this._nullResult();
    }

    // Silence detection
    const rms = this._calculateRMS(timeDomainData);
    if (rms < SILENCE_RMS_THRESHOLD) {
      return this._nullResult();
    }

    // Run LPC formant analysis
    const lpcResult = analyzeLPC(timeDomainData, this.sampleRate, this.lpcOrder);

    // Calculate spectral centroid from frequency data
    const rawCentroid = this._calculateSpectralCentroid(frequencyData);

    // If LPC failed to find formants, return centroid only
    if (lpcResult.f2 === null) {
      const centroid = this._smooth('smoothedCentroid', rawCentroid);
      return {
        f1: null,
        f2: null,
        f3: null,
        resonanceScore: null,
        spectralCentroid: centroid !== null ? Math.round(centroid) : null,
      };
    }

    // Smooth formant estimates
    const f1 = this._smooth('smoothedF1', lpcResult.f1);
    const f2 = this._smooth('smoothedF2', lpcResult.f2);
    const f3 = lpcResult.f3 !== null ? this._smooth('smoothedF3', lpcResult.f3) : this.smoothedF3;
    const centroid = this._smooth('smoothedCentroid', rawCentroid);

    // Calculate resonance score from F2
    const rawResonance = this._calculateResonanceScore(f2);
    const resonanceScore = this._smooth('smoothedResonance', rawResonance);

    return {
      f1: f1 !== null ? Math.round(f1) : null,
      f2: f2 !== null ? Math.round(f2) : null,
      f3: f3 !== null ? Math.round(f3) : null,
      resonanceScore: resonanceScore !== null ? Math.round(resonanceScore * 10) / 10 : null,
      spectralCentroid: centroid !== null ? Math.round(centroid) : null,
    };
  }

  /**
   * Reset smoothing state.
   */
  reset() {
    this.smoothedF1 = null;
    this.smoothedF2 = null;
    this.smoothedF3 = null;
    this.smoothedResonance = null;
    this.smoothedCentroid = null;
  }

  /**
   * Calculate resonance score (0-100) from F2 frequency.
   * Higher F2 = brighter = more feminine = higher score.
   *
   * @param {number} f2 — second formant frequency in Hz
   * @returns {number} — 0 to 100
   */
  _calculateResonanceScore(f2) {
    if (f2 === null) return 0;
    const clamped = Math.max(F2_MIN, Math.min(F2_MAX, f2));
    return ((clamped - F2_MIN) / (F2_MAX - F2_MIN)) * 100;
  }

  /**
   * Calculate spectral centroid (center of mass of the spectrum).
   * Uses dB magnitudes converted back to linear for weighting.
   *
   * @param {Float32Array} frequencyData — dB magnitudes
   * @returns {number|null} — spectral centroid in Hz
   */
  _calculateSpectralCentroid(frequencyData) {
    if (!frequencyData || frequencyData.length === 0) return null;

    const binCount = frequencyData.length;
    const binWidth = (this.sampleRate / 2) / binCount;

    let weightedSum = 0;
    let totalWeight = 0;

    for (let i = 0; i < binCount; i++) {
      // Convert dB to linear magnitude (only use positive magnitudes)
      const linearMag = Math.pow(10, frequencyData[i] / 20);
      const freq = (i + 0.5) * binWidth;

      weightedSum += freq * linearMag;
      totalWeight += linearMag;
    }

    if (totalWeight === 0) return null;
    return weightedSum / totalWeight;
  }

  /**
   * Apply EMA smoothing to a value.
   * @param {string} field — name of the smoothed field on this instance
   * @param {number|null} rawValue
   * @returns {number|null}
   */
  _smooth(field, rawValue) {
    if (rawValue === null) return this[field];
    if (this[field] === null) {
      this[field] = rawValue;
    } else {
      this[field] = SMOOTHING_ALPHA * rawValue + (1 - SMOOTHING_ALPHA) * this[field];
    }
    return this[field];
  }

  _calculateRMS(buffer) {
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) {
      sum += buffer[i] * buffer[i];
    }
    return Math.sqrt(sum / buffer.length);
  }

  _nullResult() {
    return {
      f1: null,
      f2: null,
      f3: null,
      resonanceScore: null,
      spectralCentroid: null,
    };
  }

  /**
   * Classify resonance score into a qualitative category.
   * @param {number} score — 0-100
   * @returns {'dark' | 'neutral' | 'bright' | 'very_bright'}
   */
  static classifyResonance(score) {
    if (score < 25) return 'dark';
    if (score < 50) return 'neutral';
    if (score < 75) return 'bright';
    return 'very_bright';
  }

  /**
   * Get display info for a resonance score.
   * @param {number} score
   * @returns {{ label: string, color: string, category: string }}
   */
  static getResonanceInfo(score) {
    const category = ResonanceAnalyzer.classifyResonance(score);
    switch (category) {
      case 'dark':
        return { label: 'Dark / Chest', color: '#6366f1', category };
      case 'neutral':
        return { label: 'Neutral', color: '#f59e0b', category };
      case 'bright':
        return { label: 'Bright / Head', color: '#10b981', category };
      case 'very_bright':
        return { label: 'Very Bright', color: '#ec4899', category };
      default:
        return { label: '—', color: '#6b7280', category: 'unknown' };
    }
  }
}
