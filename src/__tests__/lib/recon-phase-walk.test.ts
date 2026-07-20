// Reconditioning phase-walk policy — the UNLOCK regression. Pins that programs
// advance through the early edges only when dwell + delivery (+ baseline / cadence
// timer + rep) conditions hold, so they actually reach the efficacy loop.
// Source: src/lib/conditioning/recon-phase-walk.ts (mirrors mig 681 recon_program_walk).

import { describe, it, expect } from 'vitest';
import {
  decidePhaseWalk,
  INDUCTION_DWELL_DAYS,
  INSTALL_DWELL_DAYS,
  type PhaseWalkInput,
} from '../../lib/conditioning/recon-phase-walk';

const base: PhaseWalkInput = {
  phase: 'induction',
  status: 'running',
  dwellDays: 10,
  inPhaseDeliveries: 5,
  hasBaseline: true,
  measureDue: false,
  reps: 0,
};

describe('phase-walk — induction→install', () => {
  it('advances once baseline + dwell + deliveries are met', () => {
    expect(decidePhaseWalk({ ...base, phase: 'induction' })).toBe('install');
  });
  it('holds without a baseline (honesty spine — cannot install cold)', () => {
    expect(decidePhaseWalk({ ...base, phase: 'induction', hasBaseline: false })).toBeNull();
  });
  it('holds before the induction dwell elapses', () => {
    expect(decidePhaseWalk({ ...base, phase: 'induction', dwellDays: INDUCTION_DWELL_DAYS - 1 })).toBeNull();
  });
  it('holds without enough in-phase deliveries', () => {
    expect(decidePhaseWalk({ ...base, phase: 'induction', inPhaseDeliveries: 1 })).toBeNull();
  });
});

describe('phase-walk — install→reinforce', () => {
  it('advances after the install dwell + deliveries', () => {
    expect(decidePhaseWalk({ ...base, phase: 'install' })).toBe('reinforce');
  });
  it('holds before the install dwell', () => {
    expect(decidePhaseWalk({ ...base, phase: 'install', dwellDays: INSTALL_DWELL_DAYS - 1 })).toBeNull();
  });
});

describe('phase-walk — reinforce/reconsolidate→measure (reclaimed cadence timer)', () => {
  it('advances to measure when the measure is due and a rep exists', () => {
    expect(decidePhaseWalk({ ...base, phase: 'reinforce', measureDue: true, reps: 3 })).toBe('measure');
    expect(decidePhaseWalk({ ...base, phase: 'reconsolidate', measureDue: true, reps: 1 })).toBe('measure');
  });
  it('holds until the measure is due', () => {
    expect(decidePhaseWalk({ ...base, phase: 'reinforce', measureDue: false, reps: 3 })).toBeNull();
  });
  it('holds if no rep has been graded (never measure cold)', () => {
    expect(decidePhaseWalk({ ...base, phase: 'reinforce', measureDue: true, reps: 0 })).toBeNull();
  });
});

describe('phase-walk — measure/retain are not driven here (efficacy-owned)', () => {
  it('never advances measure or retain', () => {
    expect(decidePhaseWalk({ ...base, phase: 'measure', measureDue: true, reps: 5 })).toBeNull();
    expect(decidePhaseWalk({ ...base, phase: 'retain' })).toBeNull();
  });
});

describe('phase-walk — gating', () => {
  it('never advances a non-running program', () => {
    expect(decidePhaseWalk({ ...base, phase: 'induction', status: 'paused' })).toBeNull();
    expect(decidePhaseWalk({ ...base, phase: 'install', status: 'retired' })).toBeNull();
  });
});
