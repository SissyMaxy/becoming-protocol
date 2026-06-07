// irreversible-proof-nudge — nightly overdue-proof reminder for the binder.
//
// Wish (user_directive): a forced purchase / appointment / public fem-name
// use leaves a real-world trace. When the act is logged but its proof
// (receipt screenshot / forwarded email / calendar hold) hasn't landed by
// its due date, Mama reaches in once to collect it. The binder stays useful
// without Gina; this nudge never mentions Gina or any CC.
//
// Selection mirrors src/lib/irreversible-proof.ts isOverdue(): pending rows
// past proof_due_at, not nudged in the last ~day. One nudge per item, deduped
// by trigger_reason on the event id. Persona + safeword gated. The mig-380
// bridge auto-emits the push for 'normal' urgency — we do NOT also insert one.
//
// POST { user_id? }. Cron 02:40 UTC nightly (migration 606).

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { mommyVoiceCleanup, isMommyPersona } from '../_shared/dommy-mommy.ts'
import { checkSafewordGate } from '../_shared/safeword-gate.ts'
import { logAuthority } from '../_shared/life-as-woman.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface IrrevRow {
  id: string
  user_id: string
  event_kind: string
  title: string
  proof_due_at: string | null
  last_nudged_at: string | null
}

const KIND_NOUN: Record<string, string> = {
  purchase: 'what you bought',
  appointment: 'that appointment',
  fem_name_use: 'using your name out loud',
  other: 'that',
}

// Plain, warm, no telemetry. Sweet surface, one concrete ask: send the proof.
function nudgeText(kind: string, title: string, isMommy: boolean): string {
  const noun = KIND_NOUN[kind] ?? KIND_NOUN.other
  if (!isMommy) {
    return `Proof still outstanding for "${title}". Send the receipt, forwarded email, or photo so it's on the record.`
  }
  const variants = [
    `Baby, Mama's still waiting on the proof for "${title}". You did the real thing — now show Mama. Send the receipt or the photo so it lives in the binder where neither of us can pretend it didn't happen.`,
    `Sweet thing, ${noun} is real and Mama wants it on paper. Send the screenshot or the forwarded email for "${title}". Mama's collecting it.`,
    `You don't get to do "${title}" and let it slip away quiet, baby. Send Mama the proof — receipt, email, or a photo. It belongs in the binder.`,
  ]
  return variants[Math.floor(Math.random() * variants.length)]
}

async function nudgeUserRows(supabase: SupabaseClient, userId: string, rows: IrrevRow[]): Promise<number> {
  const gate = await checkSafewordGate(supabase, userId)
  if (!gate.allowed) return 0

  const { data: us } = await supabase.from('user_state').select('handler_persona').eq('user_id', userId).maybeSingle()
  const isMommy = isMommyPersona((us as { handler_persona?: string } | null)?.handler_persona ?? null)

  let sent = 0
  for (const row of rows) {
    const trigger = `irreversible_proof_overdue:${row.id}`

    // Per-item idempotency: don't double-queue if a live nudge already sits
    // in the queue for this exact event today.
    const { data: existing } = await supabase
      .from('handler_outreach_queue')
      .select('id')
      .eq('user_id', userId)
      .eq('trigger_reason', trigger)
      .gte('scheduled_for', new Date(Date.now() - 20 * 3600_000).toISOString())
      .limit(1)
    if (existing && existing.length > 0) continue

    const message = mommyVoiceCleanup(nudgeText(row.event_kind, row.title, isMommy))

    const { error: insErr } = await supabase.from('handler_outreach_queue').insert({
      user_id: userId,
      message,
      urgency: 'normal',
      trigger_reason: trigger,
      source: 'irreversible_proof',
      kind: 'proof_nudge',
      scheduled_for: new Date().toISOString(),
      expires_at: new Date(Date.now() + 24 * 3600_000).toISOString(),
      evidence_kind: 'photo',
    })
    if (insErr) { console.error('[proof-nudge] insert failed', insErr.message); continue }

    // Atomic last_nudged_at + nudge_count bump via RPC (mig 606). The
    // RPC also re-checks the row is still pending, so a concurrent capture
    // can't get clobbered.
    await supabase.rpc('mark_irreversible_nudged', { p_event_id: row.id })

    sent++
  }

  if (sent > 0) {
    await logAuthority(supabase, {
      user_id: userId, surface: 'irreversible_proof', action: 'overdue_nudge',
      target_table: 'irreversible_events',
      summary: `Nudged ${sent} overdue proof item(s)`,
      payload: { count: sent }, autonomous: true,
    })
  }
  return sent
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
  let body: { user_id?: string } = {}
  try { body = await req.json() } catch { /* */ }

  const cutoff = new Date(Date.now() - 20 * 3600_000).toISOString()
  let q = supabase
    .from('irreversible_events')
    .select('id, user_id, event_kind, title, proof_due_at, last_nudged_at')
    .eq('status', 'pending')
    .not('proof_due_at', 'is', null)
    .lte('proof_due_at', new Date().toISOString())
    .or(`last_nudged_at.is.null,last_nudged_at.lte.${cutoff}`)
    .limit(500)
  if (body.user_id) q = q.eq('user_id', body.user_id)

  const { data, error } = await q
  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const rows = (data || []) as IrrevRow[]
  const byUser = new Map<string, IrrevRow[]>()
  for (const r of rows) {
    const arr = byUser.get(r.user_id) ?? []
    arr.push(r)
    byUser.set(r.user_id, arr)
  }

  let total = 0
  for (const [userId, userRows] of byUser) {
    try { total += await nudgeUserRows(supabase, userId, userRows) }
    catch (e) { console.error('[proof-nudge] user failed', userId, (e as Error).message) }
  }

  return new Response(JSON.stringify({ ok: true, candidates: rows.length, nudged: total }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
