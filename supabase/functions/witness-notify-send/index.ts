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
    const resendKey = Deno.env.get('RESEND_API_KEY')

    const { data: pending } = await supabase
      .from('witness_notifications')
      .select('id, witness_id, subject, body, designated_witnesses!inner(witness_email, witness_name, status)')
      .eq('delivery_status', 'pending')
      .limit(20)

    if (!pending || pending.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let sent = 0
    let failed = 0

    for (const notif of pending) {
      const witness = notif.designated_witnesses as any
      if (witness.status !== 'active') {
        // Witness not active — mark as cancelled
        await supabase
          .from('witness_notifications')
          .update({ delivery_status: 'failed', delivery_error: 'witness not active' })
          .eq('id', notif.id)
        failed++
        continue
      }

      try {
        if (resendKey) {
          // Send via Resend API
          const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${resendKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: 'Becoming Protocol <noreply@becoming.app>',
              to: witness.witness_email,
              subject: notif.subject,
              text: notif.body,
            }),
          })

          if (!res.ok) {
            const errBody = await res.text()
            throw new Error(`Resend ${res.status}: ${errBody}`)
          }
        }

        // Mark sent (even without Resend key — stub mode for testing)
        await supabase
          .from('witness_notifications')
          .update({
            delivery_status: 'sent',
            sent_at: new Date().toISOString(),
          })
          .eq('id', notif.id)
        sent++
      } catch (err) {
        await supabase
          .from('witness_notifications')
          .update({
            delivery_status: 'failed',
            delivery_error: err instanceof Error ? err.message : 'unknown',
          })
          .eq('id', notif.id)
        failed++
      }
    }

    return new Response(JSON.stringify({ sent, failed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'unknown' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
