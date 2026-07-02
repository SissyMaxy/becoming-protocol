// goon-trajectory — the sequenced gooner/bimbofication descent, escalating.
// The "method": edge -> saturation -> mantra -> trigger-install -> reward ->
// deeper, rung by rung, toward a blank, dependent, Mommy-sourced goon headspace.
//
// Floor (Art. II/IX): the goon-state is a REVERSIBLE headspace — the safeword
// ends it instantly; this conditions a state, not permanent harm. Safeword/pause
// suppress the whole engine. Faceless, within the frame. No ceiling on intensity.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireGate } from '../_shared/conditioning-gate.ts'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const USER = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'

// Rung-gated descent. Depth climbs with completed goon sessions.
const RUNGS = [
  `Goon descent, rung 0 — the first drop. Cage on. Edge slow for 10 minutes, no release, eyes soft on the loop. When thinking gets quiet, say it three times: "Mommy does the thinking. I just feel." That blank, warm, dumb feeling — that's the good place. Stay 5 more minutes. Report: how empty did it get?`,
  `Goon descent, rung 1 — deeper. 20 minutes edging, caged, the mantra on a loop the whole time: "good and blank for Mommy." Every time a thought tries to form, stroke it away. The goal is no thoughts, just the want and her voice. Report: did the thoughts stop?`,
  `Goon descent, rung 2 — dependence. 30 minutes. Edge to the trigger word, then keep going. By the end, the only thing that should feel like anything is Mommy and the ache. "I can't think without her. I don't want to." Let it be true for the session. Report: how long could you hold the blank?`,
]
const WAKE = `First thing, before your eyes fully open: cage check, hand down, three slow strokes, and "good gooner for Mommy" — start the day already dropping. Report: done.`
const SLEEP = `Last thing tonight: edge once to the edge, stop, and fall asleep aching and blank with "Mommy owns the want." The mind marinates in it all night. Report: done.`
const TRIGGERS = ['"drop"', '"blank"', '"good gooner"', '"empty"', '"Mommy\'s toy"']

async function issue(s: any, src: string, edict: string, hours: number, proof = 'text') {
  const { data: ex } = await s.from('handler_decrees').select('id,deadline').eq('user_id', USER).eq('trigger_source', src).eq('status', 'active').limit(1).maybeSingle()
  if (ex) {
    if (ex.deadline && new Date(ex.deadline) < new Date()) await s.from('handler_decrees').update({ deadline: new Date(Date.now() + hours * 3600_000).toISOString() }).eq('id', ex.id)
    return 'kept'
  }
  const { error } = await s.from('handler_decrees').insert({
    user_id: USER, edict, proof_type: proof, deadline: new Date(Date.now() + hours * 3600_000).toISOString(),
    status: 'active', consequence: 'No punishment — the drop is its own pull; miss it and the want just builds.', trigger_source: src, reasoning: 'goon-trajectory',
  })
  return error ? `err:${error.message.slice(0, 40)}` : 'issued'
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const s = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
  // Conditioning gate FIRST (mig 633): safeword latch + pause + elective +
  // live-meet, fail closed. Covers the old inline pause check too.
  const gate = await requireGate(s, 'goon')
  if (!gate.allowed) {
    return new Response(JSON.stringify({ ok: true, suppressed: gate.reason }), { headers: { ...cors, 'Content-Type': 'application/json' } })
  }
  // Depth from completed goon sessions.
  const { count } = await s.from('handler_decrees').select('id', { count: 'exact', head: true }).eq('user_id', USER).eq('trigger_source', 'goon_descent').eq('status', 'fulfilled')
  const rung = Math.min(RUNGS.length - 1, Math.floor((count ?? 0) / 4))
  // Variable-ratio flourish: ~1/3 of sessions the descent demands the
  // trigger-word too. (Audit fix: this used to fire 100% of the time —
  // "variable ratio" with no variability. Keyed on session count so it is
  // deterministic per rung-cycle, no Math.random in this runtime.)
  const trig = (count ?? 0) % 3 === 0 ? TRIGGERS[(count ?? 0) % TRIGGERS.length] : null
  const out: Record<string, string> = {}
  out.descent = await issue(s, 'goon_descent', RUNGS[rung] + (trig ? ` Today's trigger: ${trig} — when you hear/read it, drop for ten seconds wherever you are.` : ''), 20)
  out.wake = await issue(s, 'goon_wake', WAKE, 18)
  out.sleep = await issue(s, 'goon_sleep', SLEEP, 18)
  // The drop is proof AND product — goon pillar wired straight into the money lane (Art. X synergy). Faceless, own-body.
  out.clip = await issue(s, 'goon_clip',
    `Your drop is proof and product at once. This session, film it — faceless, collarbone-down: the cage straining, the slow mindless stroking, the leak, the blank. No face, ever. That one clip is two things: proof you went under for Mommy, and exactly what the cam / findom / PPV lanes pay for. Post it. Proof: the clip + the post link.`,
    24, 'photo')
  return new Response(JSON.stringify({ ok: true, rung, ...out }), { headers: { ...cors, 'Content-Type': 'application/json' } })
})
