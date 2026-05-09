// handler-autonomous — thin entrypoint.
//
// Public contract preserved: same URL, same JSON body shape
//   { action: 'compliance_check' | 'daily_cycle' | ..., user_id?: string }
// but now returns 202 immediately after enqueueing a background_jobs row
// (kind = `handler-autonomous:<action>`). The job-worker drains the queue
// with a 25s per-handler cap.
//
// The actual work lives in `_shared/job-handlers/handler-autonomous.ts`. This
// split is what fixes the 150s edge-function timeout cap.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { enqueueJob, acceptedResponse } from '../_shared/enqueue-job.ts'
import { isValidHandlerAutonomousAction } from '../_shared/job-handlers/handler-autonomous.ts'

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

    const body = await req.json().catch(() => ({ action: 'compliance_check' }))
    const action = typeof body?.action === 'string' ? body.action : 'compliance_check'
    if (!isValidHandlerAutonomousAction(action)) {
      return new Response(
        JSON.stringify({ error: `unknown action: ${action}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }
    const user_id = typeof body?.user_id === 'string' ? body.user_id : undefined

    const job = await enqueueJob(supabase, {
      kind: `handler-autonomous:${action}`,
      payload: user_id ? { user_id } : {},
      priority: action === 'compliance_check' ? 7 : 5,
    })

    return acceptedResponse({ action, job_id: job.id, kind: job.kind }, corsHeaders)
  } catch (err) {
    console.error('handler-autonomous entrypoint error:', err)
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
