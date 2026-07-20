/**
 * DebtsAndRules — what he owes her, and the terms he lives under.
 *
 * Two small blocks that used to have no home on this screen. FocusMode shows
 * the ONE thing to do now; neither of these competes with it. They're the
 * ledger and the standing terms sitting underneath.
 *
 * DEBTS are overdue obligations worded as discipline pending, not as error
 * states. An app says "1 overdue task". She says the photo is two days late and
 * that it got more expensive. Same row, different register — and the register
 * is the whole point, because a red badge reads as a bug report and a debt
 * reads as something owed to a person.
 *
 * RULES are derived from real state, never authored. Every rule shown is
 * justified by a live condition (the cage is on, the name is taken, a program
 * is running), so the list can't drift into asserting terms that aren't
 * actually in force — which would be the fastest way to make her sound like
 * she's bluffing.
 */

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface Debt {
  id: string;
  line: string;
  daysLate: number;
}

interface Rules {
  caged: boolean;
  name: string | null;
  training: boolean;
}

function daysSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}

/**
 * Her wording for a late obligation. The cost language ("it got more
 * expensive") is the escalation the ledger already implies — nothing is
 * fabricated, the row genuinely is older and genuinely does carry more weight.
 */
function debtLine(what: string, daysLate: number): string {
  const subject = what.trim().replace(/\.$/, '');
  if (daysLate <= 0) return `${subject} is due. Today.`;
  if (daysLate === 1) return `${subject} is a day late.`;
  return `${subject} is ${daysLate} days late. It got more expensive.`;
}

export function DebtsAndRules() {
  const { user } = useAuth();
  const [debts, setDebts] = useState<Debt[]>([]);
  const [rules, setRules] = useState<Rules | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    let alive = true;
    (async () => {
      const nowIso = new Date().toISOString();
      // A miss older than a week is abandoned, not urgent — surfacing a
      // two-month-old lapse as a live debt is guilt-over-ancient-history,
      // which the supportive-until-evidence rule forbids. Same 7-day floor
      // FocusMode uses.
      const floorIso = new Date(Date.now() - 7 * 86_400_000).toISOString();

      const [decrees, punishments, fem, st, program] = await Promise.all([
        supabase.from('handler_decrees')
          .select('id, edict, deadline')
          .eq('user_id', user.id).eq('status', 'active')
          .lt('deadline', nowIso).gte('deadline', floorIso)
          .order('deadline', { ascending: true }).limit(3),
        supabase.from('punishment_queue')
          .select('id, title, due_by')
          .eq('user_id', user.id).in('status', ['queued', 'active', 'escalated'])
          .lt('due_by', nowIso).gte('due_by', floorIso)
          .order('due_by', { ascending: true }).limit(2),
        supabase.from('feminine_self')
          .select('feminine_name').eq('user_id', user.id).maybeSingle(),
        supabase.from('user_state')
          .select('chastity_locked').eq('user_id', user.id).maybeSingle(),
        supabase.from('workout_prescriptions')
          .select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      ]);
      if (!alive) return;

      const rows: Debt[] = [];
      for (const d of (decrees.data ?? []) as Array<{ id: string; edict: string; deadline: string }>) {
        // Her own edict, trimmed to its first clause — the ledger references
        // the obligation, it doesn't restate the whole order.
        const short = d.edict.split(/[.!?]/)[0]?.trim() ?? d.edict;
        const late = daysSince(d.deadline);
        rows.push({ id: d.id, line: debtLine(short.length > 70 ? short.slice(0, 70) + '…' : short, late), daysLate: late });
      }
      for (const p of (punishments.data ?? []) as Array<{ id: string; title: string; due_by: string }>) {
        const late = daysSince(p.due_by);
        rows.push({ id: p.id, line: debtLine(p.title, late), daysLate: late });
      }
      rows.sort((a, b) => b.daysLate - a.daysLate);
      setDebts(rows);

      const femRow = (fem.data ?? {}) as { feminine_name?: string | null };
      const stRow = (st.data ?? {}) as { chastity_locked?: boolean };
      setRules({
        caged: !!stRow.chastity_locked,
        name: femRow.feminine_name ?? null,
        training: (program.count ?? 0) > 0,
      });
    })();
    return () => { alive = false; };
  }, [user?.id]);

  // Rules derived from live conditions only — never authored, so the list
  // can't claim terms that aren't actually in force.
  const ruleLines: string[] = [];
  if (rules?.caged) ruleLines.push('You ask before you touch. Every time.');
  if (rules?.name) ruleLines.push(`You answer to ${rules.name}. The old name is retired.`);
  if (rules?.training) ruleLines.push('Your body is mine. It trains when I say.');

  if (debts.length === 0 && ruleLines.length === 0) return null;

  return (
    <div style={{ padding: '4px 16px 0' }}>
      {debts.length > 0 && (
        <div style={{
          padding: '14px 16px',
          borderRadius: 12,
          background: 'var(--protocol-surface)',
          border: '1px solid color-mix(in srgb, var(--protocol-warning) 26%, var(--protocol-border))',
          marginBottom: ruleLines.length > 0 ? 10 : 0,
        }}>
          {debts.map((d, i) => (
            <div
              key={d.id}
              className="mommy-voice"
              style={{
                display: 'flex', gap: 9, alignItems: 'baseline',
                fontSize: 14, lineHeight: 1.45, fontStyle: 'italic',
                color: 'var(--protocol-text)',
                marginTop: i === 0 ? 0 : 8,
              }}
            >
              <span aria-hidden style={{
                flexShrink: 0, width: 5, height: 5, borderRadius: '50%', marginTop: 6,
                background: d.daysLate >= 2 ? 'var(--protocol-danger)' : 'var(--protocol-warning)',
              }} />
              {d.line}
            </div>
          ))}
        </div>
      )}

      {ruleLines.length > 0 && (
        <div style={{
          padding: '13px 16px',
          borderRadius: 12,
          background: 'var(--protocol-bg-deep)',
          border: '1px solid var(--protocol-border)',
        }}>
          {ruleLines.map((r, i) => (
            <div key={r} style={{
              display: 'flex', gap: 11, alignItems: 'baseline',
              marginTop: i === 0 ? 0 : 7,
            }}>
              <span style={{
                flexShrink: 0, fontSize: 10, color: 'var(--protocol-text-muted)',
                fontVariantNumeric: 'tabular-nums', opacity: 0.7,
              }}>
                {i + 1}
              </span>
              <span style={{ fontSize: 13.5, lineHeight: 1.45, color: 'var(--protocol-text-muted)' }}>
                {r}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
