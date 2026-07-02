// Wardrobe gap analysis with the canonical vocabulary (FEM §6, mig 638).
//
// The legacy LEVEL_REQUIREMENTS used category strings the mig-623 DB CHECK
// forbids ('bra', 'top', 'leggings', 'shoes_heels', 'wig', 'jewelry',
// 'scent') — gap analysis compared inventory against categories that could
// never exist, reporting phantom gaps forever. Regression: seed one item
// per canonical category → level-2 gaps are EXACTLY the true shortfalls.

import { describe, it, expect } from 'vitest';
import { computeWardrobeGaps, LEVEL_REQUIREMENTS } from '../../lib/conditioning/wardrobe-system';
import {
  WARDROBE_CATEGORIES,
  LEGACY_CATEGORY_MAP,
  normalizeWardrobeCategory,
  attrsMatch,
} from '../../lib/wardrobe/categories';

describe('canonical category vocabulary', () => {
  it('is the mig 623 18-value set', () => {
    expect(WARDROBE_CATEGORIES).toHaveLength(18);
    expect(WARDROBE_CATEGORIES).toContain('hosiery');
    expect(WARDROBE_CATEGORIES).toContain('panties');
  });

  it('every legacy value maps to a canonical value', () => {
    for (const [legacy, target] of Object.entries(LEGACY_CATEGORY_MAP)) {
      expect(WARDROBE_CATEGORIES, `${legacy} → ${target}`).toContain(target);
      expect(WARDROBE_CATEGORIES).not.toContain(legacy);
    }
  });

  it('normalizeWardrobeCategory: canonical passthrough, legacy mapped, unknown → other', () => {
    expect(normalizeWardrobeCategory('bras')).toBe('bras');
    expect(normalizeWardrobeCategory('bra')).toBe('bras');
    expect(normalizeWardrobeCategory('shoes_heels')).toBe('shoes');
    expect(normalizeWardrobeCategory('mystery_garment')).toBe('other');
  });

  it('every LEVEL_REQUIREMENTS category is canonical', () => {
    for (const reqs of Object.values(LEVEL_REQUIREMENTS)) {
      for (const req of reqs) {
        expect(WARDROBE_CATEGORIES).toContain(req.category);
      }
    }
  });
});

describe('attrsMatch', () => {
  it('missing attrs fail a predicate (an unflagged shoe is not a heel)', () => {
    expect(attrsMatch({}, { heel: true })).toBe(false);
    expect(attrsMatch(undefined, { heel: true })).toBe(false);
    expect(attrsMatch({ heel: true }, { heel: true })).toBe(true);
    expect(attrsMatch({ heel: false }, { heel: true })).toBe(false);
  });
  it('no predicate always matches', () => {
    expect(attrsMatch(undefined, undefined)).toBe(true);
  });
});

describe('computeWardrobeGaps — canonical seed regression', () => {
  // One item per canonical category.
  const oneOfEach = WARDROBE_CATEGORIES.map(category => ({ category, attrs: {} }));

  it('level 2: gaps are EXACTLY the true shortfalls', () => {
    // Level-2 requirements: panties×3, bras×2, tops×3, bottoms×2.
    // Owning exactly one of each → shortfalls on all four, nothing else.
    const gaps = computeWardrobeGaps(oneOfEach, 2);
    const byCat = Object.fromEntries(gaps.map(g => [g.category, g]));
    expect(Object.keys(byCat).sort()).toEqual(['bottoms', 'bras', 'panties', 'tops']);
    expect(byCat.panties).toMatchObject({ needed: 3, have: 1 });
    expect(byCat.bras).toMatchObject({ needed: 2, have: 1 });
    expect(byCat.tops).toMatchObject({ needed: 3, have: 1 });
    expect(byCat.bottoms).toMatchObject({ needed: 2, have: 1 });
    // None of the phantom legacy categories can appear.
    for (const g of gaps) {
      expect(Object.keys(LEGACY_CATEGORY_MAP)).not.toContain(g.category);
    }
  });

  it('level 1 satisfied by 3 panties → zero gaps', () => {
    const items = [{ category: 'panties', attrs: {} }, { category: 'panties', attrs: {} }, { category: 'panties', attrs: {} }];
    expect(computeWardrobeGaps(items, 1)).toEqual([]);
  });

  it('legacy-category inventory rows still count via normalization', () => {
    // Rows written before the 638 data UPDATE (or by a stale writer).
    const items = [
      { category: 'bra', attrs: {} }, { category: 'bra', attrs: {} },
      { category: 'top', attrs: {} }, { category: 'top', attrs: {} }, { category: 'top', attrs: {} },
      { category: 'leggings', attrs: {} }, { category: 'leggings', attrs: {} },
      { category: 'underwear', attrs: {} }, { category: 'panties', attrs: {} }, { category: 'panties', attrs: {} },
    ];
    const gaps = computeWardrobeGaps(items, 2);
    // bras 2/2 ok, tops 3/3 ok, bottoms 2/2 ok (leggings→bottoms).
    // panties: 'underwear' is canonical-distinct → only 2 panties → gap.
    expect(gaps.map(g => g.category)).toEqual(['panties']);
  });

  it('level 4 heels requirement counts ONLY shoes with attr heel:true', () => {
    const base = WARDROBE_CATEGORIES.flatMap(category => [
      { category, attrs: {} }, { category, attrs: {} }, { category, attrs: {} },
    ]);
    const gapsNoHeels = computeWardrobeGaps(base, 4);
    const heelGap = gapsNoHeels.find(g => g.category === 'heels');
    expect(heelGap).toBeDefined();
    expect(heelGap).toMatchObject({ needed: 1, have: 0, urgency: 'critical' });

    const withHeels = [...base, { category: 'shoes', attrs: { heel: true } }];
    const gapsWithHeels = computeWardrobeGaps(withHeels, 4);
    expect(gapsWithHeels.find(g => g.category === 'heels')).toBeUndefined();
  });

  it('requirements accumulate across levels (max minCount wins)', () => {
    const gaps = computeWardrobeGaps([], 5);
    const panties = gaps.find(g => g.category === 'panties');
    expect(panties?.needed).toBe(5); // level-5 requirement, not level-1's 3
  });
});
