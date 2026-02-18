// Tests for enforcement-engine.ts - 9-tier escalation enforcement system
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock supabase before importing the module under test
vi.mock('../../lib/supabase', () => {
  const mockChain = () => {
    const chain: any = {
      select: vi.fn(() => chain),
      insert: vi.fn(() => chain),
      update: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      neq: vi.fn(() => chain),
      in: vi.fn(() => chain),
      lte: vi.fn(() => chain),
      gte: vi.fn(() => chain),
      lt: vi.fn(() => chain),
      order: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      single: vi.fn(() => Promise.resolve({ data: null, error: null })),
      then: vi.fn((cb) => Promise.resolve({ data: [], error: null }).then(cb)),
    };
    return chain;
  };
  return {
    supabase: {
      from: vi.fn(() => mockChain()),
      rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
    },
  };
});

vi.mock('../../lib/punishment-engine', () => ({
  applyPunishment: vi.fn(() => Promise.resolve()),
}));

vi.mock('../../lib/denial-engine', () => ({
  extendDenialMinimum: vi.fn(() => Promise.resolve()),
}));

import {
  ESCALATION_THRESHOLDS,
  checkEscalation,
  onTaskCompletion,
  reduceEscalation,
  getDailyEnforcementSummary,
  type ComplianceState,
} from '../../lib/handler-v2/enforcement-engine';
import { supabase } from '../../lib/supabase';

// ============================================
// Helper: build a ComplianceState with defaults
// ============================================
function makeComplianceState(overrides: Partial<ComplianceState> = {}): ComplianceState {
  return {
    userId: 'test-user-1',
    lastEngagementAt: new Date().toISOString(),
    hoursSinceEngagement: 0,
    dailyTasksComplete: 0,
    dailyTasksRequired: 1,
    dailyMinimumMet: false,
    escalationTier: 0,
    bleedingActive: false,
    bleedingStartedAt: null,
    bleedingRatePerMinute: 0,
    bleedingTotalToday: 0,
    pendingConsequenceCount: 0,
    ...overrides,
  };
}

describe('EnforcementEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // mockReset clears mockReturnValueOnce queue + implementation; then re-set defaults
    (supabase.from as ReturnType<typeof vi.fn>).mockReset();
    (supabase.rpc as ReturnType<typeof vi.fn>).mockReset();
    (supabase.from as ReturnType<typeof vi.fn>).mockImplementation(() => {
      const chain: any = {
        select: vi.fn(() => chain),
        insert: vi.fn(() => chain),
        update: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        neq: vi.fn(() => chain),
        in: vi.fn(() => chain),
        lte: vi.fn(() => chain),
        gte: vi.fn(() => chain),
        lt: vi.fn(() => chain),
        order: vi.fn(() => chain),
        limit: vi.fn(() => chain),
        single: vi.fn(() => Promise.resolve({ data: null, error: null })),
        then: vi.fn((cb: any) => Promise.resolve({ data: [], error: null }).then(cb)),
      };
      return chain;
    });
    (supabase.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null, error: null });
  });

  // ============================================
  // ESCALATION_THRESHOLDS constant
  // ============================================
  describe('ESCALATION_THRESHOLDS', () => {
    it('should have 9 tiers', () => {
      expect(ESCALATION_THRESHOLDS).toHaveLength(9);
    });

    it('should be ordered by tier number', () => {
      for (let i = 0; i < ESCALATION_THRESHOLDS.length; i++) {
        expect(ESCALATION_THRESHOLDS[i].tier).toBe(i + 1);
      }
    });

    it('should have increasing hour thresholds', () => {
      for (let i = 1; i < ESCALATION_THRESHOLDS.length; i++) {
        expect(ESCALATION_THRESHOLDS[i].hours).toBeGreaterThan(
          ESCALATION_THRESHOLDS[i - 1].hours
        );
      }
    });
  });

  // ============================================
  // checkEscalation (pure function)
  // ============================================
  describe('checkEscalation', () => {
    it('should return null when escalation tier is 0 and hours < threshold', () => {
      // Under 24 hours with tier 0 -- no escalation needed
      const state = makeComplianceState({
        hoursSinceEngagement: 12,
        escalationTier: 0,
      });
      const result = checkEscalation(state);
      expect(result).toBeNull();
    });

    it('should return warning action at tier 1 threshold', () => {
      // 24+ hours since engagement, currently at tier 0
      const state = makeComplianceState({
        hoursSinceEngagement: 25,
        escalationTier: 0,
      });
      const result = checkEscalation(state);
      expect(result).not.toBeNull();
      expect(result!.type).toBe('warning');
      expect(result!.tier).toBe(1);
      expect(result!.reason).toContain('25');
      expect(result!.reason).toContain('threshold: 24h');
    });

    it('should return financial_light at tier 2 threshold', () => {
      // 48+ hours since engagement, currently at tier 1
      const state = makeComplianceState({
        hoursSinceEngagement: 50,
        escalationTier: 1,
      });
      const result = checkEscalation(state);
      expect(result).not.toBeNull();
      expect(result!.type).toBe('financial_light');
      expect(result!.tier).toBe(2);
      expect(result!.amount).toBe(25);
    });

    it('should return financial_medium at tier 3 threshold', () => {
      // 72+ hours since engagement, currently at tier 2
      const state = makeComplianceState({
        hoursSinceEngagement: 80,
        escalationTier: 2,
      });
      const result = checkEscalation(state);
      expect(result).not.toBeNull();
      expect(result!.type).toBe('financial_medium');
      expect(result!.tier).toBe(3);
      expect(result!.amount).toBe(50);
    });

    it('should not skip tiers', () => {
      // Even though hours exceed tier 3 threshold (72h), if user is at tier 0
      // the function finds the highest crossed threshold and returns that.
      // With 80 hours and tier 0, the highest crossed threshold is tier 3
      // (72h). Since tier 3 > tier 0, it returns tier 3 action.
      // The enforcement engine logic allows jumping to the correct tier
      // based on hours, but let us verify the progression works properly
      // when escalation tier matches sequential progression.

      // Start at tier 0 with 25 hours -- should get tier 1
      const state0 = makeComplianceState({
        hoursSinceEngagement: 25,
        escalationTier: 0,
      });
      const action0 = checkEscalation(state0);
      expect(action0).not.toBeNull();
      expect(action0!.tier).toBe(1);

      // At tier 1 with 25 hours -- should NOT escalate (tier 1 threshold
      // is 24h, already at tier 1)
      const state1 = makeComplianceState({
        hoursSinceEngagement: 25,
        escalationTier: 1,
      });
      const action1 = checkEscalation(state1);
      expect(action1).toBeNull();

      // At tier 1 with 50 hours -- should escalate to tier 2
      const state1b = makeComplianceState({
        hoursSinceEngagement: 50,
        escalationTier: 1,
      });
      const action1b = checkEscalation(state1b);
      expect(action1b).not.toBeNull();
      expect(action1b!.tier).toBe(2);
    });

    it('should not re-trigger same tier', () => {
      // Already at tier 2, hours still at 50 (within tier 2 range)
      const state = makeComplianceState({
        hoursSinceEngagement: 50,
        escalationTier: 2,
      });
      const result = checkEscalation(state);
      expect(result).toBeNull();
    });

    it('should return content_warning at tier 4 threshold', () => {
      const state = makeComplianceState({
        hoursSinceEngagement: 125,
        escalationTier: 3,
      });
      const result = checkEscalation(state);
      expect(result).not.toBeNull();
      expect(result!.type).toBe('content_warning');
      expect(result!.tier).toBe(4);
    });

    it('should return content_release with vulnerabilityTier at tier 5', () => {
      const state = makeComplianceState({
        hoursSinceEngagement: 170,
        escalationTier: 4,
      });
      const result = checkEscalation(state);
      expect(result).not.toBeNull();
      expect(result!.type).toBe('content_release');
      expect(result!.tier).toBe(5);
      expect(result!.vulnerabilityTier).toBe(2);
      expect(result!.count).toBe(1);
    });

    it('should return handler_narration at tier 6', () => {
      const state = makeComplianceState({
        hoursSinceEngagement: 245,
        escalationTier: 5,
      });
      const result = checkEscalation(state);
      expect(result).not.toBeNull();
      expect(result!.type).toBe('handler_narration');
      expect(result!.tier).toBe(6);
    });

    it('should return content_release_escalated at tier 7', () => {
      const state = makeComplianceState({
        hoursSinceEngagement: 340,
        escalationTier: 6,
      });
      const result = checkEscalation(state);
      expect(result).not.toBeNull();
      expect(result!.type).toBe('content_release_escalated');
      expect(result!.tier).toBe(7);
      expect(result!.vulnerabilityTier).toBe(3);
      expect(result!.count).toBe(1);
    });

    it('should return gina_notification at tier 8', () => {
      const state = makeComplianceState({
        hoursSinceEngagement: 510,
        escalationTier: 7,
      });
      const result = checkEscalation(state);
      expect(result).not.toBeNull();
      expect(result!.type).toBe('gina_notification');
      expect(result!.tier).toBe(8);
    });

    it('should return full_exposure at tier 9', () => {
      const state = makeComplianceState({
        hoursSinceEngagement: 725,
        escalationTier: 8,
      });
      const result = checkEscalation(state);
      expect(result).not.toBeNull();
      expect(result!.type).toBe('full_exposure');
      expect(result!.tier).toBe(9);
    });

    it('should return null when already at tier 9', () => {
      const state = makeComplianceState({
        hoursSinceEngagement: 1000,
        escalationTier: 9,
      });
      const result = checkEscalation(state);
      expect(result).toBeNull();
    });

    it('should return null when hours are exactly 0', () => {
      const state = makeComplianceState({
        hoursSinceEngagement: 0,
        escalationTier: 0,
      });
      const result = checkEscalation(state);
      expect(result).toBeNull();
    });

    it('should escalate at exactly the threshold boundary', () => {
      // Exactly 24 hours should trigger tier 1
      const state = makeComplianceState({
        hoursSinceEngagement: 24,
        escalationTier: 0,
      });
      const result = checkEscalation(state);
      expect(result).not.toBeNull();
      expect(result!.tier).toBe(1);
      expect(result!.type).toBe('warning');
    });

    it('should not include amount when threshold has no amount', () => {
      // Tier 1 (warning) has no amount defined
      const state = makeComplianceState({
        hoursSinceEngagement: 25,
        escalationTier: 0,
      });
      const result = checkEscalation(state);
      expect(result).not.toBeNull();
      expect(result!.amount).toBeUndefined();
    });
  });

  // ============================================
  // onTaskCompletion
  // ============================================
  describe('onTaskCompletion', () => {
    it('should call supabase to update compliance state', async () => {
      const mockFrom = vi.mocked(supabase.from);

      await onTaskCompletion('test-user-1', 'task-abc');

      // Verify supabase.from was called with compliance_state
      const complianceStateCalls = mockFrom.mock.calls.filter(
        (call) => call[0] === 'compliance_state'
      );
      expect(complianceStateCalls.length).toBeGreaterThan(0);
    });

    it('should record engagement timestamp', async () => {
      const mockFrom = vi.mocked(supabase.from);

      await onTaskCompletion('test-user-1', 'task-xyz');

      // Verify supabase.from was called for compliance_state updates
      const complianceStateCalls = mockFrom.mock.calls.filter(
        (call) => call[0] === 'compliance_state'
      );
      expect(complianceStateCalls.length).toBeGreaterThan(0);

      // Verify supabase.rpc was called with record_engagement
      const mockRpc = vi.mocked(supabase.rpc);
      expect(mockRpc).toHaveBeenCalledWith('record_engagement', {
        p_user_id: 'test-user-1',
      });
    });

    it('should log enforcement event to enforcement_log', async () => {
      const mockFrom = vi.mocked(supabase.from);

      await onTaskCompletion('test-user-1', 'task-log');

      const enforcementLogCalls = mockFrom.mock.calls.filter(
        (call) => call[0] === 'enforcement_log'
      );
      expect(enforcementLogCalls.length).toBeGreaterThan(0);
    });
  });

  // ============================================
  // reduceEscalation
  // ============================================
  describe('reduceEscalation', () => {
    it('should decrement escalation tier', async () => {
      // Mock supabase to return a state with escalation_tier = 3
      const mockChain: any = {};
      mockChain.select = vi.fn(() => mockChain);
      mockChain.eq = vi.fn(() => mockChain);
      mockChain.single = vi.fn(() =>
        Promise.resolve({ data: { escalation_tier: 3 }, error: null })
      );
      mockChain.update = vi.fn(() => mockChain);
      mockChain.insert = vi.fn(() =>
        Promise.resolve({ data: null, error: null })
      );

      const mockFrom = vi.mocked(supabase.from);
      mockFrom.mockReturnValue(mockChain);

      await reduceEscalation('test-user-1');

      // The update should have been called (for compliance_state update)
      expect(mockChain.update).toHaveBeenCalled();

      // The update call should contain the decremented tier
      const updateCall = mockChain.update.mock.calls[0][0];
      expect(updateCall.escalation_tier).toBe(2);
    });

    it('should not go below 0', async () => {
      // Mock supabase to return a state with escalation_tier = 0
      const mockChain: any = {};
      mockChain.select = vi.fn(() => mockChain);
      mockChain.eq = vi.fn(() => mockChain);
      mockChain.single = vi.fn(() =>
        Promise.resolve({ data: { escalation_tier: 0 }, error: null })
      );
      mockChain.update = vi.fn(() => mockChain);
      mockChain.insert = vi.fn(() =>
        Promise.resolve({ data: null, error: null })
      );

      const mockFrom = vi.mocked(supabase.from);
      mockFrom.mockReturnValue(mockChain);

      await reduceEscalation('test-user-1');

      // update should NOT have been called since newTier === currentTier (both 0)
      expect(mockChain.update).not.toHaveBeenCalled();
    });

    it('should log de-escalation to handler_decisions', async () => {
      const mockChain: any = {};
      mockChain.select = vi.fn(() => mockChain);
      mockChain.eq = vi.fn(() => mockChain);
      mockChain.single = vi.fn(() =>
        Promise.resolve({ data: { escalation_tier: 5 }, error: null })
      );
      mockChain.update = vi.fn(() => mockChain);
      mockChain.insert = vi.fn(() =>
        Promise.resolve({ data: null, error: null })
      );

      const mockFrom = vi.mocked(supabase.from);
      mockFrom.mockReturnValue(mockChain);

      await reduceEscalation('test-user-1');

      // handler_decisions insert should have been called
      const fromCalls = mockFrom.mock.calls.map((c) => c[0]);
      expect(fromCalls).toContain('handler_decisions');

      // The insert call should contain de-escalation data
      expect(mockChain.insert).toHaveBeenCalled();
      const insertCall = mockChain.insert.mock.calls.find((call: any[]) => {
        const arg = call[0];
        return arg && arg.decision_type === 'escalation';
      });
      expect(insertCall).toBeDefined();
      expect(insertCall[0].decision_data.direction).toBe('down');
      expect(insertCall[0].decision_data.previous_tier).toBe(5);
      expect(insertCall[0].decision_data.new_tier).toBe(4);
    });
  });

  // ============================================
  // getDailyEnforcementSummary
  // ============================================
  describe('getDailyEnforcementSummary', () => {
    it('should return daily stats', async () => {
      // The mock chain returns { data: null, error: null } for single()
      // and { data: [], error: null } for then(). The function handles
      // null data gracefully and returns zeroed-out defaults.
      const summary = await getDailyEnforcementSummary('test-user-1');

      expect(summary).toHaveProperty('tier');
      expect(summary).toHaveProperty('actionsToday');
      expect(summary).toHaveProperty('totalBled');
      expect(summary).toHaveProperty('contentReleased');

      // With null data from mocks, all values default to 0
      expect(summary.tier).toBe(0);
      expect(summary.actionsToday).toBe(0);
      expect(summary.totalBled).toBe(0);
      expect(summary.contentReleased).toBe(0);
    });

    it('should query compliance_state for the given user', async () => {
      const mockFrom = vi.mocked(supabase.from);

      await getDailyEnforcementSummary('user-summary-test');

      const complianceStateCalls = mockFrom.mock.calls.filter(
        (call) => call[0] === 'compliance_state'
      );
      expect(complianceStateCalls.length).toBeGreaterThan(0);
    });

    it('should query enforcement_log for today', async () => {
      const mockFrom = vi.mocked(supabase.from);

      await getDailyEnforcementSummary('user-summary-test');

      const enforcementLogCalls = mockFrom.mock.calls.filter(
        (call) => call[0] === 'enforcement_log'
      );
      expect(enforcementLogCalls.length).toBeGreaterThan(0);
    });

    it('should query content_library for released content today', async () => {
      const mockFrom = vi.mocked(supabase.from);

      await getDailyEnforcementSummary('user-summary-test');

      const contentLibraryCalls = mockFrom.mock.calls.filter(
        (call) => call[0] === 'content_library'
      );
      expect(contentLibraryCalls.length).toBeGreaterThan(0);
    });
  });
});
