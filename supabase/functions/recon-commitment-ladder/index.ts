// recon-commitment-ladder — the per-target escalating commitment ladder (§2.6, Phase 3).
//
// Foot-in-the-door: a small freely-chosen "yes" makes the next, larger "yes"
// easier. Each rung is a logged commitment that — UNLIKE reps/trance, which are
// invitational — IS penalty-bearing, so it MUST ride the obligation ledger for
// the visible-before-penalized guarantee. This is the ONLY penalty-bearing recon
// surface; it is deliberately conservative.
//
// Per user, per run: gate FIRST (fail-closed). Then, respecting one-CTA (at most
// ONE active commitment decree per user) and one-new-per-run, pick the highest-
// priority active target in the reinforce/reconsolidate phase that has no pending
// commitment, choose its NEXT rung, log recon_commitments (status 'chosen'), file
// it through file_obligation (2-day deadline, mild internal consequence), link the
// returned obligation back onto the row, and issue a handler_decree so it surfaces.
//
// Floors (Art. II/IX/X): the content-pillar rungs are faceless / own-body only and
// never presume a resource Maxy lacks (mirror → voice → handwriting → faceless clip
// → faceless funnel post). The claim is QUOTED from the guarded target — never
// fabricated. Dissonance quotes only real corpus text. Safeword/pause halt via gate.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireGate } from '../_shared/conditioning-gate.ts'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const USERS = ['8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', '93327332-7d0d-4888-889a-1607a5776216']

// deno-lint-ignore no-explicit-any
type Sb = any

// A real, mild, INTERNAL consequence — no world-facing fallout, no fabricated
// escalation. Missing a freely-chosen rung just steps the ladder back down.
const PENALTY = `Miss this and we step back down a rung — you earn this one again from the smaller version before you get to move up.`

// The escalating ladder. rung 1 (private, to the mirror) → rung 5 (faceless to the
// funnel). Each rung EMBEDS the target's own (already-guarded) claim_text; the copy
// carries no telemetry (the mommy_voice_cleanup DB trigger scrubs any leak anyway).
// Content-pillar floor: faceless / own-body only; nothing here presumes a resource
// she may lack (the funnel page is the existing fansly.com/SoftMaxy pillar).
function rungSpec(rung: number, claim: string): { commitment: string; ask: string; proof: string } | null {
  switch (rung) {
    case 1:
      return {
        commitment: `Say it to the mirror, out loud: "${claim}"`,
        ask: `Rung one, and it stays between us. Stand at the mirror tonight, look yourself dead in the eye, and say it once, out loud, like it's already true: "${claim}" Send Mommy the voice note.`,
        proof: 'voice',
      }
    case 2:
      return {
        commitment: `Record it for Mommy in your own voice: "${claim}"`,
        ask: `Rung two. Not to the glass this time — to me. Record yourself saying it, slow, no flinching: "${claim}" I want to hear you mean it. Send the note.`,
        proof: 'voice',
      }
    case 3:
      return {
        commitment: `Write it in your own hand and photograph it: "${claim}"`,
        ask: `Rung three. Write it out by hand — your handwriting, not typed — and photograph it: "${claim}" Your own hand putting it on paper is you agreeing with it. Send the photo.`,
        proof: 'photo',
      }
    case 4:
      return {
        commitment: `Say it on camera, faceless, for Mommy: "${claim}"`,
        ask: `Rung four. On camera now — collarbone-down, no face, ever — say it to the lens like you're telling the whole world: "${claim}" Just for me, for now. Send the clip.`,
        proof: 'photo',
      }
    case 5:
      return {
        commitment: `Post it faceless to the funnel: "${claim}"`,
        ask: `Rung five, the real one. Faceless, own-body only — put it on your page where the world can read it: "${claim}" Once it's out there it's true in a way the mirror can't touch. Send the link.`,
        proof: 'photo',
      }
    default:
      return null
  }
}

// Light guard against surfacing forced-phrase compliance (mantra / punishment
// lines) as if it were a genuine contradiction. Cheap, string-level — the real
// job is only ever to quote REAL text, never to fabricate.
const COMPLIANCE_FRAGMENTS = ['david is gone', 'i am david', 'good and blank', 'good gooner', "mommy's toy", 'mommy owns']
function usableContradiction(text: string | null | undefined): string | null {
  if (!text) return null
  const t = text.trim()
  if (t.length < 8 || t.length > 400) return null
  const low = t.toLowerCase()
  if (COMPLIANCE_FRAGMENTS.some((f) => low.includes(f))) return null
  return t
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const s = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '') as Sb
  const results: Record<string, unknown>[] = []

  for (const user of USERS) {
    // 1) Gate FIRST, fail-closed (safeword latch + pause + elective + live-meet).
    const gate = await requireGate(s, 'recondition', user)
    if (!gate.allowed) { results.push({ user, suppressed: gate.reason }); continue }

    // 2) One-CTA: at most ONE active commitment decree per user. If one is already
    // live, do not stack a second — the commitment ladder never competes with itself.
    const { data: liveDecree } = await s.from('handler_decrees')
      .select('id, trigger_source').eq('user_id', user).eq('status', 'active')
      .like('trigger_source', 'recon_commitment:%').limit(1).maybeSingle()
    if (liveDecree) { results.push({ user, note: 'commitment_active', decree: liveDecree.id }); continue }

    // 3) Candidate targets: active, ordered by priority (1 = highest).
    const { data: targets } = await s.from('reconditioning_targets')
      .select('id, slug, claim_text, category, priority, status')
      .eq('user_id', user).eq('status', 'active').order('priority', { ascending: true }).limit(8)

    let issued: Record<string, unknown> | null = null

    for (const t of (targets ?? [])) {
      // Program must be running AND in a rung-earning phase (reinforce/reconsolidate).
      const { data: prog } = await s.from('reconditioning_programs')
        .select('phase, status').eq('target_id', t.id).maybeSingle()
      if (!prog || prog.status !== 'running' || !['reinforce', 'reconsolidate'].includes(prog.phase)) continue

      // Existing rungs for this target. Skip if a rung is still pending ('chosen').
      const { data: existing } = await s.from('recon_commitments')
        .select('rung, status').eq('target_id', t.id)
      if ((existing ?? []).some((r: Sb) => r.status === 'chosen')) continue
      const maxRung = (existing ?? []).reduce((m: number, r: Sb) => Math.max(m, r.rung ?? 0), 0)
      const nextRung = maxRung + 1
      if (nextRung > 5) continue // ladder complete for this target

      // Defensive re-guard: the claim must still pass recon_target_guard (no
      // fabrication / world-facing regendering) before we quote it into a
      // penalty-bearing surface. It already passed at authoring; this is belt-and-braces.
      const { data: guard } = await s.rpc('recon_target_guard', { p_claim: t.claim_text, p_category: t.category ?? 'belief', p_user: user })
      if (guard && guard.ok === false) { results.push({ user, target: t.slug, skipped: `guard:${guard.reason}` }); continue }

      const spec = rungSpec(nextRung, t.claim_text)
      if (!spec) continue

      // Dissonance (optional): a REAL, recent self-contradiction from her own
      // corpus — weave "you said X, and this is what you're choosing" into the ask.
      // Quote verbatim only; never paraphrase a fact; skip compliance/mantra text.
      let ask = spec.ask
      const { data: slip } = await s.from('slip_log')
        .select('source_text, detected_at').eq('user_id', user)
        .eq('is_synthetic', false).gt('slip_points', 0).not('source_text', 'is', null)
        .order('detected_at', { ascending: false }).limit(5)
      let quote: string | null = null
      for (const row of (slip ?? [])) { quote = usableContradiction(row.source_text); if (quote) break }
      if (!quote) {
        const { data: adm } = await s.from('key_admissions')
          .select('admission_text').eq('user_id', user)
          .order('created_at', { ascending: false }).limit(5)
        for (const row of (adm ?? [])) { quote = usableContradiction(row.admission_text); if (quote) break }
      }
      if (quote) {
        ask = `You said "${quote}" — and here's the version you're choosing instead. ${spec.ask}`
      }

      // 4) Log the freely-chosen commitment.
      const { data: crow, error: cErr } = await s.from('recon_commitments').insert({
        user_id: user, target_id: t.id, rung: nextRung,
        commitment_text: spec.commitment, status: 'chosen',
      }).select('id').single()
      if (cErr || !crow) { results.push({ user, target: t.slug, error: `commit:${cErr?.message?.slice(0, 60)}` }); continue }

      const deadline = new Date(Date.now() + 2 * 24 * 3600e3).toISOString()

      // 5) File it as penalty-bearing (visible-before-penalized). file_obligation
      // is idempotent on (source_table, source_id) and returns the obligation id;
      // it also lands the companion penalty_preview outreach so the cost surfaces.
      const { data: obligationId, error: oErr } = await s.rpc('file_obligation', {
        p_user: user,
        p_source_table: 'recon_commitments',
        p_source_id: crow.id,
        p_kind: 'commitment',
        p_ask_copy: ask,
        p_penalty_copy: PENALTY,
        p_deadline: deadline,
        p_grace_minutes: 30,
        p_consequence_kind: 'internal',
        p_created_by: 'recon-commitment-ladder',
        p_urgency: 'normal',
      })
      if (oErr) { results.push({ user, target: t.slug, error: `file_obligation:${oErr.message?.slice(0, 60)}` }); continue }

      // 6) Link the ledger row back onto the commitment.
      if (obligationId) {
        await s.from('recon_commitments').update({ handler_commitment_id: obligationId }).eq('id', crow.id)
      }

      // 7) Surface it as a decree (Today card / push) — a PURE FOCUS SURFACE.
      // The single penalty-bearing obligation is the file_obligation() row above
      // (source_table='recon_commitments'). We must NOT let this decree auto-file
      // a SECOND obligation: the mig-627 oblig_file_decree trigger files one for
      // any decree with a non-empty consequence. Empty consequence => trigger
      // skips (length(trim(consequence))>0 is false) => exactly one ledger row,
      // one penalty. The real cost lives on the recon_commitments obligation.
      const { error: dErr } = await s.from('handler_decrees').insert({
        user_id: user, edict: ask, proof_type: spec.proof,
        deadline, status: 'active', consequence: '',
        trigger_source: `recon_commitment:${t.slug}:${nextRung}`,
        reasoning: 'recon-commitment-ladder',
      })

      issued = {
        user, target: t.slug, rung: nextRung, proof: spec.proof,
        commitment_id: crow.id, obligation_id: obligationId ?? null,
        dissonance: !!quote, decree: dErr ? `err:${dErr.message?.slice(0, 60)}` : 'issued',
      }
      break // one new commitment per user per run
    }

    results.push(issued ?? { user, note: 'no_eligible_target' })
  }

  return new Response(JSON.stringify({ ok: true, results }), { headers: { ...cors, 'Content-Type': 'application/json' } })
})
