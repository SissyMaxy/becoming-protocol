// backfill-handler-embeddings — one-shot backfill for handler_memory rows
// that were inserted before the Handler had a working OPENAI_API_KEY in
// its env. Reads NULL-embedding rows, embeds via OpenAI, writes back.
//
// POST { user_id: string, limit?: number } → { processed, embedded, failed }
//
// Auth: any valid Supabase JWT. Operates with service-role key internally
// to bypass RLS (a deliberate one-shot admin op).

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface BackfillRequest {
  user_id: string
  limit?: number
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'POST only' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const apiKey = Deno.env.get('OPENAI_API_KEY')
  if (!apiKey) {
    return new Response(JSON.stringify({ ok: false, error: 'OPENAI_API_KEY missing' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ ok: false, error: 'supabase env missing' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const supabase = createClient(supabaseUrl, serviceKey)

  let body: BackfillRequest
  try {
    body = await req.json() as BackfillRequest
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'invalid JSON body' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  if (!body.user_id) {
    return new Response(JSON.stringify({ ok: false, error: 'user_id required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const limit = Math.max(1, Math.min(200, body.limit ?? 50))

  // Fetch NULL-embedding rows for this user
  const { data: rows, error: fetchErr } = await supabase
    .from('handler_memory')
    .select('id, content')
    .eq('user_id', body.user_id)
    .is('embedding', null)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (fetchErr) {
    return new Response(JSON.stringify({ ok: false, error: fetchErr.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  if (!rows || rows.length === 0) {
    return new Response(JSON.stringify({ ok: true, processed: 0, embedded: 0, failed: 0, message: 'no NULL-embedding rows' }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let embedded = 0
  let failed = 0
  const failures: Array<{ id: string; reason: string }> = []

  for (const row of rows as Array<{ id: string; content: string }>) {
    if (!row.content || row.content.length < 3) {
      failed++
      failures.push({ id: row.id, reason: 'content too short' })
      continue
    }
    try {
      const r = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'text-embedding-3-small',
          input: row.content.substring(0, 2000),
        }),
      })
      if (!r.ok) {
        const txt = await r.text()
        failed++
        failures.push({ id: row.id, reason: `openai ${r.status}: ${txt.slice(0, 100)}` })
        continue
      }
      const data = await r.json() as { data?: Array<{ embedding?: number[] }> }
      const embedding = data.data?.[0]?.embedding
      if (!embedding || !Array.isArray(embedding)) {
        failed++
        failures.push({ id: row.id, reason: 'no embedding in response' })
        continue
      }
      const vectorStr = `[${embedding.join(',')}]`
      const { error: updErr } = await supabase
        .from('handler_memory')
        .update({ embedding: vectorStr })
        .eq('id', row.id)
      if (updErr) {
        failed++
        failures.push({ id: row.id, reason: `update: ${updErr.message}` })
        continue
      }
      embedded++
    } catch (err) {
      failed++
      failures.push({ id: row.id, reason: err instanceof Error ? err.message : String(err) })
    }
  }

  return new Response(JSON.stringify({
    ok: true,
    processed: rows.length,
    embedded,
    failed,
    failures: failures.slice(0, 5),
  }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
