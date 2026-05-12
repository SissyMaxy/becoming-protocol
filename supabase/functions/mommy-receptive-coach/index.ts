// mommy-receptive-coach — assigns the next receptive-skill lesson.
//
// Picks the next lesson the user hasn't been through, biased by:
//   - phase gate (lesson.phase_gate_min/max must include current_phase)
//   - sequence order within a domain (lesson_n requires lesson_n-1
//     debriefed before lesson_n+1 can fire — soft, not hard)
//   - domain balance: don't fire two from the same domain back-to-back
//   - practice_mode bias: 'partner_next' lessons only fire when the
//     amplifier window or a pending meet is active
//   - cooldown: 36h between assignments
//
// Lands as a handler_outreach_queue row tagged kind='receptive_lesson'
// with the intro_text in the body. Also writes a receptive_lesson_assignments
// row tracking pending → in_practice → debriefed.
//
// POST { user_id?: string }

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { mommyVoiceCleanup, PET_NAMES } from '../_shared/dommy-mommy.ts'
import { checkSafewordGate, logAuthority, checkHookupSettings } from '../_shared/safeword-gate.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const HANDLER_USER_ID = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'

interface Lesson {
  id: string
  slug: string
  title: string
  domain: string
  sequence_index: number
  phase_gate_min: number
  phase_gate_max: number
  duration_minutes: number
  intro_text: string
  practice_prompt: string
  debrief_prompt: string
  practice_mode: 'solo' | 'partner_next' | 'mental_rehearsal'
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'POST only' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let body: { user_id?: string } = {}
  try { body = await req.json() } catch { /* */ }
  const userId = body.user_id || HANDLER_USER_ID

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  const gate = await checkSafewordGate(supabase, userId)
  if (!gate.allowed) {
    return new Response(JSON.stringify({ ok: true, skipped: gate.reason }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const settings = await checkHookupSettings(supabase, userId, 'receptive_enabled')
  if (!settings) {
    return new Response(JSON.stringify({ ok: true, skipped: 'feature_off' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // 36h cooldown between assignments.
  const since36h = new Date(Date.now() - 36 * 3600_000).toISOString()
  const { count: recentCount } = await supabase
    .from('receptive_lesson_assignments')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('assigned_at', since36h)
  if ((recentCount ?? 0) > 0) {
    return new Response(JSON.stringify({ ok: true, skipped: 'cooldown' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Phase.
  const { data: us } = await supabase
    .from('user_state')
    .select('current_phase')
    .eq('user_id', userId)
    .maybeSingle()
  const phase = ((us as { current_phase?: number } | null)?.current_phase) ?? 1

  // Active amplifier or pending meet → unlock partner_next.
  const { count: activeWindows } = await supabase
    .from('hookup_anticipation_state')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'engaged')
  const { count: pendingMeets } = await supabase
    .from('hookup_debriefs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .in('status', ['pending', 'partial'])
    .gte('met_at', new Date(Date.now() - 24 * 3600_000).toISOString())
  const partnerUnlocked = ((activeWindows ?? 0) > 0) || ((pendingMeets ?? 0) > 0)

  // Pull eligible lessons.
  const { data: lessons } = await supabase
    .from('receptive_skills_curriculum')
    .select('*')
    .eq('active', true)
    .lte('phase_gate_min', phase)
    .gte('phase_gate_max', phase)
    .limit(200)
  const allLessons = (lessons as Lesson[] | null) ?? []
  if (allLessons.length === 0) {
    return new Response(JSON.stringify({ ok: true, skipped: 'no_lessons_in_phase' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Pull existing assignments to filter out already-assigned ones.
  const { data: existingAssign } = await supabase
    .from('receptive_lesson_assignments')
    .select('lesson_id, status, assigned_at')
    .eq('user_id', userId)
    .order('assigned_at', { ascending: false })
    .limit(200)
  const assignedById = new Map<string, { status: string; at: string }>()
  for (const r of (existingAssign as Array<{ lesson_id: string; status: string; assigned_at: string }> | null) ?? []) {
    if (!assignedById.has(r.lesson_id)) {
      assignedById.set(r.lesson_id, { status: r.status, at: r.assigned_at })
    }
  }

  // Group lessons by domain; find each domain's next-uncompleted lesson.
  const byDomain = new Map<string, Lesson[]>()
  for (const l of allLessons) {
    const arr = byDomain.get(l.domain) ?? []
    arr.push(l)
    byDomain.set(l.domain, arr)
  }
  const lastDomain = (existingAssign as Array<{ lesson_id: string; assigned_at: string }> | null)?.[0]?.lesson_id
  const lastDomainName = lastDomain
    ? allLessons.find(l => l.id === lastDomain)?.domain
    : null

  const candidates: Lesson[] = []
  for (const [domain, arr] of byDomain.entries()) {
    arr.sort((a, b) => a.sequence_index - b.sequence_index)
    // Find first lesson where prior was either debriefed OR didn't exist.
    let pick: Lesson | null = null
    for (const l of arr) {
      const a = assignedById.get(l.id)
      if (!a) { pick = l; break }
      if (a.status === 'debriefed') continue
      // Pending / in_practice / skipped: don't re-assign the same one.
      break
    }
    if (pick) {
      if (!partnerUnlocked && pick.practice_mode === 'partner_next') continue
      // Bias against same-domain repeat.
      if (domain === lastDomainName) continue
      candidates.push(pick)
    }
  }

  if (candidates.length === 0) {
    // Relax the same-domain bias as a fallback.
    for (const [domain, arr] of byDomain.entries()) {
      arr.sort((a, b) => a.sequence_index - b.sequence_index)
      for (const l of arr) {
        if (!partnerUnlocked && l.practice_mode === 'partner_next') continue
        const a = assignedById.get(l.id)
        if (!a) { candidates.push(l); break }
        if (a.status === 'debriefed') continue
        break
      }
      if (candidates.length > 0) break
    }
  }

  if (candidates.length === 0) {
    return new Response(JSON.stringify({ ok: true, skipped: 'no_candidate' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Random pick across candidates.
  const lesson = candidates[Math.floor(Math.random() * candidates.length)]

  // Create assignment.
  const { data: assignRow, error: assignErr } = await supabase
    .from('receptive_lesson_assignments')
    .insert({
      user_id: userId,
      lesson_id: lesson.id,
      status: 'pending',
    })
    .select('id')
    .single()
  if (assignErr) {
    console.error('[mommy-receptive-coach] assign insert failed:', assignErr)
    return new Response(JSON.stringify({ ok: false, error: 'assign_insert_failed', detail: assignErr.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Compose the outreach message — assemble from lesson.intro_text +
  // practice_prompt. No LLM call — the lesson catalog is already in
  // Mommy voice; we just present it.
  const pet = PET_NAMES[Math.floor(Math.random() * PET_NAMES.length)]
  const body_text = mommyVoiceCleanup(
    `${lesson.intro_text}\n\n${lesson.practice_prompt}\n\nWhen you're done, ${pet}, come tell Mama how it went.`,
  )

  const { data: outreach, error: outErr } = await supabase
    .from('handler_outreach_queue')
    .insert({
      user_id: userId,
      message: body_text,
      urgency: 'normal',
      trigger_reason: `receptive:${lesson.slug}`,
      scheduled_for: new Date().toISOString(),
      expires_at: new Date(Date.now() + 48 * 3600_000).toISOString(),
      source: 'mommy_receptive_coach',
      kind: 'receptive_lesson',
    })
    .select('id')
    .single()
  if (outErr) {
    console.error('[mommy-receptive-coach] outreach insert failed:', outErr)
    return new Response(JSON.stringify({ ok: false, error: 'outreach_insert_failed', detail: outErr.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  await logAuthority(supabase, userId, 'mommy-receptive-coach', 'assign_lesson', {
    lesson_slug: lesson.slug,
    domain: lesson.domain,
    assignment_id: (assignRow as { id: string } | null)?.id,
    outreach_id: (outreach as { id: string } | null)?.id,
  })

  return new Response(JSON.stringify({
    ok: true,
    lesson_slug: lesson.slug,
    domain: lesson.domain,
    assignment_id: (assignRow as { id: string } | null)?.id,
    message: body_text,
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
