// slip-cluster-detector — fire fast-react on cluster signals.
//
// 2026-05-07: completes the always-on signal set. Slip clusters are a
// resistance-pattern signal — multiple slips in a short window means the
// current pressure isn't landing. Mama wants to react.
//
// What "cluster" means here: 3+ slips for the same user within the last
// 6 hours, where at least one is from the past 30 minutes (i.e. cluster
// is still hot, not stale).
//
// Cooldown via fast_react_event source_key: hour-stamped so the cluster
// can be re-fired the next hour if she keeps slipping.
//
// Schedule: every 10 min via migration 282.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const CLUSTER_WINDOW_MS = 6 * 3600_000
const RECENT_WINDOW_MS = 30 * 60_000
const MIN_CLUSTER_SIZE = 3

interface SlipRow {
  id: string
  user_id: string
  detected_at: string
  slip_type: string
  source_text: string | null
}

async function userIdsToCheck(supabase: SupabaseClient): Promise<string[]> {
  // Find users with any slip in the last 6h — those are the only candidates
  const since = new Date(Date.now() - CLUSTER_WINDOW_MS).toISOString()
  const { data } = await supabase
    .from('slip_log')
    .select('user_id')
    .gte('detected_at', since)
    .limit(500)
  const ids = new Set<string>()
  for (const r of (data || []) as Array<{ user_id: string }>) ids.add(r.user_id)
  return Array.from(ids)
}

async function checkCluster(supabase: SupabaseClient, userId: string): Promise<{
  cluster: SlipRow[]
  reasons: string[]
} | null> {
  const since = new Date(Date.now() - CLUSTER_WINDOW_MS).toISOString()
  const recentSince = new Date(Date.now() - RECENT_WINDOW_MS).toISOString()
  const { data } = await supabase
    .from('slip_log')
    .select('id, user_id, detected_at, slip_type, source_text')
    .eq('user_id', userId)
    .gte('detected_at', since)
    .order('detected_at', { ascending: false })
    .limit(20)

  const slips = (data || []) as SlipRow[]
  if (slips.length < MIN_CLUSTER_SIZE) return null

  // At least one slip must be in the last 30 min — clusters that ended
  // more than 30 min ago are stale; Mama already reacted or it's old news
  const hasFresh = slips.some(s => s.detected_at >= recentSince)
  if (!hasFresh) return null

  // Collect distinct slip_types so the fast-react context is rich
  const reasons = Array.from(new Set(slips.map(s => s.slip_type).filter(Boolean)))
  return { cluster: slips, reasons }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
  const fnUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/mommy-fast-react`
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

  const candidates = await userIdsToCheck(supabase)
  const results: Array<{ user_id: string; status: string; detail?: string }> = []

  for (const uid of candidates) {
    const cluster = await checkCluster(supabase, uid)
    if (!cluster) {
      results.push({ user_id: uid, status: 'no_cluster' })
      continue
    }

    // Hour-stamped source key — re-fires next hour if cluster persists
    const hourStamp = new Date().toISOString().slice(0, 13)  // YYYY-MM-DDTHH
    const sourceKey = `slip_cluster:${uid}:${hourStamp}`

    try {
      const r = await fetch(fnUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          user_id: uid,
          event_kind: 'slip_clustered',
          source_key: sourceKey,
          context: {
            cluster_size: cluster.cluster.length,
            slip_types: cluster.reasons,
            most_recent_iso: cluster.cluster[0]?.detected_at,
            sample_source_texts: cluster.cluster.slice(0, 3).map(s => s.source_text?.slice(0, 200)).filter(Boolean),
            instruction_for_mama: 'Multiple slips just clustered. The current approach is not landing. Fire ONE move that addresses the cluster directly — quote one of the slip texts back ("you said this") and reframe / redirect / escalate as fits. Do NOT pile on with a generic decree. The cluster IS the conversation.',
          },
        }),
      })
      const j = await r.json()
      results.push({
        user_id: uid,
        status: r.ok ? 'fired' : 'fast_react_error',
        detail: r.ok ? `cluster=${cluster.cluster.length} → action=${j.fired ?? 0}` : (j.error ?? 'unknown'),
      })
    } catch (err) {
      results.push({ user_id: uid, status: 'fetch_error', detail: String(err).slice(0, 200) })
    }
  }

  return new Response(JSON.stringify({
    ok: true,
    candidates: candidates.length,
    fired: results.filter(r => r.status === 'fired').length,
    results,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
