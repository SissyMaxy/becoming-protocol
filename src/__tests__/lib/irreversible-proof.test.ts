import { describe, it, expect } from 'vitest';
import {
  ginaCcAllowed,
  resolveCcStatus,
  withdrawalCancels,
  isOverdue,
} from '../../lib/irreversible-proof';

describe('ginaCcAllowed — master switch is the hard gate', () => {
  it('blocks by default (never) even with opt-in + captured', () => {
    expect(ginaCcAllowed('never', true, 'captured')).toBe(false);
  });
  it('blocks when withdrawn even with opt-in + captured', () => {
    expect(ginaCcAllowed('withdrawn', true, 'captured')).toBe(false);
  });
  it('blocks when granted but Maxy did not opt this item in', () => {
    expect(ginaCcAllowed('granted', false, 'captured')).toBe(false);
  });
  it('blocks when granted + opt-in but proof not captured yet', () => {
    expect(ginaCcAllowed('granted', true, 'pending')).toBe(false);
  });
  it('allows ONLY when granted AND opted-in AND captured', () => {
    expect(ginaCcAllowed('granted', true, 'captured')).toBe(true);
  });
});

describe('resolveCcStatus — parity with trg_irrev_cc_gate', () => {
  it('queues a captured opted-in item under granted master', () => {
    expect(resolveCcStatus('granted', { status: 'captured', gina_cc_opt_in: true, cc_status: 'none' })).toBe('queued');
  });
  it('does NOT queue under a non-granted master, demoting stray queued', () => {
    expect(resolveCcStatus('never', { status: 'captured', gina_cc_opt_in: true, cc_status: 'queued' })).toBe('none');
    expect(resolveCcStatus('withdrawn', { status: 'captured', gina_cc_opt_in: true, cc_status: 'queued' })).toBe('none');
  });
  it('demotes a stray queued when opt-in is false', () => {
    expect(resolveCcStatus('granted', { status: 'captured', gina_cc_opt_in: false, cc_status: 'queued' })).toBe('none');
  });
  it('preserves an already-sent CC (never re-queues, never demotes)', () => {
    expect(resolveCcStatus('granted', { status: 'captured', gina_cc_opt_in: true, cc_status: 'sent' })).toBe('sent');
  });
  it('does not queue a pending (uncaptured) item', () => {
    expect(resolveCcStatus('granted', { status: 'pending', gina_cc_opt_in: true, cc_status: 'none' })).toBe('none');
  });
});

describe('withdrawalCancels — retroactive cancel of pending CCs', () => {
  it('cancels a queued CC when consent leaves granted', () => {
    expect(withdrawalCancels('withdrawn', { cc_status: 'queued' })).toBe(true);
    expect(withdrawalCancels('never', { cc_status: 'queued' })).toBe(true);
  });
  it('does not touch an already-sent CC', () => {
    expect(withdrawalCancels('withdrawn', { cc_status: 'sent' })).toBe(false);
  });
  it('does not cancel when consent is still granted', () => {
    expect(withdrawalCancels('granted', { cc_status: 'queued' })).toBe(false);
  });
});

describe('isOverdue', () => {
  const now = new Date('2026-06-05T03:00:00Z');
  it('flags a pending item past its due date, never nudged', () => {
    expect(isOverdue({ status: 'pending', gina_cc_opt_in: false, cc_status: 'none', proof_due_at: '2026-06-04T00:00:00Z', last_nudged_at: null }, now)).toBe(true);
  });
  it('ignores captured items', () => {
    expect(isOverdue({ status: 'captured', gina_cc_opt_in: false, cc_status: 'none', proof_due_at: '2026-06-04T00:00:00Z', last_nudged_at: null }, now)).toBe(false);
  });
  it('ignores items not yet due', () => {
    expect(isOverdue({ status: 'pending', gina_cc_opt_in: false, cc_status: 'none', proof_due_at: '2026-06-06T00:00:00Z', last_nudged_at: null }, now)).toBe(false);
  });
  it('skips an item nudged within the last ~day', () => {
    expect(isOverdue({ status: 'pending', gina_cc_opt_in: false, cc_status: 'none', proof_due_at: '2026-06-01T00:00:00Z', last_nudged_at: '2026-06-04T20:00:00Z' }, now)).toBe(false);
  });
  it('re-nudges an item last nudged over a day ago', () => {
    expect(isOverdue({ status: 'pending', gina_cc_opt_in: false, cc_status: 'none', proof_due_at: '2026-06-01T00:00:00Z', last_nudged_at: '2026-06-03T20:00:00Z' }, now)).toBe(true);
  });
});
