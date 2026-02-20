/**
 * Marketplace — Auction System
 *
 * Fans bid on auction-type listings.
 * Highest bid wins when auction closes.
 */

import { supabase } from '../supabase';
import type { TaskAuction } from '../../types/marketplace';
import { mapAuction } from '../../types/marketplace';
import { createOrder } from './orders';

// ── Place bid ───────────────────────────────────────────

export async function placeBid(
  userId: string,
  listingId: string,
  fanId: string,
  bidCents: number,
  platform: string,
  bidMessage?: string
): Promise<TaskAuction | null> {
  // Validate bid against minimum
  const { data: listing } = await supabase
    .from('task_listings')
    .select('min_bid_cents, status, listing_type')
    .eq('id', listingId)
    .single();

  if (!listing || listing.status !== 'active' || listing.listing_type !== 'auction') {
    console.error('[marketplace] placeBid: listing not available for auction');
    return null;
  }

  if (listing.min_bid_cents && bidCents < (listing.min_bid_cents as number)) {
    console.error('[marketplace] placeBid: bid below minimum');
    return null;
  }

  // Check if bid is highest
  const { data: currentHighest } = await supabase
    .from('task_auctions')
    .select('bid_cents')
    .eq('listing_id', listingId)
    .order('bid_cents', { ascending: false })
    .limit(1)
    .single();

  if (currentHighest && bidCents <= (currentHighest.bid_cents as number)) {
    console.error('[marketplace] placeBid: bid not higher than current');
    return null;
  }

  // Clear previous winning bid
  await supabase
    .from('task_auctions')
    .update({ is_winning: false })
    .eq('listing_id', listingId)
    .eq('is_winning', true);

  // Place new bid
  const { data, error } = await supabase
    .from('task_auctions')
    .insert({
      listing_id: listingId,
      user_id: userId,
      fan_id: fanId,
      bid_cents: bidCents,
      platform,
      bid_message: bidMessage || null,
      is_winning: true,
    })
    .select('*')
    .single();

  if (error) {
    console.error('[marketplace] placeBid error:', error);
    return null;
  }

  return mapAuction(data as Record<string, unknown>);
}

// ── Close auction (winning bid becomes order) ───────────

export async function closeAuction(
  userId: string,
  listingId: string
): Promise<TaskAuction | null> {
  // Get winning bid
  const { data: winner } = await supabase
    .from('task_auctions')
    .select('*')
    .eq('listing_id', listingId)
    .eq('is_winning', true)
    .single();

  if (!winner) return null;

  // Create order from winning bid
  await createOrder(
    userId,
    listingId,
    winner.fan_id as string,
    winner.bid_cents as number,
    winner.platform as string,
    winner.bid_message as string | undefined
  );

  // Close the listing
  await supabase
    .from('task_listings')
    .update({ status: 'sold_out', updated_at: new Date().toISOString() })
    .eq('id', listingId);

  return mapAuction(winner as Record<string, unknown>);
}

// ── Get auction bids ────────────────────────────────────

export async function getAuctionBids(listingId: string): Promise<TaskAuction[]> {
  const { data, error } = await supabase
    .from('task_auctions')
    .select('*')
    .eq('listing_id', listingId)
    .order('bid_cents', { ascending: false });

  if (error) return [];
  return (data || []).map((r) => mapAuction(r as Record<string, unknown>));
}

// ── Get active auctions count ───────────────────────────

export async function getActiveAuctionCount(userId: string): Promise<number> {
  const { count } = await supabase
    .from('task_listings')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('listing_type', 'auction')
    .eq('status', 'active');

  return count || 0;
}
