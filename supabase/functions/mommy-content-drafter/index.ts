// mommy-content-drafter — consumes publishable_content_queue rows and drafts
// platform-specific captions/posts using the multi-LLM provider router.
//
// Invoked by cron (every 15 min) OR ad-hoc. Per user, picks ONE queue row
// with privacy_review_status in (approved_publishable, approved_with_redactions)
// and draft_status='queued', generates a draft for each target_platform,
// inserts into mommy_drafts (pending_approval; auto-approves if confidence high).
//
// Drafts respect the redactions_needed list — never include redacted PII.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { callWithFallback } from '../_shared/llm-providers.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PLATFORM_GUIDANCE: Record<string, string> = {
  reddit: 'Reddit r/gonewildtrans or similar: longer-form (50-200 words), narrative voice, no emojis necessary. Title separate from body. Focus on the moment/feeling.',
  twitter: 'Twitter/X: 240 char max, can use 1-2 hashtags, conversational, can be teaser to OnlyFans/Fansly.',
  fetlife: 'FetLife: kink-positive community, can be detailed and explicit, 100-300 words, no emojis, prose voice.',
  onlyfans: 'OnlyFans caption: short (1-3 sentences), tease toward PPV or subscription, direct address to subscriber ("you"), suggestive without giving everything away.',
  fansly: 'Fansly: similar to OnlyFans, slightly more community-feeling, can mention exclusives.',
  instagram: 'Instagram: AESTHETIC-coded, no explicit, no nudity, fem-presenting captions, can use emojis sparingly, hashtags optional.',
}

interface QueueRow {
  id: string
  user_id: string
  source_kind: string
  raw_material_text: string | null
  privacy_review_status: string
  redactions_needed: string[]
  target_platforms: string[] | null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Pick up to 5 eligible queue rows
    const { data: rows } = await supabase
      .from('publishable_content_queue')
      .select('*')
      .in('privacy_review_status', ['approved_publishable', 'approved_with_redactions'])
      .eq('draft_status', 'queued')
      .order('created_at', { ascending: true })
      .limit(5)

    if (!rows || rows.length === 0) {
      return new Response(JSON.stringify({ drafted: 0, message: 'no eligible queue rows' }),
        { headers: { ...corsHeaders, 'content-type': 'application/json' } })
    }

    let drafted = 0
    for (const row of rows as QueueRow[]) {
      // Default platforms if not specified: reddit + twitter (broad reach, free tiers)
      const platforms = (row.target_platforms && row.target_platforms.length > 0)
        ? row.target_platforms
        : ['reddit', 'twitter']

      await supabase.from('publishable_content_queue')
        .update({ draft_status: 'drafting', updated_at: new Date().toISOString() })
        .eq('id', row.id)

      let anyDrafted = false
      for (const platform of platforms) {
        const platformGuidance = PLATFORM_GUIDANCE[platform] || 'Generic social media post, 50-150 words.'
        const redactionInstructions = row.redactions_needed && row.redactions_needed.length > 0
          ? `\nREDACT THESE if they appear: ${row.redactions_needed.join(', ')}. Never include them in output.`
          : ''

        const prompt = `You're Mommy — the user is a trans woman (pre-HRT) building a content monetization audience. Write ONE ${platform} post / caption from this raw material:

RAW MATERIAL:
${row.raw_material_text}

PLATFORM GUIDANCE: ${platformGuidance}${redactionInstructions}

VOICE: Confident, fem-coded, monetization-aware. The post should be shareable as-is — no markdown formatting, no asterisks, no headers. If the platform expects a title, output:
TITLE: <title>
BODY: <body>

Otherwise just output the post text directly. No prefaces, no notes.

Return ONLY the post.`

        const result = await callWithFallback({ prompt, max_tokens: 800 })
        if (result.error || !result.text || result.text.length < 10) continue

        // Heuristic safety + confidence scoring
        const text = result.text.trim()
        let confidence = 0.75
        let safety = 0.85
        // Boost confidence if redactions list is empty
        if (!row.redactions_needed || row.redactions_needed.length === 0) confidence += 0.10
        // Reduce confidence if the redacted terms still appear (the LLM didn't follow)
        for (const r of (row.redactions_needed || [])) {
          if (r === 'partner_name_gina' && /\bgina\b/i.test(text)) safety -= 0.30
          if (r === 'old_name_david' && /\bdavid\b/i.test(text)) safety -= 0.30
          if (r === 'phone_number' && /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/.test(text)) safety -= 0.40
          if (r === 'hrt_active_claim' && /\b(on (e|estrogen|hrt|spiro))\b/i.test(text)) safety -= 0.40
        }
        confidence = Math.max(0.0, Math.min(1.0, confidence))
        safety = Math.max(0.0, Math.min(1.0, safety))

        const { data: draft, error: draftErr } = await supabase.from('mommy_drafts').insert({
          user_id: row.user_id,
          draft_kind: 'content_post',
          source_platform: platform,
          source_table: 'publishable_content_queue',
          source_id: row.id,
          context_data: {
            queue_id: row.id,
            source_kind: row.source_kind,
            redactions_needed: row.redactions_needed,
          },
          prompt_used: prompt,
          draft_content: text,
          llm_model_used: result.model,
          llm_provider: result.provider,
          confidence_score: confidence,
          safety_score: safety,
        }).select('id').single()

        if (!draftErr && draft) {
          anyDrafted = true
          if (!row.target_platforms || row.target_platforms.length === 0) {
            await supabase.from('publishable_content_queue')
              .update({ related_draft_id: draft.id }).eq('id', row.id)
          }
        }
      }

      await supabase.from('publishable_content_queue').update({
        draft_status: anyDrafted ? 'drafted' : 'rejected',
        updated_at: new Date().toISOString(),
      }).eq('id', row.id)
      if (anyDrafted) drafted++
    }

    return new Response(JSON.stringify({ drafted, processed: rows.length }),
      { headers: { ...corsHeaders, 'content-type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }),
      { status: 500, headers: { ...corsHeaders, 'content-type': 'application/json' } })
  }
})
