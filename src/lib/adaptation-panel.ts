// adaptation-panel — pure logic for the adaptive-loop hypothesis panel.
//
// PARITY mirror of supabase/functions/adaptation-hypothesis-panel/index.ts.
// The edge function owns the LLM calls + DB writes; this module owns the
// deterministic pieces so they can be unit-tested without a model or a DB:
//
//   * normalizeHypotheses — coerce raw model JSON into a clean, ranked,
//     deduped list of <=3 hypotheses (each: design, rationale, scope, score).
//   * pickSelected — choose the top-ranked hypothesis.
//   * scopeToWish — map a hypothesis scope to a wish disposition: in-scope
//     ideas file a queued/normal-or-high panel_ideation wish; large /
//     cross-cutting ideas file a status=queued wish carrying a needs-review
//     note in the body (NEVER auto-ship — that path is human-gated, deferred).
//
// SAFE SLICE ONLY: nothing here ships code. It proposes, ranks, records, and
// files wishes for a human/Claude session to action.

export type HypothesisScope = 'in_scope' | 'large' | 'cross_cutting';

export interface RawHypothesis {
  design?: unknown;
  rationale?: unknown;
  scope?: unknown;
  score?: unknown;
}

export interface Hypothesis {
  design: string;
  rationale: string;
  scope: HypothesisScope;
  /** 0..100 — model's confidence this resolves the signal cleanly. */
  score: number;
}

export type WishPriority = 'normal' | 'high';

export interface WishDisposition {
  /** Whether a mommy_code_wishes row should be filed at all. */
  file: boolean;
  priority: WishPriority;
  /** True when the idea is too big to ship blindly — body gets a review note. */
  needsReview: boolean;
  /** Prefix appended to the wish body so a reader sees the disposition. */
  reviewNote: string | null;
}

function coerceScope(v: unknown): HypothesisScope {
  const s = String(v ?? '').toLowerCase().trim();
  if (s === 'large' || s === 'big' || s === 'major') return 'large';
  if (s === 'cross_cutting' || s === 'cross-cutting' || s === 'crosscutting' || s === 'architectural') {
    return 'cross_cutting';
  }
  return 'in_scope';
}

function coerceScore(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  // Tolerate 0..1 floats and 0..100 ints alike.
  const scaled = n > 0 && n <= 1 ? n * 100 : n;
  return Math.max(0, Math.min(100, Math.round(scaled)));
}

function clampText(v: unknown, max: number): string {
  return String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

/**
 * Coerce raw model output into a clean, ranked, deduped hypothesis list.
 * Drops entries with no design text; dedupes on lowercased design; sorts by
 * score desc; caps at 3 (the panel proposes 2-3 alternatives).
 */
export function normalizeHypotheses(raw: unknown): Hypothesis[] {
  const arr = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { hypotheses?: unknown })?.hypotheses)
      ? (raw as { hypotheses: unknown[] }).hypotheses
      : [];

  const seen = new Set<string>();
  const out: Hypothesis[] = [];
  for (const item of arr) {
    const r = (item ?? {}) as RawHypothesis;
    const design = clampText(r.design, 300);
    if (!design) continue;
    const key = design.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      design,
      rationale: clampText(r.rationale, 400),
      scope: coerceScope(r.scope),
      score: coerceScore(r.score),
    });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, 3);
}

/** The top-ranked hypothesis, or null if the list is empty. */
export function pickSelected(hyps: Hypothesis[]): Hypothesis | null {
  return hyps.length ? hyps[0] : null;
}

/**
 * Map a selected hypothesis to a wish disposition.
 * - in_scope: file a panel_ideation wish, queued. High priority only when the
 *   model is confident (score >= 70); otherwise normal.
 * - large / cross_cutting: still file (queued) but flag needs-review in the
 *   body so a human/Claude session scopes it before any build. NEVER auto-ship.
 */
export function scopeToWish(h: Hypothesis | null): WishDisposition {
  if (!h) return { file: false, priority: 'normal', needsReview: false, reviewNote: null };

  if (h.scope === 'in_scope') {
    return {
      file: true,
      priority: h.score >= 70 ? 'high' : 'normal',
      needsReview: false,
      reviewNote: null,
    };
  }

  // Large / cross-cutting: file for visibility, but gate on human review.
  const kind = h.scope === 'cross_cutting' ? 'cross-cutting' : 'large';
  return {
    file: true,
    priority: 'normal',
    needsReview: true,
    reviewNote:
      `NEEDS REVIEW (${kind}): the adaptive-loop panel judged this too big to ship ` +
      `unscoped. A human/Claude session must scope it before any build — the ` +
      `auto-ship-to-builder path is deliberately NOT wired for this slice.`,
  };
}
