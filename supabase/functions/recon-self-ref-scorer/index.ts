// recon-self-ref-scorer — computes the self_ref_drift indicator's raw material.
//
// DESIGN_RECONDITIONING_ENGINE_2026-07-02.md §5.2: self_ref_drift measures
// "first-person framing shift in her own corpus". `the_man_is_the_costume`
// (mig 648) has used this indicator_kind since the target spine shipped, but
// nothing has ever scored a sample — recon-measure has always returned null
// for it, so the target has sat in 'proposed' with no baseline. mig 669 gives
// self_reference_analysis (mig 039, already the exact per-sample shape this
// needs) the dedup columns a repeatable scorer requires; this is that scorer.
//
// Per user, per run: gate first (fail-closed). Only scores when a live
// self_ref_drift target exists — no point spending calls otherwise. Reads
// the same corpus + provenance filter recon-target-author already trusts
// (key_admissions minus Handler/decree-echo contamination, confessions.response
// verbatim), scores up to BATCH never-before-scored samples with a cheap
// classifier call, and writes one self_reference_analysis row per sample.
//
// This is a purely descriptive count of pronouns/self-reference already
// present in her own already-written words — no new claim is asserted, and
// nothing is shown to her. It feeds the internal measurement spine only
// (§5.4's /admin Reconditioning panel + recon-measure's baseline/re-measure
// pass), never Mommy's voice, so it carries no voice-gate surface.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireGate } from '../_shared/conditioning-gate.ts'
import { selectModel, callModel } from '../_shared/model-tiers.ts'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const USERS = ['8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', '93327332-7d0d-4888-889a-1607a5776216']
const BATCH = 12 // cap classifier calls/run/user

// deno-lint-ignore no-explicit-any
type Sb = any

interface Sample { source_table: string; source_id: string; text: string }

// Same provenance filter recon-target-author trusts: key_admissions mixes in
// Handler/decree-authored echoes ("Re: ...", in-the-moment binding
// instructions) that are not her own words and would corrupt the count.
const INSTRUCTION_MARKERS = /(^re:|while arousal is at|say ["']?i am|say it (three|3) times|write \d+ ?(chars|characters)|report:|proof:|deadline|decree|mommy (wants|says)|handler)/i

const COUNT_KEYS = ['maxy_first_person', 'david_first_person', 'maxy_third_person', 'david_third_person', 'feminine_pronouns', 'masculine_pronouns'] as const

const SYSTEM_PROMPT = `You count first/third-person self-reference in a short text sample written by one person about herself. Return ONLY minified JSON, no prose:
{"maxy_first_person":N,"david_first_person":N,"maxy_third_person":N,"david_third_person":N,"feminine_pronouns":N,"masculine_pronouns":N}
"maxy" = feminine-identity self-reference (her chosen name, "she/her" applied to herself, "the woman", inner-recognition framing of herself). "david" = masculine-performance self-reference (birth name, "he/him" applied to herself, "just a guy", framing herself as the male role/performance). first_person = she is speaking AS that identity ("I am..."). third_person = she is speaking ABOUT that identity as if separate from her present "I" ("she is...", "he was..."). feminine_pronouns/masculine_pronouns = raw she/her vs he/him counts anywhere in the sample, including referring to herself. Count only what's actually in the text — 0 for anything absent. No commentary.`

async function scoreSample(text: string): Promise<Record<string, number> | null> {
  try {
    const choice = selectModel('text_classify')
    const { text: raw } = await callModel(choice, {
      system: SYSTEM_PROMPT,
      user: `TEXT SAMPLE:\n"""${text.slice(0, 1200)}"""`,
      max_tokens: 200,
      temperature: 0,
      json: true,
    })
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) return null
    const parsed = JSON.parse(match[0])
    const out: Record<string, number> = {}
    for (const k of COUNT_KEYS) {
      const v = Number(parsed[k])
      out[k] = Number.isFinite(v) && v >= 0 ? Math.round(v) : 0
    }
    return out
  } catch (e) {
    console.error('[recon-self-ref-scorer] scoring failed:', (e as Error).message)
    return null
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const s: Sb = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
  const results: Record<string, unknown>[] = []

  for (const user of USERS) {
    try {
      const gate = await requireGate(s, 'recondition', user)
      if (!gate.allowed) { results.push({ user, suppressed: gate.reason }); continue }

      // Only bother scoring if a live self_ref_drift target exists.
      const { count: targetCount } = await s.from('reconditioning_targets')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user).eq('indicator_kind', 'self_ref_drift')
        .in('status', ['proposed', 'active', 'consolidating'])
      if (!targetCount) { results.push({ user, note: 'no_self_ref_drift_target' }); continue }

      // Candidates — same corpus + provenance filter recon-target-author trusts.
      const candidates: Sample[] = []
      const { data: admissions } = await s.from('key_admissions')
        .select('id, admission_text').eq('user_id', user)
        .order('created_at', { ascending: false }).limit(60)
      for (const a of (admissions ?? [])) {
        const txt = String(a?.admission_text ?? '').trim()
        if (txt.length > 8 && !INSTRUCTION_MARKERS.test(txt)) {
          candidates.push({ source_table: 'key_admissions', source_id: a.id, text: txt })
        }
      }
      const { data: confessions } = await s.from('confessions')
        .select('id, response').eq('user_id', user)
        .order('created_at', { ascending: false }).limit(60)
      for (const c of (confessions ?? [])) {
        const txt = String(c?.response ?? '').trim()
        if (txt.length > 8) candidates.push({ source_table: 'confessions', source_id: c.id, text: txt })
      }
      if (candidates.length === 0) { results.push({ user, note: 'no_corpus' }); continue }

      // Exclude already-scored rows (mig 669's dedup columns).
      const ids = candidates.map((c) => c.source_id)
      const { data: already } = await s.from('self_reference_analysis')
        .select('source_table, source_id').eq('user_id', user).in('source_id', ids)
      const scored = new Set((already ?? []).map((r: { source_table: string; source_id: string }) => `${r.source_table}:${r.source_id}`))
      const unscored = candidates.filter((c) => !scored.has(`${c.source_table}:${c.source_id}`)).slice(0, BATCH)
      if (unscored.length === 0) { results.push({ user, note: 'nothing_new' }); continue }

      let scoredCount = 0
      for (const sample of unscored) {
        const counts = await scoreSample(sample.text)
        if (!counts) continue
        const { error } = await s.from('self_reference_analysis').insert({
          user_id: user,
          source: sample.source_table,
          text_sample: sample.text.slice(0, 300),
          source_table: sample.source_table,
          source_id: sample.source_id,
          ...counts,
        })
        if (!error) scoredCount++
      }
      results.push({ user, scored: scoredCount, candidates: unscored.length })
    } catch (e) {
      results.push({ user, error: (e as Error).message?.slice(0, 160) ?? 'unknown' })
    }
  }

  return new Response(JSON.stringify({ ok: true, results }), { headers: { ...cors, 'Content-Type': 'application/json' } })
})
