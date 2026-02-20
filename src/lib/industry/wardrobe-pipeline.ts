/**
 * Wardrobe Pipeline — Sprint 6 (Addendum A6)
 * Milestone-triggered wardrobe tier system.
 * Revenue milestones unlock wardrobe purchases as protocol tasks.
 *
 * Tier 0: Current (meUndies, cage, leggings)
 * Tier 1 ($50 revenue): Babydoll, thigh-highs, choker
 * Tier 2 ($200 revenue): Second lingerie, garter, heels, wig
 * Tier 3 ($500 revenue): Corset, crop tops, makeup set
 */

import { supabase } from '../supabase';
import type { WardrobeItem, WardrobeCategory, DbWardrobeItem } from '../../types/industry';
import { mapWardrobeItem } from '../../types/industry';

// ============================================
// Tier Definitions
// ============================================

export interface WardrobeTier {
  tier: number;
  name: string;
  revenueThresholdCents: number;
  items: WardrobeTierItem[];
  contentTypesUnlocked: string[];
}

interface WardrobeTierItem {
  itemName: string;
  category: WardrobeCategory;
  estimatedCostCents: number;
  purchaseUrl?: string;
  notes?: string;
}

export const WARDROBE_TIERS: WardrobeTier[] = [
  {
    tier: 0,
    name: 'Current',
    revenueThresholdCents: 0,
    items: [
      { itemName: 'meUndies basics', category: 'lingerie', estimatedCostCents: 0 },
      { itemName: 'Cage', category: 'accessories', estimatedCostCents: 0 },
      { itemName: 'Leggings', category: 'bottoms', estimatedCostCents: 0 },
    ],
    contentTypesUnlocked: ['cage_check', 'progress_photo'],
  },
  {
    tier: 1,
    name: 'First Investment',
    revenueThresholdCents: 5000, // $50
    items: [
      { itemName: 'Babydoll nightie', category: 'lingerie', estimatedCostCents: 2500 },
      { itemName: 'Thigh-high stockings', category: 'hosiery', estimatedCostCents: 1500 },
      { itemName: 'Choker', category: 'accessories', estimatedCostCents: 1200 },
    ],
    contentTypesUnlocked: ['photo_set', 'outfit_of_day'],
  },
  {
    tier: 2,
    name: 'Building the Wardrobe',
    revenueThresholdCents: 20000, // $200
    items: [
      { itemName: 'Second lingerie set', category: 'lingerie', estimatedCostCents: 3500 },
      { itemName: 'Garter belt + stockings', category: 'hosiery', estimatedCostCents: 2500 },
      { itemName: 'Heels (beginner)', category: 'shoes', estimatedCostCents: 3000 },
      { itemName: 'First wig', category: 'wigs', estimatedCostCents: 4000 },
    ],
    contentTypesUnlocked: ['tease_video', 'short_video'],
  },
  {
    tier: 3,
    name: 'Professional',
    revenueThresholdCents: 50000, // $500
    items: [
      { itemName: 'Corset', category: 'lingerie', estimatedCostCents: 5000 },
      { itemName: 'Crop tops (2-3)', category: 'tops', estimatedCostCents: 3000 },
      { itemName: 'Makeup starter set', category: 'makeup', estimatedCostCents: 8000 },
    ],
    contentTypesUnlocked: ['edge_capture', 'toy_showcase'],
  },
];

// ============================================
// Tier Unlocking
// ============================================

/**
 * Check which wardrobe tiers are unlocked based on revenue.
 */
export function getUnlockedTier(totalRevenueCents: number): number {
  let maxTier = 0;
  for (const tier of WARDROBE_TIERS) {
    if (totalRevenueCents >= tier.revenueThresholdCents) {
      maxTier = tier.tier;
    }
  }
  return maxTier;
}

/**
 * Check if a new tier was just unlocked and seed its items.
 */
export async function checkAndUnlockTier(
  userId: string,
  totalRevenueCents: number,
): Promise<WardrobeItem[]> {
  const unlockedTier = getUnlockedTier(totalRevenueCents);

  // Get existing inventory
  const { data: existing } = await supabase
    .from('wardrobe_inventory')
    .select('tier')
    .eq('user_id', userId);

  const existingTiers = new Set((existing ?? []).map(r => r.tier));
  const newItems: WardrobeItem[] = [];

  // Seed items for newly unlocked tiers
  for (let t = 0; t <= unlockedTier; t++) {
    if (existingTiers.has(t)) continue;

    const tierDef = WARDROBE_TIERS.find(td => td.tier === t);
    if (!tierDef) continue;

    for (const item of tierDef.items) {
      const { data, error } = await supabase
        .from('wardrobe_inventory')
        .insert({
          user_id: userId,
          item_name: item.itemName,
          category: item.category,
          tier: t,
          estimated_cost_cents: item.estimatedCostCents,
          purchase_url: item.purchaseUrl ?? null,
          unlocked_by_milestone: `revenue_${tierDef.revenueThresholdCents}`,
          content_types_enabled: tierDef.contentTypesUnlocked,
          purchased: t === 0, // Tier 0 items are already owned
          purchased_at: t === 0 ? new Date().toISOString() : null,
          notes: item.notes ?? null,
        })
        .select()
        .single();

      if (!error && data) {
        newItems.push(mapWardrobeItem(data as DbWardrobeItem));
      }
    }
  }

  return newItems;
}

// ============================================
// Inventory Management
// ============================================

/**
 * Get all wardrobe items for a user.
 */
export async function getWardrobe(
  userId: string,
  tier?: number,
): Promise<WardrobeItem[]> {
  let query = supabase
    .from('wardrobe_inventory')
    .select('*')
    .eq('user_id', userId)
    .order('tier', { ascending: true });

  if (tier !== undefined) {
    query = query.eq('tier', tier);
  }

  const { data, error } = await query;
  if (error || !data) return [];
  return data.map((r: DbWardrobeItem) => mapWardrobeItem(r));
}

/**
 * Mark a wardrobe item as purchased.
 */
export async function markPurchased(
  userId: string,
  itemId: string,
): Promise<boolean> {
  const { error } = await supabase
    .from('wardrobe_inventory')
    .update({
      purchased: true,
      purchased_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('id', itemId);

  return !error;
}

/**
 * Get unpurchased items (shopping list).
 */
export async function getShoppingList(userId: string): Promise<WardrobeItem[]> {
  const { data, error } = await supabase
    .from('wardrobe_inventory')
    .select('*')
    .eq('user_id', userId)
    .eq('purchased', false)
    .order('tier', { ascending: true });

  if (error || !data) return [];
  return data.map((r: DbWardrobeItem) => mapWardrobeItem(r));
}

/**
 * Get wardrobe stats.
 */
export async function getWardrobeStats(userId: string): Promise<{
  totalItems: number;
  purchasedItems: number;
  unpurchasedItems: number;
  currentTier: number;
  totalInvestedCents: number;
}> {
  const items = await getWardrobe(userId);
  const purchased = items.filter(i => i.purchased);
  const maxTier = items.length > 0 ? Math.max(...items.map(i => i.tier)) : 0;
  const invested = purchased.reduce((sum, i) => sum + (i.estimatedCostCents ?? 0), 0);

  return {
    totalItems: items.length,
    purchasedItems: purchased.length,
    unpurchasedItems: items.length - purchased.length,
    currentTier: maxTier,
    totalInvestedCents: invested,
  };
}

/**
 * Build context for Handler AI prompts.
 */
export async function buildWardrobeContext(userId: string): Promise<string> {
  try {
    const stats = await getWardrobeStats(userId);
    if (stats.totalItems === 0) return '';

    const parts = [`WARDROBE: tier ${stats.currentTier}, ${stats.purchasedItems}/${stats.totalItems} items owned`];
    if (stats.unpurchasedItems > 0) {
      parts.push(`${stats.unpurchasedItems} items on shopping list ($${(stats.totalInvestedCents / 100).toFixed(0)} invested)`);
    }
    return parts.join(' | ');
  } catch {
    return '';
  }
}
