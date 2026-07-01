/**
 * Machine biometric validator tests (mig 625 safety envelope).
 *
 * _shared/biometrics.ts is the SINGLE validator for the machine wire
 * contract — pure functions, no mocks needed.
 */
import { describe, it, expect } from 'vitest';
import {
  validArousal,
  canonArousal,
  toArousal10,
  toArousal5,
  validHr,
} from '../../../supabase/functions/_shared/biometrics';

describe('validArousal()', () => {
  it('accepts the 0..1000 wire band', () => {
    expect(validArousal(0)).toBe(0);
    expect(validArousal(850)).toBe(850);
    expect(validArousal(1000)).toBe(1000);
  });
  it('rejects out-of-band values', () => {
    expect(validArousal(-1)).toBeNull();
    expect(validArousal(1001)).toBeNull();
  });
  it('rejects non-finite and non-number values (never coerces)', () => {
    expect(validArousal(NaN)).toBeNull();
    expect(validArousal(Infinity)).toBeNull();
    expect(validArousal(-Infinity)).toBeNull();
    expect(validArousal(undefined)).toBeNull();
    expect(validArousal(null)).toBeNull();       // Number(null)=0 trap — must NOT become 0
    expect(validArousal('500')).toBeNull();      // strings are not wire numbers
    expect(validArousal('')).toBeNull();
    expect(validArousal({})).toBeNull();
  });
});

describe('canonArousal() — wire 0..1000 → canonical 0..10', () => {
  it('maps the band ends and midpoints', () => {
    expect(canonArousal(0)).toBe(0);
    expect(canonArousal(1000)).toBe(10);
    expect(canonArousal(500)).toBe(5);
    expect(canonArousal(850)).toBe(9); // 8.5 rounds up
  });
  it('is null on invalid wire values', () => {
    expect(canonArousal(NaN)).toBeNull();
    expect(canonArousal(-5)).toBeNull();
    expect(canonArousal(2000)).toBeNull();
    expect(canonArousal(undefined)).toBeNull();
  });
});

describe('toArousal10() / toArousal5()', () => {
  it('toArousal10 clamps to 0..10', () => {
    expect(toArousal10(-100)).toBe(0);
    expect(toArousal10(99999)).toBe(10);
    expect(toArousal10(340)).toBe(3);
  });
  it('toArousal5 clamps to the legacy 0..5 user_state scale (pre-mig-639)', () => {
    expect(toArousal5(0)).toBe(0);
    expect(toArousal5(1000)).toBe(5);
    expect(toArousal5(999999)).toBe(5); // never exceeds the DB CHECK 0..5
    expect(toArousal5(500)).toBe(3);    // round(500/200)=3 (2.5 rounds up)
  });
});

describe('validHr() — 30..220 band', () => {
  it('accepts the band inclusive', () => {
    expect(validHr(30)).toBe(30);
    expect(validHr(72)).toBe(72);
    expect(validHr(220)).toBe(220);
  });
  it('rejects below-band (sensor-off / emergency shapes)', () => {
    expect(validHr(29)).toBeNull();
    expect(validHr(0)).toBeNull();
    expect(validHr(-5)).toBeNull();
  });
  it('rejects above-band and garbage', () => {
    expect(validHr(221)).toBeNull();
    expect(validHr(NaN)).toBeNull();
    expect(validHr(Infinity)).toBeNull();
    expect(validHr(undefined)).toBeNull();
    expect(validHr(null)).toBeNull();
    expect(validHr('80')).toBeNull();
  });
});
