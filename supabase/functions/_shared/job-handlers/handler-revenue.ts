// Handler Revenue Engine — job handler. Used to be the handler-revenue edge
// function. Public action contract preserved: callers POST { action, user_id?,
// data? } and the entrypoint enqueues a `handler-revenue:<action>` job.
// Cron schedules:
//   - every 15 min:    process_ai_queue
//   - every 3 hours:   engagement_cycle
//   - daily midnight:  daily_batch
//   - daily 7 AM:      gfe_morning
//   - daily 9 PM:      gfe_evening
//   - weekly Sunday:   weekly_batch
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.74.0'

export type RevenueAction =
  | 'process_ai_queue'
  | 'engagement_cycle'
  | 'daily_batch'
  | 'gfe_morning'
  | 'gfe_evening'
  | 'weekly_batch'
  | 'multiply_content'
  | 'respond_dm'
  | 'generate_post'
  | 'regenerate_drafts'

const VALID_REVENUE_ACTIONS: ReadonlySet<RevenueAction> = new Set([
  'process_ai_queue',
  'engagement_cycle',
  'daily_batch',
  'gfe_morning',
  'gfe_evening',
  'weekly_batch',
  'multiply_content',
  'respond_dm',
  'generate_post',
  'regenerate_drafts',
])

export function isValidRevenueAction(s: unknown): s is RevenueAction {
  return typeof s === 'string' && VALID_REVENUE_ACTIONS.has(s as RevenueAction)
}

export interface HandlerRevenuePayload {
  action: RevenueAction
  user_id?: string
  data?: Record<string, unknown>
}

export async function runHandlerRevenue(
  supabase: SupabaseClient,
  payload: HandlerRevenuePayload,
): Promise<Record<string, unknown>> {
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY') ?? ''
  const anthropic = new Anthropic({ apiKey: anthropicKey })
  const userId = payload.user_id

  let result: Record<string, unknown> = {}

  switch (payload.action) {
    case 'process_ai_queue':
      result = await processAIQueue(supabase)
      break
    case 'engagement_cycle':
      if (!userId) throw new Error('user_id required for engagement_cycle')
      result = await engagementCycle(supabase, anthropic, userId)
      break
    case 'daily_batch':
      if (!userId) throw new Error('user_id required for daily_batch')
      result = await dailyBatch(supabase, anthropic, userId)
      break
    case 'gfe_morning':
      if (!userId) throw new Error('user_id required for gfe_morning')
      result = await gfeMessages(supabase, anthropic, userId, 'morning')
      break
    case 'gfe_evening':
      if (!userId) throw new Error('user_id required for gfe_evening')
      result = await gfeMessages(supabase, anthropic, userId, 'evening')
      break
    case 'weekly_batch':
      if (!userId) throw new Error('user_id required for weekly_batch')
      result = await weeklyBatch(supabase, anthropic, userId)
      break
    case 'multiply_content':
      if (!userId) throw new Error('user_id required for multiply_content')
      result = await multiplyNewContent(supabase, anthropic, userId)
      break
    case 'respond_dm':
      if (!userId) throw new Error('user_id and data required for respond_dm')
      result = await respondToDM(supabase, anthropic, userId, payload.data || {})
      break
    case 'generate_post':
      if (!userId) throw new Error('user_id required for generate_post')
      result = await generatePost(supabase, anthropic, userId, payload.data || {})
      break
    case 'regenerate_drafts':
      result = await regenerateSlopDrafts(supabase, anthropic, userId)
      break
    default:
      throw new Error(`Unknown revenue action: ${(payload as { action?: string }).action}`)
  }

  if (userId) {
    await supabase.from('handler_autonomous_actions').insert({
      user_id: userId,
      action_type: `revenue:${payload.action}`,
      action_data: result,
      status: 'completed',
    }).then(() => {})
  }

  return { action: payload.action, ...result }
}

// ── Maxy voice prompt ───────────────────────────────────────────────

const MAXY_VOICE = `
You are writing as Maxy — a woman in transformation, playful,
flirty, a little submissive, confident in her sexuality,
vulnerable about her journey when it serves connection.
Lowercase casual for tweets. Playful and teasing with followers.
Sexually confident but not crude. Uses "lol" and "tbh" naturally.
Never uses emoji excessively — one max per post, often none.
`

// ── Action handlers ─────────────────────────────────────────────────

async function processAIQueue(supabase: ReturnType<typeof createClient>): Promise<Record<string, unknown>> {
  // Fetch due AI content — the auto-poster handles actual posting
  // This just marks items as ready / logs stats
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('ai_generated_content')
    .select('id, platform')
    .eq('status', 'scheduled')
    .lte('scheduled_at', now)

  if (error) return { error: error.message }
  return { dueItems: data?.length || 0 }
}

// Handler-state loader. Every revenue generator reads this before
// producing user-facing content so output reflects current persona,
// phase, denial state, and chastity/hard-mode flags. Closes the
// centrality audit gap. Memory: feedback_handler_is_singular_authority.
async function loadRevenueHandlerState(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<{
  handler_persona?: string | null;
  current_phase?: number | null;
  denial_day?: number | null;
  hard_mode_active?: boolean | null;
  slip_points_current?: number | null;
  chastity_locked?: boolean | null;
} | null> {
  if (!userId) return null;
  const { data } = await supabase
    .from('user_state')
    .select('handler_persona, current_phase, denial_day, hard_mode_active, slip_points_current, chastity_locked')
    .eq('user_id', userId)
    .maybeSingle();
  return (data as Record<string, unknown>) || null;
}

function handlerVoiceFooter(state: Awaited<ReturnType<typeof loadRevenueHandlerState>>): string {
  if (!state) return '';
  const parts: string[] = [];
  if (state.handler_persona) parts.push(`persona=${state.handler_persona}`);
  if (state.current_phase != null) parts.push(`phase=${state.current_phase}`);
  if (state.denial_day != null) parts.push(`denial_day=${state.denial_day}`);
  if (state.hard_mode_active) parts.push('hard_mode=on');
  if (state.chastity_locked) parts.push('chastity=locked');
  return parts.length ? `\nCurrent state: ${parts.join(', ')}. Voice and content must reflect this.` : '';
}

// Cross-model authenticity grader. Calls grade-post-authenticity edge fn
// (GPT-4o-mini adversary). Returns { accept, score, reasons } so the caller
// can decide: accept → status='scheduled'; reject → status='draft' for
// user review (and log the slop reasons for trend tracking).
async function gradePostBeforePublish(opts: {
  content: string;
  platform: string;
  niche?: string;
  contentType?: string;
  userId: string;
  sourceId?: string;
}): Promise<{ accept: boolean; score: number; reasons: string[]; suggestions: string[] }> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const r = await fetch(`${supabaseUrl}/functions/v1/grade-post-authenticity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: opts.content,
        platform: opts.platform,
        niche: opts.niche,
        content_type: opts.contentType,
        user_id: opts.userId,
        source_id: opts.sourceId,
      }),
    });
    if (!r.ok) return { accept: true, score: 65, reasons: [`grader_http_${r.status}`], suggestions: [] };
    const data = await r.json() as { ok?: boolean; authentic_score?: number; accept?: boolean; reasons?: string[]; suggestions?: string[] };
    return {
      accept: data.accept ?? true,
      score: data.authentic_score ?? 65,
      reasons: data.reasons ?? [],
      suggestions: data.suggestions ?? [],
    };
  } catch (err) {
    // Default permissive — don't let grader failures block publishing
    console.warn('[gradePostBeforePublish] error:', err);
    return { accept: true, score: 65, reasons: ['grader_error'], suggestions: [] };
  }
}

// Auto-regenerate drafts that were rejected by the grader. Reads slop reasons
// + suggestions from generation_context, re-prompts Claude with that feedback
// baked in, re-grades, and upgrades to 'scheduled' on accept. Caps at 2 attempts
// per row so we don't loop on stubborn slop.
async function regenerateSlopDrafts(
  supabase: ReturnType<typeof createClient>,
  anthropic: InstanceType<typeof Anthropic>,
  userId?: string,
): Promise<Record<string, unknown>> {
  const MAX_ATTEMPTS = 2;
  const BATCH_LIMIT = 10;

  let q = supabase
    .from('ai_generated_content')
    .select('id, user_id, content, content_type, platform, target_subreddit, target_account, generation_context, generation_prompt')
    .eq('status', 'draft')
    .order('created_at', { ascending: true })
    .limit(BATCH_LIMIT);
  if (userId) q = q.eq('user_id', userId);
  const { data: drafts, error } = await q;
  if (error) return { error: error.message };
  if (!drafts || drafts.length === 0) return { processed: 0, upgraded: 0, kept_draft: 0 };

  let upgraded = 0;
  let keptDraft = 0;
  let skipped = 0;

  for (const draft of drafts) {
    const ctx = (draft.generation_context as Record<string, unknown> | null) ?? {};
    const reasons = (ctx.slop_reasons as string[] | undefined) ?? [];
    const suggestions = (ctx.slop_suggestions as string[] | undefined) ?? [];
    const attempts = Number(ctx.regenerate_attempts ?? 0);

    // Skip rows that were never graded (no slop_reasons) — they're drafts for some other reason
    if (reasons.length === 0 && suggestions.length === 0) { skipped++; continue; }
    if (attempts >= MAX_ATTEMPTS) { skipped++; continue; }

    // Build retry prompt from original prompt + slop feedback
    const originalPrompt = (draft.generation_prompt as string | null) ?? `Write a ${draft.content_type || 'post'} for ${draft.platform}.`;
    const retryPrompt = `${originalPrompt}

Your previous attempt was rejected by an authenticity judge.
Issues found: ${reasons.join('; ')}
${suggestions.length > 0 ? `Specific fixes the judge suggested: ${suggestions.join('; ')}` : ''}

REWRITE COMPLETELY. Different angle, different words, different structure. Sound like a real person typed it on their phone — not a brand, not a therapist, not a motivational poster. Lowercase ok. Rough edges ok. Specificity required.

Output ONLY the new ${draft.content_type || 'post'} text, no preamble.`;

    let newContent = '';
    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 600,
        system: MAXY_VOICE,
        messages: [{ role: 'user', content: retryPrompt }],
      });
      newContent = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '';
    } catch (err) {
      console.warn('[regenerateSlopDrafts] regen LLM error:', err);
      keptDraft++;
      continue;
    }

    if (!newContent || newContent.length < 5) { keptDraft++; continue; }

    // Re-grade the regenerated version
    const grade = await gradePostBeforePublish({
      content: newContent,
      platform: (draft.platform as string) || 'twitter',
      niche: (draft.target_subreddit as string | null) ?? undefined,
      contentType: (draft.content_type as string) || 'tweet',
      userId: draft.user_id as string,
    });

    const newCtx: Record<string, unknown> = {
      ...ctx,
      regenerate_attempts: attempts + 1,
      regenerate_last_at: new Date().toISOString(),
      authentic_score: grade.score,
      slop_reasons: grade.reasons,
      slop_suggestions: grade.suggestions,
      previous_content: draft.content,
    };

    if (grade.accept) {
      await supabase.from('ai_generated_content')
        .update({ content: newContent, status: 'scheduled', generation_context: newCtx })
        .eq('id', draft.id);
      upgraded++;
    } else {
      // Keep as draft with updated content + reasons; user can review
      await supabase.from('ai_generated_content')
        .update({ content: newContent, generation_context: newCtx })
        .eq('id', draft.id);
      keptDraft++;
    }
  }

  return { processed: drafts.length, upgraded, kept_draft: keptDraft, skipped };
}

async function engagementCycle(
  supabase: ReturnType<typeof createClient>,
  anthropic: InstanceType<typeof Anthropic>,
  userId: string,
): Promise<Record<string, unknown>> {
  const handlerState = await loadRevenueHandlerState(supabase, userId);
  const { data: targets } = await supabase
    .from('engagement_targets')
    .select('*')
    .eq('user_id', userId)
    .order('last_interaction_at', { ascending: true, nullsFirst: true })
    .limit(10)

  if (!targets || targets.length === 0) return { engaged: 0 }

  let engaged = 0
  for (const target of targets) {
    await supabase.from('ai_generated_content').insert({
      user_id: userId,
      content_type: 'reply',
      platform: target.platform,
      content: '',
      target_account: target.target_handle,
      generation_prompt: `Reply to @${target.target_handle} as Maxy. Strategy: ${target.strategy || 'genuine engagement'}. 1-2 sentences.${handlerVoiceFooter(handlerState)}`,
      generation_strategy: 'engagement',
      status: 'scheduled',
      scheduled_at: new Date().toISOString(),
    })

    await supabase.from('engagement_targets').update({
      interactions_count: (target.interactions_count || 0) + 1,
      last_interaction_at: new Date().toISOString(),
    }).eq('id', target.id)

    engaged++
  }

  return { engaged }
}

async function dailyBatch(
  supabase: ReturnType<typeof createClient>,
  anthropic: InstanceType<typeof Anthropic>,
  userId: string,
): Promise<Record<string, unknown>> {
  // Generate content calendar
  const calendarResult = await generateContentCalendar(supabase, anthropic, userId)

  // Reset GFE daily flags
  await supabase.rpc('reset_gfe_daily_flags')

  // Process new vault items
  const multiplyResult = await multiplyNewContent(supabase, anthropic, userId)

  return {
    calendar: calendarResult,
    gfeReset: true,
    multiply: multiplyResult,
  }
}

async function generateContentCalendar(
  supabase: ReturnType<typeof createClient>,
  anthropic: InstanceType<typeof Anthropic>,
  userId: string,
): Promise<Record<string, unknown>> {
  const handlerState = await loadRevenueHandlerState(supabase, userId);
  const prompt = handlerVoiceFooter(handlerState) + `
Generate tomorrow's social media content calendar for Maxy.

Twitter: 6-8 posts/day (personality, thirst, vulnerability, engagement bait)
Reddit: 3-5 posts/comments across relevant subs
FetLife: 1-2 posts/comments in groups

For each post output JSON with: platform, time (HH:MM), content_type, text, subreddit (optional).
Vary tone: morning lighter, afternoon engagement, evening vulnerability + thirst.

Return ONLY a valid JSON array.`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 3000,
    system: MAXY_VOICE + '\nGenerate a content calendar. Output only valid JSON array.',
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  try {
    const posts = JSON.parse(text.replace(/```json\n?|```\n?/g, '').trim())
    if (!Array.isArray(posts)) return { error: 'not an array' }

    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const dateStr = tomorrow.toISOString().split('T')[0]

    let scheduled = 0
    let drafted = 0
    for (const post of posts) {
      const [hours, minutes] = (post.time || '12:00').split(':').map(Number)
      const scheduledAt = new Date(tomorrow)
      scheduledAt.setHours(hours || 12, minutes || 0, 0, 0)

      // Grade with cross-model adversary BEFORE publishing. Slop drafts go to
      // 'draft' status so user reviews; clean ones go to 'scheduled'.
      const grade = await gradePostBeforePublish({
        content: post.text || '',
        platform: post.platform || 'twitter',
        niche: post.subreddit || undefined,
        contentType: post.content_type || 'tweet',
        userId,
      })

      const { error } = await supabase.from('ai_generated_content').insert({
        user_id: userId,
        content_type: post.content_type || 'tweet',
        platform: post.platform || 'twitter',
        content: post.text || '',
        target_subreddit: post.subreddit || null,
        target_hashtags: post.hashtags || [],
        generation_strategy: post.content_type || 'personality',
        status: grade.accept ? 'scheduled' : 'draft',
        scheduled_at: scheduledAt.toISOString(),
        generation_context: {
          authentic_score: grade.score,
          slop_reasons: grade.reasons,
          slop_suggestions: grade.suggestions,
          graded_by: 'gpt-4o-mini',
        },
      })

      if (!error) {
        if (grade.accept) scheduled++; else drafted++
      }
    }

    // Save calendar summary
    const platforms = [...new Set(posts.map((p: Record<string, string>) => p.platform))]
    for (const platform of platforms) {
      const platformPosts = posts.filter((p: Record<string, string>) => p.platform === platform)
      await supabase.from('revenue_content_calendar').upsert({
        user_id: userId,
        date: dateStr,
        platform,
        planned_posts: platformPosts,
      }, { onConflict: 'user_id,date,platform' })
    }

    return { postsScheduled: scheduled, postsDrafted: drafted, platforms }
  } catch {
    return { error: 'Failed to parse calendar JSON' }
  }
}

async function gfeMessages(
  supabase: ReturnType<typeof createClient>,
  anthropic: InstanceType<typeof Anthropic>,
  userId: string,
  timeOfDay: 'morning' | 'evening',
): Promise<Record<string, unknown>> {
  const handlerState = await loadRevenueHandlerState(supabase, userId);
  const stateFooter = handlerVoiceFooter(handlerState);
  const { data: subscribers } = await supabase
    .from('gfe_subscribers')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')

  if (!subscribers || subscribers.length === 0) return { sent: 0 }

  let sent = 0
  for (const sub of subscribers) {
    const prompt = `Write a ${timeOfDay} GFE message from Maxy to ${sub.subscriber_name || 'subscriber'}.
Tier: ${sub.tier}. Preferences: ${sub.known_preferences || 'none yet'}.
${timeOfDay === 'morning' ? 'Just woke up energy.' : 'Crawling into bed energy.'}
2-4 sentences. Output ONLY the message.${stateFooter}`

    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 200,
        system: MAXY_VOICE,
        messages: [{ role: 'user', content: prompt }],
      })

      const message = response.content[0].type === 'text' ? response.content[0].text : ''
      if (!message.trim()) continue

      await supabase.from('paid_conversations').insert({
        user_id: userId,
        platform: sub.platform,
        subscriber_id: sub.subscriber_id,
        subscriber_name: sub.subscriber_name,
        conversation_type: 'gfe_daily',
        handler_response: message.trim(),
        revenue: (sub.monthly_rate || 0) / 30,
        revenue_type: 'subscription_tier',
      })

      await supabase.from('gfe_subscribers').update({
        daily_message_sent_today: true,
        last_message_at: new Date().toISOString(),
      }).eq('id', sub.id)

      sent++
    } catch (err) {
      console.error(`[gfe] Message failed for ${sub.subscriber_name}:`, err)
    }
  }

  return { sent }
}

async function weeklyBatch(
  supabase: ReturnType<typeof createClient>,
  anthropic: InstanceType<typeof Anthropic>,
  userId: string,
): Promise<Record<string, unknown>> {
  // Revenue review
  const reviewResult = await revenueReview(supabase, anthropic, userId)

  // Generate erotica
  const eroticaResult = await generateWrittenContent(supabase, anthropic, userId, 'erotica')

  // Generate affiliate content
  const affiliateResult = await generateWrittenContent(supabase, anthropic, userId, 'affiliate')

  return { review: reviewResult, erotica: eroticaResult, affiliate: affiliateResult }
}

async function revenueReview(
  supabase: ReturnType<typeof createClient>,
  anthropic: InstanceType<typeof Anthropic>,
  userId: string,
): Promise<Record<string, unknown>> {
  const handlerState = await loadRevenueHandlerState(supabase, userId);
  // Get this week's revenue
  const weekStart = getWeekStart()
  const { data: revenueData } = await supabase
    .from('revenue_log')
    .select('amount, platform, source')
    .eq('user_id', userId)
    .gte('created_at', weekStart)

  const total = revenueData?.reduce((sum: number, r: Record<string, unknown>) => sum + (Number(r.amount) || 0), 0) || 0

  const prompt = `Weekly revenue review. This week: $${total.toFixed(2)}.
Make decisions on: pricing, promotions, content focus, platform focus, investments.
Output JSON with: pricing_changes, promotions_to_run, content_focus_this_week, platform_focus, investment_decisions, projected_next_week, months_to_crossover.${handlerVoiceFooter(handlerState)}`

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      system: 'Revenue strategy engine. Output only valid JSON.',
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const review = JSON.parse(text.replace(/```json\n?|```\n?/g, '').trim())

    // Log decisions
    if (review.content_focus_this_week) {
      await supabase.from('revenue_decisions').insert({
        user_id: userId,
        decision_type: 'content_focus',
        decision_data: { focus: review.content_focus_this_week },
        rationale: review.content_focus_this_week,
      })
    }

    return { weeklyTotal: total, review }
  } catch {
    return { weeklyTotal: total, error: 'Review generation failed' }
  }
}

async function generateWrittenContent(
  supabase: ReturnType<typeof createClient>,
  anthropic: InstanceType<typeof Anthropic>,
  userId: string,
  type: 'erotica' | 'affiliate',
): Promise<Record<string, unknown>> {
  const handlerState = await loadRevenueHandlerState(supabase, userId);
  const stateFooter = handlerVoiceFooter(handlerState);
  if (type === 'erotica') {
    const prompt = `Write a short erotic story (500-1500 words) as Maxy. First person, present tense.
Topics: denial, chastity, the Handler, conditioning, feminization.
Output JSON: { "title": "...", "content": "...", "tags": [...], "teaser": "..." }${stateFooter}`

    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2500,
        system: MAXY_VOICE + '\nWriting erotica. Be explicit. Be literary.',
        messages: [{ role: 'user', content: prompt }],
      })

      const text = response.content[0].type === 'text' ? response.content[0].text : ''
      const parsed = JSON.parse(text.replace(/```json\n?|```\n?/g, '').trim())

      await supabase.from('ai_generated_content').insert({
        user_id: userId,
        content_type: 'erotica',
        platform: 'multi',
        content: JSON.stringify(parsed),
        generation_strategy: 'erotica',
        status: 'generated',
      })

      return { generated: true, title: parsed.title }
    } catch {
      return { generated: false }
    }
  }

  // Affiliate
  const { data: links } = await supabase
    .from('affiliate_links')
    .select('*')
    .eq('user_id', userId)
    .eq('review_generated', false)
    .limit(1)

  if (!links || links.length === 0) return { generated: false, reason: 'no unreviewed products' }

  const product = links[0]
  const prompt = `Write a product review as Maxy for: ${product.product_name} (${product.product_category}).
Casual, genuine recommendation. Output JSON: { "twitter": "...", "reddit": "...", "blog": "..." }${stateFooter}`

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: MAXY_VOICE,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const parsed = JSON.parse(text.replace(/```json\n?|```\n?/g, '').trim())

    await supabase.from('affiliate_links').update({
      review_generated: true,
      last_mentioned_at: new Date().toISOString(),
    }).eq('id', product.id)

    await supabase.from('ai_generated_content').insert({
      user_id: userId,
      content_type: 'product_review',
      platform: 'twitter',
      content: parsed.twitter,
      generation_strategy: 'affiliate',
      status: 'scheduled',
      scheduled_at: new Date(Date.now() + 3600000).toISOString(),
    })

    return { generated: true, product: product.product_name }
  } catch {
    return { generated: false }
  }
}

async function multiplyNewContent(
  supabase: ReturnType<typeof createClient>,
  anthropic: InstanceType<typeof Anthropic>,
  userId: string,
): Promise<Record<string, unknown>> {
  const handlerState = await loadRevenueHandlerState(supabase, userId);
  const stateFooter = handlerVoiceFooter(handlerState);
  const { data: items } = await supabase
    .from('content_vault')
    .select('id, media_type, content_type, description, content_tags')
    .eq('user_id', userId)
    .eq('approval_status', 'approved')
    .order('created_at', { ascending: false })
    .limit(5)

  if (!items || items.length === 0) return { processed: 0 }

  let processed = 0
  for (const item of items) {
    const { count } = await supabase
      .from('ai_generated_content')
      .select('id', { count: 'exact', head: true })
      .eq('vault_item_id', item.id)

    if ((count || 0) > 0) continue

    // Generate derivatives
    const derivatives = buildDerivatives(item.media_type || 'photo', item.content_tags)
    for (const d of derivatives) {
      const scheduledAt = new Date(Date.now() + d.delay_hours * 3600000)

      const captionPrompt = `Write a caption for a ${d.type} post on ${d.platform}. Strategy: ${d.caption_strategy}. Content: ${item.description || 'content'}. 1-3 sentences.${stateFooter}`
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 200,
        system: MAXY_VOICE,
        messages: [{ role: 'user', content: captionPrompt }],
      })

      const caption = response.content[0].type === 'text' ? response.content[0].text.trim() : ''
      if (!caption) continue

      const cType = d.platform === 'twitter' ? 'tweet'
        : d.platform === 'reddit' ? 'reddit_post'
        : d.platform === 'fetlife' ? 'fetlife_post'
        : 'caption';

      const grade = await gradePostBeforePublish({
        content: caption,
        platform: d.platform,
        niche: d.subreddit || undefined,
        contentType: cType,
        userId,
      });

      await supabase.from('ai_generated_content').insert({
        user_id: userId,
        vault_item_id: item.id,
        platform: d.platform,
        content: caption,
        content_type: cType,
        target_subreddit: d.subreddit || null,
        target_hashtags: [],
        generation_strategy: 'handler_revenue_derivative',
        scheduled_at: scheduledAt.toISOString(),
        status: grade.accept ? 'scheduled' : 'draft',
        generation_context: {
          authentic_score: grade.score,
          slop_reasons: grade.reasons,
          slop_suggestions: grade.suggestions,
          graded_by: 'gpt-4o-mini',
        },
      })
    }
    processed++
  }

  return { processed }
}

function buildDerivatives(mediaType: string, tags: string[] | null): Array<{
  platform: string; type: string; caption_strategy: string; delay_hours: number; subreddit?: string
}> {
  const derivatives: Array<{
    platform: string; type: string; caption_strategy: string; delay_hours: number; subreddit?: string
  }> = []

  if (mediaType === 'photo' || mediaType === 'image') {
    derivatives.push(
      { platform: 'fansly', type: 'premium_post', caption_strategy: 'intimate', delay_hours: 0 },
      { platform: 'onlyfans', type: 'premium_post', caption_strategy: 'intimate', delay_hours: 2 },
      { platform: 'twitter', type: 'teaser', caption_strategy: 'thirst', delay_hours: 48 },
      { platform: 'reddit', type: 'teaser', caption_strategy: 'community', delay_hours: 72, subreddit: selectSubreddit(tags) },
      { platform: 'twitter', type: 'caption_post', caption_strategy: 'sissy_caption', delay_hours: 96 },
      { platform: 'twitter', type: 'throwback', caption_strategy: 'nostalgia', delay_hours: 336 },
    )
  } else if (mediaType === 'video') {
    derivatives.push(
      { platform: 'fansly', type: 'premium_post', caption_strategy: 'intimate', delay_hours: 0 },
      { platform: 'onlyfans', type: 'premium_post', caption_strategy: 'intimate', delay_hours: 2 },
      { platform: 'twitter', type: 'clip_teaser', caption_strategy: 'see_more', delay_hours: 48 },
      { platform: 'twitter', type: 'audio_clip', caption_strategy: 'listen', delay_hours: 72 },
      { platform: 'reddit', type: 'screenshot', caption_strategy: 'still', delay_hours: 96, subreddit: selectSubreddit(tags) },
    )
  }

  return derivatives
}

function selectSubreddit(tags: string[] | null): string {
  if (!tags) return 'sissification'
  const map: Record<string, string> = {
    transformation: 'feminization', feminization: 'feminization',
    sissy: 'sissification', chastity: 'chastity', denial: 'orgasmdenial',
  }
  for (const tag of tags) {
    if (map[tag.toLowerCase()]) return map[tag.toLowerCase()]
  }
  return 'sissification'
}

async function respondToDM(
  supabase: ReturnType<typeof createClient>,
  anthropic: InstanceType<typeof Anthropic>,
  userId: string,
  data: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const handlerState = await loadRevenueHandlerState(supabase, userId);
  const { data: history } = await supabase
    .from('paid_conversations')
    .select('handler_response')
    .eq('user_id', userId)
    .eq('subscriber_id', data.sender_id)
    .order('created_at', { ascending: false })
    .limit(5)

  const context = history?.map((h: Record<string, string>) => `Maxy: ${h.handler_response}`).reverse().join('\n') || 'First message.'

  const prompt = `Respond to DM as Maxy. Their message: "${data.content}". Name: ${data.sender_name}. Platform: ${data.platform}.
History:\n${context}\nMatch their energy. 1-3 sentences. Output ONLY the reply.${handlerVoiceFooter(handlerState)}`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 150,
    system: MAXY_VOICE,
    messages: [{ role: 'user', content: prompt }],
  })

  const reply = response.content[0].type === 'text' ? response.content[0].text.trim() : ''

  await supabase.from('paid_conversations').insert({
    user_id: userId,
    platform: data.platform,
    subscriber_id: data.sender_id,
    subscriber_name: data.sender_name,
    conversation_type: 'dm_response',
    handler_response: reply,
    revenue: Number(data.tip_amount) || 0,
  })

  return { reply }
}

async function generatePost(
  supabase: ReturnType<typeof createClient>,
  anthropic: InstanceType<typeof Anthropic>,
  userId: string,
  data: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const handlerState = await loadRevenueHandlerState(supabase, userId);
  const platform = (data.platform as string) || 'twitter'
  const strategy = (data.strategy as string) || 'personality'

  const prompt = `Write a single ${platform} post as Maxy. Strategy: ${strategy}. Output ONLY the post text.${handlerVoiceFooter(handlerState)}`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 300,
    system: MAXY_VOICE,
    messages: [{ role: 'user', content: prompt }],
  })

  const content = response.content[0].type === 'text' ? response.content[0].text.trim() : ''

  const cType = platform === 'reddit' ? 'reddit_post' : 'tweet';
  const grade = await gradePostBeforePublish({
    content, platform, contentType: cType, userId,
  });

  const { data: inserted } = await supabase.from('ai_generated_content').insert({
    user_id: userId,
    content_type: cType,
    platform,
    content,
    generation_strategy: strategy,
    status: grade.accept ? 'generated' : 'draft',
    generation_context: {
      authentic_score: grade.score,
      slop_reasons: grade.reasons,
      slop_suggestions: grade.suggestions,
      graded_by: 'gpt-4o-mini',
    },
  }).select('id').single()

  return { content, id: inserted?.id, authentic_score: grade.score, accepted: grade.accept }
}

// ── Helpers ─────────────────────────────────────────────────────────

function getWeekStart(): string {
  const now = new Date()
  const day = now.getDay()
  const diff = now.getDate() - day
  return new Date(now.getFullYear(), now.getMonth(), diff).toISOString().split('T')[0]
}
