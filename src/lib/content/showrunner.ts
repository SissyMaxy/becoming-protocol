// ============================================
// Showrunner Engine
// Arc planning, beat scheduling, beat→task mapping
// ============================================

import { supabase } from '../supabase';
import { invokeWithAuth } from '../handler-ai';
import type {
  StoryArc,
  DbStoryArc,
  ContentBeat,
  DbContentBeat,
  FundingMilestone,
  DbFundingMilestone,
  ArcType,
  WeeklyArcPlan,
  NewArcPlan,
  PlannedBeat,
  NarrativePlan,
} from '../../types/narrative';
import {
  mapDbToStoryArc,
  mapDbToContentBeat,
  mapDbToFundingMilestone,
} from '../../types/narrative';

// ============================================
// Arc Lifecycle
// ============================================

/**
 * Get active arcs for a user.
 */
export async function getActiveArcs(userId: string): Promise<StoryArc[]> {
  const { data, error } = await supabase
    .from('story_arcs')
    .select('*')
    .eq('user_id', userId)
    .in('status', ['planned', 'active', 'climax'])
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to load arcs: ${error.message}`);
  return (data || []).map(d => mapDbToStoryArc(d as DbStoryArc));
}

/**
 * Get all arcs for a user (including resolved).
 */
export async function getAllArcs(userId: string): Promise<StoryArc[]> {
  const { data, error } = await supabase
    .from('story_arcs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to load arcs: ${error.message}`);
  return (data || []).map(d => mapDbToStoryArc(d as DbStoryArc));
}

/**
 * Create a new story arc from an AI-generated plan.
 */
export async function createArc(
  userId: string,
  plan: NewArcPlan
): Promise<StoryArc> {
  const today = new Date();
  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() + plan.duration);

  const narrativePlan: NarrativePlan = {
    beats: plan.beats,
    camSessionsPlanned: plan.beats.filter(b => b.isCam).length,
    fundingMilestoneLink: plan.fundingMilestoneLink,
  };

  const { data, error } = await supabase
    .from('story_arcs')
    .insert({
      user_id: userId,
      title: plan.title,
      arc_type: plan.arcType,
      domain: plan.domain,
      narrative_plan: narrativePlan as unknown as Record<string, unknown>,
      transformation_goal: plan.transformationGoal,
      sissification_angle: plan.sissificationAngle,
      total_beats: plan.beats.length,
      start_date: today.toISOString().split('T')[0],
      target_end_date: endDate.toISOString().split('T')[0],
      status: 'active',
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create arc: ${error.message}`);

  const arc = mapDbToStoryArc(data as DbStoryArc);

  // Create content beats for this arc
  await createBeatsForArc(userId, arc.id, plan.beats);

  return arc;
}

/**
 * Create content beats from planned beats.
 */
async function createBeatsForArc(
  userId: string,
  arcId: string,
  beats: PlannedBeat[]
): Promise<void> {
  const today = new Date();

  const beatRows = beats.map((beat, i) => {
    const scheduledDate = new Date(today);
    scheduledDate.setDate(scheduledDate.getDate() + beat.day - 1);

    return {
      user_id: userId,
      arc_id: arcId,
      beat_type: beat.beatType,
      beat_number: i + 1,
      scheduled_date: scheduledDate.toISOString().split('T')[0],
      task_domain: beat.taskDomain,
      task_category: beat.taskCategory,
      capture_type: beat.captureType || null,
      capture_instructions: beat.captureInstructions,
      requires_submission: beat.requiresSubmission ?? false,
      is_cam_beat: beat.isCam ?? false,
      narrative_framing: beat.narrativeFraming,
      fan_hook: beat.fanHook,
      sissification_framing: beat.sissificationFraming,
      status: 'planned',
    };
  });

  const { error } = await supabase.from('content_beats').insert(beatRows);
  if (error) {
    console.error('Failed to create beats:', error);
  }
}

/**
 * Resolve (complete) an arc.
 */
export async function resolveArc(arcId: string): Promise<void> {
  await supabase
    .from('story_arcs')
    .update({
      status: 'resolved',
      actual_end_date: new Date().toISOString().split('T')[0],
    })
    .eq('id', arcId);
}

/**
 * Advance an arc's current beat counter.
 */
export async function advanceArcBeat(arcId: string): Promise<void> {
  const { data: arc } = await supabase
    .from('story_arcs')
    .select('current_beat, total_beats')
    .eq('id', arcId)
    .single();

  if (!arc) return;

  const newBeat = arc.current_beat + 1;
  const newStatus = newBeat >= arc.total_beats ? 'climax' : 'active';

  await supabase
    .from('story_arcs')
    .update({ current_beat: newBeat, status: newStatus })
    .eq('id', arcId);
}

// ============================================
// Beat Management
// ============================================

/**
 * Get today's planned beats for a user.
 */
export async function getTodayBeats(userId: string): Promise<ContentBeat[]> {
  const today = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('content_beats')
    .select('*, story_arcs!inner(title, domain)')
    .eq('user_id', userId)
    .eq('scheduled_date', today)
    .in('status', ['planned', 'active'])
    .order('beat_number');

  if (error) throw new Error(`Failed to load today's beats: ${error.message}`);

  return (data || []).map(d => {
    const beat = mapDbToContentBeat(d as DbContentBeat);
    // Attach arc info
    const arcData = (d as Record<string, unknown>).story_arcs as Record<string, string> | undefined;
    if (arcData) {
      beat.arcTitle = arcData.title;
      beat.arcDomain = arcData.domain;
    }
    return beat;
  });
}

/**
 * Get beats for a specific arc.
 */
export async function getArcBeats(arcId: string): Promise<ContentBeat[]> {
  const { data, error } = await supabase
    .from('content_beats')
    .select('*')
    .eq('arc_id', arcId)
    .order('beat_number');

  if (error) throw new Error(`Failed to load arc beats: ${error.message}`);
  return (data || []).map(d => mapDbToContentBeat(d as DbContentBeat));
}

/**
 * Mark a beat as captured (content submitted to vault).
 */
export async function markBeatCaptured(
  beatId: string,
  vaultContentId: string
): Promise<void> {
  await supabase
    .from('content_beats')
    .update({
      status: 'captured',
      vault_content_id: vaultContentId,
      executed_at: new Date().toISOString(),
    })
    .eq('id', beatId);

  // Get the beat's arc and advance it
  const { data: beat } = await supabase
    .from('content_beats')
    .select('arc_id')
    .eq('id', beatId)
    .single();

  if (beat?.arc_id) {
    await advanceArcBeat(beat.arc_id);

    // Increment arc submission count
    try {
      await supabase.rpc('increment_arc_submissions', { p_arc_id: beat.arc_id });
    } catch {
      // RPC may not exist yet
    }
  }
}

/**
 * Mark a beat as skipped.
 */
export async function skipBeat(beatId: string): Promise<void> {
  await supabase
    .from('content_beats')
    .update({ status: 'skipped' })
    .eq('id', beatId);
}

/**
 * Mark a beat as posted (caption generated, content posted to platform).
 */
export async function markBeatPosted(
  beatId: string,
  caption: string,
  platform: string
): Promise<void> {
  await supabase
    .from('content_beats')
    .update({
      status: 'posted',
      caption_used: caption,
      platform_posted_to: platform,
    })
    .eq('id', beatId);
}

// ============================================
// Funding Milestones
// ============================================

/**
 * Get active funding milestones.
 */
export async function getActiveMilestones(userId: string): Promise<FundingMilestone[]> {
  const { data, error } = await supabase
    .from('funding_milestones')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at');

  if (error) throw new Error(`Failed to load milestones: ${error.message}`);
  return (data || []).map(d => mapDbToFundingMilestone(d as DbFundingMilestone));
}

/**
 * Create a funding milestone.
 */
export async function createMilestone(
  userId: string,
  data: {
    title: string;
    description?: string;
    targetAmountCents: number;
    rewardContent?: string;
    transformationAction?: string;
    arcId?: string;
  }
): Promise<FundingMilestone> {
  const { data: row, error } = await supabase
    .from('funding_milestones')
    .insert({
      user_id: userId,
      title: data.title,
      description: data.description,
      target_amount_cents: data.targetAmountCents,
      reward_content: data.rewardContent,
      transformation_action: data.transformationAction,
      arc_id: data.arcId,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create milestone: ${error.message}`);
  return mapDbToFundingMilestone(row as DbFundingMilestone);
}

// ============================================
// AI-Powered Arc Planning
// ============================================

/**
 * Request a weekly arc plan from the Handler AI.
 * Falls back to a simple template plan if AI unavailable.
 */
export async function planWeeklyArcs(
  userId: string,
  state: {
    denialDay: number;
    streakDays: number;
    avoidedDomains: string[];
    activeArcs: StoryArc[];
    vaultDepth: number;
    vetoRate: number;
    recentSubmissions: number;
    subscriberCount: number;
    monthlyRevenue: number;
    monthlyTarget: number;
    exposurePhase: string;
  }
): Promise<WeeklyArcPlan> {
  try {
    const { data, error } = await invokeWithAuth('handler-ai', {
      action: 'plan_weekly_arcs',
      user_id: userId,
      state,
    });

    if (error) throw error;
    const result = data as Record<string, unknown> | null;
    if (result?.plan) return result.plan as WeeklyArcPlan;
  } catch (err) {
    console.error('[showrunner] AI arc planning failed, using fallback:', err);
  }

  // Fallback: simple template plan
  return generateFallbackPlan(state);
}

/**
 * Fallback weekly plan when AI is unavailable.
 */
function generateFallbackPlan(state: {
  denialDay: number;
  avoidedDomains: string[];
  activeArcs: StoryArc[];
  vetoRate: number;
}): WeeklyArcPlan {
  const arcTypes: ArcType[] = [
    'voice', 'style_outfit', 'body', 'domain_deep_dive',
    'challenge', 'vulnerability',
  ];

  // Pick a domain not currently active and not avoided
  const activeDomains = state.activeArcs.map(a => a.domain).filter(Boolean);
  const available = arcTypes.filter(
    t => !activeDomains.includes(t) && !state.avoidedDomains.includes(t)
  );
  const chosenType = available[0] || 'voice';

  const domainMap: Record<string, string> = {
    voice: 'voice',
    style_outfit: 'style',
    body: 'body',
    domain_deep_dive: 'voice',
    challenge: 'arousal',
    vulnerability: 'emergence',
  };

  const beats: PlannedBeat[] = [
    {
      day: 1, beatType: 'setup',
      taskDomain: domainMap[chosenType], taskCategory: 'practice',
      captureInstructions: 'Record baseline — this is day 1.',
      narrativeFraming: 'Starting point', fanHook: 'Watch where she starts',
      requiresSubmission: true,
    },
    {
      day: 3, beatType: 'progress',
      taskDomain: domainMap[chosenType], taskCategory: 'practice',
      captureInstructions: 'Record comparison to day 1.',
      narrativeFraming: 'Building momentum', fanHook: 'Compare to the start',
      requiresSubmission: true,
    },
    {
      day: 5, beatType: 'breakthrough',
      taskDomain: domainMap[chosenType], taskCategory: 'practice',
      captureInstructions: 'Capture the breakthrough moment.',
      narrativeFraming: 'The payoff', fanHook: "She's in there",
      requiresSubmission: true,
    },
    {
      day: 7, beatType: 'climax',
      taskDomain: domainMap[chosenType], taskCategory: 'practice',
      captureInstructions: 'Final showcase — full result.',
      narrativeFraming: 'Look how far she came', fanHook: 'Week 1 complete',
      requiresSubmission: true,
    },
  ];

  // If high veto rate, add more submission-required beats
  if (state.vetoRate > 0.5) {
    beats.splice(2, 0, {
      day: 4, beatType: 'reflection',
      taskDomain: domainMap[chosenType], taskCategory: 'reflect',
      captureInstructions: 'Honest video diary — how is this changing you?',
      narrativeFraming: 'Vulnerability moment', fanHook: 'Real talk',
      requiresSubmission: true,
    });
  }

  return {
    resolveArcs: state.activeArcs
      .filter(a => a.status === 'climax')
      .map(a => a.id),
    newArcs: [{
      title: `${chosenType.replace('_', ' ')} Week`,
      arcType: chosenType,
      domain: domainMap[chosenType] || 'voice',
      duration: 7,
      transformationGoal: `Push ${domainMap[chosenType]} to next level`,
      sissificationAngle: 'Progressive feminization through practice',
      beats,
    }],
    camSessionsPlanned: [],
    pollsToLaunch: [],
    weeklyRevenueTarget: 0,
    contentMixPlan: { progress: 3, vulnerability: 1, cam: 0, fan_interaction: 1, milestone: 1 },
  };
}

// ============================================
// Beat → Task Mapping
// ============================================

/**
 * Enrich a task with content beat context.
 * Called during task delivery when the task matches a planned beat.
 */
export function enrichTaskWithBeat(
  taskInstruction: string,
  beat: ContentBeat
): {
  instruction: string;
  captureInstructions: string;
  requiresSubmission: boolean;
  beatId: string;
} {
  // Build enhanced instruction that includes capture
  const captureNote = beat.requiresSubmission
    ? '\n\nThis task REQUIRES content submission to count as complete.'
    : '\n\nCapture this if you can — it feeds the narrative.';

  const instruction = beat.taskInstructionsOverride
    ? beat.taskInstructionsOverride
    : `${taskInstruction}\n\nCapture: ${beat.captureInstructions}${captureNote}`;

  return {
    instruction,
    captureInstructions: beat.captureInstructions,
    requiresSubmission: beat.requiresSubmission,
    beatId: beat.id,
  };
}

/**
 * Find the best matching beat for a given task.
 */
export function matchBeatToTask(
  beats: ContentBeat[],
  taskDomain: string,
  taskCategory: string
): ContentBeat | null {
  // Exact domain + category match
  const exact = beats.find(
    b => b.taskDomain === taskDomain && b.taskCategory === taskCategory && b.status === 'planned'
  );
  if (exact) return exact;

  // Domain match only
  const domainMatch = beats.find(
    b => b.taskDomain === taskDomain && b.status === 'planned'
  );
  if (domainMatch) return domainMatch;

  // Any unmatched planned beat
  return beats.find(b => !b.taskId && b.status === 'planned') || null;
}

// ============================================
// Arc Analytics
// ============================================

/**
 * Get arc performance summary.
 */
export async function getArcPerformance(arcId: string): Promise<{
  totalBeats: number;
  capturedBeats: number;
  postedBeats: number;
  skippedBeats: number;
  completionRate: number;
}> {
  const beats = await getArcBeats(arcId);

  const captured = beats.filter(b => b.status === 'captured' || b.status === 'posted').length;
  const posted = beats.filter(b => b.status === 'posted').length;
  const skipped = beats.filter(b => b.status === 'skipped').length;

  return {
    totalBeats: beats.length,
    capturedBeats: captured,
    postedBeats: posted,
    skippedBeats: skipped,
    completionRate: beats.length > 0 ? captured / beats.length : 0,
  };
}
