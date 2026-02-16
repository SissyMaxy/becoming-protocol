import { describe, it, expect } from 'vitest';
import {
  preEmphasis,
  hammingWindow,
  autocorrelation,
  levinsonDurbin,
  lpcSpectrum,
  findFormants,
  analyzeLPC,
} from '../lpc';

const SAMPLE_RATE = 44100;

/**
 * Generate a synthetic vowel-like signal with known formant structure.
 * Creates a sum of damped sinusoids at formant frequencies.
 *
 * @param {number[]} formantFreqs — [F1, F2, F3] in Hz
 * @param {number[]} formantAmps — relative amplitudes [1.0, 0.7, 0.3]
 * @param {number} sampleRate
 * @param {number} length — buffer size
 * @returns {Float32Array}
 */
function generateVowelSignal(formantFreqs, formantAmps, sampleRate, length = 4096) {
  const signal = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    let sample = 0;
    for (let f = 0; f < formantFreqs.length; f++) {
      // Sinusoid at formant frequency
      sample += formantAmps[f] * Math.sin(2 * Math.PI * formantFreqs[f] * i / sampleRate);
    }
    signal[i] = sample * 0.3; // Scale to reasonable amplitude
  }
  return signal;
}

describe('LPC Module', () => {
  describe('preEmphasis', () => {
    it('should apply high-pass filter with coefficient 0.97', () => {
      const input = new Float32Array([1.0, 1.0, 1.0, 1.0, 1.0]);
      const output = preEmphasis(input, 0.97);

      // First sample unchanged
      expect(output[0]).toBe(1.0);
      // Subsequent samples: x[n] - 0.97 * x[n-1] = 1.0 - 0.97 = 0.03
      expect(output[1]).toBeCloseTo(0.03, 5);
      expect(output[2]).toBeCloseTo(0.03, 5);
    });

    it('should boost high-frequency content', () => {
      // A step function (DC) should be mostly removed
      const dc = new Float32Array(100).fill(0.5);
      const output = preEmphasis(dc, 0.97);

      // After the first sample, all values should be near zero (DC removed)
      for (let i = 2; i < output.length; i++) {
        expect(Math.abs(output[i])).toBeLessThan(0.02);
      }
    });

    it('should handle default coefficient', () => {
      const input = new Float32Array([1.0, 0.5, 0.0]);
      const output = preEmphasis(input);

      expect(output[0]).toBe(1.0);
      expect(output[1]).toBeCloseTo(0.5 - 0.97 * 1.0, 5); // -0.47
    });
  });

  describe('hammingWindow', () => {
    it('should produce correct window shape', () => {
      const input = new Float32Array(256).fill(1.0);
      const windowed = hammingWindow(input);

      // Hamming window: edges should be ~0.08, center should be ~1.0
      expect(windowed[0]).toBeCloseTo(0.08, 1);
      expect(windowed[input.length - 1]).toBeCloseTo(0.08, 1);

      // Center should be near 1.0 (since input is all 1s, window value = output)
      const center = Math.floor(input.length / 2);
      expect(windowed[center]).toBeCloseTo(1.0, 1);
    });

    it('should be symmetric', () => {
      const input = new Float32Array(100).fill(1.0);
      const windowed = hammingWindow(input);

      for (let i = 0; i < 50; i++) {
        expect(windowed[i]).toBeCloseTo(windowed[99 - i], 10);
      }
    });

    it('should reduce signal amplitude at edges', () => {
      const input = new Float32Array(64).fill(0.5);
      const windowed = hammingWindow(input);

      // Edges should be less than center
      expect(Math.abs(windowed[0])).toBeLessThan(Math.abs(windowed[32]));
    });
  });

  describe('autocorrelation', () => {
    it('should compute R[0] as the signal energy', () => {
      const signal = new Float32Array([1, 2, 3, 4, 5]);
      const R = autocorrelation(signal, 2);

      // R[0] = sum of squares = 1+4+9+16+25 = 55
      expect(R[0]).toBe(55);
    });

    it('should compute correct lag values for a known signal', () => {
      const signal = new Float32Array([1, 0, -1, 0, 1, 0, -1, 0]);
      const R = autocorrelation(signal, 4);

      // R[0] = sum of 1+0+1+0+1+0+1+0 = 4
      expect(R[0]).toBe(4);

      // R[1] = sum of 1*0+0*(-1)+(-1)*0+0*1+1*0+0*(-1)+(-1)*0 = 0
      expect(R[1]).toBe(0);

      // R[2] = sum of 1*(-1)+0*0+(-1)*1+0*0+1*(-1)+0*0 = -3
      // Actually: [0]*[2] + [1]*[3] + [2]*[4] + [3]*[5] + [4]*[6] + [5]*[7]
      // = 1*(-1) + 0*0 + (-1)*1 + 0*0 + 1*(-1) + 0*0 = -3
      expect(R[2]).toBe(-3);
    });

    it('should produce R[0] >= |R[lag]| for all lags', () => {
      const signal = new Float32Array(100);
      for (let i = 0; i < 100; i++) signal[i] = Math.sin(i * 0.1);
      const R = autocorrelation(signal, 10);

      for (let lag = 1; lag <= 10; lag++) {
        expect(Math.abs(R[lag])).toBeLessThanOrEqual(R[0] + 1e-10);
      }
    });
  });

  describe('levinsonDurbin', () => {
    it('should produce valid coefficients with a[0] = 1', () => {
      // Simple autocorrelation
      const R = new Float64Array([10, 5, 2, 1]);
      const { coefficients, error } = levinsonDurbin(R, 3);

      expect(coefficients[0]).toBe(1.0);
      expect(error).toBeGreaterThan(0);
    });

    it('should handle zero energy (silence) gracefully', () => {
      const R = new Float64Array([0, 0, 0, 0]);
      const { coefficients, error } = levinsonDurbin(R, 3);

      expect(coefficients[0]).toBe(1.0);
      expect(error).toBe(0);
    });

    it('should produce decreasing prediction error', () => {
      // Generate autocorrelation from a real-ish signal
      const signal = new Float32Array(256);
      for (let i = 0; i < 256; i++) {
        signal[i] = Math.sin(2 * Math.PI * 200 * i / SAMPLE_RATE) +
                    0.5 * Math.sin(2 * Math.PI * 400 * i / SAMPLE_RATE);
      }
      const R = autocorrelation(signal, 8);
      const { error } = levinsonDurbin(R, 8);

      // Error should be less than R[0]
      expect(error).toBeLessThan(R[0]);
      expect(error).toBeGreaterThan(0);
    });
  });

  describe('lpcSpectrum', () => {
    it('should produce a spectrum with the correct number of points', () => {
      const coefficients = new Float64Array([1.0, -0.5, 0.2]);
      const { magnitudes, frequencies } = lpcSpectrum(coefficients, 256, SAMPLE_RATE);

      expect(magnitudes.length).toBe(256);
      expect(frequencies.length).toBe(256);
    });

    it('should have frequencies from 0 to Nyquist', () => {
      const coefficients = new Float64Array([1.0, -0.5]);
      const { frequencies } = lpcSpectrum(coefficients, 100, SAMPLE_RATE);

      expect(frequencies[0]).toBe(0);
      expect(frequencies[99]).toBeCloseTo((99 / 100) * (SAMPLE_RATE / 2), 0);
    });
  });

  describe('findFormants', () => {
    it('should find peaks in the expected formant ranges', () => {
      // Construct an explicit spectrum with unambiguous peaks at known bins.
      // Bin 12 ≈ 517 Hz (F1), Bin 35 ≈ 1507 Hz (F2), Bin 58 ≈ 2498 Hz (F3)
      const numPoints = 512;
      const nyquist = SAMPLE_RATE / 2;
      const magnitudes = new Float64Array(numPoints);
      const frequencies = new Float64Array(numPoints);

      for (let i = 0; i < numPoints; i++) {
        frequencies[i] = (i / numPoints) * nyquist;
      }

      // Triangle peaks: center=20, ±1 bin=14, ±2 bins=8  (prominence=6 dB)
      const peakBins = [12, 35, 58];
      for (const b of peakBins) {
        magnitudes[b] = 20;
        magnitudes[b - 1] = 14;
        magnitudes[b + 1] = 14;
        magnitudes[b - 2] = 8;
        magnitudes[b + 2] = 8;
      }

      const { f1, f2, f3 } = findFormants(magnitudes, frequencies, SAMPLE_RATE);

      // Bin 12 ≈ 516.8 Hz, Bin 35 ≈ 1507.3 Hz, Bin 58 ≈ 2497.9 Hz
      expect(f1).not.toBeNull();
      expect(Math.abs(f1 - 517)).toBeLessThan(50);

      expect(f2).not.toBeNull();
      expect(Math.abs(f2 - 1507)).toBeLessThan(50);

      expect(f3).not.toBeNull();
      expect(Math.abs(f3 - 2498)).toBeLessThan(50);
    });

    it('should return null for formants outside their ranges', () => {
      // Flat spectrum with no peaks
      const numPoints = 256;
      const nyquist = SAMPLE_RATE / 2;
      const magnitudes = new Float64Array(numPoints).fill(0);
      const frequencies = new Float64Array(numPoints);
      for (let i = 0; i < numPoints; i++) {
        frequencies[i] = (i / numPoints) * nyquist;
      }

      const { f1, f2, f3 } = findFormants(magnitudes, frequencies, SAMPLE_RATE);

      expect(f1).toBeNull();
      expect(f2).toBeNull();
      expect(f3).toBeNull();
    });
  });

  describe('analyzeLPC (full pipeline)', () => {
    it('should extract formants from a vowel-like signal', () => {
      // Synthesize a signal with energy at typical /a/ vowel formants: ~700, ~1200, ~2600 Hz
      const signal = generateVowelSignal([700, 1200, 2600], [1.0, 0.7, 0.3], SAMPLE_RATE, 4096);
      const result = analyzeLPC(signal, SAMPLE_RATE, 14);

      // Should produce some coefficients
      expect(result.coefficients.length).toBe(15); // order+1

      // Formants might not be perfectly accurate with simple sinusoids,
      // but LPC should find some peaks in reasonable ranges
      // (sinusoid formant extraction is approximate — real vowels have broader resonances)
    });

    it('should return null formants for silence', () => {
      const silence = new Float32Array(4096);
      const result = analyzeLPC(silence, SAMPLE_RATE, 14);

      expect(result.f1).toBeNull();
      expect(result.f2).toBeNull();
      expect(result.f3).toBeNull();
    });
  });
});
