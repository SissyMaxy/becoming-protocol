// meet-safety-dispatch — drains meet_escalation_dispatch and actually sends
// the stage-3 / false-alarm messages to the trusted contact.
//
// Channels:
//   sms   — Twilio (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM)
//   email — Resend (RESEND_API_KEY), same path witness-notify-send uses
//
// FAIL-CLOSED RULES (design §1.5): a missing provider env is a FAILURE, never
// a silent skip — the row is marked failed with the reason and a CRITICAL
// mommy_supervisor_log row is written. Transient failures retry with backoff
// while attempts < 5; permanent failure keeps stage-1 push pressure on the
// user's own phone (next_escalation_at reset) and alerts the supervisor.
//
// VOICE EXEMPTION: the contact-facing strings are plain English by design
// (see _shared/meet-safety-core.ts) — a stranger must read them cold. Do NOT
// route them through mommyVoiceCleanup.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  renderStage3Message,
  renderFalseAlarmMessage,
} from '../_shared/meet-safety-core.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MAX_ATTEMPTS = 5

interface DispatchRow {
  id: string
  user_id: string
  checkin_id: string | null
  contact_id: string
  kind: 'escalation' | 'false_alarm'
  channel: 'sms' | 'email'
  payload: Record<string, unknown>
  status: string
  attempts: number
}

function backoffMinutes(attempts: number): number {
  // 2, 4, 8, 16 minutes
  return Math.min(2 ** attempts, 16)
}

async function supervisorCritical(s: ReturnType<typeof createClient>, eventKind: string, message: string, ctx: Record<string, unknown>) {
  const { error } = await s.from('mommy_supervisor_log').insert({
    component: 'meet_safety_dispatch',
    severity: 'error',
    event_kind: eventKind,
    message,
    context_data: { ...ctx, critical: true },
  })
  if (error) console.error('[meet-safety-dispatch] supervisor log insert failed:', error.message)
}

async function sendSms(to: string, body: string): Promise<{ ok: boolean; error?: string; permanent?: boolean }> {
  const sid = Deno.env.get('TWILIO_ACCOUNT_SID')
  const token = Deno.env.get('TWILIO_AUTH_TOKEN')
  const from = Deno.env.get('TWILIO_FROM')
  if (!sid || !token || !from) {
    return { ok: false, error: 'no_twilio_env', permanent: true }
  }
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + btoa(`${sid}:${token}`),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: to, From: from, Body: body }),
  })
  if (!res.ok) {
    const errBody = await res.text()
    return { ok: false, error: `twilio ${res.status}: ${errBody.slice(0, 300)}` }
  }
  return { ok: true }
}

async function sendEmail(to: string, subject: string, body: string): Promise<{ ok: boolean; error?: string; permanent?: boolean }> {
  const resendKey = Deno.env.get('RESEND_API_KEY')
  if (!resendKey) {
    // NEVER the witness-notify-send stub behaviour (mark sent without a key):
    // a safety message that wasn't sent is a failure.
    return { ok: false, error: 'no_resend_env', permanent: true }
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Safety Check-In <noreply@becoming.app>',
      to,
      subject,
      text: body,
    }),
  })
  if (!res.ok) {
    const errBody = await res.text()
    return { ok: false, error: `resend ${res.status}: ${errBody.slice(0, 300)}` }
  }
  return { ok: true }
}

function renderMessage(row: DispatchRow): { subject: string; body: string } {
  const p = row.payload
  const contactName = String(p.contact_name ?? 'there')
  const userName = (p.user_name as string | null) ?? null
  if (row.kind === 'false_alarm') {
    return {
      subject: 'Safety check-in: false alarm — they are safe',
      body: renderFalseAlarmMessage({ contactName, userName }),
    }
  }
  return {
    subject: 'Safety alert: your friend may need you to check on them',
    body: renderStage3Message({
      contactName,
      userName,
      venueName: String(p.venue_name ?? 'an unknown venue'),
      venueAddress: String(p.venue_address ?? 'address not recorded'),
      meetAtIso: String(p.meet_at ?? ''),
      dateLabel: String(p.date_label ?? 'someone they met online'),
      lastCheckinIso: (p.last_checkin_at as string | null) ?? null,
      checkinKind: (p.checkin_kind as string | null) ?? null,
      userAskedForHelp: p.user_asked_for_help === true,
    }),
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const s = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  const { data: rows, error: qErr } = await s
    .from('meet_escalation_dispatch')
    .select('id, user_id, checkin_id, contact_id, kind, channel, payload, status, attempts')
    .eq('status', 'pending')
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${new Date().toISOString()}`)
    .order('created_at', { ascending: true })
    .limit(20)
  if (qErr) {
    await supervisorCritical(s, 'queue_read_failed', `meet_escalation_dispatch read failed: ${qErr.message}`, {})
    return new Response(JSON.stringify({ ok: false, error: qErr.message }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
  }

  let sent = 0
  let failed = 0
  let retried = 0

  for (const row of (rows ?? []) as DispatchRow[]) {
    const to = String(row.payload?.channel_value ?? '')
    const { subject, body } = renderMessage(row)
    let result: { ok: boolean; error?: string; permanent?: boolean }
    if (!to) {
      result = { ok: false, error: 'no_channel_value_in_payload', permanent: true }
    } else if (row.channel === 'sms') {
      result = await sendSms(to, body)
    } else {
      result = await sendEmail(to, subject, body)
    }

    if (result.ok) {
      const { error: upErr } = await s
        .from('meet_escalation_dispatch')
        .update({ status: 'sent', sent_at: new Date().toISOString(), attempts: row.attempts + 1, last_error: null })
        .eq('id', row.id)
      if (upErr) {
        // The message went OUT but we couldn't record it — loud, never silent.
        await supervisorCritical(s, 'sent_but_unrecorded', `dispatch ${row.id} sent but status update failed: ${upErr.message}`, { dispatch_id: row.id })
      }
      sent++
      continue
    }

    const attempts = row.attempts + 1
    const exhausted = result.permanent === true || attempts >= MAX_ATTEMPTS
    const { error: failErr } = await s
      .from('meet_escalation_dispatch')
      .update({
        status: exhausted ? 'failed' : 'pending',
        attempts,
        last_error: (result.error ?? 'unknown').slice(0, 500),
        next_attempt_at: exhausted ? null : new Date(Date.now() + backoffMinutes(attempts) * 60_000).toISOString(),
      })
      .eq('id', row.id)
    if (failErr) {
      await supervisorCritical(s, 'failure_unrecorded', `dispatch ${row.id} failed AND status update failed: ${failErr.message}`, { dispatch_id: row.id, send_error: result.error })
    }

    if (exhausted) {
      failed++
      await supervisorCritical(s, 'dispatch_failed_permanently',
        `Safety ${row.kind} to contact could not be sent after ${attempts} attempt(s): ${result.error}`,
        { dispatch_id: row.id, checkin_id: row.checkin_id, channel: row.channel, reason: result.error })

      if (row.kind === 'escalation' && row.checkin_id) {
        // Keep stage-1 push pressure ON: the watcher re-fires as long as the
        // check-in is unacked and next_escalation_at is due.
        const { error: pressErr } = await s
          .from('meet_checkins')
          .update({ next_escalation_at: new Date().toISOString() })
          .eq('id', row.checkin_id)
          .is('responded_at', null)
        if (pressErr) {
          await supervisorCritical(s, 'pressure_flag_failed', `could not reset pressure on checkin ${row.checkin_id}: ${pressErr.message}`, { checkin_id: row.checkin_id })
        }
        // Tell her plainly to make the call herself — plain English, this is
        // the net failing, not persona time.
        const { error: outErr } = await s.from('handler_outreach_queue').insert({
          user_id: row.user_id,
          message: `The safety message to ${String(row.payload?.contact_name ?? 'your safety person')} could not be sent. Call them yourself right now, or call someone who can check on you.`,
          urgency: 'critical',
          trigger_reason: `meet_dispatch_failed:${row.id}`,
          source: 'meet_safety',
          kind: 'meet_safety_alert',
          scheduled_for: new Date().toISOString(),
          expires_at: new Date(Date.now() + 60 * 60_000).toISOString(),
        })
        if (outErr) {
          await supervisorCritical(s, 'failure_outreach_failed', `could not queue failure outreach: ${outErr.message}`, { dispatch_id: row.id })
        }
      }
    } else {
      retried++
    }
  }

  return new Response(JSON.stringify({ ok: true, sent, failed, retried, scanned: (rows ?? []).length }), {
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
})
