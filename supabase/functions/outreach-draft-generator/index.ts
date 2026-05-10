// outreach-draft-generator — daily cron.
//
// For every user with an active Reddit OAuth connection:
//   1. Pick 1-2 communities the user is "due to post in" — enabled, not
//      banned, and last_post_at older than typical_post_cadence_days.
//   2. Pull recent journal entries + user_state snapshot to seed the post.
//   3. Generate a draft IN THE USER'S VOICE (first-person; not Mommy's voice).
//      Tailor tone/length to the community (e.g. r/asktransgender = sincere
//      question, r/forcedfeminization = explicit OK).
//   4. Insert into outreach_post_drafts with status='pending_review'.
//
// Cron schedule: daily. Driven by .github/workflows/scheduled-functions.yml.
//
// Hard rule: drafts NEVER include feminine_name, photos, or dossier
// confessions unless the calling code explicitly opts in. Default privacy
// posture — these posts are public.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.24.3'
import {
  denoServiceClient,
  denoEnv,
  getActiveRedditCreds,
} from '../_shared/outreach.ts'
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MAX_DRAFTS_PER_USER_PER_RUN = 2

interface DueCommunity {
  id: string
  platform: string
  slug: string
  display_name: string
  self_promo_policy: string
  tone_notes: string | null
  posting_rules_summary: string | null
  typical_post_cadence_days: number
  last_post_at: string | null
}

async function pickDueCommunities(
  supabase: SupabaseClient,
  userId: string,
): Promise<DueCommunity[]> {
  const { data: communities } = await supabase
    .from('outreach_communities')
    .select('id, platform, slug, display_name, self_promo_policy, tone_notes, posting_rules_summary, typical_post_cadence_days, last_post_at')
    .eq('user_id', userId)
    .eq('enabled', true)
    .is('banned_at', null)

  const now = Date.now()
  const due = (communities || []).filter((c) => {
    if (c.self_promo_policy === 'banned') return false
    if (!c.last_post_at) return true
    const days = (now - new Date(c.last_post_at).getTime()) / (24 * 60 * 60 * 1000)
    return days >= c.typical_post_cadence_days
  })

  // Don't pile up unprocessed drafts. Cap pending_review at 5/community.
  const out: DueCommunity[] = []
  for (const c of due) {
    const { count } = await supabase
      .from('outreach_post_drafts')
      .select('id', { count: 'exact', head: true })
      .eq('community_id', c.id)
      .in('status', ['pending_review', 'draft', 'approved'])
    if ((count ?? 0) >= 5) continue
    out.push(c as DueCommunity)
    if (out.length >= MAX_DRAFTS_PER_USER_PER_RUN) break
  }
  return out
}

interface UserSeed {
  recent_journal: string[]
  state_summary: string
  recent_milestones: string[]
}

async function loadUserSeed(supabase: SupabaseClient, userId: string): Promise<UserSeed> {
  const sevenAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  // Recent journal entries — first-person free text the user actually wrote.
  // We only pull from `journal_entries` (not implants / fabrications).
  const { data: journals } = await supabase
    .from('journal_entries')
    .select('content, created_at')
    .eq('user_id', userId)
    .gte('created_at', sevenAgo)
    .order('created_at', { ascending: false })
    .limit(5)

  // Coarse state summary. Best-effort; failures degrade gracefully.
  let stateSummary = ''
  try {
    const { data: state } = await supabase
      .from('user_state')
      .select('denial_day, current_phase, chastity_streak_days, hard_mode_active, opacity_level')
      .eq('user_id', userId)
      .maybeSingle()
    if (state) {
      const parts: string[] = []
      if (state.current_phase) parts.push(`phase: ${state.current_phase}`)
      if (typeof state.denial_day === 'number') parts.push(`denial day ${state.denial_day}`)
      if (typeof state.chastity_streak_days === 'number') parts.push(`chastity streak ${state.chastity_streak_days} days`)
      if (state.hard_mode_active) parts.push('hard mode')
      stateSummary = parts.join(', ')
    }
  } catch (err) {
    console.warn('[draft-generator] state load failed:', (err as Error).message)
  }

  // Recent wardrobe acquisitions if the table exists.
  const milestones: string[] = []
  try {
    const { data: wardrobe } = await supabase
      .from('wardrobe_inventory')
      .select('item_name, acquired_at')
      .eq('user_id', userId)
      .gte('acquired_at', sevenAgo)
      .order('acquired_at', { ascending: false })
      .limit(3)
    for (const w of wardrobe || []) {
      if (w.item_name) milestones.push(`acquired ${w.item_name}`)
    }
  } catch {
    // Table may not exist on all installs; ignore.
  }

  return {
    recent_journal: (journals || []).map((j) => (j.content || '').slice(0, 1000)).filter(Boolean),
    state_summary: stateSummary,
    recent_milestones: milestones,
  }
}

const SYSTEM_PROMPT = `You write Reddit/community posts in the FIRST-PERSON voice of a user
who is going through a feminization journey. Posts are journal-style, sincere,
and the user has authored every previous post in this corpus.

Rules you must follow:
- Write as the user — "I", "me", "my". Never refer to a "Handler", "Mommy",
  "domme", or any third-party authority figure. The journey is the user's own.
- No persona language: avoid "good girl", "sissy slut", or scripted-kink
  phrases unless the community's tone_notes explicitly say crude language is
  the norm. Default register is reflective and grown.
- Never invent facts. If the seed doesn't mention a specific item / partner /
  timeline, don't make one up. "I've been working on X" is fine; "my wife
  Sarah said X" is forbidden.
- Never claim to be on hormones / HRT / specific medications unless the seed
  explicitly says so. Trans-as-identity is fine; medical claims are not.
- Match the community's rules and tone. If self-promo is banned and the post
  reads as promo, rewrite. If the rules say "no AI-generated content," skip
  the community by responding with NULL.
- Don't include the user's legal name, address, or any photo URL.
- Don't use markdown headings (##) — communities prefer plain prose.

Return strict JSON: { "title": string, "body": string, "kind":
"journal"|"discussion"|"question"|"project_share" } — or { "skip": true,
"reason": string } if the community shouldn't be posted to.`

interface DraftJSON {
  title?: string
  body?: string
  kind?: 'journal' | 'discussion' | 'question' | 'project_share'
  skip?: boolean
  reason?: string
}

function buildUserPrompt(community: DueCommunity, seed: UserSeed): string {
  return [
    `Community: ${community.display_name} (${community.platform})`,
    `Self-promo policy: ${community.self_promo_policy}`,
    community.tone_notes ? `Tone notes: ${community.tone_notes}` : null,
    community.posting_rules_summary
      ? `Posting rules:\n${community.posting_rules_summary}`
      : null,
    '',
    seed.state_summary ? `My current state: ${seed.state_summary}` : null,
    seed.recent_milestones.length > 0
      ? `Recent milestones:\n${seed.recent_milestones.map((m) => `- ${m}`).join('\n')}`
      : null,
    seed.recent_journal.length > 0
      ? `Recent journal entries (verbatim, for voice/tone reference):\n${seed.recent_journal.map((j) => `---\n${j}`).join('\n')}`
      : null,
    '',
    `Write one post for this community. If this community shouldn't be posted to (e.g. rules forbid it, no relevant seed material, or it'd come across as drive-by), return { "skip": true, "reason": "..." }.`,
    `Otherwise return { "title": "...", "body": "...", "kind": "..." }.`,
  ].filter(Boolean).join('\n')
}

async function generateDraft(
  community: DueCommunity,
  seed: UserSeed,
): Promise<DraftJSON | null> {
  const apiKey = denoEnv('ANTHROPIC_API_KEY')
  if (!apiKey) {
    console.error('[draft-generator] ANTHROPIC_API_KEY missing')
    return null
  }
  const anthropic = new Anthropic({ apiKey })

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserPrompt(community, seed) }],
    })
    const text = message.content[0]?.type === 'text' ? message.content[0].text : ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null
    const parsed = JSON.parse(jsonMatch[0]) as DraftJSON
    return parsed
  } catch (err) {
    console.error('[draft-generator] claude call failed:', (err as Error).message)
    return null
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = denoServiceClient()
    const creds = await getActiveRedditCreds(supabase)

    let usersProcessed = 0
    let draftsCreated = 0
    let draftsSkipped = 0

    for (const c of creds) {
      const due = await pickDueCommunities(supabase, c.user_id)
      if (due.length === 0) continue
      usersProcessed++

      const seed = await loadUserSeed(supabase, c.user_id)
      // Don't generate from a cold seed — empty journal + empty state would
      // force fabrication. Skip the user this run.
      if (seed.recent_journal.length === 0 && !seed.state_summary) {
        console.log('[draft-generator] cold seed for', c.user_id, '— skipping')
        continue
      }

      for (const community of due) {
        const draft = await generateDraft(community, seed)
        if (!draft || draft.skip) {
          draftsSkipped++
          continue
        }
        if (!draft.title || !draft.body) {
          draftsSkipped++
          continue
        }

        const { error } = await supabase.from('outreach_post_drafts').insert({
          user_id: c.user_id,
          community_id: community.id,
          kind: draft.kind || 'journal',
          title: draft.title.slice(0, 300),
          body_markdown: draft.body,
          status: 'pending_review',
          generation_context: {
            community_slug: community.slug,
            self_promo_policy: community.self_promo_policy,
            tone_notes: community.tone_notes,
            seed_state: seed.state_summary,
            seed_journal_count: seed.recent_journal.length,
            seed_milestone_count: seed.recent_milestones.length,
          },
        })
        if (error) {
          console.error('[draft-generator] insert failed:', error.message)
        } else {
          draftsCreated++
        }
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        users_processed: usersProcessed,
        drafts_created: draftsCreated,
        drafts_skipped: draftsSkipped,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('[outreach-draft-generator] fatal:', (err as Error).message)
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
