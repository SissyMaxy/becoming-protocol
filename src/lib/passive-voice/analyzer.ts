/**
 * Passive Voice — On-Device Analysis Engine
 *
 * Wraps the existing createPitchDetector() for background monitoring.
 * Buffers 10-second windows, discards silence, emits aggregated samples.
 * NO audio is stored — only numeric pitch metrics.
 */

import { createPitchDetector, type PitchDetector } from '../voice-training/pitch';
import type { VoiceContext } from '../../types/passive-voice';

// ── Passive analyzer interface ──────────────────────────

export interface PassiveAnalyzer {
  start: () => Promise<void>;
  stop: () => void;
  isRunning: () => boolean;
  setContext: (ctx: VoiceContext) => void;
  getContext: () => VoiceContext;
  getCurrentPitch: () => number | null;
}

export interface PassiveSample {
  avg_pitch_hz: number;
  min_pitch_hz: number;
  max_pitch_hz: number;
  duration_seconds: number;
  voice_context: VoiceContext;
  confidence: number;
}

// ── Constants ───────────────────────────────────────────

const WINDOW_SECONDS = 10;

// ── Create passive analyzer ─────────────────────────────

export function createPassiveAnalyzer(
  onSample: (sample: PassiveSample) => void
): PassiveAnalyzer {
  let detector: PitchDetector | null = null;
  let running = false;
  let currentContext: VoiceContext = 'unknown';
  let windowReadings: number[] = [];
  let windowStartTime = 0;
  let intervalId: ReturnType<typeof setInterval> | null = null;

  function processWindow() {
    if (windowReadings.length < 3) {
      // Too few voiced readings — discard (silence/noise)
      windowReadings = [];
      windowStartTime = Date.now();
      return;
    }

    const sorted = [...windowReadings].sort((a, b) => a - b);
    const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
    const min = sorted[0];
    const max = sorted[sorted.length - 1];

    // Confidence: ratio of voiced frames to total expected frames
    // ~60 readings per second expected (requestAnimationFrame), so ~600 per 10s
    const expectedReadings = WINDOW_SECONDS * 60;
    const confidence = Math.min(1, windowReadings.length / (expectedReadings * 0.3)); // 30% voiced is good

    const durationSeconds = (Date.now() - windowStartTime) / 1000;

    onSample({
      avg_pitch_hz: Math.round(avg * 10) / 10,
      min_pitch_hz: Math.round(min * 10) / 10,
      max_pitch_hz: Math.round(max * 10) / 10,
      duration_seconds: Math.round(durationSeconds * 10) / 10,
      voice_context: currentContext,
      confidence: Math.round(confidence * 100) / 100,
    });

    // Reset window
    windowReadings = [];
    windowStartTime = Date.now();
  }

  return {
    async start() {
      if (running) return;

      windowReadings = [];
      windowStartTime = Date.now();

      detector = createPitchDetector((hz) => {
        windowReadings.push(hz);
      });

      await (detector as unknown as { start: () => Promise<void> }).start();
      running = true;

      // Process windows every WINDOW_SECONDS
      intervalId = setInterval(processWindow, WINDOW_SECONDS * 1000);
    },

    stop() {
      running = false;
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
      // Process any remaining readings
      if (windowReadings.length >= 3) {
        processWindow();
      }
      if (detector) {
        detector.stop();
        detector = null;
      }
    },

    isRunning() {
      return running;
    },

    setContext(ctx: VoiceContext) {
      currentContext = ctx;
    },

    getContext() {
      return currentContext;
    },

    getCurrentPitch() {
      return detector?.getCurrentPitch() ?? null;
    },
  };
}
