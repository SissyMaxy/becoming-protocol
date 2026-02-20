/**
 * Hypno Library — Handler-curated content catalog
 *
 * CRUD for the hypno_library table. Items are curated by the Handler
 * and gated by denial day, protocol level, and cage requirement.
 * Each item has a capture_value indicating its content production potential.
 */

import { supabase } from './supabase';
import type {
  HypnoLibraryItem,
  DbHypnoLibraryItem,
  HypnoLibraryCategory,
  HypnoMediaType,
  HypnoCaptureType,
  HypnoLibraryStats,
} from '../types/hypno-bridge';
import { mapDbToHypnoLibraryItem } from '../types/hypno-bridge';

// ============================================
// ADD LIBRARY ITEM
// ============================================

export async function addLibraryItem(
  userId: string,
  item: {
    title: string;
    sourceUrl?: string;
    filePath?: string;
    mediaType: HypnoMediaType;
    contentCategory: HypnoLibraryCategory;
    intensity: 1 | 2 | 3 | 4 | 5;
    conditioningTargets?: string[];
    minDenialDay?: number;
    minProtocolLevel?: number;
    requiresCage?: boolean;
    captureValue?: number;
    captureType?: HypnoCaptureType;
    handlerNotes?: string;
  }
): Promise<HypnoLibraryItem | null> {
  const { data, error } = await supabase
    .from('hypno_library')
    .insert({
      user_id: userId,
      title: item.title,
      source_url: item.sourceUrl || null,
      file_path: item.filePath || null,
      media_type: item.mediaType,
      content_category: item.contentCategory,
      intensity: item.intensity,
      conditioning_targets: item.conditioningTargets || [],
      min_denial_day: item.minDenialDay ?? 0,
      min_protocol_level: item.minProtocolLevel ?? 1,
      requires_cage: item.requiresCage ?? false,
      capture_value: item.captureValue ?? 0,
      capture_type: item.captureType || null,
      handler_notes: item.handlerNotes || null,
    })
    .select()
    .single();

  if (error || !data) {
    console.error('[HypnoLibrary] Failed to add item:', error?.message);
    return null;
  }

  return mapDbToHypnoLibraryItem(data as DbHypnoLibraryItem);
}

// ============================================
// GET AVAILABLE ITEMS (with gating)
// ============================================

export async function getAvailableLibraryItems(
  userId: string,
  options?: {
    category?: HypnoLibraryCategory;
    maxIntensity?: number;
    captureValueMin?: number;
  }
): Promise<HypnoLibraryItem[]> {
  // Pre-fetch denial state for cage gating
  const { data: denialState } = await supabase
    .from('denial_state')
    .select('current_denial_day, is_locked')
    .eq('user_id', userId)
    .maybeSingle();

  const denialDay = denialState?.current_denial_day || 0;
  const isLocked = denialState?.is_locked || false;

  let query = supabase
    .from('hypno_library')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .lte('min_denial_day', denialDay);

  // Filter out cage-required items if not locked
  if (!isLocked) {
    query = query.eq('requires_cage', false);
  }

  if (options?.category) {
    query = query.eq('content_category', options.category);
  }

  if (options?.maxIntensity) {
    query = query.lte('intensity', options.maxIntensity);
  }

  if (options?.captureValueMin) {
    query = query.gte('capture_value', options.captureValueMin);
  }

  // Prefer high capture value, least-used items
  query = query.order('capture_value', { ascending: false });
  query = query.order('times_used', { ascending: true });

  const { data, error } = await query;

  if (error) {
    console.error('[HypnoLibrary] Failed to get items:', error.message);
    return [];
  }

  return (data || []).map(d => mapDbToHypnoLibraryItem(d as DbHypnoLibraryItem));
}

// ============================================
// GET SINGLE ITEM
// ============================================

export async function getLibraryItem(
  userId: string,
  itemId: string
): Promise<HypnoLibraryItem | null> {
  const { data } = await supabase
    .from('hypno_library')
    .select('*')
    .eq('id', itemId)
    .eq('user_id', userId)
    .single();

  if (!data) return null;
  return mapDbToHypnoLibraryItem(data as DbHypnoLibraryItem);
}

// ============================================
// RECORD USAGE
// ============================================

export async function recordLibraryUsage(
  userId: string,
  itemId: string
): Promise<void> {
  // Read current count, then increment
  const { data: existing } = await supabase
    .from('hypno_library')
    .select('times_used')
    .eq('id', itemId)
    .eq('user_id', userId)
    .single();

  if (!existing) return;

  await supabase
    .from('hypno_library')
    .update({
      times_used: (existing.times_used || 0) + 1,
      last_used_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', itemId)
    .eq('user_id', userId);
}

// ============================================
// LIBRARY STATS (for Handler context)
// ============================================

export async function getLibraryStats(userId: string): Promise<HypnoLibraryStats> {
  const { data } = await supabase
    .from('hypno_library')
    .select('content_category, capture_value, created_at')
    .eq('user_id', userId)
    .eq('is_active', true);

  if (!data || data.length === 0) {
    return { totalItems: 0, byCategory: {}, avgCaptureValue: 0 };
  }

  const byCategory: Partial<Record<HypnoLibraryCategory, number>> = {};
  let captureSum = 0;

  for (const row of data) {
    const cat = row.content_category as HypnoLibraryCategory;
    byCategory[cat] = (byCategory[cat] || 0) + 1;
    captureSum += row.capture_value || 0;
  }

  // Find last added
  const sorted = [...data].sort((a, b) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return {
    totalItems: data.length,
    byCategory,
    avgCaptureValue: captureSum / data.length,
    lastAddedAt: sorted[0]?.created_at,
  };
}
