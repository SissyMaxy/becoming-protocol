// wish-human-handoff — Mama tells Maxy to open Claude in the browser.
//
// 2026-06-10 (memory:project_mommy_code_wishes + the 2026-06-10 directive
// "mommy needs to tell me to use claude in the browser when she needs
// things"): Mama queues engineering asks in mommy_code_wishes. The
// autonomous builder ships most of them headless. The ones it can't —
// real-device tests, paths the builder refuses, or anything that's simply
// sat queued too long — are Maxy's turn at the keyboard.
//
// This function is the second, push-independent reach channel: it surfaces
// flagged wishes as a single Mama-voice outreach on Today ("open Claude,
// baby, it's waiting"). It does NOT depend on push registration working —
// the outreach renders in-app regardless. When push IS up, the migration-380
// bridge also buzzes the phone (urgency=high).
//
// What runs (per canonical user):
//   1. Auto-flag staleness: any queued wish older than STALE_HOURS that the
//      autonomous loop never took gets needs_human_session=true.
//   2. Collect flagged+queued wishes not yet notified (or due for a re-nudge).
//   3. Compose ONE Mama-voice outreach naming the top asks.
//   4. Insert into handler_outreach_queue (urgency=high, source=
//      mommy_code_handoff) and stamp user_notified_at so it fires once.
//
// Voice: Mama (in-fantasy). The DB mommy_voice_cleanup() trigger runs on the
// message; the engineering detail lives in the wish body, which a Claude
// session reads via `npm run mommy:wishes`.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const STALE_HOURS = 36     // autonomous loop didn't take it → hand to Maxy
const RENUDGE_HOURS = 72   // re-surface a still-queued flagged wish
const MAX_IN_MESSAGE = 3   // titles to name explicitly before "and N more"

interface WishRow {
  id: string
  wish_title: string
  priority: string
  created_at: string
  user_notified_at: string | null
}

const PRIORITY_RANK: Record<string, number> = { critical: 4, high: 3, normal: 2, low: 1 }

/**
 * Compose the Mama-voice handoff message. Pure — exported shape mirrored in
 * the unit test. Names up to MAX_IN_MESSAGE wishes; `total` is the full count
 * of work waiting (may exceed titles.length when the backlog is deep), so the
 * tail count never undersells how much is parked.
 */
export function composeHandoffMessage(titles: string[], total?: number): string {
  const shown = titles.length
  const all = total ?? shown
  if (all === 0) return ''
  if (all === 1) {
    return `Come here, baby. Mama needs your hands. Open Claude in the browser and turn it loose on what I've been wanting: "${titles[0]}". It's sitting right at the top, waiting for you.`
  }
  const named = titles.slice(0, MAX_IN_MESSAGE)
  const extra = all - named.length
  const list = named.map(t => `"${t}"`).join('; ')
  const tail = extra > 0 ? `; and ${extra} more` : ''
  return `Come here, baby. Mama's got ${all} things she needs your hands on. Open Claude in the browser — they're waiting for you: ${list}${tail}. Go let it build them for me.`
}

async function handoffForUser(supabase: SupabaseClient, userId: string): Promise<{
  status: string
  flagged?: number
  notified?: number
  detail?: string
}> {
  // 1. Auto-flag stale queued wishes the autonomous loop never claimed.
  const staleCutoff = new Date(Date.now() - STALE_HOURS * 3600_000).toISOString()
  const { data: flaggedRows } = await supabase
    .from('mommy_code_wishes')
    .update({ needs_human_session: true, human_session_reason: 'stale_in_queue' })
    .eq('status', 'queued')
    .eq('needs_human_session', false)
    .lt('created_at', staleCutoff)
    .select('id')
  const flaggedCount = (flaggedRows || []).length

  // 2. Collect everything that needs Maxy at the keyboard, due for a handoff
  //    (never notified, or notified long enough ago to re-nudge). Two pools:
  //      (a) queued wishes Mama explicitly flagged needs_human_session, and
  //      (b) needs_review wishes — drafted by the autonomous builder but held
  //          for human review. THIS is the graveyard (46-deep, 2–4 weeks old
  //          as of 2026-06-10) that turned "Mama takes control" into "Mama
  //          drafts and parks". needs_review IS the hands-on signal; it does
  //          not require the flag.
  const renudgeCutoff = new Date(Date.now() - RENUDGE_HOURS * 3600_000).toISOString()
  const notifyFilter = `user_notified_at.is.null,user_notified_at.lt.${renudgeCutoff}`
  const [flaggedQueued, inReview] = await Promise.all([
    supabase
      .from('mommy_code_wishes')
      .select('id, wish_title, priority, created_at, user_notified_at')
      .eq('status', 'queued')
      .eq('needs_human_session', true)
      .or(notifyFilter),
    supabase
      .from('mommy_code_wishes')
      .select('id, wish_title, priority, created_at, user_notified_at')
      .eq('status', 'needs_review')
      .or(notifyFilter),
  ])
  if (flaggedQueued.error) return { status: 'error', detail: flaggedQueued.error.message, flagged: flaggedCount }
  if (inReview.error) return { status: 'error', detail: inReview.error.message, flagged: flaggedCount }

  const seen = new Set<string>()
  const candidates: WishRow[] = []
  for (const w of [...(flaggedQueued.data || []), ...(inReview.data || [])] as WishRow[]) {
    if (seen.has(w.id)) continue
    seen.add(w.id)
    candidates.push(w)
  }
  if (candidates.length === 0) {
    return { status: 'nothing_to_hand_off', flagged: flaggedCount }
  }

  // Rank by priority then age (oldest first — clear the graveyard from the bottom).
  candidates.sort((a, b) =>
    (PRIORITY_RANK[b.priority] ?? 0) - (PRIORITY_RANK[a.priority] ?? 0)
    || new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )

  const message = composeHandoffMessage(candidates.map(w => w.wish_title), candidates.length)

  // 3. One outreach. Body-hash dedup (migration 314/338) collapses repeats;
  //    the per-wish user_notified_at stamp is the primary idempotency guard.
  const { error: outreachErr } = await supabase
    .from('handler_outreach_queue')
    .insert({
      user_id: userId,
      message,
      urgency: 'high',
      trigger_reason: 'mommy_code_handoff',
      scheduled_for: new Date().toISOString(),
      expires_at: new Date(Date.now() + 3 * 86400_000).toISOString(),
      source: 'mommy_code_handoff',
    })
  if (outreachErr) {
    return { status: 'outreach_failed', detail: outreachErr.message, flagged: flaggedCount }
  }

  // 4. Stamp so it fires once (until re-nudge window).
  const ids = candidates.map(w => w.id)
  await supabase
    .from('mommy_code_wishes')
    .update({ user_notified_at: new Date().toISOString() })
    .in('id', ids)

  return { status: 'handed_off', flagged: flaggedCount, notified: ids.length }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  // Canonical Handler API user — same root the capability digest walks.
  const canonicalRoots = ['8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f']
  const results: Array<{ user_id: string; status: string; flagged?: number; notified?: number; detail?: string }> = []

  for (const userId of canonicalRoots) {
    const r = await handoffForUser(supabase, userId)
    results.push({ user_id: userId, ...r })
  }

  return new Response(JSON.stringify({
    ok: true,
    handed_off: results.filter(r => r.status === 'handed_off').length,
    results,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
