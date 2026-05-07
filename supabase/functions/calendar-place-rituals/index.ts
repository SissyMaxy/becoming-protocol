// calendar-place-rituals — daily cron.
//
// For every user with an active Google Calendar connection AND
// events_enabled=true AND a dedicated calendar created:
//   1. Read the next 7 days of already-managed events for that user.
//   2. Plan morning_ritual + evening_reflection for any missing days.
//   3. Create each event on Google with the resolved external title (neutral
//      when the toggle is on) and persist to calendar_events_managed.
//
// Cron: daily 04:30 UTC (see migration 259), runs after calendar-sync.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import {
  denoServiceClient,
  getActiveCredentials,
  createEvent,
  resolveExternalTitle,
  resolveInternalTitle,
  type ManagedEventType,
  TokenExpiredError,
} from '../_shared/calendar.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const DAYS_AHEAD = 7

// ─── Pure planner (mirror of src/lib/calendar/place-rituals.ts) ──────────

interface PlannedEvent {
  event_type: ManagedEventType
  startsAtIso: string
  endsAtIso: string
}

function pad2(n: number): string { return String(n).padStart(2, '0') }

function tzOffsetMinutes(tz: string, atInstant: Date): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const parts = fmt.formatToParts(atInstant)
  const get = (t: string) => parts.find((p) => p.type === t)?.value || '0'
  const y = parseInt(get('year'), 10)
  const mo = parseInt(get('month'), 10)
  const d = parseInt(get('day'), 10)
  let h = parseInt(get('hour'), 10)
  if (h === 24) h = 0
  const mi = parseInt(get('minute'), 10)
  const s = parseInt(get('second'), 10)
  const asUtc = Date.UTC(y, mo - 1, d, h, mi, s)
  return Math.round((asUtc - atInstant.getTime()) / 60_000)
}

function setLocalTimeOnDate(baseIso: string, hh: number, mm: number, tz: string): string {
  const base = new Date(baseIso)
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
  })
  const localDate = fmt.format(base)
  const naive = `${localDate}T${pad2(hh)}:${pad2(mm)}:00`
  const offsetMin = tzOffsetMinutes(tz, new Date(`${naive}Z`))
  const naiveUtcMs = Date.parse(`${naive}Z`)
  return new Date(naiveUtcMs - offsetMin * 60_000).toISOString()
}

function parseHHMM(s: string): { hh: number; mm: number } {
  const [hStr, mStr] = (s || '').split(':')
  return { hh: parseInt(hStr, 10), mm: parseInt(mStr, 10) }
}

function planForUser(
  cred: {
    morning_ritual_local_time: string
    morning_ritual_duration_min: number
    evening_reflection_local_time: string
    evening_reflection_duration_min: number
  },
  existingByDayType: Set<string>,
  todayLocalStartIso: string,
  timeZone: string,
): PlannedEvent[] {
  const m = parseHHMM(cred.morning_ritual_local_time)
  const e = parseHHMM(cred.evening_reflection_local_time)
  const out: PlannedEvent[] = []

  for (let d = 0; d < DAYS_AHEAD; d++) {
    const dayBase = new Date(
      new Date(todayLocalStartIso).getTime() + d * 24 * 60 * 60_000,
    ).toISOString()

    const ms = setLocalTimeOnDate(dayBase, m.hh, m.mm, timeZone)
    const me = new Date(new Date(ms).getTime() + cred.morning_ritual_duration_min * 60_000).toISOString()
    if (!existingByDayType.has(`morning_ritual|${ms.slice(0, 10)}`)) {
      out.push({ event_type: 'morning_ritual', startsAtIso: ms, endsAtIso: me })
    }

    const es = setLocalTimeOnDate(dayBase, e.hh, e.mm, timeZone)
    const ee = new Date(new Date(es).getTime() + cred.evening_reflection_duration_min * 60_000).toISOString()
    if (!existingByDayType.has(`evening_reflection|${es.slice(0, 10)}`)) {
      out.push({ event_type: 'evening_reflection', startsAtIso: es, endsAtIso: ee })
    }
  }

  return out
}

// ─── Handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = denoServiceClient()
    const creds = await getActiveCredentials(supabase)

    const now = new Date()
    const todayLocalStartIso = now.toISOString().slice(0, 10) + 'T00:00:00.000Z'
    const horizon = new Date(now.getTime() + DAYS_AHEAD * 24 * 60 * 60 * 1000).toISOString()
    // Default tz when we don't have a per-user one. Future: store user's tz on
    // calendar_credentials and read it here.
    const defaultTz = 'UTC'

    let totalCreated = 0
    let totalSkipped = 0
    let userCount = 0

    for (const c of creds) {
      if (!c.events_enabled || !c.external_calendar_id) {
        totalSkipped++
        continue
      }

      const { data: existing } = await supabase
        .from('calendar_events_managed')
        .select('event_type, starts_at')
        .eq('user_id', c.user_id)
        .eq('provider', 'google')
        .gte('starts_at', now.toISOString())
        .lte('starts_at', horizon)
        .is('cancelled_at', null)

      const existingKeys = new Set<string>()
      for (const ev of existing || []) {
        existingKeys.add(`${ev.event_type}|${ev.starts_at.slice(0, 10)}`)
      }

      const planned = planForUser(c, existingKeys, todayLocalStartIso, defaultTz)
      userCount++

      for (const p of planned) {
        try {
          const externalTitle = resolveExternalTitle(p.event_type, c.neutral_calendar_titles)
          const internalTitle = resolveInternalTitle(p.event_type)

          const ev = await createEvent(c.accessToken, c.external_calendar_id, {
            summary: externalTitle,
            startIso: p.startsAtIso,
            endIso: p.endsAtIso,
          })

          const { error: insErr } = await supabase.from('calendar_events_managed').insert({
            user_id: c.user_id,
            provider: 'google',
            external_event_id: ev.id,
            title_external: externalTitle,
            title_internal: internalTitle,
            event_type: p.event_type,
            starts_at: p.startsAtIso,
            ends_at: p.endsAtIso,
          })
          if (insErr) {
            console.error('[calendar-place-rituals] db insert failed', c.user_id, insErr.message)
            continue
          }
          totalCreated++
        } catch (err) {
          if (err instanceof TokenExpiredError) {
            console.warn('[calendar-place-rituals] token expired', c.user_id)
          } else {
            console.error('[calendar-place-rituals] create failed', c.user_id, (err as Error).message)
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ ok: true, users: userCount, created: totalCreated, skipped: totalSkipped }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('[calendar-place-rituals]', (err as Error).message)
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
