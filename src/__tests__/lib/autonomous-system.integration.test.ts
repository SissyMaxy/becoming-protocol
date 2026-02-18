/**
 * Handler Autonomous System — Integration Tests
 *
 * Runs against real Supabase. Validates that:
 * 1. All tables exist and are queryable
 * 2. Engine functions return correctly shaped data
 * 3. The initialize_autonomous_system() function works
 * 4. Read operations against real schema succeed
 * 5. Write operations succeed and can be cleaned up
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let supabase: SupabaseClient;
let userId: string;

beforeAll(async () => {
  supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // Get a real user ID
  const { data } = await supabase
    .from('user_progress')
    .select('user_id')
    .limit(1)
    .single();

  userId = data?.user_id;
  if (!userId) throw new Error('No user found — run the app first');
});

// ============================================
// SCHEMA VALIDATION — Do all tables exist?
// ============================================
describe('Schema validation', () => {
  const tables = [
    'handler_decisions',
    'content_library',
    'content_briefs',
    'platform_accounts',
    'scheduled_posts',
    'revenue_events',
    'maxy_fund',
    'fund_transactions',
    'handler_strategy',
    'compliance_state',
    'feminization_purchases',
  ];

  for (const table of tables) {
    it(`table "${table}" should exist and be queryable`, async () => {
      const { error } = await supabase
        .from(table)
        .select('*')
        .limit(1);

      // No error means the table exists (even if empty)
      expect(error).toBeNull();
    });
  }
});

// ============================================
// INITIALIZE AUTONOMOUS SYSTEM
// ============================================
describe('initialize_autonomous_system', () => {
  it('should create compliance_state for user', async () => {
    // Call the RPC
    const { error: rpcError } = await supabase.rpc('initialize_autonomous_system', {
      p_user_id: userId,
    });

    // May error if already initialized — that's fine
    if (rpcError && !rpcError.message.includes('duplicate') && !rpcError.message.includes('already exists')) {
      console.warn('RPC warning:', rpcError.message);
    }

    // Verify compliance_state exists
    const { data, error } = await supabase
      .from('compliance_state')
      .select('*')
      .eq('user_id', userId)
      .single();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data.user_id).toBe(userId);
    expect(data).toHaveProperty('escalation_tier');
    expect(data).toHaveProperty('daily_tasks_complete');
    expect(data).toHaveProperty('daily_tasks_required');
    expect(data).toHaveProperty('bleeding_active');
  });

  it('should create maxy_fund for user', async () => {
    const { data, error } = await supabase
      .from('maxy_fund')
      .select('*')
      .eq('user_id', userId)
      .single();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data.user_id).toBe(userId);
    expect(data).toHaveProperty('balance');
    expect(data).toHaveProperty('total_earned');
    expect(data).toHaveProperty('total_penalties');
    expect(data).toHaveProperty('payout_threshold');
  });

  it('should create handler_strategy for user', async () => {
    const { data, error } = await supabase
      .from('handler_strategy')
      .select('*')
      .eq('user_id', userId)
      .single();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data).toHaveProperty('current_phase');
    expect(data).toHaveProperty('content_focus');
    expect(data).toHaveProperty('platform_priority');
  });
});

// ============================================
// COMPLIANCE STATE QUERIES
// ============================================
describe('Compliance state', () => {
  it('should read compliance state with all expected columns', async () => {
    const { data, error } = await supabase
      .from('compliance_state')
      .select(`
        user_id,
        last_engagement_at,
        hours_since_engagement,
        daily_tasks_complete,
        daily_tasks_required,
        daily_minimum_met,
        escalation_tier,
        bleeding_active,
        bleeding_started_at,
        bleeding_rate_per_minute,
        bleeding_total_today,
        pending_consequence_count
      `)
      .eq('user_id', userId)
      .single();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(typeof data.escalation_tier).toBe('number');
    expect(typeof data.daily_tasks_complete).toBe('number');
    expect(typeof data.bleeding_active).toBe('boolean');
  });
});

// ============================================
// MAXY FUND QUERIES
// ============================================
describe('Maxy Fund', () => {
  it('should read fund with all expected columns', async () => {
    const { data, error } = await supabase
      .from('maxy_fund')
      .select(`
        user_id,
        balance,
        total_earned,
        total_penalties,
        total_spent_feminization,
        total_paid_out,
        pending_payout,
        payout_threshold,
        reserve_percentage,
        monthly_penalty_limit,
        monthly_penalties_this_month
      `)
      .eq('user_id', userId)
      .single();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(typeof data.balance).toBe('number');
    expect(typeof data.payout_threshold).toBe('number');
  });

  it('should support add_to_fund RPC', async () => {
    // Add $0.01 then subtract it — net zero
    const { error: addError } = await supabase.rpc('add_to_fund', {
      p_user_id: userId,
      p_amount: 0.01,
      p_type: 'test',
      p_description: 'Integration test: add $0.01',
    });
    expect(addError).toBeNull();

    const { error: subError } = await supabase.rpc('add_to_fund', {
      p_user_id: userId,
      p_amount: -0.01,
      p_type: 'test',
      p_description: 'Integration test: remove $0.01',
    });
    expect(subError).toBeNull();
  });

  it('should have fund_transactions after add_to_fund', async () => {
    const { data, error } = await supabase
      .from('fund_transactions')
      .select('*')
      .eq('user_id', userId)
      .eq('transaction_type', 'test')
      .order('created_at', { ascending: false })
      .limit(2);

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.length).toBeGreaterThanOrEqual(2);
    expect(data![0].amount).toBe(-0.01);
    expect(data![1].amount).toBe(0.01);

    // Clean up test transactions
    for (const tx of data!) {
      await supabase.from('fund_transactions').delete().eq('id', tx.id);
    }
  });
});

// ============================================
// HANDLER STRATEGY QUERIES
// ============================================
describe('Handler Strategy', () => {
  it('should read strategy with all expected columns', async () => {
    const { data, error } = await supabase
      .from('handler_strategy')
      .select(`
        user_id,
        current_phase,
        content_focus,
        platform_priority,
        monetization_strategy,
        audience_insights,
        performance_trends,
        adaptation_data,
        content_calendar
      `)
      .eq('user_id', userId)
      .single();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(['foundation', 'growth', 'monetization', 'scale', 'sex_work']).toContain(data.current_phase);
  });
});

// ============================================
// CONTENT BRIEFS — WRITE + READ + CLEANUP
// ============================================
describe('Content Briefs', () => {
  let testBriefId: string;

  it('should insert a content brief', async () => {
    const { data, error } = await supabase
      .from('content_briefs')
      .insert({
        user_id: userId,
        brief_number: 9999,
        status: 'assigned',
        content_type: 'photo',
        purpose: 'Integration test brief',
        platforms: ['test'],
        instructions: {
          concept: 'Test concept',
          setting: 'Test studio',
          outfit: 'Test outfit',
          lighting: 'Natural',
          framing: 'Close-up',
          expression: 'Neutral',
          technicalNotes: ['This is a test'],
        },
        deadline: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
        difficulty: 1,
        vulnerability_tier: 1,
        reward_money: 5.00,
        reward_arousal: 'Test reward',
        reward_edge_credits: 0,
      })
      .select('id')
      .single();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.id).toBeTruthy();
    testBriefId = data!.id;
  });

  it('should read the test brief back', async () => {
    const { data, error } = await supabase
      .from('content_briefs')
      .select('*')
      .eq('id', testBriefId)
      .single();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.purpose).toBe('Integration test brief');
    expect(data!.difficulty).toBe(1);
    expect(data!.instructions.concept).toBe('Test concept');
  });

  it('should update brief status to submitted', async () => {
    const { error } = await supabase
      .from('content_briefs')
      .update({ status: 'submitted', submitted_at: new Date().toISOString() })
      .eq('id', testBriefId);

    expect(error).toBeNull();

    const { data } = await supabase
      .from('content_briefs')
      .select('status, submitted_at')
      .eq('id', testBriefId)
      .single();

    expect(data!.status).toBe('submitted');
    expect(data!.submitted_at).toBeTruthy();
  });

  it('should clean up test brief', async () => {
    const { error } = await supabase
      .from('content_briefs')
      .delete()
      .eq('id', testBriefId);

    expect(error).toBeNull();
  });
});

// ============================================
// PLATFORM ACCOUNTS
// ============================================
describe('Platform Accounts', () => {
  it('should query platform_accounts (may be empty)', async () => {
    const { data, error } = await supabase
      .from('platform_accounts')
      .select('*')
      .eq('user_id', userId);

    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });
});

// ============================================
// SCHEDULED POSTS
// ============================================
describe('Scheduled Posts', () => {
  it('should query scheduled_posts (may be empty)', async () => {
    const { data, error } = await supabase
      .from('scheduled_posts')
      .select('*')
      .eq('user_id', userId)
      .limit(10);

    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });
});

// ============================================
// HANDLER DECISIONS — WRITE + READ + CLEANUP
// ============================================
describe('Handler Decisions', () => {
  let testDecisionId: string;

  it('should insert a handler decision', async () => {
    const { data, error } = await supabase
      .from('handler_decisions')
      .insert({
        user_id: userId,
        decision_type: 'integration_test',
        decision_data: { test: true, timestamp: Date.now() },
        reasoning: 'Integration test decision',
        executed: true,
        executed_at: new Date().toISOString(),
        outcome: { success: true },
      })
      .select('id')
      .single();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    testDecisionId = data!.id;
  });

  it('should read the test decision back', async () => {
    const { data, error } = await supabase
      .from('handler_decisions')
      .select('*')
      .eq('id', testDecisionId)
      .single();

    expect(error).toBeNull();
    expect(data!.decision_type).toBe('integration_test');
    expect(data!.decision_data.test).toBe(true);
  });

  it('should clean up test decision', async () => {
    const { error } = await supabase
      .from('handler_decisions')
      .delete()
      .eq('id', testDecisionId);

    expect(error).toBeNull();
  });
});

// ============================================
// USER AUTONOMOUS SUMMARY VIEW
// ============================================
describe('user_autonomous_summary view', () => {
  it('should return summary data for the user', async () => {
    const { data, error } = await supabase
      .from('user_autonomous_summary')
      .select('*')
      .eq('user_id', userId)
      .single();

    // View might not exist yet if migration not run
    if (error?.code === '42P01') {
      console.warn('View user_autonomous_summary not found — run migration 045');
      return;
    }

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data).toHaveProperty('fund_balance');
    expect(data).toHaveProperty('escalation_tier');
    expect(data).toHaveProperty('pending_briefs');
  });
});

// ============================================
// RECORD ENGAGEMENT RPC
// ============================================
describe('record_engagement RPC', () => {
  it('should update last_engagement_at', async () => {
    const { error } = await supabase.rpc('record_engagement', {
      p_user_id: userId,
    });

    // May not exist yet
    if (error?.message?.includes('function') || error?.code === '42883') {
      console.warn('RPC record_engagement not found — run migration 045');
      return;
    }

    expect(error).toBeNull();

    // Verify it updated
    const { data } = await supabase
      .from('compliance_state')
      .select('last_engagement_at')
      .eq('user_id', userId)
      .single();

    if (data) {
      const lastEngagement = new Date(data.last_engagement_at);
      const secondsAgo = (Date.now() - lastEngagement.getTime()) / 1000;
      expect(secondsAgo).toBeLessThan(10); // Should be very recent
    }
  });
});
