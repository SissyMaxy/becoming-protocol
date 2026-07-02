// evening-prescribe-dispatch — nightly revival trigger for the evening
// confession → next-day prescription pipeline.
//
// BACKGROUND: evening-confession-prescribe generates TOMORROW's
// feminization_prescriptions from a confession transcript. Its only caller
// was the EveningConfessionGate UI, which was deleted 2026-06-21 — so as of
// that date feminization_prescriptions stopped generating entirely (dead
// pipeline). This dispatcher revives the chain WITHOUT a blocking gate.
//
// Fired nightly (~21:30) by a pg_cron schedule (migration 616). For each
// active user it gathers the day's confession material, in priority order:
//   1. A confessed-but-unprescribed evening_confession_submissions row for
//      today (the original happy path — just hand it to prescribe).
//   2. Today's answered confession_queue rows (response_text) ONLY — the user
//      confessed somewhere today even though the evening ritual UI is gone.
//      There is NO stale prior-day fallback: feeding yesterday's words into
//      tomorrow's prescriptions would mis-attribute one day's material to
//      another (feedback_handler_must_cite_evidence). No confession today →
//      no prescription, matching the original gate's semantics.
// If material is found via (2) and there is no confessed submission for
// today, the dispatcher synthesizes one (status='confessed', transcript =
// the day's confession text) so the existing, tested prescribe path runs
// unchanged. It then POSTs { submission_id } to evening-confession-prescribe.
//
// Idempotent: skips users who already have a prescribed submission today;
// the prescribe function itself is also idempotent (won't re-prescribe a row
// with prescription_generated_at set, won't duplicate prescribed_date).

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { checkSafewordGate } from '../_shared/safeword-gate.ts'
import { mommyVoiceCleanup } from '../_shared/dommy-mommy.ts'
import {
  EVIDENCE_KIND_BY_DOMAIN,
  normalizeFemDomain,
} from '../_shared/fem-domains.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const MIN_TRANSCRIPT_CHARS = 80

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

async function activeUserIds(supabase: SupabaseClient): Promise<string[]> {
  // Active = any user with a user_state row. The protocol runs for the two
  // live user_ids; this enumerates whatever exists. Per-user pause/persona
  // respect is enforced later via checkSafewordGate (the protocol's actual
  // pause chokepoint — user_state has no plain `paused` column).
  const { data } = await supabase
    .from('user_state')
    .select('user_id')
  const ids = ((data as Array<{ user_id: string }>) || []).map(r => r.user_id)
  return Array.from(new Set(ids))
}

// Gather today's confession material for a user. Returns the transcript text,
// or null if nothing usable was confessed today.
async function gatherTodayConfession(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const dayStart = new Date()
  dayStart.setHours(0, 0, 0, 0)

  // TODAY's answered confession_queue rows ONLY — use HER words (not the
  // Mama-authored prompts) so the prescriber's transcript is her voice, not a
  // feedback loop of Mama's own copy. We deliberately do NOT fall back to a
  // stale prior-day confession: feeding yesterday's words into tomorrow's
  // prescriptions risks mis-attributing one day's material to another (the
  // unlinked-receipt-quote footgun, feedback_handler_must_cite_evidence). No
  // confession today → no prescription, matching the original gate's semantics.
  const { data: todayRows } = await supabase
    .from('confession_queue')
    .select('response_text, confessed_at')
    .eq('user_id', userId)
    .gte('confessed_at', dayStart.toISOString())
    .not('response_text', 'is', null)
    .order('confessed_at', { ascending: true })

  const todayText = ((todayRows as Array<{ response_text: string }>) || [])
    .map(r => (r.response_text || '').trim())
    .filter(t => t.length > 0)
    .join('\n\n')
    .trim()
  if (todayText.length >= MIN_TRANSCRIPT_CHARS) return todayText.slice(0, 4000)

  return null
}

// Ensure a confessed evening_confession_submissions row exists for today.
// Returns its id, or null if no material to prescribe from.
async function ensureSubmission(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ submissionId: string | null; reason: string }> {
  const date = today()

  // (1) Existing submission for today.
  const { data: existing } = await supabase
    .from('evening_confession_submissions')
    .select('id, status, transcript, prescription_generated_at')
    .eq('user_id', userId)
    .eq('submission_date', date)
    .maybeSingle()

  const ex = existing as
    | { id: string; status: string; transcript: string | null; prescription_generated_at: string | null }
    | null

  if (ex) {
    if (ex.prescription_generated_at || ex.status === 'prescribed') {
      return { submissionId: null, reason: 'already_prescribed_today' }
    }
    if (ex.status === 'confessed' && (ex.transcript?.length ?? 0) >= MIN_TRANSCRIPT_CHARS) {
      return { submissionId: ex.id, reason: 'existing_confessed' }
    }
    // Row exists (pending/missed) — try to backfill transcript from today's
    // confession material and flip to confessed.
    const transcript = await gatherTodayConfession(supabase, userId)
    if (!transcript) return { submissionId: null, reason: 'no_material' }
    const { error } = await supabase
      .from('evening_confession_submissions')
      .update({
        transcript,
        status: 'confessed',
        whisper_ok: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', ex.id)
    if (error) return { submissionId: null, reason: 'update_failed:' + error.message.slice(0, 60) }
    return { submissionId: ex.id, reason: 'backfilled_existing' }
  }

  // No submission row — synthesize one from the day's confession material.
  const transcript = await gatherTodayConfession(supabase, userId)
  if (!transcript) return { submissionId: null, reason: 'no_material' }

  const { data: ins, error } = await supabase
    .from('evening_confession_submissions')
    .insert({
      user_id: userId,
      submission_date: date,
      transcript,
      whisper_ok: false,
      status: 'confessed',
    })
    .select('id')
    .maybeSingle()
  if (error || !ins) {
    return { submissionId: null, reason: 'insert_failed:' + (error?.message?.slice(0, 60) ?? 'no_row') }
  }
  return { submissionId: (ins as { id: string }).id, reason: 'synthesized' }
}

// ─── Bank-engine fallback (FEM §1: two generators, one contract) ─────
// Runs ONLY when no confession landed today. A trimmed edge port of
// src/lib/conditioning/feminization-prescriptions.ts: phase-gated task_bank
// pool, skip-rate cooldown, owned-item filter, 3 rows for tomorrow with
// evidence_kind + deadline. Idempotent — skips if tomorrow already has rows.

const PHASE_DOMAINS: Record<number, string[]> = {
  0: ['skincare', 'nutrition', 'exercise'],
  1: ['skincare', 'nutrition', 'exercise', 'voice', 'scent', 'style'],
  2: ['skincare', 'nutrition', 'exercise', 'voice', 'scent', 'style', 'movement', 'body_language', 'makeup'],
  3: ['skincare', 'nutrition', 'exercise', 'voice', 'scent', 'style', 'movement', 'body_language', 'makeup', 'social', 'inner_narrative', 'wigs'],
  4: ['skincare', 'nutrition', 'exercise', 'voice', 'scent', 'style', 'movement', 'body_language', 'makeup', 'social', 'inner_narrative', 'wigs', 'arousal', 'chastity', 'conditioning', 'identity'],
}

function fallbackDeadlineIsoEt(dateStr: string): string {
  const noonUtc = new Date(`${dateStr}T12:00:00Z`)
  const etHour = Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour: 'numeric', hour12: false,
  }).format(noonUtc))
  return new Date(new Date(`${dateStr}T23:59:00Z`).getTime() + (12 - etHour) * 3600_000).toISOString()
}

async function bankEngineFallback(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ ok: boolean; reason: string; count?: number }> {
  const tomorrow = new Date(Date.now() + 86400_000).toISOString().slice(0, 10)

  // Idempotency: tomorrow already provisioned (by a prior run or the
  // confession path) → no-op. NEVER deletes — completed/skipped are history.
  const { count: existing, error: exErr } = await supabase
    .from('feminization_prescriptions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('prescribed_date', tomorrow)
  if (exErr) return { ok: false, reason: 'existing_check_failed:' + exErr.message.slice(0, 60) }
  if ((existing ?? 0) > 0) return { ok: false, reason: 'tomorrow_already_prescribed' }

  const [stateRes, skipRes, wardrobeRes] = await Promise.all([
    supabase.from('user_state').select('current_phase').eq('user_id', userId).maybeSingle(),
    supabase.from('feminization_prescriptions')
      .select('domain, status, expired_silently')
      .eq('user_id', userId)
      .gte('prescribed_date', new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10)),
    supabase.from('wardrobe_inventory').select('category').eq('user_id', userId),
  ])

  const phase = Math.min(4, Math.max(0, (stateRes.data as { current_phase?: number } | null)?.current_phase ?? 0))
  const owned = new Set(((wardrobeRes.data as Array<{ category: string }>) || []).map(r => r.category))

  // Skip-rate cooldown: ≥85% weighted skip in 7d → domain sits out.
  const perDomain: Record<string, { total: number; weighted: number }> = {}
  for (const r of ((skipRes.data as Array<{ domain: string; status: string; expired_silently?: boolean }>) || [])) {
    if (r.status === 'expired' && r.expired_silently) continue // never-surfaced counts for nothing
    const d = perDomain[r.domain] ?? (perDomain[r.domain] = { total: 0, weighted: 0 })
    d.total += 1
    if (r.status === 'skipped') d.weighted += 1
    else if (r.status === 'expired') d.weighted += 0.5
  }
  const cooled = new Set(Object.entries(perDomain)
    .filter(([, v]) => v.total >= 3 && v.weighted / v.total >= 0.85)
    .map(([k]) => k))

  const domains = (PHASE_DOMAINS[phase] ?? PHASE_DOMAINS[0]).filter(d => !cooled.has(d))
  const pool = domains.length > 0 ? domains : PHASE_DOMAINS[0]

  const { data: tasks, error: taskErr } = await supabase
    .from('task_bank')
    .select('id, domain, instruction, intensity, duration_minutes, requires')
    .eq('active', true)
    .in('domain', pool)
    .lte('intensity', 5)
    .limit(150)
  if (taskErr) return { ok: false, reason: 'task_bank_read_failed:' + taskErr.message.slice(0, 60) }

  type BankTask = { id: string; domain: string; instruction: string; intensity: number; duration_minutes: number | null; requires?: { item_category?: string } | null }
  const candidates = ((tasks as BankTask[]) || []).filter(t => {
    const cat = t.requires?.item_category
    return !cat || owned.has(cat) // prescribe only what she owns
  })
  if (candidates.length === 0) return { ok: false, reason: 'no_candidates' }

  // Shuffle-lite + domain diversity (max 1 per domain, 3 rows).
  const shuffled = [...candidates].sort(() => Math.random() - 0.5)
  const picked: BankTask[] = []
  const usedDomains = new Set<string>()
  for (const t of shuffled) {
    if (picked.length >= 3) break
    if (usedDomains.has(t.domain)) continue
    usedDomains.add(t.domain)
    picked.push(t)
  }

  const deadline = fallbackDeadlineIsoEt(tomorrow)
  const rows = picked.map(t => {
    const domain = normalizeFemDomain(t.domain)
    return {
      user_id: userId,
      prescribed_date: tomorrow,
      task_id: t.id,
      domain,
      instruction: mommyVoiceCleanup(t.instruction).slice(0, 1000),
      intensity: Math.max(1, Math.min(5, Math.round(t.intensity))),
      duration: t.duration_minutes,
      phase,
      status: 'pending',
      evidence_kind: EVIDENCE_KIND_BY_DOMAIN[domain] ?? 'text',
      deadline,
      requires: t.requires ?? null,
      engagement_meta: { source: 'bank_engine_fallback', cooled_domains: Array.from(cooled) },
    }
  })

  const { error: insErr } = await supabase.from('feminization_prescriptions').insert(rows)
  if (insErr) return { ok: false, reason: 'insert_failed:' + insErr.message.slice(0, 60) }
  return { ok: true, reason: 'bank_engine_fallback', count: rows.length }
}

async function callPrescribe(submissionId: string): Promise<{ ok: boolean; status: number; body: string }> {
  const url = Deno.env.get('SUPABASE_URL')! + '/functions/v1/evening-confession-prescribe'
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    },
    body: JSON.stringify({ submission_id: submissionId }),
  })
  const body = await res.text()
  return { ok: res.ok, status: res.status, body: body.slice(0, 300) }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Optional: dispatch a single user via { user_id }.
  let body: { user_id?: string } = {}
  try { body = await req.json() } catch { /* ignore */ }

  const userIds = body.user_id ? [body.user_id] : await activeUserIds(supabase)

  const results: Array<{ user_id: string; ok: boolean; reason: string; prescribe?: unknown }> = []
  for (const userId of userIds) {
    try {
      // Respect the protocol's pause/safeword/persona chokepoint. A paused
      // user (or non-Dommy-Mommy persona) gets no nightly prescription push.
      const gate = await checkSafewordGate(supabase, userId)
      if (!gate.allowed) {
        results.push({ user_id: userId, ok: false, reason: 'gated:' + gate.reason })
        continue
      }
      const { submissionId, reason } = await ensureSubmission(supabase, userId)
      if (!submissionId) {
        // No confession landed today → bank engine provisions tomorrow
        // (FEM §1: two generators, one contract; engine ONLY when the
        // confession path produced nothing).
        if (reason === 'no_material') {
          const fb = await bankEngineFallback(supabase, userId)
          results.push({ user_id: userId, ok: fb.ok, reason: `${reason}→${fb.reason}` })
        } else {
          results.push({ user_id: userId, ok: false, reason })
        }
        continue
      }
      const r = await callPrescribe(submissionId)
      results.push({ user_id: userId, ok: r.ok, reason, prescribe: { status: r.status, body: r.body } })
    } catch (e) {
      results.push({ user_id: userId, ok: false, reason: 'exception:' + (e as Error).message.slice(0, 80) })
    }
  }

  const dispatched = results.filter(r => r.ok).length
  return new Response(JSON.stringify({ ok: true, users: userIds.length, dispatched, results }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
