// audio-session-render — generate Mommy-voiced audio sessions on demand.
//
// POST { user_id, kind, intensity_tier? }
// → { audio_url, script_text, duration_seconds, expires_at, render_id, cached }
//
// Pipeline:
//   1. Pick template (kind + phase + intensity, biased by today's affect,
//      deprioritizing recently-used templates)
//   2. Hit cache: existing ready render for (user, template, tier) within
//      24h TTL → return its audio_url
//   3. Pull state: feminine_self, mommy_mood, slip_log (last 7d),
//      mantra_delivery_log most recent
//   4. Substitute placeholders, generate script via Anthropic (30s budget)
//   5. Run script through mommyVoiceCleanup (telemetry/probe filter)
//   6. POST to ElevenLabs with affect-modulated voice settings (60s budget)
//   7. Upload MP3 to private `audio` bucket at sessions/<user>/<render_id>.mp3
//   8. Persist row with status='ready', return.
//
// Failure modes are idempotent — a 'failed' row exists with error_text;
// next render request bypasses cache (only ready rows count) and tries again.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.24.3'
import { mommyVoiceCleanup } from '../_shared/dommy-mommy.ts'
import { affectToVoiceSettings } from '../_shared/mommy-voice-settings.ts'
import {
  type AudioSessionIntensity,
  type AudioSessionKind,
  type AudioSessionTemplate,
  resolveAffectForKind,
  selectTemplate,
  substitutePlaceholders,
  targetWordCount,
} from '../_shared/audio-session-selector.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const ANTHROPIC_TIMEOUT_MS = 30_000
const ELEVENLABS_TIMEOUT_MS = 60_000
const RECENT_TEMPLATE_LOOKBACK = 5

const VALID_KINDS = new Set<AudioSessionKind>([
  'session_edge', 'session_goon', 'session_conditioning',
  'session_freestyle', 'session_denial',
  'primer_posture', 'primer_gait', 'primer_sitting', 'primer_hands',
  'primer_fullbody', 'primer_universal',
])
const VALID_TIERS = new Set<AudioSessionIntensity>(['gentle', 'firm', 'cruel'])

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

interface RequestBody {
  user_id?: string
  kind?: string
  intensity_tier?: string
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'POST only' }, 405)

  let body: RequestBody = {}
  try { body = await req.json() } catch { /* empty */ }

  const userId = body.user_id
  const kind = body.kind as AudioSessionKind | undefined
  const requestedTier = (body.intensity_tier ?? 'gentle') as AudioSessionIntensity

  if (!userId) return jsonResponse({ ok: false, error: 'user_id required' }, 400)
  if (!kind || !VALID_KINDS.has(kind)) {
    return jsonResponse({ ok: false, error: 'invalid kind' }, 400)
  }
  if (!VALID_TIERS.has(requestedTier)) {
    return jsonResponse({ ok: false, error: 'invalid intensity_tier' }, 400)
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  const elevenKey = Deno.env.get('ELEVENLABS_API_KEY')
  const voiceId = Deno.env.get('ELEVENLABS_VOICE_ID')
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!elevenKey || !voiceId || !anthropicKey) {
    return jsonResponse({ ok: false, error: 'render not configured' }, 500)
  }

  // ── 1. Load context: user_state.current_phase, today's affect, recent renders
  const [userStateRes, moodRes, recentRendersRes, feminineRes, slipsRes, mantraRes] =
    await Promise.all([
      supabase.from('user_state')
        .select('current_phase').eq('user_id', userId).maybeSingle(),
      supabase.from('mommy_mood')
        .select('affect')
        .eq('user_id', userId)
        .eq('mood_date', new Date().toISOString().slice(0, 10))
        .maybeSingle(),
      supabase.from('audio_session_renders')
        .select('template_id')
        .eq('user_id', userId)
        .eq('kind', kind)
        .order('created_at', { ascending: false })
        .limit(RECENT_TEMPLATE_LOOKBACK),
      supabase.from('feminine_self')
        .select('feminine_name, current_honorific').eq('user_id', userId).maybeSingle(),
      supabase.from('slip_log')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('created_at', new Date(Date.now() - 7 * 86_400_000).toISOString()),
      supabase.from('mantra_delivery_log')
        .select('mantra_id')
        .eq('user_id', userId)
        .eq('status', 'spoken')
        .order('delivered_at', { ascending: false })
        .limit(1),
    ])

  const currentPhase = (userStateRes.data as { current_phase?: number } | null)?.current_phase ?? 1
  const todayAffect = (moodRes.data as { affect?: string } | null)?.affect ?? null
  const recentTemplateIds = ((recentRendersRes.data ?? []) as Array<{ template_id: string }>)
    .map(r => r.template_id)
  const feminine = feminineRes.data as { feminine_name?: string; current_honorific?: string } | null
  const recentSlips = slipsRes.count ?? 0
  const recentMantraId = ((mantraRes.data ?? []) as Array<{ mantra_id: string }>)[0]?.mantra_id ?? null

  let recentMantraText: string | null = null
  if (recentMantraId) {
    const { data: mantraRow } = await supabase
      .from('mantras')
      .select('text')
      .eq('id', recentMantraId)
      .maybeSingle()
    recentMantraText = (mantraRow as { text?: string } | null)?.text ?? null
  }

  // ── 2. Pick template
  const { data: tplRows } = await supabase
    .from('audio_session_templates')
    .select('id, kind, name, prompt_template, target_duration_minutes, affect_bias, phase_min, intensity_tier, active')
    .eq('kind', kind)
    .eq('active', true)
  const templates = (tplRows ?? []) as AudioSessionTemplate[]
  const pick = selectTemplate(templates, {
    kind, currentPhase, todayAffect, requestedTier, recentTemplateIds,
  })
  if (!pick) {
    return jsonResponse({ ok: false, error: 'no_eligible_template' }, 404)
  }
  const { template, tier } = pick

  // ── 3. Cache hit
  const { data: cached } = await supabase
    .from('audio_session_renders')
    .select('id, audio_url, script_text, duration_seconds, expires_at, voice_settings_used')
    .eq('user_id', userId)
    .eq('template_id', template.id)
    .eq('intensity_tier', tier)
    .eq('status', 'ready')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (cached) {
    const c = cached as {
      id: string; audio_url: string; script_text: string;
      duration_seconds: number; expires_at: string; voice_settings_used: unknown
    }
    return jsonResponse({
      ok: true, cached: true,
      render_id: c.id,
      audio_url: c.audio_url,
      script_text: c.script_text,
      duration_seconds: c.duration_seconds,
      expires_at: c.expires_at,
      voice_settings_used: c.voice_settings_used,
    })
  }

  // ── 4. Insert pending row to claim the slot
  const { data: pending, error: pendingErr } = await supabase
    .from('audio_session_renders')
    .insert({
      user_id: userId,
      template_id: template.id,
      kind,
      intensity_tier: tier,
      status: 'rendering',
    })
    .select('id, expires_at')
    .single()
  if (pendingErr || !pending) {
    return jsonResponse({ ok: false, error: `claim_failed: ${pendingErr?.message ?? 'no row'}` }, 500)
  }
  const renderId = (pending as { id: string }).id
  const expiresAt = (pending as { expires_at: string }).expires_at

  try {
    // ── 5. Build prompt
    const wpmTarget = targetWordCount(template.target_duration_minutes)
    const prompt = substitutePlaceholders(template.prompt_template, {
      feminine_name: feminine?.feminine_name ?? null,
      honorific: feminine?.current_honorific ?? null,
      phase: currentPhase,
      affect: todayAffect,
      recent_slips: recentSlips,
      recent_mantra: recentMantraText,
      duration_minutes: template.target_duration_minutes,
      target_word_count: wpmTarget,
      intensity_tier: tier,
    })

    // ── 6. Anthropic call (30s timeout)
    const anthropic = new Anthropic({ apiKey: anthropicKey })
    const aiCtl = AbortSignal.timeout(ANTHROPIC_TIMEOUT_MS)
    const completion = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: Math.min(8000, Math.max(2000, Math.round(wpmTarget * 2))),
      messages: [{ role: 'user', content: prompt }],
    }, { signal: aiCtl })

    const rawScript = completion.content
      .filter((c: { type: string }) => c.type === 'text')
      .map((c: { type: string; text?: string }) => c.text ?? '')
      .join('\n')
      .trim()
    if (!rawScript) throw new Error('empty_anthropic_response')

    // ── 7. Voice cleanup — same gate as chat output. Strip pacing markers
    // and markdown; mommyVoiceCleanup handles telemetry leaks.
    const script = mommyVoiceCleanup(rawScript)
      .replace(/\[pause\]/gi, '...')
      .replace(/\[breathe\s*(in|out)\]/gi, '...')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .trim()

    if (script.length < 100) throw new Error('script_too_short_after_cleanup')

    // ── 8. Voice settings: per-kind affect, modulated to today's mood if it
    // matches the kind's bias list.
    const affectForVoice = resolveAffectForKind(kind, todayAffect)
    const voiceSettings = affectToVoiceSettings(affectForVoice)

    // ── 9. ElevenLabs (60s timeout)
    const ttsCtl = AbortSignal.timeout(ELEVENLABS_TIMEOUT_MS)
    const ttsRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: 'POST',
        signal: ttsCtl,
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': elevenKey,
        },
        body: JSON.stringify({
          text: script,
          model_id: 'eleven_multilingual_v2',
          voice_settings: voiceSettings,
        }),
      },
    )

    if (!ttsRes.ok) {
      const detail = await ttsRes.text().catch(() => 'unknown')
      throw new Error(`elevenlabs_${ttsRes.status}:${detail.slice(0, 200)}`)
    }
    const audioBuffer = new Uint8Array(await ttsRes.arrayBuffer())

    // ── 10. Upload to private audio bucket
    const path = `sessions/${userId}/${renderId}.mp3`
    const { error: uploadErr } = await supabase.storage
      .from('audio')
      .upload(path, audioBuffer, { contentType: 'audio/mpeg', upsert: false })
    if (uploadErr) throw new Error(`upload:${uploadErr.message.slice(0, 200)}`)

    // Approximate duration from word count rather than reading the MP3 —
    // good enough for the UI progress bar; the real value will only differ
    // by a second or two for paced narration at this WPM.
    const wordCount = script.split(/\s+/).filter(Boolean).length
    const durationSeconds = Math.max(60, Math.round((wordCount / 150) * 60))

    await supabase.from('audio_session_renders').update({
      audio_url: path,
      script_text: script,
      duration_seconds: durationSeconds,
      voice_settings_used: { affect: affectForVoice, voice_id: voiceId, ...voiceSettings },
      status: 'ready',
      error_text: null,
    }).eq('id', renderId)

    return jsonResponse({
      ok: true, cached: false,
      render_id: renderId,
      audio_url: path,
      script_text: script,
      duration_seconds: durationSeconds,
      expires_at: expiresAt,
      voice_settings_used: { affect: affectForVoice, voice_id: voiceId, ...voiceSettings },
      template_name: template.name,
      tier,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await supabase.from('audio_session_renders').update({
      status: 'failed',
      error_text: msg.slice(0, 500),
    }).eq('id', renderId)
    return jsonResponse({ ok: false, render_id: renderId, error: msg }, 500)
  }
})
