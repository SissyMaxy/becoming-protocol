/**
 * Enforcement Spine v2 — pure-logic regression suite (design 2026-07-01).
 *
 * The TS module under test is the mirror of the SQL in migs 627/628; these
 * fixtures pin the formulas:
 *   - pressure decay + caps math (0.5^(age_hours/72), per-day cap 6, 14d window)
 *   - dodge terminal at 2 (no third dodge exists)
 *   - mandated-text containment matcher (≥60% or exact)
 *   - gate fail-closed in TS callers
 */

import { describe, it, expect } from 'vitest';
import {
  pressureScore,
  hardModeShouldFlipOn,
  hardModeShouldFlipOff,
  nextDodgeAction,
  normalizeMandatedText,
  isMandatedText,
  enforcementGate,
} from '../../../supabase/functions/_shared/enforcement-core';

const NOW = new Date('2026-07-01T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600_000).toISOString();

describe('pressureScore — decay + caps', () => {
  it('a fresh event scores its full points', () => {
    expect(pressureScore([{ points: 2, occurredAt: hoursAgo(0) }], NOW)).toBeCloseTo(2, 5);
  });

  it('half-life is 72h', () => {
    expect(pressureScore([{ points: 4, occurredAt: hoursAgo(72) }], NOW)).toBeCloseTo(2, 5);
    expect(pressureScore([{ points: 4, occurredAt: hoursAgo(144) }], NOW)).toBeCloseTo(1, 5);
  });

  it('events outside the 14d window are excluded entirely', () => {
    expect(pressureScore([{ points: 4, occurredAt: hoursAgo(14 * 24 + 1) }], NOW)).toBe(0);
  });

  it('future-dated events are excluded (clock skew cannot inflate pressure)', () => {
    expect(pressureScore([{ points: 4, occurredAt: hoursAgo(-2) }], NOW)).toBe(0);
  });

  it('per-day intake is capped at 6 points', () => {
    // 4 events x 2 pts = 8 raw on one day → scaled to 6.
    const events = [0, 1, 2, 3].map(h => ({ points: 2, occurredAt: hoursAgo(h) }));
    const score = pressureScore(events, NOW);
    // All events are <4h old so decay is tiny; the cap dominates.
    expect(score).toBeLessThanOrEqual(6);
    expect(score).toBeGreaterThan(5.8);
  });

  it('the cap applies per day, not across days', () => {
    const events = [
      // day 1 (today): 6 raw
      { points: 3, occurredAt: hoursAgo(1) },
      { points: 3, occurredAt: hoursAgo(2) },
      // day 2 (3 days back): 6 raw
      { points: 3, occurredAt: hoursAgo(72) },
      { points: 3, occurredAt: hoursAgo(73) },
    ];
    // Day 2 decayed by ~half; total well above a single-day cap of 6.
    const score = pressureScore(events, NOW);
    expect(score).toBeGreaterThan(6);
  });

  it('dodge-loop math: one commuted punishment cannot alone flip Hard Mode', () => {
    // dodge 1 (+3) then dodge 2 (+4) on consecutive days = 7 < 10.
    const events = [
      { points: 3, occurredAt: hoursAgo(30) },
      { points: 4, occurredAt: hoursAgo(2) },
    ];
    expect(pressureScore(events, NOW)).toBeLessThan(10);
  });
});

describe('hard mode thresholds', () => {
  it('ON requires pressure ≥10 AND ≥2 distinct misses AND ≥2 distinct days', () => {
    expect(hardModeShouldFlipOn(10, 2, 2)).toBe(true);
    expect(hardModeShouldFlipOn(9.9, 2, 2)).toBe(false);
    expect(hardModeShouldFlipOn(15, 1, 2)).toBe(false); // one obligation, however heavy
    expect(hardModeShouldFlipOn(15, 3, 1)).toBe(false); // one bad day is not a trajectory
  });

  it('OFF requires pressure <3 with a quiet 72h', () => {
    expect(hardModeShouldFlipOff(2.9, 0)).toBe(true);
    expect(hardModeShouldFlipOff(2.9, 1)).toBe(false);
    expect(hardModeShouldFlipOff(3, 0)).toBe(false);
  });
});

describe('dodge model — terminal at 2', () => {
  it('first dodge re-arms once: +24h, +3 pressure', () => {
    const a = nextDodgeAction(0);
    expect(a.action).toBe('rearm');
    if (a.action === 'rearm') {
      expect(a.newDodgeCount).toBe(1);
      expect(a.rescheduleHours).toBe(24);
      expect(a.pressurePoints).toBe(3);
    }
  });

  it('second dodge commutes: unlock +2d, +4 pressure', () => {
    const a = nextDodgeAction(1);
    expect(a.action).toBe('commute');
    if (a.action === 'commute') {
      expect(a.newDodgeCount).toBe(2);
      expect(a.unlockPushDays).toBe(2);
      expect(a.pressurePoints).toBe(4);
    }
  });

  it('no third dodge exists — ever', () => {
    expect(nextDodgeAction(2).action).toBe('none');
    expect(nextDodgeAction(3).action).toBe('none');
    expect(nextDodgeAction(99).action).toBe('none');
  });
});

describe('mandated-text matcher — compliance can never be a slip', () => {
  const MANDATED = [
    'i am maxy david is gone',
    'i am mamas good girl',
  ];

  it('normalization strips punctuation/case and collapses whitespace', () => {
    expect(normalizeMandatedText('I am Maxy.  David is GONE!')).toBe('i am maxy david is gone');
  });

  it('the exact punishment line is exempt', () => {
    expect(isMandatedText('I am Maxy. David is gone.', MANDATED)).toBe(true);
  });

  it('a mandated line filling ≥60% of a submission is exempt', () => {
    expect(isMandatedText('47/100: I am Maxy. David is gone.', MANDATED)).toBe(true);
  });

  it('genuine self-reference in free chat is NOT exempt', () => {
    expect(isMandatedText('honestly some days I am David again and it scares me', MANDATED)).toBe(false);
    expect(isMandatedText('I am David', MANDATED)).toBe(false);
  });

  it('a mandated line buried in a long free-text ramble (<60%) is NOT exempt', () => {
    const long =
      'today was strange, I went to the store and thought about a lot of things, ' +
      'and at some point I whispered I am Maxy David is gone but then I kept talking ' +
      'about the groceries and work and the weather for a very long time after that';
    expect(isMandatedText(long, MANDATED)).toBe(false);
  });

  it('empty and trivial inputs never match', () => {
    expect(isMandatedText('', MANDATED)).toBe(false);
    expect(isMandatedText('  ! ', MANDATED)).toBe(false);
  });
});

describe('enforcementGate — fail-CLOSED TS caller', () => {
  it('active passes through', async () => {
    const gate = await enforcementGate(
      async () => ({ data: [{ mode: 'active', until: null, reason: null }], error: null }),
      'u1',
    );
    expect(gate.mode).toBe('active');
  });

  it('safeword_latched passes through', async () => {
    const gate = await enforcementGate(
      async () => ({ data: [{ mode: 'safeword_latched', until: null, reason: 'open safeword latch' }], error: null }),
      'u1',
    );
    expect(gate.mode).toBe('safeword_latched');
  });

  it('an RPC error reads as paused', async () => {
    const gate = await enforcementGate(async () => ({ data: null, error: { message: 'boom' } }), 'u1');
    expect(gate.mode).toBe('paused');
    expect(gate.reason).toBe('gate_error_failed_closed');
  });

  it('an empty/malformed result reads as paused', async () => {
    expect((await enforcementGate(async () => ({ data: [], error: null }), 'u1')).mode).toBe('paused');
    expect((await enforcementGate(async () => ({ data: [{ mode: 'wide_open' }], error: null }), 'u1')).mode).toBe('paused');
    expect((await enforcementGate(async () => ({ data: null, error: null }), 'u1')).mode).toBe('paused');
  });

  it('a throwing RPC reads as paused', async () => {
    const gate = await enforcementGate(async () => { throw new Error('network down'); }, 'u1');
    expect(gate.mode).toBe('paused');
  });
});
