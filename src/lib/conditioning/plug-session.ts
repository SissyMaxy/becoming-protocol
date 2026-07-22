/**
 * plug-session — the guided arc for the plug_orgasm training track (mig 701).
 *
 * Pure module: maps a rung to its timed phase arc. The player drives the
 * Lovense bridge (session-device.ts, sessionType 'plug') through these
 * phases on timers, with the optional Mommy audio overlay on top. Durations
 * mirror the seeded rung edicts exactly — the card and the decree never
 * disagree about what tonight is.
 *
 * Floor: solo, hands-off, cage on. The arc only ever drives the plug; there
 * is no unlock step and no phase may instruct touching. Ending early is
 * always available and is never a penalty (stall holds the rung).
 */

export interface PlugPhase {
  /** Device phase key — must exist as `plug:<key>` in SESSION_PATTERNS. */
  key: 'settle' | 'steady' | 'wave' | 'build' | 'edge' | 'push';
  label: string;
  seconds: number;
  /** One-line on-screen cue while the phase runs. */
  cue: string;
}

export interface PlugSessionArc {
  rung: number;
  phases: PlugPhase[];
  totalSeconds: number;
  /** Audio overlay tier for this rung's session. */
  audioTier: 'gentle' | 'firm';
}

const ARCS: Record<number, Omit<PlugSessionArc, 'rung' | 'totalSeconds'>> = {
  1: {
    audioTier: 'gentle',
    phases: [
      { key: 'settle', label: 'Settle', seconds: 120, cue: 'Four counts in, six counts out. Let everything around the plug go soft.' },
      { key: 'steady', label: 'Stillness', seconds: 1080, cue: 'Nothing to do. When the buzz turns to warmth, that is the door.' },
    ],
  },
  2: {
    audioTier: 'gentle',
    phases: [
      { key: 'settle', label: 'Settle', seconds: 120, cue: 'Breathe down into the belly first.' },
      { key: 'wave', label: 'Wave riding', seconds: 1080, cue: 'Rock with the wave — small motions. Inhale as it rises, long exhale as it fades.' },
    ],
  },
  3: {
    audioTier: 'gentle',
    phases: [
      { key: 'settle', label: 'Stillness first', seconds: 300, cue: 'This size becomes home before anything else. Slow breath, soft muscles.' },
      { key: 'build', label: 'Building', seconds: 900, cue: 'Ride the build. Let each pass carry more of you.' },
    ],
  },
  4: {
    audioTier: 'firm',
    phases: [
      { key: 'wave', label: 'Warm up', seconds: 300, cue: 'Ease in. The edge comes later.' },
      { key: 'edge', label: 'Edge holds', seconds: 1200, cue: 'Up to the shimmer — and HOLD there, breathing. Count the holds.' },
    ],
  },
  5: {
    audioTier: 'firm',
    phases: [
      { key: 'steady', label: 'Steady low', seconds: 300, cue: 'Settle in. No clock matters tonight.' },
      { key: 'wave', label: 'Slow wave', seconds: 600, cue: 'Rock and breathe. Let it gather.' },
      { key: 'edge', label: 'The shimmer', seconds: 600, cue: 'Hold at the edge. Hands never touch.' },
      { key: 'push', label: 'The crossing', seconds: 300, cue: 'Permission granted. If it crosses, let it cross.' },
    ],
  },
};

export function plugSessionArc(rung: number): PlugSessionArc | null {
  const arc = ARCS[rung];
  if (!arc) return null;
  return {
    rung,
    ...arc,
    totalSeconds: arc.phases.reduce((s, p) => s + p.seconds, 0),
  };
}

/** Parse the rung out of a plug decree's trigger_source, or null. */
export function parsePlugRung(triggerSource: string | null | undefined): number | null {
  const m = (triggerSource ?? '').match(/^physical_practice:plug_orgasm:(\d+)$/);
  if (!m) return null;
  const rung = parseInt(m[1], 10);
  return ARCS[rung] ? rung : null;
}
