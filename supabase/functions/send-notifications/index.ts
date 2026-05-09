// send-notifications — thin entrypoint. Cron hits this every minute. The
// entrypoint enqueues a single `send-notifications:scan` job; the worker's
// scan handler then fans out one `send-notifications:send` job per due
// notification (one job per recipient, per the original spec).
//
// Public URL and request body unchanged. Returns 202 immediately.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { enqueueJob, acceptedResponse } from '../_shared/enqueue-job.ts'

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

    const job = await enqueueJob(supabase, {
      kind: 'send-notifications:scan',
      payload: {},
      priority: 7,
    })

    return acceptedResponse({ job_id: job.id, kind: job.kind }, corsHeaders)
  } catch (err) {
    console.error('send-notifications entrypoint error:', err)
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
