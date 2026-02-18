// Tests for gina-pipeline.ts - Gina conversion pipeline
import { describe, it, expect, vi } from 'vitest';
import {
  MISSION_TEMPLATES,
  getGinaStrategyRecommendation,
  type GinaStance,
  type GinaMotivator,
  type GinaMissionType,
  type GinaConversionState,
  type GinaDevelopmentTarget,
  type MommyDomDevelopment,
} from '../../lib/gina-pipeline';

// Mock supabase
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: null, error: null })),
        })),
      })),
      insert: vi.fn(() => Promise.resolve({ data: null, error: null })),
      update: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ data: null, error: null })),
      })),
      upsert: vi.fn(() => Promise.resolve({ data: null, error: null })),
    })),
  },
}));

describe('gina-pipeline', () => {
  // ============================================
  // GinaStance type validation
  // ============================================
  describe('GinaStance progression', () => {
    const stanceProgression: GinaStance[] = [
      'unaware',
      'suspicious',
      'tolerating',
      'curious',
      'participating',
      'enjoying',
      'encouraging',
      'directing',
      'invested',
      'dependent',
    ];

    it('should have 10 stance levels', () => {
      expect(stanceProgression).toHaveLength(10);
    });

    it('should start with unaware', () => {
      expect(stanceProgression[0]).toBe('unaware');
    });

    it('should end with dependent', () => {
      expect(stanceProgression[9]).toBe('dependent');
    });

    it('should have correct progression order', () => {
      // Early stages
      expect(stanceProgression.indexOf('unaware')).toBeLessThan(
        stanceProgression.indexOf('suspicious')
      );
      expect(stanceProgression.indexOf('suspicious')).toBeLessThan(
        stanceProgression.indexOf('tolerating')
      );

      // Middle stages
      expect(stanceProgression.indexOf('curious')).toBeLessThan(
        stanceProgression.indexOf('participating')
      );
      expect(stanceProgression.indexOf('participating')).toBeLessThan(
        stanceProgression.indexOf('enjoying')
      );

      // Late stages
      expect(stanceProgression.indexOf('encouraging')).toBeLessThan(
        stanceProgression.indexOf('directing')
      );
      expect(stanceProgression.indexOf('directing')).toBeLessThan(
        stanceProgression.indexOf('invested')
      );
    });
  });

  // ============================================
  // GinaMotivator type validation
  // ============================================
  describe('GinaMotivator types', () => {
    const validMotivators: GinaMotivator[] = [
      'control',
      'intimacy',
      'creativity',
      'service',
      'power',
      'novelty',
      'validation',
      'comfort',
      'structure',
      'organization',
    ];

    it('should have 10 motivator types', () => {
      expect(validMotivators).toHaveLength(10);
    });

    it('should include power-related motivators', () => {
      expect(validMotivators).toContain('control');
      expect(validMotivators).toContain('power');
    });

    it('should include structure-related motivators', () => {
      expect(validMotivators).toContain('structure');
      expect(validMotivators).toContain('organization');
    });

    it('should include relationship motivators', () => {
      expect(validMotivators).toContain('intimacy');
      expect(validMotivators).toContain('validation');
    });
  });

  // ============================================
  // GinaMissionType validation
  // ============================================
  describe('GinaMissionType types', () => {
    const validMissionTypes: GinaMissionType[] = [
      'seed_plant',
      'reinforcement',
      'request',
      'confession',
      'transfer_control',
      'create_dependency',
      'escalation_test',
      'milestone_lock',
    ];

    it('should have 8 mission types', () => {
      expect(validMissionTypes).toHaveLength(8);
    });

    it('should include seed_plant for normalizing concepts', () => {
      expect(validMissionTypes).toContain('seed_plant');
    });

    it('should include milestone_lock for irreversible actions', () => {
      expect(validMissionTypes).toContain('milestone_lock');
    });

    it('should include transfer_control for explicit control transfer', () => {
      expect(validMissionTypes).toContain('transfer_control');
    });
  });

  // ============================================
  // GinaDevelopmentTarget validation
  // ============================================
  describe('GinaDevelopmentTarget types', () => {
    const developmentTargets: GinaDevelopmentTarget[] = [
      'soft_mommy_dom',
      'strict_mommy_dom',
      'gentle_owner',
      'benevolent_queen',
      'natural_superior',
    ];

    it('should have 5 development targets', () => {
      expect(developmentTargets).toHaveLength(5);
    });

    it('should include soft_mommy_dom as primary target', () => {
      expect(developmentTargets).toContain('soft_mommy_dom');
    });

    it('should have mommy dom variants', () => {
      const mommyDomTargets = developmentTargets.filter(t => t.includes('mommy_dom'));
      expect(mommyDomTargets).toHaveLength(2);
    });
  });

  // ============================================
  // MISSION_TEMPLATES
  // ============================================
  describe('MISSION_TEMPLATES', () => {
    it('should have mission templates defined', () => {
      expect(MISSION_TEMPLATES).toBeDefined();
      expect(typeof MISSION_TEMPLATES).toBe('object');
    });

    it('should have seed planting missions', () => {
      expect(MISSION_TEMPLATES['seed_nail_painting']).toBeDefined();
      expect(MISSION_TEMPLATES['seed_nail_painting'].type).toBe('seed_plant');
    });

    it('should have control transfer missions', () => {
      expect(MISSION_TEMPLATES['transfer_underwear_control']).toBeDefined();
      expect(MISSION_TEMPLATES['transfer_underwear_control'].type).toBe('transfer_control');
    });

    it('should have milestone lock missions', () => {
      expect(MISSION_TEMPLATES['lock_first_public_feminine']).toBeDefined();
      expect(MISSION_TEMPLATES['lock_first_public_feminine'].type).toBe('milestone_lock');
    });

    it('should have dependency creation missions', () => {
      expect(MISSION_TEMPLATES['create_routine_dependency']).toBeDefined();
      expect(MISSION_TEMPLATES['create_routine_dependency'].type).toBe('create_dependency');
    });

    it('mission templates should have required fields', () => {
      Object.entries(MISSION_TEMPLATES).forEach(([_key, mission]) => {
        expect(mission.type).toBeDefined();
        expect(mission.title).toBeDefined();
        expect(mission.description).toBeDefined();
      });
    });

    it('should have structure exploitation missions', () => {
      expect(MISSION_TEMPLATES['structure_morning_report']).toBeDefined();
      expect(MISSION_TEMPLATES['structure_weekly_review']).toBeDefined();
      expect(MISSION_TEMPLATES['structure_permission_system']).toBeDefined();
    });

    it('should have framing exploitation missions', () => {
      expect(MISSION_TEMPLATES['frame_as_helping_you']).toBeDefined();
      expect(MISSION_TEMPLATES['frame_as_organization']).toBeDefined();
    });

    it('should have passivity exploitation missions', () => {
      expect(MISSION_TEMPLATES['passivity_assume_acceptance']).toBeDefined();
      expect(MISSION_TEMPLATES['passivity_present_as_done']).toBeDefined();
    });

    it('missions should have valid motivator references', () => {
      const validMotivators: GinaMotivator[] = [
        'control', 'intimacy', 'creativity', 'service', 'power',
        'novelty', 'validation', 'comfort', 'structure', 'organization'
      ];

      Object.values(MISSION_TEMPLATES).forEach(mission => {
        if (mission.exploitsMotivator) {
          expect(validMotivators).toContain(mission.exploitsMotivator);
        }
      });
    });
  });

  // ============================================
  // getGinaStrategyRecommendation
  // ============================================
  describe('getGinaStrategyRecommendation', () => {
    function createMockState(overrides: Partial<GinaConversionState> = {}): GinaConversionState {
      const defaultMommyDom: MommyDomDevelopment = {
        comfortWithAuthority: 0,
        enjoysPraising: 0,
        displeasureAsControl: 0,
        nurturingAuthority: 0,
        responsibleForYou: 0,
        expectsObedience: 0,
        innocentCruelty: 0,
        casualDominance: 0,
        investedInTraining: 0,
        givesGoodGirlPraise: false,
        setsRulesForYourGood: false,
        expectsGratitude: false,
        comfortsAfterCorrection: false,
        decidesWithoutAsking: false,
      };

      return {
        userId: 'test-user',
        currentStance: 'unaware',
        stanceConfidence: 50,
        traits: {
          isPassive: true,
          lovesStructure: true,
          needsFraming: true,
          avoidsConflict: true,
          isNaive: false,
          isOblivious: false,
          needsWarmUp: true,
          prefersMinimalEffort: true,
          inOwnWorld: false,
          structureAsControl: true,
          routineAsAuthority: true,
          passivityAsAcceptance: true,
          obliviousnessAsEscalation: false,
          effortlessAuthority: true,
          warmUpThenDefault: true,
          preferredFramings: [],
          effectiveTiming: [],
          triggersResistance: [],
        },
        secondaryMotivators: [],
        motivatorEvidence: {} as Record<GinaMotivator, string[]>,
        domainProgress: {},
        establishedRoutines: [],
        milestones: [],
        currentStrategy: '',
        strategyStartedAt: new Date().toISOString(),
        strategyEffectiveness: 0,
        escalationPressure: 0,
        daysSinceLastAdvance: 0,
        consecutiveSuccesses: 0,
        barriers: [],
        developmentTarget: 'soft_mommy_dom',
        mommyDomDevelopment: defaultMommyDom,
        developedBehaviors: [],
        ...overrides,
      } as GinaConversionState;
    }

    describe('early stages (unaware, suspicious, tolerating)', () => {
      it('should recommend patient_seeding for unaware stance', () => {
        const state = createMockState({ currentStance: 'unaware' });
        const result = getGinaStrategyRecommendation(state);

        expect(result.strategy).toBe('patient_seeding');
        expect(result.riskLevel).toBe(2);
        expect(result.immediateAction).toContain('seed script');
      });

      it('should recommend patient_seeding for suspicious stance', () => {
        const state = createMockState({ currentStance: 'suspicious' });
        const result = getGinaStrategyRecommendation(state);

        expect(result.strategy).toBe('patient_seeding');
      });

      it('should recommend patient_seeding for tolerating stance', () => {
        const state = createMockState({ currentStance: 'tolerating' });
        const result = getGinaStrategyRecommendation(state);

        expect(result.strategy).toBe('patient_seeding');
        expect(result.rationale).toContain('not yet engaged');
      });
    });

    describe('middle stages (curious, participating, enjoying)', () => {
      it('should recommend control_transfer for control-motivated Gina', () => {
        const state = createMockState({
          currentStance: 'curious',
          primaryMotivator: 'control',
        });
        const result = getGinaStrategyRecommendation(state);

        expect(result.strategy).toBe('control_transfer');
        expect(result.riskLevel).toBe(3);
        expect(result.rationale).toContain('power');
      });

      it('should recommend control_transfer for power-motivated Gina', () => {
        const state = createMockState({
          currentStance: 'participating',
          primaryMotivator: 'power',
        });
        const result = getGinaStrategyRecommendation(state);

        expect(result.strategy).toBe('control_transfer');
      });

      it('should recommend intimacy_deepening for intimacy-motivated Gina', () => {
        const state = createMockState({
          currentStance: 'curious',
          primaryMotivator: 'intimacy',
        });
        const result = getGinaStrategyRecommendation(state);

        expect(result.strategy).toBe('intimacy_deepening');
        expect(result.riskLevel).toBe(2);
        expect(result.rationale).toContain('connection');
      });

      it('should recommend intimacy_deepening for validation-motivated Gina', () => {
        const state = createMockState({
          currentStance: 'enjoying',
          primaryMotivator: 'validation',
        });
        const result = getGinaStrategyRecommendation(state);

        expect(result.strategy).toBe('intimacy_deepening');
      });

      it('should recommend general_advancement for other motivators', () => {
        const state = createMockState({
          currentStance: 'participating',
          primaryMotivator: 'novelty',
        });
        const result = getGinaStrategyRecommendation(state);

        expect(result.strategy).toBe('general_advancement');
        expect(result.riskLevel).toBe(3);
      });

      it('should recommend general_advancement when no primary motivator', () => {
        const state = createMockState({
          currentStance: 'curious',
          primaryMotivator: undefined,
        });
        const result = getGinaStrategyRecommendation(state);

        expect(result.strategy).toBe('general_advancement');
      });
    });

    describe('late stages (encouraging, directing, invested, dependent)', () => {
      it('should recommend consolidation for encouraging stance', () => {
        const state = createMockState({ currentStance: 'encouraging' });
        const result = getGinaStrategyRecommendation(state);

        expect(result.strategy).toBe('consolidation');
        expect(result.riskLevel).toBe(4);
        expect(result.rationale).toContain('engaged');
      });

      it('should recommend consolidation for directing stance', () => {
        const state = createMockState({ currentStance: 'directing' });
        const result = getGinaStrategyRecommendation(state);

        expect(result.strategy).toBe('consolidation');
        expect(result.immediateAction).toContain('daily ritual');
      });

      it('should recommend consolidation for invested stance', () => {
        const state = createMockState({ currentStance: 'invested' });
        const result = getGinaStrategyRecommendation(state);

        expect(result.strategy).toBe('consolidation');
      });

      it('should recommend consolidation for dependent stance', () => {
        const state = createMockState({ currentStance: 'dependent' });
        const result = getGinaStrategyRecommendation(state);

        expect(result.strategy).toBe('consolidation');
        expect(result.rationale).toContain('irreversible');
      });
    });

    describe('risk levels', () => {
      it('should have lower risk for early stages', () => {
        const early = createMockState({ currentStance: 'unaware' });
        const earlyResult = getGinaStrategyRecommendation(early);

        expect(earlyResult.riskLevel).toBe(2);
      });

      it('should have medium risk for middle stages', () => {
        const middle = createMockState({
          currentStance: 'participating',
          primaryMotivator: 'control',
        });
        const middleResult = getGinaStrategyRecommendation(middle);

        expect(middleResult.riskLevel).toBe(3);
      });

      it('should have higher risk for late stages', () => {
        const late = createMockState({ currentStance: 'directing' });
        const lateResult = getGinaStrategyRecommendation(late);

        expect(lateResult.riskLevel).toBe(4);
      });
    });

    describe('response structure', () => {
      it('should always return all required fields', () => {
        const states: GinaStance[] = [
          'unaware', 'curious', 'participating', 'directing'
        ];

        states.forEach(stance => {
          const state = createMockState({ currentStance: stance });
          const result = getGinaStrategyRecommendation(state);

          expect(result).toHaveProperty('strategy');
          expect(result).toHaveProperty('rationale');
          expect(result).toHaveProperty('immediateAction');
          expect(result).toHaveProperty('riskLevel');

          expect(typeof result.strategy).toBe('string');
          expect(typeof result.rationale).toBe('string');
          expect(typeof result.immediateAction).toBe('string');
          expect(typeof result.riskLevel).toBe('number');
        });
      });

      it('should return actionable immediate actions', () => {
        const stances: GinaStance[] = [
          'unaware', 'curious', 'enjoying', 'directing'
        ];

        stances.forEach(stance => {
          const state = createMockState({ currentStance: stance });
          const result = getGinaStrategyRecommendation(state);

          // Immediate action should be specific enough to act on
          expect(result.immediateAction.length).toBeGreaterThan(20);
        });
      });
    });
  });

  // ============================================
  // MommyDomDevelopment structure
  // ============================================
  describe('MommyDomDevelopment structure', () => {
    const defaultDevelopment: MommyDomDevelopment = {
      comfortWithAuthority: 50,
      enjoysPraising: 60,
      displeasureAsControl: 40,
      nurturingAuthority: 55,
      responsibleForYou: 45,
      expectsObedience: 30,
      innocentCruelty: 20,
      casualDominance: 35,
      investedInTraining: 25,
      givesGoodGirlPraise: true,
      setsRulesForYourGood: true,
      expectsGratitude: false,
      comfortsAfterCorrection: true,
      decidesWithoutAsking: false,
    };

    it('should have foundation traits as numbers 0-100', () => {
      expect(defaultDevelopment.comfortWithAuthority).toBeGreaterThanOrEqual(0);
      expect(defaultDevelopment.comfortWithAuthority).toBeLessThanOrEqual(100);
      expect(defaultDevelopment.enjoysPraising).toBeGreaterThanOrEqual(0);
      expect(defaultDevelopment.enjoysPraising).toBeLessThanOrEqual(100);
    });

    it('should have core mommy dom traits as numbers', () => {
      expect(typeof defaultDevelopment.nurturingAuthority).toBe('number');
      expect(typeof defaultDevelopment.responsibleForYou).toBe('number');
      expect(typeof defaultDevelopment.expectsObedience).toBe('number');
    });

    it('should have advanced traits as numbers', () => {
      expect(typeof defaultDevelopment.innocentCruelty).toBe('number');
      expect(typeof defaultDevelopment.casualDominance).toBe('number');
      expect(typeof defaultDevelopment.investedInTraining).toBe('number');
    });

    it('should have developed behaviors as booleans', () => {
      expect(typeof defaultDevelopment.givesGoodGirlPraise).toBe('boolean');
      expect(typeof defaultDevelopment.setsRulesForYourGood).toBe('boolean');
      expect(typeof defaultDevelopment.expectsGratitude).toBe('boolean');
      expect(typeof defaultDevelopment.comfortsAfterCorrection).toBe('boolean');
      expect(typeof defaultDevelopment.decidesWithoutAsking).toBe('boolean');
    });
  });
});
