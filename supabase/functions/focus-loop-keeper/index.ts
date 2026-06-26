// focus-loop-keeper — keeps the Focus surface to Maxy's clean Male+ loop.
//
// Decision 2026-06-26: don't build a standalone app — carve the clean surface
// out of the existing one. The only surface that matters is Focus (one task at
// a time). The legacy protocol has dozens of generators that keep surfacing
// off-loop / stale / conflicting tasks (the wake-grab, the Gina task, etc.).
// This enforces that today's focus pick is always a clean-loop task — exercise
// conditioning, the workout→content fusion, or a content/money task — and
// re-picks past anything else. Legacy decrees still exist in the back; they
// just never reach the screen. constraint-guard handles framing; this handles
// WHAT gets surfaced. Runs on the critical loop. No new schema, no frontend.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const HANDLER_USER = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'

// The clean Male+ loop, in surfacing priority. A decree whose trigger_source
// startsWith one of these IS the loop; anything else is legacy and re-picked
// past. Exercise anchors the day; content/money follows.
const PRIORITY = [
  'exercise_cond_5min', 'exercise_content_fusion', 'exercise_cond_', 'exercise_',
  'temptation_navigate',
  'revenue_first_clip', 'revenue_thong_', 'revenue_presence_build', 'revenue_',
]
const isLoop = (src: string) => PRIORITY.some(p => (src || '').startsWith(p))

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
  const userId = HANDLER_USER
  const today = new Date().toISOString().slice(0, 10)

  // Is today's pick already a live clean-loop task? If so, leave it.
  const { data: pick } = await supabase.from('focus_picks')
    .select('decree_id').eq('user_id', userId).eq('pick_date', today).maybeSingle()
  if (pick?.decree_id) {
    const { data: d } = await supabase.from('handler_decrees')
      .select('status, trigger_source').eq('id', pick.decree_id).maybeSingle()
    if (d && (d as { status: string }).status === 'active' && isLoop((d as { trigger_source: string }).trigger_source)) {
      return new Response(JSON.stringify({ ok: true, action: 'kept', source: (d as { trigger_source: string }).trigger_source }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
  }

  // Otherwise re-pick the best active clean-loop decree.
  const { data: candidates } = await supabase.from('handler_decrees')
    .select('id, trigger_source').eq('user_id', userId).eq('status', 'active').limit(500)
  let pool = ((candidates ?? []) as Array<{ id: string; trigger_source: string }>).filter(c => isLoop(c.trigger_source))

  // None available → make one (the gentle exercise anchor always applies).
  if (pool.length === 0) {
    await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/exercise-conditioning`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
      body: '{}',
    }).catch(() => {})
    const { data: c2 } = await supabase.from('handler_decrees')
      .select('id, trigger_source').eq('user_id', userId).eq('status', 'active').limit(500)
    pool = ((c2 ?? []) as Array<{ id: string; trigger_source: string }>).filter(c => isLoop(c.trigger_source))
  }
  if (pool.length === 0) {
    return new Response(JSON.stringify({ ok: true, action: 'no_loop_task_available' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // Pick by PRIORITY order.
  const rank = (src: string) => { const i = PRIORITY.findIndex(p => src.startsWith(p)); return i < 0 ? 999 : i }
  pool.sort((a, b) => rank(a.trigger_source) - rank(b.trigger_source))
  const chosen = pool[0]

  await supabase.from('focus_picks').upsert(
    { user_id: userId, pick_date: today, decree_id: chosen.id, pick_reason: 'focus-loop-keeper: clean Male+ loop' },
    { onConflict: 'user_id,pick_date' },
  )
  return new Response(JSON.stringify({ ok: true, action: 'repicked', source: chosen.trigger_source }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
