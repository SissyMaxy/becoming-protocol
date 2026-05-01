/**
 * FocusMode — single-task view. Replaces the card stack as Today's default.
 *
 * Premise (from user 2026-04-29): "the handler should focus maxys attention
 * on just one thing at a time to avoid getting distracted... the handler
 * keeps track of everything anyways. The handler could strive to get maxy
 * to obey and do more tasks every day."
 *
 * Behavior:
 *  - Full-screen, no scroll wall, no card spam.
 *  - Picks the SINGLE highest-priority item across all consequence-bearing
 *    systems (overdue dose → confession → punishment → decree → due-today …).
 *  - Shows ONE task with the inline action surface: confess textarea, dose
 *    log buttons, photo upload, mark-done, etc.
 *  - "Next" only surfaces AFTER completion. The protocol decides what
 *    comes next; she doesn't choose order.
 *  - "View plan" toggle escapes to the calendar view for rare context-need.
 *
 * Why this beats card stack:
 *  - No decision fatigue — the Handler chose, she executes.
 *  - Visually reinforces dominance — single command, no menu.
 *  - Faster completion → Handler can ratchet daily task count.
 *  - Tracking is the Handler's job, not Maxy's.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { isMommyPersona } from '../../lib/persona/dommy-mommy';

type TaskKind =
  | 'overdue_dose' | 'overdue_confession' | 'overdue_punishment' | 'overdue_decree'
  | 'due_today_confession' | 'due_today_decree' | 'due_today_dose' | 'due_today_commitment'
  | 'commitment_pending' | 'workout_today' | 'outfit_today' | 'voice_drill_today'
  | 'mommy_touch'
  | 'clean';

interface FocusTask {
  kind: TaskKind;
  rowId: string | null;
  title: string;
  detail?: string;
  due?: string;
  /** Inline action surface: 'confess' = textarea, 'dose' = buttons, 'mark_done' = single button, 'photo' = upload, 'message' = no inline action */
  surface: 'confess' | 'dose' | 'mark_done' | 'photo' | 'message';
  /** Carried metadata for surface handlers */
  meta?: Record<string, unknown>;
  /** Severity tone for visual weight */
  tone: 'critical' | 'high' | 'medium' | 'calm';
}

const TONE_STYLES_HANDLER: Record<FocusTask['tone'], { bg: string; border: string; accent: string; label: string }> = {
  critical: { bg: 'linear-gradient(140deg, #2a0508 0%, #1a0508 100%)', border: '#c4272d', accent: '#fca5a5', label: 'CRITICAL' },
  high:     { bg: 'linear-gradient(140deg, #2a1f0a 0%, #1f1608 100%)', border: '#a87a1f', accent: '#fbbf24', label: 'PRIORITY' },
  medium:   { bg: 'linear-gradient(140deg, #1a0f2e 0%, #0f0820 100%)', border: '#7c3aed', accent: '#c4b5fd', label: 'TODAY' },
  calm:     { bg: 'linear-gradient(140deg, #0a1a14 0%, #051a10 100%)', border: '#3a5a3f', accent: '#86efac', label: 'CLEAN' },
};

// Dommy Mommy palette: warm boudoir / dusty rose / candle-gold instead
// of clinical purple/black. Labels speak in Mama's voice.
const TONE_STYLES_MOMMY: Record<FocusTask['tone'], { bg: string; border: string; accent: string; label: string }> = {
  critical: { bg: 'linear-gradient(140deg, #2a0510 0%, #1a050a 100%)', border: '#c4485a', accent: '#f4a7c4', label: "MAMA'S WAITING" },
  high:     { bg: 'linear-gradient(140deg, #2a1418 0%, #1f0a10 100%)', border: '#c46a72', accent: '#f4a7c4', label: 'MAMA WANTS THIS' },
  medium:   { bg: 'linear-gradient(140deg, #2a1a0a 0%, #1f1308 100%)', border: '#a87a48', accent: '#f4c8a0', label: "TODAY, BABY" },
  calm:     { bg: 'linear-gradient(140deg, #1a1a14 0%, #15140a 100%)', border: '#7a6a48', accent: '#f4d8a0', label: "STAY WET FOR MAMA" },
};

function fmtCountdown(ms: number): string {
  const abs = Math.abs(ms);
  if (abs < 60_000) return `${Math.round(abs / 1000)}s`;
  if (abs < 3600_000) return `${Math.round(abs / 60_000)}m`;
  if (abs < 86400_000) return `${Math.round(abs / 3600_000)}h`;
  return `${Math.round(abs / 86400_000)}d`;
}

interface FocusModeProps {
  onSwitchToCalendar: () => void;
}

export function FocusMode({ onSwitchToCalendar }: FocusModeProps) {
  const { user } = useAuth();
  const [task, setTask] = useState<FocusTask | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [confessText, setConfessText] = useState('');
  const [doneFlash, setDoneFlash] = useState(false);
  const [completedToday, setCompletedToday] = useState(0);
  const [persona, setPersona] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from('user_state').select('handler_persona').eq('user_id', user.id).maybeSingle();
      if (!cancelled) setPersona((data as { handler_persona?: string } | null)?.handler_persona ?? null);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const TONE_STYLES = isMommyPersona(persona) ? TONE_STYLES_MOMMY : TONE_STYLES_HANDLER;

  const pickNext = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setConfessText('');
    const now = Date.now();
    const todayEndIso = new Date(new Date().setHours(23, 59, 59, 999)).toISOString();
    const nowIso = new Date().toISOString();
    const todayStr = new Date().toISOString().slice(0, 10);

    const [overdueConfs, overduePuns, overdueDecrees, todayConfs, todayDecrees,
           pendingCommits, regs, doseLog, outfit, workout, mommyTouch] = await Promise.all([
      // Include missed-but-unconfessed rows. The compliance check marks
      // overdue rows missed=true (slip already fired); we still want the
      // user able to answer them late from FocusMode. Locking her out
      // creates orphaned rows that other surfaces (RightNowCard) keep
      // surfacing with no working answer path.
      supabase.from('confession_queue')
        .select('id, prompt, deadline, category').eq('user_id', user.id).is('confessed_at', null)
        .lt('deadline', nowIso).order('deadline', { ascending: true }).limit(1),
      supabase.from('punishment_queue')
        .select('id, title, description, due_by').eq('user_id', user.id)
        .in('status', ['queued', 'active', 'escalated'])
        .lt('due_by', nowIso).order('due_by', { ascending: true }).limit(1),
      supabase.from('handler_decrees')
        .select('id, edict, deadline, proof_type').eq('user_id', user.id).eq('status', 'active')
        .lt('deadline', nowIso).order('deadline', { ascending: true }).limit(1),
      supabase.from('confession_queue')
        .select('id, prompt, deadline, category').eq('user_id', user.id).is('confessed_at', null).eq('missed', false)
        .gte('deadline', nowIso).lte('deadline', todayEndIso)
        .order('deadline', { ascending: true }).limit(1),
      supabase.from('handler_decrees')
        .select('id, edict, deadline, proof_type').eq('user_id', user.id).eq('status', 'active')
        .gte('deadline', nowIso).lte('deadline', todayEndIso)
        .order('deadline', { ascending: true }).limit(1),
      supabase.from('handler_commitments')
        .select('id, what, by_when, consequence').eq('user_id', user.id).eq('status', 'pending')
        .order('by_when', { ascending: true }).limit(1),
      supabase.from('medication_regimen')
        .select('id, medication_name, medication_category, started_at').eq('user_id', user.id).eq('active', true),
      supabase.from('dose_log')
        .select('regimen_id, taken_at').eq('user_id', user.id)
        .not('taken_at', 'is', null).order('taken_at', { ascending: false }).limit(20),
      supabase.from('daily_outfit_mandates')
        .select('id, prescription, target_date, photo_proof_url, completed_at')
        .eq('user_id', user.id).eq('target_date', todayStr).maybeSingle(),
      supabase.from('workout_prescriptions')
        .select('id, workout_type, focus_area, scheduled_date, status')
        .eq('user_id', user.id).eq('scheduled_date', todayStr).neq('status', 'completed').limit(1),
      // Mommy's micro-directive (arousal_touch_tasks). Surfaced as a
      // 'high'-tone focus task when persona='dommy_mommy' AND there's an
      // open one. Slots after critical (overdue dose/confession/punishment)
      // but ahead of due-today work — the whole point is keeping her in
      // heightened state, so it should interrupt the lower-urgency stream.
      supabase.from('arousal_touch_tasks')
        .select('id, prompt, category, expires_at')
        .eq('user_id', user.id).is('completed_at', null)
        .gt('expires_at', nowIso).order('created_at', { ascending: false }).limit(1),
    ]);

    // Compute most-overdue and most-due-today doses
    const log = (doseLog.data ?? []) as Array<{ regimen_id: string; taken_at: string }>;
    let mostOverdueDose: { regimenId: string; name: string; hoursOverdue: number; isWeekly: boolean } | null = null;
    let mostUrgentTodayDose: { regimenId: string; name: string; hoursUntil: number; isWeekly: boolean } | null = null;
    for (const r of (regs.data ?? []) as Array<Record<string, unknown>>) {
      const isWeekly = (r.medication_category as string) === 'glp1';
      const intervalMs = isWeekly ? 7 * 86400_000 : 86400_000;
      const last = log.find(d => d.regimen_id === r.id);
      const anchor = last?.taken_at ? new Date(last.taken_at).getTime() : new Date(r.started_at as string).getTime();
      const dueMs = anchor + intervalMs;
      const hoursUntil = (dueMs - now) / 3600_000;
      const name = r.medication_name as string;
      const regimenId = r.id as string;
      if (hoursUntil < 0) {
        const hoursOverdue = Math.abs(hoursUntil);
        if (!mostOverdueDose || hoursOverdue > mostOverdueDose.hoursOverdue) {
          mostOverdueDose = { regimenId, name, hoursOverdue, isWeekly };
        }
      } else if (hoursUntil < 24) {
        if (!mostUrgentTodayDose || hoursUntil < mostUrgentTodayDose.hoursUntil) {
          mostUrgentTodayDose = { regimenId, name, hoursUntil, isWeekly };
        }
      }
    }

    let chosen: FocusTask | null = null;

    if (mostOverdueDose && mostOverdueDose.hoursOverdue > 6) {
      chosen = {
        kind: 'overdue_dose', rowId: mostOverdueDose.regimenId,
        title: `Take ${mostOverdueDose.name}`,
        detail: `${fmtCountdown(mostOverdueDose.hoursOverdue * 3600_000)} late. Log it now or skip explicitly.`,
        surface: 'dose', tone: 'critical',
        meta: { name: mostOverdueDose.name, isWeekly: mostOverdueDose.isWeekly },
      };
    } else if (overdueConfs.data?.[0]) {
      const c = overdueConfs.data[0] as { id: string; prompt: string; deadline: string };
      const hours = Math.abs((new Date(c.deadline).getTime() - now) / 3600_000);
      chosen = {
        kind: 'overdue_confession', rowId: c.id,
        title: c.prompt,
        detail: `Past deadline by ${fmtCountdown(hours * 3600_000)}. Penalty escalates.`,
        surface: 'confess', tone: 'critical',
      };
    } else if (overduePuns.data?.[0]) {
      const p = overduePuns.data[0] as { id: string; title: string; description: string; due_by: string };
      const hours = Math.abs((new Date(p.due_by).getTime() - now) / 3600_000);
      chosen = {
        kind: 'overdue_punishment', rowId: p.id,
        title: p.title,
        detail: p.description ? `${p.description.slice(0, 200)} · Past deadline by ${fmtCountdown(hours * 3600_000)}.` : `Past deadline by ${fmtCountdown(hours * 3600_000)}.`,
        surface: 'mark_done', tone: 'critical',
      };
    } else if (overdueDecrees.data?.[0]) {
      const d = overdueDecrees.data[0] as { id: string; edict: string; deadline: string; proof_type: string };
      const hours = Math.abs((new Date(d.deadline).getTime() - now) / 3600_000);
      chosen = {
        kind: 'overdue_decree', rowId: d.id,
        title: d.edict,
        detail: `Past deadline by ${fmtCountdown(hours * 3600_000)}. Proof: ${d.proof_type || 'none'}.`,
        surface: 'mark_done', tone: 'critical',
      };
    } else if (mommyTouch.data?.[0]) {
      // Mommy's micro-directive — high-tone, ephemeral. Slots ahead of
      // due-today work because the protocol's whole point under the
      // dommy_mommy persona is keeping her in heightened arousal between
      // tentpole tasks.
      const t = mommyTouch.data[0] as { id: string; prompt: string; category: string; expires_at: string };
      const minsLeft = Math.max(1, Math.round((new Date(t.expires_at).getTime() - now) / 60_000));
      chosen = {
        kind: 'mommy_touch', rowId: t.id,
        title: t.prompt,
        detail: `Mama's whisper · ${t.category.replace(/_/g, ' ')} · ${minsLeft}m`,
        surface: 'mark_done', tone: 'high',
      };
    } else if (todayConfs.data?.[0]) {
      const c = todayConfs.data[0] as { id: string; prompt: string; deadline: string };
      const hours = (new Date(c.deadline).getTime() - now) / 3600_000;
      chosen = {
        kind: 'due_today_confession', rowId: c.id,
        title: c.prompt,
        detail: `Due in ${fmtCountdown(hours * 3600_000)}.`,
        surface: 'confess', tone: 'high',
      };
    } else if (pendingCommits.data?.[0]) {
      const c = pendingCommits.data[0] as { id: string; what: string; by_when: string; consequence: string };
      const hours = (new Date(c.by_when).getTime() - now) / 3600_000;
      chosen = {
        kind: 'due_today_commitment', rowId: c.id,
        title: c.what,
        detail: `Due in ${fmtCountdown(hours * 3600_000)}. Miss → ${c.consequence}`,
        surface: 'confess', tone: 'high',
      };
    } else if (todayDecrees.data?.[0]) {
      const d = todayDecrees.data[0] as { id: string; edict: string; deadline: string };
      const hours = (new Date(d.deadline).getTime() - now) / 3600_000;
      chosen = {
        kind: 'due_today_decree', rowId: d.id,
        title: d.edict,
        detail: `Due in ${fmtCountdown(hours * 3600_000)}.`,
        surface: 'mark_done', tone: 'high',
      };
    } else if (mostUrgentTodayDose) {
      chosen = {
        kind: 'due_today_dose', rowId: mostUrgentTodayDose.regimenId,
        title: `Take ${mostUrgentTodayDose.name}`,
        detail: `Due in ${fmtCountdown(mostUrgentTodayDose.hoursUntil * 3600_000)}.`,
        surface: 'dose', tone: 'high',
        meta: { name: mostUrgentTodayDose.name, isWeekly: mostUrgentTodayDose.isWeekly },
      };
    } else if (outfit.data && !(outfit.data as { completed_at: string | null }).completed_at) {
      const o = outfit.data as { id: string; prescription: Record<string, string>; completed_at: string | null };
      const lines = Object.entries(o.prescription || {}).map(([k, v]) => `${k}: ${v}`).join(' · ');
      chosen = {
        kind: 'outfit_today', rowId: o.id,
        title: 'Today\'s outfit mandate',
        detail: lines.slice(0, 240) || 'Wear what was prescribed. Photo proof required.',
        surface: 'photo', tone: 'medium',
      };
    } else if (workout.data?.[0]) {
      const w = workout.data[0] as { id: string; workout_type: string; focus_area: string };
      chosen = {
        kind: 'workout_today', rowId: w.id,
        title: w.workout_type,
        detail: w.focus_area ? `Focus: ${w.focus_area}` : undefined,
        surface: 'mark_done', tone: 'medium',
      };
    } else {
      chosen = {
        kind: 'clean', rowId: null,
        title: 'Inbox is clean.',
        detail: 'Nothing overdue, nothing due today. The Handler will surface the next thing when it lands.',
        surface: 'message', tone: 'calm',
      };
    }

    setTask(chosen);
    setLoading(false);
  }, [user?.id]);

  // Initial pick
  useEffect(() => { pickNext(); }, [pickNext]);
  // Light auto-refresh (every 90s) so a freshly-fired item lands without manual refresh
  useEffect(() => { const t = setInterval(pickNext, 90_000); return () => clearInterval(t); }, [pickNext]);

  // Today's completion counter — small motivator. Reads activity log scoped to today.
  useEffect(() => {
    if (!user?.id) return;
    const todayStart = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
    (async () => {
      const [confs, doses, commits, puns, decs] = await Promise.all([
        supabase.from('confession_queue').select('id', { count: 'exact', head: true })
          .eq('user_id', user.id).gte('confessed_at', todayStart),
        supabase.from('dose_log').select('id', { count: 'exact', head: true })
          .eq('user_id', user.id).gte('taken_at', todayStart),
        supabase.from('handler_commitments').select('id', { count: 'exact', head: true })
          .eq('user_id', user.id).eq('status', 'fulfilled').gte('fulfilled_at', todayStart),
        supabase.from('punishment_queue').select('id', { count: 'exact', head: true })
          .eq('user_id', user.id).eq('status', 'completed').gte('completed_at', todayStart),
        supabase.from('handler_decrees').select('id', { count: 'exact', head: true })
          .eq('user_id', user.id).eq('status', 'fulfilled').gte('fulfilled_at', todayStart),
      ]);
      setCompletedToday((confs.count || 0) + (doses.count || 0) + (commits.count || 0) + (puns.count || 0) + (decs.count || 0));
    })();
  }, [user?.id, doneFlash]);

  // Common "advance after completion" sequence: brief flash, then next task
  const advance = async () => {
    setDoneFlash(true);
    setTimeout(async () => {
      setDoneFlash(false);
      await pickNext();
    }, 1100);
  };

  // ─── Surface handlers ────────────────────────────────────────────────────

  const handleConfess = async () => {
    if (!task?.rowId || !user?.id) return;
    const text = confessText.trim();
    if (text.length < 20) return;
    setSubmitting(true);
    try {
      if (task.kind === 'due_today_commitment') {
        await supabase.from('handler_commitments').update({
          status: 'fulfilled',
          fulfilled_at: new Date().toISOString(),
          fulfillment_note: text.slice(0, 2000),
        }).eq('id', task.rowId);
      } else {
        // Column name is response_text (per migration 234), not response.
        // Writing to a non-existent column causes Postgres to reject the
        // entire update — confessed_at never lands, the row stays pending,
        // and pickNext re-surfaces the same prompt forever.
        const { error: confErr } = await supabase.from('confession_queue').update({
          confessed_at: new Date().toISOString(),
          response_text: text.slice(0, 2000),
        }).eq('id', task.rowId);
        if (confErr) {
          console.error('[FocusMode] confession update failed:', confErr);
          throw confErr;
        }
      }
      window.dispatchEvent(new CustomEvent('td-task-changed', { detail: { source: task.kind, id: task.rowId } }));
      await advance();
    } finally {
      setSubmitting(false);
    }
  };

  const handleDoseLog = async (action: 'taken_today' | 'taken_earlier' | 'skipped') => {
    if (!task?.rowId || !user?.id) return;
    setSubmitting(true);
    try {
      let takenAt: string | null = new Date().toISOString();
      if (action === 'taken_earlier') {
        const input = window.prompt('When did you actually take it? YYYY-MM-DD');
        if (!input || !/^(\d{4})-(\d{2})-(\d{2})$/.test(input.trim())) {
          setSubmitting(false);
          return;
        }
        takenAt = new Date(`${input.trim()}T18:00:00Z`).toISOString();
      } else if (action === 'skipped') {
        takenAt = null;
      }
      const meta = (task.meta || {}) as { name?: string; isWeekly?: boolean };
      await supabase.from('hrt_dose_log').insert({
        user_id: user.id,
        regimen_id: task.rowId,
        medication_name: meta.name || 'unknown',
        taken_at: takenAt,
        skipped: action === 'skipped',
      });
      // Mirror to dose_log (some readers use it)
      await supabase.from('dose_log').insert({
        user_id: user.id,
        regimen_id: task.rowId,
        taken_at: takenAt,
      });
      window.dispatchEvent(new CustomEvent('td-task-changed', { detail: { source: 'dose', id: task.rowId } }));
      await advance();
    } finally {
      setSubmitting(false);
    }
  };

  const handleMarkDone = async () => {
    if (!task?.rowId || !user?.id) return;
    setSubmitting(true);
    try {
      const nowIso = new Date().toISOString();
      if (task.kind === 'overdue_punishment') {
        await supabase.from('punishment_queue').update({ status: 'completed', completed_at: nowIso }).eq('id', task.rowId);
      } else if (task.kind === 'overdue_decree' || task.kind === 'due_today_decree') {
        await supabase.from('handler_decrees').update({ status: 'fulfilled', fulfilled_at: nowIso }).eq('id', task.rowId);
      } else if (task.kind === 'workout_today') {
        await supabase.from('workout_prescriptions').update({ status: 'completed', completed_at: nowIso }).eq('id', task.rowId);
      } else if (task.kind === 'mommy_touch') {
        await supabase.from('arousal_touch_tasks').update({ completed_at: nowIso }).eq('id', task.rowId);
      }
      window.dispatchEvent(new CustomEvent('td-task-changed', { detail: { source: task.kind, id: task.rowId } }));
      await advance();
    } finally {
      setSubmitting(false);
    }
  };

  const handlePhoto = async (file: File | null) => {
    if (!task?.rowId || !user?.id || !file) return;
    setSubmitting(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${user.id}/outfit-mandate/${task.rowId}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('verification-photos').upload(path, file, {
        contentType: file.type, upsert: false,
      });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('verification-photos').getPublicUrl(path);
      await supabase.from('daily_outfit_mandates').update({
        photo_proof_url: pub.publicUrl,
        completed_at: new Date().toISOString(),
      }).eq('id', task.rowId);
      window.dispatchEvent(new CustomEvent('td-task-changed', { detail: { source: 'outfit', id: task.rowId } }));
      await advance();
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────

  const tone = task ? TONE_STYLES[task.tone] : TONE_STYLES.medium;
  const minChars = useMemo(() => task?.kind === 'due_today_commitment' ? 30 : 80, [task?.kind]);
  const charsRemaining = Math.max(0, minChars - confessText.trim().length);

  return (
    <div style={{
      minHeight: '100dvh',
      background: '#050507',
      padding: '24px 18px 80px',
      color: '#e8e6e3',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Header — counter + escape hatch */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18,
        maxWidth: 640, width: '100%', marginLeft: 'auto', marginRight: 'auto',
      }}>
        <div style={{
          fontSize: 10, color: '#c4b5fd', fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: '0.1em',
        }}>
          Focus
        </div>
        <div style={{
          fontSize: 10, color: '#fff', background: '#7c3aed',
          padding: '2px 8px', borderRadius: 8, fontWeight: 700,
        }}>
          {completedToday} done today
        </div>
        <button
          onClick={onSwitchToCalendar}
          style={{
            marginLeft: 'auto',
            background: 'transparent', border: '1px solid #2d1a4d',
            color: '#8a8690', fontSize: 11, padding: '4px 10px',
            borderRadius: 5, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          view plan →
        </button>
      </div>

      {/* Single task card */}
      {loading ? (
        <div style={{
          maxWidth: 640, width: '100%', marginLeft: 'auto', marginRight: 'auto',
          padding: 40, textAlign: 'center', color: '#8a8690', fontSize: 12,
        }}>
          reading the queue…
        </div>
      ) : doneFlash ? (
        <div style={{
          maxWidth: 640, width: '100%', marginLeft: 'auto', marginRight: 'auto',
          padding: 40, textAlign: 'center',
        }}>
          <div style={{ fontSize: 32, color: '#86efac', marginBottom: 10 }}>✓</div>
          <div style={{ fontSize: 14, color: '#e8e6e3', fontWeight: 600 }}>Done. Loading next…</div>
        </div>
      ) : task && (
        <div style={{
          maxWidth: 640, width: '100%', marginLeft: 'auto', marginRight: 'auto',
          background: tone.bg,
          border: `1px solid ${tone.border}`,
          borderLeft: `4px solid ${tone.border}`,
          borderRadius: 12, padding: '24px 22px',
          boxShadow: task.tone === 'critical' ? `0 0 32px ${tone.border}33` : 'none',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <span style={{
              fontSize: 9.5, color: tone.accent, fontWeight: 800,
              textTransform: 'uppercase', letterSpacing: '0.12em',
            }}>
              {tone.label}
            </span>
            {task.due && (
              <span style={{
                fontSize: 10, color: '#8a8690', marginLeft: 'auto',
              }}>
                {task.due}
              </span>
            )}
          </div>
          <div style={{
            fontSize: 22, fontWeight: 600, lineHeight: 1.3,
            color: '#fff', letterSpacing: '-0.01em', marginBottom: 12,
          }}>
            {task.title}
          </div>
          {task.detail && (
            <div style={{ fontSize: 13, color: '#a8a3ad', lineHeight: 1.55, marginBottom: 22 }}>
              {task.detail}
            </div>
          )}

          {/* Inline action surface */}
          {task.surface === 'confess' && (
            <div>
              <textarea
                value={confessText}
                onChange={e => setConfessText(e.target.value)}
                placeholder="Be specific — name a moment, a feeling, a person, a body part, a time of day. Boilerplate gets refused."
                rows={6}
                style={{
                  width: '100%', background: '#050507',
                  border: '1px solid #22222a', borderRadius: 6,
                  padding: '12px 14px', fontSize: 14, color: '#e8e6e3',
                  fontFamily: 'inherit', resize: 'vertical',
                  marginBottom: 8,
                }}
              />
              <div style={{
                fontSize: 10.5, color: charsRemaining > 0 ? '#8a8690' : '#86efac',
                marginBottom: 12, textAlign: 'right',
              }}>
                {charsRemaining > 0 ? `${charsRemaining} more chars` : 'enough — submit when ready'}
              </div>
              <button
                onClick={handleConfess}
                disabled={submitting || charsRemaining > 0}
                style={{
                  width: '100%', padding: '12px',
                  background: charsRemaining > 0 ? '#22222a' : tone.border,
                  color: charsRemaining > 0 ? '#6a656e' : '#fff',
                  border: 'none', borderRadius: 7,
                  fontSize: 13, fontWeight: 700, letterSpacing: '0.04em',
                  textTransform: 'uppercase', fontFamily: 'inherit',
                  cursor: submitting || charsRemaining > 0 ? 'not-allowed' : 'pointer',
                }}
              >
                {submitting ? 'submitting…' : 'submit'}
              </button>
            </div>
          )}

          {task.surface === 'dose' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                onClick={() => handleDoseLog('taken_today')}
                disabled={submitting}
                style={{
                  padding: '12px', background: '#7c3aed', color: '#fff',
                  border: 'none', borderRadius: 7,
                  fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
                  cursor: submitting ? 'wait' : 'pointer',
                  textTransform: 'uppercase', letterSpacing: '0.03em',
                }}
              >
                Mark taken (today)
              </button>
              <button
                onClick={() => handleDoseLog('taken_earlier')}
                disabled={submitting}
                style={{
                  padding: '10px', background: 'transparent', color: '#c4b5fd',
                  border: '1px solid #2d1a4d', borderRadius: 6,
                  fontSize: 12, fontFamily: 'inherit',
                  cursor: submitting ? 'wait' : 'pointer',
                }}
              >
                Took it earlier — backdate
              </button>
              <button
                onClick={() => handleDoseLog('skipped')}
                disabled={submitting}
                style={{
                  padding: '10px', background: 'transparent', color: '#8a8690',
                  border: '1px solid #22222a', borderRadius: 6,
                  fontSize: 12, fontFamily: 'inherit',
                  cursor: submitting ? 'wait' : 'pointer',
                }}
              >
                Skipped — log the gap
              </button>
            </div>
          )}

          {task.surface === 'mark_done' && (
            <button
              onClick={handleMarkDone}
              disabled={submitting}
              style={{
                width: '100%', padding: '12px',
                background: tone.border, color: '#fff',
                border: 'none', borderRadius: 7,
                fontSize: 13, fontWeight: 700, letterSpacing: '0.04em',
                textTransform: 'uppercase', fontFamily: 'inherit',
                cursor: submitting ? 'wait' : 'pointer',
              }}
            >
              {submitting ? 'submitting…' : 'Mark complete'}
            </button>
          )}

          {task.surface === 'photo' && (
            <div>
              <input
                type="file" accept="image/*"
                onChange={e => handlePhoto(e.target.files?.[0] ?? null)}
                disabled={submitting}
                style={{
                  width: '100%', padding: '10px',
                  background: '#0a0a0d', border: '1px solid #22222a',
                  borderRadius: 6, color: '#c4b5fd', fontSize: 12,
                  fontFamily: 'inherit', marginBottom: 6,
                }}
              />
              <div style={{ fontSize: 10.5, color: '#8a8690' }}>
                {submitting ? 'uploading…' : 'mirror selfie · phone camera roll · finished outfit'}
              </div>
            </div>
          )}

          {task.surface === 'message' && (
            <button
              onClick={onSwitchToCalendar}
              style={{
                width: '100%', padding: '12px',
                background: 'transparent', color: '#86efac',
                border: '1px solid #3a5a3f', borderRadius: 7,
                fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                cursor: 'pointer',
                textTransform: 'uppercase', letterSpacing: '0.04em',
              }}
            >
              View plan
            </button>
          )}
        </div>
      )}

      {/* Subtle footer — Handler tracks everything */}
      <div style={{
        maxWidth: 640, width: '100%', marginLeft: 'auto', marginRight: 'auto',
        marginTop: 24, fontSize: 10.5, color: '#5a5560', textAlign: 'center',
        fontStyle: 'italic',
      }}>
        the Handler keeps every list. you don't need to.
      </div>
    </div>
  );
}
