/**
 * Persona content gate.
 *
 * Persona content (Today cards from any mommy-* function) is suppressed
 * until `user_state.onboarding_completed_at` is set. This module is the
 * single source of truth for "is a row mommy-flavored?" and "is the gate
 * open?" — both `OutreachQueueCard` and `MorningBriefCard` consume it.
 *
 * The gate is generation-site agnostic: any outreach row whose
 * `trigger_reason` or `source` starts with `mommy_` / `mama_` is
 * considered persona content. Adding a new mommy-* generator does not
 * require updating this list.
 */

/**
 * Heuristic: does this outreach row carry persona-voice content?
 * Uses prefix matching against the well-known mommy-* / mama-* sources
 * so new generators pick up the gate automatically.
 */
export function isMommyOutreachRow(row: {
  trigger_reason?: string | null;
  source?: string | null;
}): boolean {
  const reason = (row.trigger_reason ?? '').toLowerCase();
  const source = (row.source ?? '').toLowerCase();
  if (reason.startsWith('mommy_') || reason.startsWith('mama_')) return true;
  if (source.startsWith('mommy_') || source.startsWith('mama_')) return true;
  // Known legacy rows that don't follow the prefix convention but are
  // unmistakably persona-voiced.
  if (source === 'mama_was_watching' || reason === 'mama_was_watching') return true;
  return false;
}

/**
 * Filter a list of outreach rows according to the gate. If onboarding
 * is not complete, persona rows are dropped. If onboarding is complete
 * (or the user isn't on the dommy_mommy persona), every row passes.
 */
export function applyPersonaGate<T extends { trigger_reason?: string | null; source?: string | null }>(
  rows: T[],
  opts: { onboardingComplete: boolean },
): T[] {
  if (opts.onboardingComplete) return rows;
  return rows.filter(r => !isMommyOutreachRow(r));
}
