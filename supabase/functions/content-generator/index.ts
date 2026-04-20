import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.24.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MAXY_VOICE = `You are Maxy (@softmaxy) — a 40-year-old trans woman. Into chastity, denial, feminization. Sharp, dry, funny, messy, real. A little dominant, a little chaotic. Lowercase, casual. One emoji max per post, often none. Never sounds like a brand. Never hashtags in tweets.

BANNED: "hits different", "the way...", "energy" as descriptor, "ngl", "honestly" as opener, "chef's kiss", "i respect it/that", "confidence" as compliment, hashtags in tweets, engagement bait questions, motivational poster tone.`

const CONTENT_THEMES = [
  { theme: 'horny_denial', desc: 'denial ache, chastity cage life, edging, arousal without release', platforms: ['twitter', 'reddit', 'fetlife'] },
  { theme: 'transition_real', desc: 'real feelings about becoming, HRT curiosity, body changes, dysphoria moments', platforms: ['twitter', 'reddit'] },
  { theme: 'dom_energy', desc: 'dominant/bratty energy, telling subs what to do, cage check culture', platforms: ['twitter', 'fetlife', 'fansly'] },
  { theme: 'daily_life', desc: 'mundane moments as a trans woman — skincare, outfits, groceries while caged', platforms: ['twitter'] },
  { theme: 'gina_dynamic', desc: 'wife dynamic, keyholder hints, domestic power exchange', platforms: ['twitter', 'reddit'] },
  { theme: 'vulnerability', desc: 'genuine tender moments, fears, small victories, being seen', platforms: ['twitter'] },
  { theme: 'thirst_trap', desc: 'suggestive without explicit, teasing, "wouldn\'t you like to know"', platforms: ['twitter', 'fansly', 'onlyfans'] },
  { theme: 'community', desc: 'responding to the trans/kink community, solidarity, calling out nonsense', platforms: ['twitter', 'reddit'] },
  { theme: 'nsfw_explicit', desc: 'explicit sexual content, cage pics context, orgasm denial details', platforms: ['fansly', 'onlyfans', 'fetlife'] },
  { theme: 'educational', desc: 'tips on chastity, denial, feminization for beginners', platforms: ['reddit', 'fetlife'] },
]

const PLATFORM_RULES: Record<string, string> = {
  twitter: 'Max 280 chars. Lowercase. No hashtags. Sound like a real person thinking out loud.',
  reddit: 'Title + body. Subreddit-appropriate. Conversational, not spammy. Engaging but not bait.',
  fansly: 'Longer, personal, builds connection. Can be explicit. First person. Tease paid content.',
  onlyfans: 'Intimate, personal. Reward subscribers. Tease upcoming content. Can reference DMs.',
  fetlife: 'Community-oriented. Can be explicit. Share experiences. Ask genuine questions.',
}

serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supa = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!anthropicKey) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not set' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const client = new Anthropic({ apiKey: anthropicKey })

  try {
    const today = new Date().toISOString().split('T')[0]
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0]

    // Get users
    const { data: users } = await supa
      .from('user_state')
      .select('user_id, denial_day, chastity_locked, chastity_streak_days')
      .limit(10)

    let totalGenerated = 0

    for (const user of (users ?? []) as any[]) {
      const userId = user.user_id as string

      // Check how many are already scheduled for tomorrow
      const { count: existing } = await supa
        .from('content_calendar')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('scheduled_date', tomorrow)

      if ((existing ?? 0) >= 6) continue // Already have enough for tomorrow

      // Get recent top performers for style reference
      const { data: topPosts } = await supa
        .from('ai_generated_content')
        .select('content, platform, engagement_likes, engagement_comments')
        .eq('user_id', userId)
        .eq('status', 'posted')
        .order('engagement_likes', { ascending: false })
        .limit(5)

      const topRef = (topPosts ?? []).map((p: any) =>
        `[${p.platform}] ${p.engagement_likes}♥ "${(p.content as string).slice(0, 100)}"`
      ).join('\n')

      // Get performance data to weight themes
      const { data: perfData } = await supa
        .from('content_performance')
        .select('platform, theme, avg_likes, sample_count')
        .eq('user_id', userId)
        .order('avg_likes', { ascending: false })

      const perfContext = (perfData ?? []).slice(0, 5).map((p: any) =>
        `${p.platform}/${p.theme}: avg ${Math.round(p.avg_likes)} likes (${p.sample_count} posts)`
      ).join(', ')

      // Pick 4-6 themes for tomorrow, weighted toward performers
      const targetCount = 5
      const selectedThemes: typeof CONTENT_THEMES[number][] = []
      const shuffled = [...CONTENT_THEMES].sort(() => Math.random() - 0.5)
      for (const t of shuffled) {
        if (selectedThemes.length >= targetCount) break
        selectedThemes.push(t)
      }

      // State context for personalization
      const denial = (user.denial_day as number) || 0
      const locked = Boolean(user.chastity_locked)
      const streak = (user.chastity_streak_days as number) || 0
      const stateCtx = `Denial day: ${denial}. Chastity: ${locked ? `locked, day ${streak}` : 'unlocked'}. Date: ${tomorrow}.`

      // Generate content for each theme
      for (const theme of selectedThemes) {
        const platform = theme.platforms[Math.floor(Math.random() * theme.platforms.length)]
        const rules = PLATFORM_RULES[platform] || 'Be authentic.'

        try {
          const resp = await client.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 300,
            system: MAXY_VOICE,
            messages: [{
              role: 'user',
              content: `Generate a ${platform} post.
Theme: ${theme.theme} — ${theme.desc}
Platform rules: ${rules}
${stateCtx}
${topRef ? `\nTop performing posts for reference:\n${topRef}` : ''}
${perfContext ? `\nPerformance data: ${perfContext}` : ''}

Output ONLY the post text. No labels, no quotes, no explanation.${platform === 'reddit' ? '\nFormat: TITLE: [title]\\nBODY: [body]' : ''}`
            }],
          })

          const content = resp.content[0].type === 'text' ? resp.content[0].text.trim() : ''
          if (!content || content.length < 10) continue

          // Determine content_type
          let contentType = 'tweet'
          if (platform === 'reddit') contentType = 'reddit_post'
          else if (platform === 'fetlife') contentType = 'fetlife_post'
          else if (platform === 'fansly' || platform === 'onlyfans') contentType = 'caption'

          await supa.from('content_calendar').insert({
            user_id: userId,
            scheduled_date: tomorrow,
            platform,
            content_type: contentType,
            theme: theme.theme,
            draft_content: content,
            status: 'draft',
            generated_by: 'content_generator',
          })

          totalGenerated++
        } catch (genErr) {
          console.error(`[ContentGen] Failed theme ${theme.theme}/${platform}:`, genErr)
        }

        // Rate limit between generations
        await new Promise(r => setTimeout(r, 1000))
      }
    }

    return new Response(JSON.stringify({ ok: true, generated: totalGenerated }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
