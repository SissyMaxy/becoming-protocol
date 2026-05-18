// gina-seed-authoring — when the gina_seed_catalog has no available seeds
// in a given arc_focus (all on cooldown / mastered), this function uses the
// multi-LLM provider router to author NEW seeds anchored to Maxy's recent
// messages + Gina's reaction history.
//
// Generated seeds are inserted into gina_seed_catalog with autotag prefix
// "autogen_" so they're identifiable. Anchored to real Maxy quotes (mig 543
// validation rules still apply at the gate).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { callWithFallback } from '../_shared/llm-providers.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const VALID_CATEGORIES = ['media_share','conversation_probe','hypothetical','casual_behavior','external_reference']
const VALID_BANDS = ['cold','warming','hot']

interface SeedDraft {
  seed_key: string
  category: string
  intensity_band: string
  topic: string
  prompt_template: string
  observation_questions: string[]
  hypothesis_template: string
  expected_reaction_pos: string
  expected_reaction_neg: string
  arc_focus: string
  cooldown_days: number
  intensity: number
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Find users with a stale arc_focus: catalog seeds exist for the focus,
    // but all are on cooldown for this user. Author 2-3 new seeds per stale focus.
    const { data: users } = await supabase
      .from('user_state').select('user_id, handler_persona')
      .eq('handler_persona', 'dommy_mommy')
    if (!users || users.length === 0) return new Response(JSON.stringify({ authored: 0 }), { headers: { ...corsHeaders, 'content-type': 'application/json' } })

    let authored = 0
    for (const u of users as Array<{ user_id: string }>) {
      // Pull stale arc_focus (one with positive reactions but no available seeds)
      const { data: arcStats } = await supabase.rpc('stale_arc_focus_for_user', { p_user_id: u.user_id }).catch(() => ({ data: null }))
      let staleFocus = (arcStats as Array<{ arc_focus: string }> | null)?.[0]?.arc_focus
      if (!staleFocus) {
        // Fallback: pick any arc_focus where positive history exists
        const { data: focusRows } = await supabase
          .from('gina_seed_plantings')
          .select('seed_id, hypothesis_outcome')
          .eq('user_id', u.user_id)
          .in('hypothesis_outcome', ['matched', 'exceeded'])
          .limit(10)
        if (!focusRows || focusRows.length === 0) continue
        // Get the arc_focus values from those seeds
        const seedIds = focusRows.map((r: { seed_id: string }) => r.seed_id)
        const { data: seeds } = await supabase
          .from('gina_seed_catalog').select('arc_focus').in('id', seedIds)
        const focusCounts: Record<string, number> = {}
        for (const s of (seeds ?? []) as Array<{ arc_focus: string }>) {
          if (s.arc_focus) focusCounts[s.arc_focus] = (focusCounts[s.arc_focus] || 0) + 1
        }
        const top = Object.entries(focusCounts).sort((a, b) => b[1] - a[1])[0]
        if (!top) continue
        staleFocus = top[0]
      }

      // Pull Maxy's recent messages for anchoring
      const { data: msgs } = await supabase
        .from('handler_messages').select('content')
        .eq('user_id', u.user_id).eq('role', 'user')
        .order('created_at', { ascending: false }).limit(30)
      const recentTexts = (msgs ?? []).map((m: { content: string }) => `[${m.content.slice(0, 200)}]`).join('\n')
      if (!recentTexts) continue

      const prompt = `You are Mommy's strategist generating new gina-seed catalog entries.

GOAL: Author 2 NEW seeds for arc_focus="${staleFocus}". Each seed is a structured conversation/behavior probe Maxy will plant with her wife Gina. Maxy has authorized the protocol.

CONSTRAINTS:
- intensity_band MUST be one of: cold | warming | hot
- category MUST be one of: media_share, conversation_probe, hypothetical, casual_behavior, external_reference
- arc_focus = "${staleFocus}"
- prompt_template must reference something specific Maxy actually said (see her recent messages below)
- observation_questions: 3-4 questions for after-the-fact debrief
- Seeds must be reasonable to plant in a marriage conversation — not bizarre or alienating

MAXY'S RECENT MESSAGES (use one of these as the anchor):
${recentTexts}

OUTPUT JSON ARRAY of 2 objects exactly matching this schema:
[
  {
    "seed_key": "autogen_${staleFocus}_xxx",
    "category": "<one of valid>",
    "intensity_band": "cold | warming | hot",
    "topic": "<short topic name>",
    "prompt_template": "<the literal instruction to Maxy about what to say/do with Gina, anchored to her real message>",
    "observation_questions": ["<q1>", "<q2>", "<q3>"],
    "hypothesis_template": "<what the seed is testing for>",
    "expected_reaction_pos": "<what positive reaction looks like>",
    "expected_reaction_neg": "<what negative reaction looks like>",
    "arc_focus": "${staleFocus}",
    "cooldown_days": <14-60 depending on band>,
    "intensity": <1-10>
  },
  { ... }
]

Return ONLY the JSON array, no prose.`

      const result = await callWithFallback({ prompt, max_tokens: 2000 })
      if (result.error || !result.text) continue

      const m = result.text.match(/\[[\s\S]*\]/)
      if (!m) continue
      let drafts: SeedDraft[]
      try { drafts = JSON.parse(m[0]) } catch { continue }

      for (const d of drafts.slice(0, 3)) {
        if (!d.seed_key || !d.prompt_template || !d.arc_focus) continue
        if (!VALID_BANDS.includes(d.intensity_band)) d.intensity_band = 'warming'
        if (!VALID_CATEGORIES.includes(d.category)) d.category = 'conversation_probe'
        const seedKey = d.seed_key.startsWith('autogen_') ? d.seed_key : `autogen_${d.seed_key}`

        await supabase.from('gina_seed_catalog').insert({
          seed_key: seedKey,
          category: d.category,
          intensity_band: d.intensity_band,
          topic: d.topic ?? 'autogen',
          prompt_template: d.prompt_template,
          observation_questions: d.observation_questions ?? [],
          cooldown_days: d.cooldown_days ?? 30,
          stage_min: 0, stage_max: 7,
          hypothesis_template: d.hypothesis_template ?? '',
          expected_reaction_pos: d.expected_reaction_pos ?? '',
          expected_reaction_neg: d.expected_reaction_neg ?? '',
          advances_arc_on_positive: d.intensity_band === 'hot',
          arc_focus: d.arc_focus,
          active: true,
        })
        authored++
      }
    }

    return new Response(JSON.stringify({ authored }),
      { headers: { ...corsHeaders, 'content-type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }),
      { status: 500, headers: { ...corsHeaders, 'content-type': 'application/json' } })
  }
})
