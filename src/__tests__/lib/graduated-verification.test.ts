// Graduated verification spine (mig 707) — the app stops treating a tap as proof.
//
// Core invariants: verification is computed server-side (unfakeable), an
// unverified self-report never sets the target baseline or moves its value,
// and the registry counts only verified points as efficacy evidence — while a
// completion is still NEVER blocked (container rule: no penalty for a tap).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const SQL = readFileSync('supabase/migrations/707_graduated_verification_spine.sql', 'utf8');

describe('verify_session_witness — the unfakeable check', () => {
  it('requires a device command that actually reached the device (not offline)', () => {
    expect(SQL).toMatch(/event_type <> 'device_offline'/);
    expect(SQL).toContain("RETURN 'device_verified'");
  });
  it('accepts a Whoop session as the wrist witness', () => {
    expect(SQL).toContain("RETURN 'wrist_verified'");
    expect(SQL).toContain('FROM whoop_workouts');
  });
  it('defaults to self_reported when no witness trail exists', () => {
    expect(SQL).toContain("RETURN 'self_reported'");
  });
});

describe('closeness trigger — unverified never becomes evidence', () => {
  it('only a VERIFIED first point can set the baseline', () => {
    // is_baseline true only when verified AND no verified baseline yet.
    expect(SQL).toMatch(/v_verif <> 'self_reported' AND NOT v_has_verified_baseline/);
  });
  it('only verified points move the target authoritative value', () => {
    expect(SQL).toMatch(/IF v_verif <> 'self_reported' THEN[\s\S]{0,400}UPDATE reconditioning_targets/);
  });
  it('records EVERY point (self-report is history for the user), tagged with verification', () => {
    expect(SQL).toMatch(/INSERT INTO recon_measurements[\s\S]{0,300}'verification', v_verif/);
  });
  it('never blocks the insert — a tap always completes (container rule)', () => {
    // The trigger returns NEW unconditionally; there is no RAISE EXCEPTION path.
    expect(SQL).not.toMatch(/RAISE EXCEPTION/);
    expect((SQL.match(/RETURN NEW;/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});

describe('registry — efficacy counts verified only', () => {
  it('splits verified (efficacy) from self-reported (adherence)', () => {
    expect(SQL).toMatch(/count\(\*\) FILTER \(WHERE COALESCE\(raw->>'verification','self_reported'\) <> 'self_reported'\)/);
    expect(SQL).toMatch(/count\(\*\) FILTER \(WHERE COALESCE\(raw->>'verification','self_reported'\) = 'self_reported'\)/);
  });
  it('self-reported-only sessions verdict as adherence_limited, never as working/flat', () => {
    expect(SQL).toMatch(/self-reported sessions but ZERO verified/);
    expect(SQL).toContain("v_verdict := 'adherence_limited'");
  });
});
