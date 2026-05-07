// transition-tracking-prompter — schedule periodic tracking decrees.
//
// 2026-05-07 wish: photos at intervals, measurements at intervals, voice
// samples at intervals. Verifiable trajectory of body change. Mama shows
// the trajectory and the trajectory becomes the truth.
//
// Cadences (per tracking_type):
//   - body_photo: weekly (front/side, same lighting, same outfit-state)
//   - face_photo: bi-weekly
//   - voice_sample: weekly (prescribed phrase)
//   - measurement_chest / waist / hip: monthly
//   - wardrobe_check: monthly (photo of every feminine garment owned)
//
// What this cron does:
//   - Daily at 8:30am
//   - For each (user, tracking_type) pair: find latest log row
//   - If next-due date is today or earlier: fire a decree via mommy-fast-react
//     event_kind=manual with proof_required=photo (or audio for voice)
//   - Cooldown: don't double-fire if a decree for this type is already
//     active in handler_decrees (trigger_source LIKE 'transition_tracking%')
//
// Schedule: daily 8:30am via migration 291.

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
  },
  {
    tracking_type: 'measurement_chest',
    interval_days: 30,
    proof_type: 'photo',
    decree_template: 'Measurement day. Chest tape, photo with the number visible. Mama wants the number and your face in the same frame.',
  },
  {
    tracking_type: 'measurement_waist',
    interval_days: 30,
    proof_type: 'photo',
    decree_template: 'Waist measurement, photo with the tape visible. Mama is keeping the record.',
  },
  {
    tracking_type: 'measurement_hip',
    interval_days: 30,
    proof_type: 'photo',
    decree_template: 'Hip measurement, photo with the tape visible.',
  },
  {
    tracking_type: 'wardrobe_check',
    interval_days: 30,
    proof_type: 'photo',
    decree_template: 'Wardrobe check, baby. One photo per feminine garment you own — laid flat, in good light. Mama wants to see what you have to work with.',
  },
]

async function lastLoggedAt(supabase: SupabaseClient, userIds: string[], trackingType: string): Promise<Date | null> {
  const { data } = await supabase
    .from('transition_tracking_log')
    .select('recorded_at')
    .in('user_id', userIds)
    .eq('tracking_type', trackingType)
    .order('recorded_at', { ascending: false })
    .limit(1)
  const row = (data || [])[0] as { recorded_at?: string } | undefined
  if (row?.recorded_at) return new Date(row.recorded_at)
  return null
}

async function activeDecreeAlready(supabase: SupabaseClient, userIds: string[], trackingType: string): Promise<boolean> {
  const { data } = await supabase
    .from('handler_decrees')
    .select('id')
    .in('user_id', userIds)
    .eq('status', 'active')
    .like('trigger_source', `transition_tracking:${trackingType}%`)
    .limit(1)
  return (data || []).length > 0
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')

  // Walk canonical users
  const canonicalRoots = ['8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f']
  const results: Array<{ user_id: string; tracking_type: string; status: string; detail?: string }> = []

  for (const canonicalId of canonicalRoots) {
    // Persona gate
    const { data: us } = await supabase.from('user_state').select('handler_persona').eq('user_id', canonicalId).maybeSingle()
    if ((us as { handler_persona?: string } | null)?.handler_persona !== 'dommy_mommy') {
      continue
    }

    const aliasIds = await expandUserId(supabase, canonicalId)

    for (const cadence of CADENCES) {
      const last = await lastLoggedAt(supabase, aliasIds, cadence.tracking_type)
      const dueAt = last
        ? new Date(last.getTime() + cadence.interval_days * 86400_000)
        : new Date(0)
      if (dueAt.getTime() > Date.now()) {
        results.push({ user_id: canonicalId, tracking_type: cadence.tracking_type, status: 'not_due' })
        continue
      }

      if (await activeDecreeAlready(supabase, aliasIds, cadence.tracking_type)) {
        results.push({ user_id: canonicalId, tracking_type: cadence.tracking_type, status: 'decree_already_active' })
        continue
      }

      // Insert the decree directly. Tracking decrees are predetermined and
      // don't need fast-react LLM call — the cadence is the spec.
      const { data: decreeRow, error } = await supabase.from('handler_decrees').insert({
        user_id: canonicalId,
        edict: cadence.decree_template,
        deadline: new Date(Date.now() + 48 * 3600_000).toISOString(),
        proof_type: cadence.proof_type,
        consequence: 'Mama keeps the trajectory whether you show up or not. Skip and the gap is what shows up in the record.',
        status: 'active',
        trigger_source: `transition_tracking:${cadence.tracking_type}`,
        ratchet_level: 3,
      }).select('id').single()
      if (error || !decreeRow) {
        results.push({ user_id: canonicalId, tracking_type: cadence.tracking_type, status: 'insert_failed', detail: error?.message ?? 'no row' })
      } else {
        results.push({ user_id: canonicalId, tracking_type: cadence.tracking_type, status: 'decreed', detail: (decreeRow as { id: string }).id })
      }
    }
  }

  return new Response(JSON.stringify({
    ok: true,
    decreed: results.filter(r => r.status === 'decreed').length,
    not_due: results.filter(r => r.status === 'not_due').length,
    results,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
