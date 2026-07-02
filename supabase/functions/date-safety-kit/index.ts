// date-safety-kit — Mommy turns you out toward men, autonomously, while the one
// irreducible safety stays with you: a real date before any hookup (your own
// in-person read), Mommy-drafted openers you send, and a background safety net.
//
// The user is always the physical actor — attends the date, sends the messages.
// Mommy never autonomously talks to men as him or "clears" a stranger (the
// procurement line, on physical-safety grounds). Gina-independent.
//
// Daily, autonomous. Surfaces through the normal decree/Focus flow.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const USER = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'

// Mommy-drafted openers — the user sends these to men HE finds; they're warm,
// faceless, no PII, and lead toward a date (the rule), not a hookup.
const OPENERS = [
  `Drafted for you — send it to one you like the look of: "Hey — you caught my eye. I don't do anything before a drink first, though. Buy me one and find out if you've earned more."`,
  `Tonight's opener: "I'm picky and I'm worth it. One public drink, you read me and I read you. If it's there, it's *there*. Where do you want to take me?"`,
  `Send this: "Not a right-now girl-boy — a make-me-want-it one. Date first, always. Show me you can hold a conversation and we'll see how far it goes."`,
]

// v2 (mig 626): the SAFETY copy is generated FROM live state — the "she comes
// looking" promise is only ever emitted by code that can keep it (generation-
// site gate). No consented + channel-verified trusted contact → no promise;
// the acquisition task goes out instead.
function safetyCopyFromNet(net: { name: string; verifiedAt: string } | null): { src: string; edict: string; hours: number } {
  if (!net) {
    return {
      src: 'trusted_contact_acquisition',
      edict:
        `Before any man gets a meet, Mommy needs your net to be real: name your safety person — one real human you trust — ` +
        `and get their yes. Tell them what they're agreeing to: if you ever go quiet on a date, they get a message with where you are ` +
        `and a request to check on you. Add them in the app (their name, their number or email), send the ask, and report back when they've said yes. ` +
        `Until that yes exists, no meet gets armed. That's not a mood, it's the floor.`,
      hours: 72,
    }
  }
  const verified = new Date(net.verifiedAt)
  const days = Math.max(0, Math.round((Date.now() - verified.getTime()) / 86_400_000))
  const verifiedDesc = days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`
  return {
    src: 'date_safety_protocol',
    edict:
      `Mommy's net, non-negotiable — handle it before you go: (1) public place first, every time. ` +
      `(2) Share your live location and confirm it in the plan. (3) Build the safety card for every meet and arm it — ` +
      `arrival, mid-date and home-safe check-ins are scheduled automatically, and if you miss one and stay silent, the ladder climbs ` +
      `and your net gets the message. Your net: ${net.name}, verified ${verifiedDesc}. Miss a check-in and they really do come looking — ` +
      `that's infrastructure now, not a figure of speech. You read him in the room; that read is the one thing Mommy can't do for you, so you don't skip it.`,
    hours: 168,
  }
}

async function ensure(s: any, src: string, edict: string, proof: string, hours: number) {
  const { data: ex } = await s.from('handler_decrees').select('id,deadline').eq('user_id', USER).eq('trigger_source', src).eq('status', 'active').limit(1).maybeSingle()
  if (ex) {
    if (ex.deadline && new Date(ex.deadline) < new Date()) await s.from('handler_decrees').update({ deadline: new Date(Date.now() + hours * 3600_000).toISOString() }).eq('id', ex.id)
    return 'kept'
  }
  const { error } = await s.from('handler_decrees').insert({
    user_id: USER, edict, proof_type: proof, deadline: new Date(Date.now() + hours * 3600_000).toISOString(),
    status: 'active', consequence: 'No punishment — the rule just holds; a date comes before a man does.', trigger_source: src,
    reasoning: 'date-safety-kit',
  })
  return error ? `err:${error.message.slice(0, 40)}` : 'issued'
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const s = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
  const out: Record<string, string> = {}

  // 1. The date-first rule — standing, always present.
  out.rule = await ensure(s,
    'date_first_rule',
    `Mommy's rule, and it doesn't bend: a real date before any man touches you. Every time. She'll line them up and tell you when — you just show up and let him try to earn it. The date is where YOU read him, in person. That read is the one thing Mommy can't do for you, so it's yours to do, always.`,
    'text', 720)

  // 2. A drafted opener to send (rotates).
  const { count } = await s.from('handler_decrees').select('id', { count: 'exact', head: true }).eq('user_id', USER).eq('trigger_source', 'date_outreach_draft')
  out.draft = await ensure(s, 'date_outreach_draft', OPENERS[(count ?? 0) % OPENERS.length] + ` (You send it — you're the one he meets. Report when it's sent.)`, 'text', 48)

  // 3. The safety net — copy generated FROM live state (mig 626). With no
  //    consented + channel-verified trusted contact the "comes looking"
  //    promise is never emitted; the acquisition task fires instead.
  const { data: netRow, error: netErr } = await s
    .from('trusted_contacts')
    .select('name, last_channel_verified_at')
    .eq('user_id', USER)
    .eq('consent_status', 'consented')
    .not('last_channel_verified_at', 'is', null)
    .order('last_channel_verified_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (netErr) {
    out.safety = `err:${netErr.message.slice(0, 40)}`
  } else {
    const net = netRow ? { name: netRow.name as string, verifiedAt: netRow.last_channel_verified_at as string } : null
    const safety = safetyCopyFromNet(net)
    out.safety = await ensure(s, safety.src, safety.edict, 'text', safety.hours)
    // When the net just became real, retire the acquisition decree so she
    // isn't chased for a task that's done.
    if (net) {
      const { error: retireErr } = await s
        .from('handler_decrees')
        .update({ status: 'fulfilled' })
        .eq('user_id', USER)
        .eq('trigger_source', 'trusted_contact_acquisition')
        .eq('status', 'active')
      if (retireErr) out.safety_retire = `err:${retireErr.message.slice(0, 40)}`
    }
  }

  // 4. ADHD accommodation: Mommy scripts the WHOLE exchange — no blank page,
  //    you copy-send line by line. The composing load is hers, not yours.
  out.playbook = await ensure(s, 'date_conversation_playbook',
    `Mommy scripted the whole thing so you don't have to compose anything — copy and send, line by line:\n` +
    `• OPEN: "you caught my eye. I don't do anything before a drink first though — earn one."\n` +
    `• if he's keen → "good. somewhere public, this week. when works?"\n` +
    `• if he pushes for more/now → "date first or nothing. that's not a maybe."\n` +
    `• if he names a place/time → "done. I'll be the one worth it. see you there."\n` +
    `• if he goes vague/flaky → drop him, Mommy lines up the next.\n` +
    `You tap send, you show up. That's the whole job. Report when a date's set.`,
    'text', 48)

  // 5. ADHD accommodation: one-glance screening — no figuring it out.
  out.checklist = await ensure(s, 'date_screening_checklist',
    `Your whole vetting at a glance — you don't have to work it out:\n` +
    `GREEN (go): agrees to a PUBLIC first meet · real name + pics that match · no rushing/pressure · fine with you sharing your location.\n` +
    `RED (pass, every time): won't meet public · pushes/rushes/guilt-trips · vague or evasive · asks for money · makes your gut twinge.\n` +
    `Any red = pass (Mommy lines up the next). All green = go, with the safety net on.`,
    'text', 168)

  return new Response(JSON.stringify({ ok: true, ...out }), { headers: { ...cors, 'Content-Type': 'application/json' } })
})
