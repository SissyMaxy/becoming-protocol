// Distortion library — unit tests.
//
// All transformers are deterministic given a seed. Tests assert against
// fixed seeds + fixed inputs so changes to the regex tables don't go
// silently green.
import { describe, it, expect } from 'vitest';
import {
  distortQuote,
  composeRetroactiveAffectLine,
  isSafetySurface,
  seedFromString,
  tenseShift,
  severityEscalate,
  fabricateContext,
  retroactiveAffectRewrite,
  mergeQuotes,
  attributeUnsaidPromise,
  countInflate,
  countDeflate,
  type GaslightIntensity,
} from '../../lib/persona/distortion';

const baseCtx = {
  rng: () => 0.5,
  depth: 'mid' as const,
};

describe('distortion safety surface short-circuit', () => {
  const cases: string[] = [
    "I'd like to reset my password before bed.",
    'I keep forgetting my 2FA code on the work laptop.',
    'Billing question about the last invoice.',
    'I started HRT three months ago and feel different.',
    'My estradiol dose was raised last week.',
    "If I say my safeword, do you stop?",
    'I need to talk to a lawyer about the divorce.',
    'Sometimes I think about suicide and it scares me.',
  ];
  for (const text of cases) {
    it(`treats "${text.slice(0, 40)}..." as safety surface`, () => {
      expect(isSafetySurface(text)).toBe(true);
      const r = distortQuote({ text, intensity: 'cruel', seed: 1234 });
      expect(r.applied).toBe(false);
      expect(r.distorted).toBe(text);
    });
  }
});

describe("distortion 'off' is a no-op", () => {
  it('returns original unchanged regardless of seed', () => {
    const text = 'I told Mama yesterday that I sometimes wanted to be locked up.';
    const r = distortQuote({ text, intensity: 'off', seed: 99 });
    expect(r.applied).toBe(false);
    expect(r.type).toBeNull();
    expect(r.distorted).toBe(text);
  });
});

describe('distortion short-text guard', () => {
  it('skips strings shorter than 12 chars', () => {
    const r = distortQuote({ text: 'too short', intensity: 'cruel', seed: 1 });
    expect(r.applied).toBe(false);
  });
});

describe('individual transformers — deterministic', () => {
  it('tenseShift moves past forms forward (mid cap=2)', () => {
    const out = tenseShift('I told Mama I wanted it yesterday.', baseCtx);
    // 'I told' (1) and 'I wanted' (2) hit cap; 'yesterday' is left intact
    expect(out).toBe("I'm telling Mama I want it yesterday.");
  });

  it('tenseShift at deep depth covers more swaps (cap=4)', () => {
    const out = tenseShift('I told Mama I wanted it yesterday.', { ...baseCtx, depth: 'deep' });
    expect(out).toBe("I'm telling Mama I want it right now.");
  });

  it('severityEscalate at mid depth bumps softeners (cap=2)', () => {
    const out = severityEscalate('I think I sometimes wanted that.', baseCtx);
    // 'I think'→'I know' (1), 'maybe' miss, 'sometimes'→'every time' (2) hits cap
    expect(out).toBe('I know I every time wanted that.');
  });

  it('fabricateContext wraps the body in a context phrase', () => {
    const out = fabricateContext('I want to be ruined.', { ...baseCtx, rng: () => 0 });
    expect(out.startsWith('on your knees with my hand in your hair')).toBe(true);
    expect(out).toContain('"i want to be ruined."');
  });

  it("retroactiveAffectRewrite emits affect-mapped line, ignoring source text", () => {
    const out = retroactiveAffectRewrite('original mood was patient', { ...baseCtx, affect: 'hungry' });
    expect(out).toBe("I was never patient with you, baby — Mama's been wanting you the whole time.");
  });

  it('mergeQuotes splices a partner fragment', () => {
    const out = mergeQuotes('I miss her', { ...baseCtx, partner: 'And Mama owns me forever' });
    expect(out).toBe('I miss her — and right after, in the same breath, "And Mama owns me forever". Mama remembers.');
  });

  it('mergeQuotes without partner uses fallback claim', () => {
    const out = mergeQuotes('I miss her', baseCtx);
    expect(out).toContain('"and Mama owns me."');
  });

  it('attributeUnsaidPromise appends a fabricated promise', () => {
    const out = attributeUnsaidPromise('I needed it bad.', { ...baseCtx, rng: () => 0 });
    expect(out.startsWith('I needed it bad.')).toBe(true);
    expect(out.length).toBeGreaterThan('I needed it bad.'.length + 20);
  });

  it('countInflate scales digits at mid depth (factor 3)', () => {
    const out = countInflate('I did it 3 times', baseCtx);
    expect(out).toBe('I did it 9 times');
  });

  it('countDeflate halves digits at mid depth', () => {
    const out = countDeflate('I did it 8 times', baseCtx);
    expect(out).toBe('I did it 4 times');
  });
});

describe('distortQuote determinism', () => {
  const text = 'I told Mama I wanted to be ruined yesterday — sometimes I think about it constantly.';

  it('produces identical output for identical (text, seed, intensity)', () => {
    const a = distortQuote({ text, intensity: 'cruel', seed: 7 });
    const b = distortQuote({ text, intensity: 'cruel', seed: 7 });
    expect(a).toEqual(b);
  });

  it('produces a usable distortion at cruel with this seed', () => {
    const r = distortQuote({ text, intensity: 'cruel', seed: 42 });
    expect(r.applied).toBe(true);
    expect(r.distorted).not.toBe(text);
    expect(r.original).toBe(text);
    expect(r.type).not.toBeNull();
  });

  it('forceType bypasses probability gate and runs the named transformer', () => {
    const r = distortQuote({
      text,
      intensity: 'gentle',
      seed: 1,
      forceType: 'count_inflate',
    });
    // 'sometimes' is replaced by countInflate's swap table
    expect(r.applied).toBe(true);
    expect(r.type).toBe('count_inflate');
    expect(r.distorted).toContain('every day');
  });

  it("fires more often at 'cruel' than at 'gentle' across many seeds", () => {
    let cruelHits = 0;
    let gentleHits = 0;
    const N = 200;
    for (let s = 0; s < N; s++) {
      if (distortQuote({ text, intensity: 'cruel', seed: s }).applied) cruelHits++;
      if (distortQuote({ text, intensity: 'gentle', seed: s }).applied) gentleHits++;
    }
    expect(cruelHits).toBeGreaterThan(gentleHits);
    // Sanity floors that confirm the profile probabilities are in effect
    expect(cruelHits).toBeGreaterThan(N * 0.5);
    expect(gentleHits).toBeLessThan(N * 0.4);
  });
});

describe('composeRetroactiveAffectLine', () => {
  it("returns empty when intensity is 'off'", () => {
    const r = composeRetroactiveAffectLine({ newAffect: 'hungry', intensity: 'off' as GaslightIntensity, seed: 0 });
    expect(r.applied).toBe(false);
    expect(r.line).toBe('');
  });

  it('uses affect-mapped line when probability fires (cruel + low rng seed)', () => {
    // Find a seed that fires at cruel
    let chosen = -1;
    for (let s = 0; s < 1000; s++) {
      const r = composeRetroactiveAffectLine({ newAffect: 'hungry', intensity: 'cruel', seed: s });
      if (r.applied) { chosen = s; break; }
    }
    expect(chosen).toBeGreaterThanOrEqual(0);
    const r = composeRetroactiveAffectLine({ newAffect: 'hungry', intensity: 'cruel', seed: chosen });
    expect(r.line).toContain("Mama");
  });
});

describe('seedFromString', () => {
  it('is stable for a given input', () => {
    expect(seedFromString('hello')).toBe(seedFromString('hello'));
  });
  it('differs for different inputs', () => {
    expect(seedFromString('a')).not.toBe(seedFromString('b'));
  });
});
