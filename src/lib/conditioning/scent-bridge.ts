/**
 * Scent Conditioning Bridge
 *
 * Queries scent anchors and integrates them into conditioning sessions.
 * Records scent pairings and updates association strength based on
 * cumulative pairing count.
 */

import { supabase } from '../supabase';
import type { AssociationStrength } from '../../types/conditioning';

// ============================================
// SCENT INSTRUCTION
// ============================================

/**
 * Get scent application instruction for a session.
 * Returns null if no scent anchor is configured for the user.
 */
export async function getScentInstruction(userId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('scent_conditioning')
      .select('scent_name, scent_product, association_strength')
      .eq('user_id', userId)
      .order('sessions_paired', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;

    // If association is 'none' and product is TBD, still instruct — the anchor needs to start somewhere
    const product = data.scent_product || 'designated conditioning scent';
    return `Apply ${data.scent_name} scent (${product}) before beginning session`;
  } catch (err) {
    console.error('[scent-bridge] getScentInstruction exception:', err);
    return null;
  }
}

// ============================================
// SCENT PAIRING RECORDING
// ============================================

/**
 * Record that a scent was paired with a conditioning session.
 * Increments sessions_paired and recalculates association_strength.
 *
 * Strength thresholds:
 *   0-2 pairings  → weak
 *   3-5 pairings  → forming
 *   6-10 pairings → established
 *   11+ pairings  → strong
 */
export async function recordScentPairing(
  userId: string,
  _sessionId: string,
): Promise<boolean> {
  try {
    // Fetch current scent record
    const { data: scent, error: fetchErr } = await supabase
      .from('scent_conditioning')
      .select('id, sessions_paired')
      .eq('user_id', userId)
      .order('sessions_paired', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchErr || !scent) return false;

    const newCount = (scent.sessions_paired ?? 0) + 1;
    const strength = computeStrength(newCount);

    const { error: updateErr } = await supabase
      .from('scent_conditioning')
      .update({
        sessions_paired: newCount,
        association_strength: strength,
        updated_at: new Date().toISOString(),
      })
      .eq('id', scent.id);

    if (updateErr) {
      console.error('[scent-bridge] recordScentPairing update error:', updateErr.message);
      return false;
    }

    return true;
  } catch (err) {
    console.error('[scent-bridge] recordScentPairing exception:', err);
    return false;
  }
}

// ============================================
// INTERNAL
// ============================================

function computeStrength(sessionsPaired: number): AssociationStrength {
  if (sessionsPaired >= 11) return 'strong';
  if (sessionsPaired >= 6) return 'established';
  if (sessionsPaired >= 3) return 'forming';
  if (sessionsPaired >= 1) return 'weak';
  return 'none';
}
