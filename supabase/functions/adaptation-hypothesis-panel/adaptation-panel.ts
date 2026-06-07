// adaptation-panel (Deno copy) — pure logic for the adaptive-loop panel.
//
// PARITY mirror of src/lib/adaptation-panel.ts. The src/lib copy is the tested
// source of truth (src/__tests__/lib/adaptation-panel.test.ts); keep the two
// byte-identical except for this header. Edge fns can't import from src/lib
// (Vite import.meta.env), so the logic is duplicated here.

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
  file: boolean;
  priority: WishPriority;
  needsReview: boolean;
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
  const scaled = n > 0 && n <= 1 ? n * 100 : n;
  return Math.max(0, Math.min(100, Math.round(scaled)));
}

function clampText(v: unknown, max: number): string {
  return String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

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

export function pickSelected(hyps: Hypothesis[]): Hypothesis | null {
  return hyps.length ? hyps[0] : null;
}

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
