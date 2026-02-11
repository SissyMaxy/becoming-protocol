// Investments Context
// Manages investment and wishlist state
// Split from ProtocolContext to reduce re-renders

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import type {
  Investment,
  InvestmentInput,
  InvestmentSummary,
  WishlistItem,
  WishlistItemInput,
  WishlistSummary,
  WishlistShare,
  WishlistShareInput,
  InvestmentMilestoneEvent,
} from '../types/investments';
import {
  getInvestments,
  getInvestmentSummary,
  addInvestment as addInvestmentApi,
  updateInvestment as updateInvestmentApi,
  deleteInvestment as deleteInvestmentApi,
  markInvestmentUsed as markInvestmentUsedApi,
} from '../lib/investments';
import {
  getWishlist,
  getWishlistSummary,
  addToWishlist as addToWishlistApi,
  updateWishlistItem as updateWishlistItemApi,
  removeFromWishlist as removeFromWishlistApi,
  markWishlistPurchased,
} from '../lib/wishlist';
import {
  getShares,
  createShare as createShareApi,
  revokeShare as revokeShareApi,
} from '../lib/wishlist-sharing';
import { checkMilestones } from '../lib/investment-milestones';

interface InvestmentsContextType {
  // State
  investments: Investment[];
  investmentSummary: InvestmentSummary | null;
  wishlist: WishlistItem[];
  wishlistSummary: WishlistSummary | null;
  wishlistShares: WishlistShare[];
  loading: boolean;

  // Actions
  addInvestment: (input: InvestmentInput) => Promise<Investment>;
  updateInvestment: (id: string, updates: Partial<InvestmentInput>) => Promise<void>;
  deleteInvestment: (id: string) => Promise<void>;
  markInvestmentUsed: (id: string) => Promise<void>;
  refreshInvestmentData: () => Promise<void>;

  // Wishlist Actions
  addToWishlist: (input: WishlistItemInput) => Promise<WishlistItem>;
  updateWishlistItem: (id: string, updates: Partial<WishlistItemInput>) => Promise<void>;
  removeFromWishlist: (id: string) => Promise<void>;
  purchaseWishlistItem: (id: string, purchaseDetails: {
    actualPrice: number;
    purchaseDate: string;
    retailer?: string;
  }) => Promise<Investment>;

  // Share Actions
  createWishlistShare: (input: WishlistShareInput) => Promise<string>;
  revokeWishlistShare: (shareId: string) => Promise<void>;

  // Milestone callback
  onMilestone?: (milestone: InvestmentMilestoneEvent) => void;
}

const InvestmentsContext = createContext<InvestmentsContextType | undefined>(undefined);

interface InvestmentsProviderProps {
  children: ReactNode;
  onMilestone?: (milestone: InvestmentMilestoneEvent) => void;
}

export function InvestmentsProvider({ children, onMilestone }: InvestmentsProviderProps) {
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [investmentSummary, setInvestmentSummary] = useState<InvestmentSummary | null>(null);
  const [wishlist, setWishlist] = useState<WishlistItem[]>([]);
  const [wishlistSummary, setWishlistSummary] = useState<WishlistSummary | null>(null);
  const [wishlistShares, setWishlistShares] = useState<WishlistShare[]>([]);
  const [loading, setLoading] = useState(false);

  // Refresh all investment data
  const refreshInvestmentData = useCallback(async () => {
    try {
      setLoading(true);
      const [investmentsData, summaryData, wishlistData, wishlistSummaryData, sharesData] = await Promise.all([
        getInvestments(),
        getInvestmentSummary(),
        getWishlist(),
        getWishlistSummary(),
        getShares(),
      ]);
      setInvestments(investmentsData);
      setInvestmentSummary(summaryData);
      setWishlist(wishlistData);
      setWishlistSummary(wishlistSummaryData);
      setWishlistShares(sharesData);
    } catch (error) {
      console.error('Failed to refresh investment data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load on mount
  useEffect(() => {
    refreshInvestmentData();
  }, [refreshInvestmentData]);

  // Add investment with optimistic update
  const addInvestment = useCallback(async (input: InvestmentInput): Promise<Investment> => {
    const previousSummary = investmentSummary;
    const previousCategories = investments.map(i => i.category);

    const newInvestment = await addInvestmentApi(input);

    // Optimistic update
    setInvestments(prev => [newInvestment, ...prev]);

    // Refresh summary
    const [investmentsData, summaryData] = await Promise.all([
      getInvestments(),
      getInvestmentSummary(),
    ]);
    setInvestments(investmentsData);
    setInvestmentSummary(summaryData);

    // Check for milestones
    const isNewCategory = !previousCategories.includes(input.category);
    const milestones = await checkMilestones(
      summaryData,
      isNewCategory ? input.category : undefined,
      previousSummary?.totalInvested,
      previousSummary?.byCategory
    );

    if (milestones.length > 0 && onMilestone) {
      onMilestone(milestones[0]);
    }

    return newInvestment;
  }, [investmentSummary, investments, onMilestone]);

  // Update investment
  const updateInvestment = useCallback(async (id: string, updates: Partial<InvestmentInput>) => {
    await updateInvestmentApi(id, updates);
    await refreshInvestmentData();
  }, [refreshInvestmentData]);

  // Delete investment
  const deleteInvestment = useCallback(async (id: string) => {
    // Optimistic update
    setInvestments(prev => prev.filter(i => i.id !== id));

    await deleteInvestmentApi(id);
    await refreshInvestmentData();
  }, [refreshInvestmentData]);

  // Mark investment as used (optimistic)
  const markInvestmentUsed = useCallback(async (id: string) => {
    // Optimistic update
    setInvestments(prev => prev.map(inv =>
      inv.id === id
        ? { ...inv, timesUsed: inv.timesUsed + 1, lastUsedAt: new Date().toISOString() }
        : inv
    ));

    await markInvestmentUsedApi(id);
  }, []);

  // Add to wishlist
  const addToWishlist = useCallback(async (input: WishlistItemInput): Promise<WishlistItem> => {
    const newItem = await addToWishlistApi(input);
    const [wishlistData, summaryData] = await Promise.all([
      getWishlist(),
      getWishlistSummary(),
    ]);
    setWishlist(wishlistData);
    setWishlistSummary(summaryData);
    return newItem;
  }, []);

  // Update wishlist item
  const updateWishlistItem = useCallback(async (id: string, updates: Partial<WishlistItemInput>) => {
    await updateWishlistItemApi(id, updates);
    const [wishlistData, summaryData] = await Promise.all([
      getWishlist(),
      getWishlistSummary(),
    ]);
    setWishlist(wishlistData);
    setWishlistSummary(summaryData);
  }, []);

  // Remove from wishlist
  const removeFromWishlist = useCallback(async (id: string) => {
    // Optimistic update
    setWishlist(prev => prev.filter(i => i.id !== id));

    await removeFromWishlistApi(id);
    const [wishlistData, summaryData] = await Promise.all([
      getWishlist(),
      getWishlistSummary(),
    ]);
    setWishlist(wishlistData);
    setWishlistSummary(summaryData);
  }, []);

  // Purchase wishlist item
  const purchaseWishlistItem = useCallback(async (
    id: string,
    purchaseDetails: { actualPrice: number; purchaseDate: string; retailer?: string }
  ): Promise<Investment> => {
    const previousSummary = investmentSummary;
    const previousCategories = investments.map(i => i.category);

    const investment = await markWishlistPurchased(id, purchaseDetails);

    // Refresh all data
    await refreshInvestmentData();

    // Get fresh summary for milestone check
    const summaryData = await getInvestmentSummary();
    const isNewCategory = !previousCategories.includes(investment.category);

    // Check for milestones
    const milestones = await checkMilestones(
      summaryData,
      isNewCategory ? investment.category : undefined,
      previousSummary?.totalInvested,
      previousSummary?.byCategory
    );

    if (milestones.length > 0 && onMilestone) {
      onMilestone(milestones[0]);
    }

    return investment;
  }, [investmentSummary, investments, refreshInvestmentData, onMilestone]);

  // Create wishlist share
  const createWishlistShare = useCallback(async (input: WishlistShareInput): Promise<string> => {
    const token = await createShareApi(input);
    const sharesData = await getShares();
    setWishlistShares(sharesData);
    return token;
  }, []);

  // Revoke wishlist share
  const revokeWishlistShare = useCallback(async (shareId: string) => {
    await revokeShareApi(shareId);
    const sharesData = await getShares();
    setWishlistShares(sharesData);
  }, []);

  const value: InvestmentsContextType = {
    investments,
    investmentSummary,
    wishlist,
    wishlistSummary,
    wishlistShares,
    loading,
    addInvestment,
    updateInvestment,
    deleteInvestment,
    markInvestmentUsed,
    refreshInvestmentData,
    addToWishlist,
    updateWishlistItem,
    removeFromWishlist,
    purchaseWishlistItem,
    createWishlistShare,
    revokeWishlistShare,
  };

  return (
    <InvestmentsContext.Provider value={value}>
      {children}
    </InvestmentsContext.Provider>
  );
}

export function useInvestments(): InvestmentsContextType {
  const context = useContext(InvestmentsContext);
  if (context === undefined) {
    throw new Error('useInvestments must be used within an InvestmentsProvider');
  }
  return context;
}

// Selective hooks
export function useInvestmentSummary() {
  const { investmentSummary, loading } = useInvestments();
  return { summary: investmentSummary, loading };
}

export function useWishlist() {
  const { wishlist, wishlistSummary, loading, addToWishlist, removeFromWishlist, updateWishlistItem } = useInvestments();
  return { wishlist, summary: wishlistSummary, loading, addToWishlist, removeFromWishlist, updateWishlistItem };
}
