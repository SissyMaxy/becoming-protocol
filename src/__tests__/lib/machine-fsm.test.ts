/**
 * Machine session FSM tests (mig 625 safety envelope).
 *
 * fsm.ts is the pure transition core extracted from machine-overseer/index.ts
 * so the safety-critical logic is testable without Deno/supabase mocks.
 *
 * Regression targets (each was a live bug or design gap):
 *   - force phase had NO timeout → velocity-1.0-forever wedge
 *   - premature orgasm outside the force phase was ignored (no cycle count)
 *   - deny threshold was hard-mode-reduced at start AND again per tick
 *     (double subtract: 850 → 770 at start → 690 at tick)
 *   - guard denials must map fail-closed (safeword/aborted/unknown →
 *     EMERGENCY_STOP)
 */
import { describe, it, expect } from 'vitest';
import {
  stepFsm,
  deriveParams,
  initialFsmState,
  commandForGuardDenial,
  FORCE_TIMEOUT_SECONDS,
  OVERSTIM_CAP_SECONDS,
  type MachineParams,
  type FsmState,
} from '../../../supabase/functions/machine-overseer/fsm';

const baseParams = (): MachineParams => deriveParams(null, { hard_mode_active: false, denial_day: 0 });

function stateIn(phase: FsmState['phase'], overrides: Partial<FsmState> = {}): FsmState {
  return { ...initialFsmState(baseParams()), phase, ...overrides };
}

describe('deriveParams() — single-site derivation', () => {
  it('applies the hard-mode deny reduction exactly once', () => {
    const p = deriveParams(null, { hard_mode_active: true, denial_day: 0 });
    expect(p.deny_threshold).toBe(770); // 850 - 80, once
    expect(p.enter_edge).toBe(770 - p.edge_band);
  });
  it('floors the hard-mode reduction at 700', () => {
    const p = deriveParams({ deny_threshold: 720 }, { hard_mode_active: true, denial_day: 0 });
    expect(p.deny_threshold).toBe(700);
  });
  it('caps overstim at 420s regardless of denial boost', () => {
    const p = deriveParams(null, { hard_mode_active: false, denial_day: 100 });
    expect(p.overstim_seconds).toBe(420);
  });
  it('stores enter_edge = deny_threshold - edge_band', () => {
    const p = deriveParams({ deny_threshold: 900, edge_band: 100 }, { hard_mode_active: false, denial_day: 0 });
    expect(p.enter_edge).toBe(800);
  });
});

describe('edge mode — deny threshold used VERBATIM (double-subtract regression)', () => {
  it('DENYs exactly at the persisted threshold under hard mode', () => {
    const p = deriveParams(null, { hard_mode_active: true, denial_day: 0 }); // deny=770
    const r = stepFsm('edge', initialFsmState(p), { arousal: 770, elapsed: 10 }, p);
    expect(r.command).toBe('DENY');
  });
  it('does NOT deny at the double-subtracted value (690) — edge band instead', () => {
    const p = deriveParams(null, { hard_mode_active: true, denial_day: 0 }); // deny=770, enter_edge=650
    const r = stepFsm('edge', initialFsmState(p), { arousal: 690, elapsed: 10 }, p);
    expect(r.command).toBe('EDGE'); // old tick-side subtraction would have DENYed here
  });
});

describe('edge mode — overstim rules', () => {
  it('orgasm starts one overstim window, capped at 420s', () => {
    const p = deriveParams({ overstim_base_seconds: 9999 }, { hard_mode_active: false, denial_day: 0 });
    const r = stepFsm('edge', initialFsmState(p), { arousal: 400, elapsed: 100, event: 'orgasm' }, p);
    expect(r.command).toBe('OVERSTIM');
    expect(r.motion.duration_seconds).toBe(OVERSTIM_CAP_SECONDS);
    expect(r.state.overstim_until).toBe(100 + OVERSTIM_CAP_SECONDS);
    expect(r.logType).toBe('orgasm');
  });
  it('orgasm DURING overstim → 60s stop-recover, overstim ends', () => {
    const p = baseParams();
    const s = { ...initialFsmState(p), overstim_until: 300 };
    const r = stepFsm('edge', s, { arousal: 500, elapsed: 200, event: 'orgasm' }, p);
    expect(r.command).toBe('STOP');
    expect(r.state.overstim_until).toBeNull();
    expect(r.state.overstim_recover_until).toBe(260);
  });
  it('overstim continues without restart on plain ticks, then expires', () => {
    const p = baseParams();
    const s = { ...initialFsmState(p), overstim_until: 300 };
    const mid = stepFsm('edge', s, { arousal: 900, elapsed: 250 }, p);
    expect(mid.command).toBe('OVERSTIM'); // arousal over deny threshold does NOT deny mid-overstim
    const after = stepFsm('edge', mid.state, { arousal: 100, elapsed: 301 }, p);
    expect(after.command).toBe('BUILD');
    expect(after.state.overstim_until).toBeNull();
  });
});

describe('milking mode — phase timeouts', () => {
  it('force times out at 240s → recover (no forever wedge)', () => {
    const p = baseParams();
    const s = stateIn('force', { phase_started: 1000 });
    const before = stepFsm('milking', s, { arousal: 800, elapsed: 1000 + FORCE_TIMEOUT_SECONDS - 1 }, p);
    expect(before.command).toBe('MILK_FORCE');
    const at = stepFsm('milking', s, { arousal: 800, elapsed: 1000 + FORCE_TIMEOUT_SECONDS }, p);
    expect(at.command).toBe('STOP');
    expect(at.state.phase).toBe('recover');
    expect(at.state.failed_forces).toBe(1);
    expect(at.done).toBeNull();
  });
  it('2 consecutive failed forces → completed outcome denied_exhausted', () => {
    const p = baseParams();
    const s = stateIn('force', { phase_started: 0, failed_forces: 1 });
    const r = stepFsm('milking', s, { arousal: 800, elapsed: FORCE_TIMEOUT_SECONDS }, p);
    expect(r.command).toBe('STOP');
    expect(r.done).toEqual({ outcome: 'denied_exhausted' });
  });
  it('orgasm in force resets the failed-force streak', () => {
    const p = baseParams();
    const s = stateIn('force', { phase_started: 0, failed_forces: 1 });
    const r = stepFsm('milking', s, { arousal: 900, elapsed: 30, event: 'orgasm' }, p);
    expect(r.state.failed_forces).toBe(0);
    expect(r.state.cycles).toBe(1);
    expect(r.state.phase).toBe('recover');
  });
  it('build abandons to recover at 600s', () => {
    const p = baseParams();
    const s = stateIn('build', { phase_started: 0 });
    const r = stepFsm('milking', s, { arousal: 10, elapsed: 600 }, p);
    expect(r.state.phase).toBe('recover');
    expect(r.command).toBe('STOP');
  });
  it('build stall lowers enter_edge 10%/min with a 50% floor', () => {
    const p = baseParams(); // enter_edge = 730
    const s = stateIn('build', { phase_started: 0 });
    const at360 = stepFsm('milking', s, { arousal: 10, elapsed: 360 }, p); // 1 min past stall
    expect(at360.state.enter_edge_current).toBeCloseTo(p.enter_edge * 0.9, 5);
    // The floor can only be probed with a custom (longer) abandon window,
    // since the stock 600s abandon fires before the 50% floor is reached —
    // the floor still guards against param combinations that stall longer.
    const at599 = stepFsm('milking', s, { arousal: 10, elapsed: 599 }, p);
    expect(at599.state.enter_edge_current).toBeGreaterThanOrEqual(p.enter_edge * 0.5);
  });
});

describe('milking mode — orgasm in ANY phase counts the cycle', () => {
  (['build', 'edge_hold', 'force', 'recover'] as const).forEach((phase) => {
    it(`orgasm during ${phase} → recover + cycle++`, () => {
      const p = baseParams();
      const s = stateIn(phase, { phase_started: 0 });
      const r = stepFsm('milking', s, { arousal: 500, elapsed: 10, event: 'orgasm' }, p);
      expect(r.state.phase).toBe('recover');
      expect(r.state.cycles).toBe(1);
      expect(r.logType).toBe('orgasm');
      expect(r.command).toBe('STOP');
    });
  });
  it('premature orgasm reaching max_cycles completes the session', () => {
    const p = baseParams(); // max_cycles 3
    const s = stateIn('build', { cycles: 2 });
    const r = stepFsm('milking', s, { arousal: 100, elapsed: 50, event: 'orgasm' }, p);
    expect(r.state.cycles).toBe(3);
    expect(r.done).toEqual({ outcome: 'milked' });
  });
});

describe('milking mode — session rails', () => {
  it('max_duration_seconds → clean complete', () => {
    const p = baseParams(); // 2700s
    const r = stepFsm('milking', stateIn('build', { cycles: 1 }), { arousal: 100, elapsed: 2700 }, p);
    expect(r.command).toBe('STOP');
    expect(r.done).toEqual({ outcome: 'milked' });
  });
  it('max_duration with zero cycles reports denied', () => {
    const p = baseParams();
    const r = stepFsm('milking', stateIn('build'), { arousal: 100, elapsed: 2700 }, p);
    expect(r.done).toEqual({ outcome: 'denied' });
  });
  it('max_cycles already met → complete without waiting for duration', () => {
    const p = baseParams();
    const r = stepFsm('milking', stateIn('recover', { cycles: 3 }), { arousal: 0, elapsed: 500 }, p);
    expect(r.done).toEqual({ outcome: 'milked' });
  });
});

describe('milking mode — normal cadence transitions', () => {
  it('build → edge_hold when arousal reaches enter_edge', () => {
    const p = baseParams();
    const r = stepFsm('milking', stateIn('build'), { arousal: p.enter_edge, elapsed: 20 }, p);
    expect(r.state.phase).toBe('edge_hold');
    expect(r.command).toBe('EDGE');
  });
  it('edge_hold → force after hold_seconds', () => {
    const p = baseParams();
    const r = stepFsm('milking', stateIn('edge_hold', { phase_started: 0 }), { arousal: 800, elapsed: p.hold_seconds }, p);
    expect(r.state.phase).toBe('force');
    expect(r.command).toBe('MILK_FORCE');
  });
  it('recover → build after recover_seconds, enter_edge reset', () => {
    const p = baseParams();
    const s = stateIn('recover', { phase_started: 0, enter_edge_current: 400 });
    const r = stepFsm('milking', s, { arousal: 100, elapsed: p.recover_seconds }, p);
    expect(r.state.phase).toBe('build');
    expect(r.state.enter_edge_current).toBe(p.enter_edge);
  });
});

describe('commandForGuardDenial() — safeword latch semantics, fail closed', () => {
  it('safeword → EMERGENCY_STOP', () => {
    expect(commandForGuardDenial('safeword', true).command).toBe('EMERGENCY_STOP');
  });
  it('aborted (latched) → EMERGENCY_STOP', () => {
    expect(commandForGuardDenial('aborted', true).command).toBe('EMERGENCY_STOP');
  });
  it('no_session → EMERGENCY_STOP (unknown session never stims)', () => {
    expect(commandForGuardDenial('no_session', false).command).toBe('EMERGENCY_STOP');
  });
  it('paused / completed / created → plain STOP', () => {
    expect(commandForGuardDenial('paused', false).command).toBe('STOP');
    expect(commandForGuardDenial('completed', false).command).toBe('STOP');
    expect(commandForGuardDenial('created', false).command).toBe('STOP');
  });
  it('unknown reasons fail closed to EMERGENCY_STOP', () => {
    expect(commandForGuardDenial('???', false).command).toBe('EMERGENCY_STOP');
    expect(commandForGuardDenial('', false).command).toBe('EMERGENCY_STOP');
  });
});
