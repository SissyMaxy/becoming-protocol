/**
 * PitchDetector — YIN-based fundamental frequency detection
 * Accepts time-domain data, returns pitch (Hz) and clarity
 */

const DEFAULT_CLARITY_THRESHOLD = 0.7;

export class PitchDetector {
  /**
   * @param {number} sampleRate — audio sample rate (e.g. 44100)
   * @param {number} [clarityThreshold] — minimum confidence for a valid pitch (0-1)
   */
  constructor(sampleRate, clarityThreshold = DEFAULT_CLARITY_THRESHOLD) {
    this.sampleRate = sampleRate;
    this.clarityThreshold = clarityThreshold;
  }

  /**
   * Detect pitch from time-domain audio buffer.
   * @param {Float32Array} buffer — time-domain samples
   * @returns {{ pitch: number | null, clarity: number }}
   */
  detect(buffer) {
    if (!buffer || buffer.length === 0) {
      return { pitch: null, clarity: 0 };
    }

    // Check if signal is too quiet (silence detection)
    const rms = this._calculateRMS(buffer);
    if (rms < 0.01) {
      return { pitch: null, clarity: 0 };
    }

    // YIN algorithm
    const halfLen = Math.floor(buffer.length / 2);
    const yinBuffer = new Float32Array(halfLen);

    // Step 1: Difference function
    for (let tau = 0; tau < halfLen; tau++) {
      let sum = 0;
      for (let i = 0; i < halfLen; i++) {
        const delta = buffer[i] - buffer[i + tau];
        sum += delta * delta;
      }
      yinBuffer[tau] = sum;
    }

    // Step 2: Cumulative mean normalized difference function
    yinBuffer[0] = 1;
    let runningSum = 0;
    for (let tau = 1; tau < halfLen; tau++) {
      runningSum += yinBuffer[tau];
      yinBuffer[tau] *= tau / runningSum;
    }

    // Step 3: Absolute threshold — find first dip below threshold
    let tau = 2;
    const minPeriod = Math.floor(this.sampleRate / 500); // Max 500 Hz
    const maxPeriod = Math.floor(this.sampleRate / 50);  // Min 50 Hz

    // Start from minPeriod to avoid detecting very high (unlikely) frequencies
    tau = Math.max(tau, minPeriod);

    let bestTau = -1;
    let bestValue = Infinity;

    for (; tau < Math.min(halfLen, maxPeriod); tau++) {
      if (yinBuffer[tau] < bestValue) {
        bestValue = yinBuffer[tau];
        bestTau = tau;
      }
      // If we find a value below the threshold, accept it
      if (yinBuffer[tau] < (1 - this.clarityThreshold)) {
        // Check if we're at a local minimum
        while (tau + 1 < halfLen && yinBuffer[tau + 1] < yinBuffer[tau]) {
          tau++;
        }
        bestTau = tau;
        bestValue = yinBuffer[tau];
        break;
      }
    }

    if (bestTau === -1 || bestValue > (1 - this.clarityThreshold * 0.5)) {
      return { pitch: null, clarity: 0 };
    }

    // Step 4: Parabolic interpolation for sub-sample accuracy
    const refinedTau = this._parabolicInterpolation(yinBuffer, bestTau);

    const pitch = this.sampleRate / refinedTau;
    const clarity = 1 - bestValue;

    // Sanity check: voice range is roughly 50-500 Hz
    if (pitch < 50 || pitch > 500) {
      return { pitch: null, clarity: 0 };
    }

    return { pitch: Math.round(pitch * 10) / 10, clarity };
  }

  /**
   * Classify a pitch value into a vocal range.
   * @param {number} hz — pitch in Hz
   * @returns {'masculine' | 'androgynous' | 'feminine' | 'high_feminine'}
   */
  static classifyRange(hz) {
    if (hz < 150) return 'masculine';
    if (hz < 180) return 'androgynous';
    if (hz < 250) return 'feminine';
    return 'high_feminine';
  }

  /**
   * Get range label and color for a pitch value.
   * @param {number} hz
   * @returns {{ label: string, color: string, range: string }}
   */
  static getRangeInfo(hz) {
    const range = PitchDetector.classifyRange(hz);
    switch (range) {
      case 'masculine':
        return { label: 'Masculine', color: '#6366f1', range };
      case 'androgynous':
        return { label: 'Androgynous', color: '#f59e0b', range };
      case 'feminine':
        return { label: 'Feminine', color: '#10b981', range };
      case 'high_feminine':
        return { label: 'High Feminine', color: '#ec4899', range };
      default:
        return { label: '—', color: '#6b7280', range: 'unknown' };
    }
  }

  // ============================================
  // Private helpers
  // ============================================

  _calculateRMS(buffer) {
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) {
      sum += buffer[i] * buffer[i];
    }
    return Math.sqrt(sum / buffer.length);
  }

  _parabolicInterpolation(yinBuffer, tau) {
    if (tau <= 0 || tau >= yinBuffer.length - 1) return tau;

    const s0 = yinBuffer[tau - 1];
    const s1 = yinBuffer[tau];
    const s2 = yinBuffer[tau + 1];

    const adjustment = (s2 - s0) / (2 * (2 * s1 - s2 - s0));

    if (Math.abs(adjustment) > 1) return tau;

    return tau + adjustment;
  }
}
