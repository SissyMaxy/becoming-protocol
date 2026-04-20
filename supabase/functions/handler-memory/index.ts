import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Relevance = importance(40%) + recency(35%) + reinforcement(15%) + retrieval_freshness(10%)
function calculateRelevance(m: {
  importance: number
  decay_rate: number
  last_reinforced_at: string
  reinforcement_count: number
  last_retrieved_at: string | null
}): number {
  const now = Date.now()
  const importanceScore = m.importance / 5
  const hoursSinceReinforced = (now - new Date(m.last_reinforced_at).getTime()) / 3600000
  const recencyScore = Math.exp((-m.decay_rate * hoursSinceReinforced) / 24)
  const reinforcementScore = Math.min(1, Math.log2(m.reinforcement_count + 1) / 5)
  let retrievalFreshnessScore = 1
  if (m.last_retrieved_at) {
    const hoursSinceRetrieved = (now - new Date(m.last_retrieved_at).getTime()) / 3600000
    retrievalFreshnessScore = Math.min(1, hoursSinceRetrieved / 168)
  }
  return (
    importanceScore * 0.4 +
    recencyScore * 0.35 +
    reinforcementScore * 0.15 +
    retrievalFreshnessScore * 0.1
  )
}

async function consolidateForUser(
  supa: ReturnType<typeof createClient>,
  userId: string,
): Promise<{ deactivated: number; merged: number }> {
  let deactivated = 0
  let merged = 0

  // Deactivate memories whose relevance has decayed below threshold.
  // Permanent (importance=5) memories are excluded.
  const { data: memories } = await supa
    .from('handler_memory')
    .select('id, importance, decay_rate, last_reinforced_at, reinforcement_count, last_retrieved_at, memory_type, content')
    .eq('user_id', userId)
    .eq('is_active', true)
    .lt('importance', 5)

  if (!memories) return { deactivated, merged }

  const toDeactivate: string[] = []
  for (const m of memories as any[]) {
    const relevance = calculateRelevance(m)
    if (relevance < 0.1) toDeactivate.push(m.id)
  }

  if (toDeactivate.length > 0) {
    await supa
      .from('handler_memory')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .in('id', toDeactivate)
    deactivated = toDeactivate.length
  }

  // Merge near-duplicates: same memory_type + identical first 80 chars of content.
  // Oldest wins as canonical; others point to it via consolidated_into and deactivate.
  // Sum reinforcement_count into the canonical row; keep max importance.
  const groups = new Map<string, any[]>()
  for (const m of memories as any[]) {
    if (toDeactivate.includes(m.id)) continue
    const key = `${m.memory_type}|${(m.content || '').slice(0, 80).toLowerCase().trim()}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(m)
  }

  for (const dupes of groups.values()) {
    if (dupes.length < 2) continue
    dupes.sort((a, b) => new Date(a.last_reinforced_at).getTime() - new Date(b.last_reinforced_at).getTime())
    const canonical = dupes[dupes.length - 1]
    const others = dupes.slice(0, -1)

    const totalReinforcement = dupes.reduce((s, d) => s + (d.reinforcement_count || 1), 0)
    const maxImportance = dupes.reduce((i, d) => Math.max(i, d.importance), 0)

    await supa
      .from('handler_memory')
      .update({
        reinforcement_count: totalReinforcement,
        importance: maxImportance,
        updated_at: new Date().toISOString(),
      })
      .eq('id', canonical.id)

    await supa
      .from('handler_memory')
      .update({
        is_active: false,
        consolidated_into: canonical.id,
        updated_at: new Date().toISOString(),
      })
      .in('id', others.map(o => o.id))

    merged += others.length
  }

  return { deactivated, merged }
}

serve(async req => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const action = body.action ?? 'consolidate'

    const supa = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    if (action !== 'consolidate') {
      return new Response(JSON.stringify({ error: 'unknown action' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Only consolidate for users with recent activity (past 30 days) to keep runtime bounded.
    const cutoff = new Date(Date.now() - 30 * 24 * 3600000).toISOString()
    const { data: users } = await supa
      .from('handler_memory')
      .select('user_id')
      .gte('last_reinforced_at', cutoff)
      .eq('is_active', true)

    const userIds = Array.from(new Set((users ?? []).map((u: any) => u.user_id)))

    let totalDeactivated = 0
    let totalMerged = 0
    for (const userId of userIds) {
      const r = await consolidateForUser(supa, userId as string)
      totalDeactivated += r.deactivated
      totalMerged += r.merged
    }

    return new Response(
      JSON.stringify({
        ok: true,
        users: userIds.length,
        deactivated: totalDeactivated,
        merged: totalMerged,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
