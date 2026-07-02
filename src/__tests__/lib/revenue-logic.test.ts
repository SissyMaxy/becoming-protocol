// Revenue ladder v2 pure logic (mig 631-633 train, DESIGN_TURNING_OUT §4).
// Pins the two audit bugs: fabricated money claims and tasks issued past
// unmet account prerequisites.
import { describe, it, expect } from 'vitest';
import {
  resolveRung,
  selectTasks,
  moneyClaimGuard,
  extractDollarAmounts,
  buildNeedLine,
  RUNG_ALL_MET,
  type RungEvidence,
} from '../../../supabase/functions/revenue-task-generator/logic.ts';

const noEvidence: RungEvidence = {
  wishlist: false, postingAccount: false, firstPost: false, firstSale: false,
} as RungEvidence;

describe('resolveRung — prerequisite chain from evidence only', () => {
  it('no evidence → rung 0 (wishlist is the first ask)', () => {
    expect(resolveRung(noEvidence)).toBe(0);
  });
  it('wishlist only → rung 1 (posting account is the gate)', () => {
    expect(resolveRung({ ...noEvidence, wishlist: true })).toBe(1);
  });
  it('account without a post → rung 2', () => {
    expect(resolveRung({ ...noEvidence, wishlist: true, postingAccount: true })).toBe(2);
  });
  it('post without a sale → rung 3', () => {
    expect(resolveRung({ ...noEvidence, wishlist: true, postingAccount: true, firstPost: true })).toBe(3);
  });
  it('all evidence → RUNG_ALL_MET', () => {
    expect(resolveRung({ wishlist: true, postingAccount: true, firstPost: true, firstSale: true } as RungEvidence)).toBe(RUNG_ALL_MET);
  });
});

describe('selectTasks — never issue past an unmet prerequisite', () => {
  const tasks = [
    { source: 'revenue_setup_wishlist', requiresRung: 0, acquisitionFor: 0 },
    { source: 'revenue_setup_fansly', requiresRung: 1, acquisitionFor: 1 },
    { source: 'revenue_first_clip', requiresRung: 2, acquisitionFor: 2 },
    { source: 'revenue_ppv_clip', requiresRung: 3, acquisitionFor: 3 },
    { source: 'revenue_fan_dm', requiresRung: 2 },
    { source: 'revenue_cam_session', requiresRung: 4 },
    { source: 'revenue_log', requiresRung: 2 },
  ];
  it('no account → ONLY the account acquisition task; cam/DM/PPV unreachable', () => {
    const picked = selectTasks(tasks, 1).map((t) => t.source);
    expect(picked).toEqual(['revenue_setup_fansly']);
  });
  it('account + post + sale (all met) → maintenance tasks fire, no acquisition asks', () => {
    const picked = selectTasks(tasks, RUNG_ALL_MET).map((t) => t.source);
    expect(picked).toContain('revenue_fan_dm');
    expect(picked).toContain('revenue_cam_session');
    expect(picked).not.toContain('revenue_setup_fansly');
  });
});

describe('moneyClaimGuard — every $ traces to a row or authored template', () => {
  it('passes amounts from allowedCents and the authored template', () => {
    const r = moneyClaimGuard(
      'You earned $38.00 this week. The $163.54 vial is still owed. Menu price: $15.',
      'Menu price: $15.',
      [3800, 16354],
    );
    expect(r.ok).toBe(true);
    expect(r.violations).toEqual([]);
  });
  it('strips a fabricated amount and reports the violation', () => {
    const r = moneyClaimGuard('Mommy says you owe $999 by Friday.', '', [16354]);
    expect(r.ok).toBe(false);
    expect(r.violations).toEqual(['$999']);
    expect(r.copy).not.toContain('$999');
  });
  it('extractDollarAmounts handles commas and cents', () => {
    expect(extractDollarAmounts('need $1,200.50 and $7')).toEqual(['1200.50', '7']);
  });
});

describe('buildNeedLine — honest zero, never a fake countdown', () => {
  it('zero rows → states nothing earned, never claims a sum', () => {
    const line = buildNeedLine({
      earnedCents: 0, earnedRows: 0, targetCents: 20000,
      obligation: { label: 'Folx estradiol valerate vial (90-day)', amountCents: 16354, dueOn: '2026-06-27', fundedCents: 0 },
      today: new Date('2026-07-02T12:00:00Z'),
    });
    expect(line.toLowerCase()).toMatch(/nothing|no .*logged|still/);
    expect(line).not.toMatch(/\$0\.01|\$\d+ earned/);
  });
  it('past-due obligation reads as past due, not a countdown', () => {
    const line = buildNeedLine({
      earnedCents: 3800, earnedRows: 2, targetCents: 20000,
      obligation: { label: 'Folx estradiol valerate vial (90-day)', amountCents: 16354, dueOn: '2026-06-27', fundedCents: 0 },
      today: new Date('2026-07-02T12:00:00Z'),
    });
    expect(line).toMatch(/past due|overdue|late/i);
    expect(line).not.toMatch(/0 days left/);
  });
});
