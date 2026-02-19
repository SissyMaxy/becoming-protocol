/**
 * Challenge Pipeline — Sprint 4
 * Fan suggestion → Handler evaluation → shoot prescription
 * Status flow: pending → approved/rejected → completed
 */

import { supabase } from '../supabase';
import type {
  AudienceChallenge,
  ChallengeStatus,
  ShootPrescription,
  ShootType,
  DbAudienceChallenge,
} from '../../types/industry';

// ============================================
// Types
// ============================================

interface ChallengeSubmission {
  fanUsername: string | null;
  platform: string | null;
  suggestion: string;
}

interface HandlerEvaluationResult {
  approved: boolean;
  evaluation: string;
  modifiedVersion: string | null;
  shootType: ShootType | null;
  safetyFlags: string[];
  engagementScore: number; // 1-10
}

// Hard-reject keywords for safety
const SAFETY_FILTERS = [
  'face reveal', 'real name', 'address', 'workplace', 'employer',
  'self-harm', 'blood', 'illegal', 'minor', 'child', 'underage',
  'meet up', 'meet in person', 'doxxing', 'blackmail',
];

// ============================================
// Submit Challenge
// ============================================

/**
 * Fan submits a challenge suggestion. Creates pending audience_challenges row.
 */
export async function submitChallenge(
  userId: string,
  submission: ChallengeSubmission,
): Promise<AudienceChallenge | null> {
  // Pre-filter safety
  const lowerSuggestion = submission.suggestion.toLowerCase();
  for (const keyword of SAFETY_FILTERS) {
    if (lowerSuggestion.includes(keyword)) {
      console.warn('Challenge rejected by safety filter:', keyword);
      return null;
    }
  }

  const { data, error } = await supabase
    .from('audience_challenges')
    .insert({
      user_id: userId,
      fan_username: submission.fanUsername,
      platform: submission.platform,
      suggestion: submission.suggestion,
      status: 'pending',
    })
    .select()
    .single();

  if (error || !data) {
    console.error('Failed to submit challenge:', error);
    return null;
  }

  return mapChallenge(data as DbAudienceChallenge);
}

// ============================================
// Handler Evaluation
// ============================================

/**
 * Handler evaluates a pending challenge.
 * Uses edge function for AI assessment, then updates the challenge row.
 */
export async function evaluateChallenge(
  userId: string,
  challengeId: string,
): Promise<HandlerEvaluationResult | null> {
  // Get the challenge
  const { data: challenge, error: fetchError } = await supabase
    .from('audience_challenges')
    .select('*')
    .eq('id', challengeId)
    .eq('user_id', userId)
    .single();

  if (fetchError || !challenge) {
    console.error('Failed to fetch challenge:', fetchError);
    return null;
  }

  // Call Handler AI for evaluation
  const evaluation = await callHandlerEvaluation(challenge.suggestion);

  // Update the challenge row
  const newStatus: ChallengeStatus = evaluation.approved ? 'approved' : 'rejected';
  const { error: updateError } = await supabase
    .from('audience_challenges')
    .update({
      handler_evaluation: evaluation.evaluation,
      handler_modified_version: evaluation.modifiedVersion,
      engagement_score: evaluation.engagementScore,
      status: newStatus,
    })
    .eq('id', challengeId)
    .eq('user_id', userId);

  if (updateError) {
    console.error('Failed to update challenge evaluation:', updateError);
    return null;
  }

  return evaluation;
}

/**
 * Call Handler AI to evaluate a fan challenge suggestion.
 * Returns approval, evaluation notes, optional modification, and safety flags.
 */
async function callHandlerEvaluation(
  suggestion: string,
): Promise<HandlerEvaluationResult> {
  try {
    const { data, error } = await supabase.functions.invoke('handler-coach', {
      body: {
        request_type: 'challenge_evaluation',
        context: {
          suggestion,
          evaluation_criteria: [
            'Is this safe? (no identity reveal, no meeting IRL, no self-harm)',
            'Is this producible? (can she actually do this with current equipment)',
            'Is this engaging? (will the audience care about the result)',
            'Does it align with the protocol? (feminization, denial, transformation)',
          ],
          output_format: 'Return JSON: { approved: boolean, evaluation: string, modifiedVersion: string|null, shootType: string|null, safetyFlags: string[], engagementScore: number }',
        },
      },
    });

    if (error) throw error;

    // Parse AI response
    const message = data?.message ?? '';
    try {
      const jsonMatch = message.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          approved: parsed.approved ?? false,
          evaluation: parsed.evaluation ?? 'Evaluated by Handler.',
          modifiedVersion: parsed.modifiedVersion ?? null,
          shootType: parsed.shootType as ShootType | null,
          safetyFlags: parsed.safetyFlags ?? [],
          engagementScore: Math.min(10, Math.max(1, parsed.engagementScore ?? 5)),
        };
      }
    } catch {
      // Fallback: couldn't parse JSON
    }

    // Fallback evaluation
    return {
      approved: false,
      evaluation: 'Handler could not evaluate this challenge. Defaulting to reject for safety.',
      modifiedVersion: null,
      shootType: null,
      safetyFlags: ['parse_failure'],
      engagementScore: 1,
    };
  } catch (err) {
    console.error('Handler evaluation API error:', err);
    return {
      approved: false,
      evaluation: 'Handler evaluation unavailable. Challenge held for manual review.',
      modifiedVersion: null,
      shootType: null,
      safetyFlags: ['api_error'],
      engagementScore: 1,
    };
  }
}

// ============================================
// Create Shoot from Challenge
// ============================================

/**
 * Convert an approved challenge into a shoot prescription.
 * Links back to the audience_challenges row.
 */
export async function createShootFromChallenge(
  userId: string,
  challengeId: string,
  denialDay: number,
): Promise<ShootPrescription | null> {
  // Get the approved challenge
  const { data: challenge, error: fetchError } = await supabase
    .from('audience_challenges')
    .select('*')
    .eq('id', challengeId)
    .eq('user_id', userId)
    .eq('status', 'approved')
    .single();

  if (fetchError || !challenge) {
    console.error('Failed to fetch approved challenge:', fetchError);
    return null;
  }

  const ch = challenge as DbAudienceChallenge;
  const description = ch.handler_modified_version ?? ch.suggestion;
  const shootType: ShootType = (ch.handler_evaluation?.includes('video')
    ? 'tease_video'
    : 'photo_set');

  // Create shoot prescription
  const { data: shoot, error: shootError } = await supabase
    .from('shoot_prescriptions')
    .insert({
      user_id: userId,
      title: `Fan Challenge: ${description.slice(0, 50)}`,
      denial_day: denialDay,
      shoot_type: shootType,
      outfit: 'Handler\'s choice (based on challenge)',
      setup: null,
      mood: 'Challenged. The audience dared you. Show them.',
      shot_list: [{ ref: 'challenge_custom', notes: description }],
      handler_note: `Fan challenge from ${ch.fan_username ?? 'anonymous'} on ${ch.platform ?? 'unknown'}. ${ch.handler_evaluation ?? ''}`,
      estimated_minutes: 10,
      denial_badge_color: denialDay >= 5 ? '#EC4899' : denialDay >= 3 ? '#F59E0B' : '#3B82F6',
      content_level: 'implied',
      poll_id: null,
      scheduled_for: new Date().toISOString(),
      media_paths: [],
      selected_media: [],
      primary_platform: ch.platform ?? 'reddit',
      secondary_platforms: ['twitter', 'onlyfans'],
      caption_draft: `You challenged me. I delivered. 🥺 (Challenge from ${ch.fan_username ? '@' + ch.fan_username : 'a fan'})`,
      hashtags: null,
      status: 'prescribed',
    })
    .select()
    .single();

  if (shootError || !shoot) {
    console.error('Failed to create shoot from challenge:', shootError);
    return null;
  }

  // Link challenge to shoot
  await supabase
    .from('audience_challenges')
    .update({
      shoot_prescription_id: shoot.id,
      status: 'completed' as ChallengeStatus,
    })
    .eq('id', challengeId)
    .eq('user_id', userId);

  return {
    id: shoot.id,
    userId: shoot.user_id,
    title: shoot.title,
    denialDay: shoot.denial_day,
    shootType: shoot.shoot_type as ShootType,
    outfit: shoot.outfit,
    setup: shoot.setup,
    mood: shoot.mood,
    shotList: shoot.shot_list ?? [],
    handlerNote: shoot.handler_note,
    estimatedMinutes: shoot.estimated_minutes,
    denialBadgeColor: shoot.denial_badge_color,
    contentLevel: shoot.content_level,
    pollId: shoot.poll_id,
    scheduledFor: shoot.scheduled_for,
    mediaPaths: shoot.media_paths ?? [],
    selectedMedia: shoot.selected_media ?? [],
    primaryPlatform: shoot.primary_platform,
    secondaryPlatforms: shoot.secondary_platforms ?? [],
    captionDraft: shoot.caption_draft,
    hashtags: shoot.hashtags,
    status: shoot.status as ShootPrescription['status'],
    skippedAt: shoot.skipped_at,
    skipConsequence: shoot.skip_consequence,
    createdAt: shoot.created_at,
    updatedAt: shoot.updated_at,
  };
}

// ============================================
// Get Challenges
// ============================================

/**
 * Get challenges by status.
 */
export async function getChallenges(
  userId: string,
  status?: ChallengeStatus,
): Promise<AudienceChallenge[]> {
  let query = supabase
    .from('audience_challenges')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query.limit(50);

  if (error || !data) {
    console.error('Failed to get challenges:', error);
    return [];
  }

  return (data as DbAudienceChallenge[]).map(mapChallenge);
}

/**
 * Get pending challenges count (for badge display).
 */
export async function getPendingChallengeCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('audience_challenges')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'pending');

  if (error) return 0;
  return count ?? 0;
}

// ============================================
// Mapper
// ============================================

function mapChallenge(row: DbAudienceChallenge): AudienceChallenge {
  return {
    id: row.id,
    userId: row.user_id,
    fanUsername: row.fan_username,
    platform: row.platform,
    suggestion: row.suggestion,
    handlerEvaluation: row.handler_evaluation,
    handlerModifiedVersion: row.handler_modified_version,
    status: row.status as ChallengeStatus,
    shootPrescriptionId: row.shoot_prescription_id,
    engagementScore: row.engagement_score,
    createdAt: row.created_at,
  };
}
