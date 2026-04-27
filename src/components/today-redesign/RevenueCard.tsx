/**
 * RevenueCard — what the Handler has actually earned, against what Maxy
 * needs to feminize. Manual income logger + visible gap. The point of
 * this card is to make $0 unbearable.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface RevenueRow {
  amount: number;
  net_amount: number | null;
  platform: string;
  revenue_type: string;
  created_at: string;
}

interface BudgetTarget {
  id: string;
  label: string;
  monthly_cents: number;
  one_time_cents: number;
  priority: number;
  funded_cents: number;
}

const KIND_OPTIONS = ['subscription', 'tip', 'ppv', 'custom_content', 'cam_show', 'sex_work_irl', 'commission', 'other'];
const PLATFORM_OPTIONS = ['onlyfans', 'fansly', 'reddit', 'fetlife', 'sniffies', 'twitter', 'irl', 'other'];

function fmtUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function RevenueCard() {
  const { user } = useAuth();
  const [rows, setRows] = useState<RevenueRow[]>([]);
  const [targets, setTargets] = useState<BudgetTarget[]>([]);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ amount: '', platform: 'onlyfans', kind: 'tip', customer: '', notes: '' });

  const load = useCallback(async () => {
    if (!user?.id) return;
    const [revRes, tgtRes] = await Promise.all([
      supabase.from('revenue_events')
        .select('amount, net_amount, platform, revenue_type, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(60),
      supabase.from('feminization_budget_targets')
        .select('id, label, monthly_cents, one_time_cents, priority, funded_cents')
        .eq('user_id', user.id).eq('active', true)
        .order('priority', { ascending: true }),
    ]);
    setRows((revRes.data as RevenueRow[]) ?? []);
    setTargets((tgtRes.data as BudgetTarget[]) ?? []);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!user?.id) return;
    const cents = Math.round(parseFloat(draft.amount) * 100);
    if (!cents || cents <= 0) return;
    await supabase.from('revenue_events').insert({
      user_id: user.id,
      platform: draft.platform,
      revenue_type: draft.kind,
      amount: cents / 100,
      net_amount: cents / 100,
      subscriber_name: draft.customer || null,
      metadata: draft.notes ? { notes: draft.notes } : null,
      processed: true,
      processed_at: new Date().toISOString(),
    });
    setDraft({ amount: '', platform: 'onlyfans', kind: 'tip', customer: '', notes: '' });
    setAdding(false);
    load();
  };

  const now = Date.now();
  const sumWindow = (days: number) => rows
    .filter(r => now - new Date(r.created_at).getTime() <= days * 86400000)
    .reduce((s, r) => s + Math.round(((r.net_amount ?? r.amount) || 0) * 100), 0);

  const cents7 = sumWindow(7);
  const cents30 = sumWindow(30);
  const centsAll = rows.reduce((s, r) => s + Math.round(((r.net_amount ?? r.amount) || 0) * 100), 0);

  const monthlyNeed = targets.reduce((s, t) => s + (t.monthly_cents || 0), 0);
  const oneTimeNeed = targets.reduce((s, t) => s + (t.one_time_cents || 0), 0);
  const monthlyGap = Math.max(0, monthlyNeed - cents30);
  const isZero = centsAll === 0;

  const tone = isZero ? '#7a1f22' : cents30 >= monthlyNeed ? '#5fc88f' : '#f4c272';

  return (
    <div style={{
      background: isZero
        ? 'linear-gradient(135deg, #2a0a0c 0%, #1a0608 100%)'
        : 'linear-gradient(135deg, #0a1a14 0%, #061008 100%)',
      border: `1px solid ${tone}`, borderRadius: 10, padding: 14, marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={tone} strokeWidth="1.8">
          <path d="M12 2v20M17 5H9.5a3.5 3.5 0 1 0 0 7h5a3.5 3.5 0 1 1 0 7H6"/>
        </svg>
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.09em', color: tone, fontWeight: 700 }}>
          Maxy fund
        </span>
        <span style={{ fontSize: 10, color: '#8a8690', marginLeft: 'auto', fontStyle: 'italic' }}>
          {isZero ? 'Handler has earned $0. David is footing this.' : `$${(centsAll / 100).toFixed(2)} earned all-time`}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
        <Stat label="last 7 days" value={fmtUsd(cents7)} tone={cents7 > 0 ? '#5fc88f' : '#f47272'} />
        <Stat label="last 30 days" value={fmtUsd(cents30)} tone={cents30 > 0 ? '#5fc88f' : '#f47272'} sub={`gap ${fmtUsd(monthlyGap)}/mo`} />
        <Stat label="all-time" value={fmtUsd(centsAll)} tone={centsAll > 0 ? '#5fc88f' : '#f47272'} />
      </div>

      <div style={{
        padding: '8px 10px', marginBottom: 10,
        background: '#0a0a0d', border: '1px solid #22222a', borderRadius: 5,
      }}>
        <div style={{ fontSize: 10, color: '#c4b5fd', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, marginBottom: 6 }}>
          What every dollar buys
        </div>
        {targets.map(t => {
          const need = t.monthly_cents || t.one_time_cents;
          const pct = need > 0 ? Math.min(100, Math.round((t.funded_cents / need) * 100)) : 0;
          const cadence = t.monthly_cents > 0 ? '/mo' : ' one-time';
          return (
            <div key={t.id} style={{ marginBottom: 6 }}>
              <div style={{ display: 'flex', fontSize: 11, color: '#e8e6e3', marginBottom: 2 }}>
                <span>{t.label}</span>
                <span style={{ marginLeft: 'auto', color: '#8a8690' }}>
                  {fmtUsd(t.funded_cents)} / {fmtUsd(need)}{cadence}
                </span>
              </div>
              <div style={{ height: 4, background: '#1a1a20', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: pct >= 100 ? '#5fc88f' : '#7c3aed' }} />
              </div>
            </div>
          );
        })}
        {oneTimeNeed > 0 && (
          <div style={{ fontSize: 9.5, color: '#8a8690', marginTop: 4, fontStyle: 'italic' }}>
            One-time costs total {fmtUsd(oneTimeNeed)}. Monthly costs total {fmtUsd(monthlyNeed)}/mo.
          </div>
        )}
      </div>

      {!adding ? (
        <button
          onClick={() => setAdding(true)}
          style={{
            width: '100%', padding: 8, borderRadius: 5, border: `1px solid ${tone}`,
            background: 'transparent', color: tone, fontWeight: 600, fontSize: 11.5,
            cursor: 'pointer', fontFamily: 'inherit', textTransform: 'uppercase', letterSpacing: '0.06em',
          }}
        >
          + Log income
        </button>
      ) : (
        <div style={{ background: '#0a0a0d', border: '1px solid #22222a', borderRadius: 5, padding: 10 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            <input
              value={draft.amount}
              onChange={e => setDraft(d => ({ ...d, amount: e.target.value }))}
              placeholder="amount $"
              inputMode="decimal"
              style={inputStyle}
            />
            <select value={draft.platform} onChange={e => setDraft(d => ({ ...d, platform: e.target.value }))} style={inputStyle}>
              {PLATFORM_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <select value={draft.kind} onChange={e => setDraft(d => ({ ...d, kind: e.target.value }))} style={inputStyle}>
              {KIND_OPTIONS.map(k => <option key={k} value={k}>{k.replace('_', ' ')}</option>)}
            </select>
          </div>
          <input
            value={draft.customer}
            onChange={e => setDraft(d => ({ ...d, customer: e.target.value }))}
            placeholder="customer handle (optional)"
            style={{ ...inputStyle, width: '100%', marginBottom: 6 }}
          />
          <input
            value={draft.notes}
            onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))}
            placeholder="notes (deliverable, plat fee, etc.)"
            style={{ ...inputStyle, width: '100%', marginBottom: 6 }}
          />
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={submit}
              disabled={!parseFloat(draft.amount)}
              style={{
                flex: 1, padding: 7, borderRadius: 5, border: 'none',
                background: parseFloat(draft.amount) ? '#5fc88f' : '#22222a',
                color: parseFloat(draft.amount) ? '#0a1a14' : '#5a5560',
                fontWeight: 600, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Log
            </button>
            <button
              onClick={() => setAdding(false)}
              style={{ padding: '7px 12px', borderRadius: 5, border: '1px solid #2d1a4d', background: 'none', color: '#8a8690', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11 }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: '#050507', border: '1px solid #22222a', borderRadius: 4,
  padding: '6px 8px', fontSize: 11, color: '#e8e6e3', fontFamily: 'inherit',
};

function Stat({ label, value, tone, sub }: { label: string; value: string; tone: string; sub?: string }) {
  return (
    <div style={{ background: '#0a0a0d', border: '1px solid #22222a', borderRadius: 5, padding: '8px 10px' }}>
      <div style={{ fontSize: 9, color: '#8a8690', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 3 }}>
        {label}
      </div>
      <div style={{ fontSize: 16, fontWeight: 650, color: tone, letterSpacing: '-0.01em' }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 9.5, color: '#5a5560', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
