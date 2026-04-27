/**
 * UnifiedTaskList — single canonical "what do I owe right now" list.
 * Aggregates open items from 7 different sources (commitments, decrees,
 * confessions, outfit mandate, workout, punishment queue, directives)
 * into one overdue-first list. Solves the "I didn't see them" problem
 * — every task lives somewhere; this is the index.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

type Source = 'commitment' | 'decree' | 'confession' | 'outfit' | 'workout' | 'punishment' | 'directive' | 'hrt_gate';

interface Task {
  id: string;
  source: Source;
  label: string;
  detail?: string;
  due: string | null;
  consequence?: string;
  badge?: string;
}

const SOURCE_TONE: Record<Source, string> = {
  commitment: '#7c3aed',
  decree: '#f4c272',
  confession: '#f4a7c4',
  outfit: '#ec4899',
  workout: '#6ee7b7',
  punishment: '#f47272',
  directive: '#c4b5fd',
  hrt_gate: '#f4a7c4',
};

const SOURCE_LABEL: Record<Source, string> = {
  commitment: 'commitment',
  decree: 'decree',
  confession: 'confess',
  outfit: 'outfit',
  workout: 'workout',
  punishment: 'punishment',
  directive: 'directive',
  hrt_gate: 'HRT gate',
};

// Each source has a card on Today — scroll the user there when they hit
// the RIGHT NOW CTA. The id lookup matches anchors on the cards
// themselves; if missing, we fall back to opening the Handler chat with
// a prefill.
function scrollTargetForSource(source: Source): string | null {
  switch (source) {
    case 'commitment': return 'card-commitments';
    case 'decree': return 'card-handler-decree';
    case 'confession': return 'card-confession-queue';
    case 'outfit': return 'card-outfit-mandate';
    case 'workout': return 'card-workout';
    case 'punishment': return 'card-slip-log';
    case 'directive': return 'card-handler-running';
    case 'hrt_gate': return null; // gate is a modal, no scroll target
    default: return null;
  }
}

function ctaLabelForSource(source: Source): string {
  switch (source) {
    case 'commitment': return 'Submit evidence';
    case 'decree': return 'Mark fulfilled';
    case 'confession': return 'Confess now';
    case 'outfit': return 'Upload outfit photo';
    case 'workout': return 'Mark workout done';
    case 'punishment': return 'Execute punishment';
    case 'directive': return 'Open directive';
    case 'hrt_gate': return 'Advance HRT step';
    default: return 'Take action';
  }
}

function formatDue(due: string | null): { text: string; overdueHours: number } {
  if (!due) return { text: 'no deadline', overdueHours: 0 };
  const diffMs = new Date(due).getTime() - Date.now();
  const overdue = diffMs < 0;
  const hours = Math.abs(Math.round(diffMs / 3600000));
  const days = Math.floor(hours / 24);
  if (overdue) {
    if (hours < 1) return { text: 'overdue <1h', overdueHours: hours };
    if (days >= 2) return { text: `overdue ${days}d ${hours % 24}h`, overdueHours: hours };
    return { text: `overdue ${hours}h`, overdueHours: hours };
  }
  if (hours >= 24) return { text: `${days}d ${hours % 24}h left`, overdueHours: -hours };
  if (hours < 1) return { text: '<1h left', overdueHours: -hours };
  return { text: `${hours}h left`, overdueHours: -hours };
}

export function UnifiedTaskList() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const todayStr = new Date().toISOString().slice(0, 10);

    const [
      cmtRes, decreeRes, confRes, outfitRes, workoutRes, punRes, dirRes, hrtRes, hrtObs,
    ] = await Promise.all([
      supabase.from('handler_commitments')
        .select('id, what, by_when, consequence, locked')
        .eq('user_id', user.id).eq('status', 'pending')
        .order('by_when', { ascending: true }).limit(20),
      supabase.from('handler_decrees')
        .select('id, edict, deadline, consequence')
        .eq('user_id', user.id).eq('status', 'active')
        .order('deadline', { ascending: true }).limit(10),
      supabase.from('confession_queue')
        .select('id, prompt, deadline, category')
        .eq('user_id', user.id).is('confessed_at', null).eq('missed', false)
        .order('deadline', { ascending: true }).limit(10),
      supabase.from('daily_outfit_mandates')
        .select('id, prescription, target_date, photo_proof_url, completed_at')
        .eq('user_id', user.id).eq('target_date', todayStr).maybeSingle(),
      supabase.from('workout_prescriptions')
        .select('id, workout_type, focus_area, scheduled_date, status')
        .eq('user_id', user.id).eq('scheduled_date', todayStr).neq('status', 'completed').limit(5),
      supabase.from('punishment_queue')
        .select('id, title, description, due_by, severity, dodge_count, status')
        .eq('user_id', user.id).in('status', ['queued', 'active', 'escalated'])
        .order('severity', { ascending: false }).limit(10),
      supabase.from('handler_directives')
        .select('id, action, target, value, reasoning, created_at')
        .eq('user_id', user.id).eq('status', 'pending')
        .in('action', ['prescribe_task', 'force_mantra_repetition', 'request_evidence', 'submit_proof'])
        .order('created_at', { ascending: false }).limit(10),
      supabase.from('hrt_funnel')
        .select('current_step').eq('user_id', user.id).maybeSingle(),
      supabase.from('hrt_obstacles')
        .select('id').eq('user_id', user.id).eq('obstacle_date', todayStr).limit(1),
    ]);

    const collected: Task[] = [];

    for (const c of (cmtRes.data || []) as Array<Record<string, unknown>>) {
      collected.push({
        id: `cmt:${c.id}`,
        source: 'commitment',
        label: String(c.what).slice(0, 140),
        due: c.by_when as string | null,
        consequence: (c.consequence as string) || undefined,
        badge: c.locked ? 'LOCKED' : undefined,
      });
    }
    for (const d of (decreeRes.data || []) as Array<Record<string, unknown>>) {
      collected.push({
        id: `dec:${d.id}`,
        source: 'decree',
        label: String(d.edict).slice(0, 140),
        due: d.deadline as string | null,
        consequence: (d.consequence as string) || undefined,
      });
    }
    for (const cf of (confRes.data || []) as Array<Record<string, unknown>>) {
      collected.push({
        id: `cnf:${cf.id}`,
        source: 'confession',
        label: String(cf.prompt).slice(0, 140),
        due: cf.deadline as string | null,
        badge: String(cf.category).replace(/_/g, ' '),
      });
    }
    const outfit = outfitRes.data as { id: string; prescription: Record<string, string>; target_date: string; photo_proof_url: string | null; completed_at: string | null } | null;
    if (outfit && !outfit.completed_at) {
      const eod = new Date(); eod.setHours(22, 0, 0, 0);
      const parts = Object.values(outfit.prescription || {}).filter(Boolean).join(' · ').slice(0, 120);
      collected.push({
        id: `out:${outfit.id}`,
        source: 'outfit',
        label: `Today's outfit: ${parts}`,
        detail: outfit.photo_proof_url ? 'photo submitted' : 'photo proof required',
        due: eod.toISOString(),
      });
    }
    for (const w of (workoutRes.data || []) as Array<Record<string, unknown>>) {
      const eod = new Date(); eod.setHours(22, 0, 0, 0);
      collected.push({
        id: `wkt:${w.id}`,
        source: 'workout',
        label: `${w.workout_type}${w.focus_area ? ` — focus: ${w.focus_area}` : ''}`,
        due: eod.toISOString(),
      });
    }
    for (const p of (punRes.data || []) as Array<Record<string, unknown>>) {
      collected.push({
        id: `pun:${p.id}`,
        source: 'punishment',
        label: String(p.title).slice(0, 140),
        detail: p.description ? String(p.description).slice(0, 120) : undefined,
        due: p.due_by as string | null,
        badge: (p.dodge_count as number) > 0 ? `dodged ${p.dodge_count}×` : `S${p.severity}`,
      });
    }
    for (const d of (dirRes.data || []) as Array<Record<string, unknown>>) {
      const v = (d.value || {}) as Record<string, unknown>;
      const desc = (v.description as string) || (v.task as string) || (v.mantra as string) || (d.target as string) || (d.action as string);
      collected.push({
        id: `dir:${d.id}`,
        source: 'directive',
        label: `[${d.action}] ${desc}`.slice(0, 140),
        due: null,
      });
    }
    const hrtStep = (hrtRes.data as { current_step?: string } | null)?.current_step || 'uncommitted';
    const hrtAnswered = (hrtObs.data || []).length > 0;
    if (hrtStep !== 'adherent' && !hrtAnswered) {
      const eod = new Date(); eod.setHours(22, 0, 0, 0);
      collected.push({
        id: 'hrt_gate',
        source: 'hrt_gate',
        label: `HRT daily gate — advance from "${hrtStep.replace(/_/g, ' ')}" or write the obstacle`,
        due: eod.toISOString(),
      });
    }

    collected.sort((a, b) => {
      const ad = formatDue(a.due).overdueHours;
      const bd = formatDue(b.due).overdueHours;
      return bd - ad;
    });

    setTasks(collected);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(load, 90000);
    return () => clearInterval(t);
  }, [load]);

  // Listen for cross-card task-changed events so the list refreshes
  // immediately when sibling cards (Punishment, Confession, Decree, etc.)
  // mark items complete instead of waiting for the 90s poll.
  useEffect(() => {
    const handler = () => { load(); };
    window.addEventListener('td-task-changed', handler);
    return () => window.removeEventListener('td-task-changed', handler);
  }, [load]);

  if (loading || tasks.length === 0) return null;

  const overdueCount = tasks.filter(t => formatDue(t.due).overdueHours > 0).length;
  const totalCount = tasks.length;
  const rightNow = tasks[0];
  const nextUp = tasks[1];
  const after = tasks.slice(2);

  return (
    <div style={{
      background: 'linear-gradient(135deg, #1a0f2e 0%, #0f0820 100%)',
      border: `2px solid ${overdueCount > 5 ? '#7a1f22' : '#2d1a4d'}`,
      borderRadius: 10, padding: 14, marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c4b5fd" strokeWidth="1.8">
          <path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
        </svg>
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#c4b5fd', fontWeight: 700 }}>
          Open tasks ({totalCount})
        </span>
        {overdueCount > 0 && (
          <span style={{
            fontSize: 10, color: '#fff', background: '#7a1f22',
            padding: '2px 7px', borderRadius: 8, fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.04em',
          }}>
            {overdueCount} overdue
          </span>
        )}
        <span style={{ fontSize: 10, color: '#8a8690', marginLeft: 'auto', fontStyle: 'italic' }}>
          Every assignment, one place.
        </span>
      </div>

      {/* RIGHT NOW + NEXT UP prominence */}
      <div style={{
        background: 'linear-gradient(135deg, #2a0a14 0%, #1a050a 100%)',
        border: '2px solid #7a1f22',
        borderRadius: 8, padding: '12px 14px', marginBottom: 10,
      }}>
        <div style={{
          fontSize: 9.5, color: '#f47272', fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4,
        }}>
          ▸ RIGHT NOW · {SOURCE_LABEL[rightNow.source]}
        </div>
        <div style={{ fontSize: 14, color: '#fff', fontWeight: 600, lineHeight: 1.4, marginBottom: 4 }}>
          {rightNow.label}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 10.5, marginBottom: 10 }}>
          <span style={{ color: formatDue(rightNow.due).overdueHours > 0 ? '#f47272' : '#f4c272', fontWeight: 700 }}>
            {formatDue(rightNow.due).text}
          </span>
          {rightNow.consequence && (
            <span style={{ color: '#f47272' }}>miss → {rightNow.consequence}</span>
          )}
          {rightNow.detail && <span style={{ color: '#8a8690' }}>{rightNow.detail}</span>}
        </div>
        <button
          onClick={() => {
            const id = scrollTargetForSource(rightNow.source);
            if (id) {
              const el = document.getElementById(id);
              if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                el.style.outline = '2px solid #f4c272';
                el.style.transition = 'outline 0.4s';
                setTimeout(() => { el.style.outline = ''; }, 1800);
                return;
              }
            }
            // Fallback: open Handler chat with prefill
            sessionStorage.setItem('handler_chat_prefill', `Re: ${rightNow.label.slice(0, 120)}\n\n`);
            window.location.hash = '';
          }}
          style={{
            padding: '8px 14px', borderRadius: 6, border: 'none',
            background: '#f47272', color: '#1a050a',
            fontWeight: 700, fontSize: 12, cursor: 'pointer',
            fontFamily: 'inherit', textTransform: 'uppercase', letterSpacing: '0.04em',
          }}
        >
          {ctaLabelForSource(rightNow.source)}
        </button>
      </div>

      {nextUp && (
        <div style={{
          background: '#0a0a0d', border: '1px solid #2d1a4d',
          borderLeft: `3px solid ${SOURCE_TONE[nextUp.source]}`,
          borderRadius: 5, padding: '8px 10px', marginBottom: 10,
        }}>
          <div style={{
            fontSize: 9, color: '#c4b5fd', fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3,
          }}>
            then next · {SOURCE_LABEL[nextUp.source]}
          </div>
          <div style={{ fontSize: 12, color: '#e8e6e3', lineHeight: 1.4 }}>
            {nextUp.label}
          </div>
          <div style={{ fontSize: 10, color: formatDue(nextUp.due).overdueHours > 0 ? '#f47272' : '#8a8690', marginTop: 2 }}>
            {formatDue(nextUp.due).text}
          </div>
        </div>
      )}

      {after.length > 0 && (
        <details style={{ marginTop: 4 }} className="td-task-queue">
          <summary style={{
            fontSize: 10.5, color: '#c4b5fd', cursor: 'pointer',
            textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6,
            userSelect: 'none',
            padding: '7px 10px',
            border: '1px solid #2d1a4d', borderRadius: 5,
            background: '#0a0a0d',
            display: 'flex', alignItems: 'center', gap: 6,
            transition: 'background 0.15s, border-color 0.15s',
          }}>
            <span style={{ display: 'inline-block', transition: 'transform 0.15s' }} className="td-chevron">▸</span>
            after that · {after.length} more queued · click to expand
          </summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
            {after.map(t => {
              const tone = SOURCE_TONE[t.source];
              const due = formatDue(t.due);
              const overdue = due.overdueHours > 0;
              return (
                <div key={t.id} style={{
                  padding: '7px 10px',
                  background: '#0a0a0d',
                  border: `1px solid ${overdue ? '#7a1f22' : '#22222a'}`,
                  borderLeft: `3px solid ${tone}`,
                  borderRadius: 5,
                  display: 'flex',
                  gap: 10,
                  alignItems: 'flex-start',
                }}>
                  <div style={{ flexShrink: 0, minWidth: 70 }}>
                    <div style={{
                      fontSize: 8.5, color: tone, fontWeight: 700,
                      textTransform: 'uppercase', letterSpacing: '0.05em',
                    }}>
                      {SOURCE_LABEL[t.source]}
                    </div>
                    {t.badge && (
                      <div style={{
                        fontSize: 8, color: '#8a8690', marginTop: 2,
                        textTransform: 'uppercase', letterSpacing: '0.04em',
                      }}>
                        {t.badge}
                      </div>
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11.5, color: '#e8e6e3', lineHeight: 1.4 }}>
                      {t.label}
                    </div>
                    {t.consequence && (
                      <div style={{ fontSize: 9.5, color: '#f47272', marginTop: 2 }}>
                        miss → {t.consequence}
                      </div>
                    )}
                  </div>
                  <div style={{
                    flexShrink: 0,
                    fontSize: 9.5,
                    fontWeight: 700,
                    color: overdue ? '#f47272' : '#8a8690',
                    whiteSpace: 'nowrap',
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {due.text}
                  </div>
                </div>
              );
            })}
          </div>
        </details>
      )}

      <div style={{ fontSize: 10, color: '#5a5560', marginTop: 10, fontStyle: 'italic', textAlign: 'center' }}>
        Each item lives on its own card below. This is the index.
      </div>
    </div>
  );
}
