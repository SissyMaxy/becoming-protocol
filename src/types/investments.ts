// Investment and Wishlist Types

import type { Domain } from './index';

// ============================================
// INVESTMENT CATEGORIES
// ============================================

export type InvestmentCategory =
  | 'clothing'
  | 'skincare'
  | 'makeup'
  | 'body_care'
  | 'voice'
  | 'accessories'
  | 'hair'
  | 'forms_shapewear'
  | 'intimates'
  | 'fragrance'
  | 'nails'
  | 'medical_hrt'
  | 'services'
  | 'education';

export interface CategoryInfo {
  label: string;
  emoji: string;
  domain: Domain | null;
  examples: string;
  defaultPrivate: boolean;
}

// ============================================
// INVESTMENTS
// ============================================

export interface Investment {
  id: string;
  userId: string;
  name: string;
  category: InvestmentCategory;
  amount: number;
  currency: string;
  purchaseDate: Date;
  retailer?: string;
  originalUrl?: string;
  fromWishlistId?: string;
  domain?: Domain;
  notes?: string;
  photoUrl?: string;
  private: boolean;
  timesUsed: number;
  lastUsedAt?: string;
  status: 'active' | 'retired' | 'consumable';
  isEstimate: boolean;
  fromOnboarding: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================
// ONBOARDING INVENTORY TYPES
// ============================================

export type EstimatedRange = '$0-50' | '$50-100' | '$100-250' | '$250-500' | '$500-1000' | '$1000+';

export interface OnboardingInventoryItem {
  name: string;
  amount: number;
  private: boolean;
}

export interface OnboardingInventoryCategory {
  category: InvestmentCategory;
  estimatedRange?: EstimatedRange;
  specificItems: OnboardingInventoryItem[];
}

export interface OnboardingInventory {
  selectedCategories: InvestmentCategory[];
  categoryData: OnboardingInventoryCategory[];
  totalEstimated: number;
  skipped: boolean;
}

export interface InvestmentInput {
  name: string;
  category: InvestmentCategory;
  amount: number;
  currency?: string;
  purchaseDate?: string; // Optional for onboarding entries
  retailer?: string;
  originalUrl?: string;
  fromWishlistId?: string;
  domain?: Domain;
  notes?: string;
  photoUrl?: string;
  private?: boolean;
  status?: 'active' | 'retired' | 'consumable';
  isEstimate?: boolean;
  fromOnboarding?: boolean;
}

// Range midpoints for estimated investments
export const RANGE_MIDPOINTS: Record<EstimatedRange, number> = {
  '$0-50': 25,
  '$50-100': 75,
  '$100-250': 175,
  '$250-500': 375,
  '$500-1000': 750,
  '$1000+': 1500,
};

export interface InvestmentSummary {
  totalInvested: number;
  totalPrivate: number;
  totalVisible: number;
  byCategory: Record<InvestmentCategory, number>;
  itemCount: number;
  recentPurchases: Investment[];
  unusedItems: Investment[];
  categoryCount: number;
}

// Database type (snake_case)
export interface DbInvestment {
  id: string;
  user_id: string;
  name: string;
  category: string;
  amount: number;
  currency: string;
  purchase_date: string;
  retailer: string | null;
  original_url: string | null;
  from_wishlist_id: string | null;
  domain: string | null;
  notes: string | null;
  photo_url: string | null;
  private: boolean;
  times_used: number;
  last_used_at: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

// ============================================
// INVESTMENT MILESTONES
// ============================================

export type InvestmentMilestoneType =
  | 'first_purchase'
  | 'amount_100'
  | 'amount_250'
  | 'amount_500'
  | 'amount_1000'
  | 'amount_2500'
  | 'amount_5000'
  | 'amount_10000'
  | 'new_category'
  | 'category_100'
  | 'category_500';

export interface InvestmentMilestone {
  id: string;
  userId: string;
  type: InvestmentMilestoneType;
  amount?: number;
  category?: InvestmentCategory;
  message: string;
  achievedAt: string;
}

export interface DbInvestmentMilestone {
  id: string;
  user_id: string;
  type: string;
  amount: number | null;
  category: string | null;
  message: string | null;
  achieved_at: string;
}

export interface MilestoneDefinition {
  type: InvestmentMilestoneType;
  check: (
    total: number,
    count: number,
    categories: InvestmentCategory[],
    newCategory?: InvestmentCategory
  ) => boolean;
  message: string | ((category?: string) => string);
  amount?: number;
}

// Event for celebration modal
export interface InvestmentMilestoneEvent {
  type: InvestmentMilestoneType;
  amount?: number;
  category?: InvestmentCategory;
  message: string;
}

// ============================================
// WISHLIST
// ============================================

export interface WishlistItem {
  id: string;
  userId: string;
  name: string;
  category: InvestmentCategory;
  estimatedPrice?: number;
  currency: string;
  originalUrl?: string;
  affiliateUrl?: string;
  retailer?: string;
  imageUrl?: string;
  priority: 1 | 2 | 3; // 1=high, 2=medium, 3=low
  notes?: string;
  private: boolean;
  claimedBy?: string;
  claimedAt?: string;
  status: 'active' | 'purchased' | 'removed';
  purchasedAt?: string;
  movedToInvestmentId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WishlistItemInput {
  name: string;
  category: InvestmentCategory;
  estimatedPrice?: number;
  currency?: string;
  originalUrl?: string;
  retailer?: string;
  imageUrl?: string;
  priority?: 1 | 2 | 3;
  notes?: string;
  private?: boolean;
}

export interface WishlistSummary {
  totalEstimated: number;
  itemCount: number;
  byPriority: {
    high: WishlistItem[];
    medium: WishlistItem[];
    low: WishlistItem[];
  };
  byCategory: Record<InvestmentCategory, number>;
}

export interface DbWishlistItem {
  id: string;
  user_id: string;
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
  purchased_at: string | null;
  moved_to_investment_id: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================
// WISHLIST SHARING
// ============================================

export type ShareType = 'link' | 'email' | 'public';

export interface WishlistShare {
  id: string;
  userId: string;
  shareType: ShareType;
  shareToken: string;
  sharedWithEmail?: string;
  canSeePrices: boolean;
  canSeePrivate: boolean;
  canClaimItems: boolean;
  lastAccessedAt?: string;
  accessCount: number;
  active: boolean;
  expiresAt?: string;
  createdAt: string;
}

export interface WishlistShareInput {
  shareType: ShareType;
  sharedWithEmail?: string;
  canSeePrices?: boolean;
  canSeePrivate?: boolean;
  canClaimItems?: boolean;
  expiresInDays?: number;
}

export interface DbWishlistShare {
  id: string;
  user_id: string;
  share_type: string;
  share_token: string;
  shared_with_email: string | null;
  can_see_prices: boolean;
  can_see_private: boolean;
  can_claim_items: boolean;
  last_accessed_at: string | null;
  access_count: number;
  active: boolean;
  expires_at: string | null;
  created_at: string;
}

// Shared wishlist view (from database function)
export interface SharedWishlistItem {
  id: string;
  name: string;
  category: InvestmentCategory;
  estimatedPrice?: number;
  currency: string;
  originalUrl?: string;
  affiliateUrl?: string;
  retailer?: string;
  imageUrl?: string;
  priority: 1 | 2 | 3;
  notes?: string;
  private: boolean;
  claimedBy?: string;
  claimedAt?: string;
  status: string;
}

export interface SharedWishlistData {
  items: SharedWishlistItem[];
  ownerName?: string;
  canSeePrices: boolean;
  canSeePrivate: boolean;
  canClaimItems: boolean;
}

// ============================================
// AFFILIATE TRACKING
// ============================================

export type AffiliateEventType = 'click' | 'conversion';

export interface AffiliateEvent {
  id: string;
  userId?: string;
  wishlistItemId?: string;
  shareId?: string;
  eventType: AffiliateEventType;
  retailer?: string;
  orderAmount?: number;
  commissionAmount?: number;
  ipHash?: string;
  userAgent?: string;
  createdAt: string;
}

export interface AffiliateConfig {
  retailer: string;
  name: string;
  affiliateTag: string;
  urlPattern: RegExp;
  buildUrl: (url: string, tag: string) => string;
  commissionRate: number;
}

export interface AffiliateStats {
  totalClicks: number;
  clicksByRetailer: Record<string, number>;
}

// ============================================
// CONTEXT TYPES
// ============================================

export interface InvestmentContextState {
  investments: Investment[];
  investmentSummary: InvestmentSummary | null;
  wishlist: WishlistItem[];
  wishlistSummary: WishlistSummary | null;
  shares: WishlistShare[];
  isLoading: boolean;
  investmentMilestone: InvestmentMilestoneEvent | null;
}

export interface InvestmentContextActions {
  // Investments
  addInvestment: (input: InvestmentInput) => Promise<Investment>;
  updateInvestment: (id: string, updates: Partial<InvestmentInput>) => Promise<void>;
  deleteInvestment: (id: string) => Promise<void>;
  markInvestmentUsed: (id: string) => Promise<void>;

  // Wishlist
  addToWishlist: (input: WishlistItemInput) => Promise<WishlistItem>;
  updateWishlistItem: (id: string, updates: Partial<WishlistItemInput>) => Promise<void>;
  removeFromWishlist: (id: string) => Promise<void>;
  purchaseWishlistItem: (id: string, purchaseDetails: {
    actualPrice: number;
    purchaseDate: string;
  }) => Promise<Investment>;

  // Shares
  createShare: (input: WishlistShareInput) => Promise<string>;
  revokeShare: (shareId: string) => Promise<void>;

  // Events
  dismissInvestmentMilestone: () => void;

  // Refresh
  refreshInvestmentData: () => Promise<void>;
}

// ============================================
// AI INTEGRATION CONTEXT
// ============================================

export interface FinancialContext {
  investment: {
    total: number;
    byCategory: Record<string, number>;
    recentPurchases: Array<{
      name: string;
      category: string;
      amount: number;
      daysAgo: number;
      timesUsed: number;
    }>;
    unusedItems: Array<{
      name: string;
      category: string;
      daysSincePurchase: number;
    }>;
  };
  wishlist: {
    total: number;
    topItems: Array<{
      name: string;
      category: string;
      price: number;
    }>;
  };
}
