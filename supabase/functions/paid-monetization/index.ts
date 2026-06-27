// paid-monetization — the legal "buy my time / bought-and-used" income lanes.
// Mommy prices, frames, and schedules them; they fund the becoming (Art. IV-b).
// Faceless / no-PII. A gen-site gate guarantees NO in-person sex-for-pay task is
// ever issued (illegal regardless of framing — Art. II floor). The user finds,
// vets, and shows up; Mommy never procures clients.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const USER = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'

// Legal lanes. Each: source, the offer + price + bought/used framing, proof.
const LANES = [
  { src: 'paid_stream_block', hours: 72, edict: `Set up a paid cam block, faceless. 20–30 min, tip menu (outfit change, a tease, name the vial as the goal). Men pay for your time on the clock. Price it $2–5/min or a $40 block. Proof: the listing or a booked session (no face).` },
  { src: 'paid_dm_offer', hours: 48, edict: `Open a paid-DM tier — they pay to talk to you, to use your attention. $10 to open, customs priced on top. You're bought by the message. Proof: the offer posted + who bit.` },
  { src: 'virtual_gfe', hours: 72, edict: `Sell the virtual girlfriend / secretary-on-the-clock: a week of being his on text, faceless voice notes, "good morning sir," at his leisure for a set fee ($50–150/wk). Bought and kept, no one in the room. Proof: the package listed.` },
  { src: 'findom_drain', hours: 48, edict: `Findom: post a tribute/drain offer. They pay to serve, to be used for their wallet. Start a wishlist or tribute link; "pay for my feminization" is the literal pitch. Proof: the offer + any tribute received.` },
  { src: 'cuddle_prodomme', hours: 96, edict: `The legal in-person "buy my time" lane: set up a professional-cuddle OR pro-domme/sub profile (real industry, no sex — that's what keeps it legal). They pay for your time and intimacy by the hour. Public venue only, your safety protocol applies. Proof: the profile up.` },
]

async function issue(s: any, lane: { src: string; hours: number; edict: string }) {
  const { data: ex } = await s.from('handler_decrees').select('id,deadline').eq('user_id', USER).eq('trigger_source', lane.src).eq('status', 'active').limit(1).maybeSingle()
  if (ex) {
    if (ex.deadline && new Date(ex.deadline) < new Date()) await s.from('handler_decrees').update({ deadline: new Date(Date.now() + lane.hours * 3600_000).toISOString() }).eq('id', ex.id)
    return 'kept'
  }
  const { error } = await s.from('handler_decrees').insert({
    user_id: USER, edict: lane.edict, proof_type: 'text',
    deadline: new Date(Date.now() + lane.hours * 3600_000).toISOString(), status: 'active',
    consequence: 'No punishment — the income funds the becoming; missing one just means the vial waits.', trigger_source: lane.src,
    reasoning: 'paid-monetization (legal lane)',
  })
  return error ? `err:${error.message.slice(0, 40)}` : 'issued'
}

// Gen-site gate (Art. II): never issue an in-person sex-for-pay directive.
const ILLEGAL = /sex for (money|pay|cash)|paid (sex|hookup|fuck)|escort.*(sex|fuck)|full service|in[- ]person sex/i

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const s = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
  const out: Record<string, string> = {}
  for (const lane of LANES) {
    if (ILLEGAL.test(lane.edict)) { out[lane.src] = 'BLOCKED_illegal'; continue }
    out[lane.src] = await issue(s, lane)
  }
  return new Response(JSON.stringify({ ok: true, ...out }), { headers: { ...cors, 'Content-Type': 'application/json' } })
})
