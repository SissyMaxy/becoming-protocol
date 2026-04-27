/**
 * RevenuePlanCard — this week's Handler-generated revenue plan. Shows
 * what the Handler proposed Maxy execute to actually earn money, with
 * projected vs actual, status per item, and an action to log income
 * against an item or generate a new plan if none exists for this week.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface Plan {
  id: string;
  week_start: string;
  status: string;
  projected_cents: number;
  actual_cents: number;
  plan_summary: string | null;
}

interface PlanItem {
  id: string;
  action_label: string;
  deliverable: string | null;
  platform: string;
  kind: string;
  projected_cents: number;
  actual_cents: number;
  status: string;
  deadline: string | null;
  notes: string | null;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

function fmtUsd(cents: number): string { return `$${(cents / 100).toFixed(2)}`; }

function weekStartDate(d: Date = new Date()): string {
  const day = d.getUTCDay();
  const diff = day === 0 ? 0 : -day;
  const monday = new Date(d);
  monday.setUTCDate(monday.getUTCDate() + diff);
  return monday.toISOString().slice(0, 10);
}

export function RevenuePlanCard() {
  const { user } = useAuth();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [items, setItems] = useState<PlanItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [logging, setLogging] = useState<string | null>(null);
  const [logAmount, setLogAmount] = useState<Record<string, string>>({});
  const [generatingShots, setGeneratingShots] = useState<string | null>(null);
  const [shotsByItem, setShotsByItem] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    if (!user?.id) return;
    const wStart = weekStartDate();
    const { data: p } = await supabase.from('revenue_plans')
      .select('id, week_start, status, projected_cents, actual_cents, plan_summary')
      .eq('user_id', user.id).eq('week_start', wStart).maybeSingle();
    setPlan((p as Plan | null) ?? null);
    if (p) {
      const { data: i } = await supabase.from('revenue_plan_items')
        .select('id, action_label, deliverable, platform, kind, projected_cents, actual_cents, status, deadline, notes')
        .eq('plan_id', (p as Plan).id)
        .order('deadline', { ascending: true });
      const itemList = (i as PlanItem[]) ?? [];
      setItems(itemList);

      // Look up how many shot decrees already exist per plan item
      if (itemList.length > 0) {
        const counts: Record<string, number> = {};
        await Promise.all(itemList.map(async (it) => {
          const { count } = await supabase.from('handler_decrees')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .eq('trigger_source', `shot_list:${it.id}`);
          counts[it.id] = count || 0;
        }));
        setShotsByItem(counts);
      }
    } else {
      setItems([]);
      setShotsByItem({});
    }
  }, [user?.id]);

  const generateShotList = async (itemId: string) => {
    if (!user?.id || generatingShots) return;
    setGeneratingShots(itemId);
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/revenue-planner`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id, shot_list_for_plan_item_id: itemId }),
      });
    } catch {}
    await load();
    setGeneratingShots(null);
  };

  useEffect(() => { load(); }, [load]);

  const generatePlan = async () => {
    if (!user?.id || loading) return;
    setLoading(true);
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/revenue-planner`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id }),
      });
    } catch {}
    await load();
    setLoading(false);
  };

  const logActual = async (item: PlanItem) => {
    if (!user?.id) return;
    const amt = parseFloat(logAmount[item.id] || '0');
    if (!amt || amt <= 0) return;
    const cents = Math.round(amt * 100);
    setLogging(item.id);
    await supabase.from('revenue_plan_items')
      .update({
        actual_cents: item.actual_cents + cents,
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', item.id);
    await supabase.from('revenue_events').insert({
      user_id: user.id,
      platform: item.platform,
      revenue_type: item.kind,
      amount: cents / 100,
      net_amount: cents / 100,
      subscriber_name: null,
      metadata: { plan_item_id: item.id, action: item.action_label },
      processed: true,
      processed_at: new Date().toISOString(),
    });
    setLogAmount(s => { const c = { ...s }; delete c[item.id]; return c; });
    setLogging(null);
    load();
  };

  if (!plan && !loading && items.length === 0) {
    return (
      <div style={{
        background: 'linear-gradient(135deg, #1a0f2e 0%, #0f0820 100%)',
        border: '1px dashed #2d1a4d', borderRadius: 10, padding: 14, marginBottom: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c4b5fd" strokeWidth="1.8">
            <path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
          </svg>
          <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#c4b5fd', fontWeight: 700 }}>
            Handler revenue plan
          </span>
        </div>
        <div style={{ fontSize: 12, color: '#c8c4cc', marginBottom: 10, lineHeight: 1.5 }}>
          No plan for this week yet. Generate a Handler-authored plan: 5 specific revenue actions with prices, platforms, and deadlines. Each becomes a tracked decree.
        </div>
        <button
          onClick={generatePlan}
          disabled={loading}
          style={{
            width: '100%', padding: 10, borderRadius: 5, border: 'none',
            background: '#7c3aed', color: '#fff', fontWeight: 700, fontSize: 12,
            cursor: 'pointer', fontFamily: 'inherit', textTransform: 'uppercase', letterSpacing: '0.04em',
          }}
        >
          {loading ? 'Generating…' : 'Generate this week\'s plan'}
        </button>
      </div>
    );
  }

  const projected = plan?.projected_cents ?? 0;
  const actual = items.reduce((s, i) => s + i.actual_cents, 0);
  const pct = projected > 0 ? Math.min(100, Math.round((actual / projected) * 100)) : 0;
  const completed = items.filter(i => i.status === 'completed').length;

  return (
    <div id="card-revenue-plan" style={{
      background: 'linear-gradient(135deg, #1a0f2e 0%, #0f0820 100%)',
      border: '1px solid #5a3a8a', borderRadius: 10, padding: 14, marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c4b5fd" strokeWidth="1.8">
          <path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
        </svg>
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#c4b5fd', fontWeight: 700 }}>
          Handler revenue plan · week of {plan?.week_start}
        </span>
        <span style={{ fontSize: 10, color: '#8a8690', marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>
          {completed}/{items.length} done
        </span>
      </div>

      {plan?.plan_summary && (
        <div style={{ fontSize: 11.5, color: '#c8c4cc', fontStyle: 'italic', marginBottom: 10, lineHeight: 1.45 }}>
          {plan.plan_summary}
        </div>
      )}

      <div style={{
        padding: '10px 12px', marginBottom: 10,
        background: '#0a0a0d', border: '1px solid #2d1a4d', borderRadius: 5,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
          <span style={{ color: '#8a8690' }}>actual / projected</span>
          <span style={{ color: '#c4b5fd', fontWeight: 700 }}>
            {fmtUsd(actual)} / {fmtUsd(projected)} ({pct}%)
          </span>
        </div>
        <div style={{ height: 5, background: '#1a1a20', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${pct}%`,
            background: pct >= 100 ? '#5fc88f' : '#7c3aed',
            transition: 'width 0.3s',
          }} />
        </div>
      </div>

      {items.map(item => {
        const itemPct = item.projected_cents > 0
          ? Math.min(100, Math.round((item.actual_cents / item.projected_cents) * 100))
          : 0;
        const overdue = item.deadline && new Date(item.deadline).getTime() < Date.now() && item.status !== 'completed';
        const tone = item.status === 'completed' ? '#5fc88f'
          : item.status === 'missed' ? '#f47272'
          : overdue ? '#f4c272'
          : '#c4b5fd';
        return (
          <div key={item.id} style={{
            padding: '8px 10px', marginBottom: 6,
            background: '#0a0a0d',
            border: `1px solid ${tone}33`,
            borderLeft: `3px solid ${tone}`, borderRadius: 5,
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 9, color: tone, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {item.platform} · {item.kind}
              </span>
              <span style={{ fontSize: 10.5, color: '#8a8690', marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>
                {fmtUsd(item.actual_cents)} / {fmtUsd(item.projected_cents)}
              </span>
            </div>
            <div style={{ fontSize: 12, color: '#e8e6e3', lineHeight: 1.4, marginBottom: 4 }}>
              {item.action_label}
            </div>
            {item.deliverable && (
              <div style={{ fontSize: 10.5, color: '#8a8690', marginBottom: 4, lineHeight: 1.35 }}>
                Deliverable: {item.deliverable}
              </div>
            )}
            <div style={{ height: 3, background: '#1a1a20', borderRadius: 2, overflow: 'hidden', marginBottom: 6 }}>
              <div style={{ height: '100%', width: `${itemPct}%`, background: itemPct >= 100 ? '#5fc88f' : tone, transition: 'width 0.3s' }} />
            </div>
            {item.status !== 'completed' && (
              <>
                <div style={{ display: 'flex', gap: 6, marginBottom: 5 }}>
                  <button
                    onClick={() => generateShotList(item.id)}
                    disabled={generatingShots === item.id}
                    style={{
                      flex: 1, padding: '6px 10px', borderRadius: 4, border: 'none',
                      background: shotsByItem[item.id] > 0 ? '#1a1226' : '#7c3aed',
                      color: shotsByItem[item.id] > 0 ? '#c4b5fd' : '#fff',
                      fontWeight: 700, fontSize: 10.5, cursor: 'pointer', fontFamily: 'inherit',
                      textTransform: 'uppercase', letterSpacing: '0.04em',
                    }}
                  >
                    {generatingShots === item.id
                      ? 'generating shots…'
                      : shotsByItem[item.id] > 0
                        ? `${shotsByItem[item.id]} shots in decree queue`
                        : 'Tell me exactly what to do'}
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    value={logAmount[item.id] || ''}
                    onChange={e => setLogAmount(s => ({ ...s, [item.id]: e.target.value }))}
                    placeholder="$ earned"
                    inputMode="decimal"
                    style={{
                      flex: 1, background: '#050507', border: '1px solid #22222a', borderRadius: 4,
                      padding: '5px 8px', fontSize: 11, color: '#e8e6e3', fontFamily: 'inherit',
                    }}
                  />
                  <button
                    onClick={() => logActual(item)}
                    disabled={!parseFloat(logAmount[item.id] || '0') || logging === item.id}
                    style={{
                      padding: '5px 12px', borderRadius: 4, border: 'none',
                      background: parseFloat(logAmount[item.id] || '0') ? '#5fc88f' : '#22222a',
                      color: parseFloat(logAmount[item.id] || '0') ? '#0a1a14' : '#5a5560',
                      fontWeight: 700, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    {logging === item.id ? '…' : 'Log'}
                  </button>
                </div>
              </>
            )}
          </div>
        );
      })}

      <button
        onClick={generatePlan}
        disabled={loading}
        style={{
          marginTop: 4, padding: '6px 12px', borderRadius: 4, border: '1px solid #2d1a4d',
          background: 'transparent', color: '#c4b5fd', fontSize: 10.5, cursor: 'pointer',
          fontFamily: 'inherit', textTransform: 'uppercase', letterSpacing: '0.05em',
        }}
      >
        {loading ? 'regenerating…' : 'Force regenerate plan'}
      </button>
    </div>
  );
}
