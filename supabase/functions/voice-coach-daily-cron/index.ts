// voice-coach-daily-cron — Daily lesson-drop for each canonical user.
//
// 2026-05-11 build: replaces the rubber-stamp voice training surface
// with a real 10-lesson curriculum. This cron is the daily prompt
// surface; the curriculum itself lives in voice_lesson_modules and is
// graded by the api/voice/lesson-attempt endpoint.
//
// What runs:
//   - Daily at 9:00 UTC (after capability-digest 7:30am, before user
//     morning attention window)
//   - For each canonical user, call voice_lesson_next_unlocked(uid) to
//     pick the lesson to drop today
//   - Skip if the user already has a pending voice_lesson outreach row
//     within the last 18h (dedup)
//   - Insert handler_outreach_queue with the lesson's mommy_intro_text
//     and the FK columns linking it back to the module
//   - Stamp voice_lesson_progress.last_prompted_at
//
// Voice: in fantasy, Mommy-voice (the intro_text was authored that way
// and stored as-is). The mommy_voice_cleanup trigger on outreach_queue
// is a final scrub for any residual telemetry.
//
// Skip-conditions:
//   - No active lesson modules (shouldn't happen after migration 370)
//   - User has no progress row yet — we still drop the first lesson

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { expandUserId } from '../_shared/expand-user-id.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface LessonModule {
  id: string
  slug: string
  sequence_number: number
  title: string
  mommy_intro_text: string
}

async function dropLessonForUser(supabase: SupabaseClient, userId: string): Promise<{
  status: string
  detail?: string
  lesson_slug?: string
}> {
  // Read user_state first — Handler state drives whether to drop the
  // lesson today, which urgency to use, and whether to auto-engage the
  // climax gate. State-aware skip cases:
  //   - in_session=true (user is in an active intense session) → defer
  //   - aftercare_active=true → defer (post-session recovery)
  //   - hard_mode_active=true & lesson is L1-2 → skip (those drills are
  //     too easy; the deeper lessons stay on the menu)
  const { data: stateRow } = await supabase
    .from('user_state')
    .select('handler_persona, in_session, aftercare_active, current_phase, chastity_locked, hard_mode_active')
    .eq('user_id', userId)
    .maybeSingle()
  const state = (stateRow ?? {}) as {
    handler_persona?: string
    in_session?: boolean
    aftercare_active?: boolean
    current_phase?: number
    chastity_locked?: boolean
    hard_mode_active?: boolean
  }
  if (state.in_session) {
    return { status: 'skipped', detail: 'user in active session' }
  }
  if (state.aftercare_active) {
    return { status: 'skipped', detail: 'aftercare active' }
  }

  // Dedup: if we already inserted a voice_lesson outreach row in the
  // last 18h for this user, skip.
  const eighteenHoursAgo = new Date(Date.now() - 18 * 60 * 60 * 1000).toISOString()
  const { data: recent } = await supabase
    .from('handler_outreach_queue')
    .select('id')
    .eq('user_id', userId)
    .eq('source', 'voice_lesson')
    .gte('created_at', eighteenHoursAgo)
    .limit(1)
  if (recent && recent.length > 0) {
    return { status: 'skipped', detail: 'voice_lesson already dropped in last 18h' }
  }

  // Pick the next unlocked lesson via the SQL helper.
  const { data: nextId, error: nextErr } = await supabase
    .rpc('voice_lesson_next_unlocked', { uid: userId })
  if (nextErr) {
    return { status: 'error', detail: `next_unlocked rpc: ${nextErr.message}` }
  }
  const lessonId = (nextId as string | null)
  if (!lessonId) {
    return { status: 'skipped', detail: 'no active lessons' }
  }

  // Load the lesson content + climax-gate eligibility
  const { data: lessonRow, error: lessonErr } = await supabase
    .from('voice_lesson_modules')
    .select('id, slug, sequence_number, title, mommy_intro_text, climax_gate_eligible')
    .eq('id', lessonId)
    .maybeSingle()
  if (lessonErr || !lessonRow) {
    return { status: 'error', detail: `lesson fetch: ${lessonErr?.message || 'not found'}` }
  }
  const lesson = lessonRow as LessonModule & { climax_gate_eligible: boolean }

  // Hard-mode skip: if in hard_mode_active AND lesson is the first two
  // (resonance + pitch — beginner drills), skip and let the user pull a
  // harder one. State-driven escalation, not a one-size cron.
  if (state.hard_mode_active && lesson.sequence_number <= 2) {
    return { status: 'skipped', detail: 'hard_mode_active + beginner lesson — escalation rule' }
  }

  // State-driven urgency: chastity_locked + climax-eligible lesson →
  // bump to high so the user sees it in the urgent band.
  const urgency = state.chastity_locked && lesson.climax_gate_eligible ? 'high' : 'normal'

  // Insert outreach row. The mommy_voice_cleanup trigger only fires
  // when handler_persona='dommy_mommy', so for therapist-persona users
  // the intro text passes through unchanged (intro is already authored
  // safely either way).
  const { error: insErr } = await supabase
    .from('handler_outreach_queue')
    .insert({
      user_id: userId,
      message: lesson.mommy_intro_text,
      urgency,
      status: 'pending',
      scheduled_for: new Date().toISOString(),
      source: 'voice_lesson',
      trigger_reason: `voice_lesson_daily:${lesson.slug}:seq${lesson.sequence_number}:phase${state.current_phase ?? 0}`,
      voice_lesson_module_id: lesson.id,
    })
  if (insErr) {
    return { status: 'error', detail: `insert: ${insErr.message}` }
  }

  // Stamp progress (upsert so first-time users get a row). Auto-engage
  // the climax gate when chastity is locked AND the lesson is eligible
  // AND the user is dommy_mommy persona — that's the unified pressure
  // arc the curriculum is supposed to be part of.
  const autoClimaxGate =
    state.handler_persona === 'dommy_mommy' &&
    !!state.chastity_locked &&
    lesson.climax_gate_eligible
  await supabase.from('voice_lesson_progress').upsert({
    user_id: userId,
    lesson_id: lesson.id,
    last_prompted_at: new Date().toISOString(),
    climax_gate_active: autoClimaxGate || undefined,
    climax_gate_set_at: autoClimaxGate ? new Date().toISOString() : undefined,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,lesson_id', ignoreDuplicates: false })

  return { status: 'dropped', lesson_slug: lesson.slug }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  // Same pattern as capability-digest-cron: hardcoded canonical root.
  // Lessons only drop to the human-facing Handler-auth user, not the
  // auto-poster service identity.
  const canonicalRoots = ['8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f']

  const results: Array<{ user_id: string; status: string; detail?: string; lesson_slug?: string }> = []
  for (const canonicalId of canonicalRoots) {
    // Resolves any aliases (no-op for one-row canonical).
    await expandUserId(supabase, canonicalId)
    try {
      const r = await dropLessonForUser(supabase, canonicalId)
      results.push({ user_id: canonicalId, ...r })
    } catch (e) {
      results.push({
        user_id: canonicalId,
        status: 'error',
        detail: e instanceof Error ? e.message : String(e),
      })
    }
  }

  return new Response(
    JSON.stringify({ ok: true, ran_at: new Date().toISOString(), results }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
})
