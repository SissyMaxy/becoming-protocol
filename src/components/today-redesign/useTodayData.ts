/**
 * useTodayData — single data hook shared by desktop + mobile Today screens.
 * Queries user_state, body_feminization_directives, body_measurement_log,
 * body_targets, diet_log, handler_outreach_queue, dysphoria_diary_prompts.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { getSignedAssetUrl } from '../../lib/storage/signed-url';

export type DirectiveAction = 'log_meal' | 'log_measurement' | 'upload_photo' | 'voice_practice' | 'journal_entry' | 'log_workout' | 'log_dose' | null;

export interface TodayDirective {
  id: string;
  kind: string;
  target: string;
  body: string;
  done: boolean;
  due: string;
  dueDate: Date | null;
  photoRequired: boolean;
  actionHint: DirectiveAction;
  actionLabel: string | null;
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

export interface HeatmapDay {
  date: string;
  count: number;
  intensity: 0 | 1 | 2 | 3 | 4;
  isToday: boolean;
}

export interface PriorityBanner {
  kind: 'overdue_dose' | 'hrt_stuck' | 'escrow_deadline' | 'keyholder_pending' | 'compliance_low' | 'enable_push';
  severity: 'critical' | 'high' | 'info';
  text: string;
  actionLabel?: string;
  actionHref?: string;
}

export interface Reframing {
  id: string;
  text: string;
  angle: string;
  intensity: number;
}

export interface MemoryImplant {
  id: string;
  category: string;
  narrative: string;
  age: string | null;
  emotionalCore: string | null;
  timesReferenced: number;
}

export interface ConditioningPool {
  reframings: Reframing[];
  implants: MemoryImplant[];
  displacementScore: number; // 0.0 – 1.0
}

export interface DailyActivity {
  directivesCompletedToday: number;
  directivesAssignedToday: number;
  handlerMessagesToday: number;
  userMessagesToday: number;
  lastHandlerMessageAt: string | null;
  lastHandlerTimeDesc: string;
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
  weightSeries: { date: string; kg: number }[];
  latestProgressPhotoUrl: string | null;
  banners: PriorityBanner[];
  heatmap: HeatmapDay[];
  activity: DailyActivity;
  conditioning: ConditioningPool;
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

function inferAction(body: string, category: string | null, _targetBodyPart: string | null, photoRequired: boolean): { hint: DirectiveAction; label: string | null } {
  const t = body.toLowerCase();
  if (/log[_\s]meal|protein.*gram|meal.*log|log every meal|log each meal|via log_meal/.test(t)) return { hint: 'log_meal', label: 'Log meal' };
  if (/measurement|waist.*hip|hips.*chest|log.*waist|log.*hips|via log_measurement/.test(t)) return { hint: 'log_measurement', label: 'Log measurement' };
  if (photoRequired || /progress photo|full body front|front \+ side|underwear only|selfie/.test(t)) return { hint: 'upload_photo', label: 'Upload photo' };
  if (/voice practice|pitch|speak.*pitch|record.*voice/.test(t)) return { hint: 'voice_practice', label: 'Start voice practice' };
  if (/journal|write.*sentences|write.*response|reflection/.test(t) || category === 'reflection') return { hint: 'journal_entry', label: 'Journal it' };
  if (/injection|inject|dose|zepbound|hrt dose|log.*dose/.test(t)) return { hint: 'log_dose', label: 'Log dose' };
  if (/workout|strength|cardio|squat|deadlift|exercise|gym/.test(t) && category !== 'diet') return { hint: 'log_workout', label: 'Log workout' };
  return { hint: null, label: null };
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
    weightSeries: [],
    latestProgressPhotoUrl: null,
    banners: [],
    heatmap: [],
    activity: {
      directivesCompletedToday: 0,
      directivesAssignedToday: 0,
      handlerMessagesToday: 0,
      userMessagesToday: 0,
      lastHandlerMessageAt: null,
      lastHandlerTimeDesc: 'no contact yet',
    },
    conditioning: { reframings: [], implants: [], displacementScore: 0 },
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
      weightSeriesRes,
      latestPhotoRes,
      heldEscrowRes,
      taskCompletionsRes,
      messagesTodayRes,
      reframingsRes,
      implantsRes,
      displacementRes,
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
      supabase
        .from('body_measurement_log')
        .select('measured_at, weight_kg')
        .eq('user_id', user.id)
        .not('weight_kg', 'is', null)
        .order('measured_at', { ascending: true })
        .limit(40),
      supabase
        .from('body_feminization_directives')
        .select('proof_photo_url, completed_at')
        .eq('user_id', user.id)
        .not('proof_photo_url', 'is', null)
        .order('completed_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('escrow_deposits')
        .select('amount_cents, trigger_step, deadline_at, payment_status')
        .eq('user_id', user.id)
        .eq('payment_status', 'held')
        .order('deadline_at', { ascending: true })
        .limit(1)
        .maybeSingle(),
      // Heatmap union: task_bank-backed completions + body_feminization_directives
      // completions (which can't go into task_completions due to FK constraint).
      Promise.all([
        supabase
          .from('task_completions')
          .select('completed_at')
          .eq('user_id', user.id)
          .gte('completed_at', new Date(Date.now() - 30 * 86400000).toISOString()),
        supabase
          .from('body_feminization_directives')
          .select('completed_at')
          .eq('user_id', user.id)
          .eq('status', 'completed')
          .gte('completed_at', new Date(Date.now() - 30 * 86400000).toISOString()),
      ]).then(([a, b]) => ({
        data: [...((a.data || []) as Array<{ completed_at: string }>), ...((b.data || []) as Array<{ completed_at: string }>)],
      })),
      supabase
        .from('handler_messages')
        .select('role, created_at')
        .eq('user_id', user.id)
        .gte('created_at', todayStart)
        .lte('created_at', todayEnd)
        .order('created_at', { ascending: false }),
      supabase
        .from('narrative_reframings')
        .select('id, reframed_text, reframe_angle, intensity')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('memory_implants')
        .select('id, implant_category, narrative, approximate_age, emotional_core, times_referenced')
        .eq('user_id', user.id)
        .eq('active', true)
        .order('created_at', { ascending: false })
        .limit(30),
      supabase
        .from('identity_displacement_log')
        .select('displacement_score')
        .eq('user_id', user.id)
        .order('log_date', { ascending: false })
        .limit(1)
        .maybeSingle(),
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

    const weightSeries = ((weightSeriesRes.data || []) as Array<{ measured_at: string; weight_kg: number }>).map(r => ({
      date: r.measured_at,
      kg: r.weight_kg,
    }));

    // proof_photo_url stores an object path post-migration 260. Sign for
    // <img src=…> on Today (1h TTL — card refreshes well within that).
    const latestProgressPhotoPath = (latestPhotoRes.data as { proof_photo_url?: string } | null)?.proof_photo_url || null;
    const latestProgressPhotoUrl = await getSignedAssetUrl('verification-photos', latestProgressPhotoPath);

    // 30-day heatmap — group task_completions by YYYY-MM-DD.
    const dayCounts: Record<string, number> = {};
    for (const c of ((taskCompletionsRes.data || []) as Array<{ completed_at: string }>)) {
      const d = c.completed_at.slice(0, 10);
      dayCounts[d] = (dayCounts[d] || 0) + 1;
    }
    const reframings: Reframing[] = ((reframingsRes.data || []) as Array<Record<string, unknown>>).map(r => ({
      id: r.id as string,
      text: (r.reframed_text as string) || '',
      angle: (r.reframe_angle as string) || 'unknown',
      intensity: (r.intensity as number) ?? 5,
    }));
    const implants: MemoryImplant[] = ((implantsRes.data || []) as Array<Record<string, unknown>>).map(i => ({
      id: i.id as string,
      category: (i.implant_category as string) || '',
      narrative: (i.narrative as string) || '',
      age: (i.approximate_age as string) || null,
      emotionalCore: (i.emotional_core as string) || null,
      timesReferenced: (i.times_referenced as number) || 0,
    }));
    const displacementScore = Math.max(0, Math.min(1, parseFloat(String((displacementRes.data as { displacement_score?: number } | null)?.displacement_score ?? 0)) || 0));

    // Daily activity
    const messagesToday = (messagesTodayRes.data || []) as Array<{ role: string; created_at: string }>;
    const handlerMessagesToday = messagesToday.filter(m => m.role === 'assistant').length;
    const userMessagesToday = messagesToday.filter(m => m.role === 'user').length;
    const lastHandlerMsg = messagesToday.find(m => m.role === 'assistant');
    const lastHandlerMessageAt = lastHandlerMsg?.created_at || null;
    const lastHandlerTimeDesc = lastHandlerMessageAt ? timeAgo(lastHandlerMessageAt) : 'no contact yet';

    // directivesCompletedToday / directivesAssignedToday — computed below after
    // directives are constructed.

    const heatmap: HeatmapDay[] = [];
    const todayIso = new Date().toISOString().slice(0, 10);
    for (let i = 29; i >= 0; i--) {
      const dateIso = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      const count = dayCounts[dateIso] || 0;
      const intensity: HeatmapDay['intensity'] = count === 0 ? 0 : count === 1 ? 1 : count <= 3 ? 2 : count <= 6 ? 3 : 4;
      heatmap.push({ date: dateIso, count, intensity, isToday: dateIso === todayIso });
    }

    // Build priority banners — most urgent first, cap at 3
    const banners: PriorityBanner[] = [];
    const overdueDose = nextDoses.find(d => d.isOverdue);
    if (overdueDose) {
      const hrs = Math.abs(Math.round(overdueDose.hoursUntil));
      banners.push({
        kind: 'overdue_dose',
        severity: 'critical',
        text: `${overdueDose.medicationName} dose overdue by ${hrs >= 48 ? Math.round(hrs / 24) + 'd' : hrs + 'h'}. Log it or skip it — the Handler sees both.`,
      });
    }
    const heldEscrow = heldEscrowRes.data as { amount_cents: number; trigger_step: string; deadline_at: string } | null;
    if (heldEscrow?.deadline_at) {
      const hoursLeft = (new Date(heldEscrow.deadline_at).getTime() - nowMs) / 3600000;
      if (hoursLeft > 0 && hoursLeft < 48) {
        banners.push({
          kind: 'escrow_deadline',
          severity: 'critical',
          text: `$${(heldEscrow.amount_cents / 100).toFixed(0)} escrow forfeits in ${Math.round(hoursLeft)}h if you don't hit ${heldEscrow.trigger_step}.`,
        });
      }
    }
    if (hrt && hrt.daysStuck >= 7 && hrt.step !== 'adherent' && hrt.step !== 'uncommitted') {
      banners.push({
        kind: 'hrt_stuck',
        severity: 'high',
        text: `Stuck on ${hrt.stepLabel.toLowerCase()} for ${hrt.daysStuck} days. Move or the bleed continues.`,
      });
    }
    if (keyholderPending > 0) {
      banners.push({
        kind: 'keyholder_pending',
        severity: 'info',
        text: `${keyholderPending} keyholder ${keyholderPending === 1 ? 'request' : 'requests'} awaiting response.`,
      });
    }
    if (resolved >= 3 && compliancePct < 50) {
      banners.push({
        kind: 'compliance_low',
        severity: 'high',
        text: `7-day compliance ${compliancePct}% across ${resolved} directives. The math says consequences.`,
      });
    }

    const m = measurementRes.data as Record<string, number | null> | null;
    const firstM = firstMeasurementRes.data as { weight_kg: number | null } | null;
    const t = targetsRes.data as Record<string, unknown> | null;

    const directives: TodayDirective[] = (directivesRes.data || []).map((d: Record<string, unknown>) => {
      const tu = timeUntil(d.deadline_at as string | null);
      const body = (d.directive as string) || '';
      const photoRequired = Boolean(d.photo_required);
      const { hint, label } = inferAction(body, d.category as string | null, d.target_body_part as string | null, photoRequired);
      return {
        id: d.id as string,
        kind: prettifyKind(d.category as string | null),
        target: prettifyBodyPart(d.target_body_part as string | null),
        body,
        done: d.status === 'completed',
        due: tu.short,
        dueDate: tu.date,
        photoRequired,
        actionHint: hint,
        actionLabel: label,
      };
    }).sort((a, b) => {
      // Open directives first, then done. Within open, soonest deadline first;
      // no-deadline items go last. Within done, most-recent completion first
      // (directives already come sorted by created_at desc).
      if (a.done !== b.done) return a.done ? 1 : -1;
      if (a.done) return 0;
      const aMs = a.dueDate ? a.dueDate.getTime() : Number.POSITIVE_INFINITY;
      const bMs = b.dueDate ? b.dueDate.getTime() : Number.POSITIVE_INFINITY;
      return aMs - bMs;
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
      weightSeries,
      latestProgressPhotoUrl,
      banners: banners.slice(0, 3),
      heatmap,
      activity: {
        directivesCompletedToday: directives.filter(d =>
          d.done && d.dueDate && d.dueDate.toISOString().slice(0, 10) === todayStr
        ).length,
        directivesAssignedToday: directives.filter(d =>
          d.dueDate && d.dueDate.toISOString().slice(0, 10) === todayStr
        ).length,
        handlerMessagesToday,
        userMessagesToday,
        lastHandlerMessageAt,
        lastHandlerTimeDesc,
      },
      conditioning: { reframings, implants, displacementScore },
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
    const becomingComplete = !done;
    const newStatus = becomingComplete ? 'completed' : 'assigned';
    await supabase
      .from('body_feminization_directives')
      .update({ status: newStatus, completed_at: becomingComplete ? new Date().toISOString() : null })
      .eq('id', id);
    if (becomingComplete) {
      // Note: task_completions has a FK on task_id → task_bank(id), which
      // body_feminization_directives rows don't satisfy. We rely on
      // body_feminization_directives.completed_at as the source of truth
      // and bump the cached counter on user_state for Handler context.
      const { data: st } = await supabase.from('user_state').select('tasks_completed_today').eq('user_id', user.id).maybeSingle();
      const prev = (st?.tasks_completed_today as number) ?? 0;
      await supabase.from('user_state').update({ tasks_completed_today: prev + 1, updated_at: new Date().toISOString() }).eq('user_id', user.id);
      // Audit so the Handler's evidence locker sees the completion
      await supabase.from('handler_directives').insert({
        user_id: user.id,
        action: 'body_directive_completed_by_user',
        target: id,
        value: { completed_at: new Date().toISOString() },
        reasoning: 'User completed body directive via Today',
      });
    }
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

  // takenAtIso: optional. If omitted, defaults to now. Used so the user can
  // backdate "Mark taken" when she actually took the dose earlier (without
  // backdating, weekly schedules read incorrectly — "Due in 7d" appears even
  // when the real dose was 4 days ago).
  const logDoseTaken = useCallback(async (
    regimenId: string,
    medicationName: string,
    doseAmount: string | null,
    takenAtIso?: string,
  ) => {
    if (!user?.id) return;
    const takenAt = takenAtIso ?? new Date().toISOString();
    await supabase.from('hrt_dose_log').insert({
      user_id: user.id,
      regimen_id: regimenId,
      dose_taken_at: takenAt,
      skipped: false,
      notes: `Logged via Today. ${medicationName}${doseAmount ? ` ${doseAmount}` : ''}${takenAtIso ? ' (backdated)' : ''}`,
    });
    await supabase.from('dose_log').insert({
      user_id: user.id,
      regimen_id: regimenId,
      taken_at: takenAt,
    });
    await supabase.from('handler_directives').insert({
      user_id: user.id,
      action: 'dose_logged_by_user',
      target: regimenId,
      value: { medication: medicationName, dose: doseAmount, backdated: !!takenAtIso },
      reasoning: takenAtIso ? `User backdated dose to ${takenAt}` : 'User logged dose taken via Today screen',
    });
    await load();
  }, [user?.id, load]);

  const logDoseSkipped = useCallback(async (regimenId: string, medicationName: string, reason: string | null) => {
    if (!user?.id) return;
    await supabase.from('hrt_dose_log').insert({
      user_id: user.id,
      regimen_id: regimenId,
      dose_taken_at: null,
      skipped: true,
      notes: reason || `Skipped via Today. ${medicationName}`,
    });
    await supabase.from('handler_directives').insert({
      user_id: user.id,
      action: 'dose_skipped_by_user',
      target: regimenId,
      value: { medication: medicationName, reason },
      reasoning: 'User reported skipped dose via Today screen',
    });
    await load();
  }, [user?.id, load]);

  const uploadDirectiveProof = useCallback(async (directiveId: string, file: File) => {
    if (!user?.id) return;
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `${user.id}/body-directives/${directiveId}-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from('verification-photos')
      .upload(path, file, { contentType: file.type, upsert: false });
    if (upErr) throw upErr;
    // proof_photo_url stores the object path; render signs on demand.
    // Bucket is private after migration 260.
    await supabase
      .from('body_feminization_directives')
      .update({
        proof_photo_url: path,
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', directiveId);
    await load();
  }, [user?.id, load]);

  const logMeal = useCallback(async (args: { mealType: string; foods: string; protein: number; calories: number }) => {
    if (!user?.id) return;
    let protein = args.protein;
    let calories = args.calories;
    let estimatedNote: string | null = null;
    // Auto-estimate when user didn't fill macros but did describe the food.
    // Hits /api/nutrition/estimate which calls Claude Haiku for a rough macro
    // extraction (protein ±few g, calories rounded to 10). Skips silently on
    // error — the insert still lands with 0s rather than blocking.
    if ((protein === 0 || calories === 0) && args.foods && args.foods.trim().length >= 3) {
      try {
        const r = await fetch('/api/nutrition/estimate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ foods: args.foods }),
        });
        if (r.ok) {
          const data = await r.json();
          if (protein === 0 && typeof data.protein_g === 'number') protein = data.protein_g;
          if (calories === 0 && typeof data.calories === 'number') calories = data.calories;
          estimatedNote = typeof data.reasoning === 'string' ? data.reasoning : null;
        }
      } catch {
        // non-fatal — fall through to the insert with whatever user provided
      }
    }
    await supabase.from('diet_log').insert({
      user_id: user.id,
      meal_type: args.mealType,
      foods: args.foods,
      protein_g: protein,
      calories,
      feminization_aligned: true,
      notes: estimatedNote ? `Macros estimated: ${estimatedNote}` : null,
    });
    await load();
  }, [user?.id, load]);

  return { data, reload: load, toggleDirective, setArousal, ackQueueMsg, saveDiaryResponse, logMeal, uploadDirectiveProof, logDoseTaken, logDoseSkipped };
}
