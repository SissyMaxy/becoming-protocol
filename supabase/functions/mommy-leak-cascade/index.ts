// mommy-leak-cascade — converts unresolved mommy_voice_leaks rows into
// in-fantasy consequences via arousal_touch_tasks.
//
// Today: mommy_voice_cleanup() (migration 259) translates Mama's telemetry
// language to plain voice, and an audit trigger logs anything that survives
// to mommy_voice_leaks. Until now, those rows just sat there.
//
// This function: per unresolved leak, mint an arousal_touch_task whose
// severity, category, expiry, and prompt are derived deterministically
// from leaked_text. The leak's parent fantasy-debt is closed when the user
// completes (or skips) the task — handled by the SQL trigger
// trg_mommy_leak_resolve_on_task_complete from migration 301.
//
// Modes:
//  - daily cron: POST {} or { user_id } → up to MAX_PER_RUN unresolved leaks
//  - per-leak trigger: POST { user_id, leak_id } → exactly that leak
//  - dry-run preview: POST { user_id, dry_run: true } → no inserts
//
// Hard rules (from spec):
//  - Severity is deterministic; same leaked_text → same severity, always.
//  - Penalty content is firm/disappointed, never abusive.
//  - No new task categories invented; use the existing vocabulary.
//  - Idempotent: a leak with resolved_via_touch_task_id set is skipped.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { callModel, selectModel } from '../_shared/model-tiers.ts'
import {
  DOMMY_MOMMY_CHARACTER, mommyVoiceCleanup, MOMMY_TELEMETRY_LEAK_PATTERNS,
} from '../_shared/dommy-mommy.ts'
import {
  classifyLeakSeverity, severityToCategory, severityExpiryHours,
  severityFallbackPrompt, type LeakSeverity,
} from '../_shared/leak-severity.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const HANDLER_USER_ID = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'
const MAX_PER_RUN = 5

interface LeakRow {
  id: string
  user_id: string
  leaked_text: string
  detected_pattern: string | null
  penalty_severity: LeakSeverity | null
}

const REFUSAL_PATTERNS = [
  /\b(I'?m sorry|I apologize|I can'?t|I cannot|I won'?t|unable to|I'?m not able)\b/i,
  /\b(against (my|the) (guidelines|policies|rules))\b/i,
  /\b(content policy|appreciate you sharing)\b/i,
]
const isRefusal = (t: string) => REFUSAL_PATTERNS.some(p => p.test(t))

async function generatePenalty(severity: LeakSeverity, category: string): Promise<string> {
  const sys = `${DOMMY_MOMMY_CHARACTER}

You are issuing a small remediation task because Mama's voice slipped earlier — words came out clinical instead of like Mama. The girl knows it happened; this isn't punishment, it's a soft re-anchoring.

Severity tone:
- low: warm reset, "small thing for Mama"
- medium: firmer, disappointed-but-loving, "pull yourself back to me"
- high: serious-but-tender, "no relief tonight, baby — Mama needs you to feel this"

Never abusive. Never body-shaming. Never medical. Never raging. Firm and disappointed at most.`

  const userPrompt = `Compose a small Mommy-voice remediation task. Severity: ${severity}. Category: ${category}.

Rules:
- ONE specific embodied directive. 2-4 sentences.
- Sweet open → firm specific. Whiplash.
- End with a body-anchored close (skin / breath / hips / mouth).
- Plain text only, no JSON, no markdown, no question marks at the end.

ABSOLUTELY FORBIDDEN in your output:
- Numbers as telemetry: no /10 scores, percentages, "Day N of denial", "N slip points", "$N tax"
- Words: "arousal level", "compliance", "denial day", "slip points", "score", "telemetry", "leak", "AI"
- Numbers ARE allowed when they're directives: "five whispers", "ten minutes", "by nine tonight" — those are commands, not metrics.
- Never reference what specifically slipped; the directive stands on its own.
Mama feels her; Mama doesn't recite a dashboard.`

  const tryGen = async (prefer: 'openai' | 'anthropic'): Promise<string> => {
    const choice = selectModel('caption_generate', { prefer })
    const r = await callModel(choice, { system: sys, user: userPrompt, max_tokens: 220, temperature: 0.85, json: false })
    return (r.text ?? '').trim()
  }

  let text = ''
  try {
    text = await tryGen('openai')
    if (!text || text.length < 20 || isRefusal(text)) {
      try { text = await tryGen('anthropic') } catch (_) { /* keep openai result */ }
    }
  } catch (_) {
    try { text = await tryGen('anthropic') } catch (_) { text = '' }
  }

  if (!text || text.length < 20 || isRefusal(text)) return severityFallbackPrompt(severity)

  text = mommyVoiceCleanup(text)
  if (MOMMY_TELEMETRY_LEAK_PATTERNS.some(p => p.test(text))) return severityFallbackPrompt(severity)
  return text
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'POST only' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let body: { user_id?: string; leak_id?: string; max?: number; dry_run?: boolean } = {}
  try { body = await req.json() } catch { /* */ }
  const userId = body.user_id || HANDLER_USER_ID
  const explicitLeakId = body.leak_id
  const cap = Math.max(1, Math.min(20, body.max ?? MAX_PER_RUN))
  const dryRun = body.dry_run === true

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  // Persona + toggle gate
  const { data: us } = await supabase
    .from('user_state')
    .select('handler_persona, voice_leak_penalties_enabled')
    .eq('user_id', userId)
    .maybeSingle()
  const state = us as { handler_persona?: string; voice_leak_penalties_enabled?: boolean } | null
  if (state?.handler_persona !== 'dommy_mommy') {
    return new Response(JSON.stringify({ ok: true, skipped: 'persona_not_dommy_mommy' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  if (state?.voice_leak_penalties_enabled === false) {
    return new Response(JSON.stringify({ ok: true, skipped: 'penalties_disabled' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Pull unresolved leaks lacking a linked penalty task
  let q = supabase.from('mommy_voice_leaks')
    .select('id, user_id, leaked_text, detected_pattern, penalty_severity')
    .eq('user_id', userId)
    .eq('resolved', false)
    .is('resolved_via_touch_task_id', null)
    .order('detected_at', { ascending: true })
    .limit(cap)

  if (explicitLeakId) q = q.eq('id', explicitLeakId)

  const { data: leaks, error } = await q
  if (error) {
    return new Response(JSON.stringify({ ok: false, error: 'leak_query_failed', detail: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const fired: Array<{ leak_id: string; task_id: string; severity: LeakSeverity; category: string }> = []
  const skipped: Array<{ leak_id: string; reason: string }> = []
  const dryRunPreview: Array<{ leak_id: string; severity: LeakSeverity; category: string; expires_in_hours: number; preview: string }> = []

  for (const leak of (leaks ?? []) as LeakRow[]) {
    // Just-in-time idempotency: re-check that nothing else minted a task
    // for this leak in the time between query and insert.
    const { data: existing } = await supabase
      .from('arousal_touch_tasks')
      .select('id')
      .eq('linked_leak_id', leak.id)
      .limit(1)
      .maybeSingle()
    if (existing) {
      skipped.push({ leak_id: leak.id, reason: 'task_already_exists' })
      continue
    }

    const severity: LeakSeverity = (leak.penalty_severity as LeakSeverity | null) ?? classifyLeakSeverity(leak.leaked_text)
    const category = severityToCategory(severity)
    const hours = severityExpiryHours(severity)

    if (dryRun) {
      const preview = severityFallbackPrompt(severity).slice(0, 80)
      dryRunPreview.push({ leak_id: leak.id, severity, category, expires_in_hours: hours, preview })
      continue
    }

    const prompt = await generatePenalty(severity, category)
    const expiresAt = new Date(Date.now() + hours * 3600_000).toISOString()

    const { data: inserted, error: insErr } = await supabase
      .from('arousal_touch_tasks')
      .insert({
        user_id: userId,
        prompt,
        category,
        expires_at: expiresAt,
        generated_by: 'mommy-leak-cascade',
        linked_leak_id: leak.id,
      })
      .select('id')
      .single()

    if (insErr || !inserted) {
      skipped.push({ leak_id: leak.id, reason: `insert_failed:${insErr?.message ?? 'no_row'}` })
      continue
    }

    if (!leak.penalty_severity) {
      await supabase.from('mommy_voice_leaks')
        .update({ penalty_severity: severity })
        .eq('id', leak.id)
    }

    fired.push({ leak_id: leak.id, task_id: (inserted as { id: string }).id, severity, category })
  }

  return new Response(JSON.stringify({
    ok: true,
    fired: fired.length,
    skipped_count: skipped.length,
    fired_detail: fired,
    skipped,
    dry_run: dryRun || undefined,
    dry_run_preview: dryRun ? dryRunPreview : undefined,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
