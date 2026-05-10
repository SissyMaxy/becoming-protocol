// outreach-submit — frequent cron (every ~15 min).
//
// Picks up drafts where:
//   status = 'approved'
//   AND outreach_communities.auto_submit_enabled = true
//   AND outreach_communities.platform = 'reddit'
//   AND outreach_communities.banned_at IS NULL
//   AND user has met min_engagement_before_post threshold for that community
//   AND rate limits (daily 3, per-subreddit weekly 1) allow it
// and submits them to Reddit. Hand-edit / hand-approve drafts also flow
// through this same path (manual approve → cron picks up).
//
// FetLife and Discord drafts are NEVER auto-submitted — they require
// `mark_posted_manually` from the UI. This function ignores them.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import {
  denoServiceClient,
  getActiveRedditCreds,
  submitTextPost,
  checkRateLimits,
  RedditTokenExpiredError,
  RedditApiError,
  RedditBannedError,
} from '../_shared/outreach.ts'
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface SubmittableDraft {
  draft_id: string
  user_id: string
  community_id: string
  community_slug: string
  community_display_name: string
  min_engagement_before_post: number
  title: string
  body: string
}

async function findSubmittableDrafts(
  supabase: SupabaseClient,
  userId: string,
): Promise<SubmittableDraft[]> {
  // Pull all approved Reddit drafts for this user where auto-submit is on.
  const { data: rows, error } = await supabase
    .from('outreach_post_drafts')
    .select(`
      id, title, body_markdown, community_id,
      outreach_communities!inner(
        slug, display_name, platform, auto_submit_enabled, banned_at,
        min_engagement_before_post
      )
    `)
    .eq('user_id', userId)
    .eq('status', 'approved')
    .eq('outreach_communities.platform', 'reddit')
    .eq('outreach_communities.auto_submit_enabled', true)
    .is('outreach_communities.banned_at', null)
    .order('updated_at', { ascending: true })
    .limit(10)

  if (error) {
    console.error('[outreach-submit] query failed:', error.message)
    return []
  }

  const out: SubmittableDraft[] = []
  for (const r of rows || []) {
    const c = Array.isArray(r.outreach_communities) ? r.outreach_communities[0] : r.outreach_communities
    if (!c) continue
    if (!r.title || !r.body_markdown) continue
    out.push({
      draft_id: r.id,
      user_id: userId,
      community_id: r.community_id,
      community_slug: c.slug,
      community_display_name: c.display_name,
      min_engagement_before_post: c.min_engagement_before_post ?? 5,
      title: r.title,
      body: r.body_markdown,
    })
  }
  return out
}

async function checkEngagementThreshold(
  supabase: SupabaseClient,
  userId: string,
  communityId: string,
  threshold: number,
): Promise<boolean> {
  if (threshold <= 0) return true
  // Count manual engagement events for this community.
  const { count } = await supabase
    .from('outreach_engagement_log')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('community_id', communityId)
    .in('kind', ['comment', 'upvote'])
  return (count ?? 0) >= threshold
}

async function submitOne(
  supabase: SupabaseClient,
  draft: SubmittableDraft,
  accessToken: string,
): Promise<'submitted' | 'failed' | 'skipped' | 'rate_limited'> {
  // Engagement gate (per-community).
  const engaged = await checkEngagementThreshold(
    supabase, draft.user_id, draft.community_id, draft.min_engagement_before_post,
  )
  if (!engaged) {
    // Don't fail the draft — just skip until the user has engaged enough.
    // The drafter will keep generating; the submit gate keeps blocking until
    // engagement crosses the threshold.
    return 'skipped'
  }

  // Rate-limit gate (global daily + per-subreddit weekly).
  const rate = await checkRateLimits(supabase, draft.user_id, draft.community_slug)
  if (!rate.ok) {
    console.log(`[outreach-submit] rate-limited for ${draft.community_slug}: ${rate.reason}`)
    return 'rate_limited'
  }

  try {
    const resp = await submitTextPost(accessToken, {
      subreddit: draft.community_slug,
      title: draft.title,
      body: draft.body,
    })
    const url = resp?.json?.data?.url || null
    const errors = resp?.json?.errors || []
    if (errors.length > 0) {
      await supabase.from('outreach_post_drafts').update({
        status: 'failed',
        submission_error: JSON.stringify(errors).slice(0, 500),
        submitted_response_jsonb: resp as unknown as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      }).eq('id', draft.draft_id)
      return 'failed'
    }

    await supabase.from('outreach_post_drafts').update({
      status: 'submitted',
      submitted_at: new Date().toISOString(),
      submitted_url: url,
      submitted_response_jsonb: resp as unknown as Record<string, unknown>,
      updated_at: new Date().toISOString(),
    }).eq('id', draft.draft_id)
    await supabase.from('outreach_communities').update({
      last_post_at: new Date().toISOString(),
    }).eq('id', draft.community_id)
    return 'submitted'
  } catch (err) {
    if (err instanceof RedditBannedError) {
      await supabase.from('outreach_communities').update({
        banned_at: new Date().toISOString(),
        banned_reason: err.reason.slice(0, 500),
        enabled: false,
        auto_submit_enabled: false,
        updated_at: new Date().toISOString(),
      }).eq('id', draft.community_id)
      await supabase.from('outreach_post_drafts').update({
        status: 'failed',
        submission_error: `BANNED: ${err.reason.slice(0, 500)}`,
        updated_at: new Date().toISOString(),
      }).eq('id', draft.draft_id)
      return 'failed'
    }
    if (err instanceof RedditTokenExpiredError) {
      console.warn('[outreach-submit] token expired for', draft.user_id)
      return 'skipped'
    }
    if (err instanceof RedditApiError) {
      await supabase.from('outreach_post_drafts').update({
        status: 'failed',
        submission_error: err.message.slice(0, 500),
        updated_at: new Date().toISOString(),
      }).eq('id', draft.draft_id)
      return 'failed'
    }
    console.error('[outreach-submit] unexpected:', (err as Error).message)
    return 'failed'
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = denoServiceClient()
    const creds = await getActiveRedditCreds(supabase)

    let submitted = 0
    let failed = 0
    let skipped = 0
    let rateLimited = 0

    for (const c of creds) {
      const drafts = await findSubmittableDrafts(supabase, c.user_id)
      for (const draft of drafts) {
        const result = await submitOne(supabase, draft, c.accessToken)
        if (result === 'submitted') submitted++
        else if (result === 'failed') failed++
        else if (result === 'rate_limited') rateLimited++
        else skipped++

        // Once a daily-cap rate-limit hits we won't submit any more for this
        // user this run; bail early.
        if (result === 'rate_limited') break
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        users_processed: creds.length,
        submitted,
        failed,
        skipped,
        rate_limited: rateLimited,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('[outreach-submit] fatal:', (err as Error).message)
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
