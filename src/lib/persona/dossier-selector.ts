/**
 * dossier-selector — pure question-selection logic for the dossier drip.
 *
 * Given the catalog of dossier_questions and a user's state + response
 * history, returns the next question to ask (or null if nothing fits).
 *
 * Lives in src/lib so it can be unit-tested without touching the edge
 * runtime; the supabase/functions/mommy-dossier-drip function reproduces
 * the same selection rules in SQL + JS at runtime.
 */

export type DossierCategory =
  | 'gina' | 'name' | 'body' | 'confession_seed'
  | 'resistance' | 'turn_ons' | 'turn_offs' | 'history' | 'preferences';

export type DossierIntensity = 'gentle' | 'firm' | 'cruel';

export interface DossierQuestionRow {
  id: string;
  question_key: string;
  category: DossierCategory;
  question_text: string;
  placeholder: string | null;
  expected_response_kind: 'text' | 'single_choice' | 'multi_choice' | 'numeric' | 'yes_no';
  choices: unknown;
  phase_min: number;
  intensity_min: DossierIntensity;
  priority: number;
  importance: number;
  tone: 'soft' | 'direct' | 'filthy';
  input_length: 'short' | 'long';
  active: boolean;
}

export interface DossierResponseSnapshot {
  question_id: string;
  category: DossierCategory;
  answered_at: string | null;
  skipped: boolean;
  delivered_at: string | null;
  updated_at: string;
}

export interface UserStateSnapshot {
  current_phase: number;
  escalation_level: number;
}

const INTENSITY_RANK: Record<DossierIntensity, number> = {
  gentle: 1,
  firm: 2,
  cruel: 3,
};

export function escalationToIntensity(escalationLevel: number): DossierIntensity {
  if (escalationLevel >= 5) return 'cruel';
  if (escalationLevel >= 3) return 'firm';
  return 'gentle';
}

export function passesPhaseGate(question: DossierQuestionRow, state: UserStateSnapshot): boolean {
  return question.phase_min <= state.current_phase;
}

export function passesIntensityGate(question: DossierQuestionRow, state: UserStateSnapshot): boolean {
  const current = escalationToIntensity(state.escalation_level);
  return INTENSITY_RANK[current] >= INTENSITY_RANK[question.intensity_min];
}

export interface SelectorOptions {
  /** ISO timestamp anchor for the 14-day skip cooldown. Defaults to now. */
  now?: Date;
  /** When > 0, the most-recently-delivered category is deprioritized. */
  recencyAvoidance?: boolean;
}

export interface SelectorResult {
  pick: DossierQuestionRow | null;
  reason: 'ok' | 'no_questions_pass_gates' | 'all_answered_or_skipped' | 'empty_catalog';
}

/**
 * Pick the next question to drip to the user.
 *
 * Rules, in priority order:
 *   1. Drop questions where phase_min > user.current_phase.
 *   2. Drop questions where intensity_min > current intensity.
 *   3. Drop questions already answered.
 *   4. Drop questions skipped within the last 14 days.
 *   5. Among the remainder, prefer categories the user has answered LEAST
 *      (coverage bias). Ties broken by question.priority ASC.
 *   6. If the most-recently-delivered category appears in the top pick AND
 *      another viable category exists, swap to the next-best category
 *      (recency avoidance).
 */
export function selectNextDossierQuestion(
  catalog: DossierQuestionRow[],
  responses: DossierResponseSnapshot[],
  state: UserStateSnapshot,
  options: SelectorOptions = {},
): SelectorResult {
  if (catalog.length === 0) return { pick: null, reason: 'empty_catalog' };

  const now = options.now ?? new Date();
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 86400_000);

  const answered = new Set<string>();
  const recentlySkipped = new Set<string>();
  const answeredCountByCategory: Record<string, number> = {};
  let mostRecentDelivery: { questionId: string; category: DossierCategory; at: number } | null = null;

  for (const r of responses) {
    if (r.answered_at) {
      answered.add(r.question_id);
      answeredCountByCategory[r.category] = (answeredCountByCategory[r.category] ?? 0) + 1;
    }
    if (r.skipped && new Date(r.updated_at).getTime() > fourteenDaysAgo.getTime()) {
      recentlySkipped.add(r.question_id);
    }
    if (r.delivered_at) {
      const t = new Date(r.delivered_at).getTime();
      if (!mostRecentDelivery || t > mostRecentDelivery.at) {
        mostRecentDelivery = { questionId: r.question_id, category: r.category, at: t };
      }
    }
  }

  const passingGates = catalog
    .filter(q => q.active)
    .filter(q => passesPhaseGate(q, state))
    .filter(q => passesIntensityGate(q, state));
  if (passingGates.length === 0) return { pick: null, reason: 'no_questions_pass_gates' };

  const eligible = passingGates
    .filter(q => !answered.has(q.id))
    .filter(q => !recentlySkipped.has(q.id));
  if (eligible.length === 0) return { pick: null, reason: 'all_answered_or_skipped' };

  const score = (q: DossierQuestionRow): [number, number] => [
    answeredCountByCategory[q.category] ?? 0,
    q.priority,
  ];

  const sorted = [...eligible].sort((a, b) => {
    const [ca, pa] = score(a);
    const [cb, pb] = score(b);
    if (ca !== cb) return ca - cb;
    return pa - pb;
  });

  const topPick = sorted[0];
  if (
    options.recencyAvoidance !== false &&
    mostRecentDelivery &&
    topPick.category === mostRecentDelivery.category
  ) {
    const altCategory = sorted.find(q => q.category !== mostRecentDelivery!.category);
    if (altCategory) return { pick: altCategory, reason: 'ok' };
  }

  return { pick: topPick, reason: 'ok' };
}
