/**
 * Fan-Funded Task Marketplace Types
 *
 * Fans purchase tasks for Maxy to complete.
 * David can't distinguish paid from organic tasks.
 */

// ── Union types ─────────────────────────────────────────

export type ListingType = 'fixed' | 'auction' | 'custom_request';
export type ListingCategory = 'photo' | 'video' | 'voice' | 'outfit' | 'challenge' | 'custom' | 'lifestyle' | 'explicit';
export type ListingStatus = 'draft' | 'active' | 'paused' | 'sold_out' | 'expired' | 'cancelled';
export type OrderStatus = 'pending' | 'accepted' | 'in_progress' | 'completed' | 'delivered' | 'refunded' | 'cancelled';

// ── Task Listing ────────────────────────────────────────

export interface TaskListing {
  id: string;
  user_id: string;
  title: string;
  description: string;
  listing_type: ListingType;
  price_cents: number | null;
  min_bid_cents: number | null;
  category: ListingCategory;
  explicitness_level: number;
  estimated_effort_minutes: number | null;
  max_orders: number | null;
  orders_filled: number;
  status: ListingStatus;
  expires_at: string | null;
  handler_generated: boolean;
  handler_notes: string | null;
  created_at: string;
  updated_at: string;
}

// ── Task Order ──────────────────────────────────────────

export interface TaskOrder {
  id: string;
  user_id: string;
  listing_id: string | null;
  fan_id: string | null;
  amount_cents: number;
  platform: string;
  special_instructions: string | null;
  status: OrderStatus;
  internal_task_code: string | null;
  delivery_vault_id: string | null;
  accepted_at: string | null;
  completed_at: string | null;
  delivered_at: string | null;
  fan_rating: number | null;
  created_at: string;
}

// ── Task Auction ────────────────────────────────────────

export interface TaskAuction {
  id: string;
  listing_id: string;
  user_id: string;
  fan_id: string | null;
  bid_cents: number;
  platform: string;
  bid_message: string | null;
  is_winning: boolean;
  created_at: string;
}

// ── Stats ───────────────────────────────────────────────

export interface MarketplaceStats {
  activeListings: number;
  pendingOrders: number;
  pendingRevenueCents: number;
  completedOrders: number;
  totalRevenueCents: number;
  avgOrderCents: number;
  activeAuctions: number;
  topCategory: string | null;
}

// ── Mappers ─────────────────────────────────────────────

export function mapListing(row: Record<string, unknown>): TaskListing {
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    title: row.title as string,
    description: row.description as string,
    listing_type: row.listing_type as ListingType,
    price_cents: row.price_cents as number | null,
    min_bid_cents: row.min_bid_cents as number | null,
    category: row.category as ListingCategory,
    explicitness_level: row.explicitness_level as number,
    estimated_effort_minutes: row.estimated_effort_minutes as number | null,
    max_orders: row.max_orders as number | null,
    orders_filled: row.orders_filled as number,
    status: row.status as ListingStatus,
    expires_at: row.expires_at as string | null,
    handler_generated: row.handler_generated as boolean,
    handler_notes: row.handler_notes as string | null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

export function mapOrder(row: Record<string, unknown>): TaskOrder {
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    listing_id: row.listing_id as string | null,
    fan_id: row.fan_id as string | null,
    amount_cents: row.amount_cents as number,
    platform: row.platform as string,
    special_instructions: row.special_instructions as string | null,
    status: row.status as OrderStatus,
    internal_task_code: row.internal_task_code as string | null,
    delivery_vault_id: row.delivery_vault_id as string | null,
    accepted_at: row.accepted_at as string | null,
    completed_at: row.completed_at as string | null,
    delivered_at: row.delivered_at as string | null,
    fan_rating: row.fan_rating as number | null,
    created_at: row.created_at as string,
  };
}

export function mapAuction(row: Record<string, unknown>): TaskAuction {
  return {
    id: row.id as string,
    listing_id: row.listing_id as string,
    user_id: row.user_id as string,
    fan_id: row.fan_id as string | null,
    bid_cents: row.bid_cents as number,
    platform: row.platform as string,
    bid_message: row.bid_message as string | null,
    is_winning: row.is_winning as boolean,
    created_at: row.created_at as string,
  };
}
