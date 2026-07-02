// protocol-health-check v3 — mark arousal-gated generators conditional.
//
// Observed in production (1h pause cycle): pavlovian was warning
// "no_recent_output" because both users at arousal 0, but that's
// CORRECT silence — generator only fires at arousal ≥4. Fix: mark
// arousal-gated generators conditional. Empty output = info, not warning.
//
// Conditional generators:
//   - state_paired_delivery (arousal ≥4)
//   - pavlovian (arousal ≥4)
//   - warmup_tier (arousal ≤3)

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
  conditional?: boolean;
  // edge_function generators are driven by a Deno edge function + pg_cron, not
  // a SQL _eval function, so the check_function_exists RPC doesn't apply —
  // freshness is judged purely on output_table rows within the cadence window.
  edge_function?: boolean;
}

const GENERATORS: GeneratorSpec[] = [
  { name: 'state_paired_delivery', function_name: 'state_paired_delivery_eval', expected_cadence_minutes: 15, conditional: true },
  // wardrobe is a conditional generator (gina_disclosure / gina_seed removed
  // 2026-07-01 — policy: no disclosure to Gina; evals dropped in mig 624): its
  // _eval CONTINUEs to zero rows by design on most daily runs (pending-cooldown
  // 18h–14d, gap_min_days, readiness/arc gates, off-cooldown seed availability).
  // A 1440-min cadence → 48h freshness window they're quiet in by design, so a
  // zero-row check is NOT a fault. Without conditional:true each 6h health check
  // emitted a `warning` (= a supervisor nudge); 4/day × 7d ≈ 28 false nudges/wk,
  // which the nudge analyzer then mislabeled scheduling_conflict and filed
  // re-stagger wishes for. Marking them conditional drops these to info/quiet.
  { name: 'wardrobe_prescription', function_name: 'wardrobe_prescription_eval', expected_cadence_minutes: 1440, output_table: 'wardrobe_prescriptions', conditional: true },
  { name: 'cruising_lead_feminization', function_name: 'cruising_lead_feminization_eval', expected_cadence_minutes: 1440 },
  { name: 'cock_conditioning', function_name: 'cock_conditioning_eval', expected_cadence_minutes: 720, output_table: 'cock_conditioning_events', conditional: true },
  { name: 'pavlovian', function_name: 'pavlovian_eval', expected_cadence_minutes: 15, output_table: 'pavlovian_events', conditional: true },
  { name: 'warmup_tier', function_name: 'warmup_tier_eval', expected_cadence_minutes: 60, conditional: true },
  { name: 'focus_picker', function_name: 'focus_picker_eval', expected_cadence_minutes: 1440 },
  // Evening confession → next-day prescriptions. Dead 2026-06-21 (only caller,
  // EveningConfessionGate, was deleted); revived by the nightly
  // evening-prescribe-dispatch edge fn + pg_cron (mig 616, 21:30 daily) which
  // feeds today's confession transcript to evening-confession-prescribe.
  // Conditional: only produces rows on days the user actually confessed.
  { name: 'evening_confession_prescribe', function_name: 'evening-confession-prescribe', expected_cadence_minutes: 1440, output_table: 'feminization_prescriptions', edge_function: true, conditional: true },
  // Machine safety envelope (mig 625). machine-overseer only produces rows
  // when the user actually runs the rig → conditional. The dead-man sweep is
  // a SQL fn on pg_cron (every minute); the function-exists probe is the
  // check that matters — zero aborted sessions is the healthy case.
  { name: 'machine_overseer', function_name: 'machine-overseer', expected_cadence_minutes: 1440, output_table: 'machine_sessions', edge_function: true, conditional: true },
  { name: 'machine_deadman_sweep', function_name: 'machine_deadman_sweep', expected_cadence_minutes: 1, conditional: true },
  // ── Feminization loop (FEM design §7, migs 634-638) ──
  // fem_prescription_loop is NOT conditional: between the confession path
  // and the bank-engine fallback, SOME rows must land daily — silence here
  // means the whole loop died (the 2026-06-21 dead-pipeline class).
  { name: 'fem_prescription_loop', function_name: 'evening-prescribe-dispatch', expected_cadence_minutes: 1440, output_table: 'feminization_prescriptions', edge_function: true },
  { name: 'voice_progress', function_name: 'voice-pitch-watcher', expected_cadence_minutes: 10080, output_table: 'voice_progress_samples', edge_function: true, conditional: true },
  { name: 'transition_tracking', function_name: 'transition-tracking-prompter', expected_cadence_minutes: 10080, output_table: 'transition_tracking_log', edge_function: true, conditional: true },
  { name: 'mantra_drills', function_name: 'mommy-mantra-drill-submit', expected_cadence_minutes: 10080, output_table: 'mantra_drill_sessions', edge_function: true, conditional: true },
  { name: 'body_metrics_spine', function_name: 'body_metrics', expected_cadence_minutes: 43200, output_table: 'body_metrics', edge_function: true, conditional: true },
];

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

async function checkGenerator(g: GeneratorSpec): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  // Edge-function generators have no SQL _eval to probe — skip the RPC and
  // judge freshness on output rows only.
  if (!g.edge_function) {
    const { data: fnExists, error: fnErr } = await supabase.rpc('check_function_exists', { p_function_name: g.function_name }).maybeSingle();
    if (fnErr || !fnExists) {
      results.push({ component: g.name, severity: 'error', event_kind: 'function_missing', message: `Function ${g.function_name} missing`, context_data: { function_name: g.function_name } });
      return results;
    }
  }
  if (g.output_table) {
    const windowHours = Math.ceil(g.expected_cadence_minutes / 60) * 2;
    const since = new Date(Date.now() - windowHours * 3600 * 1000).toISOString();
    const dateCol = g.output_table === 'cock_conditioning_events' ? 'assigned_at'
                  : g.output_table === 'wardrobe_prescriptions' ? 'assigned_at'
                  : g.output_table === 'body_metrics' ? 'measured_at'
                  : 'created_at';
    const { count, error: qErr } = await supabase.from(g.output_table).select('id', { count: 'exact', head: true }).gte(dateCol, since);
    if (qErr) results.push({ component: g.name, severity: 'warning', event_kind: 'query_error', message: `Output query failed: ${qErr.message}`, context_data: { table: g.output_table } });
    else if ((count ?? 0) === 0) {
      const severity: 'info' | 'warning' = g.conditional ? 'info' : 'warning';
      const eventKind = g.conditional ? 'conditional_quiet' : 'no_recent_output';
      const msg = g.conditional
        ? `No rows in ${g.output_table} within window — conditional generator (likely no users at threshold).`
        : `No rows in ${g.output_table} within 2x cadence window.`;
      results.push({ component: g.name, severity, event_kind: eventKind, message: msg, context_data: { table: g.output_table, cadence_minutes: g.expected_cadence_minutes, window_hours: windowHours, conditional: g.conditional ?? false } });
    } else {
      results.push({ component: g.name, severity: 'info', event_kind: 'healthy', message: `${count} rows in ${g.output_table} within window.`, context_data: { table: g.output_table, count } });
    }
  }
  return results;
}

async function checkDeliveryBridge(): Promise<CheckResult[]> {
  const since = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
  const { count: outreachCount } = await supabase.from('handler_outreach_queue').select('id', { count: 'exact', head: true }).gte('created_at', since);
  const { count: notifCount } = await supabase.from('scheduled_notifications').select('id', { count: 'exact', head: true }).gte('created_at', since);
  const ratio = outreachCount && outreachCount > 0 ? (notifCount ?? 0) / outreachCount : 1;
  if (ratio < 0.5 && (outreachCount ?? 0) > 5) {
    return [{ component: 'outreach_to_push_bridge', severity: 'error', event_kind: 'low_bridge_ratio', message: `Only ${notifCount}/${outreachCount} outreach in 6h.`, context_data: { outreach_count: outreachCount, notif_count: notifCount, ratio } }];
  }
  return [{ component: 'outreach_to_push_bridge', severity: 'info', event_kind: 'healthy', message: `Bridge ratio ${notifCount}/${outreachCount} in 6h.`, context_data: { outreach_count: outreachCount, notif_count: notifCount, ratio } }];
}

async function checkFulfillmentChain(): Promise<CheckResult[]> {
  const since = new Date(Date.now() - 7 * 86400 * 1000).toISOString();
  const { data: rows } = await supabase.from('handler_decrees').select('trigger_source, status').gte('created_at', since).in('trigger_source', ['cock_conditioning','cruising_lead_feminization','wardrobe_acquisition','wardrobe_rotation','pavlovian_pairing','pavlovian_trigger']);
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
    if (error) return [{ component: 'chain_assertion', severity: 'error', event_kind: 'rpc_error', message: error.message, context_data: {} }];
    const result = data as { ok?: boolean; results?: unknown };
    if (!result?.ok) return [{ component: 'chain_assertion', severity: 'error', event_kind: 'chain_failure', message: 'Chain assertion failed', context_data: { results: result?.results } }];
    return [{ component: 'chain_assertion', severity: 'info', event_kind: 'all_chains_ok', message: 'All fulfillment chains pass.', context_data: {} }];
  } catch (e) {
    return [{ component: 'chain_assertion', severity: 'error', event_kind: 'check_exception', message: (e as Error).message, context_data: {} }];
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST' && req.method !== 'GET') return new Response('method not allowed', { status: 405 });
  const allResults: CheckResult[] = [];
  for (const g of GENERATORS) {
    try { allResults.push(...await checkGenerator(g)); }
    catch (e) { allResults.push({ component: g.name, severity: 'error', event_kind: 'check_exception', message: (e as Error).message, context_data: {} }); }
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
