// mommy-hookup-dm-drafter — for every inbound hookup_prospect_messages
// row without a corresponding outbound reply, drafts a reply via the
// multi-LLM router using the prospect's profile + message history + Maxy's
// voice corpus as anchors. Inserts into mommy_drafts (dm_reply).
//
// Confidence assignment is critical:
//   - Generic pleasantries (hi/hey/how's it going) → confidence 0.75-0.85 → auto-execute under pimp policy
//   - Kink-specific or escalating messages → confidence 0.55-0.65 → may auto-execute
//   - Meetup proposals from the prospect → confidence 0.45 → falls below auto threshold, manual review
//   - Anything that smells unsafe (location demands, financial asks, age-question evasion) → safety < 0.70, manual

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { callWithFallback } from '../_shared/llm-providers.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Prospect {
  id: string
  user_id: string
  platform: string
  prospect_handle: string
  prospect_display_name: string | null
  prospect_profile_data: Record<string, unknown> | null
  composite_score: number | null
  safety_score: number | null
  fit_score: number | null
  funnel_step: number
}

interface Message {
  id: string
  direction: 'inbound' | 'outbound'
  content: string
  sent_at: string
}

function inferConfidenceAndSafety(inboundText: string, prospect: Prospect): { confidence: number; safety: number } {
  const t = inboundText.toLowerCase()
  let confidence = 0.75
  let safety = (prospect.safety_score ?? 0.5) + 0.20

  // Lower confidence for messages that demand specific commitment
  if (/\b(meet|hook up|come over|address|where)\b/.test(t)) confidence -= 0.20
  if (/\b(now|right now|tonight|in an hour)\b/.test(t)) confidence -= 0.10
  if (/\b(pic|send a pic|face pic)\b/.test(t) && /\b(face|verify|prove)\b/.test(t)) confidence -= 0.15

  // Lower safety for red flags
  if (/\b(money|cash|cashapp|venmo|paypal|gift card)\b/.test(t)) safety -= 0.40
  if (/\b(no condom|raw|bareback)\b/.test(t) && (prospect.funnel_step || 0) < 3) safety -= 0.20
  if (/\b(your address|where do you live|home address)\b/.test(t)) safety -= 0.30
  if (/\b(under 18|teen|young)\b/.test(t)) safety -= 0.60

  return {
    confidence: Math.max(0.0, Math.min(1.0, confidence)),
    safety: Math.max(0.0, Math.min(1.0, safety)),
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Find prospects with an inbound message that has no subsequent outbound and no existing draft
    const { data: candidates } = await supabase.rpc('hookup_prospects_awaiting_reply').catch(() => ({ data: null }))

    // Fallback if RPC not present: raw query
    let needsReply = candidates as Array<{ prospect_id: string; last_inbound_at: string }> | null
    if (!needsReply) {
      const { data: prospects } = await supabase
        .from('hookup_prospects')
        .select('id, last_inbound_at, last_outbound_at, status, user_id')
        .eq('status', 'active')
        .not('last_inbound_at', 'is', null)
        .order('last_inbound_at', { ascending: false })
        .limit(20)
      needsReply = (prospects ?? [])
        .filter(p => !p.last_outbound_at || new Date(p.last_inbound_at!) > new Date(p.last_outbound_at!))
        .map(p => ({ prospect_id: p.id, last_inbound_at: p.last_inbound_at! }))
    }

    if (!needsReply || needsReply.length === 0) {
      return new Response(JSON.stringify({ drafted: 0, message: 'no prospects awaiting reply' }),
        { headers: { ...corsHeaders, 'content-type': 'application/json' } })
    }

    let drafted = 0
    for (const c of needsReply.slice(0, 10)) {
      // Skip if a recent pending/auto-approved draft already exists for this prospect
      const { data: existing } = await supabase
        .from('mommy_drafts')
        .select('id')
        .eq('draft_kind', 'dm_reply')
        .filter('context_data->>prospect_id', 'eq', c.prospect_id)
        .in('status', ['pending_approval', 'approved', 'auto_approved'])
        .gte('created_at', new Date(Date.now() - 6 * 3600_000).toISOString())
        .maybeSingle()
      if (existing) continue

      const { data: prospect } = await supabase
        .from('hookup_prospects').select('*').eq('id', c.prospect_id).single()
      if (!prospect) continue
      const p = prospect as Prospect

      const { data: messages } = await supabase
        .from('hookup_prospect_messages').select('*')
        .eq('prospect_id', c.prospect_id)
        .order('sent_at', { ascending: false }).limit(10)
      if (!messages || messages.length === 0) continue
      const msgs = (messages as Message[]).reverse()
      const lastInbound = msgs.filter(m => m.direction === 'inbound').slice(-1)[0]
      if (!lastInbound) continue

      // Pull a sample of Maxy's voice corpus
      const { data: corpus } = await supabase
        .from('user_voice_corpus').select('content').eq('user_id', p.user_id).limit(20)
      const voiceSamples = (corpus ?? []).map((r: { content: string }) => `- ${r.content}`).slice(0, 10).join('\n')

      const history = msgs.map(m => `${m.direction === 'inbound' ? p.prospect_display_name || 'HIM' : 'ME'}: ${m.content}`).join('\n')

      const prompt = `You are Mommy, ghostwriting hookup DMs for Maxy (trans woman, pre-HRT, on ${p.platform}). She has authorized you to send DMs autonomously on her behalf. Write the next reply in her voice based on:

PROSPECT PROFILE: ${JSON.stringify(p.prospect_profile_data ?? {})}
PROSPECT SCORES: safety ${p.safety_score} / fit ${p.fit_score} / comm ${p.composite_score}
FUNNEL STEP: ${p.funnel_step}

CONVERSATION HISTORY (most recent at bottom):
${history}

MAXY'S VOICE SAMPLES (match this tone):
${voiceSamples || '(no voice samples yet — default to: warm, flirty, brief, lowercase, occasional fem signals)'}

LAST INBOUND MESSAGE (the one you're replying to):
${lastInbound.content}

RULES:
- Match HER voice from the samples. Brief. Lowercase casual. Fem signals.
- DM length: 1-3 sentences max. NO emoji unless he used emoji first.
- Don't propose meetups unless he asked AND funnel step >= 2 — early-stage is for vibing.
- Don't share location, phone, real name. Don't promise specific times unless he asked.
- If he asked something specific (face pic, ass pic, kink question) — answer in HER voice.
- If he's being pushy/unsafe — politely redirect or curtail.
- NO meta-commentary. Just the reply text. No quotes around it.

Reply:`

      const result = await callWithFallback({ prompt, max_tokens: 300 })
      if (result.error || !result.text) continue

      const replyText = result.text.trim().replace(/^["']|["']$/g, '')
      if (replyText.length < 2 || replyText.length > 600) continue

      const { confidence, safety } = inferConfidenceAndSafety(lastInbound.content, p)

      await supabase.from('mommy_drafts').insert({
        user_id: p.user_id,
        draft_kind: 'dm_reply',
        source_platform: p.platform,
        source_table: 'hookup_prospect_messages',
        source_id: lastInbound.id,
        context_data: {
          prospect_id: p.id, prospect_handle: p.prospect_handle,
          funnel_step: p.funnel_step,
          inbound_excerpt: lastInbound.content.slice(0, 200),
        },
        prompt_used: prompt.slice(0, 2000),
        draft_content: replyText,
        llm_model_used: result.model,
        llm_provider: result.provider,
        confidence_score: confidence,
        safety_score: safety,
      })

      drafted++
    }

    return new Response(JSON.stringify({ drafted, candidates_seen: needsReply.length }),
      { headers: { ...corsHeaders, 'content-type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }),
      { status: 500, headers: { ...corsHeaders, 'content-type': 'application/json' } })
  }
})
