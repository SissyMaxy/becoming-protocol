/**
 * useTodayData — single data hook shared by desktop + mobile Today screens.
 * Queries user_state, body_feminization_directives, body_measurement_log,
 * body_targets, diet_log, handler_outreach_queue, dysphoria_diary_prompts.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

export interface TodayDirective {
  id: string;
  kind: string;
  target: string;
  body: string;
  done: boolean;
  due: string;
  dueDate: Date | null;
  photoRequired: boolean;
}

export interface TodayQueueMsg {
  id: string;
  kind: string;
  kindClass: 'directive' | 'correction' | 'reward' | 'critical' | 'default';
  priority: boolean;
  timeAgo: string;
  body: string;
}

export interface TodayTargetCell {
  part: string;
  current: number | null;
  unit: string;
  target: number | null;
  gap: string;
  onTrack: boolean;
}

export interface TodayMeal {
  id: string;
  meal_type: string;
  logged_at: string;
  foods: string | null;
  protein_g: number | null;
  calories: number | null;
}

export interface DiaryPromptState {
  id: string | null;
  question: string;
  label: string;
  response: string;
}

export interface HrtFunnelState {
  step: string;
  stepIndex: number;
  totalSteps: number;
  provider: string | null;
  daysStuck: number;
  appointmentAt: string | null;
  stepLabel: string;
}

export interface NextDoseState {
  regimenId: string;
  medicationName: string;
  dueAt: string;
  hoursUntil: number;
  isOverdue: boolean;
  isWeekly: boolean;
}

export interface OrgasmDebtState {
  daysSinceRelease: number | null;
  slipPoints24h: number;
  debtPct: number;
  lastRelease: string | null;
}

export interface TodayData {
  denialDay: number;
  currentPhase: number;
  chastityStreakDays: number;
  longestStreak: number;
  chastityLocked: boolean;
  arousal: number;
  directives: TodayDirective[];
  queue: TodayQueueMsg[];
  proteinToday: number;
  proteinTarget: number;
  weightKg: number | null;
  weightStart: number | null;
  compliancePct: number;
  complianceSampleSize: number;
  mealsToday: TodayMeal[];
  aestheticPreset: string;
  targets: TodayTargetCell[];
  diaryPrompts: DiaryPromptState[];
  hrt: HrtFunnelState | null;
  nextDoses: NextDoseState[];
  orgasmDebt: OrgasmDebtState;
  keyholderPending: number;
  loading: boolean;
}

const PROTEIN_TARGET_G = 150;

const HRT_STEP_ORDER = ['uncommitted', 'committed', 'researching', 'provider_chosen', 'appointment_booked', 'intake_submitted', 'appointment_attended', 'prescription_obtained', 'pharmacy_filled', 'first_dose_taken', 'week_one_complete', 'month_one_complete', 'adherent'];
const HRT_STEP_LABELS: Record<string, string> = {
  uncommitted: 'Uncommitted',
  committed: 'Committed',
  researching: 'Researching providers',
  provider_chosen: 'Provider chosen',
  appointment_booked: 'Appointment booked',
  intake_submitted: 'Intake submitted',
  appointment_attended: 'Attended',
  prescription_obtained: 'Prescription obtained',
  pharmacy_filled: 'Pharmacy filled',
  first_dose_taken: 'First dose taken',
  week_one_complete: 'Week 1 complete',
  month_one_complete: 'Month 1 complete',
  adherent: 'Adherent',
};

function timeAgo(iso: string): string {
  const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const h = Math.floor(diffMin / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function timeUntil(deadline: string | null): { short: string; date: Date | null } {
  if (!deadline) return { short: '—', date: null };
  const date = new Date(deadline);
  const diffMin = Math.floor((date.getTime() - Date.now()) / 60000);
  if (diffMin < 0) return { short: 'overdue', date };
  if (diffMin < 60) return { short: `${diffMin}m`, date };
  const h = Math.floor(diffMin / 60);
  if (h < 24) return { short: `${h}h`, date };
  const d = Math.floor(h / 24);
  return { short: `${d}d`, date };
}

function classifyKind(triggerReason: string, urgency: string): { label: string; klass: TodayQueueMsg['kindClass']; priority: boolean } {
  const r = (triggerReason || '').toLowerCase();
  const u = (urgency || '').toLowerCase();
  if (u === 'critical' || r.includes('forfeit') || r.includes('punish')) return { label: 'Critical', klass: 'critical', priority: true };
  if (r.includes('reward') || r.includes('invitation')) return { label: 'Invitation', klass: 'reward', priority: false };
  if (r.includes('correction') || r.includes('slip') || r.includes('missed')) return { label: 'Correction', klass: 'correction', priority: false };
  if (r.includes('directive') || r.includes('body_change') || r.includes('photo') || r.includes('measurement')) return { label: 'Directive', klass: 'directive', priority: u === 'high' };
  return { label: 'Directive', klass: 'directive', priority: u === 'high' };
}

function prettifyKind(category: string | null): string {
  if (!category) return 'Directive';
  const map: Record<string, string> = {
    visualization: 'Visualization',
    exercise: 'Exercise',
    diet: 'Diet',
    clothing: 'Clothing',
    grooming: 'Grooming',
    body_hair: 'Body hair',
    voice: 'Voice',
    cardio: 'Cardio',
    strength: 'Strength',
    reflection: 'Reflection',
  };
  return map[category] || category.charAt(0).toUpperCase() + category.slice(1).replace(/_/g, ' ');
}

function prettifyBodyPart(part: string | null): string {
  if (!part) return '';
  const map: Record<string, string> = {
    whole_body: 'Whole body',
    chest: 'Chest',
    waist: 'Waist',
    hips: 'Hips',
    legs: 'Legs',
    face: 'Face',
    voice: 'Voice',
  };
  return map[part] || part.charAt(0).toUpperCase() + part.slice(1).replace(/_/g, ' ');
}

export function useTodayData() {
  const { user } = useAuth();
  const [data, setData] = useState<TodayData>({
    denialDay: 0,
    currentPhase: 0,
    chastityStreakDays: 0,
    longestStreak: 0,
    chastityLocked: false,
    arousal: 0,
    directives: [],
    queue: [],
    proteinToday: 0,
    proteinTarget: PROTEIN_TARGET_G,
    weightKg: null,
    weightStart: null,
    compliancePct: 0,
    complianceSampleSize: 0,
    mealsToday: [],
    aestheticPreset: 'femboy',
    targets: [],
    diaryPrompts: [],
    hrt: null,
    nextDoses: [],
    orgasmDebt: { daysSinceRelease: null, slipPoints24h: 0, debtPct: 0, lastRelease: null },
    keyholderPending: 0,
    loading: true,
  });

  const load = useCallback(async () => {
    if (!user?.id) return;

    const todayStr = new Date().toISOString().slice(0, 10);
    const todayStart = `${todayStr}T00:00:00`;
    const todayEnd = `${todayStr}T23:59:59`;

    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();

    const [
      stateRes,
      directivesRes,
      queueRes,
      mealsRes,
      measurementRes,
      firstMeasurementRes,
      targetsRes,
      diaryRes,
      complianceWindowRes,
      hrtRes,
      regimensRes,
      doseLogRes,
      keyholderRes,
    ] = await Promise.all([
      supabase
        .from('user_state')
        .select('denial_day, current_phase, chastity_streak_days, chastity_locked, current_arousal, streak_days, last_release, slip_points_rolling_24h')
        .eq('user_id', user.id)
        .maybeSingle(),
      supabase
        .from('body_feminization_directives')
        .select('id, category, directive, target_body_part, status, deadline_at, photo_required, created_at')
        .eq('user_id', user.id)
        .in('status', ['assigned', 'in_progress', 'completed'])
        .order('created_at', { ascending: false })
        .limit(8),
      supabase
        .from('handler_outreach_queue')
        .select('id, message, trigger_reason, urgency, created_at, delivered_at')
        .eq('user_id', user.id)
        .is('delivered_at', null)
        .order('created_at', { ascending: false })
        .limit(6),
      supabase
        .from('diet_log')
        .select('id, meal_type, logged_at, foods, protein_g, calories')
        .eq('user_id', user.id)
        .gte('logged_at', todayStart)
        .lte('logged_at', todayEnd)
        .order('logged_at', { ascending: true }),
      supabase
        .from('body_measurement_log')
        .select('waist_cm, hips_cm, chest_cm, weight_kg, measured_at')
        .eq('user_id', user.id)
        .order('measured_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('body_measurement_log')
        .select('weight_kg')
        .eq('user_id', user.id)
        .order('measured_at', { ascending: true })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('body_targets')
        .select('aesthetic_preset, waist_cm_target, hips_cm_target, chest_cm_target, weight_kg_target')
        .eq('user_id', user.id)
        .maybeSingle(),
      supabase
        .from('dysphoria_diary_prompts')
        .select('id, prompt_question, target_focus, response')
        .eq('user_id', user.id)
        .eq('prompt_date', todayStr)
        .order('created_at', { ascending: true })
        .limit(2),
      supabase
        .from('body_feminization_directives')
        .select('status, deadline_at, completed_at')
        .eq('user_id', user.id)
        .gte('created_at', sevenDaysAgo),
      supabase
        .from('hrt_funnel')
        .select('current_step, chosen_provider_slug, days_stuck_on_step, appointment_at')
        .eq('user_id', user.id)
        .maybeSingle(),
      supabase
        .from('medication_regimen')
        .select('id, medication_name, medication_category, dose_amount, dose_times_per_day, started_at')
        .eq('user_id', user.id)
        .eq('active', true),
      supabase
        .from('dose_log')
        .select('regimen_id, taken_at, skipped')
        .eq('user_id', user.id)
        .not('taken_at', 'is', null)
        .order('taken_at', { ascending: false })
        .limit(20),
      supabase
        .from('keyholder_decisions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('status', 'pending'),
    ]);

    // Compliance: % of directives in the last 7d that were completed on or
    // before the deadline. Denominator is "resolved" directives (completed
    // or with a passed deadline); open directives with time still left are
    // not yet pass/fail and are excluded.
    const windowRows = (complianceWindowRes.data || []) as Array<{ status: string; deadline_at: string | null; completed_at: string | null }>;
    const now = Date.now();
    let resolved = 0;
    let onTime = 0;
    for (const r of windowRows) {
      const dl = r.deadline_at ? new Date(r.deadline_at).getTime() : null;
      const done = r.status === 'completed';
      const pastDeadline = dl != null && dl < now;
      if (done || pastDeadline) {
        resolved += 1;
        if (done && (dl == null || new Date(r.completed_at || 0).getTime() <= dl)) onTime += 1;
      }
    }
    const compliancePct = resolved === 0 ? 100 : Math.round((onTime / resolved) * 100);

    const state = stateRes.data as Record<string, unknown> | null;

    // HRT funnel
    const hrtRow = hrtRes.data as Record<string, unknown> | null;
    let hrt: HrtFunnelState | null = null;
    if (hrtRow?.current_step) {
      const stepKey = hrtRow.current_step as string;
      const idx = HRT_STEP_ORDER.indexOf(stepKey);
      hrt = {
        step: stepKey,
        stepIndex: idx >= 0 ? idx : 0,
        totalSteps: HRT_STEP_ORDER.length,
        provider: (hrtRow.chosen_provider_slug as string) || null,
        daysStuck: (hrtRow.days_stuck_on_step as number) || 0,
        appointmentAt: (hrtRow.appointment_at as string) || null,
        stepLabel: HRT_STEP_LABELS[stepKey] || stepKey,
      };
    }

    // Next doses — for each active regimen find the latest taken dose + compute
    // next scheduled based on weekly (glp1) or daily cadence.
    const regimens = (regimensRes.data || []) as Array<Record<string, unknown>>;
    const doseLog = (doseLogRes.data || []) as Array<{ regimen_id: string; taken_at: string; skipped: boolean }>;
    const nowMs = Date.now();
    const nextDoses: NextDoseState[] = [];
    for (const r of regimens) {
      const regimenId = r.id as string;
      const category = (r.medication_category as string) || 'other';
      const isWeekly = category === 'glp1' || /weekly/i.test((r.dose_amount as string) || '');
      const intervalMs = isWeekly ? 7 * 86400000 : 86400000;
      const lastTaken = doseLog.find(d => d.regimen_id === regimenId);
      const anchorMs = lastTaken?.taken_at ? new Date(lastTaken.taken_at).getTime() : new Date(r.started_at as string).getTime();
      const dueMs = anchorMs + intervalMs;
      const hoursUntil = (dueMs - nowMs) / 3600000;
      nextDoses.push({
        regimenId,
        medicationName: (r.medication_name as string) || 'medication',
        dueAt: new Date(dueMs).toISOString(),
        hoursUntil,
        isOverdue: hoursUntil < 0,
        isWeekly,
      });
    }
    nextDoses.sort((a, b) => a.hoursUntil - b.hoursUntil);

    // Orgasm debt — real calculation. Debt grows with days since release,
    // capped at 100% after 14 days. Slip points add to the debt percent.
    const lastRelease = (state?.last_release as string) || null;
    const slipPoints24h = (state?.slip_points_rolling_24h as number) || 0;
    const daysSinceRelease = lastRelease
      ? Math.floor((nowMs - new Date(lastRelease).getTime()) / 86400000)
      : null;
    const releaseDebtBase = daysSinceRelease != null ? Math.min(100, (daysSinceRelease / 14) * 100) : 0;
    const debtPct = Math.min(100, Math.round(releaseDebtBase + slipPoints24h * 3));

    // Keyholder pending count
    const keyholderPending = (keyholderRes.count ?? 0);

    const m = measurementRes.data as Record<string, number | null> | null;
    const firstM = firstMeasurementRes.data as { weight_kg: number | null } | null;
    const t = targetsRes.data as Record<string, unknown> | null;

    const directives: TodayDirective[] = (directivesRes.data || []).map((d: Record<string, unknown>) => {
      const tu = timeUntil(d.deadline_at as string | null);
      return {
        id: d.id as string,
        kind: prettifyKind(d.category as string | null),
        target: prettifyBodyPart(d.target_body_part as string | null),
        body: (d.directive as string) || '',
        done: d.status === 'completed',
        due: tu.short,
        dueDate: tu.date,
        photoRequired: Boolean(d.photo_required),
      };
    });

    const queue: TodayQueueMsg[] = (queueRes.data || []).map((q: Record<string, unknown>) => {
      const k = classifyKind(q.trigger_reason as string, (q.urgency as string) || '');
      return {
        id: q.id as string,
        kind: k.label,
        kindClass: k.klass,
        priority: k.priority,
        timeAgo: timeAgo(q.created_at as string),
        body: (q.message as string) || '',
      };
    });

    const mealsToday = ((mealsRes.data || []) as TodayMeal[]);
    const proteinToday = mealsToday.reduce((s, m) => s + (m.protein_g || 0), 0);

    const weightKg = (m?.weight_kg as number) ?? null;
    const weightStart = (firstM?.weight_kg as number) ?? null;

    const targets: TodayTargetCell[] = [
      {
        part: 'Waist',
        current: m?.waist_cm ?? null,
        unit: 'cm',
        target: (t?.waist_cm_target as number) ?? null,
        gap: '',
        onTrack: false,
      },
      {
        part: 'Hips',
        current: m?.hips_cm ?? null,
        unit: 'cm',
        target: (t?.hips_cm_target as number) ?? null,
        gap: '',
        onTrack: false,
      },
      {
        part: 'Chest',
        current: m?.chest_cm ?? null,
        unit: 'cm',
        target: (t?.chest_cm_target as number) ?? null,
        gap: '',
        onTrack: false,
      },
      {
        part: 'Weight',
        current: weightKg,
        unit: 'kg',
        target: (t?.weight_kg_target as number) ?? null,
        gap: '',
        onTrack: false,
      },
    ].map(cell => {
      if (cell.current == null || cell.target == null) {
        return { ...cell, gap: '—', onTrack: false };
      }
      const delta = cell.current - cell.target;
      if (Math.abs(delta) < 1) return { ...cell, gap: 'on track', onTrack: true };
      const sign = delta > 0 ? '−' : '+';
      return { ...cell, gap: `${sign}${Math.abs(Math.round(delta))} to target`, onTrack: false };
    });

    const diaryPrompts: DiaryPromptState[] = (diaryRes.data || []).map((p: Record<string, unknown>) => {
      const focus = (p.target_focus as string) || 'prompt';
      const label = focus === 'future_self' ? '5 years'
        : focus === 'past_self' ? 'Past self'
        : focus === 'hrt_timeline' ? 'HRT'
        : focus.charAt(0).toUpperCase() + focus.slice(1).replace(/_/g, ' ');
      return {
        id: p.id as string,
        question: (p.prompt_question as string) || '',
        label,
        response: (p.response as string) || '',
      };
    });

    // Ensure we always have 2 diary slots so the UI doesn't collapse
    while (diaryPrompts.length < 2) {
      diaryPrompts.push({ id: null, question: 'No prompt yet today. The Handler queues these overnight.', label: 'Pending', response: '' });
    }

    setData({
      denialDay: (state?.denial_day as number) ?? 0,
      currentPhase: (state?.current_phase as number) ?? 0,
      chastityStreakDays: (state?.chastity_streak_days as number) ?? 0,
      longestStreak: (state?.streak_days as number) ?? 0,
      chastityLocked: Boolean(state?.chastity_locked),
      arousal: (state?.current_arousal as number) ?? 0,
      directives,
      queue,
      proteinToday,
      proteinTarget: PROTEIN_TARGET_G,
      weightKg,
      weightStart,
      compliancePct,
      complianceSampleSize: resolved,
      hrt,
      nextDoses,
      orgasmDebt: { daysSinceRelease, slipPoints24h, debtPct, lastRelease },
      keyholderPending,
      mealsToday,
      aestheticPreset: (t?.aesthetic_preset as string) || 'femboy',
      targets,
      diaryPrompts,
      loading: false,
    });
  }, [user?.id]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  }, [load]);

  const toggleDirective = useCallback(async (id: string, done: boolean) => {
    if (!user?.id) return;
    const newStatus = done ? 'assigned' : 'completed';
    await supabase
      .from('body_feminization_directives')
      .update({ status: newStatus, completed_at: newStatus === 'completed' ? new Date().toISOString() : null })
      .eq('id', id);
    setData(d => ({ ...d, directives: d.directives.map(x => x.id === id ? { ...x, done: !done } : x) }));
  }, [user?.id]);

  const setArousal = useCallback(async (level: number) => {
    if (!user?.id) return;
    setData(d => ({ ...d, arousal: level }));
    await supabase
      .from('user_state')
      .update({ current_arousal: level, updated_at: new Date().toISOString() })
      .eq('user_id', user.id);
    await supabase.from('handler_directives').insert({
      user_id: user.id,
      action: 'arousal_logged_by_user',
      value: { arousal: level },
      reasoning: `User set arousal ${level}/5 via Today screen`,
    });
  }, [user?.id]);

  const ackQueueMsg = useCallback(async (id: string) => {
    await supabase.from('handler_outreach_queue').update({ delivered_at: new Date().toISOString() }).eq('id', id);
    setData(d => ({ ...d, queue: d.queue.filter(q => q.id !== id) }));
  }, []);

  const saveDiaryResponse = useCallback(async (id: string | null, response: string) => {
    if (!id) return;
    await supabase.from('dysphoria_diary_prompts').update({ response, responded_at: new Date().toISOString() }).eq('id', id);
    setData(d => ({ ...d, diaryPrompts: d.diaryPrompts.map(p => p.id === id ? { ...p, response } : p) }));
  }, []);

  const logMeal = useCallback(async (args: { mealType: string; foods: string; protein: number; calories: number }) => {
    if (!user?.id) return;
    await supabase.from('diet_log').insert({
      user_id: user.id,
      meal_type: args.mealType,
      foods: args.foods,
      protein_g: args.protein,
      calories: args.calories,
      feminization_aligned: true,
    });
    await load();
  }, [user?.id, load]);

  return { data, reload: load, toggleDirective, setArousal, ackQueueMsg, saveDiaryResponse, logMeal };
}
