// Handler Commitment Enforcement — Edge Function
// Advances commitment state machine hourly via pg_cron.
// States: pending → approaching → due → overdue → enforcing → honored/dishonored

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
    const changes: Array<{ id: string; from: string; to: string; text: string }> = []

    // Get all users with active commitments
    const { data: users } = await supabase
      .from('commitments_v2')
      .select('user_id')
      .in('state', ['pending', 'approaching', 'due', 'overdue', 'enforcing'])
      .not('deadline', 'is', null)

    if (!users || users.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No active commitments' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Deduplicate user IDs
    const userIds = [...new Set(users.map(u => u.user_id))]

    for (const userId of userIds) {
      // Get user's parameter overrides
      const { data: paramRows } = await supabase
        .from('handler_parameters')
        .select('key, value')
        .eq('user_id', userId)
        .in('key', ['commitments.approaching_hours', 'commitments.due_hours'])

      const params: Record<string, number> = {}
      for (const p of paramRows || []) {
        params[p.key] = p.value
      }
      const approachingHours = params['commitments.approaching_hours'] ?? 72
      const dueHours = params['commitments.due_hours'] ?? 24

      // Get active commitments for this user
      const { data: commitments } = await supabase
        .from('commitments_v2')
        .select('*')
        .eq('user_id', userId)
        .in('state', ['pending', 'approaching', 'due', 'overdue', 'enforcing'])
        .not('deadline', 'is', null)

      if (!commitments) continue

      for (const c of commitments) {
        if (!c.deadline) continue
        const deadline = new Date(c.deadline)
        const hoursUntil = (deadline.getTime() - now.getTime()) / 3600000

        let newState: string | null = null

        if (c.state === 'pending' && hoursUntil <= approachingHours) {
          newState = 'approaching'
        } else if (c.state === 'approaching' && hoursUntil <= dueHours) {
          newState = 'due'
        } else if (['approaching', 'due'].includes(c.state) && hoursUntil <= 0) {
          newState = 'overdue'
        } else if (c.state === 'overdue') {
          newState = 'enforcing'
        }

        if (newState && newState !== c.state) {
          const transitions = (c.state_transitions || []) as Array<{ from: string; to: string; timestamp: string }>
          transitions.push({ from: c.state, to: newState, timestamp: now.toISOString() })

          const update: Record<string, unknown> = {
            state: newState,
            state_transitions: transitions,
          }

          // Escalate coercion on enforcing
          if (newState === 'enforcing') {
            update.coercion_stack_level = Math.min(7, (c.coercion_stack_level || 0) + 1)
            update.enforcement_attempts = (c.enforcement_attempts || 0) + 1
          }

          await supabase.from('commitments_v2').update(update).eq('id', c.id)

          changes.push({
            id: c.id,
            from: c.state,
            to: newState,
            text: c.commitment_text,
          })

          // If entering overdue or enforcing, queue outreach
          if (newState === 'overdue' || newState === 'enforcing') {
            await supabase.from('handler_outreach').insert({
              user_id: userId,
              trigger_type: 'commitment_approaching',
              opening_line: newState === 'enforcing'
                ? `You broke your word. "${c.commitment_text}" — what happens now is on you.`
                : `"${c.commitment_text}" — deadline passed. You know what you promised.`,
              conversation_context: { commitment_id: c.id, state: newState, coercion_level: update.coercion_stack_level || c.coercion_stack_level },
              scheduled_at: now.toISOString(),
              status: 'scheduled',
              expires_at: new Date(now.getTime() + 4 * 3600000).toISOString(),
            })

            // Queue push notification
            await supabase.from('scheduled_notifications').insert({
              user_id: userId,
              notification_type: 'commitment_enforcement',
              scheduled_for: now.toISOString(),
              expires_at: new Date(now.getTime() + 4 * 3600000).toISOString(),
              payload: {
                title: 'Handler',
                body: newState === 'enforcing'
                  ? `Broken commitment. Coercion level ${update.coercion_stack_level || c.coercion_stack_level}/7.`
                  : `"${c.commitment_text}" is overdue.`,
                data: { commitment_id: c.id },
              },
              status: 'pending',
            })
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, usersProcessed: userIds.length, stateChanges: changes.length, changes }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    console.error('Commitment enforcement error:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
