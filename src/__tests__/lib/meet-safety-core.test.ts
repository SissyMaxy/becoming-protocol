// Meet Safety System v2 (mig 626) — pure-logic unit tests.
//
// The module under test is dependency-free TS shared by the Deno edge
// functions and mirrored by the SQL watcher (meet_safety_watch). These tests
// pin the schedule numbers, the escalation ladder, the extension budget and
// the stranger-readability of the two outward messages.

import { describe, it, expect } from 'vitest';
import { renderPreMeetClarityCheck, PRE_MEET_CLARITY_ITEMS } from '../../../supabase/functions/_shared/meet-safety-core';
import {
  buildCheckinSchedule,
  extendHomeSafe,
  escalationStep,
  targetStage,
  stage3FireAtMs,
  renderStage3Message,
  renderFalseAlarmMessage,
  renderPrefireWarning,
  GRACE_MINUTES,
  MAX_HOME_SAFE_EXTENSIONS,
} from '../../../supabase/functions/_shared/meet-safety-core';

const MIN = 60_000;
const T0 = Date.parse('2026-07-04T19:00:00Z'); // meet_at

describe('buildCheckinSchedule', () => {
  it('generates arrival +20m grace 10, mid +duration/2 grace 15, home_safe +duration+60m grace 30', () => {
    const s = buildCheckinSchedule(T0, 90);
    expect(s).toHaveLength(3);
    const [arrival, mid, home] = s;
    expect(arrival.kind).toBe('arrival');
    expect(arrival.dueAtMs).toBe(T0 + 20 * MIN);
    expect(arrival.graceMinutes).toBe(10);
    expect(mid.kind).toBe('mid');
    expect(mid.dueAtMs).toBe(T0 + 45 * MIN);
    expect(mid.graceMinutes).toBe(15);
    expect(home.kind).toBe('home_safe');
    expect(home.dueAtMs).toBe(T0 + 150 * MIN);
    expect(home.graceMinutes).toBe(30);
  });

  it('scales the mid check-in with duration', () => {
    const s = buildCheckinSchedule(T0, 120);
    expect(s[1].dueAtMs).toBe(T0 + 60 * MIN);
    expect(s[2].dueAtMs).toBe(T0 + 180 * MIN);
  });

  it('grace constants match the design (10/15/30)', () => {
    expect(GRACE_MINUTES).toEqual({ arrival: 10, mid: 15, home_safe: 30 });
  });
});

describe('extendHomeSafe', () => {
  it('extends by exactly one hour', () => {
    expect(extendHomeSafe(T0, 0)).toBe(T0 + 60 * MIN);
    expect(extendHomeSafe(T0, 2)).toBe(T0 + 60 * MIN);
  });
  it('refuses a fourth extension', () => {
    expect(MAX_HOME_SAFE_EXTENSIONS).toBe(3);
    expect(extendHomeSafe(T0, 3)).toBeNull();
    expect(extendHomeSafe(T0, 4)).toBeNull();
  });
});

describe('targetStage', () => {
  const due = T0;
  const grace = 10;
  it('is -1 before due', () => {
    expect(targetStage(due - 1, due, grace)).toBe(-1);
  });
  it('is 0 within the grace window', () => {
    expect(targetStage(due, due, grace)).toBe(0);
    expect(targetStage(due + 9 * MIN, due, grace)).toBe(0);
  });
  it('is 1 from grace expiry to +15m', () => {
    expect(targetStage(due + 10 * MIN, due, grace)).toBe(1);
    expect(targetStage(due + 24 * MIN, due, grace)).toBe(1);
  });
  it('is 2 from grace+15m to grace+30m', () => {
    expect(targetStage(due + 25 * MIN, due, grace)).toBe(2);
    expect(targetStage(due + 39 * MIN, due, grace)).toBe(2);
  });
  it('is 3 at grace+30m', () => {
    expect(targetStage(due + 40 * MIN, due, grace)).toBe(3);
    expect(stage3FireAtMs(due, grace)).toBe(due + 40 * MIN);
  });
});

describe('escalationStep', () => {
  const due = T0;
  const grace = 10;
  const base = { dueAtMs: due, graceMinutes: grace };

  it('does nothing before due', () => {
    const r = escalationStep({ ...base, nowMs: due - MIN, currentStage: 0, nextEscalationAtMs: null });
    expect(r.action).toBe('none');
  });

  it('sends the first stage-0 push at T+0 and schedules the +3m re-push', () => {
    const r = escalationStep({ ...base, nowMs: due, currentStage: 0, nextEscalationAtMs: null });
    expect(r.action).toBe('checkin_push');
    expect(r.stage).toBe(0);
    expect(r.nextEscalationAtMs).toBe(due + 3 * MIN);
  });

  it('re-pushes at +3m and schedules +6m', () => {
    const r = escalationStep({ ...base, nowMs: due + 3 * MIN, currentStage: 0, nextEscalationAtMs: due + 3 * MIN });
    expect(r.action).toBe('checkin_push');
    expect(r.nextEscalationAtMs).toBe(due + 6 * MIN);
  });

  it('after the +6m re-push, hands over to grace expiry (no more stage-0 pushes)', () => {
    const r = escalationStep({ ...base, nowMs: due + 6 * MIN, currentStage: 0, nextEscalationAtMs: due + 6 * MIN });
    expect(r.action).toBe('checkin_push');
    expect(r.nextEscalationAtMs).toBe(due + grace * MIN);
  });

  it('stays quiet between scheduled sends', () => {
    const r = escalationStep({ ...base, nowMs: due + 4 * MIN, currentStage: 0, nextEscalationAtMs: due + 6 * MIN });
    expect(r.action).toBe('none');
  });

  it('climbs to stage 1 at grace expiry with 3-minute cadence', () => {
    const r = escalationStep({ ...base, nowMs: due + 10 * MIN, currentStage: 0, nextEscalationAtMs: due + 10 * MIN });
    expect(r.action).toBe('stage1_push');
    expect(r.stage).toBe(1);
    expect(r.nextEscalationAtMs).toBe(due + 13 * MIN);
  });

  it('climbs directly to the target stage if the watcher was down (skips missed stages)', () => {
    const r = escalationStep({ ...base, nowMs: due + 26 * MIN, currentStage: 0, nextEscalationAtMs: null });
    expect(r.action).toBe('prefire_push');
    expect(r.stage).toBe(2);
  });

  it('reports minutes to fire for the prefire countdown', () => {
    const r = escalationStep({ ...base, nowMs: due + 25 * MIN, currentStage: 1, nextEscalationAtMs: due + 25 * MIN });
    expect(r.action).toBe('prefire_push');
    // fire at due+40m, now due+25m → 15 minutes out
    expect(r.minutesToFire).toBe(15);
  });

  it('fires exactly once at grace+30m, then keeps post-fire pressure', () => {
    const fireMoment = due + 40 * MIN;
    const first = escalationStep({ ...base, nowMs: fireMoment, currentStage: 2, nextEscalationAtMs: fireMoment });
    expect(first.action).toBe('fire');
    expect(first.stage).toBe(3);
    const after = escalationStep({ ...base, nowMs: fireMoment + 3 * MIN, currentStage: 3, nextEscalationAtMs: fireMoment + 3 * MIN });
    expect(after.action).toBe('postfire_push');
    expect(after.stage).toBe(3);
  });
});

describe('renderStage3Message — stranger-readable, zero jargon', () => {
  const params = {
    contactName: 'Sarah',
    userName: 'David',
    venueName: 'The Copper Kettle',
    venueAddress: '412 Main St, Springfield',
    meetAtIso: '2026-07-04T19:00:00Z',
    dateLabel: 'a man he met on a dating app',
    lastCheckinIso: '2026-07-04T19:20:00Z',
    checkinKind: 'mid' as const,
  };

  it('contains contact name, user name, venue name + address, meet time, date label, last check-in and the ask', () => {
    const msg = renderStage3Message(params);
    expect(msg).toContain('Sarah');
    expect(msg).toContain('David');
    expect(msg).toContain('The Copper Kettle');
    expect(msg).toContain('412 Main St, Springfield');
    expect(msg).toContain('a man he met on a dating app');
    expect(msg.toLowerCase()).toContain('please call');
    expect(msg.toLowerCase()).toContain('check on them');
  });

  it('contains zero protocol jargon or persona voice', () => {
    const msg = renderStage3Message(params).toLowerCase();
    for (const banned of ['mommy', 'mama', 'decree', 'protocol', 'denial', 'handler', 'slip', 'escalation stage', 'funnel', 'good girl']) {
      expect(msg).not.toContain(banned);
    }
  });

  it('handles a missing user name and no prior check-in', () => {
    const msg = renderStage3Message({ ...params, userName: null, lastCheckinIso: null });
    expect(msg).toContain('The person who listed you as their safety contact');
    expect(msg).toContain('not checked in at all');
  });

  it('uses help wording when the user asked out', () => {
    const msg = renderStage3Message({ ...params, userAskedForHelp: true });
    expect(msg.toLowerCase()).toContain('need help');
    expect(msg.toLowerCase()).not.toContain('missed');
  });
});

describe('renderPreMeetClarityCheck — scene-breaking, protective, not authorizing', () => {
  it('is plain voice — zero persona / pet-names / protocol jargon', () => {
    const msg = renderPreMeetClarityCheck().toLowerCase();
    for (const banned of ['mommy', 'mama', 'good boy', 'good girl', 'decree', 'protocol', 'denial', 'handler', 'sweet', 'pet', 'goon', 'rung']) {
      expect(msg).not.toContain(banned);
    }
  });

  it('explicitly breaks scene', () => {
    const msg = renderPreMeetClarityCheck().toLowerCase();
    expect(msg).toContain('no scene');
  });

  it('carries the vetting + safety confirmations', () => {
    const msg = renderPreMeetClarityCheck().toLowerCase();
    expect(msg).toContain('verified');
    expect(msg).toContain('public');
    expect(msg).toContain('check-in');
    expect(msg).toContain('location');
    expect(msg).toContain('hard-out');
    expect(PRE_MEET_CLARITY_ITEMS.length).toBeGreaterThanOrEqual(5);
  });

  it('hands the decision to the user clear-headed and never says "go"', () => {
    const msg = renderPreMeetClarityCheck().toLowerCase();
    expect(msg).toContain('clear-headed');
    expect(msg).toContain('your call');
    // protective direction only — it tells you NOT to go if unsafe, never "go".
    expect(msg).toContain('do not go tonight');
    expect(msg).not.toMatch(/\bgo now\b|\bgo get\b|\bgo to him\b/);
  });
});

describe('renderFalseAlarmMessage', () => {
  it('is plain, names the contact and states safety', () => {
    const msg = renderFalseAlarmMessage({ contactName: 'Sarah', userName: 'David' });
    expect(msg).toContain('Sarah');
    expect(msg).toContain('David');
    expect(msg.toLowerCase()).toContain('false alarm');
    expect(msg.toLowerCase()).toContain('safe');
    expect(msg.toLowerCase()).not.toContain('mommy');
  });
});

describe('renderPrefireWarning', () => {
  it('counts down and names the contact', () => {
    const msg = renderPrefireWarning('Sarah', 12);
    expect(msg).toContain('12 minutes');
    expect(msg).toContain('Sarah');
  });
  it('never shows zero or negative minutes', () => {
    expect(renderPrefireWarning('Sarah', 0)).toContain('1 minute');
  });
});
