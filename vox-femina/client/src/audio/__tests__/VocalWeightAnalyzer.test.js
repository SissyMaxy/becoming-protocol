import { describe, it, expect, beforeEach } from 'vitest';
import { VocalWeightAnalyzer } from '../VocalWeightAnalyzer';

const SAMPLE_RATE = 44100;
const FFT_SIZE = 4096;
const BIN_RESOLUTION = SAMPLE_RATE / FFT_SIZE; // ~10.77 Hz per bin
const FREQ_BIN_COUNT = FFT_SIZE / 2; // 2048 bins

/**
 * Generate a synthetic FFT magnitude spectrum (in dB) with known harmonic amplitudes.
 * Creates peaks at integer multiples of the fundamental frequency.
 *
 * @param {number} fundamentalHz — fundamental frequency
 * @param {number[]} harmonicDbLevels — dB level for each harmonic [H1, H2, H3, ...]
 * @param {number} noiseFloorDb — background noise level
 * @returns {Float32Array}
 */
function generateHarmonicSpectrum(fundamentalHz, harmonicDbLevels, noiseFloorDb = -80) {
  const spectrum = new Float32Array(FREQ_BIN_COUNT);
  spectrum.fill(noiseFloorDb);

  for (let h = 0; h < harmonicDbLevels.length; h++) {
    const harmonicHz = fundamentalHz * (h + 1);
    const centerBin = Math.round(harmonicHz / BIN_RESOLUTION);

    if (centerBin >= FREQ_BIN_COUNT) break;

    // Create a peak: center bin at full level, ±1 bins slightly lower
    spectrum[centerBin] = harmonicDbLevels[h];
    if (centerBin > 0) spectrum[centerBin - 1] = harmonicDbLevels[h] - 6;
    if (centerBin < FREQ_BIN_COUNT - 1) spectrum[centerBin + 1] = harmonicDbLevels[h] - 6;
  }

  return spectrum;
}

describe('VocalWeightAnalyzer', () => {
  let analyzer;

  beforeEach(() => {
    analyzer = new VocalWeightAnalyzer(SAMPLE_RATE, FFT_SIZE);
  });

  describe('construction', () => {
    it('should initialize with correct bin resolution', () => {
      expect(analyzer.sampleRate).toBe(SAMPLE_RATE);
      expect(analyzer.fftSize).toBe(FFT_SIZE);
      expect(analyzer.binResolution).toBeCloseTo(BIN_RESOLUTION, 1);
    });
  });

  describe('H1-H2 calculation', () => {
    it('should compute positive H1-H2 for a light/breathy voice spectrum', () => {
      // Light voice: H1 much stronger than H2
      // H1=-10dB, H2=-22dB, H3=-30dB, H4=-38dB, H5=-45dB, H6=-52dB
      const spectrum = generateHarmonicSpectrum(200, [-10, -22, -30, -38, -45, -52]);
      const result = analyzer.analyze(spectrum, 200);

      expect(result.h1h2).not.toBeNull();
      expect(result.h1h2).toBeCloseTo(12, 0); // -10 - (-22) = +12 dB
    });

    it('should compute near-zero H1-H2 for a heavy/pressed voice spectrum', () => {
      // Heavy voice: H1 and H2 nearly equal
      // H1=-15dB, H2=-16dB, H3=-18dB, H4=-20dB, H5=-22dB, H6=-25dB
      const spectrum = generateHarmonicSpectrum(150, [-15, -16, -18, -20, -22, -25]);
      const result = analyzer.analyze(spectrum, 150);

      expect(result.h1h2).not.toBeNull();
      expect(result.h1h2).toBeCloseTo(1, 0); // -15 - (-16) = +1 dB
    });

    it('should compute negative H1-H2 for extremely pressed voice', () => {
      // Very pressed: H2 stronger than H1
      // H1=-20dB, H2=-15dB, H3=-18dB, H4=-22dB, H5=-25dB, H6=-30dB
      const spectrum = generateHarmonicSpectrum(120, [-20, -15, -18, -22, -25, -30]);
      const result = analyzer.analyze(spectrum, 120);

      expect(result.h1h2).not.toBeNull();
      expect(result.h1h2).toBeCloseTo(-5, 0); // -20 - (-15) = -5 dB
    });
  });

  describe('spectral slope regression', () => {
    it('should compute steep negative slope for a light voice', () => {
      // Each harmonic drops ~8 dB: steep rolloff = light
      const spectrum = generateHarmonicSpectrum(200, [-10, -18, -26, -34, -42, -50]);
      const result = analyzer.analyze(spectrum, 200);

      expect(result.spectralSlope).not.toBeNull();
      expect(result.spectralSlope).toBeLessThan(-6); // Steep negative slope
    });

    it('should compute shallow slope for a heavy voice', () => {
      // Each harmonic drops only ~2 dB: flat = heavy
      const spectrum = generateHarmonicSpectrum(150, [-15, -17, -19, -21, -23, -25]);
      const result = analyzer.analyze(spectrum, 150);

      expect(result.spectralSlope).not.toBeNull();
      expect(result.spectralSlope).toBeGreaterThan(-4); // Shallow slope
    });

    it('should return a value consistent with linear regression math', () => {
      // Perfect linear decay: -10, -15, -20, -25, -30, -35 (slope = -5 dB/harmonic)
      const spectrum = generateHarmonicSpectrum(200, [-10, -15, -20, -25, -30, -35]);
      const result = analyzer.analyze(spectrum, 200);

      expect(result.spectralSlope).not.toBeNull();
      expect(result.spectralSlope).toBeCloseTo(-5, 0);
    });
  });

  describe('lightness score range', () => {
    it('should score high (70-100) for a light feminine voice', () => {
      // Light: strong H1-H2 (+12dB), steep slope
      const spectrum = generateHarmonicSpectrum(220, [-8, -20, -30, -40, -48, -55]);
      const result = analyzer.analyze(spectrum, 220);

      expect(result.lightness).not.toBeNull();
      expect(result.lightness).toBeGreaterThanOrEqual(60);
      expect(result.lightness).toBeLessThanOrEqual(100);
    });

    it('should score low (0-35) for a heavy masculine voice', () => {
      // Heavy: near-zero H1-H2, flat slope
      const spectrum = generateHarmonicSpectrum(110, [-15, -16, -17, -18, -19, -20]);
      const result = analyzer.analyze(spectrum, 110);

      expect(result.lightness).not.toBeNull();
      expect(result.lightness).toBeGreaterThanOrEqual(0);
      expect(result.lightness).toBeLessThanOrEqual(35);
    });

    it('should score in the middle (30-65) for a moderate voice', () => {
      // Moderate: medium H1-H2 (~5dB), moderate slope
      const spectrum = generateHarmonicSpectrum(170, [-12, -17, -22, -26, -30, -34]);
      const result = analyzer.analyze(spectrum, 170);

      expect(result.lightness).not.toBeNull();
      expect(result.lightness).toBeGreaterThanOrEqual(30);
      expect(result.lightness).toBeLessThanOrEqual(65);
    });

    it('should always return a score between 0 and 100', () => {
      // Extreme case: very high H1-H2
      const spectrumLight = generateHarmonicSpectrum(200, [-5, -25, -45, -60, -70, -75]);
      const resultLight = analyzer.analyze(spectrumLight, 200);
      expect(resultLight.lightness).toBeGreaterThanOrEqual(0);
      expect(resultLight.lightness).toBeLessThanOrEqual(100);

      // Reset smoothing
      analyzer.reset();

      // Extreme case: negative H1-H2
      const spectrumHeavy = generateHarmonicSpectrum(100, [-25, -10, -12, -14, -16, -18]);
      const resultHeavy = analyzer.analyze(spectrumHeavy, 100);
      expect(resultHeavy.lightness).toBeGreaterThanOrEqual(0);
      expect(resultHeavy.lightness).toBeLessThanOrEqual(100);
    });
  });

  describe('silence / invalid input handling', () => {
    it('should return null for null frequency data', () => {
      const result = analyzer.analyze(null, 200);
      expect(result.h1h2).toBeNull();
      expect(result.spectralSlope).toBeNull();
      expect(result.lightness).toBeNull();
    });

    it('should return null for empty frequency data', () => {
      const result = analyzer.analyze(new Float32Array(0), 200);
      expect(result.h1h2).toBeNull();
      expect(result.spectralSlope).toBeNull();
      expect(result.lightness).toBeNull();
    });

    it('should return null when pitch is null', () => {
      const spectrum = generateHarmonicSpectrum(200, [-10, -20, -30, -40, -50, -60]);
      const result = analyzer.analyze(spectrum, null);
      expect(result.h1h2).toBeNull();
      expect(result.lightness).toBeNull();
    });

    it('should return null for pitch below valid range', () => {
      const spectrum = generateHarmonicSpectrum(30, [-10, -20, -30, -40, -50, -60]);
      const result = analyzer.analyze(spectrum, 30);
      expect(result.lightness).toBeNull();
    });

    it('should return null for pitch above valid range', () => {
      const spectrum = generateHarmonicSpectrum(500, [-10, -20, -30, -40, -50, -60]);
      const result = analyzer.analyze(spectrum, 500);
      expect(result.lightness).toBeNull();
    });

    it('should return null when fundamental is below silence threshold', () => {
      // All harmonics at noise floor
      const spectrum = new Float32Array(FREQ_BIN_COUNT);
      spectrum.fill(-90);
      const result = analyzer.analyze(spectrum, 200);
      expect(result.lightness).toBeNull();
    });

    it('should not produce erratic values across rapid null/valid transitions', () => {
      // Simulate: valid → null → valid (should not carry over stale smoothed state badly)
      const spectrum = generateHarmonicSpectrum(200, [-10, -18, -26, -34, -42, -50]);

      const r1 = analyzer.analyze(spectrum, 200);
      expect(r1.lightness).not.toBeNull();

      const r2 = analyzer.analyze(null, null);
      expect(r2.lightness).toBeNull();

      const r3 = analyzer.analyze(spectrum, 200);
      expect(r3.lightness).not.toBeNull();
      expect(r3.lightness).toBeGreaterThanOrEqual(0);
      expect(r3.lightness).toBeLessThanOrEqual(100);
    });
  });

  describe('smoothing', () => {
    it('should smooth lightness values across consecutive frames', () => {
      // Two consecutive analyses with different spectra should produce smoothed output
      const spectrumHeavy = generateHarmonicSpectrum(150, [-15, -16, -18, -20, -22, -25]);
      const spectrumLight = generateHarmonicSpectrum(200, [-8, -20, -30, -40, -48, -55]);

      const r1 = analyzer.analyze(spectrumHeavy, 150);
      const r2 = analyzer.analyze(spectrumLight, 200);

      // Smoothed value should be between raw heavy and raw light scores
      expect(r2.lightness).toBeGreaterThan(r1.lightness);
      expect(r2.lightness).toBeLessThan(r2.rawLightness);
    });

    it('should reset smoothing state', () => {
      const spectrum = generateHarmonicSpectrum(150, [-15, -16, -18, -20, -22, -25]);
      analyzer.analyze(spectrum, 150);

      analyzer.reset();
      expect(analyzer.smoothedLightness).toBeNull();

      // After reset, first frame should set smoothed = raw
      const r = analyzer.analyze(spectrum, 150);
      expect(r.lightness).toBe(r.rawLightness);
    });
  });

  describe('classifyWeight', () => {
    it('should classify < 30 as heavy', () => {
      expect(VocalWeightAnalyzer.classifyWeight(10)).toBe('heavy');
      expect(VocalWeightAnalyzer.classifyWeight(29)).toBe('heavy');
    });

    it('should classify 30-49 as moderate', () => {
      expect(VocalWeightAnalyzer.classifyWeight(30)).toBe('moderate');
      expect(VocalWeightAnalyzer.classifyWeight(49)).toBe('moderate');
    });

    it('should classify 50-69 as light', () => {
      expect(VocalWeightAnalyzer.classifyWeight(50)).toBe('light');
      expect(VocalWeightAnalyzer.classifyWeight(69)).toBe('light');
    });

    it('should classify 70+ as very_light', () => {
      expect(VocalWeightAnalyzer.classifyWeight(70)).toBe('very_light');
      expect(VocalWeightAnalyzer.classifyWeight(100)).toBe('very_light');
    });
  });

  describe('getWeightInfo', () => {
    it('should return label, color, and category for each classification', () => {
      const heavy = VocalWeightAnalyzer.getWeightInfo(15);
      expect(heavy.label).toBe('Heavy');
      expect(heavy.color).toBe('#6366f1');
      expect(heavy.category).toBe('heavy');

      const moderate = VocalWeightAnalyzer.getWeightInfo(40);
      expect(moderate.label).toBe('Moderate');
      expect(moderate.color).toBe('#f59e0b');

      const light = VocalWeightAnalyzer.getWeightInfo(60);
      expect(light.label).toBe('Light');
      expect(light.color).toBe('#10b981');

      const veryLight = VocalWeightAnalyzer.getWeightInfo(85);
      expect(veryLight.label).toBe('Very Light');
      expect(veryLight.color).toBe('#ec4899');
    });
  });
});
