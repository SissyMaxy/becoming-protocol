/**
 * Pure tests for the mantra selector. No DB, no LLM. Validates that:
 * 1. Phase gate excludes mantras outside [phase_min, phase_max]
 * 2. Intensity ceiling is respected (gentle user → never firm/cruel)
 * 3. Affect-tagged mantras get higher score
 * 4. Recent deliveries are down-weighted but not excluded
 * 5. Empty / over-filtered catalogs return null cleanly
 */

import { describe, it, expect } from 'vitest';
import {
  pickMantra, filterEligible, scoreMantra, intensityAllowed, phaseToMantraScale,
  type MantraRow, type MantraSelectContext,
} from '../../lib/persona/mantra-select';

const m = (id: string, overrides: Partial<MantraRow> = {}): MantraRow => ({
  id,
  text: `mantra ${id}`,
  affect_tags: [],
  phase_min: 1,
  phase_max: 7,
  intensity_tier: 'gentle',
  category: 'identity',
  ...overrides,
});

const baseCtx = (overrides: Partial<MantraSelectContext> = {}): MantraSelectContext => ({
  affect: 'patient',
  phase: 3,
  intensity: 'firm',
  ...overrides,
});

describe('intensityAllowed', () => {
  it('gentle ceiling allows only gentle', () => {
    expect(intensityAllowed('gentle', 'gentle')).toBe(true);
    expect(intensityAllowed('firm', 'gentle')).toBe(false);
    expect(intensityAllowed('cruel', 'gentle')).toBe(false);
  });
  it('firm ceiling allows gentle + firm', () => {
    expect(intensityAllowed('gentle', 'firm')).toBe(true);
    expect(intensityAllowed('firm', 'firm')).toBe(true);
    expect(intensityAllowed('cruel', 'firm')).toBe(false);
  });
  it('cruel ceiling allows everything', () => {
    expect(intensityAllowed('gentle', 'cruel')).toBe(true);
    expect(intensityAllowed('firm', 'cruel')).toBe(true);
    expect(intensityAllowed('cruel', 'cruel')).toBe(true);
  });
});

describe('filterEligible — phase gate', () => {
  it('drops mantras whose phase_min > current phase', () => {
    const catalog = [
      m('a', { phase_min: 1, phase_max: 2 }),
      m('b', { phase_min: 3, phase_max: 5 }),
      m('c', { phase_min: 6, phase_max: 7 }),
    ];
    const out = filterEligible(catalog, baseCtx({ phase: 4 }));
    expect(out.map(r => r.id)).toEqual(['b']);
  });

  it('drops mantras whose phase_max < current phase', () => {
    const catalog = [m('a', { phase_min: 1, phase_max: 2 }), m('b', { phase_min: 3, phase_max: 7 })];
    expect(filterEligible(catalog, baseCtx({ phase: 5 })).map(r => r.id)).toEqual(['b']);
  });

  it('boundary phase_min == phase is included', () => {
    const catalog = [m('a', { phase_min: 5, phase_max: 7 })];
    expect(filterEligible(catalog, baseCtx({ phase: 5 })).map(r => r.id)).toEqual(['a']);
  });
});

describe('filterEligible — intensity gate', () => {
  it('gentle ceiling drops firm/cruel mantras entirely', () => {
    const catalog = [
      m('a', { intensity_tier: 'gentle' }),
      m('b', { intensity_tier: 'firm' }),
      m('c', { intensity_tier: 'cruel' }),
    ];
    const out = filterEligible(catalog, baseCtx({ intensity: 'gentle' }));
    expect(out.map(r => r.id)).toEqual(['a']);
  });

  it('firm ceiling drops cruel only', () => {
    const catalog = [
      m('a', { intensity_tier: 'gentle' }),
      m('b', { intensity_tier: 'firm' }),
      m('c', { intensity_tier: 'cruel' }),
    ];
    const out = filterEligible(catalog, baseCtx({ intensity: 'firm' }));
    expect(out.map(r => r.id).sort()).toEqual(['a', 'b']);
  });

  it('cruel ceiling keeps everything', () => {
    const catalog = [
      m('a', { intensity_tier: 'gentle' }),
      m('b', { intensity_tier: 'firm' }),
      m('c', { intensity_tier: 'cruel' }),
    ];
    expect(filterEligible(catalog, baseCtx({ intensity: 'cruel' })).length).toBe(3);
  });
});

describe('scoreMantra — affect match', () => {
  it('affect-tag match yields a higher score than no match', () => {
    const tagged = m('a', { affect_tags: ['hungry'] });
    const untagged = m('b', { affect_tags: [] });
    const ctx = baseCtx({ affect: 'hungry' });
    expect(scoreMantra(tagged, ctx)).toBeGreaterThan(scoreMantra(untagged, ctx));
  });

  it('non-matching affect leaves score at base', () => {
    const tagged = m('a', { affect_tags: ['hungry'] });
    const ctx = baseCtx({ affect: 'patient' });
    // No multiplier — score equals base for the tier
    expect(scoreMantra(tagged, ctx)).toBe(3); // gentle = 3
  });
});

describe('scoreMantra — recency penalty', () => {
  it('a recently-delivered mantra scores far below an unseen peer', () => {
    const a = m('a', { intensity_tier: 'gentle' });
    const b = m('b', { intensity_tier: 'gentle' });
    const now = Date.now();
    const ctx = baseCtx({
      now,
      recentlyDelivered: { a: new Date(now).toISOString() },
      dedupWindowDays: 7,
    });
    expect(scoreMantra(b, ctx)).toBeGreaterThan(scoreMantra(a, ctx) * 10);
  });

  it('a delivery older than the window has no penalty', () => {
    const a = m('a');
    const now = Date.now();
    const old = new Date(now - 30 * 86_400_000).toISOString();
    const fresh = baseCtx({ now });
    const stale = baseCtx({ now, recentlyDelivered: { a: old }, dedupWindowDays: 7 });
    expect(scoreMantra(a, stale)).toBe(scoreMantra(a, fresh));
  });
});

describe('pickMantra — invariants', () => {
  it('returns null on empty catalog', () => {
    expect(pickMantra([], baseCtx())).toBeNull();
  });

  it('returns null when nothing passes the gates', () => {
    const catalog = [m('a', { phase_min: 6, phase_max: 7, intensity_tier: 'cruel' })];
    expect(pickMantra(catalog, baseCtx({ phase: 1, intensity: 'gentle' }))).toBeNull();
  });

  it('NEVER picks outside the phase range — over many trials', () => {
    const catalog = [
      m('low', { phase_min: 1, phase_max: 2 }),
      m('mid', { phase_min: 3, phase_max: 4 }),
      m('hi',  { phase_min: 5, phase_max: 7 }),
    ];
    let i = 0;
    const rng = () => (i++ * 0.137) % 1;
    for (let t = 0; t < 200; t++) {
      const picked = pickMantra(catalog, baseCtx({ phase: 3, intensity: 'cruel', rng }))!;
      expect(picked).not.toBeNull();
      expect(picked.id).toBe('mid');
    }
  });

  it('NEVER picks outside the intensity ceiling — over many trials', () => {
    const catalog = [
      m('g', { intensity_tier: 'gentle' }),
      m('f', { intensity_tier: 'firm' }),
      m('c', { intensity_tier: 'cruel' }),
    ];
    let i = 0;
    const rng = () => (i++ * 0.291) % 1;
    for (let t = 0; t < 200; t++) {
      const picked = pickMantra(catalog, baseCtx({ intensity: 'gentle', rng }))!;
      expect(picked).not.toBeNull();
      expect(picked.intensity_tier).toBe('gentle');
    }
  });

  it('biases toward affect-tagged when ties on phase / tier', () => {
    const catalog = [
      m('untagged-1', { affect_tags: [] }),
      m('untagged-2', { affect_tags: [] }),
      m('untagged-3', { affect_tags: [] }),
      m('tagged',     { affect_tags: ['hungry'] }),
    ];
    const counts: Record<string, number> = {};
    let i = 0;
    const rng = () => (i++ * 0.0173) % 1;
    for (let t = 0; t < 1000; t++) {
      const p = pickMantra(catalog, baseCtx({ affect: 'hungry', rng }))!;
      counts[p.id] = (counts[p.id] ?? 0) + 1;
    }
    // Tagged mantra has 4× weight; with three untagged peers it should
    // win between 1/2 and 3/4 of the time. Loose bound for stability.
    expect(counts.tagged).toBeGreaterThan(400);
  });

  it('strongly prefers a non-recent peer over a just-delivered one', () => {
    const fresh = m('fresh', { intensity_tier: 'gentle' });
    const stale = m('stale', { intensity_tier: 'gentle' });
    const now = Date.now();
    let i = 0;
    const rng = () => (i++ * 0.211) % 1;
    let staleWins = 0;
    for (let t = 0; t < 500; t++) {
      const ctx = baseCtx({
        now,
        recentlyDelivered: { stale: new Date(now).toISOString() },
        dedupWindowDays: 7,
        rng,
      });
      const p = pickMantra([fresh, stale], ctx)!;
      if (p.id === 'stale') staleWins++;
    }
    // stale gets ~0.02× weight; fresh wins overwhelmingly
    expect(staleWins).toBeLessThan(50);
  });
});

describe('phaseToMantraScale', () => {
  it('maps 0..5 → 1..6', () => {
    expect(phaseToMantraScale(0)).toBe(1);
    expect(phaseToMantraScale(2)).toBe(3);
    expect(phaseToMantraScale(5)).toBe(6);
  });
  it('clamps out-of-range values into 1..6', () => {
    expect(phaseToMantraScale(-2)).toBe(1);
    expect(phaseToMantraScale(99)).toBe(6);
  });
  it('handles null / undefined as phase 1', () => {
    expect(phaseToMantraScale(null)).toBe(1);
    expect(phaseToMantraScale(undefined)).toBe(1);
  });
});
