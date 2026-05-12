// mommy-witness-dispatcher — runs hourly. Drains sealed_envelopes whose
// auto_send_at has passed and publishes them to the user's private
// letters_archive.
//
// SAFETY SCOPE 2026-05-12: archive-only mode. External recipients (email,
// sms, witness_notification) are DEFERRED until the 6-gate clear-headed
// authorization system is built. See design_assets/witness-safety-2026-05-12.md.
//
// This dispatcher has NO external code path. Every due envelope publishes
// to letters_archive with a "would have gone to <intended_recipient_label>"
// marker that holds the fantasy of inevitability without contacting any
// third party.
//
// Defense in depth:
//   - Migration 403 CHECK constraint restricts auto_send_method to NULL or
//     'letter_archive_publish'
//   - This file imports no email/sms client
//   - Safeword cooldown still pauses pending unlocks (honors user's
//     "stop everything" even though publishes are private)
//
// POST { batch_size?: number }
// Returns { ok, examined, archived, skipped_safeword, failed, errors }

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const MAX_ATTEMPTS = 3

interface EnvelopeRow {
  id: string
  user_id: string
  title: string | null
  sealed_content: string
  sealed_at: string | null
  auto_send_at: string
  intended_recipient_label: string | null
  auto_send_attempts: number
}

async function logWitnessAction(
  supabase: SupabaseClient,
  userId: string,
  envelopeId: string | null,
  action: string,
  intendedRecipientLabel: string | null,
  payload: Record<string, unknown>,
  success: boolean,
  error: string | null,
  authorityLogId: string | null,
): Promise<void> {
  await supabase.from('witness_authority_log').insert({
    user_id: userId,
    envelope_id: envelopeId,
    action,
    intended_recipient_label: intendedRecipientLabel,
    payload,
    success,
    error,
    authority_log_id: authorityLogId,
  })
}

async function publishToArchive(
  supabase: SupabaseClient,
  env: EnvelopeRow,
): Promise<{ ok: boolean; error?: string }> {
  const recipientPhrase = env.intended_recipient_label
    ? `would have gone to ${env.intended_recipient_label} if you'd given Mama their address`
    : `held in archive only — no external recipient was set`
  const sealedDate = env.sealed_at ?? 'an earlier date'
  const archiveText = `[Sealed envelope auto-published — ${recipientPhrase} — sealed on ${sealedDate}, unlocked on ${env.auto_send_at}]\n\n${env.sealed_content}`
  const { error } = await supabase.from('letters_archive').insert({
    user_id: env.user_id,
    letter_text: archiveText,
    kind: 'sealed_envelope_unlock',
    metadata: {
      envelope_id: env.id,
      intended_recipient_label: env.intended_recipient_label,
      auto_send_at: env.auto_send_at,
      sealed_at: env.sealed_at,
    },
  })
  if (error) return { ok: false, error: 'archive_insert: ' + error.message }
  return { ok: true }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  let batchSize = 50
  if (req.method === 'POST') {
    try {
      const body = await req.json()
      if (typeof body?.batch_size === 'number') batchSize = Math.max(1, Math.min(500, body.batch_size))
    } catch { /* optional body */ }
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  const nowIso = new Date().toISOString()
  const { data: due, error: dueErr } = await supabase
    .from('sealed_envelopes')
    .select('id, user_id, title, sealed_content, sealed_at, auto_send_at, intended_recipient_label, auto_send_attempts')
    .eq('auto_send_status', 'pending')
    .not('auto_send_at', 'is', null)
    .lte('auto_send_at', nowIso)
    .order('auto_send_at', { ascending: true })
    .limit(batchSize)
  if (dueErr) {
    return new Response(JSON.stringify({ ok: false, error: 'due_select: ' + dueErr.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let archived = 0
  let skippedSafeword = 0
  let failed = 0
  const errors: Array<{ envelope_id: string; error: string }> = []

  for (const env of (due ?? []) as EnvelopeRow[]) {
    // Safeword cooldown gate — even archive publishes pause when the user
    // has fired the safeword. Honors "stop everything" regardless of surface.
    const { data: holdActive } = await supabase.rpc('user_has_active_safeword_hold', { p_user_id: env.user_id })
    if (holdActive === true) {
      await supabase.from('sealed_envelopes')
        .update({ auto_send_status: 'paused' })
        .eq('id', env.id)
      await logWitnessAction(supabase, env.user_id, env.id, 'skipped_safeword',
        env.intended_recipient_label, { reason: 'safeword_hold_active' }, false, null, null)
      skippedSafeword += 1
      continue
    }

    const r = await publishToArchive(supabase, env)
    if (!r.ok) {
      const newAttempts = env.auto_send_attempts + 1
      await supabase.from('sealed_envelopes').update({
        auto_send_attempts: newAttempts,
        auto_send_last_error: r.error ?? null,
        auto_send_status: newAttempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
      }).eq('id', env.id)
      errors.push({ envelope_id: env.id, error: r.error ?? 'archive failed' })
      await logWitnessAction(supabase, env.user_id, env.id, 'failed',
        env.intended_recipient_label, { method: 'letter_archive_publish' },
        false, r.error ?? null, null)
      failed += 1
      continue
    }

    const { data: authLog } = await supabase.rpc('log_mommy_authority', {
      p_user_id: env.user_id,
      p_action_kind: 'witness_envelope_archived',
      p_source_system: 'mommy-witness-dispatcher',
      p_action_summary: env.intended_recipient_label
        ? `Sealed envelope unlocked into archive (would have gone to ${env.intended_recipient_label})`
        : `Sealed envelope unlocked into archive`,
      p_voice_excerpt: 'Mama set the date. You signed. It happened on its own.',
      p_action_payload: {
        envelope_id: env.id,
        intended_recipient_label: env.intended_recipient_label,
        method: 'letter_archive_publish',
      },
    })

    await supabase.from('sealed_envelopes').update({
      auto_send_status: 'sent',
      sent_at: nowIso,
    }).eq('id', env.id)

    await logWitnessAction(supabase, env.user_id, env.id, 'archived',
      env.intended_recipient_label, { method: 'letter_archive_publish' },
      true, null, (authLog as string | null) ?? null)
    archived += 1
  }

  return new Response(JSON.stringify({
    ok: true,
    examined: due?.length ?? 0,
    archived,
    skipped_safeword: skippedSafeword,
    failed,
    errors,
    mode: 'archive_only',
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
