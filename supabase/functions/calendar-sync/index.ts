// calendar-sync — daily cron.
//
// For every user with an active Google Calendar connection:
//   1. Refresh access token if needed (handled inside getActiveCredentials).
//   2. Query freeBusy for the next 7 days against their primary calendar.
//   3. Upsert busy windows into freebusy_cache (purging stale rows for the user
//      first to keep the cache simple).
//
// Cron: daily 04:15 UTC (see migration 259).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import {
  denoServiceClient,
  getActiveCredentials,
  queryFreeBusy,
  TokenExpiredError,
} from '../_shared/calendar.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = denoServiceClient()
    const creds = await getActiveCredentials(supabase)

    const now = new Date()
    const horizon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

    let users = 0
    let windowsWritten = 0
    let errors = 0

    for (const c of creds) {
      try {
        const busy = await queryFreeBusy(c.accessToken, {
          timeMinIso: now.toISOString(),
          timeMaxIso: horizon.toISOString(),
        })

        // Wipe-and-replace this user's cache; cheap and avoids dedup logic.
        await supabase.from('freebusy_cache').delete().eq('user_id', c.user_id)

        if (busy.length > 0) {
          const rows = busy.map((b) => ({
            user_id: c.user_id,
            window_start: b.start,
            window_end: b.end,
            fetched_at: now.toISOString(),
          }))
          const { error } = await supabase.from('freebusy_cache').insert(rows)
          if (error) {
            console.error('[calendar-sync] insert error', c.user_id, error.message)
            errors++
            continue
          }
          windowsWritten += rows.length
        }
        users++
      } catch (err) {
        if (err instanceof TokenExpiredError) {
          console.warn('[calendar-sync] token expired (skipping)', c.user_id)
        } else {
          console.error('[calendar-sync] freebusy error', c.user_id, (err as Error).message)
        }
        errors++
      }
    }

    return new Response(
      JSON.stringify({ ok: true, users, windowsWritten, errors }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('[calendar-sync]', (err as Error).message)
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
