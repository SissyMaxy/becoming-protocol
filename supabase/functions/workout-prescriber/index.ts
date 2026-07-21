import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.24.3'
import { requireServiceRole } from '../_shared/request-auth.ts'
import { selectWorkout } from '../_shared/workout-select.ts'
import { WORKOUT_TEMPLATES } from '../_shared/workout-templates.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const unauthorized = await requireServiceRole(req, corsHeaders)
  if (unauthorized) return unauthorized

  const supa = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  try {
    const today = new Date().toISOString().split('T')[0]

    const { data: users } = await supa
      .from('user_state')
      .select('user_id, workout_focus_preference')
      .limit(50)

    let prescribed = 0

    for (const user of (users ?? []) as any[]) {
      const userId = user.user_id as string

      // Already prescribed today?
      const { data: existing } = await supa
        .from('workout_prescriptions')
        .select('id')
        .eq('user_id', userId)
        .eq('scheduled_date', today)
        .maybeSingle()

      if (existing) continue

      // Body-program users get their session from the mommy-led weekday split
      // (body-program.ts + mig 681/682) — don't prescribe a second workout.
      const { data: bodyProgram } = await supa
        .from('reconditioning_targets')
        .select('id')
        .eq('user_id', userId)
        .eq('status', 'active')
        .eq('indicator_config->>program', 'body_conditioning')
        .limit(1)
        .maybeSingle()

      if (bodyProgram) continue

      // Get Whoop recovery
      const { data: whoop } = await supa
        .from('whoop_metrics')
        .select('recovery_score')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle()

      const recovery = whoop ? (whoop as any).recovery_score as number : null
      const preference = (user.workout_focus_preference as string) || null

      const workoutType = selectWorkout({ recovery, dateISO: today, preference })
      const template = WORKOUT_TEMPLATES[workoutType]
      if (!template) continue

      await supa.from('workout_prescriptions').insert({
        user_id: userId,
        workout_type: workoutType,
        focus_area: template.focus,
        exercises: template.exercises,
        duration_minutes: template.duration,
        scheduled_date: today,
        whoop_recovery_at_prescription: recovery,
        status: 'prescribed',
      })

      // Queue outreach
      await supa.from('handler_outreach_queue').insert({
        user_id: userId,
        message: `Today's workout: ${template.name} (${template.duration}min). Focus: ${template.focus}. ${recovery !== null && recovery < 50 ? 'Recovery is low — I adjusted intensity.' : 'Recovery looks good — push hard.'} The full routine is on your home screen.`,
        urgency: 'normal',
        trigger_reason: 'daily_workout',
        scheduled_for: new Date().toISOString(),
        expires_at: new Date(Date.now() + 12 * 3600000).toISOString(),
      })

      prescribed++
    }

    return new Response(JSON.stringify({ ok: true, prescribed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
