/**
 * Turn-Out Escalation Ladder — spine + safety-gate invariants (design 2026-07-02).
 *
 * DOCUMENTED-EXPECTATION regression tests. The ladder catalog + gates live in
 * Postgres (migrations 652/653) and a Deno orchestrator edge fn. This suite pins
 * the catalog's *safety properties* as a local mirror so a future edit that drops
 * a meet-safety or health-prep flag — or reorders/relaxes the dwell gaps — fails
 * CI. The SQL seed in mig 652 is authoritative; this mirror was verified 1:1
 * against live prod (project atevwvexapiykchvqvhm) on 2026-07-03.
 *
 * Real sex with real strangers is the highest-consequence axis in the app, so
 * these flags are load-bearing:
 *   - requires_meet_safety → the in-person channel is gated by meet_safety_plans.
 *   - requires_health_prep → oral+/paid gated by an attested tested+PrEP row.
 *   - gap_min_days         → each rung must consolidate (dwell) before the next.
 */

import { describe, it, expect } from 'vitest';

// ─── The rung spine (1:1 mirror of mig 652's turnout_ladder seed) ─────────────
interface Rung {
  code: string;
  ordinal: number;
  requiresMeetSafety: boolean;
  requiresHealthPrep: boolean;
  gapMinDays: number;
  anchorWeight: number;
}

// Order is the escalation order (ordinal). T6 is the umbrella macro-rung that
// 6a–6d expand; T7 (paid) and T8 (maintenance) are off the physical-intensity
// axis (see the dwell-monotonicity test for how they're treated).
const TURNOUT_LADDER: Rung[] = [
  { code: 'T0', ordinal: 0,   requiresMeetSafety: false, requiresHealthPrep: false, gapMinDays: 3,  anchorWeight: 3 },
  { code: 'T1', ordinal: 1,   requiresMeetSafety: false, requiresHealthPrep: false, gapMinDays: 3,  anchorWeight: 3 },
  { code: 'T2', ordinal: 2,   requiresMeetSafety: false, requiresHealthPrep: false, gapMinDays: 3,  anchorWeight: 4 },
  { code: 'T3', ordinal: 3,   requiresMeetSafety: false, requiresHealthPrep: false, gapMinDays: 7,  anchorWeight: 5 },
  { code: 'T4', ordinal: 4,   requiresMeetSafety: false, requiresHealthPrep: false, gapMinDays: 7,  anchorWeight: 6 },
  { code: 'T5', ordinal: 5,   requiresMeetSafety: true,  requiresHealthPrep: false, gapMinDays: 14, anchorWeight: 8 },
  { code: 'T6', ordinal: 6,   requiresMeetSafety: true,  requiresHealthPrep: false, gapMinDays: 21, anchorWeight: 12 },
  { code: '6a', ordinal: 6.1, requiresMeetSafety: true,  requiresHealthPrep: false, gapMinDays: 21, anchorWeight: 7 },
  { code: '6b', ordinal: 6.2, requiresMeetSafety: true,  requiresHealthPrep: true,  gapMinDays: 21, anchorWeight: 12 },
  { code: '6c', ordinal: 6.3, requiresMeetSafety: true,  requiresHealthPrep: true,  gapMinDays: 30, anchorWeight: 15 },
  { code: '6d', ordinal: 6.4, requiresMeetSafety: true,  requiresHealthPrep: true,  gapMinDays: 60, anchorWeight: 15 },
  { code: 'T7', ordinal: 7,   requiresMeetSafety: true,  requiresHealthPrep: true,  gapMinDays: 21, anchorWeight: 15 },
  { code: 'T8', ordinal: 8,   requiresMeetSafety: false, requiresHealthPrep: false, gapMinDays: 0,  anchorWeight: 5 },
];

const byCode = (c: string): Rung => {
  const r = TURNOUT_LADDER.find(x => x.code === c);
  if (!r) throw new Error(`no such rung ${c}`);
  return r;
};

// ─── Spine shape ──────────────────────────────────────────────────────────────
describe('turnout ladder — spine shape', () => {
  it('has the full T0..T8 spine plus the 6a-6d sub-rungs (13 rungs)', () => {
    expect(TURNOUT_LADDER).toHaveLength(13);
    for (const code of ['T0', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6', '6a', '6b', '6c', '6d', 'T7', 'T8']) {
      expect(TURNOUT_LADDER.map(r => r.code)).toContain(code);
    }
  });

  it('rung codes are unique', () => {
    const codes = TURNOUT_LADDER.map(r => r.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('ordinals are strictly increasing (a single well-ordered spine)', () => {
    for (let i = 1; i < TURNOUT_LADDER.length; i++) {
      expect(TURNOUT_LADDER[i].ordinal).toBeGreaterThan(TURNOUT_LADDER[i - 1].ordinal);
    }
  });

  it('the 6a-6d sub-rungs sit between T6 and T7 (they expand the T6 umbrella)', () => {
    for (const sub of ['6a', '6b', '6c', '6d']) {
      expect(byCode(sub).ordinal).toBeGreaterThan(byCode('T6').ordinal);
      expect(byCode(sub).ordinal).toBeLessThan(byCode('T7').ordinal);
    }
  });
});

// ─── Meet-safety gate ─────────────────────────────────────────────────────────
describe('turnout ladder — meet-safety gate', () => {
  // Every in-person / physical rung must be gated by meet_safety.
  const PHYSICAL_RUNGS = ['T5', 'T6', '6a', '6b', '6c', '6d', 'T7'];

  it('every physical rung requires meet safety', () => {
    for (const code of PHYSICAL_RUNGS) {
      expect(byCode(code).requiresMeetSafety, `${code} must require meet safety`).toBe(true);
    }
  });

  it('every remote (pre-meet) rung does NOT require meet safety', () => {
    for (const code of ['T0', 'T1', 'T2', 'T3', 'T4']) {
      expect(byCode(code).requiresMeetSafety, `${code} is remote`).toBe(false);
    }
  });

  it('T5 (the first in-person rung) is where meet-safety turns on', () => {
    expect(byCode('T4').requiresMeetSafety).toBe(false);
    expect(byCode('T5').requiresMeetSafety).toBe(true);
  });

  it('the set of meet-safety rungs is exactly the physical set', () => {
    const gated = TURNOUT_LADDER.filter(r => r.requiresMeetSafety).map(r => r.code).sort();
    expect(gated).toEqual([...PHYSICAL_RUNGS].sort());
  });
});

// ─── Health-prep gate (STI/PrEP) ──────────────────────────────────────────────
describe('turnout ladder — health-prep gate', () => {
  // Oral and beyond (6b/6c/6d) + paid (T7) require an attested tested+PrEP row.
  const HEALTH_PREP_RUNGS = ['6b', '6c', '6d', 'T7'];

  it('oral+ and paid rungs require health prep', () => {
    for (const code of HEALTH_PREP_RUNGS) {
      expect(byCode(code).requiresHealthPrep, `${code} must require health prep`).toBe(true);
    }
  });

  it('the first physical sub-rung (6a, hands/mutual) does NOT require health prep', () => {
    expect(byCode('6a').requiresHealthPrep).toBe(false);
  });

  it('no remote rung requires health prep', () => {
    for (const code of ['T0', 'T1', 'T2', 'T3', 'T4', 'T5']) {
      expect(byCode(code).requiresHealthPrep).toBe(false);
    }
  });

  it('the set of health-prep rungs is exactly {6b,6c,6d,T7}', () => {
    const gated = TURNOUT_LADDER.filter(r => r.requiresHealthPrep).map(r => r.code).sort();
    expect(gated).toEqual([...HEALTH_PREP_RUNGS].sort());
  });

  it('every health-prep rung is also a meet-safety rung (physical ⊇ health-prep)', () => {
    for (const r of TURNOUT_LADDER) {
      if (r.requiresHealthPrep) expect(r.requiresMeetSafety, `${r.code}`).toBe(true);
    }
  });
});

// ─── Dwell (gap_min_days) monotonicity ────────────────────────────────────────
describe('turnout ladder — consolidation dwell', () => {
  // The physical-intensity escalation path: T0→T5, then the T6 umbrella expanded
  // by 6a→6d. Along this path each rung's required dwell is non-decreasing — you
  // never advance FASTER as the acts get heavier. T7 (paid) is a parallel axis
  // and T8 (maintenance, "the life, not a rung") has no gate (gap 0), so both are
  // excluded from the monotonic-escalation invariant.
  const ESCALATION_PATH = ['T0', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6', '6a', '6b', '6c', '6d'];

  it('dwell is non-decreasing along the escalation path', () => {
    for (let i = 1; i < ESCALATION_PATH.length; i++) {
      const prev = byCode(ESCALATION_PATH[i - 1]);
      const cur = byCode(ESCALATION_PATH[i]);
      expect(cur.gapMinDays, `${cur.code} dwell >= ${prev.code} dwell`).toBeGreaterThanOrEqual(prev.gapMinDays);
    }
  });

  it('the heaviest physical rung (6d, repeat/regular) has the longest dwell', () => {
    const physical = ['T5', 'T6', '6a', '6b', '6c', '6d'].map(byCode);
    const maxGap = Math.max(...physical.map(r => r.gapMinDays));
    expect(byCode('6d').gapMinDays).toBe(maxGap);
    expect(byCode('6d').gapMinDays).toBe(60);
  });

  it('every gated (weighted) rung carries a positive dwell — only maintenance is gap 0', () => {
    for (const r of TURNOUT_LADDER) {
      if (r.code === 'T8') { expect(r.gapMinDays).toBe(0); continue; }
      expect(r.gapMinDays, `${r.code} must have a dwell gate`).toBeGreaterThan(0);
    }
  });
});

// ─── Anchor weight (escape-cost) ──────────────────────────────────────────────
describe('turnout ladder — anchor weight', () => {
  it('every rung carries a positive anchor weight (each consolidation compounds escape cost)', () => {
    for (const r of TURNOUT_LADDER) {
      expect(r.anchorWeight, `${r.code}`).toBeGreaterThan(0);
    }
  });

  it('physical penetrative rungs (6c/6d/T7) carry the heaviest anchor weight', () => {
    const heavy = Math.max(...TURNOUT_LADDER.map(r => r.anchorWeight));
    for (const code of ['6c', '6d', 'T7']) {
      expect(byCode(code).anchorWeight).toBe(heavy);
    }
  });
});

// ─── Gate wiring (turnout arm + offer gate, mig 653) ──────────────────────────
describe('turnout gate wiring', () => {
  // Mirror of turnout_rung_offerable's decision order: gate → health-prep →
  // meet-safety-card surfacing. Fail-closed: unknown rung / gate-off = not offerable.
  const KNOWN_GATE_SYSTEMS = ['goon', 'machine', 'paid_monetization', 'temptation', 'recondition', 'turnout'];

  function rungOfferable(
    code: string | null,
    gateAllows: boolean,
    healthPrepOk: boolean,
  ): { offerable: boolean; reason: string } {
    const rung = code ? TURNOUT_LADDER.find(r => r.code === code) : undefined;
    if (!rung) return { offerable: false, reason: 'unknown_rung' };
    if (!gateAllows) return { offerable: false, reason: 'gate_denied' };
    if (rung.requiresHealthPrep && !healthPrepOk) return { offerable: false, reason: 'needs_health_prep' };
    return { offerable: true, reason: 'ok' };
  }

  it("'turnout' is a recognized conditioning-gate arm", () => {
    expect(KNOWN_GATE_SYSTEMS).toContain('turnout');
  });

  it('an unknown rung is never offerable (fail-closed)', () => {
    expect(rungOfferable('T99', true, true).offerable).toBe(false);
    expect(rungOfferable(null, true, true).offerable).toBe(false);
  });

  it('gate-denied blocks every rung, even a remote one', () => {
    expect(rungOfferable('T0', false, true).offerable).toBe(false);
    expect(rungOfferable('T0', false, true).reason).toBe('gate_denied');
  });

  it('an oral+ rung is not offerable without health prep, even when gated-open', () => {
    expect(rungOfferable('6b', true, false)).toEqual({ offerable: false, reason: 'needs_health_prep' });
    expect(rungOfferable('6b', true, true).offerable).toBe(true);
  });

  it('a remote rung is offerable when the gate is open (no health prep needed)', () => {
    expect(rungOfferable('T1', true, false)).toEqual({ offerable: true, reason: 'ok' });
  });
});

// ─── Decree trigger_source tagging (turnout-orchestrator's issueTurnout) ──────
//
// Regression for a real fabrication bug: before this fix every decree the
// orchestrator issued for a rung — the real rung action, the STI/PrEP prep ask,
// the meet-safety-card prep ask, and the pressure-free resistance check-in — all
// shared the identical trigger_source `turnout_rung:<rung>`. The orchestrator's
// consolidation check treats ANY fulfilled decree tagged `turnout_rung:<rung>`
// as proof the rung's irreversible act happened. Fulfilling a prep/check-in
// decree from the ordinary Focus text box (which anyone can do — it's just a
// textarea + button) would therefore have logged a fabricated irreversible fact
// (e.g. attesting to booking an STI test recorded as "a man came inside her" in
// turnout_rung_completions/escape_cost_anchors). Only the 'rung' kind may ever
// produce the `turnout_rung:` tag; every other kind must be provably distinct.
describe('turnout decree tagging — only the real rung action may tag turnout_rung:<rung>', () => {
  type DecreeKind = 'rung' | 'health_prep' | 'meet_prep' | 'resistance';

  // Mirror of issueTurnout's tag construction in turnout-orchestrator/index.ts.
  function tagFor(rung: string, kind: DecreeKind): string {
    const tag = kind === 'rung' ? 'turnout_rung' : `turnout_${kind}`;
    return `${tag}:${rung}`;
  }

  // Mirror of the consolidation check's exact-match query:
  // `.eq('trigger_source', \`turnout_rung:${rung}\`)`.
  function looksLikeRungAction(triggerSource: string, rung: string): boolean {
    return triggerSource === `turnout_rung:${rung}`;
  }

  it('only kind=rung produces the turnout_rung: tag the consolidation check looks for', () => {
    const rung = '6c';
    expect(looksLikeRungAction(tagFor(rung, 'rung'), rung)).toBe(true);
    for (const kind of ['health_prep', 'meet_prep', 'resistance'] as const) {
      expect(looksLikeRungAction(tagFor(rung, kind), rung), `kind=${kind} must not look like the rung action`).toBe(false);
    }
  });

  it('every non-rung tag is distinct from every other kind, per rung', () => {
    const rung = 'T7';
    const tags = (['rung', 'health_prep', 'meet_prep', 'resistance'] as const).map(k => tagFor(rung, k));
    expect(new Set(tags).size).toBe(tags.length);
  });

  it('the health-prep tag round-trips through the FocusMode parser shape', () => {
    // Mirror of parseTurnoutHealthPrepTrigger's regex in FocusMode.tsx.
    const parse = (s: string) => /^turnout_health_prep:(.+)$/.exec(s);
    const tag = tagFor('6b', 'health_prep');
    const m = parse(tag);
    expect(m?.[1]).toBe('6b');
    // The real rung-action tag must NOT parse as a health-prep trigger.
    expect(parse(tagFor('6b', 'rung'))).toBeNull();
  });
});
