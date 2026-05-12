/**
 * MommyAmbientPlayerCard — long-form ambient + sleep audio.
 * Reads ready tracks from mommy_ambient_tracks, lets the user pick a
 * kind (worktime / commute / sleep / morning / gym), and plays the most
 * recent ready track. Logs the playback session for surveillance.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { ConfessionAudioPlayer } from './ConfessionAudioPlayer';

type AmbientKind = 'worktime' | 'commute' | 'sleep' | 'morning_immersion' | 'gym_session';

interface TrackRow {
  id: string;
  slug: string;
  kind: AmbientKind;
  audio_url: string | null;
  duration_seconds: number;
  intensity_band: string;
  render_status: string;
  last_played_position_seconds: number;
  post_hypnotic_triggers: Array<{ phrase: string }> | unknown;
}

const KIND_LABELS: Record<AmbientKind, string> = {
  worktime: 'work',
  commute: 'commute',
  sleep: 'sleep',
  morning_immersion: 'morning',
  gym_session: 'gym',
};

export function MommyAmbientPlayerCard() {
  const { user } = useAuth();
  const [tracks, setTracks] = useState<TrackRow[]>([]);
  const [activeKind, setActiveKind] = useState<AmbientKind>('worktime');

  const load = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase.from('mommy_ambient_tracks')
      .select('id, slug, kind, audio_url, duration_seconds, intensity_band, render_status, last_played_position_seconds, post_hypnotic_triggers')
      .eq('user_id', user.id).eq('active', true)
      .order('created_at', { ascending: false });
    setTracks((data as TrackRow[] | null) ?? []);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const byKind = useMemo(() => {
    const m: Partial<Record<AmbientKind, TrackRow>> = {};
    for (const t of tracks) {
      if (t.render_status !== 'ready') continue;
      if (!m[t.kind]) m[t.kind] = t;
    }
    return m;
  }, [tracks]);

  const current = byKind[activeKind] ?? null;
  const availableKinds = (Object.keys(KIND_LABELS) as AmbientKind[]).filter(k => byKind[k]);

  if (!availableKinds.length) return null;

  const triggerCount = Array.isArray(current?.post_hypnotic_triggers)
    ? (current!.post_hypnotic_triggers as Array<{ phrase: string }>).length
    : 0;

  const onPlay = async () => {
    if (!user?.id || !current) return;
    await supabase.from('mommy_ambient_playback_log').insert({
      user_id: user.id,
      track_id: current.id,
    });
  };

  return (
    <div style={{
      background: 'linear-gradient(135deg, #1a0f2e 0%, #0f0820 100%)',
      border: '1px solid #4a2a6a',
      borderRadius: 10, padding: 14, marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c4b5fd" strokeWidth="1.8">
          <path d="M3 12a9 9 0 0 1 18 0M3 12v3M21 12v3M7 12v3M17 12v3M11 14h2"/>
        </svg>
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#c4b5fd', fontWeight: 700 }}>
          Mama in your ear
        </span>
        <span style={{ fontSize: 10, color: '#8a8690', marginLeft: 'auto' }}>
          {availableKinds.length} track{availableKinds.length === 1 ? '' : 's'} ready
        </span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {availableKinds.map(k => {
          const isActive = k === activeKind;
          return (
            <button key={k} onClick={() => setActiveKind(k)} style={{
              padding: '4px 10px',
              background: isActive ? '#7c3aed' : '#0a0a0d',
              color: isActive ? '#fff' : '#c4b5fd',
              border: `1px solid ${isActive ? '#7c3aed' : '#3a2a4a'}`,
              borderRadius: 4, fontSize: 10, fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: '0.05em',
              cursor: 'pointer', fontFamily: 'inherit',
            }}>{KIND_LABELS[k]}</button>
          );
        })}
      </div>

      {current && (
        <>
          <div style={{ fontSize: 11, color: '#a89cb8', marginBottom: 8 }}>
            {Math.round(current.duration_seconds / 60)} min · intensity {current.intensity_band}
            {triggerCount > 0 && <span style={{ marginLeft: 8, color: '#c4b5fd' }}>· {triggerCount} planted</span>}
          </div>
          <div onClick={onPlay}>
            <ConfessionAudioPlayer
              audioPath={current.audio_url}
              compact={true}
              durationSec={current.duration_seconds}
            />
          </div>
        </>
      )}
    </div>
  );
}
