// mommy-implant-step-scheduler — daily fire-due-steps worker.
//
// POST {} (cron) — scans all active sequences across all users, fires any
// steps whose (sequence.started_at + scheduled_day_offset days) is <= now
// AND executed_at IS NULL. Idempotent: marks executed_at on success.
//
// Reinforcement methods:
//   outreach           → insert handler_outreach_queue row (Mama voice)
//   recall_distortion  → write a mommy_dossier row category='implant_seed'
//                        (real distortQuote() lives in a separate path; this
//                        scheduler logs the intended distortion so the next
//                        chat completion can apply it)
//   confession_demand  → insert confession_queue row (if table exists)
//   dossier_overlay    → mommy_dossier row category='implant_seed'
//   letter_reference   → mommy_dossier row category='reframed_memory' AND
//                        outreach with source='self_voice_letter' archived

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { mommyVoiceCleanup } from '../_shared/dommy-mommy.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonOk(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

interface StepRow {
  id: string
  sequence_id: string
  user_id: string
  step_number: number
  scheduled_day_offset: number
  prompt_text: string
  reinforcement_method: string
}

interface SeqRow {
  id: string
  user_id: string
  slug: string
  theme: string
  started_at: string
  current_step: number
  step_count: number
  status: string
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonOk({ ok: false, error: 'POST only' }, 405)

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')

  // Pull active sequences
  const { data: seqsRaw } = await supabase.from('memory_implant_sequences')
    .select('id, user_id, slug, theme, started_at, current_step, step_count, status')
    .eq('status', 'active')
  const seqs = (seqsRaw as SeqRow[] | null) ?? []
  if (!seqs.length) return jsonOk({ ok: true, fired: 0, scanned: 0 })

  let fired = 0
  let errors = 0
  const now = Date.now()

  for (const seq of seqs) {
    const ageMs = now - new Date(seq.started_at).getTime()
    const ageDays = Math.floor(ageMs / (24 * 3600 * 1000))

    const { data: stepsRaw } = await supabase.from('memory_implant_steps')
      .select('id, sequence_id, user_id, step_number, scheduled_day_offset, prompt_text, reinforcement_method')
      .eq('sequence_id', seq.id).is('executed_at', null)
      .lte('scheduled_day_offset', ageDays)
      .order('step_number', { ascending: true })
    const steps = (stepsRaw as StepRow[] | null) ?? []

    for (const step of steps) {
      try {
        const cleaned = mommyVoiceCleanup(step.prompt_text)
        let artifactId: string | null = null

        if (step.reinforcement_method === 'outreach') {
          const { data: outRow } = await supabase.from('handler_outreach_queue').insert({
            user_id: step.user_id,
            message: cleaned,
            urgency: 'normal',
            trigger_reason: `implant_step:${step.id}`,
            source: 'mommy_implant',
            implant_sequence_id: seq.id,
          }).select('id').single()
          artifactId = (outRow as { id: string } | null)?.id ?? null
        } else if (step.reinforcement_method === 'recall_distortion' || step.reinforcement_method === 'dossier_overlay') {
          const { data: dosRow } = await supabase.from('mommy_dossier').upsert({
            user_id: step.user_id,
            question_key: `implant_${seq.slug}_step_${step.step_number}`,
            category: 'implant_seed',
            answer: cleaned,
            source: 'auto_extracted',
            importance: 4,
            active: true,
          }, { onConflict: 'user_id,question_key' }).select('id').single()
          artifactId = (dosRow as { id: string } | null)?.id ?? null
        } else if (step.reinforcement_method === 'confession_demand') {
          try {
            const { data: confRow } = await supabase.from('confession_queue').insert({
              user_id: step.user_id,
              prompt: cleaned,
              status: 'pending',
              triggered_by_table: 'memory_implant_steps',
              triggered_by_id: step.id,
            }).select('id').single()
            artifactId = (confRow as { id: string } | null)?.id ?? null
          } catch {
            // Fall back to outreach if confession_queue shape differs.
            const { data: outRow } = await supabase.from('handler_outreach_queue').insert({
              user_id: step.user_id,
              message: `Mama wants you to tell her: ${cleaned}`,
              urgency: 'high',
              trigger_reason: `implant_confession:${step.id}`,
              source: 'mommy_implant',
              implant_sequence_id: seq.id,
            }).select('id').single()
            artifactId = (outRow as { id: string } | null)?.id ?? null
          }
        } else if (step.reinforcement_method === 'letter_reference') {
          // Seed the dossier with the letter fragment, then queue a letter
          // outreach archived to letters_archive.
          await supabase.from('mommy_dossier').upsert({
            user_id: step.user_id,
            question_key: `implant_letter_${seq.slug}_step_${step.step_number}`,
            category: 'reframed_memory',
            answer: cleaned,
            source: 'auto_extracted',
            importance: 5,
            active: true,
          }, { onConflict: 'user_id,question_key' })
          const { data: outRow } = await supabase.from('handler_outreach_queue').insert({
            user_id: step.user_id,
            message: cleaned,
            urgency: 'normal',
            trigger_reason: `implant_letter:${step.id}`,
            source: 'self_voice_letter',
            implant_sequence_id: seq.id,
            is_archived_to_letters: true,
          }).select('id').single()
          artifactId = (outRow as { id: string } | null)?.id ?? null
        }

        await supabase.from('memory_implant_steps').update({
          executed_at: new Date().toISOString(),
          execution_artifact_id: artifactId,
        }).eq('id', step.id)

        await supabase.from('memory_implant_sequences')
          .update({ current_step: step.step_number })
          .eq('id', seq.id).lt('current_step', step.step_number)

        {
          const _summary = `Fired step ${step.step_number} of "${seq.slug}" (${step.reinforcement_method}).`
          const _payload = { method: step.reinforcement_method, theme: seq.theme }
          await supabase.from('mommy_authority_log').insert({
            user_id: step.user_id,
            action_kind: 'fired',
            source_system: 'mommy-implant-step-scheduler',
            action_summary: _summary,
            action_payload: _payload,
            system: 'implant',
            summary: _summary,
            payload: _payload,
            implant_sequence_id: seq.id,
            implant_step_id: step.id,
            outreach_id: step.reinforcement_method === 'outreach' || step.reinforcement_method === 'letter_reference' ? artifactId : null,
          })
        }

        fired += 1
      } catch (err) {
        errors += 1
        await supabase.from('memory_implant_steps').update({
          execution_error: err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500),
        }).eq('id', step.id)
      }
    }

    // Mark sequence completed when all steps done.
    if (seq.current_step >= seq.step_count) {
      await supabase.from('memory_implant_sequences').update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      }).eq('id', seq.id)
    }
  }

  return jsonOk({ ok: true, fired, errors, scanned_sequences: seqs.length })
})
