// Unit tests for the wardrobe-prescription selector.
//
// The selector is a pure function — phase + ownedTypes + recentlyPrescribed
// → ItemType — so no DB, no edge runtime needed. Vitest happy path.
//
// The module under test lives in supabase/functions/ but has no Deno
// imports of its own; it's importable as plain TS.

import { describe, it, expect } from 'vitest';
import {
  PHASE_VOCAB,
  pickItemType,
  formatBudgetHint,
  INTENSITY_RANK,
  type Phase,
} from '../../../supabase/functions/mommy-prescribe/selector';

describe('PHASE_VOCAB', () => {
  it('covers all 7 phases', () => {
    for (const p of [1, 2, 3, 4, 5, 6, 7] as Phase[]) {
      expect(PHASE_VOCAB[p]).toBeDefined();
      expect(PHASE_VOCAB[p].allowed.length).toBeGreaterThan(0);
    }
  });

  it('phase 1 has no presentational items (no heels / no wig / no corset)', () => {
    expect(PHASE_VOCAB[1].allowed).not.toContain('shoes_heels');
    expect(PHASE_VOCAB[1].allowed).not.toContain('wig');
    expect(PHASE_VOCAB[1].allowed).not.toContain('corset');
    expect(PHASE_VOCAB[1].allowed).not.toContain('dress');
  });

  it('phase 7 unlocks the full presentational set', () => {
    expect(PHASE_VOCAB[7].allowed).toContain('dress');
    expect(PHASE_VOCAB[7].allowed).toContain('shoes_heels');
    expect(PHASE_VOCAB[7].allowed).toContain('wig');
    expect(PHASE_VOCAB[7].allowed).toContain('corset');
  });

  it('every allowed item has a hint', () => {
    for (const p of [1, 2, 3, 4, 5, 6, 7] as Phase[]) {
      const v = PHASE_VOCAB[p];
      // Either an explicit hint, or pickItemType's fallback humanizer.
      // Either way pickItemType returns a non-empty hint string.
      const ownedNothing = new Set<string>();
      const recentlyNone = new Set<string>();
      // Force each allowed type to be picked individually by leaving
      // only it in the eligible pool: own everything else.
      for (const target of v.allowed) {
        const owned = new Set(v.allowed.filter(t => t !== target));
        const pick = pickItemType(p, owned, recentlyNone);
        expect(pick).not.toBeNull();
        expect(pick!.itemType).toBe(target);
        expect(pick!.hint.length).toBeGreaterThan(2);
      }
      // Calm the unused-set lint.
      expect(ownedNothing).toBeInstanceOf(Set);
    }
  });
});

describe('pickItemType', () => {
  it('picks from the fresh tier when one exists', () => {
    const phase: Phase = 3;
    const owned = new Set<string>(); // owns nothing
    const recent = new Set<string>(['underwear']); // recently prescribed
    const pick = pickItemType(phase, owned, recent, () => 0);
    expect(pick).not.toBeNull();
    expect(pick!.itemType).not.toBe('underwear');
    // Must be one of phase 3's allowed items minus 'underwear'
    const fresh = PHASE_VOCAB[phase].allowed.filter(t => t !== 'underwear');
    expect(fresh).toContain(pick!.itemType);
  });

  it('falls back to owned-not-recent when fresh is empty', () => {
    const phase: Phase = 1;
    // Own everything in phase 1
    const owned = new Set<string>(PHASE_VOCAB[1].allowed);
    const recent = new Set<string>(); // none recent
    const pick = pickItemType(phase, owned, recent, () => 0);
    expect(pick).not.toBeNull();
    expect(PHASE_VOCAB[1].allowed).toContain(pick!.itemType);
  });

  it('falls back to allowed[] last resort when fresh and owned-not-recent both empty', () => {
    const phase: Phase = 1;
    // Own everything AND recently prescribed everything
    const owned = new Set<string>(PHASE_VOCAB[1].allowed);
    const recent = new Set<string>(PHASE_VOCAB[1].allowed);
    const pick = pickItemType(phase, owned, recent, () => 0);
    expect(pick).not.toBeNull();
    expect(PHASE_VOCAB[1].allowed).toContain(pick!.itemType);
  });

  it('returns null for an out-of-range phase', () => {
    // The selector is type-narrow at compile time, but defensive at
    // runtime — bad phase via type assertion shouldn't crash.
    const out = pickItemType(99 as unknown as Phase, new Set(), new Set());
    expect(out).toBeNull();
  });

  it('rng seed determines pick (deterministic)', () => {
    const phase: Phase = 4;
    const a = pickItemType(phase, new Set(), new Set(), () => 0);
    const b = pickItemType(phase, new Set(), new Set(), () => 0);
    expect(a).toEqual(b);
  });
});

describe('formatBudgetHint', () => {
  it('returns null when no cap', () => {
    expect(formatBudgetHint(null)).toBeNull();
    expect(formatBudgetHint(undefined)).toBeNull();
    expect(formatBudgetHint(0)).toBeNull();
  });

  it('renders a plain-language cap', () => {
    expect(formatBudgetHint(80)).toBe('keep it under $80');
    expect(formatBudgetHint(99.5)).toBe('keep it under $100');
  });
});

describe('INTENSITY_RANK', () => {
  it('orders the canonical levels low → high', () => {
    expect(INTENSITY_RANK.gentle).toBeLessThan(INTENSITY_RANK.moderate);
    expect(INTENSITY_RANK.moderate).toBeLessThan(INTENSITY_RANK.firm);
    expect(INTENSITY_RANK.firm).toBeLessThan(INTENSITY_RANK.relentless);
    // 'off' is below all
    expect(INTENSITY_RANK.off).toBeLessThan(INTENSITY_RANK.gentle);
  });
});
