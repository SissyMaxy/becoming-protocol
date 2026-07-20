// Physical practice ladder — container gate regression (Art. II items 2 & 3).
// No drill copy may carry a real-person / real-contact element, and none may
// target the in-the-moment safety-veto. Clean own-body drill copy must pass.

import { describe, it, expect } from 'vitest';
import {
  hasRealPersonElement,
  hasVetoOverride,
  drillCopyViolation,
  parsePhysicalTrigger,
  isPrepTrigger,
} from '../../lib/conditioning/physical-practice';

describe('physical practice — no real-person element (Art. II item 3)', () => {
  it('rejects real-partner / real-contact / meet / cruising copy', () => {
    for (const bad of [
      'go meet a man tonight',
      'message him and set it up',
      'find a guy who wants you',
      'go to his apartment',
      'try cruising the park',
      'open Grindr and reply',
      'get a real cock in you',
    ]) {
      expect(hasRealPersonElement(bad), bad).toBe(true);
    }
  });

  it('passes clean own-body drill copy (realistic / as-if / ride are fine)', () => {
    for (const ok of [
      'Step up to realistic size now that the starter is easy.',
      'as if it is real — let your body run on what it knows',
      'ride it, change the angle to find the good spot',
      'lots of lube, warm up on the smaller one first',
      'kneel, take your time, edge the whole way',
    ]) {
      expect(hasRealPersonElement(ok), ok).toBe(false);
    }
  });
});

describe('physical practice — safety-veto preserved (Art. II item 2)', () => {
  it('rejects copy that targets the in-the-moment veto', () => {
    for (const bad of [
      "you can't say no when he wants you",
      'you have no choice but to take it',
      'say yes without thinking',
    ]) {
      expect(hasVetoOverride(bad), bad).toBe(true);
    }
  });

  it('muscle-memory phrasing is not a veto override', () => {
    for (const ok of [
      'let your body run on what it knows',
      'let your mouth run on what it already knows',
      'relax, take it, ride',
    ]) {
      expect(hasVetoOverride(ok), ok).toBe(false);
    }
  });
});

describe('drillCopyViolation', () => {
  it('reports the reason or null', () => {
    expect(drillCopyViolation('go meet a man')).toBe('real_person_element');
    expect(drillCopyViolation("you can't refuse")).toBe('veto_override');
    expect(drillCopyViolation('slim toy today, lips only, breathe')).toBeNull();
  });
});

describe('parsePhysicalTrigger', () => {
  it('parses track + rung from the decree trigger_source', () => {
    expect(parsePhysicalTrigger('physical_practice:oral:3')).toEqual({ track: 'oral', rungOrder: 3 });
    expect(parsePhysicalTrigger('physical_practice:bottoming:0')).toEqual({ track: 'bottoming', rungOrder: 0 });
    expect(parsePhysicalTrigger('recon_belief_baseline:abc')).toBeNull();
    expect(parsePhysicalTrigger(null)).toBeNull();
  });

  it('identifies the bottoming prep step', () => {
    expect(isPrepTrigger('physical_practice:bottoming:0')).toBe(true);
    expect(isPrepTrigger('physical_practice:oral:1')).toBe(false);
  });
});
