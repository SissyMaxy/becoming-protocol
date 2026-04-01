/**
 * Proof-of-Life Verification Code System
 *
 * When the Handler demands a photo, the app displays a random 4-digit code.
 * The photo must include this code visible. The code expires in 5 minutes.
 * She can't reuse old photos. She can't use someone else's photos.
 * Every verification is timestamped and unique.
 *
 * Tables: handler_directives (stores proof codes as directives)
 */

import { supabase } from '../supabase';

// ============================================
// TYPES
// ============================================

export interface ProofOfLife {
  code: string;
  expiresAt: string;
  mandateType: string;
}

export interface ProofValidation {
  valid: boolean;
  reason: string;
  expired: boolean;
  codeMatched: boolean;
}

// ============================================
// CODE GENERATION
// ============================================

/**
 * Generate a random 4-digit proof code for a user.
 * Stores in DB with 5-minute expiry. Returns the code.
 * Invalidates any previous active codes to prevent stockpiling.
 */
export async function generateProofCode(
  userId: string,
  mandateType: string = 'photo',
): Promise<ProofOfLife> {
  // Invalidate any existing active codes — no stockpiling
  await supabase
    .from('handler_directives')
    .update({ status: 'expired' })
    .eq('user_id', userId)
    .eq('directive_type', 'proof_of_life')
    .eq('status', 'pending');

  // Generate random 4-digit code (1000-9999, no leading zeros)
  const code = String(Math.floor(1000 + Math.random() * 9000));
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 5 * 60 * 1000).toISOString();

  const { error } = await supabase.from('handler_directives').insert({
    user_id: userId,
    directive_type: 'proof_of_life',
    status: 'pending',
    payload: {
      code,
      mandate_type: mandateType,
      expires_at: expiresAt,
      generated_at: now.toISOString(),
    },
    created_at: now.toISOString(),
  });

  if (error) {
    throw new Error(`Failed to generate proof code: ${error.message}`);
  }

  return { code, expiresAt, mandateType };
}

/**
 * Validate a submitted proof code against the active code for this user.
 * Checks: code matches, not expired, not already used.
 */
export async function validateProofCode(
  userId: string,
  submittedCode: string,
): Promise<ProofValidation> {
  const { data } = await supabase
    .from('handler_directives')
    .select('id, payload')
    .eq('user_id', userId)
    .eq('directive_type', 'proof_of_life')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) {
    return {
      valid: false,
      reason: 'No active proof code found. Either none was issued or it already expired.',
      expired: true,
      codeMatched: false,
    };
  }

  const payload = data.payload as { code: string; expires_at: string; mandate_type: string };
  const now = new Date();
  const expiresAt = new Date(payload.expires_at);

  // Check expiry first
  if (now > expiresAt) {
    // Mark as expired
    await supabase
      .from('handler_directives')
      .update({ status: 'expired' })
      .eq('id', data.id);

    return {
      valid: false,
      reason: 'Code expired. Time ran out. A new code will be issued.',
      expired: true,
      codeMatched: submittedCode === payload.code,
    };
  }

  // Check code match
  if (submittedCode !== payload.code) {
    return {
      valid: false,
      reason: 'Code does not match. The visible code in the photo must match exactly.',
      expired: false,
      codeMatched: false,
    };
  }

  // Valid — mark as used
  await supabase
    .from('handler_directives')
    .update({
      status: 'completed',
      payload: {
        ...payload,
        validated_at: now.toISOString(),
      },
    })
    .eq('id', data.id);

  return {
    valid: true,
    reason: 'Code verified. Photo accepted.',
    expired: false,
    codeMatched: true,
  };
}

/**
 * Get the currently active proof code for display (if any).
 * Returns null if no active code exists.
 */
export async function getActiveProofCode(userId: string): Promise<ProofOfLife | null> {
  const { data } = await supabase
    .from('handler_directives')
    .select('payload')
    .eq('user_id', userId)
    .eq('directive_type', 'proof_of_life')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;

  const payload = data.payload as { code: string; expires_at: string; mandate_type: string };
  const now = new Date();

  // Check if expired
  if (now > new Date(payload.expires_at)) {
    return null;
  }

  return {
    code: payload.code,
    expiresAt: payload.expires_at,
    mandateType: payload.mandate_type,
  };
}

/**
 * Build handler context block for proof-of-life system.
 */
export async function buildProofOfLifeContext(userId: string): Promise<string> {
  try {
    const active = await getActiveProofCode(userId);

    // Count recent verifications (last 7 days)
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const { count: recentVerifications } = await supabase
      .from('handler_directives')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('directive_type', 'proof_of_life')
      .eq('status', 'completed')
      .gte('created_at', weekAgo);

    const { count: recentExpired } = await supabase
      .from('handler_directives')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('directive_type', 'proof_of_life')
      .eq('status', 'expired')
      .gte('created_at', weekAgo);

    const lines: string[] = [];

    if (active) {
      lines.push(`PROOF-OF-LIFE: active code issued, expires ${new Date(active.expiresAt).toLocaleTimeString()}, type: ${active.mandateType}`);
    }

    if ((recentVerifications ?? 0) > 0 || (recentExpired ?? 0) > 0) {
      lines.push(`  verifications (7d): ${recentVerifications ?? 0} passed, ${recentExpired ?? 0} expired/failed`);
      if ((recentExpired ?? 0) > (recentVerifications ?? 0)) {
        lines.push('  WARNING: more expired than passed — she is letting codes expire (avoidance)');
      }
    }

    return lines.join('\n');
  } catch {
    return '';
  }
}
