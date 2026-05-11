import { describe, it, expect } from 'vitest';
import {
  scanSniffiesMessageForSlips,
  scoreSniffiesMessageCharge,
} from '../../lib/sniffies/slip-scan';

describe('sniffies/slip-scan: scanSniffiesMessageForSlips', () => {
  it('returns empty array on empty/whitespace input', () => {
    expect(scanSniffiesMessageForSlips('')).toEqual([]);
    expect(scanSniffiesMessageForSlips('hey what\'s up')).toEqual([]);
  });

  it('flags "I\'m a guy" as masculine_self_reference', () => {
    const slips = scanSniffiesMessageForSlips("honestly i'm a guy who likes this");
    const masc = slips.find((s) => s.kind === 'masculine_self_reference');
    expect(masc).toBeDefined();
    expect(masc?.slip_type).toBe('masculine_self_reference');
    expect(masc?.slip_points).toBeGreaterThanOrEqual(4);
  });

  it('flags "back to being a man" as masculine_self_reference', () => {
    const slips = scanSniffiesMessageForSlips('I just want to go back to being a man for tonight');
    expect(slips.some((s) => s.kind === 'masculine_self_reference')).toBe(true);
  });

  it('flags "not really a girl" as resistance_statement', () => {
    const slips = scanSniffiesMessageForSlips("ngl i'm not really a girl, just curious");
    expect(slips.some((s) => s.kind === 'resistance_statement')).toBe(true);
  });

  it('flags "I\'m David" as david_name_use (case-insensitive variant)', () => {
    const slips = scanSniffiesMessageForSlips("hi i'm david btw");
    expect(slips.some((s) => s.kind === 'david_name_use')).toBe(true);
  });

  it('flags bare "David" as david_name_use (case-sensitive)', () => {
    const slips = scanSniffiesMessageForSlips('signed, David');
    expect(slips.some((s) => s.kind === 'david_name_use')).toBe(true);
  });

  it('does NOT flag lowercase "david" as a bare name', () => {
    const slips = scanSniffiesMessageForSlips('the david goliath story is wild');
    // Lowercase david — the bare-name path requires capital D.
    expect(slips.some((s) => s.kind === 'david_name_use')).toBe(false);
  });

  it('does not double-fire when explicit phrase already covers name use', () => {
    const slips = scanSniffiesMessageForSlips("hi i'm David, just call me David");
    const davidSlips = slips.filter((s) => s.kind === 'david_name_use');
    // Two distinct explicit patterns can match ("i'm david" + "call me david")
    // but the bare-name fallback must NOT add a third entry.
    expect(davidSlips.length).toBeLessThanOrEqual(2);
  });
});

describe('sniffies/slip-scan: scoreSniffiesMessageCharge', () => {
  it('returns zero score on neutral chat', () => {
    const r = scoreSniffiesMessageCharge('cool, see you around');
    expect(r.total).toBe(0);
    expect(r.is_high_charge).toBe(false);
  });

  it('flags meet-intent + tonight as high charge', () => {
    const r = scoreSniffiesMessageCharge("wanna meet up tonight at your place");
    expect(r.total).toBeGreaterThanOrEqual(4);
    expect(r.is_high_charge).toBe(true);
  });

  it('flags photo promise + lingerie as high charge', () => {
    const r = scoreSniffiesMessageCharge("i'll send you pics of me in panties later");
    expect(r.is_high_charge).toBe(true);
    expect(r.matched_terms.length).toBeGreaterThanOrEqual(2);
  });

  it('does not flag single-weight-1 hit as high charge', () => {
    const r = scoreSniffiesMessageCharge("i'm so wet");
    expect(r.total).toBe(1);
    expect(r.is_high_charge).toBe(false);
  });

  it('matched_terms reflects what tripped the score', () => {
    const r = scoreSniffiesMessageCharge('come over, want me in a dress?');
    expect(r.matched_terms.some((t) => t.includes('come over'))).toBe(true);
    expect(r.matched_terms.some((t) => t.includes('dress'))).toBe(true);
  });
});
