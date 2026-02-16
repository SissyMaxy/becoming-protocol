import { describe, it, expect } from 'vitest';
import { PitchDetector } from '../PitchDetector';

const SAMPLE_RATE = 44100;

/**
 * Generate a synthetic sine wave buffer at a given frequency.
 * @param {number} hz - frequency in Hz
 * @param {number} sampleRate - audio sample rate
 * @param {number} length - buffer length in samples
 * @param {number} amplitude - signal amplitude (0-1)
 * @returns {Float32Array}
 */
function generateSineWave(hz, sampleRate, length = 2048, amplitude = 0.5) {
  const buffer = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    buffer[i] = amplitude * Math.sin(2 * Math.PI * hz * i / sampleRate);
  }
  return buffer;
}

describe('PitchDetector', () => {
  describe('construction', () => {
    it('should create with default clarity threshold', () => {
      const detector = new PitchDetector(SAMPLE_RATE);
      expect(detector.sampleRate).toBe(SAMPLE_RATE);
      expect(detector.clarityThreshold).toBe(0.7);
    });

    it('should accept custom clarity threshold', () => {
      const detector = new PitchDetector(SAMPLE_RATE, 0.5);
      expect(detector.clarityThreshold).toBe(0.5);
    });
  });

  describe('detect — synthetic tone accuracy (TC-2.1)', () => {
    const detector = new PitchDetector(SAMPLE_RATE);

    it('should detect 200 Hz tone within ±5 Hz', () => {
      const buffer = generateSineWave(200, SAMPLE_RATE, 4096);
      const result = detector.detect(buffer);
      expect(result.pitch).not.toBeNull();
      expect(result.pitch).toBeGreaterThanOrEqual(195);
      expect(result.pitch).toBeLessThanOrEqual(205);
      expect(result.clarity).toBeGreaterThan(0.5);
    });

    it('should detect 150 Hz tone within ±5 Hz', () => {
      const buffer = generateSineWave(150, SAMPLE_RATE, 4096);
      const result = detector.detect(buffer);
      expect(result.pitch).not.toBeNull();
      expect(result.pitch).toBeGreaterThanOrEqual(145);
      expect(result.pitch).toBeLessThanOrEqual(155);
    });

    it('should detect 250 Hz tone within ±5 Hz', () => {
      const buffer = generateSineWave(250, SAMPLE_RATE, 4096);
      const result = detector.detect(buffer);
      expect(result.pitch).not.toBeNull();
      expect(result.pitch).toBeGreaterThanOrEqual(245);
      expect(result.pitch).toBeLessThanOrEqual(255);
    });

    it('should detect 100 Hz tone within ±5 Hz', () => {
      const buffer = generateSineWave(100, SAMPLE_RATE, 4096);
      const result = detector.detect(buffer);
      expect(result.pitch).not.toBeNull();
      expect(result.pitch).toBeGreaterThanOrEqual(95);
      expect(result.pitch).toBeLessThanOrEqual(105);
    });

    it('should detect 300 Hz tone within ±5 Hz', () => {
      const buffer = generateSineWave(300, SAMPLE_RATE, 4096);
      const result = detector.detect(buffer);
      expect(result.pitch).not.toBeNull();
      expect(result.pitch).toBeGreaterThanOrEqual(295);
      expect(result.pitch).toBeLessThanOrEqual(305);
    });
  });

  describe('detect — silence handling (TC-2.2)', () => {
    const detector = new PitchDetector(SAMPLE_RATE);

    it('should return null pitch for silence (all zeros)', () => {
      const buffer = new Float32Array(2048);
      const result = detector.detect(buffer);
      expect(result.pitch).toBeNull();
      expect(result.clarity).toBe(0);
    });

    it('should return null pitch for very quiet signal', () => {
      const buffer = generateSineWave(200, SAMPLE_RATE, 2048, 0.005);
      const result = detector.detect(buffer);
      expect(result.pitch).toBeNull();
    });

    it('should return null pitch for empty buffer', () => {
      const result = detector.detect(new Float32Array(0));
      expect(result.pitch).toBeNull();
      expect(result.clarity).toBe(0);
    });

    it('should return null pitch for null/undefined buffer', () => {
      const result = detector.detect(null);
      expect(result.pitch).toBeNull();
      expect(result.clarity).toBe(0);
    });
  });

  describe('classifyRange (TC-2.3)', () => {
    it('should classify frequencies below 150 Hz as masculine', () => {
      expect(PitchDetector.classifyRange(80)).toBe('masculine');
      expect(PitchDetector.classifyRange(120)).toBe('masculine');
      expect(PitchDetector.classifyRange(149)).toBe('masculine');
    });

    it('should classify 150-179 Hz as androgynous', () => {
      expect(PitchDetector.classifyRange(150)).toBe('androgynous');
      expect(PitchDetector.classifyRange(165)).toBe('androgynous');
      expect(PitchDetector.classifyRange(179)).toBe('androgynous');
    });

    it('should classify 180-249 Hz as feminine', () => {
      expect(PitchDetector.classifyRange(180)).toBe('feminine');
      expect(PitchDetector.classifyRange(210)).toBe('feminine');
      expect(PitchDetector.classifyRange(249)).toBe('feminine');
    });

    it('should classify 250+ Hz as high_feminine', () => {
      expect(PitchDetector.classifyRange(250)).toBe('high_feminine');
      expect(PitchDetector.classifyRange(300)).toBe('high_feminine');
      expect(PitchDetector.classifyRange(400)).toBe('high_feminine');
    });
  });

  describe('getRangeInfo', () => {
    it('should return label, color, and range for each classification', () => {
      const masculine = PitchDetector.getRangeInfo(100);
      expect(masculine.label).toBe('Masculine');
      expect(masculine.color).toBe('#6366f1');
      expect(masculine.range).toBe('masculine');

      const androgynous = PitchDetector.getRangeInfo(165);
      expect(androgynous.label).toBe('Androgynous');
      expect(androgynous.color).toBe('#f59e0b');

      const feminine = PitchDetector.getRangeInfo(200);
      expect(feminine.label).toBe('Feminine');
      expect(feminine.color).toBe('#10b981');

      const highFem = PitchDetector.getRangeInfo(280);
      expect(highFem.label).toBe('High Feminine');
      expect(highFem.color).toBe('#ec4899');
    });
  });
});
