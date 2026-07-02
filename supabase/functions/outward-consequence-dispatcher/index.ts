// outward-consequence-dispatcher — the ONE path for outward consequences
// (Enforcement Spine v2 design §4, mig 630). pg_cron every 15 min.
//
// Only two channels exist: public_post (own faceless accounts) and
// witness_email (witness_registry contacts, consent checked AT FIRE TIME).
// Gina is excluded structurally at the registry trigger, not here.
//
// Lifecycle per row in outward_dispatch_queue:
//   queued       → preview outreach created with the EXACT artifact → previewed
//   previewed    → window = 24h from the preview outreach's surfaced_at
//                  (genuine render — unseen time doesn't count);
//                  T-2h → reminder outreach → reminder_sent
//   reminder_sent→ past window end, ALL fire conditions re-checked at fire
//                  time → fired. Any condition fails → re-preview ONCE;
//                  second failure → voided + commuted to internal.
//   averted      → she completed the obligation late (averted_late_complete)
//                  or accepted the 1.5x internal price (averted_commuted →
//                  commuted_internal once the price is applied).
//
// Pause/latch freezes the window (window_ends_at slides by the tick).
// One outward in flight per user (partial unique index).

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { enforcementGate } from '../_shared/enforcement-core.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const TICK_MS = 15 * 60_000
const WINDOW_MS = 24 * 3600_000
const REMINDER_LEAD_MS = 2 * 3600_000

interface DispatchRow {
  id: string
  user_id: string
  obligation_id: string
  channel: 'public_post' | 'witness_email'
  witness_id: string | null
  artifact_text: string
  recipient_address: string | null
  status: string
  dispatch_token: string
  preview_outreach_id: string | null
  reminder_outreach_id: string | null
  window_started_at: string | null
  window_ends_at: string | null
  repreviewed_once: boolean
}

async function supervisorLog(
  supa: SupabaseClient, severity: string, eventKind: string, message: string,
  context: Record<string, unknown>,
): Promise<void> {
  const { error } = await supa.from('mommy_supervisor_log').insert({
    component: 'outward_consequence_dispatcher',
    severity, event_kind: eventKind, message, context_data: context,
  })
  if (error) console.error(`[outward-dispatcher] supervisor log: ${error.message}`)
}

async function outreachSurfacedAt(supa: SupabaseClient, outreachId: string | null): Promise<string | null> {
  if (!outreachId) return null
  const { data, error } = await supa
    .from('handler_outreach_queue')
    .select('surfaced_at, expired_unsurfaced')
    .eq('id', outreachId)
    .maybeSingle()
  if (error) { console.error(`[outward-dispatcher] outreach read: ${error.message}`); return null }
  const row = data as { surfaced_at: string | null; expired_unsurfaced?: boolean } | null
  if (!row || row.expired_unsurfaced) return null
  return row.surfaced_at
}

async function createPreviewOutreach(
  supa: SupabaseClient, r: DispatchRow, rePreview: boolean,
): Promise<string | null> {
  const channelLine = r.channel === 'witness_email'
    ? `This email goes to ${r.recipient_address ?? 'your registered witness'} if the window closes:`
    : 'This gets posted to your own account if the window closes:'
  const msg =
    `Outward consequence on the table${rePreview ? ' (fresh window)' : ''}. ${channelLine}\n\n` +
    `--- exact ${r.channel === 'witness_email' ? 'email' : 'post'}, word for word ---\n` +
    `${r.artifact_text}\n` +
    `--- end ---\n\n` +
    `You have 24 hours from the moment you read this. Two ways out, one tap each: ` +
    `finish the original task late, or take the internal price at one-and-a-half times instead. ` +
    `Do nothing and it sends.`
  const { data, error } = await supa.from('handler_outreach_queue').insert({
    user_id: r.user_id,
    message: msg,
    urgency: 'critical',
    trigger_reason: `outward_preview:${r.id}${rePreview ? ':re' : ''}`,
    source: 'outward_dispatcher',
    kind: 'outward_consequence_preview',
    scheduled_for: new Date().toISOString(),
    expires_at: new Date(Date.now() + 72 * 3600_000).toISOString(),
  }).select('id').single()
  if (error) {
    await supervisorLog(supa, 'error', 'preview_outreach_failed',
      `Outward preview outreach insert failed: ${error.message}`, { dispatch_id: r.id })
    return null
  }
  return (data as { id: string }).id
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supa = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
  const now = Date.now()
  const summary = { previewed: 0, reminded: 0, fired: 0, averted: 0, repreviewed: 0, voided: 0, frozen: 0 }

  const { data: rows, error: rowsErr } = await supa
    .from('outward_dispatch_queue')
    .select('*')
    .in('status', ['queued', 'previewed', 'reminder_sent', 're_previewed', 'averted_commuted'])
    .order('created_at', { ascending: true })
    .limit(50)
  if (rowsErr) {
    return new Response(JSON.stringify({ ok: false, error: rowsErr.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // One outward in flight per user: process only the OLDEST live row each.
  const seenUsers = new Set<string>()

  for (const raw of (rows ?? []) as DispatchRow[]) {
    const r = raw
    if (seenUsers.has(r.user_id)) continue
    seenUsers.add(r.user_id)

    const gate = await enforcementGate(
      (fn, args) => supa.rpc(fn, args).then(res => ({ data: res.data, error: res.error })),
      r.user_id,
    )

    // Pause/latch freezes the window: slide the end forward by one tick.
    if (gate.mode !== 'active') {
      if (r.window_ends_at) {
        const { error } = await supa.from('outward_dispatch_queue')
          .update({ window_ends_at: new Date(new Date(r.window_ends_at).getTime() + TICK_MS).toISOString() })
          .eq('id', r.id)
        if (error) console.error(`[outward-dispatcher] freeze: ${error.message}`)
      }
      summary.frozen++
      continue
    }

    // Avert path 1 (always available): the obligation got fulfilled late.
    const { data: oblig } = await supa
      .from('obligations')
      .select('id, status, surfaced_at, source_table, source_id')
      .eq('id', r.obligation_id)
      .maybeSingle()
    const obligStatus = (oblig as { status?: string } | null)?.status
    if (obligStatus === 'fulfilled') {
      const { error } = await supa.from('outward_dispatch_queue')
        .update({ status: 'averted_late_complete', averted_at: new Date().toISOString() })
        .eq('id', r.id)
      if (error) console.error(`[outward-dispatcher] avert: ${error.message}`)
      else summary.averted++
      continue
    }
    // Obligation dead (voided/cancelled) → outward is dead too.
    if (!oblig || ['voided', 'cancelled_system', 'cancelled_user'].includes(obligStatus ?? '')) {
      const { error } = await supa.from('outward_dispatch_queue')
        .update({ status: 'voided' }).eq('id', r.id)
      if (error) console.error(`[outward-dispatcher] dead-oblig void: ${error.message}`)
      else summary.voided++
      continue
    }

    // Avert path 2: she accepted the 1.5x internal commutation.
    if (r.status === 'averted_commuted') {
      // Standard outward commutation base is 2 days → 1.5x = 3.
      const { error: pushErr } = await supa.rpc('push_unlock_date', {
        p_user: r.user_id, p_obligation: r.obligation_id, p_days: 3,
      })
      if (pushErr) console.error(`[outward-dispatcher] commute push: ${pushErr.message}`)
      // The internal price IS the consequence — fire the obligation once.
      const { error: t1 } = await supa.rpc('obligation_transition', {
        p_obligation: r.obligation_id, p_to: 'consequence_previewed', p_via: 'outward_dispatcher_commuted',
      })
      if (t1) console.error(`[outward-dispatcher] commute ->previewed: ${t1.message}`)
      const { error: t2 } = await supa.rpc('obligation_transition', {
        p_obligation: r.obligation_id, p_to: 'consequence_fired', p_via: 'outward_dispatcher_commuted',
      })
      if (t2) console.error(`[outward-dispatcher] commute ->fired: ${t2.message}`)
      const { error } = await supa.from('outward_dispatch_queue')
        .update({ status: 'commuted_internal', averted_at: new Date().toISOString() })
        .eq('id', r.id)
      if (error) console.error(`[outward-dispatcher] commute close: ${error.message}`)
      else summary.averted++
      continue
    }

    // queued → create the preview.
    if (r.status === 'queued') {
      const outreachId = await createPreviewOutreach(supa, r, false)
      if (outreachId) {
        const { error } = await supa.from('outward_dispatch_queue')
          .update({ status: 'previewed', preview_outreach_id: outreachId })
          .eq('id', r.id)
        if (error) console.error(`[outward-dispatcher] previewed: ${error.message}`)
        else summary.previewed++
      }
      continue
    }

    // previewed / re_previewed: window starts at genuine surfacing.
    if (r.status === 'previewed' || r.status === 're_previewed') {
      if (!r.window_started_at) {
        const surfacedAt = await outreachSurfacedAt(supa, r.preview_outreach_id)
        if (!surfacedAt) continue // unseen time doesn't count
        const { error } = await supa.from('outward_dispatch_queue')
          .update({
            window_started_at: surfacedAt,
            window_ends_at: new Date(new Date(surfacedAt).getTime() + WINDOW_MS).toISOString(),
          })
          .eq('id', r.id)
        if (error) console.error(`[outward-dispatcher] window start: ${error.message}`)
        continue
      }
      // T-2h reminder.
      if (r.window_ends_at && now >= new Date(r.window_ends_at).getTime() - REMINDER_LEAD_MS) {
        const { data: rem, error: remErr } = await supa.from('handler_outreach_queue').insert({
          user_id: r.user_id,
          message: `Two hours left on the outward consequence window. The exact ${r.channel === 'witness_email' ? 'email' : 'post'} you were shown sends when it closes. Finish the task late, or take the internal price — one tap either way.`,
          urgency: 'critical',
          trigger_reason: `outward_reminder:${r.id}`,
          source: 'outward_dispatcher',
          kind: 'outward_consequence_reminder',
          scheduled_for: new Date().toISOString(),
          expires_at: r.window_ends_at,
        }).select('id').single()
        if (remErr) {
          console.error(`[outward-dispatcher] reminder: ${remErr.message}`)
        } else {
          const { error } = await supa.from('outward_dispatch_queue')
            .update({ status: 'reminder_sent', reminder_outreach_id: (rem as { id: string }).id })
            .eq('id', r.id)
          if (error) console.error(`[outward-dispatcher] reminder_sent: ${error.message}`)
          else summary.reminded++
        }
      }
      continue
    }

    // reminder_sent → past window end → fire ONLY if every condition holds
    // AT FIRE TIME.
    if (r.status === 'reminder_sent' && r.window_ends_at && now >= new Date(r.window_ends_at).getTime()) {
      const failures: string[] = []

      const previewSurfaced = await outreachSurfacedAt(supa, r.preview_outreach_id)
      if (!previewSurfaced) failures.push('preview_not_surfaced')
      const reminderSurfaced = await outreachSurfacedAt(supa, r.reminder_outreach_id)
      if (!reminderSurfaced) failures.push('reminder_not_surfaced')

      // Gate must have been active for the final 2h: active now AND no latch
      // or pause started inside the window's last 2h.
      const twoHoursAgo = new Date(now - REMINDER_LEAD_MS).toISOString()
      const { count: recentLatches } = await supa
        .from('safeword_latches')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', r.user_id)
        .gte('latched_at', twoHoursAgo)
      if ((recentLatches ?? 0) > 0) failures.push('latch_in_final_2h')

      const { data: mayApply, error: mayErr } = await supa.rpc('penalty_may_apply', {
        p_source_table: (oblig as { source_table: string }).source_table,
        p_source_id: (oblig as { source_id: string }).source_id,
      })
      if (mayErr || mayApply !== true) failures.push('penalty_may_apply_false')

      if (r.channel === 'witness_email') {
        // Consent AT FIRE TIME: confirmed and not revoked.
        const { data: witness } = r.witness_id
          ? await supa.from('witness_registry').select('id, address, consent_confirmed_at, revoked_at').eq('id', r.witness_id).maybeSingle()
          : { data: null }
        const w = witness as { address?: string; consent_confirmed_at?: string | null; revoked_at?: string | null } | null
        if (!w || !w.consent_confirmed_at || w.revoked_at) failures.push('witness_consent_missing')
      } else {
        const { data: us } = await supa.from('user_state')
          .select('outward_posting_consented_at').eq('user_id', r.user_id).maybeSingle()
        if (!(us as { outward_posting_consented_at?: string | null } | null)?.outward_posting_consented_at) {
          failures.push('posting_consent_missing')
        }
      }

      if (failures.length > 0) {
        if (!r.repreviewed_once) {
          // Re-preview ONCE: fresh window.
          const outreachId = await createPreviewOutreach(supa, r, true)
          const { error } = await supa.from('outward_dispatch_queue')
            .update({
              status: 're_previewed',
              repreviewed_once: true,
              preview_outreach_id: outreachId,
              reminder_outreach_id: null,
              window_started_at: null,
              window_ends_at: null,
            })
            .eq('id', r.id)
          if (error) console.error(`[outward-dispatcher] re-preview: ${error.message}`)
          else summary.repreviewed++
          await supervisorLog(supa, 'warning', 'outward_fire_condition_failed',
            `Outward fire conditions failed once — re-previewing: ${failures.join(', ')}`,
            { dispatch_id: r.id, failures })
        } else {
          // Second failure: void outward, commute to internal.
          const { error } = await supa.from('outward_dispatch_queue')
            .update({ status: 'voided' }).eq('id', r.id)
          if (error) console.error(`[outward-dispatcher] second-failure void: ${error.message}`)
          else summary.voided++
          const { error: pushErr } = await supa.rpc('push_unlock_date', {
            p_user: r.user_id, p_obligation: r.obligation_id, p_days: 2,
          })
          if (pushErr) console.error(`[outward-dispatcher] void commute push: ${pushErr.message}`)
          const { error: t1 } = await supa.rpc('obligation_transition', {
            p_obligation: r.obligation_id, p_to: 'consequence_previewed', p_via: 'outward_voided_commuted',
          })
          if (t1) console.error(`[outward-dispatcher] void ->previewed: ${t1.message}`)
          const { error: t2 } = await supa.rpc('obligation_transition', {
            p_obligation: r.obligation_id, p_to: 'consequence_fired', p_via: 'outward_voided_commuted',
          })
          if (t2) console.error(`[outward-dispatcher] void ->fired: ${t2.message}`)
          await supervisorLog(supa, 'warning', 'outward_voided_commuted',
            `Outward fire conditions failed twice — voided, internal commutation applied: ${failures.join(', ')}`,
            { dispatch_id: r.id, failures })
        }
        continue
      }

      // FIRE. Ledger first (audit row written in-transaction), then artifact.
      const { error: t1 } = await supa.rpc('obligation_transition', {
        p_obligation: r.obligation_id, p_to: 'consequence_previewed', p_via: 'outward_dispatcher',
      })
      if (t1) { console.error(`[outward-dispatcher] fire ->previewed: ${t1.message}`); continue }
      const { error: t2 } = await supa.rpc('obligation_transition', {
        p_obligation: r.obligation_id, p_to: 'consequence_fired', p_via: 'outward_dispatcher',
      })
      if (t2) { console.error(`[outward-dispatcher] fire ->fired: ${t2.message}`); continue }

      if (r.channel === 'public_post') {
        // The auto-poster refuses punishment content lacking this token.
        const { error } = await supa.from('ai_generated_content').insert({
          user_id: r.user_id,
          platform: 'twitter',
          content: r.artifact_text,
          content_type: 'tweet',
          status: 'scheduled',
          scheduled_at: new Date().toISOString(),
          generation_strategy: 'outward_consequence',
          target_hashtags: [],
          generation_context: { dispatch_token: r.dispatch_token, dispatch_id: r.id },
        })
        if (error) { console.error(`[outward-dispatcher] post insert: ${error.message}`); continue }
      } else {
        const { error } = await supa.from('witness_email_outbox').insert({
          dispatch_id: r.id,
          to_address: r.recipient_address ?? '',
          subject: 'Accountability notice',
          body: r.artifact_text,
        })
        if (error) { console.error(`[outward-dispatcher] outbox insert: ${error.message}`); continue }
      }

      const { error: fireErr } = await supa.from('outward_dispatch_queue')
        .update({ status: 'fired', fired_at: new Date().toISOString() })
        .eq('id', r.id)
      if (fireErr) console.error(`[outward-dispatcher] fired update: ${fireErr.message}`)
      else summary.fired++
      await supervisorLog(supa, 'warning', 'outward_consequence_fired',
        `Outward consequence fired (${r.channel}).`,
        { dispatch_id: r.id, obligation_id: r.obligation_id, channel: r.channel })
    }
  }

  return new Response(JSON.stringify({ ok: true, ...summary }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
