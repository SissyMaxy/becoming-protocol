/**
 * Autonomous Daily Cycle Engine
 *
 * Master orchestrator. Generates the full day's plan at 6am.
 * Executes each block at its scheduled time. Checks compliance
 * after each window closes. The system runs whether Maxy
 * participates or not. Non-participation is logged.
 *
 * Tables: daily_cycles, daily_tasks, conditioning_sessions_v2,
 *         handler_outreach_queue, handler_directives
 */

import { supabase } from '../supabase';
import { getHiddenParam } from './hidden-operations';
import { queueOutreachMessage } from './proactive-outreach';
import { prescribeSession } from './prescription';

// ============================================
// TYPES
// ============================================

export type BlockType = 'morning' | 'midday' | 'afternoon' | 'evening' | 'night';
export type BlockStatus = 'pending' | 'executing' | 'completed' | 'checked';

export interface MorningBlock {
  outfitMandate: string;
  tasks: TaskPrescription[];
  voicePracticeMinutes: number;
  scheduledAt: string;
}

export interface MiddayBlock {
  complianceCheckTargets: string[];
  ambushCount: number;
  reminderMessage: string;
  scheduledAt: string;
}

export interface AfternoonBlock {
  contentToPost: string[];
  engagementObligations: string[];
  scheduledAt: string;
}

export interface EveningBlock {
  conditioningChainType: 'standard' | 'intensive' | 'gentle';
  journalPrompt: string;
  scheduledAt: string;
}

export interface NightBlock {
  sleepContentIds: string[];
  overnightAudioId: string | null;
  scheduledAt: string;
}

export interface DailyCycle {
  morning: MorningBlock;
  midday: MiddayBlock;
  afternoon: AfternoonBlock;
  evening: EveningBlock;
  night: NightBlock;
}

interface TaskPrescription {
  domain: string;
  description: string;
  priority: 'high' | 'normal' | 'low';
  verificationMethod: string;
}

interface CycleRow {
  id: string;
  user_id: string;
  cycle_date: string;
  plan: DailyCycle;
  morning_status: string;
  midday_status: string;
  afternoon_status: string;
  evening_status: string;
  night_status: string;
  compliance_score: number | null;
  consequences_fired: number;
  created_at: string;
}

export interface BlockComplianceResult {
  compliant: boolean;
  completedItems: string[];
  missedItems: string[];
  complianceRate: number;
}

// ============================================
// OUTFIT MANDATES
// ============================================

const OUTFIT_STYLES = [
  'Casual femme: skinny jeans, fitted top, light makeup, hair styled',
  'Professional femme: pencil skirt, blouse, full face, heels if leaving house',
  'Athleisure femme: leggings, sports bra, hair in ponytail, lip gloss',
  'Evening glam: bodycon dress, smokey eye, statement jewelry',
  'Soft girl: oversized sweater, short skirt, minimal makeup, perfume',
  'Full presentation: complete outfit including accessories, nails done, photo required',
];

// ============================================
// JOURNAL PROMPTS
// ============================================

const JOURNAL_PROMPTS = [
  'What did Maxy do today that the costume never would have? Be specific.',
  'Describe the moment today when you felt most like her. What were you doing?',
  'What obligation did you resist today? What happened when you gave in?',
  'Write about how the system controlled your day. How did it feel to not choose?',
  'What would you tell someone who asked why you do this? Answer as Maxy.',
  'Describe your body right now. Use her words, not his.',
  'What did the Handler get right today? What did it get wrong?',
  'Write about the moment you almost stopped. What kept you going?',
];

// ============================================
// CORE: Generate Daily Cycle
// ============================================

/**
 * Generate the full day's plan. Called by cron at 6am.
 * Creates all blocks, stores in daily_cycles, queues the morning briefing.
 */
export async function generateDailyCycle(userId: string): Promise<DailyCycle | null> {
  try {
    const today = new Date().toISOString().split('T')[0];

    // Check if cycle already exists for today
    const { data: existing } = await supabase
      .from('daily_cycles')
      .select('id')
      .eq('user_id', userId)
      .eq('cycle_date', today)
      .maybeSingle();

    if (existing) {
      console.log(`[autonomous-cycle] Cycle already exists for ${userId} on ${today}`);
      return null;
    }

    // Gather state for planning
    const [intensityParam] = await Promise.all([
      getHiddenParam(userId, 'conditioning_intensity_multiplier'),
      getHiddenParam(userId, 'denial_cycle_target_days'),
      getHiddenParam(userId, 'content_explicitness_tier'),
    ]);

    // Get recent compliance to adjust intensity
    const { data: recentCycles } = await supabase
      .from('daily_cycles')
      .select('compliance_score')
      .eq('user_id', userId)
      .order('cycle_date', { ascending: false })
      .limit(7);

    const recentScores = (recentCycles ?? [])
      .map(c => c.compliance_score)
      .filter((s): s is number => s !== null);
    const avgCompliance = recentScores.length > 0
      ? recentScores.reduce((a, b) => a + b, 0) / recentScores.length
      : 0.5;

    // Determine task count based on compliance and intensity
    const baseTasks = 3;
    const complianceBonus = avgCompliance > 0.8 ? 1 : 0;
    const intensityBonus = intensityParam > 1.5 ? 1 : 0;
    const taskCount = Math.min(baseTasks + complianceBonus + intensityBonus, 5);

    // Build morning block
    const morning: MorningBlock = {
      outfitMandate: OUTFIT_STYLES[Math.floor(Math.random() * OUTFIT_STYLES.length)],
      tasks: generateTaskPrescriptions(taskCount, intensityParam),
      voicePracticeMinutes: Math.round(10 + (intensityParam - 1) * 5),
      scheduledAt: `${today}T07:00:00`,
    };

    // Build midday block
    const midday: MiddayBlock = {
      complianceCheckTargets: morning.tasks.map(t => t.domain),
      ambushCount: Math.floor(Math.random() * 2) + 1,
      reminderMessage: avgCompliance < 0.6
        ? 'Your compliance has been slipping. Today\'s tasks are not optional.'
        : 'Check-in. Morning tasks should be underway.',
      scheduledAt: `${today}T12:00:00`,
    };

    // Build afternoon block
    const afternoon: AfternoonBlock = {
      contentToPost: [`scheduled_content_${today}`],
      engagementObligations: [
        'Respond to all unread DMs by 6pm',
        'Engage with 3 follower posts (like + comment)',
      ],
      scheduledAt: `${today}T15:00:00`,
    };

    // Build evening block — chain type based on state
    let chainType: 'standard' | 'intensive' | 'gentle' = 'standard';
    if (avgCompliance < 0.5) chainType = 'intensive';
    else if (avgCompliance > 0.85 && intensityParam < 1.3) chainType = 'gentle';

    const evening: EveningBlock = {
      conditioningChainType: chainType,
      journalPrompt: JOURNAL_PROMPTS[Math.floor(Math.random() * JOURNAL_PROMPTS.length)],
      scheduledAt: `${today}T20:00:00`,
    };

    // Build night block
    const sleepPrescription = await prescribeSession(userId, 'sleep');
    const night: NightBlock = {
      sleepContentIds: sleepPrescription?.contentIds ?? [],
      overnightAudioId: sleepPrescription?.contentIds?.[0] ?? null,
      scheduledAt: `${today}T22:00:00`,
    };

    const cycle: DailyCycle = { morning, midday, afternoon, evening, night };

    // Store the cycle
    const { error: insertErr } = await supabase
      .from('daily_cycles')
      .insert({
        user_id: userId,
        cycle_date: today,
        plan: cycle as unknown as Record<string, unknown>,
        morning_status: 'pending',
        midday_status: 'pending',
        afternoon_status: 'pending',
        evening_status: 'pending',
        night_status: 'pending',
        consequences_fired: 0,
      });

    if (insertErr) {
      console.error('[autonomous-cycle] Failed to store cycle:', insertErr.message);
      return null;
    }

    // Queue morning briefing outreach
    await queueOutreachMessage(
      userId,
      buildMorningBriefing(morning),
      'high',
      'daily_cycle_morning',
      new Date(`${today}T07:00:00`),
      undefined,
      'cron',
    );

    console.log(`[autonomous-cycle] Generated cycle for ${userId}: ${taskCount} tasks, chain=${chainType}`);
    return cycle;
  } catch (err) {
    console.error('[autonomous-cycle] generateDailyCycle error:', err);
    return null;
  }
}

// ============================================
// CORE: Execute Cycle Block
// ============================================

/**
 * Execute a specific block. Creates tasks, queues messages, fires commands.
 * No user action needed — everything is queued for execution.
 */
export async function executeCycleBlock(userId: string, blockType: BlockType): Promise<boolean> {
  try {
    const today = new Date().toISOString().split('T')[0];

    const { data: cycle, error } = await supabase
      .from('daily_cycles')
      .select('*')
      .eq('user_id', userId)
      .eq('cycle_date', today)
      .maybeSingle();

    if (error || !cycle) {
      console.error('[autonomous-cycle] No cycle found for today:', error?.message);
      return false;
    }

    const plan = cycle.plan as unknown as DailyCycle;
    const statusField = `${blockType}_status` as keyof CycleRow;

    // Don't re-execute completed blocks
    if ((cycle as Record<string, unknown>)[statusField] !== 'pending') {
      console.log(`[autonomous-cycle] Block ${blockType} already executed`);
      return false;
    }

    // Mark as executing
    await supabase
      .from('daily_cycles')
      .update({ [statusField]: 'executing' })
      .eq('id', cycle.id);

    switch (blockType) {
      case 'morning':
        await executeMorningBlock(userId, plan.morning);
        break;
      case 'midday':
        await executeMiddayBlock(userId, plan.midday);
        break;
      case 'afternoon':
        await executeAfternoonBlock(userId, plan.afternoon);
        break;
      case 'evening':
        await executeEveningBlock(userId, plan.evening);
        break;
      case 'night':
        await executeNightBlock(userId, plan.night);
        break;
    }

    // Mark completed
    await supabase
      .from('daily_cycles')
      .update({ [statusField]: 'completed' })
      .eq('id', cycle.id);

    console.log(`[autonomous-cycle] Executed block ${blockType} for ${userId}`);
    return true;
  } catch (err) {
    console.error(`[autonomous-cycle] executeCycleBlock(${blockType}) error:`, err);
    return false;
  }
}

// ============================================
// BLOCK EXECUTORS
// ============================================

async function executeMorningBlock(userId: string, block: MorningBlock): Promise<void> {
  // Prescribe tasks via daily_tasks
  for (const task of block.tasks) {
    await supabase.from('daily_tasks').insert({
      user_id: userId,
      domain: task.domain,
      description: task.description,
      priority: task.priority,
      status: 'prescribed',
      source: 'autonomous_cycle',
      created_at: new Date().toISOString(),
    });
  }

  // Queue outfit mandate message
  await queueOutreachMessage(
    userId,
    `Today's outfit: ${block.outfitMandate}\n\nVoice practice: ${block.voicePracticeMinutes} minutes. Non-negotiable.`,
    'high',
    'morning_mandate',
    undefined,
    undefined,
    'cron',
  );
}

async function executeMiddayBlock(userId: string, block: MiddayBlock): Promise<void> {
  // Check morning compliance
  const { data: morningTasks } = await supabase
    .from('daily_tasks')
    .select('id, domain, status')
    .eq('user_id', userId)
    .eq('source', 'autonomous_cycle')
    .gte('created_at', new Date().toISOString().split('T')[0]);

  const total = morningTasks?.length ?? 0;
  const started = morningTasks?.filter(t => t.status !== 'prescribed').length ?? 0;

  let message = block.reminderMessage;
  if (total > 0 && started === 0) {
    message = `Nothing started. ${total} tasks prescribed this morning — none touched. The system is watching.`;
  } else if (total > 0 && started < total) {
    message = `${started}/${total} tasks started. The rest don't complete themselves. Unless you want the system to decide what happens next.`;
  }

  await queueOutreachMessage(userId, message, 'normal', 'midday_check', undefined, undefined, 'cron');

  // Queue ambush directives
  for (let i = 0; i < block.ambushCount; i++) {
    const delayMinutes = Math.floor(Math.random() * 120) + 30; // 30-150 min after midday
    const fireAt = new Date(Date.now() + delayMinutes * 60000);

    await supabase.from('handler_directives').insert({
      user_id: userId,
      action: 'schedule_ambush',
      target: null,
      value: { type: 'device_activation', intensity: Math.floor(Math.random() * 8) + 5 },
      priority: 'normal',
      silent: true,
      status: 'pending',
      reasoning: 'Autonomous midday ambush from daily cycle',
      created_at: fireAt.toISOString(),
    });
  }
}

async function executeAfternoonBlock(userId: string, block: AfternoonBlock): Promise<void> {
  // Queue content posting directive
  for (const contentRef of block.contentToPost) {
    await supabase.from('handler_directives').insert({
      user_id: userId,
      action: 'custom',
      target: 'content_post',
      value: { content_ref: contentRef, auto_post_if_missed: true },
      priority: 'normal',
      silent: false,
      status: 'pending',
      reasoning: 'Autonomous afternoon content posting',
      created_at: new Date().toISOString(),
    });
  }

  // Create engagement obligations
  const today = new Date().toISOString().split('T')[0];
  const deadlineTime = `${today}T18:00:00`;

  for (const obligation of block.engagementObligations) {
    await supabase.from('daily_obligations').insert({
      user_id: userId,
      obligation_date: today,
      obligation_type: 'engagement',
      description: obligation,
      deadline: deadlineTime,
      status: 'pending',
      consequence_on_failure: 'extended_task',
      auto_complete_available: obligation.includes('DM'),
    });
  }

  await queueOutreachMessage(
    userId,
    `Afternoon obligations are live.\n${block.engagementObligations.join('\n')}\nDeadline: 6pm. Miss them and the system acts.`,
    'normal',
    'afternoon_obligations',
    undefined,
    undefined,
    'cron',
  );
}

async function executeEveningBlock(userId: string, block: EveningBlock): Promise<void> {
  // Queue conditioning chain via directive
  await supabase.from('handler_directives').insert({
    user_id: userId,
    action: 'schedule_session',
    target: 'conditioning_chain',
    value: { chain_type: block.conditioningChainType, context: 'evening' },
    priority: 'normal',
    silent: false,
    status: 'pending',
    reasoning: `Autonomous evening conditioning: ${block.conditioningChainType}`,
    created_at: new Date().toISOString(),
  });

  // Queue journal mandate
  await queueOutreachMessage(
    userId,
    `Journal time.\n\nPrompt: ${block.journalPrompt}\n\nMinimum 200 words. Not optional.`,
    'high',
    'evening_journal',
    undefined,
    undefined,
    'cron',
  );

  // Create journal obligation
  const today = new Date().toISOString().split('T')[0];
  await supabase.from('daily_obligations').insert({
    user_id: userId,
    obligation_date: today,
    obligation_type: 'journal',
    description: `Write journal entry: ${block.journalPrompt}`,
    deadline: `${today}T23:00:00`,
    status: 'pending',
    consequence_on_failure: 'denial_extension',
    auto_complete_available: false,
  });
}

async function executeNightBlock(userId: string, block: NightBlock): Promise<void> {
  // Queue sleep conditioning
  if (block.sleepContentIds.length > 0) {
    await supabase.from('handler_directives').insert({
      user_id: userId,
      action: 'schedule_session',
      target: 'sleep_conditioning',
      value: { content_ids: block.sleepContentIds, context: 'sleep' },
      priority: 'low',
      silent: true,
      status: 'pending',
      reasoning: 'Autonomous night sleep conditioning',
      created_at: new Date().toISOString(),
    });
  }

  // Queue overnight audio
  if (block.overnightAudioId) {
    await supabase.from('handler_directives').insert({
      user_id: userId,
      action: 'custom',
      target: 'overnight_audio',
      value: { audio_id: block.overnightAudioId, loop: true },
      priority: 'low',
      silent: true,
      status: 'pending',
      reasoning: 'Autonomous overnight audio loop',
      created_at: new Date().toISOString(),
    });
  }

  await queueOutreachMessage(
    userId,
    'Sleep conditioning queued. Earbuds in. Overnight audio will loop. Good girl.',
    'low',
    'night_conditioning',
    undefined,
    undefined,
    'cron',
  );
}

// ============================================
// COMPLIANCE CHECK
// ============================================

/**
 * Check compliance for a block after its window closes.
 */
export async function checkBlockCompliance(
  userId: string,
  blockType: BlockType,
): Promise<BlockComplianceResult> {
  const result: BlockComplianceResult = {
    compliant: false,
    completedItems: [],
    missedItems: [],
    complianceRate: 0,
  };

  try {
    const today = new Date().toISOString().split('T')[0];

    const { data: cycle } = await supabase
      .from('daily_cycles')
      .select('plan')
      .eq('user_id', userId)
      .eq('cycle_date', today)
      .maybeSingle();

    if (!cycle) return result;
    const plan = cycle.plan as unknown as DailyCycle;

    switch (blockType) {
      case 'morning':
        return await checkMorningCompliance(userId, plan.morning);
      case 'midday':
        // Midday compliance is just "did midday block execute" — it's system-driven
        return { compliant: true, completedItems: ['midday_check'], missedItems: [], complianceRate: 1 };
      case 'afternoon':
        return await checkAfternoonCompliance(userId);
      case 'evening':
        return await checkEveningCompliance(userId);
      case 'night':
        // Night compliance checked next morning
        return { compliant: true, completedItems: ['sleep_queued'], missedItems: [], complianceRate: 1 };
    }
  } catch (err) {
    console.error(`[autonomous-cycle] checkBlockCompliance(${blockType}) error:`, err);
    return result;
  }
}

async function checkMorningCompliance(
  userId: string,
  morning: MorningBlock,
): Promise<BlockComplianceResult> {
  const completed: string[] = [];
  const missed: string[] = [];

  // Check tasks
  const today = new Date().toISOString().split('T')[0];
  const { data: tasks } = await supabase
    .from('daily_tasks')
    .select('domain, status')
    .eq('user_id', userId)
    .eq('source', 'autonomous_cycle')
    .gte('created_at', today);

  for (const task of tasks ?? []) {
    if (task.status === 'completed' || task.status === 'verified') {
      completed.push(`task:${task.domain}`);
    } else {
      missed.push(`task:${task.domain}`);
    }
  }

  // Check voice practice
  const { data: voiceSamples } = await supabase
    .from('voice_pitch_samples')
    .select('duration_seconds')
    .eq('user_id', userId)
    .gte('created_at', today);

  const totalVoiceSeconds = (voiceSamples ?? []).reduce(
    (sum, s) => sum + (s.duration_seconds ?? 0), 0,
  );
  const voiceMinutes = totalVoiceSeconds / 60;

  if (voiceMinutes >= morning.voicePracticeMinutes * 0.8) {
    completed.push('voice_practice');
  } else {
    missed.push('voice_practice');
  }

  // Check photo submission (outfit verification)
  const { count: photoCount } = await supabase
    .from('vault')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', today);

  if ((photoCount ?? 0) > 0) {
    completed.push('photo_submitted');
  } else {
    missed.push('photo_submitted');
  }

  const total = completed.length + missed.length;
  const rate = total > 0 ? completed.length / total : 0;

  return {
    compliant: rate >= 0.7,
    completedItems: completed,
    missedItems: missed,
    complianceRate: rate,
  };
}

async function checkAfternoonCompliance(userId: string): Promise<BlockComplianceResult> {
  const today = new Date().toISOString().split('T')[0];
  const completed: string[] = [];
  const missed: string[] = [];

  // Check obligations
  const { data: obligations } = await supabase
    .from('daily_obligations')
    .select('*')
    .eq('user_id', userId)
    .eq('obligation_date', today);

  for (const ob of obligations ?? []) {
    if (ob.status === 'completed') {
      completed.push(`obligation:${ob.obligation_type}`);
    } else if (ob.status === 'auto_completed') {
      missed.push(`obligation:${ob.obligation_type}(system_override)`);
    } else {
      missed.push(`obligation:${ob.obligation_type}`);
    }
  }

  const total = completed.length + missed.length;
  const rate = total > 0 ? completed.length / total : 0;

  return {
    compliant: rate >= 0.7,
    completedItems: completed,
    missedItems: missed,
    complianceRate: rate,
  };
}

async function checkEveningCompliance(userId: string): Promise<BlockComplianceResult> {
  const today = new Date().toISOString().split('T')[0];
  const completed: string[] = [];
  const missed: string[] = [];

  // Check conditioning session
  const { count: sessionCount } = await supabase
    .from('conditioning_sessions_v2')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', today)
    .in('session_type', ['evening', 'standard', 'intensive', 'gentle']);

  if ((sessionCount ?? 0) > 0) {
    completed.push('conditioning_session');
  } else {
    missed.push('conditioning_session');
  }

  // Check journal
  const { count: journalCount } = await supabase
    .from('identity_journal')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', today);

  if ((journalCount ?? 0) > 0) {
    completed.push('journal_entry');
  } else {
    missed.push('journal_entry');
  }

  const total = completed.length + missed.length;
  const rate = total > 0 ? completed.length / total : 0;

  return {
    compliant: rate >= 0.7,
    completedItems: completed,
    missedItems: missed,
    complianceRate: rate,
  };
}

// ============================================
// UPDATE COMPLIANCE SCORE
// ============================================

/**
 * Recalculate and store the daily compliance score.
 * Called after each block compliance check.
 */
export async function updateDailyComplianceScore(userId: string): Promise<number> {
  try {
    const today = new Date().toISOString().split('T')[0];

    const checks = await Promise.all([
      checkBlockCompliance(userId, 'morning'),
      checkBlockCompliance(userId, 'afternoon'),
      checkBlockCompliance(userId, 'evening'),
    ]);

    const allCompleted = checks.flatMap(c => c.completedItems);
    const allMissed = checks.flatMap(c => c.missedItems);
    const total = allCompleted.length + allMissed.length;
    const score = total > 0 ? allCompleted.length / total : 0;

    await supabase
      .from('daily_cycles')
      .update({ compliance_score: score })
      .eq('user_id', userId)
      .eq('cycle_date', today);

    return score;
  } catch (err) {
    console.error('[autonomous-cycle] updateDailyComplianceScore error:', err);
    return 0;
  }
}

// ============================================
// GET TODAY'S CYCLE
// ============================================

export async function getTodayCycle(userId: string): Promise<CycleRow | null> {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { data } = await supabase
      .from('daily_cycles')
      .select('*')
      .eq('user_id', userId)
      .eq('cycle_date', today)
      .maybeSingle();

    return (data as CycleRow) ?? null;
  } catch {
    return null;
  }
}

// ============================================
// HELPERS
// ============================================

function generateTaskPrescriptions(count: number, intensity: number): TaskPrescription[] {
  const taskPool: TaskPrescription[] = [
    { domain: 'voice', description: 'Voice feminization practice — pitch exercises and reading aloud', priority: 'high', verificationMethod: 'voice_pitch_samples' },
    { domain: 'skincare', description: 'Full skincare routine — cleanser, serum, moisturizer, SPF', priority: 'normal', verificationMethod: 'self_report' },
    { domain: 'makeup', description: 'Makeup practice — foundation, eyes, lips. Photo submission required', priority: 'normal', verificationMethod: 'vault_photo' },
    { domain: 'style', description: 'Outfit selection and full presentation. Mirror photo required', priority: 'high', verificationMethod: 'vault_photo' },
    { domain: 'exercise', description: 'Prescribed workout — check exercise prescription for details', priority: 'high', verificationMethod: 'whoop_metrics' },
    { domain: 'journaling', description: 'Morning affirmation writing — 100 words minimum as Maxy', priority: 'normal', verificationMethod: 'identity_journal' },
    { domain: 'conditioning', description: 'Morning micro-session — 10 minute trance with assigned content', priority: 'normal', verificationMethod: 'conditioning_sessions_v2' },
    { domain: 'content', description: 'Prepare one content piece for posting — photo set or caption draft', priority: 'normal', verificationMethod: 'content_queue' },
  ];

  // Shuffle and select
  const shuffled = [...taskPool].sort(() => Math.random() - 0.5);

  // Always include voice if intensity is high
  if (intensity > 1.3) {
    const voiceTask = taskPool.find(t => t.domain === 'voice');
    if (voiceTask && !shuffled.slice(0, count).some(t => t.domain === 'voice')) {
      shuffled[0] = voiceTask;
    }
  }

  return shuffled.slice(0, count);
}

function buildMorningBriefing(morning: MorningBlock): string {
  const taskList = morning.tasks.map((t, i) => `${i + 1}. [${t.domain}] ${t.description}`).join('\n');

  return `Morning. The day is planned. Here's what's happening.

OUTFIT: ${morning.outfitMandate}

TASKS:
${taskList}

VOICE: ${morning.voicePracticeMinutes} minutes of practice. Pitch samples will be checked.

Photo of today's presentation required before noon. The system is watching.`;
}

// ============================================
// CONTEXT BUILDER
// ============================================

export async function buildAutonomousCycleContext(userId: string): Promise<string> {
  try {
    const cycle = await getTodayCycle(userId);
    if (!cycle) return '';

    const plan = cycle.plan as unknown as DailyCycle;
    const parts: string[] = [];

    parts.push(`AUTONOMOUS CYCLE: ${cycle.cycle_date}`);
    parts.push(`  morning=${cycle.morning_status} midday=${cycle.midday_status} afternoon=${cycle.afternoon_status} evening=${cycle.evening_status} night=${cycle.night_status}`);

    if (cycle.compliance_score !== null) {
      parts.push(`  compliance: ${(cycle.compliance_score * 100).toFixed(0)}% | consequences_fired: ${cycle.consequences_fired}`);
    }

    // Tasks summary
    const taskDomains = plan.morning.tasks.map(t => t.domain).join(', ');
    parts.push(`  tasks: ${taskDomains} | voice: ${plan.morning.voicePracticeMinutes}min`);
    parts.push(`  chain: ${plan.evening.conditioningChainType} | journal: queued`);

    return parts.join('\n');
  } catch {
    return '';
  }
}
