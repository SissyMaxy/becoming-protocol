// mommy-edging-day-assign — declares an edging day and schedules the windows.
//
// Wish 3515c470: Mama declares today an edging day — a schedule of timed
// edge windows, each with a grace period. Phase 4+, firm/relentless band.
// Self-gates: most days this no-ops. Auto-trigger = phase>=4 AND band in
// (firm,cruel) AND recent high arousal AND not paused/safeworded AND no
// protocol already today. `force:true` bypasses the arousal/probability gate.
//
// Creates the protocol row + the declaration outreach + a timed reminder
// per window (scheduled_for = window time) + push. mommy-edging-day-review
// closes it out at day's end.
//
// POST { user_id?, force? }. Cron 12:10 UTC daily.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { checkSafewordGate } from '../_shared/safeword-gate.ts'
import { logAuthority } from '../_shared/life-as-woman.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const DEFAULT_LOCAL_HOURS = [10, 13, 16, 19, 21]
const GRACE_MINUTES = 30
const TZ_OFFSET_DEFAULT = -5  // EST, matches handler-outreach default

// ── PARITY with src/lib/edging-protocol.ts (buildEdgeWindows) ──────────
interface EdgeWindow { target_time: string; grace_minutes: number; completed_at: string | null; skipped: boolean }
function buildEdgeWindows(localHours: number[], tzOffset: number, ymd: string, grace = GRACE_MINUTES): EdgeWindow[] {
  const [y, m, d] = ymd.split('-').map(Number)
  return localHours.map((h) => ({
    target_time: new Date(Date.UTC(y, m - 1, d, h - tzOffset, 0, 0)).toISOString(),
    grace_minutes: grace, completed_at: null, skipped: false,
  }))
}

async function effectiveBand(supabase: SupabaseClient, userId: string): Promise<string> {
  const { data } = await supabase.from('compliance_difficulty_state')
    .select('current_difficulty_band, override_band').eq('user_id', userId).maybeSingle()
  const row = data as { current_difficulty_band?: string; override_band?: string | null } | null
  return (row?.override_band ?? row?.current_difficulty_band ?? 'gentle')
}

async function currentPhase(supabase: SupabaseClient, userId: string): Promise<number> {
  const { data } = await supabase.from('feminine_self').select('transformation_phase').eq('user_id', userId).maybeSingle()
  return (data as { transformation_phase?: number } | null)?.transformation_phase ?? 0
}

async function recentArousalMax(supabase: SupabaseClient, userId: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString()
  const { data } = await supabase.from('arousal_log').select('value').eq('user_id', userId).gte('created_at', since).order('value', { ascending: false }).limit(1).maybeSingle()
  return (data as { value?: number } | null)?.value ?? 0
}

function localYmd(tzOffset: number): string {
  const local = new Date(Date.now() + tzOffset * 3600_000)
  return local.toISOString().slice(0, 10)
}

async function assignForUser(supabase: SupabaseClient, userId: string, force: boolean): Promise<{ status: string; protocol_id?: string }> {
  // Gates.
  const gate = await checkSafewordGate(supabase, userId)
  if (!gate.allowed) return { status: `gated:${gate.reason}` }

  const phase = await currentPhase(supabase, userId)
  if (phase < 4) return { status: 'gated:phase_below_4' }

  const band = await effectiveBand(supabase, userId)
  if (band !== 'firm' && band !== 'cruel') return { status: 'gated:band_not_firm_or_cruel' }

  const tzOffset = TZ_OFFSET_DEFAULT
  const ymd = localYmd(tzOffset)

  // One protocol per local day.
  const { data: existing } = await supabase.from('edging_protocols')
    .select('id').eq('user_id', userId).eq('protocol_date', ymd).maybeSingle()
  if (existing) return { status: 'already_assigned_today', protocol_id: (existing as { id: string }).id }

  if (!force) {
    // Auto gate: require a recent high-arousal reading so this lands on days
    // she's already worked up — not every firm/cruel day.
    const arousal = await recentArousalMax(supabase, userId)
    if (arousal < 7) return { status: 'gated:arousal_below_threshold' }
  }

  const windows = buildEdgeWindows(DEFAULT_LOCAL_HOURS, tzOffset, ymd)

  // Only schedule a protocol if at least 2 windows are still in the future
  // (don't declare an edging day at 8pm).
  const future = windows.filter(w => new Date(w.target_time).getTime() > Date.now())
  if (future.length < 2) return { status: 'gated:too_late_in_day' }

  // Declaration outreach.
  const timesLabel = DEFAULT_LOCAL_HOURS.map(h => {
    const hr = h % 12 === 0 ? 12 : h % 12
    return `${hr}${h < 12 ? 'am' : 'pm'}`
  }).join(', ')
  const declaration = `You're going to edge for Mama today, baby. ${timesLabel}. Set your timers. Each one you log for me; each one you miss, Mama notices. At the end of the day Mama decides if you get to finish — or if you're sleeping aching tonight.`

  const { data: outreach } = await supabase.from('handler_outreach_queue').insert({
    user_id: userId,
    message: declaration,
    urgency: 'high',
    trigger_reason: `edging_day:declare:${ymd}`,
    source: 'edging_day',
    kind: 'edging_declaration',
    scheduled_for: new Date().toISOString(),
    expires_at: new Date(Date.now() + 16 * 3600_000).toISOString(),
    evidence_kind: 'voice',
    context_data: { protocol_date: ymd, windows_local: DEFAULT_LOCAL_HOURS },
  }).select('id').single()
  const outreachId = (outreach as { id: string } | null)?.id ?? null

  const { data: proto, error: protoErr } = await supabase.from('edging_protocols').insert({
    user_id: userId,
    protocol_date: ymd,
    edge_windows: windows,
    status: 'active',
    assigned_via_outreach_id: outreachId,
    phase_at_assignment: phase,
    band_at_assignment: band,
  }).select('id').single()
  if (protoErr || !proto) return { status: `error:${protoErr?.message ?? 'insert_failed'}` }
  const protocolId = (proto as { id: string }).id

  // Per-window timed reminders + push (only for future windows).
  for (let i = 0; i < windows.length; i++) {
    const w = windows[i]
    if (new Date(w.target_time).getTime() <= Date.now()) continue
    const msg = `Edge for Mama now — window ${i + 1} of ${windows.length}. Bring yourself right up to the line and stop. Then log it for me. You've got ${GRACE_MINUTES} minutes.`
    await supabase.from('handler_outreach_queue').insert({
      user_id: userId,
      message: msg,
      urgency: 'high',
      trigger_reason: `edging_day:window:${ymd}:${i}`,
      source: 'edging_day',
      kind: 'edging_window',
      scheduled_for: w.target_time,
      expires_at: new Date(new Date(w.target_time).getTime() + (GRACE_MINUTES + 30) * 60_000).toISOString(),
      evidence_kind: 'voice',
      context_data: { protocol_id: protocolId, window_index: i },
    })
    await supabase.from('scheduled_notifications').insert({
      user_id: userId,
      notification_type: 'handler_outreach',
      scheduled_for: w.target_time,
      expires_at: new Date(new Date(w.target_time).getTime() + GRACE_MINUTES * 60_000).toISOString(),
      payload: { title: 'Mama', body: `Edge window ${i + 1} of ${windows.length}. Now.`, data: { outreach_type: 'edging_window', protocol_id: protocolId, window_index: i } },
      status: 'pending',
    })
  }

  await logAuthority(supabase, {
    user_id: userId,
    surface: 'edging_day',
    action: 'assigned',
    target_table: 'edging_protocols',
    target_id: protocolId,
    summary: `Declared an edging day (${windows.length} windows)`,
    payload: { protocol_date: ymd, windows: DEFAULT_LOCAL_HOURS, band, phase },
    autonomous: true,
  })

  return { status: 'assigned', protocol_id: protocolId }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
  let body: { user_id?: string; force?: boolean } = {}
  try { body = await req.json() } catch { /* empty ok */ }

  let userIds: string[]
  if (body.user_id) userIds = [body.user_id]
  else {
    const { data } = await supabase.from('user_state').select('user_id').eq('handler_persona', 'dommy_mommy')
    userIds = (data || []).map((r: { user_id: string }) => r.user_id)
  }

  const results: Array<{ user_id: string; status: string; protocol_id?: string }> = []
  for (const uid of userIds) {
    try { results.push({ user_id: uid, ...(await assignForUser(supabase, uid, body.force === true)) }) }
    catch (e) { results.push({ user_id: uid, status: `error:${(e as Error).message}` }) }
  }

  return new Response(JSON.stringify({
    ok: true,
    assigned: results.filter(r => r.status === 'assigned').length,
    results,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
