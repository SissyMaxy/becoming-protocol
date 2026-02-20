/**
 * Ritual Anchors
 *
 * Manages conditioned triggers being installed through session repetition.
 * Seeds initial anchors, auto-increments strength after sessions,
 * and provides the Lovense signature pattern.
 */

import { supabase } from './supabase';
import type { RitualAnchor, AnchorStrength } from '../types/hypno-session';
import { INITIAL_ANCHORS } from '../types/hypno-session';

// ============================================
// STRENGTH THRESHOLDS
// ============================================

function computeStrength(sessionsPaired: number): AnchorStrength {
  if (sessionsPaired >= 31) return 'conditioned';
  if (sessionsPaired >= 16) return 'established';
  if (sessionsPaired >= 6) return 'forming';
  return 'nascent';
}

// ============================================
// CRUD
// ============================================

/**
 * Get all active ritual anchors for a user.
 */
export async function getActiveAnchors(userId: string): Promise<RitualAnchor[]> {
  const { data } = await supabase
    .from('ritual_anchors')
    .select('*')
    .eq('user_id', userId)
    .eq('active', true)
    .order('anchor_type');

  return (data as RitualAnchor[]) || [];
}

/**
 * Seed initial anchors for a user if none exist.
 * Idempotent — skips if any anchors already exist.
 */
export async function seedInitialAnchors(userId: string): Promise<void> {
  const { count } = await supabase
    .from('ritual_anchors')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (count && count > 0) return; // Already seeded

  const rows = INITIAL_ANCHORS.map(anchor => ({
    user_id: userId,
    anchor_type: anchor.anchor_type,
    anchor_value: anchor.anchor_value,
    sessions_paired: 0,
    estimated_strength: 'nascent' as AnchorStrength,
    autonomous_trigger_observed: false,
    handler_notes: anchor.handler_notes,
    active: true,
  }));

  await supabase.from('ritual_anchors').insert(rows);
}

/**
 * Auto-increment anchor strength after a session completes.
 * Call this after buildSessionSummary with the anchor IDs that were active.
 */
export async function incrementAnchorsAfterSession(
  userId: string,
  activeAnchorIds: string[],
): Promise<void> {
  if (activeAnchorIds.length === 0) return;

  const now = new Date().toISOString();

  for (const anchorId of activeAnchorIds) {
    // Fetch current state
    const { data: anchor } = await supabase
      .from('ritual_anchors')
      .select('sessions_paired, first_paired')
      .eq('id', anchorId)
      .eq('user_id', userId)
      .single();

    if (!anchor) continue;

    const newCount = (anchor.sessions_paired || 0) + 1;
    const newStrength = computeStrength(newCount);

    await supabase
      .from('ritual_anchors')
      .update({
        sessions_paired: newCount,
        estimated_strength: newStrength,
        first_paired: anchor.first_paired || now,
        last_paired: now,
      })
      .eq('id', anchorId)
      .eq('user_id', userId);
  }
}

/**
 * Mark all active anchors as triggered for a session.
 * Returns the IDs of the anchors that were activated.
 */
export async function activateAllAnchors(userId: string): Promise<string[]> {
  const anchors = await getActiveAnchors(userId);
  return anchors.map(a => a.id);
}

// ============================================
// LOVENSE RITUAL PATTERN
// ============================================

/**
 * Execute the opening ritual Lovense pattern:
 * 3x 0.5s pulses at intensity 8, then steady at intensity 3.
 */
export async function playRitualPattern(
  setIntensity: (level: number) => Promise<void>,
): Promise<void> {
  // Three short pulses
  for (let i = 0; i < 3; i++) {
    await setIntensity(8);
    await sleep(500);
    await setIntensity(0);
    await sleep(300);
  }

  // Steady low
  await sleep(200);
  await setIntensity(3);
}

/**
 * Fade Lovense to zero for closing.
 */
export async function fadeToZero(
  setIntensity: (level: number) => Promise<void>,
  currentIntensity: number,
): Promise<void> {
  let level = currentIntensity;
  while (level > 0) {
    level = Math.max(0, level - 1);
    await setIntensity(level);
    await sleep(300);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
