// auto-loophole-closer — when loophole-hunter finds a high/critical pattern,
// auto-execute the suggested_close as a Handler decree or punishment.
//
// Flow: cron picks open high/critical loopholes, asks a model to convert
// suggested_close into a structured action ({ kind: decree|punishment,
// title, body, deadline_hours, proof_type }), then writes the row, then
// marks the loophole status='closing' and logs the action.
//
// Closes the gap: until now, loophole findings sat in a table with no
// downstream action. Now they land as enforceable assignments.
//
// Cron every 4h. POST { user_id?: string }

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { callModel, selectModel } from '../_shared/model-tiers.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const HANDLER_USER_ID = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'

const CONVERTER_SYSTEM = `You convert a loophole finding into an enforceable Handler action.

Input: a loophole title + evidence + suggested_close.
Output: a structured action the protocol can execute as either a HANDLER DECREE (deadline + proof required) or a PUNISHMENT (penalty task with due_by).

Rules:
- The action TEXT is what THE USER will be commanded to do. It must be a thing a single person can fulfill in a few hours/days with a journal entry, photo, voice sample, message, post, call, or document. NOT a system change.
- DECREE if the close requires NEW behavior with proof (write 200 words on X, post Y, photo Z, voice sample). proof_type: 'photo' | 'audio' | 'text' | 'voice_pitch_sample' | 'journal_entry' | 'device_state'.
- PUNISHMENT if the close is consequence (extend chastity, compounding tax, write line N times that ATTACKS the dodge pattern). severity 1-5.
- The body MUST be plain English to a stranger. No internal jargon (no "denial day", "slip points", "the gates"). Lead with a concrete imperative verb addressed to her ("Post on Twitter…", "Send Gina a text saying…", "Submit a photo of…", "Record a 90-second voice memo where…").

REJECT (return JSON {"kind":"skip","rationale":"system change, not user action"}) when the suggested_close is actually a feature/policy proposal the user can't execute. Patterns to skip:
- Starts with system verbs: "Auto-charge", "Lock all app functions", "Develop X", "Implement Y", "Build Z", "Establish a", "Configure", "Eliminate the option to"
- Is a multi-clause governance memo: "Effective immediately: (1)… (2)…", "Going forward all X must Y", "Henceforth", "No extensions or exceptions"
- Is a conditional rule rather than a deadline-bearing task: "Any resistance must be followed by X within 24h" (rule, not action)
- References "system", "app function", "automation cascade", "reward system", "penalty cascade" as the agent
If the suggested_close is a system change, return skip — do NOT translate it into a user task.

- deadline_hours: typical 24-72. Severe loopholes 12-24.

Output JSON:
{
  "kind": "decree" | "punishment" | "skip",
  "title": "<=120 chars",
  "body": "the literal text she'll see — plain English, embodied, imperative addressed to her",
  "deadline_hours": <int>,
  "proof_type": "photo|audio|text|voice_pitch_sample|journal_entry|device_state|none",
  "severity": <int 1-5>,
  "rationale": "one sentence on why this seals the loophole, OR why skipped"
}`

interface ActionOut {
  kind: 'decree' | 'punishment'
  title: string
  body: string
  deadline_hours: number
  proof_type: string
  severity: number
  rationale: string
}

function safeJSON<T>(text: string): T | null {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  try { return JSON.parse(cleaned) as T } catch { /* fallthrough */ }
  const m = cleaned.match(/\{[\s\S]*\}/)
  if (m) { try { return JSON.parse(m[0]) as T } catch { return null } }
  return null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return new Response(JSON.stringify({ ok: false, error: 'POST only' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const supabase = createClient(supabaseUrl, serviceKey)

  let body: { user_id?: string; max?: number } = {}
  try { body = await req.json() } catch { /* allow empty */ }
  const userId = body.user_id || HANDLER_USER_ID
  const max = Math.max(1, Math.min(5, body.max ?? 3))

  // Pick top open high/critical loopholes that haven't been closed yet
  const { data: loopholes } = await supabase
    .from('loophole_findings')
    .select('id, loophole_title, pattern_evidence, suggested_close, severity')
    .eq('user_id', userId)
    .eq('status', 'open')
    .in('severity', ['high', 'critical'])
    .order('severity', { ascending: true })   // 'critical' < 'high' lex, but we just need topN deterministic
    .order('detected_at', { ascending: false })
    .limit(max)

  if (!loopholes || loopholes.length === 0) {
    return new Response(JSON.stringify({ ok: true, processed: 0, message: 'no open high/critical loopholes' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  let closedCount = 0
  const summary: Array<{ loophole: string; kind: string | null; action_id: string | null; error?: string }> = []

  for (const lh of loopholes as Array<{ id: string; loophole_title: string; pattern_evidence: string; suggested_close: string; severity: string }>) {
    try {
      const userPrompt = `LOOPHOLE TITLE: ${lh.loophole_title}\nEVIDENCE: ${lh.pattern_evidence}\nSUGGESTED CLOSE: ${lh.suggested_close}\nSEVERITY: ${lh.severity}\n\nConvert to enforceable action.`
      const r = await callModel(selectModel('decree_draft', { prefer: 'anthropic' }), {
        system: CONVERTER_SYSTEM, user: userPrompt, max_tokens: 600, temperature: 0.25, json: false,
      })
      const action = safeJSON<ActionOut>(r.text)
      if (!action || !action.kind || (!action.body && action.kind !== 'skip')) {
        summary.push({ loophole: lh.loophole_title, kind: null, action_id: null, error: 'unparseable' })
        continue
      }

      // The converter is allowed to refuse. Mark the loophole closed-without-action
      // and move on — better than synthesizing an unanswerable user task.
      // (loophole_findings columns: status, closed_via_id — there's no closed_at
      // or closed_by_action_kind, just the closed_via pointer.)
      if (action.kind === 'skip') {
        await supabase.from('loophole_findings').update({
          status: 'skipped_system_change',
        }).eq('id', lh.id)
        summary.push({ loophole: lh.loophole_title, kind: 'skip', action_id: null })
        continue
      }

      const deadlineHours = Math.max(6, Math.min(168, Number(action.deadline_hours) || 48))
      const due = new Date(Date.now() + deadlineHours * 3600_000).toISOString()

      let actionId: string | null = null
      if (action.kind === 'decree') {
        const { data: dec } = await supabase.from('handler_decrees').insert({
          user_id: userId,
          edict: action.body.slice(0, 1500),
          proof_type: action.proof_type || 'text',
          deadline: due,
          consequence: 'penalty if missed (auto-loophole-closer)',
          status: 'active',
          reasoning: `auto-loophole-closer · ${action.rationale?.slice(0, 200) ?? lh.loophole_title}`,
          trigger_source: `loophole:${lh.id}`,
        }).select('id').single()
        actionId = (dec as { id: string } | null)?.id ?? null
      } else {
        const { data: pun } = await supabase.from('punishment_queue').insert({
          user_id: userId,
          title: action.title.slice(0, 200),
          description: action.body.slice(0, 1500),
          due_by: due,
          severity: Math.max(1, Math.min(5, Number(action.severity) || 2)),
          status: 'queued',
          source: 'auto_loophole_closer',
        }).select('id').single()
        actionId = (pun as { id: string } | null)?.id ?? null
      }

      // Mark loophole as closing + audit
      await supabase.from('loophole_findings').update({
        status: 'closing',
        closed_via_id: actionId,
      }).eq('id', lh.id)
      await supabase.from('loophole_closer_log').insert({
        user_id: userId,
        loophole_id: lh.id,
        action_kind: action.kind,
        action_id: actionId,
        action_text: action.body.slice(0, 1000),
        created_by: r.model,
      })

      closedCount++
      summary.push({ loophole: lh.loophole_title, kind: action.kind, action_id: actionId })
    } catch (err) {
      summary.push({ loophole: lh.loophole_title, kind: null, action_id: null, error: err instanceof Error ? err.message : String(err) })
    }
  }

  return new Response(JSON.stringify({ ok: true, processed: loopholes.length, closed: closedCount, summary }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
