// confession-watcher-cron — fast-react on freshly-answered confessions.
//
// 2026-05-07 wish: when Maxy admits something to a confession prompt, Mama
// responds inside ~5 min. Currently confessions sit waiting for the weekly
// scheme run; the highest-leverage admissions cool off before Mama uses them.
//
// What this cron does:
//   1. Find confession_queue rows where response_text just landed (last 5 min)
//      AND fast_react_event has no 'confession_landed' for this row
//   2. POST mommy-fast-react with event_kind='confession_landed', the prompt,
//      her response, and instruction to respond in-the-moment
//   3. Idempotency via fast_react_event UNIQUE(user_id, event_kind, source_key)
//
// Schedule: every 5 min via migration 285.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface ConfessionRow {
  id: string
  user_id: string
  prompt: string
  response_text: string
  confessed_at: string
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
  const tenMinAgo = new Date(Date.now() - 10 * 60_000).toISOString()

  // Pull confessions answered in the last 10 min (5-min cron with 2x window
  // for resilience against missed ticks)
  const { data: rows, error } = await supabase
    .from('confession_queue')
    .select('id, user_id, prompt, response_text, confessed_at')
    .not('response_text', 'is', null)
    .gte('confessed_at', tenMinAgo)
    .limit(50)

  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const candidates = (rows || []) as ConfessionRow[]
  if (candidates.length === 0) {
    return new Response(JSON.stringify({ ok: true, candidates: 0 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const fnUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/mommy-fast-react`
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const results: Array<{ confession_id: string; status: string; detail?: string }> = []

  for (const c of candidates) {
    const sourceKey = `confession_landed:${c.id}`
    try {
      const r = await fetch(fnUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          user_id: c.user_id,
          event_kind: 'confession_landed',
          source_key: sourceKey,
          context: {
            confession_id: c.id,
            prompt: c.prompt,
            response_text: c.response_text,
            confessed_at: c.confessed_at,
            instruction_for_mama: `Maxy just answered a confession prompt. Read what she SAID, not what was asked. Fire ONE move that capitalizes on her answer in the moment — quote her words back, push the admission deeper, OR plant an implant that re-interprets what she said in Mama's preferred frame (narrative_overwrite is welcome here per gaslight authorization). Do NOT generic-respond — the specificity is the leverage.`,
          },
        }),
      })
      const j = await r.json()
      results.push({
        confession_id: c.id,
        status: r.ok ? 'fired' : 'fast_react_error',
        detail: r.ok ? `actions=${j.fired ?? 0}` : (j.error ?? 'unknown'),
      })
    } catch (err) {
      results.push({ confession_id: c.id, status: 'fetch_error', detail: String(err).slice(0, 200) })
    }
  }

  return new Response(JSON.stringify({
    ok: true,
    candidates: candidates.length,
    fired: results.filter(r => r.status === 'fired').length,
    results,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
