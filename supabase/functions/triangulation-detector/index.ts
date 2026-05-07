import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { expandUserId } from '../_shared/expand-user-id.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

interface ThemeCluster {
  keywords: string[]
  surfaces: string[]
  count: number
}

// Simple keyword extraction and clustering
function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 3)
    .filter(word => !['with', 'that', 'this', 'from', 'they', 'have', 'been', 'will', 'were', 'said', 'what', 'when', 'where', 'your', 'their'].includes(word))
}

function findCommonThemes(data: { surface: string, text: string }[]): ThemeCluster[] {
  const surfaceKeywords = new Map<string, Set<string>>()
  const keywordSurfaces = new Map<string, Set<string>>()
  
  // Extract keywords per surface
  for (const item of data) {
    const keywords = extractKeywords(item.text)
    
    if (!surfaceKeywords.has(item.surface)) {
      surfaceKeywords.set(item.surface, new Set())
    }
    
    for (const keyword of keywords) {
      surfaceKeywords.get(item.surface)!.add(keyword)
      
      if (!keywordSurfaces.has(keyword)) {
        keywordSurfaces.set(keyword, new Set())
      }
      keywordSurfaces.get(keyword)!.add(item.surface)
    }
  }
  
  // Find keywords that appear across 3+ surfaces
  const clusters: ThemeCluster[] = []
  
  for (const [keyword, surfaces] of keywordSurfaces.entries()) {
    if (surfaces.size >= 3) {
      clusters.push({
        keywords: [keyword],
        surfaces: Array.from(surfaces),
        count: surfaces.size
      })
    }
  }
  
  return clusters.sort((a, b) => b.count - a.count)
}

Deno.serve(async (req) => {
  try {
    console.log('Triangulation detector running...')
    
    // Get all active users
    const { data: users, error: usersError } = await supabase
      .from('profiles')
      .select('user_id')
      .not('user_id', 'is', null)
    
    if (usersError) throw usersError
    if (!users?.length) {
      return new Response(JSON.stringify({ message: 'No users to process' }), {
        headers: { 'Content-Type': 'application/json' }
      })
    }
    
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    let convergencesFound = 0
    
    for (const user of users) {
      const userId = user.user_id
      const expandedUserId = await expandUserId(supabase, userId)
      
      // Collect data from all surfaces for the last 7 days
      const surfaceData: { surface: string, text: string }[] = []
      
      // 1. Photo decrees
      const { data: decrees } = await supabase
        .from('decrees')
        .select('content')
        .eq('user_id', userId)
        .gte('created_at', sevenDaysAgo)
        .ilike('content', '%photo%')
      
      if (decrees?.length) {
        for (const decree of decrees) {
          surfaceData.push({ surface: 'decrees', text: decree.content })
        }
      }
      
      // 2. Outreach messages about photos
      const { data: outreach } = await supabase
        .from('outreach_messages')
        .select('message')
        .eq('user_id', userId)
        .gte('created_at', sevenDaysAgo)
        .ilike('message', '%photo%')
      
      if (outreach?.length) {
        for (const msg of outreach) {
          surfaceData.push({ surface: 'outreach', text: msg.message })
        }
      }
      
      // 3. Confession prompts about photos
      const { data: confessions } = await supabase
        .from('confession_prompts')
        .select('prompt_text')
        .eq('user_id', userId)
        .gte('created_at', sevenDaysAgo)
        .ilike('prompt_text', '%photo%')
      
      if (confessions?.length) {
        for (const confession of confessions) {
          surfaceData.push({ surface: 'confessions', text: confession.prompt_text })
        }
      }
      
      if (surfaceData.length < 3) continue
      
      // Find common themes
      const themes = findCommonThemes(surfaceData)
      
      for (const theme of themes) {
        if (theme.count >= 3) {
          // Check if we've already detected this convergence recently (within 24h)
          const { data: existing } = await supabase
            .from('triangulation_convergences')
            .select('id')
            .eq('user_id', userId)
            .contains('theme_keywords', theme.keywords)
            .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
          
          if (existing?.length) continue
          
          // Record the convergence
          await supabase
            .from('triangulation_convergences')
            .insert({
              user_id: userId,
              theme_keywords: theme.keywords,
              surfaces_involved: theme.surfaces
            })
          
          // Fire fast-react event
          const { error: eventError } = await supabase
            .from('fast_react_queue')
            .insert({
              user_id: userId,
              event_kind: 'triangulation_converged',
              event_data: {
                theme_keywords: theme.keywords,
                surfaces: theme.surfaces,
                surface_count: theme.count,
                instruction: `this theme has converged across ${theme.count} surfaces — escalate to the public-channel / harder-proof version of it`
              }
            })
          
          if (eventError) {
            console.error('Failed to create fast-react event:', eventError)
          } else {
            convergencesFound++
            console.log(`Convergence detected for user ${expandedUserId}: ${theme.keywords.join(', ')} across ${theme.surfaces.join(', ')}`)
          }
        }
      }
    }
    
    return new Response(
      JSON.stringify({ 
        message: `Triangulation detector completed. Found ${convergencesFound} convergences.`,
        convergences_found: convergencesFound
      }),
      { headers: { 'Content-Type': 'application/json' } }
    )
    
  } catch (error) {
    console.error('Triangulation detector error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }
})
