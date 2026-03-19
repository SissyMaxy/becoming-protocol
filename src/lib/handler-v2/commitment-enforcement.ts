/**
 * Commitment Enforcement Pipeline
 *
 * State machine that advances commitments through:
 * extracted → pending → approaching → due → overdue → enforcing → honored/dishonored
 *
 * Side effects: Lovense summons, coercion stack, morning briefing injection.
 */

import { supabase } from '../supabase';
import { HandlerParameters } from '../handler-parameters';

export type CommitmentState =
  | 'extracted' | 'pending' | 'approaching' | 'due'
  | 'overdue' | 'enforcing' | 'honored' | 'dishonored' | 'forgiven';

interface CommitmentRow {
  id: string;
  user_id: string;
  commitment_text: string;
  state: CommitmentState;
  deadline: string | null;
  coercion_stack_level: number;
  enforcement_attempts: number;
  enforcement_context: Record<string, unknown>;
  state_transitions: Array<{ from: string; to: string; timestamp: string }>;
}

interface StateChange {
  commitmentId: string;
  from: CommitmentState;
  to: CommitmentState;
  text: string;
}

/**
 * Advance all active commitments through the state machine.
 * Call hourly via cron or on app load.
 */
export async function advanceCommitmentStates(
  userId: string,
  params: HandlerParameters,
): Promise<StateChange[]> {
  const changes: StateChange[] = [];
  const now = new Date();

  const approachingHours = await params.get<number>('commitments.approaching_hours', 72);
  const dueHours = await params.get<number>('commitments.due_hours', 24);

  const { data: commitments } = await supabase
    .from('commitments_v2')
    .select('*')
    .eq('user_id', userId)
    .in('state', ['pending', 'approaching', 'due', 'overdue', 'enforcing'])
    .not('deadline', 'is', null);

  if (!commitments) return changes;

  for (const c of commitments as CommitmentRow[]) {
    if (!c.deadline) continue;
    const deadline = new Date(c.deadline);
    const hoursUntil = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60);

    let newState: CommitmentState | null = null;

    if (c.state === 'pending' && hoursUntil <= approachingHours) {
      newState = 'approaching';
    } else if (c.state === 'approaching' && hoursUntil <= dueHours) {
      newState = 'due';
    } else if (['approaching', 'due'].includes(c.state) && hoursUntil <= 0) {
      newState = 'overdue';
    } else if (c.state === 'overdue') {
      newState = 'enforcing';
    }

    if (newState && newState !== c.state) {
      const transitions = c.state_transitions || [];
      transitions.push({ from: c.state, to: newState, timestamp: now.toISOString() });

      const update: Record<string, unknown> = {
        state: newState,
        state_transitions: transitions,
      };

      // Escalate coercion on enforcing
      if (newState === 'enforcing') {
        update.coercion_stack_level = Math.min(7, (c.coercion_stack_level || 0) + 1);
        update.enforcement_attempts = (c.enforcement_attempts || 0) + 1;
      }

      await supabase.from('commitments_v2').update(update).eq('id', c.id);

      changes.push({
        commitmentId: c.id,
        from: c.state,
        to: newState,
        text: c.commitment_text,
      });
    }
  }

  return changes;
}

/**
 * Honor a commitment (mark as completed).
 */
export async function honorCommitment(commitmentId: string): Promise<void> {
  const { data: c } = await supabase
    .from('commitments_v2')
    .select('state, state_transitions')
    .eq('id', commitmentId)
    .maybeSingle();

  if (!c) return;

  const transitions = (c.state_transitions as Array<{ from: string; to: string; timestamp: string }>) || [];
  transitions.push({ from: c.state, to: 'honored', timestamp: new Date().toISOString() });

  await supabase.from('commitments_v2').update({
    state: 'honored',
    state_transitions: transitions,
  }).eq('id', commitmentId);
}

/**
 * Get active commitments for display (approaching, due, overdue, enforcing).
 */
export async function getActiveCommitments(userId: string): Promise<Array<{
  id: string;
  text: string;
  state: CommitmentState;
  deadline: string;
  hoursRemaining: number;
  coercionLevel: number;
}>> {
  const { data } = await supabase
    .from('commitments_v2')
    .select('id, commitment_text, state, deadline, coercion_stack_level')
    .eq('user_id', userId)
    .in('state', ['approaching', 'due', 'overdue', 'enforcing'])
    .order('deadline', { ascending: true });

  if (!data) return [];

  const now = Date.now();
  return data.map(c => ({
    id: c.id,
    text: c.commitment_text,
    state: c.state as CommitmentState,
    deadline: c.deadline,
    hoursRemaining: c.deadline ? Math.round((new Date(c.deadline).getTime() - now) / (1000 * 60 * 60)) : 0,
    coercionLevel: c.coercion_stack_level || 0,
  }));
}

/**
 * Build commitment context block for Handler system prompt.
 */
export async function buildCommitmentContext(userId: string): Promise<string> {
  const active = await getActiveCommitments(userId);
  if (active.length === 0) return '';

  const lines = ['## Active Commitments'];
  for (const c of active) {
    const urgency = c.state === 'overdue' || c.state === 'enforcing'
      ? 'OVERDUE'
      : c.state === 'due'
        ? 'DUE NOW'
        : `${c.hoursRemaining}h remaining`;
    lines.push(`- [${urgency}] "${c.text}" (coercion level ${c.coercionLevel}/7)`);
  }

  return lines.join('\n');
}
