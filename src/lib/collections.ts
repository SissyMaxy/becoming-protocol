/**
 * Collections — DB operations for wigs, scent products, anchor objects.
 */

import { supabase } from './supabase';
import type {
  Wig, WigInput,
  ScentProduct, ScentInput, ScentPairing, PairingActivity,
  AnchorObject, AnchorInput,
} from '../types/collections';

// =============================
// Wigs
// =============================

function rowToWig(r: Record<string, unknown>): Wig {
  return {
    id: r.id as string,
    userId: r.user_id as string,
    name: r.name as string,
    type: r.type as Wig['type'],
    color: r.color as string | null,
    length: r.length as Wig['length'],
    laceType: r.lace_type as Wig['laceType'],
    purchasePrice: r.purchase_price as number | null,
    purchaseDate: r.purchase_date as string | null,
    timesWorn: (r.times_worn as number) || 0,
    lastWornAt: r.last_worn_at as string | null,
    isPrimary: (r.is_primary as boolean) || false,
    notes: r.notes as string | null,
    createdAt: r.created_at as string,
  };
}

export async function getWigs(userId: string): Promise<Wig[]> {
  const { data } = await supabase
    .from('wig_collection')
    .select('*')
    .eq('user_id', userId)
    .order('is_primary', { ascending: false })
    .order('times_worn', { ascending: false });
  return (data || []).map(rowToWig);
}

export async function addWig(userId: string, input: WigInput): Promise<Wig | null> {
  const row: Record<string, unknown> = {
    user_id: userId,
    name: input.name,
    type: input.type,
  };
  if (input.color) row.color = input.color;
  if (input.length) row.length = input.length;
  if (input.laceType) row.lace_type = input.laceType;
  if (input.purchasePrice != null) row.purchase_price = input.purchasePrice;
  if (input.purchaseDate) row.purchase_date = input.purchaseDate;
  if (input.isPrimary) row.is_primary = input.isPrimary;
  if (input.notes) row.notes = input.notes;

  const { data, error } = await supabase
    .from('wig_collection')
    .insert(row)
    .select()
    .single();
  if (error || !data) return null;
  return rowToWig(data);
}

export async function woreWigToday(wigId: string): Promise<void> {
  // Increment times_worn and set last_worn_at
  const { data } = await supabase
    .from('wig_collection')
    .select('times_worn')
    .eq('id', wigId)
    .single();

  const current = (data?.times_worn as number) || 0;
  await supabase
    .from('wig_collection')
    .update({ times_worn: current + 1, last_worn_at: new Date().toISOString() })
    .eq('id', wigId);
}

export async function setPrimaryWig(userId: string, wigId: string): Promise<void> {
  // Clear other primaries
  await supabase
    .from('wig_collection')
    .update({ is_primary: false })
    .eq('user_id', userId);
  // Set this one
  await supabase
    .from('wig_collection')
    .update({ is_primary: true })
    .eq('id', wigId);
}

export async function deleteWig(wigId: string): Promise<void> {
  await supabase.from('wig_collection').delete().eq('id', wigId);
}

// =============================
// Scent Products
// =============================

function rowToScent(r: Record<string, unknown>): ScentProduct {
  return {
    id: r.id as string,
    userId: r.user_id as string,
    category: r.category as ScentProduct['category'],
    productName: r.product_name as string,
    brand: r.brand as string | null,
    scentNotes: r.scent_notes as string | null,
    isSignature: (r.is_signature as boolean) || false,
    isActive: r.is_active !== false,
    needsRestock: (r.needs_restock as boolean) || false,
    purchasePrice: r.purchase_price as number | null,
    notes: r.notes as string | null,
    createdAt: r.created_at as string,
  };
}

function rowToPairing(r: Record<string, unknown>): ScentPairing {
  return {
    id: r.id as string,
    userId: r.user_id as string,
    scentProductId: r.scent_product_id as string,
    pairedWith: r.paired_with as PairingActivity,
    pairingCount: (r.pairing_count as number) || 1,
    createdAt: r.created_at as string,
  };
}

export async function getScentProducts(userId: string): Promise<ScentProduct[]> {
  const { data } = await supabase
    .from('scent_products')
    .select('*')
    .eq('user_id', userId)
    .order('is_signature', { ascending: false })
    .order('category')
    .order('product_name');
  return (data || []).map(rowToScent);
}

export async function addScentProduct(userId: string, input: ScentInput): Promise<ScentProduct | null> {
  const row: Record<string, unknown> = {
    user_id: userId,
    category: input.category,
    product_name: input.productName,
  };
  if (input.brand) row.brand = input.brand;
  if (input.scentNotes) row.scent_notes = input.scentNotes;
  if (input.isSignature) row.is_signature = input.isSignature;
  if (input.purchasePrice != null) row.purchase_price = input.purchasePrice;
  if (input.notes) row.notes = input.notes;

  const { data, error } = await supabase
    .from('scent_products')
    .insert(row)
    .select()
    .single();
  if (error || !data) return null;
  return rowToScent(data);
}

export async function toggleScentRestock(productId: string, needsRestock: boolean): Promise<void> {
  await supabase
    .from('scent_products')
    .update({ needs_restock: needsRestock })
    .eq('id', productId);
}

export async function deleteScentProduct(productId: string): Promise<void> {
  await supabase.from('scent_products').delete().eq('id', productId);
}

export async function getScentPairings(userId: string): Promise<ScentPairing[]> {
  const { data } = await supabase
    .from('scent_pairings')
    .select('*')
    .eq('user_id', userId);
  return (data || []).map(rowToPairing);
}

export async function addOrIncrementPairing(
  userId: string,
  productId: string,
  activity: PairingActivity
): Promise<void> {
  // Check if pairing exists
  const { data: existing } = await supabase
    .from('scent_pairings')
    .select('id, pairing_count')
    .eq('user_id', userId)
    .eq('scent_product_id', productId)
    .eq('paired_with', activity)
    .maybeSingle();

  if (existing) {
    await supabase
      .from('scent_pairings')
      .update({ pairing_count: ((existing.pairing_count as number) || 0) + 1 })
      .eq('id', existing.id);
  } else {
    await supabase
      .from('scent_pairings')
      .insert({
        user_id: userId,
        scent_product_id: productId,
        paired_with: activity,
        pairing_count: 1,
      });
  }
}

// =============================
// Anchor Objects
// =============================

function rowToAnchor(r: Record<string, unknown>): AnchorObject {
  return {
    id: r.id as string,
    userId: r.user_id as string,
    name: r.name as string,
    category: r.category as AnchorObject['category'],
    description: r.description as string | null,
    wearFrequency: (r.wear_frequency as AnchorObject['wearFrequency']) || 'daily',
    isActive: r.is_active !== false,
    acquiredDate: r.acquired_date as string | null,
    cost: r.cost as number | null,
    notes: r.notes as string | null,
    createdAt: r.created_at as string,
  };
}

export async function getAnchors(userId: string): Promise<AnchorObject[]> {
  const { data } = await supabase
    .from('anchor_objects')
    .select('*')
    .eq('user_id', userId)
    .order('is_active', { ascending: false })
    .order('category')
    .order('name');
  return (data || []).map(rowToAnchor);
}

export async function addAnchor(userId: string, input: AnchorInput): Promise<AnchorObject | null> {
  const row: Record<string, unknown> = {
    user_id: userId,
    name: input.name,
    category: input.category,
  };
  if (input.description) row.description = input.description;
  if (input.wearFrequency) row.wear_frequency = input.wearFrequency;
  if (input.cost != null) row.cost = input.cost;
  if (input.acquiredDate) row.acquired_date = input.acquiredDate;
  if (input.notes) row.notes = input.notes;

  const { data, error } = await supabase
    .from('anchor_objects')
    .insert(row)
    .select()
    .single();
  if (error || !data) return null;
  return rowToAnchor(data);
}

export async function toggleAnchorActive(anchorId: string, isActive: boolean): Promise<void> {
  await supabase
    .from('anchor_objects')
    .update({ is_active: isActive })
    .eq('id', anchorId);
}

export async function deleteAnchor(anchorId: string): Promise<void> {
  await supabase.from('anchor_objects').delete().eq('id', anchorId);
}
