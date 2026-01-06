// Lovense QR Code Generation Edge Function
// Generates QR code URL for users to connect their Lovense toys

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const DEVELOPER_TOKEN = Deno.env.get('LOVENSE_DEVELOPER_TOKEN')
const LOVENSE_QR_API = 'https://api.lovense.com/api/lan/getQrCode'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get authenticated user from the JWT
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const token = authHeader.replace('Bearer ', '')

    // Create client with the user's JWT to verify it
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      {
        global: {
          headers: { Authorization: `Bearer ${token}` },
        },
      }
    )

    // Get the user - this verifies the JWT
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser()

    if (authError || !user) {
      console.error('Auth error:', authError)
      return new Response(
        JSON.stringify({ error: 'Unauthorized', details: authError?.message }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create admin client for database operations
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Check if developer token is configured
    if (!DEVELOPER_TOKEN) {
      console.error('LOVENSE_DEVELOPER_TOKEN not set')
      return new Response(
        JSON.stringify({ error: 'Lovense API not configured. Please set LOVENSE_DEVELOPER_TOKEN.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Request QR code from Lovense API
    // The uid will be sent back in the callback so we know which user connected
    const response = await fetch(LOVENSE_QR_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: DEVELOPER_TOKEN,
        uid: user.id,
        uname: user.email?.split('@')[0] || 'user', // Display name in app
        utoken: user.id, // We'll get a different utoken back in callback
        v: 2, // API version
      })
    })

    const result = await response.json()
    console.log('Lovense QR response:', JSON.stringify(result, null, 2))

    if (result.code !== 0) {
      return new Response(
        JSON.stringify({ error: result.message || 'Failed to generate QR code' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Return the QR code URL
    return new Response(
      JSON.stringify({
        success: true,
        qrUrl: result.data?.qr || result.data,
        message: result.message,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Lovense QR code error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
