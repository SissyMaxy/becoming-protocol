/**
 * Voice Training — Pitch Detection
 *
 * Web Audio API pitch detection via autocorrelation.
 * Runs in-browser — no external app needed.
 * Target: 180-200Hz feminine range.
 */

import { supabase } from '../supabase';
import type { PitchContext } from '../../types/voice-training';

// ── Pitch detection engine ──────────────────────────

export interface PitchDetector {
  start: () => void;
  stop: () => void;
  getCurrentPitch: () => number | null;
  getAveragePitch: () => number | null;
  getMinPitch: () => number | null;
  getMaxPitch: () => number | null;
  isRunning: () => boolean;
}

/**
 * Create a real-time pitch detector using Web Audio API autocorrelation.
 * Call start() to begin, stop() to end. Poll getCurrentPitch() for live Hz.
 */
export function createPitchDetector(onPitch?: (hz: number) => void): PitchDetector {
  let audioContext: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let stream: MediaStream | null = null;
  let running = false;
  let animFrameId: number | null = null;

  const readings: number[] = [];

  const SAMPLE_RATE = 44100;
  const FFT_SIZE = 4096; // Larger buffer = stable low-frequency detection
  const MIN_HZ = 75;   // Below male fundamental
  const MAX_HZ = 500;  // Above soprano range
  const YIN_THRESHOLD = 0.15; // CMND threshold — lower = stricter

  // YIN pitch detection (de Cheveigné & Kawahara 2002).
  // Far more accurate than plain autocorrelation — resists octave errors
  // and subharmonics that previously reported 2x/0.5x the true pitch.
  function detectPitchYin(buffer: Float32Array, sampleRate: number): number {
    // RMS gate
    let rms = 0;
    for (let i = 0; i < buffer.length; i++) rms += buffer[i] * buffer[i];
    rms = Math.sqrt(rms / buffer.length);
    if (rms < 0.01) return -1;

    const tauMin = Math.max(2, Math.floor(sampleRate / MAX_HZ));
    const tauMax = Math.min(buffer.length >> 1, Math.floor(sampleRate / MIN_HZ));
    if (tauMax <= tauMin) return -1;

    // Step 1+2: squared difference + cumulative mean normalization
    const yinBuf = new Float32Array(tauMax + 1);
    yinBuf[0] = 1;
    let runningSum = 0;

    for (let tau = 1; tau <= tauMax; tau++) {
      let sum = 0;
      for (let i = 0; i < tauMax; i++) {
        const delta = buffer[i] - buffer[i + tau];
        sum += delta * delta;
      }
      runningSum += sum;
      yinBuf[tau] = runningSum > 0 ? (sum * tau) / runningSum : 1;
    }

    // Step 3: absolute threshold — first dip below YIN_THRESHOLD
    let tauEstimate = -1;
    for (let tau = tauMin; tau <= tauMax; tau++) {
      if (yinBuf[tau] < YIN_THRESHOLD) {
        // Descend to local minimum
        while (tau + 1 <= tauMax && yinBuf[tau + 1] < yinBuf[tau]) tau++;
        tauEstimate = tau;
        break;
      }
    }

    if (tauEstimate === -1) return -1;

    // Step 4: parabolic interpolation for sub-sample precision
    const x0 = tauEstimate > 0 ? yinBuf[tauEstimate - 1] : yinBuf[tauEstimate];
    const x1 = yinBuf[tauEstimate];
    const x2 = tauEstimate < tauMax ? yinBuf[tauEstimate + 1] : yinBuf[tauEstimate];
    const denom = x0 + x2 - 2 * x1;
    const refinedTau = Math.abs(denom) < 1e-10 ? tauEstimate : tauEstimate + (x0 - x2) / (2 * denom);

    return sampleRate / refinedTau;
  }

  // Median smoothing over last N readings — rejects transient octave flips
  const smoothWindow: number[] = [];
  const SMOOTH_SIZE = 5;
  function smoothPitch(hz: number): number {
    smoothWindow.push(hz);
    if (smoothWindow.length > SMOOTH_SIZE) smoothWindow.shift();
    const sorted = [...smoothWindow].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }

  function detect() {
    if (!analyser || !running) return;

    const buffer = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(buffer);

    const rawHz = detectPitchYin(buffer, audioContext!.sampleRate);
    if (rawHz > 0 && rawHz >= MIN_HZ && rawHz <= MAX_HZ) {
      const hz = smoothPitch(rawHz);
      readings.push(hz);
      onPitch?.(Math.round(hz * 10) / 10);
    }

    animFrameId = requestAnimationFrame(detect);
  }

  return {
    async start() {
      if (running) return;
      try {
        audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
        analyser = audioContext.createAnalyser();
        analyser.fftSize = FFT_SIZE;

        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);

        running = true;
        readings.length = 0;
        detect();
      } catch (err) {
        console.error('[pitch] Failed to start pitch detector:', err);
        running = false;
      }
    },

    stop() {
      running = false;
      if (animFrameId) cancelAnimationFrame(animFrameId);
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
        stream = null;
      }
      if (audioContext) {
        audioContext.close().catch(() => {});
        audioContext = null;
      }
      analyser = null;
    },

    getCurrentPitch(): number | null {
      if (readings.length === 0) return null;
      return Math.round(readings[readings.length - 1] * 10) / 10;
    },

    getAveragePitch(): number | null {
      if (readings.length === 0) return null;
      const sum = readings.reduce((a, b) => a + b, 0);
      return Math.round((sum / readings.length) * 10) / 10;
    },

    getMinPitch(): number | null {
      if (readings.length === 0) return null;
      return Math.round(Math.min(...readings) * 10) / 10;
    },

    getMaxPitch(): number | null {
      if (readings.length === 0) return null;
      return Math.round(Math.max(...readings) * 10) / 10;
    },

    isRunning() {
      return running;
    },
  };
}

// ── Pitch logging ───────────────────────────────────

export async function logPitch(
  userId: string,
  pitchHz: number,
  context: PitchContext,
  durationSeconds?: number,
  drillLogId?: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('voice_pitch_logs')
    .insert({
      user_id: userId,
      pitch_hz: pitchHz,
      context,
      duration_seconds: durationSeconds || 0,
      drill_log_id: drillLogId || null,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[pitch] logPitch error:', error);
    return null;
  }
  return data.id;
}

// ── Pitch history ───────────────────────────────────

export async function getPitchHistory(
  userId: string,
  days: number = 30
): Promise<Array<{ date: string; avgHz: number }>> {
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const { data, error } = await supabase
    .from('voice_pitch_logs')
    .select('pitch_hz, recorded_at')
    .eq('user_id', userId)
    .gte('recorded_at', since)
    .order('recorded_at', { ascending: true });

  if (error || !data) return [];

  // Group by date
  const byDate = new Map<string, number[]>();
  for (const row of data) {
    const date = new Date(row.recorded_at as string).toISOString().split('T')[0];
    const existing = byDate.get(date) || [];
    existing.push(row.pitch_hz as number);
    byDate.set(date, existing);
  }

  return Array.from(byDate.entries()).map(([date, values]) => ({
    date,
    avgHz: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10,
  }));
}

// ── Pitch range classification ──────────────────────

export function classifyPitch(hz: number): 'masculine' | 'androgynous' | 'feminine' {
  if (hz < 155) return 'masculine';
  if (hz < 180) return 'androgynous';
  return 'feminine';
}

export function getPitchFeedback(hz: number, targetMin: number = 180, targetMax: number = 200): string {
  if (hz >= targetMin && hz <= targetMax) return 'In target range';
  if (hz < targetMin) return `${Math.round(targetMin - hz)}Hz below target`;
  return `${Math.round(hz - targetMax)}Hz above target — ease back`;
}
