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
import { getFundBalance } from '../handler-v2/auto-purchase';

// ============================================
// TYPES
// ============================================

export interface WardrobeItem {
  id: string;
  userId: string;
  itemName: string;
  category: string;
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

const LEVEL_REQUIREMENTS: Record<number, { category: string; minCount: number }[]> = {
  1: [{ category: 'underwear', minCount: 3 }],
  2: [
    { category: 'underwear', minCount: 3 },
    { category: 'bra', minCount: 2 },
    { category: 'top', minCount: 3 },
    { category: 'leggings', minCount: 2 },
  ],
  3: [
    { category: 'underwear', minCount: 3 },
    { category: 'bra', minCount: 2 },
    { category: 'top', minCount: 3 },
    { category: 'leggings', minCount: 2 },
    { category: 'dress', minCount: 2 },
    { category: 'skirt', minCount: 2 },
    { category: 'accessories', minCount: 2 },
  ],
  4: [
    { category: 'underwear', minCount: 3 },
    { category: 'bra', minCount: 2 },
    { category: 'top', minCount: 3 },
    { category: 'dress', minCount: 2 },
    { category: 'skirt', minCount: 2 },
    { category: 'shoes_flats', minCount: 1 },
    { category: 'shoes_heels', minCount: 1 },
    { category: 'jewelry', minCount: 3 },
    { category: 'wig', minCount: 1 },
    { category: 'accessories', minCount: 2 },
  ],
  5: [
    { category: 'underwear', minCount: 5 },
    { category: 'bra', minCount: 3 },
    { category: 'top', minCount: 4 },
    { category: 'dress', minCount: 3 },
    { category: 'skirt', minCount: 2 },
    { category: 'shoes_flats', minCount: 1 },
    { category: 'shoes_heels', minCount: 2 },
    { category: 'jewelry', minCount: 4 },
    { category: 'wig', minCount: 1 },
    { category: 'accessories', minCount: 3 },
    { category: 'scent', minCount: 2 },
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
 * Add item to wardrobe inventory.
 */
export async function addWardrobeItem(
  userId: string,
  item: NewWardrobeItem,
): Promise<WardrobeItem | null> {
  const { data } = await supabase
    .from('wardrobe_inventory')
    .insert({
      user_id: userId,
      item_name: item.itemName,
      category: item.category,
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

  return data ? mapDbToItem(data) : null;
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
  const effectiveLevel = Math.min(5, Math.max(1, styleLevel));

  // Count items per category
  const categoryCounts: Record<string, number> = {};
  let totalValueCents = 0;
  for (const item of items) {
    categoryCounts[item.category] = (categoryCounts[item.category] ?? 0) + 1;
    if (item.purchasePriceCents) totalValueCents += item.purchasePriceCents;
  }

  // Accumulate requirements from level 1 up to current level
  const allRequirements = new Map<string, number>();
  for (let lvl = 1; lvl <= effectiveLevel; lvl++) {
    const reqs = LEVEL_REQUIREMENTS[lvl];
    if (!reqs) continue;
    for (const req of reqs) {
      const existing = allRequirements.get(req.category) ?? 0;
      if (req.minCount > existing) {
        allRequirements.set(req.category, req.minCount);
      }
    }
  }

  const gaps: WardrobeGap[] = [];
  for (const [category, needed] of allRequirements) {
    const have = categoryCounts[category] ?? 0;
    if (have < needed) {
      const deficit = needed - have;
      const urgency: WardrobeGap['urgency'] =
        have === 0 ? 'critical' : deficit >= 2 ? 'moderate' : 'low';
      gaps.push({ category, needed, have, urgency });
    }
  }

  // Sort: critical first, then moderate, then low
  const urgencyOrder = { critical: 0, moderate: 1, low: 2 };
  gaps.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);

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

  // Selection helper: pick best item from category, favoring variety + femininity match
  const pick = (category: string | string[]): WardrobeItem | null => {
    const cats = Array.isArray(category) ? category : [category];
    const pool = available.filter((i) => cats.includes(i.category));
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
  const addPick = (cats: string | string[]) => {
    const item = pick(cats);
    if (item) selected.push(item);
  };

  // Core outfit pieces
  addPick('underwear');
  addPick('bra');

  // Either dress or top+bottom
  const dress = pick('dress');
  if (dress && targetFem >= 3) {
    selected.push(dress);
  } else {
    addPick('top');
    addPick(['bottom', 'skirt', 'leggings']);
  }

  // Shoes
  if (targetFem >= 4) {
    addPick('shoes_heels');
  } else {
    addPick(['shoes_flats', 'shoes_heels']);
  }

  // Accessories
  addPick('accessories');
  if (targetFem >= 3) addPick('jewelry');
  if (targetFem >= 4) addPick('wig');

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
    category: row.category as string,
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
