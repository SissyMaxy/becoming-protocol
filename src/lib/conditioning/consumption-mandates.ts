/**
 * Content Consumption Mandates
 *
 * Maxy must consume specific content daily. Not optional.
 * Audio, visual, reading, ambient — all tracked, all mandated.
 * Non-completion fires the consequence engine.
 *
 * Tables: conditioning_sessions_v2, external_content_index,
 *         content_curriculum, consumption_mandates,
 *         handler_outreach_queue
 */

import { supabase } from '../supabase';
import { assessConsequence } from './consequence-engine';
import { queueOutreachMessage } from './proactive-outreach';

// ============================================
// TYPES
// ============================================

export type ConsumptionType = 'audio_conditioning' | 'visual_goon' | 'caption_review' | 'ambient_background';

export interface ConsumptionMandate {
  id: string;
  userId: string;
  date: string;
  type: ConsumptionType;
  description: string;
  minimumMinutes: number;
  deadline: string;
  completed: boolean;
  completedAt: string | null;
  evidence: string | null;
}

export interface ConsumptionStatus {
  total: number;
  completed: number;
  pending: number;
  missed: number;
  mandates: ConsumptionMandate[];
}

// ============================================
// CONSUMPTION REQUIREMENTS BY PHASE + DENIAL
// ============================================

interface ConsumptionTemplate {
  type: ConsumptionType;
  descriptionFn: (denialDay: number) => string;
  minutesFn: (denialDay: number) => number;
  deadlineHour: number;
  condition: (phase: number, denialDay: number) => boolean;
}

const CONSUMPTION_TEMPLATES: ConsumptionTemplate[] = [
  {
    type: 'audio_conditioning',
    descriptionFn: () => 'Listen to 1 conditioning script. Full attention. No multitasking.',
    minutesFn: () => 15,
    deadlineHour: 22,
    condition: () => true, // Always mandated
  },
  {
    type: 'visual_goon',
    descriptionFn: (d) => d >= 7
      ? 'Minimum 20 minutes goon/PMV content. Edge at least 3 times during.'
      : 'Minimum 10 minutes goon/PMV content consumption.',
    minutesFn: (d) => d >= 7 ? 20 : d >= 5 ? 15 : 10,
    deadlineHour: 23,
    condition: (_p, d) => d >= 3, // Only on denial day 3+
  },
  {
    type: 'caption_review',
    descriptionFn: () => 'Review 1 sissy caption set. Read every word. Let it settle.',
    minutesFn: () => 5,
    deadlineHour: 21,
    condition: (p) => p >= 2, // Phase 2+
  },
  {
    type: 'ambient_background',
    descriptionFn: () => 'Background conditioning audio during daily tasks — minimum 30 minutes.',
    minutesFn: () => 30,
    deadlineHour: 20,
    condition: (p) => p >= 3, // Phase 3+
  },
];

// ============================================
// CORE FUNCTIONS
// ============================================

/**
 * Prescribe today's content consumption mandates.
 */
export async function prescribeConsumption(userId: string): Promise<ConsumptionMandate[]> {
  const today = new Date().toISOString().slice(0, 10);

  // Check for existing mandates today
  const { data: existing } = await supabase
    .from('consumption_mandates')
    .select('*')
    .eq('user_id', userId)
    .eq('date', today);

  if (existing && existing.length > 0) {
    return existing.map(mapDbToMandate);
  }

  // Fetch state
  const { data: state } = await supabase
    .from('user_state')
    .select('conditioning_phase, denial_day')
    .eq('user_id', userId)
    .maybeSingle();

  const phase = state?.conditioning_phase ?? 1;
  const denialDay = state?.denial_day ?? 0;

  // Generate applicable mandates
  const mandates: ConsumptionMandate[] = [];

  for (const template of CONSUMPTION_TEMPLATES) {
    if (!template.condition(phase, denialDay)) continue;

    const deadline = new Date();
    deadline.setHours(template.deadlineHour, 0, 0, 0);
    if (deadline.getTime() < Date.now()) continue;

    const mandate: ConsumptionMandate = {
      id: `consume_${today}_${template.type}`,
      userId,
      date: today,
      type: template.type,
      description: template.descriptionFn(denialDay),
      minimumMinutes: template.minutesFn(denialDay),
      deadline: deadline.toISOString(),
      completed: false,
      completedAt: null,
      evidence: null,
    };

    mandates.push(mandate);
  }

  // Store
  if (mandates.length > 0) {
    await supabase.from('consumption_mandates').upsert(
      mandates.map((m) => ({
        id: m.id,
        user_id: userId,
        date: m.date,
        consumption_type: m.type,
        description: m.description,
        minimum_minutes: m.minimumMinutes,
        deadline: m.deadline,
        completed: false,
        completed_at: null,
        evidence: null,
        consequence_fired: false,
      })),
      { onConflict: 'id' },
    );
  }

  return mandates;
}

/**
 * Verify consumption compliance for today. Check session records
 * and content consumption logs.
 */
export async function verifyConsumption(
  userId: string,
  date?: string,
): Promise<ConsumptionStatus> {
  const targetDate = date ?? new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();

  const { data: mandates } = await supabase
    .from('consumption_mandates')
    .select('*')
    .eq('user_id', userId)
    .eq('date', targetDate)
    .order('deadline', { ascending: true });

  if (!mandates || mandates.length === 0) {
    return { total: 0, completed: 0, pending: 0, missed: 0, mandates: [] };
  }

  // Check each mandate against actual consumption
  for (const mandate of mandates) {
    if (mandate.completed) continue;

    let verified = false;
    let evidence: string | null = null;

    switch (mandate.consumption_type as ConsumptionType) {
      case 'audio_conditioning': {
        const { data: sessions } = await supabase
          .from('conditioning_sessions_v2')
          .select('id, session_type')
          .eq('user_id', userId)
          .in('session_type', ['scripted', 'hypno', 'audio', 'conditioning'])
          .gte('started_at', `${targetDate}T00:00:00`)
          .lte('started_at', `${targetDate}T23:59:59`)
          .limit(1);
        if (sessions && sessions.length > 0) {
          verified = true;
          evidence = `session:${sessions[0].id}`;
        }
        break;
      }
      case 'visual_goon': {
        const { data: sessions } = await supabase
          .from('conditioning_sessions_v2')
          .select('id, session_type')
          .eq('user_id', userId)
          .in('session_type', ['goon', 'edge', 'pmv'])
          .gte('started_at', `${targetDate}T00:00:00`)
          .lte('started_at', `${targetDate}T23:59:59`)
          .limit(1);
        if (sessions && sessions.length > 0) {
          verified = true;
          evidence = `session:${sessions[0].id}`;
        }
        break;
      }
      case 'caption_review': {
        // Check external_content_index for caption consumption
        const { data: consumed } = await supabase
          .from('external_content_index')
          .select('id')
          .eq('user_id', userId)
          .eq('content_type', 'caption_set')
          .gte('last_consumed_at', `${targetDate}T00:00:00`)
          .lte('last_consumed_at', `${targetDate}T23:59:59`)
          .limit(1);
        if (consumed && consumed.length > 0) {
          verified = true;
          evidence = `content:${consumed[0].id}`;
        }
        break;
      }
      case 'ambient_background': {
        const { data: sessions } = await supabase
          .from('conditioning_sessions_v2')
          .select('id')
          .eq('user_id', userId)
          .eq('session_type', 'background')
          .gte('started_at', `${targetDate}T00:00:00`)
          .lte('started_at', `${targetDate}T23:59:59`)
          .limit(1);
        if (sessions && sessions.length > 0) {
          verified = true;
          evidence = `session:${sessions[0].id}`;
        }
        break;
      }
    }

    if (verified) {
      await supabase
        .from('consumption_mandates')
        .update({
          completed: true,
          completed_at: new Date().toISOString(),
          evidence,
        })
        .eq('id', mandate.id);

      mandate.completed = true;
      mandate.completed_at = new Date().toISOString();
      mandate.evidence = evidence;
    }
  }

  const mapped = mandates.map(mapDbToMandate);
  const completed = mapped.filter((m) => m.completed).length;
  const missed = mapped.filter((m) => !m.completed && m.deadline < now).length;
  const pending = mapped.length - completed - missed;

  return {
    total: mapped.length,
    completed,
    pending,
    missed,
    mandates: mapped,
  };
}

/**
 * Process overdue consumption mandates. Fire consequences.
 */
export async function processOverdueConsumption(userId: string): Promise<number> {
  const now = new Date().toISOString();
  const today = new Date().toISOString().slice(0, 10);

  const { data: overdue } = await supabase
    .from('consumption_mandates')
    .select('*')
    .eq('user_id', userId)
    .eq('date', today)
    .eq('completed', false)
    .eq('consequence_fired', false)
    .lt('deadline', now);

  if (!overdue || overdue.length === 0) return 0;

  let fired = 0;
  for (const mandate of overdue) {
    // Verify one last time
    const status = await verifyConsumption(userId, today);
    const thisMandate = status.mandates.find((m) => m.id === mandate.id);
    if (thisMandate?.completed) continue;

    await assessConsequence(userId, [`consumption_miss:${mandate.consumption_type}`]);

    await queueOutreachMessage(
      userId,
      `You didn't complete your ${mandate.consumption_type.replace(/_/g, ' ')} consumption. "${mandate.description}" — This is tracked. This is measured. This has consequences.`,
      'high',
      `consumption_miss:${mandate.id}`,
      undefined,
      undefined,
      'system',
    );

    await supabase
      .from('consumption_mandates')
      .update({ consequence_fired: true })
      .eq('id', mandate.id);

    fired++;
  }

  return fired;
}

/**
 * Build handler context for consumption compliance.
 */
export async function buildConsumptionContext(userId: string): Promise<string> {
  try {
    const status = await verifyConsumption(userId);
    if (status.total === 0) return '';

    const lines: string[] = ['## Content Consumption Mandates'];
    lines.push(`STATUS: ${status.completed}/${status.total} completed | ${status.pending} pending | ${status.missed} MISSED`);

    for (const m of status.mandates) {
      const icon = m.completed ? '[OK]' : m.deadline < new Date().toISOString() ? '[MISS]' : '[PEND]';
      const time = new Date(m.deadline).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      lines.push(`  ${icon} ${m.type}: ${m.description.slice(0, 60)} — ${m.minimumMinutes}min by ${time}`);
    }

    if (status.missed > 0) {
      lines.push(`ENFORCEMENT: ${status.missed} consumption mandate(s) missed — consequences fired.`);
    }

    return lines.join('\n');
  } catch {
    return '';
  }
}

// ============================================
// HELPERS
// ============================================

function mapDbToMandate(row: Record<string, unknown>): ConsumptionMandate {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    date: row.date as string,
    type: (row.consumption_type ?? row.type) as ConsumptionType,
    description: row.description as string,
    minimumMinutes: (row.minimum_minutes ?? row.minimumMinutes) as number,
    deadline: row.deadline as string,
    completed: row.completed as boolean,
    completedAt: (row.completed_at ?? null) as string | null,
    evidence: (row.evidence ?? null) as string | null,
  };
}
