// Physical practice ladder — advancement + safety-sizing regression.
// Pins the spec §4 criteria: comfort-gated advance, non-skippable size steps,
// bottoming prep-gate, balk splits, stall re-presents (no penalty).
// Source: src/lib/conditioning/physical-practice.ts (mirrors mig 680 SQL).

import { describe, it, expect } from 'vitest';
import {
  computeAdvancement,
  selectActiveRung,
  COMFORT_THRESHOLD,
} from '../../lib/conditioning/physical-practice';
import type { PhysicalRung, PhysicalLog } from '../../lib/types/physical-practice';

const rung = (over: Partial<PhysicalRung> & Pick<PhysicalRung, 'track' | 'rungOrder'>): PhysicalRung => ({
  id: `${over.track}-${over.rungOrder}`,
  slug: `${over.track}_${over.rungOrder}`,
  title: 't',
  prop: null,
  techniqueFocus: 'f',
  edictTemplate: 'e',
  isSizeStep: false,
  requiresPrepAttestation: false,
  isPrepStep: false,
  safetyNotes: null,
  ...over,
});

const ORAL: PhysicalRung[] = [
  rung({ track: 'oral', rungOrder: 1 }),
  rung({ track: 'oral', rungOrder: 2 }),
  rung({ track: 'oral', rungOrder: 3 }),
  rung({ track: 'oral', rungOrder: 4, isSizeStep: true }),
  rung({ track: 'oral', rungOrder: 5 }),
];
const BOTTOMING: PhysicalRung[] = [
  rung({ track: 'bottoming', rungOrder: 0, isPrepStep: true }),
  rung({ track: 'bottoming', rungOrder: 1 }),
  rung({ track: 'bottoming', rungOrder: 2 }),
  rung({ track: 'bottoming', rungOrder: 3, isSizeStep: true, requiresPrepAttestation: true }),
  rung({ track: 'bottoming', rungOrder: 4 }),
  rung({ track: 'bottoming', rungOrder: 5, isSizeStep: true, requiresPrepAttestation: true }),
];

const log = (rungOrder: number, comfortRating: number, iso: string): PhysicalLog => ({
  rungOrder,
  comfortRating,
  completedAt: iso,
});

describe('physical practice — comfort-gated advancement', () => {
  it('advances one rung after the required consecutive comfortable completions', () => {
    const logs = [log(1, 8, '2026-07-10T00:00:00Z'), log(1, 9, '2026-07-11T00:00:00Z')];
    const d = computeAdvancement(logs, { activeRungOrder: 1, prepAttestedAt: null }, ORAL, 'oral');
    expect(d.action).toBe('advance');
    expect(d.nextRungOrder).toBe(2);
  });

  it('holds (re-presents, no penalty) on a stall — too few comfortable logs', () => {
    const one = computeAdvancement([log(1, 9, '2026-07-11T00:00:00Z')], { activeRungOrder: 1, prepAttestedAt: null }, ORAL, 'oral');
    expect(one.action).toBe('hold');
    const meh = computeAdvancement(
      [log(1, 5, '2026-07-10T00:00:00Z'), log(1, 6, '2026-07-11T00:00:00Z')],
      { activeRungOrder: 1, prepAttestedAt: null }, ORAL, 'oral',
    );
    expect(meh.action).toBe('hold');
    expect(meh.nextRungOrder).toBe(1);
  });

  it('never skips a size step — advancement is strictly +1', () => {
    const logs = [log(3, 8, '2026-07-10T00:00:00Z'), log(3, 8, '2026-07-11T00:00:00Z')];
    const d = computeAdvancement(logs, { activeRungOrder: 3, prepAttestedAt: null }, ORAL, 'oral');
    expect(d.nextRungOrder).toBe(4); // to the size step, one at a time — not 5
  });

  it('blocks a bottoming size step until prep is attested', () => {
    const logs = [log(2, 9, '2026-07-10T00:00:00Z'), log(2, 9, '2026-07-11T00:00:00Z')];
    const blocked = computeAdvancement(logs, { activeRungOrder: 2, prepAttestedAt: null }, BOTTOMING, 'bottoming');
    expect(blocked.action).toBe('hold'); // next rung (3) is a prep-gated size step
    expect(blocked.nextRungOrder).toBe(2);

    const attested = computeAdvancement(logs, { activeRungOrder: 2, prepAttestedAt: '2026-07-09T00:00:00Z' }, BOTTOMING, 'bottoming');
    expect(attested.action).toBe('advance');
    expect(attested.nextRungOrder).toBe(3);
  });

  it('splits (offers a gentler step) on a flinch spike, never forces on', () => {
    const logs = [log(2, 8, '2026-07-10T00:00:00Z'), log(2, 2, '2026-07-12T00:00:00Z')];
    const d = computeAdvancement(logs, { activeRungOrder: 2, prepAttestedAt: null }, BOTTOMING, 'bottoming');
    expect(d.action).toBe('split');
    expect(d.nextRungOrder).toBe(2);
  });

  it('marks the track complete at the top rung when comfortable', () => {
    const logs = [log(5, 8, '2026-07-10T00:00:00Z'), log(5, 9, '2026-07-11T00:00:00Z')];
    const d = computeAdvancement(logs, { activeRungOrder: 5, prepAttestedAt: '2026-07-01T00:00:00Z' }, BOTTOMING, 'bottoming');
    expect(d.action).toBe('complete');
  });

  it('selectActiveRung returns the current rung', () => {
    expect(selectActiveRung({ activeRungOrder: 3 }, ORAL, 'oral')?.rungOrder).toBe(3);
    expect(COMFORT_THRESHOLD).toBe(7);
  });
});
