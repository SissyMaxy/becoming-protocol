/**
 * MommyDailyPlanCard — today's seven-item plan from Mommy.
 * Reads from mommy_daily_plan (one row per user per day). Each item is
 * checkable; refusal posts a slip_log row (slip_type='daily_plan_refused').
 * Silent when no plan exists for today.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface PlanItem {
  kind: string;
  prescription: string;
  intensity: string;
  why: string;
  completed_at?: string | null;
}

interface PlanRow {
  id: string;
  plan_date: string;
  items: PlanItem[];
  accepted_at: string | null;
  rejected_items: Record<string, string>;
  fully_completed_at: string | null;
}

const KIND_LABELS: Record<string, string> = {
  outfit: 'outfit',
  lunch: 'lunch',
  workout: 'workout',
  mantra: 'mantra',
  voice_drill: 'voice',
  confession_topic: 'confession',
  edge_schedule: 'edges',
};

export function MommyDailyPlanCard() {
  const { user } = useAuth();
  const [plan, setPlan] = useState<PlanRow | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const todayStr = new Date().toISOString().slice(0, 10);
    const { data } = await supabase.from('mommy_daily_plan')
      .select('id, plan_date, items, accepted_at, rejected_items, fully_completed_at')
      .eq('user_id', user.id).eq('plan_date', todayStr).maybeSingle();
    setPlan(data as PlanRow | null);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  if (!plan) return null;
  const items = Array.isArray(plan.items) ? plan.items : [];
  if (!items.length) return null;

  const completeItem = async (index: number) => {
    const next = items.map((it, i) => i === index ? { ...it, completed_at: new Date().toISOString() } : it);
    const allDone = next.every(it => it.completed_at);
    await supabase.from('mommy_daily_plan').update({
      items: next,
      fully_completed_at: allDone ? new Date().toISOString() : null,
      accepted_at: plan.accepted_at ?? new Date().toISOString(),
    }).eq('id', plan.id);
    if (allDone && user?.id) {
      const { data: us } = await supabase.from('user_state')
        .select('daily_plan_compliance_streak')
        .eq('user_id', user.id).maybeSingle();
      const streak = ((us as { daily_plan_compliance_streak?: number } | null)?.daily_plan_compliance_streak ?? 0) + 1;
      const updates: Record<string, unknown> = { daily_plan_compliance_streak: streak };
      if (streak === 60) updates.decision_atrophy_milestone_at = new Date().toISOString();
      await supabase.from('user_state').update(updates).eq('user_id', user.id);
    }
    load();
  };

  const refuseItem = async (index: number) => {
    if (!user?.id) return;
    const it = items[index];
    const nextRejected = { ...plan.rejected_items, [String(index)]: new Date().toISOString() };
    await supabase.from('mommy_daily_plan').update({
      rejected_items: nextRejected,
    }).eq('id', plan.id);
    await supabase.from('slip_log').insert({
      user_id: user.id,
      slip_type: 'daily_plan_refused',
      slip_points: 2,
      source_text: `${it.kind}: ${it.prescription}`.slice(0, 500),
      source_table: 'mommy_daily_plan',
      source_id: plan.id,
      metadata: { item_kind: it.kind, intensity: it.intensity },
    });
    // Reset compliance streak on any refusal.
    await supabase.from('user_state').update({ daily_plan_compliance_streak: 0 }).eq('user_id', user.id);
    load();
  };

  const fullyDone = !!plan.fully_completed_at;
  const completedCount = items.filter(i => i.completed_at).length;

  return (
    <div style={{
      background: fullyDone ? '#111116' : 'linear-gradient(135deg, #2e0f24 0%, #200818 100%)',
      border: `1px solid ${fullyDone ? '#22222a' : '#6a2a4a'}`,
      borderRadius: 10, padding: 14, marginBottom: 16,
      opacity: fullyDone ? 0.75 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f0a5c8" strokeWidth="1.8">
          <path d="M9 11l3 3l8-8M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
        </svg>
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#f0a5c8', fontWeight: 700 }}>
          Mama decided today
        </span>
        <span style={{ fontSize: 10, color: '#8a8690', marginLeft: 'auto' }}>
          {completedCount}/{items.length}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.map((it, i) => {
          const done = !!it.completed_at;
          const refusedAt = plan.rejected_items?.[String(i)];
          return (
            <div key={i} style={{
              padding: 9,
              background: done ? '#0a0a0d' : refusedAt ? '#2a0810' : '#1a1018',
              border: `1px solid ${done ? '#22222a' : refusedAt ? '#6a1f3a' : '#3a2030'}`,
              borderRadius: 6,
              opacity: done || refusedAt ? 0.65 : 1,
            }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 4 }}>
                <span style={{
                  fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em',
                  color: '#f0a5c8', minWidth: 60,
                }}>{KIND_LABELS[it.kind] ?? it.kind}</span>
                <span style={{
                  fontSize: 9, color: it.intensity === 'cruel' ? '#f47272' : it.intensity === 'firm' ? '#f0a5c8' : '#c4b5fd',
                  fontWeight: 600,
                }}>{it.intensity}</span>
              </div>
              <div style={{ fontSize: 12, color: '#e8e6e3', marginBottom: 4, lineHeight: 1.4 }}>
                {it.prescription}
              </div>
              {it.why && (
                <div style={{ fontSize: 10.5, color: '#a89cb8', fontStyle: 'italic', marginBottom: 6, lineHeight: 1.35 }}>
                  {it.why}
                </div>
              )}
              {!done && !refusedAt && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => completeItem(i)} style={{
                    padding: '3px 9px', background: '#1f6a3a', color: '#fff',
                    border: 'none', borderRadius: 4, fontSize: 10, fontWeight: 700,
                    textTransform: 'uppercase', letterSpacing: '0.05em',
                    fontFamily: 'inherit', cursor: 'pointer',
                  }}>did it</button>
                  <button onClick={() => refuseItem(i)} style={{
                    padding: '3px 9px', background: 'transparent', color: '#f47272',
                    border: '1px solid #6a1f3a', borderRadius: 4, fontSize: 10, fontWeight: 700,
                    textTransform: 'uppercase', letterSpacing: '0.05em',
                    fontFamily: 'inherit', cursor: 'pointer',
                  }}>refuse</button>
                </div>
              )}
              {done && <div style={{ fontSize: 9.5, color: '#6ee7b7', fontWeight: 600 }}>done</div>}
              {refusedAt && !done && <div style={{ fontSize: 9.5, color: '#f47272', fontWeight: 600 }}>refused — slip logged</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
