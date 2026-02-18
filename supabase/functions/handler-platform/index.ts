// Handler Platform Manager — Edge Function
// Executes scheduled posts, syncs analytics, handles engagement
// Called by pg_cron every 5 minutes for posting, hourly for analytics
//
// OnlyFans integration uses OFAPI (onlyfansapi.com) third-party wrapper.
// API key stored as ONLYFANS_API_KEY Supabase secret.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const OFAPI_BASE = 'https://app.onlyfansapi.com'

interface PlatformRequest {
  action: 'execute_posts' | 'sync_analytics' | 'handle_engagement' | 'init_onlyfans'
  user_id?: string
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

    const body: PlatformRequest = await req.json().catch(() => ({ action: 'execute_posts' }))

    let result: Record<string, unknown>

    switch (body.action) {
      case 'execute_posts':
        result = await executeScheduledPosts(supabase, body.user_id)
        break
      case 'sync_analytics':
        result = await syncAnalytics(supabase, body.user_id)
        break
      case 'handle_engagement':
        result = await handleEngagement(supabase, body.user_id)
        break
      case 'init_onlyfans':
        result = await initOnlyFans(supabase, body.user_id)
        break
      default:
        result = await executeScheduledPosts(supabase)
    }

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Platform manager error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

// ============================================
// OFAPI HELPERS
// ============================================

/**
 * Get the OFAPI account prefixed_id from the platform_accounts table.
 * Falls back to the first account from OFAPI /api/accounts if not stored.
 */
async function getOfapiAccountId(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<string | null> {
  const { data: account } = await supabase
    .from('platform_accounts')
    .select('credentials_encrypted')
    .eq('user_id', userId)
    .eq('platform', 'onlyfans')
    .eq('enabled', true)
    .single()

  if (account?.credentials_encrypted) {
    // credentials_encrypted stores the OFAPI account prefixed_id
    const creds = account.credentials_encrypted as string
    if (creds.startsWith('acct_')) return creds
  }

  return null
}

/**
 * Authenticated fetch wrapper for OFAPI.
 * path should start with / (e.g. /api/accounts)
 */
async function ofapiFetch(
  path: string,
  options: RequestInit = {}
): Promise<{ ok: boolean; status: number; data: unknown; error?: string }> {
  const apiKey = Deno.env.get('ONLYFANS_API_KEY')
  if (!apiKey) {
    return { ok: false, status: 0, data: null, error: 'ONLYFANS_API_KEY not configured' }
  }

  const url = `${OFAPI_BASE}${path}`
  const headers = new Headers(options.headers || {})
  headers.set('Authorization', `Bearer ${apiKey}`)
  if (!headers.has('Content-Type') && options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }

  try {
    const response = await fetch(url, { ...options, headers })

    // Log rate limit headers for monitoring
    const remaining = response.headers.get('x-ratelimit-remaining')
    if (remaining && parseInt(remaining) < 100) {
      console.warn(`[OFAPI] Rate limit warning: ${remaining} requests remaining`)
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'Unknown error')
      console.error(`[OFAPI] ${options.method || 'GET'} ${path} → ${response.status}: ${errorBody}`)
      return { ok: false, status: response.status, data: null, error: `OFAPI ${response.status}: ${errorBody}` }
    }

    const data = await response.json()
    return { ok: true, status: response.status, data }
  } catch (err) {
    console.error(`[OFAPI] Network error for ${path}:`, err)
    return { ok: false, status: 0, data: null, error: `Network error: ${err.message}` }
  }
}

/**
 * Upload media to OnlyFans via OFAPI.
 * Downloads file from storageUrl, then uploads to OFAPI.
 * Returns the ofapi_media_ prefixed_id for use in posts/messages.
 */
async function ofapiUploadMedia(
  accountId: string,
  storageUrl: string
): Promise<{ ok: boolean; mediaId?: string; error?: string }> {
  // Download file from Supabase storage
  const fileResponse = await fetch(storageUrl)
  if (!fileResponse.ok) {
    return { ok: false, error: `Failed to download media from storage: ${fileResponse.status}` }
  }

  const blob = await fileResponse.blob()

  // Determine filename from URL
  const urlParts = storageUrl.split('/')
  const fileName = urlParts[urlParts.length - 1] || 'upload.jpg'

  // Upload to OFAPI
  const formData = new FormData()
  formData.append('file', blob, fileName)

  const result = await ofapiFetch(`/api/${accountId}/media/upload`, {
    method: 'POST',
    body: formData,
  })

  if (!result.ok) {
    return { ok: false, error: result.error }
  }

  const responseData = result.data as Record<string, unknown>
  const mediaId = responseData.prefixed_id as string

  if (!mediaId) {
    return { ok: false, error: 'No prefixed_id in upload response' }
  }

  console.log(`[OFAPI] Media uploaded: ${mediaId} (${fileName})`)
  return { ok: true, mediaId }
}

// ============================================
// EXECUTE SCHEDULED POSTS
// ============================================

async function executeScheduledPosts(
  supabase: ReturnType<typeof createClient>,
  userId?: string
): Promise<Record<string, unknown>> {
  // Get due posts
  let query = supabase
    .from('scheduled_posts')
    .select(`
      *,
      platform_accounts!inner(id, platform, username, credentials_encrypted, enabled),
      content_library!inner(id, storage_url, storage_path, content_type, metadata)
    `)
    .eq('status', 'scheduled')
    .lte('scheduled_for', new Date().toISOString())
    .order('scheduled_for', { ascending: true })
    .limit(20)

  if (userId) {
    query = query.eq('user_id', userId)
  }

  const { data: posts, error } = await query

  if (error) {
    console.error('Failed to fetch due posts:', error)
    return { error: error.message, posted: 0 }
  }

  if (!posts || posts.length === 0) {
    return { message: 'No posts due', posted: 0, failed: 0 }
  }

  let posted = 0
  let failed = 0
  const results: Array<{ id: string; platform: string; status: string; url?: string; error?: string }> = []

  for (const post of posts) {
    try {
      // Mark as posting
      await supabase
        .from('scheduled_posts')
        .update({ status: 'posting' })
        .eq('id', post.id)

      const account = post.platform_accounts
      const content = post.content_library

      // Generate caption if missing
      if (!post.caption) {
        post.caption = `New ${content.content_type} 💕`
      }

      // Execute platform-specific posting
      const postResult = await postToPlatform(
        account.platform,
        account,
        content,
        post
      )

      if (postResult.success) {
        // Update post as successful
        await supabase
          .from('scheduled_posts')
          .update({
            status: 'posted',
            posted_at: new Date().toISOString(),
            post_url: postResult.postUrl || null,
            post_external_id: postResult.postId || null,
          })
          .eq('id', post.id)

        // Update content library
        await supabase
          .from('content_library')
          .update({
            times_posted: (content.times_posted || 0) + 1,
            last_posted_at: new Date().toISOString(),
          })
          .eq('id', content.id)

        // Update platform account
        await supabase
          .from('platform_accounts')
          .update({ last_posted_at: new Date().toISOString() })
          .eq('id', account.id)

        // Log decision
        await supabase.from('handler_decisions').insert({
          user_id: post.user_id,
          decision_type: 'posting',
          decision_data: {
            platform: account.platform,
            content_type: content.content_type,
            post_type: post.post_type,
            price: post.price,
            is_consequence: post.is_consequence_release,
          },
          reasoning: `Posted to ${account.platform}${post.is_consequence_release ? ' (consequence release)' : ''}`,
          executed: true,
          executed_at: new Date().toISOString(),
          outcome: postResult,
        })

        posted++
        results.push({
          id: post.id,
          platform: account.platform,
          status: 'posted',
          url: postResult.postUrl,
        })
      } else {
        throw new Error(postResult.error || 'Posting failed')
      }
    } catch (err) {
      // Handle failure with retry logic
      const retryCount = (post.retry_count || 0) + 1
      const maxRetries = post.max_retries || 3

      if (retryCount < maxRetries) {
        // Schedule retry with exponential backoff
        const retryDelay = Math.pow(2, retryCount) * 60 * 1000 // 2min, 4min, 8min
        const retryAt = new Date(Date.now() + retryDelay)

        await supabase
          .from('scheduled_posts')
          .update({
            status: 'scheduled', // Back to scheduled for retry
            retry_count: retryCount,
            scheduled_for: retryAt.toISOString(),
            error_message: err.message,
          })
          .eq('id', post.id)

        results.push({
          id: post.id,
          platform: post.platform_accounts?.platform,
          status: 'retrying',
          error: err.message,
        })
      } else {
        await supabase
          .from('scheduled_posts')
          .update({
            status: 'failed',
            retry_count: retryCount,
            error_message: err.message,
          })
          .eq('id', post.id)

        failed++
        results.push({
          id: post.id,
          platform: post.platform_accounts?.platform,
          status: 'failed',
          error: err.message,
        })
      }
    }
  }

  return { posted, failed, total: posts.length, results }
}

// ============================================
// PLATFORM-SPECIFIC POSTING
// ============================================

interface PostResult {
  success: boolean
  postId?: string
  postUrl?: string
  error?: string
}

async function postToPlatform(
  platform: string,
  account: Record<string, unknown>,
  content: Record<string, unknown>,
  post: Record<string, unknown>
): Promise<PostResult> {
  const hasCredentials = !!account.credentials_encrypted

  if (!hasCredentials) {
    // No credentials configured — simulate the post
    console.log(`[SIMULATED] Post to ${platform}: ${content.content_type} (no credentials configured)`)
    return {
      success: true,
      postId: `sim_${crypto.randomUUID().slice(0, 8)}`,
      postUrl: `https://${platform}.com/simulated/${crypto.randomUUID().slice(0, 8)}`,
    }
  }

  // Platform-specific API calls
  switch (platform) {
    case 'onlyfans':
      return await postToOnlyFans(account, content, post)
    case 'reddit':
      return await postToReddit(account, content, post)
    case 'twitter':
      return await postToTwitter(account, content, post)
    case 'fansly':
    case 'patreon':
    case 'instagram':
    case 'tiktok':
      console.log(`[PENDING] ${platform} API integration needed for real posting`)
      return {
        success: true,
        postId: `pending_${crypto.randomUUID().slice(0, 8)}`,
        postUrl: undefined,
      }
    default:
      return { success: false, error: `Unknown platform: ${platform}` }
  }
}

// ============================================
// ONLYFANS POSTING VIA OFAPI
// ============================================

async function postToOnlyFans(
  account: Record<string, unknown>,
  content: Record<string, unknown>,
  post: Record<string, unknown>
): Promise<PostResult> {
  try {
    const accountId = account.credentials_encrypted as string
    if (!accountId || !accountId.startsWith('acct_')) {
      return { success: false, error: 'No OFAPI account ID configured. Run init_onlyfans first.' }
    }

    const storageUrl = content.storage_url as string
    const caption = (post.caption as string) || ''
    const price = post.price as number | null

    // Step 1: Upload media if we have content
    let mediaIds: string[] = []
    if (storageUrl) {
      const uploadResult = await ofapiUploadMedia(accountId, storageUrl)
      if (!uploadResult.ok) {
        return { success: false, error: `Media upload failed: ${uploadResult.error}` }
      }
      mediaIds = [uploadResult.mediaId!]
    }

    // Step 2: Create the post
    const postBody: Record<string, unknown> = {
      text: caption,
    }

    if (mediaIds.length > 0) {
      postBody.mediaFiles = mediaIds
    }

    // PPV pricing — set price if specified
    if (price && price > 0) {
      postBody.price = price
    }

    // Schedule for future if post has a future scheduled_for
    const scheduledFor = post.scheduled_for as string
    if (scheduledFor) {
      const scheduledDate = new Date(scheduledFor)
      if (scheduledDate.getTime() > Date.now() + 60000) {
        postBody.scheduledDate = scheduledDate.toISOString()
      }
    }

    const result = await ofapiFetch(`/api/${accountId}/posts`, {
      method: 'POST',
      body: JSON.stringify(postBody),
    })

    if (!result.ok) {
      return { success: false, error: result.error }
    }

    const responseData = result.data as Record<string, unknown>
    const ofPostId = (responseData.id || responseData.prefixed_id || '') as string

    console.log(`[OFAPI] Post created: ${ofPostId} on OnlyFans (media: ${mediaIds.length}, price: ${price || 'free'})`)

    return {
      success: true,
      postId: ofPostId,
      postUrl: `https://onlyfans.com/${account.username || 'unknown'}`,
    }
  } catch (err) {
    console.error('[OFAPI] Post creation error:', err)
    return { success: false, error: `OnlyFans posting failed: ${err.message}` }
  }
}

// ============================================
// REDDIT POSTING (stub)
// ============================================

async function postToReddit(
  account: Record<string, unknown>,
  content: Record<string, unknown>,
  post: Record<string, unknown>
): Promise<PostResult> {
  try {
    const metadata = post.metadata as Record<string, unknown>
    const subreddit = (metadata?.subreddit as string) || 'test'
    const title = (post.caption as string) || 'New content'
    const storageUrl = content.storage_url as string

    console.log(`[REDDIT] Would post to r/${subreddit}: "${title}" with media ${storageUrl}`)

    return {
      success: true,
      postId: `reddit_sim_${Date.now()}`,
      postUrl: `https://reddit.com/r/${subreddit}/simulated`,
    }
  } catch (err) {
    return { success: false, error: `Reddit posting failed: ${err.message}` }
  }
}

// ============================================
// TWITTER POSTING (stub)
// ============================================

async function postToTwitter(
  account: Record<string, unknown>,
  content: Record<string, unknown>,
  post: Record<string, unknown>
): Promise<PostResult> {
  try {
    const text = (post.caption as string) || ''
    const hashtags = (post.hashtags as string[]) || []
    const fullText = `${text} ${hashtags.map(h => `#${h}`).join(' ')}`.trim()

    const tweet = fullText.length > 280 ? fullText.slice(0, 277) + '...' : fullText

    console.log(`[TWITTER] Would tweet: "${tweet}"`)

    return {
      success: true,
      postId: `tweet_sim_${Date.now()}`,
      postUrl: `https://twitter.com/simulated/${Date.now()}`,
    }
  } catch (err) {
    return { success: false, error: `Twitter posting failed: ${err.message}` }
  }
}

// ============================================
// ANALYTICS SYNC
// ============================================

async function syncAnalytics(
  supabase: ReturnType<typeof createClient>,
  userId?: string
): Promise<Record<string, unknown>> {
  let query = supabase
    .from('platform_accounts')
    .select('*')
    .eq('enabled', true)

  if (userId) {
    query = query.eq('user_id', userId)
  }

  const { data: accounts } = await query

  if (!accounts || accounts.length === 0) {
    return { synced: 0 }
  }

  let synced = 0

  for (const account of accounts) {
    try {
      if (account.platform === 'onlyfans') {
        await syncOnlyFansAnalytics(supabase, account)
      } else {
        await syncLocalAnalytics(supabase, account)
      }
      synced++
    } catch (err) {
      console.error(`Analytics sync failed for ${account.platform}:`, err)
    }
  }

  return { synced, total: accounts.length }
}

/**
 * Sync real analytics from OnlyFans via OFAPI.
 * Fetches earnings, subscriber count, and post engagement.
 */
async function syncOnlyFansAnalytics(
  supabase: ReturnType<typeof createClient>,
  account: Record<string, unknown>
): Promise<void> {
  const accountId = account.credentials_encrypted as string
  if (!accountId || !accountId.startsWith('acct_')) {
    console.warn('[OFAPI] No account ID for OnlyFans analytics sync, falling back to local')
    await syncLocalAnalytics(supabase, account)
    return
  }

  const now = new Date().toISOString()
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const today = new Date().toISOString().split('T')[0]

  // 1. Fetch earnings from OFAPI
  let totalRevenue30d = 0
  const earningsResult = await ofapiFetch(`/api/${accountId}/statistics/statements/earnings?start_date=${thirtyDaysAgo}&end_date=${today}`)
  if (earningsResult.ok) {
    const earningsData = earningsResult.data as Record<string, unknown>
    // Sum up earnings — response structure may vary
    totalRevenue30d = (earningsData.total as number) ||
      (earningsData.net as number) ||
      ((earningsData.data as Array<Record<string, unknown>>)?.reduce(
        (sum: number, e: Record<string, unknown>) => sum + ((e.amount as number) || 0), 0
      ) ?? 0)
    console.log(`[OFAPI] Earnings last 30d: $${totalRevenue30d.toFixed(2)}`)
  }

  // 2. Fetch subscriber count from OFAPI
  let subscriberCount = account.subscriber_count as number || 0
  const fansResult = await ofapiFetch(`/api/${accountId}/fans/active?limit=1`)
  if (fansResult.ok) {
    const fansData = fansResult.data as Record<string, unknown>
    // The total count may be in a pagination field
    subscriberCount = (fansData.total as number) ||
      (fansData.count as number) ||
      ((fansData.data as unknown[])?.length ?? subscriberCount)
    console.log(`[OFAPI] Active subscribers: ${subscriberCount}`)
  }

  // 3. Fetch engagement for recent posts
  let totalEngagement = 0
  const { data: recentDbPosts } = await supabase
    .from('scheduled_posts')
    .select('post_external_id, engagement_data')
    .eq('platform_account_id', account.id)
    .eq('status', 'posted')
    .not('post_external_id', 'is', null)
    .gte('posted_at', thirtyDaysAgo)
    .limit(20)

  for (const dbPost of (recentDbPosts || [])) {
    const extId = dbPost.post_external_id as string
    if (!extId || extId.startsWith('sim_') || extId.startsWith('pending_')) continue

    // Fetch stats from OFAPI for this post
    const statsResult = await ofapiFetch(`/api/${accountId}/posts/${extId}/stats`)
    if (statsResult.ok) {
      const stats = statsResult.data as Record<string, unknown>
      const likes = (stats.likes as number) || (stats.likesCount as number) || 0
      const comments = (stats.comments as number) || (stats.commentsCount as number) || 0
      const tips = (stats.tips as number) || (stats.tipsCount as number) || 0

      totalEngagement += likes + comments + tips

      // Update engagement data on the scheduled_posts row
      await supabase
        .from('scheduled_posts')
        .update({
          engagement_data: { likes, comments, tips, synced_at: now },
        })
        .eq('post_external_id', extId)
    }
  }

  // 4. Create revenue events for new earnings
  // Check existing revenue total to calculate delta
  const previousRevenue = (account.revenue_total as number) || 0
  const revenueDelta = totalRevenue30d - previousRevenue

  if (revenueDelta > 0) {
    // Insert a new revenue event for the delta
    await supabase.from('revenue_events').insert({
      user_id: account.user_id,
      platform: 'onlyfans',
      platform_account_id: account.id,
      revenue_type: 'mixed',
      amount: revenueDelta,
      processed: false,
      created_at: now,
    })

    console.log(`[OFAPI] New revenue event: $${revenueDelta.toFixed(2)}`)
  }

  // 5. Calculate engagement rate
  const postCount = (recentDbPosts || []).length
  const engagementRate = postCount > 0 && subscriberCount > 0
    ? (totalEngagement / postCount) / subscriberCount
    : 0

  // 6. Update platform account
  await supabase
    .from('platform_accounts')
    .update({
      subscriber_count: subscriberCount,
      engagement_rate: Math.round(engagementRate * 10000) / 10000,
      revenue_total: totalRevenue30d,
      analytics: {
        posts_30d: postCount,
        total_engagement_30d: totalEngagement,
        total_revenue_30d: totalRevenue30d,
        subscriber_count: subscriberCount,
        engagement_rate: engagementRate,
        source: 'ofapi',
        synced_at: now,
      },
      last_synced_at: now,
    })
    .eq('id', account.id)

  // 7. Process unprocessed revenue into Maxy Fund
  const { data: newRevenue } = await supabase
    .from('revenue_events')
    .select('id, amount')
    .eq('platform_account_id', account.id)
    .eq('processed', false)

  if (newRevenue && newRevenue.length > 0) {
    const unprocessedTotal = newRevenue.reduce((sum, r) => sum + r.amount, 0)

    for (const rev of newRevenue) {
      await supabase
        .from('revenue_events')
        .update({ processed: true, processed_at: now })
        .eq('id', rev.id)
    }

    if (unprocessedTotal > 0) {
      await supabase.rpc('add_to_fund', {
        p_user_id: account.user_id,
        p_amount: unprocessedTotal,
        p_type: 'revenue',
        p_description: `OnlyFans revenue sync: $${unprocessedTotal.toFixed(2)}`,
      })
    }
  }

  console.log(`[OFAPI] Analytics sync complete for OnlyFans: ${subscriberCount} subs, $${totalRevenue30d.toFixed(2)} revenue, ${totalEngagement} engagement`)
}

/**
 * Sync analytics from local data only (for platforms without API integration).
 */
async function syncLocalAnalytics(
  supabase: ReturnType<typeof createClient>,
  account: Record<string, unknown>
): Promise<void> {
  const { data: recentPosts } = await supabase
    .from('scheduled_posts')
    .select('engagement_data, revenue_generated')
    .eq('platform_account_id', account.id)
    .eq('status', 'posted')
    .gte('posted_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())

  const totalEngagement = (recentPosts || []).reduce((sum, p) => {
    const data = p.engagement_data as Record<string, number> || {}
    return sum + (data.likes || 0) + (data.comments || 0) + (data.shares || 0)
  }, 0)

  const totalRevenue = (recentPosts || []).reduce(
    (sum, p) => sum + (p.revenue_generated || 0), 0
  )

  const { data: newRevenue } = await supabase
    .from('revenue_events')
    .select('id, amount')
    .eq('platform_account_id', account.id)
    .eq('processed', false)

  const unprocessedRevenue = (newRevenue || []).reduce(
    (sum, r) => sum + r.amount, 0
  )

  await supabase
    .from('platform_accounts')
    .update({
      analytics: {
        posts_30d: (recentPosts || []).length,
        total_engagement_30d: totalEngagement,
        total_revenue_30d: totalRevenue,
        unprocessed_revenue: unprocessedRevenue,
        synced_at: new Date().toISOString(),
      },
      revenue_total: (account.revenue_total as number || 0) + unprocessedRevenue,
      last_synced_at: new Date().toISOString(),
    })
    .eq('id', account.id)

  if (newRevenue && newRevenue.length > 0) {
    for (const rev of newRevenue) {
      await supabase
        .from('revenue_events')
        .update({ processed: true, processed_at: new Date().toISOString() })
        .eq('id', rev.id)
    }

    if (unprocessedRevenue > 0) {
      await supabase.rpc('add_to_fund', {
        p_user_id: account.user_id,
        p_amount: unprocessedRevenue,
        p_type: 'revenue',
        p_description: `${account.platform} revenue sync: $${unprocessedRevenue.toFixed(2)}`,
      })
    }
  }
}

// ============================================
// ENGAGEMENT HANDLING
// ============================================

async function handleEngagement(
  supabase: ReturnType<typeof createClient>,
  userId?: string
): Promise<Record<string, unknown>> {
  if (!userId) {
    return { error: 'user_id required for engagement handling', processed: 0 }
  }

  // Get OnlyFans account
  const accountId = await getOfapiAccountId(supabase, userId)
  if (!accountId) {
    return { message: 'No OnlyFans account configured', processed: 0 }
  }

  // Fetch recent chats with new messages
  const chatsResult = await ofapiFetch(`/api/${accountId}/chats?limit=20&order=recent`)
  if (!chatsResult.ok) {
    return { error: chatsResult.error, processed: 0 }
  }

  const chatsData = chatsResult.data as Record<string, unknown>
  const chats = (chatsData.data || chatsData) as Array<Record<string, unknown>>

  let newMessages = 0
  let newTips = 0

  for (const chat of (chats || [])) {
    const hasUnread = (chat.unreadCount as number) > 0 || (chat.hasUnread as boolean)
    if (!hasUnread) continue

    newMessages += (chat.unreadCount as number) || 1

    // Check if any messages contain tips
    const lastMessage = chat.lastMessage as Record<string, unknown>
    if (lastMessage?.tip || lastMessage?.tipAmount) {
      newTips++
    }
  }

  // Log engagement summary
  if (newMessages > 0) {
    await supabase.from('handler_decisions').insert({
      user_id: userId,
      decision_type: 'engagement_sync',
      decision_data: {
        platform: 'onlyfans',
        new_messages: newMessages,
        new_tips: newTips,
      },
      reasoning: `OnlyFans engagement: ${newMessages} new messages, ${newTips} tips`,
      executed: true,
      executed_at: new Date().toISOString(),
    })
  }

  return {
    platform: 'onlyfans',
    new_messages: newMessages,
    new_tips: newTips,
    processed: 1,
  }
}

// ============================================
// INIT ONLYFANS — Account initialization
// ============================================

async function initOnlyFans(
  supabase: ReturnType<typeof createClient>,
  userId?: string
): Promise<Record<string, unknown>> {
  if (!userId) {
    return { error: 'user_id required for init_onlyfans' }
  }

  // Step 1: List connected OFAPI accounts
  const accountsResult = await ofapiFetch('/api/accounts')
  if (!accountsResult.ok) {
    return { error: `Failed to list OFAPI accounts: ${accountsResult.error}` }
  }

  const accountsData = accountsResult.data as Record<string, unknown>
  const accounts = (accountsData.data || accountsData) as Array<Record<string, unknown>>

  if (!accounts || accounts.length === 0) {
    return { error: 'No OnlyFans accounts connected to OFAPI. Connect one at https://app.onlyfansapi.com' }
  }

  // Use the first connected account
  const ofAccount = accounts[0]
  const ofapiAccountId = (ofAccount.prefixed_id || ofAccount.id) as string

  if (!ofapiAccountId) {
    return { error: 'Could not determine OFAPI account ID' }
  }

  // Step 2: Fetch profile details
  // OFAPI wraps responses in { data: { ... } }
  const profileResult = await ofapiFetch(`/api/${ofapiAccountId}/me`)
  let username = (ofAccount.username as string) || 'unknown'
  let displayName = username
  let subscriberCount = 0

  if (profileResult.ok) {
    const raw = profileResult.data as Record<string, unknown>
    const profile = (raw.data || raw) as Record<string, unknown>
    username = (profile.username as string) || username
    displayName = (profile.name as string) || (profile.displayName as string) || username
    subscriberCount = (profile.subscribersCount as number) || (profile.subscriberCount as number) || 0
  }

  // Step 3: Upsert into platform_accounts
  const { data: existing } = await supabase
    .from('platform_accounts')
    .select('id')
    .eq('user_id', userId)
    .eq('platform', 'onlyfans')
    .single()

  if (existing) {
    // Update existing
    await supabase
      .from('platform_accounts')
      .update({
        username,
        display_name: displayName,
        credentials_encrypted: ofapiAccountId,
        enabled: true,
        subscriber_count: subscriberCount,
        last_synced_at: new Date().toISOString(),
        analytics: {
          ofapi_account_id: ofapiAccountId,
          initialized_at: new Date().toISOString(),
          source: 'ofapi',
        },
      })
      .eq('id', existing.id)
  } else {
    // Insert new
    await supabase
      .from('platform_accounts')
      .insert({
        user_id: userId,
        platform: 'onlyfans',
        account_type: 'creator',
        username,
        display_name: displayName,
        credentials_encrypted: ofapiAccountId,
        enabled: true,
        subscriber_count: subscriberCount,
        engagement_rate: 0,
        revenue_total: 0,
        posting_schedule: { optimalTimes: ['19:00', '20:00', '21:00'], frequencyPerDay: 2 },
        content_strategy: { contentTypes: ['photo', 'photo_set', 'video'], themes: [] },
        analytics: {
          ofapi_account_id: ofapiAccountId,
          initialized_at: new Date().toISOString(),
          source: 'ofapi',
        },
        is_release_platform: false,
        release_config: {},
        last_synced_at: new Date().toISOString(),
      })
  }

  console.log(`[OFAPI] OnlyFans account initialized: @${username} (${ofapiAccountId}), ${subscriberCount} subscribers`)

  return {
    success: true,
    account_id: ofapiAccountId,
    username,
    display_name: displayName,
    subscriber_count: subscriberCount,
  }
}
