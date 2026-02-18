// Tests for platform-manager.ts - Platform integration, posting, and analytics
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  PLATFORM_CONFIGS,
  getAccounts,
  getAccount,
  getReleasePlatforms,
  createScheduledPost,
  getDuePosts,
  handlePostingError,
  getPostingSummary,
  calculateOptimalPostTime,
  postToPlatform,
  type PlatformAccount,
  type ScheduledPost,
} from '../../lib/handler-v2/platform-manager';

// ============================================
// Mock supabase with chainable query builder
// ============================================

// Mutable result holders so each test can control what supabase returns
let mockSelectResult: { data: unknown; error: unknown } = { data: [], error: null };
let mockSingleResult: { data: unknown; error: unknown } = { data: null, error: null };
let mockInsertResult: { data: unknown; error: unknown } = { data: null, error: null };
let mockUpdateResult: { data: unknown; error: unknown } = { data: null, error: null };

const mockEq = vi.fn().mockImplementation(() => ({
  eq: mockEq,
  single: vi.fn(() => Promise.resolve(mockSingleResult)),
  maybeSingle: vi.fn(() => Promise.resolve(mockSingleResult)),
  order: vi.fn(() => Promise.resolve(mockSelectResult)),
  lte: vi.fn(() => ({
    order: vi.fn(() => Promise.resolve(mockSelectResult)),
  })),
  in: vi.fn(() => Promise.resolve(mockSelectResult)),
  gte: vi.fn(() => ({
    in: vi.fn(() => Promise.resolve(mockSelectResult)),
  })),
  is: vi.fn(() => ({
    order: vi.fn(() => ({
      limit: vi.fn(() => ({
        maybeSingle: vi.fn(() => Promise.resolve(mockSingleResult)),
      })),
    })),
  })),
  then: vi.fn((cb: any) => Promise.resolve(mockSelectResult).then(cb)),
}));

const mockSelect = vi.fn().mockImplementation(() => ({
  eq: mockEq,
  order: vi.fn(() => Promise.resolve(mockSelectResult)),
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

// Import supabase after mocking for spy access
import { supabase } from '../../lib/supabase';

beforeEach(() => {
  vi.clearAllMocks();
  mockSelectResult = { data: [], error: null };
  mockSingleResult = { data: null, error: null };
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
// Helper factories
// ============================================

function makeFakeAccountRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'acct-1',
    user_id: 'user-1',
    platform: 'reddit',
    account_type: 'creator',
    username: 'testuser',
    display_name: 'Test User',
    posting_schedule: {},
    content_strategy: {},
    analytics: {},
    revenue_total: 0,
    subscriber_count: 0,
    engagement_rate: 0,
    enabled: true,
    is_release_platform: false,
    release_config: {},
    last_posted_at: null,
    last_synced_at: null,
    ...overrides,
  };
}

function makeFakePostRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'post-1',
    user_id: 'user-1',
    platform_account_id: 'acct-1',
    content_id: 'content-1',
    post_type: 'image',
    caption: 'Test caption',
    hashtags: ['#test'],
    metadata: {},
    scheduled_for: new Date().toISOString(),
    price: null,
    status: 'scheduled',
    retry_count: 0,
    posted_at: null,
    post_url: null,
    post_external_id: null,
    engagement_data: {},
    revenue_generated: 0,
    is_consequence_release: false,
    ...overrides,
  };
}

// ============================================
// TESTS
// ============================================

describe('PlatformManager', () => {
  // ============================================
  // PLATFORM_CONFIGS
  // ============================================
  describe('PLATFORM_CONFIGS', () => {
    it('should have configs for all supported platforms', () => {
      expect(Object.keys(PLATFORM_CONFIGS).length).toBeGreaterThanOrEqual(5);
    });

    it('should include reddit, twitter, onlyfans, fansly, patreon', () => {
      expect(PLATFORM_CONFIGS).toHaveProperty('reddit');
      expect(PLATFORM_CONFIGS).toHaveProperty('twitter');
      expect(PLATFORM_CONFIGS).toHaveProperty('onlyfans');
      expect(PLATFORM_CONFIGS).toHaveProperty('fansly');
      expect(PLATFORM_CONFIGS).toHaveProperty('patreon');
    });

    it('each config should have apiEndpoint, authMethod, capabilities, rateLimits', () => {
      Object.values(PLATFORM_CONFIGS).forEach((config) => {
        expect(config).toHaveProperty('apiEndpoint');
        expect(config).toHaveProperty('authMethod');
        expect(config).toHaveProperty('capabilities');
        expect(config).toHaveProperty('rateLimits');
        expect(typeof config.apiEndpoint).toBe('string');
        expect(typeof config.authMethod).toBe('string');
        expect(Array.isArray(config.capabilities)).toBe(true);
        expect(typeof config.rateLimits).toBe('object');
      });
    });

    it('reddit should use oauth authentication', () => {
      expect(PLATFORM_CONFIGS.reddit.authMethod).toBe('oauth');
    });

    it('onlyfans should support ppv capability', () => {
      expect(PLATFORM_CONFIGS.onlyfans.capabilities).toContain('ppv');
    });

    it('all platforms should include analytics capability', () => {
      Object.values(PLATFORM_CONFIGS).forEach((config) => {
        expect(config.capabilities).toContain('analytics');
      });
    });
  });

  // ============================================
  // getAccounts
  // ============================================
  describe('getAccounts', () => {
    it('should query platform_accounts by user_id', async () => {
      const row = makeFakeAccountRow({ user_id: 'user-42' });
      mockSelectResult = { data: [row], error: null };

      const accounts = await getAccounts('user-42');

      expect(supabase.from).toHaveBeenCalledWith('platform_accounts');
      expect(mockSelect).toHaveBeenCalledWith('*');
      expect(accounts).toHaveLength(1);
      expect(accounts[0].userId).toBe('user-42');
      expect(accounts[0].platform).toBe('reddit');
    });

    it('should return empty array when no accounts', async () => {
      mockSelectResult = { data: [], error: null };

      const accounts = await getAccounts('user-empty');

      expect(accounts).toEqual([]);
    });

    it('should return empty array on error', async () => {
      mockSelectResult = { data: null, error: { message: 'db error' } };

      const accounts = await getAccounts('user-err');

      expect(accounts).toEqual([]);
    });

    it('should map snake_case DB rows to camelCase PlatformAccount', async () => {
      const row = makeFakeAccountRow({
        is_release_platform: true,
        revenue_total: 500,
        subscriber_count: 42,
        engagement_rate: 0.12,
        display_name: 'Display',
      });
      mockSelectResult = { data: [row], error: null };

      const accounts = await getAccounts('user-1');

      expect(accounts[0].isReleasePlatform).toBe(true);
      expect(accounts[0].revenueTotal).toBe(500);
      expect(accounts[0].subscriberCount).toBe(42);
      expect(accounts[0].engagementRate).toBe(0.12);
      expect(accounts[0].displayName).toBe('Display');
    });
  });

  // ============================================
  // getReleasePlatforms
  // ============================================
  describe('getReleasePlatforms', () => {
    it('should filter for is_release_platform = true', async () => {
      const releaseAccount = makeFakeAccountRow({
        is_release_platform: true,
        enabled: true,
      });
      mockSelectResult = { data: [releaseAccount], error: null };

      const platforms = await getReleasePlatforms('user-1');

      expect(supabase.from).toHaveBeenCalledWith('platform_accounts');
      // The chain calls eq three times: user_id, is_release_platform, enabled
      expect(mockEq).toHaveBeenCalled();
      expect(platforms).toHaveLength(1);
      expect(platforms[0].isReleasePlatform).toBe(true);
    });

    it('should return empty array when no release platforms', async () => {
      mockSelectResult = { data: [], error: null };

      const platforms = await getReleasePlatforms('user-1');

      expect(platforms).toEqual([]);
    });

    it('should return empty array on error', async () => {
      mockSelectResult = { data: null, error: { message: 'db fail' } };

      const platforms = await getReleasePlatforms('user-err');

      expect(platforms).toEqual([]);
    });
  });

  // ============================================
  // createScheduledPost
  // ============================================
  describe('createScheduledPost', () => {
    it('should insert into scheduled_posts table', async () => {
      mockInsertResult = { data: null, error: null };

      const postInput = {
        userId: 'user-1',
        platformAccountId: 'acct-1',
        contentId: 'content-1',
        postType: 'image',
        caption: 'Test',
        hashtags: ['#test'],
        metadata: {},
        scheduledFor: '2026-03-01T18:00:00.000Z',
        price: null,
        isConsequenceRelease: false,
      };

      const id = await createScheduledPost(postInput);

      expect(supabase.from).toHaveBeenCalledWith('scheduled_posts');
      expect(mockInsert).toHaveBeenCalled();
      // Should return a UUID string
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);

      // Verify the inserted payload contains expected fields
      const insertedPayload = mockInsert.mock.calls[0][0];
      expect(insertedPayload.user_id).toBe('user-1');
      expect(insertedPayload.platform_account_id).toBe('acct-1');
      expect(insertedPayload.content_id).toBe('content-1');
      expect(insertedPayload.status).toBe('scheduled');
      expect(insertedPayload.retry_count).toBe(0);
      expect(insertedPayload.is_consequence_release).toBe(false);
    });

    it('should throw when insert fails', async () => {
      mockInsertResult = { data: null, error: { message: 'insert failed' } };

      await expect(
        createScheduledPost({
          userId: 'user-1',
          platformAccountId: 'acct-1',
          contentId: 'c-1',
          postType: 'text',
          caption: null,
          hashtags: [],
          metadata: {},
          scheduledFor: new Date().toISOString(),
          price: null,
          isConsequenceRelease: false,
        })
      ).rejects.toThrow('Failed to create scheduled post');
    });
  });

  // ============================================
  // handlePostingError
  // ============================================
  describe('handlePostingError', () => {
    it('should increment retry count', async () => {
      // Post currently at retry 0 => next retry = 1, still below max (3)
      mockSingleResult = {
        data: {
          retry_count: 0,
          scheduled_for: new Date().toISOString(),
          user_id: 'user-1',
          platform_account_id: 'acct-1',
        },
        error: null,
      };
      mockUpdateResult = { data: null, error: null };

      await handlePostingError('post-1', 'Network timeout');

      expect(supabase.from).toHaveBeenCalledWith('scheduled_posts');
      expect(mockUpdate).toHaveBeenCalled();

      const updatePayload = mockUpdate.mock.calls[0][0];
      expect(updatePayload.retry_count).toBe(1);
      expect(updatePayload.status).toBe('scheduled');
    });

    it('should mark as failed after max retries', async () => {
      // Post currently at retry 2 => next retry = 3 >= MAX_RETRY_COUNT (3)
      mockSingleResult = {
        data: {
          retry_count: 2,
          scheduled_for: new Date().toISOString(),
          user_id: 'user-1',
          platform_account_id: 'acct-1',
        },
        error: null,
      };
      mockUpdateResult = { data: null, error: null };

      await handlePostingError('post-1', 'Permanent failure');

      expect(mockUpdate).toHaveBeenCalled();

      const updatePayload = mockUpdate.mock.calls[0][0];
      expect(updatePayload.retry_count).toBe(3);
      expect(updatePayload.status).toBe('failed');
      expect(updatePayload.metadata.lastError).toBe('Permanent failure');
      expect(updatePayload.metadata.totalAttempts).toBe(3);
    });

    it('should do nothing if post not found', async () => {
      mockSingleResult = { data: null, error: { code: 'PGRST116', message: 'not found' } };

      await handlePostingError('nonexistent-post', 'error');

      // update should NOT have been called because the fetch failed
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('should reschedule with delay on non-final retry', async () => {
      mockSingleResult = {
        data: {
          retry_count: 1,
          scheduled_for: new Date().toISOString(),
          user_id: 'user-1',
          platform_account_id: 'acct-1',
        },
        error: null,
      };
      mockUpdateResult = { data: null, error: null };

      await handlePostingError('post-1', 'Temporary error');

      const updatePayload = mockUpdate.mock.calls[0][0];
      expect(updatePayload.retry_count).toBe(2);
      expect(updatePayload.status).toBe('scheduled');
      expect(updatePayload.metadata.nextRetryAt).toBeDefined();
    });
  });

  // ============================================
  // getPostingSummary
  // ============================================
  describe('getPostingSummary', () => {
    it('should aggregate post stats', async () => {
      // First call: from('scheduled_posts') returns posts
      // Second call: from('platform_accounts') returns accounts for mapping
      const posts = [
        { id: 'p1', platform_account_id: 'acct-1', status: 'posted' },
        { id: 'p2', platform_account_id: 'acct-1', status: 'posted' },
        { id: 'p3', platform_account_id: 'acct-2', status: 'failed' },
      ];

      const accounts = [
        makeFakeAccountRow({ id: 'acct-1', platform: 'reddit' }),
        makeFakeAccountRow({ id: 'acct-2', platform: 'twitter' }),
      ];

      // The function calls supabase.from('scheduled_posts') then supabase.from('platform_accounts')
      // We need to handle both calls in sequence
      let callCount = 0;
      mockSelectResult = { data: posts, error: null };

      // Override the entire from mock to return different data per table
      (supabase.from as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
        if (table === 'scheduled_posts') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                gte: vi.fn(() => ({
                  in: vi.fn(() => Promise.resolve({ data: posts, error: null })),
                })),
              })),
            })),
          };
        }
        if (table === 'platform_accounts') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => Promise.resolve({ data: accounts, error: null })),
              })),
            })),
          };
        }
        return { select: mockSelect, insert: mockInsert, update: mockUpdate };
      });

      const summary = await getPostingSummary('user-1');

      expect(summary.totalPosts).toBe(3);
      expect(summary.successRate).toBeCloseTo(2 / 3, 2);
      expect(summary.byPlatform.reddit).toBe(2);
    });

    it('should return zeroed summary when no posts', async () => {
      (supabase.from as ReturnType<typeof vi.fn>).mockImplementation(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            gte: vi.fn(() => ({
              in: vi.fn(() => Promise.resolve({ data: [], error: null })),
            })),
          })),
        })),
      }));

      const summary = await getPostingSummary('user-empty');

      expect(summary.totalPosts).toBe(0);
      expect(summary.byPlatform).toEqual({});
      expect(summary.successRate).toBe(0);
    });

    it('should return zeroed summary on error', async () => {
      (supabase.from as ReturnType<typeof vi.fn>).mockImplementation(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            gte: vi.fn(() => ({
              in: vi.fn(() => Promise.resolve({ data: null, error: { message: 'fail' } })),
            })),
          })),
        })),
      }));

      const summary = await getPostingSummary('user-err');

      expect(summary.totalPosts).toBe(0);
      expect(summary.successRate).toBe(0);
    });
  });
});
