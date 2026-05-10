// difficulty-band tests — pure helpers + hard-rule invariants.

import { describe, it, expect } from 'vitest';
import {
  effectiveBand,
  bandMantraCeiling,
  bandTouchCapMultiplier,
  bandPrescriptionCadenceCeiling,
  bandGaslightIntensity,
  bandPublicDareWeight,
  evaluateBand,
  bumpBand,
  dropBand,
  BAND_ORDER,
} from '../../lib/difficulty/band';
import {
  isWithinWindow,
  variantForPhase,
  tonightWindowStart,
} from '../../lib/bedtime/ritual';

describe('difficulty band — effective resolution', () => {
  it('override always wins over current_difficulty_band', () => {
    expect(effectiveBand({ current_difficulty_band: 'cruel', override_band: 'gentle' })).toBe('gentle');
    expect(effectiveBand({ current_difficulty_band: 'recovery', override_band: 'firm' })).toBe('firm');
  });

  it('falls back to gentle for null state', () => {
    expect(effectiveBand(null)).toBe('gentle');
    expect(effectiveBand(undefined)).toBe('gentle');
  });

  it('uses current band when override_band is null', () => {
    expect(effectiveBand({ current_difficulty_band: 'cruel', override_band: null })).toBe('cruel');
  });
});

describe('difficulty band — recovery floor invariant', () => {
  it('recovery hard-caps mantra ceiling to gentle', () => {
    expect(bandMantraCeiling('recovery')).toBe('gentle');
  });

  it('recovery short-circuits gaslight to off regardless of stored intensity', () => {
    for (const stored of ['off', 'gentle', 'firm', 'cruel'] as const) {
      expect(bandGaslightIntensity(stored, 'recovery')).toBe('off');
    }
  });

  it('recovery halves the touch task cap multiplier', () => {
    expect(bandTouchCapMultiplier('recovery')).toBe(0.5);
  });

  it('recovery forces prescription cadence ceiling to occasional', () => {
    expect(bandPrescriptionCadenceCeiling('recovery')).toBe('occasional');
  });

  it('recovery zeros public-dare weight', () => {
    expect(bandPublicDareWeight('recovery')).toBe(0);
  });
});

describe('difficulty band — escalation math', () => {
  it('high compliance + 7-day streak bumps one band', () => {
    const r = evaluateBand('gentle', { compliancePct14d: 92, slipCount14d: 0, streakDays: 8 });
    expect(r.next).toBe('firm');
    expect(r.changed).toBe(true);
    expect(r.reason).toBe('bumped:high_compliance');
  });

  it('low compliance drops one band', () => {
    const r = evaluateBand('cruel', { compliancePct14d: 40, slipCount14d: 1, streakDays: 0 });
    expect(r.next).toBe('firm');
    expect(r.changed).toBe(true);
    expect(r.reason).toBe('dropped:low_compliance');
  });

  it('slip spike drops one band even with high compliance', () => {
    const r = evaluateBand('cruel', { compliancePct14d: 90, slipCount14d: 5, streakDays: 8 });
    expect(r.next).toBe('firm');
    expect(r.reason).toBe('dropped:slip_spike');
  });

  it('mid-range compliance + no spike → stable', () => {
    const r = evaluateBand('firm', { compliancePct14d: 70, slipCount14d: 2, streakDays: 3 });
    expect(r.next).toBe('firm');
    expect(r.changed).toBe(false);
  });

  it('movement is capped to one band per pass', () => {
    expect(bumpBand('gentle')).toBe('firm');
    expect(bumpBand('firm')).toBe('cruel');
    expect(bumpBand('cruel')).toBe('cruel'); // ceiling
    expect(dropBand('cruel')).toBe('firm');
    expect(dropBand('recovery')).toBe('recovery'); // floor
  });

  it('BAND_ORDER goes recovery → gentle → firm → cruel', () => {
    expect(BAND_ORDER).toEqual(['recovery', 'gentle', 'firm', 'cruel']);
  });
});

describe('difficulty band — gaslight ceiling demotion', () => {
  it('firm band demotes stored cruel to firm', () => {
    expect(bandGaslightIntensity('cruel', 'firm')).toBe('firm');
  });

  it('gentle band demotes stored firm/cruel to gentle', () => {
    expect(bandGaslightIntensity('firm', 'gentle')).toBe('gentle');
    expect(bandGaslightIntensity('cruel', 'gentle')).toBe('gentle');
  });

  it('cruel band leaves stored intensity untouched', () => {
    expect(bandGaslightIntensity('cruel', 'cruel')).toBe('cruel');
    expect(bandGaslightIntensity('off', 'cruel')).toBe('off');
  });
});

describe('bedtime window — math', () => {
  it('disabled window is never within', () => {
    expect(isWithinWindow({ enabled: false, start_hour: 22, end_hour: 24 }, new Date('2026-05-09T23:00:00'))).toBe(false);
  });

  it('same-day window 22:00-24:00 catches 23:00 local', () => {
    const at23 = new Date('2026-05-09T00:00:00');
    at23.setHours(23, 0, 0, 0);
    expect(isWithinWindow({ enabled: true, start_hour: 22, end_hour: 24 }, at23)).toBe(true);
  });

  it('same-day window does not catch 21:00 local', () => {
    const at21 = new Date('2026-05-09T00:00:00');
    at21.setHours(21, 0, 0, 0);
    expect(isWithinWindow({ enabled: true, start_hour: 22, end_hour: 24 }, at21)).toBe(false);
  });

  it('wrap window 22-26 catches 01:00 local (next day)', () => {
    const at1 = new Date('2026-05-09T00:00:00');
    at1.setHours(1, 0, 0, 0);
    expect(isWithinWindow({ enabled: true, start_hour: 22, end_hour: 26 }, at1)).toBe(true);
  });

  it('wrap window 22-26 does not catch 03:00 local', () => {
    const at3 = new Date('2026-05-09T00:00:00');
    at3.setHours(3, 0, 0, 0);
    expect(isWithinWindow({ enabled: true, start_hour: 22, end_hour: 26 }, at3)).toBe(false);
  });
});

describe('bedtime ritual — phase ceiling invariant', () => {
  it('phase 1 gets only the mantra step (light variant)', () => {
    expect(variantForPhase(1)).toEqual(['mantra']);
  });

  it('phase 0 also gets only the mantra step', () => {
    expect(variantForPhase(0)).toEqual(['mantra']);
  });

  it('phase 2+ gets the full sequence', () => {
    expect(variantForPhase(2)).toEqual(['mantra', 'posture', 'chastity', 'breath']);
    expect(variantForPhase(7)).toEqual(['mantra', 'posture', 'chastity', 'breath']);
  });

  it('null/undefined phase falls back to phase 1 (light variant)', () => {
    expect(variantForPhase(null)).toEqual(['mantra']);
    expect(variantForPhase(undefined)).toEqual(['mantra']);
  });
});

describe('bedtime tonightWindowStart anchors correctly across midnight', () => {
  it('22:00 window: at 23:00 today, anchor is 22:00 today', () => {
    const at23 = new Date('2026-05-09T00:00:00');
    at23.setHours(23, 0, 0, 0);
    const anchor = tonightWindowStart({ enabled: true, start_hour: 22, end_hour: 24 }, at23);
    expect(anchor.getHours()).toBe(22);
    expect(anchor.getDate()).toBe(at23.getDate());
  });

  it('22:00 window: at 01:00 next day, anchor is 22:00 yesterday', () => {
    const at1 = new Date('2026-05-09T00:00:00');
    at1.setHours(1, 0, 0, 0);
    const anchor = tonightWindowStart({ enabled: true, start_hour: 22, end_hour: 26 }, at1);
    expect(anchor.getHours()).toBe(22);
    expect(anchor.getDate()).toBe(at1.getDate() - 1);
  });
});
