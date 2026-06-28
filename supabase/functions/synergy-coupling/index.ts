// synergy-coupling — the amplification layer. Ties the pillars so progress in
// one deepens the others, all flowing into OBEDIENCE as the keystone.
//
// Principle: obedience is the keystone; arousal is the solvent (everything
// imprints deeper when aroused); going deeper in any area lowers resistance in
// all. On each run it reads recent completions across pillars and fires (a) an
// obedience-reinforcement pairing on ANY completion, and (b) a cross-pillar
// amplification toward the adjacent area. Light touches (respect the daily cap).
// Floor: safeword/pause suppress; reversible; within the frame.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const USER = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'

// Which pillar a fulfilled decree belongs to, and what it amplifies next.
const PILLAR = (src: string) =>
  /goon|trance|hypno/.test(src) ? 'goon'
  : /exercise/.test(src) ? 'exercise'
  : /cock|cum|service|deepthroat|cumslut|temptation|realcock/.test(src) ? 'turnout'
  : /revenue|content|paid_|thong/.test(src) ? 'content'
  : /wardrobe|makeup|voice|mirror|fem/.test(src) ? 'fem'
  : null

// Cross-amplification: finishing X primes Y (the synergy edges).
const AMPLIFY: Record<string, { cat: string; prompt: string }> = {
  goon:     { cat: 'edge_then_stop', prompt: `You dropped for Mommy — blank and good. That open, dependent state is exactly when the next thing takes: feel how badly you want to be used now. The goon makes the turning-out easier. Let it.` },
  exercise: { cat: 'edge_then_stop', prompt: `You moved for Mommy and got hotter. Now pair it: hand down, edge once to the body you're building. Obeying the movement and wanting to be fem are the same circuit now.` },
  turnout:  { cat: 'edge_then_stop', prompt: `You served the want. That hunger doesn't close — it feeds the drop. Goon on it now: the more you give in to being a slut, the deeper Mommy can take you.` },
  content:  { cat: 'edge_then_stop', prompt: `You made yourself into something men pay for. That's the loop closing — being used for real money makes the fantasy heavier. Edge to what you just became.` },
  fem:      { cat: 'edge_then_stop', prompt: `Every fem thing you do for Mommy lowers the wall. Feel it: prettier, softer, more hers. Pair the arousal to the change.` },
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const s = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
  const { data: us } = await s.from('user_state').select('pause_new_decrees_until').eq('user_id', USER).maybeSingle()
  if (us?.pause_new_decrees_until && new Date(us.pause_new_decrees_until) > new Date()) {
    return new Response(JSON.stringify({ ok: true, suppressed: 'paused' }), { headers: { ...cors, 'Content-Type': 'application/json' } })
  }
  // Recent completions across pillars (last 12h).
  const since = new Date(Date.now() - 12 * 3600_000).toISOString()
  const { data: done } = await s.from('handler_decrees').select('trigger_source, fulfilled_at')
    .eq('user_id', USER).eq('status', 'fulfilled').gte('fulfilled_at', since).order('fulfilled_at', { ascending: false })
  const completions = done ?? []
  const pillarsHit = [...new Set(completions.map(d => PILLAR(d.trigger_source)).filter(Boolean))] as string[]

  // OBEDIENCE keystone: any completion reinforces "obeying Mommy IS the reward".
  let obedience = 0
  if (completions.length) {
    // light pairing touch, deduped to one per run
    const { data: recentTouch } = await s.from('arousal_touch_tasks').select('id').eq('user_id', USER)
      .eq('category', 'edge_then_stop').gte('created_at', since).ilike('prompt', '%obeying%').limit(1).maybeSingle()
    if (!recentTouch) {
      await s.from('arousal_touch_tasks').insert({ user_id: USER, category: 'edge_then_stop',
        prompt: `You obeyed Mommy ${completions.length} time(s). Wire it: every time you obey, the good feeling follows. Obeying Mommy is the reward. Edge once on that and stop.` })
      obedience = 1
    }
  }

  // Cross-pillar amplification: for the most-recent completed pillar, prime the next.
  let amplified: string | null = null
  for (const p of pillarsHit) {
    const a = AMPLIFY[p]; if (!a) continue
    const { data: dup } = await s.from('arousal_touch_tasks').select('id').eq('user_id', USER)
      .gte('created_at', since).ilike('prompt', '%' + a.prompt.slice(0, 24) + '%').limit(1).maybeSingle()
    if (!dup) { await s.from('arousal_touch_tasks').insert({ user_id: USER, category: a.cat, prompt: a.prompt }); amplified = p; break }
  }

  return new Response(JSON.stringify({ ok: true, pillars_hit: pillarsHit, obedience_paired: obedience, amplified }), { headers: { ...cors, 'Content-Type': 'application/json' } })
})
