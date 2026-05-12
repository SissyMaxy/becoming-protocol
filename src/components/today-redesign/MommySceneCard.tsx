/**
 * MommySceneCard — upcoming / active / debrief-pending Mommy-initiated scenes.
 *
 * Surfaces all non-terminal mommy_initiated_scenes rows for the user so
 * she can see what Mommy has authored for the week. The state machine in
 * mommy-scene-author handles transitions; this is read-only display.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

type SceneStatus = 'scheduled' | 'prepared' | 'executing' | 'debriefed' | 'aborted' | 'expired';

interface SceneRow {
  id: string;
  scene_slug: string;
  title: string;
  scene_kind: string;
  scheduled_for: string;
  status: SceneStatus;
  intensity_band: string;
  preparation_instructions: { wardrobe?: string[]; bring?: string[]; where?: string; notes?: string };
}

const STATUS_LABEL: Record<SceneStatus, string> = {
  scheduled: 'upcoming',
  prepared: 'tomorrow',
  executing: 'live now',
  debriefed: 'debriefed',
  aborted: 'aborted',
  expired: 'expired',
};

const STATUS_COLOR: Record<SceneStatus, string> = {
  scheduled: '#a78bfa',
  prepared: '#f4c272',
  executing: '#f47272',
  debriefed: '#6ee7b7',
  aborted: '#6a656e',
  expired: '#6a656e',
};

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffHr = Math.round(diffMs / 3_600_000);
  if (diffMs < 0 && diffHr > -2) return 'now';
  if (diffHr < 24 && diffHr > -24) return `${diffHr > 0 ? 'in ' : ''}${Math.abs(diffHr)}h${diffHr < 0 ? ' ago' : ''}`;
  return d.toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' });
}

export function MommySceneCard() {
  const { user } = useAuth();
  const [scenes, setScenes] = useState<SceneRow[]>([]);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from('mommy_initiated_scenes')
      .select('id, scene_slug, title, scene_kind, scheduled_for, status, intensity_band, preparation_instructions')
      .eq('user_id', user.id)
      .in('status', ['scheduled', 'prepared', 'executing'])
      .order('scheduled_for', { ascending: true })
      .limit(5);
    setScenes((data || []) as SceneRow[]);
    setReady(true);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  if (!ready) return null;
  if (scenes.length === 0) return null;

  return (
    <div style={{ background: '#111116', border: '1px solid #2d1a4d', borderRadius: 10, padding: 14, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f4c272" strokeWidth="1.8">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#f4c272', fontWeight: 700 }}>
          Mommy's scenes
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {scenes.map(s => {
          const prep = s.preparation_instructions || {};
          const wardrobe = (prep.wardrobe || []).filter(Boolean).join(', ');
          const where = prep.where || '';
          return (
            <div key={s.id} style={{ padding: 10, background: '#0a0a0d', borderRadius: 6, borderLeft: `3px solid ${STATUS_COLOR[s.status]}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                <div style={{ fontSize: 12.5, color: '#e9e6ee', fontWeight: 600 }}>{s.title}</div>
                <div style={{ fontSize: 9.5, color: STATUS_COLOR[s.status], textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {STATUS_LABEL[s.status]} · {fmtWhen(s.scheduled_for)}
                </div>
              </div>
              {(where || wardrobe) && (
                <div style={{ fontSize: 10.5, color: '#8a8690' }}>
                  {where}{where && wardrobe ? ' · ' : ''}{wardrobe ? `wear ${wardrobe}` : ''}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
