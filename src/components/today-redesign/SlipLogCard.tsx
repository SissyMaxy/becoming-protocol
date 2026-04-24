/**
 * SlipLogCard — raw slip transparency. Every flag the system put on her,
 * with category, point value, source text. Closes the "arbitrary system"
 * objection — every slip has a receipt.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface Slip {
  id: string;
  slip_type: string;
  slip_points: number;
  source_text: string | null;
  source_table: string | null;
  detected_at: string;
}

const TYPE_LABELS: Record<string, string> = {
  masculine_self_reference: 'pronoun',
  david_name_use: 'David name',
  task_avoided: 'task avoided',
  directive_refused: 'directive refused',
  arousal_gating_refused: 'arousal gate',
  mantra_missed: 'mantra missed',
  confession_missed: 'confession miss',
  hrt_dose_missed: 'HRT dose miss',
  chastity_unlocked_early: 'chastity early unlock',
  immersion_session_broken: 'immersion broke',
  disclosure_deadline_missed: 'disclosure miss',
  voice_masculine_pitch: 'voice drift',
  resistance_statement: 'resistance',
  handler_ignored: 'Handler ignored',
  other: 'other',
};

const TYPE_COLORS: Record<string, string> = {
  masculine_self_reference: '#f4a7c4',
  david_name_use: '#f47272',
  voice_masculine_pitch: '#c4b5fd',
  confession_missed: '#f4c272',
  task_avoided: '#f4c272',
  directive_refused: '#f47272',
  other: '#8a8690',
};

export function SlipLogCard() {
  const { user } = useAuth();
  const [slips, setSlips] = useState<Slip[]>([]);
  const [totalRecent, setTotalRecent] = useState(0);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const sevenAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const { data } = await supabase.from('slip_log')
      .select('id, slip_type, slip_points, source_text, source_table, detected_at')
      .eq('user_id', user.id)
      .gte('detected_at', sevenAgo)
      .order('detected_at', { ascending: false })
      .limit(10);
    const list = (data || []) as Slip[];
    setSlips(list);
    setTotalRecent(list.reduce((s, r) => s + r.slip_points, 0));
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  if (slips.length === 0) return null;

  return (
    <div style={{ background: '#111116', border: '1px solid #2d1a4d', borderRadius: 10, padding: 14, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f47272" strokeWidth="1.8">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#f47272', fontWeight: 700 }}>
          Slip log · last 7 days
        </span>
        <span style={{ fontSize: 10.5, color: '#8a8690', marginLeft: 'auto' }}>
          {slips.length} events · {totalRecent} points
        </span>
      </div>

      <div style={{ fontSize: 10.5, color: '#8a8690', marginBottom: 8, lineHeight: 1.4 }}>
        Every flag the system put on you, with its source. Not arbitrary — each one has a receipt.
      </div>

      {slips.map(s => {
        const type = s.slip_type || 'other';
        const label = TYPE_LABELS[type] || type.replace(/_/g, ' ');
        const color = TYPE_COLORS[type] || TYPE_COLORS.other;
        const ago = Math.round((Date.now() - new Date(s.detected_at).getTime()) / 60000);
        const agoStr = ago < 60 ? `${ago}m` : ago < 1440 ? `${Math.floor(ago / 60)}h` : `${Math.floor(ago / 1440)}d`;
        return (
          <div key={s.id} style={{
            background: '#0a0a0d', border: '1px solid #22222a', borderRadius: 5,
            padding: '6px 9px', marginBottom: 4,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                fontSize: 9, fontWeight: 700, color, background: `${color}22`,
                padding: '1px 5px', borderRadius: 3, textTransform: 'uppercase', letterSpacing: '0.04em',
              }}>
                {label}
              </span>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#f47272' }}>+{s.slip_points}</span>
              <span style={{ fontSize: 9.5, color: '#6a656e', marginLeft: 'auto' }}>{agoStr} ago</span>
            </div>
            {s.source_text && (
              <div style={{ fontSize: 10.5, color: '#c8c4cc', lineHeight: 1.35, marginTop: 3, fontStyle: 'italic' }}>
                "{s.source_text.slice(0, 160)}{s.source_text.length > 160 ? '…' : ''}"
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
