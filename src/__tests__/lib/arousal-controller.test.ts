// Tests for arousal-controller.ts - Lovense integration, denial, and arousal rewards
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  selectSummonsPattern,
  calculateRewardForTask,
  getArousalState,
  deliverReward,
  enforceDenial,
  summonUser,
  extendDenial,
  scheduleFrustrationActivations,
  executeScheduledActivations,
  getDenialSummary,
  type ArousalState,
  type LovensePattern,
  type ArousalReward,
} from '../../lib/handler-v2/arousal-controller';

// ============================================
// Mock lovense
// ============================================

vi.mock('../../lib/lovense', () => ({
  smartVibrate: vi.fn(() => Promise.resolve()),
  sendTaskCompleteBuzz: vi.fn(() => Promise.resolve()),
}));

import { smartVibrate, sendTaskCompleteBuzz } from '../../lib/lovense';

// ============================================
// Mock supabase with chainable query builder
// ============================================

let mockSelectResult: { data: unknown; error: unknown } = { data: [], error: null };
let mockSingleResult: { data: unknown; error: unknown } = { data: null, error: null };
let mockMaybeSingleResult: { data: unknown; error: unknown } = { data: null, error: null };
let mockInsertResult: { data: unknown; error: unknown } = { data: null, error: null };
let mockUpdateResult: { data: unknown; error: unknown } = { data: null, error: null };

const mockEq = vi.fn().mockImplementation(() => ({
  eq: mockEq,
  single: vi.fn(() => Promise.resolve(mockSingleResult)),
  maybeSingle: vi.fn(() => Promise.resolve(mockMaybeSingleResult)),
  order: vi.fn(() => ({
    limit: vi.fn(() => ({
      maybeSingle: vi.fn(() => Promise.resolve(mockMaybeSingleResult)),
    })),
  })),
  lte: vi.fn(() => ({
    order: vi.fn(() => Promise.resolve(mockSelectResult)),
  })),
  is: vi.fn(() => ({
    order: vi.fn(() => ({
      limit: vi.fn(() => ({
        maybeSingle: vi.fn(() => Promise.resolve(mockMaybeSingleResult)),
      })),
    })),
  })),
}));

const mockSelect = vi.fn().mockImplementation(() => ({
  eq: mockEq,
}));

const mockInsert = vi.fn().mockImplementation(() => Promise.resolve(mockInsertResult));

const mockUpdate = vi.fn().mockImplementation(() => ({
  eq: vi.fn(() => Promise.resolve(mockUpdateResult)),
}));

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: mockSelect,
      insert: mockInsert,
      update: mockUpdate,
    })),
  },
}));

import { supabase } from '../../lib/supabase';

beforeEach(() => {
  vi.clearAllMocks();
  mockSelectResult = { data: [], error: null };
  mockSingleResult = { data: null, error: null };
  mockMaybeSingleResult = { data: null, error: null };
  mockInsertResult = { data: null, error: null };
  mockUpdateResult = { data: null, error: null };
  // Reset from to default factory (clearAllMocks doesn't reset mockImplementation)
  (supabase.from as ReturnType<typeof vi.fn>).mockImplementation(() => ({
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
  }));
});

// ============================================
// TESTS
// ============================================

describe('ArousalController', () => {
  // ============================================
  // selectSummonsPattern (pure function)
  // ============================================
  describe('selectSummonsPattern', () => {
    it('should return low intensity for low escalation (< 6 hours)', () => {
      const pattern = selectSummonsPattern(2);

      expect(pattern.type).toBe('pulse');
      expect(pattern.intensity).toBeLessThanOrEqual(10);
      expect(pattern.durationMs).toBeDefined();
      expect(pattern.durationMs).toBeLessThanOrEqual(5000);
    });

    it('should return medium intensity for moderate escalation (6-24 hours)', () => {
      const pattern = selectSummonsPattern(12);

      expect(pattern.type).toBe('wave');
      expect(pattern.intensity).toBeGreaterThan(8);
      expect(pattern.intensity).toBeLessThanOrEqual(14);
      expect(pattern.durationMs).toBeGreaterThan(3000);
    });

    it('should return high intensity for high escalation (> 24 hours)', () => {
      const pattern = selectSummonsPattern(30);

      expect(pattern.type).toBe('frustration');
      expect(pattern.intensity).toBeGreaterThanOrEqual(14);
      expect(pattern.durationMs).toBeGreaterThan(10000);
    });

    it('should always return valid pattern object', () => {
      const testCases = [0, 1, 5, 6, 12, 23, 24, 48, 100];

      testCases.forEach((hours) => {
        const pattern = selectSummonsPattern(hours);

        expect(pattern).toHaveProperty('type');
        expect(pattern).toHaveProperty('intensity');
        expect(typeof pattern.type).toBe('string');
        expect(typeof pattern.intensity).toBe('number');
        expect(pattern.intensity).toBeGreaterThan(0);
        expect(pattern.durationMs).toBeDefined();
        expect(pattern.durationMs!).toBeGreaterThan(0);
      });
    });

    it('should have increasing intensity across escalation levels', () => {
      const low = selectSummonsPattern(2);
      const mid = selectSummonsPattern(12);
      const high = selectSummonsPattern(30);

      expect(low.intensity).toBeLessThan(mid.intensity);
      expect(mid.intensity).toBeLessThan(high.intensity);
    });

    it('should have increasing duration across escalation levels', () => {
      const low = selectSummonsPattern(2);
      const mid = selectSummonsPattern(12);
      const high = selectSummonsPattern(30);

      expect(low.durationMs!).toBeLessThan(mid.durationMs!);
      expect(mid.durationMs!).toBeLessThan(high.durationMs!);
    });

    it('should use pulse type at boundary (exactly 6 hours is wave)', () => {
      // < 6 => pulse, >= 6 => wave
      const justUnder = selectSummonsPattern(5.9);
      expect(justUnder.type).toBe('pulse');

      const atSix = selectSummonsPattern(6);
      expect(atSix.type).toBe('wave');
    });

    it('should use wave type at boundary (exactly 24 hours is frustration)', () => {
      // < 24 => wave, >= 24 => frustration
      const justUnder = selectSummonsPattern(23.9);
      expect(justUnder.type).toBe('wave');

      const atTwentyFour = selectSummonsPattern(24);
      expect(atTwentyFour.type).toBe('frustration');
    });
  });

  // ============================================
  // calculateRewardForTask (pure function)
  // ============================================
  describe('calculateRewardForTask', () => {
    it('should return pulse reward for low difficulty and low vulnerability', () => {
      const reward = calculateRewardForTask(1, 0);

      expect(reward.type).toBe('pulse');
      expect(reward.intensity).toBeDefined();
      expect(reward.duration).toBeDefined();
    });

    it('should return pulse reward for difficulty 2 and vulnerability 1', () => {
      const reward = calculateRewardForTask(2, 1);

      expect(reward.type).toBe('pulse');
    });

    it('should return session reward for difficulty >= 3', () => {
      const reward = calculateRewardForTask(3, 0);

      expect(reward.type).toBe('session');
      expect(reward.minutes).toBeDefined();
      expect(reward.minutes!).toBeGreaterThan(0);
    });

    it('should return session reward when vulnerability tier >= 2 (even low difficulty)', () => {
      const reward = calculateRewardForTask(1, 2);

      expect(reward.type).toBe('session');
      expect(reward.minutes).toBeDefined();
    });

    it('should return edge_credit for difficulty 5 and vulnerability 2', () => {
      const reward = calculateRewardForTask(5, 2);

      expect(reward.type).toBe('edge_credit');
      expect(reward.count).toBeDefined();
      expect(reward.count).toBe(1);
    });

    it('should return release_consideration for difficulty 5 and vulnerability >= 3', () => {
      const reward = calculateRewardForTask(5, 3);

      expect(reward.type).toBe('release_consideration');
      expect(reward.count).toBe(1);
    });

    it('should return release_consideration for max difficulty and max vulnerability', () => {
      const reward = calculateRewardForTask(5, 5);

      expect(reward.type).toBe('release_consideration');
    });

    it('should clamp difficulty to range 1-5', () => {
      // Difficulty 0 should be clamped to 1
      const lowReward = calculateRewardForTask(0, 0);
      expect(lowReward.type).toBe('pulse');

      // Difficulty 10 should be clamped to 5
      const highReward = calculateRewardForTask(10, 3);
      expect(highReward.type).toBe('release_consideration');
    });

    it('should clamp vulnerability tier to range 0-5', () => {
      // Negative vulnerability should be clamped to 0
      const lowReward = calculateRewardForTask(2, -5);
      expect(lowReward.type).toBe('pulse');

      // Very high vulnerability clamped to 5
      const highReward = calculateRewardForTask(5, 100);
      expect(highReward.type).toBe('release_consideration');
    });

    it('should scale session minutes with difficulty', () => {
      const reward3 = calculateRewardForTask(3, 0);
      const reward4 = calculateRewardForTask(4, 0);

      expect(reward3.type).toBe('session');
      expect(reward4.type).toBe('session');
      // minutes = min(8, 2 + diff), so diff 3 => 5, diff 4 => 6
      expect(reward4.minutes!).toBeGreaterThan(reward3.minutes!);
    });

    it('should cap session minutes at 8', () => {
      // diff 5 => min(8, 2+5) = 7, still under cap
      // But the function may produce session for diff 4 vuln 1 => min(8, 2+4)=6
      const reward = calculateRewardForTask(4, 1);
      expect(reward.type).toBe('session');
      expect(reward.minutes!).toBeLessThanOrEqual(8);
    });
  });

  // ============================================
  // getArousalState
  // ============================================
  describe('getArousalState', () => {
    it('should query denial state', async () => {
      // Set up parallel query results: denial_state, daily_arousal_plans, lovense_proactive_commands
      // The function uses Promise.all with three supabase calls
      const denialData = {
        current_denial_day: 5,
        is_locked: true,
        last_release_at: '2026-01-01T00:00:00Z',
        total_denial_days: 30,
      };

      // The function calls supabase.from three different tables in Promise.all
      // We override from to return different chain per table
      (supabase.from as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
        if (table === 'denial_state') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(() =>
                  Promise.resolve({ data: denialData, error: null })
                ),
              })),
            })),
          };
        }
        if (table === 'daily_arousal_plans') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(() =>
                    Promise.resolve({
                      data: {
                        current_arousal_level: 'medium',
                        edge_count: 7,
                        total_target_duration_minutes: 30,
                      },
                      error: null,
                    })
                  ),
                })),
              })),
            })),
          };
        }
        if (table === 'lovense_proactive_commands') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  order: vi.fn(() =>
                    Promise.resolve({ data: [], error: null })
                  ),
                })),
              })),
            })),
          };
        }
        return { select: mockSelect, insert: mockInsert, update: mockUpdate };
      });

      const state = await getArousalState('user-1');

      expect(state.userId).toBe('user-1');
      expect(state.denialDays).toBe(5);
      expect(state.isLocked).toBe(true);
      expect(state.lastRelease).toBe('2026-01-01T00:00:00Z');
      expect(state.edgeCount).toBe(7);
      expect(state.earnedSessionMinutes).toBe(30);
      expect(state.releaseThreshold).toBe(15); // DEFAULT_RELEASE_THRESHOLD
      expect(Array.isArray(state.scheduledActivations)).toBe(true);
    });

    it('should return default values when no denial state exists', async () => {
      (supabase.from as ReturnType<typeof vi.fn>).mockImplementation(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(() =>
                Promise.resolve({ data: null, error: null })
              ),
              order: vi.fn(() =>
                Promise.resolve({ data: [], error: null })
              ),
            })),
            maybeSingle: vi.fn(() =>
              Promise.resolve({ data: null, error: null })
            ),
            order: vi.fn(() =>
              Promise.resolve({ data: [], error: null })
            ),
          })),
        })),
      }));

      const state = await getArousalState('user-new');

      expect(state.userId).toBe('user-new');
      expect(state.denialDays).toBe(0);
      expect(state.edgeCount).toBe(0);
      expect(state.isLocked).toBe(false);
      expect(state.lastRelease).toBeNull();
      expect(state.currentLovenseMode).toBeNull();
      expect(state.scheduledActivations).toEqual([]);
    });

    it('should include scheduled activations from queued lovense commands', async () => {
      const queuedCommands = [
        {
          id: 'cmd-1',
          created_at: '2026-02-15T10:00:00Z',
          command_type: 'tease',
          pattern: 'frustration',
          intensity: 12,
          duration_seconds: 5,
          status: 'queued',
        },
        {
          id: 'cmd-2',
          created_at: '2026-02-15T14:00:00Z',
          command_type: 'summon',
          pattern: 'pulse',
          intensity: 8,
          duration_seconds: 3,
          status: 'queued',
        },
      ];

      (supabase.from as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
        if (table === 'denial_state') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(() =>
                  Promise.resolve({ data: null, error: null })
                ),
              })),
            })),
          };
        }
        if (table === 'daily_arousal_plans') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(() =>
                    Promise.resolve({ data: null, error: null })
                  ),
                })),
              })),
            })),
          };
        }
        if (table === 'lovense_proactive_commands') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  order: vi.fn(() =>
                    Promise.resolve({ data: queuedCommands, error: null })
                  ),
                })),
              })),
            })),
          };
        }
        return { select: mockSelect, insert: mockInsert, update: mockUpdate };
      });

      const state = await getArousalState('user-1');

      expect(state.scheduledActivations).toHaveLength(2);
      expect(state.scheduledActivations[0].id).toBe('cmd-1');
      expect(state.scheduledActivations[0].commandType).toBe('tease');
      expect(state.scheduledActivations[0].intensity).toBe(12);
      expect(state.scheduledActivations[1].id).toBe('cmd-2');
      expect(state.scheduledActivations[1].commandType).toBe('summon');
    });
  });

  // ============================================
  // deliverReward
  // ============================================
  describe('deliverReward', () => {
    it('should queue lovense command for pulse reward', async () => {
      mockInsertResult = { data: null, error: null };

      const reward: ArousalReward = {
        type: 'pulse',
        intensity: 10,
        duration: 3,
      };

      await deliverReward('user-1', reward);

      // Should insert into lovense_proactive_commands
      expect(supabase.from).toHaveBeenCalledWith('lovense_proactive_commands');
      expect(mockInsert).toHaveBeenCalled();

      const insertedPayload = mockInsert.mock.calls[0][0];
      expect(insertedPayload.user_id).toBe('user-1');
      expect(insertedPayload.command_type).toBe('reward');
      expect(insertedPayload.pattern).toBe('pulse');
      expect(insertedPayload.intensity).toBe(10);
      expect(insertedPayload.duration_seconds).toBe(3);

      // Should also call sendTaskCompleteBuzz for immediate feedback
      expect(sendTaskCompleteBuzz).toHaveBeenCalled();
    });

    it('should trigger lovense for pulse reward via sendTaskCompleteBuzz', async () => {
      mockInsertResult = { data: null, error: null };

      const reward: ArousalReward = { type: 'pulse', intensity: 8, duration: 2 };

      await deliverReward('user-1', reward);

      expect(sendTaskCompleteBuzz).toHaveBeenCalledTimes(1);
    });

    it('should grant session minutes for session reward', async () => {
      // First query: check for existing daily_arousal_plans
      // Second query: update or insert
      const existingPlan = {
        id: 'plan-1',
        total_target_duration_minutes: 10,
      };

      (supabase.from as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
        if (table === 'daily_arousal_plans') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(() =>
                    Promise.resolve({ data: existingPlan, error: null })
                  ),
                })),
              })),
            })),
            update: vi.fn((payload: Record<string, unknown>) => ({
              eq: vi.fn(() => Promise.resolve({ data: null, error: null })),
            })),
            insert: mockInsert,
          };
        }
        return { select: mockSelect, insert: mockInsert, update: mockUpdate };
      });

      const reward: ArousalReward = { type: 'session', minutes: 5 };

      await deliverReward('user-1', reward);

      // Should have queried daily_arousal_plans for existing plan
      expect(supabase.from).toHaveBeenCalledWith('daily_arousal_plans');
    });

    it('should insert new plan if none exists for session reward', async () => {
      (supabase.from as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
        if (table === 'daily_arousal_plans') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(() =>
                    Promise.resolve({ data: null, error: null })
                  ),
                })),
              })),
            })),
            update: mockUpdate,
            insert: mockInsert,
          };
        }
        return { select: mockSelect, insert: mockInsert, update: mockUpdate };
      });

      mockInsertResult = { data: null, error: null };

      const reward: ArousalReward = { type: 'session', minutes: 7 };

      await deliverReward('user-1', reward);

      expect(mockInsert).toHaveBeenCalled();
      const payload = mockInsert.mock.calls[0][0];
      expect(payload.user_id).toBe('user-1');
      expect(payload.total_target_duration_minutes).toBe(7);
      expect(payload.status).toBe('active');
    });

    it('should increment edge count for edge_credit reward', async () => {
      const existingPlan = {
        id: 'plan-1',
        edges_achieved: 3,
      };

      (supabase.from as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
        if (table === 'daily_arousal_plans') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(() =>
                    Promise.resolve({ data: existingPlan, error: null })
                  ),
                })),
              })),
            })),
            update: vi.fn((payload: Record<string, unknown>) => {
              // Verify edges_achieved is incremented
              expect(payload.edges_achieved).toBe(4);
              return {
                eq: vi.fn(() => Promise.resolve({ data: null, error: null })),
              };
            }),
            insert: mockInsert,
          };
        }
        return { select: mockSelect, insert: mockInsert, update: mockUpdate };
      });

      const reward: ArousalReward = { type: 'edge_credit', count: 1 };

      await deliverReward('user-1', reward);

      expect(supabase.from).toHaveBeenCalledWith('daily_arousal_plans');
    });
  });

  // ============================================
  // enforceDenial
  // ============================================
  describe('enforceDenial', () => {
    it('should update denial state by incrementing denial day', async () => {
      const existingDenial = {
        user_id: 'user-1',
        current_denial_day: 4,
        is_locked: true,
        total_denial_days: 20,
      };

      (supabase.from as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
        if (table === 'denial_state') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(() =>
                  Promise.resolve({ data: existingDenial, error: null })
                ),
              })),
            })),
            update: vi.fn((payload: Record<string, unknown>) => {
              expect(payload.current_denial_day).toBe(5);
              expect(payload.total_denial_days).toBe(21);
              return {
                eq: vi.fn(() => Promise.resolve({ data: null, error: null })),
              };
            }),
            insert: mockInsert,
          };
        }
        // For scheduleFrustrationActivations which is called when day >= 3
        if (table === 'lovense_proactive_commands') {
          return {
            insert: vi.fn(() => Promise.resolve({ data: null, error: null })),
          };
        }
        return { select: mockSelect, insert: mockInsert, update: mockUpdate };
      });

      await enforceDenial('user-1');

      expect(supabase.from).toHaveBeenCalledWith('denial_state');
    });

    it('should initialize denial state when none exists', async () => {
      (supabase.from as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
        if (table === 'denial_state') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(() =>
                  Promise.resolve({ data: null, error: null })
                ),
              })),
            })),
            insert: vi.fn((payload: Record<string, unknown>) => {
              expect(payload.user_id).toBe('user-new');
              expect(payload.current_denial_day).toBe(1);
              expect(payload.is_locked).toBe(true);
              return Promise.resolve({ data: null, error: null });
            }),
            update: mockUpdate,
          };
        }
        return { select: mockSelect, insert: mockInsert, update: mockUpdate };
      });

      await enforceDenial('user-new');

      expect(supabase.from).toHaveBeenCalledWith('denial_state');
    });

    it('should schedule frustration activations when denial day >= 3', async () => {
      const existingDenial = {
        user_id: 'user-1',
        current_denial_day: 5, // will become 6, which is >= 3
        is_locked: true,
        total_denial_days: 30,
      };

      let frustrationInsertCalled = false;

      (supabase.from as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
        if (table === 'denial_state') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(() =>
                  Promise.resolve({ data: existingDenial, error: null })
                ),
              })),
            })),
            update: vi.fn(() => ({
              eq: vi.fn(() => Promise.resolve({ data: null, error: null })),
            })),
            insert: mockInsert,
          };
        }
        if (table === 'lovense_proactive_commands') {
          return {
            insert: vi.fn((cmds: unknown[]) => {
              frustrationInsertCalled = true;
              return Promise.resolve({ data: null, error: null });
            }),
          };
        }
        return { select: mockSelect, insert: mockInsert, update: mockUpdate };
      });

      await enforceDenial('user-1');

      expect(frustrationInsertCalled).toBe(true);
    });

    it('should not schedule frustration activations when denial day < 3', async () => {
      const existingDenial = {
        user_id: 'user-1',
        current_denial_day: 1, // will become 2, which is < 3
        is_locked: true,
        total_denial_days: 5,
      };

      let frustrationInsertCalled = false;

      (supabase.from as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
        if (table === 'denial_state') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(() =>
                  Promise.resolve({ data: existingDenial, error: null })
                ),
              })),
            })),
            update: vi.fn(() => ({
              eq: vi.fn(() => Promise.resolve({ data: null, error: null })),
            })),
            insert: mockInsert,
          };
        }
        if (table === 'lovense_proactive_commands') {
          return {
            insert: vi.fn(() => {
              frustrationInsertCalled = true;
              return Promise.resolve({ data: null, error: null });
            }),
          };
        }
        return { select: mockSelect, insert: mockInsert, update: mockUpdate };
      });

      await enforceDenial('user-1');

      expect(frustrationInsertCalled).toBe(false);
    });

    it('should handle fetch error gracefully', async () => {
      (supabase.from as ReturnType<typeof vi.fn>).mockImplementation(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(() =>
              Promise.resolve({ data: null, error: { message: 'db error' } })
            ),
          })),
        })),
        insert: mockInsert,
        update: mockUpdate,
      }));

      // Should not throw
      await expect(enforceDenial('user-err')).resolves.toBeUndefined();
    });
  });

  // ============================================
  // getDenialSummary
  // ============================================
  describe('getDenialSummary', () => {
    it('should return denial summary with edgesRemaining calculation', async () => {
      // Mock getArousalState internals
      const denialData = {
        current_denial_day: 10,
        is_locked: true,
        last_release_at: null,
        total_denial_days: 10,
      };

      (supabase.from as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
        if (table === 'denial_state') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(() =>
                  Promise.resolve({ data: denialData, error: null })
                ),
              })),
            })),
          };
        }
        if (table === 'daily_arousal_plans') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(() =>
                    Promise.resolve({
                      data: { edge_count: 5, total_target_duration_minutes: 0 },
                      error: null,
                    })
                  ),
                })),
              })),
            })),
          };
        }
        if (table === 'lovense_proactive_commands') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  order: vi.fn(() =>
                    Promise.resolve({ data: [], error: null })
                  ),
                })),
              })),
            })),
          };
        }
        return { select: mockSelect, insert: mockInsert, update: mockUpdate };
      });

      const summary = await getDenialSummary('user-1');

      expect(summary.denialDays).toBe(10);
      expect(summary.edgeCount).toBe(5);
      expect(summary.releaseThreshold).toBe(15); // DEFAULT_RELEASE_THRESHOLD
      expect(summary.edgesRemaining).toBe(10); // 15 - 5
    });

    it('should return 0 edgesRemaining when threshold met', async () => {
      (supabase.from as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
        if (table === 'denial_state') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(() =>
                  Promise.resolve({
                    data: { current_denial_day: 20, is_locked: true },
                    error: null,
                  })
                ),
              })),
            })),
          };
        }
        if (table === 'daily_arousal_plans') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(() =>
                    Promise.resolve({
                      data: { edge_count: 20, total_target_duration_minutes: 0 },
                      error: null,
                    })
                  ),
                })),
              })),
            })),
          };
        }
        if (table === 'lovense_proactive_commands') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  order: vi.fn(() =>
                    Promise.resolve({ data: [], error: null })
                  ),
                })),
              })),
            })),
          };
        }
        return { select: mockSelect, insert: mockInsert, update: mockUpdate };
      });

      const summary = await getDenialSummary('user-1');

      expect(summary.edgesRemaining).toBe(0);
      expect(summary.edgeCount).toBe(20);
    });
  });
});
