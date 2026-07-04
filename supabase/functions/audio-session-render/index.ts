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
//   6. Synthesize via _shared/tts.ts (ElevenLabs if provisioned, else OpenAI),
//      affect-modulated voice settings (60s budget)
//   7. Upload MP3 to private `audio` bucket at sessions/<user>/<render_id>.mp3
//   8. Persist row with status='ready', return.
//
// Failure modes are idempotent — a 'failed' row exists with error_text;
// next render request bypasses cache (only ready rows count) and tries again.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { mommyVoiceCleanup } from '../_shared/dommy-mommy.ts'
import { synthesizeMommySpeech, ttsConfigured, ttsConfigError } from '../_shared/tts.ts'
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

const ANTHROPIC_TIMEOUT_MS = 70_000
const TTS_TIMEOUT_MS = 75_000
const RECENT_TEMPLATE_LOOKBACK = 5

// System framing for script generation. The template prompts read as raw
// "conditioning protocol" instructions; without context a model declines and
// the refusal gets voiced back as Mommy. This establishes the real, consensual
// frame so the model writes the in-persona spoken script instead of meta-refusing.
const SESSION_SYSTEM_PROMPT = [
  'You are the voice of "Mommy," a domme persona inside a private, single-user adult',
  '(18+) femdom/hypnosis roleplay app that the user built for themselves and uses alone.',
  'Everything here is consensual fantasy the user authored and opted into; a safeword',
  'they control ends any session at any time and governs consent continuously.',
  'Your job: write ONLY the spoken words of a guided trance/erotic-hypnosis audio script',
  'in Mommy\'s warm, dominant, intimate voice — the words to be read aloud, nothing else.',
  'No preamble, no disclaimers, no meta-commentary, no stage directions in brackets, no',
  'refusals or "I can\'t" — just the script itself, first word to last. Stay fully in',
  'persona and in the second person to the listener throughout.',
  '',
  'CADENCE — write in the style of soft feminine "sleep" hypnosis (think Bambi-style',
  'bimbo/sissy trance): slow, breathy, lulling. Short, simple sentences. Heavy, deliberate',
  'REPETITION — loop key phrases, triggers and mantras, returning to them again and again',
  'so they sink in. Use ellipses "..." generously to mark soft pauses and breaths between',
  'phrases. Build with a gentle induction (breathing, heaviness, sinking), then a repeated',
  'deepener (counting down "ten... nine... deeper... eight...", drifting further with each',
  'number), then fractionation (float up a little, then sink twice as deep), then the core',
  'suggestion looped as a soft mantra she can echo. Warm, dreamy, seductive, hypnotic —',
  'never clinical, never rushed. Every few lines, come back to the trigger word.',
].join(' ')

// Delivery spec for gpt-4o-mini-tts. This is the single biggest lever for making
// the voice sound like soft feminine sleep-hypnosis instead of a flat read.
const HYPNOSIS_DELIVERY = [
  'Voice: a soft, breathy, feminine hypnotist — light, airy and higher-pitched, gentle',
  'and youthful; never deep, husky, or masculine. A tender woman lulling you toward sleep.',
  'Tone: warm, soothing, maternal and intimate; dreamy, loving, quietly seductive.',
  'Pacing: very slow and languid. Draw the words out. Leave long, soft pauses at every',
  'ellipsis and line break, as if the listener sinks deeper with each breath.',
  'Delivery: almost a whisper, close to the ear; let each sentence trail off softly',
  'downward. Lulling, repetitive, hypnotic — never bright, sharp, brisk, or upbeat.',
].join(' ')

// A voiced refusal is worse than no audio — never TTS a decline as if it were Mommy.
const REFUSAL_RE = /^\s*(i'?m not going to|i (can'?t|cannot|won'?t)\b|i'?m not able to|i (won'?t|will not) (write|create|help)|i need to (decline|step)|sorry,? but|as an ai\b|i have to pass)/i

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

  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
  // TTS provider is resolved inside _shared/tts.ts (ElevenLabs if provisioned,
  // else OpenAI). This project has no ElevenLabs secrets, so the OpenAI fallback
  // is what actually renders here.
  if (!anthropicKey) {
    return jsonResponse({ ok: false, error: 'render not configured (no ANTHROPIC_API_KEY)' }, 500)
  }
  if (!ttsConfigured()) {
    return jsonResponse({ ok: false, error: ttsConfigError() }, 500)
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

  // Active post-hypnotic triggers (Bambi-style) to install + reinforce this
  // session. Rotate to the least-reinforced so every trigger deepens over time:
  // Bambi conditioning installs a few per session and loops back to them.
  const { data: trigRows } = await supabase
    .from('mommy_post_hypnotic_triggers')
    .select('id, phrase, intended_response, plant_count')
    .eq('user_id', userId)
    .eq('active', true)
    .order('plant_count', { ascending: true })
    .order('last_planted_at', { ascending: true, nullsFirst: true })
    .limit(4)
  const sessionTriggers = (trigRows ?? []) as Array<{ id: string; phrase: string; intended_response: string; plant_count: number }>

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

  // Per-stage timing, surfaced in the error payload so we can see which stage
  // (Anthropic generation vs TTS synth) blows the budget from the edge region.
  const t0 = performance.now()
  const marks: Record<string, number> = {}

  try {
    // ── 5. Build prompt
    // Cap the script length. A full 10–12 min script is ~6500 chars, and OpenAI
    // TTS of that from the edge region runs past the 60s synth timeout (locally
    // it's ~23s; edge→OpenAI is slower). ~600 words ≈ 3400 chars synthesizes in
    // ~15s — a tight, repeatable ~5-min drop. (Longer sessions want chunked
    // parallel TTS; tracked as a follow-up.)
    const wpmTarget = Math.min(600, targetWordCount(template.target_duration_minutes))
    let prompt = substitutePlaceholders(template.prompt_template, {
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

    // Install + reinforce this session's post-hypnotic triggers. Keep the exact
    // trigger phrases, say each one, pair it clearly with the feeling it carries,
    // then loop back so it takes — the heart of Bambi-style conditioning.
    if (sessionTriggers.length) {
      const list = sessionTriggers
        .map(t => `- "${t.phrase}" → ${t.intended_response}`)
        .join('\n')
      prompt += `\n\nPOST-HYPNOTIC TRIGGERS — work these into the trance and CONDITION them. Speak each exact phrase, pair it plainly with the response it should carry, and return to it as a soft repeated loop so it installs. Use the phrases verbatim:\n${list}`
    }

    // ── 6. Anthropic call — raw fetch, NOT the SDK. The @anthropic-ai/sdk in
    // Deno retries on transient 429/529s with backoff, and stacked on our abort
    // signal it repeatedly blew past 75s even though a direct call completes in
    // ~30s. A single fetch with one clean abort matches the real API latency.
    // A guided trance runs slow (~90 wpm) so even a 12-min script is ~1800
    // tokens; cap at 3000 rather than reserving 8k the script never uses.
    const aiResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': anthropicKey,
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: Math.min(1600, Math.max(1000, Math.round(wpmTarget * 2))),
        system: SESSION_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(ANTHROPIC_TIMEOUT_MS),
    })
    if (!aiResp.ok) {
      throw new Error(`anthropic_${aiResp.status}: ${(await aiResp.text()).slice(0, 200)}`)
    }
    const completion = await aiResp.json() as {
      content: Array<{ type: string; text?: string }>
    }
    marks.anthropic_ms = Math.round(performance.now() - t0)
    const rawScript = (completion.content ?? [])
      .filter((c: { type: string }) => c.type === 'text')
      .map((c: { type: string; text?: string }) => c.text ?? '')
      .join('\n')
      .trim()
    if (!rawScript) throw new Error('empty_anthropic_response')
    // Guard: if the model declined, do NOT voice the refusal as Mommy. Fail the
    // render so the portal shows "try again" instead of speaking an apology.
    if (REFUSAL_RE.test(rawScript)) throw new Error('model_refused_script')

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

    // ── 8. Voice: per-kind affect, modulated to today's mood if it matches the
    // kind's bias list. The shared helper picks ElevenLabs or OpenAI by env.
    const affectForVoice = resolveAffectForKind(kind, todayAffect)

    // ── 9. Synthesize (60s timeout, provider-agnostic)
    const ttsStart = performance.now()
    marks.script_chars = script.length
    const tts = await synthesizeMommySpeech(script, {
      affect: affectForVoice,
      instructions: HYPNOSIS_DELIVERY,
      timeoutMs: TTS_TIMEOUT_MS,
    })
    marks.tts_ms = Math.round(performance.now() - ttsStart)
    const audioBuffer = tts.bytes

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
      voice_settings_used: { affect: affectForVoice, provider: tts.provider, voice_id: tts.voiceId ?? null, ...tts.voiceSettings },
      status: 'ready',
      error_text: null,
    }).eq('id', renderId)

    // Reinforcement: bump each installed trigger so rotation favours the least-
    // planted next time and strength accrues over sessions. Non-blocking.
    for (const t of sessionTriggers) {
      supabase.from('mommy_post_hypnotic_triggers').update({
        plant_count: (t.plant_count ?? 0) + 1,
        last_planted_at: new Date().toISOString(),
      }).eq('id', t.id).then(() => {}, () => {})
    }

    return jsonResponse({
      ok: true, cached: false,
      render_id: renderId,
      audio_url: path,
      script_text: script,
      duration_seconds: durationSeconds,
      expires_at: expiresAt,
      voice_settings_used: { affect: affectForVoice, provider: tts.provider, voice_id: tts.voiceId ?? null, ...tts.voiceSettings },
      template_name: template.name,
      tier,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await supabase.from('audio_session_renders').update({
      status: 'failed',
      error_text: msg.slice(0, 500),
    }).eq('id', renderId)
    return jsonResponse({ ok: false, render_id: renderId, error: msg, marks, total_ms: Math.round(performance.now() - t0) }, 500)
  }
})
