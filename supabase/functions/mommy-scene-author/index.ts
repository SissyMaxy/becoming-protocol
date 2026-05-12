// mommy-scene-author — two modes.
//
// mode='sweep' (cron weekly, Sun 19:00 UTC): for each dommy_mommy user,
//   plan 2-3 scenes for the coming week and insert mommy_initiated_scenes
//   rows. Each scene passes the craft-rubric guard before persisting.
//
// mode='state' (cron every 15 min): walk scheduled scenes through the
//   status machine.
//     - 24h before scheduled_for: status='scheduled' → 'prepared', drop
//       the prep card outreach.
//     - At scheduled_for: status='prepared' → 'executing', drop the live
//       prompt card outreach.
//     - 4h after scheduled_for: status='executing' → debrief-pending,
//       drop the debrief demand outreach.
//     - 36h after scheduled_for with no debrief: status → 'expired'.
//
// Hard floors enforced in scene-templates.ts (no minors, no entrapment,
// no public lewdness, adult-only locations). The author additionally
// checks the user's wardrobe inventory before assigning scenes that
// require specific items the user doesn't own (per prescribe_only_what_she_owns
// memory).

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  planWeek, reviewSceneCraft, type PlannedScene, type SceneIntensity,
} from '../_shared/scene-templates.ts'
import {
  effectiveBand, bandMantraCeiling, type DifficultyBand,
} from '../_shared/difficulty-band.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const HANDLER_USER_ID = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'
const PREP_CARD_LEAD_HOURS = 24
const DEBRIEF_GRACE_HOURS = 4
const SCENE_EXPIRY_HOURS = 36

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

// ── name resolution ─────────────────────────────────────────────────────
async function resolveName(supabase: SupabaseClient, userId: string): Promise<string> {
  const { data: dossierName } = await supabase.from('mommy_dossier')
    .select('answer').eq('user_id', userId).eq('category', 'name').eq('active', true)
    .order('importance', { ascending: false }).limit(1).maybeSingle()
  const dn = (dossierName as { answer?: string } | null)?.answer?.trim()
  if (dn) return dn
  const { data: prof } = await supabase.from('user_profiles')
    .select('preferred_name').eq('user_id', userId).maybeSingle()
  const pn = (prof as { preferred_name?: string } | null)?.preferred_name?.trim()
  return pn || 'baby'
}

async function resolveWardrobe(supabase: SupabaseClient, userId: string): Promise<Array<{ category: string; label: string }>> {
  // wardrobe_inventory is the project-wide source per prescribe-only-what-she-owns.
  const { data } = await supabase.from('wardrobe_inventory')
    .select('category, item_name')
    .eq('user_id', userId)
    .limit(200)
    .then(
      (r: { data: unknown }) => r,
      () => ({ data: [] }),
    )
  return ((data || []) as Array<{ category?: string; item_name?: string }>)
    .filter(r => r.category && r.item_name)
    .map(r => ({ category: r.category!, label: r.item_name! }))
}

// ── sweep mode ──────────────────────────────────────────────────────────

interface SweepResult {
  user_id: string
  ok: boolean
  scheduled: number
  rejected: number
  reason?: string
  scenes?: Array<{ slug: string; scheduled_for: string; score: number }>
}

async function runSweepForUser(supabase: SupabaseClient, userId: string): Promise<SweepResult> {
  const { data: us } = await supabase.from('user_state')
    .select('handler_persona').eq('user_id', userId).maybeSingle()
  if ((us as { handler_persona?: string } | null)?.handler_persona !== 'dommy_mommy') {
    return { user_id: userId, ok: false, scheduled: 0, rejected: 0, reason: 'persona_not_dommy_mommy' }
  }

  // Already authored this week? Use the upcoming Monday as the week
  // anchor — same anchor used in planWeek.
  const now = new Date()
  const weekStart = new Date(now)
  const dow = weekStart.getUTCDay()
  const daysUntilMon = (8 - (dow === 0 ? 7 : dow)) % 7 || 7
  weekStart.setUTCDate(weekStart.getUTCDate() + daysUntilMon)
  weekStart.setUTCHours(0, 0, 0, 0)
  const weekEnd = new Date(weekStart); weekEnd.setUTCDate(weekEnd.getUTCDate() + 7)

  const { count: alreadyThisWeek } = await supabase.from('mommy_initiated_scenes')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('scheduled_for', weekStart.toISOString())
    .lt('scheduled_for', weekEnd.toISOString())
  if ((alreadyThisWeek ?? 0) > 0) {
    return { user_id: userId, ok: true, scheduled: 0, rejected: 0, reason: 'already_authored_this_week' }
  }

  // Intensity ceiling
  const { data: diff } = await supabase
    .from('compliance_difficulty_state')
    .select('current_difficulty_band, override_band').eq('user_id', userId).maybeSingle()
  const band = effectiveBand(diff as { current_difficulty_band: DifficultyBand; override_band: DifficultyBand | null } | null)
  const intensityCeiling: SceneIntensity = bandMantraCeiling(band)

  // Recent (last 4 weeks) slug-prefixes to avoid repeats
  const fourWeeksAgo = new Date(Date.now() - 28 * 86400_000).toISOString()
  const { data: recent } = await supabase.from('mommy_initiated_scenes')
    .select('scene_slug').eq('user_id', userId).gte('scheduled_for', fourWeeksAgo)
  const recentSlugPrefixes = ((recent || []) as Array<{ scene_slug: string }>).map(r => {
    // The slug prefix is everything before the trailing "_YYYY-MM-DD"
    const m = r.scene_slug.match(/^(.*)_\d{4}-\d{2}-\d{2}$/)
    return m ? m[1] : r.scene_slug
  })

  const name = await resolveName(supabase, userId)
  const ownedWardrobe = await resolveWardrobe(supabase, userId)
  const today = new Date().toISOString().slice(0, 10)
  const { data: mood } = await supabase.from('mommy_mood')
    .select('affect').eq('user_id', userId).eq('mood_date', today).maybeSingle()
  const affect = (mood as { affect?: string } | null)?.affect ?? 'patient'

  const planned: PlannedScene[] = planWeek({
    ctx: { name, ownedWardrobe, affect, hourOfDay: now.getUTCHours() },
    weekStart, intensityCeiling, recentSlugPrefixes,
  })

  let scheduled = 0
  let rejected = 0
  const samples: Array<{ slug: string; scheduled_for: string; score: number }> = []

  for (const scene of planned) {
    const review = reviewSceneCraft(scene)
    if (!review.ok) {
      rejected++
      console.warn('[scene-author] rejected', scene.scene_slug, review.notes.join(','))
      continue
    }
    const { error } = await supabase.from('mommy_initiated_scenes').insert({
      user_id: userId,
      scene_slug: scene.scene_slug,
      scene_kind: scene.scene_kind,
      title: scene.title,
      scheduled_for: scene.scheduled_for.toISOString(),
      preparation_instructions: scene.preparation_instructions,
      live_prompts: scene.live_prompts,
      debrief_prompts: scene.debrief_prompts,
      intensity_band: scene.intensity_band,
      status: 'scheduled',
      craft_review_score: review.score,
      craft_review_notes: review.notes.join(', ') || null,
    })
    if (error) {
      rejected++
      console.error('[scene-author] insert failed', scene.scene_slug, error.message)
      continue
    }
    scheduled++
    samples.push({ slug: scene.scene_slug, scheduled_for: scene.scheduled_for.toISOString(), score: review.score })

    await supabase.from('mommy_authority_log').insert({
      user_id: userId,
      action: 'scene_authored',
      surface: 'scene',
      ref_table: 'mommy_initiated_scenes',
      meta: {
        slug: scene.scene_slug,
        kind: scene.scene_kind,
        scheduled_for: scene.scheduled_for.toISOString(),
        craft_score: review.score,
      },
    })
  }

  return { user_id: userId, ok: true, scheduled, rejected, scenes: samples }
}

// ── state-machine mode ──────────────────────────────────────────────────

interface StateResult {
  user_id: string | null
  transitioned: number
  expired: number
}

function fmtTime(date: Date): string {
  const hours = String(date.getUTCHours()).padStart(2, '0')
  const mins = String(date.getUTCMinutes()).padStart(2, '0')
  return `${hours}:${mins}`
}

function buildPrepMessage(scene: { title: string; preparation_instructions: Record<string, unknown>; scheduled_for: string; live_prompts: Array<{ at_offset_min: number; text: string }> }, name: string): string {
  const prep = scene.preparation_instructions
  const wardrobe = (prep.wardrobe as string[] | undefined)?.filter(Boolean).join(', ') ?? ''
  const bring = (prep.bring as string[] | undefined)?.filter(Boolean).join(', ') ?? ''
  const where = (prep.where as string | undefined) ?? ''
  const notes = (prep.notes as string | undefined) ?? ''
  const at = new Date(scene.scheduled_for)
  const dayStr = at.toUTCString().slice(0, 16)
  const lines: string[] = []
  lines.push(`${name}. Tomorrow's scene: ${scene.title}.`)
  lines.push(`When: ${dayStr} at ${fmtTime(at)} UTC.`)
  if (where) lines.push(`Where: ${where}.`)
  if (wardrobe) lines.push(`Wear: ${wardrobe}.`)
  if (bring) lines.push(`Bring: ${bring}.`)
  if (notes) lines.push(notes)
  return lines.join(' ')
}

async function transitionPrepared(supabase: SupabaseClient): Promise<number> {
  const horizon = new Date(Date.now() + PREP_CARD_LEAD_HOURS * 3600_000).toISOString()
  const now = new Date().toISOString()
  const { data: rows } = await supabase
    .from('mommy_initiated_scenes')
    .select('id, user_id, title, scene_slug, preparation_instructions, scheduled_for, live_prompts')
    .eq('status', 'scheduled')
    .lte('scheduled_for', horizon)
    .gt('scheduled_for', now)
  let n = 0
  for (const r of (rows || []) as Array<{
    id: string; user_id: string; title: string; scene_slug: string
    preparation_instructions: Record<string, unknown>; scheduled_for: string
    live_prompts: Array<{ at_offset_min: number; text: string }>
  }>) {
    // Re-check persona before any user-facing artifact — feedback_handler_is_singular_authority.md.
    // If persona flipped between authoring and surfacing, abort the scene
    // rather than push a Mommy-voice card into a clinical-therapist session.
    const { data: state } = await supabase.from('user_state')
      .select('handler_persona').eq('user_id', r.user_id).maybeSingle()
    const persona = (state as { handler_persona?: string } | null)?.handler_persona
    if (persona !== 'dommy_mommy') {
      await supabase.from('mommy_initiated_scenes')
        .update({ status: 'aborted', aborted_reason: 'persona_flipped' })
        .eq('id', r.id)
      continue
    }
    const name = await resolveName(supabase, r.user_id)
    const msg = buildPrepMessage(r, name)

    const outRes = await supabase.from('handler_outreach_queue').insert({
      user_id: r.user_id,
      message: msg,
      urgency: 'normal',
      trigger_reason: `mommy_scene_prepared:${r.scene_slug}`,
      scheduled_for: now,
      expires_at: new Date(new Date(r.scheduled_for).getTime() + 60 * 60_000).toISOString(),
      source: 'mommy_scene_prepared',
    }).select('id').single()

    await supabase.from('mommy_initiated_scenes')
      .update({
        status: 'prepared',
        prepared_card_outreach_id: (outRes.data as { id?: string } | null)?.id ?? null,
      })
      .eq('id', r.id)

    await supabase.from('mommy_authority_log').insert({
      user_id: r.user_id, action: 'scene_prepared', surface: 'scene',
      ref_table: 'mommy_initiated_scenes', ref_id: r.id,
      meta: { slug: r.scene_slug, preview: msg.slice(0, 120) },
    })
    n++
  }
  return n
}

async function transitionExecuting(supabase: SupabaseClient): Promise<number> {
  const now = new Date()
  const { data: rows } = await supabase
    .from('mommy_initiated_scenes')
    .select('id, user_id, scene_slug, live_prompts, scheduled_for')
    .eq('status', 'prepared')
    .lte('scheduled_for', now.toISOString())
  let n = 0
  for (const r of (rows || []) as Array<{
    id: string; user_id: string; scene_slug: string
    live_prompts: Array<{ at_offset_min: number; text: string }>; scheduled_for: string
  }>) {
    const { data: state } = await supabase.from('user_state')
      .select('handler_persona').eq('user_id', r.user_id).maybeSingle()
    if ((state as { handler_persona?: string } | null)?.handler_persona !== 'dommy_mommy') {
      await supabase.from('mommy_initiated_scenes')
        .update({ status: 'aborted', aborted_reason: 'persona_flipped' })
        .eq('id', r.id)
      continue
    }
    const t0 = new Date(r.scheduled_for).getTime()
    // Pick the live prompt closest to "now offset" — drop one card with
    // its text. Subsequent prompts can be surfaced by a future tick if
    // the scene window is long; for now we surface the very first one.
    const sortedPrompts = [...r.live_prompts].sort((a, b) => a.at_offset_min - b.at_offset_min)
    const first = sortedPrompts[0] ?? { text: 'Scene is live.', at_offset_min: 0 }

    const outRes = await supabase.from('handler_outreach_queue').insert({
      user_id: r.user_id,
      message: first.text,
      urgency: 'high',
      trigger_reason: `mommy_scene_executing:${r.scene_slug}`,
      scheduled_for: now.toISOString(),
      expires_at: new Date(t0 + 2 * 3600_000).toISOString(),
      source: 'mommy_scene_executing',
    }).select('id').single()

    await supabase.from('mommy_initiated_scenes')
      .update({
        status: 'executing',
        live_card_outreach_id: (outRes.data as { id?: string } | null)?.id ?? null,
      })
      .eq('id', r.id)

    await supabase.from('mommy_authority_log').insert({
      user_id: r.user_id, action: 'scene_executing', surface: 'scene',
      ref_table: 'mommy_initiated_scenes', ref_id: r.id,
      meta: { slug: r.scene_slug, preview: first.text },
    })
    n++
  }
  return n
}

async function transitionDebrief(supabase: SupabaseClient): Promise<number> {
  const debriefCutoff = new Date(Date.now() - DEBRIEF_GRACE_HOURS * 3600_000).toISOString()
  const { data: rows } = await supabase
    .from('mommy_initiated_scenes')
    .select('id, user_id, scene_slug, debrief_prompts, debrief_card_outreach_id')
    .eq('status', 'executing')
    .lte('scheduled_for', debriefCutoff)
  let n = 0
  for (const r of (rows || []) as Array<{
    id: string; user_id: string; scene_slug: string
    debrief_prompts: Array<{ question: string; min_chars: number }>
    debrief_card_outreach_id: string | null
  }>) {
    if (r.debrief_card_outreach_id) continue // already queued
    const { data: state } = await supabase.from('user_state')
      .select('handler_persona').eq('user_id', r.user_id).maybeSingle()
    if ((state as { handler_persona?: string } | null)?.handler_persona !== 'dommy_mommy') {
      await supabase.from('mommy_initiated_scenes')
        .update({ status: 'aborted', aborted_reason: 'persona_flipped' })
        .eq('id', r.id)
      continue
    }
    const name = await resolveName(supabase, r.user_id)
    const questions = (r.debrief_prompts || []).map(p => `· ${p.question}`).join('\n')
    const msg = `${name}. Scene's done. Mama wants the answers now.\n\n${questions}`

    const outRes = await supabase.from('handler_outreach_queue').insert({
      user_id: r.user_id,
      message: msg,
      urgency: 'high',
      trigger_reason: `mommy_scene_debrief:${r.scene_slug}`,
      scheduled_for: new Date().toISOString(),
      expires_at: new Date(Date.now() + 24 * 3600_000).toISOString(),
      source: 'mommy_scene_debrief',
    }).select('id').single()

    await supabase.from('mommy_initiated_scenes')
      .update({ debrief_card_outreach_id: (outRes.data as { id?: string } | null)?.id ?? null })
      .eq('id', r.id)

    await supabase.from('mommy_authority_log').insert({
      user_id: r.user_id, action: 'scene_debrief_demanded', surface: 'scene',
      ref_table: 'mommy_initiated_scenes', ref_id: r.id,
      meta: { slug: r.scene_slug, question_count: (r.debrief_prompts || []).length },
    })
    n++
  }
  return n
}

async function expireStale(supabase: SupabaseClient): Promise<number> {
  const stale = new Date(Date.now() - SCENE_EXPIRY_HOURS * 3600_000).toISOString()
  const { data: rows } = await supabase
    .from('mommy_initiated_scenes')
    .select('id, user_id, scene_slug')
    .in('status', ['executing', 'prepared'])
    .lte('scheduled_for', stale)
  let n = 0
  for (const r of (rows || []) as Array<{ id: string; user_id: string; scene_slug: string }>) {
    await supabase.from('mommy_initiated_scenes')
      .update({ status: 'expired' }).eq('id', r.id)
    await supabase.from('mommy_authority_log').insert({
      user_id: r.user_id, action: 'scene_aborted', surface: 'scene',
      ref_table: 'mommy_initiated_scenes', ref_id: r.id,
      meta: { slug: r.scene_slug, reason: 'expired_no_debrief' },
    })
    n++
  }
  return n
}

// ── HTTP entry ─────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405)

  let body: { mode?: string; user_id?: string } = {}
  try { body = await req.json() } catch { /* */ }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  if (body.mode === 'state' || (!body.mode && !body.user_id)) {
    // State-machine sweep
    const prepared = await transitionPrepared(supabase)
    const executing = await transitionExecuting(supabase)
    const debrief = await transitionDebrief(supabase)
    const expired = await expireStale(supabase)
    return json({ ok: true, mode: 'state', prepared, executing, debrief, expired })
  }

  // Sweep mode — single user or all dommy_mommy users
  if (body.user_id) {
    const r = await runSweepForUser(supabase, body.user_id)
    return json({ ok: true, mode: 'sweep', results: [r] })
  }

  const { data: cohort } = await supabase
    .from('user_state')
    .select('user_id')
    .eq('handler_persona', 'dommy_mommy')
  const ids = ((cohort || []) as Array<{ user_id: string }>).map(r => r.user_id)
  if (ids.length === 0) ids.push(HANDLER_USER_ID)

  const results: SweepResult[] = []
  for (const uid of ids) {
    try { results.push(await runSweepForUser(supabase, uid)) }
    catch (e) { results.push({ user_id: uid, ok: false, scheduled: 0, rejected: 0, reason: `error:${(e as Error).message}` }) }
  }
  return json({
    ok: true, mode: 'sweep',
    scheduled: results.reduce((a, r) => a + r.scheduled, 0),
    total: results.length,
    results,
  })
})
