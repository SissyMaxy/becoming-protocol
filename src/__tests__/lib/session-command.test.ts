// session-command tests — Mommy issues ONE order, in voice, inside the container.
// The bite is real (denial/reward/proof); the exit is always present (decline +
// safeword); state reads are sensory, never telemetric.

import { describe, it, expect } from 'vitest';
import { composeMommyOrder, type FocusTarget } from '../../lib/session-command';
import type { RecommendationContext } from '../../lib/session-recommendations';
import type { ArousalState } from '../../types/arousal';

const ctx = (over: Partial<RecommendationContext>): RecommendationContext => ({
  arousalState: over.arousalState ?? 'building',
  denialDay: over.denialDay ?? 3,
  timeOfDay: over.timeOfDay ?? 'evening',
  isWeekend: over.isWeekend ?? false,
  lastSessionType: over.lastSessionType,
  lastSessionDate: over.lastSessionDate,
  isInSweetSpot: over.isInSweetSpot,
});

const ALL_STATES: ArousalState[] = [
  'baseline', 'building', 'sweet_spot', 'overload', 'post_release', 'recovery',
];

describe('composeMommyOrder — it commands, not offers', () => {
  it('always returns a single imperative order with a bite and an out', () => {
    for (const s of ALL_STATES) {
      const order = composeMommyOrder(ctx({ arousalState: s, denialDay: 5 }));
      expect(order.command.length).toBeGreaterThan(10);
      expect(order.stipulation.length).toBeGreaterThan(5);   // the bite
      expect(order.obeyLabel).toMatch(/mommy/i);
      expect(order.declineLabel).toBe('not tonight');        // the always-present out
    }
  });

  it('never leaks telemetry into Mommy\'s copy (no "day N", no /10, no state tokens)', () => {
    for (const s of ALL_STATES) {
      const order = composeMommyOrder(ctx({ arousalState: s, denialDay: 12 }), { arousalValue: 9 });
      const copy = `${order.command} ${order.stipulation}`;
      expect(copy).not.toMatch(/\bday\s*\d/i);
      expect(copy).not.toMatch(/\d+\s*\/\s*10/);
      expect(copy).not.toContain(s); // raw state enum token never surfaces
    }
  });
});

describe('composeMommyOrder — stays inside the container', () => {
  it('never orders a spent/recovering body into goon/denial/edge', () => {
    for (const s of ['post_release', 'recovery'] as ArousalState[]) {
      const order = composeMommyOrder(ctx({ arousalState: s, denialDay: 20 }));
      expect(['goon', 'denial', 'edge']).not.toContain(order.sessionType);
      // rest-state order reads soft
      expect(order.command.toLowerCase()).toMatch(/rest|be with me|follow my voice/);
    }
  });

  it('a hungry, long-denied state gets a commanding intense order', () => {
    const order = composeMommyOrder(ctx({ arousalState: 'sweet_spot', denialDay: 16 }), { arousalValue: 9 });
    // top rec in deep sweet-spot/high-denial is goon/conditioning/denial — all commanding
    expect(['goon', 'denial', 'conditioning', 'edge']).toContain(order.sessionType);
    expect(order.command).toMatch(/tonight/i);
  });
});

describe('composeMommyOrder — target-aware', () => {
  it('weaves the active target claim into a conditioning order', () => {
    const target: FocusTarget = { title: 'Locked is home', claim: 'Locked is the normal state.' };
    // force a conditioning-leaning context (sweet spot, mid denial, morning)
    const order = composeMommyOrder(
      ctx({ arousalState: 'sweet_spot', denialDay: 4, timeOfDay: 'morning' }),
      { focusTarget: target },
    );
    if (order.sessionType === 'conditioning') {
      expect(order.command).toContain(target.claim);
    } else {
      // any non-conditioning order still names what tonight is about
      expect(order.command.toLowerCase()).toContain(target.title.toLowerCase());
    }
  });
});
