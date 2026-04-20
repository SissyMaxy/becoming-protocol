import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.24.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const WORKOUT_TEMPLATES: Record<string, { name: string; focus: string; exercises: any[]; duration: number }> = {
  glute_sculpt: {
    name: 'Glute Sculpt',
    focus: 'Build round, feminine glutes',
    exercises: [
      { name: 'Hip thrusts', sets: 4, reps: 12, notes: 'Squeeze at top for 2s' },
      { name: 'Bulgarian split squats', sets: 3, reps: 10, notes: 'Each leg' },
      { name: 'Cable kickbacks', sets: 3, reps: 15, notes: 'Each leg, slow negative' },
      { name: 'Sumo squats', sets: 3, reps: 12, notes: 'Wide stance, toes out' },
      { name: 'Fire hydrants', sets: 3, reps: 20, notes: 'Each side, band optional' },
      { name: 'Glute bridges', sets: 3, reps: 15, notes: 'Single leg if possible' },
    ],
    duration: 45,
  },
  hip_widening: {
    name: 'Hip Widening',
    focus: 'Lateral hip development for feminine silhouette',
    exercises: [
      { name: 'Side-lying hip abductions', sets: 4, reps: 20, notes: 'Each side, slow' },
      { name: 'Clamshells with band', sets: 3, reps: 15, notes: 'Each side' },
      { name: 'Lateral band walks', sets: 3, reps: 20, notes: 'Steps each direction' },
      { name: 'Curtsy lunges', sets: 3, reps: 12, notes: 'Each leg' },
      { name: 'Standing hip abduction (cable)', sets: 3, reps: 15, notes: 'Each side' },
    ],
    duration: 35,
  },
  waist_slimming: {
    name: 'Waist Cinch',
    focus: 'Core tightening + oblique work for smaller waist',
    exercises: [
      { name: 'Vacuum holds', sets: 5, reps: 1, notes: '30s each hold' },
      { name: 'Plank', sets: 3, reps: 1, notes: '45s each' },
      { name: 'Side plank', sets: 3, reps: 1, notes: '30s each side' },
      { name: 'Dead bugs', sets: 3, reps: 12, notes: 'Slow, controlled' },
      { name: 'Bird dogs', sets: 3, reps: 10, notes: 'Each side' },
    ],
    duration: 25,
  },
  posture_feminine: {
    name: 'Feminine Posture',
    focus: 'Open chest, relaxed shoulders, hip tilt',
    exercises: [
      { name: 'Wall angels', sets: 3, reps: 12, notes: 'Slow, full range' },
      { name: 'Thoracic extension on foam roller', sets: 3, reps: 1, notes: '60s each' },
      { name: 'Band pull-aparts', sets: 3, reps: 15, notes: 'Light band' },
      { name: 'Hip flexor stretch', sets: 3, reps: 1, notes: '45s each side' },
      { name: 'Cat-cow', sets: 3, reps: 10, notes: 'Emphasize pelvic tilt' },
      { name: 'Chin tucks', sets: 3, reps: 15, notes: 'Hold 5s each' },
    ],
    duration: 25,
  },
  flexibility: {
    name: 'Flexibility Flow',
    focus: 'Full body flexibility for feminine movement',
    exercises: [
      { name: 'Forward fold', sets: 1, reps: 1, notes: '90s hold' },
      { name: 'Pigeon pose', sets: 1, reps: 1, notes: '90s each side' },
      { name: 'Frog stretch', sets: 1, reps: 1, notes: '90s' },
      { name: 'Butterfly stretch', sets: 1, reps: 1, notes: '90s' },
      { name: 'Quad stretch', sets: 1, reps: 1, notes: '60s each' },
      { name: 'Shoulder opener', sets: 1, reps: 1, notes: '60s each arm' },
      { name: 'Spinal twist', sets: 1, reps: 1, notes: '60s each side' },
    ],
    duration: 20,
  },
  yoga_flow: {
    name: 'Feminine Yoga',
    focus: 'Graceful movement, body awareness, feminine energy',
    exercises: [
      { name: 'Sun salutation A', sets: 5, reps: 1, notes: 'Flow with breath' },
      { name: 'Warrior II', sets: 1, reps: 1, notes: '60s each side' },
      { name: 'Triangle pose', sets: 1, reps: 1, notes: '45s each side' },
      { name: 'Tree pose', sets: 1, reps: 1, notes: '45s each side' },
      { name: 'Goddess pose', sets: 1, reps: 1, notes: '60s — feel powerful' },
      { name: 'Seated forward fold', sets: 1, reps: 1, notes: '90s' },
      { name: 'Savasana', sets: 1, reps: 1, notes: '3 minutes, eyes closed' },
    ],
    duration: 30,
  },
  dance_cardio: {
    name: 'Dance Cardio',
    focus: 'Feminine movement patterns, hip isolation, confidence',
    exercises: [
      { name: 'Hip circles', sets: 2, reps: 20, notes: 'Each direction' },
      { name: 'Body rolls', sets: 3, reps: 10, notes: 'Slow, sensual' },
      { name: 'Freestyle dance', sets: 1, reps: 1, notes: '10 minutes to a playlist you love' },
      { name: 'Walking practice', sets: 1, reps: 1, notes: '5 minutes — heel-toe, hips move' },
    ],
    duration: 25,
  },
  recovery_stretch: {
    name: 'Recovery Day',
    focus: 'Gentle movement on low-recovery days',
    exercises: [
      { name: 'Foam rolling — full body', sets: 1, reps: 1, notes: '10 minutes' },
      { name: 'Gentle stretching', sets: 1, reps: 1, notes: '10 minutes, no strain' },
      { name: 'Deep breathing', sets: 1, reps: 1, notes: '5 minutes, belly breaths' },
    ],
    duration: 25,
  },
}

function selectWorkout(recovery: number | null, streak: number, preference: string | null): string {
  if (recovery !== null && recovery < 34) return 'recovery_stretch'
  if (recovery !== null && recovery < 50) {
    const light = ['flexibility', 'yoga_flow', 'posture_feminine']
    return light[Math.floor(Math.random() * light.length)]
  }

  // Rotate based on streak day to hit all areas
  const rotation = ['glute_sculpt', 'hip_widening', 'waist_slimming', 'posture_feminine', 'flexibility', 'yoga_flow', 'dance_cardio']
  if (preference && rotation.includes(preference)) {
    // Weight toward preference but still rotate
    if (Math.random() < 0.4) return preference
  }
  return rotation[streak % rotation.length]
}

serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supa = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  try {
    const today = new Date().toISOString().split('T')[0]

    const { data: users } = await supa
      .from('user_state')
      .select('user_id, workout_streak_days, workout_focus_preference')
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

      // Get Whoop recovery
      const { data: whoop } = await supa
        .from('whoop_metrics')
        .select('recovery_score')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle()

      const recovery = whoop ? (whoop as any).recovery_score as number : null
      const streak = (user.workout_streak_days as number) || 0
      const preference = (user.workout_focus_preference as string) || null

      const workoutType = selectWorkout(recovery, streak, preference)
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
        message: `Today's workout: ${template.name} (${template.duration}min). Focus: ${template.focus}. ${recovery !== null && recovery < 50 ? 'Recovery is low — I adjusted intensity.' : 'Recovery looks good — push hard.'} Check Force Layer for the full exercise list.`,
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
