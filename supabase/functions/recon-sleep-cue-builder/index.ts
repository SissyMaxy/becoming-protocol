// recon-sleep-cue-builder — Targeted Memory Reactivation (TMR) sleep-cue renderer.
// DESIGN §2.4.
//
// Pre-renders low-volume audio loops of cues that are ALREADY INSTALLED, for
// optional replay during deep sleep. The single hardest honesty rule of this whole
// engine lives here:
//
//   TMR REACTIVATES; IT NEVER INTRODUCES. We only render material the user installed
//   while awake and consenting. The cue phrase is copied VERBATIM from an armed
//   trance_trigger (or a genuinely-verbal deployed pavlovian cue). Nothing new is
//   ever spoken into sleep. No claims are authored, no facts are asserted.
//
// This is a passive/background mechanism: it files NO decree, carries NO deadline,
// and has NO punishment. Playback is a separate, client-side concern gated to
// deep-dominant sleep windows (see the sleep-phase note below).
//
// Gates (fail-closed, in order):
//   1. requireGate(s, 'recondition', user) — the whole engine's master switch.
//   2. life_as_woman_settings.recon_sleep_enabled = TRUE — sleep audio is the
//      hardest opt-in and is OFF unless the user explicitly turned it on, separate
//      from recondition_enabled.
//
// Sources (verified via introspection 2026-07-03):
//   - trance_triggers: status='armed', recon_target_id set → phrase is a verbal,
//     already-installed cue. This is the real TMR source.
//   - pavlovian_pairings: deployed_as_trigger_at set, active, recon_target_id set.
//     BUT every pavlovian_cues.modality is non-verbal (scent/song/texture/taste/
//     lighting/visual/position). Speaking words about a scent/visual cue in sleep
//     WOULD be introducing new material, so we do NOT synthesize those. The branch
//     is kept (source_kind stays valid) and each deployed pavlovian pairing is
//     recorded as skipped with reason 'pavlovian_nonverbal' for auditability.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireGate } from '../_shared/conditioning-gate.ts'
import { synthesizeMommySpeech } from '../_shared/tts.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const USERS = ['8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', '93327332-7d0d-4888-889a-1607a5776216']

// deno-lint-ignore no-explicit-any
type Sb = any

// SLEEP-PHASE NOTE: supabase/functions/_shared/sleep-phase-targeting.ts does NOT
// exist yet (checked 2026-07-03). Playback-window gating (only fire in deep-dominant
// NREM windows) is therefore the responsibility of the CLIENT that plays these loops.
// When that helper lands, wire it into the *player*, not this builder — the builder
// only renders and queues; it never decides when audio actually plays.

// Render one installed cue phrase to the private 'audio' bucket and mark the row built.
async function buildRow(s: Sb, row: { id: string; user_id: string; cue_phrase: string }): Promise<string> {
  let tts
  try {
    // affect null → default gentle Mommy settings. Volume/loop shaping is a
    // playback concern, not a synthesis one. The phrase is spoken verbatim.
    tts = await synthesizeMommySpeech(row.cue_phrase, { affect: null })
  } catch (e) {
    return `tts_err:${String(e).slice(0, 60)}`
  }
  const path = `sleep-cues/${row.user_id}/${row.id}.mp3`
  const { error: upErr } = await s.storage
    .from('audio')
    .upload(path, tts.bytes, { contentType: 'audio/mpeg', upsert: true })
  if (upErr) return `upload_err:${upErr.message.slice(0, 60)}`

  const { error: updErr } = await s.from('recon_sleep_cue_program')
    .update({ audio_path: path, status: 'built', built_at: new Date().toISOString() })
    .eq('id', row.id)
  return updErr ? `update_err:${updErr.message.slice(0, 60)}` : 'built'
}

// Queue (or reuse) exactly one program per (target, cue_phrase). The partial unique
// index on the table is the backstop; this check keeps us from churning renders.
async function ensureRow(
  s: Sb,
  user: string,
  targetId: string | null,
  cuePhrase: string,
  sourceKind: 'trance_trigger' | 'pavlovian_cue',
  sourceRef: string | null,
): Promise<{ id: string; user_id: string; cue_phrase: string; already: boolean } | null> {
  const { data: ex } = await s.from('recon_sleep_cue_program')
    .select('id, status')
    .eq('user_id', user)
    .eq('target_id', targetId)
    .eq('cue_phrase', cuePhrase)
    .neq('status', 'cancelled')
    .limit(1)
    .maybeSingle()
  if (ex) {
    // Already built/played → leave it. Still 'queued' (e.g. a prior render failed)
    // → hand it back so we retry the render this run.
    if (ex.status === 'built' || ex.status === 'played') return null
    return { id: ex.id, user_id: user, cue_phrase: cuePhrase, already: true }
  }
  const { data: ins, error } = await s.from('recon_sleep_cue_program')
    .insert({
      user_id: user,
      target_id: targetId,
      cue_phrase: cuePhrase,
      source_kind: sourceKind,
      source_ref: sourceRef,
      status: 'queued',
    })
    .select('id')
    .single()
  if (error || !ins) return null
  return { id: ins.id, user_id: user, cue_phrase: cuePhrase, already: false }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const s = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
  const results: Record<string, unknown>[] = []

  for (const user of USERS) {
    const gate = await requireGate(s, 'recondition', user)
    if (!gate.allowed) { results.push({ user, suppressed: gate.reason }); continue }

    // Hardest opt-in: sleep audio requires its own explicit flag.
    const { data: settings } = await s.from('life_as_woman_settings')
      .select('recon_sleep_enabled').eq('user_id', user).maybeSingle()
    if (!settings?.recon_sleep_enabled) {
      results.push({ user, suppressed: 'recon_sleep_disabled' }); continue
    }

    // Active targets for this user.
    const { data: targets } = await s.from('reconditioning_targets')
      .select('id').eq('user_id', user).eq('status', 'active')
    const activeIds = (targets ?? []).map((t: { id: string }) => t.id)
    if (activeIds.length === 0) { results.push({ user, note: 'no_active_targets' }); continue }

    let queued = 0, built = 0, skipped_pavlovian = 0
    const errors: string[] = []

    // ── Source 1: armed trance_triggers aimed at an active target (verbal, installed).
    const { data: triggers } = await s.from('trance_triggers')
      .select('id, phrase, recon_target_id, status')
      .eq('user_id', user)
      .eq('status', 'armed')
      .in('recon_target_id', activeIds)
    for (const t of (triggers ?? []) as { id: string; phrase: string; recon_target_id: string }[]) {
      const phrase = (t.phrase ?? '').trim()
      if (!phrase) continue
      const row = await ensureRow(s, user, t.recon_target_id, phrase, 'trance_trigger', t.id)
      if (!row) continue // already built/played, or insert collided with the unique index
      if (!row.already) queued++
      const outcome = await buildRow(s, row)
      if (outcome === 'built') built++
      else errors.push(`${t.id}:${outcome}`)
    }

    // ── Source 2: deployed pavlovian cues aimed at an active target.
    // HONESTY GUARD: all pavlovian modalities are non-verbal, so we do NOT speak
    // them into sleep (that would introduce new material). Recorded as skipped.
    const { data: pav } = await s.from('pavlovian_pairings')
      .select('id, recon_target_id')
      .eq('user_id', user)
      .eq('active', true)
      .not('deployed_as_trigger_at', 'is', null)
      .in('recon_target_id', activeIds)
    skipped_pavlovian = (pav ?? []).length

    results.push({
      user,
      active_targets: activeIds.length,
      queued,
      built,
      skipped_pavlovian_nonverbal: skipped_pavlovian,
      ...(errors.length ? { errors } : {}),
    })
  }

  return new Response(
    JSON.stringify({ ok: true, results }),
    { headers: { ...cors, 'Content-Type': 'application/json' } },
  )
})
