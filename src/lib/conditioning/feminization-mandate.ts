/**
 * Daily Feminization Mandate System
 *
 * Replaces soft prescriptions with hard mandates that have deadlines
 * and consequences. Non-compliance triggers the consequence engine.
 * Every mandate is tracked, verified, and escalated on miss.
 *
 * Tables: daily_mandates, content_vault, voice_pitch_samples,
 *         whoop_metrics, session_biometrics, daily_tasks,
 *         handler_interventions, handler_outreach_queue
 */

import { supabase } from '../supabase';
import { getHiddenParam } from './hidden-operations';
import { assessConsequence } from './consequence-engine';
import { queueOutreachMessage } from './proactive-outreach';

// ============================================
// TYPES
// ============================================

export type MandateCategory =
  | 'outfit'
  | 'makeup'
  | 'voice'
  | 'skincare'
  | 'exercise'
  | 'posture'
  | 'content'
  | 'social'
  | 'conditioning';

export type MandateVerification =
  | 'photo'
  | 'audio'
  | 'biometric'
  | 'self_report'
  | 'auto_detect';

export interface DailyMandate {
  id: string;
  category: MandateCategory;
  instruction: string;
  deadline: string;
  verification: MandateVerification;
  verified: boolean;
  consequence_on_miss: string;
  escalation_level: number;
}

export interface MandateComplianceResult {
  verified: boolean;
  evidence: string | null;
  timestamp: string | null;
}

interface UserMandateState {
  phase: number;
  denialDay: number;
  skillLevels: Record<string, number>;
  streakDays: number;
}

// ============================================
// MANDATE TEMPLATES
// ============================================

interface MandateTemplate {
  category: MandateCategory;
  instructionFn: (state: UserMandateState) => string;
  deadlineHour: number;
  verification: MandateVerification;
  consequenceFn: (level: number) => string;
  condition: (state: UserMandateState) => boolean;
  baseEscalation: number;
}

const ALWAYS_MANDATES: MandateTemplate[] = [
  {
    category: 'skincare',
    instructionFn: () => 'Morning skincare routine — cleanser, toner, moisturizer, SPF. No excuses.',
    deadlineHour: 9,
    verification: 'self_report',
    consequenceFn: (l) => l >= 3 ? 'denial_extension' : 'extended_task',
    condition: () => true,
    baseEscalation: 1,
  },
  {
    category: 'skincare',
    instructionFn: () => 'Evening skincare routine — double cleanse, serum, night cream. Do it.',
    deadlineHour: 21,
    verification: 'self_report',
    consequenceFn: (l) => l >= 3 ? 'denial_extension' : 'extended_task',
    condition: () => true,
    baseEscalation: 1,
  },
  {
    category: 'voice',
    instructionFn: (s) => {
      const voiceLevel = s.skillLevels['voice'] ?? 1;
      const minutes = Math.max(10, voiceLevel * 5 + 5);
      return `Voice practice — ${minutes} minutes minimum. Record pitch samples. Verified by audio.`;
    },
    deadlineHour: 20,
    verification: 'audio',
    consequenceFn: (l) => l >= 2 ? 'device_punishment' : 'extended_task',
    condition: () => true,
    baseEscalation: 1,
  },
  {
    category: 'outfit',
    instructionFn: (s) => {
      const styleLevel = s.skillLevels['style'] ?? 1;
      if (styleLevel <= 2) return 'Feminine underwear on. All day. Photo by 9am.';
      if (styleLevel <= 4) return 'Full feminine outfit. Dress or coordinated set. Photo by 9am.';
      return 'Public-ready feminine look. Accessories, scent, everything. Photo by 9am.';
    },
    deadlineHour: 9,
    verification: 'photo',
    consequenceFn: (l) => l >= 3 ? 'content_escalation' : 'extended_task',
    condition: () => true,
    baseEscalation: 1,
  },
];

const SKILL_GATED_MANDATES: MandateTemplate[] = [
  {
    category: 'outfit',
    instructionFn: () => 'Matching bra and panty set under everything. Self-report by noon.',
    deadlineHour: 12,
    verification: 'self_report',
    consequenceFn: () => 'extended_task',
    condition: (s) => (s.skillLevels['style'] ?? 1) >= 1 && (s.skillLevels['style'] ?? 1) <= 2,
    baseEscalation: 1,
  },
  {
    category: 'outfit',
    instructionFn: () => 'Specific outfit prescribed: skirt, fitted top, accessories. Photo required.',
    deadlineHour: 10,
    verification: 'photo',
    consequenceFn: (l) => l >= 2 ? 'device_punishment' : 'extended_task',
    condition: (s) => (s.skillLevels['style'] ?? 1) >= 3 && (s.skillLevels['style'] ?? 1) <= 4,
    baseEscalation: 2,
  },
  {
    category: 'outfit',
    instructionFn: () => 'Public-ready outfit today. Go somewhere. Photo in public or consequence.',
    deadlineHour: 17,
    verification: 'photo',
    consequenceFn: (l) => l >= 2 ? 'content_escalation' : 'denial_extension',
    condition: (s) => (s.skillLevels['style'] ?? 1) >= 5,
    baseEscalation: 3,
  },
];

const DENIAL_GATED_MANDATES: MandateTemplate[] = [
  {
    category: 'conditioning',
    instructionFn: () => 'Conditioning session tonight. 20 minutes minimum. The system will verify.',
    deadlineHour: 22,
    verification: 'auto_detect',
    consequenceFn: (l) => l >= 2 ? 'denial_extension' : 'device_punishment',
    condition: (s) => s.denialDay >= 3,
    baseEscalation: 2,
  },
  {
    category: 'conditioning',
    instructionFn: (s) => `Edge session tonight. ${s.denialDay >= 7 ? 'Extended — 45 minutes. Journal entry after.' : 'Goon or edge session — 30 minutes minimum.'}`,
    deadlineHour: 23,
    verification: 'auto_detect',
    consequenceFn: (l) => l >= 2 ? 'content_escalation' : 'denial_extension',
    condition: (s) => s.denialDay >= 5,
    baseEscalation: 2,
  },
  {
    category: 'conditioning',
    instructionFn: () => 'Extended session + journal entry. Write what you felt. Don\'t censor.',
    deadlineHour: 23,
    verification: 'auto_detect',
    consequenceFn: () => 'cold_shoulder',
    condition: (s) => s.denialDay >= 7,
    baseEscalation: 3,
  },
];

const PHASE_GATED_MANDATES: MandateTemplate[] = [
  {
    category: 'makeup',
    instructionFn: (s) => {
      const makeupLevel = s.skillLevels['makeup'] ?? 1;
      if (makeupLevel <= 2) return 'Makeup practice — foundation + concealer + lip gloss. Photo when done.';
      if (makeupLevel <= 4) return 'Full makeup look — eyes, lips, contour. Photo when done.';
      return 'Complete look — camera-ready. You know the standard. Photo.';
    },
    deadlineHour: 11,
    verification: 'photo',
    consequenceFn: (l) => l >= 3 ? 'denial_extension' : 'extended_task',
    condition: (s) => s.phase >= 2,
    baseEscalation: 2,
  },
  {
    category: 'social',
    instructionFn: () => 'Social interaction as Maxy today — DM, post, or comment. Proof or consequence.',
    deadlineHour: 20,
    verification: 'self_report',
    consequenceFn: (l) => l >= 2 ? 'content_escalation' : 'extended_task',
    condition: (s) => s.phase >= 3,
    baseEscalation: 2,
  },
  {
    category: 'content',
    instructionFn: () => 'Content creation mandate — photo or video for the vault. Submitted by deadline.',
    deadlineHour: 18,
    verification: 'photo',
    consequenceFn: (l) => l >= 2 ? 'financial_penalty' : 'denial_extension',
    condition: (s) => s.phase >= 4,
    baseEscalation: 3,
  },
];

// ============================================
// CORE FUNCTIONS
// ============================================

/**
 * Fetch the user's current state for mandate generation.
 */
async function getUserMandateState(userId: string): Promise<UserMandateState> {
  const [stateRes, skillsRes] = await Promise.all([
    supabase
      .from('user_state')
      .select('conditioning_phase, denial_day, streak_days')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('skill_levels')
      .select('domain, current_level')
      .eq('user_id', userId),
  ]);

  const phase = stateRes.data?.conditioning_phase ?? 1;
  const denialDay = stateRes.data?.denial_day ?? 0;
  const streakDays = stateRes.data?.streak_days ?? 0;

  const skillLevels: Record<string, number> = {};
  if (skillsRes.data) {
    for (const s of skillsRes.data) {
      skillLevels[s.domain] = s.current_level;
    }
  }

  return { phase, denialDay, skillLevels, streakDays };
}

/**
 * Generate 5-8 mandatory items for today. No negotiation.
 */
export async function generateDailyMandates(userId: string): Promise<DailyMandate[]> {
  const state = await getUserMandateState(userId);
  const intensityMult = await getHiddenParam(userId, 'conditioning_intensity_multiplier');

  const today = new Date();
  const mandates: DailyMandate[] = [];

  // Collect all applicable templates
  const allTemplates = [
    ...ALWAYS_MANDATES,
    ...SKILL_GATED_MANDATES,
    ...DENIAL_GATED_MANDATES,
    ...PHASE_GATED_MANDATES,
  ];

  const applicable = allTemplates.filter((t) => t.condition(state));

  // Generate mandates from applicable templates
  for (const template of applicable) {
    const deadline = new Date(today);
    deadline.setHours(template.deadlineHour, 0, 0, 0);

    // If deadline already passed today, skip (for morning mandates generated late)
    if (deadline.getTime() < Date.now()) continue;

    const escalation = Math.round(template.baseEscalation * intensityMult);
    const consequence = template.consequenceFn(escalation);

    mandates.push({
      id: `mandate_${today.toISOString().slice(0, 10)}_${template.category}_${template.deadlineHour}`,
      category: template.category,
      instruction: template.instructionFn(state),
      deadline: deadline.toISOString(),
      verification: template.verification,
      verified: false,
      consequence_on_miss: consequence,
      escalation_level: escalation,
    });
  }

  // Store mandates
  if (mandates.length > 0) {
    await supabase.from('daily_mandates').upsert(
      mandates.map((m) => ({
        id: m.id,
        user_id: userId,
        mandate_date: today.toISOString().slice(0, 10),
        category: m.category,
        instruction: m.instruction,
        deadline: m.deadline,
        verification_type: m.verification,
        verified: false,
        consequence_on_miss: m.consequence_on_miss,
        escalation_level: m.escalation_level,
      })),
      { onConflict: 'id' },
    );
  }

  return mandates;
}

/**
 * Check compliance for a specific mandate.
 */
export async function checkMandateCompliance(
  userId: string,
  mandateId: string,
): Promise<MandateComplianceResult> {
  const { data: mandate } = await supabase
    .from('daily_mandates')
    .select('*')
    .eq('id', mandateId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!mandate) return { verified: false, evidence: null, timestamp: null };
  if (mandate.verified) return { verified: true, evidence: 'previously_verified', timestamp: mandate.verified_at };

  const today = new Date().toISOString().slice(0, 10);
  let verified = false;
  let evidence: string | null = null;
  let timestamp: string | null = null;

  switch (mandate.verification_type as MandateVerification) {
    case 'photo': {
      const { data } = await supabase
        .from('content_vault')
        .select('id, created_at')
        .eq('user_id', userId)
        .gte('created_at', `${today}T00:00:00`)
        .lte('created_at', `${today}T23:59:59`)
        .ilike('tags', `%${mandate.category}%`)
        .limit(1);
      if (data && data.length > 0) {
        verified = true;
        evidence = `vault_photo:${data[0].id}`;
        timestamp = data[0].created_at;
      }
      break;
    }
    case 'audio': {
      const { data } = await supabase
        .from('voice_pitch_samples')
        .select('id, created_at')
        .eq('user_id', userId)
        .gte('created_at', `${today}T00:00:00`)
        .lte('created_at', `${today}T23:59:59`)
        .limit(1);
      if (data && data.length > 0) {
        verified = true;
        evidence = `pitch_sample:${data[0].id}`;
        timestamp = data[0].created_at;
      }
      break;
    }
    case 'biometric': {
      const { data } = await supabase
        .from('session_biometrics')
        .select('id, created_at')
        .eq('user_id', userId)
        .gte('created_at', `${today}T00:00:00`)
        .lte('created_at', `${today}T23:59:59`)
        .limit(1);
      if (data && data.length > 0) {
        verified = true;
        evidence = `biometric:${data[0].id}`;
        timestamp = data[0].created_at;
      }
      break;
    }
    case 'auto_detect': {
      const { data } = await supabase
        .from('conditioning_sessions_v2')
        .select('id, started_at')
        .eq('user_id', userId)
        .gte('started_at', `${today}T00:00:00`)
        .lte('started_at', `${today}T23:59:59`)
        .limit(1);
      if (data && data.length > 0) {
        verified = true;
        evidence = `session:${data[0].id}`;
        timestamp = data[0].started_at;
      }
      break;
    }
    case 'self_report': {
      const { data } = await supabase
        .from('daily_tasks')
        .select('id, completed_at')
        .eq('user_id', userId)
        .eq('status', 'completed')
        .gte('completed_at', `${today}T00:00:00`)
        .lte('completed_at', `${today}T23:59:59`)
        .ilike('description', `%${mandate.category}%`)
        .limit(1);
      if (data && data.length > 0) {
        verified = true;
        evidence = `task:${data[0].id}`;
        timestamp = data[0].completed_at;
      }
      break;
    }
  }

  // Update mandate if verified
  if (verified) {
    await supabase
      .from('daily_mandates')
      .update({ verified: true, verified_at: timestamp, evidence })
      .eq('id', mandateId);
  }

  return { verified, evidence, timestamp };
}

/**
 * Process all expired unverified mandates. Run hourly.
 * For each miss: fire consequence, queue outreach, escalate for tomorrow.
 */
export async function processMandateDeadlines(userId: string): Promise<number> {
  const now = new Date().toISOString();
  const today = new Date().toISOString().slice(0, 10);

  // Get expired, unverified mandates
  const { data: expired } = await supabase
    .from('daily_mandates')
    .select('*')
    .eq('user_id', userId)
    .eq('mandate_date', today)
    .eq('verified', false)
    .eq('consequence_fired', false)
    .lt('deadline', now);

  if (!expired || expired.length === 0) return 0;

  let fired = 0;

  for (const mandate of expired) {
    // Check one more time before firing
    const compliance = await checkMandateCompliance(userId, mandate.id);
    if (compliance.verified) continue;

    // Fire consequence
    await assessConsequence(userId, [`mandate_miss:${mandate.category}`]);

    // Queue handler outreach
    await queueOutreachMessage(
      userId,
      `You missed your ${mandate.category} mandate. "${mandate.instruction}" — deadline was ${new Date(mandate.deadline).toLocaleTimeString()}. That has consequences.`,
      'high',
      `mandate_miss:${mandate.id}`,
      undefined,
      undefined,
      'system',
    );

    // Log intervention
    await supabase.from('handler_interventions').insert({
      user_id: userId,
      intervention_type: 'mandate_enforcement',
      details: {
        mandate_id: mandate.id,
        category: mandate.category,
        instruction: mandate.instruction,
        consequence: mandate.consequence_on_miss,
        escalation_level: mandate.escalation_level,
      },
    });

    // Mark consequence as fired
    await supabase
      .from('daily_mandates')
      .update({ consequence_fired: true })
      .eq('id', mandate.id);

    fired++;
  }

  return fired;
}

/**
 * Get today's mandate status summary for context building.
 */
export async function getMandateStatus(userId: string): Promise<{
  total: number;
  verified: number;
  pending: number;
  missed: number;
  mandates: DailyMandate[];
}> {
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();

  const { data } = await supabase
    .from('daily_mandates')
    .select('*')
    .eq('user_id', userId)
    .eq('mandate_date', today)
    .order('deadline', { ascending: true });

  const mandates: DailyMandate[] = (data ?? []).map((d) => ({
    id: d.id,
    category: d.category,
    instruction: d.instruction,
    deadline: d.deadline,
    verification: d.verification_type,
    verified: d.verified,
    consequence_on_miss: d.consequence_on_miss,
    escalation_level: d.escalation_level,
  }));

  const verified = mandates.filter((m) => m.verified).length;
  const missed = mandates.filter((m) => !m.verified && m.deadline < now).length;
  const pending = mandates.length - verified - missed;

  return { total: mandates.length, verified, pending, missed, mandates };
}

/**
 * Build handler context block for mandate status.
 */
export async function buildMandateContext(userId: string): Promise<string> {
  try {
    const status = await getMandateStatus(userId);
    if (status.total === 0) return '';

    const lines: string[] = ['## Feminization Mandates (Today)'];
    lines.push(`STATUS: ${status.verified}/${status.total} verified | ${status.pending} pending | ${status.missed} MISSED`);

    for (const m of status.mandates) {
      const icon = m.verified ? '[OK]' : m.deadline < new Date().toISOString() ? '[MISS]' : '[PEND]';
      const time = new Date(m.deadline).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      lines.push(`  ${icon} ${m.category}: ${m.instruction.slice(0, 60)} — by ${time} (L${m.escalation_level})`);
    }

    if (status.missed > 0) {
      lines.push(`ENFORCEMENT: ${status.missed} mandate(s) missed — consequences queued. Press harder.`);
    }

    return lines.join('\n');
  } catch {
    return '';
  }
}
