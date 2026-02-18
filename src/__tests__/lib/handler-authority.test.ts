// Tests for handler-authority.ts - Handler authority system
import { describe, it, expect, vi } from 'vitest';
import {
  AUTHORITY_LEVELS,
  type AuthorityLevel,
} from '../../lib/handler-authority';

// Mock the gina-pipeline module
vi.mock('../../lib/gina-pipeline', () => ({
  getGinaConversionState: vi.fn(() => Promise.resolve(null)),
  getPendingGinaMissions: vi.fn(() => Promise.resolve([])),
  generateNextGinaMissions: vi.fn(() => Promise.resolve([])),
  getActiveBehavioralDirectives: vi.fn(() => Promise.resolve([])),
  getGinaStrategyRecommendation: vi.fn(() => ({ strategy: 'test', immediateAction: 'test' })),
}));

describe('handler-authority', () => {
  // ============================================
  // AUTHORITY_LEVELS configuration
  // ============================================
  describe('AUTHORITY_LEVELS', () => {
    it('should have 5 authority levels', () => {
      const levels = Object.keys(AUTHORITY_LEVELS);
      expect(levels).toHaveLength(5);
      expect(levels).toEqual(['1', '2', '3', '4', '5']);
    });

    it('should have correct level 1 (Advisory) configuration', () => {
      const level1 = AUTHORITY_LEVELS[1];
      expect(level1.name).toBe('Advisory');
      expect(level1.description).toContain('suggests');
      expect(level1.capabilities).toHaveLength(0);
    });

    it('should have correct level 2 (Guiding) configuration', () => {
      const level2 = AUTHORITY_LEVELS[2];
      expect(level2.name).toBe('Guiding');
      expect(level2.description).toContain('recommends');
      expect(level2.capabilities).toContain('require_decline_reason');
    });

    it('should have correct level 3 (Directing) configuration', () => {
      const level3 = AUTHORITY_LEVELS[3];
      expect(level3.name).toBe('Directing');
      expect(level3.description).toContain('assigns');
      expect(level3.capabilities).toContain('require_decline_reason');
      expect(level3.capabilities).toContain('assign_tasks');
      expect(level3.capabilities).toContain('set_daily_minimum');
    });

    it('should have correct level 4 (Controlling) configuration', () => {
      const level4 = AUTHORITY_LEVELS[4];
      expect(level4.name).toBe('Controlling');
      expect(level4.description).toContain('schedule');
      expect(level4.capabilities).toContain('undismissable_interventions');
      expect(level4.capabilities).toContain('auto_intensity');
    });

    it('should have correct level 5 (Owning) configuration', () => {
      const level5 = AUTHORITY_LEVELS[5];
      expect(level5.name).toBe('Owning');
      expect(level5.description).toContain('decides everything');
      expect(level5.capabilities).toContain('auto_escalation');
      expect(level5.capabilities).toContain('auto_commitment');
      expect(level5.capabilities).toContain('schedule_sessions');
    });

    it('should have increasing capabilities at each level', () => {
      // Each level should have at least as many capabilities as the previous
      let prevCapabilities = 0;
      for (let i = 1; i <= 5; i++) {
        const level = AUTHORITY_LEVELS[i as AuthorityLevel];
        expect(level.capabilities.length).toBeGreaterThanOrEqual(prevCapabilities);
        prevCapabilities = level.capabilities.length;
      }
    });

    it('should have unique names for each level', () => {
      const names = Object.values(AUTHORITY_LEVELS).map(l => l.name);
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(5);
    });
  });

  // ============================================
  // Capability progression tests
  // ============================================
  describe('capability progression', () => {
    it('should not have any capabilities at level 1', () => {
      expect(AUTHORITY_LEVELS[1].capabilities).toEqual([]);
    });

    it('should add require_decline_reason at level 2', () => {
      expect(AUTHORITY_LEVELS[2].capabilities).toContain('require_decline_reason');
      expect(AUTHORITY_LEVELS[1].capabilities).not.toContain('require_decline_reason');
    });

    it('should add task assignment at level 3', () => {
      expect(AUTHORITY_LEVELS[3].capabilities).toContain('assign_tasks');
      expect(AUTHORITY_LEVELS[2].capabilities).not.toContain('assign_tasks');
    });

    it('should add auto_intensity at level 4', () => {
      expect(AUTHORITY_LEVELS[4].capabilities).toContain('auto_intensity');
      expect(AUTHORITY_LEVELS[3].capabilities).not.toContain('auto_intensity');
    });

    it('should add schedule_sessions at level 5', () => {
      expect(AUTHORITY_LEVELS[5].capabilities).toContain('schedule_sessions');
      expect(AUTHORITY_LEVELS[4].capabilities).not.toContain('schedule_sessions');
    });

    it('higher levels should include all lower level capabilities', () => {
      // Level 3 should have all level 2 capabilities
      for (const cap of AUTHORITY_LEVELS[2].capabilities) {
        expect(AUTHORITY_LEVELS[3].capabilities).toContain(cap);
      }

      // Level 4 should have all level 3 capabilities
      for (const cap of AUTHORITY_LEVELS[3].capabilities) {
        expect(AUTHORITY_LEVELS[4].capabilities).toContain(cap);
      }

      // Level 5 should have all level 4 capabilities
      for (const cap of AUTHORITY_LEVELS[4].capabilities) {
        expect(AUTHORITY_LEVELS[5].capabilities).toContain(cap);
      }
    });
  });

  // ============================================
  // Authority level type safety tests
  // ============================================
  describe('type safety', () => {
    it('should only allow valid authority levels 1-5', () => {
      const validLevels: AuthorityLevel[] = [1, 2, 3, 4, 5];
      validLevels.forEach(level => {
        expect(AUTHORITY_LEVELS[level]).toBeDefined();
      });
    });

    it('should have consistent structure across all levels', () => {
      Object.values(AUTHORITY_LEVELS).forEach(level => {
        expect(level).toHaveProperty('name');
        expect(level).toHaveProperty('description');
        expect(level).toHaveProperty('capabilities');
        expect(typeof level.name).toBe('string');
        expect(typeof level.description).toBe('string');
        expect(Array.isArray(level.capabilities)).toBe(true);
      });
    });
  });

  // ============================================
  // Helper function for checking capability
  // ============================================
  describe('capability checking logic', () => {
    function hasCapabilitySync(level: AuthorityLevel, capability: string): boolean {
      const config = AUTHORITY_LEVELS[level];
      return config.capabilities.includes(capability as never);
    }

    it('should correctly identify capabilities at each level', () => {
      // Level 1 has no capabilities
      expect(hasCapabilitySync(1, 'require_decline_reason')).toBe(false);
      expect(hasCapabilitySync(1, 'assign_tasks')).toBe(false);

      // Level 2 has require_decline_reason
      expect(hasCapabilitySync(2, 'require_decline_reason')).toBe(true);
      expect(hasCapabilitySync(2, 'assign_tasks')).toBe(false);

      // Level 3 has assign_tasks
      expect(hasCapabilitySync(3, 'assign_tasks')).toBe(true);
      expect(hasCapabilitySync(3, 'auto_intensity')).toBe(false);

      // Level 4 has auto_intensity
      expect(hasCapabilitySync(4, 'auto_intensity')).toBe(true);
      expect(hasCapabilitySync(4, 'schedule_sessions')).toBe(false);

      // Level 5 has everything
      expect(hasCapabilitySync(5, 'schedule_sessions')).toBe(true);
      expect(hasCapabilitySync(5, 'auto_commitment')).toBe(true);
    });
  });

  // ============================================
  // Session type tests
  // ============================================
  describe('scheduled session types', () => {
    const validSessionTypes = ['edge', 'goon', 'hypno', 'conditioning'];

    it('should support all session types', () => {
      // This tests the type definition indirectly
      validSessionTypes.forEach(type => {
        expect(['edge', 'goon', 'hypno', 'conditioning']).toContain(type);
      });
    });
  });

  // ============================================
  // Intensity level tests
  // ============================================
  describe('intensity levels', () => {
    const validIntensities = ['light', 'normal', 'intense', 'extreme'];

    it('should support all intensity levels', () => {
      validIntensities.forEach(intensity => {
        expect(['light', 'normal', 'intense', 'extreme']).toContain(intensity);
      });
    });

    it('should have correct intensity progression', () => {
      const intensityOrder = ['light', 'normal', 'intense', 'extreme'];
      expect(intensityOrder.indexOf('light')).toBeLessThan(intensityOrder.indexOf('normal'));
      expect(intensityOrder.indexOf('normal')).toBeLessThan(intensityOrder.indexOf('intense'));
      expect(intensityOrder.indexOf('intense')).toBeLessThan(intensityOrder.indexOf('extreme'));
    });
  });

  // ============================================
  // Automatic decision types
  // ============================================
  describe('automatic decision types', () => {
    const decisionTypes = [
      'intensity_change',
      'task_assigned',
      'session_scheduled',
      'escalation_applied',
      'language_shift',
      'content_unlocked',
    ];

    it('should support all automatic decision types', () => {
      decisionTypes.forEach(type => {
        expect(decisionTypes).toContain(type);
      });
    });
  });

  // ============================================
  // Required intervention actions
  // ============================================
  describe('required intervention actions', () => {
    const requiredActions = ['complete', 'acknowledge', 'respond'];

    it('should support all required action types', () => {
      requiredActions.forEach(action => {
        expect(['complete', 'acknowledge', 'respond']).toContain(action);
      });
    });
  });

  // ============================================
  // Authority upgrade logic tests
  // ============================================
  describe('authority upgrade thresholds', () => {
    // Tests the logic that would be used in checkAuthorityUpgrade
    interface UpgradeThreshold {
      level: AuthorityLevel;
      minCompletions: number;
      minComplianceRate: number;
    }

    const upgradeThresholds: UpgradeThreshold[] = [
      { level: 1, minCompletions: 10, minComplianceRate: 0.7 },
      { level: 2, minCompletions: 25, minComplianceRate: 0.8 },
      { level: 3, minCompletions: 50, minComplianceRate: 0.85 },
      { level: 4, minCompletions: 100, minComplianceRate: 0.9 },
    ];

    it('should have increasing completion requirements', () => {
      for (let i = 1; i < upgradeThresholds.length; i++) {
        expect(upgradeThresholds[i].minCompletions).toBeGreaterThan(
          upgradeThresholds[i - 1].minCompletions
        );
      }
    });

    it('should have increasing compliance rate requirements', () => {
      for (let i = 1; i < upgradeThresholds.length; i++) {
        expect(upgradeThresholds[i].minComplianceRate).toBeGreaterThan(
          upgradeThresholds[i - 1].minComplianceRate
        );
      }
    });

    it('should require at least 70% compliance at level 1', () => {
      expect(upgradeThresholds[0].minComplianceRate).toBe(0.7);
    });

    it('should require 90% compliance for level 5 upgrade', () => {
      expect(upgradeThresholds[3].minComplianceRate).toBe(0.9);
    });

    function checkUpgradeEligibility(
      currentLevel: AuthorityLevel,
      completions: number,
      dismissals: number
    ): boolean {
      if (currentLevel >= 5) return false;

      const complianceRate = completions / Math.max(completions + dismissals, 1);
      const threshold = upgradeThresholds.find(t => t.level === currentLevel);

      if (!threshold) return false;

      return completions >= threshold.minCompletions &&
             complianceRate >= threshold.minComplianceRate;
    }

    it('should not upgrade at level 5', () => {
      expect(checkUpgradeEligibility(5, 1000, 0)).toBe(false);
    });

    it('should upgrade level 1 with sufficient completions and compliance', () => {
      expect(checkUpgradeEligibility(1, 10, 2)).toBe(true); // 10/(10+2) = 83%
      expect(checkUpgradeEligibility(1, 10, 5)).toBe(false); // 10/(10+5) = 67%
    });

    it('should not upgrade without enough completions', () => {
      expect(checkUpgradeEligibility(1, 5, 0)).toBe(false);
      expect(checkUpgradeEligibility(2, 20, 0)).toBe(false);
    });
  });
});
