/**
 * Canonical voice-feminization analyzer. Real measurement, not
 * rubber-stamp. Runs on a Float32Array PCM signal at any sample rate
 * (auto-resampled to 16kHz internally for formant analysis).
 *
 * Metric set (matches voice_lesson_modules.target_metrics keys):
 *   pitchMeanHz, pitchMedianHz, pitchStdHz, pitchMinHz, pitchMaxHz
 *   f1MeanHz, f2MeanHz, f3MeanHz
 *   jitterPct, shimmerPct
 *   spectralTiltDbPerOct, hfEnergyRatio
 *   vowelSpaceAreaHz2          (optional — only for multi-vowel drills)
 *   terminalRisePct            (optional — only for prosody drills)
 *   voicedFrameRatio
 *   passingFrameRatio          (filled in by the grader, not here)
 *   rmsDbfs
 *
 * Versioned: bump ANALYZER_VERSION on any change that alters output.
 */

import { estimatePitchHz } from '../voice-pitch';
import { frameFormants } from './lpc';
import { resample } from './wav';

export const ANALYZER_VERSION = 'v1.0.0';

export interface VoiceMetrics {
  pitchMeanHz: number | null;
  pitchMedianHz: number | null;
  pitchStdHz: number | null;
  pitchMinHz: number | null;
  pitchMaxHz: number | null;
  f1MeanHz: number | null;
  f2MeanHz: number | null;
  f3MeanHz: number | null;
  jitterPct: number | null;
  shimmerPct: number | null;
  spectralTiltDbPerOct: number | null;
  hfEnergyRatio: number | null;
  vowelSpaceAreaHz2: number | null;
  terminalRisePct: number | null;
  voicedFrameRatio: number;
  rmsDbfs: number;
  durationSec: number;
  framePitchHz: number[];          // per-window pitch (for grading + plotting)
  frameF1Hz: (number | null)[];
  frameF2Hz: (number | null)[];
  analyzerVersion: string;
}

const ANALYSIS_SAMPLE_RATE = 16000;
const FRAME_MS = 25;
const HOP_MS = 10;

function rms(buf: Float32Array): number {
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / buf.length);
}

function mean(xs: number[]): number {
  let s = 0;
  for (const x of xs) s += x;
  return xs.length ? s / xs.length : 0;
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function stddev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  let s = 0;
  for (const x of xs) s += (x - m) ** 2;
  return Math.sqrt(s / (xs.length - 1));
}

/**
 * Naive radix-2 FFT — fine for short windows (<= 4096) and we don't
 * need a fast FFT library dep. Returns real magnitudes (length N/2 + 1).
 */
function fftMag(x: Float32Array): Float32Array {
  // Pad to power of 2
  let n = 1;
  while (n < x.length) n *= 2;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < x.length; i++) re[i] = x[i];

  // Bit-reverse permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }

  // Cooley-Tukey
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wlenRe = Math.cos(ang);
    const wlenIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wRe = 1, wIm = 0;
      for (let j = 0; j < len / 2; j++) {
        const uRe = re[i + j];
        const uIm = im[i + j];
        const vRe = re[i + j + len / 2] * wRe - im[i + j + len / 2] * wIm;
        const vIm = re[i + j + len / 2] * wIm + im[i + j + len / 2] * wRe;
        re[i + j] = uRe + vRe;
        im[i + j] = uIm + vIm;
        re[i + j + len / 2] = uRe - vRe;
        im[i + j + len / 2] = uIm - vIm;
        const nwRe = wRe * wlenRe - wIm * wlenIm;
        wIm = wRe * wlenIm + wIm * wlenRe;
        wRe = nwRe;
      }
    }
  }
  const half = n / 2 + 1;
  const mag = new Float32Array(half);
  for (let i = 0; i < half; i++) mag[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]);
  return mag;
}

/**
 * Long-term-average spectral tilt: fit a line through log-magnitude
 * spectrum (dB) vs log-frequency (octaves above 100Hz). Returns slope
 * in dB / octave. Feminine voices are typically less negative
 * (less roll-off) than masculine — but for our purposes we measure the
 * change toward a softer onset / breathier quality (more negative tilt
 * above 1kHz indicates softer / breathier).
 */
function spectralTiltDbPerOctave(samples: Float32Array, sampleRate: number): number {
  const mag = fftMag(samples);
  const binHz = sampleRate / (2 * (mag.length - 1));
  const points: Array<{ x: number; y: number }> = [];
  for (let i = 1; i < mag.length; i++) {
    const f = i * binHz;
    if (f < 200 || f > 5000) continue;
    if (mag[i] <= 1e-9) continue;
    const oct = Math.log2(f / 100);
    const db = 20 * Math.log10(mag[i]);
    points.push({ x: oct, y: db });
  }
  if (points.length < 4) return 0;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const p of points) { sx += p.x; sy += p.y; sxx += p.x * p.x; sxy += p.x * p.y; }
  const n = points.length;
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  return slope;
}

/**
 * Fraction of total spectral energy that lives above 1500Hz.
 * Feminine voices push more energy into the upper formants — typical
 * range 0.35–0.55. Masculine voices typically below 0.30.
 */
function hfEnergyRatio(samples: Float32Array, sampleRate: number): number {
  const mag = fftMag(samples);
  const binHz = sampleRate / (2 * (mag.length - 1));
  let total = 0, hi = 0;
  for (let i = 1; i < mag.length; i++) {
    const e = mag[i] * mag[i];
    total += e;
    if (i * binHz >= 1500) hi += e;
  }
  return total > 0 ? hi / total : 0;
}

/** Compute jitter (pitch period perturbation) from a sequence of pitch values in Hz. */
function jitterPct(pitchHz: number[]): number | null {
  const periods = pitchHz.filter(p => p > 0).map(p => 1 / p);
  if (periods.length < 3) return null;
  let abssum = 0;
  for (let i = 1; i < periods.length; i++) abssum += Math.abs(periods[i] - periods[i - 1]);
  const meanPeriod = mean(periods);
  return meanPeriod > 0 ? (100 * (abssum / (periods.length - 1))) / meanPeriod : null;
}

/** Compute shimmer (amplitude perturbation) from per-frame RMS values. */
function shimmerPct(rmsValues: number[]): number | null {
  const amps = rmsValues.filter(a => a > 0);
  if (amps.length < 3) return null;
  let abssum = 0;
  for (let i = 1; i < amps.length; i++) abssum += Math.abs(amps[i] - amps[i - 1]);
  const meanAmp = mean(amps);
  return meanAmp > 0 ? (100 * (abssum / (amps.length - 1))) / meanAmp : null;
}

/**
 * For a multi-vowel drill (heed–had–hood–hoed), measure the vowel space
 * area in F1×F2 plane. Identifies vowels by clustering frames with
 * voiced pitch + stable F1/F2 into 4 groups by F2 quartiles.
 * Returns the area of the convex hull of the 4 cluster centroids.
 */
function vowelSpaceAreaHz2(frameF1: (number | null)[], frameF2: (number | null)[]): number | null {
  const pts: Array<{ f1: number; f2: number }> = [];
  for (let i = 0; i < frameF1.length; i++) {
    const a = frameF1[i]; const b = frameF2[i];
    if (a == null || b == null) continue;
    pts.push({ f1: a, f2: b });
  }
  if (pts.length < 40) return null;
  // Sort by F2, take 4 quartile centroids
  pts.sort((a, b) => a.f2 - b.f2);
  const q = Math.floor(pts.length / 4);
  const centroids: Array<{ x: number; y: number }> = [];
  for (let k = 0; k < 4; k++) {
    const slice = pts.slice(k * q, (k + 1) * q);
    centroids.push({ x: mean(slice.map(p => p.f2)), y: mean(slice.map(p => p.f1)) });
  }
  // Shoelace area for the quadrilateral
  let area = 0;
  for (let i = 0; i < 4; i++) {
    const a = centroids[i];
    const b = centroids[(i + 1) % 4];
    area += a.x * b.y - b.x * a.y;
  }
  return Math.abs(area) / 2;
}

/**
 * Measure terminal rises: split the per-frame pitch trace into 3 equal
 * thirds (proxy for "phrases"), compare the final 200ms median pitch
 * of each third to its preceding 400ms median. Returns the mean
 * percentage rise across the three thirds.
 */
function terminalRisePct(pitchHz: number[]): number | null {
  const voiced = pitchHz.map((p, i) => ({ p, i })).filter(x => x.p > 0);
  if (voiced.length < 60) return null; // need at least ~0.6s of voiced
  const thirds: number[][] = [[], [], []];
  for (const v of voiced) {
    const which = Math.min(2, Math.floor((3 * v.i) / pitchHz.length));
    thirds[which].push(v.p);
  }
  const rises: number[] = [];
  for (const t of thirds) {
    if (t.length < 30) continue;
    const tailLen = Math.max(10, Math.floor(t.length * 0.2));
    const headLen = Math.max(20, Math.floor(t.length * 0.4));
    const head = t.slice(t.length - tailLen - headLen, t.length - tailLen);
    const tail = t.slice(t.length - tailLen);
    if (!head.length || !tail.length) continue;
    const h = median(head); const tl = median(tail);
    if (h <= 0) continue;
    rises.push((100 * (tl - h)) / h);
  }
  return rises.length ? mean(rises) : null;
}

export interface AnalyzeOptions {
  /** Skip vowel-space analysis (saves CPU on lessons that don't need it). */
  skipVowelSpace?: boolean;
  /** Skip terminal-rise analysis. */
  skipTerminalRise?: boolean;
}

/**
 * Run the full analyzer. Input may be at any sample rate; we resample
 * to 16kHz internally for formant + spectral analysis. Returns null
 * for any metric that couldn't be computed (silence, too short, etc.).
 */
export function analyzeVoice(
  samples: Float32Array,
  sampleRate: number,
  opts: AnalyzeOptions = {},
): VoiceMetrics {
  // Resample to canonical 16kHz for formant analysis.
  const x = sampleRate === ANALYSIS_SAMPLE_RATE ? samples : resample(samples, sampleRate, ANALYSIS_SAMPLE_RATE);
  const fs = ANALYSIS_SAMPLE_RATE;
  const durationSec = x.length / fs;

  const frameLen = Math.round((FRAME_MS / 1000) * fs);
  const hopLen = Math.round((HOP_MS / 1000) * fs);
  const nFrames = Math.max(0, Math.floor((x.length - frameLen) / hopLen) + 1);

  const framePitchHz: number[] = [];
  const frameF1Hz: (number | null)[] = [];
  const frameF2Hz: (number | null)[] = [];
  const frameF3Hz: (number | null)[] = [];
  const frameRms: number[] = [];

  let voicedFrames = 0;
  let totalRmsSq = 0;
  let totalLen = 0;

  for (let i = 0; i < nFrames; i++) {
    const start = i * hopLen;
    const frame = x.subarray(start, start + frameLen);
    const r = rms(frame);
    frameRms.push(r);
    totalRmsSq += r * r;
    totalLen++;

    const pitch = estimatePitchHz(frame, fs);
    framePitchHz.push(pitch > 0 ? pitch : -1);
    if (pitch > 0) voicedFrames++;

    // Only run formants on voiced frames — saves CPU and rejects fricatives.
    if (pitch > 0) {
      const f = frameFormants(frame, fs);
      frameF1Hz.push(f.f1);
      frameF2Hz.push(f.f2);
      frameF3Hz.push(f.f3);
    } else {
      frameF1Hz.push(null);
      frameF2Hz.push(null);
      frameF3Hz.push(null);
    }
  }

  const voicedFrameRatio = nFrames > 0 ? voicedFrames / nFrames : 0;
  const voicedPitch = framePitchHz.filter(p => p > 0);
  const voicedRms = frameRms.filter((_, i) => framePitchHz[i] > 0);

  const totalRms = totalLen > 0 ? Math.sqrt(totalRmsSq / totalLen) : 0;
  const rmsDbfs = totalRms > 1e-6 ? 20 * Math.log10(totalRms) : -120;

  const tilt = spectralTiltDbPerOctave(x, fs);
  const hfRatio = hfEnergyRatio(x, fs);

  const f1Vals = frameF1Hz.filter((v): v is number => v != null);
  const f2Vals = frameF2Hz.filter((v): v is number => v != null);
  const f3Vals = frameF3Hz.filter((v): v is number => v != null);

  return {
    pitchMeanHz: voicedPitch.length ? mean(voicedPitch) : null,
    pitchMedianHz: voicedPitch.length ? median(voicedPitch) : null,
    pitchStdHz: voicedPitch.length > 2 ? stddev(voicedPitch) : null,
    pitchMinHz: voicedPitch.length ? Math.min(...voicedPitch) : null,
    pitchMaxHz: voicedPitch.length ? Math.max(...voicedPitch) : null,
    f1MeanHz: f1Vals.length ? mean(f1Vals) : null,
    f2MeanHz: f2Vals.length ? mean(f2Vals) : null,
    f3MeanHz: f3Vals.length ? mean(f3Vals) : null,
    jitterPct: jitterPct(voicedPitch),
    shimmerPct: shimmerPct(voicedRms),
    spectralTiltDbPerOct: tilt,
    hfEnergyRatio: hfRatio,
    vowelSpaceAreaHz2: opts.skipVowelSpace ? null : vowelSpaceAreaHz2(frameF1Hz, frameF2Hz),
    terminalRisePct: opts.skipTerminalRise ? null : terminalRisePct(framePitchHz),
    voicedFrameRatio,
    rmsDbfs,
    durationSec,
    framePitchHz,
    frameF1Hz,
    frameF2Hz,
    analyzerVersion: ANALYZER_VERSION,
  };
}

/** Public type for the per-target pass map. */
export interface MetricBound {
  min?: number;
  max?: number;
}

export type TargetMetrics = Record<string, MetricBound>;

/**
 * Grade measured metrics against a lesson's target_metrics jsonb.
 * Returns per-metric pass booleans + overall pass ratio (fraction of
 * targets satisfied). A null measured value is treated as fail.
 */
export function gradeAttempt(
  measured: VoiceMetrics,
  targets: TargetMetrics,
): { passingMetricsMet: Record<string, boolean>; passingFrameRatio: number } {
  const passing: Record<string, boolean> = {};
  let pass = 0, total = 0;
  const m = measured as unknown as Record<string, number | null>;
  for (const [key, bound] of Object.entries(targets)) {
    total++;
    const v = m[key];
    if (v == null || !Number.isFinite(v)) {
      passing[key] = false;
      continue;
    }
    let ok = true;
    if (bound.min != null && v < bound.min) ok = false;
    if (bound.max != null && v > bound.max) ok = false;
    passing[key] = ok;
    if (ok) pass++;
  }
  return { passingMetricsMet: passing, passingFrameRatio: total > 0 ? pass / total : 0 };
}
