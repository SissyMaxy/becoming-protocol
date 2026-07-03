/**
 * PenaltyPreviewCard — the visible "cost on the table" rail (wish 31e1b144,
 * mig 601). Lists live penalty previews: what it'll cost, when, and whether
 * the cost is already "live" (surfaced + grace elapsed) or still in its grace
 * window. Makes the visible-before-penalized rule a surface the user can see.
 * Renders null when there are no pending previews.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { previewState, type PreviewState } from '../../lib/penalty-preview';

interface Preview {
  id: string;
  penalty_kind: string;
  penalty_copy: string;
  deadline: string | null;
  grace_minutes: number;
  surfaced_at: string | null;
  applied_at: string | null;
  cancelled_at: string | null;
}

const STATE_LABEL: Record<PreviewState, { text: string; color: string }> = {
  not_shown: { text: 'not shown yet', color: '#9c8590' },
  in_grace: { text: 'grace — not live yet', color: '#e6bd80' },
  live: { text: 'live cost', color: '#f47272' },
  cancelled: { text: 'cleared', color: '#6ee7b7' },
  applied: { text: 'charged', color: '#f47272' },
};

function deadlineLabel(iso: string | null): string {
  if (!iso) return '';
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'overdue';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m left` : `${m}m left`;
}

export function PenaltyPreviewCard() {
  const { user } = useAuth();
  const [items, setItems] = useState<Preview[]>([]);
  const [, setTick] = useState(0);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from('penalty_previews')
      .select('id, penalty_kind, penalty_copy, deadline, grace_minutes, surfaced_at, applied_at, cancelled_at')
      .eq('user_id', user.id)
      .is('applied_at', null)
      .is('cancelled_at', null)
      .gt('deadline', new Date().toISOString())
      .order('deadline', { ascending: true })
      .limit(6);
    setItems((data as Preview[]) ?? []);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(() => { setTick((n) => n + 1); load(); }, 60000);
    return () => clearInterval(t);
  }, [load]);

  if (items.length === 0) return null;

  return (
    <div id="card-penalty-previews" style={{
      background: 'linear-gradient(135deg, #1f0a10 0%, #14060a 100%)',
      border: '1px solid #5a1020', borderLeft: '4px solid #f47272',
      borderRadius: 10, padding: 14, marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f47272" strokeWidth="1.8">
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
          <path d="M12 9v4M12 17h.01" />
        </svg>
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#f47272', fontWeight: 700 }}>
          What it'll cost
        </span>
        <span style={{ fontSize: 10, color: '#9c8590', marginLeft: 'auto', fontStyle: 'italic' }}>
          on the table before it's charged
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.map((p) => {
          const st = previewState({
            cancelled: !!p.cancelled_at, applied: !!p.applied_at,
            surfacedAt: p.surfaced_at, graceMinutes: p.grace_minutes,
          });
          const meta = STATE_LABEL[st];
          return (
            <div key={p.id} style={{
              padding: '8px 10px', borderRadius: 6, background: '#140609',
              border: '1px solid #3a1020',
            }}>
              <div style={{ fontSize: 12.5, color: '#e8d7da', lineHeight: 1.4, marginBottom: 4 }}>
                {p.penalty_copy}
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: meta.color }}>{meta.text}</span>
                {p.deadline && (
                  <span style={{ fontSize: 10, color: '#9c8590', marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>
                    {deadlineLabel(p.deadline)}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
