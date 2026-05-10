// Integration tests for the letters archive — operates on an in-memory
// fake of handler_outreach_queue so we can assert end-to-end behavior
// without a real DB.

import { describe, it, expect, beforeEach } from 'vitest';
import { shouldAutoArchive } from '../../lib/letters/auto-archive';

// ============================================
// In-memory fake for handler_outreach_queue
// ============================================

type Row = {
  id: string;
  user_id: string;
  message: string;
  source: string;
  status: string;
  delivered_at: string | null;
  is_archived_to_letters: boolean;
  letters_pinned_at: string | null;
  phase_snapshot: number | null;
  affect_snapshot: string | null;
  created_at: string;
};

let store: Row[] = [];

function makeRow(partial: Partial<Row>): Row {
  return {
    id: partial.id || `row_${Math.random().toString(36).slice(2, 9)}`,
    user_id: partial.user_id || 'user_a',
    message: partial.message || '',
    source: partial.source || 'mommy_praise',
    status: partial.status || 'pending',
    delivered_at: partial.delivered_at ?? null,
    is_archived_to_letters: partial.is_archived_to_letters ?? false,
    letters_pinned_at: partial.letters_pinned_at ?? null,
    phase_snapshot: partial.phase_snapshot ?? null,
    affect_snapshot: partial.affect_snapshot ?? null,
    created_at: partial.created_at || new Date().toISOString(),
  };
}

// Mirror of the SQL view: archived only, pinned-first, then newest-first.
function lettersArchiveQuery(userId: string): Row[] {
  return store
    .filter(r => r.user_id === userId && r.is_archived_to_letters)
    .sort((a, b) => {
      const aPin = a.letters_pinned_at ? new Date(a.letters_pinned_at).getTime() : 0;
      const bPin = b.letters_pinned_at ? new Date(b.letters_pinned_at).getTime() : 0;
      if (aPin !== bPin) return bPin - aPin; // pinned first, newest pin first
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
}

// Mirror of the SQL trigger: BEFORE UPDATE flips is_archived for recall/mantra
// when ack happens. Praise/bedtime are archived at insert.
function applyAckTrigger(oldRow: Row, newRow: Row): Row {
  if (newRow.is_archived_to_letters) return newRow;
  const becameAcked =
    (newRow.status === 'delivered' && oldRow.status !== 'delivered') ||
    (newRow.delivered_at !== null && oldRow.delivered_at === null);
  if (!becameAcked) return newRow;
  if (newRow.source === 'mommy_recall' || newRow.source === 'mommy_mantra') {
    return { ...newRow, is_archived_to_letters: true };
  }
  return newRow;
}

function update(id: string, patch: Partial<Row>): Row {
  const idx = store.findIndex(r => r.id === id);
  if (idx === -1) throw new Error(`row not found: ${id}`);
  const oldRow = store[idx];
  const naive = { ...oldRow, ...patch };
  const final = applyAckTrigger(oldRow, naive);
  store[idx] = final;
  return final;
}

// Insert that mirrors what the edge fns do: snapshot at insert, run helper.
function insertOutreach(opts: {
  source: string;
  affect: string | null;
  phase: number | null;
  user_id?: string;
  message?: string;
}): Row {
  const archive = shouldAutoArchive({
    source: opts.source,
    affect_snapshot: opts.affect,
    status: 'pending',
  });
  const row = makeRow({
    source: opts.source,
    affect_snapshot: opts.affect,
    phase_snapshot: opts.phase,
    user_id: opts.user_id,
    message: opts.message,
    is_archived_to_letters: archive,
  });
  store.push(row);
  return row;
}

beforeEach(() => {
  store = [];
});

// ============================================
// Integration tests
// ============================================

describe('letters archive — query semantics', () => {
  it('archived row appears in the /letters query', () => {
    insertOutreach({ source: 'mommy_bedtime', affect: 'patient', phase: 3 });
    insertOutreach({ source: 'mommy_tease', affect: 'hungry', phase: 3 }); // not archived

    const archived = lettersArchiveQuery('user_a');
    expect(archived.length).toBe(1);
    expect(archived[0].source).toBe('mommy_bedtime');
  });

  it('non-archived rows never leak into the archive view', () => {
    insertOutreach({ source: 'mommy_praise', affect: 'hungry', phase: 2 });   // hungry → not archived
    insertOutreach({ source: 'mommy_tease', affect: 'aching', phase: 2 });    // tease → not archived
    insertOutreach({ source: 'mommy_recall', affect: 'patient', phase: 2 });  // pending recall → not archived
    expect(lettersArchiveQuery('user_a').length).toBe(0);
  });

  it('pinned letters sort before unpinned within the same user', () => {
    const pinned = insertOutreach({ source: 'mommy_bedtime', affect: 'patient', phase: 3 });
    pinned.created_at = new Date(Date.now() - 2 * 86400000).toISOString();
    insertOutreach({ source: 'mommy_bedtime', affect: 'patient', phase: 3 }); // newer, unpinned

    update(pinned.id, { letters_pinned_at: new Date().toISOString() });

    const archived = lettersArchiveQuery('user_a');
    expect(archived[0].id).toBe(pinned.id);
  });

  it('only returns rows for the requesting user', () => {
    insertOutreach({ source: 'mommy_bedtime', affect: 'patient', phase: 1, user_id: 'user_a' });
    insertOutreach({ source: 'mommy_bedtime', affect: 'patient', phase: 1, user_id: 'user_b' });
    expect(lettersArchiveQuery('user_a').length).toBe(1);
    expect(lettersArchiveQuery('user_b').length).toBe(1);
  });
});

describe('letters archive — manual pin moves a non-archived row in', () => {
  it('manual pin (with archive flip) brings a tease into letters', () => {
    const tease = insertOutreach({ source: 'mommy_tease', affect: 'hungry', phase: 4 });
    expect(tease.is_archived_to_letters).toBe(false);

    // The "Save to letters" UI flow flips both flags atomically.
    update(tease.id, {
      is_archived_to_letters: true,
      letters_pinned_at: new Date().toISOString(),
    });

    const archived = lettersArchiveQuery('user_a');
    expect(archived.length).toBe(1);
    expect(archived[0].id).toBe(tease.id);
    expect(archived[0].letters_pinned_at).not.toBeNull();
  });
});

describe('letters archive — recall/mantra ack trigger', () => {
  it('recall starts unarchived; flips to archived on status=delivered', () => {
    const r = insertOutreach({ source: 'mommy_recall', affect: 'patient', phase: 2 });
    expect(r.is_archived_to_letters).toBe(false);

    update(r.id, { status: 'delivered', delivered_at: new Date().toISOString() });

    const archived = lettersArchiveQuery('user_a');
    expect(archived.length).toBe(1);
    expect(archived[0].id).toBe(r.id);
  });

  it('recall ack via delivered_at alone (status path skipped) still archives', () => {
    const r = insertOutreach({ source: 'mommy_recall', affect: null, phase: 1 });
    update(r.id, { delivered_at: new Date().toISOString() });
    expect(lettersArchiveQuery('user_a').length).toBe(1);
  });

  it('mantra follows the same path as recall', () => {
    const r = insertOutreach({ source: 'mommy_mantra', affect: 'restless', phase: 1 });
    expect(r.is_archived_to_letters).toBe(false);
    update(r.id, { status: 'delivered' });
    expect(lettersArchiveQuery('user_a').length).toBe(1);
  });

  it('tease never archives even after ack (not in policy)', () => {
    const r = insertOutreach({ source: 'mommy_tease', affect: 'aching', phase: 1 });
    update(r.id, { status: 'delivered', delivered_at: new Date().toISOString() });
    expect(lettersArchiveQuery('user_a').length).toBe(0);
  });
});

describe('letters archive — soft delete', () => {
  it('"remove from letters" clears the flag without deleting the underlying row', () => {
    const b = insertOutreach({ source: 'mommy_bedtime', affect: 'patient', phase: 2 });
    expect(b.is_archived_to_letters).toBe(true);

    update(b.id, { is_archived_to_letters: false, letters_pinned_at: null });

    expect(lettersArchiveQuery('user_a').length).toBe(0);
    // Row still exists in the underlying store
    expect(store.find(r => r.id === b.id)).toBeDefined();
  });

  it('removed letter can be re-archived via manual pin', () => {
    const b = insertOutreach({ source: 'mommy_bedtime', affect: 'patient', phase: 2 });
    update(b.id, { is_archived_to_letters: false });
    expect(lettersArchiveQuery('user_a').length).toBe(0);

    update(b.id, { is_archived_to_letters: true, letters_pinned_at: new Date().toISOString() });
    expect(lettersArchiveQuery('user_a').length).toBe(1);
  });
});

describe('letters archive — snapshot integrity', () => {
  it('phase advances between archive time and view time → letter still shows the original phase', () => {
    // Snapshot captured at phase 2.
    const b = insertOutreach({ source: 'mommy_bedtime', affect: 'patient', phase: 2 });
    expect(b.phase_snapshot).toBe(2);

    // User advances to phase 5 some time later. We do not write the
    // updated phase back into archived rows.
    // Simulate the passage by NOT touching the row; phase_snapshot is frozen.

    const archived = lettersArchiveQuery('user_a');
    expect(archived[0].phase_snapshot).toBe(2);
  });

  it('affect rolls over the next day → letter still shows the original affect', () => {
    const p = insertOutreach({ source: 'mommy_praise', affect: 'delighted', phase: 3 });
    expect(p.affect_snapshot).toBe('delighted');

    // Today's affect rolls to "patient" in mommy_mood — but the archived row
    // is unaffected because it carries its own snapshot.
    const archived = lettersArchiveQuery('user_a');
    expect(archived[0].affect_snapshot).toBe('delighted');
  });

  it('snapshot is null for legacy outreach rows but doesn\'t break the view', () => {
    // Direct insert with NULL snapshots (legacy or non-Mommy path).
    const legacy = makeRow({
      source: 'mommy_bedtime',
      is_archived_to_letters: true,
      phase_snapshot: null,
      affect_snapshot: null,
    });
    store.push(legacy);

    const archived = lettersArchiveQuery('user_a');
    expect(archived.length).toBe(1);
    expect(archived[0].phase_snapshot).toBeNull();
    expect(archived[0].affect_snapshot).toBeNull();
  });
});
