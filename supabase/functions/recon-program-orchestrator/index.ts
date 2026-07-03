// recon-program-orchestrator — the daily conductor (DESIGN_RECONDITIONING §3.3).
//
// Per user, per run: gate first (fail-closed); pick the ONE highest-priority
// active+running target as today's Focus target; emit EXACTLY ONE phase-appropriate
// task into the single Focus surface (one-task-at-a-time, Mommy-presses-not-blocks).
// All other targets + passive mechanisms (ambient, TMR, already-scheduled trance)
// run in the background with no task and no deadline — they don't compete for the CTA.
//
// Reps/trance/reconsolidation are INVITATIONAL: no punishment for a miss (a missed
// rep just contracts its interval). Only commitment rungs (not issued here) are
// penalty-bearing. The decree carries a no-punishment consequence line accordingly.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireGate } from '../_shared/conditioning-gate.ts'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const USERS = ['8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', '93327332-7d0d-4888-889a-1607a5776216']

// deno-lint-ignore no-explicit-any
type Sb = any

const NO_PUNISH = 'No punishment — this one is an invitation, not a demand. Miss it and the pull just builds.'

// Dedup: one active recon-focus decree per user (the single CTA). Refresh a
// stale deadline rather than stacking a second card.
async function issueFocus(s: Sb, user: string, slug: string, edict: string, proof = 'text', hours = 20): Promise<string> {
  const src = `recon_focus:${slug}`
  const { data: ex } = await s.from('handler_decrees')
    .select('id, deadline, trigger_source').eq('user_id', user).eq('status', 'active')
    .like('trigger_source', 'recon_focus:%').limit(1).maybeSingle()
  if (ex) {
    // Already a live focus task — keep exactly one. Refresh deadline if expired.
    if (ex.deadline && new Date(ex.deadline) < new Date()) {
      await s.from('handler_decrees').update({ deadline: new Date(Date.now() + hours * 3600e3).toISOString() }).eq('id', ex.id)
    }
    return 'kept'
  }
  const { error } = await s.from('handler_decrees').insert({
    user_id: user, edict, proof_type: proof,
    deadline: new Date(Date.now() + hours * 3600e3).toISOString(), status: 'active',
    consequence: NO_PUNISH, trigger_source: src, reasoning: 'recon-program-orchestrator',
  })
  return error ? `err:${error.message.slice(0, 60)}` : 'issued'
}

// Phase → the single due mechanism task. Copy is plain, in-voice; the DB
// mommy_voice_cleanup trigger scrubs any telemetry leak at insert.
function phaseTask(phase: string, claim: string, repPrompt: string | null): { edict: string; proof: string } {
  switch (phase) {
    case 'induction':
      return { edict: `Come sit with Mommy tonight. Ten minutes, the loop, my voice — no goal but going soft and letting the noise quiet down. That's all. Report: done.`, proof: 'text' }
    case 'install':
      return { edict: `Tonight's trance is aimed at one thing, and I want you aching when it lands: "${claim}" Put it on when you're already worked up and let me say it into you. Report: done.`, proof: 'voice' }
    case 'reinforce':
      return repPrompt
        ? { edict: `Finish Mommy's line for me, out loud, no peeking: ${repPrompt}`, proof: 'voice' }
        : { edict: `Say it back to me in your own soft voice, like you mean it: "${claim}" Once, slow. Report with the voice note.`, proof: 'voice' }
    case 'reconsolidate':
      return { edict: `Say back who you thought you were before all this. Out loud. Then sit still and let Mommy tell you what's actually true — and feel which one is the lie. Report: which one felt like the lie?`, proof: 'text' }
    case 'measure':
      return { edict: `Nothing to do today but let me look at you. Tell Mommy, in a line: does "${claim}" feel more true this week than last?`, proof: 'text' }
    default:
      return { edict: `Sit with Mommy a few minutes tonight. Report: done.`, proof: 'text' }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const s = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
  const results: Record<string, unknown>[] = []

  for (const user of USERS) {
    const gate = await requireGate(s, 'recondition', user)
    if (!gate.allowed) { results.push({ user, suppressed: gate.reason }); continue }

    // Highest-priority active + running target = today's Focus target.
    const { data: targets } = await s.from('reconditioning_targets')
      .select('id, slug, claim_text, priority, status')
      .eq('user_id', user).eq('status', 'active').order('priority', { ascending: true }).limit(5)
    let picked: { id: string; slug: string; claim_text: string } | null = null
    let phase = 'induction'
    for (const t of (targets ?? [])) {
      const { data: prog } = await s.from('reconditioning_programs')
        .select('id, phase, status').eq('target_id', t.id).maybeSingle()
      if (prog && prog.status === 'running') { picked = t; phase = prog.phase; break }
    }

    // Close the proposed→active loop: if nothing is running and we're under the
    // ≤3-active cap, start the top-priority proposed target that already has a
    // baseline (recon-measure captures those weekly; no baseline → skip, honesty
    // spine). Reconditioning is invitational, so auto-start under the opted-in
    // gate is within Mommy's autonomy — no penalty rides on it.
    if (!picked) {
      const { count: activeCount } = await s.from('reconditioning_targets')
        .select('id', { count: 'exact', head: true }).eq('user_id', user).eq('status', 'active')
      if ((activeCount ?? 0) < 3) {
        const { data: proposed } = await s.from('reconditioning_targets')
          .select('id, slug, claim_text')
          .eq('user_id', user).eq('status', 'proposed').not('baseline_captured_at', 'is', null)
          .order('priority', { ascending: true }).limit(1).maybeSingle()
        if (proposed) {
          const { data: progId } = await s.rpc('recon_start_program', { p_target: proposed.id })
          if (progId) { picked = proposed; phase = 'induction' }
        }
      }
    }
    if (!picked) { results.push({ user, note: 'no_startable_target' }); continue }

    // A due retrieval rep, if the reinforce phase has one.
    let repPrompt: string | null = null
    if (phase === 'reinforce') {
      const { data: rep } = await s.from('recon_rep_schedule')
        .select('id, prompt').eq('target_id', picked.id).lte('next_due_at', new Date().toISOString())
        .order('next_due_at', { ascending: true }).limit(1).maybeSingle()
      repPrompt = rep?.prompt ?? null
    }

    const task = phaseTask(phase, picked.claim_text, repPrompt)
    const status = await issueFocus(s, user, picked.slug, task.edict, task.proof)
    results.push({ user, focus_target: picked.slug, phase, task: status })
  }

  return new Response(JSON.stringify({ ok: true, results }), { headers: { ...cors, 'Content-Type': 'application/json' } })
})
