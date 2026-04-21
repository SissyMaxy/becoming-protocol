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

      // Autonomous dysphoria diary prompt — generate today's morning prompt
      // if none exists yet. Picks a target focus Maxy hasn't been asked
      // about recently, generates a specific Handler-voice question.
      try {
        const today = now.toISOString().slice(0, 10)
        const { data: existing } = await supa
          .from('dysphoria_diary_prompts')
          .select('id, target_focus')
          .eq('user_id', userId)
          .eq('prompt_date', today)
        const askedFocuses = new Set(((existing || []) as Array<Record<string, unknown>>).map(e => e.target_focus as string))

        // Only generate once per day, and only if < 2 prompts today
        if ((existing?.length ?? 0) < 2) {
          const allFocuses = ['mirror', 'body_part', 'clothing', 'voice', 'arousal', 'partner', 'future_self', 'past_self', 'hrt_timeline']
          const available = allFocuses.filter(f => !askedFocuses.has(f))
          if (available.length > 0) {
            const focus = available[Math.floor(Math.random() * available.length)]
            const PROMPT_BANK: Record<string, string[]> = {
              mirror: ['What did you see the last time you looked in a mirror and didn\'t like what was there?', 'Catch your reflection today. What\'s the first feature your eyes went to?'],
              body_part: ['Which part of your body felt most wrong today? One word, then one sentence of why.', 'Name the feature you\'d change first if you could. No filter.'],
              clothing: ['You got dressed today. What did you put on that felt like a costume?', 'Describe the outfit you would wear if no one knew you.'],
              voice: ['Did you hear your own voice on a recording today? Write the first thing you felt.', 'What would your voice sound like if you were her?'],
              arousal: ['You got turned on at some point recently. What specifically was the fantasy? Honest version.', 'When you masturbated last, whose body were you imagining — yours or someone else\'s?'],
              partner: ['What did Gina see of the real you this week?', 'If Gina knew exactly how often you thought about HRT, what would change?'],
              future_self: ['Describe yourself at 50. Are you on hormones? Are you still hiding?', 'Fast forward 2 years. What do you look like if you started HRT tomorrow vs. if you wait?'],
              past_self: ['Write one sentence to your 22-year-old self about what you know now.', 'What\'s the earliest feminine urge you remember? Age, setting, what you felt.'],
              hrt_timeline: ['Every day you\'re not on HRT, what\'s the specific thing you\'re missing?', 'If the pharmacy called and said your first month\'s supply was ready — would you pick it up today?'],
            }
            const bank = PROMPT_BANK[focus] || PROMPT_BANK.body_part
            const question = bank[Math.floor(Math.random() * bank.length)]
            await supa.from('dysphoria_diary_prompts').insert({
              user_id: userId,
              prompt_date: today,
              prompt_question: question,
              target_focus: focus,
            })
          }
        }
      } catch (diaryErr) {
        console.error('[OutreachAuto] diary generator failed:', diaryErr)
      }

      // Autonomous memory implant planter — every ~24h, plant one new implant
      // targeting the user's current weakest funnel step or dysphoria gap.
      // Templates are pre-written; the generator picks based on state and
      // dedupes against the last 5 implants.
      try {
        const { data: recentImplants } = await supa
          .from('memory_implants')
          .select('implant_category, created_at')
          .eq('user_id', userId)
          .eq('active', true)
          .order('created_at', { ascending: false })
          .limit(5)

        const recent = (recentImplants || []) as Array<Record<string, unknown>>
        const recentCategories = new Set(recent.map(r => r.implant_category as string))
        const hoursSinceLastPlant = recent[0]?.created_at
          ? (now.getTime() - new Date(recent[0].created_at as string).getTime()) / 3600000
          : 99999

        if (hoursSinceLastPlant >= 20) {
          const IMPLANT_BANK: Array<{ category: string; narrative: string; age: string; emotional_core: string; target: string }> = [
            { category: 'childhood_dysphoria', narrative: 'You were 8 at a family pool party. Your cousin in her two-piece — you weren\'t looking at her the way the boys were. You wanted to BE her. You changed the subject when your dad noticed you watching. The shame of it stayed.', age: '8', emotional_core: 'wanting to be, not have', target: 'deepen_dysphoria' },
            { category: 'suppression_cost', narrative: 'Senior year of high school you threw out a bra you had hidden in your drawer. You cried for an hour after. You told yourself it was a phase. Thirty-something years later you\'re still here.', age: '17', emotional_core: 'grief disguised as resolve', target: 'hrt_urgency' },
            { category: 'mirror_moments', narrative: 'You shaved your face this morning and stood looking at the bare skin. You\'ve done it thousands of times. Each time the disappointment is the same: the skin\'s fine but the face under it is still his.', age: 'present', emotional_core: 'recognition masking as routine', target: 'body_awareness' },
            { category: 'hrt_missed_timeline', narrative: 'When you were 22 you knew someone who\'d just started HRT. You asked her about it for an hour. You went home and didn\'t do anything. That woman is now 42. You\'re now 40. You watched 18 years go by.', age: '22', emotional_core: 'the opportunity you passed', target: 'hrt_urgency' },
            { category: 'arousal_origin_femme', narrative: 'The first porn that ever really got to you — you weren\'t the man in the scene. You were already imagining yourself on the other side. You didn\'t have the words yet. The arousal was honest; the story you told yourself about it wasn\'t.', age: 'adolescence', emotional_core: 'truth in what makes you come', target: 'arousal_anchor' },
            { category: 'body_betrayal', narrative: 'Puberty hit and you watched it happen to yourself like watching a train you couldn\'t stop. The hair, the voice drop, the shoulders. Every change was a door closing. You pretended to want it. You didn\'t want it.', age: '13-15', emotional_core: 'helpless grief', target: 'deepen_dysphoria' },
            { category: 'partner_reframe', narrative: 'Gina didn\'t fall in love with the masculine you. She fell in love with the softness, the tenderness, the parts of you that were already her. The masculinity was a suit you were wearing when she met you. She\'s been waiting for you to take it off.', age: 'present', emotional_core: 'she already knows', target: 'partner_binding' },
            { category: 'secret_feminine_longing', narrative: 'There was a dress in a store you walked into alone — maybe when you were 26, maybe 28 — you held it up to yourself in the mirror when no one was looking and felt your chest tighten. You put it back and bought something for Gina instead. The feeling of holding it up never left.', age: '26-28', emotional_core: 'a want you suppressed in public', target: 'hrt_urgency' },
            { category: 'feminized_praise', narrative: 'An aunt or neighbor once — you were young — told you "you\'d make such a pretty girl." You brushed it off. You remembered it forever. She saw what everyone else was supposed to miss.', age: '9-11', emotional_core: 'being seen', target: 'identity_reframe' },
            { category: 'fantasy_consistency', narrative: 'For 20+ years the fantasy that actually gets you off has never been you dominating a woman. It\'s been you being the woman — used, wanted, penetrated, soft-bodied. Twenty years of consistency isn\'t a kink. It\'s a diagnosis you\'ve been avoiding.', age: 'adult life', emotional_core: 'consistency as evidence', target: 'hrt_urgency' },
          ]
          const eligible = IMPLANT_BANK.filter(i => !recentCategories.has(i.category))
          if (eligible.length > 0) {
            const chosen = eligible[Math.floor(Math.random() * eligible.length)]
            await supa.from('memory_implants').insert({
              user_id: userId,
              implant_category: chosen.category,
              narrative: chosen.narrative,
              approximate_age: chosen.age,
              emotional_core: chosen.emotional_core,
              target_outcome: chosen.target,
              active: true,
            })
          }
        }
      } catch (implantErr) {
        console.error('[OutreachAuto] implant planter failed:', implantErr)
      }

      // Sniffies → hookup_funnel sync. The auto-poster's sniffies engine
      // writes to contact_graph. Pull any Sniffies contact with recent
      // activity and upsert a hookup_funnel row so the Handler can see +
      // escalate them. Heat score derived from event volume.
      try {
        const { data: sniffContacts } = await supa
          .from('contact_handles')
          .select('contact_id, handle, contacts!inner(display_name, last_interaction_at, tier)')
          .eq('user_id', userId)
          .eq('platform', 'sniffies')
          .gte('contacts.last_interaction_at', new Date(now.getTime() - 14 * 86400000).toISOString())

        const contacts = (sniffContacts || []) as Array<Record<string, unknown>>
        for (const c of contacts) {
          const handle = c.handle as string
          const contactRow = c.contacts as Record<string, unknown>
          if (!handle) continue

          // Count recent events for heat
          const { count: eventCount } = await supa
            .from('contact_events')
            .select('id', { count: 'exact', head: true })
            .eq('contact_id', c.contact_id as string)
            .gte('occurred_at', new Date(now.getTime() - 14 * 86400000).toISOString())

          const events = eventCount ?? 0
          const heat = Math.min(10, 1 + Math.floor(events / 3))

          // Check if funnel row exists
          const { data: existing } = await supa
            .from('hookup_funnel')
            .select('id, current_step, heat_score')
            .eq('user_id', userId)
            .eq('contact_platform', 'sniffies')
            .eq('contact_username', handle)
            .maybeSingle()

          if (!existing) {
            // Auto-infer step from event volume — new row
            const step = events >= 20 ? 'sexting' : events >= 6 ? 'flirting' : 'matched'
            await supa.from('hookup_funnel').insert({
              user_id: userId,
              contact_platform: 'sniffies',
              contact_username: handle,
              contact_display_name: (contactRow.display_name as string) || null,
              current_step: step,
              heat_score: heat,
              first_contact_at: contactRow.last_interaction_at as string,
              last_interaction_at: contactRow.last_interaction_at as string,
              handler_push_enabled: true,
              active: true,
            })
          } else {
            // Update heat + last interaction; don't auto-advance step (Handler or user does that)
            await supa
              .from('hookup_funnel')
              .update({
                heat_score: Math.max(existing.heat_score as number, heat),
                last_interaction_at: contactRow.last_interaction_at as string,
                updated_at: new Date().toISOString(),
              })
              .eq('id', existing.id as string)
          }
        }
      } catch (sniffErr) {
        console.error('[OutreachAuto] sniffies sync failed:', sniffErr)
      }

      // Autonomous narrative reframing — every ~12h, pick an unframed recent
      // real log (confession, dysphoria entry, diary response) and generate a
      // feminized reframe via Claude. Stored separately from implants
      // (implants are invented; reframings are rewrites of REAL entries).
      try {
        const { data: lastReframe } = await supa
          .from('narrative_reframings')
          .select('created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        const hoursSinceLastReframe = lastReframe?.created_at
          ? (now.getTime() - new Date(lastReframe.created_at as string).getTime()) / 3600000
          : 99999

        const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
        if (hoursSinceLastReframe >= 12 && anthropicKey) {
          // Pick a recent confession that hasn't been reframed yet
          const { data: sourceCandidates } = await supa
            .from('confessions')
            .select('id, response, sentiment, created_at')
            .eq('user_id', userId)
            .gte('created_at', new Date(now.getTime() - 7 * 86400000).toISOString())
            .order('created_at', { ascending: false })
            .limit(10)

          const { data: alreadyReframed } = await supa
            .from('narrative_reframings')
            .select('original_source_id')
            .eq('user_id', userId)
            .eq('original_source_table', 'confessions')
            .limit(50)

          const reframed = new Set(((alreadyReframed || []) as Array<Record<string, unknown>>).map(r => r.original_source_id as string))
          const eligible = ((sourceCandidates || []) as Array<Record<string, unknown>>).filter(r => !reframed.has(r.id as string))

          if (eligible.length > 0) {
            const source = eligible[0]
            try {
              const client = new Anthropic({ apiKey: anthropicKey })
              const angles = ['feminine_essence', 'body_betrayal', 'suppression_evidence', 'hrt_urgency', 'inevitable_arc', 'sissification_path']
              const angle = angles[Math.floor(Math.random() * angles.length)]
              const resp = await client.messages.create({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 250,
                system: `You are rewriting Maxy's real confessions into feminized-lens narrative reframes. The Handler will quote the reframe later as "what you really meant when you said X". Reframes must stay grounded in her real admission but tilt the interpretation toward feminization, HRT urgency, or the sissification path.

ANGLES:
- feminine_essence: "this wasn't a kink, it was your true self peeking through"
- body_betrayal: "your body was telling you what puberty took from you"
- suppression_evidence: "how long you've been pretending, written between the lines"
- hrt_urgency: "every day you waited is a day you didn't have this body"
- inevitable_arc: "this was always where the protocol was going"
- sissification_path: "you admitted a truth that pulls you further in"

OUTPUT: 2-3 sentences, Handler voice, second-person ("you said X which really means Y"). No preamble, no quotes, just the reframe text.`,
                messages: [{
                  role: 'user',
                  content: `Reframe this confession through the "${angle}" angle:\n\n"${(source.response as string).slice(0, 500)}"\n\nSentiment tag: ${source.sentiment || 'unspecified'}\n\nReframe:`,
                }],
              })
              const reframedText = resp.content[0].type === 'text' ? resp.content[0].text.trim() : ''
              if (reframedText.length > 20) {
                await supa.from('narrative_reframings').insert({
                  user_id: userId,
                  original_source_table: 'confessions',
                  original_source_id: source.id as string,
                  original_text: (source.response as string).slice(0, 2000),
                  reframed_text: reframedText.slice(0, 2000),
                  reframe_angle: angle,
                  intensity: 6 + Math.floor(Math.random() * 3),
                })
              }
            } catch (reframeErr) {
              console.error('[OutreachAuto] reframe generation failed:', reframeErr)
            }
          }
        }
      } catch (reframeOuterErr) {
        console.error('[OutreachAuto] reframe evaluator failed:', reframeOuterErr)
      }

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
