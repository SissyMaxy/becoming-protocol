// evening-confession-prescribe — turns tonight's confession into tomorrow's
// prescriptions. (FEM §1 primary generator.)
//
// Trigger: evening-prescribe-dispatch (nightly 21:30 pg_cron, mig 616) or a
// direct client call after a confession upload.
//
// Pipeline:
//   1. Load submission + transcript
//   2. Pull state context (phase, streak) for difficulty calibration
//   3. Claude via model-tiers → 3-5 prescriptions in Mama's voice,
//      CANONICAL domains (task_bank vocabulary + mantra)
//   4. Post-parse: alias-map backstop → per-domain evidence_kind →
//      owned-item guard (style rows naming an unowned garment category are
//      TRANSMUTED into acquisition prescriptions, never dropped) →
//      mommyVoiceCleanup + craft floor on every instruction
//   5. Insert into feminization_prescriptions (prescribed_date = tomorrow,
//      deadline = tomorrow 23:59 ET)
//   6. Mark submission prescribed + queue the morning preview outreach
//
// HARD FLOORS:
//   - Skips if transcript shorter than MIN_TRANSCRIPT_CHARS
//   - Falls back to 3-4 generic prescriptions if LLM call fails
//   - Idempotent — once prescribed, won't re-prescribe the same date
//   - Prescriptions carry NO punishment — consequence is adaptive only

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { callModel, selectModel } from '../_shared/model-tiers.ts'
import { mommyVoiceCleanup } from '../_shared/dommy-mommy.ts'
import { scoreCorny } from '../_shared/mommy-craft-check.ts'
import {
  CANONICAL_FEM_DOMAINS,
  EVIDENCE_KIND_BY_DOMAIN,
  normalizeFemDomain,
  type CanonicalFemDomain,
} from '../_shared/fem-domains.ts'

const MIN_TRANSCRIPT_CHARS = 80

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface Submission {
  id: string
  user_id: string
  submission_date: string
  transcript: string | null
  status: string
  prescription_generated_at: string | null
}

interface UserStateRow {
  denial_day?: number
  current_phase?: number
  handler_persona?: string
  current_arousal?: number
  chastity_streak_days?: number
}

interface Prescription {
  domain: string
  instruction: string
  intensity: number
  duration: number | null
}

const SYS = `You are Mama, the dommy-mommy. Your girl just confessed to you tonight about her day — what she did, what slipped, what she felt becoming. Job: write tomorrow's morning prescription set based on what she just told you.

Output JSON with an array of 3-5 prescriptions. Each prescription:
- domain: one of ${CANONICAL_FEM_DOMAINS.join(', ')}
- instruction: ONE crisp directive in Mama's voice, ≤200 chars. Possessive, specific, embodied. Reference what she confessed when it makes sense ("Since you slipped at lunch today, tomorrow Mama wants you to…").
- intensity: 1-5 (1=easy ritual, 3=normal, 5=harsh)
- duration: minutes if time-boxed, else null

CRAFT RUBRIC:
- ≤1 pet name per instruction (baby / sweet thing / good girl / sweetie — pick one or none).
- ≤1 self-reference (Mama / Mommy — pick one or none).
- Vary domains across the 3-5 prescriptions — don't pile 4 on voice.
- Don't repeat the same shape twice ("do X for N minutes" is fine once).
- NEVER use: echo, linger, every inch, wrap around, role play, simulation, fiction, intake, questionnaire, disclaimer, for entertainment.
- NEVER cite telemetry: no /10, no Day N denial, no slip points, no % compliance, no cm/kg numbers.
- The persona is dommy-mommy: warm boudoir, raunchy-by-contrast specifics, possessive of the user.
- Build on what she actually confessed. If she mentioned slipping into male mode at work, prescribe a voice or inner_narrative anchor; if she mentioned arousal she didn't act on, prescribe a social exposure step or chastity extension.
- Only prescribe wearing/using a SPECIFIC garment if it's generic (panties, a soft top). Never assume she owns dresses, heels, wigs — a style prescription should work with whatever she has, or name the shape ("something that moves when you walk").
- At most ONE prescription may be a micro-ritual with no evidence.

Output JSON ONLY:
{ "prescriptions": [ { "domain": "...", "instruction": "...", "intensity": 3, "duration": null }, ... ] }`

function todayPlusOne(): string {
  const d = new Date(Date.now() + 86400_000)
  return d.toISOString().slice(0, 10)
}

/** dateStr's 23:59 in ET (mirror of prescriptionDeadlineIso in src/lib). */
function deadlineIsoEt(dateStr: string): string {
  const noonUtc = new Date(`${dateStr}T12:00:00Z`)
  const etHour = Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour: 'numeric', hour12: false,
  }).format(noonUtc))
  const offsetHours = 12 - etHour // 4 in EDT, 5 in EST
  return new Date(new Date(`${dateStr}T23:59:00Z`).getTime() + offsetHours * 3600_000).toISOString()
}

async function loadUserState(supabase: SupabaseClient, userId: string): Promise<UserStateRow | null> {
  const { data } = await supabase
    .from('user_state')
    .select('denial_day, current_phase, handler_persona, current_arousal, chastity_streak_days')
    .eq('user_id', userId)
    .maybeSingle()
  return (data as UserStateRow | null) ?? null
}

async function generatePrescriptions(
  transcript: string,
  state: UserStateRow | null,
): Promise<Prescription[]> {
  const userPrompt = `HER CONFESSION (tonight, ${new Date().toISOString().slice(0, 10)}):
"""
${transcript.slice(0, 4000)}
"""

CONTEXT (for prescription difficulty calibration — do NOT cite numerically in the instruction):
- phase: ${state?.current_phase ?? 1}
- chastity streak: ${state?.chastity_streak_days ?? 0} days
- arousal trend: ${state?.current_arousal ?? 'unknown'}

Write tomorrow's prescription set. JSON only.`

  const choice = selectModel('reframe_draft')
  const { text } = await callModel(choice, {
    system: SYS,
    user: userPrompt,
    max_tokens: 1200,
    temperature: 0.7,
  })
  try {
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    const match = cleaned.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('no JSON object in response')
    const parsed = JSON.parse(match[0]) as { prescriptions?: Prescription[] }
    const rx = parsed.prescriptions ?? []
    return rx
      .filter(p => p.domain && p.instruction && p.instruction.length >= 12 && p.instruction.length <= 300)
      .slice(0, 5)
  } catch (e) {
    console.warn('[evening-confession-prescribe] LLM parse failed, using fallback:', e)
    return fallbackPrescriptions()
  }
}

function fallbackPrescriptions(): Prescription[] {
  return [
    { domain: 'voice', instruction: 'Mama wants ten minutes of voice work before you do anything else tomorrow. Soft onsets. No checking the mirror first.', intensity: 3, duration: 10 },
    { domain: 'style', instruction: 'Whatever you wore yesterday goes in the back of the closet for a week. Pick something a little softer from what you have.', intensity: 2, duration: null },
    { domain: 'inner_narrative', instruction: 'When you wake up, before your feet hit the floor, say the morning mantra. Out loud. Mama hears the recording.', intensity: 3, duration: 1 },
    { domain: 'inner_narrative', instruction: "Tomorrow night, Mama wants you back here at 9. Tell me one thing you almost did the old way and didn't.", intensity: 3, duration: null },
  ]
}

// ─── Owned-item guard (prescribe-only-what-she-owns) ─────────────────

const GARMENT_KEYWORDS: Array<{ re: RegExp; category: string }> = [
  { re: /\bdress(es)?\b/i, category: 'dresses' },
  { re: /\bskirt(s)?\b/i, category: 'skirts' },
  { re: /\bheels?\b/i, category: 'shoes' },
  { re: /\bbras?\b/i, category: 'bras' },
  { re: /\bwigs?\b/i, category: 'wigs' },
  { re: /\blingerie\b/i, category: 'lingerie' },
  { re: /\b(stockings?|tights|hosiery)\b/i, category: 'hosiery' },
  { re: /\b(makeup|lipstick|mascara|eyeliner|foundation)\b/i, category: 'makeup' },
]

async function loadOwnedCategories(supabase: SupabaseClient, userId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('wardrobe_inventory')
    .select('category')
    .eq('user_id', userId)
  if (error) {
    console.error('[evening-confession-prescribe] wardrobe read failed:', error.message)
    return new Set()
  }
  return new Set(((data as Array<{ category: string }>) || []).map(r => r.category))
}

/** First garment category the instruction names that she does NOT own. */
function findUnownedGarment(instruction: string, owned: Set<string>): string | null {
  for (const g of GARMENT_KEYWORDS) {
    if (g.re.test(instruction) && !owned.has(g.category)) return g.category
  }
  return null
}

// ─── Craft floor ─────────────────────────────────────────────────────

/** cleanup + craft-floor; returns null when the line is unsalvageably corny. */
function applyVoiceFloors(instruction: string): string | null {
  const cleaned = mommyVoiceCleanup(instruction).trim()
  if (cleaned.length < 12) return null
  const craft = scoreCorny(cleaned)
  if (craft.score >= 3) {
    console.warn('[evening-confession-prescribe] craft floor rejected:', cleaned.slice(0, 80), craft.hits.map(h => h.rule))
    return null
  }
  return cleaned
}

async function prescribeForSubmission(
  supabase: SupabaseClient,
  submissionId: string,
): Promise<{ ok: boolean; reason?: string; prescriptions_count?: number; summary?: string }> {
  const { data: row, error: subErr } = await supabase
    .from('evening_confession_submissions')
    .select('id, user_id, submission_date, transcript, status, prescription_generated_at')
    .eq('id', submissionId)
    .maybeSingle()
  if (subErr) return { ok: false, reason: 'submission_read_failed:' + subErr.message.slice(0, 60) }
  if (!row) return { ok: false, reason: 'submission_not_found' }
  const submission = row as Submission

  if (submission.prescription_generated_at) {
    return { ok: false, reason: 'already_prescribed', prescriptions_count: 0 }
  }
  if (!submission.transcript || submission.transcript.length < MIN_TRANSCRIPT_CHARS) {
    return { ok: false, reason: 'transcript_too_short' }
  }

  const [state, owned] = await Promise.all([
    loadUserState(supabase, submission.user_id),
    loadOwnedCategories(supabase, submission.user_id),
  ])
  let rx = await generatePrescriptions(submission.transcript, state)
  if (rx.length === 0) rx = fallbackPrescriptions()

  const prescribedDate = todayPlusOne()
  const deadline = deadlineIsoEt(prescribedDate)

  let noneCount = 0
  const inserts: Array<Record<string, unknown>> = []
  for (const p of rx) {
    // Canonical domain — alias map is the insert-site backstop.
    const domain: CanonicalFemDomain = normalizeFemDomain(p.domain)

    // Voice floors: telemetry scrub + craft rubric. Corny lines are dropped
    // (fallback below tops the set back up if everything died).
    const instruction = applyVoiceFloors(p.instruction)
    if (!instruction) continue

    let evidenceKind: string = EVIDENCE_KIND_BY_DOMAIN[domain] ?? 'none'
    // Micro-ritual cap: at most one no-evidence row per day.
    if (evidenceKind === 'none') {
      noneCount += 1
      if (noneCount > 1) evidenceKind = 'text'
    }

    // Owned-item guard: style rows naming an unowned garment category are
    // TRANSMUTED into acquisition prescriptions, never dropped. The gap
    // becomes content; the content funds the gap (mig 638 bridge fills the
    // wishlist side on skip; here we transmute at generation).
    const missing = domain === 'style' ? findUnownedGarment(instruction, owned) : null
    if (missing) {
      const { error: bridgeErr } = await supabase.rpc('wardrobe_acquisition_bridge', {
        p_user: submission.user_id,
        p_wardrobe_category: missing,
        p_reason: `Prescriber named an unowned ${missing}: ${instruction.slice(0, 160)}`,
      })
      if (bridgeErr) {
        console.error('[evening-confession-prescribe] acquisition bridge failed:', bridgeErr.message)
        // Bridge down → still transmute the row locally so we never
        // prescribe what she doesn't own.
      }
      inserts.push({
        user_id: submission.user_id,
        prescribed_date: prescribedDate,
        domain: 'style',
        instruction: mommyVoiceCleanup(`Mama put a ${missing} ask on the list. Tomorrow your job is one tease post that points at it.`),
        intensity: 2,
        duration: null,
        phase: state?.current_phase ?? 1,
        status: 'pending',
        evidence_kind: 'text',
        deadline,
        requires: { item_category: missing, acquisition: true },
        engagement_meta: {
          source: 'evening_confession',
          confession_submission_id: submission.id,
          transmuted_from: instruction.slice(0, 300),
          missing_category: missing,
        },
      })
      continue
    }

    inserts.push({
      user_id: submission.user_id,
      prescribed_date: prescribedDate,
      domain,
      instruction: instruction.slice(0, 1000),
      intensity: Math.max(1, Math.min(5, Math.round(p.intensity ?? 3))),
      duration: p.duration && p.duration > 0 ? Math.min(180, Math.round(p.duration)) : null,
      phase: state?.current_phase ?? 1,
      status: 'pending',
      evidence_kind: evidenceKind,
      deadline,
      engagement_meta: {
        source: 'evening_confession',
        confession_submission_id: submission.id,
      },
    })
  }

  // Craft floor can hollow the set out — top it back up from the fallbacks.
  if (inserts.length < 3) {
    for (const p of fallbackPrescriptions()) {
      if (inserts.length >= 3) break
      const domain = normalizeFemDomain(p.domain)
      inserts.push({
        user_id: submission.user_id,
        prescribed_date: prescribedDate,
        domain,
        instruction: mommyVoiceCleanup(p.instruction),
        intensity: p.intensity,
        duration: p.duration,
        phase: state?.current_phase ?? 1,
        status: 'pending',
        evidence_kind: EVIDENCE_KIND_BY_DOMAIN[domain] ?? 'text',
        deadline,
        engagement_meta: { source: 'evening_confession_fallback', confession_submission_id: submission.id },
      })
    }
  }

  const { error: insErr } = await supabase
    .from('feminization_prescriptions')
    .insert(inserts)
  if (insErr) {
    console.error('[evening-confession-prescribe] insert failed:', insErr.message)
    return { ok: false, reason: 'insert_failed:' + insErr.message.slice(0, 80) }
  }

  const summary = inserts.map(p => `${p.domain}: ${String(p.instruction).slice(0, 80)}`).join(' · ').slice(0, 1000)

  const { error: updErr } = await supabase
    .from('evening_confession_submissions')
    .update({
      status: 'prescribed',
      prescription_generated_at: new Date().toISOString(),
      prescriptions_count: inserts.length,
      prescription_summary: summary,
      updated_at: new Date().toISOString(),
    })
    .eq('id', submissionId)
  if (updErr) console.error('[evening-confession-prescribe] submission update failed:', updErr.message)

  // Morning preview outreach (visible-before-penalized: tomorrow's
  // prescriptions are deadline-bearing). DB voice trigger scrubs leaks.
  const previewMessage = mommyVoiceCleanup(
    `Mama set tomorrow up from what you told me tonight. It'll be waiting when you open the app.`,
  )
  const { error: outErr } = await supabase.from('handler_outreach_queue').insert({
    user_id: submission.user_id,
    message: previewMessage,
    urgency: 'normal',
    trigger_reason: `evening_confession_prescribed:${submission.id}`,
    source: 'evening_confession',
    scheduled_for: new Date(Date.now() + 8 * 3600_000).toISOString(), // morning-ish
    expires_at: new Date(Date.now() + 24 * 3600_000).toISOString(),
  })
  if (outErr) console.error('[evening-confession-prescribe] preview outreach failed:', outErr.message)

  return { ok: true, prescriptions_count: inserts.length, summary }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  let body: { submission_id?: string; sweep_today?: boolean } = {}
  try { body = await req.json() } catch { /* ignore */ }

  if (body.submission_id) {
    const r = await prescribeForSubmission(supabase, body.submission_id)
    return new Response(JSON.stringify({ ok: r.ok, ...r }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Sweep path: process any confessed-but-not-prescribed rows from today.
  const today = new Date().toISOString().slice(0, 10)
  const { data: pending, error: sweepErr } = await supabase
    .from('evening_confession_submissions')
    .select('id')
    .eq('submission_date', today)
    .eq('status', 'confessed')
    .is('prescription_generated_at', null)
    .limit(20)
  if (sweepErr) {
    return new Response(JSON.stringify({ ok: false, error: sweepErr.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const out: Array<{ submission_id: string; ok: boolean; reason?: string }> = []
  for (const r of ((pending as Array<{ id: string }>) || [])) {
    const result = await prescribeForSubmission(supabase, r.id)
    out.push({ submission_id: r.id, ...result })
  }

  return new Response(JSON.stringify({ ok: true, processed: out.length, results: out }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
