/**
 * Seen-tap acknowledgment — contract suite (design 2026-07-01 §2).
 *
 * Pins the pure mirror of acknowledge_obligation() (mig 644) + the FocusMode
 * source map, so the browser surface, the RPC, and the miss-processor agree on
 * exactly one thing: an acknowledged obligation carries surfaced_via='seen_tap',
 * and only genuinely-displayed obligations get there.
 */

import { describe, it, expect } from 'vitest';
import {
  SEEN_TAP_VIA,
  computeAckStamp,
  ackSourceForTask,
  type ObligationAckState,
} from '../../../supabase/functions/_shared/enforcement-core';

const NOW_ISO = '2026-07-02T12:00:00Z';
const state = (o: Partial<ObligationAckState>): ObligationAckState => ({
  status: 'surfaced',
  surfaced_via: null,
  surfaced_at: null,
  ...o,
});

describe('computeAckStamp — the ack targets surfaced_via=seen_tap', () => {
  it('the stamped value is exactly the string mig 628 reads', () => {
    expect(SEEN_TAP_VIA).toBe('seen_tap');
  });

  it('a filed (never-surfaced) obligation is surfaced BY the ack', () => {
    const d = computeAckStamp(state({ status: 'filed', surfaced_via: null, surfaced_at: null }), NOW_ISO);
    expect(d.shouldUpdate).toBe(true);
    expect(d.nextStatus).toBe('surfaced');
    expect(d.nextSurfacedVia).toBe('seen_tap');
    expect(d.nextSurfacedAt).toBe(NOW_ISO); // COALESCE(surfaced_at, now())
  });

  it('upgrades an already-surfaced row (decree_render) to seen_tap', () => {
    const earlier = '2026-07-02T09:00:00Z';
    const d = computeAckStamp(state({ status: 'surfaced', surfaced_via: 'decree_render', surfaced_at: earlier }), NOW_ISO);
    expect(d.shouldUpdate).toBe(true);
    expect(d.nextStatus).toBe('surfaced');
    expect(d.nextSurfacedVia).toBe('seen_tap');
    expect(d.nextSurfacedAt).toBe(earlier); // never overwrites an earlier honest surface
  });

  it('stamps a due obligation without changing its status', () => {
    const d = computeAckStamp(state({ status: 'due', surfaced_via: 'outreach_render', surfaced_at: '2026-07-02T08:00:00Z' }), NOW_ISO);
    expect(d.shouldUpdate).toBe(true);
    expect(d.nextStatus).toBe('due');
    expect(d.nextSurfacedVia).toBe('seen_tap');
  });
});

describe('computeAckStamp — idempotent', () => {
  it('a row already seen-tap-surfaced is a no-op', () => {
    const s = state({ status: 'surfaced', surfaced_via: 'seen_tap', surfaced_at: NOW_ISO });
    const d = computeAckStamp(s, NOW_ISO);
    expect(d.shouldUpdate).toBe(false);
    expect(d.nextSurfacedVia).toBe('seen_tap');
    expect(d.nextStatus).toBe('surfaced');
  });

  it('re-applying to the ack result yields the same state (stable)', () => {
    const first = computeAckStamp(state({ status: 'filed' }), NOW_ISO);
    const second = computeAckStamp(
      state({ status: first.nextStatus, surfaced_via: first.nextSurfacedVia, surfaced_at: first.nextSurfacedAt }),
      '2026-07-02T18:00:00Z',
    );
    expect(second.shouldUpdate).toBe(false);
    expect(second.nextSurfacedVia).toBe('seen_tap');
  });
});

describe('computeAckStamp — never upgrades a settled row', () => {
  for (const status of ['missed', 'consequence_previewed', 'consequence_fired', 'fulfilled', 'voided', 'cancelled_user', 'cancelled_system', 'paused']) {
    it(`status='${status}' is never stamped (miss already scored / terminal)`, () => {
      const d = computeAckStamp(state({ status, surfaced_via: 'decree_render' }), NOW_ISO);
      expect(d.shouldUpdate).toBe(false);
      expect(d.nextSurfacedVia).toBe('decree_render'); // untouched
    });
  }
});

describe('ackSourceForTask — non-displayed obligations are never stamped', () => {
  it('maps decree focus tasks to handler_decrees', () => {
    for (const kind of ['focus_decree', 'overdue_decree', 'due_today_decree']) {
      expect(ackSourceForTask(kind, 'row-1')).toEqual({ sourceTable: 'handler_decrees', sourceId: 'row-1' });
    }
  });

  it('maps commitment / punishment / confession / workout tasks to their tables', () => {
    expect(ackSourceForTask('due_today_commitment', 'c1')).toEqual({ sourceTable: 'handler_commitments', sourceId: 'c1' });
    expect(ackSourceForTask('overdue_punishment', 'p1')).toEqual({ sourceTable: 'punishment_queue', sourceId: 'p1' });
    expect(ackSourceForTask('overdue_confession', 'x1')).toEqual({ sourceTable: 'confession_queue', sourceId: 'x1' });
    expect(ackSourceForTask('due_today_confession', 'x2')).toEqual({ sourceTable: 'confession_queue', sourceId: 'x2' });
    expect(ackSourceForTask('workout_today', 'w1')).toEqual({ sourceTable: 'workout_prescriptions', sourceId: 'w1' });
  });

  it('returns null for non-obligation task kinds (nothing to acknowledge)', () => {
    for (const kind of ['clean', 'mommy_touch', 'release_checkin', 'physical_state_today', 'hrt_step_today', 'audio_session', 'approve_post', 'fem_prescription', 'mantra_harvest', 'overdue_dose', 'due_today_dose']) {
      expect(ackSourceForTask(kind, 'row-1')).toBeNull();
    }
  });

  it('returns null when there is no on-screen row id (merely fetched, not shown)', () => {
    expect(ackSourceForTask('focus_decree', null)).toBeNull();
  });
});
