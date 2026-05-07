// kick-builder — fire GH Actions repository_dispatch on new wish.
//
// 2026-05-07: with the user's Anthropic Max 20x plan, scheduled cron is the
// wrong abstraction — we want to drain the queue as soon as wishes appear.
// This edge function is the bridge: a Postgres trigger on
// mommy_code_wishes INSERT fires this function, which fires a GH
// repository_dispatch event, which kicks off the mommy-builder workflow
// in --drain mode.
//
// Required env vars on the function:
//   GH_REPO_OWNER   — e.g. "yourname"
//   GH_REPO_NAME    — e.g. "becoming-protocol"
//   GH_BUILDER_PAT  — fine-scoped PAT with repo:dispatch permission
//
// If env vars are missing, the function returns 200 with skipped='not_configured'
// so the trigger doesn't fail the underlying INSERT.
//
// Idempotency / rate limit:
//   - Skip if a dispatch fired in the last 60 seconds (avoid spam when
//     bulk-inserts happen, e.g. seed migrations like 277/286/292)
//   - Skip if the wish doesn't have auto_ship_eligible=true (no point waking
//     the builder for review-required wishes)

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// In-memory throttle (per-instance — Supabase edge functions can have
// multiple cold instances, so this is best-effort)
let lastDispatchAt = 0
const THROTTLE_MS = 60_000

interface KickPayload {
  wish_id?: string
  reason?: string
  force?: boolean
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'POST only' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let body: KickPayload = {}
  try { body = await req.json() } catch { /* default ok */ }

  const owner = Deno.env.get('GH_REPO_OWNER') ?? ''
  const repo = Deno.env.get('GH_REPO_NAME') ?? ''
  const pat = Deno.env.get('GH_BUILDER_PAT') ?? ''
  if (!owner || !repo || !pat) {
    return new Response(JSON.stringify({ ok: true, skipped: 'not_configured' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Throttle (unless forced via manual invocation)
  const now = Date.now()
  if (!body.force && now - lastDispatchAt < THROTTLE_MS) {
    return new Response(JSON.stringify({ ok: true, skipped: 'throttled' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Optional: verify there's actually something to ship before kicking
  if (body.wish_id) {
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
    const { data: wish } = await supabase
      .from('mommy_code_wishes')
      .select('auto_ship_eligible, status')
      .eq('id', body.wish_id)
      .maybeSingle()
    const w = wish as { auto_ship_eligible?: boolean; status?: string } | null
    if (!w || w.status !== 'queued' || w.auto_ship_eligible !== true) {
      return new Response(JSON.stringify({ ok: true, skipped: 'wish_not_eligible' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  }

  try {
    const r = await fetch(`https://api.github.com/repos/${owner}/${repo}/dispatches`, {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${pat}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        event_type: 'mommy-build-trigger',
        client_payload: {
          reason: body.reason ?? 'wish_inserted',
          wish_id: body.wish_id ?? null,
          triggered_at: new Date().toISOString(),
        },
      }),
    })
    if (!r.ok) {
      const txt = await r.text().catch(() => '')
      return new Response(JSON.stringify({ ok: false, error: `gh ${r.status}: ${txt.slice(0, 200)}` }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    lastDispatchAt = now
    return new Response(JSON.stringify({ ok: true, dispatched: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: 'fetch: ' + String(err).slice(0, 200) }), {
      status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
