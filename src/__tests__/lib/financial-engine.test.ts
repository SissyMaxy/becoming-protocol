// Tests for financial-engine.ts - Handler financial system
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getFund,
  getTransactionHistory,
  processRevenue,
  executeConsequence,
  startBleeding,
  stopBleeding,
  processBleeding,
  allocateFunds,
  getTodayEarnings,
  getEarningsSummary,
  getPendingConsequences,
  markConsequenceCompleted,
  markConsequenceFailed,
  getFinancialSnapshot,
} from '../../lib/handler-v2/financial-engine';

// ============================================
// Supabase mock
// ============================================

// We need a reference to the mock chain factory so individual tests can
// override the default resolved values on a per-call basis.
const mockChainFactory = () => {
  const chain: any = {
    select: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    upsert: vi.fn(() => chain),
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
};

vi.mock('../../lib/supabase', () => {
  const mockChain = () => {
    const chain: any = {
      select: vi.fn(() => chain),
      insert: vi.fn(() => chain),
      update: vi.fn(() => chain),
      upsert: vi.fn(() => chain),
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
  };
  return {
    supabase: {
      from: vi.fn(() => mockChain()),
      rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
    },
  };
});

// Pull the mocked supabase so we can configure per-test behaviors
import { supabase } from '../../lib/supabase';
const mockedFrom = vi.mocked(supabase.from);
const mockedRpc = vi.mocked(supabase.rpc);

// ============================================
// Helpers
// ============================================

const TEST_USER = 'user-fin-test-001';

/**
 * Build a mock supabase chain where specific terminal calls resolve with
 * custom data. Returns the chain itself so callers can assert against
 * intermediate method calls (e.g. `.eq`, `.order`).
 */
function buildChain(overrides: {
  singleData?: any;
  singleError?: any;
  thenData?: any[];
  thenError?: any;
} = {}) {
  const chain: any = {
    select: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    upsert: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    neq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    lte: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    lt: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    single: vi.fn(() =>
      Promise.resolve({
        data: overrides.singleData ?? null,
        error: overrides.singleError ?? null,
      })
    ),
    then: vi.fn((cb: any) =>
      Promise.resolve({
        data: overrides.thenData ?? [],
        error: overrides.thenError ?? null,
      }).then(cb)
    ),
  };
  return chain;
}

/** A raw DB row that maps to a valid MaxyFund via mapFundRow. */
function makeFundRow(overrides: Record<string, unknown> = {}) {
  return {
    user_id: TEST_USER,
    balance: 250.0,
    total_earned: 1000.0,
    total_penalties: 50.0,
    total_spent_feminization: 100.0,
    total_paid_out: 200.0,
    pending_payout: 0,
    payout_threshold: 100,
    reserve_percentage: 0.2,
    monthly_penalty_limit: 500,
    monthly_penalties_this_month: 30,
    penalty_month: new Date().toISOString().slice(0, 7), // current month
    ...overrides,
  };
}

/** A raw DB row for a fund_transaction. */
function makeTransactionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'txn-001',
    user_id: TEST_USER,
    transaction_type: 'revenue',
    amount: 50,
    description: 'Test revenue',
    reference_id: null,
    reference_type: null,
    balance_after: 300,
    created_at: '2025-01-15T12:00:00.000Z',
    ...overrides,
  };
}

// ============================================
// Tests
// ============================================

describe('FinancialEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // mockReset clears mockReturnValueOnce queue + implementation; then re-set defaults
    mockedFrom.mockReset();
    mockedRpc.mockReset();
    mockedFrom.mockImplementation(() => {
      const chain: any = {
        select: vi.fn(() => chain),
        insert: vi.fn(() => chain),
        update: vi.fn(() => chain),
        upsert: vi.fn(() => chain),
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

  // ------------------------------------------
  // getFund
  // ------------------------------------------
  describe('getFund', () => {
    it('should query maxy_fund table by user_id', async () => {
      const fundRow = makeFundRow();
      // getFund makes multiple supabase.from('maxy_fund') calls:
      //   1. initial select -> single (fund row)
      //   2. ensureMonthlyPenaltyReset: select -> single (penalty_month row)
      //   3. re-fetch select -> single (refreshed row)
      // Each call to supabase.from() returns a new chain.
      const chain1 = buildChain({ singleData: fundRow });
      const chain2 = buildChain({ singleData: { penalty_month: new Date().toISOString().slice(0, 7), monthly_penalties_this_month: 30 } });
      const chain3 = buildChain({ singleData: fundRow });

      mockedFrom
        .mockReturnValueOnce(chain1)  // initial query
        .mockReturnValueOnce(chain2)  // ensureMonthlyPenaltyReset select
        .mockReturnValueOnce(chain3); // re-fetch

      const result = await getFund(TEST_USER);

      // The first call should target 'maxy_fund'
      expect(mockedFrom).toHaveBeenCalledWith('maxy_fund');
      // The chain should filter by user_id
      expect(chain1.select).toHaveBeenCalledWith('*');
      expect(chain1.eq).toHaveBeenCalledWith('user_id', TEST_USER);
      expect(chain1.single).toHaveBeenCalled();

      // Verify mapped result
      expect(result).not.toBeNull();
      expect(result!.userId).toBe(TEST_USER);
      expect(result!.balance).toBe(250);
      expect(result!.totalEarned).toBe(1000);
    });

    it('should return null when no fund exists', async () => {
      // All three from() calls return null data
      const emptyChain1 = buildChain({ singleData: null });
      const emptyChain2 = buildChain({ singleData: null });
      const emptyChain3 = buildChain({ singleData: null });

      mockedFrom
        .mockReturnValueOnce(emptyChain1)
        .mockReturnValueOnce(emptyChain2)
        .mockReturnValueOnce(emptyChain3);

      const result = await getFund(TEST_USER);
      expect(result).toBeNull();
    });

    it('should return null when query errors', async () => {
      const errorChain = buildChain({ singleData: null, singleError: { message: 'not found' } });
      mockedFrom.mockReturnValueOnce(errorChain);

      const result = await getFund(TEST_USER);
      expect(result).toBeNull();
    });

    it('should reset monthly penalties when month has rolled over', async () => {
      const fundRow = makeFundRow();
      const oldMonth = '2024-06'; // definitely a past month

      const chain1 = buildChain({ singleData: fundRow });
      // ensureMonthlyPenaltyReset detects old month
      const chain2 = buildChain({ singleData: { penalty_month: oldMonth, monthly_penalties_this_month: 120 } });
      // The reset update call
      const chain3 = buildChain({});
      // re-fetch
      const chain4 = buildChain({ singleData: makeFundRow({ monthly_penalties_this_month: 0 }) });

      mockedFrom
        .mockReturnValueOnce(chain1)
        .mockReturnValueOnce(chain2)
        .mockReturnValueOnce(chain3)  // update call for reset
        .mockReturnValueOnce(chain4); // re-fetch

      const result = await getFund(TEST_USER);

      // The reset update should have been issued
      expect(chain3.update).toHaveBeenCalledWith(
        expect.objectContaining({
          monthly_penalties_this_month: 0,
        })
      );
      expect(result).not.toBeNull();
      expect(result!.monthlyPenaltiesThisMonth).toBe(0);
    });

    it('should map default values for missing numeric fields', async () => {
      const sparseRow = { user_id: TEST_USER };
      const chain1 = buildChain({ singleData: sparseRow });
      const chain2 = buildChain({ singleData: { penalty_month: new Date().toISOString().slice(0, 7), monthly_penalties_this_month: 0 } });
      const chain3 = buildChain({ singleData: sparseRow });

      mockedFrom
        .mockReturnValueOnce(chain1)
        .mockReturnValueOnce(chain2)
        .mockReturnValueOnce(chain3);

      const result = await getFund(TEST_USER);

      expect(result).not.toBeNull();
      expect(result!.balance).toBe(0);
      expect(result!.totalEarned).toBe(0);
      expect(result!.payoutThreshold).toBe(100);
      expect(result!.reservePercentage).toBe(0.2);
      expect(result!.monthlyPenaltyLimit).toBe(500);
    });
  });

  // ------------------------------------------
  // processRevenue
  // ------------------------------------------
  describe('processRevenue', () => {
    it('should insert revenue event', async () => {
      const insertChain = buildChain({ singleData: { id: 'rev-001' } });
      mockedFrom.mockReturnValueOnce(insertChain);
      mockedRpc.mockResolvedValueOnce({ data: 300, error: null } as any);

      const event = {
        userId: TEST_USER,
        platform: 'OnlyFans',
        revenueType: 'subscription',
        amount: 50,
        currency: 'USD',
        netAmount: 40,
        subscriberId: 'sub-123',
        subscriberName: 'TestSub',
        contentId: null,
      };

      await processRevenue(TEST_USER, event);

      expect(mockedFrom).toHaveBeenCalledWith('revenue_events');
      expect(insertChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: TEST_USER,
          platform: 'OnlyFans',
          revenue_type: 'subscription',
          amount: 50,
          currency: 'USD',
          net_amount: 40,
          subscriber_id: 'sub-123',
          subscriber_name: 'TestSub',
          processed: true,
        })
      );
    });

    it('should call add_to_fund RPC with net amount', async () => {
      const insertChain = buildChain({ singleData: { id: 'rev-002' } });
      mockedFrom.mockReturnValueOnce(insertChain);
      mockedRpc.mockResolvedValueOnce({ data: 340, error: null } as any);

      const event = {
        userId: TEST_USER,
        platform: 'Fansly',
        revenueType: 'tip',
        amount: 100,
        currency: 'USD',
        netAmount: 80,
        subscriberId: null,
        subscriberName: null,
        contentId: null,
      };

      const newBalance = await processRevenue(TEST_USER, event);

      expect(mockedRpc).toHaveBeenCalledWith('add_to_fund', {
        p_user_id: TEST_USER,
        p_amount: 80, // Uses netAmount when available
        p_type: 'revenue',
        p_description: expect.stringContaining('Fansly tip'),
        p_reference_id: 'rev-002',
      });
      expect(newBalance).toBe(340);
    });

    it('should use gross amount when netAmount is null', async () => {
      const insertChain = buildChain({ singleData: { id: 'rev-003' } });
      mockedFrom.mockReturnValueOnce(insertChain);
      mockedRpc.mockResolvedValueOnce({ data: 200, error: null } as any);

      const event = {
        userId: TEST_USER,
        platform: 'OnlyFans',
        revenueType: 'ppv',
        amount: 25,
        currency: 'USD',
        netAmount: null,
        subscriberId: null,
        subscriberName: null,
        contentId: 'content-abc',
      };

      await processRevenue(TEST_USER, event);

      expect(mockedRpc).toHaveBeenCalledWith('add_to_fund', expect.objectContaining({
        p_amount: 25, // Falls back to gross amount
      }));
    });

    it('should return 0 when insert fails', async () => {
      const errorChain = buildChain({ singleData: null, singleError: { message: 'insert failed' } });
      mockedFrom.mockReturnValueOnce(errorChain);

      const event = {
        userId: TEST_USER,
        platform: 'OnlyFans',
        revenueType: 'subscription',
        amount: 50,
        currency: 'USD',
        netAmount: null,
        subscriberId: null,
        subscriberName: null,
        contentId: null,
      };

      const result = await processRevenue(TEST_USER, event);
      expect(result).toBe(0);
      // RPC should not have been called
      expect(mockedRpc).not.toHaveBeenCalled();
    });

    it('should return 0 when RPC fails', async () => {
      const insertChain = buildChain({ singleData: { id: 'rev-004' } });
      mockedFrom.mockReturnValueOnce(insertChain);
      mockedRpc.mockResolvedValueOnce({ data: null, error: { message: 'rpc error' } } as any);

      const event = {
        userId: TEST_USER,
        platform: 'OnlyFans',
        revenueType: 'subscription',
        amount: 50,
        currency: 'USD',
        netAmount: 40,
        subscriberId: null,
        subscriberName: null,
        contentId: null,
      };

      const result = await processRevenue(TEST_USER, event);
      expect(result).toBe(0);
    });

    it('should include subscriber name in description when provided', async () => {
      const insertChain = buildChain({ singleData: { id: 'rev-005' } });
      mockedFrom.mockReturnValueOnce(insertChain);
      mockedRpc.mockResolvedValueOnce({ data: 100, error: null } as any);

      const event = {
        userId: TEST_USER,
        platform: 'OnlyFans',
        revenueType: 'tip',
        amount: 20,
        currency: 'USD',
        netAmount: 16,
        subscriberId: 'sub-456',
        subscriberName: 'BigTipper',
        contentId: null,
      };

      await processRevenue(TEST_USER, event);

      expect(mockedRpc).toHaveBeenCalledWith('add_to_fund', expect.objectContaining({
        p_description: expect.stringContaining('BigTipper'),
      }));
    });
  });

  // ------------------------------------------
  // executeConsequence
  // ------------------------------------------
  describe('executeConsequence', () => {
    it('should insert penalty transaction via RPC when fund has balance', async () => {
      const fundRow = makeFundRow({ balance: 100, monthly_penalties_this_month: 0 });
      const currentMonth = new Date().toISOString().slice(0, 7);

      // ensureMonthlyPenaltyReset: select penalty_month
      const resetChain = buildChain({ singleData: { penalty_month: currentMonth, monthly_penalties_this_month: 0 } });
      // getFund chain 1: initial select
      const fundChain1 = buildChain({ singleData: fundRow });
      // getFund -> ensureMonthlyPenaltyReset: select penalty_month
      const fundResetChain = buildChain({ singleData: { penalty_month: currentMonth, monthly_penalties_this_month: 0 } });
      // getFund chain 2: re-fetch
      const fundChain2 = buildChain({ singleData: fundRow });

      mockedFrom
        .mockReturnValueOnce(resetChain)         // ensureMonthlyPenaltyReset
        .mockReturnValueOnce(fundChain1)          // getFund initial
        .mockReturnValueOnce(fundResetChain)      // getFund -> ensureMonthlyPenaltyReset
        .mockReturnValueOnce(fundChain2);         // getFund re-fetch

      // RPC for add_to_fund (penalty deduction)
      mockedRpc.mockResolvedValueOnce({ data: 75, error: null } as any);

      // incrementMonthlyPenalties RPC
      mockedRpc.mockResolvedValueOnce({ data: null, error: null } as any);

      // incrementMonthlyPenalties fallback: select + update
      const incSelectChain = buildChain({ singleData: { monthly_penalties_this_month: 0 } });
      const incUpdateChain = buildChain({});
      mockedFrom
        .mockReturnValueOnce(incSelectChain)
        .mockReturnValueOnce(incUpdateChain);

      // financial_consequences insert (for fund portion)
      const consequenceChain = buildChain({});
      mockedFrom.mockReturnValueOnce(consequenceChain);

      await executeConsequence(TEST_USER, 25, 'Failed daily task');

      // Should have called RPC to deduct from fund
      expect(mockedRpc).toHaveBeenCalledWith('add_to_fund', expect.objectContaining({
        p_user_id: TEST_USER,
        p_amount: -25,
        p_type: 'penalty',
        p_description: expect.stringContaining('Failed daily task'),
      }));
    });

    it('should respect monthly penalty limit', async () => {
      const currentMonth = new Date().toISOString().slice(0, 7);
      // Fund with monthly limit of 500, already used 500
      const fundRow = makeFundRow({
        balance: 1000,
        monthly_penalty_limit: 500,
        monthly_penalties_this_month: 500,
      });

      // ensureMonthlyPenaltyReset
      const resetChain = buildChain({ singleData: { penalty_month: currentMonth, monthly_penalties_this_month: 500 } });
      // getFund: initial
      const fundChain1 = buildChain({ singleData: fundRow });
      // getFund -> ensureMonthlyPenaltyReset
      const fundResetChain = buildChain({ singleData: { penalty_month: currentMonth, monthly_penalties_this_month: 500 } });
      // getFund: re-fetch
      const fundChain2 = buildChain({ singleData: fundRow });

      mockedFrom
        .mockReturnValueOnce(resetChain)
        .mockReturnValueOnce(fundChain1)
        .mockReturnValueOnce(fundResetChain)
        .mockReturnValueOnce(fundChain2);

      // limit_reached insert
      const limitChain = buildChain({});
      mockedFrom.mockReturnValueOnce(limitChain);

      await executeConsequence(TEST_USER, 100, 'Exceeds monthly limit');

      // Should NOT call add_to_fund RPC since limit is exhausted
      expect(mockedRpc).not.toHaveBeenCalledWith('add_to_fund', expect.anything());

      // Should insert a limit_reached record
      expect(limitChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'limit_reached',
          user_id: TEST_USER,
        })
      );
    });

    it('should log the consequence with completed status', async () => {
      const currentMonth = new Date().toISOString().slice(0, 7);
      const fundRow = makeFundRow({ balance: 500, monthly_penalties_this_month: 0 });

      const resetChain = buildChain({ singleData: { penalty_month: currentMonth, monthly_penalties_this_month: 0 } });
      const fundChain1 = buildChain({ singleData: fundRow });
      const fundResetChain = buildChain({ singleData: { penalty_month: currentMonth, monthly_penalties_this_month: 0 } });
      const fundChain2 = buildChain({ singleData: fundRow });

      mockedFrom
        .mockReturnValueOnce(resetChain)
        .mockReturnValueOnce(fundChain1)
        .mockReturnValueOnce(fundResetChain)
        .mockReturnValueOnce(fundChain2);

      mockedRpc.mockResolvedValueOnce({ data: 450, error: null } as any);
      // incrementMonthlyPenalties RPC
      mockedRpc.mockResolvedValueOnce({ data: null, error: null } as any);

      // incrementMonthlyPenalties fallback select + update
      const incSelectChain = buildChain({ singleData: { monthly_penalties_this_month: 0 } });
      const incUpdateChain = buildChain({});
      mockedFrom
        .mockReturnValueOnce(incSelectChain)
        .mockReturnValueOnce(incUpdateChain);

      // consequence record insert
      const consequenceInsertChain = buildChain({});
      mockedFrom.mockReturnValueOnce(consequenceInsertChain);

      await executeConsequence(TEST_USER, 50, 'Missed check-in');

      // Should log the completed consequence
      expect(consequenceInsertChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: TEST_USER,
          trigger_reason: 'Missed check-in',
          amount_cents: 5000, // 50 * 100
          currency: 'usd',
          status: 'completed',
        })
      );
    });

    it('should skip when amount is zero or negative', async () => {
      await executeConsequence(TEST_USER, 0, 'Zero amount');
      await executeConsequence(TEST_USER, -10, 'Negative amount');

      expect(mockedFrom).not.toHaveBeenCalled();
      expect(mockedRpc).not.toHaveBeenCalled();
    });

    it('should create pending Stripe charge when fund balance is insufficient', async () => {
      const currentMonth = new Date().toISOString().slice(0, 7);
      // Fund with only $10 balance
      const fundRow = makeFundRow({ balance: 10, monthly_penalties_this_month: 0 });

      const resetChain = buildChain({ singleData: { penalty_month: currentMonth, monthly_penalties_this_month: 0 } });
      const fundChain1 = buildChain({ singleData: fundRow });
      const fundResetChain = buildChain({ singleData: { penalty_month: currentMonth, monthly_penalties_this_month: 0 } });
      const fundChain2 = buildChain({ singleData: fundRow });

      mockedFrom
        .mockReturnValueOnce(resetChain)
        .mockReturnValueOnce(fundChain1)
        .mockReturnValueOnce(fundResetChain)
        .mockReturnValueOnce(fundChain2);

      // RPC for fund portion ($10)
      mockedRpc.mockResolvedValueOnce({ data: 0, error: null } as any);

      // Stripe pending consequence insert
      const stripeConsequenceChain = buildChain({});
      mockedFrom.mockReturnValueOnce(stripeConsequenceChain);

      // Stripe pending fund_transactions insert
      const stripeTxChain = buildChain({});
      mockedFrom.mockReturnValueOnce(stripeTxChain);

      // incrementMonthlyPenalties RPC
      mockedRpc.mockResolvedValueOnce({ data: null, error: null } as any);
      // incrementMonthlyPenalties fallback select + update
      const incSelectChain = buildChain({ singleData: { monthly_penalties_this_month: 0 } });
      const incUpdateChain = buildChain({});
      mockedFrom
        .mockReturnValueOnce(incSelectChain)
        .mockReturnValueOnce(incUpdateChain);

      // completed consequence insert (fund portion)
      const completedChain = buildChain({});
      mockedFrom.mockReturnValueOnce(completedChain);

      await executeConsequence(TEST_USER, 50, 'Large penalty');

      // Should insert pending Stripe consequence for the $40 overage
      expect(stripeConsequenceChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'pending',
          amount_cents: 4000, // (50 - 10) * 100
          trigger_reason: 'Large penalty',
        })
      );
    });

    it('should skip when no fund record exists', async () => {
      const currentMonth = new Date().toISOString().slice(0, 7);
      const resetChain = buildChain({ singleData: { penalty_month: currentMonth, monthly_penalties_this_month: 0 } });
      // getFund returns null
      const fundChain1 = buildChain({ singleData: null, singleError: { message: 'not found' } });

      mockedFrom
        .mockReturnValueOnce(resetChain)
        .mockReturnValueOnce(fundChain1);

      await executeConsequence(TEST_USER, 25, 'No fund exists');

      // Should not call RPC
      expect(mockedRpc).not.toHaveBeenCalled();
    });
  });

  // ------------------------------------------
  // startBleeding
  // ------------------------------------------
  describe('startBleeding', () => {
    it('should update compliance state with bleeding active', async () => {
      const chain = buildChain({});
      mockedFrom.mockReturnValueOnce(chain);

      await startBleeding(TEST_USER);

      expect(mockedFrom).toHaveBeenCalledWith('compliance_state');
      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          bleeding_active: true,
          bleeding_rate_per_minute: 0.25,
        })
      );
      expect(chain.eq).toHaveBeenCalledWith('user_id', TEST_USER);
    });

    it('should default to $0.25/min rate', async () => {
      const chain = buildChain({});
      mockedFrom.mockReturnValueOnce(chain);

      await startBleeding(TEST_USER);

      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          bleeding_rate_per_minute: 0.25,
        })
      );
    });

    it('should accept custom rate', async () => {
      const chain = buildChain({});
      mockedFrom.mockReturnValueOnce(chain);

      await startBleeding(TEST_USER, 0.50);

      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          bleeding_rate_per_minute: 0.50,
        })
      );
    });

    it('should set bleeding_started_at to current time', async () => {
      const chain = buildChain({});
      mockedFrom.mockReturnValueOnce(chain);

      const before = new Date().toISOString();
      await startBleeding(TEST_USER);

      const updateArg = chain.update.mock.calls[0][0];
      expect(updateArg.bleeding_started_at).toBeDefined();
      // The timestamp should be a valid ISO string
      expect(new Date(updateArg.bleeding_started_at).toISOString()).toBe(updateArg.bleeding_started_at);
    });
  });

  // ------------------------------------------
  // stopBleeding
  // ------------------------------------------
  describe('stopBleeding', () => {
    it('should set bleeding_active to false', async () => {
      // processBleeding is called first inside stopBleeding.
      // processBleeding: select compliance_state
      const processChain = buildChain({
        singleData: {
          bleeding_active: false, // inactive so processBleeding returns 0
          bleeding_started_at: null,
          bleeding_rate_per_minute: 0.25,
          bleeding_total_today: 5,
          last_compliance_check: null,
        },
      });
      mockedFrom.mockReturnValueOnce(processChain);

      // stopBleeding: select bleeding_total_today
      const totalChain = buildChain({ singleData: { bleeding_total_today: 5 } });
      mockedFrom.mockReturnValueOnce(totalChain);

      // stopBleeding: update to set bleeding_active = false
      const updateChain = buildChain({});
      mockedFrom.mockReturnValueOnce(updateChain);

      const result = await stopBleeding(TEST_USER);

      expect(updateChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          bleeding_active: false,
          bleeding_started_at: null,
        })
      );
      expect(updateChain.eq).toHaveBeenCalledWith('user_id', TEST_USER);
      expect(result).toEqual({ totalBled: 5 });
    });

    it('should process outstanding bleeding before stopping', async () => {
      // processBleeding finds active bleeding
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const processChain = buildChain({
        singleData: {
          bleeding_active: true,
          bleeding_started_at: fiveMinutesAgo,
          bleeding_rate_per_minute: 0.25,
          bleeding_total_today: 2,
          last_compliance_check: null,
        },
      });
      mockedFrom.mockReturnValueOnce(processChain);

      // processBleeding -> ensureMonthlyPenaltyReset
      const currentMonth = new Date().toISOString().slice(0, 7);
      const penaltyResetChain = buildChain({ singleData: { penalty_month: currentMonth, monthly_penalties_this_month: 10 } });
      mockedFrom.mockReturnValueOnce(penaltyResetChain);

      // processBleeding -> getFund (initial)
      const fundRow = makeFundRow({ balance: 500, monthly_penalties_this_month: 10 });
      const fundChain1 = buildChain({ singleData: fundRow });
      mockedFrom.mockReturnValueOnce(fundChain1);
      // getFund -> ensureMonthlyPenaltyReset
      const fundResetChain = buildChain({ singleData: { penalty_month: currentMonth, monthly_penalties_this_month: 10 } });
      mockedFrom.mockReturnValueOnce(fundResetChain);
      // getFund -> re-fetch
      const fundChain2 = buildChain({ singleData: fundRow });
      mockedFrom.mockReturnValueOnce(fundChain2);

      // RPC add_to_fund for bleed deduction
      mockedRpc.mockResolvedValueOnce({ data: 498.75, error: null } as any);

      // processBleeding: update compliance_state checkpoint
      const checkpointChain = buildChain({});
      mockedFrom.mockReturnValueOnce(checkpointChain);

      // incrementMonthlyPenalties RPC
      mockedRpc.mockResolvedValueOnce({ data: null, error: null } as any);
      // incrementMonthlyPenalties fallback
      const incSelChain = buildChain({ singleData: { monthly_penalties_this_month: 10 } });
      const incUpdChain = buildChain({});
      mockedFrom
        .mockReturnValueOnce(incSelChain)
        .mockReturnValueOnce(incUpdChain);

      // stopBleeding: select bleeding_total_today
      const totalChain = buildChain({ singleData: { bleeding_total_today: 3.25 } });
      mockedFrom.mockReturnValueOnce(totalChain);

      // stopBleeding: update bleeding_active = false
      const stopChain = buildChain({});
      mockedFrom.mockReturnValueOnce(stopChain);

      const result = await stopBleeding(TEST_USER);

      // add_to_fund should have been called for bleed deduction
      expect(mockedRpc).toHaveBeenCalledWith('add_to_fund', expect.objectContaining({
        p_type: 'bleeding',
      }));
      // bleeding should be stopped
      expect(stopChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          bleeding_active: false,
        })
      );
      // totalBled should be > 0
      expect(result.totalBled).toBeGreaterThan(0);
    });
  });

  // ------------------------------------------
  // processBleeding
  // ------------------------------------------
  describe('processBleeding', () => {
    it('should calculate correct amount based on elapsed time', async () => {
      // 10 minutes ago at $0.25/min = $2.50
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const currentMonth = new Date().toISOString().slice(0, 7);

      const stateChain = buildChain({
        singleData: {
          bleeding_active: true,
          bleeding_started_at: tenMinutesAgo,
          bleeding_rate_per_minute: 0.25,
          bleeding_total_today: 0,
          last_compliance_check: null,
        },
      });
      mockedFrom.mockReturnValueOnce(stateChain);

      // ensureMonthlyPenaltyReset
      const resetChain = buildChain({ singleData: { penalty_month: currentMonth, monthly_penalties_this_month: 0 } });
      mockedFrom.mockReturnValueOnce(resetChain);

      // getFund
      const fundRow = makeFundRow({ balance: 1000, monthly_penalties_this_month: 0 });
      const fundChain1 = buildChain({ singleData: fundRow });
      const fundResetChain = buildChain({ singleData: { penalty_month: currentMonth, monthly_penalties_this_month: 0 } });
      const fundChain2 = buildChain({ singleData: fundRow });
      mockedFrom
        .mockReturnValueOnce(fundChain1)
        .mockReturnValueOnce(fundResetChain)
        .mockReturnValueOnce(fundChain2);

      // RPC add_to_fund deduction
      mockedRpc.mockResolvedValueOnce({ data: 997.5, error: null } as any);

      // update compliance_state checkpoint
      const checkpointChain = buildChain({});
      mockedFrom.mockReturnValueOnce(checkpointChain);

      // incrementMonthlyPenalties
      mockedRpc.mockResolvedValueOnce({ data: null, error: null } as any);
      const incSelChain = buildChain({ singleData: { monthly_penalties_this_month: 0 } });
      const incUpdChain = buildChain({});
      mockedFrom.mockReturnValueOnce(incSelChain).mockReturnValueOnce(incUpdChain);

      const bledAmount = await processBleeding(TEST_USER);

      // Should be approximately $2.50 (10 min * $0.25/min)
      expect(bledAmount).toBeCloseTo(2.5, 1);

      // RPC should be called with negative amount
      expect(mockedRpc).toHaveBeenCalledWith('add_to_fund', expect.objectContaining({
        p_amount: expect.any(Number),
        p_type: 'bleeding',
        p_description: expect.stringContaining('min @'),
      }));

      // Verify the actual RPC amount is negative and approximately -2.50
      const rpcCall = mockedRpc.mock.calls.find(
        (call) => call[0] === 'add_to_fund' && (call[1] as any).p_type === 'bleeding'
      );
      expect(rpcCall).toBeDefined();
      expect((rpcCall![1] as any).p_amount).toBeLessThan(0);
      expect(Math.abs((rpcCall![1] as any).p_amount)).toBeCloseTo(2.5, 1);
    });

    it('should return 0 when bleeding is not active', async () => {
      const chain = buildChain({
        singleData: {
          bleeding_active: false,
          bleeding_started_at: null,
          bleeding_rate_per_minute: 0.25,
          bleeding_total_today: 0,
          last_compliance_check: null,
        },
      });
      mockedFrom.mockReturnValueOnce(chain);

      const result = await processBleeding(TEST_USER);
      expect(result).toBe(0);
    });

    it('should return 0 when less than 30 seconds have elapsed', async () => {
      // 10 seconds ago -- below the 30-second minimum
      const tenSecondsAgo = new Date(Date.now() - 10 * 1000).toISOString();

      const chain = buildChain({
        singleData: {
          bleeding_active: true,
          bleeding_started_at: tenSecondsAgo,
          bleeding_rate_per_minute: 0.25,
          bleeding_total_today: 0,
          last_compliance_check: null,
        },
      });
      mockedFrom.mockReturnValueOnce(chain);

      const result = await processBleeding(TEST_USER);
      expect(result).toBe(0);
      // No RPC call should have been made
      expect(mockedRpc).not.toHaveBeenCalled();
    });

    it('should cap bleeding at monthly limit', async () => {
      // 60 minutes elapsed at $10/min = $600, but monthly limit is $500 with $490 already used
      const sixtyMinutesAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const currentMonth = new Date().toISOString().slice(0, 7);

      const stateChain = buildChain({
        singleData: {
          bleeding_active: true,
          bleeding_started_at: sixtyMinutesAgo,
          bleeding_rate_per_minute: 10,
          bleeding_total_today: 0,
          last_compliance_check: null,
        },
      });
      mockedFrom.mockReturnValueOnce(stateChain);

      // ensureMonthlyPenaltyReset
      const resetChain = buildChain({ singleData: { penalty_month: currentMonth, monthly_penalties_this_month: 490 } });
      mockedFrom.mockReturnValueOnce(resetChain);

      // getFund
      const fundRow = makeFundRow({
        balance: 1000,
        monthly_penalty_limit: 500,
        monthly_penalties_this_month: 490,
      });
      const fundChain1 = buildChain({ singleData: fundRow });
      const fundResetChain = buildChain({ singleData: { penalty_month: currentMonth, monthly_penalties_this_month: 490 } });
      const fundChain2 = buildChain({ singleData: fundRow });
      mockedFrom
        .mockReturnValueOnce(fundChain1)
        .mockReturnValueOnce(fundResetChain)
        .mockReturnValueOnce(fundChain2);

      // RPC: should deduct only $10 (remaining allowance)
      mockedRpc.mockResolvedValueOnce({ data: 990, error: null } as any);

      // update compliance_state checkpoint
      const checkpointChain = buildChain({});
      mockedFrom.mockReturnValueOnce(checkpointChain);

      // incrementMonthlyPenalties
      mockedRpc.mockResolvedValueOnce({ data: null, error: null } as any);
      const incSelChain = buildChain({ singleData: { monthly_penalties_this_month: 490 } });
      const incUpdChain = buildChain({});
      mockedFrom.mockReturnValueOnce(incSelChain).mockReturnValueOnce(incUpdChain);

      const bledAmount = await processBleeding(TEST_USER);

      // Should be capped at $10 (500 limit - 490 already used)
      expect(bledAmount).toBe(10);
    });

    it('should return 0 when no compliance state exists', async () => {
      const chain = buildChain({ singleData: null, singleError: { message: 'not found' } });
      mockedFrom.mockReturnValueOnce(chain);

      const result = await processBleeding(TEST_USER);
      expect(result).toBe(0);
    });

    it('should use last_compliance_check as start point when more recent', async () => {
      // bleeding started 30 min ago, but last check was 5 min ago
      const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const currentMonth = new Date().toISOString().slice(0, 7);

      const stateChain = buildChain({
        singleData: {
          bleeding_active: true,
          bleeding_started_at: thirtyMinAgo,
          bleeding_rate_per_minute: 1.00,
          bleeding_total_today: 25,
          last_compliance_check: fiveMinAgo,
        },
      });
      mockedFrom.mockReturnValueOnce(stateChain);

      // ensureMonthlyPenaltyReset
      const resetChain = buildChain({ singleData: { penalty_month: currentMonth, monthly_penalties_this_month: 0 } });
      mockedFrom.mockReturnValueOnce(resetChain);

      // getFund
      const fundRow = makeFundRow({ balance: 1000, monthly_penalties_this_month: 0 });
      const fundChain1 = buildChain({ singleData: fundRow });
      const fundResetChain = buildChain({ singleData: { penalty_month: currentMonth, monthly_penalties_this_month: 0 } });
      const fundChain2 = buildChain({ singleData: fundRow });
      mockedFrom
        .mockReturnValueOnce(fundChain1)
        .mockReturnValueOnce(fundResetChain)
        .mockReturnValueOnce(fundChain2);

      // RPC deduction
      mockedRpc.mockResolvedValueOnce({ data: 995, error: null } as any);

      // checkpoint update
      const checkpointChain = buildChain({});
      mockedFrom.mockReturnValueOnce(checkpointChain);

      // incrementMonthlyPenalties
      mockedRpc.mockResolvedValueOnce({ data: null, error: null } as any);
      const incSelChain = buildChain({ singleData: { monthly_penalties_this_month: 0 } });
      const incUpdChain = buildChain({});
      mockedFrom.mockReturnValueOnce(incSelChain).mockReturnValueOnce(incUpdChain);

      const bledAmount = await processBleeding(TEST_USER);

      // Should be approximately $5.00 (5 min * $1.00/min) not $30 (30 min)
      expect(bledAmount).toBeCloseTo(5, 0);
      expect(bledAmount).toBeLessThan(10); // definitely not 30 minutes worth
    });
  });

  // ------------------------------------------
  // getTransactionHistory
  // ------------------------------------------
  describe('getTransactionHistory', () => {
    it('should query fund_transactions with limit', async () => {
      const rows = [
        makeTransactionRow({ id: 'txn-001', amount: 50, created_at: '2025-01-15T12:00:00Z' }),
        makeTransactionRow({ id: 'txn-002', amount: -25, created_at: '2025-01-14T12:00:00Z' }),
      ];

      const chain = buildChain({ thenData: rows });
      mockedFrom.mockReturnValueOnce(chain);

      const result = await getTransactionHistory(TEST_USER, 10);

      expect(mockedFrom).toHaveBeenCalledWith('fund_transactions');
      expect(chain.select).toHaveBeenCalledWith('*');
      expect(chain.eq).toHaveBeenCalledWith('user_id', TEST_USER);
      expect(chain.limit).toHaveBeenCalledWith(10);
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('txn-001');
      expect(result[1].amount).toBe(-25);
    });

    it('should order by created_at desc', async () => {
      const chain = buildChain({ thenData: [] });
      mockedFrom.mockReturnValueOnce(chain);

      await getTransactionHistory(TEST_USER);

      expect(chain.order).toHaveBeenCalledWith('created_at', { ascending: false });
    });

    it('should default limit to 50', async () => {
      const chain = buildChain({ thenData: [] });
      mockedFrom.mockReturnValueOnce(chain);

      await getTransactionHistory(TEST_USER);

      expect(chain.limit).toHaveBeenCalledWith(50);
    });

    it('should return empty array on error', async () => {
      const chain = buildChain({ thenData: undefined as any, thenError: { message: 'db error' } });
      // Override the then to simulate an error path
      chain.then = vi.fn((cb: any) =>
        Promise.resolve({ data: null, error: { message: 'db error' } }).then(cb)
      );
      mockedFrom.mockReturnValueOnce(chain);

      const result = await getTransactionHistory(TEST_USER);
      expect(result).toEqual([]);
    });

    it('should map database rows to FundTransaction interface', async () => {
      const row = makeTransactionRow({
        id: 'txn-mapped',
        transaction_type: 'penalty',
        amount: -30,
        description: 'Test penalty',
        reference_id: 'ref-123',
        reference_type: 'financial_consequence',
        balance_after: 270,
      });

      const chain = buildChain({ thenData: [row] });
      mockedFrom.mockReturnValueOnce(chain);

      const result = await getTransactionHistory(TEST_USER, 1);

      expect(result[0]).toEqual({
        id: 'txn-mapped',
        userId: TEST_USER,
        transactionType: 'penalty',
        amount: -30,
        description: 'Test penalty',
        referenceId: 'ref-123',
        referenceType: 'financial_consequence',
        balanceAfter: 270,
        createdAt: expect.any(String),
      });
    });
  });

  // ------------------------------------------
  // getEarningsSummary
  // ------------------------------------------
  describe('getEarningsSummary', () => {
    it('should aggregate revenue by time period', async () => {
      const rows = [
        { amount: 100, platform: 'OnlyFans', revenue_type: 'subscription' },
        { amount: 50, platform: 'OnlyFans', revenue_type: 'tip' },
        { amount: 75, platform: 'Fansly', revenue_type: 'subscription' },
      ];

      const chain = buildChain({ thenData: rows });
      mockedFrom.mockReturnValueOnce(chain);

      const result = await getEarningsSummary(TEST_USER, 30);

      expect(mockedFrom).toHaveBeenCalledWith('revenue_events');
      expect(chain.select).toHaveBeenCalledWith('amount, platform, revenue_type');
      expect(chain.eq).toHaveBeenCalledWith('user_id', TEST_USER);
      expect(chain.gte).toHaveBeenCalledWith('created_at', expect.any(String));

      expect(result.total).toBe(225);
      expect(result.byPlatform).toEqual({
        OnlyFans: 150,
        Fansly: 75,
      });
      expect(result.byType).toEqual({
        subscription: 175,
        tip: 50,
      });
    });

    it('should return zeroed summary on error', async () => {
      const chain = buildChain({});
      chain.then = vi.fn((cb: any) =>
        Promise.resolve({ data: null, error: { message: 'error' } }).then(cb)
      );
      mockedFrom.mockReturnValueOnce(chain);

      const result = await getEarningsSummary(TEST_USER);

      expect(result).toEqual({ total: 0, byPlatform: {}, byType: {} });
    });

    it('should default to 30 days', async () => {
      const chain = buildChain({ thenData: [] });
      mockedFrom.mockReturnValueOnce(chain);

      await getEarningsSummary(TEST_USER);

      // The gte call should use a date approximately 30 days ago
      const gteCallArg = chain.gte.mock.calls[0]?.[1];
      expect(gteCallArg).toBeDefined();
      const sinceDate = new Date(gteCallArg);
      const expectedDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      // Should be within 5 seconds of the expected date
      expect(Math.abs(sinceDate.getTime() - expectedDate.getTime())).toBeLessThan(5000);
    });

    it('should handle single-platform data', async () => {
      const rows = [
        { amount: 10, platform: 'Fansly', revenue_type: 'tip' },
        { amount: 20, platform: 'Fansly', revenue_type: 'tip' },
      ];

      const chain = buildChain({ thenData: rows });
      mockedFrom.mockReturnValueOnce(chain);

      const result = await getEarningsSummary(TEST_USER, 7);

      expect(result.total).toBe(30);
      expect(result.byPlatform).toEqual({ Fansly: 30 });
      expect(result.byType).toEqual({ tip: 30 });
    });

    it('should handle empty data', async () => {
      const chain = buildChain({ thenData: [] });
      mockedFrom.mockReturnValueOnce(chain);

      const result = await getEarningsSummary(TEST_USER, 7);

      expect(result.total).toBe(0);
      expect(result.byPlatform).toEqual({});
      expect(result.byType).toEqual({});
    });
  });

  // ------------------------------------------
  // getTodayEarnings
  // ------------------------------------------
  describe('getTodayEarnings', () => {
    it('should query revenue_events for today', async () => {
      const rows = [{ amount: 30 }, { amount: 20 }, { amount: 50 }];
      const chain = buildChain({ thenData: rows });
      mockedFrom.mockReturnValueOnce(chain);

      const result = await getTodayEarnings(TEST_USER);

      expect(mockedFrom).toHaveBeenCalledWith('revenue_events');
      expect(chain.select).toHaveBeenCalledWith('amount');
      expect(chain.eq).toHaveBeenCalledWith('user_id', TEST_USER);

      // Should use today's date boundaries
      const today = new Date().toISOString().split('T')[0];
      expect(chain.gte).toHaveBeenCalledWith('created_at', `${today}T00:00:00.000Z`);
      expect(chain.lt).toHaveBeenCalledWith('created_at', `${today}T23:59:59.999Z`);

      expect(result).toBe(100);
    });

    it('should return 0 when no earnings today', async () => {
      const chain = buildChain({ thenData: [] });
      mockedFrom.mockReturnValueOnce(chain);

      const result = await getTodayEarnings(TEST_USER);
      expect(result).toBe(0);
    });

    it('should return 0 on error', async () => {
      const chain = buildChain({});
      chain.then = vi.fn((cb: any) =>
        Promise.resolve({ data: null, error: { message: 'err' } }).then(cb)
      );
      mockedFrom.mockReturnValueOnce(chain);

      const result = await getTodayEarnings(TEST_USER);
      expect(result).toBe(0);
    });
  });

  // ------------------------------------------
  // getPendingConsequences
  // ------------------------------------------
  describe('getPendingConsequences', () => {
    it('should query financial_consequences with pending status', async () => {
      const rows = [
        {
          id: 'cons-001',
          user_id: TEST_USER,
          trigger_reason: 'Missed task',
          amount_cents: 2500,
          currency: 'usd',
          target_org: null,
          status: 'pending',
          stripe_payment_id: null,
          processed_at: null,
          error_message: null,
          enforcement_tier: 1,
          consecutive_days_noncompliant: 3,
          created_at: '2025-01-15T10:00:00Z',
        },
      ];

      const chain = buildChain({ thenData: rows });
      mockedFrom.mockReturnValueOnce(chain);

      const result = await getPendingConsequences(TEST_USER);

      expect(mockedFrom).toHaveBeenCalledWith('financial_consequences');
      expect(chain.select).toHaveBeenCalledWith('*');
      expect(chain.eq).toHaveBeenCalledWith('user_id', TEST_USER);
      expect(chain.eq).toHaveBeenCalledWith('status', 'pending');
      expect(chain.order).toHaveBeenCalledWith('created_at', { ascending: true });

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('cons-001');
      expect(result[0].triggerReason).toBe('Missed task');
      expect(result[0].amountCents).toBe(2500);
      expect(result[0].status).toBe('pending');
    });

    it('should return empty array when no pending consequences', async () => {
      const chain = buildChain({ thenData: [] });
      mockedFrom.mockReturnValueOnce(chain);

      const result = await getPendingConsequences(TEST_USER);
      expect(result).toEqual([]);
    });

    it('should return empty array on error', async () => {
      const chain = buildChain({});
      chain.then = vi.fn((cb: any) =>
        Promise.resolve({ data: null, error: { message: 'err' } }).then(cb)
      );
      mockedFrom.mockReturnValueOnce(chain);

      const result = await getPendingConsequences(TEST_USER);
      expect(result).toEqual([]);
    });
  });

  // ------------------------------------------
  // markConsequenceCompleted
  // ------------------------------------------
  describe('markConsequenceCompleted', () => {
    it('should update consequence status to completed with stripe payment id', async () => {
      const chain = buildChain({});
      mockedFrom.mockReturnValueOnce(chain);

      await markConsequenceCompleted('cons-001', 'pi_stripe_123');

      expect(mockedFrom).toHaveBeenCalledWith('financial_consequences');
      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'completed',
          stripe_payment_id: 'pi_stripe_123',
          processed_at: expect.any(String),
        })
      );
      expect(chain.eq).toHaveBeenCalledWith('id', 'cons-001');
    });
  });

  // ------------------------------------------
  // markConsequenceFailed
  // ------------------------------------------
  describe('markConsequenceFailed', () => {
    it('should update consequence status to failed with error message', async () => {
      const chain = buildChain({});
      mockedFrom.mockReturnValueOnce(chain);

      await markConsequenceFailed('cons-002', 'Card declined');

      expect(mockedFrom).toHaveBeenCalledWith('financial_consequences');
      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          error_message: 'Card declined',
          processed_at: expect.any(String),
        })
      );
      expect(chain.eq).toHaveBeenCalledWith('id', 'cons-002');
    });
  });

  // ------------------------------------------
  // allocateFunds
  // ------------------------------------------
  describe('allocateFunds', () => {
    it('should skip when no fund exists', async () => {
      // getFund returns null
      const fundChain = buildChain({ singleData: null, singleError: { message: 'not found' } });
      mockedFrom.mockReturnValueOnce(fundChain);

      await allocateFunds(TEST_USER);

      // Should not query feminization_purchases
      expect(mockedFrom).toHaveBeenCalledTimes(1);
      expect(mockedRpc).not.toHaveBeenCalled();
    });

    it('should skip when fund balance is zero', async () => {
      const currentMonth = new Date().toISOString().slice(0, 7);
      const fundRow = makeFundRow({ balance: 0 });

      // getFund: initial
      const fundChain1 = buildChain({ singleData: fundRow });
      // getFund -> ensureMonthlyPenaltyReset
      const resetChain = buildChain({ singleData: { penalty_month: currentMonth, monthly_penalties_this_month: 0 } });
      // getFund -> re-fetch
      const fundChain2 = buildChain({ singleData: fundRow });

      mockedFrom
        .mockReturnValueOnce(fundChain1)
        .mockReturnValueOnce(resetChain)
        .mockReturnValueOnce(fundChain2);

      await allocateFunds(TEST_USER);

      // Should not proceed to feminization_purchases query
      expect(mockedRpc).not.toHaveBeenCalled();
    });

    it('should query approved feminization purchases', async () => {
      const currentMonth = new Date().toISOString().slice(0, 7);
      const fundRow = makeFundRow({ balance: 500, reserve_percentage: 0.2 });

      // getFund: initial
      const fundChain1 = buildChain({ singleData: fundRow });
      const resetChain1 = buildChain({ singleData: { penalty_month: currentMonth, monthly_penalties_this_month: 0 } });
      const fundChain2 = buildChain({ singleData: fundRow });
      mockedFrom
        .mockReturnValueOnce(fundChain1)
        .mockReturnValueOnce(resetChain1)
        .mockReturnValueOnce(fundChain2);

      // feminization_purchases query
      const purchasesChain = buildChain({ thenData: [] });
      mockedFrom.mockReturnValueOnce(purchasesChain);

      // re-fetch fund for payout calculation
      const fundChain3 = buildChain({ singleData: fundRow });
      const resetChain2 = buildChain({ singleData: { penalty_month: currentMonth, monthly_penalties_this_month: 0 } });
      const fundChain4 = buildChain({ singleData: fundRow });
      mockedFrom
        .mockReturnValueOnce(fundChain3)
        .mockReturnValueOnce(resetChain2)
        .mockReturnValueOnce(fundChain4);

      // payout update to maxy_fund
      const payoutChain = buildChain({});
      mockedFrom.mockReturnValueOnce(payoutChain);

      // handler_decisions insert
      const decisionChain = buildChain({});
      mockedFrom.mockReturnValueOnce(decisionChain);

      await allocateFunds(TEST_USER);

      expect(purchasesChain.select).toHaveBeenCalledWith('id, amount, item_description, priority');
      expect(purchasesChain.eq).toHaveBeenCalledWith('user_id', TEST_USER);
      expect(purchasesChain.eq).toHaveBeenCalledWith('status', 'approved');
    });

    it('should log allocation decision to handler_decisions', async () => {
      const currentMonth = new Date().toISOString().slice(0, 7);
      const fundRow = makeFundRow({ balance: 500, reserve_percentage: 0.2 });

      // getFund
      const fundChain1 = buildChain({ singleData: fundRow });
      const resetChain1 = buildChain({ singleData: { penalty_month: currentMonth, monthly_penalties_this_month: 0 } });
      const fundChain2 = buildChain({ singleData: fundRow });
      mockedFrom
        .mockReturnValueOnce(fundChain1)
        .mockReturnValueOnce(resetChain1)
        .mockReturnValueOnce(fundChain2);

      // feminization_purchases (none)
      const purchasesChain = buildChain({ thenData: [] });
      mockedFrom.mockReturnValueOnce(purchasesChain);

      // re-fetch fund for payout
      const fundChain3 = buildChain({ singleData: fundRow });
      const resetChain2 = buildChain({ singleData: { penalty_month: currentMonth, monthly_penalties_this_month: 0 } });
      const fundChain4 = buildChain({ singleData: fundRow });
      mockedFrom
        .mockReturnValueOnce(fundChain3)
        .mockReturnValueOnce(resetChain2)
        .mockReturnValueOnce(fundChain4);

      // payout update
      const payoutChain = buildChain({});
      mockedFrom.mockReturnValueOnce(payoutChain);

      // handler_decisions insert
      const decisionChain = buildChain({});
      mockedFrom.mockReturnValueOnce(decisionChain);

      await allocateFunds(TEST_USER);

      // The last from() call should be to handler_decisions
      const lastFromCall = mockedFrom.mock.calls[mockedFrom.mock.calls.length - 1][0];
      expect(lastFromCall).toBe('handler_decisions');
      expect(decisionChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: TEST_USER,
          decision_type: 'fund_allocation',
          executed: true,
          reasoning: expect.stringContaining('Weekly fund allocation'),
        })
      );
    });
  });

  // ------------------------------------------
  // getFinancialSnapshot
  // ------------------------------------------
  describe('getFinancialSnapshot', () => {
    it('should aggregate multiple data sources into snapshot', async () => {
      const currentMonth = new Date().toISOString().slice(0, 7);
      const fundRow = makeFundRow({ balance: 500 });

      // getFinancialSnapshot uses Promise.all with 7 parallel queries, so
      // from() calls interleave non-deterministically. Use table-based routing
      // with per-table call counters instead of mockReturnValueOnce.
      const callCounts: Record<string, number> = {};
      mockedFrom.mockImplementation((table: string) => {
        callCounts[table] = (callCounts[table] || 0) + 1;
        const n = callCounts[table];

        if (table === 'maxy_fund') {
          // getFund: call 1 = initial fetch, call 2 = ensureMonthlyPenaltyReset, call 3 = re-fetch
          if (n === 1 || n === 3) {
            return buildChain({ singleData: fundRow });
          }
          // ensureMonthlyPenaltyReset
          return buildChain({ singleData: { penalty_month: currentMonth, monthly_penalties_this_month: 0 } });
        }
        if (table === 'revenue_events') {
          // call 1 = getTodayEarnings, call 2 = getEarningsSummary(7), call 3 = getEarningsSummary(30)
          if (n === 1) return buildChain({ thenData: [{ amount: 75 }] });
          if (n === 2) return buildChain({ thenData: [{ amount: 200, platform: 'OnlyFans', revenue_type: 'subscription' }] });
          return buildChain({ thenData: [{ amount: 800, platform: 'OnlyFans', revenue_type: 'subscription' }] });
        }
        if (table === 'financial_consequences') {
          return buildChain({ thenData: [] });
        }
        if (table === 'compliance_state') {
          return buildChain({ singleData: { bleeding_active: false } });
        }
        if (table === 'fund_transactions') {
          return buildChain({ thenData: [] });
        }
        // fallback
        return buildChain({});
      });

      const snapshot = await getFinancialSnapshot(TEST_USER);

      expect(snapshot).toHaveProperty('fund');
      expect(snapshot).toHaveProperty('todayEarnings');
      expect(snapshot).toHaveProperty('weekSummary');
      expect(snapshot).toHaveProperty('monthSummary');
      expect(snapshot).toHaveProperty('pendingConsequences');
      expect(snapshot).toHaveProperty('isBleedingActive');
      expect(snapshot).toHaveProperty('recentTransactions');

      expect(snapshot.fund).not.toBeNull();
      expect(snapshot.fund!.balance).toBe(500);
      expect(snapshot.isBleedingActive).toBe(false);
      expect(snapshot.pendingConsequences).toBe(0);
    });
  });
});
