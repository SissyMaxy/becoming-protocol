/**
 * Marketplace — Listing Management
 *
 * CRUD for task_listings. Handler can auto-generate listings.
 */

import { supabase } from '../supabase';
import type { TaskListing, ListingCategory, ListingType, ListingStatus } from '../../types/marketplace';
import { mapListing } from '../../types/marketplace';

// ── Create listing ──────────────────────────────────────

export async function createListing(
  userId: string,
  listing: {
    title: string;
    description: string;
    listing_type?: ListingType;
    price_cents?: number;
    min_bid_cents?: number;
    category: ListingCategory;
    explicitness_level?: number;
    estimated_effort_minutes?: number;
    max_orders?: number;
    handler_generated?: boolean;
    handler_notes?: string;
  }
): Promise<TaskListing | null> {
  const { data, error } = await supabase
    .from('task_listings')
    .insert({
      user_id: userId,
      title: listing.title,
      description: listing.description,
      listing_type: listing.listing_type || 'fixed',
      price_cents: listing.price_cents || null,
      min_bid_cents: listing.min_bid_cents || null,
      category: listing.category,
      explicitness_level: listing.explicitness_level || 1,
      estimated_effort_minutes: listing.estimated_effort_minutes || null,
      max_orders: listing.max_orders ?? 1,
      status: 'active',
      handler_generated: listing.handler_generated || false,
      handler_notes: listing.handler_notes || null,
    })
    .select('*')
    .single();

  if (error) {
    console.error('[marketplace] createListing error:', error);
    return null;
  }
  return mapListing(data as Record<string, unknown>);
}

// ── Get active listings ─────────────────────────────────

export async function getActiveListings(userId: string): Promise<TaskListing[]> {
  const { data, error } = await supabase
    .from('task_listings')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  if (error) return [];
  return (data || []).map((r) => mapListing(r as Record<string, unknown>));
}

// ── Get all listings (including draft/paused) ───────────

export async function getAllListings(userId: string): Promise<TaskListing[]> {
  const { data, error } = await supabase
    .from('task_listings')
    .select('*')
    .eq('user_id', userId)
    .not('status', 'eq', 'cancelled')
    .order('created_at', { ascending: false });

  if (error) return [];
  return (data || []).map((r) => mapListing(r as Record<string, unknown>));
}

// ── Update listing status ───────────────────────────────

export async function updateListingStatus(
  listingId: string,
  status: ListingStatus
): Promise<void> {
  await supabase
    .from('task_listings')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', listingId);
}

// ── Increment orders filled ─────────────────────────────

export async function incrementOrdersFilled(listingId: string): Promise<void> {
  const { data } = await supabase
    .from('task_listings')
    .select('orders_filled, max_orders')
    .eq('id', listingId)
    .single();

  if (!data) return;

  const newCount = (data.orders_filled as number) + 1;
  const maxOrders = data.max_orders as number | null;

  await supabase
    .from('task_listings')
    .update({
      orders_filled: newCount,
      status: maxOrders && newCount >= maxOrders ? 'sold_out' : undefined,
      updated_at: new Date().toISOString(),
    })
    .eq('id', listingId);
}

// ── Get listing stats ───────────────────────────────────

export async function getListingStats(userId: string): Promise<{
  active: number;
  totalListings: number;
  byCategory: Record<string, number>;
}> {
  const { data } = await supabase
    .from('task_listings')
    .select('status, category')
    .eq('user_id', userId);

  if (!data) return { active: 0, totalListings: 0, byCategory: {} };

  const active = data.filter((r) => r.status === 'active').length;
  const byCategory: Record<string, number> = {};
  for (const r of data) {
    const cat = r.category as string;
    byCategory[cat] = (byCategory[cat] || 0) + 1;
  }

  return { active, totalListings: data.length, byCategory };
}
