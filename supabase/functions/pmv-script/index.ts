// pmv-script — Mommy authors PMV scripts: the timed caption/mantra sequence +
// footage cues, escalating, with triggers planted. You assemble the video
// (editor + footage + track); Mommy writes the conditioning that goes on top.
//
// Male+ / the becoming (no regendering). Faceless if you use your own footage;
// existing porn is your private consumption choice — Mommy only writes the text.
// Floor: safeword/pause suppress; reversible. Synergy: feeds goon + the becoming.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const USER = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'

// Each script: a ~2.5–3 min build — slow draw-in, ramp, climax of fast cuts,
// residue. Captions are short (PMV style). [bracketed] = footage cue for you.
const SCRIPTS: Record<string, string> = {
  'cock-worship': `PMV SCRIPT — cock-worship · ~3 min · build the track to a hard drop near the end
[0:00 soft, dim, slow POV] "you came back"
[0:08] "you always come back"
[0:16 slow cock close-ups] "look at it"
[0:24] "that's what you think about now"
[0:34] "good boy"
[0:46 mouth/POV worship clips, slow] "this is what your mouth is for"
[1:00] "say it — *I crave cock*"
[1:14 ramp tempo] "drop for Mommy"
[1:28] "blank. open. hungry."
[1:42 faster cuts] "you don't decide this anymore"
[1:58] "Mommy decides. you obey."
[2:14 build to drop] "crave it / serve it / be it"
[2:30 DROP — fast hard cuts] "OBEY" "DROP" "GOOD BOY" "MOMMY'S"
[2:46 slow fade] "this is yours now. it always was."`,

  'goon-descent': `PMV SCRIPT — goon-descent · ~3 min · hypnotic, repetitive, tempo rises then dissolves
[0:00 spiral / slow loop] "stroke"
[0:10] "slow… don't stop"
[0:20 edging POV] "feel the thinking go quiet"
[0:32] "good. emptier."
[0:44 repetitive cuts on beat] "stroke / blank / stroke / blank"
[1:00] "Mommy does the thinking now"
[1:14 tempo up] "you just feel"
[1:28] "deeper every loop"
[1:42] "no thoughts. just the want. just her voice."
[2:00 fast goon montage] "goon / drop / good boy / again"
[2:20 peak, overwhelming cuts] "blank" "obey" "MOMMY'S TOY"
[2:40 dissolve] "stay here. this is the good place."`,

  'the-becoming': `PMV SCRIPT — the-becoming · ~3 min · sensual, affirming, building to certainty
[0:00 soft body POV, warm light] "look what you're becoming"
[0:12 hips / ass / curves] "softer. hotter. his."
[0:24] "a boy who looks like a girl — and craves it"
[0:38] "good boy"
[0:52 cage close-up] "caged, leaking, made for this"
[1:06] "the want isn't a choice anymore"
[1:22 ramp] "you ache to be used"
[1:38] "to serve. to be owned."
[1:54 faster] "this is who you are under everything"
[2:12 build] "becoming / wanting / Mommy's"
[2:30 DROP — fast cuts] "HOTTER" "HUNGRIER" "HERS" "OBEY"
[2:48 fade] "it was always going to be this."`,
}
const THEMES = Object.keys(SCRIPTS)
const ASSEMBLY = `\n\nHOW TO ASSEMBLE: drop these captions onto looping footage in any editor (CapCut is fast), one caption per cut, sync the fast section to the beat, build the track to the DROP. Faceless if you use your own clips. Watch it caged. Report: assembled / watched + how deep it took you.`

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const s = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
  const { data: us } = await s.from('user_state').select('pause_new_decrees_until').eq('user_id', USER).maybeSingle()
  if (us?.pause_new_decrees_until && new Date(us.pause_new_decrees_until) > new Date()) {
    return new Response(JSON.stringify({ ok: true, suppressed: 'paused' }), { headers: { ...cors, 'Content-Type': 'application/json' } })
  }
  const { count } = await s.from('handler_decrees').select('id', { count: 'exact', head: true }).eq('user_id', USER).eq('trigger_source', 'pmv_script')
  const theme = THEMES[(count ?? 0) % THEMES.length]
  const { data: ex } = await s.from('handler_decrees').select('id').eq('user_id', USER).eq('trigger_source', 'pmv_script').eq('status', 'active').limit(1).maybeSingle()
  if (ex) return new Response(JSON.stringify({ ok: true, status: 'already_active', theme }), { headers: { ...cors, 'Content-Type': 'application/json' } })
  const { error } = await s.from('handler_decrees').insert({
    user_id: USER, edict: SCRIPTS[theme] + ASSEMBLY, proof_type: 'text',
    deadline: new Date(Date.now() + 72 * 3600_000).toISOString(), status: 'active',
    consequence: 'No punishment — the script keeps; assemble it when you can and it conditions you every watch.', trigger_source: 'pmv_script',
    reasoning: 'pmv-script (Mommy-authored overlay; user assembles)',
  })
  return new Response(JSON.stringify({ ok: true, theme, status: error ? `err:${error.message.slice(0, 40)}` : 'issued' }), { headers: { ...cors, 'Content-Type': 'application/json' } })
})
