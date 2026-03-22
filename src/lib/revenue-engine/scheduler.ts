/**
 * Autonomous Operations Scheduler
 *
 * Maps all Handler autonomous operations to timing.
 * This is the central clock that drives the revenue engine.
 */

import Anthropic from '@anthropic-ai/sdk';
import { supabase } from '../supabase';
import { generateDailyContentPlan, getDueAIContent, markAIContentPosted, markAIContentFailed } from './autonomous-content';
import { runEngagementCycle } from './engagement';
import { sendGFEMessages } from './gfe';
import { multiplyContent } from './content-multiplier';
import { generateErotica, generateJournalEntry } from './written-content';
import { generateAffiliateContent } from './affiliate';
import { weeklyRevenueReview } from './revenue-decisions';

// ── Schedule definitions ────────────────────────────────────────────

export interface ScheduledOperation {
  name: string;
  interval: string;
  description: string;
  handler: (client: Anthropic, userId: string) => Promise<unknown>;
}

export const OPERATIONS_SCHEDULE: ScheduledOperation[] = [
  // Every 15 minutes
  {
    name: 'process_ai_content_queue',
    interval: '15m',
    description: 'Post scheduled AI-generated content',
    handler: async (_client, _userId) => {
      const due = await getDueAIContent();
      return { dueCount: due.length };
    },
  },

  // Every 3 hours
  {
    name: 'engagement_cycle',
    interval: '3h',
    description: 'Reply to engagement targets',
    handler: async (client, userId) => runEngagementCycle(client, userId),
  },

  // Daily at midnight
  {
    name: 'daily_content_plan',
    interval: 'daily_midnight',
    description: 'Generate tomorrow\'s content calendar',
    handler: async (client, userId) => generateDailyContentPlan(client, userId),
  },

  // Daily at 7 AM
  {
    name: 'gfe_morning',
    interval: 'daily_7am',
    description: 'Send GFE morning messages',
    handler: async (client, userId) => sendGFEMessages(client, userId, 'morning'),
  },

  // Daily at 9 PM
  {
    name: 'gfe_evening',
    interval: 'daily_9pm',
    description: 'Send GFE evening messages',
    handler: async (client, userId) => sendGFEMessages(client, userId, 'evening'),
  },

  // Weekly (Sunday night)
  {
    name: 'weekly_revenue_review',
    interval: 'weekly_sunday',
    description: 'Revenue review and strategy adjustment',
    handler: async (client, userId) => weeklyRevenueReview(client, userId),
  },
  {
    name: 'weekly_erotica',
    interval: 'weekly_sunday',
    description: 'Generate erotica content',
    handler: async (client, userId) => generateErotica(client, userId),
  },
  {
    name: 'weekly_journal',
    interval: 'weekly_wednesday',
    description: 'Generate transformation journal entry',
    handler: async (client, userId) => generateJournalEntry(client, userId),
  },
  {
    name: 'weekly_affiliate',
    interval: 'weekly_sunday',
    description: 'Generate affiliate review content',
    handler: async (client, userId) => generateAffiliateContent(client, userId),
  },
];

// ── Run a specific operation ────────────────────────────────────────

/**
 * Execute a named operation and log the result.
 */
export async function runOperation(
  client: Anthropic,
  userId: string,
  operationName: string,
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  const operation = OPERATIONS_SCHEDULE.find(o => o.name === operationName);
  if (!operation) {
    return { success: false, error: `Unknown operation: ${operationName}` };
  }

  try {
    const result = await operation.handler(client, userId);

    // Log success
    await supabase.from('handler_autonomous_actions').insert({
      user_id: userId,
      action_type: `revenue_engine:${operationName}`,
      action_data: { result },
      status: 'completed',
    }).then(() => {});

    return { success: true, result };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    // Log failure
    await supabase.from('handler_autonomous_actions').insert({
      user_id: userId,
      action_type: `revenue_engine:${operationName}`,
      action_data: { error: errorMsg },
      status: 'failed',
    }).then(() => {});

    return { success: false, error: errorMsg };
  }
}

// ── Process new vault items for multiplication ──────────────────────

/**
 * Check for newly approved vault items and multiply them.
 * Runs as part of the midnight batch.
 */
export async function processNewVaultItems(
  client: Anthropic,
  userId: string,
): Promise<{ itemsProcessed: number; totalDerivatives: number }> {
  // Find approved items that haven't been multiplied yet
  const { data: items } = await supabase
    .from('content_vault')
    .select('id')
    .eq('user_id', userId)
    .eq('approval_status', 'approved')
    .order('created_at', { ascending: false })
    .limit(5);

  if (!items || items.length === 0) {
    return { itemsProcessed: 0, totalDerivatives: 0 };
  }

  let totalDerivatives = 0;
  let processed = 0;

  for (const item of items) {
    // Check if already multiplied (has derivatives in content_posts)
    const { count } = await supabase
      .from('content_posts')
      .select('id', { count: 'exact', head: true })
      .eq('vault_item_id', item.id);

    if ((count || 0) > 0) continue; // Already multiplied

    const result = await multiplyContent(client, userId, item.id);
    totalDerivatives += result.derivativesCreated;
    processed++;
  }

  return { itemsProcessed: processed, totalDerivatives };
}

// ── Full daily batch ────────────────────────────────────────────────

/**
 * Run all midnight operations as a single batch.
 */
export async function runDailyBatch(
  client: Anthropic,
  userId: string,
): Promise<Record<string, unknown>> {
  const results: Record<string, unknown> = {};

  // Content calendar
  results.contentPlan = await runOperation(client, userId, 'daily_content_plan');

  // Vault multiplication
  results.vaultMultiplication = await processNewVaultItems(client, userId);

  // Reset GFE daily flags
  await supabase.rpc('reset_gfe_daily_flags');
  results.gfeReset = true;

  return results;
}

// ── Full weekly batch ───────────────────────────────────────────────

/**
 * Run all weekly operations as a single batch.
 */
export async function runWeeklyBatch(
  client: Anthropic,
  userId: string,
): Promise<Record<string, unknown>> {
  const results: Record<string, unknown> = {};

  results.revenueReview = await runOperation(client, userId, 'weekly_revenue_review');
  results.erotica = await runOperation(client, userId, 'weekly_erotica');
  results.affiliate = await runOperation(client, userId, 'weekly_affiliate');

  return results;
}
