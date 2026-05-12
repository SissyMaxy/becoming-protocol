// Voice-metrics analyzer + coaching grader tests.
//
// Strategy: synthesize audio signals where we KNOW the answer (e.g.,
// a pure 200 Hz tone has pitch 200 Hz, silence has voicedFrameRatio 0)
// and verify the analyzer recovers them within reasonable tolerance.
// LPC formants are a lossy estimator on a sine — we don't assert
// specific F1/F2 values, but we do verify that the analyzer returns
// numeric results on voiced frames and nulls on silence.
//
// These tests also serve as the regression gate for "rubber-stamp"
// passes: we send a known-bad signal (silence) and assert that
// gradeAttempt produces pass=false.

import { describe, it, expect } from 'vitest';
import { analyzeVoice, gradeAttempt, type TargetMetrics } from '../../lib/audio/voice-metrics';
import { composeMommyCoaching, scrubCoaching } from '../../lib/voice-coaching/mommy-coach';

const SR = 16000;

function sine(hz: number, durationSec: number, sampleRate = SR, amp = 0.5): Float32Array {
  const n = Math.floor(durationSec * sampleRate);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = amp * Math.sin((2 * Math.PI * hz * i) / sampleRate);
  return out;
}

function silence(durationSec: number, sampleRate = SR): Float32Array {
  return new Float32Array(Math.floor(durationSec * sampleRate));
}

/**
 * Two-formant synthetic vowel: a 200 Hz harmonic source (sum of
 * harmonics, glottal-flow-like) passed through bandpass-shaped
 * formants near F1=700 / F2=1700. Cheap; enough to verify the
 * analyzer reports plausible formants on a voiced signal.
 */
function syntheticVowel(f0: number, f1: number, f2: number, durationSec: number): Float32Array {
  const n = Math.floor(durationSec * SR);
  const out = new Float32Array(n);
  // Sum first 12 harmonics with 1/k rolloff, then boost the bands
  // closest to f1 / f2 to simulate vocal-tract resonance.
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = 1; k <= 12; k++) {
      const hz = f0 * k;
      let gain = 1 / k;
      // Boost harmonics within ±150Hz of F1 or F2
      if (Math.abs(hz - f1) < 150) gain *= 3;
      if (Math.abs(hz - f2) < 150) gain *= 3;
      s += gain * Math.sin((2 * Math.PI * hz * i) / SR);
    }
    out[i] = 0.15 * s;
  }
  return out;
}

describe('voice analyzer — pitch detection', () => {
  it('recovers a 200 Hz sine within 5 Hz', () => {
    const m = analyzeVoice(sine(200, 3), SR, { skipVowelSpace: true, skipTerminalRise: true });
    expect(m.pitchMeanHz).not.toBeNull();
    expect(Math.abs((m.pitchMeanHz ?? 0) - 200)).toBeLessThan(5);
    expect(m.voicedFrameRatio).toBeGreaterThan(0.8);
  });

  it('returns null pitch + zero voiced ratio on silence', () => {
    const m = analyzeVoice(silence(2), SR, { skipVowelSpace: true, skipTerminalRise: true });
    expect(m.pitchMeanHz).toBeNull();
    expect(m.voicedFrameRatio).toBe(0);
  });

  it('detects mid-feminine pitch (180 Hz) and reports stable std', () => {
    const m = analyzeVoice(sine(180, 2), SR);
    expect(m.pitchMeanHz).not.toBeNull();
    expect(Math.abs((m.pitchMeanHz ?? 0) - 180)).toBeLessThan(5);
    expect(m.pitchStdHz).not.toBeNull();
    // A pure sine should be very stable: std well under 5 Hz
    expect(m.pitchStdHz ?? 99).toBeLessThan(5);
  });
});

describe('voice analyzer — formants', () => {
  it('produces non-null F1/F2 on a synthetic voiced vowel', () => {
    const m = analyzeVoice(syntheticVowel(180, 700, 1700, 1.5), SR);
    expect(m.f1MeanHz).not.toBeNull();
    expect(m.f2MeanHz).not.toBeNull();
    // We don't assert exact formants — LPC on synthetic vowels is
    // noisy. We do assert F2 > F1 (the basic ordering invariant).
    expect((m.f2MeanHz ?? 0)).toBeGreaterThan((m.f1MeanHz ?? 0));
  });
});

describe('voice analyzer — resampling', () => {
  it('handles 44.1kHz input by resampling to 16kHz', () => {
    const m = analyzeVoice(sine(200, 1.5, 44100), 44100, { skipVowelSpace: true, skipTerminalRise: true });
    expect(m.pitchMeanHz).not.toBeNull();
    expect(Math.abs((m.pitchMeanHz ?? 0) - 200)).toBeLessThan(8);
  });
});

describe('grader — pass/fail logic', () => {
  const PITCH_LIFT_TARGET: TargetMetrics = {
    pitchMeanHz: { min: 165, max: 220 },
    pitchStdHz: { max: 25 },
    voicedFrameRatio: { min: 0.80 },
  };

  it('passes a clean 180 Hz sine against the pitch-lift lesson target', () => {
    const m = analyzeVoice(sine(180, 4), SR);
    const { passingMetricsMet, passingFrameRatio } = gradeAttempt(m, PITCH_LIFT_TARGET);
    expect(passingMetricsMet.pitchMeanHz).toBe(true);
    expect(passingMetricsMet.voicedFrameRatio).toBe(true);
    expect(passingFrameRatio).toBe(1);
  });

  it('fails a 120 Hz sine against the pitch-lift lesson target', () => {
    const m = analyzeVoice(sine(120, 3), SR);
    const { passingMetricsMet, passingFrameRatio } = gradeAttempt(m, PITCH_LIFT_TARGET);
    expect(passingMetricsMet.pitchMeanHz).toBe(false);
    expect(passingFrameRatio).toBeLessThan(1);
  });

  it('treats silence as universal fail (no rubber-stamp)', () => {
    const m = analyzeVoice(silence(3), SR);
    const { passingMetricsMet, passingFrameRatio } = gradeAttempt(m, PITCH_LIFT_TARGET);
    expect(passingMetricsMet.pitchMeanHz).toBe(false);
    expect(passingMetricsMet.voicedFrameRatio).toBe(false);
    expect(passingFrameRatio).toBe(0);
  });
});

describe('Mommy coaching — voice + scrubber', () => {
  it('passes pitch + resonance → produces an in-voice praise line', () => {
    const m = analyzeVoice(sine(180, 3), SR);
    const text = composeMommyCoaching({
      technique: 'pitch',
      measured: m,
      passingMetricsMet: { pitchMeanHz: true, pitchStdHz: true, voicedFrameRatio: true },
      passOverall: true,
      passPerfect: false,
      attemptNumber: 1,
    });
    expect(text.length).toBeGreaterThan(20);
    // Must contain at least one pet name + no clinical leak
    expect(/baby|sweet|good girl|pretty|precious/i.test(text)).toBe(true);
  });

  it('fails pitch → produces a correction line', () => {
    const m = analyzeVoice(sine(120, 3), SR);
    const text = composeMommyCoaching({
      technique: 'pitch',
      measured: m,
      passingMetricsMet: { pitchMeanHz: false, pitchStdHz: true, voicedFrameRatio: true },
      passOverall: false,
      passPerfect: false,
      attemptNumber: 2,
    });
    expect(text.length).toBeGreaterThan(20);
    // Should contain a retry phrase
    expect(/again|try|one more time|hold her/i.test(text)).toBe(true);
  });

  it('NEVER emits raw Hz, /10, %, or Day N in composed output', () => {
    const m = analyzeVoice(sine(200, 2), SR);
    for (let i = 0; i < 20; i++) {
      const text = composeMommyCoaching({
        technique: 'pitch',
        measured: m,
        passingMetricsMet: {
          pitchMeanHz: i % 2 === 0,
          pitchStdHz: i % 3 === 0,
          f2MeanHz: i % 4 === 0,
          voicedFrameRatio: true,
        },
        passOverall: i % 2 === 0,
        attemptNumber: i,
      });
      expect(text).not.toMatch(/\d+\s*Hz/i);
      expect(text).not.toMatch(/\d+\s*\/\s*10/);
      expect(text).not.toMatch(/\d+\s*%/);
      expect(text).not.toMatch(/Day\s+\d/i);
    }
  });

  it('scrubCoaching strips contaminated text', () => {
    const dirty = "Beautiful, baby. Your pitch averaged 178 Hz with jitter 0.8 and F2=1750 Hz. Day 4 denial. Mama wants more.";
    const clean = scrubCoaching(dirty);
    expect(clean).not.toMatch(/\d+\s*Hz/i);
    expect(clean).not.toMatch(/F[123]\s*=?\s*\d+/);
    expect(clean).not.toMatch(/Day\s+\d/i);
    expect(clean.length).toBeGreaterThan(0);
  });
});

describe('analyzer end-to-end smoke — happy + sad path', () => {
  it('analyzes a 180 Hz vowel-like signal end-to-end without throwing', () => {
    const sig = syntheticVowel(180, 700, 1700, 2);
    const m = analyzeVoice(sig, SR);
    expect(m.analyzerVersion).toBeTruthy();
    expect(m.durationSec).toBeGreaterThan(1.5);
    expect(m.pitchMeanHz).not.toBeNull();
    expect(m.voicedFrameRatio).toBeGreaterThan(0.5);
  });

  it('returns analyzer output even on short/quiet input (no crash)', () => {
    const m = analyzeVoice(silence(0.1), SR);
    expect(m.analyzerVersion).toBeTruthy();
    expect(m.framePitchHz).toBeDefined();
  });
});
