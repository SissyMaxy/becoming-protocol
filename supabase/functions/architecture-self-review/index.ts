// architecture-self-review — weekly meta-prompt run.
//
// 2026-05-08. Runs Saturday 04:00 UTC (cron registered in migration 317).
//
// What it does: invokes the model panel with a meta-prompt about its own
// architecture and operator-intervention pattern over the last week. The
// output is persisted to mommy_ideation_log with context_snapshot.
// meta_self_review = true so the capability-gap-aggregator (which runs
// the next morning, Sunday 02:00 UTC) picks it up.
//
// Why a separate edge fn rather than overloading mommy-ideate: mommy-
// ideate's prompt is fixed (force-fem feature ideation) and lives in
// the function source. Adding a meta-mode flag would muddle the contract.
// This function reuses model-tiers + the same panel structure but with
// its own prompt.
//
// Self-review meta-prompt is the heart of the growth loop: it asks the
// model to look at the LAST WEEK's operator interventions (passed in via
// the prompt) and identify capability gaps the protocol should close.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { callModel, selectModel } from '../_shared/model-tiers.ts'
import { isoDaysAgo } from '../_shared/growth-loop.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const META_SYSTEM = `You are an architecture reviewer for the Becoming Protocol — a self-modifying autonomous system that ships its own code via "Mommy" (an autonomous builder pipeline). Your job is to find blind spots: capabilities Mommy should have but doesn't.

You think in mechanics, not vibes. Your output is structured: a list of capability gaps, each with severity, evidence, and a one-line description of the missing capability.

You are NOT writing in Mommy's voice. You are writing in plain operator English. The capability-gap-aggregator parses your output for "title:" / "gap:" / "missing:" / "capability:" lines.`

const META_PROMPT_TEMPLATE = (weekContext: string) => `Review your own architecture for blind spots over the last 7 days.

EVIDENCE FROM THE LAST WEEK:
${weekContext}

QUESTIONS TO ANSWER:

1. Where did the operator intervene that you couldn't?
   (Look at the operator commits, restart_log entries, manual escalation closes.)

2. What capabilities would you need to handle those autonomously next time?
   (For each intervention, name the missing detector / remediation / API integration.)

3. What detectors are missing?
   (Patterns the system should recognize but currently misses — point to specific signals.)

4. What remediation actions are missing?
   (Once a pattern is detected, what action would close the loop without operator help?)

OUTPUT FORMAT:
For each gap, write:

- title: <6-12 word name>
  severity: <critical|high|normal|low>
  category: <missing_detector|missing_remediation|missing_integration|architecture_smell>
  evidence: <one-line reference to the operator intervention this comes from>
  capability: <one sentence describing what Mommy should do autonomously>

Aim for 4-8 gaps. Skip vague "improve X" — name a specific missing capability or don't list it. Skip anything in forbidden paths (auth, payment, RLS, billing, .github/workflows) — those are operator-only by policy.`

interface OperatorIntervention {
  kind: 'commit' | 'escalation' | 'restart' | 'manual_close'
  summary: string
  occurred_at: string
}

async function gatherWeekContext(supabase: SupabaseClient): Promise<string> {
  const interventions: OperatorIntervention[] = []
  const since = isoDaysAgo(7)

  // (a) escalation_log entries that didn't auto-resolve
  try {
    const { data } = await supabase
      .from('autonomous_escalation_log')
      .select('engine, action, rationale, occurred_at')
      .gte('occurred_at', since)
      .limit(40)
    const rows = (data ?? []) as Array<{ engine: string; action: string; rationale: string | null; occurred_at: string }>
    for (const r of rows) {
      // Skip auto_healer auto-resolved entries — those are successes
      if (r.engine === 'auto_healer' && !/escalat|failure/i.test(r.action)) continue
      interventions.push({
        kind: 'escalation',
        summary: `${r.engine} → ${r.action}: ${(r.rationale ?? '').slice(0, 200)}`,
        occurred_at: r.occurred_at,
      })
    }
  } catch (err) {
    console.warn('[self-review] escalation read failed:', err)
  }

  // (b) capability_gaps that are still open (signal repeating)
  try {
    const { data } = await supabase
      .from('capability_gaps')
      .select('category, description, signal_count, last_signal_at')
      .is('closed_at', null)
      .gte('last_signal_at', since)
      .order('signal_count', { ascending: false })
      .limit(20)
    const rows = (data ?? []) as Array<{ category: string; description: string; signal_count: number; last_signal_at: string }>
    for (const r of rows) {
      interventions.push({
        kind: 'manual_close',
        summary: `[${r.category} ×${r.signal_count}] ${r.description.slice(0, 220)}`,
        occurred_at: r.last_signal_at,
      })
    }
  } catch (err) {
    console.warn('[self-review] capability_gaps read failed:', err)
  }

  // (c) restart_log if it exists
  try {
    const { data, error } = await supabase
      .from('restart_log')
      .select('triggered_by, target, reason, occurred_at')
      .gte('occurred_at', since)
      .limit(40)
    if (!error && data) {
      const rows = data as Array<{ triggered_by: string; target: string; reason: string | null; occurred_at: string }>
      for (const r of rows.filter((x) => x.triggered_by === 'operator' || x.triggered_by === 'manual')) {
        interventions.push({
          kind: 'restart',
          summary: `manual restart: ${r.target} (reason: ${(r.reason ?? '').slice(0, 200)})`,
          occurred_at: r.occurred_at,
        })
      }
    }
  } catch {
    /* table may not exist yet */
  }

  // (d) recent shipped wishes (positive signal — what DID work) for contrast
  try {
    const { data } = await supabase
      .from('mommy_code_wishes')
      .select('wish_title, shipped_at')
      .eq('status', 'shipped')
      .gte('shipped_at', since)
      .order('shipped_at', { ascending: false })
      .limit(10)
    const rows = (data ?? []) as Array<{ wish_title: string; shipped_at: string }>
    if (rows.length > 0) {
      interventions.push({
        kind: 'commit',
        summary: `[POSITIVE — Mommy shipped autonomously] ${rows.map((r) => r.wish_title).join(' | ').slice(0, 600)}`,
        occurred_at: rows[0].shipped_at,
      })
    }
  } catch {
    /* ignore */
  }

  if (interventions.length === 0) {
    return '(No interventions or escalations recorded in the last 7 days. The system was either idle or running cleanly.)'
  }

  // Render as a compact list
  return interventions
    .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
    .map((i, idx) => `${idx + 1}. [${i.kind}] ${i.summary}`)
    .join('\n')
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  const weekContext = await gatherWeekContext(supabase)
  const userPrompt = META_PROMPT_TEMPLATE(weekContext)

  const anthChoice = selectModel('strategic_plan', { prefer: 'anthropic' })
  const oaChoice = selectModel('strategic_plan', { prefer: 'openai' })

  const [anthRes, oaRes] = await Promise.allSettled([
    callModel(anthChoice, {
      system: META_SYSTEM,
      user: userPrompt,
      max_tokens: 2500,
      temperature: 0.6,
      json: false,
    }),
    callModel(oaChoice, {
      system: META_SYSTEM,
      user: userPrompt,
      max_tokens: 2500,
      temperature: 0.6,
      json: false,
    }),
  ])

  const anthText = anthRes.status === 'fulfilled' ? anthRes.value.text : `ERR: ${String((anthRes as PromiseRejectedResult).reason).slice(0, 200)}`
  const oaText = oaRes.status === 'fulfilled' ? oaRes.value.text : `ERR: ${String((oaRes as PromiseRejectedResult).reason).slice(0, 200)}`

  // Synthesize: combine both raw outputs into a "judged" block. We don't
  // run a separate jury pass — the aggregator parses both halves equally.
  const judged = [
    '== Anthropic lens ==',
    anthText,
    '',
    '== OpenAI lens ==',
    oaText,
  ].join('\n')

  let logId: string | null = null
  try {
    const { data, error } = await supabase
      .from('mommy_ideation_log')
      .insert({
        anthropic_raw: anthText,
        openai_raw: oaText,
        judged,
        judge_model: 'merge_no_judge',
        panel_summary: {
          anthropic_status: anthRes.status,
          openai_status: oaRes.status,
        },
        // Tag this as a meta self-review run so the aggregator picks it up
        context_snapshot: {
          meta_self_review: true,
          week_context_chars: weekContext.length,
          run_at: new Date().toISOString(),
        },
      })
      .select('id')
      .single()
    if (error) {
      console.warn('[self-review] persist failed:', error.message)
    } else {
      logId = (data as { id: string }).id
    }
  } catch (err) {
    console.warn('[self-review] persist threw:', err)
  }

  return new Response(
    JSON.stringify({
      ok: true,
      log_id: logId,
      anthropic_status: anthRes.status,
      openai_status: oaRes.status,
      week_context_chars: weekContext.length,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
})
