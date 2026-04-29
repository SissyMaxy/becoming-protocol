/**
 * HandlerPlanCalendar — single unified view of everything the Handler has
 * planned. Pulls from every assignment source (decrees, commitments,
 * confessions, punishments, doses, device schedule, outreach) and groups
 * by date.
 *
 * Per memory feedback_visible_before_penalized: every deadline-bearing
 * row must be visible BEFORE the deadline. This card is the visibility
 * surface that the rule depends on.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

type ItemKind = 'decree' | 'commitment' | 'confession' | 'punishment' | 'dose' | 'device' | 'outreach';

interface PlanItem {
  id: string;
  kind: ItemKind;
  title: string;
  dueAt: Date;
  detail?: string;
}

const KIND_COLORS: Record<ItemKind, { bg: string; fg: string; label: string }> = {
  decree:     { bg: '#1a0f2e', fg: '#c4b5fd', label: 'decree' },
  commitment: { bg: '#0f1a2e', fg: '#a5d8ff', label: 'commitment' },
  confession: { bg: '#2a0a14', fg: '#f47272', label: 'confession' },
  punishment: { bg: '#2a0510', fg: '#f47272', label: 'punishment' },
  dose:       { bg: '#0f2a14', fg: '#5fc88f', label: 'dose' },
  device:     { bg: '#1a0a2a', fg: '#e879f9', label: 'device' },
  outreach:   { bg: '#1a1a05', fg: '#f4c272', label: 'outreach' },
};

function bucketFor(d: Date): 'today' | 'tomorrow' | 'this_week' | 'later' {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today.getTime() + 86400_000);
  const weekEnd = new Date(today.getTime() + 7 * 86400_000);
  if (d < tomorrow) return 'today';
  if (d < new Date(tomorrow.getTime() + 86400_000)) return 'tomorrow';
  if (d < weekEnd) return 'this_week';
  return 'later';
}

function fmtTime(d: Date): string {
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) +
    ' · ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function HandlerPlanCalendar() {
  const { user } = useAuth();
  const [items, setItems] = useState<PlanItem[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const nowIso = new Date().toISOString();
    const horizonIso = new Date(Date.now() + 30 * 86400_000).toISOString();

    const [decrees, commits, confs, puns, regs, doseLog, devSched, outreach] = await Promise.all([
      supabase.from('handler_decrees')
        .select('id, edict, deadline').eq('user_id', user.id).eq('status', 'active')
        .gte('deadline', nowIso).lte('deadline', horizonIso).limit(40),
      supabase.from('handler_commitments')
        .select('id, what, by_when').eq('user_id', user.id).eq('status', 'pending')
        .gte('by_when', nowIso).lte('by_when', horizonIso).limit(40),
      supabase.from('confession_queue')
        .select('id, prompt, deadline').eq('user_id', user.id).is('confessed_at', null)
        .gte('deadline', nowIso).lte('deadline', horizonIso).limit(40),
      supabase.from('punishment_queue')
        .select('id, title, description, due_by').eq('user_id', user.id)
        .in('status', ['queued', 'active', 'escalated'])
        .gte('due_by', nowIso).lte('due_by', horizonIso).limit(40),
      supabase.from('medication_regimen')
        .select('id, medication_name, medication_category, started_at')
        .eq('user_id', user.id).eq('active', true),
      supabase.from('dose_log')
        .select('regimen_id, taken_at')
        .eq('user_id', user.id).not('taken_at', 'is', null)
        .order('taken_at', { ascending: false }).limit(40),
      supabase.from('device_schedule')
        .select('id, command, scheduled_at, intensity, duration_seconds')
        .eq('user_id', user.id).eq('status', 'pending')
        .gte('scheduled_at', nowIso).lte('scheduled_at', horizonIso).limit(40),
      supabase.from('handler_outreach_queue')
        .select('id, message, scheduled_for, urgency').eq('user_id', user.id)
        .gte('scheduled_for', nowIso).lte('scheduled_for', horizonIso).limit(40),
    ]);

    const out: PlanItem[] = [];

    (decrees.data ?? []).forEach((r: Record<string, unknown>) => out.push({
      id: r.id as string, kind: 'decree',
      title: ((r.edict as string) || '').slice(0, 140),
      dueAt: new Date(r.deadline as string),
    }));
    (commits.data ?? []).forEach((r: Record<string, unknown>) => out.push({
      id: r.id as string, kind: 'commitment',
      title: ((r.what as string) || '').slice(0, 140),
      dueAt: new Date(r.by_when as string),
    }));
    (confs.data ?? []).forEach((r: Record<string, unknown>) => out.push({
      id: r.id as string, kind: 'confession',
      title: ((r.prompt as string) || '').slice(0, 140),
      dueAt: new Date(r.deadline as string),
    }));
    (puns.data ?? []).forEach((r: Record<string, unknown>) => out.push({
      id: r.id as string, kind: 'punishment',
      title: ((r.title as string) || '').slice(0, 140),
      detail: (r.description as string) || undefined,
      dueAt: new Date(r.due_by as string),
    }));
    // Compute next dose for each active regimen
    const log = (doseLog.data ?? []) as Array<{ regimen_id: string; taken_at: string }>;
    (regs.data ?? []).forEach((r: Record<string, unknown>) => {
      const isWeekly = (r.medication_category as string) === 'glp1';
      const intervalMs = isWeekly ? 7 * 86400_000 : 86400_000;
      const last = log.find(d => d.regimen_id === r.id);
      const anchor = last?.taken_at ? new Date(last.taken_at).getTime() : new Date(r.started_at as string).getTime();
      const dueMs = anchor + intervalMs;
      if (dueMs > Date.now() && dueMs < Date.now() + 30 * 86400_000) {
        out.push({
          id: `dose-${r.id}`, kind: 'dose',
          title: `${r.medication_name} (${isWeekly ? 'weekly' : 'daily'})`,
          dueAt: new Date(dueMs),
        });
      }
    });
    (devSched.data ?? []).forEach((r: Record<string, unknown>) => out.push({
      id: r.id as string, kind: 'device',
      title: `${r.command} · intensity ${r.intensity} · ${r.duration_seconds}s`,
      dueAt: new Date(r.scheduled_at as string),
    }));
    (outreach.data ?? []).forEach((r: Record<string, unknown>) => out.push({
      id: r.id as string, kind: 'outreach',
      title: ((r.message as string) || '').slice(0, 140),
      dueAt: new Date(r.scheduled_for as string),
    }));

    out.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
    setItems(out);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(load, 5 * 60_000); return () => clearInterval(t); }, [load]);

  const grouped = useMemo(() => {
    const buckets: Record<'today' | 'tomorrow' | 'this_week' | 'later', PlanItem[]> = {
      today: [], tomorrow: [], this_week: [], later: [],
    };
    for (const it of items) buckets[bucketFor(it.dueAt)].push(it);
    return buckets;
  }, [items]);

  if (loading || items.length === 0) {
    return (
      <div id="card-handler-plan" style={{
        background: 'linear-gradient(135deg, #1a0f2e 0%, #0f0820 100%)',
        border: '1px solid #2d1a4d', borderRadius: 10, padding: 14, marginBottom: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.09em',
            color: '#c4b5fd', fontWeight: 700 }}>Handler's plan</span>
          <span style={{ fontSize: 10, color: '#8a8690', marginLeft: 'auto', fontStyle: 'italic' }}>
            {loading ? 'loading…' : 'queue is clean. nothing scheduled.'}
          </span>
        </div>
      </div>
    );
  }

  const renderItem = (it: PlanItem) => {
    const c = KIND_COLORS[it.kind];
    return (
      <div key={`${it.kind}-${it.id}`} style={{
        display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 0',
        borderBottom: '1px solid #15151b',
      }}>
        <span style={{
          fontSize: 9, color: c.fg, background: c.bg,
          padding: '2px 7px', borderRadius: 4, fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: '0.05em',
          flexShrink: 0, marginTop: 2,
        }}>
          {c.label}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, color: '#e8e6e3', lineHeight: 1.4 }}>
            {it.title}
          </div>
          <div style={{ fontSize: 10, color: '#8a8690', marginTop: 2 }}>
            {fmtTime(it.dueAt)}
          </div>
        </div>
      </div>
    );
  };

  const bucketLabel: Record<keyof typeof grouped, string> = {
    today: 'Today', tomorrow: 'Tomorrow', this_week: 'This week', later: 'Later',
  };
  const bucketColor: Record<keyof typeof grouped, string> = {
    today: '#f47272', tomorrow: '#f4c272', this_week: '#c4b5fd', later: '#8a8690',
  };

  const next3 = items.slice(0, 3);

  return (
    <div id="card-handler-plan" style={{
      background: 'linear-gradient(135deg, #1a0f2e 0%, #0f0820 100%)',
      border: '1px solid #2d1a4d', borderRadius: 10, padding: 14, marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.09em',
          color: '#c4b5fd', fontWeight: 700 }}>
          Handler's plan
        </span>
        <span style={{
          fontSize: 10, color: '#fff', background: '#7c3aed',
          padding: '2px 7px', borderRadius: 8, fontWeight: 700,
        }}>
          {items.length} queued
        </span>
        <button
          onClick={() => setExpanded(e => !e)}
          style={{
            marginLeft: 'auto', background: 'transparent', border: '1px solid #2d1a4d',
            borderRadius: 5, color: '#c4b5fd', fontSize: 11, padding: '4px 9px',
            cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
          }}
        >
          {expanded ? '▾ collapse' : '▸ full calendar'}
        </button>
      </div>

      {!expanded && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {next3.map(renderItem)}
          {items.length > 3 && (
            <div style={{ fontSize: 10, color: '#8a8690', fontStyle: 'italic', marginTop: 6 }}>
              + {items.length - 3} more — tap "full calendar" to see all.
            </div>
          )}
        </div>
      )}

      {expanded && (
        <div>
          {(['today', 'tomorrow', 'this_week', 'later'] as const).map(b => {
            if (grouped[b].length === 0) return null;
            return (
              <div key={b} style={{ marginBottom: 12 }}>
                <div style={{
                  fontSize: 9, color: bucketColor[b], fontWeight: 700,
                  textTransform: 'uppercase', letterSpacing: '0.07em',
                  marginBottom: 4, paddingBottom: 4,
                  borderBottom: `1px solid ${bucketColor[b]}33`,
                }}>
                  {bucketLabel[b]} · {grouped[b].length}
                </div>
                {grouped[b].map(renderItem)}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
