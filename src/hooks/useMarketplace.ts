/**
 * useMarketplace — Fan-funded task marketplace hook
 *
 * Provides listings, orders, stats, and order lifecycle actions.
 */

import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import type { TaskListing, TaskOrder, MarketplaceStats } from '../types/marketplace';
import {
  getActiveListings,
  getListingStats,
} from '../lib/marketplace/listings';
import {
  getActiveOrders,
  getPendingOrders,
  getOrderStats,
  acceptOrder as acceptOrderLib,
  completeOrder as completeOrderLib,
  deliverOrder as deliverOrderLib,
} from '../lib/marketplace/orders';
import { getActiveAuctionCount } from '../lib/marketplace/auctions';

interface UseMarketplaceReturn {
  listings: TaskListing[];
  orders: TaskOrder[];
  pendingOrders: TaskOrder[];
  stats: MarketplaceStats;
  isLoading: boolean;

  acceptOrder: (orderId: string, taskCode?: string) => Promise<void>;
  completeOrder: (orderId: string, vaultId?: string) => Promise<void>;
  deliverOrder: (orderId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useMarketplace(): UseMarketplaceReturn {
  const { user } = useAuth();
  const [listings, setListings] = useState<TaskListing[]>([]);
  const [orders, setOrders] = useState<TaskOrder[]>([]);
  const [pendingOrders, setPendingOrders] = useState<TaskOrder[]>([]);
  const [stats, setStats] = useState<MarketplaceStats>({
    activeListings: 0,
    pendingOrders: 0,
    pendingRevenueCents: 0,
    completedOrders: 0,
    totalRevenueCents: 0,
    avgOrderCents: 0,
    activeAuctions: 0,
    topCategory: null,
  });
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);

    const [listingsRes, ordersRes, pendingRes, listingStatsRes, orderStatsRes, auctionCountRes] =
      await Promise.allSettled([
        getActiveListings(user.id),
        getActiveOrders(user.id),
        getPendingOrders(user.id),
        getListingStats(user.id),
        getOrderStats(user.id),
        getActiveAuctionCount(user.id),
      ]);

    setListings(listingsRes.status === 'fulfilled' ? listingsRes.value : []);
    setOrders(ordersRes.status === 'fulfilled' ? ordersRes.value : []);
    setPendingOrders(pendingRes.status === 'fulfilled' ? pendingRes.value : []);

    const ls = listingStatsRes.status === 'fulfilled' ? listingStatsRes.value : { active: 0, totalListings: 0, byCategory: {} };
    const os = orderStatsRes.status === 'fulfilled' ? orderStatsRes.value : { pending: 0, pendingRevenueCents: 0, completed: 0, delivered: 0, totalRevenueCents: 0, avgOrderCents: 0 };
    const ac = auctionCountRes.status === 'fulfilled' ? auctionCountRes.value : 0;

    // Find top category
    const cats = Object.entries(ls.byCategory);
    const topCategory = cats.length > 0
      ? cats.sort((a, b) => b[1] - a[1])[0][0]
      : null;

    setStats({
      activeListings: ls.active,
      pendingOrders: os.pending,
      pendingRevenueCents: os.pendingRevenueCents,
      completedOrders: os.completed,
      totalRevenueCents: os.totalRevenueCents,
      avgOrderCents: os.avgOrderCents,
      activeAuctions: ac,
      topCategory,
    });

    setIsLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const acceptOrder = useCallback(async (orderId: string, taskCode?: string) => {
    await acceptOrderLib(orderId, taskCode);
    await load();
  }, [load]);

  const completeOrder = useCallback(async (orderId: string, vaultId?: string) => {
    await completeOrderLib(orderId, vaultId);
    await load();
  }, [load]);

  const deliverOrder = useCallback(async (orderId: string) => {
    await deliverOrderLib(orderId);
    await load();
  }, [load]);

  return {
    listings,
    orders,
    pendingOrders,
    stats,
    isLoading,
    acceptOrder,
    completeOrder,
    deliverOrder,
    refresh: load,
  };
}
