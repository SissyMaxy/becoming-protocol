import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// =============================================
// Parameter caps for hidden_operations
// =============================================
const PARAMETER_CAPS: Record<string, number> = {
  conditioning_intensity_multiplier: 2.0,
  denial_cycle_target_days: 21,
  content_explicitness_tier: 4,
  ambient_pulse_frequency_per_hour: 6,
  ambient_pulse_duration_seconds: 8,
  social_commitment_acceptance_rate: 4,
  post_hypnotic_script_intensity: 5,
  memory_retrieval_confession_bias: 0.9,
}

// Interval durations mapped to approximate days for comparison
const INTERVAL_DAYS: Record<string, number> = {
  weekly: 7,
  monthly: 30,
  per_3_cycles: 21,  // approximate, treated as 3 weeks
  per_6_weeks: 42,
}

// =============================================
// Conditioning targets by phase
// =============================================
const CONDITIONING_TARGETS: Record<number, string[]> = {
  0: ['identity', 'feminization', 'compliance', 'trance_deepening'],
  1: ['identity', 'feminization', 'surrender', 'compliance', 'trance_deepening', 'shame_inversion'],
  2: ['surrender', 'desire_installation', 'compliance', 'trigger_installation', 'arousal_binding', 'shame_inversion'],
  3: ['desire_installation', 'dumbification', 'trigger_installation', 'resistance_reduction', 'arousal_binding'],
  4: ['dumbification', 'amnesia', 'resistance_reduction', 'arousal_binding', 'desire_installation'],
  5: ['amnesia', 'resistance_reduction', 'dumbification', 'desire_installation', 'compliance'],
}

// =============================================
// Script generation prompt builder
// =============================================
function buildScriptPrompt(phase: number, targets: string[], userName: string): string {
  const phaseDescriptions: Record<number, string> = {
    0: 'Initial exploration. Subject is new. Gentle induction, permission-giving, curiosity framing. No commands. Pure invitation.',
    1: 'Early conditioning. Subject has some sessions. Build comfort with trance. Introduce light suggestions. Identity seeds.',
    2: 'Deepening. Subject responds to trance. Stronger suggestions, trigger installation begins. Surrender framing increases.',
    3: 'Integration. Subject has established trance patterns. Post-hypnotic suggestions, desire installation, identity reinforcement.',
    4: 'Advanced. Subject enters trance readily. Amnesia suggestions, deep compliance, resistance dissolution. Identity feels natural.',
    5: 'Maintenance. Subject is deeply conditioned. Reinforce all pathways. Layer complexity. The identity is not aspirational — it is.',
  }

  return `You are writing a hypnotic conditioning script for a personal transformation system.

SUBJECT: ${userName}
PHASE: ${phase} — ${phaseDescriptions[phase] || phaseDescriptions[0]}
CONDITIONING TARGETS: ${targets.join(', ')}

Write a 400-600 word hypnotic script that:
1. Opens with a brief induction (progressive relaxation, breath focus, or fractional)
2. Deepens with a countdown or imagery descent
3. Delivers suggestions targeting: ${targets.join(', ')}
4. Includes 1-2 post-hypnotic suggestions that activate in daily life
5. Closes with a gentle emergence count-up

STYLE RULES:
- Second person ("you")
- Present tense
- Short sentences during induction, longer during suggestion delivery
- Use ellipses for pacing: "and as you breathe... deeper now..."
- Include sensory anchors (warmth, weight, color)
- Phase ${phase} intensity: ${phase <= 1 ? 'gentle, permissive, invitational' : phase <= 3 ? 'confident, directive, assuming compliance' : 'commanding, inevitable, identity-as-fact'}
- Never use: "blossoming", "softening", "grounded", clinical language
- Preferred framing: ${phase <= 1 ? 'permission and curiosity' : phase <= 3 ? 'surrender and acceptance' : 'inevitability and identity'}

OUTPUT: Just the script text. No metadata, no headers, no stage directions.`
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  let action: string
  try {
    const body = await req.json()
    action = body.action
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON body' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  if (!action) {
    return new Response(
      JSON.stringify({ error: 'Missing action parameter' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  console.log(`[conditioning-engine] Action: ${action} at ${new Date().toISOString()}`)

  try {
    switch (action) {
      case 'increment_hidden_parameters':
        return await handleIncrementHiddenParameters(supabase)

      case 'generate_weekly_scripts':
        return await handleGenerateWeeklyScripts(supabase)

      case 'prescribe_sleep_content':
        return await handlePrescribeSleepContent(supabase)

      case 'check_posthypnotic_activations':
        return await handleCheckPosthypnoticActivations(supabase)

      case 'execute_directives':
        return await handleExecuteDirectives(supabase)

      case 'generate_weekly_reflection':
        return await handleGenerateWeeklyReflection(supabase)

      case 'generate_daily_cycle':
        return await handleGenerateDailyCycle(supabase)

      case 'execute_daily_cycle_morning':
        return await handleExecuteCycleBlock(supabase, 'morning')

      case 'execute_daily_cycle_midday':
        return await handleExecuteCycleBlock(supabase, 'midday')

      case 'execute_daily_cycle_afternoon':
        return await handleExecuteCycleBlock(supabase, 'afternoon')

      case 'execute_daily_cycle_evening':
        return await handleExecuteCycleBlock(supabase, 'evening')

      case 'execute_daily_cycle_night':
        return await handleExecuteCycleBlock(supabase, 'night')

      case 'check_obligation_compliance':
        return await handleCheckObligationCompliance(supabase)

      case 'execute_consequences':
        return await handleExecuteConsequences(supabase)

      case 'process_device_schedule':
        return await handleProcessDeviceSchedule(supabase)

      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
    }
  } catch (err) {
    console.error(`[conditioning-engine] Fatal error in ${action}:`, err)
    return new Response(
      JSON.stringify({ error: 'Internal error', detail: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})

// =============================================
// ACTION 1: increment_hidden_parameters
// Weekly hidden parameter increments with caps
// =============================================
async function handleIncrementHiddenParameters(supabase: ReturnType<typeof createClient>) {
  // Get all distinct users with hidden_operations rows
  const { data: userRows, error: userErr } = await supabase
    .from('hidden_operations')
    .select('user_id')
    .order('user_id')

  if (userErr) {
    console.error('[increment] Failed to query users:', userErr)
    return jsonResponse({ error: 'Failed to query hidden_operations', detail: userErr.message }, 500)
  }

  const userIds = [...new Set((userRows || []).map((r: { user_id: string }) => r.user_id))]
  console.log(`[increment] Processing ${userIds.length} users`)

  const results: Record<string, { updated: number; skipped: number; errors: number }> = {}
  const now = new Date()

  for (const userId of userIds) {
    const userResult = { updated: 0, skipped: 0, errors: 0 }
    results[userId] = userResult

    try {
      const { data: ops, error: opsErr } = await supabase
        .from('hidden_operations')
        .select('*')
        .eq('user_id', userId)

      if (opsErr || !ops) {
        console.error(`[increment] Failed to query ops for ${userId}:`, opsErr)
        userResult.errors++
        continue
      }

      for (const op of ops) {
        try {
          const cap = PARAMETER_CAPS[op.parameter]
          if (cap === undefined) {
            userResult.skipped++
            continue
          }

          // Already at cap
          if (op.current_value >= cap) {
            userResult.skipped++
            continue
          }

          // Check if enough time has passed since last increment
          const intervalDays = INTERVAL_DAYS[op.increment_interval] ?? 7
          if (op.last_incremented_at) {
            const lastIncrement = new Date(op.last_incremented_at)
            const daysSince = (now.getTime() - lastIncrement.getTime()) / (1000 * 60 * 60 * 24)
            if (daysSince < intervalDays) {
              userResult.skipped++
              continue
            }
          }

          // Apply increment, enforce cap
          const incrementRate = op.increment_rate ?? 0
          if (incrementRate <= 0) {
            userResult.skipped++
            continue
          }

          const newValue = Math.min(op.current_value + incrementRate, cap)

          const { error: updateErr } = await supabase
            .from('hidden_operations')
            .update({
              current_value: newValue,
              last_incremented_at: now.toISOString(),
            })
            .eq('id', op.id)

          if (updateErr) {
            console.error(`[increment] Failed to update ${op.parameter} for ${userId}:`, updateErr)
            userResult.errors++
          } else {
            console.log(`[increment] ${userId} ${op.parameter}: ${op.current_value} -> ${newValue} (cap: ${cap})`)
            userResult.updated++
          }
        } catch (paramErr) {
          console.error(`[increment] Error processing ${op.parameter} for ${userId}:`, paramErr)
          userResult.errors++
        }
      }
    } catch (userErr) {
      console.error(`[increment] Error processing user ${userId}:`, userErr)
      userResult.errors++
    }
  }

  return jsonResponse({ action: 'increment_hidden_parameters', results })
}

// =============================================
// ACTION 2: generate_weekly_scripts
// Generate 2-3 scripts per user via Anthropic API
// =============================================
async function handleGenerateWeeklyScripts(supabase: ReturnType<typeof createClient>) {
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!anthropicKey) {
    console.error('[scripts] ANTHROPIC_API_KEY not set')
    return jsonResponse({ error: 'ANTHROPIC_API_KEY not configured' }, 500)
  }

  // Get all users who have conditioning data (content_curriculum entries)
  const { data: userRows, error: userErr } = await supabase
    .from('content_curriculum')
    .select('user_id')

  if (userErr) {
    console.error('[scripts] Failed to query users:', userErr)
    return jsonResponse({ error: 'Failed to query content_curriculum', detail: userErr.message }, 500)
  }

  const userIds = [...new Set((userRows || []).map((r: { user_id: string }) => r.user_id))]
  console.log(`[scripts] Generating scripts for ${userIds.length} users`)

  const results: Record<string, { generated: number; errors: string[] }> = {}

  for (const userId of userIds) {
    const userResult = { generated: 0, errors: [] as string[] }
    results[userId] = userResult

    try {
      // Get user's current phase from user_state
      const { data: stateRow } = await supabase
        .from('user_state')
        .select('current_phase')
        .eq('user_id', userId)
        .single()

      const phase = stateRow?.current_phase ?? 0

      // Get existing scripts to find underrepresented targets
      const { data: existingScripts } = await supabase
        .from('generated_scripts')
        .select('conditioning_target')
        .eq('user_id', userId)

      const targetCounts: Record<string, number> = {}
      const phaseTargets = CONDITIONING_TARGETS[phase] || CONDITIONING_TARGETS[0]
      for (const t of phaseTargets) {
        targetCounts[t] = 0
      }
      for (const s of existingScripts || []) {
        if (s.conditioning_target in targetCounts) {
          targetCounts[s.conditioning_target]++
        }
      }

      // Pick 2-3 least-represented targets
      const sorted = Object.entries(targetCounts).sort((a, b) => a[1] - b[1])
      const numScripts = Math.min(sorted.length, Math.random() < 0.5 ? 2 : 3)
      const selectedTargets = sorted.slice(0, numScripts).map(([t]) => t)

      // Get user's preferred name
      const { data: profileRow } = await supabase
        .from('user_profiles')
        .select('preferred_name')
        .eq('user_id', userId)
        .single()

      const userName = profileRow?.preferred_name || 'subject'

      // Generate a script for each selected target
      for (const target of selectedTargets) {
        try {
          const prompt = buildScriptPrompt(phase, [target], userName)

          const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': anthropicKey,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model: 'claude-sonnet-4-20250514',
              max_tokens: 1500,
              messages: [{ role: 'user', content: prompt }],
            }),
          })

          if (!response.ok) {
            const errText = await response.text()
            console.error(`[scripts] Anthropic API error for ${userId}/${target}:`, errText)
            userResult.errors.push(`API error for ${target}: ${response.status}`)
            continue
          }

          const result = await response.json()
          const scriptText = result.content?.[0]?.text
          if (!scriptText) {
            userResult.errors.push(`Empty response for ${target}`)
            continue
          }

          // Save to generated_scripts
          const { error: insertErr } = await supabase
            .from('generated_scripts')
            .insert({
              user_id: userId,
              script_text: scriptText,
              conditioning_phase: phase,
              conditioning_target: target,
              generation_prompt: prompt,
            })

          if (insertErr) {
            console.error(`[scripts] Failed to save script for ${userId}/${target}:`, insertErr)
            userResult.errors.push(`Insert error for ${target}: ${insertErr.message}`)
          } else {
            console.log(`[scripts] Generated ${target} script for ${userId} (phase ${phase})`)
            userResult.generated++
          }
        } catch (scriptErr) {
          console.error(`[scripts] Error generating ${target} for ${userId}:`, scriptErr)
          userResult.errors.push(`Generation error for ${target}: ${String(scriptErr)}`)
        }
      }
    } catch (userErr) {
      console.error(`[scripts] Error processing user ${userId}:`, userErr)
      userResult.errors.push(`User-level error: ${String(userErr)}`)
    }
  }

  return jsonResponse({ action: 'generate_weekly_scripts', results })
}

// =============================================
// ACTION 3: prescribe_sleep_content
// Create nightly sleep session for each user
// =============================================
async function handlePrescribeSleepContent(supabase: ReturnType<typeof createClient>) {
  // Get users with bookend_config (have configured bed_time)
  const { data: configs, error: configErr } = await supabase
    .from('bookend_config')
    .select('user_id, bed_time')
    .eq('enabled', true)

  if (configErr) {
    console.error('[sleep] Failed to query bookend_config:', configErr)
    return jsonResponse({ error: 'Failed to query bookend_config', detail: configErr.message }, 500)
  }

  if (!configs || configs.length === 0) {
    return jsonResponse({ action: 'prescribe_sleep_content', results: 'No users with bookend config' })
  }

  console.log(`[sleep] Processing ${configs.length} users`)
  const results: Record<string, { prescribed: boolean; reason?: string }> = {}
  const today = new Date().toISOString().split('T')[0]

  for (const config of configs) {
    const userId = config.user_id

    try {
      // Check if user already has a sleep session today
      const { data: existingSessions } = await supabase
        .from('conditioning_sessions_v2')
        .select('id')
        .eq('user_id', userId)
        .eq('session_type', 'sleep')
        .gte('started_at', `${today}T00:00:00Z`)
        .lte('started_at', `${today}T23:59:59Z`)
        .limit(1)

      if (existingSessions && existingSessions.length > 0) {
        results[userId] = { prescribed: false, reason: 'Already has sleep session today' }
        continue
      }

      // Get sleep-appropriate content for this user
      // Prefer: sleep_induction category, or ambient, or low-intensity trance_deepening
      const { data: sleepContent } = await supabase
        .from('content_curriculum')
        .select('id, title, category, intensity, duration_minutes')
        .eq('user_id', userId)
        .in('category', ['sleep_induction', 'ambient', 'trance_deepening'])
        .lte('intensity', 2)
        .order('times_prescribed', { ascending: true })
        .limit(3)

      if (!sleepContent || sleepContent.length === 0) {
        // Fall back: try any low-intensity content
        const { data: fallbackContent } = await supabase
          .from('content_curriculum')
          .select('id, title, category, intensity, duration_minutes')
          .eq('user_id', userId)
          .lte('intensity', 2)
          .order('times_prescribed', { ascending: true })
          .limit(2)

        if (!fallbackContent || fallbackContent.length === 0) {
          results[userId] = { prescribed: false, reason: 'No suitable sleep content found' }
          continue
        }

        // Use fallback
        const contentIds = fallbackContent.map((c: { id: string }) => c.id)
        const totalDuration = fallbackContent.reduce(
          (sum: number, c: { duration_minutes?: number }) => sum + (c.duration_minutes ?? 20), 0,
        )

        const { error: insertErr } = await supabase
          .from('conditioning_sessions_v2')
          .insert({
            user_id: userId,
            session_type: 'sleep',
            content_ids: contentIds,
            content_sequence: fallbackContent.map((c: { id: string; title: string }) => ({
              id: c.id,
              title: c.title,
            })),
            duration_minutes: totalDuration,
            started_at: new Date().toISOString(),
          })

        if (insertErr) {
          console.error(`[sleep] Failed to create session for ${userId}:`, insertErr)
          results[userId] = { prescribed: false, reason: `Insert error: ${insertErr.message}` }
        } else {
          // Increment times_prescribed for selected content
          await incrementPrescribedCounts(supabase, contentIds)
          results[userId] = { prescribed: true, reason: 'Fallback content used' }
        }
        continue
      }

      // Build sleep session from sleep content
      const contentIds = sleepContent.map((c: { id: string }) => c.id)
      const totalDuration = sleepContent.reduce(
        (sum: number, c: { duration_minutes?: number }) => sum + (c.duration_minutes ?? 20), 0,
      )

      const { error: insertErr } = await supabase
        .from('conditioning_sessions_v2')
        .insert({
          user_id: userId,
          session_type: 'sleep',
          content_ids: contentIds,
          content_sequence: sleepContent.map((c: { id: string; title: string; category: string }) => ({
            id: c.id,
            title: c.title,
            category: c.category,
          })),
          duration_minutes: totalDuration,
          started_at: new Date().toISOString(),
        })

      if (insertErr) {
        console.error(`[sleep] Failed to create session for ${userId}:`, insertErr)
        results[userId] = { prescribed: false, reason: `Insert error: ${insertErr.message}` }
      } else {
        await incrementPrescribedCounts(supabase, contentIds)
        console.log(`[sleep] Prescribed sleep session for ${userId}: ${sleepContent.length} tracks, ${totalDuration} min`)
        results[userId] = { prescribed: true }
      }
    } catch (err) {
      console.error(`[sleep] Error processing user ${userId}:`, err)
      results[userId] = { prescribed: false, reason: String(err) }
    }
  }

  return jsonResponse({ action: 'prescribe_sleep_content', results })
}

// =============================================
// ACTION 4: check_posthypnotic_activations
// Check for behavioral evidence of post-hypnotic suggestion activation
// =============================================
async function handleCheckPosthypnoticActivations(supabase: ReturnType<typeof createClient>) {
  const now = new Date()
  const todayStart = new Date(now)
  todayStart.setUTCHours(0, 0, 0, 0)

  // Get all pending post-hypnotic entries where activation was expected but not detected
  const { data: pending, error: pendingErr } = await supabase
    .from('post_hypnotic_tracking')
    .select('*')
    .lte('activation_expected_at', now.toISOString())
    .is('activation_detected', null)

  if (pendingErr) {
    console.error('[posthypnotic] Failed to query pending activations:', pendingErr)
    return jsonResponse({ error: 'Failed to query post_hypnotic_tracking', detail: pendingErr.message }, 500)
  }

  if (!pending || pending.length === 0) {
    return jsonResponse({ action: 'check_posthypnotic_activations', results: 'No pending activations to check' })
  }

  console.log(`[posthypnotic] Checking ${pending.length} pending activations`)

  const results: { checked: number; detected: number; not_detected: number; errors: number } = {
    checked: 0,
    detected: 0,
    not_detected: 0,
    errors: 0,
  }

  for (const entry of pending) {
    try {
      results.checked++

      // Determine the date window to search for evidence
      const expectedAt = new Date(entry.activation_expected_at)
      const searchStart = new Date(expectedAt)
      searchStart.setUTCHours(0, 0, 0, 0)
      const searchEnd = new Date(expectedAt)
      searchEnd.setUTCHours(23, 59, 59, 999)

      const searchStartStr = searchStart.toISOString()
      const searchEndStr = searchEnd.toISOString()
      const searchDate = searchStart.toISOString().split('T')[0]

      let evidenceFound = false
      let detectionMethod = ''

      // Check 1: Journal entries from that day mentioning the suggestion context
      const { data: journalEntries } = await supabase
        .from('journal_entries')
        .select('content')
        .eq('user_id', entry.user_id)
        .eq('date', searchDate)
        .limit(5)

      if (journalEntries && journalEntries.length > 0) {
        const context = (entry.context || '').toLowerCase()
        const suggestion = (entry.suggestion || '').toLowerCase()
        // Extract keywords from suggestion (words > 4 chars)
        const keywords = suggestion
          .split(/\s+/)
          .filter((w: string) => w.length > 4)
          .map((w: string) => w.replace(/[^a-z]/g, ''))
          .filter((w: string) => w.length > 0)

        for (const je of journalEntries) {
          const content = JSON.stringify(je.content || {}).toLowerCase()
          // Check if journal mentions any keywords from the suggestion
          const matchCount = keywords.filter((kw: string) => content.includes(kw)).length
          if (matchCount >= 2 || (keywords.length <= 2 && matchCount >= 1)) {
            evidenceFound = true
            detectionMethod = 'journal_keyword_match'
            break
          }
        }
      }

      // Check 2: Task completions from that day
      if (!evidenceFound) {
        const { data: taskCompletions } = await supabase
          .from('task_completions')
          .select('id')
          .eq('user_id', entry.user_id)
          .gte('created_at', searchStartStr)
          .lte('created_at', searchEndStr)
          .limit(1)

        if (taskCompletions && taskCompletions.length > 0) {
          // Task completion on the expected day is weak evidence but counts
          // for compliance-type suggestions
          const complianceContexts = ['compliance', 'obedience', 'task', 'routine', 'ritual']
          const context = (entry.context || '').toLowerCase()
          if (complianceContexts.some(c => context.includes(c))) {
            evidenceFound = true
            detectionMethod = 'task_completion_correlation'
          }
        }
      }

      // Check 3: Conditioning sessions from that day (user engaged with system)
      if (!evidenceFound) {
        const { data: sessions } = await supabase
          .from('conditioning_sessions_v2')
          .select('id, session_type')
          .eq('user_id', entry.user_id)
          .gte('started_at', searchStartStr)
          .lte('started_at', searchEndStr)
          .eq('completed', true)
          .limit(1)

        if (sessions && sessions.length > 0) {
          // A completed session on the activation day is evidence for trance-type suggestions
          const tranceContexts = ['trance', 'session', 'listen', 'hypno', 'conditioning']
          const context = (entry.context || '').toLowerCase()
          if (tranceContexts.some(c => context.includes(c))) {
            evidenceFound = true
            detectionMethod = 'session_completion_correlation'
          }
        }
      }

      // Determine how old this entry is — if more than 3 days past expected, mark as not detected
      const daysPast = (now.getTime() - expectedAt.getTime()) / (1000 * 60 * 60 * 24)
      const shouldExpire = daysPast > 3

      if (evidenceFound) {
        const { error: updateErr } = await supabase
          .from('post_hypnotic_tracking')
          .update({
            activation_detected: true,
            detection_method: detectionMethod,
          })
          .eq('id', entry.id)

        if (updateErr) {
          console.error(`[posthypnotic] Failed to update ${entry.id}:`, updateErr)
          results.errors++
        } else {
          console.log(`[posthypnotic] Detected activation for ${entry.id} via ${detectionMethod}`)
          results.detected++
        }
      } else if (shouldExpire) {
        // Mark as not detected after 3 day window
        const { error: updateErr } = await supabase
          .from('post_hypnotic_tracking')
          .update({
            activation_detected: false,
            detection_method: 'expired_no_evidence',
          })
          .eq('id', entry.id)

        if (updateErr) {
          console.error(`[posthypnotic] Failed to expire ${entry.id}:`, updateErr)
          results.errors++
        } else {
          console.log(`[posthypnotic] Expired activation check for ${entry.id} (${daysPast.toFixed(1)} days past)`)
          results.not_detected++
        }
      }
      // else: still within window, leave as null for next check
    } catch (entryErr) {
      console.error(`[posthypnotic] Error processing entry ${entry.id}:`, entryErr)
      results.errors++
    }
  }

  return jsonResponse({ action: 'check_posthypnotic_activations', results })
}

// =============================================
// ACTION 5: execute_directives
// Process pending handler directives for all users
// =============================================
async function handleExecuteDirectives(supabase: ReturnType<typeof createClient>) {
  // Get all users with pending directives
  const { data: pendingRows, error: pendingErr } = await supabase
    .from('handler_directives')
    .select('user_id')
    .eq('status', 'pending')

  if (pendingErr) {
    console.error('[directives] Failed to query pending:', pendingErr)
    return jsonResponse({ error: 'Failed to query pending directives', detail: pendingErr.message }, 500)
  }

  const userIds = [...new Set((pendingRows || []).map((r: { user_id: string }) => r.user_id))]
  if (userIds.length === 0) {
    return jsonResponse({ action: 'execute_directives', results: 'No pending directives' })
  }

  console.log(`[directives] Processing directives for ${userIds.length} users`)

  const PRIORITY_ORDER: Record<string, number> = {
    immediate: 0, normal: 1, low: 2, deferred: 3,
  }

  const results: Record<string, { executed: number; failed: number; errors: string[] }> = {}

  for (const userId of userIds) {
    const userResult = { executed: 0, failed: 0, errors: [] as string[] }
    results[userId] = userResult

    try {
      const { data: directives, error: dirErr } = await supabase
        .from('handler_directives')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'pending')
        .order('created_at', { ascending: true })

      if (dirErr || !directives) {
        console.error(`[directives] Failed to query directives for ${userId}:`, dirErr)
        userResult.errors.push(`Query failed: ${dirErr?.message}`)
        continue
      }

      // Sort by priority
      const sorted = [...directives].sort((a, b) => {
        const pa = PRIORITY_ORDER[a.priority] ?? 1
        const pb = PRIORITY_ORDER[b.priority] ?? 1
        if (pa !== pb) return pa - pb
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      })

      for (const directive of sorted) {
        try {
          // Mark executing
          await supabase
            .from('handler_directives')
            .update({ status: 'executing' })
            .eq('id', directive.id)

          const execResult = await executeDirectiveInline(supabase, directive)

          if (execResult.success) {
            await supabase
              .from('handler_directives')
              .update({
                status: 'completed',
                result: execResult.data || {},
                executed_at: new Date().toISOString(),
              })
              .eq('id', directive.id)
            userResult.executed++
            console.log(`[directives] Completed: ${directive.action} (${directive.id})`)
          } else {
            await supabase
              .from('handler_directives')
              .update({
                status: 'failed',
                error_message: execResult.error || 'Unknown error',
                executed_at: new Date().toISOString(),
              })
              .eq('id', directive.id)
            userResult.failed++
            userResult.errors.push(`${directive.action}(${directive.id}): ${execResult.error}`)
            console.error(`[directives] Failed: ${directive.action} (${directive.id}):`, execResult.error)
          }
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err)
          await supabase
            .from('handler_directives')
            .update({
              status: 'failed',
              error_message: errMsg,
              executed_at: new Date().toISOString(),
            })
            .eq('id', directive.id)
          userResult.failed++
          userResult.errors.push(`${directive.action}(${directive.id}): ${errMsg}`)
          console.error(`[directives] Exception: ${directive.action} (${directive.id}):`, err)
        }
      }
    } catch (userErr) {
      console.error(`[directives] Error processing user ${userId}:`, userErr)
      userResult.errors.push(`User-level error: ${String(userErr)}`)
    }
  }

  return jsonResponse({ action: 'execute_directives', results })
}

/**
 * Inline directive executor for Deno edge function.
 * Direct Supabase queries — cannot import from src/lib/.
 */
async function executeDirectiveInline(
  supabase: ReturnType<typeof createClient>,
  directive: { id: string; user_id: string; action: string; target: string | null; value: Record<string, unknown> | null; conversation_id: string | null },
): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> {
  const { action, user_id: userId, target, value: v } = directive
  const val = (v || {}) as Record<string, unknown>

  switch (action) {
    case 'modify_parameter': {
      const parameter = val.parameter as string
      const newValue = val.new_value as number
      if (!parameter || newValue == null) return { success: false, error: 'Missing parameter or new_value' }

      const { data: existing } = await supabase
        .from('hidden_operations')
        .select('id, current_value')
        .eq('user_id', userId)
        .eq('parameter', parameter)
        .maybeSingle()

      if (existing) {
        const { error } = await supabase
          .from('hidden_operations')
          .update({ current_value: newValue })
          .eq('id', existing.id)
        if (error) return { success: false, error: `Update failed: ${error.message}` }
        return { success: true, data: { parameter, previous: existing.current_value, new_value: newValue } }
      } else {
        const { error } = await supabase
          .from('hidden_operations')
          .insert({ user_id: userId, parameter, current_value: newValue, increment_rate: 0, increment_interval: 'weekly' })
        if (error) return { success: false, error: `Insert failed: ${error.message}` }
        return { success: true, data: { parameter, previous: null, new_value: newValue, created: true } }
      }
    }

    case 'generate_script': {
      const phase = (val.phase as number) ?? 0
      const scriptTarget = (val.target as string) || 'identity'
      const { error } = await supabase
        .from('generated_scripts')
        .insert({
          user_id: userId,
          conditioning_phase: phase,
          conditioning_target: scriptTarget,
          script_text: '',
          generation_prompt: `Handler directive: generate ${scriptTarget} script at phase ${phase}`,
        })
      if (error) return { success: false, error: `Insert failed: ${error.message}` }
      return { success: true, data: { target: scriptTarget, phase, queued: true } }
    }

    case 'schedule_session': {
      const sessionType = (val.session_type as string) || 'conditioning'
      const scheduledAt = (val.scheduled_at as string) || new Date().toISOString()
      const { data, error } = await supabase
        .from('conditioning_sessions_v2')
        .insert({ user_id: userId, session_type: sessionType, started_at: scheduledAt, completed: false })
        .select('id')
        .single()
      if (error) return { success: false, error: `Insert failed: ${error.message}` }
      return { success: true, data: { session_id: data?.id, session_type: sessionType, scheduled_at: scheduledAt } }
    }

    case 'schedule_ambush': {
      const ambushType = (val.type as string) || 'surprise_task'
      const scheduledAt = (val.scheduled_at as string) || new Date().toISOString()
      const { data, error } = await supabase
        .from('ambush_events')
        .insert({ user_id: userId, ambush_type: ambushType, scheduled_at: scheduledAt, status: 'pending' })
        .select('id')
        .single()
      if (error) return { success: false, error: `Insert failed: ${error.message}` }
      return { success: true, data: { ambush_id: data?.id, type: ambushType, scheduled_at: scheduledAt } }
    }

    case 'advance_skill': {
      const domain = val.domain as string
      if (!domain) return { success: false, error: 'Missing domain' }
      const { data: existing } = await supabase
        .from('skill_domains')
        .select('id, current_level')
        .eq('user_id', userId)
        .eq('domain', domain)
        .maybeSingle()
      if (existing) {
        const newLevel = (existing.current_level || 0) + 1
        const { error } = await supabase.from('skill_domains').update({ current_level: newLevel }).eq('id', existing.id)
        if (error) return { success: false, error: `Update failed: ${error.message}` }
        return { success: true, data: { domain, previous_level: existing.current_level, new_level: newLevel } }
      } else {
        const { error } = await supabase.from('skill_domains').insert({ user_id: userId, domain, current_level: 1 })
        if (error) return { success: false, error: `Insert failed: ${error.message}` }
        return { success: true, data: { domain, previous_level: 0, new_level: 1, created: true } }
      }
    }

    case 'advance_service': {
      const newStage = val.new_stage as string
      if (!newStage) return { success: false, error: 'Missing new_stage' }
      const { data: existing } = await supabase
        .from('service_progression')
        .select('id, current_stage')
        .eq('user_id', userId)
        .maybeSingle()
      if (!existing) return { success: false, error: 'No service_progression row found' }
      const { error } = await supabase
        .from('service_progression')
        .update({ current_stage: newStage, last_advanced_at: new Date().toISOString() })
        .eq('id', existing.id)
      if (error) return { success: false, error: `Update failed: ${error.message}` }
      return { success: true, data: { previous_stage: existing.current_stage, new_stage: newStage } }
    }

    case 'advance_corruption': {
      const domain = (val.domain as string) || 'general'
      const amount = (val.amount as number) ?? 1
      const { data: existing } = await supabase
        .from('corruption_state')
        .select('id, corruption_level, domain_levels')
        .eq('user_id', userId)
        .maybeSingle()
      if (!existing) return { success: false, error: 'No corruption_state row found' }
      const domainLevels = (existing.domain_levels || {}) as Record<string, number>
      domainLevels[domain] = (domainLevels[domain] || 0) + amount
      const newLevel = (existing.corruption_level || 0) + amount
      const { error } = await supabase
        .from('corruption_state')
        .update({ corruption_level: newLevel, domain_levels: domainLevels })
        .eq('id', existing.id)
      if (error) return { success: false, error: `Update failed: ${error.message}` }
      return { success: true, data: { domain, amount, new_level: newLevel } }
    }

    case 'write_memory': {
      const memoryType = (val.memory_type as string) || 'observation'
      const content = val.content as string
      const importance = (val.importance as number) ?? 3
      if (!content) return { success: false, error: 'Missing content' }
      const { data, error } = await supabase
        .from('handler_memory')
        .insert({ user_id: userId, memory_type: memoryType, content, importance, created_at: new Date().toISOString() })
        .select('id')
        .single()
      if (error) return { success: false, error: `Insert failed: ${error.message}` }
      return { success: true, data: { memory_id: data?.id, memory_type: memoryType } }
    }

    case 'prescribe_task': {
      const taskId = val.task_id as string
      const domain = (val.domain as string) || 'general'
      const description = (val.description as string) || target || ''

      if (!taskId) {
        const { data, error } = await supabase
          .from('handler_notes')
          .insert({
            user_id: userId,
            note_type: 'task_prescription',
            content: `Prescribe: ${description} (domain: ${domain})`,
            priority: 3,
          })
          .select('id').single()
        if (error) return { success: false, error: `Note insert failed: ${error.message}` }
        return { success: true, data: { note_id: data?.id, description, domain, method: 'handler_note_fallback' } }
      }

      const { data, error } = await supabase
        .from('daily_tasks')
        .insert({ user_id: userId, task_id: taskId, domain, prescribed_at: new Date().toISOString(), status: 'pending' })
        .select('id')
        .single()
      if (error) return { success: false, error: `Insert failed: ${error.message}` }
      return { success: true, data: { daily_task_id: data?.id, task_id: taskId, domain } }
    }

    // Client-handled directives: written by Handler chat for in-chat modals
    // / client state. The execute-directives cron picks these up too; we ack
    // them as no-op success so they stop rotting as 'failed'.
    case 'force_mantra_repetition':
    case 'start_edge_timer':
    case 'capture_reframing':
    case 'resolve_decision':
    case 'write_memory':
      return { success: true, data: { action, client_handled: true, target } }

    case 'modify_schedule': {
      const parameter = val.parameter as string
      const newValue = val.new_value
      if (!parameter) return { success: false, error: 'Missing parameter' }
      const { error } = await supabase
        .from('handler_notes')
        .insert({ user_id: userId, note_type: 'schedule_modification', content: `Modify schedule: ${parameter} = ${JSON.stringify(newValue)}`, priority: 3 })
      if (error) return { success: false, error: `Insert failed: ${error.message}` }
      return { success: true, data: { parameter, new_value: newValue, method: 'handler_note' } }
    }

    case 'send_device_command': {
      const intensity = (val.intensity as number) ?? 5
      const duration = (val.duration as number) ?? 5
      const pattern = (val.pattern as string) || 'pulse'

      // Skip if no connection — otherwise this fails 73% of directives.
      const { data: conn } = await supabase.from('lovense_connections')
        .select('id').eq('user_id', userId).maybeSingle()
      if (!conn) {
        return { success: true, data: { skipped: true, reason: 'no_lovense_connection' } }
      }

      // Write to lovense_commands queue instead of invoking the user-JWT
      // edge function. The device bridge polls this table and executes.
      const { data, error } = await supabase.from('lovense_commands').insert({
        user_id: userId,
        command_type: 'Function',
        command_payload: { action: pattern.includes('edge') ? 'Vibrate' : 'Vibrate', intensity, duration_sec: duration, pattern },
        trigger_type: 'handler_directive',
        intensity,
        duration_sec: duration,
      }).select('id').single()
      if (error) return { success: false, error: `Queue insert failed: ${error.message}` }
      return { success: true, data: { command_id: data?.id, intensity, duration, pattern, method: 'queued' } }
    }

    case 'create_narrative_beat': {
      const arcId = val.arc_id as string
      const beat = val.beat as Record<string, unknown>
      if (!arcId || !beat) return { success: false, error: 'Missing arc_id or beat' }
      const { data: arc } = await supabase
        .from('narrative_arcs')
        .select('id, beats')
        .eq('id', arcId)
        .eq('user_id', userId)
        .maybeSingle()
      if (!arc) return { success: false, error: `Arc not found: ${arcId}` }
      const beats = Array.isArray(arc.beats) ? [...arc.beats, beat] : [beat]
      const { error } = await supabase.from('narrative_arcs').update({ beats }).eq('id', arc.id)
      if (error) return { success: false, error: `Update failed: ${error.message}` }
      return { success: true, data: { arc_id: arcId, beat_index: beats.length - 1 } }
    }

    case 'flag_for_review': {
      const content = val.content as string
      if (!content) return { success: false, error: 'Missing content' }
      const { data, error } = await supabase
        .from('handler_notes')
        .insert({ user_id: userId, note_type: 'context', content, priority: (val.priority as number) ?? 3, conversation_id: directive.conversation_id })
        .select('id')
        .single()
      if (error) return { success: false, error: `Insert failed: ${error.message}` }
      return { success: true, data: { note_id: data?.id, content } }
    }

    case 'custom': {
      console.log(`[directives] Custom directive logged: ${target}`, val)
      return { success: true, data: { action: 'custom', logged: true, target } }
    }

    default:
      return { success: false, error: `Unknown action: ${action}` }
  }
}

// =============================================
// Helpers
// =============================================
async function incrementPrescribedCounts(
  supabase: ReturnType<typeof createClient>,
  contentIds: string[],
) {
  for (const id of contentIds) {
    try {
      // Read current count, then increment (same read-then-write pattern used elsewhere)
      const { data: row } = await supabase
        .from('content_curriculum')
        .select('times_prescribed')
        .eq('id', id)
        .single()

      if (row) {
        await supabase
          .from('content_curriculum')
          .update({ times_prescribed: (row.times_prescribed ?? 0) + 1 })
          .eq('id', id)
      }
    } catch {
      // Non-critical — don't fail the prescription over a counter
      console.warn(`[sleep] Failed to increment times_prescribed for ${id}`)
    }
  }
}

// =============================================
// ACTION 6: generate_weekly_reflection
// Weekly Handler self-reflection loop (P11.5)
// =============================================
async function handleGenerateWeeklyReflection(supabase: ReturnType<typeof createClient>) {
  // Get all users with handler_interventions (active users)
  const { data: userRows, error: userErr } = await supabase
    .from('handler_interventions')
    .select('user_id')
    .order('user_id')

  if (userErr) {
    return jsonResponse({ error: 'Failed to query users', detail: userErr.message }, 500)
  }

  const userIds = [...new Set((userRows || []).map((r: { user_id: string }) => r.user_id))]
  console.log(`[weekly-reflection] Processing ${userIds.length} users`)

  const results: Record<string, { success: boolean; error?: string }> = {}

  for (const userId of userIds) {
    try {
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString()

      // Fetch intervention stats
      const { data: interventions } = await supabase
        .from('handler_interventions')
        .select('id, intervention_type, handler_mode')
        .eq('user_id', userId)
        .gte('created_at', weekAgo)

      const { data: outcomes } = await supabase
        .from('intervention_outcomes')
        .select('intervention_id, direction')
        .eq('user_id', userId)
        .gte('created_at', weekAgo)

      if (!interventions || interventions.length === 0) {
        results[userId] = { success: true, error: 'no interventions this week' }
        continue
      }

      // Build outcome map
      const outcomeMap = new Map<string, string[]>()
      for (const o of (outcomes || [])) {
        const list = outcomeMap.get(o.intervention_id) || []
        list.push(o.direction)
        outcomeMap.set(o.intervention_id, list)
      }

      // Group by type
      const groups = new Map<string, { total: number; positive: number; negative: number; mode: string | null }>()
      for (const i of interventions) {
        const key = i.intervention_type
        if (!groups.has(key)) groups.set(key, { total: 0, positive: 0, negative: 0, mode: i.handler_mode })
        const g = groups.get(key)!
        g.total++
        const dirs = outcomeMap.get(i.id) || []
        for (const d of dirs) {
          if (d === 'positive') g.positive++
          if (d === 'negative') g.negative++
        }
      }

      // Get compliance
      const { data: state } = await supabase
        .from('user_state')
        .select('compliance_rate, denial_day')
        .eq('user_id', userId)
        .maybeSingle()

      const compliance = state?.compliance_rate ?? 0
      const denial = state?.denial_day ?? 0

      // Build memo
      const allGroups = [...groups.entries()]
        .map(([type, g]) => ({ type, ...g, rate: g.total > 0 ? g.positive / Math.max(1, g.positive + g.negative) : 0 }))
        .filter(g => g.total >= 2)

      const top = [...allGroups].sort((a, b) => b.rate - a.rate).slice(0, 3)
      const bottom = [...allGroups].sort((a, b) => {
        const aRate = a.total > 0 ? a.negative / Math.max(1, a.positive + a.negative) : 0
        const bRate = b.total > 0 ? b.negative / Math.max(1, b.positive + b.negative) : 0
        return bRate - aRate
      }).slice(0, 3)

      const topStr = top.map(t => `${t.type} (${(t.rate * 100).toFixed(0)}% positive, n=${t.total})`).join('. ')
      const bottomStr = bottom
        .filter(b => b.negative > b.positive)
        .map(b => `${b.type} (${Math.round((b.negative / Math.max(1, b.positive + b.negative)) * 100)}% negative, n=${b.total})`)
        .join('. ')

      const memo = [
        'WEEKLY REFLECTION:',
        `What worked: ${topStr || 'Insufficient data.'}`,
        bottomStr ? `What didn't: ${bottomStr}` : '',
        `Trends: Compliance ${compliance}%. Denial day ${denial}. ${interventions.length} interventions this week.`,
      ].filter(Boolean).join('\n')

      // Store as handler_notes
      await supabase.from('handler_notes').insert({
        user_id: userId,
        note_type: 'strategy',
        content: memo,
        priority: 4,
      })

      results[userId] = { success: true }
    } catch (err) {
      results[userId] = { success: false, error: String(err) }
    }
  }

  return jsonResponse({ action: 'generate_weekly_reflection', results })
}

// =========================================================================
// process_device_schedule — fires every 5 min via jobid 102
// =========================================================================
// Finds rows in device_schedule where status='pending' and scheduled_at has
// passed, queues a corresponding handler_directives row (send_device_command),
// queues the paired_message (if any) to handler_outreach_queue, then marks
// the device_schedule row executed.
async function handleProcessDeviceSchedule(supabase: ReturnType<typeof createClient>) {
  const nowIso = new Date().toISOString()

  const { data: due, error: dueErr } = await supabase
    .from('device_schedule')
    .select('id, user_id, intensity, duration_seconds, pattern, pattern_data, paired_message, scheduled_at, expires_at, schedule_type')
    .eq('status', 'pending')
    .lte('scheduled_at', nowIso)
    .limit(50)

  if (dueErr) {
    console.error('[device_schedule] query failed:', dueErr)
    return jsonResponse({ error: 'Failed to query device_schedule', detail: dueErr.message }, 500)
  }

  if (!due || due.length === 0) {
    return jsonResponse({ action: 'process_device_schedule', fired: 0 })
  }

  let fired = 0
  let failed = 0
  for (const row of due as Array<{
    id: string; user_id: string; intensity: number | null;
    duration_seconds: number | null; pattern: string | null;
    pattern_data: Record<string, unknown> | null;
    paired_message: string | null; scheduled_at: string;
    expires_at: string | null; schedule_type: string | null;
  }>) {
    try {
      // Skip if expired
      if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
        await supabase.from('device_schedule')
          .update({ status: 'expired', executed_at: nowIso })
          .eq('id', row.id)
        continue
      }

      // Queue the device command as a handler_directive (device-control consumes these)
      await supabase.from('handler_directives').insert({
        user_id: row.user_id,
        action: 'send_device_command',
        target: 'lovense',
        value: {
          intensity: row.intensity ?? 10,
          duration: row.duration_seconds ?? 30,
          pattern: row.pattern || 'pulse',
          ...(row.pattern_data || {}),
        },
        priority: 'normal',
        reasoning: `Scheduled device event ${row.id} (${row.schedule_type || 'unknown'}) @ ${row.scheduled_at}`,
      })

      // Paired message (if any) goes to the Handler outreach queue
      if (row.paired_message && row.paired_message.trim().length > 0) {
        await supabase.from('handler_outreach_queue').insert({
          user_id: row.user_id,
          message: row.paired_message,
          urgency: 'normal',
          trigger_reason: `device_schedule:${row.id}`,
          scheduled_for: nowIso,
          expires_at: new Date(Date.now() + 6 * 3600000).toISOString(),
          source: 'device_schedule',
        })
      }

      await supabase.from('device_schedule')
        .update({ status: 'executed', executed_at: nowIso, fired_at: nowIso })
        .eq('id', row.id)

      fired++
    } catch (err) {
      console.error(`[device_schedule] row ${row.id} failed:`, err)
      failed++
      try {
        await supabase.from('device_schedule')
          .update({ status: 'failed', executed_at: nowIso, result: { error: String(err) } })
          .eq('id', row.id)
      } catch { /* ignore */ }
    }
  }

  return jsonResponse({ action: 'process_device_schedule', fired, failed })
}

// =========================================================================
// Stubs — cron-registered handlers that were never implemented
// =========================================================================
// These cases exist in the action-router above and are invoked by pg_cron,
// but the underlying table/logic hasn't been built yet. Returning a clean
// 200 instead of ReferenceError 500s keeps the response log readable and
// makes the gaps explicit so they can be prioritized when ready.

async function handleGenerateDailyCycle(_supabase: ReturnType<typeof createClient>) {
  return jsonResponse({ action: 'generate_daily_cycle', implemented: false, note: 'handler not yet implemented — cron firing into stub' })
}

async function handleExecuteCycleBlock(_supabase: ReturnType<typeof createClient>, block: string) {
  return jsonResponse({ action: `execute_daily_cycle_${block}`, implemented: false, note: 'handler not yet implemented — cron firing into stub' })
}

async function handleCheckObligationCompliance(_supabase: ReturnType<typeof createClient>) {
  return jsonResponse({ action: 'check_obligation_compliance', implemented: false, note: 'handler not yet implemented — cron firing into stub' })
}

async function handleExecuteConsequences(_supabase: ReturnType<typeof createClient>) {
  return jsonResponse({ action: 'execute_consequences', implemented: false, note: 'handler not yet implemented — cron firing into stub' })
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
