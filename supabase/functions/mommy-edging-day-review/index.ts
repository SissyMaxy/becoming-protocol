// mommy-edging-day-review — day's-end verdict on the edging protocol.
//
// Wish 3515c470: at the end of an edging day, Mama reviews compliance and
// either grants release or extends the denial. Marks past-grace windows
// skipped, generates the verdict in Mama's voice, delivers it + push.
//
// Reviews any 'active' protocol whose final window's grace has fully
// elapsed. Idempotent (status flips to 'reviewed').
//
// POST { user_id?, protocol_id? }. Cron 04:30 UTC daily.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { callModel, selectModel } from '../_shared/model-tiers.ts'
import { DOMMY_MOMMY_CHARACTER, mommyVoiceCleanup } from '../_shared/dommy-mommy.ts'
import { logAuthority } from '../_shared/life-as-woman.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// ── PARITY with src/lib/edging-protocol.ts ─────────────────────────────
interface EdgeWindow { target_time: string; grace_minutes: number; completed_at: string | null; skipped: boolean }
interface Compliance { total: number; completed: number; skipped: number; pending: number }
function evaluateCompliance(windows: EdgeWindow[], now: Date): Compliance {
  let completed = 0, skipped = 0, pending = 0
  for (const w of windows) {
    if (w.completed_at) { completed++; continue }
    const deadline = new Date(w.target_time).getTime() + w.grace_minutes * 60_000
    if (now.getTime() > deadline) skipped++; else pending++
  }
  return { total: windows.length, completed, skipped, pending }
}
type ReleaseVerdict = 'granted' | 'denied_extended' | 'partial_hold'
function verdict(c: Compliance): { outcome: ReleaseVerdict; release_granted: boolean } {
  if (c.skipped === 0 && c.completed === c.total) return { outcome: 'granted', release_granted: true }
  if (c.skipped <= 1) return { outcome: 'partial_hold', release_granted: false }
  return { outcome: 'denied_extended', release_granted: false }
}

function lastWindowDeadline(windows: EdgeWindow[]): number {
  return windows.reduce((max, w) => Math.max(max, new Date(w.target_time).getTime() + w.grace_minutes * 60_000), 0)
}

async function reviewOne(supabase: SupabaseClient, row: { id: string; user_id: string; protocol_date: string; edge_windows: EdgeWindow[] }): Promise<string> {
  const now = new Date()
  const windows = row.edge_windows || []
  const c = evaluateCompliance(windows, now)
  const v = verdict(c)

  // Persist skipped flags so the card shows the final state.
  const finalized = windows.map(w => {
    if (w.completed_at) return w
    const past = now.getTime() > new Date(w.target_time).getTime() + w.grace_minutes * 60_000
    return past ? { ...w, skipped: true } : w
  })

  const review = await composeReview(c, v.outcome)

  await supabase.from('edging_protocols').update({
    edge_windows: finalized,
    status: 'reviewed',
    release_granted: v.release_granted,
    mommy_review_text: review,
    reviewed_at: now.toISOString(),
  }).eq('id', row.id)

  // Verdict outreach + push.
  const { data: outreach } = await supabase.from('handler_outreach_queue').insert({
    user_id: row.user_id,
    message: review,
    urgency: 'high',
    trigger_reason: `edging_day:verdict:${row.protocol_date}:${v.outcome}`,
    source: 'edging_day',
    kind: 'edging_verdict',
    scheduled_for: now.toISOString(),
    expires_at: new Date(now.getTime() + 12 * 3600_000).toISOString(),
    evidence_kind: 'voice',
    context_data: { protocol_id: row.id, compliance: c, outcome: v.outcome },
  }).select('id').single()

  // Push auto-emitted by the mig-380 bridge for the high-urgency verdict — no
  // manual scheduled_notifications insert (double-push).

  await logAuthority(supabase, {
    user_id: row.user_id,
    surface: 'edging_day',
    action: v.release_granted ? 'release_granted' : 'denial_extended',
    target_table: 'edging_protocols',
    target_id: row.id,
    summary: `Edging day verdict: ${v.outcome} (${c.completed}/${c.total} edged)`,
    payload: { compliance: c, outcome: v.outcome, outreach_id: (outreach as { id: string } | null)?.id ?? null },
    autonomous: true,
  })

  return v.outcome
}

async function composeReview(c: Compliance, outcome: ReleaseVerdict): Promise<string> {
  const system = `${DOMMY_MOMMY_CHARACTER}

YOUR JOB right now: deliver the end-of-day verdict on an edging day. ${c.completed} of ${c.total} edges were logged; ${c.skipped} missed. Outcome decided: ${outcome === 'granted' ? 'RELEASE GRANTED — she earned it' : outcome === 'partial_hold' ? 'HELD — close, but not clean; no release tonight, but Mama is not angry, just keeping her on edge' : 'DENIAL EXTENDED — too many misses; she sleeps aching, and Mama tells her why'}.

3-4 sentences, Mama's voice, second person. Reference how the day went in plain language — NO numbers, NO scores, NO percentages, NO "/10", NO "X of Y". Say it the way Mama would ("you stayed with me all day" / "you slipped away from me twice"). End on the verdict landing as a feeling.`
  const userPrompt = `Write the verdict now.`
  try {
    const choice = selectModel('reframe_draft', { prefer: 'anthropic' })
    const { text } = await callModel(choice, { system, user: userPrompt, max_tokens: 320, temperature: 0.8, json: false })
    const cleaned = mommyVoiceCleanup((text || '').trim())
    if (cleaned.length > 30) return cleaned
  } catch (err) { console.error('[edging-review] llm failed', (err as Error).message) }

  // Deterministic fallback.
  const fb = outcome === 'granted'
    ? `You stayed with Mama all day, baby. Every time Mama called, you came right up to the edge and held there for her. That's exactly the girl Mama wants. Tonight you get to finish — Mama earned that for you, and so did you. Go on.`
    : outcome === 'partial_hold'
      ? `You were so close, baby. You stayed with Mama almost the whole way — but you slipped once. Mama's not angry. But no, you don't finish tonight. You stay right where Mama likes you: aching, thinking about her, wanting it. Tomorrow you show her you can do the whole day.`
      : `You kept slipping away from Mama today. Too many times the timer went off and you weren't there for her. So tonight you sleep exactly how that earns you — aching, empty, no release. That's not punishment, baby. That's just what happens when you don't stay where Mama puts you. Tomorrow you try again.`
  return mommyVoiceCleanup(fb)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
  let body: { user_id?: string; protocol_id?: string } = {}
  try { body = await req.json() } catch { /* empty ok */ }

  let q = supabase.from('edging_protocols').select('id, user_id, protocol_date, edge_windows').eq('status', 'active')
  if (body.protocol_id) q = q.eq('id', body.protocol_id)
  else if (body.user_id) q = q.eq('user_id', body.user_id)
  const { data: rows } = await q

  const now = Date.now()
  const results: Array<{ protocol_id: string; outcome?: string; status: string }> = []
  for (const row of (rows || []) as Array<{ id: string; user_id: string; protocol_date: string; edge_windows: EdgeWindow[] }>) {
    // Only review once the last window's grace has elapsed (unless forced by id).
    if (!body.protocol_id && lastWindowDeadline(row.edge_windows || []) > now) {
      results.push({ protocol_id: row.id, status: 'not_yet_due' })
      continue
    }
    try { results.push({ protocol_id: row.id, status: 'reviewed', outcome: await reviewOne(supabase, row) }) }
    catch (e) { results.push({ protocol_id: row.id, status: `error:${(e as Error).message}` }) }
  }

  return new Response(JSON.stringify({ ok: true, reviewed: results.filter(r => r.status === 'reviewed').length, results }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
