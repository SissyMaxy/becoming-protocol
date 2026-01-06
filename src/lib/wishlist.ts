import { supabase } from './supabase';
import type {
  WishlistItem,
  WishlistItemInput,
  WishlistSummary,
  DbWishlistItem,
  InvestmentCategory,
  Investment,
} from '../types/investments';
import { INVESTMENT_CATEGORIES } from '../data/investment-categories';
import { addInvestment } from './investments';
import { convertToAffiliateLink } from './affiliates';

// ============================================
// HELPER FUNCTIONS
// ============================================

async function getAuthUserId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No authenticated user');
  return user.id;
}

function mapDbToWishlistItem(db: DbWishlistItem): WishlistItem {
  return {
    id: db.id,
    userId: db.user_id,
    name: db.name,
    category: db.category as InvestmentCategory,
    estimatedPrice: db.estimated_price ? Number(db.estimated_price) : undefined,
    currency: db.currency,
    originalUrl: db.original_url || undefined,
    affiliateUrl: db.affiliate_url || undefined,
    retailer: db.retailer || undefined,
    imageUrl: db.image_url || undefined,
    priority: db.priority as 1 | 2 | 3,
    notes: db.notes || undefined,
    private: db.private,
    claimedBy: db.claimed_by || undefined,
    claimedAt: db.claimed_at || undefined,
    status: db.status as WishlistItem['status'],
    purchasedAt: db.purchased_at || undefined,
    movedToInvestmentId: db.moved_to_investment_id || undefined,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
  };
}

function mapWishlistItemToDb(input: WishlistItemInput, userId: string): Partial<DbWishlistItem> {
  // Generate affiliate URL if original URL provided
  const affiliateUrl = input.originalUrl ? convertToAffiliateLink(input.originalUrl) : null;

  return {
    user_id: userId,
    name: input.name,
    category: input.category,
    estimated_price: input.estimatedPrice || null,
    currency: input.currency || 'USD',
    original_url: input.originalUrl || null,
    affiliate_url: affiliateUrl,
    retailer: input.retailer || null,
    image_url: input.imageUrl || null,
    priority: input.priority || 2,
    notes: input.notes || null,
    private: input.private ?? INVESTMENT_CATEGORIES[input.category].defaultPrivate,
  };
}

// ============================================
// CRUD OPERATIONS
// ============================================

/**
 * Add an item to wishlist
 */
export async function addToWishlist(input: WishlistItemInput): Promise<WishlistItem> {
  const userId = await getAuthUserId();
  const dbData = mapWishlistItemToDb(input, userId);

  const { data, error } = await supabase
    .from('wishlist_items')
    .insert(dbData)
    .select()
    .single();

  if (error) {
    console.error('Failed to add to wishlist:', error);
    throw error;
  }

  return mapDbToWishlistItem(data as DbWishlistItem);
}

/**
 * Get all wishlist items for the current user
 */
export async function getWishlist(options?: {
  status?: WishlistItem['status'];
  priority?: 1 | 2 | 3;
  includePrivate?: boolean;
  category?: InvestmentCategory;
}): Promise<WishlistItem[]> {
  const userId = await getAuthUserId();

  let query = supabase
    .from('wishlist_items')
    .select('*')
    .eq('user_id', userId)
    .order('priority', { ascending: true })
    .order('created_at', { ascending: false });

  if (options?.status) {
    query = query.eq('status', options.status);
  } else {
    // Default to active items
    query = query.eq('status', 'active');
  }

  if (options?.priority) {
    query = query.eq('priority', options.priority);
  }

  if (options?.includePrivate === false) {
    query = query.eq('private', false);
  }

  if (options?.category) {
    query = query.eq('category', options.category);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Failed to get wishlist:', error);
    throw error;
  }

  return (data as DbWishlistItem[]).map(mapDbToWishlistItem);
}

/**
 * Get a single wishlist item by ID
 */
export async function getWishlistItem(id: string): Promise<WishlistItem | null> {
  const userId = await getAuthUserId();

  const { data, error } = await supabase
    .from('wishlist_items')
    .select('*')
    .eq('user_id', userId)
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    console.error('Failed to get wishlist item:', error);
    throw error;
  }

  return mapDbToWishlistItem(data as DbWishlistItem);
}

/**
 * Update a wishlist item
 */
export async function updateWishlistItem(
  id: string,
  updates: Partial<WishlistItemInput>
): Promise<WishlistItem> {
  const userId = await getAuthUserId();

  const updateData: Partial<DbWishlistItem> = {};

  if (updates.name !== undefined) updateData.name = updates.name;
  if (updates.category !== undefined) updateData.category = updates.category;
  if (updates.estimatedPrice !== undefined) {
    updateData.estimated_price = updates.estimatedPrice || null;
  }
  if (updates.currency !== undefined) updateData.currency = updates.currency;
  if (updates.originalUrl !== undefined) {
    updateData.original_url = updates.originalUrl || null;
    // Regenerate affiliate URL
    updateData.affiliate_url = updates.originalUrl
      ? convertToAffiliateLink(updates.originalUrl)
      : null;
  }
  if (updates.retailer !== undefined) updateData.retailer = updates.retailer || null;
  if (updates.imageUrl !== undefined) updateData.image_url = updates.imageUrl || null;
  if (updates.priority !== undefined) updateData.priority = updates.priority;
  if (updates.notes !== undefined) updateData.notes = updates.notes || null;
  if (updates.private !== undefined) updateData.private = updates.private;

  const { data, error } = await supabase
    .from('wishlist_items')
    .update(updateData)
    .eq('user_id', userId)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Failed to update wishlist item:', error);
    throw error;
  }

  return mapDbToWishlistItem(data as DbWishlistItem);
}

/**
 * Remove an item from wishlist (soft delete)
 */
export async function removeFromWishlist(id: string): Promise<void> {
  const userId = await getAuthUserId();

  const { error } = await supabase
    .from('wishlist_items')
    .update({ status: 'removed' })
    .eq('user_id', userId)
    .eq('id', id);

  if (error) {
    console.error('Failed to remove from wishlist:', error);
    throw error;
  }
}

/**
 * Hard delete a wishlist item
 */
export async function deleteWishlistItem(id: string): Promise<void> {
  const userId = await getAuthUserId();

  const { error } = await supabase
    .from('wishlist_items')
    .delete()
    .eq('user_id', userId)
    .eq('id', id);

  if (error) {
    console.error('Failed to delete wishlist item:', error);
    throw error;
  }
}

// ============================================
// PURCHASE FLOW
// ============================================

/**
 * Mark a wishlist item as purchased and move to investments
 */
export async function markWishlistPurchased(
  id: string,
  purchaseDetails: {
    actualPrice: number;
    purchaseDate: string;
    retailer?: string;
  }
): Promise<Investment> {
  const userId = await getAuthUserId();

  // Get the wishlist item
  const item = await getWishlistItem(id);
  if (!item) {
    throw new Error('Wishlist item not found');
  }

  // Create investment from wishlist item
  const investment = await addInvestment({
    name: item.name,
    category: item.category,
    amount: purchaseDetails.actualPrice,
    purchaseDate: purchaseDetails.purchaseDate,
    retailer: purchaseDetails.retailer || item.retailer,
    originalUrl: item.originalUrl,
    fromWishlistId: item.id,
    notes: item.notes,
    private: item.private,
  });

  // Update wishlist item status
  const { error } = await supabase
    .from('wishlist_items')
    .update({
      status: 'purchased',
      purchased_at: new Date().toISOString(),
      moved_to_investment_id: investment.id,
    })
    .eq('user_id', userId)
    .eq('id', id);

  if (error) {
    console.error('Failed to update wishlist item status:', error);
    // Don't throw - the investment was created successfully
  }

  return investment;
}

// ============================================
// SUMMARY & ANALYTICS
// ============================================

/**
 * Get wishlist summary
 */
export async function getWishlistSummary(): Promise<WishlistSummary> {
  const items = await getWishlist({ status: 'active' });

  const byCategory: Record<InvestmentCategory, number> = {} as Record<InvestmentCategory, number>;
  let totalEstimated = 0;

  // Initialize all categories to 0
  for (const category of Object.keys(INVESTMENT_CATEGORIES) as InvestmentCategory[]) {
    byCategory[category] = 0;
  }

  const byPriority: WishlistSummary['byPriority'] = {
    high: [],
    medium: [],
    low: [],
  };

  for (const item of items) {
    if (item.estimatedPrice) {
      totalEstimated += item.estimatedPrice;
      byCategory[item.category] += item.estimatedPrice;
    }

    switch (item.priority) {
      case 1:
        byPriority.high.push(item);
        break;
      case 2:
        byPriority.medium.push(item);
        break;
      case 3:
        byPriority.low.push(item);
        break;
    }
  }

  return {
    totalEstimated,
    itemCount: items.length,
    byPriority,
    byCategory,
  };
}

/**
 * Get top wishlist items by priority
 */
export async function getTopWishlistItems(limit: number = 5): Promise<WishlistItem[]> {
  const items = await getWishlist({ status: 'active' });
  return items.slice(0, limit);
}

/**
 * Get wishlist items by category
 */
export async function getWishlistByCategory(): Promise<Record<InvestmentCategory, WishlistItem[]>> {
  const items = await getWishlist({ status: 'active' });

  const byCategory: Record<InvestmentCategory, WishlistItem[]> = {} as Record<
    InvestmentCategory,
    WishlistItem[]
  >;

  // Initialize all categories
  for (const category of Object.keys(INVESTMENT_CATEGORIES) as InvestmentCategory[]) {
    byCategory[category] = [];
  }

  for (const item of items) {
    byCategory[item.category].push(item);
  }

  return byCategory;
}

/**
 * Check if an item is already in the wishlist (by name or URL)
 */
export async function isInWishlist(
  nameOrUrl: string
): Promise<WishlistItem | null> {
  const items = await getWishlist({ status: 'active' });

  const normalizedInput = nameOrUrl.toLowerCase().trim();

  for (const item of items) {
    // Check name
    if (item.name.toLowerCase().trim() === normalizedInput) {
      return item;
    }
    // Check URL
    if (item.originalUrl?.toLowerCase().includes(normalizedInput)) {
      return item;
    }
  }

  return null;
}

/**
 * Update wishlist item priority
 */
export async function updateWishlistPriority(
  id: string,
  priority: 1 | 2 | 3
): Promise<WishlistItem> {
  return updateWishlistItem(id, { priority });
}
