// Unit tests for the public-dare selector.
//
// Pure-function module — phase + intensity + cooldown + location-context
// → DareTemplate pick. No DB, no edge runtime, importable as plain TS.
// Sister of the wardrobe-prescription selector test.

import { describe, it, expect } from 'vitest';
import {
  buildCooldownSet,
  cadenceWindowOpen,
  computeDueBy,
  INTENSITY_RANK,
  pickDareTemplate,
  TIER_PHASE_FLOOR,
  type DareTemplate,
  type Phase,
  type SelectionContext,
} from '../../../supabase/functions/mommy-public-dare/selector';

const t = (over: Partial<DareTemplate> & { id: string }): DareTemplate => ({
  id: over.id,
  kind: 'mantra',
  description: 'desc',
  phase_min: 1,
  phase_max: 7,
  intensity_tier: 'gentle',
  requires_location_context: false,
  verification_kind: 'text_ack',
  affect_bias: [],
  cooldown_days: 14,
  active: true,
  ...over,
});

const baseCtx = (over: Partial<SelectionContext> = {}): SelectionContext => ({
  phase: 3 as Phase,
  minIntensity: 'gentle',
  userIntensity: 'firm',
  affect: null,
  allowedKinds: null,
  inCooldown: new Set(),
  locationContextAvailable: false,
  ...over,
});

describe('INTENSITY_RANK', () => {
  it('orders the canonical levels low → high', () => {
    expect(INTENSITY_RANK.gentle).toBeLessThan(INTENSITY_RANK.moderate);
    expect(INTENSITY_RANK.moderate).toBeLessThan(INTENSITY_RANK.firm);
    expect(INTENSITY_RANK.firm).toBeLessThan(INTENSITY_RANK.relentless);
    expect(INTENSITY_RANK.off).toBeLessThan(INTENSITY_RANK.gentle);
  });
});

describe('TIER_PHASE_FLOOR', () => {
  it('escalates with intensity', () => {
    expect(TIER_PHASE_FLOOR.gentle).toBeLessThanOrEqual(TIER_PHASE_FLOOR.moderate);
    expect(TIER_PHASE_FLOOR.moderate).toBeLessThanOrEqual(TIER_PHASE_FLOOR.firm);
    expect(TIER_PHASE_FLOOR.firm).toBeLessThanOrEqual(TIER_PHASE_FLOOR.relentless);
  });
});

describe('pickDareTemplate', () => {
  it('returns null when catalog is empty', () => {
    expect(pickDareTemplate([], baseCtx())).toBeNull();
  });

  it('returns null when no template matches phase window', () => {
    const cat = [t({ id: 'a', phase_min: 6, phase_max: 7 })];
    expect(pickDareTemplate(cat, baseCtx({ phase: 2 as Phase }))).toBeNull();
  });

  it('phase-1 user CANNOT draw firm-tier dare even when difficulty=relentless', () => {
    // This is the spec's "phase-gated heavily" rule. Settings allowed
    // it (minIntensity gentle), profile allowed it (userIntensity
    // relentless), but TIER_PHASE_FLOOR.firm = 3 > phase 1.
    const cat = [t({ id: 'firm-dare', intensity_tier: 'firm' })];
    const ctx = baseCtx({ phase: 1 as Phase, userIntensity: 'relentless' });
    expect(pickDareTemplate(cat, ctx)).toBeNull();
  });

  it('phase-1 user CANNOT draw relentless-tier dare', () => {
    const cat = [t({ id: 'rel', intensity_tier: 'relentless' })];
    const ctx = baseCtx({ phase: 1 as Phase, userIntensity: 'relentless' });
    expect(pickDareTemplate(cat, ctx)).toBeNull();
  });

  it('phase-3 user CAN draw firm-tier dare when settings allow it', () => {
    const cat = [t({ id: 'firm-dare', intensity_tier: 'firm' })];
    const ctx = baseCtx({ phase: 3 as Phase, userIntensity: 'firm', minIntensity: 'firm' });
    const out = pickDareTemplate(cat, ctx);
    expect(out).not.toBeNull();
    expect(out!.template.id).toBe('firm-dare');
  });

  it('respects minIntensity floor (settings)', () => {
    const cat = [
      t({ id: 'gentle', intensity_tier: 'gentle' }),
      t({ id: 'firm', intensity_tier: 'firm' }),
    ];
    const ctx = baseCtx({
      phase: 5 as Phase, userIntensity: 'firm', minIntensity: 'firm',
    });
    const out = pickDareTemplate(cat, ctx, () => 0);
    expect(out!.template.id).toBe('firm');
  });

  it('respects userIntensity ceiling (profile difficulty)', () => {
    const cat = [
      t({ id: 'gentle', intensity_tier: 'gentle' }),
      t({ id: 'firm', intensity_tier: 'firm' }),
    ];
    const ctx = baseCtx({
      phase: 5 as Phase, userIntensity: 'gentle', minIntensity: 'gentle',
    });
    const out = pickDareTemplate(cat, ctx, () => 0);
    expect(out!.template.id).toBe('gentle');
  });

  it('filters out inactive templates', () => {
    const cat = [t({ id: 'inactive', active: false })];
    expect(pickDareTemplate(cat, baseCtx())).toBeNull();
  });

  it('filters location-context templates when not available', () => {
    const cat = [
      t({ id: 'no-loc', requires_location_context: false }),
      t({ id: 'loc-needed', requires_location_context: true }),
    ];
    const ctx = baseCtx({ locationContextAvailable: false });
    const out = pickDareTemplate(cat, ctx, () => 0);
    expect(out!.template.id).toBe('no-loc');
  });

  it('admits location-context templates when available', () => {
    const cat = [t({ id: 'loc-needed', requires_location_context: true })];
    const ctx = baseCtx({ locationContextAvailable: true });
    const out = pickDareTemplate(cat, ctx, () => 0);
    expect(out!.template.id).toBe('loc-needed');
  });

  it('respects allowedKinds filter', () => {
    const cat = [
      t({ id: 'mantra', kind: 'mantra' }),
      t({ id: 'wardrobe', kind: 'wardrobe' }),
    ];
    const ctx = baseCtx({ allowedKinds: ['mantra'] });
    const out = pickDareTemplate(cat, ctx, () => 0);
    expect(out!.template.id).toBe('mantra');
  });

  it('null/empty allowedKinds means no kind filter', () => {
    const cat = [
      t({ id: 'mantra', kind: 'mantra' }),
      t({ id: 'wardrobe', kind: 'wardrobe' }),
    ];
    const ctx = baseCtx({ allowedKinds: null });
    const out = pickDareTemplate(cat, ctx, () => 0);
    expect(out).not.toBeNull();
    expect(['mantra', 'wardrobe']).toContain(out!.template.id);
  });

  it('excludes templates in cooldown', () => {
    const cat = [
      t({ id: 'cool', intensity_tier: 'gentle' }),
      t({ id: 'fresh', intensity_tier: 'gentle' }),
    ];
    const ctx = baseCtx({ inCooldown: new Set(['cool']) });
    const out = pickDareTemplate(cat, ctx, () => 0);
    expect(out!.template.id).toBe('fresh');
  });

  it('prefers affect-matching templates', () => {
    const cat = [
      t({ id: 'no-affect', affect_bias: [] }),
      t({ id: 'aching-match', affect_bias: ['aching', 'hungry'] }),
    ];
    const ctx = baseCtx({ affect: 'aching' });
    const out = pickDareTemplate(cat, ctx, () => 0);
    expect(out!.template.id).toBe('aching-match');
    expect(out!.reason).toBe('affect_match:aching');
  });

  it('falls back to any eligible when no affect match', () => {
    const cat = [
      t({ id: 'no-match-1', affect_bias: ['delighted'] }),
      t({ id: 'no-match-2', affect_bias: ['amused'] }),
    ];
    const ctx = baseCtx({ affect: 'aching' });
    const out = pickDareTemplate(cat, ctx, () => 0);
    expect(out).not.toBeNull();
    expect(out!.reason).toBe('eligibility_only');
  });

  it('rng seed determines pick (deterministic)', () => {
    const cat = [
      t({ id: 'a' }),
      t({ id: 'b' }),
      t({ id: 'c' }),
    ];
    const ctx = baseCtx();
    const a = pickDareTemplate(cat, ctx, () => 0);
    const b = pickDareTemplate(cat, ctx, () => 0);
    expect(a).toEqual(b);
  });
});

describe('cadenceWindowOpen', () => {
  it('returns false when cadence is off', () => {
    expect(cadenceWindowOpen('off', null)).toBe(false);
    expect(cadenceWindowOpen('off', new Date())).toBe(false);
  });

  it('returns true when never assigned', () => {
    expect(cadenceWindowOpen('occasional', null)).toBe(true);
    expect(cadenceWindowOpen('weekly', null)).toBe(true);
  });

  it('occasional opens after 5d', () => {
    const now = new Date('2026-04-30T00:00:00Z');
    const four = new Date(now.getTime() - 4 * 86400_000);
    const six = new Date(now.getTime() - 6 * 86400_000);
    expect(cadenceWindowOpen('occasional', four, now)).toBe(false);
    expect(cadenceWindowOpen('occasional', six, now)).toBe(true);
  });

  it('weekly opens after 7d', () => {
    const now = new Date('2026-04-30T00:00:00Z');
    const six = new Date(now.getTime() - 6 * 86400_000);
    const eight = new Date(now.getTime() - 8 * 86400_000);
    expect(cadenceWindowOpen('weekly', six, now)).toBe(false);
    expect(cadenceWindowOpen('weekly', eight, now)).toBe(true);
  });
});

describe('computeDueBy', () => {
  it('weekly is 7d out', () => {
    const now = new Date('2026-04-30T00:00:00Z');
    const due = computeDueBy('weekly', now);
    expect(due.getTime() - now.getTime()).toBe(7 * 86400_000);
  });

  it('occasional is 14d out', () => {
    const now = new Date('2026-04-30T00:00:00Z');
    const due = computeDueBy('occasional', now);
    expect(due.getTime() - now.getTime()).toBe(14 * 86400_000);
  });
});

describe('buildCooldownSet', () => {
  it('treats fresh assignments as in-cooldown', () => {
    const cat = [t({ id: 'a', cooldown_days: 14 })];
    const now = new Date('2026-04-30T00:00:00Z');
    const recent = [{
      template_id: 'a',
      assigned_at: new Date(now.getTime() - 5 * 86400_000).toISOString(),
    }];
    const out = buildCooldownSet(cat, recent, now);
    expect(out.has('a')).toBe(true);
  });

  it('expires assignments older than cooldown_days', () => {
    const cat = [t({ id: 'a', cooldown_days: 14 })];
    const now = new Date('2026-04-30T00:00:00Z');
    const recent = [{
      template_id: 'a',
      assigned_at: new Date(now.getTime() - 20 * 86400_000).toISOString(),
    }];
    const out = buildCooldownSet(cat, recent, now);
    expect(out.has('a')).toBe(false);
  });

  it('respects per-template cooldown_days', () => {
    const cat = [
      t({ id: 'short', cooldown_days: 7 }),
      t({ id: 'long', cooldown_days: 28 }),
    ];
    const now = new Date('2026-04-30T00:00:00Z');
    const recent = [
      { template_id: 'short', assigned_at: new Date(now.getTime() - 10 * 86400_000).toISOString() },
      { template_id: 'long', assigned_at: new Date(now.getTime() - 10 * 86400_000).toISOString() },
    ];
    const out = buildCooldownSet(cat, recent, now);
    expect(out.has('short')).toBe(false);
    expect(out.has('long')).toBe(true);
  });

  it('ignores assignments for templates not in catalog', () => {
    const cat = [t({ id: 'a', cooldown_days: 14 })];
    const now = new Date('2026-04-30T00:00:00Z');
    const recent = [{
      template_id: 'unknown',
      assigned_at: new Date(now.getTime() - 1 * 86400_000).toISOString(),
    }];
    const out = buildCooldownSet(cat, recent, now);
    expect(out.size).toBe(0);
  });
});
