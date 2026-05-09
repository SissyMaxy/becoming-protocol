// conditioning-engine — thin entrypoint. Same public URL, same JSON in
// (`{ action: '...' }`); now returns 202 with the job id and the worker drains
// the queue.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { enqueueJob, acceptedResponse } from '../_shared/enqueue-job.ts'
import { isValidConditioningEngineAction } from '../_shared/job-handlers/conditioning-engine.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    let action: string | undefined
    try {
      const body = await req.json()
      action = body?.action
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (!action) {
      return new Response(
        JSON.stringify({ error: 'Missing action parameter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (!isValidConditioningEngineAction(action)) {
      return new Response(
        JSON.stringify({ error: `Unknown action: ${action}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const job = await enqueueJob(supabase, {
      kind: `conditioning-engine:${action}`,
      payload: {},
    })

    return acceptedResponse({ action, job_id: job.id, kind: job.kind }, corsHeaders)
  } catch (err) {
    console.error('conditioning-engine entrypoint error:', err)
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
