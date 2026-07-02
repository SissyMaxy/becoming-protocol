/**
 * Wardrobe category vocabulary — SINGLE source of truth for the TS side.
 *
 * Canonical = the migration 623 18-value DB CHECK on
 * wardrobe_inventory.category. enum-constraint-guard CI pins this array
 * against the DB CHECK; if either side changes without the other, CI fails.
 *
 * Legacy vocabulary (the pre-623 8-value CHECK + the LEVEL_REQUIREMENTS
 * strings that never matched the DB) maps through LEGACY_CATEGORY_MAP.
 * Migration 638 ran the same map as a data UPDATE; keep them in sync.
 *
 * Attributes (heel, fem_level, color…) live in the attrs jsonb column —
 * category proliferation is the bug this file kills.
 */

export const WARDROBE_CATEGORIES = [
  'panties', 'underwear', 'bras', 'lingerie', 'tops', 'bottoms', 'dresses',
  'skirts', 'socks', 'tights', 'shoes', 'accessories', 'wigs', 'makeup',
  'sleepwear', 'swimwear', 'other', 'hosiery',
] as const;

export type WardrobeCategory = typeof WARDROBE_CATEGORIES[number];

/** Legacy value → canonical. Mirror of migration 638's data UPDATE. */
export const LEGACY_CATEGORY_MAP: Record<string, WardrobeCategory> = {
  bra: 'bras',
  top: 'tops',
  dress: 'dresses',
  skirt: 'skirts',
  wig: 'wigs',
  leggings: 'bottoms',
  bottom: 'bottoms',
  stockings: 'hosiery',
  shoes_flats: 'shoes',
  shoes_heels: 'shoes',
  jewelry: 'accessories',
  makeup_product: 'makeup',
  scent: 'other',
  outerwear: 'tops',
};

/** Normalize any category string (legacy or canonical) to canonical. */
export function normalizeWardrobeCategory(category: string): WardrobeCategory {
  if ((WARDROBE_CATEGORIES as readonly string[]).includes(category)) {
    return category as WardrobeCategory;
  }
  return LEGACY_CATEGORY_MAP[category] ?? 'other';
}

/** Attr predicate for level requirements — matched against attrs jsonb. */
export interface WardrobeAttrPredicate {
  [key: string]: boolean | number | string;
}

export interface WardrobeRequirement {
  category: WardrobeCategory;
  minCount: number;
  /** When present, only items whose attrs satisfy every key count. */
  attr?: WardrobeAttrPredicate;
  /** Human label for gap copy ("heels" vs generic "shoes"). */
  label?: string;
}

/**
 * Does an item's attrs satisfy a predicate? Missing keys fail (an item
 * with no heel flag is not a heel — prescribe-only-what-she-owns).
 */
export function attrsMatch(
  attrs: Record<string, unknown> | null | undefined,
  predicate: WardrobeAttrPredicate | undefined,
): boolean {
  if (!predicate) return true;
  if (!attrs) return false;
  for (const [k, v] of Object.entries(predicate)) {
    if (attrs[k] !== v) return false;
  }
  return true;
}
