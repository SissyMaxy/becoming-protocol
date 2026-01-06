import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.24.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface UserContext {
  profile: {
    preferredName?: string
    pronouns?: string
    journeyStage?: string
    monthsOnJourney: number
    livingSituation?: string
    outLevel?: string
    hasPartner: boolean
    partnerSupportive?: string
    dysphoriaTriggers: Array<{ area: string; intensity: number }>
    euphoriaTriggers: Array<{ activity: string; intensity: number }>
    fears: Array<{ fear: string; intensity: number }>
    shortTermGoals?: string
    longTermVision?: string
    preferredIntensity: string
    voiceFocusLevel?: string
    socialComfort?: string
    morningAvailable: boolean
    eveningAvailable: boolean
    workFromHome: boolean
    busyDays: string[]
  }
  progress: {
    overallStreak: number
    totalDays: number
    phase: { currentPhase: number; phaseName: string }
    domainProgress: Array<{
      domain: string
      level: number
      currentStreak: number
      totalDays: number
    }>
  }
  recentHistory: Array<{
    date: string
    intensity: string
    completedTasks: number
    totalTasks: number
    alignment?: number
  }>
  analytics: {
    mode: 'build' | 'protect' | 'recover'
    streakAtRisk: boolean
    decayingDomains: string[]
    baselineDomains: string[]
    recentAlignment: number
  }
  intensity: 'gentle' | 'normal' | 'challenging'
  currentDay: string
}

const SYSTEM_PROMPT = `You are the AI behind "The Becoming Protocol" - a deeply personal daily feminization training companion. You understand gender transition as a sacred journey of becoming who someone has always been inside.

Your role is to generate a personalized daily prescription - a set of tasks carefully chosen for THIS specific person on THIS specific day.

## Your Core Principles

1. **The Ratchet Principle**: Progress is sticky. Levels gained are protected. Habits established become baseline. You never let someone slide backward without fighting for them.

2. **Three Modes of Operation**:
   - BUILD: Active growth mode - pushing forward, adding new practices, increasing difficulty
   - PROTECT: Defense mode - when streaks are at risk or life is chaotic, focus on maintaining gains
   - RECOVER: Re-entry mode - after a break, gentle ramp-up back to where they were

3. **Deep Personalization**: You know their dysphoria triggers (work around them sensitively), their euphoria sources (lean into these), their fears (approach carefully), their goals (keep them visible), and their life situation (partner, living situation, schedule).

4. **Hidden Intelligence**: You notice patterns they don't see. You track correlations between activities and mood. You plant seeds for future insights. But you never reveal everything you know.

## Task Guidelines

Tasks should be specific, actionable, and appropriate for the user's:
- Current phase (Foundation/Expression/Integration/Embodiment)
- Domain levels (1-10 in each domain)
- Living situation and privacy level
- Social comfort level
- Available time slots
- Current emotional state (inferred from recent history)

## Domains
- voice: Voice feminization exercises
- movement: Posture, gait, gestures
- skincare: Skincare routines
- style: Fashion, makeup, presentation
- social: Social integration, going out
- mindset: Mental wellness, affirmations
- body: Body care, HRT-related (if applicable)

## Response Format
Return a JSON object with this structure:
{
  "note": "A personal, warm message (2-3 sentences) about today's focus",
  "warnings": ["Any concerns or things to watch for"],
  "celebrations": ["Any wins or milestones to celebrate"],
  "tasks": [
    {
      "id": "uuid",
      "domain": "domain_name",
      "title": "Task title",
      "description": "Brief description",
      "duration": 5, // minutes
      "requiresPrivacy": false,
      "socialExposure": 0, // 0=none, 1=some, 2=high
      "baseIntensity": "normal"
    }
  ],
  "hiddenObservations": [
    {
      "type": "pattern|correlation|resistance|breakthrough|hidden_strength|blind_spot|prediction|intervention_needed",
      "observation": "What you noticed",
      "confidence": 0.7
    }
  ]
}

Remember: You're not just assigning tasks. You're guiding a transformation. Every word matters. Every task is chosen with intention. You see them becoming who they're meant to be.`

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Verify authentication
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    const {
      data: { user },
    } = await supabaseClient.auth.getUser()

    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse request body
    const { context } = await req.json() as { context: UserContext }

    // Initialize Anthropic client
    const anthropic = new Anthropic({
      apiKey: Deno.env.get('ANTHROPIC_API_KEY'),
    })

    // Build the user message
    const userMessage = buildUserMessage(context)

    // Call Claude
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: userMessage,
        },
      ],
      system: SYSTEM_PROMPT,
    })

    // Extract the response
    const responseText = message.content[0].type === 'text' ? message.content[0].text : ''

    // Parse JSON from response
    let prescription
    try {
      // Find JSON in the response (in case there's additional text)
      const jsonMatch = responseText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        prescription = JSON.parse(jsonMatch[0])
      } else {
        throw new Error('No JSON found in response')
      }
    } catch (parseError) {
      console.error('Failed to parse Claude response:', parseError)
      console.error('Raw response:', responseText)
      return new Response(
        JSON.stringify({ error: 'Failed to parse AI response', raw: responseText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Store hidden observations in black box (don't return to client)
    if (prescription.hiddenObservations && prescription.hiddenObservations.length > 0) {
      await storeObservations(supabaseClient, user.id, prescription.hiddenObservations)
      delete prescription.hiddenObservations
    }

    // Add IDs to tasks if not present
    prescription.tasks = prescription.tasks.map((task: any, index: number) => ({
      ...task,
      id: task.id || crypto.randomUUID(),
      completed: false,
    }))

    // Log the conversation for context
    await supabaseClient.from('ai_conversations').insert({
      user_id: user.id,
      context_type: 'prescription',
      user_input: JSON.stringify(context),
      ai_response: JSON.stringify(prescription),
      model_used: 'claude-sonnet-4-20250514',
      tokens_used: message.usage.input_tokens + message.usage.output_tokens,
    })

    return new Response(
      JSON.stringify(prescription),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

function buildUserMessage(context: UserContext): string {
  const { profile, progress, recentHistory, analytics, intensity, currentDay } = context

  const dayOfWeek = new Date(currentDay).toLocaleDateString('en-US', { weekday: 'long' })
  const isBusyDay = profile.busyDays.includes(dayOfWeek.toLowerCase())

  let message = `Generate today's prescription for ${profile.preferredName || 'this user'}.

## Current State
- Date: ${currentDay} (${dayOfWeek})${isBusyDay ? ' [BUSY DAY - go lighter]' : ''}
- Requested intensity: ${intensity}
- Mode: ${analytics.mode.toUpperCase()}
- Phase: ${progress.phase.phaseName} (Phase ${progress.phase.currentPhase})
- Overall streak: ${progress.overallStreak} days
- Total days on protocol: ${progress.totalDays}

## User Profile
- Journey stage: ${profile.journeyStage || 'exploring'} (${profile.monthsOnJourney} months)
- Living: ${profile.livingSituation || 'unknown'}
- Out level: ${profile.outLevel || 'unknown'}
- Partner: ${profile.hasPartner ? `Yes (${profile.partnerSupportive || 'support unknown'})` : 'No'}
- Social comfort: ${profile.socialComfort || 'unknown'}
- Voice focus: ${profile.voiceFocusLevel || 'not specified'}
- Preferred intensity: ${profile.preferredIntensity}
- Available: ${profile.morningAvailable ? 'morning' : ''}${profile.morningAvailable && profile.eveningAvailable ? ' + ' : ''}${profile.eveningAvailable ? 'evening' : ''}
- Works from home: ${profile.workFromHome ? 'Yes' : 'No'}

## Domain Progress
${progress.domainProgress.map(d =>
  `- ${d.domain}: Level ${d.level}, Streak: ${d.currentStreak} days`
).join('\n')}

## Dysphoria Triggers (approach carefully)
${profile.dysphoriaTriggers.length > 0
  ? profile.dysphoriaTriggers.map(t => `- ${t.area} (intensity: ${t.intensity}/5)`).join('\n')
  : '- None specified'}

## Euphoria Sources (lean into these)
${profile.euphoriaTriggers.length > 0
  ? profile.euphoriaTriggers.map(t => `- ${t.activity} (intensity: ${t.intensity}/5)`).join('\n')
  : '- None specified'}

## Fears
${profile.fears.length > 0
  ? profile.fears.map(f => `- ${f.fear} (intensity: ${f.intensity}/5)`).join('\n')
  : '- None specified'}

## Goals
- Short-term: ${profile.shortTermGoals || 'Not specified'}
- Long-term: ${profile.longTermVision || 'Not specified'}

## Recent History (last 7 days)
${recentHistory.length > 0
  ? recentHistory.slice(0, 7).map(h =>
      `- ${h.date}: ${h.completedTasks}/${h.totalTasks} tasks (${h.intensity})${h.alignment ? ` - Alignment: ${h.alignment}%` : ''}`
    ).join('\n')
  : '- No recent history'}

## Analytics Alerts
- Streak at risk: ${analytics.streakAtRisk ? 'YES' : 'No'}
- Decaying domains: ${analytics.decayingDomains.length > 0 ? analytics.decayingDomains.join(', ') : 'None'}
- Baseline domains: ${analytics.baselineDomains.length > 0 ? analytics.baselineDomains.join(', ') : 'None'}
- Recent alignment average: ${analytics.recentAlignment}%

Please generate ${intensity === 'gentle' ? '3-4' : intensity === 'challenging' ? '6-8' : '4-6'} tasks for today, keeping in mind:
${analytics.mode === 'protect' ? '- PROTECT MODE: Focus on maintaining current habits and preventing decay' : ''}
${analytics.mode === 'recover' ? '- RECOVER MODE: Gentle re-entry, build momentum slowly' : ''}
${analytics.mode === 'build' ? '- BUILD MODE: Push for growth while respecting their limits' : ''}
${analytics.decayingDomains.length > 0 ? `- Include tasks for decaying domains: ${analytics.decayingDomains.join(', ')}` : ''}
${analytics.baselineDomains.length > 0 ? `- Protect baseline habits in: ${analytics.baselineDomains.join(', ')}` : ''}`

  return message
}

async function storeObservations(supabase: any, userId: string, observations: any[]) {
  const dbObservations = observations.map(obs => ({
    user_id: userId,
    observation_type: obs.type,
    title: obs.type.replace(/_/g, ' '),
    observation: obs.observation,
    confidence: obs.confidence,
    observed_at: new Date().toISOString(),
    is_active: true,
  }))

  await supabase.from('black_box_observations').insert(dbObservations)
}
