/**
 * Wardrobe Inventory System
 *
 * The Handler knows what she owns. Prescriptions are built from actual items,
 * not generic descriptions. Gaps are identified and purchase directives issued.
 *
 * Tables: wardrobe_inventory, user_state, skill_levels, fund_transactions
 */

import { supabase } from '../supabase';
import { getHiddenParam } from './hidden-operations';
import { getFundBalance } from '../handler-engines/auto-purchase';
import {
  attrsMatch,
  normalizeWardrobeCategory,
  type WardrobeRequirement,
} from '../wardrobe/categories';

// ============================================
// TYPES
// ============================================

export interface WardrobeItem {
  id: string;
  userId: string;
  itemName: string;
  category: string;
  /** attrs jsonb (mig 638): {"heel":true,"color":"...","fem_level":1-5} */
  attrs: Record<string, unknown>;
  femininityLevel: number;
  stealthSafe: boolean;
  publicSafe: boolean;
  color: string | null;
  size: string | null;
  brand: string | null;
  photoUrl: string | null;
  purchaseDate: string | null;
  purchasePriceCents: number | null;
  timesWorn: number;
  lastWornAt: string | null;
  condition: string;
  handlerNotes: string | null;
  favorite: boolean;
  createdAt: string;
}

export interface WardrobeGap {
  category: string;
  needed: number;
  have: number;
  urgency: 'critical' | 'moderate' | 'low';
}

export interface WardrobeAnalysis {
  gaps: WardrobeGap[];
  totalItems: number;
  totalValueCents: number;
}

export interface PrescribedOutfit {
  items: { itemId: string; itemName: string; category: string }[];
  description: string;
  photoRequired: boolean;
  femininityLevel: number;
}

interface NewWardrobeItem {
  itemName: string;
  category: string;
  attrs?: Record<string, unknown>;
  femininityLevel?: number;
  stealthSafe?: boolean;
  publicSafe?: boolean;
  color?: string;
  size?: string;
  brand?: string;
  photoUrl?: string;
  purchaseDate?: string;
  purchasePriceCents?: number;
  condition?: string;
  handlerNotes?: string;
  favorite?: boolean;
}

// ============================================
// LEVEL REQUIREMENTS
// ============================================

// Canonical vocabulary (mig 623 CHECK) with attr predicates — the legacy
// list used category strings ('bra','top','leggings','shoes_heels','wig',
// 'jewelry','scent') that the DB CHECK forbids, so gap analysis compared
// inventory against categories that could never exist and reported
// phantom gaps forever. Heels are shoes+{heel:true}, not a category.
export const LEVEL_REQUIREMENTS: Record<number, WardrobeRequirement[]> = {
  1: [{ category: 'panties', minCount: 3 }],
  2: [
    { category: 'panties', minCount: 3 },
    { category: 'bras', minCount: 2 },
    { category: 'tops', minCount: 3 },
    { category: 'bottoms', minCount: 2 },
  ],
  3: [
    { category: 'panties', minCount: 3 },
    { category: 'bras', minCount: 2 },
    { category: 'tops', minCount: 3 },
    { category: 'bottoms', minCount: 2 },
    { category: 'dresses', minCount: 2 },
    { category: 'skirts', minCount: 2 },
    { category: 'accessories', minCount: 2 },
  ],
  4: [
    { category: 'panties', minCount: 3 },
    { category: 'bras', minCount: 2 },
    { category: 'tops', minCount: 3 },
    { category: 'dresses', minCount: 2 },
    { category: 'skirts', minCount: 2 },
    { category: 'shoes', minCount: 2 },
    { category: 'shoes', minCount: 1, attr: { heel: true }, label: 'heels' },
    { category: 'accessories', minCount: 3 },
    { category: 'wigs', minCount: 1 },
  ],
  5: [
    { category: 'panties', minCount: 5 },
    { category: 'bras', minCount: 3 },
    { category: 'tops', minCount: 4 },
    { category: 'dresses', minCount: 3 },
    { category: 'skirts', minCount: 2 },
    { category: 'shoes', minCount: 3 },
    { category: 'shoes', minCount: 2, attr: { heel: true }, label: 'heels' },
    { category: 'accessories', minCount: 4 },
    { category: 'wigs', minCount: 1 },
    { category: 'makeup', minCount: 2 },
    { category: 'other', minCount: 1, label: 'scent' },
  ],
};

// ============================================
// CORE FUNCTIONS
// ============================================

/**
 * List wardrobe items, optionally filtered by category.
 */
export async function getWardrobe(
  userId: string,
  category?: string,
): Promise<WardrobeItem[]> {
  let query = supabase
    .from('wardrobe_inventory')
    .select('*')
    .eq('user_id', userId)
    .order('category')
    .order('femininity_level', { ascending: false });

  if (category) {
    query = query.eq('category', category);
  }

  const { data } = await query;
  if (!data) return [];
  return data.map(mapDbToItem);
}

/**
 * Add item to wardrobe inventory. The category is normalized to the
 * canonical (mig 623) vocabulary before insert — legacy values used to
 * fail the DB CHECK silently because the error was never read. Now the
 * error is destructured and thrown so no add can silently vanish again.
 */
export async function addWardrobeItem(
  userId: string,
  item: NewWardrobeItem,
): Promise<WardrobeItem | null> {
  const canonical = normalizeWardrobeCategory(item.category);
  const attrs: Record<string, unknown> = { ...(item.attrs ?? {}) };
  // Preserve heel-ness when a legacy shoes_heels value collapses to shoes.
  if (item.category === 'shoes_heels') attrs.heel = true;

  const { data, error } = await supabase
    .from('wardrobe_inventory')
    .insert({
      user_id: userId,
      item_name: item.itemName,
      category: canonical,
      attrs,
      femininity_level: item.femininityLevel ?? 3,
      stealth_safe: item.stealthSafe ?? false,
      public_safe: item.publicSafe ?? false,
      color: item.color ?? null,
      size: item.size ?? null,
      brand: item.brand ?? null,
      photo_url: item.photoUrl ?? null,
      purchase_date: item.purchaseDate ?? null,
      purchase_price_cents: item.purchasePriceCents ?? null,
      condition: item.condition ?? 'good',
      handler_notes: item.handlerNotes ?? null,
      favorite: item.favorite ?? false,
    })
    .select('*')
    .single();

  if (error) {
    console.error('[wardrobe] addWardrobeItem insert failed:', error.message);
    // attrs column may predate mig 638 — retry once without it.
    if (/attrs/.test(error.message)) {
      const { data: d2, error: e2 } = await supabase
        .from('wardrobe_inventory')
        .insert({
          user_id: userId,
          item_name: item.itemName,
          category: canonical,
          femininity_level: item.femininityLevel ?? 3,
          stealth_safe: item.stealthSafe ?? false,
          public_safe: item.publicSafe ?? false,
          color: item.color ?? null,
          size: item.size ?? null,
          brand: item.brand ?? null,
          photo_url: item.photoUrl ?? null,
          purchase_date: item.purchaseDate ?? null,
          purchase_price_cents: item.purchasePriceCents ?? null,
          condition: item.condition ?? 'good',
          handler_notes: item.handlerNotes ?? null,
          favorite: item.favorite ?? false,
        })
        .select('*')
        .single();
      if (e2) throw new Error(`wardrobe add failed: ${e2.message}`);
      return d2 ? mapDbToItem(d2) : null;
    }
    throw new Error(`wardrobe add failed: ${error.message}`);
  }

  return data ? mapDbToItem(data) : null;
}

/**
 * Pure gap computation — canonical categories + attr predicates. Exported
 * for the regression test: seed one item per canonical category, level-2
 * gaps must be EXACTLY the true shortfalls (no phantom legacy categories).
 */
export function computeWardrobeGaps(
  items: Array<{ category: string; attrs?: Record<string, unknown> | null }>,
  level: number,
): WardrobeGap[] {
  const effectiveLevel = Math.min(5, Math.max(1, level));

  // Accumulate requirements level 1..effectiveLevel; key = category + attr
  // predicate so "heels" (shoes+{heel:true}) tracks separately from shoes.
  const merged = new Map<string, WardrobeRequirement>();
  for (let lvl = 1; lvl <= effectiveLevel; lvl++) {
    for (const req of LEVEL_REQUIREMENTS[lvl] ?? []) {
      const key = `${req.category}:${JSON.stringify(req.attr ?? null)}`;
      const existing = merged.get(key);
      if (!existing || req.minCount > existing.minCount) merged.set(key, req);
    }
  }

  const gaps: WardrobeGap[] = [];
  for (const req of merged.values()) {
    const have = items.filter(i =>
      normalizeWardrobeCategory(i.category) === req.category &&
      attrsMatch(i.attrs ?? undefined, req.attr),
    ).length;
    if (have < req.minCount) {
      const deficit = req.minCount - have;
      const urgency: WardrobeGap['urgency'] =
        have === 0 ? 'critical' : deficit >= 2 ? 'moderate' : 'low';
      gaps.push({ category: req.label ?? req.category, needed: req.minCount, have, urgency });
    }
  }

  const urgencyOrder = { critical: 0, moderate: 1, low: 2 };
  gaps.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);
  return gaps;
}

/**
 * Analyze wardrobe gaps vs what the current skill level requires.
 */
export async function getWardrobeGaps(userId: string): Promise<WardrobeAnalysis> {
  const [items, skillRes] = await Promise.all([
    getWardrobe(userId),
    supabase
      .from('skill_levels')
      .select('current_level')
      .eq('user_id', userId)
      .eq('domain', 'style')
      .maybeSingle(),
  ]);

  const styleLevel = skillRes.data?.current_level ?? 1;
  let totalValueCents = 0;
  for (const item of items) {
    if (item.purchasePriceCents) totalValueCents += item.purchasePriceCents;
  }

  const gaps = computeWardrobeGaps(items, styleLevel);
  return { gaps, totalItems: items.length, totalValueCents };
}

/**
 * Prescribe a specific outfit from actual wardrobe items.
 * Unlike the old generic prescription, this picks ACTUAL ITEMS.
 */
export async function prescribeSpecificOutfit(
  userId: string,
): Promise<PrescribedOutfit | null> {
  const [items, stateRes, skillRes, explicitness] = await Promise.all([
    getWardrobe(userId),
    supabase
      .from('user_state')
      .select('denial_day, gina_home')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('skill_levels')
      .select('current_level')
      .eq('user_id', userId)
      .eq('domain', 'style')
      .maybeSingle(),
    getHiddenParam(userId, 'content_explicitness_tier'),
  ]);

  if (items.length === 0) return null;

  const denialDay = stateRes.data?.denial_day ?? 0;
  const isGinaHome = stateRes.data?.gina_home ?? false;
  const styleLevel = skillRes.data?.current_level ?? 1;
  const denialBoost = Math.floor(denialDay / 2);
  const explicitnessBoost = Math.floor(explicitness / 2);
  const targetFem = Math.min(5, Math.max(1, styleLevel + denialBoost + explicitnessBoost));

  // Filter by context constraints
  const available = items.filter((item) => {
    if (isGinaHome && !item.stealthSafe) return false;
    if (item.condition === 'replace') return false;
    return true;
  });

  if (available.length === 0) return null;

  // Selection helper: pick best item from canonical category (+ optional
  // attr predicate), favoring variety + femininity match
  const pick = (category: string | string[], attr?: Record<string, boolean | number | string>): WardrobeItem | null => {
    const cats = (Array.isArray(category) ? category : [category]).map(normalizeWardrobeCategory);
    const pool = available.filter((i) =>
      cats.includes(normalizeWardrobeCategory(i.category)) && attrsMatch(i.attrs, attr));
    if (pool.length === 0) return null;

    // Score: prefer items near target femininity, deprioritize recently worn
    const now = Date.now();
    const scored = pool.map((item) => {
      const femDiff = Math.abs(item.femininityLevel - targetFem);
      const femScore = (5 - femDiff) * 10;
      const wornDaysAgo = item.lastWornAt
        ? Math.floor((now - new Date(item.lastWornAt).getTime()) / 86400000)
        : 30; // never worn = treat as 30 days ago
      const varietyScore = Math.min(wornDaysAgo, 14) * 2;
      const favoriteBonus = item.favorite ? 5 : 0;
      return { item, score: femScore + varietyScore + favoriteBonus };
    });

    scored.sort((a, b) => b.score - a.score);
    // Add some randomness: pick from top 3
    const top = scored.slice(0, Math.min(3, scored.length));
    return top[Math.floor(Math.random() * top.length)]!.item;
  };

  const selected: WardrobeItem[] = [];
  const addPick = (cats: string | string[], attr?: Record<string, boolean | number | string>) => {
    const item = pick(cats, attr);
    if (item) selected.push(item);
  };

  // Core outfit pieces (canonical vocabulary — mig 623)
  addPick(['panties', 'underwear']);
  addPick('bras');

  // Either dress or top+bottom
  const dress = pick('dresses');
  if (dress && targetFem >= 3) {
    selected.push(dress);
  } else {
    addPick('tops');
    addPick(['bottoms', 'skirts']);
  }

  // Shoes — heels are shoes+{heel:true}, an attr, not a category
  if (targetFem >= 4) {
    addPick('shoes', { heel: true });
  } else {
    addPick('shoes');
  }

  // Accessories
  addPick('accessories');
  if (targetFem >= 4) addPick('wigs');

  // Build description
  const itemDescriptions = selected.map(
    (i) => `${i.category}: ${i.itemName}${i.color ? ` (${i.color})` : ''}`,
  );

  return {
    items: selected.map((i) => ({
      itemId: i.id,
      itemName: i.itemName,
      category: i.category,
    })),
    description: itemDescriptions.join(' | '),
    photoRequired: targetFem >= 2,
    femininityLevel: targetFem,
  };
}

/**
 * Record that items were worn. Increments times_worn, updates last_worn_at.
 */
export async function recordOutfitWorn(
  userId: string,
  itemIds: string[],
): Promise<void> {
  const now = new Date().toISOString();

  // Read-then-write pattern for incrementing
  const { data: items } = await supabase
    .from('wardrobe_inventory')
    .select('id, times_worn')
    .eq('user_id', userId)
    .in('id', itemIds);

  if (!items || items.length === 0) return;

  const updates = items.map((item) =>
    supabase
      .from('wardrobe_inventory')
      .update({
        times_worn: (item.times_worn ?? 0) + 1,
        last_worn_at: now,
        updated_at: now,
      })
      .eq('id', item.id),
  );

  await Promise.all(updates);
}

/**
 * Build handler context block for wardrobe system.
 */
export async function buildWardrobeContext(userId: string): Promise<string> {
  try {
    const [items, analysis, outfit] = await Promise.all([
      getWardrobe(userId),
      getWardrobeGaps(userId),
      prescribeSpecificOutfit(userId),
    ]);

    if (items.length === 0) {
      return '## Wardrobe\nWARDROBE EMPTY. Maxy has not logged any feminine items. DIRECTIVE: "I need to know what you own. List every feminine item — underwear, tops, bottoms, shoes, accessories, everything."';
    }

    // Count by category
    const counts: Record<string, number> = {};
    for (const item of items) {
      counts[item.category] = (counts[item.category] ?? 0) + 1;
    }

    const countParts = Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .map(([cat, n]) => `${n} ${cat}`)
      .join(', ');

    const lines: string[] = [`## Wardrobe`];
    lines.push(
      `WARDROBE: ${items.length} items (${countParts}). Value: $${(analysis.totalValueCents / 100).toFixed(0)}.`,
    );

    // Gaps
    if (analysis.gaps.length > 0) {
      const gapStr = analysis.gaps
        .map((g) => `${g.category} (${g.have}/${g.needed}, ${g.urgency})`)
        .join(', ');
      lines.push(`GAPS: ${gapStr}`);
    }

    // Check stealth context
    const { data: stateRow } = await supabase
      .from('user_state')
      .select('gina_home')
      .eq('user_id', userId)
      .maybeSingle();

    const stealthRequired = stateRow?.gina_home ?? false;

    // Today's prescribed outfit
    if (outfit) {
      const outfitStr = outfit.items.map((i) => `${i.category}: ${i.itemName}`).join(', ');
      lines.push(
        `TODAY'S OUTFIT (L${outfit.femininityLevel}): ${outfitStr}. Photo required: ${outfit.photoRequired ? 'YES' : 'no'}. Stealth required: ${stealthRequired ? 'YES (Gina home)' : 'no'}.`,
      );
    }

    // Auto-purchase directive
    if (analysis.gaps.length > 0) {
      const fund = await getFundBalance(userId).catch(() => ({
        balance: 0,
        totalInvested: 0,
        lastPurchaseAt: null,
      }));
      const criticalGaps = analysis.gaps.filter((g) => g.urgency === 'critical');
      if (criticalGaps.length > 0 && fund.balance > 2000) {
        const topGap = criticalGaps[0]!;
        lines.push(
          `AUTO-PURCHASE DIRECTIVE: Fund balance $${(fund.balance / 100).toFixed(0)}. Priority purchase: ${topGap.category} (0 owned). Issue purchase directive.`,
        );
      }
    }

    return lines.join('\n');
  } catch {
    return '';
  }
}

// ============================================
// HELPERS
// ============================================

function mapDbToItem(row: Record<string, unknown>): WardrobeItem {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    itemName: row.item_name as string,
    category: normalizeWardrobeCategory(row.category as string),
    attrs: (row.attrs as Record<string, unknown>) ?? {},
    femininityLevel: (row.femininity_level as number) ?? 3,
    stealthSafe: (row.stealth_safe as boolean) ?? false,
    publicSafe: (row.public_safe as boolean) ?? false,
    color: (row.color as string) ?? null,
    size: (row.size as string) ?? null,
    brand: (row.brand as string) ?? null,
    photoUrl: (row.photo_url as string) ?? null,
    purchaseDate: (row.purchase_date as string) ?? null,
    purchasePriceCents: (row.purchase_price_cents as number) ?? null,
    timesWorn: (row.times_worn as number) ?? 0,
    lastWornAt: (row.last_worn_at as string) ?? null,
    condition: (row.condition as string) ?? 'good',
    handlerNotes: (row.handler_notes as string) ?? null,
    favorite: (row.favorite as boolean) ?? false,
    createdAt: row.created_at as string,
  };
}
