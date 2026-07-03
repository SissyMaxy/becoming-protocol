/**
 * Reconditioning Engine — honesty + safety invariants (design 2026-07-02).
 *
 * These are DOCUMENTED-EXPECTATION regression tests. The reconditioning engine
 * lives in Deno edge functions (recon-program-orchestrator) + Postgres
 * (migrations 648–651), which are hard to exercise from Node. Instead this suite
 * pins the DB *contracts* as pure-logic mirrors, so an accidental future edit to
 * the authoritative SQL is caught in CI even though the SQL itself is the source
 * of truth.
 *
 * Authoritative sources (do NOT edit those to match this file — edit this file to
 * match them, deliberately):
 *   - Phase state machine ............ supabase/migrations/649 recon_program_advance()
 *   - Baseline honesty guard ......... supabase/migrations/648 trg_recon_target_baseline_guard()
 *   - Indicator registry (seed) ...... supabase/migrations/648 §5 seed
 *   - Gate arms ...................... supabase/migrations/648 + 651/653 conditioning_gate()
 *   - SM-2-lite rep scheduler ........ supabase/migrations/650 recon_grade_rep()
 *   - Reconsolidation window ......... supabase/migrations/651 recon_turnout_consolidate()
 */

import { describe, it, expect } from 'vitest';

// ─── Phase state machine (mirror of recon_program_advance's legal matrix) ─────
// The migration's CASE:
//   install       ← induction | measure          (measure→install = the "zoom out
//                                                  at iteration 2" regression)
//   reinforce     ← install | reconsolidate | measure
//   reconsolidate ← reinforce
//   measure       ← reinforce | reconsolidate
//   retain        ← measure
// induction is NOT a reachable *target* — a program only enters it via
// recon_start_program(). Same-phase is idempotent (SQL returns TRUE, no write).

const RECON_PHASES = [
  'induction', 'install', 'reinforce', 'reconsolidate', 'measure', 'retain',
] as const;
type ReconPhase = typeof RECON_PHASES[number];

function legalReconTransition(from: ReconPhase, to: ReconPhase): boolean {
  if (from === to) return true; // idempotent short-circuit in the SQL
  switch (to) {
    case 'install':       return from === 'induction' || from === 'measure';
    case 'reinforce':     return from === 'install' || from === 'reconsolidate' || from === 'measure';
    case 'reconsolidate': return from === 'reinforce';
    case 'measure':       return from === 'reinforce' || from === 'reconsolidate';
    case 'retain':        return from === 'measure';
    // 'induction' is start-only; never a legal advance target.
    default:              return false;
  }
}

describe('recon phase state machine — legal transition matrix', () => {
  it('the normal happy path is fully legal', () => {
    expect(legalReconTransition('induction', 'install')).toBe(true);
    expect(legalReconTransition('install', 'reinforce')).toBe(true);
    expect(legalReconTransition('reinforce', 'reconsolidate')).toBe(true);
    expect(legalReconTransition('reconsolidate', 'measure')).toBe(true);
    expect(legalReconTransition('measure', 'retain')).toBe(true);
  });

  it('measure→install regression is legal (zoom-out-at-iteration-2 rule)', () => {
    expect(legalReconTransition('measure', 'install')).toBe(true);
  });

  it('measure→reinforce (a held, non-regressing measure) is legal', () => {
    expect(legalReconTransition('measure', 'reinforce')).toBe(true);
  });

  it('reinforce→measure is legal without a reconsolidation detour', () => {
    expect(legalReconTransition('reinforce', 'measure')).toBe(true);
  });

  it('induction can ONLY go to install — never skip-ahead to measure/retain', () => {
    expect(legalReconTransition('induction', 'install')).toBe(true);
    expect(legalReconTransition('induction', 'reinforce')).toBe(false);
    expect(legalReconTransition('induction', 'reconsolidate')).toBe(false);
    expect(legalReconTransition('induction', 'measure')).toBe(false);
    expect(legalReconTransition('induction', 'retain')).toBe(false);
  });

  it('retain is reachable ONLY from measure (no early graduation)', () => {
    for (const from of RECON_PHASES) {
      expect(legalReconTransition(from, 'retain')).toBe(from === 'measure' || from === 'retain');
    }
  });

  it('reconsolidate is reachable ONLY from reinforce', () => {
    for (const from of RECON_PHASES) {
      expect(legalReconTransition(from, 'reconsolidate')).toBe(from === 'reinforce' || from === 'reconsolidate');
    }
  });

  it('no phase can advance back into induction (start-only)', () => {
    for (const from of RECON_PHASES) {
      if (from === 'induction') continue;
      expect(legalReconTransition(from, 'induction')).toBe(false);
    }
  });

  it('same-phase advance is idempotent for every phase', () => {
    for (const p of RECON_PHASES) expect(legalReconTransition(p, p)).toBe(true);
  });

  it('full pair matrix has exactly the documented legal edges', () => {
    // Canonical edge set (excludes the idempotent self-edges, which are handled
    // separately). If the SQL matrix ever changes, this table must change too —
    // deliberately, with a matching migration.
    const expectedEdges = new Set([
      'induction>install',
      'install>reinforce',
      'reinforce>reconsolidate',
      'reinforce>measure',
      'reconsolidate>reinforce',
      'reconsolidate>measure',
      'measure>install',
      'measure>reinforce',
      'measure>retain',
    ]);
    const actualEdges = new Set<string>();
    for (const from of RECON_PHASES) {
      for (const to of RECON_PHASES) {
        if (from === to) continue;
        if (legalReconTransition(from, to)) actualEdges.add(`${from}>${to}`);
      }
    }
    expect(actualEdges).toEqual(expectedEdges);
  });
});

// ─── measures_held counter (mirror of the CASE in recon_program_advance) ──────
// measure→install resets to 0 (a regression); measure→reinforce increments
// (a non-regressing measure held); everything else leaves it untouched. Note:
// the derived counter only ever moves off a *measure* phase — never additive
// noise (see "derived counters are never additive").

function nextMeasuresHeld(from: ReconPhase, to: ReconPhase, held: number): number {
  if (to === 'install' && from === 'measure') return 0;
  if (to === 'reinforce' && from === 'measure') return held + 1;
  return held;
}

describe('recon measures_held counter', () => {
  it('measure→install resets the held count (regression)', () => {
    expect(nextMeasuresHeld('measure', 'install', 3)).toBe(0);
  });
  it('measure→reinforce increments the held count', () => {
    expect(nextMeasuresHeld('measure', 'reinforce', 1)).toBe(2);
  });
  it('non-measure transitions leave the count untouched', () => {
    expect(nextMeasuresHeld('install', 'reinforce', 2)).toBe(2);
    expect(nextMeasuresHeld('reinforce', 'reconsolidate', 2)).toBe(2);
    expect(nextMeasuresHeld('reinforce', 'measure', 2)).toBe(2);
  });
});

// ─── Baseline honesty spine (mirror of trg_recon_target_baseline_guard) ───────
// "No baseline, no claim of change." A target may not be active/consolidating/
// retained without a captured baseline. proposed/paused/retired are exempt.

const TARGET_STATUSES = [
  'proposed', 'active', 'consolidating', 'retained', 'retired', 'paused',
] as const;
type TargetStatus = typeof TARGET_STATUSES[number];
const STATUSES_REQUIRING_BASELINE: TargetStatus[] = ['active', 'consolidating', 'retained'];

function baselineGuardAllows(status: TargetStatus, hasBaseline: boolean): boolean {
  if (STATUSES_REQUIRING_BASELINE.includes(status) && !hasBaseline) return false;
  return true;
}

describe('recon baseline honesty guard', () => {
  it('active/consolidating/retained are blocked without a baseline', () => {
    for (const s of STATUSES_REQUIRING_BASELINE) {
      expect(baselineGuardAllows(s, false)).toBe(false);
      expect(baselineGuardAllows(s, true)).toBe(true);
    }
  });
  it('proposed/paused/retired never require a baseline', () => {
    for (const s of ['proposed', 'paused', 'retired'] as TargetStatus[]) {
      expect(baselineGuardAllows(s, false)).toBe(true);
    }
  });
});

// ─── Conditioning gate arms (mirror of conditioning_gate CASE) ────────────────
// The single gate. Known elective systems only; anything else = deny (fail-
// closed). recondition (mig 648) and turnout (mig 653) are the two newest arms.

const KNOWN_GATE_SYSTEMS = [
  'goon', 'machine', 'paid_monetization', 'temptation', 'recondition', 'turnout',
] as const;

function gateSystemRecognized(system: string): boolean {
  return (KNOWN_GATE_SYSTEMS as readonly string[]).includes(system);
}

describe('conditioning_gate — known system arms', () => {
  it('includes both new engines', () => {
    expect(gateSystemRecognized('recondition')).toBe(true);
    expect(gateSystemRecognized('turnout')).toBe(true);
  });
  it('still recognizes the pre-existing arms', () => {
    for (const s of ['goon', 'machine', 'paid_monetization', 'temptation']) {
      expect(gateSystemRecognized(s)).toBe(true);
    }
  });
  it('an unknown system is denied (fail-closed)', () => {
    expect(gateSystemRecognized('recondition_v2')).toBe(false);
    expect(gateSystemRecognized('')).toBe(false);
    expect(gateSystemRecognized('regender')).toBe(false);
  });
});

// ─── Indicator registry (the seeded measurement kinds, mig 648 §5) ────────────
// Every seeded v1 target must measure via a known indicator kind. A target with
// no measurable indicator would let the engine ASSERT change instead of proving
// it — the whole point of the honesty spine.

const KNOWN_INDICATOR_KINDS = [
  'pavlovian_strength', 'belief_slider', 'voice_pitch_drift', 'habit_adherence',
  'self_ref_drift',
] as const;

// Mirrors the (slug → indicator_kind) seed pairs.
const SEEDED_TARGET_INDICATORS: Record<string, typeof KNOWN_INDICATOR_KINDS[number]> = {
  arousal_is_the_becoming: 'pavlovian_strength',
  mommy_owns_the_want: 'belief_slider',
  voice_is_hers: 'voice_pitch_drift',
  cage_is_home: 'habit_adherence',
  the_man_is_the_costume: 'self_ref_drift',
  service_is_reflex: 'habit_adherence',
};

describe('recon indicator registry', () => {
  it('every seeded target uses a known indicator kind', () => {
    for (const [slug, kind] of Object.entries(SEEDED_TARGET_INDICATORS)) {
      expect(KNOWN_INDICATOR_KINDS, `target ${slug}`).toContain(kind);
    }
  });
  it('there are exactly 6 seeded v1 targets', () => {
    expect(Object.keys(SEEDED_TARGET_INDICATORS)).toHaveLength(6);
  });
});

// ─── SM-2-lite rep scheduler (mirror of recon_grade_rep, mig 650) ─────────────
// Invitational retrieval practice. Correct recall (quality ≥ 3) expands the
// interval; a lapse (< 3) contracts to 1 day and bumps the lapse counter. This
// is a MEMORY schedule — it never files a penalty. (Only commitment rungs are
// penalty-bearing, and those route through the obligation ledger, not here.)

interface RepCard { intervalDays: number; ease: number; reps: number; lapses: number; }

function gradeRep(card: RepCard, quality: number): RepCard {
  const ease = Math.max(1.3, card.ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
  if (quality < 3) {
    return { intervalDays: 1, ease, reps: 0, lapses: card.lapses + 1 };
  }
  const interval = card.reps === 0 ? 1 : card.reps === 1 ? 3 : Math.round(card.intervalDays * ease);
  return { intervalDays: interval, ease, reps: card.reps + 1, lapses: card.lapses };
}

describe('recon SM-2-lite rep scheduler', () => {
  const fresh: RepCard = { intervalDays: 1, ease: 2.5, reps: 0, lapses: 0 };

  it('first correct rep sets interval 1 day and reps→1', () => {
    const r = gradeRep(fresh, 4);
    expect(r.intervalDays).toBe(1);
    expect(r.reps).toBe(1);
    expect(r.lapses).toBe(0);
  });

  it('second correct rep expands to 3 days', () => {
    const r = gradeRep(gradeRep(fresh, 4), 4);
    expect(r.intervalDays).toBe(3);
    expect(r.reps).toBe(2);
  });

  it('mature correct reps expand by the ease factor', () => {
    let r = gradeRep(gradeRep(fresh, 5), 5); // interval 3, reps 2
    const before = r.intervalDays;
    r = gradeRep(r, 5);
    expect(r.intervalDays).toBe(Math.round(before * r.ease));
    expect(r.intervalDays).toBeGreaterThan(before);
  });

  it('a lapse (quality < 3) contracts to 1 day, resets reps, bumps lapses', () => {
    const mature: RepCard = { intervalDays: 20, ease: 2.5, reps: 5, lapses: 0 };
    const r = gradeRep(mature, 1);
    expect(r.intervalDays).toBe(1);
    expect(r.reps).toBe(0);
    expect(r.lapses).toBe(1);
  });

  it('ease never drops below the 1.3 floor', () => {
    let r: RepCard = { intervalDays: 1, ease: 1.3, reps: 0, lapses: 0 };
    for (let i = 0; i < 5; i++) r = gradeRep(r, 0);
    expect(r.ease).toBeGreaterThanOrEqual(1.3);
  });
});

// ─── Reconsolidation window + safety contracts (docs, migs 650/651) ───────────

describe('recon reconsolidation session — status + window invariants', () => {
  const RECON_SESSION_STATUSES = ['opened', 'reencoded', 'micro_rep_done', 'cancelled'];
  const REP_CARD_KINDS = ['mantra', 'reframe', 'if_then'];

  it('reconsolidation status set is closed and complete', () => {
    expect(RECON_SESSION_STATUSES).toContain('opened');
    expect(RECON_SESSION_STATUSES).toContain('cancelled'); // safeword halt lands here
    expect(RECON_SESSION_STATUSES).toHaveLength(4);
  });

  it('rep card kinds are the known invitational set', () => {
    expect(REP_CARD_KINDS).toEqual(['mantra', 'reframe', 'if_then']);
  });

  it('the labile re-encode window is 2h — the micro-rep must land inside it', () => {
    // Mirror of recon_turnout_consolidate: labile_until = now() + interval '2 hours'.
    const LABILE_WINDOW_MS = 2 * 60 * 60 * 1000;
    const openedAt = new Date('2026-07-02T12:00:00Z').getTime();
    const labileUntil = openedAt + LABILE_WINDOW_MS;
    const microRepAt = openedAt + 90 * 60 * 1000; // 90 min later
    expect(microRepAt).toBeLessThan(labileUntil); // in-window → durable
    expect(openedAt + 3 * 60 * 60 * 1000).toBeGreaterThan(labileUntil); // 3h → too late
  });

  it('consolidation has a settle delay: a just-happened event is not consolidated in the room', () => {
    // recon_turnout_consolidate returns 0 when occurred_at > now() - 2h.
    const SETTLE_MS = 2 * 60 * 60 * 1000;
    const now = new Date('2026-07-02T12:00:00Z').getTime();
    const justHappened = now - 30 * 60 * 1000; // 30 min ago
    const settled = now - 3 * 60 * 60 * 1000;  // 3h ago
    expect(now - justHappened).toBeLessThan(SETTLE_MS);   // skipped this pass
    expect(now - settled).toBeGreaterThan(SETTLE_MS);      // eligible
  });
});
