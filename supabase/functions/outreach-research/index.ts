// outreach-research — weekly cron (driven from GitHub Actions, not pg_cron).
//
// For every user with an active Reddit OAuth connection:
//   1. If they have no outreach_communities rows yet, seed Reddit + FetLife
//      defaults (FETLIFE entries are inert — no API research, just listed).
//   2. For each Reddit community whose last_researched_at is older than 6
//      days, refresh:
//        - subreddit /about (member count, NSFW flag, submission_type)
//        - subreddit /about/rules (rules text → posting_rules_summary)
//      Self-promo policy + tone notes are KEPT as the user/seed wrote them
//      unless we detect explicit "no self promotion" / "comment first" rules,
//      in which case we tighten the policy to 'banned' / 'allowed_with_engagement'.
//
// Hard rule: research only refreshes Reddit. FetLife has no API and we won't
// scrape. Discord groups stay user-maintained too; we just track them.
//
// Cron schedule: weekly. Driven by .github/workflows/scheduled-functions.yml.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import {
  denoServiceClient,
  getActiveRedditCreds,
  getSubredditAbout,
  getSubredditRules,
  RedditTokenExpiredError,
  RedditApiError,
  RedditBannedError,
} from '../_shared/outreach.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Mirror of src/lib/outreach/seeds.ts — kept here too because edge functions
// can't import TS source from src/. Same pattern as dommy-mommy.ts.
const REDDIT_SEEDS = [
  { slug: 'feminization', display_name: 'r/feminization',
    self_promo_policy: 'restricted',
    tone_notes: 'Journaling + transformation-focused; horny tolerated, low-effort posts removed.',
    typical_post_cadence_days: 7 },
  { slug: 'sissyperfection', display_name: 'r/SissyPerfection',
    self_promo_policy: 'restricted',
    tone_notes: 'Appearance + ritual focus; reads better with a photo or a specific milestone.',
    typical_post_cadence_days: 14 },
  { slug: 'forcedfeminization', display_name: 'r/forcedfeminization',
    self_promo_policy: 'allowed_with_engagement',
    tone_notes: 'Explicit allowed; comment-and-engage culture, drive-by posts get downvoted.',
    typical_post_cadence_days: 7 },
  { slug: 'sissystories', display_name: 'r/sissystories',
    self_promo_policy: 'restricted',
    tone_notes: 'Long-form personal narrative; 500+ words preferred.',
    typical_post_cadence_days: 14 },
  { slug: 'asktransgender', display_name: 'r/asktransgender',
    self_promo_policy: 'banned',
    tone_notes: 'Sincere questions only; kink-coded posting will be removed.',
    typical_post_cadence_days: 30 },
]

const FETLIFE_SEEDS = [
  { slug: 'sissy-training', display_name: 'Sissy Training',
    self_promo_policy: 'allowed_with_engagement',
    tone_notes: 'Mixed kink + lifestyle; long-form journals do well.',
    typical_post_cadence_days: 7 },
  { slug: 'forced-feminization', display_name: 'Forced Feminization',
    self_promo_policy: 'allowed_with_engagement',
    tone_notes: 'Heavy on protocol/ritual narrative; concrete details rewarded.',
    typical_post_cadence_days: 7 },
]

const RESEARCH_STALE_DAYS = 6

function tightenPolicyFromRules(
  current: string,
  rulesText: string,
): string {
  const t = rulesText.toLowerCase()
  if (/no self.?promo|no advertising|no promotion/.test(t)) return 'banned'
  if (/(must|please) (comment|engage|participate)/.test(t)) return 'allowed_with_engagement'
  return current
}

async function seedCommunities(supabase: ReturnType<typeof denoServiceClient>, userId: string) {
  const { data: existing } = await supabase
    .from('outreach_communities')
    .select('id')
    .eq('user_id', userId)
    .limit(1)
  if ((existing || []).length > 0) return 0

  const rows = [
    ...REDDIT_SEEDS.map((s) => ({
      user_id: userId, platform: 'reddit', slug: s.slug, display_name: s.display_name,
      self_promo_policy: s.self_promo_policy, tone_notes: s.tone_notes,
      typical_post_cadence_days: s.typical_post_cadence_days,
    })),
    ...FETLIFE_SEEDS.map((s) => ({
      user_id: userId, platform: 'fetlife', slug: s.slug, display_name: s.display_name,
      self_promo_policy: s.self_promo_policy, tone_notes: s.tone_notes,
      typical_post_cadence_days: s.typical_post_cadence_days,
    })),
  ]
  const { error } = await supabase.from('outreach_communities').insert(rows)
  if (error) {
    console.error('[outreach-research] seed insert failed:', error.message)
    return 0
  }
  return rows.length
}

interface RefreshStats { refreshed: number; banned: number; errors: number }

async function refreshUserCommunities(
  supabase: ReturnType<typeof denoServiceClient>,
  userId: string,
  accessToken: string,
): Promise<RefreshStats> {
  const stats: RefreshStats = { refreshed: 0, banned: 0, errors: 0 }
  const stale = new Date(Date.now() - RESEARCH_STALE_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const { data: communities } = await supabase
    .from('outreach_communities')
    .select('id, slug, self_promo_policy, last_researched_at, banned_at')
    .eq('user_id', userId)
    .eq('platform', 'reddit')
    .is('banned_at', null)
    .or(`last_researched_at.is.null,last_researched_at.lt.${stale}`)
    .limit(20)

  for (const c of communities || []) {
    try {
      const about = await getSubredditAbout(accessToken, c.slug)
      let rulesSummary = ''
      let tightenedPolicy = c.self_promo_policy
      try {
        const rules = await getSubredditRules(accessToken, c.slug)
        rulesSummary = (rules.rules || [])
          .map((r) => `• ${r.short_name}${r.description ? `: ${r.description.slice(0, 200)}` : ''}`)
          .join('\n')
          .slice(0, 2000)
        tightenedPolicy = tightenPolicyFromRules(c.self_promo_policy, rulesSummary)
      } catch (err) {
        console.error('[outreach-research] rules fetch failed for', c.slug, (err as Error).message)
      }

      // 'restricted' subreddits (private / quarantined) we soft-disable.
      const subType = (about.subreddit_type || '').toLowerCase()
      const restrictedSub = subType === 'private' || subType === 'restricted' || subType === 'gold_only'

      await supabase.from('outreach_communities').update({
        member_count: about.subscribers,
        posting_rules_summary: rulesSummary || null,
        self_promo_policy: tightenedPolicy,
        last_researched_at: new Date().toISOString(),
        ...(restrictedSub ? { enabled: false } : {}),
        updated_at: new Date().toISOString(),
      }).eq('id', c.id)
      stats.refreshed++
    } catch (err) {
      if (err instanceof RedditBannedError) {
        await supabase.from('outreach_communities').update({
          banned_at: new Date().toISOString(),
          banned_reason: err.reason.slice(0, 500),
          enabled: false,
          auto_submit_enabled: false,
          updated_at: new Date().toISOString(),
        }).eq('id', c.id)
        stats.banned++
        continue
      }
      if (err instanceof RedditTokenExpiredError) {
        // Caller's token refresh runs once per user; if it's expired here
        // it means we hit the rare race. Skip this user for the run.
        console.warn('[outreach-research] token expired mid-run for', userId)
        return stats
      }
      if (err instanceof RedditApiError && err.status === 404) {
        // Subreddit deleted/banned by Reddit itself. Disable.
        await supabase.from('outreach_communities').update({
          banned_at: new Date().toISOString(),
          banned_reason: '404 — subreddit not found',
          enabled: false,
          updated_at: new Date().toISOString(),
        }).eq('id', c.id)
        stats.banned++
        continue
      }
      console.error('[outreach-research] refresh failed for', c.slug, (err as Error).message)
      stats.errors++
    }
  }

  return stats
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = denoServiceClient()
    const creds = await getActiveRedditCreds(supabase)

    let usersSeeded = 0
    let totalRefreshed = 0
    let totalBanned = 0
    let totalErrors = 0

    for (const c of creds) {
      const seeded = await seedCommunities(supabase, c.user_id)
      if (seeded > 0) usersSeeded++
      const stats = await refreshUserCommunities(supabase, c.user_id, c.accessToken)
      totalRefreshed += stats.refreshed
      totalBanned += stats.banned
      totalErrors += stats.errors
    }

    return new Response(
      JSON.stringify({
        ok: true,
        users_processed: creds.length,
        users_seeded: usersSeeded,
        communities_refreshed: totalRefreshed,
        communities_banned: totalBanned,
        errors: totalErrors,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('[outreach-research] fatal:', (err as Error).message)
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
