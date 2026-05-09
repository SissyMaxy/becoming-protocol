// device-control — thin entrypoint. Cron tick (every 5 min) enqueues a single
// `device-control:run` job. Returns 202 immediately. Real work happens in
// the job-worker via runDeviceControl.

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
      kind: 'device-control:run',
      payload: {},
      priority: 6,
    })

    return acceptedResponse({ job_id: job.id, kind: job.kind }, corsHeaders)
  } catch (err) {
    console.error('device-control entrypoint error:', err)
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
