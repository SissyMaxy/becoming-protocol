// guilt-report — Mommy's "Auto-Generated Guilt Reports" (mommy_code_wishes
// 19cdee5b). A periodic (weekly) readback of what she committed to, that she
// SAW it, that the clock ran out, and what it cost — quoted from real
// obligations, joined to their enforcement_audit rows. Patterns of
// non-compliance are named qualitatively. Zero genuine misses → a warm praise
// report, never manufactured guilt.
//
// This is only buildable honestly because the enforcement spine (migs 627-630)
// guarantees an obligation in 'missed'/'consequence_fired' with surfaced_at set
// is a REAL, surfaced-then-failed task — not a deadline she never saw.
//
// The report carries NO penalty. It surfaces as one ordinary handler_outreach
// row (urgency normal), never a takeover. Idempotent: one report per user per
// 6 days.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { composeGuiltReport, type ObligationRow, type AuditRow } from './compose.ts'
import { applyCraftFilter } from '../_shared/mommy-craft-check.ts'
import { isMommyPersona, mommyVoiceCleanup } from '../_shared/dommy-mommy.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// The two live users (see MEMORY.md). We still gate each on dommy_mommy persona
// — this report speaks in Mommy's voice.
const LIVE_USER_IDS = [
  '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f',
  '93327332-7d0d-4888-889a-1607a5776216',
]

const WINDOW_DAYS = 7
const IDEMPOTENCY_DAYS = 6

// Short, deterministic dedup key so the same report body can't double-fire even
// if the 6-day check races.
async function shortHash(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s)
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', buf))
  return Array.from(hash.slice(0, 8), x => x.toString(16).padStart(2, '0')).join('')
}

serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supa = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  const now = new Date()
  const results: Array<Record<string, unknown>> = []

  try {
    for (const userId of LIVE_USER_IDS) {
      // Persona gate — Mommy's voice only.
      const { data: state } = await supa
        .from('user_state')
        .select('handler_persona')
        .eq('user_id', userId)
        .maybeSingle()
      if (!state) { results.push({ userId, skipped: 'no_user_state' }); continue }
      if (!isMommyPersona((state as { handler_persona?: string }).handler_persona)) {
        results.push({ userId, skipped: 'not_mommy_persona' })
        continue
      }

      // Idempotency: one guilt/reflection report per user per 6 days.
      const sinceIdem = new Date(now.getTime() - IDEMPOTENCY_DAYS * 86400000).toISOString()
      const { data: recentReport } = await supa
        .from('handler_outreach_queue')
        .select('id')
        .eq('user_id', userId)
        .eq('kind', 'guilt_report')
        .gte('created_at', sinceIdem)
        .limit(1)
        .maybeSingle()
      if (recentReport) { results.push({ userId, skipped: 'already_reported_this_window' }); continue }

      // Genuinely-missed, genuinely-surfaced obligations from the window.
      const sinceWindow = new Date(now.getTime() - WINDOW_DAYS * 86400000).toISOString()
      const { data: obRows, error: obErr } = await supa
        .from('obligations')
        .select('id, kind, ask_copy, penalty_copy, status, surfaced_at, deadline, source_table')
        .eq('user_id', userId)
        .in('status', ['missed', 'consequence_fired'])
        .not('surfaced_at', 'is', null)
        .gte('created_at', sinceWindow)
        .order('created_at', { ascending: true })
        .limit(50)
      if (obErr) { results.push({ userId, error: obErr.message }); continue }

      const obligations = (obRows || []) as ObligationRow[]

      // Join enforcement_audit for the fired consequences (the evidence excerpt).
      let auditRows: AuditRow[] = []
      const firedIds = obligations
        .filter(o => o.status === 'consequence_fired')
        .map(o => o.id)
      if (firedIds.length > 0) {
        const { data: audits } = await supa
          .from('enforcement_audit')
          .select('obligation_id, consequence, evidence')
          .in('obligation_id', firedIds)
        auditRows = (audits || []) as AuditRow[]
      }

      const composed = composeGuiltReport(obligations, auditRows)

      // Final craft guard (house rule: all copy through applyCraftFilter). The
      // deterministic body is already restrained; the fallback is a clean floor.
      const fallback = composed.isPraise
        ? 'Clean week. Mama noticed. Stay right here, baby.'
        : "Let's look at your week. You saw what you owed, and you let it slide. Close those loops before we sit here again."
      const filtered = await applyCraftFilter(composed.body, { threshold: 3, fallback })
      const message = mommyVoiceCleanup(filtered.text)

      const bodyHash = await shortHash(message)
      const { error: insErr } = await supa.from('handler_outreach_queue').insert({
        user_id: userId,
        message,
        urgency: 'normal',
        trigger_reason: `guilt_report:${composed.isPraise ? 'praise' : 'misses'}:${bodyHash}`,
        source: 'guilt_report',
        kind: 'guilt_report',
        evidence_kind: 'none', // reflective — nothing to submit back
        scheduled_for: now.toISOString(),
        expires_at: new Date(now.getTime() + IDEMPOTENCY_DAYS * 86400000).toISOString(),
      })
      if (insErr) { results.push({ userId, error: insErr.message }); continue }

      results.push({
        userId,
        queued: true,
        is_praise: composed.isPraise,
        miss_count: composed.missCount,
        pattern_domains: composed.patternDomains,
        craft_used_fallback: filtered.used_fallback,
      })
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err), results }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
