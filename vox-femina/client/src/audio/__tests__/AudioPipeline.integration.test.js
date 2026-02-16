import { describe, it, expect } from 'vitest';
import { PitchDetector } from '../PitchDetector';

/**
 * Integration Test: Audio Pipeline (Section 7.3)
 * Generate synthetic 200 Hz tone through PitchDetector.
 * Verify detected pitch is within ±5 Hz.
 */
describe('Audio Pipeline Integration', () => {
  const SAMPLE_RATE = 44100;

  function generateSineWave(hz, sampleRate, length, amplitude = 0.5) {
    const buffer = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      buffer[i] = amplitude * Math.sin(2 * Math.PI * hz * i / sampleRate);
    }
    return buffer;
  }

  it('should detect a 200 Hz synthetic tone within ±5 Hz accuracy', () => {
    const detector = new PitchDetector(SAMPLE_RATE);

    // Simulate AudioContext + OscillatorNode output (synthetic 200 Hz buffer)
    const buffer = generateSineWave(200, SAMPLE_RATE, 4096, 0.5);
    const result = detector.detect(buffer);

    expect(result.pitch).not.toBeNull();
    expect(result.pitch).toBeGreaterThanOrEqual(195);
    expect(result.pitch).toBeLessThanOrEqual(205);
    expect(result.clarity).toBeGreaterThan(0.5);
  });

  it('should maintain accuracy across multiple consecutive detections', () => {
    const detector = new PitchDetector(SAMPLE_RATE);
    const results = [];

    // Simulate 10 consecutive analysis frames (as rAF loop would do)
    for (let frame = 0; frame < 10; frame++) {
      const buffer = generateSineWave(200, SAMPLE_RATE, 4096, 0.5);
      results.push(detector.detect(buffer));
    }

    // All should detect within ±5 Hz
    for (const result of results) {
      expect(result.pitch).not.toBeNull();
      expect(result.pitch).toBeGreaterThanOrEqual(195);
      expect(result.pitch).toBeLessThanOrEqual(205);
    }
  });

  it('should correctly classify the detected 200 Hz tone as feminine', () => {
    const detector = new PitchDetector(SAMPLE_RATE);
    const buffer = generateSineWave(200, SAMPLE_RATE, 4096, 0.5);
    const result = detector.detect(buffer);

    const range = PitchDetector.classifyRange(result.pitch);
    expect(range).toBe('feminine');
  });

  it('should handle pitch transitions between frames', () => {
    const detector = new PitchDetector(SAMPLE_RATE);

    // Frame 1: 150 Hz (androgynous)
    const buf1 = generateSineWave(150, SAMPLE_RATE, 4096, 0.5);
    const r1 = detector.detect(buf1);
    expect(PitchDetector.classifyRange(r1.pitch)).toBe('androgynous');

    // Frame 2: 200 Hz (feminine)
    const buf2 = generateSineWave(200, SAMPLE_RATE, 4096, 0.5);
    const r2 = detector.detect(buf2);
    expect(PitchDetector.classifyRange(r2.pitch)).toBe('feminine');

    // Frame 3: silence
    const buf3 = new Float32Array(4096);
    const r3 = detector.detect(buf3);
    expect(r3.pitch).toBeNull();
  });
});
