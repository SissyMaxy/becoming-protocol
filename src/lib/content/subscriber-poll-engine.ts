/**
 * Subscriber Poll Engine
 *
 * Create, approve, vote, close, and apply poll results.
 * Handler creates polls. David approves. Fans vote.
 */

import { supabase } from '../supabase';
import type { SubscriberPoll, PollOption, PollStatus } from '../../types/content-pipeline';

// ── Create poll ──────────────────────────────────────────

export async function createPoll(
  userId: string,
  poll: {
    title: string;
    description?: string;
    poll_type?: string;
    options: Array<{ label: string; description?: string }>;
    platform?: string;
    votes_per_fan?: number;
    weighted_voting?: boolean;
    voting_duration_hours?: number;
  }
): Promise<SubscriberPoll | null> {
  const options: PollOption[] = poll.options.map((opt, i) => ({
    id: `opt_${i}`,
    label: opt.label,
    description: opt.description,
    votes: 0,
    vote_weight: 0,
  }));

  const now = new Date();
  const durationHours = poll.voting_duration_hours || 48;

  const { data, error } = await supabase
    .from('subscriber_polls')
    .insert({
      user_id: userId,
      title: poll.title,
      description: poll.description || null,
      poll_type: poll.poll_type || 'single_choice',
      options,
      platform: poll.platform || null,
      votes_per_fan: poll.votes_per_fan || 1,
      weighted_voting: poll.weighted_voting || false,
      voting_open_at: now.toISOString(),
      voting_close_at: new Date(now.getTime() + durationHours * 3600000).toISOString(),
      status: 'draft',
    })
    .select('*')
    .single();

  if (error) {
    console.error('[polls] createPoll error:', error);
    return null;
  }
  return data as SubscriberPoll;
}

// ── Approve poll ─────────────────────────────────────────

export async function approvePoll(userId: string, pollId: string): Promise<boolean> {
  const { error } = await supabase
    .from('subscriber_polls')
    .update({
      approved: true,
      approved_at: new Date().toISOString(),
      status: 'approved' as PollStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', pollId)
    .eq('user_id', userId);

  return !error;
}

// ── Activate poll ────────────────────────────────────────

export async function activatePoll(userId: string, pollId: string): Promise<boolean> {
  const { error } = await supabase
    .from('subscriber_polls')
    .update({
      status: 'active' as PollStatus,
      voting_open_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', pollId)
    .eq('user_id', userId)
    .eq('approved', true);

  return !error;
}

// ── Cast vote (weighted) ─────────────────────────────────

export async function castVote(
  userId: string,
  pollId: string,
  optionId: string,
  weight: number = 1
): Promise<boolean> {
  // Read current poll
  const { data: poll, error: fetchErr } = await supabase
    .from('subscriber_polls')
    .select('*')
    .eq('id', pollId)
    .eq('user_id', userId)
    .single();

  if (fetchErr || !poll || poll.status !== 'active') return false;

  const options = (poll.options as PollOption[]) || [];
  const optIdx = options.findIndex(o => o.id === optionId);
  if (optIdx === -1) return false;

  options[optIdx].votes += 1;
  options[optIdx].vote_weight += weight;

  const totalVotes = (poll.total_votes as number) + 1;
  const totalWeight = Number(poll.total_vote_weight) + weight;

  const { error } = await supabase
    .from('subscriber_polls')
    .update({
      options,
      total_votes: totalVotes,
      total_vote_weight: totalWeight,
      updated_at: new Date().toISOString(),
    })
    .eq('id', pollId)
    .eq('user_id', userId);

  return !error;
}

// ── Close poll ───────────────────────────────────────────

export async function closePoll(userId: string, pollId: string): Promise<SubscriberPoll | null> {
  const { data: poll } = await supabase
    .from('subscriber_polls')
    .select('*')
    .eq('id', pollId)
    .eq('user_id', userId)
    .single();

  if (!poll) return null;

  const options = (poll.options as PollOption[]) || [];
  const useWeight = poll.weighted_voting as boolean;

  // Find winner
  const winner = options.reduce((best, opt) => {
    const score = useWeight ? opt.vote_weight : opt.votes;
    const bestScore = useWeight ? best.vote_weight : best.votes;
    return score > bestScore ? opt : best;
  }, options[0]);

  const { data, error } = await supabase
    .from('subscriber_polls')
    .update({
      status: 'closed' as PollStatus,
      winning_option_id: winner?.id || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', pollId)
    .eq('user_id', userId)
    .select('*')
    .single();

  if (error) return null;
  return data as SubscriberPoll;
}

// ── Apply result ─────────────────────────────────────────

export async function applyPollResult(
  userId: string,
  pollId: string,
  resultAction: string
): Promise<boolean> {
  const { error } = await supabase
    .from('subscriber_polls')
    .update({
      status: 'applied' as PollStatus,
      result_applied: true,
      result_action: resultAction,
      updated_at: new Date().toISOString(),
    })
    .eq('id', pollId)
    .eq('user_id', userId);

  return !error;
}

// ── Get polls by status ──────────────────────────────────

export async function getPolls(
  userId: string,
  status?: PollStatus
): Promise<SubscriberPoll[]> {
  let query = supabase
    .from('subscriber_polls')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) return [];
  return (data || []) as SubscriberPoll[];
}

// ── Get active polls ─────────────────────────────────────

export async function getActivePolls(userId: string): Promise<SubscriberPoll[]> {
  return getPolls(userId, 'active');
}

// ── Poll summary for context ─────────────────────────────

export async function getPollSummary(userId: string): Promise<{
  active: number;
  pendingApproval: number;
  recentResults: Array<{ title: string; winner: string; votes: number }>;
}> {
  const { data, error } = await supabase
    .from('subscriber_polls')
    .select('*')
    .eq('user_id', userId)
    .in('status', ['draft', 'approved', 'active', 'closed'])
    .order('created_at', { ascending: false })
    .limit(20);

  if (error || !data) return { active: 0, pendingApproval: 0, recentResults: [] };

  const active = data.filter(p => p.status === 'active').length;
  const pendingApproval = data.filter(p => p.status === 'draft').length;
  const recentResults = data
    .filter(p => p.status === 'closed' && p.winning_option_id)
    .slice(0, 3)
    .map(p => {
      const options = (p.options as PollOption[]) || [];
      const winner = options.find(o => o.id === p.winning_option_id);
      return {
        title: p.title as string,
        winner: winner?.label || 'unknown',
        votes: p.total_votes as number,
      };
    });

  return { active, pendingApproval, recentResults };
}
