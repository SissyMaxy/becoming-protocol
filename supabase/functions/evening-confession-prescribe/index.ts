// evening-confession-prescribe — turns tonight's confession into tomorrow's
// prescriptions.
//
// Trigger: client calls this after uploading the confession audio +
// inserting the evening_confession_submissions row (status='confessed').
// Or cron sweep over status='confessed' rows that haven't been prescribed yet.
//
// Pipeline:
//   1. Load submission + transcript
//   2. Pull recent state context (denial day, phase, recent feminization
//      prescriptions for domain rotation)
//   3. Call Claude Haiku via model-tiers to generate 3-5 next-day
//      prescriptions in Mommy voice, tied to what she confessed
//   4. Insert into feminization_prescriptions (prescribed_date = tomorrow)
//   5. Update evening_confession_submissions: status='prescribed',
//      prescription_generated_at, prescriptions_count, prescription_summary
//
// HARD FLOORS:
//   - Skips if transcript shorter than MIN_TRANSCRIPT_CHARS
//   - Falls back to 3 generic prescriptions if LLM call fails
//   - mommy_voice_cleanup + craft filtering applied to prescription text
//   - Idempotent — once prescribed, won't re-prescribe the same date

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { callModel, selectModel } from '../_shared/model-tiers.ts'

const MIN_TRANSCRIPT_CHARS = 80
const TARGET_PRESCRIPTION_COUNT = 4

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
- domain: one of voice, body, wardrobe, ritual, exposure, denial, conditioning, mantra, photo, confession
- instruction: ONE crisp directive in Mama's voice, ≤200 chars. Possessive, specific, embodied. Reference what she confessed when it makes sense ("Since you slipped at lunch today, tomorrow Mama wants you to…").
- intensity: 1-5 (1=easy ritual, 3=normal, 5=harsh)
- duration: minutes if time-boxed, else null

CRAFT RUBRIC:
- ≤1 pet name per instruction (baby / sweet thing / good girl / sweetie — pick one or none).
- ≤1 self-reference (Mama / Mommy — pick one or none).
- Vary domains across the 3-5 prescriptions — don't pile 4 on voice.
- Don't repeat the same shape twice ("do X for N minutes" is fine once).
- NEVER use: echo, linger, every inch, wrap around, role play, simulation, fiction, intake, questionnaire, disclaimer, for entertainment.
- NEVER cite telemetry: no /10, no Day N denial, no slip points, no % compliance.
- The persona is dommy-mommy: warm boudoir, raunchy-by-contrast specifics, possessive of the user.
- Build on what she actually confessed. If she mentioned slipping into male mode at work, prescribe a voice or pronoun anchor; if she mentioned arousal she didn't act on, prescribe an exposure step or denial extension.

Output JSON ONLY:
{ "prescriptions": [ { "domain": "...", "instruction": "...", "intensity": 3, "duration": null }, ... ] }`

function todayPlusOne(): string {
  const d = new Date(Date.now() + 86400_000)
  return d.toISOString().slice(0, 10)
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
    { domain: 'wardrobe', instruction: 'Whatever you wore yesterday goes in the back of the closet for a week. Pick something a little softer.', intensity: 2, duration: null },
    { domain: 'ritual', instruction: 'When you wake up, before your feet hit the floor, say the morning mantra. Out loud. Mama hears the recording.', intensity: 3, duration: 1 },
    { domain: 'confession', instruction: "Tomorrow night, Mama wants you back here at 9. Tell me one thing you almost did the old way and didn't.", intensity: 3, duration: null },
  ]
}

async function prescribeForSubmission(
  supabase: SupabaseClient,
  submissionId: string,
): Promise<{ ok: boolean; reason?: string; prescriptions_count?: number; summary?: string }> {
  const { data: row } = await supabase
    .from('evening_confession_submissions')
    .select('id, user_id, submission_date, transcript, status, prescription_generated_at')
    .eq('id', submissionId)
    .maybeSingle()
  if (!row) return { ok: false, reason: 'submission_not_found' }
  const submission = row as Submission

  if (submission.prescription_generated_at) {
    return { ok: false, reason: 'already_prescribed', prescriptions_count: 0 }
  }
  if (!submission.transcript || submission.transcript.length < MIN_TRANSCRIPT_CHARS) {
    return { ok: false, reason: 'transcript_too_short' }
  }

  const state = await loadUserState(supabase, submission.user_id)
  let rx = await generatePrescriptions(submission.transcript, state)
  if (rx.length === 0) rx = fallbackPrescriptions()

  const prescribedDate = todayPlusOne()

  const inserts = rx.map(p => ({
    user_id: submission.user_id,
    prescribed_date: prescribedDate,
    domain: p.domain.slice(0, 64),
    instruction: p.instruction.slice(0, 1000),
    intensity: Math.max(1, Math.min(5, Math.round(p.intensity ?? 3))),
    duration: p.duration && p.duration > 0 ? Math.min(180, Math.round(p.duration)) : null,
    phase: state?.current_phase ?? 1,
    status: 'pending' as const,
    engagement_meta: {
      source: 'evening_confession',
      confession_submission_id: submission.id,
    },
  }))

  const { error: insErr } = await supabase
    .from('feminization_prescriptions')
    .insert(inserts)
  if (insErr) {
    console.error('[evening-confession-prescribe] insert failed:', insErr.message)
    return { ok: false, reason: 'insert_failed:' + insErr.message.slice(0, 80) }
  }

  const summary = rx.map(p => `${p.domain}: ${p.instruction.slice(0, 80)}`).join(' · ').slice(0, 1000)

  await supabase
    .from('evening_confession_submissions')
    .update({
      status: 'prescribed',
      prescription_generated_at: new Date().toISOString(),
      prescriptions_count: rx.length,
      prescription_summary: summary,
      updated_at: new Date().toISOString(),
    })
    .eq('id', submissionId)

  // Surface a morning preview outreach so Maxy wakes up to it (per
  // visible-before-penalized: tomorrow's prescriptions are deadline-bearing).
  const previewMessage = `Mama prescribed ${rx.length} things for tomorrow based on what you told me tonight. They'll be waiting when you open the app.`
  await supabase.from('handler_outreach_queue').insert({
    user_id: submission.user_id,
    message: previewMessage,
    urgency: 'normal',
    trigger_reason: `evening_confession_prescribed:${submission.id}`,
    source: 'evening_confession',
    scheduled_for: new Date(Date.now() + 8 * 3600_000).toISOString(), // morning-ish
    expires_at: new Date(Date.now() + 24 * 3600_000).toISOString(),
  })

  return { ok: true, prescriptions_count: rx.length, summary }
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
  const { data: pending } = await supabase
    .from('evening_confession_submissions')
    .select('id')
    .eq('submission_date', today)
    .eq('status', 'confessed')
    .is('prescription_generated_at', null)
    .limit(20)

  const out: Array<{ submission_id: string; ok: boolean; reason?: string }> = []
  for (const r of ((pending as Array<{ id: string }>) || [])) {
    const result = await prescribeForSubmission(supabase, r.id)
    out.push({ submission_id: r.id, ...result })
  }

  return new Response(JSON.stringify({ ok: true, processed: out.length, results: out }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
