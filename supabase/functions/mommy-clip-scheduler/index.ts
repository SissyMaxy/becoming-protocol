// mommy-clip-scheduler — drops 0..3 ambient Mommy-voice clips per 30 min
// window per dommy_mommy user who opted into ambient playback.
//
// Cron every 30 min during waking hours (registered in migration 380).
//
// Per-user pipeline:
//   1. Persona + opt-in gate.
//   2. Daily cap check (default 12, user override via ambient_clips_daily_cap).
//   3. Poisson draw for this window (0..3).
//   4. For each draw, pick a clip from mommy_random_clips with rendered
//      audio, intensity within compliance ceiling, theme not saturated.
//   5. Insert mommy_random_clip_plays row with delivery_status='queued'.
//      Frontend polls the queue and plays when headphones connect.
//   6. Bump mommy_random_clips.play_count + last_played_at.
//   7. Authority log row.
//
// Sweep mode iterates all dommy_mommy users with ambient_clips_opt_in=true.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  pickRandomClip, drawClipsForWindow,
  type ClipTheme,
} from '../_shared/random-clips.ts'
import {
  effectiveBand, bandMantraCeiling,
  type DifficultyBand,
} from '../_shared/difficulty-band.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const HANDLER_USER_ID = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'
const DEFAULT_DAILY_TARGET = 12
const HARD_DAILY_CAP = 30
const WINDOW_MINUTES = 30

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

interface RunResult {
  user_id: string
  ok: boolean
  dropped: number
  reason?: string
  clips?: Array<{ id: string; slug: string; theme: string }>
}

async function runForUser(supabase: SupabaseClient, userId: string): Promise<RunResult> {
  const { data: usRaw } = await supabase.from('user_state')
    .select('handler_persona, ambient_clips_opt_in, ambient_clips_daily_cap')
    .eq('user_id', userId)
    .maybeSingle()
  const us = usRaw as {
    handler_persona?: string
    ambient_clips_opt_in?: boolean
    ambient_clips_daily_cap?: number | null
  } | null

  if (us?.handler_persona !== 'dommy_mommy') {
    return { user_id: userId, ok: false, dropped: 0, reason: 'persona_not_dommy_mommy' }
  }
  if (us?.ambient_clips_opt_in === false) {
    return { user_id: userId, ok: false, dropped: 0, reason: 'opted_out' }
  }

  // Daily cap check — count today's plays already queued + played.
  const startOfDay = new Date(); startOfDay.setUTCHours(0, 0, 0, 0)
  const { count: todayCount } = await supabase
    .from('mommy_random_clip_plays')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('played_at', startOfDay.toISOString())
  const dailyCap = Math.min(HARD_DAILY_CAP, us?.ambient_clips_daily_cap ?? DEFAULT_DAILY_TARGET)
  const remainingToday = dailyCap - (todayCount ?? 0)
  if (remainingToday <= 0) {
    return { user_id: userId, ok: true, dropped: 0, reason: 'daily_cap_reached' }
  }

  // Intensity ceiling
  const { data: diff } = await supabase
    .from('compliance_difficulty_state')
    .select('current_difficulty_band, override_band')
    .eq('user_id', userId)
    .maybeSingle()
  const band = effectiveBand(diff as { current_difficulty_band: DifficultyBand; override_band: DifficultyBand | null } | null)
  const ceiling = bandMantraCeiling(band)

  // Draw count for this window
  const hour = new Date().getUTCHours()
  const drawCount = Math.min(
    remainingToday,
    drawClipsForWindow({ dailyTarget: dailyCap, windowMinutes: WINDOW_MINUTES, hourOfDay: hour }),
  )
  if (drawCount === 0) {
    return { user_id: userId, ok: true, dropped: 0, reason: 'poisson_zero' }
  }

  // Recent plays for dedup pressure + theme saturation
  const dayAgo = new Date(Date.now() - 24 * 3600_000).toISOString()
  const { data: recentPlays } = await supabase
    .from('mommy_random_clip_plays')
    .select('played_at, clip_id, mommy_random_clips!inner(theme)')
    .eq('user_id', userId)
    .gte('played_at', dayAgo)
    .order('played_at', { ascending: false })
    .limit(50)

  const themeCounts: Partial<Record<ClipTheme, number>> = {}
  const recentPlayTimes: string[] = []
  for (const row of (recentPlays || []) as Array<{
    played_at: string
    mommy_random_clips: { theme?: ClipTheme } | { theme?: ClipTheme }[] | null
  }>) {
    recentPlayTimes.push(row.played_at)
    const rel = row.mommy_random_clips
    const theme = Array.isArray(rel) ? rel[0]?.theme : rel?.theme
    if (theme) themeCounts[theme] = (themeCounts[theme] ?? 0) + 1
  }

  // Catalog
  const { data: catalog } = await supabase
    .from('mommy_random_clips')
    .select('id, slug, text, intensity_band, theme, audio_url, last_played_at, play_count, active')
    .eq('active', true)
  const rows = (catalog || []) as Array<{
    id: string; slug: string; text: string; intensity_band: 'gentle' | 'firm' | 'cruel'
    theme: ClipTheme; audio_url: string | null; last_played_at: string | null; play_count: number
  }>
  if (rows.length === 0) {
    return { user_id: userId, ok: true, dropped: 0, reason: 'empty_catalog' }
  }

  const dropped: Array<{ id: string; slug: string; theme: string }> = []
  for (let i = 0; i < drawCount; i++) {
    const pick = pickRandomClip(rows, {
      recentPlayTimes,
      themeRecentCounts: themeCounts,
      intensityCeiling: ceiling,
    })
    if (!pick) break

    // Insert play row (queued state)
    const { data: playRow, error: playErr } = await supabase
      .from('mommy_random_clip_plays')
      .insert({
        user_id: userId,
        clip_id: pick.id,
        delivery_status: 'queued',
      })
      .select('id')
      .single()
    if (playErr) {
      console.error('[clip-scheduler] play insert failed:', playErr.message)
      continue
    }

    // Bump catalog stats — best-effort
    await supabase.from('mommy_random_clips')
      .update({ play_count: (rows.find(r => r.id === pick.id)?.play_count ?? 0) + 1, last_played_at: new Date().toISOString() })
      .eq('id', pick.id)
      .then(() => null, () => null)

    // Authority log
    await supabase.from('mommy_authority_log').insert({
      user_id: userId,
      action: 'random_clip_queued',
      surface: 'random_clip',
      ref_table: 'mommy_random_clip_plays',
      ref_id: (playRow as { id?: string } | null)?.id,
      meta: { slug: pick.slug, theme: pick.theme, text_preview: pick.text.slice(0, 80) },
    }).then(() => null, () => null)

    themeCounts[pick.theme] = (themeCounts[pick.theme] ?? 0) + 1
    dropped.push({ id: pick.id, slug: pick.slug, theme: pick.theme })
  }

  return { user_id: userId, ok: true, dropped: dropped.length, clips: dropped }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405)

  let body: { mode?: string; user_id?: string } = {}
  try { body = await req.json() } catch { /* */ }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  if (body.user_id) {
    const r = await runForUser(supabase, body.user_id)
    return json({ ok: true, results: [r] })
  }

  // Sweep mode — all opt-in dommy_mommy users
  const { data: cohort } = await supabase
    .from('user_state')
    .select('user_id')
    .eq('handler_persona', 'dommy_mommy')
    .neq('ambient_clips_opt_in', false)

  const ids = ((cohort || []) as Array<{ user_id: string }>).map(r => r.user_id)
  if (ids.length === 0) {
    // Fallback to handler user when there's no explicit cohort row but
    // we're driving from cron.
    ids.push(HANDLER_USER_ID)
  }

  const results: RunResult[] = []
  for (const uid of ids) {
    try {
      results.push(await runForUser(supabase, uid))
    } catch (e) {
      results.push({ user_id: uid, ok: false, dropped: 0, reason: `error:${(e as Error).message}` })
    }
  }

  const dropped = results.reduce((a, r) => a + r.dropped, 0)
  return json({ ok: true, total_dropped: dropped, total_users: results.length, results })
})
