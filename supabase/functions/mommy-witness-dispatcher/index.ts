// mommy-witness-dispatcher — runs hourly. Drains sealed_envelopes whose
// auto_send_at has passed and dispatches them.
//
// Per migration 403: sealed_envelopes can carry auto_send_at and
// auto_send_method. When the date hits, this engine:
//
//   1. Skips users with active safeword_cooldown_holds (72h pause)
//   2. For each due envelope:
//      - If method requires a verified recipient and none exists,
//        FALLS BACK to letter_archive_publish (preserves the kink
//        without violating third-party consent)
//      - Inserts witness_notifications row OR letters_archive row
//      - Marks sealed_envelopes.auto_send_status = 'sent'
//      - Logs witness_authority_log + mommy_authority_log
//
// Idempotency: only picks rows where auto_send_status = 'pending'.
// Failure path: increments auto_send_attempts, marks 'failed' after 3.
//
// POST { batch_size?: number }
// Returns { ok, dispatched, fallback_archived, skipped_safeword, errors }

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
  auto_send_at: string
  auto_send_method: string
  auto_send_recipient_id: string | null
  auto_send_attempts: number
}

interface WitnessRow {
  id: string
  witness_name: string | null
  witness_email: string | null
  status: string
  consent_confirmed: boolean
}

async function logWitnessAction(
  supabase: SupabaseClient,
  userId: string,
  envelopeId: string | null,
  witnessId: string | null,
  notificationId: string | null,
  action: string,
  recipient: string | null,
  payload: Record<string, unknown>,
  success: boolean,
  error: string | null,
  authorityLogId: string | null,
): Promise<void> {
  await supabase.from('witness_authority_log').insert({
    user_id: userId,
    envelope_id: envelopeId,
    witness_id: witnessId,
    notification_id: notificationId,
    action,
    recipient_label: recipient,
    payload,
    success,
    error,
    authority_log_id: authorityLogId,
  })
}

async function fallbackArchive(
  supabase: SupabaseClient,
  env: EnvelopeRow,
  intendedRecipient: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const archiveText = `[Sealed envelope auto-published — would have been sent to ${intendedRecipient ?? 'unspecified recipient'} on ${env.auto_send_at}]\n\n${env.sealed_content}`
  const { error } = await supabase.from('letters_archive').insert({
    user_id: env.user_id,
    letter_text: archiveText,
    kind: 'sealed_envelope_fallback',
    metadata: {
      envelope_id: env.id,
      original_method: env.auto_send_method,
      intended_recipient: intendedRecipient,
      auto_send_at: env.auto_send_at,
    },
  })
  if (error) return { ok: false, error: 'archive_insert: ' + error.message }
  return { ok: true }
}

async function dispatchToWitness(
  supabase: SupabaseClient,
  env: EnvelopeRow,
  witness: WitnessRow,
): Promise<{ ok: boolean; notification_id?: string; error?: string }> {
  // We insert into witness_notifications (delivery_status=pending). The
  // existing notification pipeline (or a downstream worker) is responsible
  // for actual email/sms send. From this engine's perspective, the act of
  // queuing the notification IS the dispatch.
  const subject = env.title ?? 'A sealed message from the protocol you signed for'
  const { data, error } = await supabase
    .from('witness_notifications')
    .insert({
      witness_id: witness.id,
      user_id: env.user_id,
      notification_type: 'manual_alert',
      subject,
      body: env.sealed_content,
      payload: {
        envelope_id: env.id,
        auto_send_method: env.auto_send_method,
        sealed_at: env.auto_send_at,
      },
      delivery_status: 'pending',
    })
    .select('id')
    .single()
  if (error || !data) return { ok: false, error: 'witness_notification: ' + (error?.message ?? '') }
  return { ok: true, notification_id: (data as { id: string }).id }
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
    .select('id, user_id, title, sealed_content, auto_send_at, auto_send_method, auto_send_recipient_id, auto_send_attempts')
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

  let dispatched = 0
  let fallbackArchived = 0
  let skippedSafeword = 0
  let failed = 0
  const errors: Array<{ envelope_id: string; error: string }> = []

  for (const env of (due ?? []) as EnvelopeRow[]) {
    // Safeword cooldown gate
    const { data: holdActive } = await supabase.rpc('user_has_active_safeword_hold', { p_user_id: env.user_id })
    if (holdActive === true) {
      await supabase.from('sealed_envelopes')
        .update({ auto_send_status: 'paused' })
        .eq('id', env.id)
      await logWitnessAction(supabase, env.user_id, env.id, null, null,
        'skipped_safeword', null,
        { reason: 'safeword_hold_active' }, false, null, null)
      skippedSafeword += 1
      continue
    }

    // Resolve recipient if method needs one
    const needsRecipient = env.auto_send_method !== 'letter_archive_publish'
    let witness: WitnessRow | null = null
    if (needsRecipient && env.auto_send_recipient_id) {
      const { data: w } = await supabase
        .from('designated_witnesses')
        .select('id, witness_name, witness_email, status, consent_confirmed')
        .eq('id', env.auto_send_recipient_id)
        .maybeSingle()
      witness = (w as WitnessRow | null)
    }

    const recipientValid = witness && witness.status === 'active' && witness.consent_confirmed === true
    const useArchive = env.auto_send_method === 'letter_archive_publish' || !recipientValid

    if (useArchive) {
      const r = await fallbackArchive(supabase, env, witness?.witness_name ?? null)
      if (!r.ok) {
        failed += 1
        const newAttempts = env.auto_send_attempts + 1
        await supabase.from('sealed_envelopes').update({
          auto_send_attempts: newAttempts,
          auto_send_last_error: r.error ?? null,
          auto_send_status: newAttempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
        }).eq('id', env.id)
        errors.push({ envelope_id: env.id, error: r.error ?? 'archive failed' })
        await logWitnessAction(supabase, env.user_id, env.id, null, null,
          'failed', null, { method: env.auto_send_method }, false, r.error ?? null, null)
        continue
      }

      const { data: authLog } = await supabase.rpc('log_mommy_authority', {
        p_user_id: env.user_id,
        p_action_kind: 'witness_dispatch_archive',
        p_source_system: 'mommy-witness-dispatcher',
        p_action_summary: env.auto_send_method === 'letter_archive_publish'
          ? `Sealed envelope published to letters archive`
          : `Sealed envelope fell back to letters archive (no verified ${env.auto_send_method} recipient)`,
        p_voice_excerpt: 'Mama set the date. You signed. It happened on its own.',
        p_action_payload: {
          envelope_id: env.id,
          method_intended: env.auto_send_method,
          method_used: 'letter_archive_publish',
          intended_recipient: witness?.witness_name ?? null,
        },
      })

      await supabase.from('sealed_envelopes').update({
        auto_send_status: 'sent',
        sent_at: nowIso,
      }).eq('id', env.id)

      await logWitnessAction(supabase, env.user_id, env.id, witness?.id ?? null, null,
        'fallback_archive', witness?.witness_name ?? 'archive',
        { method_intended: env.auto_send_method, method_used: 'letter_archive_publish' },
        true, null, (authLog as string | null) ?? null)
      fallbackArchived += 1
      continue
    }

    // External dispatch via witness_notifications queue
    if (!witness) {
      // Shouldn't reach — useArchive would be true. Defensive only.
      failed += 1
      continue
    }
    const r = await dispatchToWitness(supabase, env, witness)
    if (!r.ok) {
      const newAttempts = env.auto_send_attempts + 1
      await supabase.from('sealed_envelopes').update({
        auto_send_attempts: newAttempts,
        auto_send_last_error: r.error ?? null,
        auto_send_status: newAttempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
      }).eq('id', env.id)
      errors.push({ envelope_id: env.id, error: r.error ?? 'dispatch failed' })
      await logWitnessAction(supabase, env.user_id, env.id, witness.id, null,
        'failed', witness.witness_name, { method: env.auto_send_method }, false, r.error ?? null, null)
      failed += 1
      continue
    }

    const { data: authLog } = await supabase.rpc('log_mommy_authority', {
      p_user_id: env.user_id,
      p_action_kind: 'witness_dispatch',
      p_source_system: 'mommy-witness-dispatcher',
      p_action_summary: `Sealed envelope dispatched to ${witness.witness_name ?? 'witness'} via ${env.auto_send_method}`,
      p_voice_excerpt: 'Mama set the date. You signed. It happened on its own.',
      p_action_payload: {
        envelope_id: env.id,
        method: env.auto_send_method,
        recipient_id: witness.id,
        recipient_label: witness.witness_name,
        notification_id: r.notification_id,
      },
    })

    await supabase.from('sealed_envelopes').update({
      auto_send_status: 'sent',
      sent_at: nowIso,
    }).eq('id', env.id)

    await logWitnessAction(supabase, env.user_id, env.id, witness.id, r.notification_id ?? null,
      'dispatched', witness.witness_name, { method: env.auto_send_method },
      true, null, (authLog as string | null) ?? null)
    dispatched += 1
  }

  return new Response(JSON.stringify({
    ok: true,
    examined: due?.length ?? 0,
    dispatched,
    fallback_archived: fallbackArchived,
    skipped_safeword: skippedSafeword,
    failed,
    errors,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
