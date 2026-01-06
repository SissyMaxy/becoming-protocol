import { supabase } from './supabase';
import type {
  WishlistShare,
  WishlistShareInput,
  DbWishlistShare,
  SharedWishlistData,
  SharedWishlistItem,
  InvestmentCategory,
} from '../types/investments';

// ============================================
// HELPER FUNCTIONS
// ============================================

async function getAuthUserId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No authenticated user');
  return user.id;
}

function generateShareToken(): string {
  // Generate a random 12-character alphanumeric token
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 12; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

function mapDbToShare(db: DbWishlistShare): WishlistShare {
  return {
    id: db.id,
    userId: db.user_id,
    shareType: db.share_type as WishlistShare['shareType'],
    shareToken: db.share_token,
    sharedWithEmail: db.shared_with_email || undefined,
    canSeePrices: db.can_see_prices,
    canSeePrivate: db.can_see_private,
    canClaimItems: db.can_claim_items,
    lastAccessedAt: db.last_accessed_at || undefined,
    accessCount: db.access_count,
    active: db.active,
    expiresAt: db.expires_at || undefined,
    createdAt: db.created_at,
  };
}

// ============================================
// SHARE MANAGEMENT
// ============================================

/**
 * Create a new wishlist share
 */
export async function createShare(input: WishlistShareInput): Promise<string> {
  const userId = await getAuthUserId();
  const token = generateShareToken();

  // Calculate expiration if specified
  let expiresAt: string | null = null;
  if (input.expiresInDays) {
    const expDate = new Date();
    expDate.setDate(expDate.getDate() + input.expiresInDays);
    expiresAt = expDate.toISOString();
  }

  const { error } = await supabase.from('wishlist_shares').insert({
    user_id: userId,
    share_type: input.shareType,
    share_token: token,
    shared_with_email: input.sharedWithEmail || null,
    can_see_prices: input.canSeePrices ?? true,
    can_see_private: input.canSeePrivate ?? false,
    can_claim_items: input.canClaimItems ?? true,
    expires_at: expiresAt,
  });

  if (error) {
    console.error('Failed to create share:', error);
    throw error;
  }

  return token;
}

/**
 * Get all shares for the current user
 */
export async function getShares(): Promise<WishlistShare[]> {
  const userId = await getAuthUserId();

  const { data, error } = await supabase
    .from('wishlist_shares')
    .select('*')
    .eq('user_id', userId)
    .eq('active', true)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to get shares:', error);
    throw error;
  }

  return (data as DbWishlistShare[]).map(mapDbToShare);
}

/**
 * Get a specific share by ID
 */
export async function getShare(shareId: string): Promise<WishlistShare | null> {
  const userId = await getAuthUserId();

  const { data, error } = await supabase
    .from('wishlist_shares')
    .select('*')
    .eq('user_id', userId)
    .eq('id', shareId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    console.error('Failed to get share:', error);
    throw error;
  }

  return mapDbToShare(data as DbWishlistShare);
}

/**
 * Revoke a share
 */
export async function revokeShare(shareId: string): Promise<void> {
  const userId = await getAuthUserId();

  const { error } = await supabase
    .from('wishlist_shares')
    .update({ active: false })
    .eq('user_id', userId)
    .eq('id', shareId);

  if (error) {
    console.error('Failed to revoke share:', error);
    throw error;
  }
}

/**
 * Delete a share permanently
 */
export async function deleteShare(shareId: string): Promise<void> {
  const userId = await getAuthUserId();

  const { error } = await supabase
    .from('wishlist_shares')
    .delete()
    .eq('user_id', userId)
    .eq('id', shareId);

  if (error) {
    console.error('Failed to delete share:', error);
    throw error;
  }
}

/**
 * Update share permissions
 */
export async function updateShare(
  shareId: string,
  updates: Partial<Pick<WishlistShareInput, 'canSeePrices' | 'canSeePrivate' | 'canClaimItems'>>
): Promise<WishlistShare> {
  const userId = await getAuthUserId();

  const updateData: Partial<DbWishlistShare> = {};
  if (updates.canSeePrices !== undefined) updateData.can_see_prices = updates.canSeePrices;
  if (updates.canSeePrivate !== undefined) updateData.can_see_private = updates.canSeePrivate;
  if (updates.canClaimItems !== undefined) updateData.can_claim_items = updates.canClaimItems;

  const { data, error } = await supabase
    .from('wishlist_shares')
    .update(updateData)
    .eq('user_id', userId)
    .eq('id', shareId)
    .select()
    .single();

  if (error) {
    console.error('Failed to update share:', error);
    throw error;
  }

  return mapDbToShare(data as DbWishlistShare);
}

// ============================================
// PUBLIC ACCESS (No Auth Required)
// ============================================

/**
 * Get shared wishlist by token (public access)
 */
export async function getSharedWishlist(token: string): Promise<SharedWishlistData | null> {
  // Use the database function that bypasses RLS
  const { data, error } = await supabase.rpc('get_shared_wishlist', {
    p_token: token,
  });

  if (error) {
    console.error('Failed to get shared wishlist:', error);
    return null;
  }

  if (!data || data.length === 0) {
    return null;
  }

  // The first row contains permission info
  const firstRow = data[0];

  const items: SharedWishlistItem[] = data.map((row: {
    id: string;
    name: string;
    category: string;
    estimated_price: number | null;
    currency: string;
    original_url: string | null;
    affiliate_url: string | null;
    retailer: string | null;
    image_url: string | null;
    priority: number;
    notes: string | null;
    private: boolean;
    claimed_by: string | null;
    claimed_at: string | null;
    status: string;
  }) => ({
    id: row.id,
    name: row.name,
    category: row.category as InvestmentCategory,
    estimatedPrice: row.estimated_price ? Number(row.estimated_price) : undefined,
    currency: row.currency,
    originalUrl: row.original_url || undefined,
    affiliateUrl: row.affiliate_url || undefined,
    retailer: row.retailer || undefined,
    imageUrl: row.image_url || undefined,
    priority: row.priority as 1 | 2 | 3,
    notes: row.notes || undefined,
    private: row.private,
    claimedBy: row.claimed_by || undefined,
    claimedAt: row.claimed_at || undefined,
    status: row.status,
  }));

  return {
    items,
    ownerName: firstRow.owner_name || undefined,
    canSeePrices: firstRow.can_see_prices,
    canSeePrivate: firstRow.can_see_private,
    canClaimItems: firstRow.can_claim_items,
  };
}

/**
 * Claim an item on a shared wishlist (public access)
 */
export async function claimSharedItem(
  token: string,
  itemId: string,
  claimerEmail: string
): Promise<boolean> {
  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(claimerEmail)) {
    throw new Error('Invalid email format');
  }

  // Use the database function that bypasses RLS
  const { data, error } = await supabase.rpc('claim_wishlist_item', {
    p_token: token,
    p_item_id: itemId,
    p_claimer_email: claimerEmail,
  });

  if (error) {
    console.error('Failed to claim item:', error);
    return false;
  }

  return data === true;
}

/**
 * Unclaim an item (owner only)
 */
export async function unclaimItem(itemId: string): Promise<void> {
  const userId = await getAuthUserId();

  const { error } = await supabase
    .from('wishlist_items')
    .update({
      claimed_by: null,
      claimed_at: null,
    })
    .eq('user_id', userId)
    .eq('id', itemId);

  if (error) {
    console.error('Failed to unclaim item:', error);
    throw error;
  }
}

// ============================================
// SHARE LINK UTILITIES
// ============================================

/**
 * Build the share URL for a token
 */
export function buildShareUrl(token: string): string {
  // Use hash routing for SPA compatibility
  const baseUrl = window.location.origin + window.location.pathname;
  return `${baseUrl}#/wishlist/${token}`;
}

/**
 * Parse a share token from URL
 */
export function parseShareToken(url: string): string | null {
  // Handle hash routing format: #/wishlist/{token}
  const hashMatch = url.match(/#\/wishlist\/([a-zA-Z0-9]+)/);
  if (hashMatch) {
    return hashMatch[1];
  }

  // Handle direct token
  const tokenMatch = url.match(/\/wishlist\/([a-zA-Z0-9]+)/);
  if (tokenMatch) {
    return tokenMatch[1];
  }

  return null;
}

/**
 * Check if a share token is valid and not expired
 */
export async function isShareValid(token: string): Promise<boolean> {
  const wishlist = await getSharedWishlist(token);
  return wishlist !== null;
}

/**
 * Get share access statistics
 */
export async function getShareStats(): Promise<{
  totalShares: number;
  activeShares: number;
  totalAccesses: number;
}> {
  const shares = await getShares();

  return {
    totalShares: shares.length,
    activeShares: shares.filter((s) => s.active).length,
    totalAccesses: shares.reduce((sum, s) => sum + s.accessCount, 0),
  };
}
