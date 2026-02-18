// ============================================
// Fan Engine
// Polls, tiers, directives, fan influence
// ============================================

import { supabase } from '../supabase';
import type {
  FanPoll,
  DbFanPoll,
  PollOption,
  PollStatus,
} from '../../types/cam';
import { mapDbToFanPoll } from '../../types/cam';

// ============================================
// Fan Tier Definitions
// ============================================

export interface FanTierConfig {
  tier: number;
  name: string;
  priceMonthly: number;
  votePower: number;
  capabilities: string[];
}

export const FAN_TIERS: FanTierConfig[] = [
  {
    tier: 0,
    name: 'Free',
    priceMonthly: 0,
    votePower: 0,
    capabilities: ['view_public', 'see_poll_results'],
  },
  {
    tier: 1,
    name: 'Follower',
    priceMonthly: 500, // $5
    votePower: 1,
    capabilities: ['vote', 'daily_updates', 'cam_notifications'],
  },
  {
    tier: 2,
    name: 'Supporter',
    priceMonthly: 1500, // $15
    votePower: 3,
    capabilities: ['vote', 'suggest_options', 'behind_scenes', 'cam_replays'],
  },
  {
    tier: 3,
    name: 'Inner Circle',
    priceMonthly: 3000, // $30
    votePower: 5,
    capabilities: ['vote', 'suggest_arcs', 'qa', 'vault_previews', 'cam_interaction'],
  },
  {
    tier: 4,
    name: 'Handler\'s Circle',
    priceMonthly: 5000, // $50+
    votePower: 10,
    capabilities: ['vote', 'propose_challenges', 'custom_requests', 'cam_directives', 'direct_influence'],
  },
];

// ============================================
// Poll Management
// ============================================

export async function createPoll(
  userId: string,
  question: string,
  options: Array<{ label: string; description?: string }>,
  closesInHours: number = 24,
  allowedTiers: number[] = [1, 2, 3, 4]
): Promise<FanPoll | null> {
  const pollOptions: PollOption[] = options.map((opt, i) => ({
    id: `opt_${i}`,
    label: opt.label,
    description: opt.description,
    voteCount: 0,
    weightedVoteCount: 0,
  }));

  const closesAt = new Date();
  closesAt.setHours(closesAt.getHours() + closesInHours);

  const { data, error } = await supabase
    .from('fan_polls')
    .insert({
      user_id: userId,
      question,
      options: pollOptions,
      allowed_tiers: allowedTiers,
      voting_closes_at: closesAt.toISOString(),
      status: 'active',
    })
    .select()
    .single();

  if (error || !data) return null;
  return mapDbToFanPoll(data as DbFanPoll);
}

export async function getActivePolls(userId: string): Promise<FanPoll[]> {
  const { data } = await supabase
    .from('fan_polls')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  return (data || []).map(d => mapDbToFanPoll(d as DbFanPoll));
}

export async function getPoll(pollId: string): Promise<FanPoll | null> {
  const { data } = await supabase
    .from('fan_polls')
    .select('*')
    .eq('id', pollId)
    .single();

  if (!data) return null;
  return mapDbToFanPoll(data as DbFanPoll);
}

export async function castVote(
  pollId: string,
  optionId: string,
  fanTier: number
): Promise<FanPoll | null> {
  const poll = await getPoll(pollId);
  if (!poll || poll.status !== 'active') return null;

  // Check if poll has expired
  if (new Date(poll.votingClosesAt) < new Date()) {
    await closePoll(pollId);
    return null;
  }

  // Check tier is allowed
  if (!poll.allowedTiers.includes(fanTier)) return null;

  // Get vote power for this tier
  const tierConfig = FAN_TIERS.find(t => t.tier === fanTier);
  const votePower = tierConfig?.votePower || 1;

  // Update the options with new vote
  const updatedOptions = poll.options.map(opt => {
    if (opt.id === optionId) {
      return {
        ...opt,
        voteCount: opt.voteCount + 1,
        weightedVoteCount: opt.weightedVoteCount + votePower,
      };
    }
    return opt;
  });

  const { data } = await supabase
    .from('fan_polls')
    .update({ options: updatedOptions })
    .eq('id', pollId)
    .select()
    .single();

  if (!data) return null;
  return mapDbToFanPoll(data as DbFanPoll);
}

export async function closePoll(pollId: string): Promise<FanPoll | null> {
  const poll = await getPoll(pollId);
  if (!poll) return null;

  // Calculate results
  const totalVotes = poll.options.reduce((sum, opt) => sum + opt.voteCount, 0);
  const totalWeightedVotes = poll.options.reduce((sum, opt) => sum + opt.weightedVoteCount, 0);

  const results = {
    totalVotes,
    totalWeightedVotes,
    options: poll.options.map(opt => ({
      id: opt.id,
      votes: opt.voteCount,
      weightedVotes: opt.weightedVoteCount,
      percentage: totalWeightedVotes > 0 ? (opt.weightedVoteCount / totalWeightedVotes) * 100 : 0,
    })),
  };

  // Find winner by weighted votes
  const winner = poll.options.reduce((best, opt) =>
    opt.weightedVoteCount > best.weightedVoteCount ? opt : best
  , poll.options[0]);

  const { data } = await supabase
    .from('fan_polls')
    .update({
      status: 'closed' as PollStatus,
      results,
      winning_option: winner?.label,
    })
    .eq('id', pollId)
    .select()
    .single();

  if (!data) return null;
  return mapDbToFanPoll(data as DbFanPoll);
}

// ============================================
// Fan Directive Suggestions (During Cam)
// ============================================

export interface FanDirectiveSuggestion {
  suggestion: string;
  tipAmount: number;
  fanTier: number;
  fanIdentifier: string;
}

export interface DirectiveDecision {
  accepted: boolean;
  directive?: string;
  reason?: string;
}

/**
 * Process a fan directive suggestion during cam.
 * Handler filters: accepts appropriate suggestions, rejects inappropriate ones.
 */
export function processFanDirective(
  suggestion: FanDirectiveSuggestion,
  minTipRequired: number = 2500 // $25 minimum
): DirectiveDecision {
  // Check minimum tip
  if (suggestion.tipAmount < minTipRequired) {
    return {
      accepted: false,
      reason: `Minimum tip for directives is $${(minTipRequired / 100).toFixed(0)}`,
    };
  }

  // Check tier
  if (suggestion.fanTier < 3) {
    return {
      accepted: false,
      reason: 'Directive suggestions require tier 3+',
    };
  }

  // Hard filter: block anything involving real identity, Gina, medical, de-anonymization
  const blocked = [
    /real\s*name/i, /face\s*reveal/i, /gina/i, /wife/i, /partner/i,
    /where.*live/i, /address/i, /work/i, /employer/i, /medical/i,
    /hrt/i, /hormone/i, /surgery/i, /hurt\s*(your)?self/i, /harm/i,
  ];

  for (const pattern of blocked) {
    if (pattern.test(suggestion.suggestion)) {
      return {
        accepted: false,
        reason: 'Suggestion violates hard constraints',
      };
    }
  }

  // Accept and transform to Handler directive
  return {
    accepted: true,
    directive: `Fan suggestion ($${(suggestion.tipAmount / 100).toFixed(0)} tip): "${suggestion.suggestion}" — Your call how to interpret this.`,
  };
}

// ============================================
// Fan Consequence Input
// ============================================

/**
 * Generate fan-influenced consequence options for a poll.
 * "How should we get Maxy back?" — fans vote on consequence approach.
 */
export function generateConsequencePollOptions(): Array<{ label: string; description: string }> {
  return [
    {
      label: 'Gentle reminder',
      description: 'Send encouraging messages. She\'ll come back when she\'s ready.',
    },
    {
      label: 'Public pressure',
      description: 'Post her streak status publicly. Let the community motivate her.',
    },
    {
      label: 'Device activation',
      description: 'Remote device activation as a reminder. She agreed to this.',
    },
    {
      label: 'Vault content',
      description: 'Handler starts posting from her vault. She submitted it — now it goes public.',
    },
  ];
}

// ============================================
// Fan-Driven Arc Pipeline
// ============================================

/**
 * Connect poll results to arc creation.
 * When a poll closes with a domain/arc theme winner, create the arc.
 */
export async function processArcPollResult(
  userId: string,
  pollId: string
): Promise<{ arcId?: string; error?: string }> {
  const poll = await getPoll(pollId);
  if (!poll || poll.status !== 'closed' || !poll.winningOption) {
    return { error: 'Poll not closed or no winner' };
  }

  // Map winning option to arc creation params
  const arcParams = mapPollWinnerToArc(poll.winningOption, poll.question);
  if (!arcParams) {
    return { error: 'Could not map poll winner to arc type' };
  }

  // Create arc via showrunner
  const { data, error } = await supabase
    .from('story_arcs')
    .insert({
      user_id: userId,
      title: arcParams.title,
      arc_type: arcParams.arcType,
      domain: arcParams.domain,
      status: 'planned',
      stakes_description: `Fan-voted: "${poll.winningOption}" from poll "${poll.question}"`,
      total_beats: 7,
      current_beat: 0,
    })
    .select('id')
    .single();

  if (error || !data) return { error: 'Failed to create arc' };

  // Link poll to resulting arc
  await supabase
    .from('fan_polls')
    .update({ resulting_arc_id: data.id })
    .eq('id', pollId);

  return { arcId: data.id };
}

function mapPollWinnerToArc(winner: string, _question: string): {
  title: string;
  arcType: string;
  domain: string;
} | null {
  const lw = winner.toLowerCase();

  // Domain-based arc mapping
  if (lw.includes('voice')) return { title: `Voice Focus: ${winner}`, arcType: 'skill_progression', domain: 'voice' };
  if (lw.includes('denial') || lw.includes('chastity')) return { title: `Denial Arc: ${winner}`, arcType: 'challenge', domain: 'denial' };
  if (lw.includes('outfit') || lw.includes('style')) return { title: `Style Arc: ${winner}`, arcType: 'identity_exploration', domain: 'style' };
  if (lw.includes('body') || lw.includes('fitness')) return { title: `Body Arc: ${winner}`, arcType: 'body_journey', domain: 'body' };
  if (lw.includes('cam') || lw.includes('live')) return { title: `Live Arc: ${winner}`, arcType: 'challenge', domain: 'social' };
  if (lw.includes('edge') || lw.includes('goon')) return { title: `Edge Arc: ${winner}`, arcType: 'challenge', domain: 'arousal' };

  // Generic fan-driven arc
  return { title: `Fan Choice: ${winner}`, arcType: 'challenge', domain: 'emergence' };
}

// ============================================
// Fan Pressure Signals for Handler
// ============================================

export interface FanPressureSignals {
  activePollCount: number;
  recentVoteVolume: number;
  consequencePollActive: boolean;
  camRequestPollActive: boolean;
  pendingCustomRequests: number;
  fanDemandScore: number; // 0-10 composite
}

/**
 * Aggregate fan pressure signals for Handler decision-making.
 */
export async function getFanPressureSignals(userId: string): Promise<FanPressureSignals> {
  const polls = await getActivePolls(userId);

  const totalVotes = polls.reduce((sum, p) =>
    sum + p.options.reduce((s, o) => s + o.voteCount, 0), 0
  );

  const consequencePoll = polls.some(p =>
    p.question.toLowerCase().includes('consequence') ||
    p.question.toLowerCase().includes('get maxy back')
  );

  const camRequest = polls.some(p =>
    p.question.toLowerCase().includes('cam') ||
    p.question.toLowerCase().includes('live')
  );

  // Composite score based on engagement signals
  let score = 0;
  if (polls.length > 0) score += 2;
  if (totalVotes > 10) score += 2;
  if (totalVotes > 50) score += 2;
  if (consequencePoll) score += 2;
  if (camRequest) score += 2;

  return {
    activePollCount: polls.length,
    recentVoteVolume: totalVotes,
    consequencePollActive: consequencePoll,
    camRequestPollActive: camRequest,
    pendingCustomRequests: 0, // Would come from platform data
    fanDemandScore: Math.min(score, 10),
  };
}

// ============================================
// Tier-Gated Content Delivery
// ============================================

export type ContentVisibility = 'public' | 'tier1' | 'tier2' | 'tier3' | 'tier4' | 'ppv';

/**
 * Determine content visibility based on vulnerability and vault tier.
 */
export function getContentVisibility(
  vulnerabilityScore: number,
  vaultTier: string
): ContentVisibility {
  if (vaultTier === 'public_ready') return 'public';
  if (vaultTier === 'restricted') return 'tier4';
  if (vulnerabilityScore <= 3) return 'tier1';
  if (vulnerabilityScore <= 5) return 'tier2';
  if (vulnerabilityScore <= 7) return 'tier3';
  return 'tier4';
}

/**
 * Check if a fan tier has access to specific content.
 */
export function canAccessContent(
  fanTier: number,
  contentVisibility: ContentVisibility
): boolean {
  const visibilityMap: Record<ContentVisibility, number> = {
    public: 0,
    tier1: 1,
    tier2: 2,
    tier3: 3,
    tier4: 4,
    ppv: 99, // PPV requires separate purchase
  };

  return fanTier >= visibilityMap[contentVisibility];
}

// ============================================
// Fan Influence Analytics
// ============================================

export async function getFanInfluenceStats(userId: string): Promise<{
  totalPolls: number;
  totalVotes: number;
  avgParticipation: number;
  topFanTier: number;
  pollHistory: FanPoll[];
}> {
  const { data } = await supabase
    .from('fan_polls')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);

  const polls = (data || []).map(d => mapDbToFanPoll(d as DbFanPoll));
  const closedPolls = polls.filter(p => p.status === 'closed' && p.results);

  const totalVotes = closedPolls.reduce((sum, p) => sum + (p.results?.totalVotes || 0), 0);
  const avgParticipation = closedPolls.length > 0
    ? totalVotes / closedPolls.length
    : 0;

  return {
    totalPolls: polls.length,
    totalVotes,
    avgParticipation: Math.round(avgParticipation),
    topFanTier: 4, // Would come from subscriber data
    pollHistory: polls,
  };
}
