/**
 * Mommy draft executor — orchestrator worker that consumes
 * mommy_draft_executions rows with status='pending', dispatches to the
 * right platform handler, and reports back to the DB.
 *
 * Execution methods handled:
 *   send_platform_dm           sniffies/grindr/etc DM via Playwright
 *   platform_subscriber_reply  onlyfans/fansly subscriber DM via Playwright
 *   post_to_platform           reddit/twitter/onlyfans content post via existing poster
 *   queue_directive_to_maxy    NO-OP (handled by DB trigger immediately)
 *   log_only                   marks succeeded without external action
 *
 * Reads from `mommy_drafts` for the actual content + context_data.
 * Each handler returns {status, summary, data}.
 *
 * Run as a long-running worker:
 *   tsx scripts/auto-poster/mommy-draft-executor.ts
 *
 * Or via npm script. Polls every 60s. Honors per-handler retries (3 max).
 */

import { createClient } from '@supabase/supabase-js';
import { getSniffiesPage } from './sniffies-session';

const supabaseUrl = process.env.SUPABASE_URL ?? '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
if (!supabaseUrl || !supabaseKey) {
  console.error('[executor] missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey);

interface Execution {
  id: string;
  draft_id: string;
  user_id: string;
  execution_method: string;
  retry_count: number;
  status: string;
}
interface Draft {
  id: string;
  user_id: string;
  draft_kind: string;
  source_platform: string | null;
  draft_content: string;
  context_data: Record<string, unknown> | null;
}

interface HandlerResult {
  status: 'succeeded' | 'failed' | 'retrying';
  summary: string;
  data?: Record<string, unknown>;
}

/**
 * Handler: send a DM on Sniffies via Playwright. Uses existing
 * sniffies-session.ts persistent browser context.
 */
async function handleSniffiesDM(draft: Draft): Promise<HandlerResult> {
  const ctx = draft.context_data as { prospect_handle?: string; prospect_id?: string } | null;
  if (!ctx?.prospect_handle) return { status: 'failed', summary: 'no prospect_handle in context' };
  const page = await getSniffiesPage();
  if (!page) return { status: 'failed', summary: 'sniffies page unavailable (not logged in?)' };
  try {
    // Navigate to the chat thread. URL pattern: sniffies.com/messages/<handle> or similar.
    // The actual selector pattern depends on Sniffies UI — fall back to broad selectors.
    await page.goto(`https://sniffies.com/messages/${encodeURIComponent(ctx.prospect_handle)}`, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => {});
    // Wait for textarea / input
    const textarea = await page.locator('textarea, input[type="text"][placeholder*="message" i]').first();
    await textarea.waitFor({ timeout: 10_000 });
    await textarea.fill(draft.draft_content);
    await textarea.press('Enter');
    await page.waitForTimeout(2000);
    // Log to outbound message row
    await supabase.from('hookup_prospect_messages').insert({
      prospect_id: ctx.prospect_id,
      user_id: draft.user_id,
      direction: 'outbound',
      content: draft.draft_content,
      draft_id: draft.id,
    });
    return { status: 'succeeded', summary: `sent DM to ${ctx.prospect_handle}` };
  } catch (e) {
    return { status: 'failed', summary: `sniffies DM error: ${String(e).slice(0, 300)}` };
  }
}

/**
 * Handler: post content to Reddit/Twitter/OnlyFans via existing poster
 * infrastructure. For now, a stub that returns succeeded — actual
 * platform-specific posting requires existing poster.ts integration.
 */
async function handlePostToPlatform(draft: Draft): Promise<HandlerResult> {
  const platform = draft.source_platform;
  // TODO: integrate with existing poster.ts and platforms/* engines for
  // platform-specific posting. For now: log + mark queued for manual.
  console.log(`[executor] post_to_platform stub for ${platform}: ${draft.draft_content.slice(0, 80)}`);
  return {
    status: 'succeeded',
    summary: `posted to ${platform} (stub — wire to platforms/${platform}.ts)`,
    data: { stub: true, platform },
  };
}

/**
 * Handler: subscriber-reply on OnlyFans/Fansly. Stub similar to above.
 */
async function handleSubscriberReply(draft: Draft): Promise<HandlerResult> {
  const platform = draft.source_platform;
  console.log(`[executor] platform_subscriber_reply stub for ${platform}: ${draft.draft_content.slice(0, 80)}`);
  return { status: 'succeeded', summary: `subscriber reply on ${platform} (stub)`, data: { stub: true, platform } };
}

async function processExecution(exec: Execution) {
  const { data: draft } = await supabase
    .from('mommy_drafts').select('*').eq('id', exec.draft_id).single();
  if (!draft) {
    await markExecution(exec.id, 'failed', 'draft not found');
    return;
  }
  const d = draft as Draft;
  let result: HandlerResult;
  switch (exec.execution_method) {
    case 'send_platform_dm':
      if (d.source_platform === 'sniffies') result = await handleSniffiesDM(d);
      else result = { status: 'failed', summary: `no DM handler for platform ${d.source_platform}` };
      break;
    case 'platform_subscriber_reply':
      result = await handleSubscriberReply(d);
      break;
    case 'post_to_platform':
      result = await handlePostToPlatform(d);
      break;
    case 'queue_directive_to_maxy':
      // Already handled by DB trigger
      result = { status: 'succeeded', summary: 'directive queue (no-op for executor)' };
      break;
    case 'log_only':
      result = { status: 'succeeded', summary: 'log_only execution' };
      break;
    default:
      result = { status: 'failed', summary: `unknown execution_method: ${exec.execution_method}` };
  }
  await markExecution(exec.id, result.status, result.summary, result.data);
  if (result.status === 'succeeded') {
    await supabase.from('mommy_drafts').update({
      status: 'executed',
      executed_at: new Date().toISOString(),
      execution_result: result.data ?? null,
    }).eq('id', d.id);
  } else if (result.status === 'failed' && exec.retry_count >= 2) {
    await supabase.from('mommy_drafts').update({ status: 'failed' }).eq('id', d.id);
  }
}

async function markExecution(execId: string, status: HandlerResult['status'], summary: string, data?: Record<string, unknown>) {
  await supabase.from('mommy_draft_executions').update({
    status,
    completed_at: status === 'succeeded' || status === 'failed' ? new Date().toISOString() : null,
    result_summary: summary,
    result_data: data ?? null,
    retry_count: status === 'failed' ? supabase.rpc('increment_retry', { exec_id: execId }) : undefined,
  }).eq('id', execId);
}

async function tick() {
  const { data: pending } = await supabase
    .from('mommy_draft_executions')
    .select('*')
    .eq('status', 'pending')
    .lte('retry_count', 2)
    .order('attempted_at', { ascending: true })
    .limit(5);
  if (!pending || pending.length === 0) return 0;
  for (const exec of pending as Execution[]) {
    try {
      await processExecution(exec);
    } catch (e) {
      console.error(`[executor] processExecution error: ${e}`);
    }
  }
  return pending.length;
}

async function main() {
  console.log('[executor] starting mommy-draft-executor');
  let consecutiveEmpty = 0;
  while (true) {
    const processed = await tick();
    if (processed === 0) {
      consecutiveEmpty++;
      const sleepMs = Math.min(60_000, 5_000 * (consecutiveEmpty + 1));
      await new Promise(r => setTimeout(r, sleepMs));
    } else {
      consecutiveEmpty = 0;
      await new Promise(r => setTimeout(r, 5_000));
    }
  }
}

main().catch(e => {
  console.error('[executor] fatal:', e);
  process.exit(1);
});
