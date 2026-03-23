// Handler Calendar Enforcement — Edge Function
// 30-minute check loop. Sends reminders, device summons, and outreach
// for upcoming and missed calendar events.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const supabase = createClient(supabaseUrl, supabaseKey)

    const now = new Date()
    const in30min = new Date(now.getTime() + 30 * 60000)
    let reminders = 0
    let missed = 0
    let summons = 0

    // 1. Send reminders for events in the next 30 minutes
    const { data: upcoming } = await supabase
      .from('handler_calendar')
      .select('*')
      .eq('status', 'scheduled')
      .eq('reminder_sent', false)
      .lte('scheduled_at', in30min.toISOString())
      .gte('scheduled_at', now.toISOString())

    for (const event of upcoming || []) {
      // Send push notification reminder
      await supabase.from('scheduled_notifications').insert({
        user_id: event.user_id,
        notification_type: 'calendar_reminder',
        scheduled_for: now.toISOString(),
        expires_at: event.scheduled_at,
        payload: {
          title: 'Handler',
          body: `${event.title} in ${Math.round((new Date(event.scheduled_at).getTime() - now.getTime()) / 60000)} minutes.`,
          data: { calendar_id: event.id, event_type: event.event_type },
        },
        status: 'pending',
      })

      await supabase.from('handler_calendar')
        .update({ reminder_sent: true, status: 'reminded' })
        .eq('id', event.id)

      reminders++
    }

    // 2. Check for missed events (past deadline, still scheduled/reminded)
    const { data: overdue } = await supabase
      .from('handler_calendar')
      .select('*')
      .in('status', ['scheduled', 'reminded'])
      .lt('deadline_at', now.toISOString())

    for (const event of overdue || []) {
      // Mark as missed
      await supabase.from('handler_calendar')
        .update({ status: 'missed', missed_at: now.toISOString() })
        .eq('id', event.id)

      // Queue outreach if not already sent
      if (!event.outreach_sent) {
        await supabase.from('handler_outreach').insert({
          user_id: event.user_id,
          trigger_type: 'commitment_approaching',
          opening_line: `You missed "${event.title}". That was scheduled. Not optional.`,
          conversation_context: { calendar_id: event.id, event_type: event.event_type },
          scheduled_at: now.toISOString(),
          status: 'scheduled',
          expires_at: new Date(now.getTime() + 4 * 3600000).toISOString(),
        })

        await supabase.from('handler_calendar')
          .update({ outreach_sent: true })
          .eq('id', event.id)
      }

      // Device summons if not already sent
      if (!event.device_summons_sent) {
        await supabase.from('device_schedule').insert({
          user_id: event.user_id,
          schedule_type: 'enforcement',
          scheduled_at: now.toISOString(),
          duration_seconds: 30,
          intensity: 12,
          pattern: 'earthquake',
          trigger_source: 'calendar',
          trigger_id: event.id,
          status: 'scheduled',
        })

        await supabase.from('handler_calendar')
          .update({ device_summons_sent: true })
          .eq('id', event.id)

        summons++
      }

      missed++
    }

    // 3. Auto-complete events that are past their duration window and were in "reminded" status
    const completionWindow = new Date(now.getTime() - 2 * 3600000) // 2 hours ago
    const { data: stale } = await supabase
      .from('handler_calendar')
      .select('id')
      .eq('status', 'reminded')
      .lt('scheduled_at', completionWindow.toISOString())
      .gt('scheduled_at', new Date(now.getTime() - 24 * 3600000).toISOString()) // Not older than 24h

    for (const event of stale || []) {
      await supabase.from('handler_calendar')
        .update({ status: 'missed', missed_at: now.toISOString() })
        .eq('id', event.id)
    }

    return new Response(
      JSON.stringify({ success: true, reminders, missed, summons }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    console.error('Calendar enforcement error:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
