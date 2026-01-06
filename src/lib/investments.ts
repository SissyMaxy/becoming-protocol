import { supabase } from './supabase';
import type {
  Investment,
  InvestmentInput,
  InvestmentSummary,
  DbInvestment,
  InvestmentCategory,
} from '../types/investments';
import { INVESTMENT_CATEGORIES, getCategoryDomain } from '../data/investment-categories';

// ============================================
// HELPER FUNCTIONS
// ============================================

async function getAuthUserId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No authenticated user');
  return user.id;
}

function mapDbToInvestment(db: DbInvestment): Investment {
  return {
    id: db.id,
    userId: db.user_id,
    name: db.name,
    category: db.category as InvestmentCategory,
    amount: Number(db.amount),
    currency: db.currency,
    purchaseDate: new Date(db.purchase_date),
    retailer: db.retailer || undefined,
    originalUrl: db.original_url || undefined,
    fromWishlistId: db.from_wishlist_id || undefined,
    domain: db.domain as Investment['domain'] | undefined,
    notes: db.notes || undefined,
    photoUrl: db.photo_url || undefined,
    private: db.private,
    timesUsed: db.times_used,
    lastUsedAt: db.last_used_at || undefined,
    status: db.status as Investment['status'],
    isEstimate: false,
    fromOnboarding: false,
    createdAt: new Date(db.created_at),
    updatedAt: new Date(db.updated_at),
  };
}

function mapInvestmentToDb(input: InvestmentInput, userId: string): Partial<DbInvestment> {
  return {
    user_id: userId,
    name: input.name,
    category: input.category,
    amount: input.amount,
    currency: input.currency || 'USD',
    purchase_date: input.purchaseDate,
    retailer: input.retailer || null,
    original_url: input.originalUrl || null,
    from_wishlist_id: input.fromWishlistId || null,
    domain: input.domain || getCategoryDomain(input.category) || null,
    notes: input.notes || null,
    photo_url: input.photoUrl || null,
    private: input.private ?? INVESTMENT_CATEGORIES[input.category].defaultPrivate,
    status: input.status || 'active',
  };
}

// ============================================
// CRUD OPERATIONS
// ============================================

/**
 * Add a new investment
 */
export async function addInvestment(input: InvestmentInput): Promise<Investment> {
  const userId = await getAuthUserId();
  const dbData = mapInvestmentToDb(input, userId);

  const { data, error } = await supabase
    .from('investments')
    .insert(dbData)
    .select()
    .single();

  if (error) {
    console.error('Failed to add investment:', error);
    throw error;
  }

  return mapDbToInvestment(data as DbInvestment);
}

/**
 * Get all investments for the current user
 */
export async function getInvestments(options?: {
  category?: InvestmentCategory;
  includePrivate?: boolean;
  status?: Investment['status'];
}): Promise<Investment[]> {
  const userId = await getAuthUserId();

  let query = supabase
    .from('investments')
    .select('*')
    .eq('user_id', userId)
    .order('purchase_date', { ascending: false });

  if (options?.category) {
    query = query.eq('category', options.category);
  }

  if (options?.includePrivate === false) {
    query = query.eq('private', false);
  }

  if (options?.status) {
    query = query.eq('status', options.status);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Failed to get investments:', error);
    throw error;
  }

  return (data as DbInvestment[]).map(mapDbToInvestment);
}

/**
 * Get a single investment by ID
 */
export async function getInvestment(id: string): Promise<Investment | null> {
  const userId = await getAuthUserId();

  const { data, error } = await supabase
    .from('investments')
    .select('*')
    .eq('user_id', userId)
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    console.error('Failed to get investment:', error);
    throw error;
  }

  return mapDbToInvestment(data as DbInvestment);
}

/**
 * Update an existing investment
 */
export async function updateInvestment(
  id: string,
  updates: Partial<InvestmentInput>
): Promise<Investment> {
  const userId = await getAuthUserId();

  const updateData: Partial<DbInvestment> = {};

  if (updates.name !== undefined) updateData.name = updates.name;
  if (updates.category !== undefined) {
    updateData.category = updates.category;
    // Update domain if category changed and no explicit domain set
    if (updates.domain === undefined) {
      updateData.domain = getCategoryDomain(updates.category) || null;
    }
  }
  if (updates.amount !== undefined) updateData.amount = updates.amount;
  if (updates.currency !== undefined) updateData.currency = updates.currency;
  if (updates.purchaseDate !== undefined) updateData.purchase_date = updates.purchaseDate;
  if (updates.retailer !== undefined) updateData.retailer = updates.retailer || null;
  if (updates.originalUrl !== undefined) updateData.original_url = updates.originalUrl || null;
  if (updates.domain !== undefined) updateData.domain = updates.domain || null;
  if (updates.notes !== undefined) updateData.notes = updates.notes || null;
  if (updates.photoUrl !== undefined) updateData.photo_url = updates.photoUrl || null;
  if (updates.private !== undefined) updateData.private = updates.private;
  if (updates.status !== undefined) updateData.status = updates.status;

  const { data, error } = await supabase
    .from('investments')
    .update(updateData)
    .eq('user_id', userId)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Failed to update investment:', error);
    throw error;
  }

  return mapDbToInvestment(data as DbInvestment);
}

/**
 * Delete an investment
 */
export async function deleteInvestment(id: string): Promise<void> {
  const userId = await getAuthUserId();

  const { error } = await supabase
    .from('investments')
    .delete()
    .eq('user_id', userId)
    .eq('id', id);

  if (error) {
    console.error('Failed to delete investment:', error);
    throw error;
  }
}

/**
 * Mark an investment as used (for AI tracking)
 */
export async function markInvestmentUsed(id: string): Promise<void> {
  const userId = await getAuthUserId();

  const { error } = await supabase
    .from('investments')
    .update({
      times_used: supabase.rpc('increment_times_used', { row_id: id }),
      last_used_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('id', id);

  // If RPC doesn't exist, fall back to manual increment
  if (error) {
    const { data: current } = await supabase
      .from('investments')
      .select('times_used')
      .eq('id', id)
      .single();

    await supabase
      .from('investments')
      .update({
        times_used: (current?.times_used || 0) + 1,
        last_used_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('id', id);
  }
}

// ============================================
// SUMMARY & ANALYTICS
// ============================================

/**
 * Get investment summary with totals and breakdowns
 */
export async function getInvestmentSummary(): Promise<InvestmentSummary> {
  const investments = await getInvestments({ status: 'active' });

  const byCategory: Record<InvestmentCategory, number> = {} as Record<InvestmentCategory, number>;
  let totalInvested = 0;
  let totalPrivate = 0;
  let totalVisible = 0;

  // Initialize all categories to 0
  for (const category of Object.keys(INVESTMENT_CATEGORIES) as InvestmentCategory[]) {
    byCategory[category] = 0;
  }

  for (const inv of investments) {
    totalInvested += inv.amount;
    byCategory[inv.category] += inv.amount;

    if (inv.private) {
      totalPrivate += inv.amount;
    } else {
      totalVisible += inv.amount;
    }
  }

  // Get recent purchases (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recentPurchases = investments.filter(
    (inv) => new Date(inv.purchaseDate) >= thirtyDaysAgo
  );

  // Get unused items (never used or not used in 7+ days)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const unusedItems = investments.filter((inv) => {
    if (inv.timesUsed === 0) return true;
    if (!inv.lastUsedAt) return true;
    return new Date(inv.lastUsedAt) < sevenDaysAgo;
  });

  // Count categories with at least one item
  const categoryCount = Object.values(byCategory).filter((amount) => amount > 0).length;

  return {
    totalInvested,
    totalPrivate,
    totalVisible,
    byCategory,
    itemCount: investments.length,
    recentPurchases: recentPurchases.slice(0, 5),
    unusedItems: unusedItems.slice(0, 10),
    categoryCount,
  };
}

/**
 * Get investments summary for partner view (excludes private items)
 */
export async function getInvestmentSummaryForPartner(): Promise<{
  totalInvested: number;
  hasPrivateItems: boolean;
  visibleItems: Investment[];
}> {
  const investments = await getInvestments({ status: 'active' });

  const visibleItems = investments.filter((inv) => !inv.private);
  const totalVisible = visibleItems.reduce((sum, inv) => sum + inv.amount, 0);
  const totalPrivate = investments
    .filter((inv) => inv.private)
    .reduce((sum, inv) => sum + inv.amount, 0);

  return {
    totalInvested: totalVisible + totalPrivate, // Show total but not details
    hasPrivateItems: totalPrivate > 0,
    visibleItems,
  };
}

/**
 * Get unused investments for AI to suggest
 */
export async function getUnusedInvestments(daysThreshold: number = 7): Promise<Investment[]> {
  const investments = await getInvestments({ status: 'active' });

  const thresholdDate = new Date();
  thresholdDate.setDate(thresholdDate.getDate() - daysThreshold);

  return investments.filter((inv) => {
    // Never used
    if (inv.timesUsed === 0) return true;
    // Not used recently
    if (!inv.lastUsedAt) return true;
    return new Date(inv.lastUsedAt) < thresholdDate;
  });
}

/**
 * Get investments by category
 */
export async function getInvestmentsByCategory(): Promise<Record<InvestmentCategory, Investment[]>> {
  const investments = await getInvestments({ status: 'active' });

  const byCategory: Record<InvestmentCategory, Investment[]> = {} as Record<
    InvestmentCategory,
    Investment[]
  >;

  // Initialize all categories
  for (const category of Object.keys(INVESTMENT_CATEGORIES) as InvestmentCategory[]) {
    byCategory[category] = [];
  }

  for (const inv of investments) {
    byCategory[inv.category].push(inv);
  }

  return byCategory;
}

/**
 * Get category totals
 */
export async function getCategoryTotals(): Promise<Record<InvestmentCategory, number>> {
  const summary = await getInvestmentSummary();
  return summary.byCategory;
}

/**
 * Get list of categories user has invested in
 */
export async function getInvestedCategories(): Promise<InvestmentCategory[]> {
  const totals = await getCategoryTotals();
  return (Object.entries(totals) as [InvestmentCategory, number][])
    .filter(([, amount]) => amount > 0)
    .map(([category]) => category);
}
