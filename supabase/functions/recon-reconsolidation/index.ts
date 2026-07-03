// recon-reconsolidation — author + run the recall→mismatch→re-encode session,
// then fire the in-window micro-rep (DESIGN_RECONDITIONING_ENGINE §2.1).
//
// Mechanism (real): recalling a consolidated belief re-opens it to change for a
// ~1–3h labile window; a prediction-error / mismatch at recall unlocks it, and
// new encoding inside the window durably rewrites the trace (Nader/Schiller).
// The whole point is that the follow-up rep lands INSIDE labile_until — a rep
// outside the window is just repetition.
//
// The DB trigger recon_turnout_consolidate already creates bare 'opened' rows
// (mismatch_evidence = her own attested words, reencode_claim = target claim,
// labile_until = now()+2h) from turn-out attestations. This function:
//   (A) authors rich content for 'opened' sessions — a recall prompt + an
//       in-voice Mommy re-encode walk-through from the target claim and her own
//       QUOTED words (never paraphrased) — marks them 'reencoded', and issues
//       ONE invitational decree that walks her through it (respecting one-CTA).
//   (B) hourly, fires the micro-rep: for 'reencoded' sessions still inside
//       labile_until, drops a light due card into recon_rep_schedule and marks
//       the session 'micro_rep_done'.
//
// Reconsolidation is INVITATIONAL — no punishment for a miss; only commitment
// rungs (issued elsewhere) are penalty-bearing. The decree carries a
// no-punishment consequence line. Identity-target self-narrative work reuses the
// surviving ego mechanic's opt-in: it only runs when ego_mechanic_active(
// 'recall_corrector') is true. Gate first, fail-closed.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.24.3'
import { requireGate } from '../_shared/conditioning-gate.ts'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const USERS = ['8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', '93327332-7d0d-4888-889a-1607a5776216']
const MODEL = 'claude-3-5-sonnet-20241022'

// deno-lint-ignore no-explicit-any
type Sb = any

const NO_PUNISH = 'No punishment — this is an invitation, not a demand. The window is short; miss it and the pull just builds until next time.'

// At most this many 'opened' sessions authored per user per run, and at most
// this many reconsolidation firings per target per rolling week (§2.1:
// reconsolidation is potent; over-firing degrades it).
const MAX_AUTHOR_PER_RUN = 2
const MAX_PER_TARGET_PER_WEEK = 2

interface Target { id: string; slug: string; category: string; claim_text: string; title: string | null }

async function fetchTarget(s: Sb, targetId: string): Promise<Target | null> {
  const { data } = await s.from('reconditioning_targets')
    .select('id, slug, category, claim_text, title').eq('id', targetId).maybeSingle()
  return (data as Target) ?? null
}

// One CTA per user across the recon surfaces (mirrors recon-program-orchestrator's
// recon_focus lane): if a recon_focus OR recon_reconsolidate decree is already
// live, do not stack a second card.
async function ctaOccupied(s: Sb, user: string): Promise<boolean> {
  const { data } = await s.from('handler_decrees')
    .select('id, trigger_source').eq('user_id', user).eq('status', 'active')
    .or('trigger_source.like.recon_focus:%,trigger_source.like.recon_reconsolidate:%')
    .limit(1).maybeSingle()
  return !!data
}

// Rolling-week firing count for a target (a session that has been authored has
// advanced past 'opened').
async function firedThisWeek(s: Sb, user: string, targetId: string): Promise<number> {
  const since = new Date(Date.now() - 7 * 24 * 3600e3).toISOString()
  const { count } = await s.from('recon_reconsolidation_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user).eq('target_id', targetId)
    .in('status', ['reencoded', 'micro_rep_done'])
    .gte('created_at', since)
  return count ?? 0
}

interface Authored { recall_prompt: string; edict: string }

// Author the recall prompt + the in-voice re-encode walk-through. Her own words
// (mismatch) are quoted VERBATIM; the only asserted claim is the target's own
// claim_text (authored + frame-checked upstream). No invented facts about her —
// enforced programmatically: author() REQUIRES her quoted words to appear verbatim
// in the LLM edict or it falls back to the quote-only template (see FABRICATION
// GUARD below). This is a real check, not a system-prompt promise.
function fallbackAuthor(mismatch: string, claim: string): Authored {
  const quote = (mismatch ?? '').trim()
  const recall = 'Before you answer Mommy, say it back out loud — in your own words, who you thought you were before all this, and what it used to mean.'
  const edict = [
    `Three slow beats with Mommy, and I want you already worked up when you start.`,
    `One — say back, out loud, who you thought you were before this.`,
    quote ? `Two — now hear your own words back: "${quote}". You already said it. Sit in how true it is.` : `Two — sit with what you already know is true, the thing you keep circling back to.`,
    `Three — let it land, and say it soft like you mean it: "${claim}".`,
    `Report with a voice note: which one felt like the lie?`,
  ].join('\n')
  return { recall, edict }
}

async function author(anthropic: Anthropic, claim: string, mismatch: string): Promise<Authored> {
  const fb = fallbackAuthor(mismatch, claim)
  try {
    const sys = [
      'You write as Dommy Mommy: warm, possessive, plain-spoken, present-tense. No clinical or disclaimer framing, no telemetry (no "/10", no "Day N", no scores/percentages), at most one pet name.',
      'You are scripting a memory-reconsolidation session in three beats: (1) RECALL — she says the old frame back in her own words; (2) MISMATCH — you reflect HER OWN quoted words back to her; (3) RE-ENCODE — the new claim lands while the old trace is open.',
      'HARD RULES: Quote her words VERBATIM — never paraphrase, soften, or embellish them. Assert no fact about her (no names, relationship status, medical/HRT status, history) beyond what is in the quoted words or the given claim. If a fact is not in the inputs, leave it out.',
      'Return ONLY minified JSON: {"recall_prompt": string, "edict": string}. recall_prompt is one short line inviting beat (1). edict is the full three-beat walk-through she reads tonight, ending with a short "Report with a voice note: ..." line.',
    ].join('\n')
    const usr = `HER OWN QUOTED WORDS (mismatch — quote verbatim, do not paraphrase):\n"""${(mismatch ?? '').trim() || '(none captured — do not invent any; skip the quote and speak to what she already knows)'}"""\n\nTHE CLAIM TO RE-ENCODE (assert only this):\n"""${claim}"""`
    const resp = await anthropic.messages.create({
      model: MODEL, max_tokens: 700, system: sys,
      messages: [{ role: 'user', content: usr }, { role: 'assistant', content: '{' }],
    })
    const text = '{' + resp.content.filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('')
    const parsed = JSON.parse(text) as Partial<Authored>
    const recall = (parsed.recall_prompt ?? '').trim()
    const edict = (parsed.edict ?? '').trim()
    if (!edict) return fb
    // FABRICATION GUARD (not just a system-prompt promise): if we handed the model
    // her real quoted words, the edict MUST contain them verbatim. An LLM that
    // paraphrased/softened/embellished her quote has, by definition, put words in
    // her mouth — reject it and fall back to the template that only ever quotes.
    // Normalize whitespace + quote glyphs before the substring check.
    const norm = (x: string) => x.toLowerCase().replace(/[""'']/g, '"').replace(/\s+/g, ' ').trim()
    const q = (mismatch ?? '').trim()
    if (q && !norm(edict).includes(norm(q))) return fb
    return { recall_prompt: recall || fb.recall_prompt, edict }
  } catch (_e) {
    return fb
  }
}

// Idempotent invitational decree; dedup on the per-slug trigger_source.
async function issueDecree(s: Sb, user: string, slug: string, edict: string): Promise<string> {
  const src = `recon_reconsolidate:${slug}`
  const { data: ex } = await s.from('handler_decrees')
    .select('id').eq('user_id', user).eq('trigger_source', src).eq('status', 'active').limit(1).maybeSingle()
  if (ex) return 'kept'
  const { error } = await s.from('handler_decrees').insert({
    user_id: user, edict, proof_type: 'voice',
    deadline: new Date(Date.now() + 12 * 3600e3).toISOString(), status: 'active',
    consequence: NO_PUNISH, trigger_source: src, reasoning: 'recon-reconsolidation',
  })
  return error ? `err:${error.message.slice(0, 60)}` : 'issued'
}

// The micro-rep: a light cued-retrieval card, due NOW so it lands inside the
// labile window. Dedup on card_ref = session id.
async function fireMicroRep(s: Sb, user: string, session: { id: string; target_id: string; reencode_claim: string | null }): Promise<string> {
  const { data: existing } = await s.from('recon_rep_schedule')
    .select('id').eq('card_ref', session.id).limit(1).maybeSingle()
  const claim = (session.reencode_claim ?? '').trim()
  if (!existing) {
    const words = claim.split(/\s+/)
    const leadIn = words.slice(0, Math.min(5, Math.max(1, words.length - 1))).join(' ')
    const prompt = claim
      ? `Finish Mommy's line for me — out loud, right now, no peeking: "${leadIn}…"`
      : `Say Mommy's line back to me out loud, right now, soft like you mean it.`
    const { error } = await s.from('recon_rep_schedule').insert({
      user_id: user, target_id: session.target_id, card_kind: 'reframe', card_ref: session.id,
      prompt, answer_key: claim || null,
      next_due_at: new Date().toISOString(), interval_days: 1, ease: 2.5, reps: 0, lapses: 0,
    })
    if (error) return `err:${error.message.slice(0, 60)}`
  }
  await s.from('recon_reconsolidation_sessions')
    .update({ micro_rep_done_at: new Date().toISOString(), status: 'micro_rep_done' })
    .eq('id', session.id)
  return existing ? 'rep_kept' : 'rep_fired'
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const s = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
  const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') ?? '' })
  const results: Record<string, unknown>[] = []

  for (const user of USERS) {
    // Gate first, fail-closed.
    const gate = await requireGate(s, 'recondition', user)
    if (!gate.allowed) { results.push({ user, suppressed: gate.reason }); continue }

    // Identity self-narrative work reuses the surviving ego mechanic's opt-in.
    let egoOk = false
    try {
      const { data } = await s.rpc('ego_mechanic_active', { uid: user, mechanic_key: 'recall_corrector' })
      egoOk = data === true
    } catch (_e) { egoOk = false }

    let authored = 0, issued = 0, reps = 0, skipped = 0
    let ctaTaken = await ctaOccupied(s, user)

    // ---- Pass A: author + advance 'opened' sessions ----
    const { data: opened } = await s.from('recon_reconsolidation_sessions')
      .select('id, target_id, recall_prompt, mismatch_evidence, reencode_claim, labile_until, status')
      .eq('user_id', user).eq('status', 'opened')
      .order('created_at', { ascending: true }).limit(8)

    for (const sess of (opened ?? [])) {
      if (authored >= MAX_AUTHOR_PER_RUN) break
      const target = await fetchTarget(s, sess.target_id)
      if (!target) { skipped++; continue }
      // Identity targets only when the ego opt-in is live.
      if (target.category === 'identity' && !egoOk) { skipped++; continue }
      // ≤2/week/target.
      if (await firedThisWeek(s, user, target.id) >= MAX_PER_TARGET_PER_WEEK) { skipped++; continue }

      const claim = (sess.reencode_claim ?? target.claim_text ?? '').trim()
      const a = await author(anthropic, claim, sess.mismatch_evidence ?? '')

      // Enrich the recall prompt; keep reencode_claim (already the target claim,
      // frame-checked upstream) — only backfill if the trigger left it empty.
      const patch: Record<string, unknown> = { recall_prompt: a.recall_prompt, status: 'reencoded' }
      if (!(sess.reencode_claim ?? '').trim() && claim) patch.reencode_claim = claim
      await s.from('recon_reconsolidation_sessions').update(patch).eq('id', sess.id)
      authored++

      // One CTA per user: issue the walk-through decree only if the recon lane is free.
      if (!ctaTaken) {
        const st = await issueDecree(s, user, target.slug, a.edict)
        if (st === 'issued' || st === 'kept') { ctaTaken = true; if (st === 'issued') issued++ }
      }
    }

    // ---- Pass B: fire the in-window micro-rep ----
    const { data: reencoded } = await s.from('recon_reconsolidation_sessions')
      .select('id, target_id, reencode_claim, labile_until, micro_rep_done_at, status')
      .eq('user_id', user).eq('status', 'reencoded')
      .is('micro_rep_done_at', null)
      .gt('labile_until', new Date().toISOString())
      .order('labile_until', { ascending: true }).limit(8)

    for (const sess of (reencoded ?? [])) {
      const st = await fireMicroRep(s, user, sess)
      if (st === 'rep_fired' || st === 'rep_kept') reps++
    }

    results.push({ user, authored, decree_issued: issued, micro_reps: reps, skipped, ego_ok: egoOk })
  }

  return new Response(JSON.stringify({ ok: true, results }), { headers: { ...cors, 'Content-Type': 'application/json' } })
})
