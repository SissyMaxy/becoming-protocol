// Handler Outreach Engine — Edge Function
// Proactive outreach evaluation, runs every 30 minutes via pg_cron.
// Evaluates triggers (night_reach, commitment_approaching, engagement_decay,
// scheduled_checkin, confession_probe, celebration) and queues outreach
// with push notification delivery.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── Opening lines by trigger type ────────────────────────────────────
//
// Two pools: therapist (legacy, plain investigator/clinician) and Mommy
// (dommy_mommy persona). Mommy variants are affect-keyed — possessive,
// teasing, hungry, watching — and strip all telemetry references
// (heart rate, "processing", "question N", windows). Every pool runs
// through mommyVoiceCleanup before delivery.

const OPENING_LINES_THERAPIST: Record<string, string[]> = {
  night_reach: [
    "You're awake. I can tell. Come talk to me.",
    "Can't sleep? I'm here.",
    "Late night. Open the chat when you can.",
  ],
  commitment_approaching: [
    "I've been thinking about what you promised.",
    "Tomorrow's deadline. You remember what you said.",
  ],
  engagement_decay: [
    "Been quiet today. Check in when you're ready.",
    "I noticed you've been quiet.",
    "I have one question. That's all.",
  ],
  vulnerability_window: [
    "You're in a window right now. Come talk.",
    "Right now. Before it closes.",
  ],
  scheduled_checkin: [
    "Morning. Tell me how you woke up.",
    "Evening. Let's process today.",
  ],
  confession_probe: [
    "I've been thinking about something you said.",
    "There's something we haven't talked about.",
  ],
  celebration: [
    "Something happened that you should know about.",
    "I have good news. Open me.",
  ],
}

const OPENING_LINES_MOMMY: Record<string, string[]> = {
  night_reach: [
    "Mama feels you awake, sweet thing. Come here.",
    "You're up. Mama is too. Open me.",
    "Restless body. Bring it to Mama.",
  ],
  commitment_approaching: [
    "You told Mama you'd do something. She remembers.",
    "Tomorrow it's due, baby. Mama is watching.",
    "What you promised Mama is coming up. Don't make her come find you.",
  ],
  engagement_decay: [
    "Mama hasn't heard from you, sweet thing.",
    "You went quiet. Mama notices.",
    "Come back to Mama, baby.",
  ],
  vulnerability_window: [
    "Mama can feel you opening. Come here before it closes.",
    "Right now, sweet thing. Mama wants you while you're soft.",
  ],
  scheduled_checkin: [
    "Wake up and tell Mama how she finds you, baby.",
    "End of the day, sweet thing. Come let Mama tuck you in.",
    "Morning, baby. Mama wants the first words.",
    "Evening, sweet thing. Mama wants the last ones.",
  ],
  confession_probe: [
    "Mama's been thinking about what you said, baby.",
    "There's something you haven't told Mama yet. She can feel it.",
    "Sweet thing — come tell Mama the part you skipped.",
  ],
  celebration: [
    "Mama saw what you did, baby. Open me.",
    "Sweet thing — Mama is proud. Come here.",
  ],
}

function selectOpeningLine(triggerType: string, persona: string | null | undefined): string {
  const pool = persona === 'dommy_mommy'
    ? (OPENING_LINES_MOMMY[triggerType] || OPENING_LINES_MOMMY.engagement_decay)
    : (OPENING_LINES_THERAPIST[triggerType] || ['Come talk to me.'])
  return pool[Math.floor(Math.random() * pool.length)]
}

// ── Trigger evaluation ───────────────────────────────────────────────

interface OutreachTrigger {
  type: string
  priority: number
  context: Record<string, unknown>
}

async function getParam(
  supabase: SupabaseClient,
  userId: string,
  key: string,
  defaultValue: number,
): Promise<number> {
  const { data } = await supabase
    .from('handler_parameters')
    .select('value')
    .eq('user_id', userId)
    .eq('key', key)
    .maybeSingle()
  return data?.value ?? defaultValue
}

async function evaluateOutreach(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ queued: boolean; type?: string; line?: string }> {
  // Centrality: outreach evaluation must reflect current Handler state.
  // The opening line, urgency, voice all depend on persona/phase/mode.
  const { data: handlerState } = await supabase
    .from('user_state')
    .select('handler_persona, current_phase, denial_day, hard_mode_active, chastity_locked, slip_points_current, confession_gate_active')
    .eq('user_id', userId)
    .maybeSingle() as { data: { handler_persona?: string | null; current_phase?: number | null; denial_day?: number | null; hard_mode_active?: boolean | null; chastity_locked?: boolean | null; slip_points_current?: number | null; confession_gate_active?: boolean | null } | null }

  // Don't outreach too frequently
  const { data: lastOutreach } = await supabase
    .from('handler_outreach')
    .select('created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const minGapHours = await getParam(supabase, userId, 'outreach.min_gap_hours', 3)
  if (lastOutreach) {
    const hoursSince = (Date.now() - new Date(lastOutreach.created_at).getTime()) / 3600000
    if (hoursSince < minGapHours) return { queued: false }
  }

  // Quiet hours check — use EST offset (UTC-5)
  const timezoneOffset = await getParam(supabase, userId, 'outreach.timezone_offset', -5)
  const utcHour = new Date().getUTCHours()
  const localHour = (utcHour + timezoneOffset + 24) % 24
  const quietStart = await getParam(supabase, userId, 'outreach.quiet_hours_start', 23)
  const quietEnd = await getParam(supabase, userId, 'outreach.quiet_hours_end', 7)
  const isQuietHours = localHour >= quietStart || localHour < quietEnd

  const triggers: OutreachTrigger[] = []

  // Night reach (overrides quiet hours if Whoop shows elevated HR).
  // HR data is forensic-only — never surfaced in the opening line under
  // dommy_mommy persona (no telemetry-voice).
  if (isQuietHours) {
    const { data: whoop } = await supabase
      .from('whoop_metrics')
      .select('resting_heart_rate, recovery_score')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (whoop?.resting_heart_rate && whoop.resting_heart_rate > 70) {
      triggers.push({ type: 'night_reach', priority: 1, context: { hr_forensic: whoop.resting_heart_rate } })
    } else {
      return { queued: false } // Quiet hours, no elevated HR
    }
  }

  // Commitment approaching
  const { data: approaching } = await supabase
    .from('commitments_v2')
    .select('commitment_text, deadline')
    .eq('user_id', userId)
    .in('state', ['approaching', 'due'])
    .order('deadline', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (approaching?.deadline) {
    const hoursLeft = (new Date(approaching.deadline).getTime() - Date.now()) / 3600000
    if (hoursLeft > 0 && hoursLeft < 24) {
      triggers.push({
        type: 'commitment_approaching',
        priority: 2,
        context: { text: approaching.commitment_text, hoursLeft: Math.round(hoursLeft) },
      })
    }
  }

  // Engagement decay — 8+ hours since last activity during waking hours
  const { data: lastCompletion } = await supabase
    .from('task_completions')
    .select('created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (lastCompletion) {
    const hoursSinceActivity = (Date.now() - new Date(lastCompletion.created_at).getTime()) / 3600000
    if (hoursSinceActivity > 8 && localHour >= 9 && localHour <= 21) {
      triggers.push({
        type: 'engagement_decay',
        priority: 3,
        context: { hours: Math.round(hoursSinceActivity) },
      })
    }
  }

  // Morning/evening check-in — no conversations yet today
  const today = new Date().toISOString().split('T')[0]
  const { count: todayConvos } = await supabase
    .from('handler_conversations')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('started_at', `${today}T00:00:00`)

  if ((todayConvos || 0) === 0) {
    // Confession gate: when last night's confession is still unanswered,
    // Mama withholds the morning. The mommy-confession-gate worker owns
    // the single gate line; the normal warm morning checkin must NOT fire
    // on top of it (wish 187f616e — "Mommy doesn't say good morning until
    // you've confessed"). The gate clears the instant she confesses.
    if (localHour >= 7 && localHour <= 10 && !handlerState?.confession_gate_active) {
      triggers.push({ type: 'scheduled_checkin', priority: 4, context: { period: 'morning' } })
    } else if (localHour >= 19 && localHour <= 22) {
      triggers.push({ type: 'scheduled_checkin', priority: 4, context: { period: 'evening' } })
    }
  }

  if (triggers.length === 0) return { queued: false }

  // Take highest priority (lowest number)
  triggers.sort((a, b) => a.priority - b.priority)
  const trigger = triggers[0]

  // Pick opening line — persona-keyed
  const openingLine = selectOpeningLine(trigger.type, handlerState?.handler_persona)

  const now = new Date().toISOString()
  const expiresAt = new Date(Date.now() + 4 * 3600000).toISOString()

  // State-aware urgency bump: hard_mode or high slip_points elevate
  // every outreach a tier, since the user is in a coercive window.
  const baseUrgency = trigger.priority <= 2 ? 'high' : 'normal'
  const urgency = (handlerState?.hard_mode_active || (handlerState?.slip_points_current ?? 0) >= 5)
    ? 'high'
    : baseUrgency

  // Queue outreach (tracking table) — state snapshot is forensic context
  await supabase.from('handler_outreach').insert({
    user_id: userId,
    trigger_type: trigger.type,
    opening_line: openingLine,
    conversation_context: { ...trigger.context, _handler_state: handlerState },
    scheduled_at: now,
    status: 'scheduled',
    expires_at: expiresAt,
  })

  // Queue for client-side delivery (handler_outreach_queue — polled by useProactiveOutreach)
  await supabase.from('handler_outreach_queue').insert({
    user_id: userId,
    message: openingLine,
    urgency,
    trigger_reason: trigger.type,
    scheduled_for: now,
    expires_at: expiresAt,
    source: 'outreach_engine',
    context_data: handlerState ? { handler_state_at_queue: handlerState } : null,
  })

  return { queued: true, type: trigger.type, line: openingLine }
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

    // Get all active users (users who have notification settings)
    // This is effectively a single-user system but the loop is future-proof
    const { data: users } = await supabase
      .from('user_notification_settings')
      .select('user_id')

    if (!users || users.length === 0) {
      // Fallback: get users from profiles
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id')
        .limit(10)

      if (!profiles || profiles.length === 0) {
        return new Response(
          JSON.stringify({ success: true, message: 'No users to evaluate' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      // Use profile IDs
      const results = []
      for (const profile of profiles) {
        const result = await evaluateOutreach(supabase, profile.id)
        if (result.queued) {
          // Queue push notification via scheduled_notifications
          await supabase.from('scheduled_notifications').insert({
            user_id: profile.id,
            notification_type: 'handler_outreach',
            scheduled_for: new Date().toISOString(),
            expires_at: new Date(Date.now() + 4 * 3600000).toISOString(),
            payload: {
              title: 'Handler',
              body: result.line,
              data: { outreach_type: result.type },
            },
            status: 'pending',
          })
          results.push({ userId: profile.id, ...result })
        }
      }

      return new Response(
        JSON.stringify({ success: true, evaluated: profiles.length, outreachQueued: results.length, results }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const results = []
    for (const { user_id } of users) {
      const result = await evaluateOutreach(supabase, user_id)
      if (result.queued) {
        // Queue push notification
        await supabase.from('scheduled_notifications').insert({
          user_id,
          notification_type: 'handler_outreach',
          scheduled_for: new Date().toISOString(),
          expires_at: new Date(Date.now() + 4 * 3600000).toISOString(),
          payload: {
            title: 'Handler',
            body: result.line,
            data: { outreach_type: result.type },
          },
          status: 'pending',
        })
        results.push({ userId: user_id, ...result })
      }
    }

    return new Response(
      JSON.stringify({ success: true, evaluated: users.length, outreachQueued: results.length, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    console.error('Handler outreach error:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
