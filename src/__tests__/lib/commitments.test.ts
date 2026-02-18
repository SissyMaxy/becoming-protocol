// Tests for commitments.ts - Arousal-gated commitment management
import { describe, it, expect, vi } from 'vitest';
import {
  canMakeCommitment,
  getArousalCommitmentFraming,
  getPostCommitmentMessage,
} from '../../lib/commitments';
import {
  BINDING_LEVEL_INFO,
  COMMITMENT_TYPES,
  AROUSAL_VERIFICATION,
  type BindingLevel,
  type ArousalState,
  type ArousalGatedCommitment,
} from '../../types/commitments';

// Mock supabase
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: null, error: null })),
          order: vi.fn(() => Promise.resolve({ data: [], error: null })),
        })),
        order: vi.fn(() => ({
          order: vi.fn(() => Promise.resolve({ data: [], error: null })),
        })),
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: null, error: null })),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ data: null, error: null })),
      })),
    })),
    auth: {
      getUser: vi.fn(() => Promise.resolve({ data: { user: { id: 'test-user' } }, error: null })),
    },
  },
}));

describe('commitments', () => {
  // ============================================
  // BINDING_LEVEL_INFO
  // ============================================
  describe('BINDING_LEVEL_INFO', () => {
    it('should have 3 binding levels', () => {
      const levels = Object.keys(BINDING_LEVEL_INFO);
      expect(levels).toHaveLength(3);
      expect(levels).toEqual(['soft', 'hard', 'permanent']);
    });

    describe('soft binding level', () => {
      const soft = BINDING_LEVEL_INFO.soft;

      it('should have correct label', () => {
        expect(soft.label).toBe('Soft');
      });

      it('should be breakable', () => {
        expect(soft.canBreak).toBe(true);
      });

      it('should have minimal consequences', () => {
        expect(soft.breakConsequence).toContain('record');
      });

      it('should have a description', () => {
        expect(soft.description).toBeDefined();
        expect(soft.description.length).toBeGreaterThan(10);
      });
    });

    describe('hard binding level', () => {
      const hard = BINDING_LEVEL_INFO.hard;

      it('should have correct label', () => {
        expect(hard.label).toBe('Hard');
      });

      it('should be breakable', () => {
        expect(hard.canBreak).toBe(true);
      });

      it('should have significant consequences', () => {
        expect(hard.breakConsequence).toContain('decay');
        expect(hard.breakConsequence).toContain('streak');
      });

      it('should describe binding nature', () => {
        expect(hard.description).toContain('binding');
      });
    });

    describe('permanent binding level', () => {
      const permanent = BINDING_LEVEL_INFO.permanent;

      it('should have correct label', () => {
        expect(permanent.label).toBe('Permanent');
      });

      it('should NOT be breakable', () => {
        expect(permanent.canBreak).toBe(false);
      });

      it('should describe irrevocability', () => {
        expect(permanent.description.toLowerCase()).toContain('irrevocable');
      });

      it('should have consequence that cannot be broken', () => {
        expect(permanent.breakConsequence.toLowerCase()).toContain('cannot be broken');
      });
    });

    it('should have increasing severity from soft to permanent', () => {
      // soft < hard < permanent in terms of consequences
      expect(BINDING_LEVEL_INFO.soft.canBreak).toBe(true);
      expect(BINDING_LEVEL_INFO.hard.canBreak).toBe(true);
      expect(BINDING_LEVEL_INFO.permanent.canBreak).toBe(false);
    });
  });

  // ============================================
  // COMMITMENT_TYPES
  // ============================================
  describe('COMMITMENT_TYPES', () => {
    it('should have predefined commitment types', () => {
      expect(Object.keys(COMMITMENT_TYPES).length).toBeGreaterThan(0);
    });

    it('should include denial extension commitment', () => {
      expect(COMMITMENT_TYPES.extend_denial_7_days).toBeDefined();
      expect(COMMITMENT_TYPES.extend_denial_7_days.template).toContain('denial');
      expect(COMMITMENT_TYPES.extend_denial_7_days.template).toContain('7');
    });

    it('should include permanent chastity commitment', () => {
      expect(COMMITMENT_TYPES.accept_permanent_chastity_goal).toBeDefined();
      expect(COMMITMENT_TYPES.accept_permanent_chastity_goal.template).toContain('permanent');
    });

    it('should include commitments with variables', () => {
      expect(COMMITMENT_TYPES.schedule_disclosure.variables).toBeDefined();
      expect(COMMITMENT_TYPES.schedule_disclosure.variables).toContain('person');
      expect(COMMITMENT_TYPES.schedule_disclosure.variables).toContain('date');
    });

    it('should have templates for all types', () => {
      Object.values(COMMITMENT_TYPES).forEach(type => {
        expect(type.template).toBeDefined();
        expect(type.template.length).toBeGreaterThan(10);
      });
    });

    it('should include HRT research commitment', () => {
      expect(COMMITMENT_TYPES.hrt_research_commitment).toBeDefined();
      expect(COMMITMENT_TYPES.hrt_research_commitment.template).toContain('HRT');
    });

    it('should include wardrobe purge commitment', () => {
      expect(COMMITMENT_TYPES.wardrobe_purge).toBeDefined();
      expect(COMMITMENT_TYPES.wardrobe_purge.template).toContain('wardrobe');
    });

    it('should include name commitment', () => {
      expect(COMMITMENT_TYPES.name_commitment).toBeDefined();
      expect(COMMITMENT_TYPES.name_commitment.template).toContain('Maxy');
    });
  });

  // ============================================
  // AROUSAL_VERIFICATION
  // ============================================
  describe('AROUSAL_VERIFICATION', () => {
    it('should have 5 arousal states', () => {
      const states = Object.keys(AROUSAL_VERIFICATION);
      expect(states).toHaveLength(5);
    });

    it('should cover all arousal states', () => {
      const expectedStates: ArousalState[] = [
        'baseline', 'building', 'sweet_spot', 'overwhelming', 'subspace'
      ];
      expectedStates.forEach(state => {
        expect(AROUSAL_VERIFICATION[state]).toBeDefined();
      });
    });

    it('should describe baseline as calm', () => {
      expect(AROUSAL_VERIFICATION.baseline.toLowerCase()).toContain('calm');
    });

    it('should describe building arousal', () => {
      expect(AROUSAL_VERIFICATION.building.toLowerCase()).toContain('arousal');
      expect(AROUSAL_VERIFICATION.building.toLowerCase()).toContain('control');
    });

    it('should describe sweet_spot as ideal state', () => {
      expect(AROUSAL_VERIFICATION.sweet_spot.toLowerCase()).toContain('truth');
    });

    it('should describe overwhelming with binding language', () => {
      expect(AROUSAL_VERIFICATION.overwhelming.toLowerCase()).toContain('binding');
    });

    it('should describe subspace as surrender', () => {
      expect(AROUSAL_VERIFICATION.subspace.toLowerCase()).toContain('surrender');
    });
  });

  // ============================================
  // canMakeCommitment
  // ============================================
  describe('canMakeCommitment', () => {
    function createMockCommitment(overrides: Partial<ArousalGatedCommitment> = {}): ArousalGatedCommitment {
      return {
        id: 'test-commitment',
        commitmentType: 'test',
        description: 'Test commitment',
        requiresArousalState: ['sweet_spot', 'overwhelming'],
        requiresDenialDay: 3,
        requiresPhase: 2,
        bindingLevel: 'hard',
        active: true,
        ...overrides,
      };
    }

    describe('arousal state validation', () => {
      it('should allow commitment when arousal state matches', () => {
        const commitment = createMockCommitment({
          requiresArousalState: ['sweet_spot', 'overwhelming'],
        });
        const context = {
          arousalState: 'sweet_spot' as ArousalState,
          denialDay: 5,
          phase: 3,
        };

        const result = canMakeCommitment(commitment, context);
        expect(result.canMake).toBe(true);
      });

      it('should reject commitment when arousal state does not match', () => {
        const commitment = createMockCommitment({
          requiresArousalState: ['overwhelming', 'subspace'],
        });
        const context = {
          arousalState: 'baseline' as ArousalState,
          denialDay: 5,
          phase: 3,
        };

        const result = canMakeCommitment(commitment, context);
        expect(result.canMake).toBe(false);
        expect(result.reason).toContain('arousal state');
      });

      it('should show required states in rejection reason', () => {
        const commitment = createMockCommitment({
          requiresArousalState: ['overwhelming', 'subspace'],
        });
        const context = {
          arousalState: 'building' as ArousalState,
          denialDay: 5,
          phase: 3,
        };

        const result = canMakeCommitment(commitment, context);
        expect(result.reason).toContain('overwhelming');
        expect(result.reason).toContain('subspace');
        expect(result.reason).toContain('building');
      });
    });

    describe('denial day validation', () => {
      it('should allow commitment when denial day is sufficient', () => {
        const commitment = createMockCommitment({
          requiresDenialDay: 3,
          requiresArousalState: ['sweet_spot'],
        });
        const context = {
          arousalState: 'sweet_spot' as ArousalState,
          denialDay: 5,
          phase: 3,
        };

        const result = canMakeCommitment(commitment, context);
        expect(result.canMake).toBe(true);
      });

      it('should reject commitment when denial day is insufficient', () => {
        const commitment = createMockCommitment({
          requiresDenialDay: 7,
          requiresArousalState: ['sweet_spot'],
        });
        const context = {
          arousalState: 'sweet_spot' as ArousalState,
          denialDay: 3,
          phase: 3,
        };

        const result = canMakeCommitment(commitment, context);
        expect(result.canMake).toBe(false);
        expect(result.reason).toContain('denial day 7');
        expect(result.reason).toContain('day 3');
      });

      it('should allow commitment at exact denial day requirement', () => {
        const commitment = createMockCommitment({
          requiresDenialDay: 5,
          requiresArousalState: ['sweet_spot'],
        });
        const context = {
          arousalState: 'sweet_spot' as ArousalState,
          denialDay: 5,
          phase: 3,
        };

        const result = canMakeCommitment(commitment, context);
        expect(result.canMake).toBe(true);
      });
    });

    describe('phase validation', () => {
      it('should allow commitment when phase is sufficient', () => {
        const commitment = createMockCommitment({
          requiresPhase: 2,
          requiresArousalState: ['sweet_spot'],
        });
        const context = {
          arousalState: 'sweet_spot' as ArousalState,
          denialDay: 5,
          phase: 3,
        };

        const result = canMakeCommitment(commitment, context);
        expect(result.canMake).toBe(true);
      });

      it('should reject commitment when phase is insufficient', () => {
        const commitment = createMockCommitment({
          requiresPhase: 3,
          requiresArousalState: ['sweet_spot'],
        });
        const context = {
          arousalState: 'sweet_spot' as ArousalState,
          denialDay: 5,
          phase: 1,
        };

        const result = canMakeCommitment(commitment, context);
        expect(result.canMake).toBe(false);
        expect(result.reason).toContain('phase 3');
        expect(result.reason).toContain('phase 1');
      });
    });

    describe('combined validation', () => {
      it('should validate all requirements in order', () => {
        const commitment = createMockCommitment({
          requiresArousalState: ['subspace'],
          requiresDenialDay: 10,
          requiresPhase: 5,
        });

        // Fails arousal first
        const context1 = {
          arousalState: 'baseline' as ArousalState,
          denialDay: 1,
          phase: 1,
        };
        const result1 = canMakeCommitment(commitment, context1);
        expect(result1.canMake).toBe(false);
        expect(result1.reason).toContain('arousal');

        // Passes arousal, fails denial
        const context2 = {
          arousalState: 'subspace' as ArousalState,
          denialDay: 1,
          phase: 1,
        };
        const result2 = canMakeCommitment(commitment, context2);
        expect(result2.canMake).toBe(false);
        expect(result2.reason).toContain('denial');

        // Passes arousal and denial, fails phase
        const context3 = {
          arousalState: 'subspace' as ArousalState,
          denialDay: 15,
          phase: 1,
        };
        const result3 = canMakeCommitment(commitment, context3);
        expect(result3.canMake).toBe(false);
        expect(result3.reason).toContain('phase');

        // All pass
        const context4 = {
          arousalState: 'subspace' as ArousalState,
          denialDay: 15,
          phase: 6,
        };
        const result4 = canMakeCommitment(commitment, context4);
        expect(result4.canMake).toBe(true);
        expect(result4.reason).toBeUndefined();
      });
    });
  });

  // ============================================
  // getArousalCommitmentFraming
  // ============================================
  describe('getArousalCommitmentFraming', () => {
    it('should return framing for baseline', () => {
      const framing = getArousalCommitmentFraming('baseline');
      expect(framing).toContain('clearly');
    });

    it('should return framing for building', () => {
      const framing = getArousalCommitmentFraming('building');
      expect(framing).toContain('building');
    });

    it('should return framing for sweet_spot', () => {
      const framing = getArousalCommitmentFraming('sweet_spot');
      expect(framing).toContain('sweet spot');
      expect(framing.toLowerCase()).toContain('trust');
    });

    it('should return framing for overwhelming', () => {
      const framing = getArousalCommitmentFraming('overwhelming');
      expect(framing).toContain('overwhelmed');
      expect(framing.toLowerCase()).toContain('truth');
    });

    it('should return framing for subspace', () => {
      const framing = getArousalCommitmentFraming('subspace');
      expect(framing).toContain('surrendered');
    });

    it('should return distinct framings for each state', () => {
      const states: ArousalState[] = ['baseline', 'building', 'sweet_spot', 'overwhelming', 'subspace'];
      const framings = states.map(s => getArousalCommitmentFraming(s));

      const uniqueFramings = new Set(framings);
      expect(uniqueFramings.size).toBe(5);
    });
  });

  // ============================================
  // getPostCommitmentMessage
  // ============================================
  describe('getPostCommitmentMessage', () => {
    it('should return message for soft commitment', () => {
      const message = getPostCommitmentMessage('soft');
      expect(message).toContain('promise');
      expect(message.toLowerCase()).toContain('honor');
    });

    it('should return message for hard commitment', () => {
      const message = getPostCommitmentMessage('hard');
      expect(message).toContain('binding');
      expect(message).toContain('aroused');
    });

    it('should return message for permanent commitment', () => {
      const message = getPostCommitmentMessage('permanent');
      expect(message).toContain('permanent');
      expect(message.toLowerCase()).toContain('no going back');
    });

    it('should have increasing intensity from soft to permanent', () => {
      const soft = getPostCommitmentMessage('soft');
      getPostCommitmentMessage('hard');
      const permanent = getPostCommitmentMessage('permanent');

      // Permanent should be the longest and most intense
      expect(permanent.length).toBeGreaterThan(soft.length);

      // Permanent mentions irrevocability
      expect(permanent.toLowerCase()).toContain('no going back');
    });

    it('should return distinct messages for each level', () => {
      const levels: BindingLevel[] = ['soft', 'hard', 'permanent'];
      const messages = levels.map(l => getPostCommitmentMessage(l));

      const uniqueMessages = new Set(messages);
      expect(uniqueMessages.size).toBe(3);
    });
  });

  // ============================================
  // ArousalState type validation
  // ============================================
  describe('ArousalState type', () => {
    const arousalStates: ArousalState[] = [
      'baseline',
      'building',
      'sweet_spot',
      'overwhelming',
      'subspace',
    ];

    it('should have 5 arousal states', () => {
      expect(arousalStates).toHaveLength(5);
    });

    it('should have correct progression', () => {
      expect(arousalStates.indexOf('baseline')).toBe(0);
      expect(arousalStates.indexOf('building')).toBe(1);
      expect(arousalStates.indexOf('sweet_spot')).toBe(2);
      expect(arousalStates.indexOf('overwhelming')).toBe(3);
      expect(arousalStates.indexOf('subspace')).toBe(4);
    });
  });

  // ============================================
  // BindingLevel type validation
  // ============================================
  describe('BindingLevel type', () => {
    const bindingLevels: BindingLevel[] = ['soft', 'hard', 'permanent'];

    it('should have 3 binding levels', () => {
      expect(bindingLevels).toHaveLength(3);
    });

    it('should have correct progression', () => {
      expect(bindingLevels.indexOf('soft')).toBe(0);
      expect(bindingLevels.indexOf('hard')).toBe(1);
      expect(bindingLevels.indexOf('permanent')).toBe(2);
    });
  });

  // ============================================
  // Enforcement thresholds (testing the logic)
  // ============================================
  describe('enforcement threshold logic', () => {
    const ENFORCEMENT_THRESHOLDS: Record<BindingLevel, {
      needsAttentionDays: number;
      overdueDays: number;
      criticalDays: number;
    }> = {
      soft: {
        needsAttentionDays: 7,
        overdueDays: 14,
        criticalDays: 21,
      },
      hard: {
        needsAttentionDays: 3,
        overdueDays: 7,
        criticalDays: 10,
      },
      permanent: {
        needsAttentionDays: 1,
        overdueDays: 3,
        criticalDays: 5,
      },
    };

    it('should have stricter thresholds for higher binding levels', () => {
      const soft = ENFORCEMENT_THRESHOLDS.soft;
      const hard = ENFORCEMENT_THRESHOLDS.hard;
      const permanent = ENFORCEMENT_THRESHOLDS.permanent;

      // Permanent should have shortest thresholds
      expect(permanent.needsAttentionDays).toBeLessThan(hard.needsAttentionDays);
      expect(hard.needsAttentionDays).toBeLessThan(soft.needsAttentionDays);

      expect(permanent.criticalDays).toBeLessThan(hard.criticalDays);
      expect(hard.criticalDays).toBeLessThan(soft.criticalDays);
    });

    it('soft commitments should have longest grace period', () => {
      expect(ENFORCEMENT_THRESHOLDS.soft.needsAttentionDays).toBe(7);
      expect(ENFORCEMENT_THRESHOLDS.soft.criticalDays).toBe(21);
    });

    it('permanent commitments should have shortest grace period', () => {
      expect(ENFORCEMENT_THRESHOLDS.permanent.needsAttentionDays).toBe(1);
      expect(ENFORCEMENT_THRESHOLDS.permanent.criticalDays).toBe(5);
    });

    it('thresholds should be in ascending order', () => {
      Object.values(ENFORCEMENT_THRESHOLDS).forEach(thresholds => {
        expect(thresholds.needsAttentionDays).toBeLessThan(thresholds.overdueDays);
        expect(thresholds.overdueDays).toBeLessThan(thresholds.criticalDays);
      });
    });

    function determineStatus(
      daysSinceMade: number,
      bindingLevel: BindingLevel
    ): 'on_track' | 'needs_attention' | 'overdue' | 'critical' {
      const thresholds = ENFORCEMENT_THRESHOLDS[bindingLevel];

      if (daysSinceMade >= thresholds.criticalDays) return 'critical';
      if (daysSinceMade >= thresholds.overdueDays) return 'overdue';
      if (daysSinceMade >= thresholds.needsAttentionDays) return 'needs_attention';
      return 'on_track';
    }

    it('should correctly determine status based on days and binding level', () => {
      // Soft commitment at day 5 is on track
      expect(determineStatus(5, 'soft')).toBe('on_track');

      // Soft commitment at day 10 needs attention
      expect(determineStatus(10, 'soft')).toBe('needs_attention');

      // Soft commitment at day 15 is overdue
      expect(determineStatus(15, 'soft')).toBe('overdue');

      // Soft commitment at day 25 is critical
      expect(determineStatus(25, 'soft')).toBe('critical');

      // Hard commitment at day 5 is overdue (stricter)
      expect(determineStatus(5, 'hard')).toBe('needs_attention');

      // Permanent commitment at day 2 needs attention (strictest)
      expect(determineStatus(2, 'permanent')).toBe('needs_attention');

      // Permanent commitment at day 6 is critical
      expect(determineStatus(6, 'permanent')).toBe('critical');
    });
  });
});
