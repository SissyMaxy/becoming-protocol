// constraint-guard — neutralizes any surfaced item that violates Maxy's hard
// identity constraints, regardless of which (often older) generator produced it.
//
// 2026-06-26: a mommy_scheme arousal task ("edge while you imagine telling Gina
// about the woman you're becoming") leaked into Focus. It broke TWO standing
// constraints at once — Male+ (no regendering: feminization is additive, cock
// kept; never "becoming a woman / her / the-man-erased") and the paused
// Gina-disclosure lane (Gina is secret + gina_witness_consent='never'). Pausing
// one settings table doesn't catch this; dozens of un-reconciled generators
// still emit the old MtF/disclosure framing. This is the single chokepoint:
// scan active decrees + arousal_touch_tasks and cancel/expire anything that
// trips a constraint pattern. Runs on the critical loop. No new schema.
//
// It does NOT touch the allowed lanes (cruising / anon content / chastity /
// estrogen-embodiment) — only regendering language and disclosure-to-Gina.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Regendering / erasure framing — violates Male+ (additive, cock-kept).
// Covers overt regendering AND the protocol's own past-self erasure idioms
// ("the costume", "older version", "before Maxy", "your becoming").
const REGENDER = /\b(becoming|become|turn(ing)? you into|make you|you('re| are)) (a |into a )?(woman|girl|her|she)\b|woman you('re| are)? becoming|david is gone|no longer a (man|boy)|erase the (man|boy)|lose the cock|bottom surgery|older version of (you|your)|the costume\b|before maxy\b|who you (were|used to be)|the (man|boy|person) you (were|used to be)|less plausible|your becoming\b|chapter \d+ of your becoming/i
// Disclosure to Gina — she's secret + non-consenting (paused lane).
const GINA_DISCLOSE = /\b(tell|telling|told|disclose|disclosing|confess|show|reveal)\b[^.]{0,30}\bgina\b|\bgina\b[^.]{0,30}\b(find(s)? out|about (you|the|your)|sees? you|knows?|come out)|come out to gina/i

function violates(text: string | null | undefined): string | null {
  const t = text ?? ''
  if (REGENDER.test(t)) return 'regendering'
  if (GINA_DISCLOSE.test(t)) return 'gina_disclosure'
  return null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
  const nowIso = new Date().toISOString()
  const cancelledDecrees: string[] = []
  const expiredTouch: string[] = []

  // Active decrees
  const { data: decs } = await supabase.from('handler_decrees')
    .select('id, edict, trigger_source').eq('status', 'active').limit(2000)
  for (const d of (decs ?? []) as Array<{ id: string; edict: string; trigger_source: string }>) {
    const why = violates(d.edict)
    if (why) {
      await supabase.from('handler_decrees').update({
        status: 'cancelled',
        reasoning: `constraint-guard: ${why} conflicts with Male+/paused-Gina (src ${d.trigger_source})`,
      }).eq('id', d.id)
      cancelledDecrees.push(`${d.trigger_source}:${why}`)
    }
  }

  // Active (unexpired, incomplete) arousal touch tasks
  const { data: touch } = await supabase.from('arousal_touch_tasks')
    .select('id, prompt, generated_by').is('completed_at', null).gt('expires_at', nowIso).limit(2000)
  for (const t of (touch ?? []) as Array<{ id: string; prompt: string; generated_by: string }>) {
    const why = violates(t.prompt)
    if (why) {
      await supabase.from('arousal_touch_tasks').update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq('id', t.id)
      expiredTouch.push(`${t.generated_by}:${why}`)
    }
  }

  return new Response(JSON.stringify({
    ok: true, cancelled_decrees: cancelledDecrees.length, expired_touch: expiredTouch.length,
    cancelledDecrees, expiredTouch,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
