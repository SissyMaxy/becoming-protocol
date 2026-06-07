// Regression for the grounded-femininity gate (user directive 2026-05-26 +
// wife/Gina): feminize toward a believable real woman, not a bimbo caricature.
// Scope is "identity grounded, bedroom stays filthy" — the drift detector must
// flag caricature language, and isIdentityDomain must EXCLUDE the erotic domains
// so the gate never touches private content.

import { describe, it, expect } from 'vitest';
import {
  detectCaricatureDrift,
  isIdentityDomain,
  EROTIC_DOMAINS,
} from '../../lib/grounded-femininity';

describe('grounded-femininity — caricature drift detector', () => {
  it('flags bimbo / signal-maxing language', () => {
    expect(detectCaricatureDrift('turn her into a bimbo').hit).toBe(true);
    expect(detectCaricatureDrift('as feminine as possible, maximum femininity').hit).toBe(true);
    expect(detectCaricatureDrift('a Barbie look').hit).toBe(true);
    expect(detectCaricatureDrift('go hyperfeminine, more is more').hit).toBe(true);
    expect(detectCaricatureDrift('dress like a pornstar for the office').hit).toBe(true);
  });

  it('does NOT flag grounded, real-woman language', () => {
    expect(detectCaricatureDrift('a paralegal\'s weekday wardrobe — slacks and a cardigan').hit).toBe(false);
    expect(detectCaricatureDrift('match the women your age at the grocery store').hit).toBe(false);
    expect(detectCaricatureDrift('a soft natural lip for daytime').hit).toBe(false);
    expect(detectCaricatureDrift('').hit).toBe(false);
    expect(detectCaricatureDrift(null).hit).toBe(false);
  });

  it('returns the matched marker labels', () => {
    const r = detectCaricatureDrift('full bimbo barbie mode');
    expect(r.markers).toContain('bimbo');
    expect(r.markers).toContain('barbie');
  });
});

describe('grounded-femininity — identity vs erotic domain split', () => {
  it('treats arousal / chastity / conditioning as erotic (grounding excluded)', () => {
    expect(isIdentityDomain('arousal')).toBe(false);
    expect(isIdentityDomain('chastity')).toBe(false);
    expect(isIdentityDomain('conditioning')).toBe(false);
    expect(EROTIC_DOMAINS.has('arousal')).toBe(true);
  });

  it('treats presentation domains as identity (grounding applies)', () => {
    for (const d of ['voice', 'style', 'makeup', 'movement', 'body_language', 'identity', 'inner_narrative', 'wigs']) {
      expect(isIdentityDomain(d)).toBe(true);
    }
  });

  it('defaults unknown / null domains to grounded (fail toward the directive)', () => {
    expect(isIdentityDomain(null)).toBe(true);
    expect(isIdentityDomain(undefined)).toBe(true);
    expect(isIdentityDomain('something_new')).toBe(true);
  });
});
