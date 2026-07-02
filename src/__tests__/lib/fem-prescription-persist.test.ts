// Completed-prescription survives engine re-run (FEM §1 baked-in bug fix).
//
// The old persistPrescription deleted ALL of today's rows before inserting
// fresh — a completed prescription was erased when the engine re-ran the
// same day, destroying the very completion signal the adaptive loop feeds
// on. The fix deletes ONLY status='pending'.
//
// This suite runs generateDailyPrescription against an in-memory supabase
// mock twice and asserts the completed row survives both runs.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── In-memory supabase mock ─────────────────────────────────────────

type Row = Record<string, unknown>;
const store: Record<string, Row[]> = {};

function matches(row: Row, filters: Array<{ op: string; col: string; val: unknown }>): boolean {
  for (const f of filters) {
    const v = row[f.col];
    switch (f.op) {
      case 'eq': if (v !== f.val) return false; break;
      case 'neq': if (v === f.val) return false; break;
      case 'gte': if (!(String(v) >= String(f.val))) return false; break;
      case 'lte': if (!(String(v) <= String(f.val))) return false; break;
      case 'in': if (!(f.val as unknown[]).includes(v)) return false; break;
      case 'is': if (v !== f.val && !(f.val === null && v == null)) return false; break;
      default: break;
    }
  }
  return true;
}

class MockBuilder {
  private filters: Array<{ op: string; col: string; val: unknown }> = [];
  private action: 'select' | 'insert' | 'delete' | 'update' = 'select';
  private insertRows: Row[] = [];
  private headCount = false;
  private single = false;

  constructor(private table: string) {}

  select(_cols?: string, opts?: { count?: string; head?: boolean }) {
    if (opts?.head) this.headCount = true;
    if (this.action === 'insert') return this; // insert(...).select(...)
    this.action = 'select';
    return this;
  }
  insert(rows: Row | Row[]) { this.action = 'insert'; this.insertRows = Array.isArray(rows) ? rows : [rows]; return this; }
  delete() { this.action = 'delete'; return this; }
  update(_patch: Row) { this.action = 'update'; return this; }
  eq(col: string, val: unknown) { this.filters.push({ op: 'eq', col, val }); return this; }
  neq(col: string, val: unknown) { this.filters.push({ op: 'neq', col, val }); return this; }
  gte(col: string, val: unknown) { this.filters.push({ op: 'gte', col, val }); return this; }
  lte(col: string, val: unknown) { this.filters.push({ op: 'lte', col, val }); return this; }
  in(col: string, val: unknown[]) { this.filters.push({ op: 'in', col, val }); return this; }
  is(col: string, val: unknown) { this.filters.push({ op: 'is', col, val }); return this; }
  not() { return this; }
  like() { return this; }
  order() { return this; }
  limit() { return this; }
  maybeSingle() { this.single = true; return this; }
  // deno-lint-ignore no-explicit-any
  then(resolve: (v: { data: unknown; error: null; count?: number }) => void) {
    const rows = store[this.table] ?? (store[this.table] = []);
    if (this.action === 'insert') {
      for (const r of this.insertRows) rows.push({ id: `${this.table}-${rows.length + 1}`, ...r });
      resolve({ data: this.insertRows, error: null });
      return;
    }
    if (this.action === 'delete') {
      store[this.table] = rows.filter(r => !matches(r, this.filters));
      resolve({ data: null, error: null });
      return;
    }
    if (this.action === 'update') {
      resolve({ data: null, error: null });
      return;
    }
    const found = rows.filter(r => matches(r, this.filters));
    if (this.headCount) { resolve({ data: null, error: null, count: found.length }); return; }
    resolve({ data: this.single ? (found[0] ?? null) : found, error: null });
  }
}

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table: string) => new MockBuilder(table),
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    rpc: async () => ({ data: null, error: null }),
  },
}));

import { generateDailyPrescription } from '../../lib/conditioning/feminization-prescriptions';

const USER = 'u1';
const today = new Date().toISOString().split('T')[0];

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  store.user_state = [{ user_id: USER, current_phase: 1, denial_day: 0, streak_days: 0 }];
  store.task_bank = [
    { id: 't1', domain: 'skincare', instruction: 'Skincare ritual.', intensity: 2, duration_minutes: 5, is_core: true, active: true, requires: null },
    { id: 't2', domain: 'voice', instruction: 'Voice warmup.', intensity: 2, duration_minutes: 10, is_core: false, active: true, requires: null },
    { id: 't3', domain: 'exercise', instruction: 'Stretch.', intensity: 1, duration_minutes: 10, is_core: false, active: true, requires: null },
    { id: 't4', domain: 'nutrition', instruction: 'Log a meal.', intensity: 1, duration_minutes: null, is_core: false, active: true, requires: null },
    // Requires an unowned garment — must never be prescribed.
    { id: 't5', domain: 'style', instruction: 'Wear the dress.', intensity: 3, duration_minutes: null, is_core: false, active: true, requires: { item_category: 'dresses' } },
  ];
  store.wardrobe_inventory = []; // owns nothing
  store.feminization_prescriptions = [
    // A COMPLETED prescription from earlier today — must survive re-runs.
    { id: 'done-1', user_id: USER, prescribed_date: today, domain: 'voice', instruction: 'Morning voice work.', status: 'completed', completed_at: new Date().toISOString() },
    // A stale pending row — replaced by the fresh set.
    { id: 'pend-1', user_id: USER, prescribed_date: today, domain: 'skincare', instruction: 'Old pending.', status: 'pending' },
  ];
});

describe('generateDailyPrescription persistence', () => {
  it('completed row survives an engine re-run; pending rows are replaced', async () => {
    await generateDailyPrescription(USER);

    const rows = store.feminization_prescriptions.filter(r => r.user_id === USER && r.prescribed_date === today);
    const completed = rows.filter(r => r.status === 'completed');
    expect(completed).toHaveLength(1);
    expect(completed[0].id).toBe('done-1');
    // Old pending replaced (deleted), fresh pendings inserted.
    expect(rows.find(r => r.id === 'pend-1')).toBeUndefined();
    expect(rows.filter(r => r.status === 'pending').length).toBeGreaterThan(0);
  });

  it('running the engine TWICE still preserves the completed row (regression)', async () => {
    await generateDailyPrescription(USER);
    await generateDailyPrescription(USER);

    const completed = store.feminization_prescriptions.filter(r => r.status === 'completed');
    expect(completed).toHaveLength(1);
    expect(completed[0].id).toBe('done-1');
  });

  it('never prescribes a task requiring an unowned garment category', async () => {
    await generateDailyPrescription(USER);
    const pending = store.feminization_prescriptions.filter(r => r.status === 'pending');
    for (const p of pending) {
      expect(p.instruction).not.toBe('Wear the dress.');
    }
  });

  it('inserted rows carry canonical domains + evidence contract + deadline', async () => {
    await generateDailyPrescription(USER);
    const pending = store.feminization_prescriptions.filter(r => r.status === 'pending');
    expect(pending.length).toBeGreaterThan(0);
    for (const p of pending) {
      expect(typeof p.evidence_kind).toBe('string');
      expect(typeof p.deadline).toBe('string');
    }
  });
});
