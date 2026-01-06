// Commitments Library
// Arousal-gated commitment management

import { supabase } from './supabase';
import type {
  ArousalGatedCommitment,
  DbArousalGatedCommitment,
  UserCommitment,
  DbUserCommitment,
  BindingLevel,
  ArousalState,
  CommitmentEvidence,
} from '../types/commitments';
import { BINDING_LEVEL_INFO } from '../types/commitments';

// ============================================
// CONVERTERS
// ============================================

function dbCommitmentToCommitment(db: DbArousalGatedCommitment): ArousalGatedCommitment {
  return {
    id: db.id,
    commitmentType: db.commitment_type,
    description: db.description,
    requiresArousalState: db.requires_arousal_state,
    requiresDenialDay: db.requires_denial_day,
    requiresPhase: db.requires_phase,
    bindingLevel: db.binding_level as BindingLevel,
    active: db.active,
  };
}

function dbUserCommitmentToUserCommitment(db: DbUserCommitment): UserCommitment {
  return {
    id: db.id,
    commitmentId: db.commitment_id || undefined,
    commitment: db.arousal_gated_commitments
      ? dbCommitmentToCommitment(db.arousal_gated_commitments)
      : undefined,
    commitmentText: db.commitment_text,
    bindingLevel: db.binding_level as BindingLevel,
    madeAt: db.made_at,
    arousalState: db.arousal_state as ArousalState | undefined,
    denialDay: db.denial_day || undefined,
    status: db.status as UserCommitment['status'],
    brokenAt: db.broken_at || undefined,
    fulfilledAt: db.fulfilled_at || undefined,
    evidence: db.evidence || undefined,
  };
}

// ============================================
// COMMITMENT QUERIES
// ============================================

export async function getAllCommitmentTypes(): Promise<ArousalGatedCommitment[]> {
  const { data, error } = await supabase
    .from('arousal_gated_commitments')
    .select('*')
    .eq('active', true)
    .order('requires_phase')
    .order('requires_denial_day');

  if (error) throw error;
  return (data || []).map(dbCommitmentToCommitment);
}

export async function getUserCommitments(): Promise<UserCommitment[]> {
  const { data, error } = await supabase
    .from('user_commitments')
    .select(`
      *,
      arousal_gated_commitments (*)
    `)
    .order('made_at', { ascending: false });

  if (error) throw error;
  return (data || []).map(dbUserCommitmentToUserCommitment);
}

export async function getActiveCommitments(): Promise<UserCommitment[]> {
  const { data, error } = await supabase
    .from('user_commitments')
    .select(`
      *,
      arousal_gated_commitments (*)
    `)
    .eq('status', 'active')
    .order('made_at', { ascending: false });

  if (error) throw error;
  return (data || []).map(dbUserCommitmentToUserCommitment);
}

// ============================================
// COMMITMENT AVAILABILITY
// ============================================

interface CommitmentContext {
  arousalState: ArousalState;
  denialDay: number;
  phase: number;
}

export async function getAvailableCommitments(
  context: CommitmentContext
): Promise<ArousalGatedCommitment[]> {
  const allCommitments = await getAllCommitmentTypes();
  const userCommitments = await getUserCommitments();

  // Get already made commitment types
  const madeTypes = new Set(
    userCommitments
      .filter(uc => uc.status !== 'broken')
      .map(uc => uc.commitment?.commitmentType)
      .filter(Boolean)
  );

  return allCommitments.filter(commitment => {
    // Skip if already made
    if (madeTypes.has(commitment.commitmentType)) return false;

    // Check arousal state
    if (!commitment.requiresArousalState.includes(context.arousalState)) {
      return false;
    }

    // Check denial day
    if (context.denialDay < commitment.requiresDenialDay) {
      return false;
    }

    // Check phase
    if (context.phase < commitment.requiresPhase) {
      return false;
    }

    return true;
  });
}

export function canMakeCommitment(
  commitment: ArousalGatedCommitment,
  context: CommitmentContext
): { canMake: boolean; reason?: string } {
  if (!commitment.requiresArousalState.includes(context.arousalState)) {
    const required = commitment.requiresArousalState.join(' or ');
    return {
      canMake: false,
      reason: `Requires arousal state: ${required}. You are currently: ${context.arousalState}`,
    };
  }

  if (context.denialDay < commitment.requiresDenialDay) {
    return {
      canMake: false,
      reason: `Requires denial day ${commitment.requiresDenialDay}+. You are on day ${context.denialDay}.`,
    };
  }

  if (context.phase < commitment.requiresPhase) {
    return {
      canMake: false,
      reason: `Requires phase ${commitment.requiresPhase}+. You are in phase ${context.phase}.`,
    };
  }

  return { canMake: true };
}

// ============================================
// MAKING COMMITMENTS
// ============================================

export async function makeCommitment(
  commitmentId: string | null,
  commitmentText: string,
  bindingLevel: BindingLevel,
  context: {
    arousalState?: ArousalState;
    denialDay?: number;
  }
): Promise<UserCommitment> {
  const { data, error } = await supabase
    .from('user_commitments')
    .insert({
      commitment_id: commitmentId,
      commitment_text: commitmentText,
      binding_level: bindingLevel,
      arousal_state: context.arousalState,
      denial_day: context.denialDay,
      status: 'active',
    })
    .select(`
      *,
      arousal_gated_commitments (*)
    `)
    .single();

  if (error) throw error;
  return dbUserCommitmentToUserCommitment(data);
}

export async function makeCustomCommitment(
  commitmentText: string,
  bindingLevel: BindingLevel,
  context: {
    arousalState?: ArousalState;
    denialDay?: number;
  }
): Promise<UserCommitment> {
  return makeCommitment(null, commitmentText, bindingLevel, context);
}

// ============================================
// COMMITMENT STATUS UPDATES
// ============================================

export async function fulfillCommitment(
  commitmentId: string,
  evidence?: CommitmentEvidence
): Promise<void> {
  const { error } = await supabase
    .from('user_commitments')
    .update({
      status: 'fulfilled',
      fulfilled_at: new Date().toISOString(),
      evidence,
    })
    .eq('id', commitmentId);

  if (error) throw error;
}

export async function breakCommitment(
  commitmentId: string,
  reason?: string
): Promise<{ success: boolean; consequence: string }> {
  // Get commitment to check binding level
  const { data: commitment, error: fetchError } = await supabase
    .from('user_commitments')
    .select('binding_level')
    .eq('id', commitmentId)
    .single();

  if (fetchError) throw fetchError;

  const bindingLevel = commitment.binding_level as BindingLevel;
  const info = BINDING_LEVEL_INFO[bindingLevel];

  if (!info.canBreak) {
    return {
      success: false,
      consequence: 'This commitment cannot be broken. It is permanent.',
    };
  }

  const { error } = await supabase
    .from('user_commitments')
    .update({
      status: 'broken',
      broken_at: new Date().toISOString(),
      evidence: reason ? { notes: [reason] } : undefined,
    })
    .eq('id', commitmentId);

  if (error) throw error;

  return {
    success: true,
    consequence: info.breakConsequence,
  };
}

// ============================================
// COMMITMENT STATS
// ============================================

export async function getCommitmentStats(): Promise<{
  total: number;
  active: number;
  fulfilled: number;
  broken: number;
  permanent: number;
}> {
  const commitments = await getUserCommitments();

  return {
    total: commitments.length,
    active: commitments.filter(c => c.status === 'active').length,
    fulfilled: commitments.filter(c => c.status === 'fulfilled').length,
    broken: commitments.filter(c => c.status === 'broken').length,
    permanent: commitments.filter(c => c.bindingLevel === 'permanent').length,
  };
}

// ============================================
// AROUSAL STATE FRAMING
// ============================================

export function getArousalCommitmentFraming(arousalState: ArousalState): string {
  const framings: Record<ArousalState, string> = {
    baseline: 'You are thinking clearly. Commitments made now are considered.',
    building: 'Your arousal is building. Your truth is emerging.',
    sweet_spot:
      'You are in the sweet spot. Your aroused self knows what you want. Trust her.',
    overwhelming:
      'You are overwhelmed with need. In this state, your deepest truth speaks. Listen to her.',
    subspace:
      'You have surrendered. Your aroused self has taken over. She knows the truth. Honor her.',
  };

  return framings[arousalState];
}

export function getPostCommitmentMessage(bindingLevel: BindingLevel): string {
  const messages: Record<BindingLevel, string> = {
    soft: 'You made a promise to yourself. Honor it.',
    hard:
      'You made a binding commitment while aroused. Your horny self knew what she wanted. Honor her decision.',
    permanent:
      'This is permanent. Your aroused self made this decision. She knew what she wanted. There is no going back.',
  };

  return messages[bindingLevel];
}
