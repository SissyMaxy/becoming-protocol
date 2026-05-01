// Unit tests for the identity persistence layer helpers.
//
// Mocks a SupabaseClient and validates: (a) the buildFeminineSelfBlock
// produces the contract format the persona prompt expects, (b)
// advancePhase returns a suggested honorific that differs from the
// current one when possible, (c) name/honorific writes hit the row.

import { describe, it, expect, vi } from 'vitest';
import {
  buildFeminineSelfBlock,
  advancePhase,
  setFeminineName,
  loadFeminineSelfContext,
} from '../../lib/identity/feminine-self';
import {
  DEFAULT_PRONOUNS,
  type FeminineSelf,
  type WardrobeItem,
  type PhaseDefinition,
} from '../../types/identity';

// ============================================
// Test doubles
// ============================================

interface MockState {
  self: Record<string, unknown> | null;
  wardrobe: Array<Record<string, unknown>>;
  phaseDefs: Array<Record<string, unknown>>;
}

function makeMockClient(state: MockState) {
  // Minimal stub of the supabase-js builder. Each .from() returns a chain
  // that resolves the right slice of `state` based on the table name.
  const client = {
    from: (table: string) => {
      if (table === 'feminine_self') return feminineSelfBuilder(state);
      if (table === 'wardrobe_items') return wardrobeBuilder(state);
      if (table === 'transformation_phase_defs') return phaseDefBuilder(state);
      throw new Error(`Unexpected table: ${table}`);
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return client as any;
}

function feminineSelfBuilder(state: MockState) {
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve({ data: state.self, error: null }),
      }),
    }),
    insert: (row: Record<string, unknown>) => ({
      select: () => ({
        single: () => {
          state.self = { ...row, created_at: '2026-04-30T00:00:00Z', updated_at: '2026-04-30T00:00:00Z' };
          return Promise.resolve({ data: state.self, error: null });
        },
      }),
    }),
    update: (patch: Record<string, unknown>) => ({
      eq: () => ({
        select: () => ({
          single: () => {
            state.self = { ...state.self, ...patch };
            return Promise.resolve({ data: state.self, error: null });
          },
        }),
      }),
    }),
  };
}

function wardrobeBuilder(state: MockState) {
  return {
    select: () => ({
      eq: () => ({
        order: () => ({
          limit: () => Promise.resolve({ data: state.wardrobe, error: null }),
        }),
      }),
    }),
    insert: (row: Record<string, unknown>) => ({
      select: () => ({
        single: () => {
          const inserted = { id: `gen-${state.wardrobe.length + 1}`, ...row, created_at: row.acquired_at };
          state.wardrobe.push(inserted);
          return Promise.resolve({ data: inserted, error: null });
        },
      }),
    }),
  };
}

function phaseDefBuilder(state: MockState) {
  return {
    select: () => ({
      eq: (_col: string, val: number) => ({
        maybeSingle: () => Promise.resolve({ data: state.phaseDefs.find((p) => p.phase === val) ?? null, error: null }),
      }),
      order: () => Promise.resolve({ data: state.phaseDefs, error: null }),
    }),
  };
}

// ============================================
// Tests
// ============================================

describe('buildFeminineSelfBlock', () => {
  it('returns empty string when no feminine_name set', () => {
    const block = buildFeminineSelfBlock(null, [], null);
    expect(block).toBe('');
  });

  it('returns empty when feminineName is empty', () => {
    const self: FeminineSelf = {
      userId: 'u1',
      feminineName: null,
      pronouns: DEFAULT_PRONOUNS,
      currentHonorific: null,
      transformationPhase: 1,
      phaseStartedAt: '2026-04-30T00:00:00Z',
      createdAt: '2026-04-30T00:00:00Z',
      updatedAt: '2026-04-30T00:00:00Z',
    };
    expect(buildFeminineSelfBlock(self, [], null)).toBe('');
  });

  it('produces the spec format when fully populated', () => {
    const self: FeminineSelf = {
      userId: 'u1',
      feminineName: 'Maxy',
      pronouns: { subject: 'she', object: 'her', possessive: 'her' },
      currentHonorific: 'sweet girl',
      transformationPhase: 2,
      phaseStartedAt: '2026-04-30T00:00:00Z',
      createdAt: '2026-04-30T00:00:00Z',
      updatedAt: '2026-04-30T00:00:00Z',
    };
    const wardrobe: WardrobeItem[] = [
      { id: '1', userId: 'u1', itemType: 'panties', itemName: 'pink lace', notes: null, acquiredAt: '2026-04-29T00:00:00Z', createdAt: '2026-04-29T00:00:00Z' },
      { id: '2', userId: 'u1', itemType: 'lipstick', itemName: 'rose nude', notes: null, acquiredAt: '2026-04-28T00:00:00Z', createdAt: '2026-04-28T00:00:00Z' },
    ];
    const phaseDef: PhaseDefinition = {
      phase: 2,
      name: 'Permission',
      description: '...',
      honorifics: ['sweet girl'],
      unlockedTaskCategories: [],
      primerRequirements: [],
    };
    const block = buildFeminineSelfBlock(self, wardrobe, phaseDef);
    expect(block).toContain('She knows you as Maxy, she/her.');
    expect(block).toContain('You are in phase 2 — Permission.');
    expect(block).toContain('Recent additions to her wardrobe: pink lace, rose nude.');
    expect(block).toContain("Mommy's pet name for her: sweet girl.");
  });

  it('caps wardrobe at 3 items', () => {
    const self: FeminineSelf = {
      userId: 'u1',
      feminineName: 'Maxy',
      pronouns: DEFAULT_PRONOUNS,
      currentHonorific: null,
      transformationPhase: 1,
      phaseStartedAt: '2026-04-30T00:00:00Z',
      createdAt: '2026-04-30T00:00:00Z',
      updatedAt: '2026-04-30T00:00:00Z',
    };
    const wardrobe: WardrobeItem[] = Array.from({ length: 5 }, (_, i) => ({
      id: `${i}`,
      userId: 'u1',
      itemType: 'panties' as const,
      itemName: `item-${i}`,
      notes: null,
      acquiredAt: '2026-04-29T00:00:00Z',
      createdAt: '2026-04-29T00:00:00Z',
    }));
    const block = buildFeminineSelfBlock(self, wardrobe, null);
    expect(block).toContain('item-0, item-1, item-2');
    expect(block).not.toContain('item-3');
  });
});

describe('setFeminineName', () => {
  it('creates the row when absent and sets the name', async () => {
    const state: MockState = { self: null, wardrobe: [], phaseDefs: [] };
    const sb = makeMockClient(state);
    const result = await setFeminineName(sb, 'u1', 'Maxy');
    expect(result.feminineName).toBe('Maxy');
    expect(result.transformationPhase).toBe(1);
    expect((state.self as Record<string, unknown>)?.feminine_name).toBe('Maxy');
  });

  it('updates existing row without resetting phase', async () => {
    const state: MockState = {
      self: {
        user_id: 'u1', feminine_name: 'Old', pronouns: DEFAULT_PRONOUNS,
        current_honorific: 'sweetheart', transformation_phase: 3,
        phase_started_at: '2026-04-01T00:00:00Z',
        created_at: '2026-04-01T00:00:00Z', updated_at: '2026-04-01T00:00:00Z',
      },
      wardrobe: [], phaseDefs: [],
    };
    const sb = makeMockClient(state);
    const result = await setFeminineName(sb, 'u1', 'New');
    expect(result.feminineName).toBe('New');
    expect(result.transformationPhase).toBe(3);
    expect(result.currentHonorific).toBe('sweetheart');
  });
});

describe('advancePhase', () => {
  it('bumps phase and returns a fresh honorific', async () => {
    const phaseDefs = [
      { phase: 1, name: 'Curiosity', description: 'd1', honorifics: ['sweetheart'], unlocked_task_categories: [], primer_requirements: [] },
      { phase: 2, name: 'Permission', description: 'd2', honorifics: ['sweet girl', 'good girl'], unlocked_task_categories: [], primer_requirements: [] },
    ];
    const state: MockState = {
      self: {
        user_id: 'u1', feminine_name: 'Maxy', pronouns: DEFAULT_PRONOUNS,
        current_honorific: 'sweetheart', transformation_phase: 1,
        phase_started_at: '2026-04-01T00:00:00Z',
        created_at: '2026-04-01T00:00:00Z', updated_at: '2026-04-01T00:00:00Z',
      },
      wardrobe: [],
      phaseDefs,
    };
    const sb = makeMockClient(state);
    const result = await advancePhase(sb, 'u1');
    expect(result.fromPhase).toBe(1);
    expect(result.toPhase).toBe(2);
    expect(result.newPhaseDef?.name).toBe('Permission');
    expect(result.suggestedHonorific).toBe('sweet girl');
    expect(result.feminineSelf.transformationPhase).toBe(2);
    // Honorific itself was NOT changed — suggestion only
    expect(result.feminineSelf.currentHonorific).toBe('sweetheart');
  });

  it('caps at phase 7', async () => {
    const phaseDefs = [
      { phase: 7, name: 'Becoming', description: 'd', honorifics: ['my love'], unlocked_task_categories: [], primer_requirements: [] },
    ];
    const state: MockState = {
      self: {
        user_id: 'u1', feminine_name: 'Maxy', pronouns: DEFAULT_PRONOUNS,
        current_honorific: 'my love', transformation_phase: 7,
        phase_started_at: '2026-04-01T00:00:00Z',
        created_at: '2026-04-01T00:00:00Z', updated_at: '2026-04-01T00:00:00Z',
      },
      wardrobe: [],
      phaseDefs,
    };
    const sb = makeMockClient(state);
    const result = await advancePhase(sb, 'u1');
    expect(result.toPhase).toBe(7);
  });
});

describe('loadFeminineSelfContext', () => {
  it('returns empty context when no row exists', async () => {
    const state: MockState = { self: null, wardrobe: [], phaseDefs: [] };
    const sb = makeMockClient(state);
    const ctx = await loadFeminineSelfContext(sb, 'u1');
    expect(ctx.self).toBeNull();
    expect(ctx.recentWardrobe).toEqual([]);
    expect(ctx.phaseDef).toBeNull();
  });
});

// ============================================
// Integration: prompt injection contract
// ============================================
describe('prompt injection (loadFeminineSelfContext + buildFeminineSelfBlock)', () => {
  it('end-to-end produces the persona injection block', async () => {
    const state: MockState = {
      self: {
        user_id: 'u1', feminine_name: 'Maxy',
        pronouns: { subject: 'she', object: 'her', possessive: 'her' },
        current_honorific: 'good girl',
        transformation_phase: 3,
        phase_started_at: '2026-04-01T00:00:00Z',
        created_at: '2026-04-01T00:00:00Z', updated_at: '2026-04-01T00:00:00Z',
      },
      wardrobe: [
        { id: 'w1', user_id: 'u1', item_type: 'lipstick', item_name: 'rose', notes: null, acquired_at: '2026-04-29T00:00:00Z', created_at: '2026-04-29T00:00:00Z' },
      ],
      phaseDefs: [
        { phase: 3, name: 'Practice', description: 'd', honorifics: ['good girl'], unlocked_task_categories: [], primer_requirements: [] },
      ],
    };
    const sb = makeMockClient(state);
    const ctx = await loadFeminineSelfContext(sb, 'u1');
    const block = buildFeminineSelfBlock(ctx.self, ctx.recentWardrobe, ctx.phaseDef);
    expect(block).toContain('She knows you as Maxy');
    expect(block).toContain('phase 3 — Practice');
    expect(block).toContain('rose');
    expect(block).toContain('good girl');
  });

  it('returns empty block when no name is set — caller falls through', async () => {
    const state: MockState = { self: null, wardrobe: [], phaseDefs: [] };
    const sb = makeMockClient(state);
    const ctx = await loadFeminineSelfContext(sb, 'u1');
    const block = buildFeminineSelfBlock(ctx.self, ctx.recentWardrobe, ctx.phaseDef);
    expect(block).toBe('');
  });
});

// silence unused-import warnings on test-only utils
void vi;
