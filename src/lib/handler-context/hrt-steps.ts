/**
 * HRT funnel step vocabulary — the shared step-label module.
 *
 * hrt_funnel.current_step values, in order, plus the plain-English labels
 * FocusMode / HrtDailyGate / handler context all render. Previously each
 * surface kept its own copy (FocusMode, HrtDailyGate) and hrt-pipeline.ts
 * read a phantom `hrt_pipeline.stage` — "Stage: undefined" in Handler
 * context. One module, every reader.
 */

const HRT_STEPS_TUPLE = [
  'uncommitted', 'committed', 'researching', 'provider_chosen',
  'appointment_booked', 'intake_submitted', 'appointment_attended',
  'prescription_obtained', 'pharmacy_filled', 'first_dose_taken',
  'week_one_complete', 'month_one_complete', 'adherent',
] as const;

export type HrtStep = typeof HRT_STEPS_TUPLE[number];

/** Ordered step list — widened to string[] so `.indexOf(someString)` works. */
export const HRT_STEPS: readonly string[] = HRT_STEPS_TUPLE;

export const HRT_STEP_LABELS: Record<string, string> = {
  uncommitted: 'Uncommitted', committed: 'Committed',
  researching: 'Researching providers', provider_chosen: 'Provider chosen',
  appointment_booked: 'Appointment booked', intake_submitted: "Paperwork's in, waiting on the visit",
  appointment_attended: 'Appointment attended', prescription_obtained: 'Prescription obtained',
  pharmacy_filled: 'Pharmacy filled', first_dose_taken: 'First dose taken',
  week_one_complete: 'Week 1 complete', month_one_complete: 'Month 1 complete',
  adherent: 'Adherent',
};

/** Plain-English "where you are + what's not done" per step. */
export const HRT_STEP_NEXT_ACTION: Record<string, string> = {
  uncommitted:           'You have not committed to starting HRT.',
  committed:             'You said yes to HRT but have not researched providers.',
  researching:           'You are researching providers but have not picked one.',
  provider_chosen:       'You picked a provider but have not booked the consult.',
  appointment_booked:    'You booked the consult but have not attended it.',
  intake_submitted:      "Your paperwork's in — you just haven't gone in yet.",
  appointment_attended:  'You went to the consult but do not have a prescription yet.',
  prescription_obtained: 'You have a prescription but have not filled it at the pharmacy.',
  pharmacy_filled:       'You filled the script but have not taken your first dose.',
  first_dose_taken:      'You took dose 1 but have not completed week 1 of doses.',
  week_one_complete:     'You finished week 1 but have not reached month 1.',
  month_one_complete:    'You hit month 1 but have not reached adherent.',
  adherent:              'Adherent. No action.',
};

export function hrtStepLabel(step: string | null | undefined): string {
  if (!step) return HRT_STEP_LABELS.uncommitted;
  return HRT_STEP_LABELS[step] ?? step;
}

export function nextHrtStep(step: string | null | undefined): HrtStep | null {
  const idx = HRT_STEPS.indexOf(step ?? 'uncommitted');
  if (idx === -1) return null;
  return (HRT_STEPS_TUPLE[idx + 1] as HrtStep | undefined) ?? null;
}
