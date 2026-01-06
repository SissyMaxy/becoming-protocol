// Lovense Command Edge Function
// Sends commands via Lovense Standard API

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const LOVENSE_API_URL = 'https://api.lovense.com/api/lan/v2/command'
const DEVELOPER_TOKEN = Deno.env.get('LOVENSE_DEVELOPER_TOKEN')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface CommandRequest {
  patternName?: string
  customCommand?: {
    command: 'Function' | 'Preset' | 'Pattern' | 'Stop'
    action?: string
    name?: string
    pattern?: string
    timeSec?: number
    loopRunningSec?: number
    loopPauseSec?: number
  }
  triggerType: string
  triggerId?: string
  intensity?: number
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

    // Get authenticated user
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    )

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const userId = user.id
    const { patternName, customCommand, triggerType, triggerId, intensity } =
      await req.json() as CommandRequest

    // Check if haptics are allowed
    const { data: canUse } = await supabase.rpc('can_use_haptics', { p_user_id: userId })
    if (canUse && !canUse.allowed) {
      return new Response(
        JSON.stringify({ error: canUse.reason, allowed: false }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get user's connection info (contains utoken from callback)
    const { data: connection, error: connError } = await supabase
      .from('lovense_connections')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (connError || !connection) {
      return new Response(
        JSON.stringify({ error: 'No Lovense connection found. Please scan the QR code in the Lovense app.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get user's connected device
    const { data: device, error: deviceError } = await supabase
      .from('lovense_devices')
      .select('*')
      .eq('user_id', userId)
      .eq('is_connected', true)
      .single()

    if (deviceError || !device) {
      return new Response(
        JSON.stringify({ error: 'No connected device found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get command payload
    let payload: Record<string, unknown>
    let patternData: Record<string, unknown> | null = null

    if (patternName) {
      const { data: pattern, error: patternError } = await supabase
        .from('haptic_patterns')
        .select('*')
        .eq('name', patternName)
        .single()

      if (patternError || !pattern) {
        return new Response(
          JSON.stringify({ error: 'Pattern not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      payload = pattern.command_payload as Record<string, unknown>
      patternData = pattern
    } else if (customCommand) {
      payload = customCommand as Record<string, unknown>
    } else {
      return new Response(
        JSON.stringify({ error: 'No command specified' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Build Lovense Standard API request
    const lovensePayload = {
      token: DEVELOPER_TOKEN,
      uid: userId,
      utoken: connection.utoken, // User token from callback
      toy: device.toy_id,
      apiVer: 2,
      command: payload.command || 'Function',
      ...payload
    }

    // Execute command
    let success = true
    let errorMessage: string | null = null
    let result: Record<string, unknown> = {}

    try {
      console.log('Sending command to Lovense:', JSON.stringify(lovensePayload, null, 2))

      const response = await fetch(LOVENSE_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lovensePayload)
      })

      result = await response.json()
      console.log('Lovense response:', JSON.stringify(result, null, 2))

      success = result.code === 200 || result.code === 0
      if (!success) {
        errorMessage = result.message as string || 'Unknown error'
      }
    } catch (apiError) {
      success = false
      errorMessage = apiError instanceof Error ? apiError.message : 'API request failed'
      console.error('Lovense API error:', apiError)
    }

    // Extract intensity from command
    let commandIntensity = intensity
    if (!commandIntensity && typeof payload.action === 'string') {
      const match = (payload.action as string).match(/Vibrate:(\d+)/)
      if (match) {
        commandIntensity = parseInt(match[1])
      }
    }

    // Log command
    await supabase.from('lovense_commands').insert({
      user_id: userId,
      device_id: device.id,
      command_type: (payload.command as string) || 'Function',
      command_payload: lovensePayload,
      trigger_type: triggerType,
      trigger_id: triggerId || null,
      intensity: commandIntensity || null,
      duration_sec: (patternData?.duration_sec as number) || (payload.timeSec as number) || null,
      success,
      error_message: errorMessage
    })

    return new Response(
      JSON.stringify({ success, result, device: { id: device.id, name: device.toy_name } }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Lovense command error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
