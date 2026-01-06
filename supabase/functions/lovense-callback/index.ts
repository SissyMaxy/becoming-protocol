// Lovense Callback Handler Edge Function
// Receives status updates from Lovense Standard API

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Lovense Standard API callback format
interface LovenseCallback {
  uid: string        // User ID we provided in QR code
  utoken: string     // User token for sending commands
  domain: string     // Local domain for direct connection
  httpPort: number   // HTTP port
  httpsPort: number  // HTTPS port
  wsPort: number     // WebSocket port
  wssPort: number    // Secure WebSocket port
  platform: string   // 'ios' or 'android'
  appType: string    // App type
  appVersion: string // App version
  toys: Record<string, {
    id: string
    name: string      // Toy type (lush, hush, etc)
    nickName: string  // User's nickname for toy
    status: number    // 1 = connected, 0 = disconnected
    battery: number   // Battery level 0-100
    version: string   // Firmware version
  }>
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const callback = await req.json() as LovenseCallback
    console.log('Lovense callback received:', JSON.stringify(callback, null, 2))

    // Validate callback has required fields
    if (!callback.uid || !callback.toys) {
      console.error('Invalid callback data - missing uid or toys')
      return new Response(
        JSON.stringify({ error: 'Invalid callback data' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const userId = callback.uid
    const updates: Promise<unknown>[] = []

    // Store/update connection info for this user
    // The utoken is needed to send commands later
    updates.push(
      supabase
        .from('lovense_connections')
        .upsert({
          user_id: userId,
          utoken: callback.utoken,
          domain: callback.domain,
          http_port: callback.httpPort,
          https_port: callback.httpsPort,
          ws_port: callback.wsPort,
          wss_port: callback.wssPort,
          platform: callback.platform,
          app_version: callback.appVersion,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id',
        })
    )

    // Process each toy in the callback
    for (const [toyId, toyData] of Object.entries(callback.toys)) {
      const isConnected = toyData.status === 1

      // Upsert device record
      updates.push(
        supabase
          .from('lovense_devices')
          .upsert({
            user_id: userId,
            toy_id: toyId,
            toy_name: toyData.name.toLowerCase(),
            nickname: toyData.nickName || toyData.name,
            is_connected: isConnected,
            battery_level: toyData.battery,
            last_seen_at: new Date().toISOString(),
          }, {
            onConflict: 'user_id,toy_id',
          })
      )

      // Log connection event
      updates.push(
        supabase
          .from('lovense_commands')
          .insert({
            user_id: userId,
            command_type: isConnected ? 'connect' : 'disconnect',
            command_payload: {
              event: isConnected ? 'device_connected' : 'device_disconnected',
              toyId,
              toyName: toyData.name,
              battery: toyData.battery,
            },
            trigger_type: 'system',
            success: true,
          })
      )
    }

    // Execute all updates and log results
    const results = await Promise.all(updates)
    console.log('Database update results:', JSON.stringify(results, null, 2))

    // Check for errors in any update
    for (const result of results) {
      const r = result as { error?: { message: string } }
      if (r.error) {
        console.error('Database update error:', r.error)
      }
    }

    console.log(`Processed callback for user ${userId}: ${Object.keys(callback.toys).length} toys`)

    // Return success to Lovense (they expect { result: true })
    return new Response(
      JSON.stringify({ result: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Lovense callback error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
