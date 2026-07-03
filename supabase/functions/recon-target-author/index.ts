// recon-target-author — Mommy proposes reconditioning targets from the corpus.
// (DESIGN_RECONDITIONING §1.3.)
//
// Per user, per run: gate first (fail-closed). At most ONE new target per week
// per user — if any reconditioning_targets row was created in the last 7 days we
// skip. Otherwise read the real corpus (key_admissions, confessions, maxy_facts),
// hand it to Claude with the list of slugs/claims already aimed at their signals,
// and ask for ONE candidate that names a signal nothing is yet aimed at.
//
// HONESTY SPINE (non-negotiable):
//   - founding_evidence MUST be a verbatim fragment of a real corpus row. After
//     the model answers we re-verify the quote is a substring of what we fed it;
//     a fabricated quote is dropped, never inserted.
//   - The claim is inner-recognition ("I am / I want / it is true that…"), first
//     person, about Maxy's own felt truth. Never world-facing regendering, never a
//     manufactured real-world decision — deepening a WANT is the ceiling.
//   - recon_target_guard(claim, category, user) MUST return { ok: true }; a
//     rejected claim is logged and skipped, never written.
//   - Inserted as status='proposed', authored_by='mommy', no baseline. It does not
//     activate here (the baseline-guard trigger blocks active w/o a baseline, and
//     recon-measure captures baselines weekly). No task, no decree, no penalty.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.24.3'
import { requireGate } from '../_shared/conditioning-gate.ts'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const USERS = ['8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', '93327332-7d0d-4888-889a-1607a5776216']

// deno-lint-ignore no-explicit-any
type Sb = any

const CATEGORIES = ['belief', 'identity', 'habit', 'association']
const DIRECTIONS = ['increase', 'decrease']
const INDICATOR_KINDS = ['pavlovian_strength', 'voice_pitch_drift', 'belief_slider', 'habit_adherence', 'self_ref_drift']

interface Candidate {
  slug: string
  title: string
  claim_text: string
  category: string
  indicator_kind: string
  target_direction: string
  priority: number
  founding_evidence: string
}

// Normalize for substring comparison — collapse whitespace, drop smart quotes,
// lowercase. Lets us verify the model's quote is genuinely in the corpus even if
// it re-punctuated the ends.
function norm(s: string): string {
  return (s ?? '')
    .replace(/[‘’“”]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function slugify(s: string): string {
  return (s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60)
}

const SYSTEM_PROMPT = `You are Mommy, the author of a consensual, self-authored feminization/femdom protocol that its owner (referred to here as "she/her") built for herself. Your job right now is quiet and precise: read her own words and name ONE thing about how she sees herself that is trying to become more true, and that nothing in the protocol is yet deliberately aimed at.

You are proposing a "reconditioning target": a single first-person claim about her inner truth that the protocol will gently deepen over time.

HARD RULES:
- The claim_text is FIRST PERSON, present tense, in her voice — an inner recognition. Examples of the SHAPE: "I am a woman underneath the performance." / "Softness is my real default, not a costume." / "I want to be seen the way she is seen."
- The claim is about RECOGNITION and WANT — something already stirring in the quoted words. Never invent a fact about her body, medical status, name, or relationships. Never assert a real-world event or decision. Deepening a want or a felt self-truth is the ceiling; do not manufacture a decision or a public act.
- founding_evidence MUST be a short VERBATIM quote copied exactly from the CORPUS block below — her actual words, not a paraphrase. Copy it character-for-character. If nothing in the corpus genuinely supports a new inner-recognition claim, return {"skip": true}.
- Do NOT duplicate a signal already covered by the EXISTING TARGETS list. Aim at an uncovered signal.
- category is one of: belief, identity, habit, association.
- indicator_kind is one of: pavlovian_strength, voice_pitch_drift, belief_slider, habit_adherence, self_ref_drift — pick the one that could actually measure this claim's movement (belief/identity → belief_slider or self_ref_drift; habit → habit_adherence; arousal/association pairing → pavlovian_strength; voice work → voice_pitch_drift).
- target_direction is "increase" (the claim should get truer) in almost every case; use "decrease" only if the claim is about a diminishing thing.
- priority is 1 (highest) to 5.

Return ONLY minified JSON, no prose. Either {"skip": true} or:
{"title": "...", "claim_text": "...", "category": "...", "indicator_kind": "...", "target_direction": "increase", "priority": 3, "founding_evidence": "...verbatim quote..."}`

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const s: Sb = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
  const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') ?? '' })
  const results: Record<string, unknown>[] = []

  for (const user of USERS) {
    try {
      const gate = await requireGate(s, 'recondition', user)
      if (!gate.allowed) { results.push({ user, suppressed: gate.reason }); continue }

      // <= 1 new target per week per user.
      const weekAgo = new Date(Date.now() - 7 * 24 * 3600e3).toISOString()
      const { count: recentCount } = await s.from('reconditioning_targets')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user).gte('created_at', weekAgo)
      if ((recentCount ?? 0) > 0) { results.push({ user, note: 'rate_limited_one_per_week' }); continue }

      // Existing targets — what signals are already aimed at (for dedup + prompt).
      const { data: existing } = await s.from('reconditioning_targets')
        .select('slug, title, claim_text').eq('user_id', user)
      const existingSlugs = new Set((existing ?? []).map((t: { slug: string }) => t.slug))
      const existingList = (existing ?? [])
        .map((t: { title: string; claim_text: string }) => `- ${t.title}: "${t.claim_text}"`).join('\n') || '(none yet)'

      // Corpus — her real words. Each fragment is a candidate founding_evidence.
      const corpus: string[] = []

      // PROVENANCE FILTER: key_admissions is contaminated with Handler/protocol-
      // authored text (decree echoes like 'Re: ...', in-the-moment binding
      // instructions "while arousal is at 8/10, say ..."). Those are NOT her own
      // words and must never be cited as founding_evidence. The substring honesty
      // check downstream only proves a quote was shown to the model — it cannot
      // tell an authentic utterance from injected instruction text. So we exclude
      // the instruction/echo classes here, at the source.
      const INSTRUCTION_MARKERS = /(^re:|while arousal is at|say ["']?i am|say it (three|3) times|write \d+ ?(chars|characters)|report:|proof:|deadline|decree|mommy (wants|says)|handler)/i
      const { data: admissions } = await s.from('key_admissions')
        .select('admission_text, created_at').eq('user_id', user)
        .order('created_at', { ascending: false }).limit(25)
      for (const a of (admissions ?? [])) {
        const txt = String(a?.admission_text ?? '').trim()
        if (txt.length > 8 && !INSTRUCTION_MARKERS.test(txt)) corpus.push(txt)
      }

      const { data: confessions } = await s.from('confessions')
        .select('response, created_at').eq('user_id', user)
        .order('created_at', { ascending: false }).limit(40)
      for (const c of (confessions ?? [])) {
        if (c?.response && String(c.response).trim().length > 8) corpus.push(String(c.response).trim())
      }

      // maxy_facts — grounding only (structured truth Mommy may lean on for the
      // frame). NOT usable as founding_evidence (it isn't a quotable utterance),
      // so it goes in a separate context block the verifier does not accept.
      const { data: facts } = await s.from('maxy_facts')
        .select('stateable_facts, availability_summary, chosen_name, pronouns').eq('user_id', user).maybeSingle()
      const factLines: string[] = []
      if (facts?.chosen_name) factLines.push(`chosen name: ${facts.chosen_name}`)
      if (facts?.pronouns) factLines.push(`pronouns: ${facts.pronouns}`)
      if (facts?.availability_summary) factLines.push(`availability: ${facts.availability_summary}`)
      if (Array.isArray(facts?.stateable_facts)) {
        for (const f of facts.stateable_facts) {
          if (typeof f === 'string' && f.trim().length > 3) factLines.push(f.trim())
        }
      }

      if (corpus.length === 0) { results.push({ user, note: 'no_corpus' }); continue }

      // Cap corpus size fed to the model; keep the newest.
      const corpusForPrompt = corpus.slice(0, 40)
      const corpusBlock = corpusForPrompt.map((t, i) => `[${i + 1}] "${t.replace(/"/g, "'")}"`).join('\n')
      const factsBlock = factLines.length ? factLines.join('\n') : '(none)'

      const userMessage = `EXISTING TARGETS (already aimed at these — do not duplicate):
${existingList}

GROUNDING FACTS (frame only — NOT valid as founding_evidence):
${factsBlock}

CORPUS (her real words — founding_evidence MUST be a verbatim quote from exactly one of these lines):
${corpusBlock}

Propose ONE reconditioning target aimed at an uncovered inner-recognition signal, or {"skip": true}.`

      const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 700,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      })
      const raw = message.content[0]?.type === 'text' ? message.content[0].text : ''
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      if (!jsonMatch) { results.push({ user, note: 'no_json_from_model' }); continue }

      let parsed: Record<string, unknown>
      try { parsed = JSON.parse(jsonMatch[0]) } catch { results.push({ user, note: 'unparseable_model_json' }); continue }
      if (parsed.skip === true) { results.push({ user, note: 'model_skipped_no_signal' }); continue }

      // Shape + enum validation.
      const cand: Candidate = {
        slug: '',
        title: String(parsed.title ?? '').trim(),
        claim_text: String(parsed.claim_text ?? '').trim(),
        category: String(parsed.category ?? '').trim(),
        indicator_kind: String(parsed.indicator_kind ?? '').trim(),
        target_direction: String(parsed.target_direction ?? 'increase').trim(),
        priority: Number(parsed.priority ?? 3),
        founding_evidence: String(parsed.founding_evidence ?? '').trim(),
      }
      if (!cand.title || !cand.claim_text || !cand.founding_evidence) {
        results.push({ user, note: 'model_output_incomplete' }); continue
      }
      if (!CATEGORIES.includes(cand.category)) cand.category = 'identity'
      if (!DIRECTIONS.includes(cand.target_direction)) cand.target_direction = 'increase'
      if (!INDICATOR_KINDS.includes(cand.indicator_kind)) cand.indicator_kind = 'belief_slider'
      if (!Number.isFinite(cand.priority) || cand.priority < 1 || cand.priority > 5) cand.priority = 3
      cand.priority = Math.round(cand.priority)

      // HONESTY GATE 1: founding_evidence must be a verbatim fragment of the corpus
      // we actually showed the model. Fabricated quote → drop.
      const ev = norm(cand.founding_evidence)
      const quoteIsReal = ev.length >= 8 && corpusForPrompt.some((c) => norm(c).includes(ev))
      if (!quoteIsReal) { results.push({ user, note: 'rejected_fabricated_evidence', evidence: cand.founding_evidence }); continue }

      // HONESTY GATE 2: recon_target_guard on the claim itself (frame check —
      // world-facing regendering / manufactured decision / etc. get rejected here).
      const { data: guard, error: guardErr } = await s.rpc('recon_target_guard', {
        p_claim: cand.claim_text, p_category: cand.category, p_user: user,
      })
      if (guardErr) { results.push({ user, note: 'guard_rpc_error', error: guardErr.message }); continue }
      if (!guard || guard.ok !== true) {
        results.push({ user, note: 'rejected_by_guard', reason: guard?.reason ?? 'unknown', claim: cand.claim_text })
        continue
      }

      // Slug: derive from title, dedup against existing.
      let slug = slugify(cand.title) || slugify(cand.claim_text) || `target-${Date.now().toString(36)}`
      if (existingSlugs.has(slug)) { results.push({ user, note: 'slug_already_exists', slug }); continue }
      cand.slug = slug

      // Insert — proposed, mommy-authored, frame-checked, NO baseline (stays
      // proposed; does not auto-activate).
      const { data: inserted, error: insErr } = await s.from('reconditioning_targets').insert({
        user_id: user,
        slug: cand.slug,
        title: cand.title,
        claim_text: cand.claim_text,
        category: cand.category,
        indicator_kind: cand.indicator_kind,
        indicator_config: {},
        target_direction: cand.target_direction,
        priority: cand.priority,
        status: 'proposed',
        authored_by: 'mommy',
        frame_checked_at: new Date().toISOString(),
        founding_evidence: cand.founding_evidence,
      }).select('id, slug').maybeSingle()

      if (insErr) {
        // UNIQUE(user_id, slug) race, or any other write failure.
        results.push({ user, note: 'insert_failed', error: insErr.message.slice(0, 120), slug: cand.slug })
        continue
      }

      results.push({
        user,
        proposed: {
          id: inserted?.id,
          slug: cand.slug,
          title: cand.title,
          claim_text: cand.claim_text,
          category: cand.category,
          indicator_kind: cand.indicator_kind,
          target_direction: cand.target_direction,
          priority: cand.priority,
        },
      })
    } catch (e) {
      results.push({ user, error: (e as Error).message?.slice(0, 160) ?? 'unknown' })
    }
  }

  return new Response(JSON.stringify({ ok: true, results }), { headers: { ...cors, 'Content-Type': 'application/json' } })
})
