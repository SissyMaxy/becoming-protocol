// temptation-engine — the navigate-or-resist CNC game, at full intensity.
//
// Maxy's dream: Mommy "finds him," paints the scene, and you log in and have to
// navigate whether to give in or stay the good husband — the arousal living in
// the resistance and the siege. Built as a SELF-CONTAINED fantasy game: the men
// and scenarios are FICTION (generated), never real arrangements. "Giving in"
// plays out a fantasy, it is never a directive to go do it for real — that
// keeps the force inside the circle of yes (no real stranger, no betrayal of a
// non-consenting Gina, no eroded safety). Intensity is uncapped on the fiction
// side; the harm side stays walled.
//
// Issues a temptation decree (proof: text — your choice + how hard it was).
// Resisting feeds the good-husband streak; the point is the navigation. Runs
// daily; deduped per source. Surfaces through the normal decree/Focus flow.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const HANDLER_USER = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'

// Fictional temptation scenarios — vivid scene-setting + the navigate beat.
// (Generated fantasy; no real man, place, or arrangement is implied.)
const SCENARIOS = [
  `Mommy found you one, sweet thing. In the fantasy: an older man, calm, certain, who'd put a hand on the back of your neck and not ask twice. You can feel how easy it would be to just go soft and let him. So navigate it: do you give in to the picture, or do you stay Mommy's good locked husband tonight? Tell me which — and how hard the no was.`,
  `Here's tonight's scene, baby: kneeling for a stranger who only wants your mouth, the cage aching, nothing expected of you but to be used and useful. Mommy's dangling it right in front of you. Give in to the fantasy or hold the line? Report your choice and what it cost you to make it.`,
  `Picture it the way Mommy's painting it: you, panties on under your boy clothes, a man who'd never know your name, the relief of finally just being the toy. It's right there. You give in, or you stay good for me? Navigate it and tell me — and be honest about how close you came.`,
  `Mommy's testing you again. In the fantasy she's already told him you're coming — soft, obedient, leaking in the cage. All you'd have to do is not say no. So say it, or don't: give in to the picture, or resist and stay mine and faithful? Which one, and how loud was the part of you that wanted to fold?`,
]

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
  let body: { user_id?: string; dry_run?: boolean } = {}
  try { body = await req.json() } catch { /* */ }
  const userId = body.user_id || HANDLER_USER
  const src = 'temptation_navigate'

  // One open temptation at a time — dedup.
  const { data: existing } = await supabase.from('handler_decrees')
    .select('id').eq('user_id', userId).eq('trigger_source', src).eq('status', 'active').limit(1).maybeSingle()
  if (existing) {
    return new Response(JSON.stringify({ ok: true, status: 'already_active' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  // Vary the scenario by day-of-cycle (no Math.random in this runtime context elsewhere; use session count).
  const { count } = await supabase.from('handler_decrees').select('id', { count: 'exact', head: true })
    .eq('user_id', userId).eq('trigger_source', src)
  const edict = SCENARIOS[(count ?? 0) % SCENARIOS.length]

  if (body.dry_run) {
    return new Response(JSON.stringify({ ok: true, status: 'would_issue', preview: edict.slice(0, 80) }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const { data: dec, error } = await supabase.from('handler_decrees').insert({
    user_id: userId, edict, proof_type: 'text',
    deadline: new Date(Date.now() + 24 * 3600_000).toISOString(),
    status: 'active', consequence: 'No real-world consequence — this is the siege, not an order. Resisting is winning; the want is the point.',
    trigger_source: src,
    reasoning: 'temptation-engine: fictional CNC navigate-or-resist game (contained — no real arrangement)',
  }).select('id').single()

  return new Response(JSON.stringify({ ok: true, status: error ? `err:${error.message.slice(0, 50)}` : 'issued', id: (dec as { id?: string } | null)?.id }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
