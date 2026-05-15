// protocol-health-check v2 — periodic audit of every generator + bridge + chain assertion.
//
// Runs every 6h via pg_cron. Checks:
//   1. Each generator function exists + recent rows in expected output table
//   2. outreach → scheduled_notifications bridge ratio
//   3. Per-trigger_source fulfillment rate over 7d
//   4. test_fulfillment_chain() chain assertion (mig 457)
//
// Writes findings to mommy_supervisor_log with severity info/warning/error.
// Prevents another proof_type='voice' silent breakage.

import { createClient } from 'jsr:@supabase/supabase-js@2';

interface CheckResult {
  component: string;
  severity: 'info' | 'warning' | 'error';
  event_kind: string;
  message: string;
  context_data: Record<string, unknown>;
}

interface GeneratorSpec {
  name: string;
  function_name: string;
  expected_cadence_minutes: number;
  output_table?: string;
}

const GENERATORS: GeneratorSpec[] = [
  { name: 'state_paired_delivery', function_name: 'state_paired_delivery_eval', expected_cadence_minutes: 15 },
  { name: 'wardrobe_prescription', function_name: 'wardrobe_prescription_eval', expected_cadence_minutes: 1440, output_table: 'wardrobe_prescriptions' },
  { name: 'cruising_lead_feminization', function_name: 'cruising_lead_feminization_eval', expected_cadence_minutes: 1440 },
  { name: 'gina_disclosure', function_name: 'gina_disclosure_eval', expected_cadence_minutes: 1440, output_table: 'gina_disclosure_events' },
  { name: 'gina_seed', function_name: 'gina_seed_eval', expected_cadence_minutes: 1440, output_table: 'gina_seed_plantings' },
  { name: 'cock_conditioning', function_name: 'cock_conditioning_eval', expected_cadence_minutes: 720, output_table: 'cock_conditioning_events' },
  { name: 'pavlovian', function_name: 'pavlovian_eval', expected_cadence_minutes: 15, output_table: 'pavlovian_events' },
];

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

async function checkGenerator(g: GeneratorSpec): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const { data: fnExists, error: fnErr } = await supabase.rpc('check_function_exists', { p_function_name: g.function_name }).maybeSingle();
  if (fnErr || !fnExists) {
    results.push({ component: g.name, severity: 'error', event_kind: 'function_missing', message: `Function ${g.function_name} missing: ${fnErr?.message ?? 'no row'}`, context_data: { function_name: g.function_name } });
    return results;
  }
  if (g.output_table) {
    const windowHours = Math.ceil(g.expected_cadence_minutes / 60) * 2;
    const since = new Date(Date.now() - windowHours * 3600 * 1000).toISOString();
    const dateCol = g.output_table === 'gina_seed_plantings' ? 'scheduled_at'
                  : g.output_table === 'cock_conditioning_events' ? 'assigned_at'
                  : g.output_table === 'gina_disclosure_events' ? 'assigned_at'
                  : g.output_table === 'wardrobe_prescriptions' ? 'assigned_at'
                  : 'created_at';
    const { count, error: qErr } = await supabase.from(g.output_table).select('id', { count: 'exact', head: true }).gte(dateCol, since);
    if (qErr) results.push({ component: g.name, severity: 'warning', event_kind: 'query_error', message: `Output query failed: ${qErr.message}`, context_data: { table: g.output_table } });
    else if ((count ?? 0) === 0) results.push({ component: g.name, severity: 'warning', event_kind: 'no_recent_output', message: `No rows in ${g.output_table} within 2x cadence window.`, context_data: { table: g.output_table, cadence_minutes: g.expected_cadence_minutes, window_hours: windowHours } });
    else results.push({ component: g.name, severity: 'info', event_kind: 'healthy', message: `${count} rows in ${g.output_table} within window.`, context_data: { table: g.output_table, count } });
  }
  return results;
}

async function checkDeliveryBridge(): Promise<CheckResult[]> {
  const since = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
  const { count: outreachCount } = await supabase.from('handler_outreach_queue').select('id', { count: 'exact', head: true }).gte('created_at', since);
  const { count: notifCount } = await supabase.from('scheduled_notifications').select('id', { count: 'exact', head: true }).gte('created_at', since);
  const ratio = outreachCount && outreachCount > 0 ? (notifCount ?? 0) / outreachCount : 1;
  if (ratio < 0.5 && (outreachCount ?? 0) > 5) {
    return [{ component: 'outreach_to_push_bridge', severity: 'error', event_kind: 'low_bridge_ratio', message: `Only ${notifCount}/${outreachCount} outreach rows reached scheduled_notifications in 6h.`, context_data: { outreach_count: outreachCount, notif_count: notifCount, ratio } }];
  }
  return [{ component: 'outreach_to_push_bridge', severity: 'info', event_kind: 'healthy', message: `Bridge ratio ${notifCount}/${outreachCount} in 6h.`, context_data: { outreach_count: outreachCount, notif_count: notifCount, ratio } }];
}

async function checkFulfillmentChain(): Promise<CheckResult[]> {
  const since = new Date(Date.now() - 7 * 86400 * 1000).toISOString();
  const { data: rows } = await supabase.from('handler_decrees').select('trigger_source, status').gte('created_at', since).in('trigger_source', ['cock_conditioning','gina_disclosure_pressure','cruising_lead_feminization','gina_seed_planting','wardrobe_acquisition','wardrobe_rotation','pavlovian_pairing','pavlovian_trigger']);
  const bySource: Record<string, { fulfilled: number; total: number }> = {};
  for (const r of (rows ?? []) as { trigger_source: string; status: string }[]) {
    if (!bySource[r.trigger_source]) bySource[r.trigger_source] = { fulfilled: 0, total: 0 };
    bySource[r.trigger_source].total++;
    if (r.status === 'fulfilled') bySource[r.trigger_source].fulfilled++;
  }
  const findings: CheckResult[] = [];
  for (const [source, stats] of Object.entries(bySource)) {
    const rate = stats.total > 0 ? stats.fulfilled / stats.total : 0;
    const severity: 'info' | 'warning' | 'error' = stats.total >= 5 && rate === 0 ? 'error' : stats.total >= 5 && rate < 0.1 ? 'warning' : 'info';
    findings.push({ component: `fulfillment_${source}`, severity, event_kind: rate === 0 ? 'zero_fulfillment' : 'fulfillment_rate', message: `${stats.fulfilled}/${stats.total} ${source} decrees fulfilled in 7d (${(rate * 100).toFixed(0)}%).`, context_data: { source, fulfilled: stats.fulfilled, total: stats.total, rate } });
  }
  return findings;
}

async function checkChainAssertion(): Promise<CheckResult[]> {
  try {
    const { data, error } = await supabase.rpc('test_fulfillment_chain').maybeSingle();
    if (error) return [{ component: 'chain_assertion', severity: 'error', event_kind: 'rpc_error', message: `test_fulfillment_chain RPC failed: ${error.message}`, context_data: {} }];
    const result = data as { ok?: boolean; results?: unknown };
    if (!result?.ok) return [{ component: 'chain_assertion', severity: 'error', event_kind: 'chain_failure', message: `Chain assertion failed`, context_data: { results: result?.results } }];
    return [{ component: 'chain_assertion', severity: 'info', event_kind: 'all_chains_ok', message: `All fulfillment chains pass.`, context_data: {} }];
  } catch (e) {
    return [{ component: 'chain_assertion', severity: 'error', event_kind: 'check_exception', message: (e as Error).message, context_data: {} }];
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST' && req.method !== 'GET') return new Response('method not allowed', { status: 405 });
  const allResults: CheckResult[] = [];
  for (const g of GENERATORS) {
    try { allResults.push(...await checkGenerator(g)); }
    catch (e) { allResults.push({ component: g.name, severity: 'error', event_kind: 'check_exception', message: `Check threw: ${(e as Error).message}`, context_data: {} }); }
  }
  try { allResults.push(...await checkDeliveryBridge()); } catch (e) { allResults.push({ component: 'delivery_bridge', severity: 'error', event_kind: 'check_exception', message: (e as Error).message, context_data: {} }); }
  try { allResults.push(...await checkFulfillmentChain()); } catch (e) { allResults.push({ component: 'fulfillment', severity: 'error', event_kind: 'check_exception', message: (e as Error).message, context_data: {} }); }
  try { allResults.push(...await checkChainAssertion()); } catch (e) { allResults.push({ component: 'chain_assertion', severity: 'error', event_kind: 'check_exception', message: (e as Error).message, context_data: {} }); }
  const toInsert = allResults.map(r => ({ component: r.component, severity: r.severity, event_kind: r.event_kind, message: r.message, context_data: r.context_data }));
  try { await supabase.from('mommy_supervisor_log').insert(toInsert); }
  catch (e) { return new Response(JSON.stringify({ insert_error: (e as Error).message, results: allResults }), { headers: { 'content-type': 'application/json' }, status: 500 }); }
  const errorCount = allResults.filter(r => r.severity === 'error').length;
  const warningCount = allResults.filter(r => r.severity === 'warning').length;
  return new Response(JSON.stringify({ ok: errorCount === 0, error_count: errorCount, warning_count: warningCount, total_checks: allResults.length, results: allResults }), { headers: { 'content-type': 'application/json' } });
});
