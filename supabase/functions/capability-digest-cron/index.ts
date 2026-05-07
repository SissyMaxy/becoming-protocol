// capability-digest-cron — daily summary of Mama's capability changes.
//
// 2026-05-07 user feedback: "how will I know when mommy is autonomously
// making updates to her capabilities?" — there was no passive surface.
// This is the surface.
//
// What runs:
//   - Daily at 7:30am (after voice-pitch-watcher 7am, before ghosting 8am)
//   - For each canonical user, count mommy_code_wishes shipped in last 24h
//     and newly queued in last 24h
//   - Compose plain-English summary
//   - Insert into mama_capability_digest (idempotent per user+date)
//   - Insert into handler_outreach_queue with source='capability_digest',
//     urgency='low' so Maxy passively sees it on Today / push
//
// Voice: plain operator English. NOT Mama voice. This output is for the
// engineer side of Maxy reading the protocol's status, not the protocol
// target experiencing Mama. Keep it factual.
//
// Skip-conditions:
//   - User has no canonical user_alias entry AND no shipped/queued wishes
//   - Already digested this user for this date (UNIQUE constraint)

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { expandUserId } from '../_shared/expand-user-id.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface WishRow {
  id: string
  wish_title: string
  priority: string
  ship_notes: string | null
  shipped_at: string | null
  created_at: string
  protocol_goal: string | null
}

function summarize(shipped: WishRow[], queued: WishRow[]): string {
  if (shipped.length === 0 && queued.length === 0) {
    return 'No capability changes in the last 24h.'
  }

  const lines: string[] = []
  lines.push(`Mama capability digest — last 24h.`)
  lines.push('')

  if (shipped.length > 0) {
    lines.push(`SHIPPED (${shipped.length}):`)
    for (const w of shipped.slice(0, 8)) {
      const note = w.ship_notes ? ` — ${w.ship_notes.slice(0, 200)}` : ''
      lines.push(`  • [${w.priority}] ${w.wish_title}${note}`)
    }
    if (shipped.length > 8) lines.push(`  …and ${shipped.length - 8} more`)
    lines.push('')
  }

  if (queued.length > 0) {
    lines.push(`NEW WISHES QUEUED (${queued.length}):`)
    for (const w of queued.slice(0, 8)) {
      const goal = w.protocol_goal ? ` — ${w.protocol_goal.slice(0, 80)}` : ''
      lines.push(`  • [${w.priority}] ${w.wish_title}${goal}`)
    }
    if (queued.length > 8) lines.push(`  …and ${queued.length - 8} more`)
    lines.push('')
  }

  lines.push(`Run: npm run mommy:wishes --with-shipped   for full list with details.`)
  return lines.join('\n')
}

async function digestForCanonicalUser(supabase: SupabaseClient, canonicalUserId: string): Promise<{
  status: string
  detail?: string
  shipped_count?: number
  queued_count?: number
}> {
  const today = new Date().toISOString().slice(0, 10)

  // Idempotency: already digested today?
  const { data: existing } = await supabase
    .from('mama_capability_digest')
    .select('id')
    .eq('user_id', canonicalUserId)
    .eq('digest_date', today)
    .maybeSingle()
  if (existing) {
    return { status: 'already_digested' }
  }

  const since = new Date(Date.now() - 24 * 3600_000).toISOString()

  const [{ data: shippedData }, { data: queuedData }] = await Promise.all([
    supabase
      .from('mommy_code_wishes')
      .select('id, wish_title, priority, ship_notes, shipped_at, created_at, protocol_goal')
      .eq('status', 'shipped')
      .gte('shipped_at', since)
      .order('shipped_at', { ascending: false })
      .limit(20),
    supabase
      .from('mommy_code_wishes')
      .select('id, wish_title, priority, ship_notes, shipped_at, created_at, protocol_goal')
      .eq('status', 'queued')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  const shipped = (shippedData || []) as WishRow[]
  const queued = (queuedData || []) as WishRow[]

  if (shipped.length === 0 && queued.length === 0) {
    // Nothing to report — record an empty digest so the next cron tick
    // doesn't recompute. Skip the outreach insert.
    await supabase.from('mama_capability_digest').insert({
      user_id: canonicalUserId,
      digest_date: today,
      shipped_count: 0,
      queued_count: 0,
      summary_text: 'No capability changes in the last 24h.',
      shipped_items: [],
      queued_items: [],
    })
    return { status: 'no_changes', shipped_count: 0, queued_count: 0 }
  }

  const summary = summarize(shipped, queued)

  // Insert outreach (passive surface — low urgency, source distinguishes
  // it from Mama-voice outreach in any UI that filters)
  const { data: outreachRow, error: outreachErr } = await supabase
    .from('handler_outreach_queue')
    .insert({
      user_id: canonicalUserId,
      message: summary,
      urgency: 'low',
      trigger_reason: 'capability_digest',
      scheduled_for: new Date().toISOString(),
      // 7-day expiry — the user has a week to read it before it rolls off
      expires_at: new Date(Date.now() + 7 * 86400_000).toISOString(),
      source: 'capability_digest',
    })
    .select('id')
    .single()

  const outreachId = outreachErr ? null : (outreachRow as { id: string } | null)?.id ?? null

  // Persist digest row
  await supabase.from('mama_capability_digest').insert({
    user_id: canonicalUserId,
    digest_date: today,
    shipped_count: shipped.length,
    queued_count: queued.length,
    summary_text: summary,
    shipped_items: shipped.map(w => ({
      title: w.wish_title, priority: w.priority, ship_notes: w.ship_notes,
    })),
    queued_items: queued.map(w => ({
      title: w.wish_title, priority: w.priority, goal: w.protocol_goal,
    })),
    outreach_id: outreachId,
  })

  return {
    status: 'fired',
    detail: outreachErr ? `outreach_failed: ${outreachErr.message}` : `outreach_id=${outreachId}`,
    shipped_count: shipped.length,
    queued_count: queued.length,
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')

  // Walk the canonical roots — currently just the documented Handler API user.
  // expandUserId tells us if there are aliases, but the digest is per
  // canonical user (one digest, even when canonical+alias same person).
  const canonicalRoots = ['8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f']
  const results: Array<{ user_id: string; status: string; detail?: string; shipped_count?: number; queued_count?: number }> = []

  for (const canonicalId of canonicalRoots) {
    // Sanity: ensure the canonical id resolves (user_alias bridge is present)
    await expandUserId(supabase, canonicalId)
    const r = await digestForCanonicalUser(supabase, canonicalId)
    results.push({ user_id: canonicalId, ...r })
  }

  return new Response(JSON.stringify({
    ok: true,
    digests_fired: results.filter(r => r.status === 'fired').length,
    no_changes: results.filter(r => r.status === 'no_changes').length,
    already_digested: results.filter(r => r.status === 'already_digested').length,
    results,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
