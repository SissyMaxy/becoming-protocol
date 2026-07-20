/**
 * focus pick-next — locks the FocusMode ranking cascade extracted to
 * src/lib/focus/pick-next.ts (A2). The order IS the product ("one task at
 * a time"); change these tests only when you change the order deliberately.
 */
import { describe, it, expect } from 'vitest';
import {
  chooseFocusTask, computeDoseUrgency, hrtStepDue, pickFemPrescription,
  type FocusInputs,
} from '../../lib/focus/pick-next';

const NOW = new Date('2026-07-15T12:00:00Z').getTime();
const inHours = (h: number) => new Date(NOW + h * 3600_000).toISOString();

/** Empty board — chooseFocusTask returns 'clean'. Override per test. */
function base(over: Partial<FocusInputs> = {}): FocusInputs {
  return {
    userId: 'user-1',
    focusDecree: null,
    overdueConfession: null,
    overduePunishment: null,
    overdueDecree: null,
    todayConfession: null,
    todayDecree: null,
    pendingCommitment: null,
    regimens: [],
    doseLog: [],
    outfit: null,
    workout: null,
    mommyTouch: null,
    audioOffer: null,
    selfEchoRows: [],
    hrt: {
      step: 'adherent', missedDays: 0, appointmentAt: null,
      pastObstacles: [], markerSetToday: false, todayKeyET: '2026-07-15',
    },
    release: { lastReleaseIso: inHours(-2), checkedToday: false },
    physicalStateCountToday: 1,
    pendingPost: null,
    femRows: [],
    lastFemDomain: null,
    mantraHarvest: { row: null, dismissed: false },
    ...over,
  };
}

const decree = (id: string) => ({
  id, edict: `edict ${id}`, deadline: inHours(3), proof_type: 'none',
  trigger_source: null as string | null,
});

const overdueDoseInputs = (): Partial<FocusInputs> => ({
  regimens: [{ id: 'reg-1', medication_name: 'E valerate', medication_category: 'hrt', started_at: inHours(-72) }],
  doseLog: [],
});

describe('cascade order', () => {
  it('empty board → clean', () => {
    const t = chooseFocusTask(base(), NOW);
    expect(t.kind).toBe('clean');
    expect(t.tone).toBe('calm');
  });

  it("focus_decree (Mama's pick) beats everything, even overdue work", () => {
    const t = chooseFocusTask(base({
      focusDecree: decree('fd'),
      overdueConfession: { id: 'c1', prompt: 'p', deadline: inHours(-5) },
      ...overdueDoseInputs(),
    }), NOW);
    expect(t.kind).toBe('focus_decree');
    expect(t.rowId).toBe('fd');
    expect(t.title).toBe('edict fd'); // full edict, never truncated
  });

  it('overdue dose (>6h) beats overdue confession', () => {
    const t = chooseFocusTask(base({
      overdueConfession: { id: 'c1', prompt: 'p', deadline: inHours(-5) },
      ...overdueDoseInputs(),
    }), NOW);
    expect(t.kind).toBe('overdue_dose');
    expect(t.tone).toBe('critical');
  });

  it('a dose ≤6h late does NOT preempt (waits for the due-today tier)', () => {
    const t = chooseFocusTask(base({
      regimens: [{ id: 'reg-1', medication_name: 'E', medication_category: 'hrt', started_at: inHours(-27) }],
      overdueConfession: { id: 'c1', prompt: 'p', deadline: inHours(-5) },
    }), NOW);
    expect(t.kind).toBe('overdue_confession');
  });

  it('overdue: confession > punishment > decree', () => {
    const both = base({
      overdueConfession: { id: 'c1', prompt: 'p', deadline: inHours(-5) },
      overduePunishment: { id: 'p1', title: 't', description: '', due_by: inHours(-5) },
      overdueDecree: decree('d1'),
    });
    expect(chooseFocusTask(both, NOW).kind).toBe('overdue_confession');
    expect(chooseFocusTask(base({
      overduePunishment: { id: 'p1', title: 't', description: '', due_by: inHours(-5) },
      overdueDecree: decree('d1'),
    }), NOW).kind).toBe('overdue_punishment');
    expect(chooseFocusTask(base({ overdueDecree: decree('d1') }), NOW).kind).toBe('overdue_decree');
  });

  it('approve_post sits below overdue work, above HRT', () => {
    const post = { id: 'ai1', generated_text: 'txt', platform: 'twitter' };
    expect(chooseFocusTask(base({
      pendingPost: post,
      overdueDecree: decree('d1'),
    }), NOW).kind).toBe('overdue_decree');
    expect(chooseFocusTask(base({
      pendingPost: post,
      hrt: { step: 'uncommitted', missedDays: 0, appointmentAt: null, pastObstacles: [], markerSetToday: false, todayKeyET: '2026-07-15' },
    }), NOW).kind).toBe('approve_post');
  });

  it('hrt_step_today beats harvest/touch/audio/due-today tiers', () => {
    const t = chooseFocusTask(base({
      hrt: { step: 'uncommitted', missedDays: 0, appointmentAt: null, pastObstacles: [], markerSetToday: false, todayKeyET: '2026-07-15' },
      mommyTouch: { id: 'mt1', prompt: 'p', category: 'edge_hold', expires_at: inHours(1) },
      todayConfession: { id: 'c2', prompt: 'p', deadline: inHours(4) },
    }), NOW);
    expect(t.kind).toBe('hrt_step_today');
    expect(t.tone).toBe('high');
  });

  it('HRT tone escalates to critical at 3 missed days', () => {
    const t = chooseFocusTask(base({
      hrt: { step: 'uncommitted', missedDays: 3, appointmentAt: null, pastObstacles: [], markerSetToday: false, todayKeyET: '2026-07-15' },
    }), NOW);
    expect(t.tone).toBe('critical');
  });

  it('mantra_harvest > mommy_touch > audio_session > due-today confession', () => {
    const harvest = { row: { id: 'h1', message: 'say "I am hers" for me', expires_at: inHours(0.5) }, dismissed: false };
    const touch = { id: 'mt1', prompt: 'p', category: 'edge_hold', expires_at: inHours(1) };
    const offer = { id: 'ao1', kind: 'session_goon', intensity_tier: 'firm', teaser: 't', expires_at: inHours(1) } as FocusInputs['audioOffer'];
    const conf = { id: 'c2', prompt: 'p', deadline: inHours(4) };
    expect(chooseFocusTask(base({ mantraHarvest: harvest, mommyTouch: touch, audioOffer: offer, todayConfession: conf }), NOW).kind).toBe('mantra_harvest');
    expect(chooseFocusTask(base({ mommyTouch: touch, audioOffer: offer, todayConfession: conf }), NOW).kind).toBe('mommy_touch');
    expect(chooseFocusTask(base({ audioOffer: offer, todayConfession: conf }), NOW).kind).toBe('audio_session');
    expect(chooseFocusTask(base({ todayConfession: conf }), NOW).kind).toBe('due_today_confession');
  });

  it('a dismissed harvest sits out', () => {
    const t = chooseFocusTask(base({
      mantraHarvest: { row: { id: 'h1', message: 'm', expires_at: inHours(0.5) }, dismissed: true },
    }), NOW);
    expect(t.kind).toBe('clean');
  });

  it('due-today: confession > commitment > decree > dose', () => {
    const conf = { id: 'c2', prompt: 'p', deadline: inHours(4) };
    const commit = { id: 'k1', what: 'w', by_when: inHours(4), consequence: 'x' };
    const dec = decree('d2');
    const doseSoon: Partial<FocusInputs> = {
      regimens: [{ id: 'reg-2', medication_name: 'E', medication_category: 'hrt', started_at: inHours(-20) }],
    };
    expect(chooseFocusTask(base({ todayConfession: conf, pendingCommitment: commit, todayDecree: dec, ...doseSoon }), NOW).kind).toBe('due_today_confession');
    expect(chooseFocusTask(base({ pendingCommitment: commit, todayDecree: dec, ...doseSoon }), NOW).kind).toBe('due_today_commitment');
    expect(chooseFocusTask(base({ todayDecree: dec, ...doseSoon }), NOW).kind).toBe('due_today_decree');
    expect(chooseFocusTask(base(doseSoon), NOW).kind).toBe('due_today_dose');
  });

  it('release_checkin > physical_state > fem_prescription > outfit > workout', () => {
    const stale: Partial<FocusInputs> = { release: { lastReleaseIso: inHours(-30), checkedToday: false } };
    const phys: Partial<FocusInputs> = { physicalStateCountToday: 0 };
    const fem: Partial<FocusInputs> = { femRows: [{ id: 'f1', domain: 'voice', instruction: 'i', intensity: 2, duration: 5, evidence_kind: 'none', deadline: null, requires: null }] };
    const outfit: Partial<FocusInputs> = { outfit: { id: 'o1', prescription: { top: 'x' }, completed_at: null } };
    const workout: Partial<FocusInputs> = { workout: { id: 'w1', workout_type: 'glutes', focus_area: 'lower' } };
    expect(chooseFocusTask(base({ ...stale, ...phys, ...fem, ...outfit, ...workout }), NOW).kind).toBe('release_checkin');
    expect(chooseFocusTask(base({ ...phys, ...fem, ...outfit, ...workout }), NOW).kind).toBe('physical_state_today');
    expect(chooseFocusTask(base({ ...fem, ...outfit, ...workout }), NOW).kind).toBe('fem_prescription');
    expect(chooseFocusTask(base({ ...outfit, ...workout }), NOW).kind).toBe('outfit_today');
    expect(chooseFocusTask(base(workout), NOW).kind).toBe('workout_today');
  });

  it('a checked-today release does not resurface', () => {
    const t = chooseFocusTask(base({ release: { lastReleaseIso: inHours(-30), checkedToday: true } }), NOW);
    expect(t.kind).toBe('clean');
  });

  it('completed outfit does not surface', () => {
    const t = chooseFocusTask(base({ outfit: { id: 'o1', prescription: {}, completed_at: inHours(-1) } }), NOW);
    expect(t.kind).toBe('clean');
  });
});

describe('dose urgency derivation', () => {
  it('daily regimen anchors on last dose; weekly (glp1) on 7d', () => {
    const { mostOverdue } = computeDoseUrgency(
      [
        { id: 'daily', medication_name: 'E', medication_category: 'hrt', started_at: inHours(-100) },
        { id: 'weekly', medication_name: 'GLP', medication_category: 'glp1', started_at: inHours(-100) },
      ],
      [
        { regimen_id: 'daily', taken_at: inHours(-30) },   // 6h overdue on 24h cycle
        { regimen_id: 'weekly', taken_at: inHours(-100) }, // 68h into a 168h cycle — not due
      ],
      NOW,
    );
    expect(mostOverdue?.regimenId).toBe('daily');
    expect(Math.round(mostOverdue!.hoursOverdue)).toBe(6);
  });

  it('picks the MOST overdue and the SOONEST due-today', () => {
    const { mostOverdue, mostUrgentToday } = computeDoseUrgency(
      [
        { id: 'a', medication_name: 'A', medication_category: 'hrt', started_at: inHours(-40) },
        { id: 'b', medication_name: 'B', medication_category: 'hrt', started_at: inHours(-30) },
        { id: 'c', medication_name: 'C', medication_category: 'hrt', started_at: inHours(-20) },
      ],
      [],
      NOW,
    );
    expect(mostOverdue?.regimenId).toBe('a');   // 16h overdue beats 6h
    expect(mostUrgentToday?.regimenId).toBe('c'); // due in 4h
  });
});

describe('HRT step eligibility', () => {
  const hrt = (over: Partial<FocusInputs['hrt']>): FocusInputs['hrt'] => ({
    step: 'uncommitted', missedDays: 0, appointmentAt: null,
    pastObstacles: [], markerSetToday: false, todayKeyET: '2026-07-15',
    ...over,
  });

  it('due when uncommitted', () => expect(hrtStepDue(hrt({}), NOW)).toBe(true));
  it('terminal (adherent) never due', () => expect(hrtStepDue(hrt({ step: 'adherent' }), NOW)).toBe(false));
  it('waiting on a future consult suppresses', () => {
    expect(hrtStepDue(hrt({ step: 'appointment_booked', appointmentAt: inHours(48) }), NOW)).toBe(false);
    expect(hrtStepDue(hrt({ step: 'appointment_booked', appointmentAt: inHours(-1) }), NOW)).toBe(true);
  });
  it('satisfied today via marker or same-day obstacle', () => {
    expect(hrtStepDue(hrt({ markerSetToday: true }), NOW)).toBe(false);
    expect(hrtStepDue(hrt({ pastObstacles: [{ obstacle_date: '2026-07-15' }] }), NOW)).toBe(false);
    expect(hrtStepDue(hrt({ pastObstacles: [{ obstacle_date: '2026-07-14' }] }), NOW)).toBe(true);
  });
});

describe('fem prescription rotation', () => {
  const rows = [
    { id: 'f1', domain: 'voice', instruction: 'a', intensity: 3, duration: null, evidence_kind: 'none', deadline: null, requires: null },
    { id: 'f2', domain: 'posture', instruction: 'b', intensity: 2, duration: null, evidence_kind: 'none', deadline: null, requires: null },
  ];
  it('rotates away from the last-completed domain', () => {
    expect(pickFemPrescription(rows, 'voice')?.id).toBe('f2');
    expect(pickFemPrescription(rows, 'posture')?.id).toBe('f1');
    expect(pickFemPrescription(rows, null)?.id).toBe('f1');
  });
  it('falls back to the first row when everything matches the last domain', () => {
    expect(pickFemPrescription([rows[0]], 'voice')?.id).toBe('f1');
  });
});

describe('body-program decrees route to the workout logging surface', () => {
  const bpDecree = (id: string) => ({ ...decree(id), trigger_source: 'body_program_train' });

  it("Mama's daily pick for a training day opens the set logger", () => {
    const t = chooseFocusTask(base({ focusDecree: bpDecree('bp') }), NOW);
    expect(t.kind).toBe('focus_decree');
    expect(t.surface).toBe('workout_session');
  });

  it('an overdue training decree is critical AND routes to the logger', () => {
    const past = { ...bpDecree('bp'), deadline: inHours(-3) };
    const t = chooseFocusTask(base({ overdueDecree: past }), NOW);
    expect(t.kind).toBe('overdue_decree');
    expect(t.tone).toBe('critical');
    expect(t.surface).toBe('workout_session');
  });

  it('a due-today training decree routes to the logger', () => {
    const t = chooseFocusTask(base({ todayDecree: bpDecree('bp') }), NOW);
    expect(t.kind).toBe('due_today_decree');
    expect(t.surface).toBe('workout_session');
  });

  it('a normal (non-body) decree keeps its usual surface', () => {
    expect(chooseFocusTask(base({ focusDecree: decree('d') }), NOW).surface).toBe('decree');
    expect(chooseFocusTask(base({ overdueDecree: { ...decree('d'), deadline: inHours(-3) } }), NOW).surface).toBe('mark_done');
  });
});
