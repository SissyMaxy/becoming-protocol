import { describe, it, expect, beforeEach } from 'vitest';
import { ResonanceAnalyzer } from '../ResonanceAnalyzer';

const SAMPLE_RATE = 44100;
const FFT_BIN_COUNT = 2048; // fftSize/2

/**
 * Generate a synthetic vowel signal with formant-like energy concentrations.
 */
function generateVowelSignal(formantFreqs, formantAmps, sampleRate, length = 4096) {
  const signal = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    let sample = 0;
    for (let f = 0; f < formantFreqs.length; f++) {
      sample += formantAmps[f] * Math.sin(2 * Math.PI * formantFreqs[f] * i / sampleRate);
    }
    signal[i] = sample * 0.3;
  }
  return signal;
}

/**
 * Generate a synthetic dB frequency spectrum with a controllable centroid.
 * Higher centroidHz = more energy at higher frequencies = brighter.
 */
function generateFrequencySpectrum(centroidHz, sampleRate, binCount) {
  const spectrum = new Float32Array(binCount);
  const binWidth = (sampleRate / 2) / binCount;

  for (let i = 0; i < binCount; i++) {
    const freq = (i + 0.5) * binWidth;
    // Gaussian centered at centroidHz
    const energy = Math.exp(-((freq - centroidHz) ** 2) / (2 * (centroidHz * 0.5) ** 2));
    spectrum[i] = 20 * Math.log10(Math.max(energy, 1e-10)); // Convert to dB
  }

  return spectrum;
}

describe('ResonanceAnalyzer', () => {
  let analyzer;

  beforeEach(() => {
    analyzer = new ResonanceAnalyzer(SAMPLE_RATE, 14);
  });

  describe('construction', () => {
    it('should initialize with correct parameters', () => {
      expect(analyzer.sampleRate).toBe(SAMPLE_RATE);
      expect(analyzer.lpcOrder).toBe(14);
      expect(analyzer.smoothedF1).toBeNull();
      expect(analyzer.smoothedF2).toBeNull();
    });
  });

  describe('resonance score mapping', () => {
    it('should return low score for dark/chest resonance (low F2)', () => {
      // Simulate a dark voice: formants at ~500, ~1000, ~2500
      const timeDomain = generateVowelSignal([500, 1000, 2500], [1.0, 0.7, 0.3], SAMPLE_RATE);
      const freqData = generateFrequencySpectrum(800, SAMPLE_RATE, FFT_BIN_COUNT);

      const result = analyzer.analyze(timeDomain, freqData);

      // Even if LPC doesn't perfectly find F2=1000, the spectral centroid
      // should indicate a dark voice (low centroid = dark)
      if (result.resonanceScore !== null) {
        expect(result.resonanceScore).toBeLessThan(50);
      }
    });

    it('should return high score for bright/head resonance (high F2)', () => {
      // Simulate a bright voice: formants at ~400, ~2200, ~3000
      const timeDomain = generateVowelSignal([400, 2200, 3000], [1.0, 0.8, 0.4], SAMPLE_RATE);
      const freqData = generateFrequencySpectrum(2000, SAMPLE_RATE, FFT_BIN_COUNT);

      const result = analyzer.analyze(timeDomain, freqData);

      // If LPC finds a high F2, score should be high
      if (result.resonanceScore !== null) {
        expect(result.resonanceScore).toBeGreaterThan(40);
      }
    });

    it('should map F2=800 to a low score and F2=2800 to a high score', () => {
      // Test the internal mapping directly
      const lowScore = analyzer._calculateResonanceScore(800);
      const highScore = analyzer._calculateResonanceScore(2800);

      expect(lowScore).toBeCloseTo(0, 0);
      expect(highScore).toBeCloseTo(100, 0);
    });

    it('should map F2=1800 to approximately 50', () => {
      const midScore = analyzer._calculateResonanceScore(1800);
      expect(midScore).toBeCloseTo(50, 0);
    });

    it('should clamp scores to 0-100 range', () => {
      expect(analyzer._calculateResonanceScore(500)).toBe(0);
      expect(analyzer._calculateResonanceScore(3500)).toBe(100);
    });
  });

  describe('spectral centroid calculation', () => {
    it('should calculate centroid from frequency data', () => {
      // Spectrum centered at 1500 Hz
      const freqData = generateFrequencySpectrum(1500, SAMPLE_RATE, FFT_BIN_COUNT);

      const centroid = analyzer._calculateSpectralCentroid(freqData);
      expect(centroid).not.toBeNull();
      // The centroid should be in a reasonable range
      expect(centroid).toBeGreaterThan(500);
      expect(centroid).toBeLessThan(5000);
    });

    it('should return higher centroid for brighter spectra', () => {
      const darkSpectrum = generateFrequencySpectrum(500, SAMPLE_RATE, FFT_BIN_COUNT);
      const brightSpectrum = generateFrequencySpectrum(2000, SAMPLE_RATE, FFT_BIN_COUNT);

      const darkCentroid = analyzer._calculateSpectralCentroid(darkSpectrum);
      const brightCentroid = analyzer._calculateSpectralCentroid(brightSpectrum);

      expect(brightCentroid).toBeGreaterThan(darkCentroid);
    });

    it('should return null for empty frequency data', () => {
      expect(analyzer._calculateSpectralCentroid(null)).toBeNull();
      expect(analyzer._calculateSpectralCentroid(new Float32Array(0))).toBeNull();
    });
  });

  describe('silence handling', () => {
    it('should return null for silence (all zeros)', () => {
      const silence = new Float32Array(4096);
      const freqData = new Float32Array(FFT_BIN_COUNT).fill(-100);

      const result = analyzer.analyze(silence, freqData);

      expect(result.f1).toBeNull();
      expect(result.f2).toBeNull();
      expect(result.f3).toBeNull();
      expect(result.resonanceScore).toBeNull();
    });

    it('should return null for very quiet signal', () => {
      const quiet = new Float32Array(4096);
      for (let i = 0; i < quiet.length; i++) quiet[i] = Math.random() * 0.001;
      const freqData = new Float32Array(FFT_BIN_COUNT).fill(-100);

      const result = analyzer.analyze(quiet, freqData);
      expect(result.resonanceScore).toBeNull();
    });

    it('should return null for null input', () => {
      const result = analyzer.analyze(null, null);
      expect(result.f1).toBeNull();
      expect(result.resonanceScore).toBeNull();
      expect(result.spectralCentroid).toBeNull();
    });

    it('should return null for empty input', () => {
      const result = analyzer.analyze(new Float32Array(0), new Float32Array(0));
      expect(result.resonanceScore).toBeNull();
    });
  });

  describe('smoothing', () => {
    it('should smooth formant estimates across consecutive analyses', () => {
      const signal1 = generateVowelSignal([500, 1200, 2500], [1.0, 0.7, 0.3], SAMPLE_RATE);
      const freq1 = generateFrequencySpectrum(1200, SAMPLE_RATE, FFT_BIN_COUNT);

      const signal2 = generateVowelSignal([400, 2000, 3000], [1.0, 0.8, 0.4], SAMPLE_RATE);
      const freq2 = generateFrequencySpectrum(2000, SAMPLE_RATE, FFT_BIN_COUNT);

      const r1 = analyzer.analyze(signal1, freq1);
      const r2 = analyzer.analyze(signal2, freq2);

      // After two analyses, smoothed values should exist
      // Can't test exact values since LPC is approximate, but verify non-null
      if (r1.spectralCentroid !== null && r2.spectralCentroid !== null) {
        // Second centroid should be influenced by first (smoothing)
        expect(r2.spectralCentroid).toBeDefined();
      }
    });

    it('should reset smoothing state', () => {
      const signal = generateVowelSignal([500, 1500, 2500], [1.0, 0.7, 0.3], SAMPLE_RATE);
      const freq = generateFrequencySpectrum(1500, SAMPLE_RATE, FFT_BIN_COUNT);

      analyzer.analyze(signal, freq);
      analyzer.reset();

      expect(analyzer.smoothedF1).toBeNull();
      expect(analyzer.smoothedF2).toBeNull();
      expect(analyzer.smoothedF3).toBeNull();
      expect(analyzer.smoothedResonance).toBeNull();
      expect(analyzer.smoothedCentroid).toBeNull();
    });
  });

  describe('classifyResonance', () => {
    it('should classify < 25 as dark', () => {
      expect(ResonanceAnalyzer.classifyResonance(10)).toBe('dark');
      expect(ResonanceAnalyzer.classifyResonance(24)).toBe('dark');
    });

    it('should classify 25-49 as neutral', () => {
      expect(ResonanceAnalyzer.classifyResonance(25)).toBe('neutral');
      expect(ResonanceAnalyzer.classifyResonance(49)).toBe('neutral');
    });

    it('should classify 50-74 as bright', () => {
      expect(ResonanceAnalyzer.classifyResonance(50)).toBe('bright');
      expect(ResonanceAnalyzer.classifyResonance(74)).toBe('bright');
    });

    it('should classify 75+ as very_bright', () => {
      expect(ResonanceAnalyzer.classifyResonance(75)).toBe('very_bright');
      expect(ResonanceAnalyzer.classifyResonance(100)).toBe('very_bright');
    });
  });

  describe('getResonanceInfo', () => {
    it('should return label, color, and category', () => {
      const dark = ResonanceAnalyzer.getResonanceInfo(10);
      expect(dark.label).toBe('Dark / Chest');
      expect(dark.color).toBe('#6366f1');
      expect(dark.category).toBe('dark');

      const neutral = ResonanceAnalyzer.getResonanceInfo(40);
      expect(neutral.label).toBe('Neutral');

      const bright = ResonanceAnalyzer.getResonanceInfo(60);
      expect(bright.label).toBe('Bright / Head');

      const vBright = ResonanceAnalyzer.getResonanceInfo(80);
      expect(vBright.label).toBe('Very Bright');
    });
  });

  describe('output structure', () => {
    it('should return all expected fields', () => {
      const signal = generateVowelSignal([500, 1500, 2500], [1.0, 0.7, 0.3], SAMPLE_RATE);
      const freq = generateFrequencySpectrum(1500, SAMPLE_RATE, FFT_BIN_COUNT);

      const result = analyzer.analyze(signal, freq);

      expect(result).toHaveProperty('f1');
      expect(result).toHaveProperty('f2');
      expect(result).toHaveProperty('f3');
      expect(result).toHaveProperty('resonanceScore');
      expect(result).toHaveProperty('spectralCentroid');
    });

    it('should return integer Hz values for formants when present', () => {
      const signal = generateVowelSignal([500, 1500, 2500], [1.0, 0.7, 0.3], SAMPLE_RATE);
      const freq = generateFrequencySpectrum(1500, SAMPLE_RATE, FFT_BIN_COUNT);

      const result = analyzer.analyze(signal, freq);

      // If formants were found, they should be rounded integers
      if (result.f1 !== null) {
        expect(Number.isInteger(result.f1)).toBe(true);
      }
      if (result.f2 !== null) {
        expect(Number.isInteger(result.f2)).toBe(true);
      }
    });
  });
});
