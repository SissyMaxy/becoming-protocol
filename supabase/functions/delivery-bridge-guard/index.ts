// delivery-bridge-guard — per-row audit + auto-heal of storage->delivery gaps.
//
// Wish f0411f17: nothing penalty-bearing / quote-back / evidence-shaped stays
// unbridged to a delivery surface. The outreach->push trigger (mig 380) and
// protocol-health-check's 6h ratio check exist; this catches the SPECIFIC
// rows that slip through, heals them, and records bridge-lag.
//
// Bridges audited:
//   1. outreach_to_push      — high/critical outreach pending w/ no push -> emit push (HEAL)
//   2. penalty_preview_to_outreach — preview with no companion outreach -> emit it (HEAL)
//   3. decree_to_surface     — active decree w/ deadline but no surfacing outreach (FLAG)
//
// POST { dry_run? }. Nightly cron 03:50 UTC.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const lagSec = (createdIso: string) => Math.round((Date.now() - new Date(createdIso).getTime()) / 1000)

interface BridgeResult { bridge: string; unbridged_count: number; healed_count: number; max_lag_seconds: number | null; detail: Record<string, unknown> }

// 1. Outreach that should have a push but never got bridged (trigger missed it).
async function healOutreachToPush(supabase: SupabaseClient, dry: boolean): Promise<BridgeResult> {
  const cutoff = new Date(Date.now() - 30 * 60_000).toISOString()
  const { data } = await supabase.from('handler_outreach_queue')
    .select('id, user_id, message, urgency, source, kind, trigger_reason, expires_at, scheduled_for, created_at')
    .in('urgency', ['high', 'critical'])
    .eq('status', 'pending')
    .is('push_dispatched_at', null)
    .lt('created_at', cutoff)
    .limit(200)
  const rows = (data || []) as Array<{ id: string; user_id: string; message: string; expires_at: string | null; created_at: string }>
  let healed = 0
  let maxLag = 0
  for (const r of rows) {
    maxLag = Math.max(maxLag, lagSec(r.created_at))
    if (dry) continue
    const { error } = await supabase.from('scheduled_notifications').insert({
      user_id: r.user_id,
      notification_type: 'handler_outreach',
      scheduled_for: new Date().toISOString(),
      expires_at: r.expires_at ?? new Date(Date.now() + 4 * 3600_000).toISOString(),
      payload: { title: 'Handler', body: r.message.slice(0, 180), data: { outreach_id: r.id, healed: true } },
      status: 'pending',
    })
    if (!error) {
      await supabase.from('handler_outreach_queue').update({ push_dispatched_at: new Date().toISOString() }).eq('id', r.id)
      healed++
    }
  }
  return { bridge: 'outreach_to_push', unbridged_count: rows.length, healed_count: healed, max_lag_seconds: rows.length ? maxLag : null, detail: { sample: rows.slice(0, 5).map(r => r.id) } }
}

// 2. Penalty previews that never got their companion "cost on the table" outreach.
async function healPreviewToOutreach(supabase: SupabaseClient, dry: boolean): Promise<BridgeResult> {
  const cutoff = new Date(Date.now() - 15 * 60_000).toISOString()
  const { data } = await supabase.from('penalty_previews')
    .select('id, user_id, penalty_copy, deadline, created_at')
    .is('preview_outreach_id', null)
    .is('cancelled_at', null)
    .lt('created_at', cutoff)
    .limit(200)
  const rows = (data || []) as Array<{ id: string; user_id: string; penalty_copy: string; deadline: string | null; created_at: string }>
  let healed = 0
  let maxLag = 0
  for (const r of rows) {
    maxLag = Math.max(maxLag, lagSec(r.created_at))
    if (dry) continue
    const { data: o, error } = await supabase.from('handler_outreach_queue').insert({
      user_id: r.user_id,
      message: 'Cost on the table: ' + r.penalty_copy + ' It\'s written here so you can\'t say you didn\'t know.',
      urgency: 'normal',
      trigger_reason: 'penalty_preview_heal:' + r.id,
      source: 'penalty_preview',
      kind: 'penalty_preview',
      scheduled_for: new Date().toISOString(),
      expires_at: r.deadline ?? new Date(Date.now() + 24 * 3600_000).toISOString(),
    }).select('id').single()
    if (!error && o) {
      await supabase.from('penalty_previews').update({ preview_outreach_id: (o as { id: string }).id }).eq('id', r.id)
      healed++
    }
  }
  return { bridge: 'penalty_preview_to_outreach', unbridged_count: rows.length, healed_count: healed, max_lag_seconds: rows.length ? maxLag : null, detail: { sample: rows.slice(0, 5).map(r => r.id) } }
}

// 3. Active decrees with a deadline but no outreach surfacing them (flag only —
//    healing requires the decree's own voice, left to its generator).
async function auditDecreeToSurface(supabase: SupabaseClient): Promise<BridgeResult> {
  const cutoff = new Date(Date.now() - 45 * 60_000).toISOString()
  const { data } = await supabase.from('handler_decrees')
    .select('id, user_id, created_at, surfaced_at, expired_unsurfaced')
    .eq('status', 'active')
    .is('surfaced_at', null)
    .neq('expired_unsurfaced', true)
    .lt('created_at', cutoff)
    .limit(200)
  const rows = (data || []) as Array<{ id: string; created_at: string }>
  let maxLag = 0
  for (const r of rows) maxLag = Math.max(maxLag, lagSec(r.created_at))
  return { bridge: 'decree_to_surface', unbridged_count: rows.length, healed_count: 0, max_lag_seconds: rows.length ? maxLag : null, detail: { sample: rows.slice(0, 5).map(r => r.id), note: 'flag-only; surface-guarantor owns decree surfacing' } }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
  let body: { dry_run?: boolean } = {}
  try { body = await req.json() } catch { /* */ }
  const dry = body.dry_run === true

  const results: BridgeResult[] = []
  for (const fn of [
    () => healOutreachToPush(supabase, dry),
    () => healPreviewToOutreach(supabase, dry),
    () => auditDecreeToSurface(supabase),
  ]) {
    try { results.push(await fn()) }
    catch (e) { results.push({ bridge: 'error', unbridged_count: 0, healed_count: 0, max_lag_seconds: null, detail: { error: (e as Error).message } }) }
  }

  if (!dry) {
    // Persist the audit + surface to the supervisor pulse panel.
    for (const r of results) {
      await supabase.from('delivery_bridge_audit_log').insert({
        bridge: r.bridge, unbridged_count: r.unbridged_count, healed_count: r.healed_count,
        max_lag_seconds: r.max_lag_seconds, detail: r.detail,
      })
      const leftUnhealed = r.unbridged_count - r.healed_count
      if (leftUnhealed > 0) {
        await supabase.from('mommy_supervisor_log').insert({
          component: 'delivery_bridge_guard',
          severity: leftUnhealed > 10 ? 'high' : 'warning',
          event_kind: 'unbridged_rows',
          message: `${r.bridge}: ${r.unbridged_count} unbridged, ${r.healed_count} healed, ${leftUnhealed} left (max lag ${r.max_lag_seconds ?? 0}s)`,
          context_data: r.detail,
        })
      }
    }
  }

  return new Response(JSON.stringify({
    ok: true,
    healed_total: results.reduce((s, r) => s + r.healed_count, 0),
    unbridged_total: results.reduce((s, r) => s + r.unbridged_count, 0),
    results,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
