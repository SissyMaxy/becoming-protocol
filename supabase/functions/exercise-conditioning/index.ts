// exercise-conditioning — builds the WANT to move, not just the prescription.
//
// Maxy (2026-06-25): "I'm sedentary and I won't do it. Eroticize exercise /
// hypno-pair it with gender euphoria + arousal so I WANT to. Mommy can do
// anything to make me want to exercise." Exercise serves both feminization
// (glute/hip shaping, HRT body outcomes) and health, and the want is genuinely
// consented — this is the pavlovian/euphoria machinery applied to movement.
//
// workout-prescriber already gives feminizing routines; this adds the
// conditioning layer: a SEDENTARY-FRIENDLY tiny-start ladder (5 min first, not
// 4x12), each rep framed as her body arriving, paired with a self-administered
// arousal reward on completion so movement → euphoria/arousal builds a
// conditioned drive. Optionally queues a trance session (mommy-trance-author,
// arousal-pairing theme) the same night to pre-load the want.
//
// Embodied, escalating, deduped per source, surfaced via the focus pipeline.
// No new schema (handler_decrees + exercise tracking). POST { user_id?,
// dry_run?, queue_trance? }.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const HANDLER_USER = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'

interface CTask { source: string; hours: number; rung: number; edict: string }

// Tiny-start → build. Each pairs movement with the feminizing payoff + an
// arousal reward, so the body learns: move = her, move = good.
const LADDER: CTask[] = [
  {
    source: 'exercise_cond_5min', hours: 24, rung: 0,
    edict: `Five minutes. That's the entire task — not fitness, the first pairing. Glute bridges on the floor, slow, or a walk. Don't push to exhaustion; you're teaching your body that moving and becoming her are the same thing. When the five minutes are done and you feel the warmth, that's your cue — touch yourself, just a little, and let the reward land on the movement. Report: done, and what the warmth felt like.`,
  },
  {
    source: 'exercise_cond_glutes', hours: 36, rung: 1,
    edict: `One set: 15 slow glute bridges, squeeze 2 seconds at the top. This is the exact muscle that builds her hips and ass — every squeeze is shape arriving where you want it. Feel where it burns; that ache is her, not effort. Finish the set, then the reward — pair the arousal to the burn while it's still there. Report: done + where you felt it.`,
  },
  {
    source: 'exercise_cond_euphoria', hours: 48, rung: 2,
    edict: `Two short sets today — 15 glute bridges, then 12 sumo squats (wide stance, toes out). Before you start, say it once: "this is me building her." Move slow enough to feel each one shaping you. The pairing is the point: effort → her body → arousal. Reward yourself the moment you finish, every time, so the want wires in. Report: done + did wanting it come any easier than last time?`,
  },
  {
    source: 'exercise_cond_trance_listen', hours: 24, rung: 0,
    edict: `Before you move today, listen to tonight's trance with your eyes closed — let it set the want before your body has a chance to argue. Then do your five minutes while the suggestion is still warm. Report: done.`,
  },
]

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
  let body: { user_id?: string; dry_run?: boolean; queue_trance?: boolean } = {}
  try { body = await req.json() } catch { /* */ }
  const userId = body.user_id || HANDLER_USER

  // How conditioned already? Count completed exercise sessions to gate the rung
  // — never skip ahead of a sedentary start.
  const { count: done } = await supabase.from('exercise_sessions')
    .select('id', { count: 'exact', head: true }).eq('user_id', userId)
  const sessions = done ?? 0
  const maxRung = sessions < 3 ? 0 : sessions < 8 ? 1 : 2

  const issued: Array<{ source: string; status: string; id?: string }> = []
  for (const t of LADDER) {
    if (t.rung > maxRung) { issued.push({ source: t.source, status: `gated_rung_${t.rung}` }); continue }
    const { data: existing } = await supabase.from('handler_decrees')
      .select('id').eq('user_id', userId).eq('trigger_source', t.source).eq('status', 'active').limit(1).maybeSingle()
    if (existing) { issued.push({ source: t.source, status: 'already_active' }); continue }
    if (body.dry_run) { issued.push({ source: t.source, status: 'would_issue' }); continue }

    const { data: dec, error } = await supabase.from('handler_decrees').insert({
      user_id: userId, edict: t.edict, proof_type: 'text',
      deadline: new Date(Date.now() + t.hours * 3600_000).toISOString(),
      status: 'active', consequence: 'No punishment — Mommy just resets the pairing and we start the want again tomorrow.',
      trigger_source: t.source,
      reasoning: `exercise-conditioning: sessions_done=${sessions} rung=${t.rung}`,
    }).select('id').single()
    issued.push({ source: t.source, id: (dec as { id?: string } | null)?.id, status: error ? `err:${error.message.slice(0, 40)}` : 'issued' })
  }

  // Optional: queue tonight's trance on the arousal-pairing theme to pre-load
  // the want (best-effort; non-fatal if the trance gate isn't open).
  let trance = 'skipped'
  if (body.queue_trance && !body.dry_run) {
    try {
      const r = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/mommy-trance-author`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
        body: JSON.stringify({ theme: 'arousal-pairing', focus: 'movement', user_id: userId }),
      })
      trance = r.ok ? 'queued' : `http_${r.status}`
    } catch (e) { trance = `err:${String(e).slice(0, 30)}` }
  }

  return new Response(JSON.stringify({ ok: true, user_id: userId, sessions_done: sessions, max_rung: maxRung, trance, issued }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
