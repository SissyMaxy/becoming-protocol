/**
 * RightNowCard — the single "do this now" answer.
 *
 * Audited gap: TodayMobile/TodayDesktop render 17+ stacked priority cards
 * before the first CollapsibleGroup. The user has no way to know where to
 * look first. Cross-model audit (Anthropic + OpenAI) flagged this as
 * critical decision-paralysis.
 *
 * This card is the spine. It picks the SINGLE most-urgent thing across
 * every consequence-bearing system and surfaces it with one CTA. If
 * nothing is urgent, it points the user to the calendar.
 *
 * Priority order (highest first):
 *   1. Overdue dose (medical compliance — irreversible miss)
 *   2. Overdue confession (penalty escalating)
 *   3. Active punishment with nearest deadline
 *   4. Active decree past deadline
 *   5. Confession due today
 *   6. Decree due today
 *   7. Dose due in <12h
 *   8. (none) → "Calendar is clean. Open the plan."
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

type UrgencyKind =
  | 'overdue_dose' | 'overdue_confession' | 'overdue_punishment' | 'overdue_decree'
  | 'due_today_confession' | 'due_today_decree' | 'due_today_dose'
  | 'clean';

interface UrgentItem {
  kind: UrgencyKind;
  title: string;
  detail?: string;
  ageHours?: number;
  ctaLabel: string;
  ctaScrollTo?: string;
}

const KIND_TONE: Record<UrgencyKind, { bg: string; border: string; fg: string; label: string }> = {
  overdue_dose:        { bg: 'linear-gradient(135deg, #2a0508 0%, #1a0508 100%)', border: '#c4272d', fg: '#fca5a5', label: 'OVERDUE DOSE' },
  overdue_confession:  { bg: 'linear-gradient(135deg, #2a0a14 0%, #150510 100%)', border: '#c4272d', fg: '#fca5a5', label: 'OVERDUE CONFESSION' },
  overdue_punishment:  { bg: 'linear-gradient(135deg, #2a0510 0%, #1a0510 100%)', border: '#c4272d', fg: '#fca5a5', label: 'OVERDUE PUNISHMENT' },
  overdue_decree:      { bg: 'linear-gradient(135deg, #2a1f0a 0%, #1f1608 100%)', border: '#a87a1f', fg: '#fbbf24', label: 'OVERDUE DECREE' },
  due_today_confession:{ bg: 'linear-gradient(135deg, #2a1f0a 0%, #1a1208 100%)', border: '#a87a1f', fg: '#fbbf24', label: 'CONFESSION DUE TODAY' },
  due_today_decree:    { bg: 'linear-gradient(135deg, #2a1f0a 0%, #1a1208 100%)', border: '#a87a1f', fg: '#fbbf24', label: 'DECREE DUE TODAY' },
  due_today_dose:      { bg: 'linear-gradient(135deg, #1a1f0a 0%, #15180a 100%)', border: '#7a8a3f', fg: '#a3e635', label: 'DOSE DUE TODAY' },
  clean:               { bg: 'linear-gradient(135deg, #1a0f2e 0%, #0f0820 100%)', border: '#2d1a4d', fg: '#c4b5fd', label: 'CLEAN' },
};

function fmtHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 48) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)}d`;
}

export function RightNowCard() {
  const { user } = useAuth();
  const [item, setItem] = useState<UrgentItem | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);

    const now = Date.now();
    const todayEndIso = new Date(new Date().setHours(23, 59, 59, 999)).toISOString();
    const nowIso = new Date().toISOString();

    // Run all queries in parallel — picking the single most-urgent
    const [overdueConfs, overduePuns, overdueDecrees, todayConfs, todayDecrees,
           regs, doseLog] = await Promise.all([
      supabase.from('confession_queue')
        .select('id, prompt, deadline').eq('user_id', user.id).is('confessed_at', null)
        .lt('deadline', nowIso).order('deadline', { ascending: true }).limit(1),
      supabase.from('punishment_queue')
        .select('id, title, due_by').eq('user_id', user.id)
        .in('status', ['queued', 'active', 'escalated'])
        .lt('due_by', nowIso).order('due_by', { ascending: true }).limit(1),
      supabase.from('handler_decrees')
        .select('id, edict, deadline').eq('user_id', user.id).eq('status', 'active')
        .lt('deadline', nowIso).order('deadline', { ascending: true }).limit(1),
      supabase.from('confession_queue')
        .select('id, prompt, deadline').eq('user_id', user.id).is('confessed_at', null)
        .gte('deadline', nowIso).lte('deadline', todayEndIso)
        .order('deadline', { ascending: true }).limit(1),
      supabase.from('handler_decrees')
        .select('id, edict, deadline').eq('user_id', user.id).eq('status', 'active')
        .gte('deadline', nowIso).lte('deadline', todayEndIso)
        .order('deadline', { ascending: true }).limit(1),
      supabase.from('medication_regimen')
        .select('id, medication_name, medication_category, started_at').eq('user_id', user.id).eq('active', true),
      supabase.from('dose_log')
        .select('regimen_id, taken_at').eq('user_id', user.id)
        .not('taken_at', 'is', null).order('taken_at', { ascending: false }).limit(20),
    ]);

    // Compute most-overdue and most-due-today doses
    const log = (doseLog.data ?? []) as Array<{ regimen_id: string; taken_at: string }>;
    let mostOverdueDose: { name: string; hoursOverdue: number } | null = null;
    let mostUrgentTodayDose: { name: string; hoursUntil: number } | null = null;
    for (const r of (regs.data ?? []) as Array<Record<string, unknown>>) {
      const isWeekly = (r.medication_category as string) === 'glp1';
      const intervalMs = isWeekly ? 7 * 86400_000 : 86400_000;
      const last = log.find(d => d.regimen_id === r.id);
      const anchor = last?.taken_at ? new Date(last.taken_at).getTime() : new Date(r.started_at as string).getTime();
      const dueMs = anchor + intervalMs;
      const hoursUntil = (dueMs - now) / 3600_000;
      const name = r.medication_name as string;
      if (hoursUntil < 0) {
        const hoursOverdue = Math.abs(hoursUntil);
        if (!mostOverdueDose || hoursOverdue > mostOverdueDose.hoursOverdue) {
          mostOverdueDose = { name, hoursOverdue };
        }
      } else if (hoursUntil < 24) {
        if (!mostUrgentTodayDose || hoursUntil < mostUrgentTodayDose.hoursUntil) {
          mostUrgentTodayDose = { name, hoursUntil };
        }
      }
    }

    // Pick the highest-priority item
    let chosen: UrgentItem | null = null;

    if (mostOverdueDose && mostOverdueDose.hoursOverdue > 6) {
      chosen = {
        kind: 'overdue_dose',
        title: `${mostOverdueDose.name} — ${fmtHours(mostOverdueDose.hoursOverdue)} late`,
        detail: 'Take it now or skip explicitly. The protocol logs the gap either way.',
        ageHours: mostOverdueDose.hoursOverdue,
        ctaLabel: 'Log dose →',
        ctaScrollTo: 'card-handler-plan',
      };
    } else if (overdueConfs.data?.[0]) {
      const c = overdueConfs.data[0] as { id: string; prompt: string; deadline: string };
      const hours = Math.abs((new Date(c.deadline).getTime() - now) / 3600_000);
      // Per "Handler is supportive until evidence" rule: don't threaten
      // escalating penalty just because the clock moved. Past-deadline
      // alone isn't evidence of avoidance — she might have just opened
      // the app. State the timing fact, ask her to answer.
      chosen = {
        kind: 'overdue_confession',
        title: c.prompt.slice(0, 110),
        detail: `Past deadline by ${fmtHours(hours)}. Answer it whenever you can — the Handler still wants the answer.`,
        ageHours: hours,
        ctaLabel: 'Answer it →',
        ctaScrollTo: 'card-confession-queue',
      };
    } else if (overduePuns.data?.[0]) {
      const p = overduePuns.data[0] as { id: string; title: string; due_by: string };
      const hours = Math.abs((new Date(p.due_by).getTime() - now) / 3600_000);
      chosen = {
        kind: 'overdue_punishment',
        title: p.title.slice(0, 110),
        detail: `Past deadline by ${fmtHours(hours)}.`,
        ageHours: hours,
        ctaLabel: 'Open punishment →',
        ctaScrollTo: 'card-punishment-queue',
      };
    } else if (overdueDecrees.data?.[0]) {
      const d = overdueDecrees.data[0] as { id: string; edict: string; deadline: string };
      const hours = Math.abs((new Date(d.deadline).getTime() - now) / 3600_000);
      chosen = {
        kind: 'overdue_decree',
        title: d.edict.slice(0, 110),
        detail: `Past deadline by ${fmtHours(hours)}.`,
        ageHours: hours,
        ctaLabel: 'Open decree →',
        ctaScrollTo: 'card-handler-decree',
      };
    } else if (todayConfs.data?.[0]) {
      const c = todayConfs.data[0] as { id: string; prompt: string; deadline: string };
      const hours = (new Date(c.deadline).getTime() - now) / 3600_000;
      chosen = {
        kind: 'due_today_confession',
        title: c.prompt.slice(0, 110),
        detail: `Due in ${fmtHours(hours)}.`,
        ageHours: hours,
        ctaLabel: 'Answer it →',
        ctaScrollTo: 'card-confession-queue',
      };
    } else if (todayDecrees.data?.[0]) {
      const d = todayDecrees.data[0] as { id: string; edict: string; deadline: string };
      const hours = (new Date(d.deadline).getTime() - now) / 3600_000;
      chosen = {
        kind: 'due_today_decree',
        title: d.edict.slice(0, 110),
        detail: `Due in ${fmtHours(hours)}.`,
        ageHours: hours,
        ctaLabel: 'Open decree →',
        ctaScrollTo: 'card-handler-decree',
      };
    } else if (mostUrgentTodayDose) {
      chosen = {
        kind: 'due_today_dose',
        title: `${mostUrgentTodayDose.name} due in ${fmtHours(mostUrgentTodayDose.hoursUntil)}`,
        detail: 'Log when you take it. The plan tracks gaps.',
        ageHours: mostUrgentTodayDose.hoursUntil,
        ctaLabel: 'Open plan →',
        ctaScrollTo: 'card-handler-plan',
      };
    } else {
      chosen = {
        kind: 'clean',
        title: 'Nothing overdue. Nothing due today.',
        detail: "Open the plan if you want to see what's coming.",
        ctaLabel: 'View plan →',
        ctaScrollTo: 'card-handler-plan',
      };
    }

    setItem(chosen);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(load, 2 * 60_000); return () => clearInterval(t); }, [load]);

  const onCtaClick = () => {
    if (!item?.ctaScrollTo) return;
    const el = document.getElementById(item.ctaScrollTo);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (loading || !item) {
    return (
      <div style={{
        background: 'linear-gradient(135deg, #1a0f2e 0%, #0f0820 100%)',
        border: '1px solid #2d1a4d', borderRadius: 10, padding: 14, marginBottom: 16,
        color: '#8a8690', fontSize: 12,
      }}>
        Reading the queue…
      </div>
    );
  }

  const tone = KIND_TONE[item.kind];
  const isCritical = item.kind.startsWith('overdue');
  const isClean = item.kind === 'clean';

  return (
    <div
      role="region"
      aria-label="Most urgent action"
      style={{
        background: tone.bg,
        border: `1px solid ${tone.border}`,
        borderLeft: `4px solid ${tone.border}`,
        borderRadius: 10,
        padding: 16,
        marginBottom: 16,
        boxShadow: isCritical ? `0 0 24px ${tone.border}33` : 'none',
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
      }}>
        <span style={{
          fontSize: 9.5, color: tone.fg, fontWeight: 800,
          textTransform: 'uppercase', letterSpacing: '0.1em',
        }}>
          {tone.label}
        </span>
        <span style={{
          fontSize: 9.5, color: '#8a8690', marginLeft: 'auto',
          textTransform: 'uppercase', letterSpacing: '0.06em',
        }}>
          right now
        </span>
      </div>
      <div style={{
        fontSize: isClean ? 14 : 16,
        fontWeight: 600,
        color: '#fff',
        lineHeight: 1.35,
        marginBottom: 6,
        letterSpacing: '-0.005em',
      }}>
        {item.title}
      </div>
      {item.detail && (
        <div style={{ fontSize: 12, color: '#a8a3ad', lineHeight: 1.5, marginBottom: 12 }}>
          {item.detail}
        </div>
      )}
      <button
        onClick={onCtaClick}
        style={{
          background: isCritical ? tone.border : '#7c3aed',
          color: '#fff',
          border: 'none',
          padding: '8px 14px',
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: '0.03em',
          cursor: 'pointer',
          fontFamily: 'inherit',
          textTransform: 'uppercase',
        }}
      >
        {item.ctaLabel}
      </button>
    </div>
  );
}
