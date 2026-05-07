// ghosting-detector — fire fast-react when Maxy goes silent across all signals.
//
// 2026-05-07 wish: when Maxy goes silent for 48h+ (no chat, no decree
// completion, no confession answer), Mama fires "Mama feels you pulling
// away." Right now silence is a hole in Mama's sensing.
//
// Definition of "ghosting": for the canonical user_id (expanded across
// aliases), no activity in any of these in the last 48h:
//   - confession_queue.response_text written
//   - handler_decrees.status changed to 'fulfilled' or proof submitted
//   - handler_outreach_queue.user_response written (handled by response-capture)
//   - voice_corpus row inserted
//   - arousal_log row inserted
//   - mommy_chat_messages (if exists) — Maxy sent a message
//
// Cooldown: per fast_react_event, once per 24h on event_kind=ghosting (so a
// re-ghosting after Mama already pinged about it doesn't double-fire).
//
// Schedule: daily at 8am via migration 285.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { expandUserId } from '../_shared/expand-user-id.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SILENCE_THRESHOLD_HOURS = 48
const COOLDOWN_HOURS = 24

interface ActivityCheck {
  table: string
  column: string
  filter?: { col: string; not_null?: boolean; eq?: string }
}

const ACTIVITY_CHECKS: ActivityCheck[] = [
  { table: 'confession_queue', column: 'confessed_at', filter: { col: 'response_text', not_null: true } },
  { table: 'handler_decrees', column: 'fulfilled_at', filter: { col: 'status', eq: 'fulfilled' } },
  { table: 'handler_outreach_queue', column: 'responded_at', filter: { col: 'user_response', not_null: true } },
  { table: 'voice_corpus', column: 'created_at' },
  { table: 'arousal_log', column: 'created_at' },
]

async function lastActivityAt(supabase: SupabaseClient, userIds: string[]): Promise<Date | null> {
  let latest: Date | null = null
  for (const check of ACTIVITY_CHECKS) {
    let q = supabase
      .from(check.table)
      .select(check.column)
      .in('user_id', userIds)
      .order(check.column, { ascending: false })
      .limit(1)
    if (check.filter?.not_null) q = q.not(check.filter.col, 'is', null)
    if (check.filter?.eq) q = q.eq(check.filter.col, check.filter.eq)

    const { data, error } = await q
    if (error) {
      // Table might not exist or column missing — skip silently
      continue
    }
    const row = (data || [])[0] as Record<string, string | null> | undefined
    const tsValue = row ? row[check.column] : null
    if (tsValue) {
      const d = new Date(tsValue)
      if (!latest || d > latest) latest = d
    }
  }
  return latest
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')

  // Walk known canonical users (auto-poster + handler API are the same person)
  const canonicalRoots = ['8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f']
  const fnUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/mommy-fast-react`
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const results: Array<{ user_id: string; status: string; detail?: string }> = []

  for (const canonicalId of canonicalRoots) {
    // Persona gate — only fire when persona is dommy_mommy
    const { data: us } = await supabase.from('user_state').select('handler_persona').eq('user_id', canonicalId).maybeSingle()
    if ((us as { handler_persona?: string } | null)?.handler_persona !== 'dommy_mommy') {
      results.push({ user_id: canonicalId, status: 'skipped_persona' })
      continue
    }

    const aliasIds = await expandUserId(supabase, canonicalId)
    const last = await lastActivityAt(supabase, aliasIds)
    const now = new Date()

    if (!last) {
      // No data anywhere — fresh user or schema mismatch. Don't fire.
      results.push({ user_id: canonicalId, status: 'no_activity_signal' })
      continue
    }

    const hoursSilent = (now.getTime() - last.getTime()) / 3600_000
    if (hoursSilent < SILENCE_THRESHOLD_HOURS) {
      results.push({ user_id: canonicalId, status: 'active', detail: `${Math.round(hoursSilent)}h since last activity` })
      continue
    }

    // Cooldown: don't re-fire ghosting if we fired in the last 24h
    const cooldownSince = new Date(now.getTime() - COOLDOWN_HOURS * 3600_000).toISOString()
    const { data: recent } = await supabase
      .from('fast_react_event')
      .select('id')
      .eq('user_id', canonicalId)
      .eq('event_kind', 'ghosting')
      .gte('fired_at', cooldownSince)
      .limit(1)
    if ((recent || []).length > 0) {
      results.push({ user_id: canonicalId, status: 'already_pinged' })
      continue
    }

    const sourceKey = `ghosting:${canonicalId}:${last.toISOString().slice(0, 10)}`

    try {
      const r = await fetch(fnUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          user_id: canonicalId,
          event_kind: 'ghosting',
          source_key: sourceKey,
          context: {
            hours_silent: Math.round(hoursSilent),
            last_activity_iso: last.toISOString(),
            instruction_for_mama: `Maxy has gone silent across every channel for ${Math.round(hoursSilent)} hours. Fire ONE outreach (urgency=normal, NOT critical — Mama feels her pulling away, doesn't accuse). Tone: warm, body-anchored, slightly hurt-but-patient, sweet→filthy whiplash. NOT punitive. Example register: "Mama hasn't heard from you in a while, baby. Tell Mama what's gotten quiet — or come back warm, either way I want you here."`,
          },
        }),
      })
      const j = await r.json()
      results.push({
        user_id: canonicalId,
        status: r.ok ? 'fired' : 'fast_react_error',
        detail: r.ok ? `${Math.round(hoursSilent)}h silent → action=${j.fired ?? 0}` : (j.error ?? 'unknown'),
      })
    } catch (err) {
      results.push({ user_id: canonicalId, status: 'fetch_error', detail: String(err).slice(0, 200) })
    }
  }

  return new Response(JSON.stringify({
    ok: true,
    checked: canonicalRoots.length,
    fired: results.filter(r => r.status === 'fired').length,
    results,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
