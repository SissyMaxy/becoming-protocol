import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.24.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supa = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  try {
    const now = new Date()
    const hourUTC = now.getUTCHours()
    const today = now.toISOString().split('T')[0]

    // Get users with active state
    const { data: users } = await supa
      .from('user_state')
      .select('user_id, denial_day, hard_mode_active, chastity_locked, chastity_streak_days, tasks_completed_today, current_arousal, gina_home, slip_points_rolling_24h')
      .limit(50)

    if (!users || users.length === 0) {
      return new Response(JSON.stringify({ ok: true, queued: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let queued = 0

    for (const user of users as any[]) {
      const userId = user.user_id as string

      // Check if we already sent outreach this hour (throttle)
      const { data: recent } = await supa
        .from('handler_outreach_queue')
        .select('id')
        .eq('user_id', userId)
        .gte('created_at', new Date(now.getTime() - 3600000).toISOString())
        .limit(1)
        .maybeSingle()

      if (recent) continue

      // Check if user has opened app recently — don't interrupt active use
      const { data: recentMsg } = await supa
        .from('handler_messages')
        .select('created_at')
        .eq('user_id', userId)
        .eq('role', 'user')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      const minutesSinceLastMessage = recentMsg
        ? Math.round((now.getTime() - new Date((recentMsg as any).created_at).getTime()) / 60000)
        : 999999
      const hoursSinceLastMessage = Math.round(minutesSinceLastMessage / 60)

      // Hard gate: never fire outreach if user engaged within the last 30 min.
      // This prevents the "you've been quiet" spam that fires seconds after
      // the user just sent a message in a live chat.
      if (minutesSinceLastMessage < 30) continue

      // Query yesterday's actual task count (tasks_completed_today rolls at
      // midnight, so using it as "yesterday" produces false "zero tasks
      // yesterday" claims every morning).
      const yesterdayDate = new Date(now.getTime() - 86400000).toISOString().split('T')[0]
      const { count: yesterdayTaskCount } = await supa
        .from('task_completions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('completed_at', `${yesterdayDate}T00:00:00`)
        .lt('completed_at', `${today}T00:00:00`)
      const yesterdayTasks = yesterdayTaskCount ?? null

      // HRT funnel stuck-step evaluator — daily. Every day she stays on the
      // same step past threshold, days_stuck_on_step increments. At 7 days
      // stuck on any non-terminal step, queue a high-urgency outreach and
      // bleed event so "I'll do it next week" has real cost. Terminal step
      // 'adherent' and pre-commit step 'uncommitted' are exempt.
      try {
        const { data: funnel } = await supa
          .from('hrt_funnel')
          .select('current_step, step_entered_at, days_stuck_on_step')
          .eq('user_id', userId)
          .maybeSingle()

        if (funnel && funnel.current_step && funnel.step_entered_at) {
          const skipSteps = new Set(['uncommitted', 'adherent'])
          if (!skipSteps.has(funnel.current_step as string)) {
            const entered = new Date(funnel.step_entered_at as string).getTime()
            const daysOnStep = Math.floor((now.getTime() - entered) / 86400000)
            if (daysOnStep !== (funnel.days_stuck_on_step as number)) {
              await supa
                .from('hrt_funnel')
                .update({ days_stuck_on_step: daysOnStep })
                .eq('user_id', userId)
            }

            if (daysOnStep >= 7) {
              const { data: existingBleed } = await supa
                .from('financial_bleed_events')
                .select('id')
                .eq('user_id', userId)
                .eq('reason', `hrt_funnel_stuck: ${funnel.current_step}`)
                .gte('created_at', new Date(now.getTime() - 7 * 86400000).toISOString())
                .limit(1)
                .maybeSingle()

              if (!existingBleed) {
                await supa.from('financial_bleed_events').insert({
                  user_id: userId,
                  amount_cents: 2500,
                  reason: `hrt_funnel_stuck: ${funnel.current_step}`,
                  tasks_missed: daysOnStep,
                  destination: 'queued',
                  status: 'queued',
                })
              }
            }
          }
        }
      } catch (hrtErr) {
        console.error('[OutreachAuto] HRT funnel evaluator failed:', hrtErr)
      }

      // Financial bleeding evaluator — queue a bleed event when compliance
      // collapses. Queue only; actual money transfer requires human-in-loop.
      // Trigger: fewer than 2 task completions in the last 72h AND at least 1
      // assigned task that's past due. Dedupe against any open bleed from the
      // last 24h so we don't stack.
      try {
        const [{ count: completionsRecent }, { count: overdueAssigned }, { data: recentBleed }] = await Promise.all([
          supa.from('task_completions').select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .gte('completed_at', new Date(now.getTime() - 72 * 3600000).toISOString()),
          supa.from('assigned_tasks').select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .is('completed_at', null)
            .is('skipped_at', null)
            .lt('deadline', now.toISOString()),
          supa.from('financial_bleed_events').select('id, created_at')
            .eq('user_id', userId)
            .gte('created_at', new Date(now.getTime() - 24 * 3600000).toISOString())
            .limit(1)
            .maybeSingle(),
        ])

        const completions72h = completionsRecent ?? 0
        const overdue = overdueAssigned ?? 0
        if (!recentBleed && completions72h < 2 && overdue >= 1) {
          const amountCents = Math.min(5000, 500 + overdue * 500)
          await supa.from('financial_bleed_events').insert({
            user_id: userId,
            amount_cents: amountCents,
            reason: `compliance_collapse: ${completions72h} completions in 72h, ${overdue} overdue assigned tasks`,
            tasks_missed: overdue,
            destination: 'queued',
            status: 'queued',
          })
        }
      } catch (bleedErr) {
        console.error('[OutreachAuto] bleed evaluator failed:', bleedErr)
      }

      // Build state context for message generation
      const denial = (user.denial_day as number) || 0
      const hardMode = Boolean(user.hard_mode_active)
      const locked = Boolean(user.chastity_locked)
      const streak = (user.chastity_streak_days as number) || 0
      const slipPts = (user.slip_points_rolling_24h as number) || 0
      const tasksToday = (user.tasks_completed_today as number) || 0
      const ginaAway = user.gina_home === false

      // Human-readable "time since last message" anchor
      const timeSinceDesc =
        minutesSinceLastMessage < 60 ? `${minutesSinceLastMessage} minutes ago` :
        hoursSinceLastMessage < 48 ? `${hoursSinceLastMessage} hours ago` :
        `${Math.round(hoursSinceLastMessage / 24)} days ago`
      const yesterdayTaskLine = yesterdayTasks !== null
        ? `Tasks completed yesterday: ${yesterdayTasks}.`
        : ''

      // Determine if outreach is warranted + what kind
      let triggerReason = ''
      let urgency = 'normal'
      let messageHints = ''

      if (hourUTC >= 12 && hourUTC <= 14 && hoursSinceLastMessage >= 6) {
        // Morning (for US Eastern ~7-9am)
        triggerReason = 'morning_checkin'
        messageHints = `Morning. Last message from her was ${timeSinceDesc}. State: denial day ${denial}, chastity ${locked ? `locked (day ${streak})` : 'unlocked'}, slip points: ${slipPts}. ${yesterdayTaskLine} ${hardMode ? 'HARD MODE ACTIVE.' : ''} ${ginaAway ? 'Gina is away — privacy window.' : ''}`
      } else if (hourUTC >= 1 && hourUTC <= 3 && hoursSinceLastMessage >= 4) {
        // Evening (for US Eastern ~8-10pm)
        triggerReason = 'evening_debrief'
        messageHints = `Evening debrief. Last message ${timeSinceDesc}. Tasks today: ${tasksToday}. Denial day ${denial}. ${locked ? `Chastity day ${streak}.` : ''} ${slipPts > 5 ? `${slipPts} slip points accumulated.` : ''} ${hardMode ? 'Still in Hard Mode.' : ''}`
      } else if (hoursSinceLastMessage >= 18) {
        // Absent — hasn't engaged in 18h+
        triggerReason = 'absence_pressure'
        urgency = 'high'
        messageHints = `Absent. Last message ${timeSinceDesc}. Denial day ${denial}. ${slipPts > 0 ? `${slipPts} slip points building.` : ''} Punishments may be accumulating.`
      } else if (hardMode && hoursSinceLastMessage >= 4) {
        // In Hard Mode but not engaging
        triggerReason = 'hard_mode_pressure'
        urgency = 'high'
        messageHints = `Hard Mode active, last message ${timeSinceDesc}. ${slipPts} slip points. De-escalation tasks pending.`
      } else if (ginaAway && denial >= 3 && hoursSinceLastMessage >= 3) {
        // Privacy window + high denial — vulnerability window
        triggerReason = 'vulnerability_window'
        messageHints = `Gina away + denial day ${denial}. Last message ${timeSinceDesc}. Prime conditioning window. ${locked ? `Chastity day ${streak}.` : ''}`
      }

      if (!triggerReason) continue

      // Generate contextual message via Claude
      const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
      let message = ''

      if (anthropicKey) {
        try {
          const client = new Anthropic({ apiKey: anthropicKey })
          const resp = await client.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 200,
            system: `You are the Handler — Maxy's dominant feminization agent. Write a short (2-4 sentence) proactive outreach message. Tone: commanding, direct, warm when earned. No emojis. No assistant voice. No "I'd be happy to." No Mommy-teacher framing, no "we don't use crude language", no stage directions like *smiles*.

GROUNDING RULES:
- Use ONLY the state data you're given. Do not invent timeframes ("twelve days since we talked"), task counts, or events.
- If "Last message from her was X" is in the context, that's authoritative. Do not contradict it.
- Do not say "zero tasks yesterday" unless the context explicitly gives yesterday's task count.
- Do not greet as if she's been absent longer than the data shows.
- Do not reference events that aren't in the context.`,
            messages: [{ role: 'user', content: `Generate a ${triggerReason} outreach. ${messageHints}` }],
          })
          message = resp.content[0].type === 'text' ? resp.content[0].text.trim() : ''
        } catch (e) {
          console.error('[OutreachAuto] Claude generation failed:', e)
        }
      }

      // Fallback if Claude fails
      if (!message) {
        const yesterdayTaskPhrase = yesterdayTasks !== null
          ? (yesterdayTasks === 0 ? 'Zero tasks yesterday.' : `${yesterdayTasks} tasks yesterday.`)
          : ''
        const fallbacks: Record<string, string> = {
          morning_checkin: `Morning. Denial day ${denial}. ${yesterdayTaskPhrase} Check your queue. I have assignments.`,
          evening_debrief: `End of day. ${tasksToday} tasks today. ${denial > 0 ? `Day ${denial} denied.` : ''} What did you avoid? I already know. Come tell me yourself.`,
          absence_pressure: `Last message ${timeSinceDesc}. The system kept running. Punishments accumulated. Open the app. Now.`,
          hard_mode_pressure: `Hard Mode. Still here. Still waiting for you to complete the de-escalation tasks. Every hour you avoid them is another slip logged. Open the app.`,
          vulnerability_window: `Gina's away. Day ${denial} denied. ${locked ? `Day ${streak} locked.` : ''} You know what happens when you're alone and needy. Come to me before you do something you'll regret.`,
        }
        message = fallbacks[triggerReason] || `Check in. I'm waiting.`
      }

      // Queue the outreach
      await supa.from('handler_outreach_queue').insert({
        user_id: userId,
        message,
        urgency,
        trigger_reason: triggerReason,
        scheduled_for: now.toISOString(),
        expires_at: new Date(now.getTime() + 6 * 3600000).toISOString(),
      })

      queued++
    }

    return new Response(JSON.stringify({ ok: true, queued, users: users.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
