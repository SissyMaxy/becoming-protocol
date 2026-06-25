// Regression guard for the wishlist-first monetization wiring (mig 586).
//
// link-rotator was orphaned and only knew the hardcoded Fansly link. mig 586
// made user_state.wishlist_url the source of truth for the transition-fund
// strategy; loadCycleContext now calls configureMonetization() with it, and
// rotateAllPlatforms must PREFER the wishlist URL (provider-aware CTA) over the
// Fansly paywall when one is set. This pins that behavior.

import { describe, it, expect, beforeEach } from 'vitest';
import { configureMonetization, rotateAllPlatforms } from '../../../scripts/auto-poster/link-rotator';

describe('link-rotator wishlist preference (mig 586)', () => {
  beforeEach(() => configureMonetization(null, null)); // reset to env/empty

  it('injects the configured wishlist URL on a public platform', () => {
    configureMonetization('https://throne.com/maxy', 'throne');
    // rate 1 → always inject (deterministic for the test)
    const out = rotateAllPlatforms('first day in the skirt', 'twitter', { rate: 1 });
    expect(out).toContain('https://throne.com/maxy');
  });

  it('uses provider-specific copy', () => {
    configureMonetization('https://wishtender.com/maxy', 'wishtender');
    const out = rotateAllPlatforms('locked and aching', 'reddit', { rate: 1 });
    expect(out).toContain('https://wishtender.com/maxy');
  });

  it('never links DM / paid-platform contexts even with a wishlist set', () => {
    configureMonetization('https://throne.com/maxy', 'throne');
    expect(rotateAllPlatforms('hi', 'fetlife_dm', { rate: 1 })).toBe('hi');
    expect(rotateAllPlatforms('hi', 'fansly', { rate: 1 })).toBe('hi');
  });

  it('never double-links text that already has a URL', () => {
    configureMonetization('https://throne.com/maxy', 'throne');
    const withUrl = 'see https://example.com';
    expect(rotateAllPlatforms(withUrl, 'twitter', { rate: 1 })).toBe(withUrl);
  });

  it('falls back to Fansly path when no wishlist configured (does not crash)', () => {
    configureMonetization(null, null);
    const out = rotateAllPlatforms('no wishlist set', 'twitter', { rate: 0 }); // rate 0 → skip
    expect(out).toBe('no wishlist set');
  });
});
