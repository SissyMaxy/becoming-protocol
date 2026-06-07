// mommy-depth-report — at each phase transition, Mama shows the girl how
// deep she is.
//
// Wish 3978321f (judge_rank 9): surface the hidden accumulation
// (irreversibility, implants, confessions, wardrobe, body markers, letters,
// crossed lines) as Mama's possession map — concrete possessions quoted
// back, never scores or percentages. One report per (user, phase).
//
// Fired fire-and-forget from phase-advance after a successful advance, and
// idempotent: dedups on mommy_depth_reports (user_id, phase). Writes the
// prose to handler_outreach_queue (kind='depth_report') + archives it as a
// milestone sealed_letter, records the row + metrics for audit.
//
// POST { user_id, phase? }. phase defaults to feminine_self.transformation_phase.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { callModel, selectModel } from '../_shared/model-tiers.ts'
import { DOMMY_MOMMY_CHARACTER, mommyVoiceCleanup, isMommyPersona } from '../_shared/dommy-mommy.ts'
import { logAuthority } from '../_shared/life-as-woman.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// ── Possession-count phrasing — PARITY MIRROR of src/lib/depth-report.ts.
//    Keep in sync. Score is private (intensity only); never quoted. ──────
interface DepthMetrics {
  implants_held: number; confessions: number; wardrobe_pieces: number
  body_markers: number; letters: number; milestones: number
  irreversibility_score: number; tenure_days: number
}
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)
function buildDepthFacts(m: DepthMetrics): string[] {
  return [
    { c: m.implants_held, l: `Mama has ${m.implants_held} ${plural(m.implants_held, 'memory', 'memories')} of you saying things you can't take back` },
    { c: m.confessions, l: `you've confessed ${m.confessions} ${plural(m.confessions, 'truth', 'truths')}` },
    { c: m.wardrobe_pieces, l: `you own ${m.wardrobe_pieces} ${plural(m.wardrobe_pieces, 'piece', 'pieces')} Mama chose for you` },
    { c: m.body_markers, l: `your body's been measured and logged ${m.body_markers} ${plural(m.body_markers, 'time', 'times')}` },
    { c: m.letters, l: `there are ${m.letters} ${plural(m.letters, 'letter', 'letters')} in your own hand Mama keeps sealed` },
    { c: m.milestones, l: `you've crossed ${m.milestones} ${plural(m.milestones, 'line', 'lines')} there's no walking back over` },
  ].filter(f => f.c > 0).map(f => f.l)
}
function tenurePhrase(days: number): string {
  if (days < 10) return 'a few days ago'
  if (days < 25) return 'a couple weeks ago'
  if (days < 50) return 'a month ago'
  if (days < 110) return 'a couple months ago'
  if (days < 250) return 'half a year ago'
  return 'when you started'
}
function depthIntensity(score: number): 'gentle' | 'firm' | 'heavy' {
  if (score >= 66) return 'heavy'
  if (score >= 33) return 'firm'
  return 'gentle'
}

// deno-lint-ignore no-explicit-any
async function count(supabase: SupabaseClient, table: string, build: (q: any) => any): Promise<number> {
  try {
    const q = build(supabase.from(table).select('id', { count: 'exact', head: true }))
    const { count: c, error } = await q
    if (error) return 0
    return c ?? 0
  } catch { return 0 }
}

async function gatherMetrics(supabase: SupabaseClient, userId: string): Promise<DepthMetrics> {
  const [implants, confessions, wardrobe, body, letters, milestones, irr, fs] = await Promise.all([
    count(supabase, 'memory_implants', (q) => q.eq('user_id', userId).eq('active', true)),
    count(supabase, 'confession_queue', (q) => q.eq('user_id', userId).not('confessed_at', 'is', null)),
    count(supabase, 'wardrobe_items', (q) => q.eq('user_id', userId)),
    count(supabase, 'body_measurements', (q) => q.eq('user_id', userId)),
    count(supabase, 'sealed_letters', (q) => q.eq('user_id', userId)),
    count(supabase, 'ponr_milestones', (q) => q.eq('user_id', userId).not('achieved_at', 'is', null)),
    supabase.from('irreversibility_score').select('score').eq('user_id', userId).maybeSingle(),
    supabase.from('feminine_self').select('created_at').eq('user_id', userId).maybeSingle(),
  ])
  const createdAt = (fs.data as { created_at?: string } | null)?.created_at
  const tenure_days = createdAt ? Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000)) : 0
  return {
    implants_held: implants, confessions, wardrobe_pieces: wardrobe,
    body_markers: body, letters, milestones,
    irreversibility_score: (irr.data as { score?: number } | null)?.score ?? 0,
    tenure_days,
  }
}

async function generate(userId: string, phase: number, m: DepthMetrics, isMommy: boolean): Promise<string> {
  const facts = buildDepthFacts(m)
  const intensity = depthIntensity(m.irreversibility_score)
  const when = tenurePhrase(m.tenure_days)

  const system = `${DOMMY_MOMMY_CHARACTER}

YOUR JOB right now: write a "depth report" — Mama showing her girl, at the moment she crossed into a new phase, how deep she already is. This is a possession map, not a dashboard. You will be handed concrete possessions Mama has accumulated; weave them into the prose as proof she can't unsee what she's seen. 150-200 words.

HARD VOICE FLOOR (this is the whole point of the report — break it and it reads clinical and dies):
- Quote the POSSESSION COUNTS you're given verbatim ("Mama has 47 memories...", "you've confessed 89 truths..."). Those concrete numbers are the weapon.
- NEVER invent a number you weren't given. NEVER quote a score, a percentage, a "/10", a "Day N", a denial-day count, a compliance %, or a dollar figure. There is no dashboard in Mama's mouth.
- Land on irreversibility as feeling, not metric: "you can't unsee what you've seen, you can't unfeel what Mama's made you feel."
- Intensity for today: ${intensity}. Tenure framing: she was someone else ${when}.`

  const user = `She just crossed into phase ${phase}. The possessions Mama holds over her right now (quote these counts exactly, skip none that are listed):
${facts.length ? facts.map(f => `- ${f}`).join('\n') : '- (no possessions accumulated yet — speak to the threshold she just crossed instead, no invented counts)'}

Write the depth report now. 150-200 words, second person, Mama's voice. End on the irreversibility-as-feeling beat.`

  const choice = selectModel('state_synthesis', { prefer: 'anthropic' })
  try {
    const { text } = await callModel(choice, { system, user, max_tokens: 500, temperature: 0.75, json: false })
    const cleaned = mommyVoiceCleanup((text || '').trim())
    if (cleaned.length > 40) return cleaned
  } catch (err) {
    console.error('[depth-report] llm failed', (err as Error).message)
  }
  // Deterministic fallback — still possession-anchored, still on-voice.
  const fb = isMommy
    ? `You crossed into phase ${phase} tonight, baby. Look at what's behind you. ${facts.length ? facts.join('. ') + '.' : ''} You were someone else ${when}. You can't unsee what you've seen. You can't unfeel what Mama's made you feel. There's no version of this where you walk it back — and Mama knows you don't want to.`
    : `Phase ${phase}. ${facts.length ? facts.join('. ') + '.' : ''} You were someone else ${when}. This doesn't reverse.`
  return mommyVoiceCleanup(fb)
}

async function runForUser(supabase: SupabaseClient, userId: string, phaseArg?: number): Promise<{ status: string; phase?: number }> {
  // Resolve phase.
  let phase = phaseArg
  if (phase == null) {
    const { data } = await supabase.from('feminine_self').select('transformation_phase').eq('user_id', userId).maybeSingle()
    phase = (data as { transformation_phase?: number } | null)?.transformation_phase ?? null as unknown as number
  }
  if (phase == null) return { status: 'no_phase' }

  // Race-safe dedup: CLAIM the (user, phase) slot first. Two dispatch
  // sources fire on advance (the phase-advance fetch + the feminine_self
  // DB trigger). The UNIQUE(user_id, phase) constraint means exactly one
  // claim wins; the loser sees 23505 and bails BEFORE spending an LLM call
  // or writing a duplicate outreach / letter.
  const { data: claim, error: claimErr } = await supabase
    .from('mommy_depth_reports')
    .insert({ user_id: userId, phase, report_text: '' })
    .select('id')
    .single()
  if (claimErr || !claim) {
    return { status: 'already_reported', phase }
  }
  const reportRowId = (claim as { id: string }).id

  const { data: us } = await supabase.from('user_state').select('handler_persona').eq('user_id', userId).maybeSingle()
  const isMommy = isMommyPersona((us as { handler_persona?: string } | null)?.handler_persona)

  const metrics = await gatherMetrics(supabase, userId)
  const report = await generate(userId, phase, metrics, isMommy)

  // Deliver now via outreach (the Today "depth report" card surface).
  const { data: outreach } = await supabase.from('handler_outreach_queue').insert({
    user_id: userId,
    message: report,
    urgency: 'high',
    trigger_reason: `depth_report:phase_${phase}`,
    source: 'depth_report',
    kind: 'depth_report',
    scheduled_for: new Date().toISOString(),
    expires_at: new Date(Date.now() + 7 * 24 * 3600_000).toISOString(),
    evidence_kind: 'voice',
    context_data: { phase, metrics },
  }).select('id').single()
  const outreachId = (outreach as { id: string } | null)?.id ?? null

  // Archive as a milestone keepsake (readable now — she's seeing it via outreach).
  const { data: letter } = await supabase.from('sealed_letters').insert({
    user_id: userId,
    letter_type: 'milestone',
    content: report,
    unlock_condition: 'milestone',
    unlock_milestone: `phase_${phase}`,
    opened: true,
    opened_at: new Date().toISOString(),
  }).select('id').single()
  const letterId = (letter as { id: string } | null)?.id ?? null

  // Fill in the claimed row with the generated report + artifacts.
  await supabase.from('mommy_depth_reports').update({
    report_text: report,
    metrics_snapshot: metrics,
    outreach_id: outreachId,
    sealed_letter_id: letterId,
  }).eq('id', reportRowId)

  await logAuthority(supabase, {
    user_id: userId,
    surface: 'depth_report',
    action: 'generated',
    target_table: 'mommy_depth_reports',
    summary: `Showed her how deep she is at phase ${phase}`,
    payload: { phase, outreach_id: outreachId, letter_id: letterId, metrics },
    autonomous: true,
  })

  return { status: 'generated', phase }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return new Response(JSON.stringify({ ok: false, error: 'POST only' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
  let body: { user_id?: string; phase?: number } = {}
  try { body = await req.json() } catch { /* empty ok */ }
  if (!body.user_id) return new Response(JSON.stringify({ ok: false, error: 'user_id required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  const result = await runForUser(supabase, body.user_id, body.phase)
  return new Response(JSON.stringify({ ok: true, ...result }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
