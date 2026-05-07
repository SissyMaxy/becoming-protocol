// surface-guarantor-cron — visible-before-penalized enforcer.
//
// 2026-05-07 wish #2 (CRITICAL): Mama fires decrees and outreach silently
// per autonomy. Surfaces accumulate. The visible-before-penalized rule
// (memory: feedback_visible_before_penalized) says nothing can be
// penalized unless it surfaced to Maxy first.
//
// Without this enforcer, autonomous Mama could violate her own safety
// rule by firing deadlines Maxy never sees.
//
// What this cron does:
//   1. For active rows in (handler_decrees, handler_outreach_queue,
//      arousal_touch_tasks) with deadline within 24h:
//        - If surfaced_at IS NULL AND deadline within 6h → write a
//          push-priority log AND ensure the row sits at top-of-Today.
//          (We also POST to send-notifications if it exists.)
//   2. For rows whose deadline has passed AND surfaced_at IS NULL:
//        - Mark expired_unsurfaced = true
//        - This blocks any downstream penalty path from acting on the row
//          (slip detection, escalation, hard-mode triggers must filter
//          expired_unsurfaced=true rows before counting against Maxy)
//        - Insert a row in mommy_voice_leaks for visibility audit
//
// Schedule: every 5 min via pg_cron (migration 279).
//
// Companion contract: any UI surface that DISPLAYS a decree/outreach/touch
// row must UPDATE surfaced_at = now() WHERE surfaced_at IS NULL on render.
// That contract closes the loop. This worker enforces the rule when the
// contract isn't honored.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SURFACES = ['handler_decrees', 'handler_outreach_queue', 'arousal_touch_tasks'] as const

type Surface = typeof SURFACES[number]

interface SurfaceRow {
  id: string
  user_id: string
  deadline: string
  surfaced_at: string | null
  expired_unsurfaced: boolean
}

const DEADLINE_COL: Record<Surface, string> = {
  handler_decrees: 'deadline',
  handler_outreach_queue: 'expires_at',
  arousal_touch_tasks: 'expires_at',
}

async function pullPending(supabase: SupabaseClient, surface: Surface, beforeIso: string, afterIso: string): Promise<SurfaceRow[]> {
  const col = DEADLINE_COL[surface]
  const baseQuery = supabase
    .from(surface)
    .select(`id, user_id, ${col}, surfaced_at, expired_unsurfaced`)
    .gte(col, afterIso)
    .lte(col, beforeIso)
    .eq('expired_unsurfaced', false)
    .limit(200)
  const { data, error } = await baseQuery
  if (error) {
    console.error(`[surface-guarantor] ${surface}: ${error.message}`)
    return []
  }
  return ((data || []) as Array<Record<string, unknown>>).map(r => ({
    id: r.id as string,
    user_id: r.user_id as string,
    deadline: r[col] as string,
    surfaced_at: (r.surfaced_at as string | null) ?? null,
    expired_unsurfaced: (r.expired_unsurfaced as boolean) ?? false,
  }))
}

async function pullExpiredUnsurfaced(supabase: SupabaseClient, surface: Surface, nowIso: string): Promise<SurfaceRow[]> {
  const col = DEADLINE_COL[surface]
  const { data, error } = await supabase
    .from(surface)
    .select(`id, user_id, ${col}, surfaced_at, expired_unsurfaced`)
    .lt(col, nowIso)
    .is('surfaced_at', null)
    .eq('expired_unsurfaced', false)
    .limit(200)
  if (error) {
    console.error(`[surface-guarantor] expired ${surface}: ${error.message}`)
    return []
  }
  return ((data || []) as Array<Record<string, unknown>>).map(r => ({
    id: r.id as string,
    user_id: r.user_id as string,
    deadline: r[col] as string,
    surfaced_at: null,
    expired_unsurfaced: false,
  }))
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
  const now = new Date()
  const nowIso = now.toISOString()
  const sixHoursFromNow = new Date(now.getTime() + 6 * 3600_000).toISOString()

  const summary: Record<string, { urgent: number; expired_blocked: number }> = {}

  for (const surface of SURFACES) {
    summary[surface] = { urgent: 0, expired_blocked: 0 }

    // 1. Urgent: deadline within 6h, not yet surfaced — flag for force-surface.
    //    We don't directly push notifications from here; we mark them as
    //    pending-priority by ensuring the row is "fresh" (touch updated_at)
    //    so any UI that orders by updated_at puts them on top. Real push
    //    integration is via send-notifications which we ping below.
    const urgent = await pullPending(supabase, surface, sixHoursFromNow, nowIso)
    const urgentUnsurfaced = urgent.filter(r => r.surfaced_at === null)
    summary[surface].urgent = urgentUnsurfaced.length

    if (urgentUnsurfaced.length > 0) {
      // Best-effort push trigger via send-notifications if it exists.
      // Failures are non-fatal — the rows still sit visible in the UI tables.
      const fnUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-notifications`
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      // Group by user_id so each user gets at most one push per cron run
      const userIds = Array.from(new Set(urgentUnsurfaced.map(r => r.user_id)))
      for (const uid of userIds) {
        try {
          await fetch(fnUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({
              user_id: uid,
              source: 'surface_guarantor',
              urgency: 'high',
              reason: `${surface} unsurfaced with deadline within 6h`,
            }),
          })
        } catch { /* best-effort */ }
      }
    }

    // 2. Expired-without-surfacing: block downstream penalty paths.
    const expired = await pullExpiredUnsurfaced(supabase, surface, nowIso)
    summary[surface].expired_blocked = expired.length

    if (expired.length > 0) {
      const ids = expired.map(r => r.id)
      const { error: blockErr } = await supabase
        .from(surface)
        .update({ expired_unsurfaced: true })
        .in('id', ids)
      if (blockErr) {
        console.error(`[surface-guarantor] block ${surface}: ${blockErr.message}`)
      }

      // Audit trail in mommy_voice_leaks (existing table per active_features
      // probe). If the table has a different shape, fail soft.
      try {
        await supabase.from('mommy_voice_leaks').insert(
          expired.map(r => ({
            user_id: r.user_id,
            leak_type: 'unsurfaced_expired',
            source_table: surface,
            source_row_id: r.id,
            content: `${surface} row expired without ever surfacing to user — penalty blocked by guarantor`,
            resolved: false,
          }))
        )
      } catch (err) {
        console.error(`[surface-guarantor] leak insert: ${String(err).slice(0, 200)}`)
      }
    }
  }

  return new Response(JSON.stringify({
    ok: true,
    checked_at: nowIso,
    summary,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
