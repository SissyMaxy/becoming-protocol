/**
 * Creator Outreach — Sprint 5
 * Relationship building with similar-size creators.
 * Handler manages the full relationship arc:
 * comment → follow → interact → DM → conversation → cross-promo.
 * Genuine, not transactional.
 */

import { supabase } from '../supabase';
import { buildVoicePrompt } from './voice-bible';

// ============================================
// Types
// ============================================

export type RelationshipStage =
  | 'identified'
  | 'engaged'
  | 'connected'
  | 'active_promo';

export interface CreatorProfile {
  id: string;
  userId: string;
  platform: string;
  username: string;
  displayName: string | null;
  followerCount: number | null;
  contentOverlap: string[];
  relationshipStage: RelationshipStage;
  firstEngagedAt: string | null;
  lastEngagedAt: string | null;
  publicInteractions: number;
  dmsSent: number;
  crossPromos: number;
  handlerNotes: string | null;
  createdAt: string;
}

interface OutreachCandidate {
  username: string;
  platform: string;
  followerCount: number;
  contentOverlap: string[];
  reason: string;
}

interface OutreachAction {
  type: 'comment' | 'follow' | 'dm' | 'cross_promo';
  creatorId: string;
  platform: string;
  text: string;
  handlerIntent: string;
}

// ============================================
// Target Criteria
// ============================================

const OUTREACH_CRITERIA = {
  minFollowers: 100,
  maxFollowers: 5000,
  platforms: ['reddit', 'twitter'] as string[],
  contentOverlapRequired: ['chastity', 'sissy', 'femboy', 'cage', 'denial', 'trans'],
  maxDmsPerDay: 2,
  minPublicInteractionsBeforeDm: 3,
  daysBetweenDmAttempts: 7,
} as const;

// Relationship progression rules
const PROGRESSION_RULES: Record<RelationshipStage, {
  nextStage: RelationshipStage | null;
  requirement: string;
  minDays: number;
}> = {
  identified: {
    nextStage: 'engaged',
    requirement: 'First public interaction (comment or like)',
    minDays: 0,
  },
  engaged: {
    nextStage: 'connected',
    requirement: '3+ public interactions over 7+ days, then DM',
    minDays: 7,
  },
  connected: {
    nextStage: 'active_promo',
    requirement: 'DM conversation established, mutual interest',
    minDays: 14,
  },
  active_promo: {
    nextStage: null,
    requirement: 'Ongoing cross-promotion',
    minDays: 0,
  },
};

// ============================================
// Core Functions
// ============================================

/**
 * Get all tracked creator relationships.
 */
export async function getCreatorRelationships(
  userId: string,
  stage?: RelationshipStage,
): Promise<CreatorProfile[]> {
  let query = supabase
    .from('creator_outreach')
    .select('*')
    .eq('user_id', userId)
    .order('last_engaged_at', { ascending: false });

  if (stage) {
    query = query.eq('relationship_stage', stage);
  }

  const { data, error } = await query.limit(50);

  if (error || !data) return [];
  return data.map(mapCreatorProfile);
}

/**
 * Add a new creator to track.
 */
export async function trackCreator(
  userId: string,
  candidate: OutreachCandidate,
): Promise<CreatorProfile | null> {
  const { data, error } = await supabase
    .from('creator_outreach')
    .insert({
      user_id: userId,
      platform: candidate.platform,
      username: candidate.username,
      display_name: null,
      follower_count: candidate.followerCount,
      content_overlap: candidate.contentOverlap,
      relationship_stage: 'identified',
      public_interactions: 0,
      dms_sent: 0,
      cross_promos: 0,
      handler_notes: candidate.reason,
    })
    .select()
    .single();

  if (error || !data) {
    console.error('Failed to track creator:', error);
    return null;
  }

  return mapCreatorProfile(data);
}

/**
 * Record a public interaction with a creator.
 */
export async function recordCreatorInteraction(
  userId: string,
  creatorId: string,
  interactionType: 'comment' | 'like' | 'reply' | 'follow',
): Promise<void> {
  const { data: creator } = await supabase
    .from('creator_outreach')
    .select('public_interactions, relationship_stage, first_engaged_at')
    .eq('id', creatorId)
    .eq('user_id', userId)
    .single();

  if (!creator) return;

  const patch: Record<string, unknown> = {
    public_interactions: (creator.public_interactions ?? 0) + 1,
    last_engaged_at: new Date().toISOString(),
  };

  if (!creator.first_engaged_at) {
    patch.first_engaged_at = new Date().toISOString();
  }

  // Auto-advance from identified to engaged
  if (creator.relationship_stage === 'identified') {
    patch.relationship_stage = 'engaged';
  }

  await supabase
    .from('creator_outreach')
    .update(patch)
    .eq('id', creatorId)
    .eq('user_id', userId);

  // Log as autonomous action
  await supabase.from('handler_autonomous_actions').insert({
    user_id: userId,
    action_type: interactionType === 'follow' ? 'follow' : 'engagement_reply',
    platform: 'multi',
    target_username: creatorId,
    handler_intent: `Creator outreach: ${interactionType}. Building relationship.`,
  });
}

/**
 * Record a DM sent to a creator.
 */
export async function recordCreatorDm(
  userId: string,
  creatorId: string,
  dmText: string,
): Promise<void> {
  const { data: creator } = await supabase
    .from('creator_outreach')
    .select('dms_sent, relationship_stage')
    .eq('id', creatorId)
    .eq('user_id', userId)
    .single();

  if (!creator) return;

  const patch: Record<string, unknown> = {
    dms_sent: (creator.dms_sent ?? 0) + 1,
    last_engaged_at: new Date().toISOString(),
  };

  // Auto-advance from engaged to connected on first DM
  if (creator.relationship_stage === 'engaged') {
    patch.relationship_stage = 'connected';
  }

  await supabase
    .from('creator_outreach')
    .update(patch)
    .eq('id', creatorId)
    .eq('user_id', userId);

  // Log
  await supabase.from('handler_autonomous_actions').insert({
    user_id: userId,
    action_type: 'creator_dm',
    platform: 'multi',
    target_username: creatorId,
    content_text: dmText,
    handler_intent: 'Creator outreach: DM. Genuine connection, not promo.',
  });
}

/**
 * Record a cross-promotion.
 */
export async function recordCrossPromo(
  userId: string,
  creatorId: string,
): Promise<void> {
  const { data: creator } = await supabase
    .from('creator_outreach')
    .select('cross_promos, relationship_stage')
    .eq('id', creatorId)
    .eq('user_id', userId)
    .single();

  if (!creator) return;

  await supabase
    .from('creator_outreach')
    .update({
      cross_promos: (creator.cross_promos ?? 0) + 1,
      relationship_stage: 'active_promo',
      last_engaged_at: new Date().toISOString(),
    })
    .eq('id', creatorId)
    .eq('user_id', userId);

  await supabase.from('handler_autonomous_actions').insert({
    user_id: userId,
    action_type: 'cross_promo',
    platform: 'multi',
    target_username: creatorId,
    handler_intent: 'Creator cross-promotion. Mutual audience sharing.',
  });
}

// ============================================
// Outreach Planning
// ============================================

/**
 * Determine if outreach should happen today.
 * Max 2 DMs per day, respect cooldowns.
 */
export async function shouldDoOutreach(userId: string): Promise<boolean> {
  const today = new Date().toISOString().split('T')[0];

  // Count today's creator DMs
  const { count } = await supabase
    .from('handler_autonomous_actions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('action_type', 'creator_dm')
    .gte('created_at', `${today}T00:00:00`);

  return (count ?? 0) < OUTREACH_CRITERIA.maxDmsPerDay;
}

/**
 * Get creators who are ready for the next outreach step.
 */
export async function getOutreachReady(userId: string): Promise<OutreachAction[]> {
  const creators = await getCreatorRelationships(userId);
  const actions: OutreachAction[] = [];

  for (const creator of creators) {
    const rule = PROGRESSION_RULES[creator.relationshipStage];
    if (!rule.nextStage) continue; // Already at max stage

    const daysSinceFirst = creator.firstEngagedAt
      ? Math.floor(
          (Date.now() - new Date(creator.firstEngagedAt).getTime()) / (24 * 60 * 60 * 1000),
        )
      : 0;

    // Engaged → Connected: needs 3+ interactions over 7+ days
    if (
      creator.relationshipStage === 'engaged' &&
      creator.publicInteractions >= OUTREACH_CRITERIA.minPublicInteractionsBeforeDm &&
      daysSinceFirst >= rule.minDays
    ) {
      // Voice prompt available via buildVoicePrompt('dm_creator') when generating DM text
      actions.push({
        type: 'dm',
        creatorId: creator.id,
        platform: creator.platform,
        text: '', // To be generated by AI
        handlerIntent: `Ready for DM. ${creator.publicInteractions} public interactions over ${daysSinceFirst} days. Genuine connection, not promo.`,
      });
    }

    // Identified → Engaged: needs first interaction
    if (creator.relationshipStage === 'identified') {
      actions.push({
        type: 'comment',
        creatorId: creator.id,
        platform: creator.platform,
        text: '',
        handlerIntent: `First engagement with ${creator.username}. Comment on their content.`,
      });
    }
  }

  return actions;
}

/**
 * Generate an outreach DM using AI.
 */
export async function generateOutreachDm(
  _userId: string,
  creator: CreatorProfile,
): Promise<string | null> {
  const voicePrompt = buildVoicePrompt('dm_creator');

  try {
    const { data, error } = await supabase.functions.invoke('handler-coach', {
      body: {
        request_type: 'creator_outreach_dm',
        context: {
          voice: voicePrompt,
          creator_username: creator.username,
          creator_platform: creator.platform,
          creator_follower_count: creator.followerCount,
          content_overlap: creator.contentOverlap,
          public_interactions: creator.publicInteractions,
          handler_notes: creator.handlerNotes,
          rules: [
            'Genuine, not transactional',
            'Reference specific content if possible',
            'NOT "hey wanna collab?"',
            'Natural conversation starter',
          ],
          output_format: 'Return JSON: { dm_text: string }',
        },
      },
    });

    if (error) throw error;

    const message = data?.message ?? '';
    const jsonMatch = message.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return parsed.dm_text ?? null;
    }
  } catch {
    // Fallback
  }

  // Template fallback
  return `Hey! I've been following your content and honestly it's been really inspiring. I'm just starting my own journey — would love to connect sometime 💕`;
}

/**
 * Build outreach context for Handler AI.
 */
export async function buildOutreachContext(_userId: string): Promise<string> {
  try {
    const creators = await getCreatorRelationships(_userId);
    if (creators.length === 0) return '';

    const byStage = {
      identified: creators.filter(c => c.relationshipStage === 'identified').length,
      engaged: creators.filter(c => c.relationshipStage === 'engaged').length,
      connected: creators.filter(c => c.relationshipStage === 'connected').length,
      active_promo: creators.filter(c => c.relationshipStage === 'active_promo').length,
    };

    return `CREATOR OUTREACH: ${creators.length} tracked — identified: ${byStage.identified}, engaged: ${byStage.engaged}, connected: ${byStage.connected}, active promo: ${byStage.active_promo}`;
  } catch {
    return '';
  }
}

// ============================================
// Mapper
// ============================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapCreatorProfile(row: any): CreatorProfile {
  return {
    id: row.id,
    userId: row.user_id,
    platform: row.platform,
    username: row.username,
    displayName: row.display_name,
    followerCount: row.follower_count,
    contentOverlap: row.content_overlap ?? [],
    relationshipStage: row.relationship_stage as RelationshipStage,
    firstEngagedAt: row.first_engaged_at,
    lastEngagedAt: row.last_engaged_at,
    publicInteractions: row.public_interactions ?? 0,
    dmsSent: row.dms_sent ?? 0,
    crossPromos: row.cross_promos ?? 0,
    handlerNotes: row.handler_notes,
    createdAt: row.created_at,
  };
}
