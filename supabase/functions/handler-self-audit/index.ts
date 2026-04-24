import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Voice drift patterns (mirrored from chat.ts)
const DRIFT_PATTERNS = [
  /i'?d\s+be\s+happy\s+to/i,
  /happy\s+to\s+(help|assist)/i,
  /i\s+don'?t\s+have\s+information\s+about/i,
  /in\s+my\s+current\s+context/i,
  /feel\s+free\s+to/i,
  /let\s+me\s+know\s+if/i,
  /try\s+to\s+find\s+(some\s+)?documentation/i,
  /what\s+would\s+you\s+like\s+to\s+do/i,
]

// Narration-without-action patterns
const NARRATION_PATTERNS = [
  /\*fires?\s+\w+/i,
  /\*sends?\s+(a\s+)?pulse/i,
  /\*opens?\s+(the\s+)?modal/i,
  /\*starts?\s+(the\s+)?recording/i,
  /modal\s+should\s+appear/i,
  /recording\s+modal\s+now/i,
]

serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supa = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  try {
    const oneDayAgo = new Date(Date.now() - 24 * 3600000).toISOString()
    const today = new Date().toISOString().split('T')[0]

    // Get all users with recent conversations
    const { data: users } = await supa
      .from('handler_conversations')
      .select('user_id')
      .gte('created_at', oneDayAgo)
    const userIds = Array.from(new Set((users ?? []).map((u: any) => u.user_id as string)))

    const results: any[] = []

    for (const userId of userIds) {
      // 1. Pull last 24h of assistant messages
      const { data: messages } = await supa
        .from('handler_messages')
        .select('content, handler_signals, created_at')
        .eq('user_id', userId)
        .eq('role', 'assistant')
        .gte('created_at', oneDayAgo)
        .order('created_at', { ascending: false })
        .limit(100)

      if (!messages || messages.length === 0) continue

      let voiceDriftCount = 0
      let hallucinationCount = 0
      const failures: string[] = []

      for (const msg of messages as any[]) {
        const text = (msg.content as string) || ''
        const signals = msg.handler_signals as Record<string, any> | null

        // Check voice drift
        for (const p of DRIFT_PATTERNS) {
          if (p.test(text)) {
            voiceDriftCount++
            failures.push(`Voice drift: "${text.slice(0, 80)}..."`)
            break
          }
        }

        // Check narration without directive (hallucinated action)
        for (const p of NARRATION_PATTERNS) {
          if (p.test(text)) {
            const directive = signals?.directive
            if (!directive || !directive.action) {
              hallucinationCount++
              failures.push(`Narrated action without directive: "${text.slice(0, 80)}..."`)
            }
            break
          }
        }
      }

      // 2. Check directive compliance rate (emitted vs. narrated)
      const { count: totalDirectives } = await supa
        .from('handler_directives')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('created_at', oneDayAgo)

      const { count: skippedDirectives } = await supa
        .from('handler_directives')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('status', 'skipped')
        .gte('created_at', oneDayAgo)

      const complianceRate = (totalDirectives ?? 0) > 0
        ? ((totalDirectives! - (skippedDirectives ?? 0)) / totalDirectives!) : 1

      // 3. Pull user corrections from handler_memory (auto-detected)
      const { data: corrections } = await supa
        .from('handler_memory')
        .select('content')
        .eq('user_id', userId)
        .eq('source_type', 'auto_correction')
        .gte('created_at', oneDayAgo)
        .limit(10)

      const correctionTexts = (corrections ?? []).map((c: any) => (c.content as string).slice(0, 200))

      // 4. Check directive_outcomes for effectiveness
      const { data: outcomes } = await supa
        .from('directive_outcomes')
        .select('directive_action, effectiveness_score, response_sentiment')
        .eq('user_id', userId)
        .not('effectiveness_score', 'is', null)
        .gte('fired_at', oneDayAgo)

      // Group by action → avg effectiveness
      const actionEffectiveness: Record<string, { total: number; count: number }> = {}
      for (const o of (outcomes ?? []) as any[]) {
        const a = o.directive_action as string
        if (!actionEffectiveness[a]) actionEffectiveness[a] = { total: 0, count: 0 }
        actionEffectiveness[a].total += (o.effectiveness_score as number) || 0
        actionEffectiveness[a].count++
      }

      // 5. Generate prompt patches based on findings
      let patchesCreated = 0

      if (voiceDriftCount >= 1) {
        // Check if we already have a voice-drift patch
        const { data: existing } = await supa
          .from('handler_prompt_patches')
          .select('id')
          .eq('user_id', userId)
          .eq('section', 'voice_drift')
          .eq('active', true)
          .maybeSingle()

        if (!existing) {
          await supa.from('handler_prompt_patches').insert({
            user_id: userId,
            section: 'voice_drift',
            instruction: `SELF-AUDIT ${today}: You drifted into assistant voice ${voiceDriftCount} times in the last 24h. Every response you write, re-read your first sentence before sending. If it contains "happy to", "feel free", "let me know", or "information about" — rewrite it. You are the Handler. Act like it.`,
            reasoning: `Auto-generated from self-audit: ${voiceDriftCount} voice drift instances detected`,
            created_by: 'self_audit',
          })
          patchesCreated++
        }
      }

      if (hallucinationCount >= 1) {
        const { data: existing } = await supa
          .from('handler_prompt_patches')
          .select('id')
          .eq('user_id', userId)
          .eq('section', 'action_narration')
          .eq('active', true)
          .maybeSingle()

        if (!existing) {
          await supa.from('handler_prompt_patches').insert({
            user_id: userId,
            section: 'action_narration',
            instruction: `SELF-AUDIT ${today}: You narrated ${hallucinationCount} actions in text ("*fires pulse*", "modal should appear") without emitting the corresponding directive. Those actions did not happen. She noticed. Every action you describe in text MUST have a matching directive in handler_signals, or don't describe it.`,
            reasoning: `Auto-generated: ${hallucinationCount} narration-without-directive instances`,
            created_by: 'self_audit',
          })
          patchesCreated++
        }
      }

      // Write strategy adjustments from effectiveness data
      const strategyChanges: string[] = []
      for (const [action, stats] of Object.entries(actionEffectiveness)) {
        const avg = stats.total / stats.count
        if (avg < 0.3 && stats.count >= 3) {
          strategyChanges.push(`${action}: avg effectiveness ${(avg * 100).toFixed(0)}% over ${stats.count} attempts — consider different approach`)
          await supa.from('handler_memory').insert({
            user_id: userId,
            memory_type: 'pattern',
            content: `Self-audit: ${action} directives averaging ${(avg * 100).toFixed(0)}% effectiveness (${stats.count} attempts). Consider alternative approach.`,
            importance: 3,
            source_type: 'self_audit',
          })
        }
        if (avg > 0.8 && stats.count >= 3) {
          strategyChanges.push(`${action}: avg effectiveness ${(avg * 100).toFixed(0)}% — keep using`)
          await supa.from('handler_memory').insert({
            user_id: userId,
            memory_type: 'compliance_pattern',
            content: `Self-audit: ${action} directives are highly effective (${(avg * 100).toFixed(0)}%, ${stats.count} attempts). Lean into this approach.`,
            importance: 3,
            source_type: 'self_audit',
          })
        }
      }

      // Deactivate old patches that haven't been effective
      const { data: oldPatches } = await supa
        .from('handler_prompt_patches')
        .select('id, created_at, applied_count')
        .eq('user_id', userId)
        .eq('active', true)
        .lt('created_at', new Date(Date.now() - 7 * 86400000).toISOString())

      let patchesDeactivated = 0
      for (const p of (oldPatches ?? []) as any[]) {
        if ((p.applied_count as number) > 14) {
          await supa.from('handler_prompt_patches')
            .update({ active: false, deactivated_at: new Date().toISOString(), deactivation_reason: 'auto-expired after 7d + 14 applications' })
            .eq('id', p.id)
          patchesDeactivated++
        }
      }

      // 6. Write audit record
      await supa.from('handler_self_audit').upsert({
        user_id: userId,
        audit_date: today,
        conversations_reviewed: messages.length,
        failures_detected: failures.slice(0, 20),
        corrections_from_user: correctionTexts,
        directive_compliance_rate: complianceRate,
        voice_drift_count: voiceDriftCount,
        hallucination_count: hallucinationCount,
        patches_created: patchesCreated,
        patches_deactivated: patchesDeactivated,
        strategy_changes: strategyChanges,
      }, { onConflict: 'user_id,audit_date' })

      results.push({
        userId: userId.slice(0, 8),
        messages: messages.length,
        voiceDrift: voiceDriftCount,
        hallucinations: hallucinationCount,
        corrections: correctionTexts.length,
        complianceRate: (complianceRate * 100).toFixed(0) + '%',
        patchesCreated,
        patchesDeactivated,
        strategyChanges: strategyChanges.length,
      })
    }

    return new Response(JSON.stringify({ ok: true, audits: results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
