import { supabase } from './supabase';
import type {
  InvestmentMilestone,
  InvestmentMilestoneType,
  InvestmentMilestoneEvent,
  DbInvestmentMilestone,
  InvestmentCategory,
  InvestmentSummary,
} from '../types/investments';
import {
  INVESTMENT_MILESTONES,
  INVESTMENT_CATEGORIES,
  getCategoryLabel,
} from '../data/investment-categories';

// ============================================
// HELPER FUNCTIONS
// ============================================

async function getAuthUserId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No authenticated user');
  return user.id;
}

function mapDbToMilestone(db: DbInvestmentMilestone): InvestmentMilestone {
  return {
    id: db.id,
    userId: db.user_id,
    type: db.type as InvestmentMilestoneType,
    amount: db.amount ? Number(db.amount) : undefined,
    category: db.category as InvestmentCategory | undefined,
    message: db.message || '',
    achievedAt: db.achieved_at,
  };
}

// ============================================
// CORE FUNCTIONS
// ============================================

/**
 * Get all achieved milestones for the current user
 */
export async function getAchievedMilestones(): Promise<InvestmentMilestone[]> {
  const userId = await getAuthUserId();

  const { data, error } = await supabase
    .from('investment_milestones')
    .select('*')
    .eq('user_id', userId)
    .order('achieved_at', { ascending: false });

  if (error) {
    console.error('Failed to get milestones:', error);
    throw error;
  }

  return (data as DbInvestmentMilestone[]).map(mapDbToMilestone);
}

/**
 * Record a new milestone achievement
 */
export async function recordMilestone(
  type: InvestmentMilestoneType,
  message: string,
  options?: {
    amount?: number;
    category?: InvestmentCategory;
  }
): Promise<InvestmentMilestone> {
  const userId = await getAuthUserId();

  const { data, error } = await supabase
    .from('investment_milestones')
    .insert({
      user_id: userId,
      type,
      message,
      amount: options?.amount || null,
      category: options?.category || null,
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to record milestone:', error);
    throw error;
  }

  return mapDbToMilestone(data as DbInvestmentMilestone);
}

/**
 * Check if a specific milestone has been achieved
 */
export async function hasMilestone(
  type: InvestmentMilestoneType,
  category?: InvestmentCategory
): Promise<boolean> {
  const userId = await getAuthUserId();

  let query = supabase
    .from('investment_milestones')
    .select('id')
    .eq('user_id', userId)
    .eq('type', type);

  if (category) {
    query = query.eq('category', category);
  }

  const { data, error } = await query.limit(1);

  if (error) {
    console.error('Failed to check milestone:', error);
    return false;
  }

  return (data?.length || 0) > 0;
}

/**
 * Check for new milestones and return any that should be triggered
 */
export async function checkMilestones(
  summary: InvestmentSummary,
  newCategory?: InvestmentCategory,
  previousTotal?: number,
  previousCategoryTotals?: Record<InvestmentCategory, number>
): Promise<InvestmentMilestoneEvent[]> {
  const newMilestones: InvestmentMilestoneEvent[] = [];
  const achievedTypes = new Set(
    (await getAchievedMilestones()).map((m) => `${m.type}:${m.category || ''}`)
  );

  const investedCategories = (Object.entries(summary.byCategory) as [InvestmentCategory, number][])
    .filter(([, amount]) => amount > 0)
    .map(([category]) => category);

  // Check each milestone definition
  for (const milestone of INVESTMENT_MILESTONES) {
    const key = `${milestone.type}:`;

    // Skip if already achieved (for non-category milestones)
    if (milestone.type !== 'new_category' &&
        milestone.type !== 'category_100' &&
        milestone.type !== 'category_500') {
      if (achievedTypes.has(key)) continue;

      // Check if milestone is now achieved
      if (milestone.check(summary.totalInvested, summary.itemCount, investedCategories)) {
        // Verify it wasn't achieved before this transaction
        if (milestone.amount && previousTotal !== undefined && previousTotal >= milestone.amount) {
          continue;
        }

        const message =
          typeof milestone.message === 'function'
            ? milestone.message()
            : milestone.message;

        await recordMilestone(milestone.type, message, {
          amount: milestone.amount,
        });

        newMilestones.push({
          type: milestone.type,
          amount: milestone.amount,
          message,
        });
      }
    }
  }

  // Check new category milestone
  if (newCategory) {
    const categoryKey = `new_category:${newCategory}`;
    if (!achievedTypes.has(categoryKey)) {
      const categoryInfo = INVESTMENT_CATEGORIES[newCategory];
      const message = `Expanding your practice. ${categoryInfo.label} unlocked.`;

      await recordMilestone('new_category', message, {
        category: newCategory,
      });

      newMilestones.push({
        type: 'new_category',
        category: newCategory,
        message,
      });
    }
  }

  // Check category amount milestones
  for (const [category, amount] of Object.entries(summary.byCategory) as [InvestmentCategory, number][]) {
    if (amount <= 0) continue;

    const previousAmount = previousCategoryTotals?.[category] || 0;

    // Category $100 milestone
    if (amount >= 100 && previousAmount < 100) {
      const key100 = `category_100:${category}`;
      if (!achievedTypes.has(key100)) {
        const label = getCategoryLabel(category);
        const message = `$100 invested in ${label}.`;

        await recordMilestone('category_100', message, {
          amount: 100,
          category,
        });

        newMilestones.push({
          type: 'category_100',
          amount: 100,
          category,
          message,
        });
      }
    }

    // Category $500 milestone
    if (amount >= 500 && previousAmount < 500) {
      const key500 = `category_500:${category}`;
      if (!achievedTypes.has(key500)) {
        const label = getCategoryLabel(category);
        const message = `$500 invested in ${label}. You're serious about this.`;

        await recordMilestone('category_500', message, {
          amount: 500,
          category,
        });

        newMilestones.push({
          type: 'category_500',
          amount: 500,
          category,
          message,
        });
      }
    }
  }

  return newMilestones;
}

/**
 * Get the next upcoming milestone
 */
export async function getNextMilestone(
  currentTotal: number
): Promise<{ type: InvestmentMilestoneType; amount: number; message: string } | null> {
  const amountMilestones = [
    { type: 'amount_100' as const, amount: 100 },
    { type: 'amount_250' as const, amount: 250 },
    { type: 'amount_500' as const, amount: 500 },
    { type: 'amount_1000' as const, amount: 1000 },
    { type: 'amount_2500' as const, amount: 2500 },
    { type: 'amount_5000' as const, amount: 5000 },
    { type: 'amount_10000' as const, amount: 10000 },
  ];

  for (const milestone of amountMilestones) {
    if (currentTotal < milestone.amount) {
      const achieved = await hasMilestone(milestone.type);
      if (!achieved) {
        const definition = INVESTMENT_MILESTONES.find((m) => m.type === milestone.type);
        const message =
          typeof definition?.message === 'function'
            ? definition.message()
            : definition?.message || '';

        return {
          type: milestone.type,
          amount: milestone.amount,
          message,
        };
      }
    }
  }

  return null;
}

/**
 * Get milestone progress (for progress bars)
 */
export async function getMilestoneProgress(
  currentTotal: number
): Promise<{
  current: number;
  next: number | null;
  percentage: number;
  message: string | null;
}> {
  const nextMilestone = await getNextMilestone(currentTotal);

  if (!nextMilestone) {
    return {
      current: currentTotal,
      next: null,
      percentage: 100,
      message: "You've reached all investment milestones!",
    };
  }

  // Find the previous milestone amount
  const amounts = [0, 100, 250, 500, 1000, 2500, 5000, 10000];
  const currentIndex = amounts.findIndex((a) => a === nextMilestone.amount);
  const previousAmount = currentIndex > 0 ? amounts[currentIndex - 1] : 0;

  const progressInRange = currentTotal - previousAmount;
  const rangeSize = nextMilestone.amount - previousAmount;
  const percentage = Math.min(100, (progressInRange / rangeSize) * 100);

  return {
    current: currentTotal,
    next: nextMilestone.amount,
    percentage,
    message: `$${nextMilestone.amount - currentTotal} until "${nextMilestone.message}"`,
  };
}

/**
 * Get milestone statistics
 */
export async function getMilestoneStats(): Promise<{
  totalAchieved: number;
  byType: Record<string, number>;
  latestMilestone: InvestmentMilestone | null;
}> {
  const milestones = await getAchievedMilestones();

  const byType: Record<string, number> = {};
  for (const m of milestones) {
    byType[m.type] = (byType[m.type] || 0) + 1;
  }

  return {
    totalAchieved: milestones.length,
    byType,
    latestMilestone: milestones[0] || null,
  };
}
