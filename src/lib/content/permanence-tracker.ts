/**
 * Content Permanence Tracker
 * Irreversibility measurement layer (#3)
 *
 * Tier classification, sober acknowledgment, copy estimation,
 * deletion gating, and ratchet score calculation.
 */

import { supabase } from '../supabase';
import type {
  ContentPermanenceType,
  PermanencePlatform,
  CopyEstimationMethod,
  ContentPermanence,
  PermanenceSummary,
  TierClassification,
} from '../../types/content-permanence';

// ============================================
// TIER CLASSIFICATION
// ============================================

const TIER_WEIGHTS: Record<number, number> = {
  1: 0.0,
  2: 1.0,
  3: 3.0,
  4: 7.0,
  5: 15.0,
};

export interface ClassifyInput {
  faceVisible: boolean;
  voiceAudible: boolean;
  identifyingMarksVisible: boolean;
  legalNameConnected: boolean;
  platform: PermanencePlatform;
}

export function classifyTier(content: ClassifyInput): TierClassification {
  if (content.platform === 'local_only') {
    return { tier: 1, justification: 'Local only — never posted, fully deletable', ratchetWeight: 0.0 };
  }

  if (content.legalNameConnected) {
    return {
      tier: 5,
      justification: 'Cross-linked — legal identity connected to Maxy identity',
      ratchetWeight: 15.0,
    };
  }

  if (content.faceVisible && content.voiceAudible) {
    return {
      tier: 4,
      justification: 'Fully identifiable — clear face and voice visible',
      ratchetWeight: 7.0,
    };
  }

  if (content.faceVisible || content.voiceAudible || content.identifyingMarksVisible) {
    const parts: string[] = [];
    if (content.faceVisible) parts.push('face visible');
    if (content.voiceAudible) parts.push('voice audible');
    if (content.identifyingMarksVisible) parts.push('identifying marks visible');
    return {
      tier: 3,
      justification: `Partially identifiable — ${parts.join(', ')}`,
      ratchetWeight: 3.0,
    };
  }

  // Posted but anonymous
  return {
    tier: 2,
    justification: `Anonymous post on ${content.platform} — no face, voice, or identifying features`,
    ratchetWeight: 1.0,
  };
}

// ============================================
// CONTENT REGISTRATION
// ============================================

export interface RegisterContentInput {
  contentRef: string;
  contentType: ContentPermanenceType;
  platform: PermanencePlatform;
  faceVisible: boolean;
  voiceAudible: boolean;
  identifyingMarksVisible: boolean;
  legalNameConnected: boolean;
  postedAt?: string;
}

export async function registerContent(
  userId: string,
  input: RegisterContentInput
): Promise<ContentPermanence | null> {
  const classification = classifyTier({
    faceVisible: input.faceVisible,
    voiceAudible: input.voiceAudible,
    identifyingMarksVisible: input.identifyingMarksVisible,
    legalNameConnected: input.legalNameConnected,
    platform: input.platform,
  });

  const { data, error } = await supabase
    .from('content_permanence')
    .insert({
      user_id: userId,
      content_ref: input.contentRef,
      content_type: input.contentType,
      platform: input.platform,
      permanence_tier: classification.tier,
      tier_justification: classification.justification,
      ratchet_weight: classification.ratchetWeight,
      face_visible: input.faceVisible,
      voice_audible: input.voiceAudible,
      identifying_marks_visible: input.identifyingMarksVisible,
      legal_name_connected: input.legalNameConnected,
      posted_at: input.postedAt || (input.platform !== 'local_only' ? new Date().toISOString() : null),
    })
    .select('*')
    .single();

  if (error) {
    console.error('[PermanenceTracker] Failed to register content:', error.message);
    return null;
  }

  return data as ContentPermanence;
}

// ============================================
// SOBER ACKNOWLEDGMENT
// ============================================

export interface AcknowledgmentResult {
  accepted: boolean;
  reason?: string;
  tierAcknowledged?: number;
}

export async function acknowledgePermanence(
  userId: string,
  contentPermanenceId: string,
  arousalLevel: number,
  denialDay: number,
  statement: string
): Promise<AcknowledgmentResult> {
  if (arousalLevel > 2) {
    return {
      accepted: false,
      reason: 'Acknowledgment requires sober baseline (arousal <= 2)',
    };
  }

  // Get current content record
  const { data: content } = await supabase
    .from('content_permanence')
    .select('permanence_tier, posted_at')
    .eq('id', contentPermanenceId)
    .eq('user_id', userId)
    .single();

  if (!content) {
    return { accepted: false, reason: 'Content record not found' };
  }

  // Update content permanence
  await supabase
    .from('content_permanence')
    .update({
      sober_acknowledged: true,
      sober_acknowledged_at: new Date().toISOString(),
      sober_arousal_at_acknowledgment: arousalLevel,
      acknowledgment_statement: statement,
      updated_at: new Date().toISOString(),
    })
    .eq('id', contentPermanenceId);

  // Calculate time since posting
  const postedAt = content.posted_at ? new Date(content.posted_at) : null;
  const timeSincePosting = postedAt
    ? `${Math.floor((Date.now() - postedAt.getTime()) / (1000 * 60 * 60))} hours`
    : null;

  // Insert acknowledgment record
  await supabase
    .from('permanence_acknowledgments')
    .insert({
      user_id: userId,
      content_permanence_id: contentPermanenceId,
      arousal_level: arousalLevel,
      denial_day: denialDay,
      statement,
      handler_prompted: false,
      time_since_posting: timeSincePosting,
    });

  return { accepted: true, tierAcknowledged: content.permanence_tier };
}

// ============================================
// TIER ADVANCEMENT (ONE-WAY RATCHET)
// ============================================

export interface AdvancementResult {
  advanced: boolean;
  reason?: string;
  fromTier?: number;
  toTier?: number;
}

export async function advanceTier(
  userId: string,
  contentPermanenceId: string,
  newTier: number,
  reason: string,
  arousalLevel: number,
  handlerInitiated: boolean
): Promise<AdvancementResult> {
  const { data: content } = await supabase
    .from('content_permanence')
    .select('permanence_tier')
    .eq('id', contentPermanenceId)
    .eq('user_id', userId)
    .single();

  if (!content) {
    return { advanced: false, reason: 'Content record not found' };
  }

  if (newTier <= content.permanence_tier) {
    return {
      advanced: false,
      reason: `Cannot lower tier: current ${content.permanence_tier}, requested ${newTier}`,
    };
  }

  const newWeight = TIER_WEIGHTS[newTier] || 1.0;

  // Update content permanence
  await supabase
    .from('content_permanence')
    .update({
      permanence_tier: newTier,
      tier_justification: reason,
      ratchet_weight: newWeight,
      updated_at: new Date().toISOString(),
    })
    .eq('id', contentPermanenceId);

  // Log transition
  await supabase
    .from('permanence_tier_transitions')
    .insert({
      user_id: userId,
      content_permanence_id: contentPermanenceId,
      from_tier: content.permanence_tier,
      to_tier: newTier,
      transition_reason: reason,
      sober_at_transition: arousalLevel <= 2,
      arousal_at_transition: arousalLevel,
      handler_initiated: handlerInitiated,
    });

  return {
    advanced: true,
    fromTier: content.permanence_tier,
    toTier: newTier,
  };
}

// ============================================
// COPY ESTIMATION
// ============================================

export async function updateCopyEstimate(
  userId: string,
  contentPermanenceId: string,
  estimatedCopies: number,
  method: CopyEstimationMethod
): Promise<void> {
  const { error } = await supabase
    .from('content_permanence')
    .update({
      estimated_external_copies: estimatedCopies,
      copy_estimation_method: method,
      updated_at: new Date().toISOString(),
    })
    .eq('id', contentPermanenceId)
    .eq('user_id', userId);

  if (error) {
    console.warn('[PermanenceTracker] Copy estimate update failed:', error.message);
  }
}

// ============================================
// DELETION GATING
// ============================================

export interface DeletionAttemptResult {
  allowed: boolean;
  reason?: string;
}

export async function attemptDeletion(
  userId: string,
  contentPermanenceId: string
): Promise<DeletionAttemptResult> {
  const { data: content } = await supabase
    .from('content_permanence')
    .select('permanence_tier, estimated_external_copies, can_be_deleted')
    .eq('id', contentPermanenceId)
    .eq('user_id', userId)
    .single();

  if (!content) {
    return { allowed: false, reason: 'Content record not found' };
  }

  if (!content.can_be_deleted) {
    return {
      allowed: false,
      reason: `Content at tier ${content.permanence_tier} cannot be deleted — external copies estimated at ${content.estimated_external_copies}`,
    };
  }

  // Mark deletion attempted
  await supabase
    .from('content_permanence')
    .update({
      deletion_attempted: true,
      deletion_attempted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', contentPermanenceId);

  return { allowed: true };
}

// ============================================
// QUERIES
// ============================================

export async function getPermanenceSummary(
  userId: string
): Promise<PermanenceSummary | null> {
  const { data, error } = await supabase
    .from('permanence_summary')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) return null;
  return data as PermanenceSummary;
}

export async function getUnacknowledgedContent(
  userId: string
): Promise<ContentPermanence[]> {
  const { data, error } = await supabase
    .from('content_permanence')
    .select('*')
    .eq('user_id', userId)
    .eq('sober_acknowledged', false)
    .gte('permanence_tier', 2)
    .order('permanence_tier', { ascending: false });

  if (error || !data) return [];
  return data as ContentPermanence[];
}

export async function getPermanenceRatchetScore(userId: string): Promise<number> {
  const { data, error } = await supabase
    .from('content_permanence')
    .select('ratchet_weight')
    .eq('user_id', userId);

  if (error || !data) return 0;

  return data.reduce((sum, row) => sum + (row.ratchet_weight || 0), 0);
}
