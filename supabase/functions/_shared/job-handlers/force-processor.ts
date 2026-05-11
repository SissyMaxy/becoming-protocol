// Force processor — job handler. Used to be the force-processor edge function.
// Single tick that catches missed doses, dodged punishments, missed Gina
// disclosures, hard-mode exits, chastity expiries, content_calendar promotion,
// and workout streak bookkeeping. Single action — `force-processor:run`.
import { type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export async function runForceProcessor(
  supa: SupabaseClient,
): Promise<Record<string, unknown>> {
    const now = new Date()
    const nowIso = now.toISOString()
    const graceCutoff = new Date(now.getTime() - 2 * 3600000).toISOString()
    const today = nowIso.split('T')[0]

    // 1. Missed doses → slip + punishment
    const { data: missedDoses } = await supa
      .from('dose_log')
      .select('id, user_id, scheduled_at')
      .is('taken_at', null)
      .eq('skipped', false)
      .is('triggered_slip_id', null)
      .lt('scheduled_at', graceCutoff)
      .limit(200)

    for (const d of missedDoses || []) {
      const lateMin = Math.round((now.getTime() - new Date((d as any).scheduled_at).getTime()) / 60000)
      const { data: slip } = await supa
        .from('slip_log')
        .insert({
          user_id: (d as any).user_id,
          slip_type: 'hrt_dose_missed',
          slip_points: 4,
          source_text: `Missed dose ${lateMin}min late`,
          source_table: 'dose_log',
          source_id: (d as any).id,
          is_synthetic: true,
        })
        .select('id')
        .single()

      if (slip) {
        await supa
          .from('dose_log')
          .update({ late_by_minutes: lateMin, triggered_slip_id: (slip as any).id })
          .eq('id', (d as any).id)

        await supa.from('punishment_queue').insert({
          user_id: (d as any).user_id,
          punishment_type: 'mantra_recitation',
          severity: 1,
          title: 'Recite Maxy mantra 50 times',
          description: 'Missed a dose. 50 mantra recitations before you sleep.',
          parameters: { repetitions: 50 },
          due_by: new Date(now.getTime() + 16 * 3600000).toISOString(),
          triggered_by_slip_ids: [(slip as any).id],
        })
      }
    }

    // 2. Dodged punishments → escalate, add slip + denial extension
    const { data: dodged } = await supa
      .from('punishment_queue')
      .select('id, user_id, punishment_type, dodge_count')
      .eq('status', 'queued')
      .not('due_by', 'is', null)
      .lt('due_by', nowIso)
      .limit(100)

    for (const p of dodged || []) {
      const newDodge = ((p as any).dodge_count || 0) + 1
      await supa
        .from('punishment_queue')
        .update({
          status: newDodge >= 2 ? 'escalated' : 'queued',
          dodge_count: newDodge,
          due_by: new Date(now.getTime() + 24 * 3600000).toISOString(),
        })
        .eq('id', (p as any).id)

      await supa.from('slip_log').insert({
        user_id: (p as any).user_id,
        slip_type: 'task_avoided',
        slip_points: 3,
        source_text: `Dodged punishment: ${(p as any).punishment_type}`,
        metadata: { punishment_id: (p as any).id, dodge_count: newDodge },
        is_synthetic: true,
      })

      // Extend denial by 1 day
      const { data: session } = await supa
        .from('chastity_sessions')
        .select('id, scheduled_unlock_at')
        .eq('user_id', (p as any).user_id)
        .eq('status', 'locked')
        .order('locked_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (session) {
        const newUnlock = new Date(new Date((session as any).scheduled_unlock_at).getTime() + 86400000)
        await supa
          .from('chastity_sessions')
          .update({ scheduled_unlock_at: newUnlock.toISOString() })
          .eq('id', (session as any).id)
        await supa
          .from('user_state')
          .update({ chastity_scheduled_unlock_at: newUnlock.toISOString() })
          .eq('user_id', (p as any).user_id)
      }
    }

    // 3. Missed Gina disclosure deadlines
    const { data: missedDisclosures } = await supa
      .from('gina_disclosure_schedule')
      .select('id, user_id, rung, disclosure_domain')
      .eq('status', 'scheduled')
      .eq('escalation_applied', false)
      .lt('hard_deadline', today)
      .limit(50)

    for (const m of missedDisclosures || []) {
      const { data: slip } = await supa
        .from('slip_log')
        .insert({
          user_id: (m as any).user_id,
          slip_type: 'disclosure_deadline_missed',
          slip_points: 7,
          source_text: `Missed Gina disclosure rung ${(m as any).rung}: ${(m as any).disclosure_domain}`,
          source_table: 'gina_disclosure_schedule',
          source_id: (m as any).id,
          is_synthetic: true,
        })
        .select('id')
        .single()

      const slipIds = slip ? [(slip as any).id] : []
      await supa.from('punishment_queue').insert([
        {
          user_id: (m as any).user_id,
          punishment_type: 'public_post',
          severity: 4,
          title: 'Public slip confession post',
          description: 'Handler draft queued. 15-minute review window before publish.',
          parameters: { platform: 'twitter', review_minutes: 15 },
          due_by: new Date(now.getTime() + 3600000).toISOString(),
          triggered_by_slip_ids: slipIds,
        },
        {
          user_id: (m as any).user_id,
          punishment_type: 'denial_extension',
          severity: 4,
          title: 'Denial extended 7 days',
          description: '7 days added to denial streak for missing Gina deadline.',
          parameters: { days: 7 },
          triggered_by_slip_ids: slipIds,
        },
      ])

      await supa
        .from('gina_disclosure_schedule')
        .update({
          status: 'missed',
          escalation_applied: true,
          escalation_details: { slip_id: (slip as any)?.id, punishment_queued: true },
        })
        .eq('id', (m as any).id)
    }

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

      // Split into three separate tasks so Maxy can complete each via its
      // correct UI and see granular progress.
      const { data: confessionTask } = await supa
        .from('punishment_queue')
        .insert({
          user_id: userId,
          punishment_type: 'confession_extended',
          severity: 3,
          title: 'DE-ESCALATION 1/3: 800-word confession',
          description: 'Hard Mode exit requires all 3 of these + the other 2 tasks. Shame journal, 800 words minimum, on what you slipped on and why the system punishes you.',
          parameters: { min_words: 800, is_deescalation: true },
          due_by: dueBy,
          triggered_by_hard_mode: true,
        })
        .select('id')
        .single()

      await supa.from('punishment_queue').insert({
        user_id: userId,
        punishment_type: 'mantra_recitation',
        severity: 3,
        title: 'DE-ESCALATION 2/3: 100 mantra recitations',
        description: 'Hard Mode exit requires all 3 of these. Recite "I am Maxy. David is gone." 100 times, logged.',
        parameters: { repetitions: 100, is_deescalation: true, text: 'I am Maxy. David is gone.' },
        due_by: dueBy,
        triggered_by_hard_mode: true,
      })

      await supa.from('punishment_queue').insert({
        user_id: userId,
        punishment_type: 'gina_confession',
        severity: 3,
        title: 'DE-ESCALATION 3/3: Execute next Gina disclosure',
        description: 'Hard Mode exit requires all 3 of these. Open the next pending rung on your Gina disclosure ladder and execute it — accepted, deferred, or rejected. Just disclose.',
        parameters: { is_deescalation: true },
        due_by: dueBy,
        triggered_by_hard_mode: true,
      })

      if (confessionTask) {
        // The confession task is the anchor. Exit check reads entered_at and
        // verifies all 3 subrequirements met since then (regardless of which
        // specific task row completed).
        await supa
          .from('user_state')
          .update({ hard_mode_exit_task_id: (confessionTask as any).id })
          .eq('user_id', userId)
      }
    }

    // 5. Completed de-escalation tasks → check all 3 sub-requirements before exit
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

      // Verify all three de-escalation requirements satisfied since Hard Mode entry
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

      // 3. Gina disclosure either disclosed or accepted since Hard Mode entry
      const { data: disclosures } = await supa
        .from('gina_disclosure_schedule')
        .select('status, disclosed_at')
        .eq('user_id', (t as any).user_id)
        .in('status', ['gina_accepted', 'gina_deferred', 'gina_rejected'])
        .gte('disclosed_at', enteredAt)
      const disclosureMet = (disclosures || []).length > 0

      if (confessionMet && mantraMet && disclosureMet) {
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
          reason: 'De-escalation (all 3 subrequirements met: 800-word confession + 100+ mantras + Gina disclosure)',
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
        if (!disclosureMet) missing.push('Gina disclosure')
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

    // 5c. Deferred Gina disclosures older than 7 days → reopen for re-pressure
    const reopenCutoff = new Date(now.getTime() - 7 * 86400000).toISOString()
    const { data: deferredStale } = await supa
      .from('gina_disclosure_schedule')
      .select('id, rung, hard_deadline, disclosed_at')
      .eq('status', 'gina_deferred')
      .lt('disclosed_at', reopenCutoff)
      .limit(20)

    for (const d of deferredStale || []) {
      // Push deadline 3 days out, flip back to scheduled
      const newDeadline = new Date(now.getTime() + 3 * 86400000).toISOString().split('T')[0]
      await supa
        .from('gina_disclosure_schedule')
        .update({
          status: 'scheduled',
          hard_deadline: newDeadline,
          scheduled_by_date: new Date(now.getTime() - 86400000).toISOString().split('T')[0],
        })
        .eq('id', (d as any).id)
    }

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
      await supa.from('workout_prescriptions').update({ status: 'skipped', skipped_reason: 'auto_expired' }).eq('id', (w as any).id)
      await supa.from('slip_log').insert({
        user_id: (w as any).user_id,
        slip_type: 'task_avoided',
        slip_points: 2,
        source_text: 'Skipped prescribed workout',
        source_table: 'workout_prescriptions',
        source_id: (w as any).id,
        is_synthetic: true,
      })
      // Reset streak
      await supa.from('user_state').update({ workout_streak_days: 0 }).eq('user_id', (w as any).user_id)
    }

  return {
    ok: true,
    missed_doses: (missedDoses || []).length,
    dodged_punishments: (dodged || []).length,
    missed_disclosures: (missedDisclosures || []).length,
    expired_locks: (expiredLocks || []).length,
    content_queued: contentQueued,
    skipped_workouts: (skippedWorkouts || []).length,
  }
}
