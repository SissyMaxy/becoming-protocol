import { describe, it, expect } from 'vitest';
import { biasByPreference } from '../../lib/conditioning/goon-session';

describe('biasByPreference (WS2 preference-ordered goon content)', () => {
  const items = [
    { id: 'a', category: 'humiliation' },
    { id: 'b', category: 'cock_worship' },
    { id: 'c', category: 'sissy' },
    { id: 'd', category: null },
  ];

  it('is the identity sort when no preferences are known', () => {
    expect(biasByPreference(items, new Set()).map((x) => x.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('floats preferred categories to the front, stable otherwise', () => {
    const pref = new Set(['cock_worship']);
    expect(biasByPreference(items, pref).map((x) => x.id)).toEqual(['b', 'a', 'c', 'd']);
  });

  it('matches case-insensitively and preserves relative order of matches', () => {
    const pref = new Set(['sissy', 'humiliation']);
    // a (humiliation) and c (sissy) both preferred → keep their original order.
    expect(biasByPreference(items, pref).map((x) => x.id)).toEqual(['a', 'c', 'b', 'd']);
  });

  it('never drops or duplicates items', () => {
    const out = biasByPreference(items, new Set(['cock_worship']));
    expect(out).toHaveLength(items.length);
    expect(new Set(out.map((x) => x.id)).size).toBe(items.length);
  });
});
