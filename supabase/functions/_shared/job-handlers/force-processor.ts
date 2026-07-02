// Force processor — job handler. Used to be the force-processor edge function.
// Single tick that catches missed doses, dodged punishments, hard-mode exits,
// chastity expiries, content_calendar promotion, and workout streak
// bookkeeping. Single action — `force-processor:run`.
//
// 2026-07-01: all Gina-disclosure enforcement removed (missed-deadline
// punishments, deferred-deadline re-opening, the disclosure de-escalation
// requirement). Policy: nothing is ever disclosed to Gina and no mechanism
// may pressure toward it (migration 624).
//
// 2026-07-01 (Enforcement Spine v2, migs 627-630):
//   - enforcement_gate at the top of every penalty path, FAIL-CLOSED: a gate
//     error reads as paused, and nothing punitive runs.
//   - dose/workout slips flow THROUGH the obligation ledger: the obligation
//     must be genuinely surfaced and transitioned to missed (evidence row
//     attached) before any slip/punishment lands.
//   - dodge processing is the re-arm/commutation model: dodge 1 re-arms once
//     (+24h), dodge 2 commutes (terminal). No third dodge exists. Unlock
//     dates move only via push_unlock_date() (chain-capped).
//   - per-tick synthetic-slip cap.
import { type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { enforcementGate, nextDodgeAction } from '../enforcement-core.ts'

const MAX_SYNTHETIC_SLIPS_PER_TICK = 5

interface ObligationRow {
  id: string
  status: string
  surfaced_at: string | null
}

async function getObligation(
  supa: SupabaseClient,
  sourceTable: string,
  sourceId: string,
): Promise<ObligationRow | null> {
  const { data, error } = await supa
    .from('obligations')
    .select('id, status, surfaced_at')
    .eq('source_table', sourceTable)
    .eq('source_id', sourceId)
    .maybeSingle()
  if (error) {
    console.error(`[force-processor] obligation lookup ${sourceTable}/${sourceId}: ${error.message}`)
    return null
  }
  return (data as ObligationRow | null) ?? null
}

// Walk a live obligation to 'missed' with the source row as evidence.
// Returns true only when the row genuinely lands in a penalizable state.
async function driveToMissed(
  supa: SupabaseClient,
  oblig: ObligationRow,
  evidenceTable: string,
  evidenceId: string,
): Promise<boolean> {
  let status = oblig.status
  if (status === 'surfaced') {
    const { error } = await supa.rpc('obligation_transition', {
      p_obligation: oblig.id, p_to: 'due', p_via: 'force_processor',
    })
    if (error) { console.error(`[force-processor] ->due: ${error.message}`); return false }
    status = 'due'
  }
  if (status === 'due') {
    const { error } = await supa.rpc('obligation_transition', {
      p_obligation: oblig.id, p_to: 'missed', p_via: 'force_processor',
      p_evidence_table: evidenceTable, p_evidence_id: evidenceId,
    })
    if (error) { console.error(`[force-processor] ->missed: ${error.message}`); return false }
    const { data } = await supa.from('obligations').select('status').eq('id', oblig.id).maybeSingle()
    status = (data as { status?: string } | null)?.status ?? status
  }
  return status === 'missed' || status === 'consequence_previewed' || status === 'consequence_fired'
}

async function fireInternalConsequence(supa: SupabaseClient, obligationId: string): Promise<void> {
  // missed -> consequence_previewed -> consequence_fired (audit row is
  // written inside the transition fn, same transaction).
  const { error: e1 } = await supa.rpc('obligation_transition', {
    p_obligation: obligationId, p_to: 'consequence_previewed', p_via: 'force_processor',
  })
  if (e1) { console.error(`[force-processor] ->previewed: ${e1.message}`); return }
  const { error: e2 } = await supa.rpc('obligation_transition', {
    p_obligation: obligationId, p_to: 'consequence_fired', p_via: 'force_processor',
  })
  if (e2) console.error(`[force-processor] ->fired: ${e2.message}`)
}

export async function runForceProcessor(
  supa: SupabaseClient,
): Promise<Record<string, unknown>> {
    const now = new Date()
    const nowIso = now.toISOString()
    const graceCutoff = new Date(now.getTime() - 2 * 3600000).toISOString()
    const today = nowIso.split('T')[0]

    // Gate cache — fail-closed per user for the whole tick.
    const gateCache = new Map<string, boolean>()
    const gateActive = async (userId: string): Promise<boolean> => {
      if (gateCache.has(userId)) return gateCache.get(userId)!
      const gate = await enforcementGate(
        (fn, args) => supa.rpc(fn, args).then(r => ({ data: r.data, error: r.error })),
        userId,
      )
      const ok = gate.mode === 'active'
      gateCache.set(userId, ok)
      return ok
    }

    // Per-tick synthetic slip cap.
    const slipCount = new Map<string, number>()
    const underSlipCap = (userId: string): boolean =>
      (slipCount.get(userId) ?? 0) < MAX_SYNTHETIC_SLIPS_PER_TICK
    const countSlip = (userId: string) => slipCount.set(userId, (slipCount.get(userId) ?? 0) + 1)

    // 1. Missed doses → obligation missed → slip + punishment
    const { data: missedDoses } = await supa
      .from('dose_log')
      .select('id, user_id, scheduled_at')
      .is('taken_at', null)
      .eq('skipped', false)
      .is('triggered_slip_id', null)
      .lt('scheduled_at', graceCutoff)
      .limit(200)

    for (const d of missedDoses || []) {
      const userId = (d as any).user_id as string
      const doseId = (d as any).id as string
      if (!(await gateActive(userId))) continue

      const oblig = await getObligation(supa, 'dose_log', doseId)
      if (!oblig || ['voided', 'cancelled_system', 'cancelled_user'].includes(oblig.status)) {
        // Penalty permanently dead (never surfaced / cancelled). Close the
        // dose row out so it stops re-processing every tick.
        const { error } = await supa
          .from('dose_log')
          .update({ skipped: true, skip_reason: 'obligation_voided_unsurfaced' })
          .eq('id', doseId)
        if (error) console.error(`[force-processor] dose close-out: ${error.message}`)
        continue
      }
      if (oblig.status === 'filed') continue // not yet surfaced — guarantor/miss-processor decides

      const missed = oblig.status === 'missed' || (await driveToMissed(supa, oblig, 'dose_log', doseId))
      if (!missed || !underSlipCap(userId)) continue

      const lateMin = Math.round((now.getTime() - new Date((d as any).scheduled_at).getTime()) / 60000)
      const { data: slip, error: slipErr } = await supa
        .from('slip_log')
        .insert({
          user_id: userId,
          slip_type: 'hrt_dose_missed',
          slip_points: 4,
          source_text: `Missed dose ${lateMin}min late`,
          source_table: 'dose_log',
          source_id: doseId,
          is_synthetic: true,
          obligation_id: oblig.id,
        })
        .select('id')
        .single()
      if (slipErr) { console.error(`[force-processor] dose slip: ${slipErr.message}`); continue }
      countSlip(userId)

      if (slip) {
        const { error: doseErr } = await supa
          .from('dose_log')
          .update({ late_by_minutes: lateMin, triggered_slip_id: (slip as any).id })
          .eq('id', doseId)
        if (doseErr) console.error(`[force-processor] dose update: ${doseErr.message}`)

        const { error: punErr } = await supa.from('punishment_queue').insert({
          user_id: userId,
          punishment_type: 'mantra_recitation',
          severity: 1,
          title: 'Recite Maxy mantra 50 times',
          description: 'Missed a dose. 50 mantra recitations before you sleep.',
          parameters: { repetitions: 50 },
          due_by: new Date(now.getTime() + 16 * 3600000).toISOString(),
          triggered_by_slip_ids: [(slip as any).id],
          obligation_id: oblig.id,
        })
        if (punErr) console.error(`[force-processor] dose punishment: ${punErr.message}`)

        await fireInternalConsequence(supa, oblig.id)
      }
    }

    // 2. Dodged punishments → re-arm once, then commute. Terminal at 2.
    const { data: dodged } = await supa
      .from('punishment_queue')
      .select('id, user_id, punishment_type, severity, title, description, parameters, dodge_count')
      .eq('status', 'queued')
      .not('due_by', 'is', null)
      .lt('due_by', nowIso)
      .limit(100)

    let commuted = 0
    for (const p of dodged || []) {
      const userId = (p as any).user_id as string
      const punId = (p as any).id as string
      const params = ((p as any).parameters ?? {}) as Record<string, unknown>
      // De-escalation tasks carry no sub-penalties: reschedule quietly.
      if (params.is_deescalation === true || params.is_deescalation === 'true') {
        const { error } = await supa
          .from('punishment_queue')
          .update({ due_by: new Date(now.getTime() + 24 * 3600000).toISOString() })
          .eq('id', punId)
        if (error) console.error(`[force-processor] de-esc reschedule: ${error.message}`)
        continue
      }
      if (!(await gateActive(userId))) continue

      const oblig = await getObligation(supa, 'punishment_queue', punId)
      if (!oblig || ['voided', 'cancelled_system', 'cancelled_user'].includes(oblig.status)) {
        // Never surfaced → the punishment can't be dodged, only dead.
        const { error } = await supa
          .from('punishment_queue')
          .update({
            status: 'cancelled',
            completion_evidence: { cancelled_reason: 'obligation_voided_unsurfaced' },
          })
          .eq('id', punId)
        if (error) console.error(`[force-processor] dodge cancel: ${error.message}`)
        continue
      }
      if (oblig.status === 'filed' || !oblig.surfaced_at) continue // not yet surfaced

      const dodge = nextDodgeAction(((p as any).dodge_count as number) || 0)
      if (dodge.action === 'none') {
        // dodge_count >= 2 but still queued (shouldn't happen post-629) —
        // commute defensively without further penalty.
        const { error } = await supa
          .from('punishment_queue')
          .update({ status: 'commuted' })
          .eq('id', punId)
        if (error) console.error(`[force-processor] defensive commute: ${error.message}`)
        continue
      }

      // The punishment's own obligation goes missed (evidence: the row).
      const missedOk = oblig.status === 'missed' || (await driveToMissed(supa, oblig, 'punishment_queue', punId))
      if (!missedOk) continue

      if (dodge.action === 'rearm') {
        const { error: upErr } = await supa
          .from('punishment_queue')
          .update({
            dodge_count: dodge.newDodgeCount,
            due_by: new Date(now.getTime() + dodge.rescheduleHours * 3600000).toISOString(),
          })
          .eq('id', punId)
        if (upErr) { console.error(`[force-processor] rearm: ${upErr.message}`); continue }

        const { error: dodgeErr } = await supa.rpc('record_punishment_dodge', {
          p_punishment: punId, p_dodge: 1,
        })
        if (dodgeErr) console.error(`[force-processor] record dodge 1: ${dodgeErr.message}`)

        // ONE slip on the first dodge only (the old per-tick re-fire loop is
        // exactly the noise mig 629 purged).
        if (underSlipCap(userId)) {
          const { error: slipErr } = await supa.from('slip_log').insert({
            user_id: userId,
            slip_type: 'task_avoided',
            slip_points: 3,
            source_text: `Dodged punishment: ${(p as any).punishment_type}`,
            metadata: { punishment_id: punId, dodge_count: 1 },
            is_synthetic: true,
            obligation_id: oblig.id,
          })
          if (slipErr) console.error(`[force-processor] dodge slip: ${slipErr.message}`)
          else countSlip(userId)
        }

        const { error: outErr } = await supa.from('handler_outreach_queue').insert({
          user_id: userId,
          message: `You let a punishment slide past its deadline: ${(p as any).title}. It re-armed once — 24 more hours. If it slides again it gets commuted: a harder replacement, plus up to 2 days on your unlock date.`,
          urgency: 'high',
          trigger_reason: `punishment_dodge_rearm:${punId}`,
          source: 'force_processor',
          kind: 'penalty_preview_reminder',
          scheduled_for: nowIso,
          expires_at: new Date(now.getTime() + 24 * 3600000).toISOString(),
        })
        if (outErr) console.error(`[force-processor] rearm outreach: ${outErr.message}`)
      } else {
        // Commutation — terminal. One unlock push, one harder replacement.
        const { error: upErr } = await supa
          .from('punishment_queue')
          .update({
            status: 'commuted',
            dodge_count: dodge.newDodgeCount,
            completion_evidence: { commuted_reason: 'second dodge — terminal' },
          })
          .eq('id', punId)
        if (upErr) { console.error(`[force-processor] commute: ${upErr.message}`); continue }
        commuted++

        const { error: dodgeErr } = await supa.rpc('record_punishment_dodge', {
          p_punishment: punId, p_dodge: 2,
        })
        if (dodgeErr) console.error(`[force-processor] record dodge 2: ${dodgeErr.message}`)

        const { error: pushErr } = await supa.rpc('push_unlock_date', {
          p_user: userId, p_obligation: oblig.id, p_days: dodge.unlockPushDays,
        })
        if (pushErr) console.error(`[force-processor] unlock push: ${pushErr.message}`)

        // Fire the original obligation's consequence exactly once.
        await fireInternalConsequence(supa, oblig.id)

        // Harder replacement — a NEW punishment, which auto-files its own
        // surfaced-before-penalized obligation via the DB trigger.
        const { error: repErr } = await supa.from('punishment_queue').insert({
          user_id: userId,
          punishment_type: (p as any).punishment_type,
          severity: Math.min(5, (((p as any).severity as number) || 1) + 1),
          title: `Commuted replacement: ${(p as any).title}`,
          description: `You dodged this twice, so it grew. ${(p as any).description ?? ''}`.trim(),
          parameters: { ...params, commuted_from: punId },
          due_by: new Date(now.getTime() + 24 * 3600000).toISOString(),
          obligation_id: oblig.id,
        })
        if (repErr) console.error(`[force-processor] replacement punishment: ${repErr.message}`)

        const { error: logErr } = await supa.from('mommy_supervisor_log').insert({
          component: 'force_processor',
          severity: 'info',
          event_kind: 'dodge_commuted',
          message: `Punishment commuted after second dodge: ${(p as any).title}`,
          context_data: { punishment_id: punId, user_id: userId, obligation_id: oblig.id },
        })
        if (logErr) console.error(`[force-processor] commute log: ${logErr.message}`)
      }
    }

    // 3. (removed 2026-07-01) Missed Gina disclosure deadlines — the
    // disclosure ladder is abolished; no deadline exists to miss.

    // 4. Hard Mode active without exit task → auto-create one
    const { data: hardModeUsers } = await supa
      .from('user_state')
      .select('user_id, hard_mode_entered_at, hard_mode_exit_task_id')
      .eq('hard_mode_active', true)
      .is('hard_mode_exit_task_id', null)
      .limit(50)

    for (const u of hardModeUsers || []) {
      const userId = (u as any).user_id
      const dueBy = new Date(now.getTime() + 24 * 3600000).toISOString()

      // Split into separate tasks so Maxy can complete each via its
      // correct UI and see granular progress. The de-escalation set (design
      // §2, Gina disclosure REPLACED 2026-07-01): 800-word confession + 100
      // mantra recitations + one proof-bearing decree of Mommy's choice.
      // All carry is_deescalation → kind 'hard_mode_exit', consequence
      // 'internal', NO sub-penalties (dodging only reschedules).
      const { data: confessionTask, error: deEsc1Err } = await supa
        .from('punishment_queue')
        .insert({
          user_id: userId,
          punishment_type: 'confession_extended',
          severity: 3,
          title: 'DE-ESCALATION 1/3: 800-word confession',
          description: 'Hard Mode exit requires all three of these tasks. Shame journal, 800 words minimum, on what you slipped on and why the system punishes you.',
          parameters: { min_words: 800, is_deescalation: true },
          due_by: dueBy,
          triggered_by_hard_mode: true,
        })
        .select('id')
        .single()
      if (deEsc1Err) console.error(`[force-processor] de-esc 1/3: ${deEsc1Err.message}`)

      const { error: deEsc2Err } = await supa.from('punishment_queue').insert({
        user_id: userId,
        punishment_type: 'mantra_recitation',
        severity: 3,
        title: 'DE-ESCALATION 2/3: 100 mantra recitations',
        description: 'Hard Mode exit requires all three of these tasks. Recite "I am Maxy. David is gone." 100 times, logged.', // pattern-lint: ok — quoted protocol-mandated punishment line (registered in mandated_texts)
        parameters: { repetitions: 100, is_deescalation: true, text: 'I am Maxy. David is gone.' },
        due_by: dueBy,
        triggered_by_hard_mode: true,
      })
      if (deEsc2Err) console.error(`[force-processor] de-esc 2/3: ${deEsc2Err.message}`)

      // 3/3: one proof-bearing decree of Mommy's choice (embodied, not
      // clerical — photo proof). No consequence text: missing it carries no
      // sub-penalty, Hard Mode simply stays on.
      const { error: deEsc3Err } = await supa.from('handler_decrees').insert({
        user_id: userId,
        edict: 'DE-ESCALATION 3/3: one full feminine presentation — outfit on, photo submitted. Hard Mode exit requires all three de-escalation tasks.',
        proof_type: 'photo',
        deadline: dueBy,
        consequence: 'No added penalty. Hard Mode stays on until this is done.',
        reasoning: 'Hard Mode de-escalation set 3/3 (proof-bearing decree).',
        trigger_source: 'hard_mode_deescalation',
        status: 'active',
      })
      if (deEsc3Err) console.error(`[force-processor] de-esc 3/3: ${deEsc3Err.message}`)

      if (confessionTask) {
        // The confession task is the anchor. Exit check reads entered_at and
        // verifies both subrequirements met since then (regardless of which
        // specific task row completed).
        await supa
          .from('user_state')
          .update({ hard_mode_exit_task_id: (confessionTask as any).id })
          .eq('user_id', userId)
      }
    }

    // 5. Completed de-escalation tasks → check both sub-requirements before exit
    const { data: completedDeEsc } = await supa
      .from('punishment_queue')
      .select('id, user_id, completed_at, completion_evidence, parameters')
      .eq('triggered_by_hard_mode', true)
      .eq('status', 'completed')
      .not('completed_at', 'is', null)
      .gt('completed_at', new Date(now.getTime() - 60 * 60000).toISOString())
      .limit(50)

    for (const t of completedDeEsc || []) {
      const { data: state } = await supa
        .from('user_state')
        .select('hard_mode_exit_task_id, hard_mode_entered_at')
        .eq('user_id', (t as any).user_id)
        .maybeSingle()
      if (!state || (state as any).hard_mode_exit_task_id !== (t as any).id) continue

      // Verify both de-escalation requirements satisfied since Hard Mode entry
      const enteredAt = (state as any).hard_mode_entered_at || new Date(0).toISOString()

      // 1. Confession ≥800 words logged to shame_journal
      const { data: confessions } = await supa
        .from('shame_journal')
        .select('entry_text')
        .eq('user_id', (t as any).user_id)
        .gte('created_at', enteredAt)
      const confessionMet = (confessions || []).some((c: any) => {
        const words = ((c.entry_text as string) || '').trim().split(/\s+/).filter(Boolean).length
        return words >= 800
      })

      // 2. Mantra recitations ≥100 (from a completed punishment since Hard Mode entry)
      const { data: mantras } = await supa
        .from('punishment_queue')
        .select('parameters, completion_evidence, completed_at')
        .eq('user_id', (t as any).user_id)
        .eq('punishment_type', 'mantra_recitation')
        .eq('status', 'completed')
        .gte('completed_at', enteredAt)
      const mantraMet = (mantras || []).some((m: any) => {
        const logged = (m.completion_evidence?.repetitions_logged as number) ?? 0
        const target = (m.parameters?.repetitions as number) ?? 0
        return logged >= 100 && logged >= target
      })

      // 3. One proof-bearing de-escalation decree fulfilled since entry.
      // (Replaced the Gina disclosure requirement — removed 2026-07-01.)
      const { data: deEscDecrees } = await supa
        .from('handler_decrees')
        .select('id')
        .eq('user_id', (t as any).user_id)
        .eq('trigger_source', 'hard_mode_deescalation')
        .eq('status', 'fulfilled')
        .gte('fulfilled_at', enteredAt)
        .limit(1)
      const decreeMet = (deEscDecrees || []).length > 0

      if (confessionMet && mantraMet && decreeMet) {
        await supa
          .from('user_state')
          .update({
            hard_mode_active: false,
            hard_mode_exit_task_id: null,
          })
          .eq('user_id', (t as any).user_id)
        await supa.from('hard_mode_transitions').insert({
          user_id: (t as any).user_id,
          transition: 'exited',
          reason: 'De-escalation set complete: 800-word confession + 100+ mantras + proof-bearing decree',
          exit_task_completed_id: (t as any).id,
        })
        // Auto-complete sibling de-escalation tasks so UI isn't misleading
        await supa
          .from('punishment_queue')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            completion_evidence: { auto_completed: 'sibling_deescalation_tasks_exit' },
          })
          .eq('user_id', (t as any).user_id)
          .eq('triggered_by_hard_mode', true)
          .neq('status', 'completed')
      } else {
        // Re-open the task, note which parts are still missing
        const missing: string[] = []
        if (!confessionMet) missing.push('800-word confession')
        if (!mantraMet) missing.push('100 mantras')
        if (!decreeMet) missing.push('proof-bearing decree')
        await supa
          .from('punishment_queue')
          .update({
            status: 'queued',
            completed_at: null,
            description: `DE-ESCALATION — still missing: ${missing.join(', ')}. Hard Mode stays active until all three are done.`,
            due_by: new Date(now.getTime() + 12 * 3600000).toISOString(),
          })
          .eq('id', (t as any).id)
      }
    }

    // 5b. Stale Lovense devices → flip is_connected=false when no heartbeat in 10min
    const staleCutoff = new Date(now.getTime() - 10 * 60 * 1000).toISOString()
    const { data: staleDevices } = await supa
      .from('lovense_devices')
      .select('id')
      .eq('is_connected', true)
      .lt('last_seen_at', staleCutoff)
      .limit(200)

    if (staleDevices && staleDevices.length > 0) {
      await supa
        .from('lovense_devices')
        .update({ is_connected: false })
        .in('id', (staleDevices as Array<{ id: string }>).map(d => d.id))
    }

    // 5c. (removed 2026-07-01) Deferred Gina disclosures re-opening — the
    // disclosure ladder is abolished; nothing gets re-pressured.

    // 5d. Chastity streak milestones → log achievement + queue Handler outreach
    const MILESTONES = [7, 14, 30, 60, 90, 180, 365]
    const { data: streakStates } = await supa
      .from('user_state')
      .select('user_id, chastity_streak_days')
      .gt('chastity_streak_days', 0)
      .limit(200)

    for (const s of streakStates || []) {
      const streak = (s as any).chastity_streak_days as number
      const userId = (s as any).user_id as string
      for (const m of MILESTONES) {
        if (streak < m) continue
        // Check if we've already recorded this milestone
        const { data: existing } = await supa
          .from('chastity_milestones')
          .select('id')
          .eq('user_id', userId)
          .eq('milestone_days', m)
          .maybeSingle()
        if (existing) continue

        // Record + queue outreach
        await supa.from('chastity_milestones').insert({
          user_id: userId,
          milestone_days: m,
          streak_at_achievement: streak,
          handler_notified: true,
        })

        const label = m >= 365 ? `${Math.floor(m / 365)} year` : m >= 30 ? `${Math.floor(m / 30)} month` : `${m} day`
        await supa.from('handler_outreach_queue').insert({
          user_id: userId,
          message: `Chastity milestone: ${label}${m >= 30 ? 's' : ''} locked. Day ${streak}. That's not nothing — that's real conditioning locked into your body. I want a confession about what this streak has changed in you. Five minutes. Then we discuss what the next milestone demands.`,
          urgency: 'high',
          trigger_reason: `chastity_milestone_${m}`,
          scheduled_for: new Date().toISOString(),
        })

        await supa.from('handler_memory').insert({
          user_id: userId,
          memory_type: 'commitment_history',
          content: `Chastity milestone achieved: ${m} days locked (actual streak ${streak}). Reference this as proof of her capacity for sustained denial.`,
          importance: m >= 90 ? 5 : m >= 30 ? 4 : 3,
          source_type: 'chastity_milestone',
        })
      }
    }

    // 6. Scheduled chastity unlocks whose time has passed → expire
    const { data: expiredLocks } = await supa
      .from('chastity_sessions')
      .select('id, user_id')
      .eq('status', 'locked')
      .lt('scheduled_unlock_at', nowIso)
      .limit(100)

    for (const s of expiredLocks || []) {
      await supa
        .from('chastity_sessions')
        .update({
          status: 'expired_pending_relock',
          actual_unlock_at: nowIso,
          unlock_authority: 'expired',
        })
        .eq('id', (s as any).id)
      await supa
        .from('user_state')
        .update({
          chastity_locked: false,
          chastity_current_session_id: null,
          chastity_scheduled_unlock_at: null,
        })
        .eq('user_id', (s as any).user_id)
    }

    // 7. Auto-approve and queue content_calendar drafts scheduled for today
    const { data: draftContent } = await supa
      .from('content_calendar')
      .select('id, user_id, platform, content_type, draft_content, theme, scheduled_date')
      .eq('status', 'draft')
      .lte('scheduled_date', today)
      .limit(50)

    let contentQueued = 0
    for (const draft of draftContent || []) {
      const d = draft as any
      // Auto-approve and insert into ai_generated_content for the auto-poster
      const { data: inserted } = await supa.from('ai_generated_content').insert({
        user_id: d.user_id,
        platform: d.platform,
        content: d.draft_content,
        content_type: d.content_type || 'tweet',
        status: 'scheduled',
        scheduled_at: nowIso,
        generation_strategy: `content_calendar_${d.theme}`,
        target_hashtags: [],
      }).select('id').single()

      if (inserted) {
        await supa.from('content_calendar').update({
          status: 'scheduled',
          final_content: d.draft_content,
          posted_content_id: (inserted as any).id,
        }).eq('id', d.id)
        contentQueued++
      }
    }

    // 8. Update content_performance from posted content (last 24h)
    const { data: recentPosts } = await supa
      .from('ai_generated_content')
      .select('user_id, platform, generation_strategy, engagement_likes, engagement_comments, engagement_shares, content')
      .eq('status', 'posted')
      .gte('posted_at', new Date(now.getTime() - 24 * 3600000).toISOString())
      .not('generation_strategy', 'is', null)
      .limit(200)

    for (const post of recentPosts || []) {
      const p = post as any
      const theme = (p.generation_strategy as string || '').replace('content_calendar_', '')
      if (!theme || theme === p.generation_strategy) continue

      const { data: existing } = await supa
        .from('content_performance')
        .select('id, avg_likes, avg_comments, avg_shares, sample_count, best_performing_content')
        .eq('user_id', p.user_id)
        .eq('platform', p.platform)
        .eq('theme', theme)
        .maybeSingle()

      const likes = (p.engagement_likes as number) || 0
      const comments = (p.engagement_comments as number) || 0
      const shares = (p.engagement_shares as number) || 0

      if (existing) {
        const n = (existing as any).sample_count + 1
        const newAvgLikes = (((existing as any).avg_likes * (existing as any).sample_count) + likes) / n
        const newAvgComments = (((existing as any).avg_comments * (existing as any).sample_count) + comments) / n
        const newAvgShares = (((existing as any).avg_shares * (existing as any).sample_count) + shares) / n
        const best = likes > ((existing as any).avg_likes * 1.5)
          ? (p.content as string).slice(0, 300)
          : (existing as any).best_performing_content
        await supa.from('content_performance').update({
          avg_likes: newAvgLikes,
          avg_comments: newAvgComments,
          avg_shares: newAvgShares,
          sample_count: n,
          best_performing_content: best,
          updated_at: nowIso,
        }).eq('id', (existing as any).id)
      } else {
        await supa.from('content_performance').insert({
          user_id: p.user_id,
          platform: p.platform,
          theme,
          content_type: p.content_type || 'tweet',
          avg_likes: likes,
          avg_comments: comments,
          avg_shares: shares,
          sample_count: 1,
          best_performing_content: likes > 0 ? (p.content as string).slice(0, 300) : null,
        })
      }
    }

    // 9. Track workout completion — update streak
    const { data: completedWorkouts } = await supa
      .from('workout_prescriptions')
      .select('user_id, completed_at')
      .eq('status', 'completed')
      .eq('scheduled_date', today)
      .limit(50)

    for (const w of completedWorkouts || []) {
      await supa.from('user_state').update({
        last_workout_at: (w as any).completed_at || nowIso,
      }).eq('user_id', (w as any).user_id)
      // Increment streak
      const { data: state } = await supa
        .from('user_state')
        .select('workout_streak_days, last_workout_at')
        .eq('user_id', (w as any).user_id)
        .maybeSingle()
      if (state) {
        const lastAt = (state as any).last_workout_at
        const lastDate = lastAt ? new Date(lastAt).toISOString().split('T')[0] : null
        const yesterday = new Date(now.getTime() - 86400000).toISOString().split('T')[0]
        const newStreak = lastDate === yesterday || lastDate === today
          ? ((state as any).workout_streak_days || 0) + 1
          : 1
        await supa.from('user_state').update({ workout_streak_days: newStreak }).eq('user_id', (w as any).user_id)
      }
    }

    // 10. Skipped workouts → slip
    const { data: skippedWorkouts } = await supa
      .from('workout_prescriptions')
      .select('id, user_id')
      .eq('status', 'prescribed')
      .lt('scheduled_date', today)
      .limit(50)

    for (const w of skippedWorkouts || []) {
      const userId = (w as any).user_id as string
      const workoutId = (w as any).id as string
      const { error: skipErr } = await supa
        .from('workout_prescriptions')
        .update({ status: 'skipped', skipped_reason: 'auto_expired' })
        .eq('id', workoutId)
      if (skipErr) console.error(`[force-processor] workout skip: ${skipErr.message}`)

      // Streak reset is bookkeeping ("time since last workout"), not a
      // penalty — it happens regardless of the gate.
      const { error: streakErr } = await supa
        .from('user_state')
        .update({ workout_streak_days: 0 })
        .eq('user_id', userId)
      if (streakErr) console.error(`[force-processor] workout streak: ${streakErr.message}`)

      // The slip is a penalty: gate + surfaced obligation required.
      if (!(await gateActive(userId)) || !underSlipCap(userId)) continue
      const oblig = await getObligation(supa, 'workout_prescriptions', workoutId)
      if (!oblig) continue
      const missedOk =
        oblig.status === 'missed' || (await driveToMissed(supa, oblig, 'workout_prescriptions', workoutId))
      if (!missedOk) continue

      const { error: slipErr } = await supa.from('slip_log').insert({
        user_id: userId,
        slip_type: 'task_avoided',
        slip_points: 2,
        source_text: 'Skipped prescribed workout',
        source_table: 'workout_prescriptions',
        source_id: workoutId,
        is_synthetic: true,
        obligation_id: oblig.id,
      })
      if (slipErr) { console.error(`[force-processor] workout slip: ${slipErr.message}`); continue }
      countSlip(userId)
      await fireInternalConsequence(supa, oblig.id)
    }

  return {
    ok: true,
    missed_doses: (missedDoses || []).length,
    dodged_punishments: (dodged || []).length,
    commuted_punishments: commuted,
    expired_locks: (expiredLocks || []).length,
    content_queued: contentQueued,
    skipped_workouts: (skippedWorkouts || []).length,
  }
}
