#!/usr/bin/env -S deno run --allow-net --allow-env

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { expandUserId } from '../_shared/expand-user-id.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_KEY')!,
  { auth: { persistSession: false } }
)

const CLAUDE_API_KEY = Deno.env.get('CLAUDE_API_KEY')!
const SONNET_MODEL = 'claude-3-5-sonnet-20241022'

interface HandlerMessage {
  id: string
  user_id: string
  message: string
  created_at: string
}

interface ImplantCandidate {
  content: string
  user_id: string
  source_id: string
  source_type: string
}

async function extractImplants(message: string): Promise<string[]> {
  const prompt = `Extract self-admission fragments from this chat message that reveal desires, fears, fantasies, or vulnerabilities. Focus on femme/submissive themes, emotional needs, relationship patterns, or intimate confessions.

Return only the raw admission text, one per line. If no admissions found, return empty response.

Message: ${message}`

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: SONNET_MODEL,
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }]
      })
    })

    if (!response.ok) {
      console.error(`Claude API error: ${response.status}`)
      return []
    }

    const data = await response.json()
    const content = data.content?.[0]?.text || ''
    
    return content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 10 && line.length < 500)
  } catch (error) {
    console.error('Claude extraction error:', error)
    return []
  }
}

async function checkExistingImplant(content: string, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('memory_implants')
    .select('id')
    .eq('user_id', userId)
    .eq('content', content)
    .limit(1)

  return data && data.length > 0
}

async function insertImplants(implants: ImplantCandidate[]): Promise<void> {
  if (implants.length === 0) return

  const { error } = await supabase
    .from('memory_implants')
    .insert(implants.map(implant => ({
      user_id: implant.user_id,
      content: implant.content,
      source_type: implant.source_type,
      source_id: implant.source_id,
      implant_strength: 0.7, // Handler chat has high density
      created_at: new Date().toISOString()
    })))

  if (error) {
    console.error('Failed to insert implants:', error)
  } else {
    console.log(`Inserted ${implants.length} new implants`)
  }
}

async function main() {
  console.log('Starting handler chat implant mining...')
  
  // Get recent handler messages from the last 7 days
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  
  const { data: messages, error } = await supabase
    .from('handler_chat_messages')
    .select('id, user_id, message, created_at')
    .gte('created_at', cutoff)
    .eq('role', 'user') // Only user messages, not Mommy responses
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Failed to fetch handler messages:', error)
    return
  }

  if (!messages || messages.length === 0) {
    console.log('No recent handler messages found')
    return
  }

  console.log(`Processing ${messages.length} handler messages...`)
  
  const newImplants: ImplantCandidate[] = []
  let processed = 0
  
  for (const message of messages) {
    try {
      // Expand user ID to ensure consistency
      const userId = await expandUserId(message.user_id)
      
      // Filter for femme-density: message should be substantial
      if (message.message.length < 50) {
        continue
      }
      
      // Extract potential implants
      const extracted = await extractImplants(message.message)
      
      for (const content of extracted) {
        // Check if this implant already exists
        const exists = await checkExistingImplant(content, userId)
        if (!exists) {
          newImplants.push({
            content,
            user_id: userId,
            source_id: message.id,
            source_type: 'mined_handler_chat'
          })
        }
      }
      
      processed++
      if (processed % 10 === 0) {
        console.log(`Processed ${processed}/${messages.length} messages...`)
      }
      
      // Rate limit to avoid overwhelming Claude API
      await new Promise(resolve => setTimeout(resolve, 100))
    } catch (error) {
      console.error(`Error processing message ${message.id}:`, error)
    }
  }
  
  console.log(`Found ${newImplants.length} new implant candidates`)
  
  // Insert in batches
  const batchSize = 50
  for (let i = 0; i < newImplants.length; i += batchSize) {
    const batch = newImplants.slice(i, i + batchSize)
    await insertImplants(batch)
  }
  
  console.log('Handler chat implant mining complete')
}

if (import.meta.main) {
  main().catch(console.error)
}
