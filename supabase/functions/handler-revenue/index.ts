// handler-revenue — thin entrypoint. Same JSON in
//   { action: 'process_ai_queue' | ..., user_id?: string, data?: ... }
// returns 202 with the enqueued job id. Real work in
// `_shared/job-handlers/handler-revenue.ts`.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { enqueueJob, acceptedResponse } from '../_shared/enqueue-job.ts'
import { isValidRevenueAction } from '../_shared/job-handlers/handler-revenue.ts'

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

    const body = await req.json().catch(() => ({ action: 'process_ai_queue' }))
    const action = typeof body?.action === 'string' ? body.action : 'process_ai_queue'

    if (!isValidRevenueAction(action)) {
      return new Response(
        JSON.stringify({ ok: false, error: `Unknown action: ${action}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const payload: Record<string, unknown> = {}
    if (typeof body?.user_id === 'string') payload.user_id = body.user_id
    if (body?.data && typeof body.data === 'object') payload.data = body.data

    const job = await enqueueJob(supabase, {
      kind: `handler-revenue:${action}`,
      payload,
      priority: action === 'process_ai_queue' ? 7 : 5,
    })

    return acceptedResponse({ action, job_id: job.id, kind: job.kind }, corsHeaders)
  } catch (err) {
    console.error('handler-revenue entrypoint error:', err)
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
