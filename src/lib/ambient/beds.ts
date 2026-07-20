/**
 * Abstract visual beds for the ambient window.
 *
 * WHY these exist: the window is blocked on nothing if it can render its own
 * visuals. Clip beds need the ingest pipeline deployed plus source material;
 * these need neither, so the surface is live and testable today and clip beds
 * slot in later behind the same interface.
 *
 * They also stay useful after clips arrive — an abstract bed is the right
 * choice when he's working and a clip would pull too hard, which is exactly
 * what the low-cadence end of the tuning range is for.
 *
 * Every bed is pure CSS: a gradient plus a slow keyframe. No canvas, no rAF,
 * no decode cost — three of these run at negligible CPU next to three video
 * elements, which matters for a surface that stays open for hours.
 *
 * The trance drop signature (the rose orb + its breathing rhythm) is
 * deliberately NOT reused here. That look is trance-only so it stays a cue;
 * diluting it across an always-on surface would burn the anchor.
 */

export type BedId = 'ember' | 'drift' | 'veil' | 'pulse';

export interface AbstractBed {
  id: BedId;
  /** Layered CSS background — sits under the text, above the panel base. */
  background: string;
  /** Keyframe name defined in ambient.css. */
  animation: string;
  /** Seconds. Long and prime-ish so the three panels never visibly sync up. */
  durationS: number;
}

export const ABSTRACT_BEDS: Record<BedId, AbstractBed> = {
  // Warm low glow rising from the bottom — the velvet floor, breathing.
  ember: {
    id: 'ember',
    background:
      'radial-gradient(120% 70% at 50% 108%, rgb(var(--protocol-accent-rgb) / 0.30) 0%, rgb(var(--protocol-accent-rgb) / 0) 60%), ' +
      'linear-gradient(180deg, var(--protocol-bg-warm) 0%, var(--protocol-bg-deep) 100%)',
    animation: 'ambient-ember',
    durationS: 19,
  },
  // Two offset glows sliding past each other. Motion without a focal point.
  drift: {
    id: 'drift',
    background:
      'radial-gradient(80% 50% at 25% 30%, rgb(var(--protocol-accent-rgb) / 0.22) 0%, rgb(var(--protocol-accent-rgb) / 0) 55%), ' +
      'radial-gradient(70% 45% at 75% 70%, rgba(120, 58, 87, 0.28) 0%, rgba(120, 58, 87, 0) 60%), ' +
      'linear-gradient(180deg, var(--protocol-bg-deep) 0%, var(--protocol-bg) 100%)',
    animation: 'ambient-drift',
    durationS: 23,
  },
  // Near-dark with a faint vertical sheen. The quietest option — for working.
  veil: {
    id: 'veil',
    background:
      'linear-gradient(180deg, rgb(var(--protocol-accent-rgb) / 0.10) 0%, rgb(var(--protocol-accent-rgb) / 0) 45%), ' +
      'linear-gradient(180deg, var(--protocol-bg-deep) 0%, var(--immersive-bg) 100%)',
    animation: 'ambient-veil',
    durationS: 29,
  },
  // A slow swell centred behind the text. The hottest bed; used at command
  // intensity and during a hit.
  pulse: {
    id: 'pulse',
    background:
      'radial-gradient(65% 40% at 50% 50%, rgb(var(--protocol-accent-rgb) / 0.34) 0%, rgb(var(--protocol-accent-rgb) / 0) 62%), ' +
      'linear-gradient(180deg, var(--protocol-bg-warm) 0%, var(--protocol-bg-deep) 100%)',
    animation: 'ambient-pulse',
    durationS: 13,
  },
};

/**
 * Pick a bed for a channel at an intensity.
 *
 * Deterministic per (channel, intensity) so a panel keeps a stable look while
 * its lines rotate — the fixed-form/varying-content split the whole surface
 * runs on. If the bed changed with every line, the frame would never settle
 * enough to stop being noticed.
 */
export function bedFor(channel: string, intensity: string): AbstractBed {
  if (intensity === 'command') return ABSTRACT_BEDS.pulse;
  if (intensity === 'soft') return ABSTRACT_BEDS.veil;
  return channel === 'identity' ? ABSTRACT_BEDS.ember : ABSTRACT_BEDS.drift;
}
