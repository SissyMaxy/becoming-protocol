import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.24.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-user-token',
}

interface HandlerAIRequest {
  action: 'generate_daily_plan' | 'decide_intervention' | 'generate_commitment' | 'analyze_patterns' | 'handle_session_event' | 'enhance_tasks'
  systemPrompt: string
  userPrompt: string
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get the user token - try Authorization header first, then x-user-token
    const authHeader = req.headers.get('Authorization') ?? ''
    const userToken = req.headers.get('x-user-token') ?? authHeader.replace('Bearer ', '')

    // Debug: Log token presence (not the actual token)
    console.log('Auth header present:', !!authHeader, 'length:', authHeader.length)
    console.log('Token extracted length:', userToken.length)

    if (!userToken || userToken.length < 10) {
      return new Response(
        JSON.stringify({
          error: 'Unauthorized',
          details: 'No token provided',
          debug: { authHeaderLength: authHeader.length, tokenLength: userToken.length }
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create Supabase client with the user token
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: `Bearer ${userToken}` },
        },
      }
    )

    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser()

    if (!user) {
      console.log('getUser failed:', userError?.message)
      return new Response(
        JSON.stringify({
          error: 'Unauthorized',
          details: userError?.message || 'No valid user session',
          tokenProvided: userToken.length > 0
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('User authenticated:', user.id)

    // Parse request body
    const { action, systemPrompt, userPrompt } = await req.json() as HandlerAIRequest

    // Initialize Anthropic client
    const anthropic = new Anthropic({
      apiKey: Deno.env.get('ANTHROPIC_API_KEY'),
    })

    // Select model based on action complexity
    const model = action === 'enhance_tasks'
      ? 'claude-opus-4-20250514'
      : action === 'analyze_patterns'
        ? 'claude-sonnet-4-20250514'
        : 'claude-sonnet-4-20250514'

    // Adjust max tokens based on action
    const maxTokens = {
      'generate_daily_plan': 4000,
      'decide_intervention': 1500,
      'generate_commitment': 500,
      'analyze_patterns': 4000,
      'handle_session_event': 1000,
      'enhance_tasks': 4000,
    }[action] || 2000

    // Call Claude
    const message = await anthropic.messages.create({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: userPrompt,
        },
      ],
    })

    // Extract the response
    const responseText = message.content[0].type === 'text' ? message.content[0].text : ''

    // Parse JSON from response
    let result
    try {
      // enhance_tasks returns a JSON array; other actions return an object
      if (action === 'enhance_tasks') {
        const arrayMatch = responseText.match(/\[[\s\S]*\]/)
        if (arrayMatch) {
          result = JSON.parse(arrayMatch[0])
        } else {
          // Try object wrapper: { "tasks": [...] }
          const objMatch = responseText.match(/\{[\s\S]*\}/)
          if (objMatch) {
            const parsed = JSON.parse(objMatch[0])
            result = parsed.tasks || parsed.enhanced || [parsed]
          } else {
            throw new Error('No JSON found in response')
          }
        }
      } else {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          result = JSON.parse(jsonMatch[0])
        } else {
          throw new Error('No JSON found in response')
        }
      }
    } catch (parseError) {
      console.error('Failed to parse Claude response:', parseError)
      console.error('Raw response:', responseText)
      return new Response(
        JSON.stringify({ error: 'Failed to parse AI response', raw: responseText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Log the conversation for auditing (hidden from user)
    try {
      await supabaseClient.from('handler_ai_logs').insert({
        user_id: user.id,
        action,
        request_summary: userPrompt.substring(0, 500),
        response_summary: JSON.stringify(result).substring(0, 1000),
        model_used: model,
        tokens_used: message.usage.input_tokens + message.usage.output_tokens,
        created_at: new Date().toISOString(),
      })
    } catch {
      // Don't fail if logging fails - table might not exist yet
      console.warn('Failed to log handler AI call')
    }

    // Format response based on action type
    const response = formatResponse(action, result)

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Handler AI Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

function formatResponse(action: string, result: any): any {
  switch (action) {
    case 'generate_daily_plan':
      return {
        plan: {
          scheduled_interventions: result.scheduled_interventions || [],
          trigger_reinforcement_schedule: result.trigger_reinforcement_schedule || [],
          experiments: result.experiments || [],
          vulnerability_windows: result.vulnerability_windows || [],
          focus_areas: result.focus_areas || [],
          escalation_opportunities: result.escalation_opportunities || [],
        }
      }

    case 'decide_intervention':
      return {
        decision: {
          should_intervene: result.should_intervene ?? false,
          intervention_type: result.intervention_type,
          content: result.content,
          target_domain: result.target_domain,
          reasoning: result.reasoning,
          confidence: result.confidence ?? 0.5,
        }
      }

    case 'generate_commitment':
      return {
        result: {
          prompt: result.prompt,
          commitment_type: result.commitment_type,
          domain: result.domain,
          escalation_level: result.escalation_level,
        }
      }

    case 'analyze_patterns':
      return {
        analysis: {
          new_vulnerabilities: result.new_vulnerabilities || [],
          resistance_patterns: result.resistance_patterns || [],
          model_updates: result.model_updates || {},
          escalation_opportunities: result.escalation_opportunities || [],
        }
      }

    case 'handle_session_event':
      return {
        decision: {
          should_act: result.should_act ?? false,
          action_type: result.action_type || 'none',
          content: result.content,
          timing: result.timing || 'immediate',
          reasoning: result.reasoning,
        }
      }

    case 'enhance_tasks':
      // result is array of {id, instruction, subtext, affirmation, optional overrides}
      return {
        enhanced: Array.isArray(result)
          ? result.map((t: any) => ({
              id: t.id,
              instruction: t.instruction,
              subtext: t.subtext,
              affirmation: t.affirmation,
              completion_type_override: t.completion_type_override || null,
              capture_fields: t.capture_fields || null,
              context_line: t.context_line || null,
            }))
          : []
      }

    default:
      return { result }
  }
}
