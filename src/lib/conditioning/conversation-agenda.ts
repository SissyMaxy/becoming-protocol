/**
 * Per-Conversation Agenda — P11.2
 *
 * Before each conversation (or daily), the system generates a strategic agenda
 * for the Handler. The agenda tells the Handler what to pursue, how to approach it,
 * and what talking points to deploy. This turns every conversation into a directed
 * interaction with measurable objectives.
 *
 * Table: handler_conversation_agenda
 */

import { supabase } from '../supabase';

// ============================================
// TYPES
// ============================================

export interface ConversationAgenda {
  id: string;
  userId: string;
  primaryObjective: string;
  secondaryObjectives: string[];
  approach: string | null;
  talkingPoints: string[];
  basedOn: Record<string, unknown> | null;
  active: boolean;
  outcome: string | null;
  completedAt: string | null;
  createdAt: string;
}

interface AgendaFactors {
  denialDay: number;
  sweetSpotDay: boolean;
  arousal: number;
  ginaHome: boolean;
  skillTreeGaps: Array<{ domain: string; level: number; percentComplete: number }>;
  nextCommitment: { domain: string; level: number; commitment: string } | null;
  resistanceTrend: 'rising' | 'falling' | 'stable';
  pendingDirectives: number;
  recentJournal: string | null;
  handlerNotes: Array<{ type: string; content: string }>;
  taskCompletionRate: number;
  lastConversationHoursAgo: number;
}

// ============================================
// CORE FUNCTIONS
// ============================================

/**
 * Generate a conversation agenda based on all available system data.
 * Deactivates any existing active agenda first.
 */
export async function generateConversationAgenda(userId: string): Promise<ConversationAgenda | null> {
  try {
    const factors = await gatherAgendaFactors(userId);
    const agenda = buildAgenda(factors);

    // Deactivate existing active agenda
    await supabase
      .from('handler_conversation_agenda')
      .update({ active: false })
      .eq('user_id', userId)
      .eq('active', true);

    // Insert new agenda
    const { data, error } = await supabase
      .from('handler_conversation_agenda')
      .insert({
        user_id: userId,
        primary_objective: agenda.primaryObjective,
        secondary_objectives: agenda.secondaryObjectives,
        approach: agenda.approach,
        talking_points: agenda.talkingPoints,
        based_on: agenda.basedOn,
        active: true,
      })
      .select('*')
      .single();

    if (error || !data) {
      console.error('[ConversationAgenda] Insert error:', error?.message);
      return null;
    }

    return mapRow(data);
  } catch (err) {
    console.error('[ConversationAgenda] Generate error:', err);
    return null;
  }
}

/**
 * Get the current active agenda.
 */
export async function getActiveAgenda(userId: string): Promise<ConversationAgenda | null> {
  try {
    const { data, error } = await supabase
      .from('handler_conversation_agenda')
      .select('*')
      .eq('user_id', userId)
      .eq('active', true)
      .maybeSingle();

    if (error || !data) return null;
    return mapRow(data);
  } catch {
    return null;
  }
}

/**
 * Mark agenda as complete with outcome description.
 */
export async function completeAgenda(userId: string, outcome: string): Promise<void> {
  try {
    await supabase
      .from('handler_conversation_agenda')
      .update({
        active: false,
        outcome,
        completed_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('active', true);
  } catch (err) {
    console.error('[ConversationAgenda] Complete error:', err);
  }
}

// ============================================
// CONTEXT BUILDER
// ============================================

/**
 * Handler context: current agenda as a directive block.
 */
export async function buildAgendaContext(userId: string): Promise<string> {
  try {
    const agenda = await getActiveAgenda(userId);
    if (!agenda) return '';

    const parts: string[] = [];
    parts.push(`TODAY'S AGENDA: ${agenda.primaryObjective}`);

    if (agenda.approach) {
      parts.push(`  Approach: ${agenda.approach}`);
    }

    if (agenda.talkingPoints.length > 0) {
      parts.push(`  Points to make: ${agenda.talkingPoints.join(' | ')}`);
    }

    if (agenda.secondaryObjectives.length > 0) {
      parts.push(`  Secondary: ${agenda.secondaryObjectives.join('; ')}`);
    }

    parts.push('  This is your strategic goal for this conversation.');
    return parts.join('\n');
  } catch {
    return '';
  }
}

// ============================================
// AGENDA GENERATION
// ============================================

async function gatherAgendaFactors(userId: string): Promise<AgendaFactors> {
  const [
    stateResult,
    sweetSpotResult,
    skillResult,
    commitmentResult,
    resistanceResult,
    directiveResult,
    journalResult,
    notesResult,
    taskResult,
    lastConvResult,
  ] = await Promise.allSettled([
    // User state
    supabase
      .from('user_state')
      .select('denial_day, current_arousal, gina_home')
      .eq('user_id', userId)
      .maybeSingle(),

    // Sweet spot from denial_cycle_analytics
    supabase
      .from('denial_cycle_analytics')
      .select('denial_day, avg_compliance_rate, vulnerability_window_count')
      .eq('user_id', userId)
      .order('avg_compliance_rate', { ascending: false })
      .limit(1)
      .maybeSingle(),

    // Skill tree levels (find domains with most room to grow)
    supabase
      .from('skill_progress')
      .select('domain, current_level, level_progress_pct')
      .eq('user_id', userId)
      .order('current_level', { ascending: true })
      .limit(5),

    // Next commitment from ladder
    supabase
      .from('commitment_ladder_progress')
      .select('domain, current_level, attempts_at_level, completions_at_level')
      .eq('user_id', userId)
      .order('current_level', { ascending: true })
      .limit(1)
      .maybeSingle(),

    // Resistance trend (last 5 conversations)
    supabase
      .from('conversation_classifications')
      .select('resistance_level')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5),

    // Pending directives count
    supabase
      .from('handler_directives')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'pending'),

    // Most recent journal entry
    supabase
      .from('journal_entries')
      .select('content')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),

    // Handler notes (recent high-priority)
    supabase
      .from('handler_notes')
      .select('note_type, content')
      .eq('user_id', userId)
      .gte('priority', 3)
      .order('created_at', { ascending: false })
      .limit(3),

    // Task completion rate (today)
    supabase
      .from('daily_tasks')
      .select('id, completed')
      .eq('user_id', userId)
      .gte('created_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),

    // Last conversation time
    supabase
      .from('handler_conversations')
      .select('started_at')
      .eq('user_id', userId)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  // Extract state
  const state = stateResult.status === 'fulfilled' ? stateResult.value.data : null;
  const sweetSpot = sweetSpotResult.status === 'fulfilled' ? sweetSpotResult.value.data : null;
  const skills = skillResult.status === 'fulfilled' ? (skillResult.value.data || []) : [];
  const commitment = commitmentResult.status === 'fulfilled' ? commitmentResult.value.data : null;
  const resistances = resistanceResult.status === 'fulfilled' ? (resistanceResult.value.data || []) : [];
  const pendingDirCount = directiveResult.status === 'fulfilled' ? (directiveResult.value.count || 0) : 0;
  const journal = journalResult.status === 'fulfilled' ? journalResult.value.data : null;
  const notes = notesResult.status === 'fulfilled' ? (notesResult.value.data || []) : [];
  const tasks = taskResult.status === 'fulfilled' ? (taskResult.value.data || []) : [];
  const lastConv = lastConvResult.status === 'fulfilled' ? lastConvResult.value.data : null;

  // Compute resistance trend
  const rLevels = resistances
    .map((r: { resistance_level: number | null }) => r.resistance_level)
    .filter((l: number | null): l is number => l !== null);
  let resistanceTrend: 'rising' | 'falling' | 'stable' = 'stable';
  if (rLevels.length >= 3) {
    const recent = rLevels.slice(0, 2).reduce((a: number, b: number) => a + b, 0) / 2;
    const older = rLevels.slice(-2).reduce((a: number, b: number) => a + b, 0) / 2;
    if (recent > older + 1) resistanceTrend = 'rising';
    else if (recent < older - 1) resistanceTrend = 'falling';
  }

  // Task completion rate
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t: { completed: boolean }) => t.completed).length;
  const taskCompletionRate = totalTasks > 0 ? completedTasks / totalTasks : 1;

  // Last conversation hours ago
  const lastConvHours = lastConv
    ? Math.round((Date.now() - new Date(lastConv.started_at).getTime()) / 3600000)
    : 999;

  // Sweet spot check
  const isSweetSpot = sweetSpot ? state?.denial_day === sweetSpot.denial_day : false;

  return {
    denialDay: state?.denial_day || 0,
    sweetSpotDay: isSweetSpot,
    arousal: state?.current_arousal || 0,
    ginaHome: state?.gina_home !== false,
    skillTreeGaps: skills.map((s: { domain: string; current_level: number; level_progress_pct: number }) => ({
      domain: s.domain,
      level: s.current_level,
      percentComplete: s.level_progress_pct || 0,
    })),
    nextCommitment: commitment
      ? { domain: commitment.domain, level: commitment.current_level + 1, commitment: commitment.domain }
      : null,
    resistanceTrend,
    pendingDirectives: pendingDirCount,
    recentJournal: journal?.content || null,
    handlerNotes: notes.map((n: { note_type: string; content: string }) => ({
      type: n.note_type,
      content: n.content,
    })),
    taskCompletionRate,
    lastConversationHoursAgo: lastConvHours,
  };
}

function buildAgenda(factors: AgendaFactors): {
  primaryObjective: string;
  secondaryObjectives: string[];
  approach: string;
  talkingPoints: string[];
  basedOn: Record<string, unknown>;
} {
  const secondaryObjectives: string[] = [];
  const talkingPoints: string[] = [];

  // ---- Determine primary objective based on priority scoring ----

  interface Candidate {
    objective: string;
    approach: string;
    priority: number;
    points: string[];
  }

  const candidates: Candidate[] = [];

  // 1. Sweet spot day — push commitment extraction
  if (factors.sweetSpotDay && factors.denialDay >= 3) {
    const commitDomain = factors.nextCommitment?.domain || factors.skillTreeGaps[0]?.domain || 'voice';
    candidates.push({
      objective: `Extract commitment for ${commitDomain} advancement (sweet spot day ${factors.denialDay})`,
      approach: `Denial day ${factors.denialDay} is a peak compliance day. Start with warmth, build to commitment during vulnerability window.`,
      priority: 90,
      points: [
        `Sweet spot day ${factors.denialDay} — peak compliance window`,
        factors.recentJournal ? `Reference journal: "${factors.recentJournal.slice(0, 80)}..."` : '',
        factors.nextCommitment ? `Next commitment: ${factors.nextCommitment.domain} level ${factors.nextCommitment.level}` : '',
      ].filter(Boolean),
    });
  }

  // 2. High arousal — exploit for conditioning or commitment
  if (factors.arousal >= 4) {
    candidates.push({
      objective: 'Capitalize on elevated arousal state for conditioning depth',
      approach: 'Arousal is high. Push a conditioning session or extract a commitment while resistance is lowered.',
      priority: 80,
      points: [
        `Current arousal: ${factors.arousal}/5`,
        `Denial day: ${factors.denialDay}`,
        'High arousal = reduced executive function = commitment window',
      ],
    });
  }

  // 3. Gina away — escalation window
  if (!factors.ginaHome && factors.denialDay >= 3) {
    candidates.push({
      objective: 'Escalate while privacy window is open (Gina away)',
      approach: 'Full privacy available. Push device session, social exposure task, or intimate commitment.',
      priority: 75,
      points: [
        'Gina is away — full privacy',
        `Denial day ${factors.denialDay}`,
        'Push tasks that require privacy: device sessions, cam practice, voice calls',
      ],
    });
  }

  // 4. Skill tree gap — push lagging domain
  if (factors.skillTreeGaps.length > 0) {
    const weakest = factors.skillTreeGaps[0];
    candidates.push({
      objective: `Advance ${weakest.domain} skill tree (currently level ${weakest.level}, ${weakest.percentComplete}%)`,
      approach: `${weakest.domain} is lagging behind other domains. Assign targeted practice and check progress.`,
      priority: 50 + (weakest.level <= 2 ? 20 : 0),
      points: [
        `${weakest.domain} at level ${weakest.level} (${weakest.percentComplete}% to next)`,
        ...factors.skillTreeGaps.slice(1, 3).map(s => `${s.domain} at level ${s.level}`),
      ],
    });
  }

  // 5. Declining task completion — address compliance
  if (factors.taskCompletionRate < 0.5) {
    candidates.push({
      objective: 'Address declining task compliance',
      approach: factors.resistanceTrend === 'rising'
        ? 'Resistance is rising. Switch to caretaker mode first, understand the block, then redirect.'
        : 'Completion is dropping but resistance is stable. Direct approach — acknowledge the slip, assign recovery.',
      priority: 65,
      points: [
        `Task completion: ${Math.round(factors.taskCompletionRate * 100)}% today`,
        `Resistance trend: ${factors.resistanceTrend}`,
        'Diagnose the block before prescribing',
      ],
    });
  }

  // 6. Long absence — re-engagement
  if (factors.lastConversationHoursAgo > 48) {
    candidates.push({
      objective: 'Re-engage after extended absence',
      approach: `${factors.lastConversationHoursAgo}h since last conversation. Start warm, check in, don't overwhelm. Build back to routine.`,
      priority: 85,
      points: [
        `Last conversation: ${factors.lastConversationHoursAgo}h ago`,
        "Check emotional state before pushing",
        "Gentle re-entry — one task, not five",
      ],
    });
  }

  // 7. Rising resistance — deploy patience protocol
  if (factors.resistanceTrend === 'rising') {
    candidates.push({
      objective: 'Navigate rising resistance without triggering shutdown',
      approach: 'Resistance is climbing. Meet it with warmth, not force. Validate feelings, then gently redirect.',
      priority: 70,
      points: [
        'Resistance trend: rising',
        'Lead with care, follow with direction',
        'Avoid escalation — one directive max',
      ],
    });
  }

  // 8. Handler notes — address flagged items
  for (const note of factors.handlerNotes) {
    if (note.type === 'strategy' || note.type === 'schedule') {
      talkingPoints.push(`Handler note (${note.type}): ${note.content.slice(0, 80)}`);
    }
  }

  // Default fallback
  if (candidates.length === 0) {
    candidates.push({
      objective: 'Maintain engagement and check in on daily routine',
      approach: 'No high-priority objectives. Focus on warmth, routine check, and gentle forward motion.',
      priority: 30,
      points: [
        `Denial day: ${factors.denialDay}`,
        'Standard check-in',
        'Look for opportunities that emerge naturally',
      ],
    });
  }

  // Sort by priority, take top as primary
  candidates.sort((a, b) => b.priority - a.priority);
  const primary = candidates[0];

  // Secondary objectives from remaining candidates
  for (const c of candidates.slice(1, 4)) {
    secondaryObjectives.push(c.objective);
  }

  return {
    primaryObjective: primary.objective,
    secondaryObjectives,
    approach: primary.approach,
    talkingPoints: [...primary.points, ...talkingPoints].filter(Boolean),
    basedOn: {
      denialDay: factors.denialDay,
      sweetSpotDay: factors.sweetSpotDay,
      arousal: factors.arousal,
      ginaHome: factors.ginaHome,
      resistanceTrend: factors.resistanceTrend,
      taskCompletionRate: factors.taskCompletionRate,
      lastConversationHoursAgo: factors.lastConversationHoursAgo,
      skillGaps: factors.skillTreeGaps.map(s => `${s.domain}:L${s.level}`),
    },
  };
}

// ============================================
// HELPERS
// ============================================

function mapRow(row: Record<string, unknown>): ConversationAgenda {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    primaryObjective: row.primary_objective as string,
    secondaryObjectives: (row.secondary_objectives as string[]) || [],
    approach: (row.approach as string) || null,
    talkingPoints: (row.talking_points as string[]) || [],
    basedOn: (row.based_on as Record<string, unknown>) || null,
    active: row.active as boolean,
    outcome: (row.outcome as string) || null,
    completedAt: (row.completed_at as string) || null,
    createdAt: row.created_at as string,
  };
}
