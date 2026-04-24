/**
 * PhaseProgressCard — thermometer showing progress toward next phase.
 * Each phase has threshold metrics. Card shows current vs. required.
 * Silent at phase_4 (no next phase) or when thresholds not met.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface Stats {
  current_phase: string;
  protocol_days: number;
  confessions: number;
  measurements: number;
  hrt_steps: number;
  body_proofs: number;
}

type Threshold = { label: string; current: number; target: number };

function thresholdsFor(phase: string, s: Stats): { label: string; items: Threshold[] } | null {
  if (phase === 'phase_1') return {
    label: 'Phase 1 → Phase 2',
    items: [
      { label: 'protocol days', current: s.protocol_days, target: 14 },
      { label: 'confessions', current: s.confessions, target: 3 },
      { label: 'body measurements', current: s.measurements, target: 1 },
      { label: 'HRT steps', current: s.hrt_steps, target: 1 },
    ],
  };
  if (phase === 'phase_2') return {
    label: 'Phase 2 → Phase 3',
    items: [
      { label: 'protocol days', current: s.protocol_days, target: 45 },
      { label: 'confessions', current: s.confessions, target: 10 },
      { label: 'body measurements', current: s.measurements, target: 3 },
      { label: 'HRT steps', current: s.hrt_steps, target: 2 },
      { label: 'body proofs', current: s.body_proofs, target: 5 },
    ],
  };
  if (phase === 'phase_3') return {
    label: 'Phase 3 → Phase 4',
    items: [
      { label: 'protocol days', current: s.protocol_days, target: 75 },
      { label: 'HRT steps', current: s.hrt_steps, target: 3 },
    ],
  };
  return null;
}

export function PhaseProgressCard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const [usRes, firstRes, confRes, measRes, hrtRes, proofRes] = await Promise.all([
      supabase.from('user_state').select('current_phase').eq('user_id', user.id).maybeSingle(),
      supabase.from('handler_messages').select('created_at').eq('user_id', user.id).order('created_at', { ascending: true }).limit(1).maybeSingle(),
      supabase.from('confessions').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase.from('body_measurements').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase.from('irreversibility_ledger').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('category', 'hrt_step'),
      supabase.from('irreversibility_ledger').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('category', 'progress_photo'),
    ]);
    const firstAt = firstRes.data?.created_at;
    const days = firstAt ? Math.floor((Date.now() - new Date(firstAt).getTime()) / 86400000) : 0;
    setStats({
      current_phase: ((usRes.data as { current_phase?: string } | null)?.current_phase) || 'phase_1',
      protocol_days: days,
      confessions: confRes.count ?? 0,
      measurements: measRes.count ?? 0,
      hrt_steps: hrtRes.count ?? 0,
      body_proofs: proofRes.count ?? 0,
    });
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  if (!stats) return null;
  const t = thresholdsFor(stats.current_phase, stats);
  if (!t) return null;  // phase_4 or unknown

  const crossed = t.items.filter(x => x.current >= x.target).length;
  const total = t.items.length;
  const pct = Math.round((crossed / total) * 100);
  const atGate = crossed === total;

  return (
    <div style={{
      background: atGate ? 'linear-gradient(92deg, #0a2a14 0%, #081f10 100%)' : '#111116',
      border: `1px solid ${atGate ? '#1f6a3a' : '#2d1a4d'}`,
      borderRadius: 10, padding: 14, marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={atGate ? '#6ee7b7' : '#c4b5fd'} strokeWidth="1.8">
          <path d="M12 1v22" /><path d="M5 8l7-7 7 7" />
        </svg>
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: atGate ? '#6ee7b7' : '#c4b5fd', fontWeight: 700 }}>
          {t.label}
        </span>
        <span style={{ fontSize: 10.5, color: '#8a8690', marginLeft: 'auto' }}>
          {crossed}/{total} thresholds · {pct}%
        </span>
      </div>

      {atGate && (
        <div style={{ fontSize: 11.5, color: '#6ee7b7', marginBottom: 8, fontStyle: 'italic' }}>
          All thresholds crossed. Next daily_cycle auto-graduates.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {t.items.map((x, i) => {
          const p = Math.min(100, (x.current / x.target) * 100);
          const done = x.current >= x.target;
          return (
            <div key={i} style={{ fontSize: 10.5, color: '#c8c4cc' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                <span>{x.label}</span>
                <span style={{ color: done ? '#6ee7b7' : '#8a8690', fontVariantNumeric: 'tabular-nums' }}>
                  {x.current} / {x.target}
                </span>
              </div>
              <div style={{ height: 4, background: '#0a0a0d', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{
                  width: `${p}%`, height: '100%',
                  background: done ? '#6ee7b7' : '#c4b5fd',
                  transition: 'width 0.3s',
                }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
