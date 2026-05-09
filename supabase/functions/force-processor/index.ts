// force-processor — thin entrypoint. Each cron tick enqueues one
// `force-processor:run` job. Real work in `_shared/job-handlers/force-processor.ts`.

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
      kind: 'force-processor:run',
      payload: {},
      priority: 6,
    })

    return acceptedResponse({ job_id: job.id, kind: job.kind }, corsHeaders)
  } catch (err) {
    console.error('force-processor entrypoint error:', err)
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
