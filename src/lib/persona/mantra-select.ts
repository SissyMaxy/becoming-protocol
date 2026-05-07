/**
 * Pure mantra selector. Given a catalog and a per-user context, picks a
 * mantra that matches the user's current affect / phase / intensity tier
 * and is weighted away from recently-delivered ones.
 *
 * No DB, no LLM, no side effects. The cron edge fn (supabase/functions/
 * mommy-mantra/) and tests both import this. A parallel module exists at
 * supabase/functions/_shared/mantra-select.ts — keep them in sync.
 */

export type MantraIntensity = 'gentle' | 'firm' | 'cruel';

export type MantraCategory =
  | 'identity'
  | 'submission'
  | 'desire'
  | 'belonging'
  | 'surrender'
  | 'transformation'
  | 'ritual';

export interface MantraRow {
  id: string;
  text: string;
  affect_tags: string[];
  phase_min: number;
  phase_max: number;
  intensity_tier: MantraIntensity;
  category: MantraCategory;
  voice_settings_hint?: Record<string, unknown> | null;
}

export interface MantraSelectContext {
  /** today's mommy_mood affect, e.g. 'hungry', 'patient', 'aching' */
  affect: string;
  /** transformation phase 1..7, or user_state.current_phase clamped into that range */
  phase: number;
  /** the user's current intensity ceiling. cruel includes firm+gentle, firm includes gentle */
  intensity: MantraIntensity;
  /** map of mantra_id → most recent delivered_at ISO string */
  recentlyDelivered?: Record<string, string>;
  /** how many days back counts as "recent" — eligible but weight near zero */
  dedupWindowDays?: number;
  /** for deterministic tests; defaults to Math.random */
  rng?: () => number;
  /** anchor for "now" when computing recency; defaults to Date.now() */
  now?: number;
}

const TIER_RANK: Record<MantraIntensity, number> = { gentle: 0, firm: 1, cruel: 2 };

/** Whether a mantra of `tier` is allowed for a user whose ceiling is `cap`. */
export function intensityAllowed(tier: MantraIntensity, cap: MantraIntensity): boolean {
  return TIER_RANK[tier] <= TIER_RANK[cap];
}

/** Filter to candidates that pass phase + intensity gates. Recency does NOT
 * exclude — it only down-weights, so the user always gets *something*. */
export function filterEligible(catalog: MantraRow[], ctx: MantraSelectContext): MantraRow[] {
  return catalog.filter(m =>
    ctx.phase >= m.phase_min &&
    ctx.phase <= m.phase_max &&
    intensityAllowed(m.intensity_tier, ctx.intensity),
  );
}

/** Score a single mantra. Higher = more likely to be picked. */
export function scoreMantra(m: MantraRow, ctx: MantraSelectContext): number {
  const recentDays = ctx.dedupWindowDays ?? 7;
  const now = ctx.now ?? Date.now();
  const last = ctx.recentlyDelivered?.[m.id];

  // Base weight per intensity — gentle most common, cruel rarer so it lands
  let w = m.intensity_tier === 'gentle' ? 3 : m.intensity_tier === 'firm' ? 2 : 1;

  // Affect match: 4× if the current affect is in the mantra's tags
  if (m.affect_tags.includes(ctx.affect)) w *= 4;

  // Recency penalty: linear decay across the dedup window. Older than the
  // window → no penalty. Inside → weight scales by (age / window). At
  // age=0 the multiplier is 0.02 (not 0) so we can still pick if literally
  // every mantra is recent.
  if (last) {
    const ageDays = (now - new Date(last).getTime()) / 86_400_000;
    if (ageDays < recentDays) {
      const f = Math.max(0.02, ageDays / recentDays);
      w *= f;
    }
  }
  return w;
}

/** Pick weighted-random from a list of (mantra, weight) pairs. */
function weightedPick<T>(items: Array<{ item: T; w: number }>, rng: () => number): T | null {
  const total = items.reduce((s, x) => s + x.w, 0);
  if (total <= 0) return null;
  let r = rng() * total;
  for (const x of items) {
    r -= x.w;
    if (r <= 0) return x.item;
  }
  return items[items.length - 1].item;
}

/**
 * Pick a mantra from `catalog` for the user described by `ctx`. Returns
 * null when no row passes the phase + intensity gates.
 */
export function pickMantra(catalog: MantraRow[], ctx: MantraSelectContext): MantraRow | null {
  const eligible = filterEligible(catalog, ctx);
  if (eligible.length === 0) return null;
  const rng = ctx.rng ?? Math.random;
  const scored = eligible.map(item => ({ item, w: scoreMantra(item, ctx) }));
  return weightedPick(scored, rng);
}

/** Map user_state.current_phase (0..5) → mantra phase scale (1..7). */
export function phaseToMantraScale(currentPhase: number | null | undefined): number {
  const p = Math.max(0, Math.min(5, Math.round(Number(currentPhase ?? 0))));
  // 0→1, 1→2, 2→3, 3→4, 4→5, 5→6 — leaves 7 reserved for the unmerged
  // identity branch's transformation_phase=7 only.
  return p + 1;
}
