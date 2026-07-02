// Canonical fem-domain vocabulary + alias map coverage (FEM §1, mig 635).
//
// Pins three invariants:
//  1. Every alias target is a canonical domain (an alias that maps to a
//     non-canonical value would fail the DB CHECK silently downstream).
//  2. The full legacy LLM vocabulary (the old prescriber prompt's domains)
//     resolves through normalizeFemDomain — no row can miss the
//     skipRatePenalty keying again.
//  3. The Deno copy (supabase/functions/_shared/fem-domains.ts) is
//     identical to the src copy — the insert-site backstop and the client
//     reader must never drift.

import { describe, it, expect } from 'vitest';
import {
  CANONICAL_FEM_DOMAINS,
  DOMAIN_ALIASES,
  EVIDENCE_KIND_BY_DOMAIN,
  normalizeFemDomain,
} from '../../lib/conditioning/fem-domains';
import {
  CANONICAL_FEM_DOMAINS as EDGE_CANONICAL,
  DOMAIN_ALIASES as EDGE_ALIASES,
  EVIDENCE_KIND_BY_DOMAIN as EDGE_EVIDENCE,
  normalizeFemDomain as edgeNormalize,
} from '../../../supabase/functions/_shared/fem-domains';

describe('canonical fem domains', () => {
  it('is the task_bank vocabulary (16) + mantra', () => {
    expect(CANONICAL_FEM_DOMAINS).toHaveLength(17);
    expect(CANONICAL_FEM_DOMAINS).toContain('mantra');
    expect(CANONICAL_FEM_DOMAINS).toContain('voice');
    expect(CANONICAL_FEM_DOMAINS).toContain('inner_narrative');
  });

  it('every alias target is canonical', () => {
    for (const [alias, target] of Object.entries(DOMAIN_ALIASES)) {
      expect(CANONICAL_FEM_DOMAINS, `alias ${alias} → ${target}`).toContain(target);
    }
  });

  it('no alias shadows a canonical value', () => {
    for (const alias of Object.keys(DOMAIN_ALIASES)) {
      expect(CANONICAL_FEM_DOMAINS).not.toContain(alias);
    }
  });

  it('covers the full legacy LLM prescriber vocabulary', () => {
    // The old prompt taught: voice, body, wardrobe, ritual, exposure,
    // denial, conditioning, mantra, photo, confession.
    const legacy = ['voice', 'body', 'wardrobe', 'ritual', 'exposure', 'denial', 'conditioning', 'mantra', 'photo', 'confession'];
    for (const d of legacy) {
      const normalized = normalizeFemDomain(d);
      expect(CANONICAL_FEM_DOMAINS, `legacy ${d} → ${normalized}`).toContain(normalized);
    }
    expect(normalizeFemDomain('body')).toBe('exercise');
    expect(normalizeFemDomain('wardrobe')).toBe('style');
    expect(normalizeFemDomain('photo')).toBe('identity');
    expect(normalizeFemDomain('ritual')).toBe('inner_narrative');
  });

  it('canonical values pass through unchanged; unknown falls back safely', () => {
    for (const d of CANONICAL_FEM_DOMAINS) {
      expect(normalizeFemDomain(d)).toBe(d);
    }
    expect(CANONICAL_FEM_DOMAINS).toContain(normalizeFemDomain('totally_made_up'));
  });

  it('every canonical domain has an evidence contract', () => {
    for (const d of CANONICAL_FEM_DOMAINS) {
      expect(['photo', 'voice', 'measurement', 'timer', 'text', 'none']).toContain(EVIDENCE_KIND_BY_DOMAIN[d]);
    }
  });
});

describe('src ≡ edge copy parity', () => {
  it('canonical lists match exactly', () => {
    expect([...EDGE_CANONICAL]).toEqual([...CANONICAL_FEM_DOMAINS]);
  });

  it('alias maps match exactly', () => {
    expect(EDGE_ALIASES).toEqual(DOMAIN_ALIASES);
  });

  it('evidence contracts match exactly', () => {
    expect(EDGE_EVIDENCE).toEqual(EVIDENCE_KIND_BY_DOMAIN);
  });

  it('normalizers agree on the legacy vocabulary', () => {
    for (const d of ['body', 'wardrobe', 'photo', 'ritual', 'exposure', 'denial', 'confession', 'voice', 'garbage']) {
      expect(edgeNormalize(d)).toBe(normalizeFemDomain(d));
    }
  });
});
