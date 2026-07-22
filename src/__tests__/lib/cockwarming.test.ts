import { describe, it, expect } from 'vitest';
import { warmingTierForRung, warmingHoldTargetSeconds } from '../../lib/conditioning/cockwarming';

describe('cockwarming helpers (WS3)', () => {
  it('maps the first warm holds to gentle, the deeper ones to firm', () => {
    expect(warmingTierForRung(1)).toBe('gentle');
    expect(warmingTierForRung(2)).toBe('gentle');
    expect(warmingTierForRung(3)).toBe('firm');
    expect(warmingTierForRung(4)).toBe('firm');
    expect(warmingTierForRung(5)).toBe('firm');
    // Never 'cruel' — cockwarming is tender.
    for (let r = 1; r <= 5; r++) expect(warmingTierForRung(r)).not.toBe('cruel');
  });

  it('grows the hold target per rung and never goes below the first rung', () => {
    expect(warmingHoldTargetSeconds(1)).toBe(300);
    expect(warmingHoldTargetSeconds(2)).toBe(600);
    expect(warmingHoldTargetSeconds(3)).toBe(900);
    expect(warmingHoldTargetSeconds(4)).toBe(1200);
    expect(warmingHoldTargetSeconds(5)).toBe(1200);
    expect(warmingHoldTargetSeconds(99)).toBe(300); // unknown rung → floor
  });

  it('hold target is monotonic non-decreasing across the ladder', () => {
    for (let r = 1; r < 5; r++) {
      expect(warmingHoldTargetSeconds(r + 1)).toBeGreaterThanOrEqual(warmingHoldTargetSeconds(r));
    }
  });
});
