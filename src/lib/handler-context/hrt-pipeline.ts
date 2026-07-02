/**
 * HRT context builder — rewritten 2026-07-01 (FEM §5) against the REAL
 * schema. The old version read `hrt_pipeline` / `hrt_changes` / `hrt_doses`
 * — none of which exist — so Handler context rendered "Stage: undefined"
 * and the body-evidence line never fired. Real sources:
 *
 *   hrt_funnel        current_step, chosen_provider_slug, appointment_at,
 *                     days_stuck_on_step, intake_completed_at
 *   user_state        hrt_step_missed_days
 *   hrt_dose_log      dose_taken_at, skipped (7d adherence — only cited
 *                     when doses actually exist; no fabrication)
 *   body_metrics_trend (mig 634) — the body-evidence line
 *
 * Step labels come from the shared module (hrt-steps.ts).
 * logDoseTaken was deleted: it wrote the phantom hrt_doses/hrt_pipeline
 * tables and had zero callers — FocusMode.handleDoseLog is the writer.
 */

import { supabase } from '../supabase';
import { hrtStepLabel, nextHrtStep, HRT_STEP_NEXT_ACTION } from './hrt-steps';

export async function getHRTContext(userId: string): Promise<string> {
  try {
    const [funnelRes, stateRes, doseRes, trendRes] = await Promise.all([
      supabase.from('hrt_funnel')
        .select('current_step, chosen_provider_slug, appointment_at, days_stuck_on_step, intake_completed_at')
        .eq('user_id', userId).maybeSingle(),
      supabase.from('user_state')
        .select('hrt_step_missed_days')
        .eq('user_id', userId).maybeSingle(),
      supabase.from('hrt_dose_log')
        .select('dose_taken_at, skipped')
        .eq('user_id', userId)
        .gte('created_at', new Date(Date.now() - 7 * 86400_000).toISOString()),
      supabase.from('body_metrics_trend')
        .select('waist_delta_cm, hips_delta_cm, chest_delta_cm, weight_delta_kg, whr_delta, latest_at, prior_at')
        .eq('user_id', userId).maybeSingle(),
    ]);

    if (funnelRes.error && stateRes.error) return '';

    const funnel = funnelRes.data as {
      current_step?: string | null;
      chosen_provider_slug?: string | null;
      appointment_at?: string | null;
      days_stuck_on_step?: number | null;
    } | null;

    if (!funnel) return '';

    const step = funnel.current_step || 'uncommitted';
    const lines: string[] = ['## HRT Status'];
    lines.push(`Step: ${hrtStepLabel(step)} — ${HRT_STEP_NEXT_ACTION[step] ?? ''}`.trim());

    const next = nextHrtStep(step);
    if (next) lines.push(`Next step: ${hrtStepLabel(next)}`);

    if (funnel.chosen_provider_slug) lines.push(`Provider: ${funnel.chosen_provider_slug}`);
    if (funnel.appointment_at) {
      const appt = new Date(funnel.appointment_at);
      lines.push(`Appointment: ${appt.toLocaleDateString()}${appt > new Date() ? ' (upcoming — waiting is progress, not avoidance)' : ' (past)'}`);
    }
    if (typeof funnel.days_stuck_on_step === 'number' && funnel.days_stuck_on_step > 0) {
      lines.push(`Days on current step: ${funnel.days_stuck_on_step}`);
    }

    const missed = (stateRes.data as { hrt_step_missed_days?: number } | null)?.hrt_step_missed_days ?? 0;
    if (missed > 0) lines.push(`Daily-gate miss streak: ${missed}`);

    // 7d dose adherence — ONLY when doses exist. No dose rows → no claim.
    const doses = (doseRes.data ?? []) as Array<{ dose_taken_at: string | null; skipped: boolean | null }>;
    if (doses.length > 0) {
      const taken = doses.filter(d => d.dose_taken_at != null && !d.skipped).length;
      const skipped = doses.filter(d => d.skipped).length;
      lines.push(`Doses last 7d: ${taken} taken, ${skipped} skipped`);
    }

    // Body evidence — real spine numbers (Handler may cite telemetry;
    // Mommy-facing copy translates via measurementDeltaToPhrase upstream).
    const trend = trendRes.data as {
      waist_delta_cm?: number | null; hips_delta_cm?: number | null;
      chest_delta_cm?: number | null; weight_delta_kg?: number | null;
      whr_delta?: number | null; prior_at?: string | null;
    } | null;
    if (trend && trend.prior_at) {
      const parts: string[] = [];
      if (trend.waist_delta_cm != null) parts.push(`waist ${fmtDelta(trend.waist_delta_cm)}cm`);
      if (trend.hips_delta_cm != null) parts.push(`hips ${fmtDelta(trend.hips_delta_cm)}cm`);
      if (trend.chest_delta_cm != null) parts.push(`chest ${fmtDelta(trend.chest_delta_cm)}cm`);
      if (trend.weight_delta_kg != null) parts.push(`weight ${fmtDelta(trend.weight_delta_kg)}kg`);
      if (trend.whr_delta != null) parts.push(`WHR ${fmtDelta(trend.whr_delta)}`);
      if (parts.length > 0) {
        lines.push(`Body evidence (28d): ${parts.join(', ')}. These changes are visible and hard to walk back.`);
      }
    }

    return lines.join('\n');
  } catch {
    return '';
  }
}

function fmtDelta(n: number): string {
  return `${n > 0 ? '+' : ''}${Number(n).toFixed(1).replace(/\.0$/, '')}`;
}
