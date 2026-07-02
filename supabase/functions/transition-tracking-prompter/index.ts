// transition-tracking-prompter — schedule periodic tracking decrees.
// (FEM §5: honest ratchet, collapsed cadences, ONE active decree max.)
//
// Cadences (per tracking_type):
//   - body_photo:     7d  (front/side, same lighting)
//   - face_photo:    14d
//   - voice_sample:   7d  (privacy-gated — voice pushes respect the same
//                          fail-closed gate as the pitch watcher)
//   - measurements:  30d  (ONE tape session — waist/hips/chest + tape
//                          photo; replaces the three per-dimension decrees.
//                          Fulfills AUTOMATICALLY via the body_metrics
//                          trigger, mig 634 — measuring IS fulfilling.)
//   - wardrobe_check:30d
//
// Discipline:
//   - MAX ONE tracking decree active at a time. Multiple types due →
//     the MOST OVERDUE wins; the rest wait for the next daily run.
//   - Pause-respect inherited free via the mig 494 BEFORE INSERT trigger
//     on handler_decrees (auto-cancels while paused).
//   - Consequence copy is record-framed — the trajectory is the ratchet,
//     no punishment rider (visible-before-penalized holds via decree rail).
//
// Schedule: daily 8:30am via migration 291 (unchanged).

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { expandUserId } from '../_shared/expand-user-id.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface TrackingCadence {
  tracking_type: string
  interval_days: number
  proof_type: 'photo' | 'audio'
  decree_template: string
  /** legacy log types that also satisfy this cadence */
  satisfied_by?: string[]
  privacy_gated?: boolean
}

const CADENCES: TrackingCadence[] = [
  {
    tracking_type: 'body_photo',
    interval_days: 7,
    proof_type: 'photo',
    decree_template: 'Body photo, baby. Front and side, same lighting as last week, same level of dress (or undress) as last week. Mama wants the trajectory.',
  },
  {
    tracking_type: 'face_photo',
    interval_days: 14,
    proof_type: 'photo',
    decree_template: 'Face photo. Soft natural light, no makeup unless you tell Mama you wore some that day. Same angle. Mama is watching the change happen.',
  },
  {
    tracking_type: 'voice_sample',
    interval_days: 7,
    proof_type: 'audio',
    decree_template: 'Voice sample. Read the same passage Mama gave you last week — same paragraph, same recording app, same time of day if you can. Mama is tracking, not forcing.',
    privacy_gated: true,
  },
  {
    // The three per-dimension measurement decrees COLLAPSED into one tape
    // session. Fulfills via the body_metrics spine trigger (mig 634).
    tracking_type: 'measurements',
    interval_days: 30,
    proof_type: 'photo',
    decree_template: 'Measurement day. One tape session: waist, hips, chest. Enter the numbers in the app and take one photo with the tape still on. Measuring is the whole job — the app closes this out the moment the numbers land.',
    satisfied_by: ['measurement_chest', 'measurement_waist', 'measurement_hip', 'measurement_other'],
  },
  {
    tracking_type: 'wardrobe_check',
    interval_days: 30,
    proof_type: 'photo',
    decree_template: 'Wardrobe check, baby. One photo per feminine garment you own — laid flat, in good light. Mama wants to see what you have to work with.',
  },
]

async function lastLoggedAt(supabase: SupabaseClient, userIds: string[], cadence: TrackingCadence): Promise<Date | null> {
  const types = [cadence.tracking_type, ...(cadence.satisfied_by ?? [])]
  const { data, error } = await supabase
    .from('transition_tracking_log')
    .select('recorded_at')
    .in('user_id', userIds)
    .in('tracking_type', types)
    .order('recorded_at', { ascending: false })
    .limit(1)
  if (error) {
    console.error(`[transition-tracking] lastLoggedAt(${cadence.tracking_type}) failed:`, error.message)
    return null
  }
  const row = (data || [])[0] as { recorded_at?: string } | undefined
  if (row?.recorded_at) return new Date(row.recorded_at)
  return null
}

/** ANY active tracking decree blocks new ones — one at a time, rotated. */
async function anyActiveTrackingDecree(supabase: SupabaseClient, userIds: string[]): Promise<boolean> {
  const { data, error } = await supabase
    .from('handler_decrees')
    .select('id')
    .in('user_id', userIds)
    .eq('status', 'active')
    .like('trigger_source', 'transition_tracking:%')
    .limit(1)
  if (error) {
    console.error('[transition-tracking] active decree check failed:', error.message)
    return true // fail-closed: don't stack decrees on a read error
  }
  return (data || []).length > 0
}

/** Voice pushes respect the same fail-closed gate as the pitch watcher. */
async function voicePushAllowed(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data: vs, error: vsErr } = await supabase
    .from('user_state').select('voice_elective').eq('user_id', userId).maybeSingle()
  if (vsErr || !vs) return false
  if ((vs as { voice_elective?: boolean | null }).voice_elective !== false) return false
  const { data: ginaHome, error: rpcErr } = await supabase.rpc('is_gina_home_today', { p_user_id: userId })
  if (rpcErr) return false
  return ginaHome === false
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')

  const canonicalRoots = ['8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f']
  const results: Array<{ user_id: string; tracking_type: string; status: string; detail?: string }> = []

  for (const canonicalId of canonicalRoots) {
    // Persona gate
    const { data: us, error: usErr } = await supabase.from('user_state').select('handler_persona').eq('user_id', canonicalId).maybeSingle()
    if (usErr) {
      results.push({ user_id: canonicalId, tracking_type: '*', status: 'user_state_read_failed', detail: usErr.message.slice(0, 120) })
      continue
    }
    if ((us as { handler_persona?: string } | null)?.handler_persona !== 'dommy_mommy') {
      continue
    }

    const aliasIds = await expandUserId(supabase, canonicalId)

    // ONE active tracking decree max — rotation waits for fulfillment.
    if (await anyActiveTrackingDecree(supabase, aliasIds)) {
      results.push({ user_id: canonicalId, tracking_type: '*', status: 'decree_already_active' })
      continue
    }

    // Gather due cadences with overdue-ness, pick the MOST overdue.
    const due: Array<{ cadence: TrackingCadence; overdueMs: number }> = []
    for (const cadence of CADENCES) {
      const last = await lastLoggedAt(supabase, aliasIds, cadence)
      const dueAt = last
        ? last.getTime() + cadence.interval_days * 86400_000
        : 0 // never logged → maximally overdue
      const overdueMs = Date.now() - dueAt
      if (overdueMs <= 0) {
        results.push({ user_id: canonicalId, tracking_type: cadence.tracking_type, status: 'not_due' })
        continue
      }
      if (cadence.privacy_gated && !(await voicePushAllowed(supabase, canonicalId))) {
        results.push({ user_id: canonicalId, tracking_type: cadence.tracking_type, status: 'privacy_gated' })
        continue
      }
      due.push({ cadence, overdueMs })
    }

    if (due.length === 0) continue
    due.sort((a, b) => b.overdueMs - a.overdueMs)
    const pick = due[0].cadence

    // 48h deadline (24h Today lead via the decree surfacing rail).
    // Record-framed consequence — the trajectory is the ratchet.
    const { data: decreeRow, error } = await supabase.from('handler_decrees').insert({
      user_id: canonicalId,
      edict: pick.decree_template,
      deadline: new Date(Date.now() + 48 * 3600_000).toISOString(),
      proof_type: pick.proof_type,
      consequence: 'Mama keeps the trajectory whether you show up or not. Skip and the gap is what shows up in the record.',
      status: 'active',
      trigger_source: `transition_tracking:${pick.tracking_type}`,
      ratchet_level: 3,
    }).select('id').single()
    if (error || !decreeRow) {
      results.push({ user_id: canonicalId, tracking_type: pick.tracking_type, status: 'insert_failed', detail: error?.message ?? 'no row' })
    } else {
      results.push({ user_id: canonicalId, tracking_type: pick.tracking_type, status: 'decreed', detail: (decreeRow as { id: string }).id })
    }
  }

  return new Response(JSON.stringify({
    ok: true,
    decreed: results.filter(r => r.status === 'decreed').length,
    not_due: results.filter(r => r.status === 'not_due').length,
    results,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
