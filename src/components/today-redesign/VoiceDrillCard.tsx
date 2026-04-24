/**
 * VoiceDrillCard — shows today's prescribed voice drill.
 * Pulls the pending voice-drill commitment from handler_commitments.
 * Displays phrase + target Hz + latest recent sample pitch for quick gauge.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface Drill {
  id: string;
  what: string;
  by_when: string;
  consequence: string;
}

export function VoiceDrillCard() {
  const { user } = useAuth();
  const [drill, setDrill] = useState<Drill | null>(null);
  const [floorHz, setFloorHz] = useState<number>(140);
  const [recentPitch, setRecentPitch] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    if (!user?.id) return;
    const [cmtRes, floorRes, pitchRes] = await Promise.all([
      supabase.from('handler_commitments')
        .select('id, what, by_when, consequence')
        .eq('user_id', user.id).eq('status', 'pending')
        .ilike('what', '%voice drill%')
        .order('by_when', { ascending: true }).limit(1).maybeSingle(),
      supabase.from('voice_pitch_floor')
        .select('current_floor_hz').eq('user_id', user.id).maybeSingle(),
      supabase.from('voice_pitch_samples')
        .select('pitch_hz, created_at').eq('user_id', user.id)
        .order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ]);
    setDrill((cmtRes.data as Drill | null) ?? null);
    setFloorHz(((floorRes.data as { current_floor_hz?: number } | null)?.current_floor_hz) || 140);
    const p = pitchRes.data as { pitch_hz?: number } | null;
    setRecentPitch((p?.pitch_hz) ?? null);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);

  if (!drill) return null;

  // Extract phrase + target from the commitment 'what' field
  // Format: 'Voice drill: record "PHRASE" for 12 seconds. Avg pitch must clear NHz...'
  const phraseMatch = drill.what.match(/"([^"]+)"/);
  const targetMatch = drill.what.match(/(\d+)\s*Hz/i);
  const phrase = phraseMatch?.[1] || 'phrase not parsed';
  const targetHz = targetMatch ? parseInt(targetMatch[1], 10) : floorHz + 5;

  const msLeft = Math.max(0, new Date(drill.by_when).getTime() - now);
  const hoursLeft = Math.floor(msLeft / 3600000);
  const minsLeft = Math.floor((msLeft / 60000) % 60);
  const urgent = msLeft < 60 * 60000;

  return (
    <div style={{
      background: urgent ? 'linear-gradient(92deg, #2a1f0a 0%, #1f1608 100%)' : '#111116',
      border: `1px solid ${urgent ? '#7a5a1f' : '#2d1a4d'}`,
      borderRadius: 10, padding: 14, marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={urgent ? '#f4c272' : '#c4b5fd'} strokeWidth="1.8">
          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="23" />
        </svg>
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: urgent ? '#f4c272' : '#c4b5fd', fontWeight: 700 }}>
          Voice drill · today
        </span>
        <span style={{ fontSize: 10.5, color: urgent ? '#f47272' : '#8a8690', marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>
          {hoursLeft}h {minsLeft}m left
        </span>
      </div>

      <div style={{
        padding: 12, background: '#0a0a0d', border: '1px solid #22222a', borderRadius: 7, marginBottom: 8,
      }}>
        <div style={{ fontSize: 9.5, color: '#6a656e', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>say this</div>
        <div style={{ fontSize: 14, color: '#e8e6e3', fontStyle: 'italic', fontWeight: 500 }}>"{phrase}"</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 8 }}>
        <Metric label="target" value={`${targetHz}Hz`} color="#c4b5fd" />
        <Metric label="floor" value={`${floorHz}Hz`} color="#8a8690" />
        <Metric
          label="last sample"
          value={recentPitch ? `${Math.round(recentPitch)}Hz` : '—'}
          color={recentPitch && recentPitch >= targetHz ? '#6ee7b7' : recentPitch ? '#f47272' : '#8a8690'}
        />
      </div>

      <div style={{ fontSize: 10.5, color: '#8a8690' }}>
        12s sample. Avg pitch, not peak. Miss by midnight → {drill.consequence}.
      </div>
    </div>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: '#0a0a0d', border: '1px solid #22222a', borderRadius: 5, padding: '5px 7px' }}>
      <div style={{ fontSize: 9, color: '#6a656e', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: 13, color, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  );
}
