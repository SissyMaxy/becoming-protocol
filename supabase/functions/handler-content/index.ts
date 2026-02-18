// Handler Content Engine — Edge Function
// Generates content briefs, processes submissions, generates captions
// Called by cron (daily brief generation) and by user (submission)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.24.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ContentRequest {
  action: 'generate_briefs' | 'generate_quick_task' | 'process_submission' | 'generate_captions'
  user_id?: string
  brief_id?: string
  content_ids?: string[]
  platforms?: string[]
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const body: ContentRequest = await req.json()
    const { action } = body

    // For user-facing actions, verify auth
    let userId = body.user_id
    if (!userId) {
      const authHeader = req.headers.get('Authorization') ?? ''
      const token = authHeader.replace('Bearer ', '')
      if (token) {
        const userClient = createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_ANON_KEY') ?? '',
          { global: { headers: { Authorization: `Bearer ${token}` } } }
        )
        const { data: { user } } = await userClient.auth.getUser()
        if (user) userId = user.id
      }
    }

    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'No user_id provided and no auth token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let result: Record<string, unknown>

    switch (action) {
      case 'generate_briefs':
        result = await generateDailyBriefs(supabase, userId)
        break
      case 'generate_quick_task':
        result = await generateQuickTask(supabase, userId)
        break
      case 'process_submission':
        result = await processSubmission(supabase, userId, body.brief_id!, body.content_ids!)
        break
      case 'generate_captions':
        result = await generateCaptions(supabase, userId, body.content_ids!, body.platforms!)
        break
      default:
        throw new Error(`Unknown action: ${action}`)
    }

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Handler content error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

// ============================================
// BRIEF GENERATION
// ============================================

async function generateDailyBriefs(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<Record<string, unknown>> {
  // Get strategy
  const { data: strategy } = await supabase
    .from('handler_strategy')
    .select('*')
    .eq('user_id', userId)
    .single()

  // Get pending briefs count
  const { count: pendingCount } = await supabase
    .from('content_briefs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .in('status', ['assigned', 'in_progress'])

  // Don't overload — max 3 active briefs
  const maxNew = Math.max(0, 3 - (pendingCount || 0))
  if (maxNew === 0) {
    return { briefs: [], message: 'Already have enough active briefs' }
  }

  // Get content calendar from strategy
  const calendar = (strategy?.content_calendar as Array<Record<string, unknown>>) || []
  const today = new Date().toISOString().split('T')[0]
  const todaySlots = calendar.filter((s: Record<string, unknown>) =>
    (s.date as string)?.startsWith(today)
  )

  // If no calendar slots, generate defaults based on phase
  const phase = strategy?.current_phase || 'foundation'
  const slotsToUse = todaySlots.length > 0
    ? todaySlots.slice(0, maxNew)
    : generateDefaultSlots(phase, maxNew)

  // Get recent content to avoid repetition
  const { data: recentContent } = await supabase
    .from('content_library')
    .select('content_type, tags, vulnerability_tier')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(10)

  // Get platform accounts
  const { data: accounts } = await supabase
    .from('platform_accounts')
    .select('platform, enabled')
    .eq('user_id', userId)
    .eq('enabled', true)

  const enabledPlatforms = (accounts || []).map(a => a.platform)

  const anthropic = new Anthropic({
    apiKey: Deno.env.get('ANTHROPIC_API_KEY'),
  })

  const briefs: Record<string, unknown>[] = []

  for (const slot of slotsToUse) {
    const contentType = (slot.contentType || slot.content_type || 'photo') as string
    const platforms = (slot.platforms || enabledPlatforms.slice(0, 3)) as string[]
    const vulnerabilityTier = (slot.vulnerabilityTier || slot.vulnerability_tier || 1) as number
    const difficulty = (slot.difficulty || 2) as number

    // Generate brief instructions via AI
    const briefContent = await generateBriefWithAI(anthropic, {
      contentType,
      platforms,
      vulnerabilityTier,
      phase: phase as string,
      recentContent: recentContent || [],
    })

    // Calculate rewards
    const rewardMoney = difficulty * 2 + vulnerabilityTier * 3
    const edgeCredits = difficulty >= 4 ? 2 : difficulty >= 3 ? 1 : 0

    // Calculate deadline (4-6 hours from now)
    const deadline = new Date()
    deadline.setHours(deadline.getHours() + 4 + Math.floor(Math.random() * 3))

    // Get next brief number
    const { data: maxBrief } = await supabase
      .from('content_briefs')
      .select('brief_number')
      .eq('user_id', userId)
      .order('brief_number', { ascending: false })
      .limit(1)
      .single()

    const briefNumber = ((maxBrief?.brief_number as number) || 0) + 1

    // Insert brief
    const { data: brief, error } = await supabase
      .from('content_briefs')
      .insert({
        user_id: userId,
        brief_number: briefNumber,
        status: 'assigned',
        content_type: contentType,
        purpose: briefContent.purpose,
        platforms,
        instructions: briefContent.instructions,
        deadline: deadline.toISOString(),
        difficulty,
        vulnerability_tier: vulnerabilityTier,
        reward_money: rewardMoney,
        reward_arousal: `${edgeCredits > 0 ? edgeCredits + ' edge credit(s)' : 'Pleasure pulse'}`,
        reward_edge_credits: edgeCredits,
        consequence_if_missed: {
          type: 'bleeding',
          rate: 0.25,
          description: '$0.25/min after deadline',
        },
      })
      .select()
      .single()

    if (error) {
      console.error('Failed to create brief:', error)
      continue
    }

    briefs.push(brief)

    // Log decision
    await supabase.from('handler_decisions').insert({
      user_id: userId,
      decision_type: 'task_assignment',
      decision_data: {
        brief_number: briefNumber,
        content_type: contentType,
        platforms,
        difficulty,
        vulnerability_tier: vulnerabilityTier,
        reward_money: rewardMoney,
      },
      reasoning: `Phase: ${phase}. Generated ${contentType} brief targeting ${platforms.join(', ')}. Vulnerability tier ${vulnerabilityTier}.`,
      executed: true,
      executed_at: new Date().toISOString(),
    })
  }

  return { briefs, count: briefs.length }
}

// ============================================
// QUICK TASK
// ============================================

async function generateQuickTask(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<Record<string, unknown>> {
  const anthropic = new Anthropic({
    apiKey: Deno.env.get('ANTHROPIC_API_KEY'),
  })

  const hour = new Date().getHours()
  const isWorkHours = hour >= 9 && hour <= 17

  const briefContent = await generateBriefWithAI(anthropic, {
    contentType: isWorkHours ? 'text' : 'photo',
    platforms: ['twitter'],
    vulnerabilityTier: 1,
    phase: 'foundation',
    recentContent: [],
    isQuickTask: true,
  })

  // Short deadline: 2-5 minutes
  const deadline = new Date()
  deadline.setMinutes(deadline.getMinutes() + (isWorkHours ? 2 : 5))

  const { data: maxBrief } = await supabase
    .from('content_briefs')
    .select('brief_number')
    .eq('user_id', userId)
    .order('brief_number', { ascending: false })
    .limit(1)
    .single()

  const briefNumber = ((maxBrief?.brief_number as number) || 0) + 1

  const rewardMoney = 1 + Math.random() * 4 // $1-5 variable reward
  const isJackpot = Math.random() < 0.1 // 10% chance of bonus

  const { data: brief } = await supabase
    .from('content_briefs')
    .insert({
      user_id: userId,
      brief_number: briefNumber,
      status: 'assigned',
      content_type: isWorkHours ? 'text' : 'photo',
      purpose: briefContent.purpose,
      platforms: ['twitter'],
      instructions: briefContent.instructions,
      deadline: deadline.toISOString(),
      difficulty: 1,
      vulnerability_tier: 1,
      reward_money: isJackpot ? rewardMoney * 3 : rewardMoney,
      reward_arousal: 'Quick pleasure pulse',
      reward_edge_credits: 0,
      consequence_if_missed: null, // No penalty for quick tasks
    })
    .select()
    .single()

  return { brief, is_jackpot: isJackpot }
}

// ============================================
// SUBMISSION PROCESSING
// ============================================

async function processSubmission(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  briefId: string,
  contentIds: string[]
): Promise<Record<string, unknown>> {
  // Get the brief
  const { data: brief } = await supabase
    .from('content_briefs')
    .select('*')
    .eq('id', briefId)
    .single()

  if (!brief) {
    throw new Error('Brief not found')
  }

  // Check deadline
  const now = new Date()
  const deadline = new Date(brief.deadline)
  const isLate = now > deadline

  // Update brief status
  await supabase
    .from('content_briefs')
    .update({
      status: 'submitted',
      submitted_content_ids: contentIds,
      submitted_at: now.toISOString(),
    })
    .eq('id', briefId)

  // Update content_library items with brief reference
  for (const contentId of contentIds) {
    await supabase
      .from('content_library')
      .update({
        source_brief_id: briefId,
        vulnerability_tier: brief.vulnerability_tier,
      })
      .eq('id', contentId)
  }

  // Schedule posts for each platform
  const platforms = brief.platforms as string[]
  const postsScheduled: string[] = []

  for (const platform of platforms) {
    // Get platform account
    const { data: account } = await supabase
      .from('platform_accounts')
      .select('id, platform, posting_schedule')
      .eq('user_id', userId)
      .eq('platform', platform)
      .eq('enabled', true)
      .single()

    if (!account) continue

    // Calculate optimal post time (spread across next 24 hours)
    const postTime = new Date()
    postTime.setHours(postTime.getHours() + 1 + Math.floor(Math.random() * 12))

    for (const contentId of contentIds) {
      const { data: post } = await supabase
        .from('scheduled_posts')
        .insert({
          user_id: userId,
          platform_account_id: account.id,
          content_id: contentId,
          post_type: brief.vulnerability_tier >= 3 ? 'ppv' : 'feed',
          caption: null, // Will be generated by caption job
          hashtags: [],
          metadata: { brief_id: briefId, platform },
          scheduled_for: postTime.toISOString(),
          price: brief.vulnerability_tier >= 3 ? brief.vulnerability_tier * 5 : null,
          status: 'scheduled',
        })
        .select('id')
        .single()

      if (post) postsScheduled.push(post.id)
    }
  }

  // Record engagement
  await supabase.rpc('record_engagement', { p_user_id: userId })

  // Add reward to fund
  if (brief.reward_money > 0) {
    await supabase.rpc('add_to_fund', {
      p_user_id: userId,
      p_amount: brief.reward_money,
      p_type: 'reward',
      p_description: `Brief #${brief.brief_number} completion reward`,
      p_reference_id: briefId,
    })
  }

  // Log decision
  await supabase.from('handler_decisions').insert({
    user_id: userId,
    decision_type: 'posting',
    decision_data: {
      brief_id: briefId,
      content_ids: contentIds,
      platforms,
      posts_scheduled: postsScheduled.length,
      is_late: isLate,
    },
    reasoning: `Submission for Brief #${brief.brief_number}. ${contentIds.length} files. Scheduling ${postsScheduled.length} posts across ${platforms.length} platforms.${isLate ? ' LATE submission.' : ''}`,
    executed: true,
    executed_at: now.toISOString(),
  })

  // Mark brief as processed
  await supabase
    .from('content_briefs')
    .update({ status: 'processed', processed_at: now.toISOString() })
    .eq('id', briefId)

  return {
    success: true,
    posts_scheduled: postsScheduled.length,
    reward: brief.reward_money,
    is_late: isLate,
    message: isLate
      ? `Received late. ${postsScheduled.length} posts scheduled. Reward: $${brief.reward_money}.`
      : `Received. Processing for ${platforms.join(', ')}. Reward: $${brief.reward_money}. ${brief.reward_edge_credits > 0 ? `+${brief.reward_edge_credits} edge credits.` : ''}`,
  }
}

// ============================================
// CAPTION GENERATION
// ============================================

async function generateCaptions(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  contentIds: string[],
  platforms: string[]
): Promise<Record<string, unknown>> {
  const anthropic = new Anthropic({
    apiKey: Deno.env.get('ANTHROPIC_API_KEY'),
  })

  const captions: Record<string, Record<string, string>> = {}

  for (const contentId of contentIds) {
    const { data: content } = await supabase
      .from('content_library')
      .select('content_type, tags, vulnerability_tier')
      .eq('id', contentId)
      .single()

    if (!content) continue

    captions[contentId] = {}

    for (const platform of platforms) {
      const caption = await generateCaptionWithAI(anthropic, {
        platform,
        contentType: content.content_type,
        vulnerabilityTier: content.vulnerability_tier,
        tags: content.tags || [],
      })

      captions[contentId][platform] = caption

      // Update scheduled posts with caption
      await supabase
        .from('scheduled_posts')
        .update({
          caption: caption.text,
          hashtags: caption.hashtags,
        })
        .eq('content_id', contentId)
        .eq('status', 'scheduled')
        .contains('metadata', { platform })
    }

    // Save caption variations to content library
    await supabase
      .from('content_library')
      .update({ caption_variations: captions[contentId] })
      .eq('id', contentId)
  }

  return { captions, count: Object.keys(captions).length }
}

// ============================================
// AI HELPERS
// ============================================

async function generateBriefWithAI(
  anthropic: Anthropic,
  params: {
    contentType: string
    platforms: string[]
    vulnerabilityTier: number
    phase: string
    recentContent: Array<Record<string, unknown>>
    isQuickTask?: boolean
  }
): Promise<{ purpose: string; instructions: Record<string, unknown> }> {
  const prompt = `You are the Handler generating a content creation brief for Maxy.

CONTEXT:
- Content type: ${params.contentType}
- Target platforms: ${params.platforms.join(', ')}
- Vulnerability tier: ${params.vulnerabilityTier}/5 (1=safe, 5=very exposed)
- Phase: ${params.phase}
- Quick task: ${params.isQuickTask ? 'Yes, must be completable in 2-5 minutes' : 'No, standard brief'}

${params.recentContent.length > 0 ? `Recent content (avoid repeating):
${JSON.stringify(params.recentContent.slice(0, 5))}` : ''}

Generate a specific, detailed brief. Be creative and unique.

Respond with JSON only:
{
  "purpose": "what this content achieves (1 sentence)",
  "instructions": {
    "concept": "creative concept",
    "setting": "where to create this",
    "outfit": "what to wear",
    "lighting": "lighting setup",
    "framing": "camera angle/framing",
    "expression": "facial expression/mood",
    "poses": ["specific poses if photo/video"],
    "script": "what to say if video/audio, null otherwise",
    "duration": "length if video/audio, null otherwise",
    "technicalNotes": ["quality tips"]
  }
}`

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : ''
    const match = text.match(/\{[\s\S]*\}/)
    if (match) return JSON.parse(match[0])
  } catch (err) {
    console.error('AI brief generation failed:', err)
  }

  // Fallback
  return {
    purpose: `Create ${params.contentType} content for ${params.platforms[0]}`,
    instructions: {
      concept: 'Feminine selfie or creative shot',
      setting: 'Well-lit room',
      outfit: 'Something feminine and comfortable',
      lighting: 'Natural light preferred',
      framing: 'Portrait orientation',
      expression: 'Confident and relaxed',
      poses: ['Front-facing', 'Three-quarter angle'],
      script: null,
      duration: null,
      technicalNotes: ['Clean background', 'Good focus', 'High resolution'],
    },
  }
}

async function generateCaptionWithAI(
  anthropic: Anthropic,
  params: {
    platform: string
    contentType: string
    vulnerabilityTier: number
    tags: string[]
  }
): Promise<{ text: string; hashtags: string[] }> {
  const charLimits: Record<string, number> = {
    twitter: 280,
    reddit: 300,
    onlyfans: 1000,
    fansly: 1000,
    patreon: 2000,
    instagram: 2200,
    tiktok: 2200,
  }

  const prompt = `Generate a caption for ${params.platform} for a ${params.contentType} post.
Vulnerability tier: ${params.vulnerabilityTier}/5.
Tags: ${params.tags.join(', ') || 'none'}.
Max length: ${charLimits[params.platform] || 500} chars.

Be warm, engaging, on-brand as Maxy. Include relevant emojis.

Respond JSON: {"text": "caption text", "hashtags": ["tag1", "tag2"]}`

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : ''
    const match = text.match(/\{[\s\S]*\}/)
    if (match) return JSON.parse(match[0])
  } catch (err) {
    console.error('Caption generation failed:', err)
  }

  return {
    text: `New ${params.contentType} 💕`,
    hashtags: ['maxy', 'content'],
  }
}

// ============================================
// HELPERS
// ============================================

function generateDefaultSlots(phase: string, maxSlots: number): Array<Record<string, unknown>> {
  const slots: Array<Record<string, unknown>> = []
  const types = ['photo', 'photo_set', 'video', 'text']
  const count = phase === 'foundation' ? 1 : phase === 'growth' ? 2 : 3

  for (let i = 0; i < Math.min(count, maxSlots); i++) {
    slots.push({
      contentType: types[i % types.length],
      platforms: ['onlyfans', 'reddit'],
      vulnerabilityTier: phase === 'foundation' ? 1 : Math.min(i + 1, 3),
      difficulty: phase === 'foundation' ? 1 : 2 + i,
    })
  }

  return slots
}
