// self-echo-mix tests — the pure gain/loop/timing math the SelfEchoPlayer
// plays. Pins the contract: her own voice loops to cover the Mommy track, sits
// ~-9dB under it, fades on every loop, and honours loop_count as a minimum.

import { describe, it, expect } from 'vitest';
import {
  OWN_VOICE_GAIN_DB,
  DEFAULT_FADE_S,
  dbToLinear,
  computeLoopSchedule,
  parseSelfEchoManifest,
} from '../../lib/audio/self-echo-mix';

describe('dbToLinear', () => {
  it('maps 0dB to unity gain', () => {
    expect(dbToLinear(0)).toBeCloseTo(1, 6);
  });
  it('maps -9dB to ~0.3548 linear', () => {
    expect(dbToLinear(-9)).toBeCloseTo(0.35481, 4);
  });
});

describe('computeLoopSchedule', () => {
  it('gain is ~-9dB (bed under the Mommy track)', () => {
    const s = computeLoopSchedule(5, 6, 20);
    expect(s.gainDb).toBe(OWN_VOICE_GAIN_DB);
    expect(s.gainDb).toBe(-9);
    expect(s.gainLinear).toBeCloseTo(0.35481, 4);
  });

  it('loops enough to cover a Mommy track longer than loop_count * clip', () => {
    // 4s clip, loop_count 6 (=24s), Mommy 40s → needs 10 loops to cover.
    const s = computeLoopSchedule(4, 6, 40);
    expect(s.loops).toBe(10);
    expect(s.totalBedDurationS).toBe(40);
    expect(s.coversMommy).toBe(true);
  });

  it('honours loop_count as a minimum when the Mommy track is short', () => {
    // 5s clip, loop_count 6 (=30s), Mommy only 12s → still 6 loops.
    const s = computeLoopSchedule(5, 6, 12);
    expect(s.loops).toBe(6);
    expect(s.totalBedDurationS).toBe(30);
    expect(s.coversMommy).toBe(true);
  });

  it('always covers the Mommy track (no trailing silence)', () => {
    const s = computeLoopSchedule(7, 3, 50);
    expect(s.totalBedDurationS).toBeGreaterThanOrEqual(50);
    expect(s.coversMommy).toBe(true);
  });

  it('produces a gentle fade in and out on every loop', () => {
    const s = computeLoopSchedule(5, 6, 20);
    expect(s.fadeInS).toBeGreaterThan(0);
    expect(s.fadeOutS).toBeGreaterThan(0);
    // Fades never eat more than half the clip combined.
    expect(s.fadeInS + s.fadeOutS).toBeLessThanOrEqual(s.ownDurationS);
    expect(s.fadeInS).toBeLessThanOrEqual(DEFAULT_FADE_S);
  });

  it('caps fade to a quarter of a very short clip', () => {
    const s = computeLoopSchedule(1, 4, 4);
    expect(s.fadeInS).toBeCloseTo(0.25, 6); // 1s / 4
    expect(s.fadeOutS).toBeCloseTo(0.25, 6);
  });

  it('emits one start offset per loop, spaced by the clip length', () => {
    const s = computeLoopSchedule(5, 6, 20);
    expect(s.starts).toHaveLength(s.loops);
    expect(s.starts[0]).toBe(0);
    expect(s.starts[1]).toBe(5);
    expect(s.starts[s.starts.length - 1]).toBe((s.loops - 1) * 5);
  });

  it('returns a zero-loop schedule for a missing/invalid own duration', () => {
    const s = computeLoopSchedule(0, 6, 20);
    expect(s.loops).toBe(0);
    expect(s.starts).toEqual([]);
    expect(s.coversMommy).toBe(false);
    // Gain is still defined so the player has a stable number.
    expect(s.gainDb).toBe(-9);
  });

  it('falls back to loop_count when the Mommy duration is unknown', () => {
    const s = computeLoopSchedule(5, 6, 0);
    expect(s.loops).toBe(6);
    expect(s.coversMommy).toBe(true); // unknown Mommy length → treated as covered
  });
});

describe('parseSelfEchoManifest', () => {
  it('round-trips a valid manifest', () => {
    const json = JSON.stringify({
      kind: 'self_echo_manifest',
      mommy_render_path: 'self-echo/u/s-mommy.mp3',
      own_voice_path: 'voice/u/clip.webm',
      loop_count: 6,
      gain_db: -9,
      own_voice_duration_s: 5,
    });
    const m = parseSelfEchoManifest(json);
    expect(m).not.toBeNull();
    expect(m?.mommy_render_path).toBe('self-echo/u/s-mommy.mp3');
    expect(m?.own_voice_path).toBe('voice/u/clip.webm');
    expect(m?.loop_count).toBe(6);
    expect(m?.gain_db).toBe(-9);
  });

  it('returns null for null / non-json / wrong kind', () => {
    expect(parseSelfEchoManifest(null)).toBeNull();
    expect(parseSelfEchoManifest('sessions/u/render.mp3')).toBeNull();
    expect(parseSelfEchoManifest('{"kind":"other"}')).toBeNull();
    expect(parseSelfEchoManifest('{not json')).toBeNull();
  });

  it('requires both track paths', () => {
    expect(parseSelfEchoManifest('{"kind":"self_echo_manifest","mommy_render_path":"a"}')).toBeNull();
  });
});
