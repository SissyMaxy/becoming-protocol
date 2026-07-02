/**
 * HRT dose photo-evidence grading + adherence.
 *
 * Verify-don't-trust on the transition ladder:
 *   - photo present + novel hash  → verified (counts as full adherence)
 *   - no photo                    → unverified (allowed, self-report only)
 *   - photo hash reused           → duplicate (anti-gaming: rejected)
 *   - adherence counts verified separately from self-report, and never
 *     claims a dose that has no row (no-fabrication).
 */

import { describe, it, expect } from 'vitest';
import {
  gradeDoseEvidence,
  computeAdherence,
  describeAdherence,
  type DoseRow,
} from '../../lib/hrt/dose-evidence';

describe('gradeDoseEvidence', () => {
  it('verifies a dose with a present, novel photo', () => {
    const r = gradeDoseEvidence({
      photoPath: 'uid/hrt-dose/abc.jpg',
      sha256: 'a'.repeat(64),
      recentHashes: ['b'.repeat(64)],
    });
    expect(r.verified).toBe(true);
    expect(r.grade).toBe('verified');
  });

  it('marks a dose unverified when no photo is captured', () => {
    const r = gradeDoseEvidence({ photoPath: null, sha256: null, recentHashes: [] });
    expect(r.verified).toBe(false);
    expect(r.grade).toBe('unverified');
  });

  it('marks unverified when a path exists but the hash is missing', () => {
    const r = gradeDoseEvidence({ photoPath: 'uid/x.jpg', sha256: '', recentHashes: [] });
    expect(r.verified).toBe(false);
    expect(r.grade).toBe('unverified');
  });

  it('rejects a reused photo as duplicate (same picture cannot verify two doses)', () => {
    const hash = 'c'.repeat(64);
    const r = gradeDoseEvidence({
      photoPath: 'uid/hrt-dose/dup.jpg',
      sha256: hash,
      recentHashes: [hash, 'd'.repeat(64)],
    });
    expect(r.verified).toBe(false);
    expect(r.grade).toBe('duplicate');
  });

  it('dedup is case-insensitive on the hash', () => {
    const r = gradeDoseEvidence({
      photoPath: 'uid/x.jpg',
      sha256: 'ABC123',
      recentHashes: ['abc123'],
    });
    expect(r.grade).toBe('duplicate');
  });

  it('accepts a Set of recent hashes', () => {
    const r = gradeDoseEvidence({
      photoPath: 'uid/x.jpg',
      sha256: 'e'.repeat(64),
      recentHashes: new Set(['f'.repeat(64)]),
    });
    expect(r.verified).toBe(true);
  });
});

describe('computeAdherence', () => {
  it('counts verified and self-reported doses separately', () => {
    const doses: DoseRow[] = [
      { dose_taken_at: '2026-07-01T10:00:00Z', skipped: false, evidence_verified: true },
      { dose_taken_at: '2026-07-02T10:00:00Z', skipped: false, evidence_verified: true },
      { dose_taken_at: '2026-07-03T10:00:00Z', skipped: false, evidence_verified: false },
      { dose_taken_at: null, skipped: true, evidence_verified: false },
    ];
    const a = computeAdherence(doses);
    expect(a.takenVerified).toBe(2);
    expect(a.takenUnverified).toBe(1);
    expect(a.skipped).toBe(1);
    expect(a.totalTaken).toBe(3);
    expect(a.total).toBe(4);
    expect(a.verifiedRatio).toBeCloseTo(2 / 3);
  });

  it('treats a missing evidence_verified as self-report (never fabricates verification)', () => {
    const doses: DoseRow[] = [
      { dose_taken_at: '2026-07-01T10:00:00Z', skipped: false },
    ];
    const a = computeAdherence(doses);
    expect(a.takenVerified).toBe(0);
    expect(a.takenUnverified).toBe(1);
  });

  it('a skipped dose is neither taken nor verified', () => {
    const doses: DoseRow[] = [
      { dose_taken_at: null, skipped: true, evidence_verified: false },
    ];
    const a = computeAdherence(doses);
    expect(a.totalTaken).toBe(0);
    expect(a.skipped).toBe(1);
    expect(a.verifiedRatio).toBe(0);
  });

  it('empty window yields all-zero adherence', () => {
    const a = computeAdherence([]);
    expect(a.total).toBe(0);
    expect(a.totalTaken).toBe(0);
    expect(a.verifiedRatio).toBe(0);
  });
});

describe('describeAdherence', () => {
  it('returns null when there are no dose rows (no rows, no claim)', () => {
    expect(describeAdherence(computeAdherence([]))).toBeNull();
  });

  it('calls adherence strong only when evidence is mostly verified', () => {
    const line = describeAdherence(computeAdherence([
      { dose_taken_at: 'x', skipped: false, evidence_verified: true },
      { dose_taken_at: 'x', skipped: false, evidence_verified: true },
      { dose_taken_at: 'x', skipped: false, evidence_verified: true },
      { dose_taken_at: 'x', skipped: false, evidence_verified: true },
      { dose_taken_at: 'x', skipped: false, evidence_verified: false },
    ]));
    expect(line).toContain('4 verified');
    expect(line).toContain('1 self-reported');
    expect(line).toContain('evidence is strong');
  });

  it('never calls all-self-reported adherence strong', () => {
    const line = describeAdherence(computeAdherence([
      { dose_taken_at: 'x', skipped: false, evidence_verified: false },
      { dose_taken_at: 'x', skipped: false, evidence_verified: false },
    ]));
    expect(line).toContain('0 verified');
    expect(line).toContain('none proven yet');
    expect(line).not.toContain('strong');
  });
});
