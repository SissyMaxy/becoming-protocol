// Device Control Engine — Edge Function
// Autonomous Lovense scheduling: 5-minute check loop via pg_cron.
// Generates daily schedules (morning anchor, ambient pulses, denial scaling).
// Executes due commands via Lovense Cloud API.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── Lovense Cloud API ────────────────────────────────────────────────

async function sendLovenseCommand(
  supabase: SupabaseClient,
  userId: string,
  intensity: number,
  durationSec: number,
  deviceId?: string,
): Promise<{ success: boolean; error?: string }> {
  // Get user's Lovense cloud token
  const { data: connection } = await supabase
    .from('lovense_connections')
    .select('cloud_token, uid')
    .eq('user_id', userId)
    .eq('status', 'connected')
    .maybeSingle()

  if (!connection?.cloud_token) {
    return { success: false, error: 'No Lovense connection' }
  }

  try {
    const body: Record<string, unknown> = {
      token: connection.cloud_token,
      uid: connection.uid,
      command: 'Function',
      action: `Vibrate:${intensity}`,
      timeSec: durationSec,
      apiVer: 1,
    }

    if (deviceId) {
      body.toy = deviceId
    }

    const response = await fetch('https://api.lovense-api.com/api/lan/v2/command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    const result = await response.json()
    return { success: result.code === 200 || result.result === true }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

// ── Schedule Generation ──────────────────────────────────────────────

async function generateDailySchedule(
  supabase: SupabaseClient,
  userId: string,
): Promise<number> {
  const today = new Date().toISOString().split('T')[0]

  // Check if schedule already exists for today
  const { count } = await supabase
    .from('device_schedule')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('scheduled_at', `${today}T00:00:00`)
    .lte('scheduled_at', `${today}T23:59:59`)

  if ((count || 0) > 0) return 0

  // Get denial day for scaling
  const { data: userState } = await supabase
    .from('user_state')
    .select('denial_day')
    .eq('user_id', userId)
    .maybeSingle()

  const denialDay = userState?.denial_day ?? 0

  // Get timezone offset
  const { data: tzParam } = await supabase
    .from('handler_parameters')
    .select('value')
    .eq('user_id', userId)
    .eq('key', 'outreach.timezone_offset')
    .maybeSingle()

  const tzOffset = tzParam?.value ?? -5 // EST default
  const utcAdjust = -tzOffset // Convert local to UTC

  const schedules: Array<Record<string, unknown>> = []

  // 1. Morning Anchor — gentle wake-up pulse at 7 AM local
  const morningHourUTC = (7 + utcAdjust + 24) % 24
  schedules.push({
    user_id: userId,
    schedule_type: 'morning_anchor',
    scheduled_at: `${today}T${String(morningHourUTC).padStart(2, '0')}:00:00Z`,
    duration_seconds: 15,
    intensity: Math.min(5 + Math.floor(denialDay / 3), 12), // Scale with denial
    pattern: 'pulse',
    trigger_source: 'cron',
    denial_day: denialDay,
    status: 'scheduled',
  })

  // 2. Ambient conditioning — 3-5 variable-ratio pulses throughout the day
  // Variable ratio: unpredictable timing is more conditioning-effective
  const pulseCount = 3 + Math.min(Math.floor(denialDay / 7), 4) // 3-7 based on denial
  const startHour = 9
  const endHour = 22
  const windowMinutes = (endHour - startHour) * 60

  for (let i = 0; i < pulseCount; i++) {
    // Random time within window (variable ratio schedule)
    const randomMinute = Math.floor(Math.random() * windowMinutes)
    const pulseHour = startHour + Math.floor(randomMinute / 60)
    const pulseMin = randomMinute % 60
    const utcPulseHour = (pulseHour + utcAdjust + 24) % 24

    schedules.push({
      user_id: userId,
      schedule_type: 'ambient_pulse',
      scheduled_at: `${today}T${String(utcPulseHour).padStart(2, '0')}:${String(pulseMin).padStart(2, '0')}:00Z`,
      duration_seconds: 5 + Math.floor(Math.random() * 20), // 5-25 seconds
      intensity: Math.min(3 + Math.floor(denialDay / 5), 10), // Denial-scaled
      pattern: ['pulse', 'wave', 'fireworks'][Math.floor(Math.random() * 3)],
      trigger_source: 'cron',
      denial_day: denialDay,
      status: 'scheduled',
    })
  }

  // 3. Denial ramp — evening escalation (8 PM local) on high denial days
  if (denialDay >= 3) {
    const eveningHourUTC = (20 + utcAdjust + 24) % 24
    schedules.push({
      user_id: userId,
      schedule_type: 'denial_ramp',
      scheduled_at: `${today}T${String(eveningHourUTC).padStart(2, '0')}:00:00Z`,
      duration_seconds: 30 + denialDay * 5, // Longer on higher denial days
      intensity: Math.min(8 + denialDay, 20), // Intense
      pattern: 'wave',
      trigger_source: 'cron',
      denial_day: denialDay,
      status: 'scheduled',
    })
  }

  // 4. Vulnerability mode — low background stimulation during predicted vulnerability windows
  // Check timing predictions for vulnerability
  const { data: predictions } = await supabase
    .from('state_predictions')
    .select('time_block, resistance_risk')
    .eq('user_id', userId)
    .eq('prediction_date', today)
    .gt('resistance_risk', 0.5)

  for (const pred of predictions || []) {
    // Parse time block (e.g., "18-21") to get start hour
    const blockStart = parseInt(pred.time_block.split('-')[0], 10)
    if (isNaN(blockStart)) continue

    const vulnHourUTC = (blockStart + utcAdjust + 24) % 24

    schedules.push({
      user_id: userId,
      schedule_type: 'vulnerability',
      scheduled_at: `${today}T${String(vulnHourUTC).padStart(2, '0')}:00:00Z`,
      duration_seconds: 10,
      intensity: Math.min(4 + Math.floor(denialDay / 4), 8), // Low, persistent
      pattern: 'pulse',
      pattern_data: { note: 'vulnerability_window', resistance_risk: pred.resistance_risk },
      trigger_source: 'prediction',
      denial_day: denialDay,
      status: 'scheduled',
    })
  }

  // 5. Session pull — 5 minutes before any scheduled session, start gentle build
  const { data: upcomingSessions } = await supabase
    .from('handler_calendar')
    .select('id, scheduled_at, event_type')
    .eq('user_id', userId)
    .in('event_type', ['session', 'conditioning'])
    .in('status', ['scheduled', 'reminded'])
    .gte('scheduled_at', `${today}T00:00:00`)
    .lte('scheduled_at', `${today}T23:59:59`)

  for (const session of upcomingSessions || []) {
    const sessionTime = new Date(session.scheduled_at)
    const pullTime = new Date(sessionTime.getTime() - 5 * 60000) // 5 min before

    schedules.push({
      user_id: userId,
      schedule_type: 'session_pull',
      scheduled_at: pullTime.toISOString(),
      duration_seconds: 60, // 1 minute gentle build
      intensity: Math.min(6 + Math.floor(denialDay / 5), 12),
      pattern: 'wave',
      pattern_data: { session_id: session.id, session_type: session.event_type },
      trigger_source: 'calendar',
      trigger_id: session.id,
      denial_day: denialDay,
      status: 'scheduled',
    })
  }

  // Insert all schedules
  if (schedules.length > 0) {
    await supabase.from('device_schedule').insert(schedules)
  }

  return schedules.length
}

// ── Schedule Execution ───────────────────────────────────────────────

async function executeDueSchedules(
  supabase: SupabaseClient,
): Promise<{ executed: number; failed: number }> {
  const now = new Date().toISOString()

  // Get all due schedules
  const { data: due } = await supabase
    .from('device_schedule')
    .select('*')
    .eq('status', 'scheduled')
    .lte('scheduled_at', now)
    .order('scheduled_at', { ascending: true })
    .limit(20)

  if (!due || due.length === 0) return { executed: 0, failed: 0 }

  let executed = 0
  let failed = 0

  for (const schedule of due) {
    // Check if expired
    if (schedule.expires_at && new Date(schedule.expires_at) < new Date()) {
      await supabase
        .from('device_schedule')
        .update({ status: 'skipped', result: { reason: 'expired' } })
        .eq('id', schedule.id)
      continue
    }

    // Mark as executing
    await supabase
      .from('device_schedule')
      .update({ status: 'executing', executed_at: now })
      .eq('id', schedule.id)

    // Send command
    const result = await sendLovenseCommand(
      supabase,
      schedule.user_id,
      schedule.intensity,
      schedule.duration_seconds,
      schedule.device_id,
    )

    // Log event
    await supabase.from('device_events').insert({
      user_id: schedule.user_id,
      schedule_id: schedule.id,
      event_type: result.success ? 'command_sent' : 'device_offline',
      device_id: schedule.device_id,
      intensity: schedule.intensity,
      details: {
        pattern: schedule.pattern,
        duration: schedule.duration_seconds,
        denial_day: schedule.denial_day,
        trigger: schedule.trigger_source,
        error: result.error,
      },
    })

    // Update status
    await supabase
      .from('device_schedule')
      .update({
        status: result.success ? 'completed' : 'failed',
        result: { success: result.success, error: result.error },
      })
      .eq('id', schedule.id)

    if (result.success) {
      executed++
    } else {
      failed++
    }
  }

  return { executed, failed }
}

// ── Enforcement Mode ─────────────────────────────────────────────────

async function checkEnforcement(
  supabase: SupabaseClient,
): Promise<number> {
  // Find commitments in enforcing state that haven't triggered device yet
  const { data: enforcing } = await supabase
    .from('commitments_v2')
    .select('id, user_id, commitment_text, coercion_stack_level, lovense_summons_fired')
    .eq('state', 'enforcing')
    .eq('lovense_summons_fired', false)

  if (!enforcing || enforcing.length === 0) return 0

  let triggered = 0

  for (const c of enforcing) {
    // Escalating enforcement pattern
    const intensity = Math.min(10 + c.coercion_stack_level * 2, 20)
    const duration = 30 + c.coercion_stack_level * 15 // 30s to 135s

    await supabase.from('device_schedule').insert({
      user_id: c.user_id,
      schedule_type: 'enforcement',
      scheduled_at: new Date().toISOString(),
      duration_seconds: duration,
      intensity,
      pattern: 'earthquake',
      trigger_source: 'commitment',
      trigger_id: c.id,
      status: 'scheduled',
    })

    // Mark summons as fired
    await supabase
      .from('commitments_v2')
      .update({ lovense_summons_fired: true })
      .eq('id', c.id)

    triggered++
  }

  return triggered
}

// ── Edge function handler ────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const supabase = createClient(supabaseUrl, supabaseKey)

    // 1. Generate daily schedule for each user (if not yet done)
    const { data: users } = await supabase
      .from('lovense_connections')
      .select('user_id')
      .eq('status', 'connected')

    let scheduled = 0
    if (users) {
      for (const { user_id } of users) {
        scheduled += await generateDailySchedule(supabase, user_id)
      }
    }

    // 2. Execute due schedules
    const execution = await executeDueSchedules(supabase)

    // 3. Check enforcement triggers
    const enforcement = await checkEnforcement(supabase)

    return new Response(
      JSON.stringify({
        success: true,
        scheduled,
        executed: execution.executed,
        failed: execution.failed,
        enforcement,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    console.error('Device control error:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
