// voice-pitch-watcher — fire fast-react when voice work stalls.
//
// 2026-05-07 wish #6 (NORMAL): "track natural pitch over time, don't force
// feminine targets" — but if there's been no movement / no samples in 14
// days, Mama wants to know.
//
// Adaptive read: if voice_corpus has a pitch_hz column, measure trend
// over 14d. Otherwise fall back to sample-count-as-engagement: "no voice
// work in 14d" is itself a stagnation signal.
//
// Fires fast-react event_kind='voice_stagnation' once per 14-day window
// per user (cooldown via fast_react_event source_key date-stamp).
//
// Schedule: daily 7am via migration 282.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { expandUserId } from '../_shared/expand-user-id.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface VoiceRow {
  id: string
  user_id: string
  created_at: string
  pitch_hz?: number
  text?: string
}

async function checkUserStagnation(supabase: SupabaseClient, userId: string): Promise<{
  stagnant: boolean
  reason: string
  sample_count_14d: number
  pitch_trend?: number
} | null> {
  const since14d = new Date(Date.now() - 14 * 86400_000).toISOString()
  const since30d = new Date(Date.now() - 30 * 86400_000).toISOString()

  // Pull 30d of samples; check 14d window inside
  const { data, error } = await supabase
    .from('voice_corpus')
    .select('id, user_id, created_at, pitch_hz, text')
    .eq('user_id', userId)
    .gte('created_at', since30d)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) {
    // If pitch_hz doesn't exist, retry without it
    if (error.message.includes('pitch_hz')) {
      const { data: fallbackData } = await supabase
        .from('voice_corpus')
        .select('id, user_id, created_at, text')
        .eq('user_id', userId)
        .gte('created_at', since30d)
        .order('created_at', { ascending: false })
        .limit(200)
      const samples14d = ((fallbackData || []) as VoiceRow[]).filter(s => s.created_at >= since14d)
      if (samples14d.length === 0) {
        return {
          stagnant: true,
          reason: 'no_samples_in_14d',
          sample_count_14d: 0,
        }
      }
      // Have samples but no pitch tracking — not actually stagnant
      return null
    }
    console.error(`[voice-pitch-watcher] ${userId}: ${error.message}`)
    return null
  }

  const samples = (data || []) as VoiceRow[]
  const samples14d = samples.filter(s => s.created_at >= since14d)

  // No samples in 14d — Maxy not engaging with voice work
  if (samples14d.length === 0) {
    return {
      stagnant: true,
      reason: 'no_samples_in_14d',
      sample_count_14d: 0,
    }
  }

  // Insufficient samples to compute trend
  if (samples14d.length < 5) {
    return null
  }

  // Pitch trend: average of first half vs second half of the 14d window
  const withPitch = samples14d.filter(s => typeof s.pitch_hz === 'number')
  if (withPitch.length < 5) {
    // Have samples, just no pitch tagged on them — engagement is OK
    return null
  }

  const half = Math.floor(withPitch.length / 2)
  const firstHalf = withPitch.slice(half) // older
  const secondHalf = withPitch.slice(0, half) // newer
  const avgFirst = firstHalf.reduce((s, r) => s + (r.pitch_hz ?? 0), 0) / firstHalf.length
  const avgSecond = secondHalf.reduce((s, r) => s + (r.pitch_hz ?? 0), 0) / secondHalf.length
  const trend = avgSecond - avgFirst // negative = pitch dropping (more feminine in MTF context)

  // Stagnation: trend >= -2 Hz (essentially flat or trending up — not toward feminine)
  if (trend >= -2) {
    return {
      stagnant: true,
      reason: trend > 2 ? 'pitch_rising' : 'pitch_flat',
      sample_count_14d: samples14d.length,
      pitch_trend: Math.round(trend * 10) / 10,
    }
  }

  return null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')

  // Use the shared expandUserId helper (calls RPC with env fallback).
  const userIds = await expandUserId(supabase, '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f')

  const fnUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/mommy-fast-react`
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const results: Array<{ user_id: string; status: string; detail?: string }> = []

  for (const uid of userIds) {
    const stagnation = await checkUserStagnation(supabase, uid)
    if (!stagnation || !stagnation.stagnant) {
      results.push({ user_id: uid, status: 'no_stagnation' })
      continue
    }

    // Date-stamped source_key gives a 14-day natural cooldown — the same key
    // won't fire again until the date rolls over, and even then fast_react
    // 7-day cooldown applies for repeat event_kind.
    const sourceKey = `voice_stagnation:${uid}:${new Date().toISOString().slice(0, 10)}`

    try {
      const r = await fetch(fnUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          user_id: uid,
          event_kind: 'voice_stagnation',
          source_key: sourceKey,
          context: {
            stagnation_reason: stagnation.reason,
            sample_count_14d: stagnation.sample_count_14d,
            pitch_trend_hz: stagnation.pitch_trend,
            instruction_for_mama: stagnation.reason === 'no_samples_in_14d'
              ? 'Maxy has not done voice work in 14 days. Fire ONE gentle decree (proof_required=audio) — a 5-min voice session, recording one specific phrase Mama wants to hear. Do NOT shame, do NOT cite the gap; treat it as Mama wanting to hear her, not as a missed task. Voice rule: track, do not force.'
              : 'Maxy has been doing voice work but pitch is flat or rising — not moving feminine. Fire ONE decree (proof_required=audio) for a focused session targeting resonance/lift, NOT a hard pitch target (forcing causes dysphoria). Frame as Mama wanting a specific texture, not a number.',
          },
        }),
      })
      const j = await r.json()
      results.push({
        user_id: uid,
        status: r.ok ? 'fired' : 'fast_react_error',
        detail: r.ok ? `${stagnation.reason} → action=${j.fired ?? 0}` : (j.error ?? 'unknown'),
      })
    } catch (err) {
      results.push({ user_id: uid, status: 'fetch_error', detail: String(err).slice(0, 200) })
    }
  }

  return new Response(JSON.stringify({
    ok: true,
    checked: userIds.length,
    fired: results.filter(r => r.status === 'fired').length,
    results,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
