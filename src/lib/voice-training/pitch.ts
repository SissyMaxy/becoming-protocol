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
  const FFT_SIZE = 2048;
  const MIN_HZ = 75;   // Below male fundamental
  const MAX_HZ = 400;  // Above soprano range

  function autoCorrelate(buffer: Float32Array, sampleRate: number): number {
    // Find RMS — if too quiet, return -1
    let rms = 0;
    for (let i = 0; i < buffer.length; i++) {
      rms += buffer[i] * buffer[i];
    }
    rms = Math.sqrt(rms / buffer.length);
    if (rms < 0.01) return -1;

    // Autocorrelation
    const minSamples = Math.floor(sampleRate / MAX_HZ);
    const maxSamples = Math.floor(sampleRate / MIN_HZ);
    let bestCorrelation = -1;
    let bestOffset = -1;

    for (let offset = minSamples; offset < maxSamples && offset < buffer.length; offset++) {
      let correlation = 0;
      for (let i = 0; i < buffer.length - offset; i++) {
        correlation += buffer[i] * buffer[i + offset];
      }
      correlation /= (buffer.length - offset);

      if (correlation > bestCorrelation) {
        bestCorrelation = correlation;
        bestOffset = offset;
      }
    }

    if (bestCorrelation < 0.01 || bestOffset < 1) return -1;

    // Parabolic interpolation for sub-sample accuracy
    const prev = bestOffset > 0 ? correlationAt(buffer, bestOffset - 1) : 0;
    const curr = correlationAt(buffer, bestOffset);
    const next = bestOffset < buffer.length - 1 ? correlationAt(buffer, bestOffset + 1) : 0;
    const shift = (prev - next) / (2 * (prev - 2 * curr + next));
    const refinedOffset = bestOffset + (isFinite(shift) ? shift : 0);

    return sampleRate / refinedOffset;
  }

  function correlationAt(buffer: Float32Array, offset: number): number {
    let correlation = 0;
    for (let i = 0; i < buffer.length - offset; i++) {
      correlation += buffer[i] * buffer[i + offset];
    }
    return correlation / (buffer.length - offset);
  }

  function detect() {
    if (!analyser || !running) return;

    const buffer = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(buffer);

    const hz = autoCorrelate(buffer, audioContext!.sampleRate);
    if (hz > 0 && hz >= MIN_HZ && hz <= MAX_HZ) {
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
