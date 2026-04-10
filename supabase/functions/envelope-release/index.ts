import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Find envelopes ready to release
    const { data: ready } = await supabase
      .from('sealed_envelopes')
      .select('id, user_id, title, sealed_content, sealed_at, share_with_witness')
      .eq('released', false)
      .lte('release_at', new Date().toISOString())

    if (!ready || ready.length === 0) {
      return new Response(JSON.stringify({ released: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let released = 0
    let notified = 0

    for (const env of ready) {
      try {
        // Mark released
        await supabase
          .from('sealed_envelopes')
          .update({
            released: true,
            released_at: new Date().toISOString(),
          })
          .eq('id', env.id)

        // Notify user via outreach queue
        await supabase.from('handler_outreach_queue').insert({
          user_id: env.user_id,
          message: `An envelope you sealed has opened: "${env.title}". Open the app to read what your past self wrote to you.`,
          urgency: 'high',
          trigger_reason: 'envelope_release',
          scheduled_for: new Date().toISOString(),
          expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
          source: 'envelope_release',
        })

        // Handler note so it can reference
        const sealedDate = new Date(env.sealed_at).toLocaleDateString()
        await supabase.from('handler_notes').insert({
          user_id: env.user_id,
          note_type: 'envelope_released',
          content: `[ENVELOPE OPENED] "${env.title}" sealed ${sealedDate}. The content: "${env.sealed_content.substring(0, 300)}". Reference this — her past self wrote it for her future self. Use it as evidence of long-term commitment.`,
          priority: 4,
        })

        // Witness notifications if opted in
        if (env.share_with_witness) {
          const { data: witnesses } = await supabase
            .from('designated_witnesses')
            .select('id')
            .eq('user_id', env.user_id)
            .eq('status', 'active')

          if (witnesses && witnesses.length > 0) {
            const notifs = witnesses.map(w => ({
              witness_id: w.id,
              user_id: env.user_id,
              notification_type: 'milestone',
              subject: `Maxy's sealed envelope released: ${env.title}`,
              body: `An envelope Maxy sealed on ${sealedDate} has been released today.\n\nContent:\n${env.sealed_content}`,
              payload: { envelope_id: env.id, title: env.title },
            }))
            await supabase.from('witness_notifications').insert(notifs)
            notified += witnesses.length
          }
        }

        released++
      } catch (err) {
        console.error(`Release failed for ${env.id}:`, err)
      }
    }

    return new Response(JSON.stringify({ released, notified }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'unknown' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
