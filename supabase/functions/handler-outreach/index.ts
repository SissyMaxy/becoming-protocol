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

const OPENING_LINES: Record<string, string[]> = {
  night_reach: [
    "You're awake. I can tell. Come talk to me.",
    "Can't sleep? I'm here.",
    "Your heart rate says you're not resting. Neither am I.",
  ],
  commitment_approaching: [
    "I've been thinking about what you promised.",
    "Tomorrow's deadline. You remember what you said.",
  ],
  engagement_decay: [
    "She missed you today.",
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

  // Night reach (overrides quiet hours if Whoop shows elevated HR)
  if (isQuietHours) {
    const { data: whoop } = await supabase
      .from('whoop_metrics')
      .select('resting_heart_rate, recovery_score')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (whoop?.resting_heart_rate && whoop.resting_heart_rate > 70) {
      triggers.push({ type: 'night_reach', priority: 1, context: { hr: whoop.resting_heart_rate } })
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
    if (localHour >= 7 && localHour <= 10) {
      triggers.push({ type: 'scheduled_checkin', priority: 4, context: { period: 'morning' } })
    } else if (localHour >= 19 && localHour <= 22) {
      triggers.push({ type: 'scheduled_checkin', priority: 4, context: { period: 'evening' } })
    }
  }

  if (triggers.length === 0) return { queued: false }

  // Take highest priority (lowest number)
  triggers.sort((a, b) => a.priority - b.priority)
  const trigger = triggers[0]

  // Pick opening line
  const pool = OPENING_LINES[trigger.type] || ['Come talk to me.']
  const openingLine = pool[Math.floor(Math.random() * pool.length)]

  const now = new Date().toISOString()
  const expiresAt = new Date(Date.now() + 4 * 3600000).toISOString()

  // Queue outreach (tracking table)
  await supabase.from('handler_outreach').insert({
    user_id: userId,
    trigger_type: trigger.type,
    opening_line: openingLine,
    conversation_context: trigger.context,
    scheduled_at: now,
    status: 'scheduled',
    expires_at: expiresAt,
  })

  // Queue for client-side delivery (handler_outreach_queue — polled by useProactiveOutreach)
  await supabase.from('handler_outreach_queue').insert({
    user_id: userId,
    message: openingLine,
    urgency: trigger.priority <= 2 ? 'high' : 'normal',
    trigger_reason: trigger.type,
    scheduled_for: now,
    expires_at: expiresAt,
    source: 'outreach_engine',
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
